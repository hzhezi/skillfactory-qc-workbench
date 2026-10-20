import { ERROR_ORDER, QcInputError, type QcErrorCode } from "./errorCodes";
import type { EvaluatedSegment, QcEvaluation, RawSegment } from "./types";

/**
 * 对解析后的 Segment 执行四条 QC 规则。
 *
 * 规则顺序与互斥关系：
 * 1. 时间无法解析 / start < 0 / end <= start -> INVALID_RANGE；
 * 2. 时间合法但 end > durationMs -> OUT_OF_BOUNDS；
 * 3. action.trim() 为空 -> EMPTY_ACTION（与时间是否合法无关）；
 * 4. 只有时间合法且未越界的记录才参与 OVERLAP。
 *
 * INVALID_RANGE 与 OUT_OF_BOUNDS 互斥；EMPTY_ACTION 可以和任意错误共存。
 */
export function evaluateSegments(
  rows: readonly RawSegment[],
  durationMs: number,
): QcEvaluation {
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new QcInputError("INVALID_DURATION", "durationMs 必须是正整数（毫秒）");
  }

  const errorsByRow = rows.map(() => new Set<QcErrorCode>());
  const overlapEligible: number[] = [];

  rows.forEach((row, index) => {
    const errors = errorsByRow[index]!;
    const { startMs, endMs } = row;

    if (startMs === null || endMs === null || startMs < 0 || endMs <= startMs) {
      errors.add("INVALID_RANGE");
    } else if (endMs > durationMs) {
      errors.add("OUT_OF_BOUNDS");
    } else {
      // 只有走到这里的时间段才可能参与重叠检查。
      overlapEligible.push(index);
    }

    // 空动作独立判断：即使时间非法或越界，也可以同时有 EMPTY_ACTION。
    if (row.action.trim() === "") {
      errors.add("EMPTY_ACTION");
    }
  });

  // 题目数据量 ≤ 100，O(n²) 双重循环足够，且比扫描线更容易验证。
  // 左闭右开区间 [start, end)：只有严格相交才算重叠，首尾相接不算。
  for (let left = 0; left < overlapEligible.length; left += 1) {
    for (let right = left + 1; right < overlapEligible.length; right += 1) {
      const leftIndex = overlapEligible[left];
      const rightIndex = overlapEligible[right];

      if (leftIndex === undefined || rightIndex === undefined) {
        continue;
      }

      const leftRow = rows[leftIndex];
      const rightRow = rows[rightIndex];

      if (leftRow === undefined || rightRow === undefined) {
        continue;
      }

      const { startMs: leftStart, endMs: leftEnd } = leftRow;
      const { startMs: rightStart, endMs: rightEnd } = rightRow;

      // 进入 eligible 的记录理论上时间都非 null；这里再次收窄类型，
      // 避免未来规则调整时出现空值参与比较。
      if (
        leftStart !== null &&
        leftEnd !== null &&
        rightStart !== null &&
        rightEnd !== null &&
        leftStart < rightEnd &&
        rightStart < leftEnd
      ) {
        // Set 自动去重：一条记录与多条记录重叠时，OVERLAP 只出现一次。
        errorsByRow[leftIndex]!.add("OVERLAP");
        errorsByRow[rightIndex]!.add("OVERLAP");
      }
    }
  }

  const segments: EvaluatedSegment[] = rows.map((row, index) => {
    const errors = [...errorsByRow[index]!].sort(
      (left, right) => ERROR_ORDER[left] - ERROR_ORDER[right],
    );

    return {
      ...row,
      status: errors.length === 0 ? "VALID" : "INVALID",
      errors,
    };
  });

  const valid = segments.filter((segment) => segment.status === "VALID").length;

  return {
    durationMs,
    total: segments.length,
    valid,
    invalid: segments.length - valid,
    segments,
  };
}
