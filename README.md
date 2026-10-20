# SkillFactory Lite — Video Segmentation QC

一个本地可运行的视频分段质量检查（QC）工作台：

- 上传分段 CSV、填写视频总时长（毫秒）；
- 后端解析 CSV，执行时间范围、视频边界、空动作、片段重叠四条规则；
- 报告与每条 Segment 写入本地 SQLite；
- 前端展示统计、All / Valid / Invalid 筛选、时间轴，并支持导出完整 CSV；
- 刷新页面后凭 URL 中的 `runId` 从 SQLite 重新读取报告。

> 本项目不使用视频文件、登录系统、对象存储或云服务。所有 QC 结果来自真实后端与本地 SQLite。

## 技术栈与版本

本机验证环境：

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 运行时 | Node.js | 24.14.1（要求 >= 22） |
| 包管理 | pnpm | 11.7.0 |
| 前端 | React + TypeScript | 19.3.1 / 7.0.2 |
| 前端构建 | Vite | 8.3.4 |
| 后端 | Node.js + Express + TypeScript | 5.3.0 |
| SQLite 驱动 | better-sqlite3 | 13.0.3 |
| CSV 解析 | csv-parse | 7.0.3 |
| multipart | multer | 2.4.0 |
| 测试 | Vitest + Supertest | 5.0.5 / 7.3.1 |
| 样式 | 手写 CSS | — |

版本以 `package.json` 的依赖范围和提交的 `pnpm-lock.yaml` 为准。

## 环境要求

- Node.js **>= 22**（本项目在 Node 24.14.1 验证）。
- pnpm **11.x**。
- 首次安装 `better-sqlite3` 可能需要本机编译工具：
  - macOS：Xcode Command Line Tools；
  - Linux：`python3`、`make`、`g++`。
- 不使用 Docker。题目不要求容器化，本地 Node + SQLite 文件即可运行。

如果本机没有 pnpm：

```bash
corepack enable
# 或
npm install -g pnpm@11.7.0
```

## 安装

所有命令都在仓库根目录执行：

```bash
cd skillfactory-qc-workbench
pnpm install
```

需要严格按锁文件安装时：

```bash
pnpm install --frozen-lockfile
```

## 数据库初始化

默认数据库文件：

```text
server/data/qc.sqlite
```

首次启动后端会自动创建目录、数据库和两张表；也可以显式执行：

```bash
pnpm db:init
```

检查表：

```bash
sqlite3 server/data/qc.sqlite ".tables"
# qc_runs     qc_segments
```

可选环境变量：

```bash
QC_DB_PATH=/tmp/qc.sqlite pnpm dev
```

`server/data/`、`*.db`、`*.sqlite` 已加入 `.gitignore`，不会提交运行时数据库。

## 启动

```bash
pnpm dev
```

- 前端：<http://localhost:5173>
- 后端：<http://localhost:3001>
- 健康检查：<http://localhost:3001/api/health>

> 请使用 `localhost`，不要用 `127.0.0.1`。Vite 在本机默认绑定 IPv6 `[::1]`，访问 `127.0.0.1:5173` 可能被拒绝（见 `docs/PITFALLS.md` P-006）。

也可以分别启动：

```bash
pnpm dev:server
pnpm dev:client
```

停止：在 `pnpm dev` 终端按 `Ctrl+C`。

生产构建：

```bash
pnpm build
pnpm --filter server start
```

`pnpm build` 会生成 `client/dist` 与 `server/dist`。本地验收建议使用 `pnpm dev`，因为 Vite 开发代理负责把 `/api` 转发到 3001。

## 测试

```bash
pnpm test
pnpm typecheck
pnpm build
```

当前结果：

- 测试文件：server 5 个 + client 1 个；
- 测试用例：**70 passed**（server 68，client 2）。

单独运行：

```bash
pnpm --filter server test
pnpm --filter client test

# 只跑 QC 规则 / 持久化
pnpm --filter server exec vitest run tests/qc.rules.test.ts
pnpm --filter server exec vitest run tests/persistence.test.ts
```

测试数据库使用 `mkdtempSync` 创建的临时 SQLite 文件，不污染 `server/data/qc.sqlite`。

## API

### `GET /api/health`

```bash
curl -i http://localhost:3001/api/health
```

```json
{ "status": "ok" }
```

### `POST /api/qc`

`multipart/form-data`，字段固定：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `file` | File | 分段 CSV |
| `durationMs` | String | 正整数毫秒 |

```bash
curl -i \
  -F "file=@server/tests/fixtures/sample-segments.csv" \
  -F "durationMs=10000" \
  http://localhost:3001/api/qc
```

成功返回 HTTP 200，包含 `runId`、`createdAt`、统计和全部 Segment。示例 CSV 的结果为：

```text
total = 6
valid = 2
invalid = 4
errors = [[], [OVERLAP], [OVERLAP], [OUT_OF_BOUNDS], [EMPTY_ACTION], []]
```

### `GET /api/qc/{runId}`

```bash
curl -i http://localhost:3001/api/qc/<runId>
```

- 找到：HTTP 200，结构与 POST 成功响应一致；
- 不存在：HTTP 404，`{ "code": "REPORT_NOT_FOUND", "error": "报告不存在" }`。

### 错误码

| 场景 | HTTP | `code` |
| --- | ---: | --- |
| 缺少 `file` 字段 | 400 | `FILE_REQUIRED` |
| 文件为空 | 400 | `EMPTY_FILE` |
| CSV 结构错误 | 400 | `INVALID_CSV` |
| 缺少必要表头 | 400 | `MISSING_HEADER` |
| 只有表头、没有数据 | 400 | `NO_RECORDS` |
| `durationMs` 非法 | 400 | `INVALID_DURATION` |
| 报告不存在 | 404 | `REPORT_NOT_FOUND` |
| 服务端/数据库错误 | 500 | `INTERNAL_ERROR` |

文件级/请求级错误不会创建报告。片段级错误（时间非法、越界、空动作、重叠）仍返回 200，并保存完整报告。

## QC 规则摘要

时间区间统一为左闭右开 `[start_ms, end_ms)`：

- `INVALID_RANGE`：时间无法解析，或 `start_ms < 0`，或 `end_ms <= start_ms`；
- `OUT_OF_BOUNDS`：时间范围合法，但 `end_ms > durationMs`；
- `EMPTY_ACTION`：`action.trim()` 为空；
- `OVERLAP`：与另一条时间合法且未越界的 Segment 相交，双方都标记；首尾相接不算。

错误数组固定顺序：`INVALID_RANGE` → `OUT_OF_BOUNDS` → `EMPTY_ACTION` → `OVERLAP`。
完整边界口径见 `docs/PLAN.md` 第 6.2 / 6.3 节。

## 前端行为

- 选择 CSV、填写时长、点击「开始检查」；
- 请求期间显示 Loading 并禁用提交；
- 展示 total / valid / invalid、Segment 表格、错误说明；
- All / Valid / Invalid 只过滤表格，不改变统计、不重新请求；
- 成功后把 `runId` 写入 URL query，刷新时调用 `GET /api/qc/{runId}`；
- 新请求开始时清空旧报告；失败时不会显示上一份结果；
- B01 时间轴按比例展示片段位置，有效/无效用颜色区分，越界片段截断标记；
- B02 导出完整报告 CSV，不受筛选影响，带 UTF-8 BOM。

## 验收清单（T01–T15）

验证日期：2026-10-20。

| ID | 场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| T01 | `GET /api/health` | ✅ | `server/tests/api.test.ts`；curl 200 |
| T02 | 示例 CSV 2 valid / 4 invalid | ✅ | `csv.test.ts`、`api.test.ts` |
| T03 | 首尾相接不重叠 | ✅ | `qc.rules.test.ts` |
| T04 | 乱序 + 完全包含，双方标记 | ✅ | `qc.rules.test.ts` |
| T05 | 空动作 + 重叠 | ✅ | `qc.rules.test.ts`、`api.test.ts` |
| T06 | 非整数 / 负数 / `end <= start` | ✅ | `qc.rules.test.ts`、`api.test.ts` |
| T07 | 合法但越界，不参与重叠 | ✅ | `qc.rules.test.ts`、`api.test.ts` |
| T08 | 重复 `segment_id` 分别保存 | ✅ | `persistence.test.ts`、`api.test.ts` |
| T09 | 引号内逗号 / 转义双引号 | ✅ | `csv.test.ts` |
| T10 | 六种 400 错误，不创建报告 | ✅ | `api.test.ts` |
| T11 | 按 `runId` 读取完整报告 | ✅ | `api.test.ts`、`persistence.test.ts` |
| T12 | 真实进程重启后仍能读取 | ✅ | `restart.test.ts`（spawn → kill → restart） |
| T13 | 连续两份报告互不覆盖 | ✅ | `api.test.ts`、`persistence.test.ts` |
| T14 | 前端检查、筛选、刷新恢复 | ✅ | 浏览器手工验收；刷新 Network 出现 `GET /api/qc/{runId}` 200 |
| T15 | README 测试命令可运行 | ✅ | `pnpm test`：70 passed |

## 加分项

| 编号 | 状态 | 说明 |
| --- | --- | --- |
| B01 时间轴 | ✅ | 按 `durationMs` 比例展示；有效薄荷绿、无效/越界橙色；越界截断标记 |
| B02 导出 CSV | ✅ | 导出完整报告，不受筛选影响；含 BOM、正确转义 |
| B03 额外边界测试 | ✅ | 完全包含/乱序、多错误组合、重启读取、重复 ID、引号 CSV、事务回滚 |

## AI 开发记录

- 使用工具：OpenCode CLI（模型 `deepseek-flash`）、pnpm、Vitest、Supertest、Chrome DevTools MCP。
- AI 生成范围：工程骨架、后端 CSV/QC/持久化/API、前端页面与样式、测试、文档草稿。
- 用户参与的关键选择（详见 `docs/DECISIONS.md`）：

| 决策 | 来源 | 对交付的实际影响 |
| --- | --- | --- |
| D-001 后端使用 TypeScript | 用户确认候选方案 | 前后端统一语言与类型检查，降低双技术栈联调成本 |
| D-002 包管理器改用 pnpm | 用户自主提出 | 严格依赖隔离 + workspace 安装效率；README 明确 pnpm 环境 |
| D-003 视觉参考 `phibotics.cn` | 用户自主提出 | 形成深色技术风格、紫/橙/薄荷绿状态色与时间轴视觉方向；未复制素材 |

这三项决策分别约束了后端工具链、依赖安装方式和视觉语言，不是装饰性选择。
- 正确性如何检查：
  - `pnpm typecheck`、`pnpm build`；
  - `pnpm test`：70 个测试，含 QC 规则、持久化、API 契约、真实进程重启；
  - curl 手工验证 POST / GET / 404 / 400；
  - 浏览器上传示例 CSV、切换筛选、刷新页面并检查 Network 的 `GET /api/qc/{runId}`；
  - 导出 CSV 后检查 BOM、行数与转义。
- 详细证据：`docs/VERIFICATION.md`；真实踩坑：`docs/PITFALLS.md`。
- AI 建议的方案（Node/Express、csv-parse、better-sqlite3 等）属于实现默认值，不冒充用户决策；用户决策记录只包含 D-001～D-003。

更完整的 AI 使用说明见 `docs/AI_USAGE.md`。

## 项目结构

```text
.
├── client/                 # React + TypeScript + Vite
│   ├── src/api/            # POST / GET 客户端
│   ├── src/components/     # 上传、统计、表格、筛选、时间轴、导出
│   ├── src/types/          # API 类型
│   └── src/utils/          # 格式化与 CSV 导出
├── server/                 # Express + TypeScript
│   ├── src/qc/             # CSV 解析、QC 规则、类型、错误码
│   ├── src/db/             # SQLite schema、连接、repository、init
│   ├── src/http 相关       # app.ts 路由与错误处理
│   └── tests/              # 规则、CSV、持久化、API、重启测试
├── docs/
│   ├── PLAN.md             # 计划书与边界口径
│   ├── DECISIONS.md        # 用户关键决策
│   ├── PITFALLS.md         # 真实踩坑与解决
│   ├── VERIFICATION.md     # 每阶段验证命令、预期与实际证据
│   └── AI_USAGE.md         # AI 工具、生成范围、人工验证
├── AGENTS.md               # 协作规范
└── README.md
```

## 完成情况与已知问题

已完成：

- 必做：CSV 解析、四条 QC 规则、SQLite 持久化、三条固定 API、React 页面、All/Valid/Invalid 筛选、刷新恢复、70 个自动化测试；
- 加分：B01 时间轴、B02 CSV 导出、B03 额外边界测试。

已知限制：

- 不做登录、权限、视频播放/解码、报告历史列表、编辑/删除、分页。
- 重叠检查为 O(n²)，面向题目限定的 ≤100 条记录；不承诺大文件性能。
- 没有自动化浏览器 E2E；T14 为手工验收，但已记录 Network 请求证据。
- 使用 `history.replaceState`，浏览器后退不会回到上一份报告。
- 404 的 `runId` 会保留在 URL 中，刷新仍显示 404；这是为了保留可复现链接。
- 未公开的边界口径按 `docs/PLAN.md` 第 6.2 / 6.3 节实现；若评测有不同解释，以题目公开规则为准。
- `better-sqlite3` 是原生模块，首次安装可能需要本机编译工具；Node 版本需 >=22。

## 文档

- [实施计划](docs/PLAN.md)
- [关键决策](docs/DECISIONS.md)
- [问题与解决方案](docs/PITFALLS.md)
- [验证记录](docs/VERIFICATION.md)
- [AI 使用说明](docs/AI_USAGE.md)

## License

MIT，见根目录 `LICENSE`。
