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
