import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { QcReport } from "../src/qc/types";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SAMPLE_CSV = readFileSync(
  new URL("./fixtures/sample-segments.csv", import.meta.url),
  "utf8",
);

describe("真实进程重启", () => {
  it(
    "同一 SQLite 文件重启后，仍能按 runId 读取完整报告",
    async () => {
      const tempDir = mkdtempSync(path.join(tmpdir(), "qc-restart-"));
      const dbPath = path.join(tempDir, "qc.sqlite");
      const port = await getFreePort();
      let child: ChildProcess | null = null;

      try {
        child = startServer(port, dbPath);
        await waitForHealth(port);

        const form = new FormData();
        form.set("durationMs", "10000");
        form.set(
          "file",
          new Blob([SAMPLE_CSV], { type: "text/csv" }),
          "segments.csv",
        );

        const createdResponse = await fetch(
          `http://127.0.0.1:${port}/api/qc`,
          {
            method: "POST",
            body: form,
          },
        );

        expect(createdResponse.status).toBe(200);

        const created = (await createdResponse.json()) as QcReport;
        expect(created.total).toBe(6);
        expect(created.valid).toBe(2);
        expect(created.invalid).toBe(4);

        // 必须等进程真正退出，避免第二次启动时 SQLite 仍被旧连接占用。
        await stopServer(child);
        child = null;

        child = startServer(port, dbPath);
        await waitForHealth(port);

        const loadedResponse = await fetch(
          `http://127.0.0.1:${port}/api/qc/${encodeURIComponent(created.runId)}`,
        );

        expect(loadedResponse.status).toBe(200);
        expect(await loadedResponse.json()).toEqual(created);
      } finally {
        await stopServer(child).catch(() => {});
        rmSync(tempDir, { recursive: true, force: true });
      }
    },
    30_000,
  );
});

/**
 * 用 --import tsx 直接运行 TS 入口，模拟真实的 `pnpm dev` 进程。
 * cwd 必须是 server/，这样 tsx 和 src/index.ts 的解析路径才稳定。
 */
function startServer(port: number, dbPath: string): ChildProcess {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    {
      cwd: SERVER_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        QC_DB_PATH: dbPath,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[restart-test] ${chunk.toString()}`);
  });

  return child;
}

async function waitForHealth(port: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);

      if (response.ok) {
        return;
      }
    } catch {
      // 进程尚未监听端口时 fetch 会失败，继续等待。
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not become healthy on port ${port}`);
}

async function stopServer(child: ChildProcess | null): Promise<void> {
  if (child === null || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Server did not stop within 10 seconds"));
    }, 10_000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a free port")));
        return;
      }

      const port = address.port;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}
