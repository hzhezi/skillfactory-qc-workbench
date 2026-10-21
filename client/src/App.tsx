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

  // 指针光晕使用 ref 直接写 style，避免 pointermove 触发 React 重渲染。
  const glowRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const glow = glowRef.current;

    // 触屏设备没有持续悬停的指针；减少动态效果是系统级无障碍设置。
    // 两种情况都不挂监听，保持默认隐藏，避免无意义的重绘。
    if (
      glow === null ||
      !window.matchMedia("(hover: hover)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.3;
    let currentX = targetX;
    let currentY = targetY;

    const render = () => {
      // 12% 插值让光晕略滞后于指针，形成柔和的跟随感而不是硬绑定。
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      glow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

      // 接近目标后停止 rAF，避免鼠标静止时空转。
      frame =
        Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.5
          ? requestAnimationFrame(render)
          : 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      glow.style.opacity = "1";

      if (frame === 0) {
        frame = requestAnimationFrame(render);
      }
    };

    // 先放到初始位置再监听，防止首次移动前在左上角闪现。
    glow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
    };
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
      <div ref={glowRef} className="pointer-glow" aria-hidden="true" />
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

      {/* 固定在左下角的源码入口；新窗口打开，避免离开当前 QC 结果。 */}
      <a
        className="github-link"
        href="https://github.com/hzhezi/skillfactory-qc-workbench"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="在 GitHub 查看源码仓库"
        title="GitHub 源码仓库"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
        </svg>
      </a>
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
