# 验证手册

本文件记录每个阶段的**设计原理**、**验证命令**、**预期结果**和**实际证据**。
目标：候选人本人可以不依赖 AI，独立复现并判断结果是否正确。

> 原则：没有实际命令输出，就不把功能标为「已通过」。

## Phase 0 — 工程骨架

### 设计原理

1. **pnpm workspace 分离 `client` / `server`**
   - 前后端依赖互不污染，根目录统一脚本。
   - `pnpm-lock.yaml` 锁定版本，保证从零安装可复现。
2. **`createApp()` 与 `index.ts` 分离**
   - `createApp()` 只负责组装 Express，后续 Supertest 可以直接测试，不用占用真实端口。
   - `index.ts` 只负责读端口、启动监听；职责单一。
3. **`GET /api/health` 不依赖数据库**
   - 健康检查只表示 HTTP 进程可用，便于排查「服务没起来」和「数据库坏了」两类问题。
   - 数据库初始化失败应在启动阶段直接失败，不能让 health 假装正常。
4. **Vite proxy `/api` → 3001**
   - 前端代码只写相对路径 `/api/...`，开发期由 Vite 代理到后端，避免 CORS。
   - 不在组件里硬编码 `http://localhost:3001`，端口变化时只改一处。
5. **设计 token 集中定义**
   - 颜色、文字、边框统一放在 `:root`，后续 QC 状态色和表格样式复用同一套变量。
   - 视觉参考 phibotics.cn 的深色技术风格，但不复制其素材或字体文件。

### 验证命令

在仓库根目录执行：

```bash
# 1. 安装依赖
pnpm install

# 2. 类型检查
pnpm typecheck

# 3. 生产构建
pnpm build

# 4. 启动前后端
pnpm dev
```

另开一个终端：

```bash
# 5. 直接访问后端健康检查
curl -i http://localhost:3001/api/health

# 6. 通过 Vite 代理访问，验证前后端联通
curl -i http://localhost:5173/api/health

# 7. 浏览器打开前端
open http://localhost:5173
```

### 预期结果

- `pnpm install`：输出 `Done`，生成 `pnpm-lock.yaml`。
- `pnpm typecheck`：`client` 与 `server` 均 `Done`。
- `pnpm build`：
  - `server/dist` 生成编译后的 JS；
  - `client/dist` 生成 `index.html` 与静态资源；
  - Vite 输出 `✓ built in ...`。
- `curl http://localhost:3001/api/health`：
  - HTTP `200`
  - body `{"status":"ok"}`
- `curl http://localhost:5173/api/health`：同样返回 `200` 与 `{"status":"ok"}`，说明代理生效。
- 浏览器页面：
  - 顶部显示 `SkillFactory / QC Workbench`；
  - 页面为深色技术风格，有细网格和紫色标签。

### 实际证据

执行日期：2026-10-20

```text
$ pnpm typecheck
client typecheck: Done
server typecheck: Done
```

```text
$ pnpm build
server build: Done
client build: vite v8.3.4 building client environment for production...
client build: ✓ 16 modules transformed.
client build: dist/index.html                   0.46 kB │ gzip:  0.29 kB
client build: dist/assets/index-CJkK9ikH.css    3.16 kB │ gzip:  1.26 kB
client build: dist/assets/index-C_8-1o-f.js   221.97 kB │ gzip: 69.86 kB
client build: ✓ built in 259ms
client build: Done
```

```text
$ curl -i http://127.0.0.1:3001/api/health
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{"status":"ok"}

$ curl -i http://127.0.0.1:5173/api/health
HTTP/1.1 200 OK
{"status":"ok"}
```

浏览器截图检查：页面标题、深色背景和网格均正常显示。

### 自己检查时重点看什么

1. `pnpm typecheck` 是否两个包都通过，而不是只看客户端。
2. `pnpm build` 是否同时生成 `server/dist` 和 `client/dist`。
3. 直接访问 3001 和通过 5173 代理访问是否都返回 `200`。
4. 浏览器页面是否正常加载；若加载失败，先检查 Vite 5173 与后端 3001 是否启动。
5. 验证结束后关闭 `pnpm dev`，确认 3001 / 5173 端口释放。

### 已知限制（Phase 0）

- 还没有上传、CSV 解析、QC 规则、SQLite 和报告页面。
- 页面只是骨架，不代表最终 UI。
- 没有自动化测试；从 Phase 1 开始补充。

## Phase 1 — CSV 解析与 QC 核心

### 设计原理

1. **解析与规则分离**
   - `csv.ts` 只负责把文本变成 `RawSegment[]`，并区分文件级错误。
   - `rules.ts` 只接收结构化数据，不关心 CSV、HTTP 或数据库，便于独立测试。
2. **片段级错误不拒绝整份文件**
   - 时间解析失败存 `null`，空动作保留原文；由规则层标记 `INVALID_RANGE` / `EMPTY_ACTION`。
   - 这样一条坏记录不会导致整份报告丢失，符合题目要求。
3. **CSV 语法交给 `csv-parse`，业务校验自己写**
   - 引号、逗号、转义引号、CRLF、BOM 由库处理。
   - 表头大小写、重复表头、列数一致性、空行策略由项目代码控制，便于精确匹配题目契约。
4. **`relax_column_count: true` + 手动列数检查**
   - 这是实际踩坑后的修正：库会用前导空白行推定列数，导致合法表头被误判。
   - 放开库的列数检查后，先过滤空白行，再手动对比数据行与表头长度，仍然保证列数不一致返回 `INVALID_CSV`。
5. **整数解析用正则，不用 `parseInt`**
   - `parseInt("12abc")` 会得到 12，不符合「十进制整数文本」要求。
   - 正则只接受 `^-?\d+$`，解析失败返回 `null`。
6. **重叠检查 O(n²) + Set 去重**
   - 题目 ≤ 100 条，双重循环足够且容易验证。
   - 左闭右开：`a.start < b.end && b.start < a.end`。
   - Set 保证一条记录与多条记录重叠时 `OVERLAP` 只出现一次。
7. **错误顺序固定**
   - 用 `ERROR_ORDER` 排序，避免 Set/遍历顺序影响 API 输出。

### 验证命令

```bash
# 运行全部 server 测试（CSV + QC 规则）
pnpm test

# 只运行 server 测试的另一种写法
pnpm --filter server test

# 类型检查与构建
pnpm typecheck
pnpm build
```

单独看某个测试文件：

```bash
pnpm --filter server exec vitest run tests/csv.test.ts
pnpm --filter server exec vitest run tests/qc.rules.test.ts
```

### 预期结果

- `csv.test.ts`：29 个测试通过，覆盖官方示例、BOM/CRLF、引号逗号、转义引号、列顺序、额外列、重复 ID、空行、引号内换行、数字格式、文件级错误。
- `qc.rules.test.ts`：13 个测试通过，覆盖首尾相接、真正重叠、完全包含、乱序、空动作 + 重叠、非法范围/越界不参与、多错误顺序、一对多去重、重复 ID、边界值、统计不变量。
- 合计：`2 passed (2)`，`42 passed (42)`。

### 实际证据

执行日期：2026-10-20

```text
$ pnpm test
server test$ vitest run
 ✓ tests/qc.rules.test.ts (13 tests)
 ✓ tests/csv.test.ts (29 tests)

 Test Files  2 passed (2)
      Tests  42 passed (42)
```

```text
$ pnpm typecheck
client typecheck: Done
server typecheck: Done

$ pnpm build
server build: Done
client build: Done
```

官方示例的断言结果：

```text
total = 6
valid = 2
invalid = 4
errors = [[], ["OVERLAP"], ["OVERLAP"], ["OUT_OF_BOUNDS"], ["EMPTY_ACTION"], []]
```

### 自己检查时重点看什么

1. `csv.test.ts` 中「解析题目示例并得到 2 valid / 4 invalid」是否通过。
2. 「首尾相接的区间不算重叠」与「真正重叠时双方都标记 OVERLAP」是否同时通过。
3. 「INVALID_RANGE 记录不参与重叠检查」和「OUT_OF_BOUNDS 记录不参与重叠检查」是否通过。
4. 空动作 + 重叠的用例是否同时返回 `EMPTY_ACTION` 和 `OVERLAP`。
5. 文件级错误是否只返回对应 code，而不是把片段错误当成文件错误。
6. 测试数据位置：`server/tests/fixtures/sample-segments.csv`；其他边界用例在测试文件内联构造，避免 CRLF 被 Git 转换。

### 已知限制（Phase 1）

- 还没有 HTTP API、SQLite、报告 ID 和前端上传。
- `durationMs` 目前由规则函数自身校验；HTTP 层在 Phase 3 还会再校验一次。
- 没有做性能优化；题目限定小型 CSV。

## Phase 2 — SQLite 持久化

### 设计原理

1. **两张关联表**
   - `qc_runs` 保存报告级信息：`id`、`duration_ms`、统计、`created_at`。
   - `qc_segments` 每条 Segment 独立一行，通过 `run_id` 关联；`(run_id, row_index)` 唯一。
   - 不把整份报告塞进一个 JSON 字段，重复 `segment_id` 也不会互相覆盖。
2. **数据库层约束**
   - `duration_ms > 0`、`valid + invalid = total`、`status IN ('VALID','INVALID')` 由 SQLite 约束兜底。
   - `errors_json` 保存错误码数组；读取时解析并校验，损坏时抛错而不是返回半份数据。
3. **事务边界**
   - 一个事务内先写 `qc_runs`，再逐条写 `qc_segments`。
   - 任一条失败会回滚，不会留下「有报告、没 Segment」的半成品。
   - 只有事务提交成功，`saveReport()` 才返回；HTTP 层后续拿到返回后才响应 200。
4. **报告 ID 与时间**
   - `runId = qc-<randomUUID()>`，非空、唯一、URL 安全。
   - `createdAt = new Date().toISOString()`，UTC、带 `Z`。
5. **重启恢复**
   - 测试中关闭连接后，用同一 SQLite 文件重新打开，再按 `runId` 读取。
   - 读取不依赖内存缓存，所有字段从数据库还原。
6. **测试隔离**
   - 每个测试用 `mkdtempSync` 创建临时目录与独立 SQLite 文件。
   - `afterEach` 关闭连接并删除临时目录，不污染 `server/data/qc.sqlite`。

### 验证命令

```bash
# 全部测试（CSV + 规则 + 持久化）
pnpm test

# 单独运行持久化测试
pnpm --filter server exec vitest run tests/persistence.test.ts

# 类型检查与构建
pnpm typecheck
pnpm build

# 初始化开发数据库
pnpm db:init

# 检查表结构
sqlite3 server/data/qc.sqlite ".tables"
sqlite3 server/data/qc.sqlite ".schema qc_runs"
sqlite3 server/data/qc.sqlite ".schema qc_segments"
```

### 预期结果

- `pnpm test`：`3 passed (3)`，`53 passed (53)`。
- `pnpm db:init`：输出 `[db] initialized .../server/data/qc.sqlite`。
- `.tables`：至少包含 `qc_runs` 和 `qc_segments`。
- `.schema`：能看到主键、外键、`UNIQUE (run_id, row_index)`、`CHECK` 约束。
- 持久化测试覆盖：
  - 保存后按 `runId` 读回，统计、Segment 顺序、错误码一致；
  - 数据库文件真实落盘；
  - 重复 `segment_id` 分别保存；
  - 无法解析的起止时间为 `null`；
  - 两次报告 ID 不同、互不覆盖；
  - 关闭并重开同一文件后仍能读取；
  - 事务中途失败回滚；
  - 统计不一致拒绝保存；
  - 不存在的 `runId` 返回 `null`；
  - `errors_json` 损坏时读取报错。

### 实际证据

执行日期：2026-10-20

```text
$ pnpm test
server test$ vitest run
 ✓ tests/qc.rules.test.ts (13 tests)
 ✓ tests/csv.test.ts (29 tests)
 ✓ tests/persistence.test.ts (11 tests)

 Test Files  3 passed (3)
      Tests  53 passed (53)
```

```text
$ pnpm db:init
$ tsx src/db/init.ts
[db] initialized /Users/hazer/code/skillfactory-qc-workbench/server/data/qc.sqlite

$ sqlite3 server/data/qc.sqlite ".tables"
qc_runs     qc_segments

$ curl -i http://127.0.0.1:3001/api/health
HTTP/1.1 200 OK
{"status":"ok"}
```

### 自己检查时重点看什么

1. `.tables` 是否同时出现两张表；只有一张表不满足题目要求。
2. `.schema qc_segments` 是否有 `run_id` 外键和 `UNIQUE (run_id, row_index)`。
3. 持久化测试中「关闭并重新打开同一个数据库文件后仍能读取」是否通过。
4. 「事务中途失败时回滚」是否通过；失败后 `qc_runs` 和 `qc_segments` 计数都应为 0。
5. 重复 `segment_id` 测试中，读回的两条 Segment 是否都存在。
6. 测试是否使用临时目录；运行后 `server/data/qc.sqlite` 不应被测试写入新报告。

### 已知限制（Phase 2）

- 还没有 `POST /api/qc` 与 `GET /api/qc/{runId}`，因此还不能通过 HTTP 手工创建报告。
- 真实重启验收（T12）要等 Phase 3 API 完成后，通过 HTTP 创建报告再重启服务验证。
- 没有数据库迁移系统；当前使用 `CREATE TABLE IF NOT EXISTS`。

## Phase 3 — HTTP API

### 设计原理

1. **依赖注入**
   - `createApp({ repo })` 接收 `QcRepository`，测试可以用临时 SQLite 文件，生产入口用真实 DB。
   - 路由层不直接操作 SQL，避免 HTTP、业务规则、数据库耦合在一起。
2. **multipart 使用 memoryStorage**
   - 题目文件很小，不需要落临时文件；也避免临时文件清理和权限问题。
   - `file` 字段固定，`durationMs` 从表单字段读取。
3. **固定校验顺序**
   - 文件缺失 → `FILE_REQUIRED`；
   - duration 非法 → `INVALID_DURATION`；
   - 0 字节文件 → `EMPTY_FILE`；
   - 其余交给 CSV 解析：`INVALID_CSV` / `MISSING_HEADER` / `NO_RECORDS`。
   - 这个顺序与计划书 5.5 一致，且任何一个 400 都不会创建报告。
4. **错误映射**
   - `QcInputError` → 400 `{ code, error }`；
   - multer 的字段名错误 → 400 `FILE_REQUIRED`；
   - 其他异常 → 500 `{ code: "INTERNAL_ERROR" }`，不泄漏 SQL 或文件路径。
5. **保存成功才返回 200**
   - `repo.saveReport()` 内部事务提交成功后才 `res.json`；
   - 数据库写入失败会进入 500 分支，不会返回假成功。
6. **GET 只读数据库**
   - `GET /api/qc/{runId}` 调用 `repo.getReport()`，没有内存缓存；
   - 不存在返回 404 `REPORT_NOT_FOUND`。
7. **真实进程重启测试**
   - 用 `node --import tsx src/index.ts` 启动真实后端进程；
   - POST 创建报告 → SIGTERM 停止 → 用同一 SQLite 文件重新启动 → GET 同一 `runId`；
   - 这比只关闭/重开数据库连接更接近 T12 的验收方式。

### 验证命令

```bash
# 全部自动化测试
pnpm test

# 类型检查与构建
pnpm typecheck
pnpm build

# 手工验证（先启动 pnpm dev）
curl -i -F "file=@server/tests/fixtures/sample-segments.csv" \
  -F "durationMs=10000" \
  http://localhost:3001/api/qc

# 把上一步返回的 runId 填进去
curl -i http://localhost:3001/api/qc/<runId>

# 404
curl -i http://localhost:3001/api/qc/qc-missing

# 400
curl -i -F "file=@server/tests/fixtures/sample-segments.csv" \
  -F "durationMs=0" \
  http://localhost:3001/api/qc
```

### 预期结果

- `pnpm test`：`5 passed (5)`，`68 passed (68)`。
- POST 示例：HTTP 200，`total=6`、`valid=2`、`invalid=4`，错误数组与题目示例一致。
- GET 同一 `runId`：HTTP 200，响应与 POST 完全相同。
- GET 不存在：HTTP 404，`{ code: "REPORT_NOT_FOUND", error: "..." }`。
- `durationMs=0`：HTTP 400，`{ code: "INVALID_DURATION", error: "..." }`。
- 数据库：成功请求后 `qc_runs=1`、`qc_segments=6`；所有 400 请求后计数不变。
- 重启测试：第二次启动后 GET 的 JSON 与第一次 POST 完全一致。

### 实际证据

执行日期：2026-10-20

```text
$ pnpm test
 ✓ tests/qc.rules.test.ts (13 tests)
 ✓ tests/csv.test.ts (29 tests)
 ✓ tests/persistence.test.ts (11 tests)
 ✓ tests/api.test.ts (14 tests)
 ✓ tests/restart.test.ts (1 test)

 Test Files  5 passed (5)
      Tests  68 passed (68)
```

手工使用编译后的后端与临时数据库（端口 3999）：

```text
GET  /api/health              -> 200 {"status":"ok"}
POST /api/qc (示例 CSV)       -> 200
runId                         -> qc-c3fd96ea-5224-450c-a212-869b8f277d76
summary                       -> total=6, valid=2, invalid=4
errors                        -> [[], [OVERLAP], [OVERLAP], [OUT_OF_BOUNDS], [EMPTY_ACTION], []]
GET  /api/qc/<runId>          -> 200，与 POST 响应 equal=True
GET  /api/qc/qc-missing       -> 404 {"code":"REPORT_NOT_FOUND","error":"报告不存在"}
POST durationMs=0             -> 400 {"code":"INVALID_DURATION","error":"durationMs 必须是正整数（毫秒）"}
SQLite 计数                   -> qc_runs=1, qc_segments=6
```

### 自己检查时重点看什么

1. POST 返回的 `runId`、`createdAt`、`durationMs`、统计和 Segment 字段是否与题目契约一致。
2. 所有 400 错误是否都带非空 `error`，并且数据库计数没有增加。
3. GET 是否真的从 SQLite 读取（可以停掉后端再启动，再 GET 同一 `runId`）。
4. 重启测试是否使用同一 DB 文件，而不是 `:memory:` 或重新建库。
5. 数据库 trigger 模拟写入失败时，是否返回 500 而不是 200。
6. `durationMs` 的缺失、空串、0、负数、小数、科学计数法、正号是否都被拒绝。
7. `file` 字段名错误时是否返回 400，而不是 500 或默认 HTML 错误页。

### 已知限制（Phase 3）

- 前端还没有接 API；T14 需要 Phase 4/5 完成后再验收。
- 没有登录、限流、文件大小限制；题目不要求。
- 手工验证使用了临时端口和临时数据库；README 会说明正式端口 3001。

## Phase 4 — React 页面

### 设计原理

1. **上传与结果分区**
   - 左侧固定上传面板，右侧结果区；上传后无需跳页。
   - 桌面端上传面板 sticky，滚动查看长表格时仍可重新上传。
2. **筛选只在前端过滤**
   - `visibleSegments` 由 `report.segments` 按状态过滤，统计始终来自报告本身。
   - 筛选不会重新调用 QC 接口，符合题目要求。
3. **状态完整**
   - Loading、错误、空状态、报告状态互斥展示，避免旧内容残留。
   - 新请求开始时先清空旧报告，失败时不会把旧报告当成新结果。
4. **表单校验**
   - 文件必选；duration 使用文本输入 + 正则，拒绝空、0、负数、小数、科学计数法。
   - 后端仍然做最终校验，前端校验只用于快速反馈。
5. **视觉 token**
   - 近黑背景、紫色交互、暖橙无效、薄荷绿有效、1px 细线和淡网格。
   - 只借鉴 phibotics.cn 的视觉语言，没有复制其 logo、图片、文案或字体文件。
6. **可访问性基础**
   - 表单 label 关联输入框；错误使用 `role="alert"`；筛选按钮使用 `aria-pressed`。
   - 状态同时用颜色和文字表达，不只依赖颜色。

### 验证命令

```bash
pnpm typecheck
pnpm build
pnpm dev
```

浏览器打开 `http://localhost:5173`，然后：

1. 选择 `server/tests/fixtures/sample-segments.csv`。
2. 输入 `10000`。
3. 点击「开始检查」。
4. 检查统计、表格和错误说明。
5. 点击 `Invalid`，确认只显示 4 条无效记录，统计仍是 6 / 2 / 4。

### 预期结果

- 顶部显示 `SkillFactory / QC Workbench`。
- 报告区显示 runId、视频总时长 10,000 ms、创建时间。
- 统计：`TOTAL 6`、`VALID 2`、`INVALID 4`。
- 表格 6 行，顺序 s1–s6；错误码与题目示例一致。
- 点击 `Invalid` 后表格只剩 s2、s3、s4、s5；统计不变。
- 点击 `Valid` 后只剩 s1、s6；点击 `All` 恢复 6 行。

### 实际证据

执行日期：2026-10-20

```text
$ pnpm typecheck
client typecheck: Done
server typecheck: Done

$ pnpm build
client build: Done
server build: Done
```

浏览器实测：

```text
上传 sample-segments.csv，durationMs=10000
-> 统计 6 / 2 / 4
-> Segment 表格 6 行，错误顺序与 API 一致
-> 点击 Invalid，显示 4 行；统计保持 6 / 2 / 4
-> 顶部显示 `SkillFactory / QC Workbench`
```

当前页面视觉：深色技术风格、左侧上传面板、右侧报告工具栏、三张统计卡、筛选胶囊、Segment 表格与错误标签。

### 自己检查时重点看什么

1. 上传后是否出现 Loading，按钮是否禁用，避免重复提交。
2. 统计数字是否来自报告而不是筛选后的列表。
3. 点击 All / Valid / Invalid 时 Network 面板不应新增 `/api/qc` 请求。
4. 空动作是否显示为 `（空）`，错误说明是否可读。
5. 空文件或非法时长是否显示清楚错误，而不是静默失败。
6. 页面在窄屏下是否出现横向滚动而不是内容挤坏。

### 已知限制（Phase 4）

- 刷新页面后报告会丢失，因为 runId 还没有写入 URL / localStorage；Phase 5 补齐。
- 请求竞态保护、404 恢复、B01 时间轴、B02 CSV 导出尚未实现。

## Phase 5 — 刷新恢复与竞态保护

### 设计原理

1. **浏览器只保存 runId**
   - 成功后用 `history.replaceState` 写入 `?runId=...`。
   - 不把整份报告放进 localStorage；刷新时必须重新请求后端。
2. **刷新回源**
   - 首次挂载读取 URL query，若有 runId 则调用 `GET /api/qc/{runId}`。
   - 加载中显示 `正在从 SQLite 读取已保存报告…`。
   - 404 显示 `REPORT_NOT_FOUND` 错误，不伪造数据。
3. **新请求清空旧结果**
   - 提交新文件时先 `setReport(null)` 并从 URL 移除旧 runId。
   - 失败后不会把上一份报告当成新报告；刷新也不会回到旧报告。
4. **竞态保护**
   - `requestSeq` 递增序号：只有最新请求的响应可以更新状态。
   - `AbortController` 取消旧请求，减少无意义的网络等待。
   - 卸载或 StrictMode 重放时 abort，避免更新已卸载组件。
5. **开发环境 StrictMode 说明**
   - React StrictMode 会在开发环境重复执行 effect，因此 Network 里可能看到一次 aborted GET，紧接着一次 200 GET。
   - 这是预期的开发行为；生产构建只执行一次。验收时看最终 200 响应即可。

### 验证命令

```bash
pnpm typecheck
pnpm build
pnpm dev
```

浏览器步骤：

1. 上传 `server/tests/fixtures/sample-segments.csv`，duration 填 `10000`，开始检查。
2. 确认地址栏出现 `?runId=...`。
3. 刷新页面。
4. 打开 Network 面板，确认存在 `GET /api/qc/{runId}` 且状态 200。
5. 把 URL 改成 `?runId=qc-missing`，刷新，确认显示 404 错误。
6. 回到有效报告，再上传一个缺少 `action` 表头的 CSV，确认旧报告消失、URL 清空、显示错误。
7. 刷新页面，确认不会恢复旧报告。

### 预期结果

- 刷新后报告统计、表格、筛选仍然存在，且确实来自 GET 请求。
- URL 中的 runId 与报告工具栏中的 RUN ID 一致。
- 404：显示 `REPORT_NOT_FOUND` 和「报告不存在」。
- 新提交失败：显示 `MISSING_HEADER`，旧报告和旧 runId 都不保留。
- 失败后刷新：空状态，不显示旧报告。
- 已有报告时，即使客户端校验失败（例如未选择文件），旧报告与 URL 也会先被清空，只显示表单错误。

### 实际证据

执行日期：2026-10-20

```text
上传 sample-segments.csv（durationMs=10000）
-> 地址栏变为 ?runId=qc-b9a725ce-...
-> 刷新后仍显示 6 / 2 / 4

Network:
GET /api/health                         304
GET /api/qc/qc-b9a725ce-... (StrictMode abort)  ERR_ABORTED
GET /api/health                         304
GET /api/qc/qc-b9a725ce-...             200

访问 ?runId=qc-missing
-> 显示 REPORT_NOT_FOUND / 报告不存在

已有报告时输入无效内容并提交
-> 旧报告与 URL 先清空，只显示表单错误

有效报告后上传缺少 action 表头的 CSV
-> URL 变为 /（无 runId）
-> 旧报告消失
-> 显示 MISSING_HEADER / 缺少必要表头：action
-> 再次刷新为空状态
```

### 自己检查时重点看什么

1. 刷新后 Network 是否真的有 `GET /api/qc/{runId}`，而不是从 localStorage 读取整份报告。
2. URL 中的 runId 是否与页面显示一致。
3. 404 是否显示后端 code 和非空错误文案。
4. 新提交失败后旧报告是否彻底消失；刷新不能把旧报告带回来。
5. StrictMode 下的 aborted 请求是否只影响开发环境，最终请求是否 200。
6. 点击筛选是否不会触发 `/api/qc` 请求。

### 已知限制（Phase 5）

- 使用 `replaceState`，浏览器后退不会回到上一份报告；题目不要求历史列表。
- 404 的 runId 会保留在 URL 中，刷新仍会显示 404；这是为了保留可复现的链接。
- 还没有时间轴和 CSV 导出；Phase 6 补齐。

## Phase 6 — 加分项（B01 / B02 / B03）

### 设计原理

1. **B01 时间轴**
   - 以 `durationMs` 为横轴比例；有效条薄荷绿，无效/越界条橙色。
   - 时间无法解析或 `end <= start` 的 Segment 不画条，只统计为「无法定位」。
   - 越界片段仍可定位，但右端截断并用虚线标记。
   - 时间轴是视觉辅助，详细数据仍以表格为准。
2. **B02 CSV 导出**
   - 导出函数直接接收完整 `report`，不接收筛选状态；因此筛选 Invalid 时仍导出全部 Segment。
   - 所有字段经过 CSV 转义：逗号、双引号、换行都会被正确包裹。
   - 文件带 UTF-8 BOM，方便 Excel 正确识别中文。
   - 文件名使用 `qc-report-<runId>.csv`。
3. **B03 额外边界测试**
   - 题目要求至少两个额外边界测试；本项目已有多个，并且都用真实业务断言。
   - 额外覆盖：完全包含/乱序、多错误组合、重启后读取、重复 ID、带引号 CSV、事务回滚。

### 验证命令

```bash
# server + client 全部测试
pnpm test

# 单独验证导出逻辑
pnpm --filter client test

# 构建
pnpm build
```

浏览器手工验证：

1. 上传示例 CSV，确认时间轴出现 6 条记录，s4 超出 10000ms 的右端被截断。
2. 点击 `Invalid`，表格只剩 4 条。
3. 点击「导出 CSV」。
4. 打开下载文件，确认仍有 6 条 Segment（不受筛选影响），并带 BOM。

### 预期结果

- 时间轴：s1/s6 绿色；s2/s3/s4/s5 橙色；s4 右端有截断标记。
- 导出文件列：`rowIndex,segmentId,startMs,endMs,action,status,errors`。
- 导出 6 行数据 + 1 行表头；`errors` 用 `|` 连接；空时间为空字符串。
- 文件以 `EF BB BF`（UTF-8 BOM）开头。

### 实际证据

执行日期：2026-10-20

```text
$ pnpm test
client test: 1 passed (1), 2 passed (2)
server test: 5 passed (5), 68 passed (68)
合计：70 个测试通过
```

浏览器与下载文件实测：

```text
时间轴：6 条 bar；s1/s6 绿色；s2/s3/s4/s5 橙色；s4 右端截断。
筛选 Invalid 后导出 qc-report-qc-9bd7773d-....csv
BOM: True
行数: 7（1 表头 + 6 数据）
数据行: s1 VALID, s2 OVERLAP, s3 OVERLAP, s4 OUT_OF_BOUNDS,
        s5 EMPTY_ACTION, s6 VALID
```

### B03 测试映射

| 额外边界 | 测试位置 |
| --- | --- |
| 完全包含 + 乱序 | `server/tests/qc.rules.test.ts` —「完全包含且输入乱序时…」 |
| 多错误组合 | `server/tests/qc.rules.test.ts` —「多错误按固定顺序排列…」 |
| 重启后读取 | `server/tests/restart.test.ts` —「同一 SQLite 文件重启后…」 |
| 重复 segment_id | `server/tests/persistence.test.ts`、`server/tests/api.test.ts` |
| 带引号/逗号 CSV | `server/tests/csv.test.ts` —「支持引用字段内的逗号和转义双引号」 |
| 事务回滚 | `server/tests/persistence.test.ts` —「事务中途失败时回滚…」 |
| 导出转义 | `client/tests/csvExport.test.ts` |

### 自己检查时重点看什么

1. 时间轴比例是否与 `start_ms / durationMs` 一致，而不是简单地等宽排列。
2. 越界片段是否仍显示，并在右端有截断标记。
3. 切换筛选后导出，文件行数是否仍等于 `total`。
4. `action` 中含逗号/引号/换行时，CSV 是否仍可被正确解析。
5. 下载文件是否带 BOM。
6. B03 的每个额外边界是否都有对应测试名称。

### 已知限制（Phase 6）

- 时间轴不绘制时间无法解析的 Segment，只用文字提示数量。
- 导出是纯前端生成，不调用后端；数据来自当前 GET/POST 响应。
- 没有实现报告历史列表（题目不属于加分项）。

## Phase 7 — 文档与最终验收

### 设计原理

1. **README 是唯一启动入口**
   - 技术栈、Node/pnpm 版本、安装、数据库初始化、启动命令、端口、测试命令都写在 README。
   - 不在 README 之外假设额外步骤。
2. **干净副本验证**
   - 排除 `node_modules`、`dist`、`.git`、`server/data` 复制到临时目录；
   - 执行 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm build`、`pnpm db:init`；
   - 再用编译后的 `server/dist/index.js` 启动临时端口，验证 health。
3. **交付文档分工**
   - `README.md`：可运行入口与 T01–T15 结论；
   - `docs/DECISIONS.md`：用户明确拍板的 D-001～D-003；
   - `docs/PITFALLS.md`：真实踩坑；
   - `docs/VERIFICATION.md`：每阶段证据；
   - `docs/AI_USAGE.md`：AI 工具、生成范围、人工验证。
4. **视觉参考验证**
   - 只借鉴 phibotics.cn 的深色技术风格、紫色/暖橙点缀和细网格；
   - 未复制 logo、图片、文案、字体文件；UI 中全部为项目自有文字与 CSS。

### 验证命令

```bash
# 在仓库根目录
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm db:init
```

干净副本额外验证：

```bash
# 将仓库复制到临时目录，排除 node_modules / dist / .git / server/data
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm db:init

# 临时端口启动编译后的后端
PORT=3998 QC_DB_PATH=/tmp/qc-clean-test.sqlite node server/dist/index.js
curl -s http://127.0.0.1:3998/api/health
```

### 预期结果

- 干净副本安装成功，无锁文件漂移；
- `pnpm test`：70 passed；
- `pnpm build`：client / server 均成功；
- `pnpm db:init`：创建 `server/data/qc.sqlite` 和两张表；
- 编译后端启动后 health 返回 `{"status":"ok"}`；
- README 的 T01–T15 表全部有证据。

### 实际证据

执行日期：2026-10-20

```text
临时目录：/tmp/qc-clean
$ pnpm install --frozen-lockfile
Lockfile is up to date, resolution step is skipped
Packages: +179
Done

$ pnpm test
client: 1 file, 2 tests passed
server: 5 files, 68 tests passed
合计 70 passed

$ pnpm build
server build: Done
client build: ✓ built in 269ms

$ pnpm db:init
[db] initialized /private/tmp/qc-clean/server/data/qc.sqlite

$ PORT=3998 QC_DB_PATH=/tmp/qc-clean-test.sqlite node server/dist/index.js
[server] QC API listening on http://localhost:3998
[server] SQLite: /tmp/qc-clean-test.sqlite

$ curl -s http://127.0.0.1:3998/api/health
{"status":"ok"}
```

视觉与交互验收：

```text
- 上传示例 CSV -> 6 / 2 / 4
- 时间轴 -> 6 条 bar，s4 右端截断
- Invalid 筛选 -> 4 行，统计不变
- 导出 CSV -> 6 条数据 + 表头，带 BOM
- 刷新 -> Network GET /api/qc/{runId} 200
- 错误请求 -> 旧报告消失、URL 清空
```

### T01–T15 结论

全部 ✅ 已通过，逐项证据见 `README.md` 的验收清单与 `docs/PLAN.md` 第 12 节。
T14 为浏览器手工验收；其余场景均有自动化测试或 curl/进程重启证据。

### 自己检查时重点看什么

1. 按 README 从零执行，而不是跳过 `pnpm db:init` 或手工改端口。
2. 干净副本中 `pnpm test` 是否仍为 70 passed。
3. `pnpm build` 是否同时生成前后端产物。
4. 编译后的后端能否用临时 DB 启动并返回 health。
5. README 的 T01–T15 是否与 `docs/VERIFICATION.md` 的证据一致。
6. 视觉验收是否只借鉴风格，没有把官网资源带进仓库。

### 已知限制（最终）

- 不做报告历史列表、登录、视频播放、编辑/删除、分页。
- 无自动化浏览器 E2E；T14 手工验收。
- 重叠检查 O(n²)，面向 ≤100 条记录。
- 未公开边界口径按计划书 6.2 / 6.3 实现。
