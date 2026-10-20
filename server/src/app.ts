import express, { type Express } from "express";

/**
 * 应用工厂：把 Express 实例的创建与进程启动拆开。
 *
 * 这样 Supertest 可以直接拿到 app 做 HTTP 测试，不需要占用真实端口；
 * 后续数据库连接也可以作为依赖注入，避免测试污染开发数据库。
 */
export function createApp(): Express {
  const app = express();

  // 健康检查只表示 HTTP 服务可用，不依赖数据库。
  // 数据库初始化失败时应在启动阶段直接失败，而不是让 health 返回 ok。
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
