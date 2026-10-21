import type { QcReport, QcSegment } from "../types/qc";
import { formatAxisMs, formatRange } from "../utils/format";

interface SegmentTimelineProps {
  report: QcReport;
}

type PlaceableSegment = QcSegment & {
  startMs: number;
  endMs: number;
};

const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * 只有时间可解析、start >= 0 且 end > start 的 Segment 才能放到时间轴上。
 * 越界片段仍然可以定位，但右端会被截断并标记。
 */
function isPlaceable(segment: QcSegment): segment is PlaceableSegment {
  return (
    segment.startMs !== null &&
    segment.endMs !== null &&
    segment.startMs >= 0 &&
    segment.endMs > segment.startMs
  );
}

export function SegmentTimeline({ report }: SegmentTimelineProps) {
  const placeable = report.segments.filter(isPlaceable);

  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <div className="timeline-heading">
        <div>
          <p className="panel-label">VISUAL · TIMELINE</p>
          <h2 id="timeline-title">时间轴</h2>
        </div>
        <div className="timeline-legend" aria-label="时间轴图例">
          <span className="legend-item">
            <span className="legend-swatch legend-valid" aria-hidden="true" />
            有效
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-invalid" aria-hidden="true" />
            无效 / 越界
          </span>
        </div>
      </div>

      {placeable.length === 0 ? (
        <p className="timeline-empty">没有可定位的 Segment。</p>
      ) : (
        <div
          className="timeline"
          role="img"
          aria-label="Segment 时间轴，详细数据见下方表格"
        >
          <div className="timeline-axis-row" aria-hidden="true">
            <span className="timeline-axis-spacer" />
            <div className="timeline-axis">
              {TICKS.map((tick) => (
                <span
                  key={tick}
                  className="timeline-tick"
                  style={{ left: `${tick * 100}%` }}
                >
                  {formatAxisMs(Math.round(report.durationMs * tick))}
                </span>
              ))}
            </div>
          </div>

          <div className="timeline-rows">
            {placeable.map((segment) => {
              const clipped =
                segment.endMs > report.durationMs ||
                segment.startMs > report.durationMs;
              const start = Math.min(
                Math.max(segment.startMs, 0),
                report.durationMs,
              );
              const end = Math.min(
                Math.max(segment.endMs, start),
                report.durationMs,
              );
              const left =
                report.durationMs === 0
                  ? 0
                  : (start / report.durationMs) * 100;
              const width =
                report.durationMs === 0
                  ? 0
                  : Math.max(((end - start) / report.durationMs) * 100, 0.35);

              return (
                <div className="timeline-row" key={segment.rowIndex}>
                  <div className="timeline-label">
                    <span className="timeline-id">
                      {segment.segmentId === ""
                        ? "（空 ID）"
                        : segment.segmentId}
                    </span>
                    <span className="timeline-range">
                      {formatRange(segment.startMs, segment.endMs)}
                    </span>
                  </div>
                  <div className="timeline-track">
                    <span
                      className={`timeline-bar ${
                        segment.status === "VALID"
                          ? "bar-valid"
                          : "bar-invalid"
                      } ${clipped ? "is-clipped" : ""}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${formatRange(segment.startMs, segment.endMs)} · ${
                        segment.status
                      }${clipped ? " · 超出视频总时长，已截断" : ""}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
