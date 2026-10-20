import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 开发期把 /api 代理到后端，前端代码始终使用相对路径。
// 这样浏览器不需要处理跨端口 CORS，后续部署时也可以复用同一路径。
// E2E 通过 VITE_PORT / VITE_API_TARGET 使用独立端口和临时数据库，避免污染开发环境。
const port = Number(process.env.VITE_PORT ?? 5173);
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
