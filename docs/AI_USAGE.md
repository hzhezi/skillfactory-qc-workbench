# AI 使用说明

本文件记录本项目使用 AI 的范围、用户参与的关键选择、人工验证方式与证据。
目标不是证明“用了 AI”，而是说明哪些结果被实际检查过。

## 1. 使用的工具

- OpenCode CLI，模型 `deepseek-flash`：代码生成、重构、测试编写、文档草稿。
- pnpm 11.7.0：workspace 依赖管理与脚本调度。
- TypeScript / Vitest / Supertest：类型检查、单元测试、HTTP 集成测试。
- Playwright：浏览器端到端测试；Chrome DevTools MCP：补充手工验收。
- SQLite CLI（`sqlite3`）：检查表结构与落盘数据。

## 2. AI 生成范围

AI 生成了：

- pnpm workspace、React/Vite 与 Express/TypeScript 工程骨架；
- CSV 解析、QC 规则、SQLite schema/repository、三条 HTTP API；
- 前端上传、统计、表格、筛选、错误提示、刷新恢复、时间轴、CSV 导出；
- 服务端与客户端测试、验证文档、README 草稿；
- 用户代码审查后，又按 D-004～D-008 做了事务内读回、HTTP 分层、运行时校验、公式注入防护、测试类型检查。

代码不是一次性生成后直接提交：每个阶段都执行了类型检查、构建和测试，并在浏览器中做了手工验收。真实踩坑与解决记录在 `docs/PITFALLS.md`。

## 3. 用户参与的关键决策

只记录用户明确拍板的事项，详见 `docs/DECISIONS.md`。

| 编号 | 决策 | 来源 | 对交付的影响 | 验证 |
| --- | --- | --- | --- | --- |
| D-001 | 后端使用 TypeScript | 用户明确确认 AI 建议 | 前后端统一语言与类型检查，降低双技术栈联调成本 | `pnpm typecheck`、75 个测试 |
| D-002 | 包管理器使用 pnpm（替代 npm） | 用户自主提出 | 更严格的依赖隔离、workspace 安装效率；需要 README 说明 pnpm 环境 | 干净副本 `pnpm install --frozen-lockfile` |
| D-003 | 前端视觉参考 phibotics.cn | 用户自主提出 | 深色技术风格、紫/橙/薄荷绿状态色、时间轴视觉方向；不复制素材 | 浏览器验收、设计 token |
| D-004 | 事务内读回报告 | 用户自主提出（代码审查） | POST 响应来自 SQLite 读回结果，避免内存对象与数据库漂移 | 持久化/API 测试 |
| D-005 | 拆分 HTTP 层 | 用户自主提出（代码审查） | service / routes / errorHandler 职责分离 | API 测试、typecheck |
| D-006 | API 响应运行时校验 | 用户自主提出（代码审查） | 运行时契约校验；类型镜像随后由 D-009 替代 | `apiValidation.test.ts` |
| D-007 | CSV 导出防公式注入 | 用户自主提出（代码审查） | 危险前缀加 `'` | `csvExport.test.ts` |
| D-008 | 测试纳入类型检查 | 用户自主提出（代码审查） | tests 也由 `tsc` 检查 | `pnpm typecheck` |
| D-009 | 引入 shared workspace 包 | 用户自主提出 | API 类型收敛到 `@skillfactory/shared` | `pnpm typecheck`、build |
| D-010 | 增加 Playwright E2E | 用户自主提出 | 自动覆盖上传、筛选、刷新、导出与失败清空旧结果 | `pnpm test:e2e` 1 passed |

这些决策（D-001～D-010）分别影响后端工具链、依赖安装、类型边界、浏览器验收和视觉语言，属于会被评审直接观察到的工程选择，而不是形式化记录。

以下内容属于 **AI 建议/实现默认值**，不冒充用户决策：

- Node.js + Express 5、Vite、pnpm workspace 结构；
- `csv-parse`、`better-sqlite3`、`multer`、Vitest + Supertest；
- 报告 ID `qc-<uuid>`、URL `?runId=` 刷新恢复；
- B01/B02/B03 全做；
- 题目未明确处的边界口径（见 `docs/PLAN.md` 6.2 / 6.3）。

如果以上默认值与用户后续选择不同，以用户确认结果为准。

## 4. 正确性验证

### 4.1 自动化命令

```bash
pnpm typecheck
pnpm build
pnpm test
```

结果：

- `pnpm typecheck`：shared、client/server 的 src + tests，以及 Playwright e2e 均通过；
- `pnpm build`：client / server 均通过；
- `pnpm test`：**75 passed**（server 68，client 7）；
- `pnpm test:e2e`：1 passed（Playwright，独立 3101/5273 端口和临时 SQLite）。

测试覆盖：

- QC 规则：首尾相接、真正重叠双方标记、完全包含/乱序、空动作 + 重叠、非法范围/越界不参与、多错误顺序、统计不变量；
- CSV：BOM、CRLF、引号逗号、转义引号、列顺序、额外列、重复 ID、空行、引号内换行、数字格式、文件级错误；
- 持久化：保存/读回、顺序、null 时间、重复 ID、两份报告互不覆盖、关闭重开、事务回滚、错误 JSON 损坏；
- API：健康检查、示例报告、400/404/500、文件级错误不建报告、数据库写入失败；
- 重启：真实进程 POST → kill → 重启 → GET，结果一致；
- 导出：完整报告、CSV 转义、公式注入前缀、不包含 BOM 的纯函数输出；
- API 响应运行时校验：合法报告、未知错误码、统计不一致、非法状态。

### 4.2 手工验证

- curl 验证 `GET /api/health`、`POST /api/qc`、`GET /api/qc/{runId}`、404、400；
- 浏览器上传 `server/tests/fixtures/sample-segments.csv`，确认 6 / 2 / 4 与错误码；
- 切换 All / Valid / Invalid，确认统计不变、表格变化；
- 刷新页面，Network 面板确认出现 `GET /api/qc/{runId}` 200；
- 提交缺少表头的 CSV，确认旧报告消失、URL 清空、显示 `MISSING_HEADER`；
- 导出 CSV，确认筛选 Invalid 时仍导出全部 6 条，文件带 UTF-8 BOM。

证据位置：

- `docs/VERIFICATION.md`：分阶段命令、预期结果、实际输出；
- `docs/PITFALLS.md`：真实问题与修复；
- `README.md`：T01–T15 验收表。

## 5. 已知限制

- E2E 首次运行需要安装 Playwright Chromium；未安装时 `pnpm test:e2e` 会失败。
- 时间轴不绘制时间无法解析的 Segment，只显示无法定位数量。
- 重叠检查 O(n²)，面向题目限定的 ≤100 条记录。
- 未实现报告历史列表、登录、视频播放；题目不要求。
- 未公开的边界口径由项目自行定义，可能与其他实现不同；以题目公开规则为准。
