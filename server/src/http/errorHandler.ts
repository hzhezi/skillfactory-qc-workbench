import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { QcInputError } from "../qc/errorCodes";

/**
 * 统一错误映射。
 *
 * - 业务输入错误 -> 400 + 固定 code；
 * - multer 字段名/文件数量错误 -> 400 FILE_REQUIRED；
 * - 其他异常（数据库、程序 bug）-> 500 INTERNAL_ERROR，不泄漏内部细节。
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof QcInputError) {
    res.status(400).json({ code: error.code, error: error.message });
    return;
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({
      code: "FILE_REQUIRED",
      error: "请使用 file 字段上传 CSV 文件",
    });
    return;
  }

  console.error("[api] unhandled error", error);
  res.status(500).json({
    code: "INTERNAL_ERROR",
    error: "服务器内部错误",
  });
}
