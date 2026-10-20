import { describe, expect, it } from "vitest";
import { ApiError, parseQcReport } from "../src/api/qc";

function validReport(): unknown {
  return {
    runId: "qc-test",
    createdAt: "2026-10-20T00:00:00.000Z",
    durationMs: 10000,
    total: 2,
    valid: 1,
    invalid: 1,
    segments: [
      {
        rowIndex: 1,
        segmentId: "s1",
        startMs: 0,
        endMs: 2000,
        action: "Pick",
        status: "VALID",
        errors: [],
      },
      {
        rowIndex: 2,
        segmentId: "s2",
        startMs: null,
        endMs: null,
        action: "",
        status: "INVALID",
        errors: ["INVALID_RANGE", "EMPTY_ACTION"],
      },
    ],
  };
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("Expected function to throw");
}

describe("parseQcReport", () => {
  it("接受符合契约的报告，包括 null 时间", () => {
    const report = parseQcReport(validReport());

    expect(report.segments).toHaveLength(2);
    expect(report.segments[1]?.startMs).toBeNull();
    expect(report.segments[1]?.errors).toEqual([
      "INVALID_RANGE",
      "EMPTY_ACTION",
    ]);
  });

  it("拒绝未知错误码", () => {
    const report = validReport() as {
      segments: Array<{ errors: string[] }>;
    };
    report.segments[0]!.errors = ["OVERLAP", "SOMETHING_NEW"];

    const error = captureError(() => parseQcReport(report));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });

  it("拒绝统计不一致的响应", () => {
    const report = validReport() as { total: number };
    report.total = 999;

    const error = captureError(() => parseQcReport(report));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });

  it("拒绝非法状态", () => {
    const report = validReport() as {
      segments: Array<{ status: string }>;
    };
    report.segments[0]!.status = "UNKNOWN";

    const error = captureError(() => parseQcReport(report));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INVALID_RESPONSE");
  });
});
