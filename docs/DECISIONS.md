# 关键决策记录

本文件记录本项目开发过程中**由用户明确拍板的关键决策**，用于最终提交时的 AI 使用说明与工程判断材料。

## 记录规则

- 只有用户明确表态后才写入；AI 不得代替用户编造选择或理由。
- **AI 的建议不算用户决策**。用户只说「按推荐」时，只能记录为「用户确认了 AI 建议」，不能记为用户自主提出。
- 决策来源必须如实标注：`用户自主提出` / `用户明确确认 AI 建议` / `需求强制`。
- 仅记录涉及架构、技术栈、业务口径、功能取舍的决策；函数命名等实现细节不记录。
- 每条决策必须能对应到后续的验证方式或证据（命令、测试、手工验收结果）。
- 决策变更时保留原记录，并追加变更说明，不直接覆盖历史。
- AI 的默认实现不写入本文件冒充用户选择；统一放在文末「AI 默认实现」区域，便于区分。

## 决策总览

| 编号 | 决策主题 | 来源 | 对交付的实际影响 | 验证 |
| --- | --- | --- | --- | --- |
| D-001 | 后端使用 TypeScript | 用户明确确认 AI 建议 | 前后端统一语言与类型检查，减少双技术栈联调成本 | `pnpm typecheck`、75 个测试 |
| D-002 | 包管理器改用 pnpm | 用户自主提出 | 获得更严格的依赖隔离和 workspace 安装效率；README 明确 pnpm 环境 | 干净副本 `pnpm install --frozen-lockfile` |
| D-003 | 前端视觉参考 phibotics.cn | 用户自主提出 | 形成深色技术风格、紫/橙/薄荷绿状态色与时间轴视觉方向 | 浏览器验收、设计 token、未复制素材 |
| D-004 | 事务内写完后读回报告 | 用户自主提出（代码审查） | POST 响应来自 SQLite 读回结果，避免内存对象与数据库漂移 | 持久化/API 测试、75 个测试 |
| D-005 | 拆分 HTTP 层 | 用户自主提出（代码审查） | `qc/service.ts`、`http/routes.ts`、`http/errorHandler.ts` 落地，职责单一 | API 测试、`pnpm typecheck` |
| D-006 | API 响应运行时校验 | 用户自主提出（代码审查） | 保留手工类型镜像，增加运行时契约校验，降低字段漂移风险 | `apiValidation.test.ts` 4 个测试 |
| D-007 | CSV 导出防公式注入 | 用户自主提出（代码审查） | 以 `= + - @` 开头的文本加 `'` 前缀，降低 Excel 公式执行风险 | `csvExport.test.ts` 3 个测试 |
| D-008 | 测试纳入类型检查 | 用户自主提出（代码审查） | 新增 `tsconfig.test.json`，`pnpm typecheck` 同时检查测试代码 | `pnpm typecheck`、75 个测试 |

## D-001 后端语言：TypeScript

- 日期：2026-10-20
- 决策来源：用户明确确认 AI 建议（在候选中选择 TypeScript）
- 候选方案：
  1. TypeScript
  2. Python
  3. Go
- 用户选择：TypeScript
- 用户理由：与前端统一语言，减少技术栈切换成本（按用户要求简要记录）。

### 为什么这不是一个可有可无的选择

- 前端强制使用 React + TypeScript；后端继续用 TypeScript，可以让 API 类型、字段命名和错误码在两端保持同一套心智模型。
- 后端可以直接复用 TypeScript 的严格类型检查，减少「接口字段写错但运行时才发现」的问题。
- 代价是需要 Node.js 运行时和 TS 工具链；这一点已写入 README 的环境要求。
- 最终代码确实按这个决策落地：服务端是 `.ts`、开启 strict，前后端共用 `pnpm typecheck` 流程。

### 验证与证据

- `pnpm typecheck`：client / server 均通过。
- `pnpm test`：75 个测试通过，包含 API 契约与数据库读写。
- `server/src/**/*.ts`、`server/tsconfig.json`。
- 记录位置：`docs/VERIFICATION.md` Phase 1–3。

## D-002 包管理器：pnpm

- 日期：2026-10-20
- 决策来源：用户自主提出（将 AI 建议的 npm 改为 pnpm）
- 候选方案：
  1. npm
  2. pnpm
  3. yarn
- 用户选择：pnpm
- 用户理由：依赖隔离更严格，workspace 安装效率更高（按用户要求简要记录）。

### 为什么这不是一个可有可无的选择

- pnpm 的 content-addressable store 和严格 `node_modules` 结构，能避免项目误用未声明的依赖（phantom dependency）。
- 本项目是 `client` + `server` 的 workspace；pnpm 的 `--filter` 和共享 lockfile 让根目录脚本更清楚。
- 代价是评测环境需要安装 pnpm；README 已写明 `corepack enable` / `npm install -g pnpm@11.7.0`，并提交了 `pnpm-lock.yaml`。
- 干净副本已经验证 `pnpm install --frozen-lockfile` 可以复现安装与测试。

### 验证与证据

- `pnpm install --frozen-lockfile`：干净副本安装成功。
- `pnpm test`：75 passed。
- `pnpm-lock.yaml`、`pnpm-workspace.yaml`、根 `package.json`。
- 记录位置：`docs/VERIFICATION.md` Phase 7 的干净副本验证。

## D-003 前端视觉参考：phibotics.cn

- 日期：2026-10-20
- 决策来源：用户自主提出
- 候选方案：
  1. 参考费曼智核官网的深色技术风格
  2. 采用常见浅色后台风格
  3. 不做额外视觉设计
- 用户选择：参考 phibotics.cn 的深色技术风格
- 用户理由：用户指定参考该公司官网的 UI 设计。

### 为什么这不是一个可有可无的选择

- 页面不是通用后台模板，而是「QC 工作台」；深色技术风格、细网格和紫/橙点缀让时间轴、错误标签和统计更容易形成统一视觉语言。
- 该决策直接影响了最终设计 token：近黑背景、白色大标题、紫色交互、暖橙无效、薄荷绿有效。
- 同时设定了边界：只借鉴风格，不复制官网 logo、图片、文案或字体文件，避免版权与品牌风险。
- 时间轴、统计卡、报告工具栏和 Segment 表格都按同一套 token 实现。

### 验证与证据

- 浏览器手工验收：上传、统计、筛选、时间轴、导出、刷新恢复。
- `client/src/styles.css` 中的设计 token 与浏览器截图。
- 未引入 phibotics.cn 的静态资源或字体文件。
- 记录位置：`docs/VERIFICATION.md` Phase 4–7。

## D-004 事务内读回报告后再返回

- 日期：2026-10-20
- 决策来源：用户自主提出（代码审查）
- 背景：原 `saveReport()` 写入事务后直接返回内存对象；POST/GET 当前一致，但后端演进时可能出现漂移。
- 用户选择：在事务内完成 write → read back，再提交事务并返回读回结果。
- 用户理由：POST 响应应与 GET 使用同一条数据库读取路径，避免内存对象与 SQLite 不一致。
- 验证方式：`persistence.test.ts` 保存/读回、事务回滚测试；`api.test.ts` POST/GET 一致性；`pnpm test` 75 passed。
- 相关文件：`server/src/db/qcRepository.ts`
- 状态：已完成

## D-005 拆分 HTTP 层

- 日期：2026-10-20
- 决策来源：用户自主提出（代码审查）
- 背景：原 `app.ts` 同时承担路由、校验、编排与错误映射；计划书中的 `qc/service.ts`、`http/routes.ts`、`http/errorHandler.ts` 没有落地。
- 用户选择：按计划拆分：
  - `qc/service.ts`：解析 → 规则 → 保存；
  - `http/routes.ts`：multipart 与路由；
  - `http/errorHandler.ts`：400/404/500 映射；
  - `app.ts`：只组合 router 与 error handler。
- 用户理由：职责单一，便于后续扩展和测试。
- 验证方式：`api.test.ts` 14 个 API 测试、`pnpm typecheck`、75 个测试通过。
- 相关文件：`server/src/app.ts`、`server/src/http/`、`server/src/qc/service.ts`
- 状态：已完成

## D-006 API 响应运行时校验

- 日期：2026-10-20
- 决策来源：用户自主提出（代码审查）
- 背景：前后端类型是手工镜像；API 客户端原来直接 `as T`，新增字段或错误码时容易漂移。
- 用户选择：保留手工类型镜像（避免为小项目引入共享包的构建复杂度），在 `client/src/api/qc.ts` 增加运行时解析与校验。
- 用户理由：类型错误应在边界处立即暴露，而不是带着错误数据渲染。
- 验证方式：`client/tests/apiValidation.test.ts` 覆盖合法报告、未知错误码、统计不一致、非法状态；`pnpm typecheck` 通过。
- 相关文件：`client/src/api/qc.ts`、`client/src/types/qc.ts`
- 状态：已完成

## D-007 CSV 导出防公式注入

- 日期：2026-10-20
- 决策来源：用户自主提出（代码审查）
- 背景：`action`、`segmentId` 等文本若以 `= + - @` 开头，Excel 可能当作公式执行。
- 用户选择：导出时对以 `= + - @ \t \r` 开头的字符串加 `'` 前缀；数值字段不处理。
- 用户理由：本地单用户工具风险低，但加固成本很小，值得做。
- 验证方式：`client/tests/csvExport.test.ts` 新增公式注入用例；`pnpm test` 通过。
- 相关文件：`client/src/utils/csvExport.ts`
- 状态：已完成

## D-008 测试纳入类型检查

- 日期：2026-10-20
- 决策来源：用户自主提出（代码审查）
- 背景：测试原先只由 Vitest 转译，不在 `tsc` 检查范围。
- 用户选择：新增 `server/tsconfig.test.json` 与 `client/tsconfig.test.json`，把 `tests/` 纳入 `pnpm typecheck`。
- 用户理由：测试代码也需要类型保护，避免测试本身悄悄失效。
- 验证方式：`pnpm typecheck` 同时检查 src 与 tests；75 个测试通过。
- 相关文件：`server/tsconfig.test.json`、`client/tsconfig.test.json`、两个 `package.json`
- 状态：已完成

## 其他用户输入（非架构决策）

以下内容由用户提出并已落实，但属于流程、质量或 UI 偏好，不冒充技术架构决策：

- 要求代码带较详细的中文注释，解释「为什么」和边界条件；已体现在 CSV、规则、数据库、刷新恢复等关键代码中。
- 要求先写计划书再编码；见 `docs/PLAN.md`。
- 要求记录关键决策、踩坑与 AI 使用说明；见本文件、`docs/PITFALLS.md`、`docs/AI_USAGE.md`。
- 要求不使用 Docker；README 明确本地 Node + SQLite 运行。
- 要求移除右上角 API 健康状态徽章；已移除前端展示，`GET /api/health` 接口仍保留用于契约和运维检查。
- 指出空白动作应显示为「（空）」；表格现在用 `trim()` 判断显示，但导出和规则判断仍使用原始字符串。
- 确认客户端校验失败时清空旧报告和 URL 是有意的产品行为，用于避免旧结果冒充新结果。
- 本地工具不设置上传大小上限，题目限定 ≤100 条；公网部署时需要另加 `multer` limits。

## AI 默认实现（非用户决策）

以下方案由 AI 建议并默认采用，**没有**被记为用户决策；它们均已实现并通过测试：

| 事项 | 采用方案 | 状态 |
| --- | --- | --- |
| 后端运行时/框架 | Node.js 24 + Express 5 | 已实现 |
| 工程结构 | pnpm workspace：`client` + `server`（pnpm 本身为 D-002） | 已实现 |
| 前端构建 | Vite | 已实现 |
| 前端样式 | 手写 CSS，中文界面（视觉方向为 D-003） | 已实现 |
| CSV 解析 | `csv-parse` + 项目自定义表头/列数校验 | 已实现 |
| multipart | `multer` memoryStorage | 已实现 |
| SQLite 访问 | `better-sqlite3` + 原生 SQL | 已实现 |
| 报告 ID | `qc-<uuid>` | 已实现 |
| 数据库位置 | `server/data/qc.sqlite`，启动自动建表 + `pnpm db:init` | 已实现 |
| 刷新恢复 | URL `?runId=`，浏览器只保存 ID | 已实现 |
| 加分项 | B01 时间轴、B02 CSV 导出、B03 额外边界测试 | 已实现 |
| 测试 | Vitest + Supertest + 临时 SQLite | 已实现 |
| 未公开边界口径 | 见 `docs/PLAN.md` 6.2 / 6.3 | 已实现并测试 |

> 这些是实现默认值，不是用户拍板。若后续需要更换，必须由用户明确选择并追加新的决策记录。
