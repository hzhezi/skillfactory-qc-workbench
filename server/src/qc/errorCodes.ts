/**
 * 错误码集中定义，避免业务代码里散落字符串。
 *
 * QC_ERROR_CODES 的数组顺序就是 API 中 errors 的排序顺序：
 * INVALID_RANGE -> OUT_OF_BOUNDS -> EMPTY_ACTION -> OVERLAP。
 */
export const QC_ERROR_CODES = [
  "INVALID_RANGE",
  "OUT_OF_BOUNDS",
  "EMPTY_ACTION",
  "OVERLAP",
] as const;

export type QcErrorCode = (typeof QC_ERROR_CODES)[number];

/**
 * 文件级 / 请求级错误。HTTP 层会将它们映射为 400。
 * 这些错误不会创建 QC 报告。
 */
export const FILE_ERROR_CODES = [
  "FILE_REQUIRED",
  "EMPTY_FILE",
  "INVALID_CSV",
  "MISSING_HEADER",
  "NO_RECORDS",
  "INVALID_DURATION",
] as const;

export type FileErrorCode = (typeof FILE_ERROR_CODES)[number];

/**
 * HTTP 层额外错误码。
 * 它们不是 CSV 输入错误，因此单独定义，避免和 400 业务码混淆。
 */
export const API_ERROR_CODES = ["REPORT_NOT_FOUND", "INTERNAL_ERROR"] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ERROR_ORDER: Record<QcErrorCode, number> = {
  INVALID_RANGE: 0,
  OUT_OF_BOUNDS: 1,
  EMPTY_ACTION: 2,
  OVERLAP: 3,
};

/**
 * 可预期的输入错误。
 *
 * 继承 Error 以保留堆栈；code 用于 API 契约，message 用于日志和前端提示。
 * 不把底层 CSV 解析器的异常直接抛给 HTTP 层，避免泄漏实现细节。
 */
export class QcInputError extends Error {
  constructor(
    public readonly code: FileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QcInputError";
  }
}
