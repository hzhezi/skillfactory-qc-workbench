import { parse } from "csv-parse/sync";
import { QcInputError } from "./errorCodes";
import type { RawSegment } from "./types";

const REQUIRED_HEADERS = ["segment_id", "start_ms", "end_ms", "action"] as const;
type RequiredHeader = (typeof REQUIRED_HEADERS)[number];

// 只接受十进制整数文本。可带负号，但不接受 +、小数、科学计数法或空值。
const INTEGER_PATTERN = /^-?\d+$/;

/**
 * 解析上传的 CSV。
 *
 * 处理顺序很重要：
 * 1. 去掉 BOM 并判断空文件；
 * 2. 用 csv-parse 处理引号、逗号、转义引号和 CRLF；
 * 3. 过滤空白行；
 * 4. 校验表头、列数；
 * 5. 解析每条数据记录。
 *
 * 片段级错误（时间不是整数、动作为空等）不在这里抛出，
 * 而是保留为 null / 原始字符串，交给规则层判断，避免整份文件被拒绝。
 */
export function parseSegmentsCsv(input: Buffer | string): RawSegment[] {
  const text = typeof input === "string" ? input : input.toString("utf8");
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  // 空文件、只有 BOM、只有空白字符都属于文件级 EMPTY_FILE。
  if (withoutBom.trim() === "") {
    throw new QcInputError("EMPTY_FILE", "CSV 文件为空");
  }

  let records: string[][];
  try {
    records = parse(withoutBom, {
      // BOM 已在上面手动处理；保留 bom 选项作为双保险。
      bom: true,
      columns: false,
      // 真正的空行直接跳过；仅空白字符的行在后面单独过滤。
      skip_empty_lines: true,
      // 不放松引号规则，未闭合引号必须作为结构性错误。
      relax_quotes: false,
      // 这里放开 csv-parse 的列数检查，原因是它会把“前导空白行”当成
      // 第一条记录并推定列数，导致后面的合法表头被误判。
      // 真正的列数校验在过滤空白行之后手写完成。
      relax_column_count: true,
      // 保留字段原文，segment_id / action 不能因为 trim 而改变。
      trim: false,
    }) as string[][];
  } catch (error) {
    const detail = error instanceof Error ? error.message : "无法解析 CSV";
    throw new QcInputError("INVALID_CSV", `CSV 结构错误：${detail}`);
  }

  // 只过滤“仅包含空白字符的单字段行”。
  // 不把 ""（引号包裹的空字段）当空行，避免掩盖真正的列数错误。
  const rows = records.filter((record) => {
    if (record.length !== 1) {
      return true;
    }

    const onlyField = record[0];
    return onlyField === undefined || onlyField === "" || onlyField.trim() !== "";
  });

  const header = rows[0];
  if (header === undefined) {
    throw new QcInputError("EMPTY_FILE", "CSV 文件为空");
  }

  const headerIndexes = resolveHeaderIndexes(header);
  const dataRows = rows.slice(1);

  // 表头存在但没有数据记录；注意空白行已经被过滤。
  if (dataRows.length === 0) {
    throw new QcInputError("NO_RECORDS", "CSV 只有表头，没有数据记录");
  }

  return dataRows.map((record, index) => {
    if (record.length !== header.length) {
      throw new QcInputError(
        "INVALID_CSV",
        `第 ${index + 1} 条数据记录的列数与表头不一致`,
      );
    }

    return {
      // rowIndex 只统计数据记录，不统计表头和空白行；从 1 开始。
      rowIndex: index + 1,
      segmentId: record[headerIndexes.segment_id] ?? "",
      startMs: parseInteger(record[headerIndexes.start_ms] ?? ""),
      endMs: parseInteger(record[headerIndexes.end_ms] ?? ""),
      action: record[headerIndexes.action] ?? "",
    };
  });
}

/**
 * 把必需表头映射到列索引。
 *
 * 列名区分大小写且不做 trim；题目要求列名精确匹配。
 * 必需列重复会造成映射歧义，因此按 INVALID_CSV 处理。
 * 额外列允许存在，且不参与后续处理。
 */
function resolveHeaderIndexes(header: readonly string[]): Record<RequiredHeader, number> {
  const indexes = {} as Record<RequiredHeader, number>;
  const missing: string[] = [];

  for (const name of REQUIRED_HEADERS) {
    const matches: number[] = [];

    header.forEach((cell, index) => {
      if (cell === name) {
        matches.push(index);
      }
    });

    if (matches.length === 0) {
      missing.push(name);
    } else if (matches.length > 1) {
      throw new QcInputError("INVALID_CSV", `必要表头重复：${name}`);
    } else {
      indexes[name] = matches[0]!;
    }
  }

  if (missing.length > 0) {
    throw new QcInputError("MISSING_HEADER", `缺少必要表头：${missing.join(", ")}`);
  }

  return indexes;
}

/**
 * 解析时间字段。
 *
 * 只接受十进制整数文本，允许首尾空白；
 * 解析失败返回 null，由规则层标记 INVALID_RANGE。
 * 这里不用 parseInt，避免 "12abc" 被错误解析成 12。
 */
function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();

  if (!INTEGER_PATTERN.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
