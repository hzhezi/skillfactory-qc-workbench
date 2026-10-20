import type { QcReport } from "../types/qc";

interface SummaryStatsProps {
  report: QcReport;
}

export function SummaryStats({ report }: SummaryStatsProps) {
  return (
    <section className="summary-grid" aria-label="QC 统计">
      <div className="stat-card stat-total">
        <span className="stat-label">TOTAL</span>
        <strong className="stat-value">{report.total}</strong>
        <span className="stat-note">全部 Segment</span>
      </div>
      <div className="stat-card stat-valid">
        <span className="stat-label">VALID</span>
        <strong className="stat-value">{report.valid}</strong>
        <span className="stat-note">无错误</span>
      </div>
      <div className="stat-card stat-invalid">
        <span className="stat-label">INVALID</span>
        <strong className="stat-value">{report.invalid}</strong>
        <span className="stat-note">至少一个错误</span>
      </div>
    </section>
  );
}
