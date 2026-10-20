import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import type { QcRepository } from "./db/qcRepository";
import { parseSegmentsCsv } from "./qc/csv";
import { QcInputError } from "./qc/errorCodes";
import { evaluateSegments } from "./qc/rules";

// 题目文件很小，使用内存存储即可；不需要落临时文件，也不会产生清理问题。
const upload = multer({ storage: multer.memoryStorage() });

// durationMs 只接受十进制正整数文本；前导零允许，正号/小数/科学计数法拒绝。
const POSITIVE_INTEGER = /^\d+$/;

export interface AppDependencies {
  repo: QcRepository;
}

/**
 * 应用工厂：路由、错误映射和 repository 注入集中在这里。
 *
 * 通过注入 QcRepository，Supertest 可以使用临时 SQLite 文件，
 * 不需要启动真实端口，也不会污染开发数据库。
 */
export function createApp({ repo }: AppDependencies): Express {
  const app = express();

  // 健康检查只表示 HTTP 服务可用，不依赖数据库。
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/api/qc", upload.single("file"), (req, res, next) => {
    try {
      // 校验顺序与计划书 5.5 一致：文件 -> 时长 -> 空文件 -> CSV 结构/表头/记录。
      const file = req.file;

      if (file === undefined) {
        throw new QcInputError("FILE_REQUIRED", "请上传 CSV 文件（字段名 file）");
      }

      const durationMs = parseDurationMs(req.body?.durationMs);

      if (durationMs === null) {
        throw new QcInputError("INVALID_DURATION", "durationMs 必须是正整数（毫秒）");
      }

      // 0 字节文件在解析前直接拦截；只有 BOM / 空白字符的文件由解析器判断。
      if (file.buffer.length === 0) {
        throw new QcInputError("EMPTY_FILE", "CSV 文件为空");
      }

      const rows = parseSegmentsCsv(file.buffer);
      const evaluation = evaluateSegments(rows, durationMs);

      // 只有事务提交成功后才会返回 200；保存失败由 error handler 映射为 500。
      const report = repo.saveReport(evaluation);
      res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/qc/:runId", (req, res, next) => {
    try {
      const runId = req.params.runId;

      if (runId === undefined || runId === "") {
        res.status(404).json({ code: "REPORT_NOT_FOUND", error: "报告不存在" });
        return;
      }

      // 只从 SQLite 读取，不使用内存缓存，确保刷新/重启后走同一数据源。
      const report = repo.getReport(runId);

      if (report === null) {
        res.status(404).json({ code: "REPORT_NOT_FOUND", error: "报告不存在" });
        return;
      }

      res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  });

  // Express 通过 4 个参数识别错误处理中间件，_next 即使不用也不能省略。
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof QcInputError) {
        res.status(400).json({ code: error.code, error: error.message });
        return;
      }

      // multer 的字段名错误、文件数量错误等统一按「没有正确的 file 字段」处理。
      if (error instanceof multer.MulterError) {
        res.status(400).json({
          code: "FILE_REQUIRED",
          error: "请使用 file 字段上传 CSV 文件",
        });
        return;
      }

      // 数据库错误、程序 bug 等不把内部细节暴露给前端。
      console.error("[api] unhandled error", error);
      res.status(500).json({
        code: "INTERNAL_ERROR",
        error: "服务器内部错误",
      });
    },
  );

  return app;
}

/**
 * multipart 字段在 Express 中是字符串；重复字段可能变成数组，取第一个。
 * 用正则而不是 Number() 直接转换，避免空字符串被当成 0、科学计数法被接受。
 */
function parseDurationMs(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!POSITIVE_INTEGER.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
