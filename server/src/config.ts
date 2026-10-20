import path from "node:path";

/**
 * 默认把数据库放在 server/data/qc.sqlite。
 *
 * 使用 __dirname 而不是 process.cwd()：
 * - 开发时 __dirname 是 server/src；
 * - 构建后 __dirname 是 server/dist；
 * - 两种情况下向上一级都能得到 server/，因此 DB 路径稳定。
 *
 * 测试或部署时可用 QC_DB_PATH 覆盖；":memory:" 保留给内存测试。
 */
const DEFAULT_DB_PATH = path.resolve(__dirname, "..", "data", "qc.sqlite");

export function getDbPath(): string {
  const configured = process.env.QC_DB_PATH;

  if (configured === undefined || configured === "") {
    return DEFAULT_DB_PATH;
  }

  return configured === ":memory:" ? configured : path.resolve(configured);
}
