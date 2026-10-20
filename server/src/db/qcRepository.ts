import { randomUUID } from "node:crypto";
import {
  QC_ERROR_CODES,
  type QcErrorCode,
} from "../qc/errorCodes";
import type {
  EvaluatedSegment,
  QcEvaluation,
  QcReport,
  SegmentStatus,
} from "../qc/types";
import type { QcDatabase } from "./connection";

interface RunRow {
  id: string;
  duration_ms: number;
  total: number;
  valid: number;
  invalid: number;
  created_at: string;
}

interface SegmentRow {
  row_index: number;
  segment_id: string;
  start_ms: number | null;
  end_ms: number | null;
  action: string;
  status: string;
  errors_json: string;
}

/**
 * QC 报告读写。
 *
 * 持久化边界：
 * - saveReport 在一个事务内写入报告和全部 Segment，全部成功后才返回；
 * - 中途失败（例如 row_index 冲突）会回滚，不留下半份报告；
 * - getReport 从数据库还原，不依赖内存缓存。
 */
export class QcRepository {
  constructor(private readonly db: QcDatabase) {}

  saveReport(evaluation: QcEvaluation): QcReport {
    this.assertStats(evaluation);

    const runId = `qc-${randomUUID()}`;
    const createdAt = new Date().toISOString();

    const insertRun = this.db.prepare(`
      INSERT INTO qc_runs (id, duration_ms, total, valid, invalid, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertSegment = this.db.prepare(`
      INSERT INTO qc_segments
        (run_id, row_index, segment_id, start_ms, end_ms, action, status, errors_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // better-sqlite3 的 transaction 在回调抛错时自动 ROLLBACK。
    // 不要在这里手动 BEGIN/COMMIT，避免异常路径留下未关闭的事务。
    const writeAll = this.db.transaction((current: QcEvaluation) => {
      insertRun.run(
        runId,
        current.durationMs,
        current.total,
        current.valid,
        current.invalid,
        createdAt,
      );

      for (const segment of current.segments) {
        insertSegment.run(
          runId,
          segment.rowIndex,
          segment.segmentId,
          segment.startMs,
          segment.endMs,
          segment.action,
          segment.status,
          JSON.stringify(segment.errors),
        );
      }
    });

    writeAll(evaluation);

    return {
      runId,
      createdAt,
      durationMs: evaluation.durationMs,
      total: evaluation.total,
      valid: evaluation.valid,
      invalid: evaluation.invalid,
      segments: evaluation.segments,
    };
  }

  getReport(runId: string): QcReport | null {
    const run = this.db
      .prepare(
        `SELECT id, duration_ms, total, valid, invalid, created_at
         FROM qc_runs
         WHERE id = ?`,
      )
      .get(runId) as RunRow | undefined;

    if (run === undefined) {
      return null;
    }

    const segmentRows = this.db
      .prepare(
        `SELECT row_index, segment_id, start_ms, end_ms, action, status, errors_json
         FROM qc_segments
         WHERE run_id = ?
         ORDER BY row_index ASC`,
      )
      .all(runId) as SegmentRow[];

    return {
      runId: run.id,
      createdAt: run.created_at,
      durationMs: run.duration_ms,
      total: run.total,
      valid: run.valid,
      invalid: run.invalid,
      segments: segmentRows.map(toEvaluatedSegment),
    };
  }

  /**
   * 防止上层传入统计不一致的数据。
   * 数据库里也有 CHECK 约束，但这里提前报错能给出更明确的错误信息。
   */
  private assertStats(evaluation: QcEvaluation): void {
    if (
      evaluation.total !== evaluation.segments.length ||
      evaluation.valid + evaluation.invalid !== evaluation.total
    ) {
      throw new Error("QC evaluation statistics are inconsistent");
    }
  }
}

function toEvaluatedSegment(row: SegmentRow): EvaluatedSegment {
  return {
    rowIndex: row.row_index,
    segmentId: row.segment_id,
    startMs: row.start_ms,
    endMs: row.end_ms,
    action: row.action,
    status: parseStatus(row.status),
    errors: parseErrors(row.errors_json),
  };
}

function parseStatus(value: string): SegmentStatus {
  if (value !== "VALID" && value !== "INVALID") {
    throw new Error(`Corrupted status in qc_segments: ${value}`);
  }

  return value;
}

function parseErrors(json: string): QcErrorCode[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Corrupted errors_json in qc_segments");
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (value) =>
        typeof value === "string" &&
        (QC_ERROR_CODES as readonly string[]).includes(value),
    )
  ) {
    throw new Error("Corrupted errors_json in qc_segments");
  }

  return parsed as QcErrorCode[];
}
