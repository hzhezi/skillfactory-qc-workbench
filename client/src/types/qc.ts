/**
 * 客户端 API 类型。
 *
 * 与 server/src/qc/types.ts 手工镜像：前后端构建目标不同，当前没有引入共享包。
 * 为了避免字段漂移，api/qc.ts 会对服务端响应做运行时校验。
 */
export type QcErrorCode =
  | "INVALID_RANGE"
  | "OUT_OF_BOUNDS"
  | "EMPTY_ACTION"
  | "OVERLAP";

export type SegmentStatus = "VALID" | "INVALID";

export type SegmentFilter = "ALL" | "VALID" | "INVALID";

export interface QcSegment {
  rowIndex: number;
  segmentId: string;
  startMs: number | null;
  endMs: number | null;
  action: string;
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
