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
