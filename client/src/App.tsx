import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, createQcReport, getQcReport } from "./api/qc";
import { EmptyState } from "./components/EmptyState";
import { ExportButton } from "./components/ExportButton";
import { ErrorBanner } from "./components/ErrorBanner";
import { FilterBar } from "./components/FilterBar";
import { LoadingPanel } from "./components/LoadingPanel";
import { ReportMeta } from "./components/ReportMeta";
import { SegmentTable } from "./components/SegmentTable";
import { SegmentTimeline } from "./components/SegmentTimeline";
import { SummaryStats } from "./components/SummaryStats";
import { UploadForm } from "./components/UploadForm";
import type { QcReport, SegmentFilter } from "./types/qc";

type LoadingState = "idle" | "fetching" | "submitting";

export default function App() {
  const [report, setReport] = useState<QcReport | null>(null);
  const [loading, setLoading] = useState<LoadingState>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<SegmentFilter>("ALL");

  // 用递增序号丢弃过期响应；AbortController 让旧请求尽快结束。
  // 这两个机制共同防止「旧报告晚返回，覆盖新请求结果」。
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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
    const runId = readRunIdFromUrl();

    if (runId !== null) {
      // 刷新恢复：浏览器只保存 runId，报告本身必须重新从 SQLite 读取。
      void loadReport(runId);
    }

    return () => {
      // 卸载或 StrictMode 重放时取消未完成请求，避免更新已卸载组件。
      abortRef.current?.abort();
    };
    // 只在首次挂载时读取 URL；后续新报告由 handleSubmit 主动写 URL。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginRequest(): { seq: number; controller: AbortController } {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    return { seq, controller };
  }

  async function loadReport(runId: string) {
    const { seq, controller } = beginRequest();

    setLoading("fetching");
    setError(null);

    try {
      const loaded = await getQcReport(runId, controller.signal);

      if (seq !== requestSeq.current) {
        return;
      }

      setReport(loaded);
      setFilter("ALL");
    } catch (caught) {
      if (isAbortError(caught) || seq !== requestSeq.current) {
        return;
      }

      setReport(null);
      setError(toApiError(caught));
    } finally {
      if (seq === requestSeq.current) {
        setLoading("idle");
      }
    }
  }

  function handleAttempt() {
    // 客户端校验失败也算一次新的检查尝试：先取消旧请求并清空旧结果，
    // 避免旧报告被误认为本次尝试的结果。
    abortRef.current?.abort();
    requestSeq.current += 1;
    setReport(null);
    setError(null);
    setFilter("ALL");
    updateRunIdInUrl(null);
  }

  async function handleSubmit(file: File, durationMs: number) {
    const { seq, controller } = beginRequest();

    // 新请求开始前再次清空旧结果，确保 API 请求失败时不会显示上一份报告。
    setReport(null);
    setError(null);
    setFilter("ALL");
    updateRunIdInUrl(null);
    setLoading("submitting");

    try {
      const nextReport = await createQcReport(
        file,
        durationMs,
        controller.signal,
      );

      if (seq !== requestSeq.current) {
        return;
      }

      setReport(nextReport);
      setFilter("ALL");

      // 成功后把 runId 写入 URL；刷新时据此调用 GET /api/qc/{runId}。
      updateRunIdInUrl(nextReport.runId);
    } catch (caught) {
      if (isAbortError(caught) || seq !== requestSeq.current) {
        return;
      }

      setReport(null);
      setError(toApiError(caught));
    } finally {
      if (seq === requestSeq.current) {
        setLoading("idle");
      }
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
            <UploadForm
              loading={isLoading}
              onAttempt={handleAttempt}
              onSubmit={handleSubmit}
            />
          </aside>

          <section className="results" aria-label="QC 结果">
            {error !== null ? <ErrorBanner error={error} /> : null}

            {isLoading ? (
              <LoadingPanel
                label={
                  loading === "fetching"
                    ? "正在从 SQLite 读取已保存报告…"
                    : "正在解析 CSV、执行 QC 并写入 SQLite…"
                }
              />
            ) : null}

            {!isLoading && error === null && report === null ? (
              <EmptyState />
            ) : null}

            {report !== null ? (
              <div className="report-stack">
                <ReportMeta report={report} />
                <SummaryStats report={report} />
                <SegmentTimeline report={report} />

                <div className="report-actions">
                  <span className="report-actions-note">
                    导出包含全部 Segment，不受当前筛选影响
                  </span>
                  <ExportButton report={report} />
                </div>

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

function readRunIdFromUrl(): string | null {
  const value = new URLSearchParams(window.location.search).get("runId");
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

function updateRunIdInUrl(runId: string | null): void {
  const url = new URL(window.location.href);

  if (runId === null) {
    url.searchParams.delete("runId");
  } else {
    url.searchParams.set("runId", runId);
  }

  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
