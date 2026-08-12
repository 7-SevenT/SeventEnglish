import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // host 固定为 IPv4 回环 127.0.0.1：Vite 默认可能绑定到 IPv6 的 [::1] localhost，
    // 会被本机 singbox 等代理拦截导致访问 000；改用 IPv4 回环直接走内核，绕过代理。
    // 固定开发端口为未被占用的 8788；strictPort 使端口被占用时报错而非自动换号。
    host: '127.0.0.1',
    port: 8788,
    strictPort: true,
  },
});
