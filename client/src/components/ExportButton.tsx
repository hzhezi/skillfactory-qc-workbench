import type { QcReport } from "../types/qc";
import { downloadReportCsv } from "../utils/csvExport";

interface ExportButtonProps {
  report: QcReport;
}

export function ExportButton({ report }: ExportButtonProps) {
  return (
    <button
      type="button"
      className="secondary-button"
      onClick={() => downloadReportCsv(report)}
      title="导出全部 Segment，不受当前筛选影响"
    >
      导出 CSV
    </button>
  );
}
