import { useEffect, useMemo, useState } from "react";
import { ApiError, createQcReport } from "./api/qc";
import { EmptyState } from "./components/EmptyState";
import { ErrorBanner } from "./components/ErrorBanner";
import { FilterBar } from "./components/FilterBar";
import { LoadingPanel } from "./components/LoadingPanel";
import { ReportMeta } from "./components/ReportMeta";
import { SegmentTable } from "./components/SegmentTable";
import { SummaryStats } from "./components/SummaryStats";
import { UploadForm } from "./components/UploadForm";
import type { QcReport, SegmentFilter } from "./types/qc";

type HealthState = "checking" | "ok" | "error";
type LoadingState = "idle" | "submitting";

const HEALTH_LABELS: Record<HealthState, string> = {
  checking: "检查中",
  ok: "正常",
  error: "不可用",
};

export default function App() {
  const [health, setHealth] = useState<HealthState>("checking");
  const [report, setReport] = useState<QcReport | null>(null);
  const [loading, setLoading] = useState<LoadingState>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<SegmentFilter>("ALL");

  const isLoading = loading !== "idle";

  // 筛选只影响展示，不重新请求后端，也不改变统计。
  const visibleSegments = useMemo(() => {
    if (report === null) {
      return [];
    }

    if (filter === "ALL") {
      return report.segments;
    }

    return report.segments.filter((segment) => segment.status === filter);
  }, [report, filter]);

  useEffect(() => {
    let cancelled = false;

    // 通过 Vite 代理检查后端；只用于顶部状态灯，不阻塞页面。
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<{ status: string }>;
      })
      .then((data) => {
        if (!cancelled) {
          setHealth(data.status === "ok" ? "ok" : "error");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealth("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(file: File, durationMs: number) {
    // 新请求开始前清空旧结果，避免请求失败时旧报告被误认为新报告。
    setReport(null);
    setError(null);
    setFilter("ALL");
    setLoading("submitting");

    try {
      const nextReport = await createQcReport(file, durationMs);
      setReport(nextReport);
      setFilter("ALL");
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setLoading("idle");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="wordmark-mark" aria-hidden="true" />
          <span>SkillFactory</span>
          <span className="wordmark-divider">/</span>
          <span className="wordmark-sub">QC Workbench</span>
        </div>
        <div className={`health health-${health}`}>
          <span className="health-dot" aria-hidden="true" />
          API {HEALTH_LABELS[health]}
        </div>
      </header>

      <main>
        <section className={report === null ? "hero" : "hero hero-compact"}>
          <p className="eyebrow">VIDEO SEGMENTATION QC</p>
          <h1>
            视频分段
            <br />
            质量检查
          </h1>
          <p className="lede">
            上传分段 CSV，检查时间范围、视频边界、动作名称与片段重叠。
            报告写入本地 SQLite，可凭 runId 重新读取。
          </p>
        </section>

        <div className="workbench">
          <aside className="panel upload-panel" aria-labelledby="upload-title">
            <p className="panel-label">01 · INPUT</p>
            <h2 id="upload-title">上传分段 CSV</h2>
            <p className="panel-note">
              必需列：segment_id、start_ms、end_ms、action。列顺序可调整，允许额外列。
            </p>
            <UploadForm loading={isLoading} onSubmit={handleSubmit} />
          </aside>

          <section className="results" aria-label="QC 结果">
            {error !== null ? <ErrorBanner error={error} /> : null}

            {isLoading ? (
              <LoadingPanel label="正在解析 CSV、执行 QC 并写入 SQLite…" />
            ) : null}

            {!isLoading && error === null && report === null ? (
              <EmptyState />
            ) : null}

            {report !== null ? (
              <div className="report-stack">
                <ReportMeta report={report} />
                <SummaryStats report={report} />

                <section
                  className="panel segments-panel"
                  aria-labelledby="segments-title"
                >
                  <div className="segments-heading">
                    <div>
                      <p className="panel-label">03 · SEGMENTS</p>
                      <h2 id="segments-title">检查明细</h2>
                    </div>
                    <FilterBar
                      filter={filter}
                      total={report.total}
                      valid={report.valid}
                      invalid={report.invalid}
                      onChange={setFilter}
                    />
                  </div>

                  <SegmentTable segments={visibleSegments} />
                </section>
              </div>
            ) : null}
          </section>
        </div>
      </main>

      <footer className="footer">
        <span>React + TypeScript</span>
        <span>Node.js + Express</span>
        <span>SQLite</span>
        <span>本地运行 · 端口 5173 / 3001</span>
      </footer>
    </div>
  );
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  return new ApiError(
    "NETWORK_ERROR",
    "请求失败，请确认后端已启动后重试。",
    0,
  );
}
