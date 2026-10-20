import { useEffect, useState } from "react";
import type { QcReport } from "../types/qc";
import { formatDateTime, formatMs } from "../utils/format";

interface ReportMetaProps {
  report: QcReport;
}

export function ReportMeta({ report }: ReportMetaProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyRunId() {
    try {
      await navigator.clipboard.writeText(report.runId);
      setCopied(true);
    } catch {
      // 本地环境可能没有 clipboard 权限；复制失败不阻断报告展示。
    }
  }

  return (
    <section className="report-toolbar panel" aria-labelledby="report-title">
      <div className="report-heading">
        <div>
          <p className="panel-label">02 · REPORT</p>
          <h2 id="report-title">QC 报告</h2>
        </div>
        <span className="saved-badge">
          <span className="saved-dot" aria-hidden="true" />
          已写入 SQLite
        </span>
      </div>

      <div className="meta-grid">
        <div className="meta-item">
          <span className="meta-label">RUN ID</span>
          <div className="run-id-row">
            <code className="run-id">{report.runId}</code>
            <button
              type="button"
              className="copy-button"
              onClick={copyRunId}
              aria-label="复制报告 ID"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>
        <div className="meta-item">
          <span className="meta-label">视频总时长</span>
          <strong>{formatMs(report.durationMs)}</strong>
        </div>
        <div className="meta-item">
          <span className="meta-label">创建时间</span>
          <strong>{formatDateTime(report.createdAt)}</strong>
        </div>
      </div>
    </section>
  );
}
