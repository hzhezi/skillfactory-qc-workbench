import type { QcReport } from "../types/qc";

interface ApiErrorBody {
  code?: unknown;
  error?: unknown;
}

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

export function createQcReport(
  file: File,
  durationMs: number,
  signal?: AbortSignal,
): Promise<QcReport> {
  const form = new FormData();
  form.set("file", file);
  form.set("durationMs", String(durationMs));

  return requestJson<QcReport>("/api/qc", {
    method: "POST",
    body: form,
    signal,
  });
}

export function getQcReport(
  runId: string,
  signal?: AbortSignal,
): Promise<QcReport> {
  return requestJson<QcReport>(`/api/qc/${encodeURIComponent(runId)}`, {
    signal,
  });
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
