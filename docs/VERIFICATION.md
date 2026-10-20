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
