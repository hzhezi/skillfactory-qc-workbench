import { useEffect, useState } from "react";

type HealthState = "checking" | "ok" | "error";

const HEALTH_LABELS: Record<HealthState, string> = {
  checking: "检查中",
  ok: "正常",
  error: "不可用",
};

export default function App() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    let cancelled = false;

    // 通过 Vite 代理请求 /api/health，验证前后端是否联通。
    // 不在组件里写死 http://localhost:3001，避免开发端口变化后失效。
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

    // 组件卸载后不再更新状态，避免开发期 StrictMode 或页面切换产生警告。
    return () => {
      cancelled = true;
    };
  }, []);

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

      <main className="hero">
        <p className="eyebrow">VIDEO SEGMENTATION QC</p>
        <h1>
          视频分段
          <br />
          质量检查
        </h1>
        <p className="lede">
          上传分段 CSV，检查时间范围、视频边界、动作名称与片段重叠。
          报告写入本地 SQLite，刷新页面后可按 runId 重新读取。
        </p>

        <section className="phase-panel" aria-labelledby="phase-title">
          <div>
            <p className="panel-label">PHASE 0 · SCAFFOLD</p>
            <h2 id="phase-title">工程骨架已就绪</h2>
          </div>
          <p className="panel-note">
            当前只实现健康检查与前后端联调；上传、QC 规则、SQLite 与报告页面将在后续阶段接入。
          </p>
        </section>
      </main>

      <footer className="footer">
        <span>React + TypeScript</span>
        <span>Node.js + Express</span>
        <span>SQLite</span>
      </footer>
    </div>
  );
}
