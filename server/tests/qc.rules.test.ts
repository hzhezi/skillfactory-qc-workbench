import { describe, expect, it } from "vitest";
import { QcInputError } from "../src/qc/errorCodes";
import { evaluateSegments } from "../src/qc/rules";
import type { QcEvaluation, RawSegment } from "../src/qc/types";

/**
 * 构造测试用的 Segment，默认动作非空、ID 唯一。
 * 需要测试空动作或重复 ID 时再通过 options 覆盖。
 */
function segment(
  rowIndex: number,
  startMs: number | null,
  endMs: number | null,
  options: { action?: string; segmentId?: string } = {},
): RawSegment {
  return {
    rowIndex,
    segmentId: options.segmentId ?? `s${rowIndex}`,
    startMs,
    endMs,
    action: options.action ?? "Move",
  };
}

function errorsAt(result: QcEvaluation, index: number): string[] {
  return result.segments[index]?.errors ?? [];
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("Expected function to throw");
}

describe("evaluateSegments — 时间与重叠规则", () => {
  it("首尾相接的区间不算重叠", () => {
    const result = evaluateSegments(
      [segment(1, 0, 2000), segment(2, 2000, 4000)],
      4000,
    );

    expect(errorsAt(result, 0)).toEqual([]);
    expect(errorsAt(result, 1)).toEqual([]);
    expect(result.valid).toBe(2);
    expect(result.invalid).toBe(0);
  });

  it("真正重叠时双方都标记 OVERLAP", () => {
    const result = evaluateSegments(
      [segment(1, 0, 2000), segment(2, 1900, 3000)],
      10000,
    );

    expect(errorsAt(result, 0)).toEqual(["OVERLAP"]);
    expect(errorsAt(result, 1)).toEqual(["OVERLAP"]);
  });

  it("完全包含且输入乱序时，双方仍标记 OVERLAP，输出顺序不变", () => {
    const result = evaluateSegments(
      [segment(1, 5000, 9000), segment(2, 6000, 7000)],
      10000,
    );

    expect(result.segments.map((item) => item.segmentId)).toEqual(["s1", "s2"]);
    expect(errorsAt(result, 0)).toEqual(["OVERLAP"]);
    expect(errorsAt(result, 1)).toEqual(["OVERLAP"]);
  });

  it("空动作但时间合法的记录可以同时有 EMPTY_ACTION 和 OVERLAP", () => {
    const result = evaluateSegments(
      [
        segment(1, 0, 2000, { action: "" }),
        segment(2, 1000, 3000, { action: "Move" }),
      ],
      10000,
    );

    expect(errorsAt(result, 0)).toEqual(["EMPTY_ACTION", "OVERLAP"]);
    expect(errorsAt(result, 1)).toEqual(["OVERLAP"]);
  });

  it("INVALID_RANGE 记录不参与重叠检查", () => {
    const result = evaluateSegments(
      [
        segment(1, 1000, 1000),
        segment(2, -1, 500),
        segment(3, null, 2000),
        segment(4, 0, 2000),
      ],
      10000,
    );

    expect(errorsAt(result, 0)).toEqual(["INVALID_RANGE"]);
    expect(errorsAt(result, 1)).toEqual(["INVALID_RANGE"]);
    expect(errorsAt(result, 2)).toEqual(["INVALID_RANGE"]);
    expect(errorsAt(result, 3)).toEqual([]);
  });

  it("OUT_OF_BOUNDS 记录不参与重叠检查", () => {
    const result = evaluateSegments(
      [
        segment(1, 5000, 12000),
        segment(2, 6000, 13000),
        segment(3, 0, 2000),
      ],
      10000,
    );

    expect(errorsAt(result, 0)).toEqual(["OUT_OF_BOUNDS"]);
    expect(errorsAt(result, 1)).toEqual(["OUT_OF_BOUNDS"]);
    expect(errorsAt(result, 2)).toEqual([]);
  });

  it("多错误按固定顺序排列，INVALID_RANGE 与 OUT_OF_BOUNDS 互斥", () => {
    const result = evaluateSegments(
      [
        segment(1, -1, 5000, { action: "" }),
        segment(2, 0, 12000, { action: "" }),
        segment(3, 0, 0),
      ],
      10000,
    );

    expect(errorsAt(result, 0)).toEqual(["INVALID_RANGE", "EMPTY_ACTION"]);
    expect(errorsAt(result, 1)).toEqual(["OUT_OF_BOUNDS", "EMPTY_ACTION"]);
    expect(errorsAt(result, 2)).toEqual(["INVALID_RANGE"]);
  });

  it("一条记录与多条记录重叠时 OVERLAP 只出现一次", () => {
    const result = evaluateSegments(
      [
        segment(1, 0, 10000),
        segment(2, 1000, 2000),
        segment(3, 3000, 4000),
        segment(4, 5000, 6000),
      ],
      10000,
    );

    expect(errorsAt(result, 0)).toEqual(["OVERLAP"]);
    expect(errorsAt(result, 1)).toEqual(["OVERLAP"]);
    expect(errorsAt(result, 2)).toEqual(["OVERLAP"]);
    expect(errorsAt(result, 3)).toEqual(["OVERLAP"]);
  });

  it("完全相同的区间双方都标记 OVERLAP", () => {
    const result = evaluateSegments(
      [segment(1, 0, 2000), segment(2, 0, 2000)],
      10000,
    );

    expect(errorsAt(result, 0)).toEqual(["OVERLAP"]);
    expect(errorsAt(result, 1)).toEqual(["OVERLAP"]);
  });

  it("重复 segment_id 按两条独立记录参与重叠检查", () => {
    const result = evaluateSegments(
      [
        segment(1, 0, 2000, { segmentId: "dup" }),
        segment(2, 1900, 3000, { segmentId: "dup" }),
      ],
      10000,
    );

    expect(result.total).toBe(2);
    expect(result.segments.map((item) => item.segmentId)).toEqual(["dup", "dup"]);
    expect(errorsAt(result, 0)).toEqual(["OVERLAP"]);
    expect(errorsAt(result, 1)).toEqual(["OVERLAP"]);
  });

  it("区间刚好结束于 durationMs 时合法", () => {
    expect(
      evaluateSegments([segment(1, 9000, 10000)], 10000).segments[0]?.errors,
    ).toEqual([]);
    expect(
      evaluateSegments([segment(1, 0, 10000)], 10000).segments[0]?.errors,
    ).toEqual([]);
    expect(
      evaluateSegments([segment(1, 0, 10001)], 10000).segments[0]?.errors,
    ).toEqual(["OUT_OF_BOUNDS"]);
  });

  it("统计满足 valid + invalid = total，且 segments 数量等于 total", () => {
    const result = evaluateSegments(
      [
        segment(1, 0, 1000),
        segment(2, 1000, 2000),
        segment(3, 1500, 2500, { action: "" }),
        segment(4, 0, 0),
        segment(5, 0, 20000),
      ],
      10000,
    );

    expect(result.total).toBe(5);
    expect(result.valid + result.invalid).toBe(result.total);
    expect(result.segments).toHaveLength(result.total);
  });

  it("durationMs 非法时抛出 INVALID_DURATION", () => {
    for (const duration of [0, -1, 1.5, Number.NaN]) {
      const error = captureError(() => evaluateSegments([], duration));
      expect(error).toBeInstanceOf(QcInputError);
      expect((error as QcInputError).code).toBe("INVALID_DURATION");
    }
  });
});
