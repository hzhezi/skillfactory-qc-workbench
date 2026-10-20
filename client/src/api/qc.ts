import type {
  QcErrorCode,
  QcReport,
  QcSegment,
  SegmentStatus,
} from "../types/qc";

interface ApiErrorBody {
  code?: unknown;
  error?: unknown;
}

const QC_ERROR_CODES = new Set<QcErrorCode>([
  "INVALID_RANGE",
  "OUT_OF_BOUNDS",
  "EMPTY_ACTION",
  "OVERLAP",
]);

/**
 * 前端统一错误类型。
 *
 * code 优先使用后端返回的业务码；网络失败没有后端响应，使用 NETWORK_ERROR。
 * status 仅用于展示/排查，不参与业务判断。
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function createQcReport(
  file: File,
  durationMs: number,
  signal?: AbortSignal,
): Promise<QcReport> {
  const form = new FormData();
  form.set("file", file);
  form.set("durationMs", String(durationMs));

  const payload = await requestJson<unknown>("/api/qc", {
    method: "POST",
    body: form,
    signal,
  });

  return parseQcReport(payload);
}

export async function getQcReport(
  runId: string,
  signal?: AbortSignal,
): Promise<QcReport> {
  const payload = await requestJson<unknown>(
    `/api/qc/${encodeURIComponent(runId)}`,
    { signal },
  );

  return parseQcReport(payload);
}

/**
 * 运行时校验服务端响应。
 *
 * 前后端类型是手工镜像的；如果后端新增错误码或改字段，这里会立即失败，
 * 而不是把错误数据当成 QcReport 继续渲染。
 */
export function parseQcReport(value: unknown): QcReport {
  const record = asRecord(value);

  if (!Array.isArray(record.segments)) {
    throw invalidResponse();
  }

  const segments = record.segments.map(parseSegment);
  const report: QcReport = {
    runId: requireNonEmptyString(record.runId, "runId"),
    createdAt: requireNonEmptyString(record.createdAt, "createdAt"),
    durationMs: requirePositiveInteger(record.durationMs, "durationMs"),
    total: requireNonNegativeInteger(record.total, "total"),
    valid: requireNonNegativeInteger(record.valid, "valid"),
    invalid: requireNonNegativeInteger(record.invalid, "invalid"),
    segments,
  };

  if (
    report.total !== segments.length ||
    report.valid + report.invalid !== report.total
  ) {
    throw invalidResponse();
  }

  return report;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    // AbortError 是新请求取消旧请求的正常路径，交给调用方忽略。
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "NETWORK_ERROR",
      "网络请求失败，请确认后端已启动。",
      0,
    );
  }

  if (!response.ok) {
    throw await readApiError(response);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      "INVALID_RESPONSE",
      "服务器返回了无法解析的响应。",
      response.status,
    );
  }
}

async function readApiError(response: Response): Promise<ApiError> {
  let code = "INTERNAL_ERROR";
  let message = `请求失败（HTTP ${response.status}）`;

  try {
    const body = (await response.json()) as ApiErrorBody;

    if (typeof body.code === "string" && body.code !== "") {
      code = body.code;
    }

    if (typeof body.error === "string" && body.error !== "") {
      message = body.error;
    }
  } catch {
    // 非 JSON 错误响应保留默认 code/message。
  }

  return new ApiError(code, message, response.status);
}

function parseSegment(value: unknown): QcSegment {
  const record = asRecord(value);

  return {
    rowIndex: requirePositiveInteger(record.rowIndex, "rowIndex"),
    segmentId: requireString(record.segmentId, "segmentId"),
    startMs: requireNullableInteger(record.startMs, "startMs"),
    endMs: requireNullableInteger(record.endMs, "endMs"),
    action: requireString(record.action, "action"),
    status: parseStatus(record.status),
    errors: parseErrors(record.errors),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse();
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw invalidResponse(field);
  }

  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const text = requireString(value, field);

  if (text === "") {
    throw invalidResponse(field);
  }

  return text;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw invalidResponse(field);
  }

  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw invalidResponse(field);
  }

  return value;
}

function requireNullableInteger(
  value: unknown,
  field: string,
): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw invalidResponse(field);
  }

  return value;
}

function parseStatus(value: unknown): SegmentStatus {
  if (value !== "VALID" && value !== "INVALID") {
    throw invalidResponse("status");
  }

  return value;
}

function parseErrors(value: unknown): QcErrorCode[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) => typeof item === "string" && QC_ERROR_CODES.has(item as QcErrorCode),
    )
  ) {
    throw invalidResponse("errors");
  }

  return value as QcErrorCode[];
}

function invalidResponse(field?: string): ApiError {
  const suffix = field === undefined ? "" : `（字段：${field}）`;
  return new ApiError(
    "INVALID_RESPONSE",
    `服务器返回了不符合契约的报告${suffix}。`,
    200,
  );
}
