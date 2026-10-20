import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

// StrictMode 在开发期会重复执行 effect，用于提前暴露副作用问题。
// 当前的 health 检查是只读请求，重复执行不会改变后端状态。
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
