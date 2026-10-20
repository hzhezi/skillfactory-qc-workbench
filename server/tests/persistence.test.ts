import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type QcDatabase } from "../src/db/connection";
import { QcRepository } from "../src/db/qcRepository";
import { parseSegmentsCsv } from "../src/qc/csv";
import { evaluateSegments } from "../src/qc/rules";
import type { QcEvaluation } from "../src/qc/types";

const SAMPLE_CSV = readFileSync(
  new URL("./fixtures/sample-segments.csv", import.meta.url),
  "utf8",
);

let tempDir: string;
let dbPath: string;
let db: QcDatabase;
let repo: QcRepository;

/**
 * 每个测试使用独立临时目录和 SQLite 文件，避免污染 server/data/qc.sqlite。
 * afterEach 统一关闭连接并删除临时目录，即使测试失败也能清理。
 */
beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "qc-persistence-"));
  dbPath = path.join(tempDir, "qc.sqlite");
  db = openDatabase(dbPath);
  repo = new QcRepository(db);
});

afterEach(() => {
  if (db.open) {
    db.close();
  }

  rmSync(tempDir, { recursive: true, force: true });
});

function sampleEvaluation(): QcEvaluation {
  return evaluateSegments(parseSegmentsCsv(SAMPLE_CSV), 10000);
}

describe("QcRepository — 持久化", () => {
  it("初始化后存在 qc_runs 和 qc_segments 两张表", () => {
    const tables = db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name IN ('qc_runs', 'qc_segments')
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((table) => table.name)).toEqual([
      "qc_runs",
      "qc_segments",
    ]);
  });

  it("保存后按 runId 读回，统计、Segment 顺序和错误码一致", () => {
    const saved = repo.saveReport(sampleEvaluation());

    expect(saved.runId).toMatch(/^qc-[0-9a-f-]{36}$/);
    expect(new Date(saved.createdAt).toISOString()).toBe(saved.createdAt);

    const loaded = repo.getReport(saved.runId);

    expect(loaded).toEqual(saved);
    expect(loaded?.total).toBe(6);
    expect(loaded?.valid).toBe(2);
    expect(loaded?.invalid).toBe(4);
    expect(loaded?.segments.map((segment) => segment.segmentId)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
    ]);
    expect(loaded?.segments[1]?.errors).toEqual(["OVERLAP"]);
    expect(loaded?.segments[3]?.errors).toEqual(["OUT_OF_BOUNDS"]);
    expect(loaded?.segments[4]?.errors).toEqual(["EMPTY_ACTION"]);
  });

  it("数据库文件真实落盘，报告和 Segment 行数正确", () => {
    const saved = repo.saveReport(sampleEvaluation());

    expect(existsSync(dbPath)).toBe(true);

    const runCount = db
      .prepare("SELECT COUNT(*) AS count FROM qc_runs")
      .get() as { count: number };
    const segmentCount = db
      .prepare("SELECT COUNT(*) AS count FROM qc_segments WHERE run_id = ?")
      .get(saved.runId) as { count: number };

    expect(runCount.count).toBe(1);
    expect(segmentCount.count).toBe(6);
  });

  it("重复 segment_id 分别保存，不互相覆盖", () => {
    const evaluation = evaluateSegments(
      parseSegmentsCsv(
        "segment_id,start_ms,end_ms,action\ndup,0,1000,Pick\ndup,1000,2000,Place\n",
      ),
      5000,
    );

    const saved = repo.saveReport(evaluation);
    const loaded = repo.getReport(saved.runId);

    expect(loaded?.segments.map((segment) => segment.segmentId)).toEqual([
      "dup",
      "dup",
    ]);
    expect(loaded?.total).toBe(2);
  });

  it("无法解析的 start_ms / end_ms 以 null 原样读回", () => {
    const evaluation = evaluateSegments(
      parseSegmentsCsv(
        "segment_id,start_ms,end_ms,action\ns1,not-an-int,2000,Pick\ns2,0,bad,Pick\n",
      ),
      5000,
    );

    const saved = repo.saveReport(evaluation);
    const loaded = repo.getReport(saved.runId);

    expect(loaded?.segments[0]?.startMs).toBeNull();
    expect(loaded?.segments[0]?.errors).toEqual(["INVALID_RANGE"]);
    expect(loaded?.segments[1]?.endMs).toBeNull();
    expect(loaded?.segments[1]?.errors).toEqual(["INVALID_RANGE"]);
  });

  it("两次保存产生不同 runId，旧报告不被覆盖", () => {
    const first = repo.saveReport(sampleEvaluation());
    const second = repo.saveReport(sampleEvaluation());

    expect(first.runId).not.toBe(second.runId);
    expect(repo.getReport(first.runId)).toEqual(first);
    expect(repo.getReport(second.runId)).toEqual(second);
  });

  it("关闭并重新打开同一个数据库文件后仍能读取", () => {
    const saved = repo.saveReport(sampleEvaluation());

    db.close();
    db = openDatabase(dbPath);
    repo = new QcRepository(db);

    expect(repo.getReport(saved.runId)).toEqual(saved);
  });

  it("事务中途失败时回滚，不留下半份报告", () => {
    const base = sampleEvaluation();
    const broken: QcEvaluation = {
      ...base,
      // 第二条记录的 row_index 与第一条冲突，触发 UNIQUE(run_id, row_index)。
      segments: base.segments.map((segment, index) =>
        index === 1 ? { ...segment, rowIndex: 1 } : segment,
      ),
    };

    expect(() => repo.saveReport(broken)).toThrow();

    const runCount = db
      .prepare("SELECT COUNT(*) AS count FROM qc_runs")
      .get() as { count: number };
    const segmentCount = db
      .prepare("SELECT COUNT(*) AS count FROM qc_segments")
      .get() as { count: number };

    expect(runCount.count).toBe(0);
    expect(segmentCount.count).toBe(0);
  });

  it("统计不一致时拒绝保存", () => {
    const broken: QcEvaluation = {
      ...sampleEvaluation(),
      total: 999,
    };

    expect(() => repo.saveReport(broken)).toThrow(/statistics are inconsistent/);
  });

  it("不存在的 runId 返回 null", () => {
    expect(repo.getReport("qc-does-not-exist")).toBeNull();
  });

  it("errors_json 损坏时读取报错，不返回半份错误数据", () => {
    const saved = repo.saveReport(sampleEvaluation());

    db.prepare(
      "UPDATE qc_segments SET errors_json = 'not-json' WHERE run_id = ?",
    ).run(saved.runId);

    expect(() => repo.getReport(saved.runId)).toThrow(/Corrupted errors_json/);
  });
});
