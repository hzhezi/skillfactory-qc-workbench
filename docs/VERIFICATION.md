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
  - 右上角显示绿色 `API 正常`；
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

浏览器截图检查：页面标题、API 状态、深色背景和网格均正常显示。

### 自己检查时重点看什么

1. `pnpm typecheck` 是否两个包都通过，而不是只看客户端。
2. `pnpm build` 是否同时生成 `server/dist` 和 `client/dist`。
3. 直接访问 3001 和通过 5173 代理访问是否都返回 `200`。
4. 浏览器右上角是否显示 `API 正常`；若显示 `API 不可用`，先检查后端 3001 是否启动。
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
