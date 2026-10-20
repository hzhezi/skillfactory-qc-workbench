/**
 * 客户端使用的共享 API 类型。
 *
 * 实际定义在 @skillfactory/shared；client 与 server 不再各自维护一份。
 * api/qc.ts 仍会对服务端响应做运行时校验。
 */
export type {
  QcErrorCode,
  QcReport,
  QcSegment,
  SegmentFilter,
  SegmentStatus,
} from "@skillfactory/shared";
