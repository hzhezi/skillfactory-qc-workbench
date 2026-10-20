import express, { type Express } from "express";
import type { QcRepository } from "./db/qcRepository";
import { errorHandler } from "./http/errorHandler";
import { createApiRouter } from "./http/routes";

export interface AppDependencies {
  repo: QcRepository;
}

/**
 * 应用工厂：只负责组合 /api 路由和错误处理中间件。
 *
 * 通过注入 QcRepository，Supertest 可以使用临时 SQLite 文件，
 * 不需要启动真实端口，也不会污染开发数据库。
 */
export function createApp({ repo }: AppDependencies): Express {
  const app = express();

  app.use("/api", createApiRouter({ repo }));
  app.use(errorHandler);

  return app;
}
