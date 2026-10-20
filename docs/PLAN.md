# SkillFactory Lite — 实施计划书

- 版本：v0.8
- 日期：2026-10-20
- 状态：**Phase 6 已完成并验证；Phase 7 待开始**
- 需求来源：`题目要求.md`
- 协作规范：`AGENTS.md`
- 已确认决策：`docs/DECISIONS.md`（D-001 TypeScript、D-002 pnpm、D-003 视觉参考）
- 验证记录：`docs/VERIFICATION.md`

## 0. 标记说明

为避免把 AI 建议当成用户决策，本计划使用以下标记：

- ✅ **已确认**：用户已明确拍板，记录在 `docs/DECISIONS.md`。
- 📌 **需求强制**：来自题目要求，不能自行更改。
- 💡 **AI 建议（待确认）**：计划采用的默认方案，需用户在评审时确认或修改；确认后才写入决策记录。
- ⚠️ **边界口径（待确认）**：题目未完全明确的细节，先按建议执行，验收前需用户确认。

本计划中的技术方案除已确认项外，均不视为用户决策。

## 1. 目标与范围

### 1.1 必做闭环

1. 浏览器选择 CSV、输入视频总时长（毫秒）。
2. 前端调用真实后端 `POST /api/qc`。
3. 后端解析 CSV，逐条执行 QC，返回统计与 Segment 结果。
4. 后端在返回成功前，把报告和每条 Segment 写入磁盘 SQLite。
5. 前端展示统计、Segment 列表和 All / Valid / Invalid 筛选。
6. 页面刷新后，前端只凭 `runId` 调用 `GET /api/qc/{runId}`，从数据库恢复报告。

### 1.2 明确不做

- 不做视频上传、播放、解码或 AI 推理。
- 不做登录、租户、权限、对象存储、消息队列、Docker、公网部署。
- 不做报告编辑、删除、分页、完整历史列表（除非后续明确加）。
- 不用静态 Mock、内存数据或浏览器本地存储冒充后端与数据库。

### 1.3 加分项（💡 建议全做，待确认）

- B01 时间轴可视化（2 分）
- B02 导出当前完整报告 CSV（2 分）
- B03 额外边界测试（1 分）

## 2. 技术选型

| 层 | 选择 | 状态 | 理由 |
| --- | --- | --- | --- |
| 前端框架 | React + TypeScript | 📌 需求强制 | 题目硬性要求 |
| 前端构建 | Vite | 💡 待确认 | 启动快、配置少，适合单页应用 |
| 前端样式 | 手写 CSS；深色技术风格，参考 phibotics.cn | 💡 待确认 | 不引入额外 UI 依赖，信息密度可控 |
| 后端语言 | TypeScript | ✅ D-001 | 与前端统一语言 |
| 后端运行时 | Node.js 24（本机 24.14.1） | 💡 待确认 | 与 TS 生态一致，环境已验证 |
| 后端框架 | Express 5 | 💡 待确认 | 路由与中间件简单，multipart 方案成熟 |
| 包管理器 | pnpm（本机 11.7.0） | ✅ D-002 | 依赖隔离严格、workspace 安装效率高 |
| 工程结构 | pnpm workspace：`client` + `server` | 💡 待确认 | 前后端同仓，脚本统一 |
| 开发联调 | Vite proxy `/api` → `http://localhost:3001` | 💡 待确认 | 开发期不需要 CORS |
| 端口 | 前端 5173，后端 3001 | 💡 待确认 | Vite 默认端口 + 固定后端端口，写入 README |
| CSV 解析 | `csv-parse` | 💡 待确认 | 正确处理 BOM、引号、逗号、转义引号、换行 |
| multipart | `multer`（memoryStorage） | 💡 待确认 | 与 Express 集成简单 |
| SQLite 访问 | `better-sqlite3` + 原生 SQL | 💡 待确认 | 同步 API、事务直观、依赖少 |
| 报告 ID | `qc-${crypto.randomUUID()}` | 💡 待确认 | 非空、唯一、URL 安全 |
| 测试 | Vitest + Supertest + 临时 SQLite 文件 | 💡 待确认 | 与 Vite/TS 生态一致，可测 HTTP 层 |
| 类型检查 | `tsc --noEmit`，strict | 💡 待确认 | 提前发现类型问题 |

> 依赖版本在安装时锁定，提交 `pnpm-lock.yaml`；README 记录实际版本。

## 3. 目录结构

```text
skillfactory-qc-workbench/
├── AGENTS.md
├── README.md
├── package.json                 # 根脚本：dev / build / test / typecheck / db:init
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .gitignore                   # node_modules、dist、*.db、*.sqlite、data/
├── docs/
│   ├── PLAN.md                  # 本计划书
│   ├── DECISIONS.md
│   ├── PITFALLS.md
│   ├── VERIFICATION.md          # 每阶段验证命令、预期与实际证据
│   └── AI_USAGE.md              # 交付前补充
├── client/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts           # /api 代理到 3001
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/qc.ts            # POST /api/qc、GET /api/qc/:runId
│       ├── types/qc.ts          # API 响应与 Segment 类型
│       ├── components/
│       │   ├── UploadForm.tsx
│       │   ├── SummaryStats.tsx
│       │   ├── FilterBar.tsx
│       │   ├── SegmentTable.tsx
│       │   ├── SegmentTimeline.tsx   # B01
│       │   ├── ErrorBanner.tsx
│       │   ├── EmptyState.tsx
│       │   └── Loading.tsx
│       ├── utils/csvExport.ts   # B02
│       └── styles.css
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts             # 启动入口：初始化 DB，监听 3001
│   │   ├── app.ts               # createApp()，便于 Supertest
│   │   ├── config.ts            # 端口、DB 路径
│   │   ├── qc/
│   │   │   ├── types.ts         # Segment、错误码、报告类型
│   │   │   ├── errorCodes.ts    # 固定错误码常量
│   │   │   ├── csv.ts           # CSV 解析 + 文件级校验
│   │   │   ├── rules.ts         # 纯函数 QC 规则
│   │   │   └── service.ts       # 解析 → QC → 保存 → 返回
│   │   ├── db/
│   │   │   ├── connection.ts    # 打开 SQLite、PRAGMA
│   │   │   ├── schema.ts        # CREATE TABLE IF NOT EXISTS
│   │   │   └── qcRepository.ts  # 报告/ Segment 读写
│   │   └── http/
│   │       ├── routes.ts        # 三条固定 API
│   │       └── errorHandler.ts  # 400 / 404 / 500 JSON
│   ├── tests/
│   │   ├── csv.test.ts
│   │   ├── qc.rules.test.ts
│   │   ├── persistence.test.ts
│   │   ├── api.test.ts
│   │   └── fixtures/            # 样例 CSV
│   └── data/                    # 运行时 DB，gitignore
└── scripts/                     # 如需要，放 db 初始化辅助脚本
```

## 4. 数据模型

### 4.1 表结构（💡 建议）

```sql
CREATE TABLE IF NOT EXISTS qc_runs (
  id          TEXT PRIMARY KEY,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  total       INTEGER NOT NULL CHECK (total >= 0),
  valid       INTEGER NOT NULL CHECK (valid >= 0),
  invalid     INTEGER NOT NULL CHECK (invalid >= 0),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qc_segments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES qc_runs(id) ON DELETE CASCADE,
  row_index   INTEGER NOT NULL,
  segment_id  TEXT NOT NULL,
  start_ms    INTEGER,
  end_ms      INTEGER,
  action      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('VALID', 'INVALID')),
  errors_json TEXT NOT NULL,
  UNIQUE (run_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_qc_segments_run_id
  ON qc_segments (run_id, row_index);
```

### 4.2 字段映射

| API 字段 | 数据库字段 | 处理 |
| --- | --- | --- |
| `runId` | `qc_runs.id` | TEXT，主键 |
| `durationMs` | `qc_runs.duration_ms` | 正整数 |
| `total` / `valid` / `invalid` | 同名列 | 统计值 |
| `createdAt` | `qc_runs.created_at` | ISO 8601，UTC，带 `Z` |
| `rowIndex` | `qc_segments.row_index` | 从 1 开始 |
| `segmentId` | `qc_segments.segment_id` | 原始字符串，允许重复 |
| `startMs` / `endMs` | `qc_segments.start_ms` / `end_ms` | 可空整数；无法解析存 NULL |
| `action` | `qc_segments.action` | 原始字符串，保留空白 |
| `status` | `qc_segments.status` | `VALID` / `INVALID` |
| `errors` | `qc_segments.errors_json` | JSON 数组文本 |

### 4.3 事务与初始化（💡 建议）

- 启动时执行 `CREATE TABLE IF NOT EXISTS`，并设置 `PRAGMA foreign_keys = ON`、`journal_mode = WAL`、`busy_timeout = 5000`。
- 默认 DB 路径：`server/data/qc.sqlite`；可用环境变量 `QC_DB_PATH` 覆盖，测试使用临时文件。
- `pnpm db:init` 提供显式初始化命令；启动时也自动初始化，二者幂等。
- 保存流程：一个事务内先插入 `qc_runs`，再逐条插入 `qc_segments`；全部成功提交后才返回 HTTP 200。
- 任一条写入失败 → 回滚 → 返回 500，不返回假成功。
- `errors` 以 JSON 文本保存，读取时解析并校验为数组；无错误存 `[]`。
- 不使用 `segment_id` 唯一约束，重复 ID 必须分别保存。

## 5. API 契约

### 5.1 `GET /api/health`

成功：HTTP 200

```json
{ "status": "ok" }
```

### 5.2 `POST /api/qc`

`multipart/form-data`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `file` | File | CSV 文件 |
| `durationMs` | String | 正整数毫秒 |

成功：HTTP 200，返回完整报告：

```json
{
  "runId": "qc-...",
  "createdAt": "2026-10-20T12:00:00.000Z",
  "durationMs": 10000,
  "total": 6,
  "valid": 2,
  "invalid": 4,
  "segments": [
    {
      "rowIndex": 1,
      "segmentId": "s1",
      "startMs": 0,
      "endMs": 2000,
      "action": "Pick up cup",
      "status": "VALID",
      "errors": []
    }
  ]
}
```

### 5.3 `GET /api/qc/{runId}`

- 找到：HTTP 200，结构与 `POST` 成功响应一致，数据来自 SQLite。
- 不存在：HTTP 404

```json
{ "code": "REPORT_NOT_FOUND", "error": "报告不存在" }
```

### 5.4 错误响应

文件级 / 请求级错误：HTTP 400，`{ code, error }`。

| 场景 | `code` |
| --- | --- |
| 缺少 `file` | `FILE_REQUIRED` |
| 文件为空 | `EMPTY_FILE` |
| CSV 结构错误 | `INVALID_CSV` |
| 缺少必要表头 | `MISSING_HEADER` |
| 只有表头 | `NO_RECORDS` |
| `durationMs` 非法 | `INVALID_DURATION` |

服务端内部错误（如数据库写入失败）：HTTP 500

```json
{ "code": "INTERNAL_ERROR", "error": "服务器内部错误" }
```

### 5.5 校验顺序（⚠️ 建议固定）

同一请求可能同时触发多个错误时，按以下顺序返回第一个：

1. 缺少 `file` → `FILE_REQUIRED`
2. `durationMs` 缺失 / 非整数 / ≤ 0 → `INVALID_DURATION`
3. 文件内容为空（0 字节或仅 BOM / 空白）→ `EMPTY_FILE`
4. CSV 结构错误（引号未闭合、列数不一致等）→ `INVALID_CSV`
5. 缺少必要表头 → `MISSING_HEADER`
6. 只有表头没有数据记录 → `NO_RECORDS`

题目允许同时触发多个错误时返回任一适用错误，固定顺序只是为了实现和测试可复现。

## 6. CSV 解析策略

### 6.1 解析流程（💡 建议）

1. 读取上传文件为 Buffer / UTF-8 文本。
2. 处理 UTF-8 BOM。
3. 使用 `csv-parse` 解析，保留字段原文，不使用「按逗号 split」。
4. 空白行处理：忽略真正的空行与仅含空白字符的行；引号内的换行不当作行分隔。
5. 第一行作为表头；必需列名为 `segment_id,start_ms,end_ms,action`，大小写敏感。
6. 四列顺序任意；允许额外列；只处理必需列。
7. 每条数据记录的字段数必须与表头一致，否则 `INVALID_CSV`。
8. 逐条映射；`segment_id`、`action` 保留原始字符串。
9. `start_ms`、`end_ms` 去掉首尾空白后按十进制整数解析；失败则为 `null` 并产生 `INVALID_RANGE`。
10. 按数据记录顺序生成 `rowIndex`（从 1 开始）。

### 6.2 边界口径（⚠️ 待确认）

| 场景 | 建议处理 |
| --- | --- |
| 空文件 / 仅 BOM / 仅空白 | `EMPTY_FILE` |
| 只有表头 | `NO_RECORDS` |
| 表头缺列 | `MISSING_HEADER` |
| 必需表头重复 | `INVALID_CSV`（映射歧义） |
| 额外表头重复 | 忽略额外列，不影响 |
| 表头前后空格 | 不做 trim，按原始列名匹配 |
| 中间空白行 | 忽略 |
| 行内只有逗号（如 `,,,`） | 作为数据记录，时间为空 → `INVALID_RANGE` |
| 引号内逗号 / 转义双引号 | 正确解析，保留原始 `action` |
| 引号内换行 | 支持 |
| 整数格式 | trim 后匹配 `^-?\d+$`；拒绝 `+1`、`1.0`、`1e3`、空 |
| `durationMs` | trim 后匹配 `^\d+$` 且 > 0 |
| 非法 UTF-8 | 宽松替换，不额外报错 |
| 文件大小 | 不额外限制（题目 ≤ 100 条） |
| 超大整数 | 超出 JS 安全整数范围不在验收范围，按 Number 解析 |

### 6.3 补充边界（Phase 1 覆盖，💡 实现口径）

题目没有逐条列出的情况，先按以下口径处理；其中影响业务判断的，在 Phase 1 测试中固定下来。

**CSV / 文本**

- 空 `segment_id`：允许并保留空字符串；题目没有要求 ID 非空。
- 纯空白 `action`：`trim()` 后为空 → `EMPTY_ACTION`；返回时仍保留原始字符串。
- 无结尾换行、LF/CRLF 混用：正常解析。
- 前导空行：忽略，第一条非空记录作为表头。
- 中间空行：忽略；但 `,,,` 这类只有分隔符的行是数据行，按 4 个空字段处理。
- 引号内换行：支持；不增加 `rowIndex`。
- 引号内 CRLF：作为 `action` 原文保留，显示和导出时再处理换行。
- 未闭合引号、引号后多余字符、字段数与表头不一致：`INVALID_CSV`。
- 必需表头重复：`INVALID_CSV`；额外表头重复：忽略额外列。
- 表头前后空格：不 trim；` segment_id` 不等于 `segment_id`，按缺表头处理。
- 数字带引号（如 `"100"`）：按 CSV 语法解析后得到整数。
- 文件只有 BOM / 空白：`EMPTY_FILE`；只有表头：`NO_RECORDS`。
- 非 UTF-8、GBK、分号分隔、CR-only：不在验收范围；不额外做编码探测和分隔符推断。
- 超大文件 / 超长字段：题目限定 ≤ 100 条，不做流式处理。

**数字**

- `+1`、`1.0`、`1e3`、`0x10`、`Infinity`、`NaN`、全角数字：`INVALID_RANGE`。
- `-0` 解析为 0；前导零允许，如 `0007`。
- 一侧可解析、另一侧不可解析：`INVALID_RANGE`；API 中不可解析的一侧为 `null`。
- `start=0,end=0`、`end<start`、`start<0`：`INVALID_RANGE`。
- `start=duration,end=duration+1`：范围合法但越界 → `OUT_OF_BOUNDS`。
- 超出 JS 安全整数：按 Number 解析，不承诺精度（题目未要求）。
- `durationMs`：trim 后正整数；`010000` 接受；`+10000`、`1e4`、`0`、负数、空、小数拒绝。
- 多个 `durationMs` 字段：取第一个；不在验收范围。

**重叠**

- 完全相同的区间：双方都标记 `OVERLAP`。
- 链式重叠：每条记录只出现一次 `OVERLAP`。
- 一条记录与多条记录重叠：该错误代码仍只出现一次。
- 首尾相接不算；零长度先判 `INVALID_RANGE`，不参与重叠。
- 重复 `segment_id` 按两条独立记录参与重叠。
- 空动作但时间合法：仍参与重叠；越界片段不参与。

**API / 持久化**

- `file` 字段存在但文件名为空：按内容判断，空内容 → `EMPTY_FILE`。
- 多个 `file` 字段：取第一个，不在验收范围。
- 非 multipart 请求：按 400 处理，返回 `FILE_REQUIRED` 或 `INVALID_CSV`。
- 数据库只读、磁盘满、锁冲突：500 `INTERNAL_ERROR`，不能假成功。
- `runId` 冲突：UUID 概率极低；主键冲突返回 500，不覆盖旧报告。
- `start_ms` / `end_ms` 为 `null` 的 Segment 必须原样读回。
- `errors_json` 损坏：读取时报 500，不返回半份错误数据。

**前端**

- 重复选择同一个文件：提交后重置 `<input type="file">` 的 value，保证能再次触发 change。
- 双击提交：loading 时禁用按钮。
- URL 中有多个 `runId`：取第一个；空值按无报告处理。
- 刷新时 GET 404：显示错误，不显示旧报告。
- 旧请求晚于新请求返回：丢弃旧响应。
- 导出：`action` 含逗号、引号、换行时正确转义；导出全量，不受筛选影响。
- XSS：React 默认转义 `action`，不使用 `dangerouslySetInnerHTML`。
- 时间轴：时间为 `null` 或 `end <= start` 不画条；越界条截断并标记；极短片段保持最小可见宽度。
- 状态不能只靠颜色区分。


## 7. QC 规则实现策略

### 7.1 判定顺序

对每条 Segment：

1. **时间范围 `INVALID_RANGE`**：时间无法解析，或 `start_ms < 0`，或 `end_ms <= start_ms`。
2. **视频边界 `OUT_OF_BOUNDS`**：仅当时间范围合法，且 `end_ms > durationMs`。
3. **动作名称 `EMPTY_ACTION`**：`action.trim() === ""`，与时间是否合法无关。
4. **片段重叠 `OVERLAP`**：仅当时间范围合法且未越界时参与检查。

互斥与共存：

- `INVALID_RANGE` 与 `OUT_OF_BOUNDS` 互斥。
- `INVALID_RANGE` / `OUT_OF_BOUNDS` 不影响 `EMPTY_ACTION`。
- 合法且未越界的空动作 Segment 仍参与重叠检查，可同时拥有 `EMPTY_ACTION` 和 `OVERLAP`。
- 错误去重，按固定顺序：`INVALID_RANGE` → `OUT_OF_BOUNDS` → `EMPTY_ACTION` → `OVERLAP`。

### 7.2 重叠算法（💡 建议）

- 左闭右开：`a.start < b.end && b.start < a.end` 才算重叠；首尾相接不算。
- 只对「时间范围合法且 `end_ms <= durationMs`」的 Segment 两两检查。
- 数据量 ≤ 100，使用 O(n²) 双重循环；命中时给双方都加入 `OVERLAP` 一次。
- 完全包含、乱序输入均自然覆盖；输入顺序不影响判定，输出仍按 `rowIndex`。
- 不使用排序后合并的复杂算法，优先保证可读性与正确性。

### 7.3 统计

- `total = segments.length`
- `valid = status === "VALID"` 数量
- `invalid = status === "INVALID"` 数量
- 必须满足 `valid + invalid = total`。

## 8. 后端实现方案

### 8.1 分层

- `qc/csv.ts`：纯解析与文件级校验，不碰数据库。
- `qc/rules.ts`：纯函数，输入 Segment 数组 + duration，输出带错误的结果。
- `qc/service.ts`：编排解析 → QC → 保存 → 响应。
- `db/qcRepository.ts`：只负责 SQL 读写与事务。
- `http/routes.ts`：只负责 HTTP 输入校验与响应映射。
- `app.ts` 导出 `createApp({ dbPath })`，测试可注入临时 DB。

### 8.2 错误处理

- 业务错误使用统一类 / 判别联合，携带 `code` 与 HTTP 状态。
- 400 错误不写数据库。
- 数据库异常捕获后记录日志，返回 500 `INTERNAL_ERROR`。
- 不把 SQL 错误、文件路径等内部细节返回给前端。

### 8.3 日志

- 启动时打印端口与 DB 路径。
- 每个成功报告打印 `runId`、`total`、`valid`、`invalid`。
- 错误打印 `code` 与原因；不打印完整 CSV 内容。

## 9. 前端实现方案

### 9.1 页面状态

```text
report: QcReport | null
loading: boolean
error: { code: string; message: string } | null
filter: "ALL" | "VALID" | "INVALID"
runId: string | null   // 来自 URL query
```

### 9.2 提交流程

1. 用户选择 CSV、输入时长，点击「开始检查」。
2. 前端做基础校验（文件存在、时长正整数），失败直接提示。
3. 清空旧报告、旧错误，设置 Loading，禁用提交按钮。
4. 调用 `POST /api/qc`。
5. 成功：设置新报告，`history.replaceState` 写入 `?runId=...`，筛选重置为 All。
6. 失败：显示错误；保持空结果，不把旧报告当作新报告。
7. 新请求开始时从 URL 移除旧 `runId`，避免失败后刷新又显示旧报告。

### 9.3 刷新恢复

- 页面加载时读取 `URLSearchParams` 中的 `runId`。
- 有 `runId` → 调用 `GET /api/qc/{runId}`，显示 Loading。
- 成功 → 展示数据库返回的报告。
- 404 → 显示「报告不存在或已失效」，不伪造数据。
- 无 `runId` → 显示空状态。
- 浏览器只保存 `runId`，不保存整份报告。

### 9.4 竞态与旧结果保护（💡 建议）

- 使用递增的 `requestSeq` 或 `AbortController`；只接受最新一次请求的响应。
- 新请求开始时清空旧报告。
- 组件卸载时忽略未完成响应。
- 这条逻辑会在代码中加注释，说明为什么不能用旧响应覆盖新状态。

### 9.5 展示

- 统计区：total / valid / invalid。
- 报告信息：runId、createdAt、durationMs。
- Segment 表格：rowIndex、segmentId、startMs、endMs、action、status、errors。
- `startMs` / `endMs` 为 `null` 显示「—」或「无法解析」。
- 错误代码旁显示中文说明，例如：
  - `INVALID_RANGE`：时间范围不合法
  - `OUT_OF_BOUNDS`：超出视频总时长
  - `EMPTY_ACTION`：动作名称为空
  - `OVERLAP`：与其它片段重叠
- All / Valid / Invalid 只过滤表格，不改变统计，不重新请求。
- 空状态、加载状态、错误状态分别展示，不互相覆盖。

### 9.6 B01 时间轴

- 横向按 `durationMs` 比例定位每条 Segment。
- 有效与无效用不同颜色；图例说明。
- 时间无法解析的 Segment 不画条，单独提示「无法定位的时间范围」。
- 超出总时长的条在右边界截断，并加溢出标记。
- 不做视频播放。

### 9.7 B02 导出

- 导出当前报告的**全部** Segment，不受筛选影响。
- 列：`rowIndex, segmentId, startMs, endMs, action, status, errors`。
- `errors` 用 `|` 连接；`null` 时间留空。
- 使用 UTF-8 BOM，便于 Excel 打开中文。
- 文件名：`qc-<runId>.csv`。

### 9.8 视觉方向（参考 phibotics.cn）

用户指定参考费曼智核官网的视觉风格。只借鉴**色彩、排版、留白、细线网格和技术感**，不复制 logo、图片、文案、字体文件或任何品牌素材。

**总体基调**

- 近黑背景 + 白色大标题 + 暖橙/紫色点缀，避免常见后台模板的浅色卡片堆叠。
- 保留工具界面的信息密度，不照搬官网的营销长页、视频背景和 3D 机器人素材。
- 用细边框、网格背景和编号标签营造「技术工作台」感。

**色彩 token（💡 待确认）**

| Token | 建议值 | 用途 |
| --- | --- | --- |
| `--bg` | `#050505` | 页面底色 |
| `--bg-soft` | `#0A0A0A` | 区块交替底色 |
| `--panel` | `#0F0F0F` | 卡片/面板 |
| `--line` | `rgba(255,255,255,0.10)` | 1px 分隔线 |
| `--text` | `#F2F2EE` | 主文字 |
| `--text-muted` | `rgba(210,200,190,0.64)` | 次级文字 |
| `--accent` | `#8B4DFF` | 交互、当前态、区块标签 |
| `--warm` | `#FFB45F` | 无效/警告/时间轴强调 |
| `--valid` | `#7FE0C3` | 有效状态（功能性补充色） |
| `--invalid` | `#FFB45F` | 无效状态 |

**字体**

- 系统字体栈：`"MiSans", "PingFang SC", "HarmonyOS Sans", "Microsoft YaHei", sans-serif`。
- 不下载官网字体文件，避免许可与网络依赖。
- 数字、`runId`、错误码使用 `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`。

**排版与布局**

- 页面标题 40–56px / 600；区块标题 24–32px / 600；正文 14–16px。
- 小标签 11–12px，大写，`letter-spacing: 0.16em`，紫色或暖灰。
- 内容 `max-width: 1280px`，12 列栅格；上传区与统计区并排，表格全宽。
- 区块间距 64–96px，1px 细线分隔；背景可叠加极淡网格线。

**组件**

- 顶部栏：左侧 `SkillFactory / QC Workbench` 字标，右侧健康状态点与端口信息。
- 上传面板：深色卡片、细边框、右上角紫色微光；主按钮紫色实心或白色实心。
- 统计卡：大号数字 + 小写标签；有效/无效使用状态色，不滥用渐变。
- 表格：极弱斑马纹、hover 提亮、状态徽章；错误码用等宽字体。
- 时间轴：细网格背景，有效条薄荷绿、无效条橙色；越界部分在右端用虚线标记。
- 空状态/错误状态：使用细边框面板 + 简短说明，不使用大面积插画。

**动效与可访问性**

- 报告出现时 150–250ms 淡入/上移；时间轴条宽过渡；`prefers-reduced-motion` 时关闭。
- 状态不能只靠颜色区分，必须同时有文字标签；对比度满足 WCAG AA。
- 表单 label 与错误提示关联，按钮支持键盘操作。
- ≥1024px 双栏；<768px 单栏，表格横向滚动，统计 2×2。

## 10. 分阶段任务

### Phase 0 — 工程骨架

- [x] 初始化 pnpm workspace、根 `package.json`、`pnpm-workspace.yaml`
- [x] 创建 `client`（Vite + React + TS）与 `server`（Express + TS）
- [x] 配置根脚本：`dev` / `build` / `test` / `typecheck`
- [x] 配置 Vite proxy `/api` → `http://localhost:3001`
- [x] 实现 `GET /api/health`
- [x] 添加 `.gitignore`（`node_modules`、`dist`、`*.db`、`*.sqlite`、`data/`）

**完成标准**

- `pnpm install` 成功
- `pnpm typecheck` 通过
- `pnpm build` 通过
- `pnpm dev` 启动后 `curl http://localhost:3001/api/health` 返回 `{"status":"ok"}`

**验证结果**

- 2026-10-20 已执行并记录在 `docs/VERIFICATION.md` 的 Phase 0 章节。
- 根脚本 `db:init` 已在 Phase 2 补充。

### Phase 1 — CSV 解析与 QC 核心

- [x] 定义类型与错误码常量
- [x] 实现 CSV 解析、BOM、引号、CRLF、空白行、表头与列数校验
- [x] 实现四条 QC 规则与固定错误顺序
- [x] 实现 O(n²) 重叠检查与双方标记
- [x] 编写单元测试：首尾相接、真正重叠、完全包含、乱序、空动作 + 重叠、非法范围不参与、越界不参与、多错误顺序
- [x] 编写 CSV 测试：BOM、CRLF、引号逗号、转义引号、列顺序、额外列、缺表头、结构错误、空行
- [x] 覆盖 6.3 补充边界：空 `segment_id`、无结尾换行、混合换行、引号内换行、重复表头、数字格式、边界值
- [x] 验证错误数组去重/顺序与 `valid + invalid = total` 不变量

**完成标准**

- `pnpm --filter server test` 全部通过
- 测试输出保留，作为后续验证证据

**验证结果**

- 2026-10-20 已执行：`2 passed (2)`，`42 passed (42)`。
- 证据与命令见 `docs/VERIFICATION.md` 的 Phase 1 章节。
- 实际踩坑：`docs/PITFALLS.md` P-003（前导空白行导致列数误判）。

### Phase 2 — SQLite 持久化

- [x] 实现连接、PRAGMA、建表、初始化
- [x] 实现 `qcRepository.saveReport()` 事务写入
- [x] 实现 `qcRepository.getReport(runId)` 按顺序读回
- [x] 处理重复 `segment_id`，确保不覆盖
- [x] 编写持久化测试：保存后按 runId 读回、Segment 顺序、状态、统计、错误代码
- [x] 编写重启测试：关闭连接后用同一文件重新打开，仍能读取
- [x] 增加事务回滚测试与 `errors_json` 损坏保护
- [x] 增加根脚本 `db:init` 与启动时自动建表

**完成标准**

- 持久化测试全部通过
- 手动检查 `sqlite3 server/data/qc.sqlite ".tables"` 能看到两张表
- 关闭并重启服务后，旧 `runId` 仍可读取

**验证结果**

- 2026-10-20 已执行：`3 passed (3)`，`53 passed (53)`。
- `pnpm db:init` 输出 `[db] initialized .../server/data/qc.sqlite`；`.tables` 显示 `qc_runs`、`qc_segments`。
- 证据与命令见 `docs/VERIFICATION.md` 的 Phase 2 章节。
- 实际踩坑：`docs/PITFALLS.md` P-004（better-sqlite3 下载源超时）。

### Phase 3 — HTTP API

- [x] 实现 `POST /api/qc`（multipart、duration 校验、解析、QC、保存）
- [x] 实现 `GET /api/qc/{runId}`
- [x] 实现 400 / 404 / 500 错误响应与固定 code
- [x] 保证文件级 / 请求级错误不创建报告
- [x] 编写 API 集成测试：T01、T02、T05、T06、T07、T08、T10、T11、T13
- [x] 测试文件级 / 请求级错误不创建报告
- [x] 测试数据库写入失败返回 500，而非假成功
- [x] 做一次真实进程重启验收：启动临时端口 → POST → kill → 重启 → GET 一致
- [x] 手工验证 T02 示例 CSV 的 2 valid / 4 invalid 结果

**完成标准**

- `pnpm test` 通过
- `curl` 或 Supertest 验证三条固定接口
- 数据库文件大小在成功请求后增长；失败请求不新增报告
- 进程重启后同一 `runId` 的响应与重启前一致

**验证结果**

- 2026-10-20 已执行：`5 passed (5)`，`68 passed (68)`。
- 手工 `curl` 验证：POST 示例返回 `total=6 / valid=2 / invalid=4`；GET 与 POST 响应完全一致；404 返回 `REPORT_NOT_FOUND`；非法 duration 返回 `INVALID_DURATION`。
- 真实进程重启测试通过：同一文件重启后 GET 结果与重启前一致。
- 证据见 `docs/VERIFICATION.md` 的 Phase 3 章节。

### Phase 4 — React 页面

- [x] 上传表单、时长输入、开始检查
- [x] Loading 与防重复提交
- [x] 统计卡片、报告信息、Segment 表格
- [x] All / Valid / Invalid 筛选
- [x] 文件 / 时长 / API 错误提示
- [x] 空状态
- [x] 新报告不混入旧 Segment
- [x] 落地深色技术风格与设计 token（参考 phibotics.cn，不复制素材）
- [x] 响应式布局与状态徽章

**完成标准**

- `pnpm typecheck`、`pnpm build` 通过
- 浏览器手工上传示例 CSV，结果与 API 一致
- 筛选只影响列表，不改变统计

**验证结果**

- 2026-10-20 已执行：`pnpm typecheck`、`pnpm build` 通过。
- 浏览器上传示例 CSV：显示 `total=6 / valid=2 / invalid=4`，Segment 表格与错误码正确。
- 点击 Invalid：只显示 4 条无效记录，统计仍为 6 / 2 / 4。
- 证据见 `docs/VERIFICATION.md` 的 Phase 4 章节。

### Phase 5 — 刷新恢复与竞态保护

- [x] 成功后将 `runId` 写入 URL query
- [x] 页面加载时按 `runId` 调用 `GET /api/qc/{runId}`
- [x] 处理 404、网络错误与加载状态
- [x] 新请求失败时不显示旧报告
- [x] 实现请求竞态保护

**完成标准**

- 刷新页面后报告仍显示，且 Network 面板确实请求了 `GET /api/qc/{runId}`
- 手动改错 `runId` 显示清楚的 404 提示
- 先成功一份、再提交无效文件，页面不显示上一份结果

**验证结果**

- 2026-10-20 已执行：上传成功后 URL 变为 `?runId=...`；刷新后 Network 出现 `GET /api/qc/{runId}` 并返回 200。
- `?runId=qc-missing` 显示 404 `REPORT_NOT_FOUND` 错误。
- 成功报告后提交缺少 action 表头的 CSV：URL 被清空、旧报告消失、显示 `MISSING_HEADER`；再次刷新为空状态。
- 开发环境 StrictMode 会产生一次 aborted GET，这是预期行为；最终成功请求仍为 200。

### Phase 6 — 加分项

- [x] B01 时间轴可视化
- [x] B02 导出完整报告 CSV
- [x] B03 额外边界测试：完全包含 / 乱序、多错误组合、重启后读取、重复 ID、带引号 CSV
- [x] 手工验证导出不受筛选影响

**完成标准**

- `pnpm test` 覆盖额外边界场景并全部通过
- 时间轴比例正确、颜色区分有效/无效
- 导出的 CSV 行数等于 `total`，筛选为 Invalid 时也导出全部

**验证结果**

- 时间轴：s1/s6 薄荷绿，s2/s3/s4/s5 橙色；s4 超出 10000ms 的右端被截断并标记。
- CSV 导出：切到 Invalid 筛选后导出，文件仍包含 6 条 Segment；带 UTF-8 BOM。
- 测试：server 68 + client 2 = 70 个测试通过。
- B03 覆盖见 `docs/VERIFICATION.md` Phase 6 的测试映射。

### Phase 7 — 文档与最终验收

- [ ] README：技术栈、版本、安装、DB 初始化、启动命令、端口、测试命令
- [ ] `docs/AI_USAGE.md`：工具、AI 生成范围、人工验证证据
- [ ] 补齐 `docs/DECISIONS.md` 与 `docs/PITFALLS.md`
- [ ] 按 T01–T15 逐项自检并记录结论
- [ ] 从零执行安装、启动、测试、构建
- [ ] 检查 `.gitignore`，确保无数据库文件、无密钥
- [ ] 检查新增代码注释是否解释「为什么」和边界条件

**完成标准**

- README 命令能从干净环境复现
- T01–T15 全部有实际验证记录
- 未完成项如实标注

## 11. 测试方案

### 11.1 QC 规则测试（必做）

直接调用 `qc/rules.ts`：

- 首尾相接 `[0,2000)` + `[2000,4000)` → 无 `OVERLAP`
- 真正重叠 `[0,2000)` + `[1900,3000)` → 双方都有 `OVERLAP`
- 完全包含 → 双方都有 `OVERLAP`
- 乱序输入 → 判定正确，输出顺序不变
- 空动作 + 重叠 → 同时有 `EMPTY_ACTION` 和 `OVERLAP`
- `INVALID_RANGE` / `OUT_OF_BOUNDS` 不参与重叠
- 多错误组合与固定顺序
- 一条记录与多条重叠时 `OVERLAP` 只出现一次

### 11.2 持久化测试（必做）

使用临时 SQLite 文件：

- 保存报告后按 `runId` 读回
- 校验 `durationMs`、`total`、`valid`、`invalid`、`createdAt`
- 校验全部 Segment 的 `rowIndex`、`segmentId`、`startMs`、`endMs`、`action`、`status`、`errors`
- 校验顺序与输入一致
- 重复 `segment_id` 分别保存
- 关闭连接后重新打开同一文件，数据仍存在
- 两次上传产生不同 `runId`，互不覆盖

### 11.3 API 集成测试

使用 Supertest + 临时 DB：

- `GET /api/health`
- `POST /api/qc` 示例 CSV
- `GET /api/qc/{runId}`
- `GET` 不存在 → 404 `REPORT_NOT_FOUND`
- 400：`FILE_REQUIRED`、`EMPTY_FILE`、`INVALID_CSV`、`MISSING_HEADER`、`NO_RECORDS`、`INVALID_DURATION`
- 失败请求后报告数量不增加
- 两个成功请求互不覆盖

### 11.4 前端验证

题目不强制 E2E。手工清单：

- 上传、Loading、防重复提交
- 统计与表格
- All / Valid / Invalid 筛选
- 文件错误、时长错误、网络错误
- 刷新后通过 URL `runId` 恢复
- 404 提示
- 新请求失败不显示旧报告
- 空状态

### 11.5 测试隔离

- 每个测试文件使用独立临时目录 / 临时 SQLite 文件。
- 通过 `QC_DB_PATH` 注入，不触碰 `server/data/qc.sqlite`。
- 测试结束关闭连接并删除临时文件。
- README 写明测试命令；不要求运行中的开发服务器。

## 12. 验收清单（T01–T15）

| ID | 场景 | 验证方式 | 状态 |
| --- | --- | --- | --- |
| T01 | `GET /api/health` | API 测试 + curl | 待实现 |
| T02 | 示例 CSV，2 valid / 4 invalid | API 测试逐条断言 | 待实现 |
| T03 | 首尾相接不重叠 | QC 单元测试 | 待实现 |
| T04 | 乱序 + 完全包含，双方标记 | QC 单元测试 + API 测试 | 待实现 |
| T05 | 空动作合法区间与其它片段重叠 | QC 单元测试 | 待实现 |
| T06 | 非整数 / 负数 / end ≤ start | QC 单元测试 | 待实现 |
| T07 | 合法但越界，不参与重叠 | QC 单元测试 | 待实现 |
| T08 | 重复 `segment_id` 分别保存 | API + 持久化测试 | 待实现 |
| T09 | 引号内逗号 / 转义双引号 | CSV 单元测试 | 待实现 |
| T10 | 六种 400 错误，不创建报告 | API 测试 | 待实现 |
| T11 | 按 `runId` 读取完整报告 | API + 持久化测试 | 待实现 |
| T12 | 重启后仍能读取 | 关闭/重开 DB 测试 + 手工重启服务 | 待实现 |
| T13 | 连续两份报告互不覆盖 | API + 持久化测试 | 待实现 |
| T14 | 前端检查、筛选、刷新恢复 | 浏览器手工验收 | 待实现 |
| T15 | README 测试命令可运行 | 干净环境执行 `pnpm test` | 待实现 |

> 状态在每阶段完成后更新；未实际执行前不得标为「通过」。

## 13. 加分项与设计主张

### 13.1 加分项取舍（💡 待确认）

建议全部实现 B01 / B02 / B03：

- B01 时间轴：可视化成本低，能明显提升报告可读性。
- B02 导出：纯前端生成，不增加后端复杂度。
- B03 边界测试：与必做测试共用测试骨架，边际成本低。

### 13.2 设计主张（💡 待确认）

1. **QC 引擎纯函数化**：解析、规则、持久化、HTTP 分层，规则可独立测试。
2. **报告是不可变快照**：保存后不修改；前端只读展示。
3. **数据库是唯一事实源**：浏览器只保存 `runId`，刷新必须回源查询。
4. **确定性优先**：固定错误顺序、固定校验顺序、固定输出顺序，方便验收与排查。
5. **清楚的状态边界**：Loading、空状态、错误、旧结果互不混淆。
6. **可审计**：时间轴与 CSV 导出帮助人工复核 QC 结果，但不替代后端数据。
7. **视觉服务于工具**：参考费曼智核官网的深色技术感，但优先保证可读性、对比度和操作效率，不照搬营销页。

### 13.3 明确不做（避免范围膨胀）

- 报告历史列表（题目明确不属于加分）
- 登录、权限、租户
- 视频播放 / 解码
- 深色模式、复杂动画
- 异步任务队列、Docker、公网部署
- 为加分项引入外部服务

## 14. 风险与已知限制

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 评测环境没有 pnpm | 无法按 README 安装 | README 写明 Node 与 pnpm 安装方式（corepack / npm i -g pnpm），锁定版本 |
| Node 版本不兼容 `better-sqlite3` | 安装失败 | 使用 Node 22+ / 24 验证，提交 lockfile；遇错记录到 `PITFALLS.md` |
| CSV 边界口径与评测不同 | 少数未公开边界失败 | 只对已公开规则做硬承诺；边界口径写入计划并测试 |
| 大文件 / 超多记录 | O(n²) 变慢 | 题目 ≤ 100 条；不承诺大数据性能 |
| SQLite 并发写 | `SQLITE_BUSY` | 单进程、WAL、busy_timeout；失败返回 500，不假成功 |
| 数据库文件被误提交 | 仓库污染 | `.gitignore` 排除 `*.db` / `*.sqlite` / `data/` |
| 前端竞态 | 旧响应覆盖新报告 | 请求序号 / AbortController + 清空旧结果 |
| 无 E2E 测试 | 前端回归靠手工 | 保留 T14 手工验收清单，关键状态逐一检查 |
| 端口被占用 | 启动失败 | README 写明端口；`PORT` 环境变量可覆盖（建议） |
| 时间显示时区 | 用户误解 | API 返回 UTC ISO；前端只做本地化展示，不改变存储 |

## 15. 待用户确认的决策点

以下事项在计划评审时逐项确认；确认后写入 `docs/DECISIONS.md`，未确认前不视为用户决策：

1. 后端运行时与框架：Node.js 24 + Express 5（💡）
2. 工程结构：pnpm workspace + Vite proxy（💡）
3. CSV 解析：`csv-parse`（💡）
4. SQLite 访问：`better-sqlite3` + 原生 SQL（💡）
5. 报告 ID：`qc-<uuid>`（💡）
6. DB 路径与初始化：`server/data/qc.sqlite` + 启动自动建表 + `pnpm db:init`（💡）
7. 前端刷新恢复：URL `?runId=`（💡）
8. UI：手写 CSS + 中文界面 + 深色技术风格（参考 phibotics.cn）（💡）
9. 加分项：B01 / B02 / B03 全做（💡）
10. 测试：Vitest + Supertest + 临时 DB（💡）
11. 第 6.2 节边界口径（⚠️）
12. 第 13.2 节设计主张（💡）

## 16. 计划变更记录

| 日期 | 变更 | 原因 |
| --- | --- | --- |
| 2026-10-20 | 创建 v0.1 草案 | 初始计划 |
| 2026-10-20 | v0.2：Phase 0 完成 | 工程骨架与 health 验证 |
| 2026-10-20 | v0.3：Phase 1 完成 | CSV 与 QC 规则 42 个测试通过 |
| 2026-10-20 | v0.4：Phase 2 完成 | SQLite 持久化 53 个测试通过 |
| 2026-10-20 | 增加第 17 节评分标准对照 | 按题目第 7 节逐项自检，补齐交付验证清单 |
| 2026-10-20 | v0.5：Phase 3 完成 | API、错误契约、真实进程重启 68 个测试通过 |
| 2026-10-20 | v0.6：Phase 4 完成 | React 上传、统计、表格、筛选、错误提示 |
| 2026-10-20 | v0.7：Phase 5 完成 | URL runId、刷新 GET、404、失败清空旧结果、竞态保护 |
| 2026-10-20 | v0.8：Phase 6 完成 | 时间轴、CSV 导出、B03 边界测试 |

## 17. 评分标准对照（交付前自检）

这是题目第 7 节 100 分表的逐项对照。当前处于 Phase 2 结束，**不能因为测试通过就认为评分项已经完成**。

| 维度 | 分值 | 当前证据 | 状态 | 交付前必须补 |
| --- | ---: | --- | --- | --- |
| QC 业务逻辑 | 25 | 规则测试 13 个；API 级 T02/T05/T06/T07 断言；官方示例 2/4 | 已完成核心与 API 断言 | 最终 T01–T15 自检 |
| SQLite 数据持久化 | 15 | 两张表、事务、读回、关闭重开、真实进程重启、写入失败 500 | 已完成 | 最终重启手工复验 |
| CSV 解析与 API 契约 | 15 | CSV 29 个测试；三条固定接口；400/404/500；输入顺序 | 已完成 | 最终 curl 演示记录 |
| React 前端功能 | 15 | 上传、Loading、统计、表格、筛选、错误、URL 刷新恢复、竞态保护、时间轴 | 已完成 | 最终 T14 复验 |
| 自动化测试 | 10 | 70 个测试通过（server 68 + client 2） | 已超过要求 | README 写明命令；干净环境复现 |
| 可运行性与代码质量 | 5 | workspace、typecheck、build 通过 | 部分完成 | README 从零启动；结构与注释复查 |
| AI 使用说明与交付 | 10 | DECISIONS、PITFALLS、VERIFICATION | 部分完成 | `AI_USAGE.md`、README 中的 AI 记录、完成情况与已知问题 |
| 加分项 | 5 | B01 时间轴、B02 CSV 导出、B03 额外测试 | 已完成 | 最终手工复验 |

### 交付前不能遗漏的验证

1. **真实进程重启（T12）**：不能只做数据库关闭/重开测试。必须用同一 SQLite 文件启动服务、创建报告、停止进程、再启动、读取同一 `runId`。
2. **API 契约（T01/T02/T10/T11/T13）**：文件级错误不创建报告；两个成功报告互不覆盖；响应字段类型和输入顺序正确。
3. **数据库写入失败**：模拟只读 DB 或注入写入异常，确认返回 500，而不是 200。
4. **前端 T14**：刷新后 Network 面板必须出现 `GET /api/qc/{runId}`；筛选不能重新请求；新请求失败不能显示旧报告。
5. **干净环境复现**：按 README 执行安装、初始化、测试、构建、启动，而不是只在当前已安装环境里运行。
6. **交付文档**：README、`docs/AI_USAGE.md`、T01–T15 结论、完成情况与已知问题。
7. **视觉参考验证**：D-003 的 UI 完成后，人工对比 phibotics.cn，确认只借鉴视觉语言，没有复制 logo、图片、文案或字体文件。

### 当前明确未完成的部分

- API、SQLite 到 API 的接线、React 页面、刷新恢复、B01、B02。
- 真实进程重启验收与数据库写入失败测试。
- README、AI 使用说明、T01–T15 最终自检。
