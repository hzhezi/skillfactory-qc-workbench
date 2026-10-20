import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { QcRepository } from "../db/qcRepository";
import { QcInputError } from "../qc/errorCodes";
import { createQcReport } from "../qc/service";

// 题目文件很小，使用内存存储即可；不需要落临时文件，也不会产生清理问题。
const upload = multer({ storage: multer.memoryStorage() });

// durationMs 只接受十进制正整数文本；前导零允许，正号/小数/科学计数法拒绝。
const POSITIVE_INTEGER = /^\d+$/;

export interface ApiRouterDependencies {
  repo: QcRepository;
}

/**
 * /api 下的路由。
 *
 * 路由层只负责：
 * - 读取 multipart 字段；
 * - 调用 qc/service 完成业务编排；
 * - 把结果或错误交给 app 级 errorHandler。
 */
export function createApiRouter({ repo }: ApiRouterDependencies): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.post(
    "/qc",
    upload.single("file"),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        // 校验顺序与计划书 5.5 一致：文件 -> 时长 -> 空文件 -> CSV/规则。
        const file = req.file;

        if (file === undefined) {
          throw new QcInputError("FILE_REQUIRED", "请上传 CSV 文件（字段名 file）");
        }

        const durationMs = parseDurationMs(req.body?.durationMs);

        if (durationMs === null) {
          throw new QcInputError(
            "INVALID_DURATION",
            "durationMs 必须是正整数（毫秒）",
          );
        }

        const report = createQcReport(repo, {
          csv: file.buffer,
          durationMs,
        });

        // 只有事务提交且读回成功后才会走到这里。
        res.status(200).json(report);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/qc/:runId", (req: Request, res: Response, next: NextFunction) => {
    try {
      const runIdParam = req.params.runId;
      const runId = Array.isArray(runIdParam) ? runIdParam[0] : runIdParam;

      if (runId === undefined || runId === "") {
        res.status(404).json({ code: "REPORT_NOT_FOUND", error: "报告不存在" });
        return;
      }

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

  return router;
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
