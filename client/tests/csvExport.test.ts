import { describe, expect, it } from "vitest";
import type { QcReport } from "../src/types/qc";
import { buildReportCsv } from "../src/utils/csvExport";

function makeReport(): QcReport {
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
        action: 'Move, "cup"\nNext',
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

describe("buildReportCsv", () => {
  it("导出完整报告，不受筛选影响，并正确转义逗号/引号/换行", () => {
    const csv = buildReportCsv(makeReport());
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(
      "rowIndex,segmentId,startMs,endMs,action,status,errors",
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Move, ""cup""\nNext"');
    expect(lines[1]).toContain("VALID");
    expect(lines[2]).toContain(",,");
    expect(lines[2]).toContain("INVALID");
    expect(lines[2]).toContain("INVALID_RANGE|EMPTY_ACTION");
  });

  it("不修改 action 原文，也不包含 BOM", () => {
    const csv = buildReportCsv(makeReport());

    expect(csv.startsWith("\uFEFF")).toBe(false);
    expect(csv).toContain('Move, ""cup""');
  });
});
