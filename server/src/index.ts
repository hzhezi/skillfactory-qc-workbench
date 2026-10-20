import { createApp } from "./app";

// 端口允许用环境变量覆盖，方便端口冲突时调整。
// 默认值与 README 中记录的后端地址保持一致。
const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}`);
}

const app = createApp();

app.listen(port, () => {
  console.log(`[server] QC API listening on http://localhost:${port}`);
});
