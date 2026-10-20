import { createApp } from "./app";
import { getDbPath } from "./config";
import { openDatabase } from "./db/connection";
import { QcRepository } from "./db/qcRepository";

// 端口允许用环境变量覆盖，方便端口冲突时调整。
// 默认值与 README 中记录的后端地址保持一致。
const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}`);
}

// 数据库初始化失败时直接让进程启动失败，而不是先监听端口。
// 这样不会出现 health 返回 ok、但所有 QC 请求都写库失败的假健康状态。
const dbPath = getDbPath();
const db = openDatabase(dbPath);

const repo = new QcRepository(db);
const app = createApp({ repo });
const server = app.listen(port, () => {
  console.log(`[server] QC API listening on http://localhost:${port}`);
  console.log(`[server] SQLite: ${dbPath}`);
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);

  server.close(() => {
    db.close();
    process.exit(0);
  });
}

// 正常停止时关闭 SQLite，确保 WAL 内容落盘；测试环境不经过这里。
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
