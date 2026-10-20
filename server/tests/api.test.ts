import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { openDatabase, type QcDatabase } from "../src/db/connection";
import { QcRepository } from "../src/db/qcRepository";
import type { QcReport } from "../src/qc/types";

const SAMPLE_CSV = readFileSync(
  new URL("./fixtures/sample-segments.csv", import.meta.url),
  "utf8",
);

let tempDir: string;
let db: QcDatabase;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "qc-api-"));
  const dbPath = path.join(tempDir, "qc.sqlite");
  db = openDatabase(dbPath);
  app = createApp({ repo: new QcRepository(db) });
});

afterEach(() => {
  if (db.open) {
    db.close();
  }

  rmSync(tempDir, { recursive: true, force: true });
});

function postCsv(
  csv: string | Buffer,
  durationMs: string | null = "10000",
): request.Test {
  const req = request(app).post("/api/qc");

  if (durationMs !== null) {
    req.field("durationMs", durationMs);
  }

  return req.attach(
    "file",
    Buffer.isBuffer(csv) ? csv : Buffer.from(csv),
    "segments.csv",
  );
}

function countRuns(): number {
  return (
    db.prepare("SELECT COUNT(*) AS count FROM qc_runs").get() as {
      count: number;
    }
  ).count;
}

function expect400(response: request.Response, code: string): void {
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ code });
  expect(typeof response.body.error).toBe("string");
  expect((response.body.error as string).length).toBeGreaterThan(0);
}

describe("GET /api/health", () => {
  it("返回 200 和 {status:'ok'}", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("POST /api/qc", () => {
  it("示例 CSV 返回完整报告，并能通过 GET 原样读回", async () => {
    const created = await postCsv(SAMPLE_CSV);

    expect(created.status).toBe(200);

    const report = created.body as QcReport;

    expect(report.runId).toMatch(/^qc-/);
    expect(new Date(report.createdAt).toISOString()).toBe(report.createdAt);
    expect(report.durationMs).toBe(10000);
    expect(report.total).toBe(6);
    expect(report.valid).toBe(2);
    expect(report.invalid).toBe(4);
    expect(report.segments).toHaveLength(6);
    expect(report.segments.map((segment) => segment.segmentId)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
    ]);
    expect(report.segments[1]?.errors).toEqual(["OVERLAP"]);
    expect(report.segments[3]?.errors).toEqual(["OUT_OF_BOUNDS"]);
    expect(report.segments[4]?.errors).toEqual(["EMPTY_ACTION"]);

    const loaded = await request(app).get(`/api/qc/${report.runId}`);

    expect(loaded.status).toBe(200);
    expect(loaded.body).toEqual(report);
    expect(countRuns()).toBe(1);
  });

  it("接受带首尾空白的 durationMs 和前导零", async () => {
    const spaced = await postCsv(SAMPLE_CSV, " 10000 ");
    const leadingZero = await postCsv(SAMPLE_CSV, "010000");

    expect(spaced.status).toBe(200);
    expect(leadingZero.status).toBe(200);
    expect((spaced.body as QcReport).durationMs).toBe(10000);
    expect((leadingZero.body as QcReport).durationMs).toBe(10000);
  });

  it("保留负数和越界整数，并返回对应错误", async () => {
    const response = await postCsv(
      "segment_id,start_ms,end_ms,action\ns1,-1,2000,Pick\ns2,0,12000,Release\n",
    );

    expect(response.status).toBe(200);

    const report = response.body as QcReport;

    expect(report.segments[0]?.startMs).toBe(-1);
    expect(report.segments[0]?.errors).toEqual(["INVALID_RANGE"]);
    expect(report.segments[1]?.endMs).toBe(12000);
    expect(report.segments[1]?.errors).toEqual(["OUT_OF_BOUNDS"]);
    expect(report.total).toBe(2);
  });

  it("空动作与重叠可以同时存在，重叠双方都标记", async () => {
    const response = await postCsv(
      "segment_id,start_ms,end_ms,action\ns1,0,2000,\ns2,1000,3000,Move\n",
    );

    expect(response.status).toBe(200);

    const report = response.body as QcReport;

    expect(report.segments[0]?.errors).toEqual(["EMPTY_ACTION", "OVERLAP"]);
    expect(report.segments[1]?.errors).toEqual(["OVERLAP"]);
  });

  it("重复 segment_id 在 API 响应中分别保留", async () => {
    const response = await postCsv(
      "segment_id,start_ms,end_ms,action\ndup,0,1000,Pick\ndup,1000,2000,Place\n",
    );

    expect(response.status).toBe(200);

    const report = response.body as QcReport;

    expect(report.total).toBe(2);
    expect(report.segments.map((segment) => segment.segmentId)).toEqual([
      "dup",
      "dup",
    ]);
  });

  it("连续上传产生不同 runId，分别读取互不覆盖", async () => {
    const first = (await postCsv(SAMPLE_CSV)).body as QcReport;
    const second = (await postCsv(SAMPLE_CSV)).body as QcReport;

    expect(first.runId).not.toBe(second.runId);

    const firstLoaded = await request(app).get(`/api/qc/${first.runId}`);
    const secondLoaded = await request(app).get(`/api/qc/${second.runId}`);

    expect(firstLoaded.body).toEqual(first);
    expect(secondLoaded.body).toEqual(second);
    expect(countRuns()).toBe(2);
  });

  it("文件级/请求级错误返回 400，且不创建报告", async () => {
    const missingFile = await request(app)
      .post("/api/qc")
      .field("durationMs", "10000");

    expect400(missingFile, "FILE_REQUIRED");

    const emptyFile = await postCsv(Buffer.alloc(0));
    expect400(emptyFile, "EMPTY_FILE");

    const invalidCsv = await postCsv(
      'segment_id,start_ms,end_ms,action\ns1,0,1000,"Pick\n',
    );
    expect400(invalidCsv, "INVALID_CSV");

    const missingHeader = await postCsv(
      "segment_id,start_ms,end_ms\ns1,0,1000\n",
    );
    expect400(missingHeader, "MISSING_HEADER");

    const noRecords = await postCsv("segment_id,start_ms,end_ms,action\n");
    expect400(noRecords, "NO_RECORDS");

    expect(countRuns()).toBe(0);
  });

  it("durationMs 缺失、非整数、零、负数都返回 INVALID_DURATION", async () => {
    const invalidDurations: Array<string | null> = [
      null,
      "",
      "0",
      "-1",
      "1.5",
      "1e4",
      "+10000",
      "abc",
    ];

    for (const duration of invalidDurations) {
      const response = await postCsv(SAMPLE_CSV, duration);
      expect400(response, "INVALID_DURATION");
    }

    expect(countRuns()).toBe(0);
  });

  it("缺少 file 的优先级高于非法 durationMs", async () => {
    const response = await request(app)
      .post("/api/qc")
      .field("durationMs", "0");

    expect400(response, "FILE_REQUIRED");
  });

  it("非法 durationMs 优先于 CSV 结构错误", async () => {
    const response = await postCsv(
      'segment_id,start_ms,end_ms,action\ns1,0,1000,"Pick\n',
      "0",
    );

    expect400(response, "INVALID_DURATION");
  });

  it("file 字段名错误时按 FILE_REQUIRED 处理", async () => {
    const response = await request(app)
      .post("/api/qc")
      .field("durationMs", "10000")
      .attach("csv", Buffer.from(SAMPLE_CSV), "segments.csv");

    expect400(response, "FILE_REQUIRED");
  });

  it("数据库写入失败返回 500，不返回假成功", async () => {
    // 用 SQLite trigger 模拟真实写入失败；比 mock repository 更接近生产路径。
    db.exec(`
      CREATE TRIGGER fail_qc_runs_insert
      BEFORE INSERT ON qc_runs
      BEGIN
        SELECT RAISE(ABORT, 'forced failure');
      END;
    `);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await postCsv(SAMPLE_CSV);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ code: "INTERNAL_ERROR" });
      expect(typeof response.body.error).toBe("string");
      expect((response.body.error as string).length).toBeGreaterThan(0);
      expect(countRuns()).toBe(0);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("GET /api/qc/{runId}", () => {
  it("不存在的报告返回 404 REPORT_NOT_FOUND", async () => {
    const response = await request(app).get("/api/qc/qc-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "REPORT_NOT_FOUND" });
    expect(typeof response.body.error).toBe("string");
    expect((response.body.error as string).length).toBeGreaterThan(0);
  });
});
