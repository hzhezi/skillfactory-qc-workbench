import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { initializeSchema } from "./schema";

export type QcDatabase = Database.Database;

/**
 * 打开并初始化 SQLite 连接。
 *
 * 这里显式设置：
 * - WAL：读写并发更好，崩溃恢复行为更可控；
 * - foreign_keys：确保 qc_segments.run_id 的关联约束生效；
 * - busy_timeout：短暂锁冲突时等待，而不是立刻抛 SQLITE_BUSY。
 *
 * 目录不存在时自动创建，避免首次启动因 data/ 缺失失败。
 */
export function openDatabase(dbPath: string): QcDatabase {
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  initializeSchema(db);

  return db;
}
