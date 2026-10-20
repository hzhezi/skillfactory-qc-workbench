import type { QcSegment } from "../types/qc";
import { ERROR_LABELS, formatRange } from "../utils/format";

interface SegmentTableProps {
  segments: QcSegment[];
}

export function SegmentTable({ segments }: SegmentTableProps) {
  if (segments.length === 0) {
    return <p className="table-empty">当前筛选下没有 Segment。</p>;
  }

  return (
    <div className="table-wrap">
      <table className="segment-table">
        <caption className="sr-only">Segment 检查结果</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Segment ID</th>
            <th scope="col">时间范围</th>
            <th scope="col">动作</th>
            <th scope="col">状态</th>
            <th scope="col">错误</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => (
            <tr
              key={segment.rowIndex}
              className={
                segment.status === "INVALID" ? "row-invalid" : "row-valid"
              }
            >
              <td className="cell-index">{segment.rowIndex}</td>
              <td>
                <code className="segment-id">
                  {segment.segmentId === "" ? "（空 ID）" : segment.segmentId}
                </code>
              </td>
              <td className="cell-time">
                {formatRange(segment.startMs, segment.endMs)}
              </td>
              <td>
                <span className="action-text">
                  {segment.action === "" ? "（空）" : segment.action}
                </span>
              </td>
              <td>
                <span
                  className={`status-badge status-${segment.status.toLowerCase()}`}
                >
                  {segment.status}
                </span>
              </td>
              <td>
                {segment.errors.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  <div className="error-list">
                    {segment.errors.map((code) => (
                      <span
                        className="error-chip"
                        key={code}
                        title={ERROR_LABELS[code]}
                      >
                        <span className="error-code">{code}</span>
                        <span className="error-label">
                          {ERROR_LABELS[code]}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
