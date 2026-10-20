/**
 * 前后端共享的 API 类型。
 *
 * 这个包只导出类型（type-only），不产生运行时代码；
 * 因此 client / server 不需要额外构建步骤，也不会引入跨包运行时依赖。
 */
export type QcErrorCode =
  | "INVALID_RANGE"
  | "OUT_OF_BOUNDS"
  | "EMPTY_ACTION"
  | "OVERLAP";

export type SegmentStatus = "VALID" | "INVALID";

export type SegmentFilter = "ALL" | "VALID" | "INVALID";

export interface SegmentBase {
  rowIndex: number;
  segmentId: string;
  startMs: number | null;
  endMs: number | null;
  action: string;
}

export interface QcSegment extends SegmentBase {
  status: SegmentStatus;
  errors: QcErrorCode[];
}

export interface QcReport {
  runId: string;
  createdAt: string;
  durationMs: number;
  total: number;
  valid: number;
  invalid: number;
  segments: QcSegment[];
}
