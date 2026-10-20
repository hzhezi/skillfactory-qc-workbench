import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const E2E_API_PORT = 3101;
const E2E_WEB_PORT = 5273;
const E2E_DB_PATH = path.join(tmpdir(), "skillfactory-qc-e2e.sqlite");

// 每次运行前清掉 E2E 专用数据库，避免上一轮报告影响断言。
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${E2E_DB_PATH}${suffix}`, { force: true });
}

/**
 * E2E 使用独立端口和临时 SQLite，不依赖开发中的 3001/5173，
 * 也不会污染 server/data/qc.sqlite。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter server dev",
      url: `http://localhost:${E2E_API_PORT}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        PORT: String(E2E_API_PORT),
        QC_DB_PATH: E2E_DB_PATH,
      },
    },
    {
      command: "pnpm --filter client dev",
      url: `http://localhost:${E2E_WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_PORT: String(E2E_WEB_PORT),
        VITE_API_TARGET: `http://localhost:${E2E_API_PORT}`,
      },
    },
  ],
});
