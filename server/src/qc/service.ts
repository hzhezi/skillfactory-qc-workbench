import type { QcRepository } from "../db/qcRepository";
import { parseSegmentsCsv } from "./csv";
import { QcInputError } from "./errorCodes";
import { evaluateSegments } from "./rules";
import type { QcReport } from "./types";

export interface CreateQcReportInput {
  csv: Buffer;
  durationMs: number;
}

/**
 * QC 业务编排：文件解析 -> 规则检查 -> 事务保存。
 *
 * HTTP 层只负责读取 multipart 字段和映射错误；
 * 这里不关心 Express 的 req/res，方便后续复用或单独测试。
 */
export function createQcReport(
  repo: QcRepository,
  input: CreateQcReportInput,
): QcReport {
  if (input.csv.length === 0) {
    throw new QcInputError("EMPTY_FILE", "CSV 文件为空");
  }

  const rows = parseSegmentsCsv(input.csv);
  const evaluation = evaluateSegments(rows, input.durationMs);

  return repo.saveReport(evaluation);
}
