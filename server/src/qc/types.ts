import type {
  QcErrorCode,
  QcSegment,
  QcReport,
  SegmentBase,
  SegmentStatus,
} from "@skillfactory/shared";

export type {
  QcErrorCode,
  QcReport,
  SegmentStatus,
} from "@skillfactory/shared";

/**
 * CSV 解析后的原始 Segment。
 *
 * startMs / endMs 解析失败时为 null，而不是 0；
 * 这样 API 能按题目要求返回 null，规则层也能据此判断 INVALID_RANGE。
 */
export interface RawSegment extends SegmentBase {}

export interface EvaluatedSegment extends QcSegment {}

/**
 * 一次 QC 的结果，不包含 runId / createdAt。
 * 这两个字段由持久化层生成，避免纯规则层依赖数据库或时间。
 */
export interface QcEvaluation {
  durationMs: number;
  total: number;
  valid: number;
  invalid: number;
  segments: EvaluatedSegment[];
}
