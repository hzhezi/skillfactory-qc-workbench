import { getDbPath } from "../config";
import { openDatabase } from "./connection";

// 显式初始化命令：只创建表和目录，不写入任何报告。
// 服务启动时也会自动初始化，因此这个命令是幂等的，主要用于 README 中的手工验收。
const dbPath = getDbPath();
const db = openDatabase(dbPath);
db.close();

console.log(`[db] initialized ${dbPath}`);
