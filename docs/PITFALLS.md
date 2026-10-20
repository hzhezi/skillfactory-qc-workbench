# 问题与解决方案记录

本文件记录开发过程中**真实踩过的坑**，用于避免重复排查，并为最终交付提供可靠性证据。

## 记录规则

- 只记录实际发生的问题，禁止事后编造或补写未发生的内容。
- 问题出现后先记录现象与报错原文；解决后补充根因与验证方式。
- 尚未解决的问题必须标注为「未解决」，不要伪装成已修复。
- 遇到疑似重复问题时，先检索本文件再开始排查。

## 记录格式

```markdown
### P-XXX 问题标题

- 日期：YYYY-MM-DD
- 阶段：环境 / CSV 解析 / QC 规则 / API / 数据库 / 前端 / 测试 / 其他
- 问题现象：……
- 报错信息：
  ```text
  原始报错
  ```
- 根因：……
- 解决方案：……
- 验证方式：实际执行的命令与结果
- 相关文件：`path/to/file:line`
- 状态：已解决 / 未解决 / 已规避
```

## 问题列表

| 编号 | 日期 | 阶段 | 问题现象 | 根因 | 解决方案 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P-001 | 2026-10-20 | 环境 / 依赖安装 | `pnpm install` 拒绝执行 esbuild 安装脚本 | pnpm 11 默认阻止依赖 postinstall；esbuild 需要运行 `install.js` 获取平台二进制；`package.json` 的 `pnpm` 字段已不再读取 | 执行 `pnpm approve-builds --all`，并在 `pnpm-workspace.yaml` 写入 `allowBuilds` | `pnpm install` 成功；`pnpm build` 中 Vite 正常构建 | 已解决 |
| P-002 | 2026-10-20 | 类型检查 / 构建 | server 的 `tsc` 报 `TS5108`，无法识别 `moduleResolution=node10` | 安装到 TypeScript 7.0.2，该版本移除了旧的 `node10` resolution | 将 `server/tsconfig.json` 改为 `module: Node16` + `moduleResolution: Node16` | `pnpm typecheck`、`pnpm build` 均通过 | 已解决 |
| P-003 | 2026-10-20 | CSV 解析 | 前导空白行导致合法表头被误判为 `INVALID_CSV` | `csv-parse` 在 `relax_column_count: false` 时把首条空白记录当成列数基准 | 改为 `relax_column_count: true`，过滤空白行后手动校验数据行列数 | `pnpm test` 42 个测试全部通过 | 已解决 |
| P-004 | 2026-10-20 | 环境 / 依赖安装 | 安装 `better-sqlite3` 时 tarball 下载卡住，命令超时 | 当前 registry 为 npmmirror，`better-sqlite3-13.0.3.tgz` 请求报错并反复重试 | 使用 `--registry=https://registry.npmjs.org` 重新安装；原生模块通过 node-gyp 编译成功 | `pnpm --filter server add better-sqlite3 --registry=...` 成功；持久化测试 11 个通过 | 已解决 |
| P-005 | 2026-10-20 | API / 模块解析 | API 测试与类型检查无法加载 `app.ts` 的依赖 | `app.ts` 位于 `src/` 根目录，却写成 `../qc/csv`、`../db/...`，实际应使用 `./qc/...`、`./db/...` | 修正相对导入路径 | `pnpm typecheck` 通过；`pnpm test` 68 个测试通过 | 已解决 |

### P-001 pnpm 11 忽略 esbuild 安装脚本

- 日期：2026-10-20
- 阶段：环境 / 依赖安装
- 问题现象：安装依赖时 pnpm 拒绝执行 esbuild 的 postinstall，导致 esbuild 平台二进制没有安装。
- 报错信息：

  ```text
  [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2

  Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
  ```

- 根因：pnpm 11 默认阻止依赖执行安装脚本；esbuild 需要运行 `install.js` 安装当前平台的二进制。另外，pnpm 提示 `package.json` 中的 `pnpm` 字段已不再读取，相关设置需要放到 `pnpm-workspace.yaml`。
- 解决方案：执行 `pnpm approve-builds --all`，并在 `pnpm-workspace.yaml` 中写入 `allowBuilds: { esbuild: true }`；后续安装的 `better-sqlite3` 也加入 `onlyBuiltDependencies`。
- 验证方式：重新执行 `pnpm install` 显示 `Done`；`pnpm build` 中 Vite 成功产出 `client/dist`。
- 相关文件：`pnpm-workspace.yaml`、`package.json`
- 状态：已解决

### P-002 TypeScript 7 移除 node10 moduleResolution

- 日期：2026-10-20
- 阶段：类型检查 / 构建
- 问题现象：server 包无法通过类型检查和构建。
- 报错信息：

  ```text
  server typecheck: tsconfig.json(5,25): error TS5108: Option 'moduleResolution=node10' has been removed. Please remove it from your configuration.
  ```

- 根因：当前安装的是 TypeScript 7.0.2，已移除 `moduleResolution: Node`（node10）选项；原配置沿用旧版写法。
- 解决方案：将 `server/tsconfig.json` 改为 `"module": "Node16"`、`"moduleResolution": "Node16"`，保持 CommonJS 输出语义。
- 验证方式：`pnpm typecheck` 两个 workspace 均 `Done`；`pnpm build` 两个 workspace 均 `Done`。
- 相关文件：`server/tsconfig.json:5`
- 状态：已解决

### P-003 csv-parse 把前导空白行当作列数基准

- 日期：2026-10-20
- 阶段：CSV 解析
- 问题现象：测试「忽略前导、中间和末尾的空白行」失败，合法表头被判定为结构错误。
- 报错信息：

  ```text
  QcInputError: CSV 结构错误：Invalid Record Length: expect 1, got 4 on line 3
  ```

- 根因：`csv-parse` 在 `relax_column_count: false` 且未设置 `columns` 时，会用第一条记录（这里是仅含空格的 `"  "` 行）推定列数；随后 4 列的表头就被认为列数不一致。原计划是在解析后过滤空白行，但解析器在过滤前已经抛错。
- 解决方案：将 `relax_column_count` 改为 `true`，让解析器先产出记录；过滤空白行后，再用表头长度手动校验每条数据行，仍然保留「列数不一致 → `INVALID_CSV`」的行为。
- 验证方式：`pnpm --filter server test` 中 `csv.test.ts` 29 个测试全部通过；`pnpm test` 共 42 个测试通过。
- 相关文件：`server/src/qc/csv.ts`、`server/tests/csv.test.ts`
- 状态：已解决

### P-004 better-sqlite3 下载源超时

- 日期：2026-10-20
- 阶段：环境 / 依赖安装
- 问题现象：安装 `better-sqlite3` 时 tarball 下载反复重试，命令超过 180 秒仍未结束。
- 报错信息：

  ```text
  [WARN] GET https://registry.npmmirror.com/better-sqlite3/-/better-sqlite3-13.0.3.tgz error (23). Will retry in 10 seconds. 2 retries left.
  [WARN] GET https://registry.npmmirror.com/better-sqlite3/-/better-sqlite3-13.0.3.tgz error (23). Will retry in 1 minute. 1 retries left.
  ```

- 根因：当前 pnpm registry 指向 npmmirror，该 tarball 请求失败并进入长重试；不是代码或 Node 版本问题。
- 解决方案：改用 npm 官方 registry 重新安装：`pnpm --filter server add better-sqlite3 --registry=https://registry.npmjs.org`。随后 node-gyp 在本机完成原生模块编译。
- 验证方式：安装输出 `Done`；`pnpm test` 中 `persistence.test.ts` 11 个测试通过，`pnpm db:init` 成功创建两张表。
- 相关文件：`server/package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`
- 状态：已解决

### P-005 app.ts 相对导入路径写错

- 日期：2026-10-20
- 阶段：API / 模块解析
- 问题现象：新增 HTTP 路由后，API 测试无法加载模块，restart 测试启动的后端进程也立即退出。
- 报错信息：

  ```text
  Error: Cannot find module '../qc/csv'
  Require stack:
  - server/src/app.ts
  - server/src/index.ts
  ```

- 根因：`app.ts` 位于 `server/src/`，`qc/` 和 `db/` 是它的同级目录；错误地写成了上一级路径 `../qc/csv`、`../db/qcRepository`。
- 解决方案：改为 `./qc/csv`、`./qc/errorCodes`、`./qc/rules`、`./db/qcRepository`。
- 验证方式：`pnpm typecheck` 通过；`pnpm test` 中 5 个测试文件、68 个测试全部通过，包含真实进程重启测试。
- 相关文件：`server/src/app.ts`
- 状态：已解决
