import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// vitest 不能加载含 Cloudflare Vite plugin 的 vite.config.ts（该插件与 vitest 不兼容），
// 因此为测试单独使用一份不含该插件的配置。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    passWithNoTests: true,
  },
});
