import type { QcErrorCode } from "../types/qc";

export const ERROR_LABELS: Record<QcErrorCode, string> = {
  INVALID_RANGE: "时间范围不合法",
  OUT_OF_BOUNDS: "超出视频总时长",
  EMPTY_ACTION: "动作名称为空",
  OVERLAP: "与其它片段重叠",
};

export function formatMs(value: number): string {
  return `${new Intl.NumberFormat("zh-CN").format(value)} ms`;
}

export function formatRange(
  startMs: number | null,
  endMs: number | null,
): string {
  if (startMs === null || endMs === null) {
    return "无法解析";
  }

  return `${formatMs(startMs)} – ${formatMs(endMs)}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * 时间轴刻度用更短的格式，避免 0/25/50/75/100% 标签互相挤压。
 * 例如 2500 -> "2.5s"，750 -> "750ms"。
 */
export function formatAxisMs(ms: number): string {
  if (ms === 0) {
    return "0";
  }

  if (ms >= 1000) {
    const seconds = ms / 1000;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
  }

  return `${ms}ms`;
}
