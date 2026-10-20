import type { QcReport } from "../types/qc";

const HEADER = [
  "rowIndex",
  "segmentId",
  "startMs",
  "endMs",
  "action",
  "status",
  "errors",
] as const;

/**
 * 生成导出 CSV。
 *
 * 注意：这里导出 report.segments 全量数据，不接收 filter；
 * 页面筛选只影响表格展示，不能影响导出内容。
 */
export function buildReportCsv(report: QcReport): string {
  const lines = [HEADER.map(escapeCsvField).join(",")];

  for (const segment of report.segments) {
    lines.push(
      [
        segment.rowIndex,
        segment.segmentId,
        segment.startMs,
        segment.endMs,
        segment.action,
        segment.status,
        segment.errors.join("|"),
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }

  return lines.join("\r\n");
}

export function downloadReportCsv(report: QcReport): void {
  const csv = buildReportCsv(report);
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `qc-report-${report.runId}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // 给浏览器一点时间开始下载，再释放对象 URL。
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeCsvField(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  let text = String(value);

  // 防 CSV/Excel 公式注入：文本以 =、+、-、@ 开头时，Excel 可能把它当公式。
  // 只在字符串字段前加单引号；数值字段（rowIndex/startMs/endMs）不处理。
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
