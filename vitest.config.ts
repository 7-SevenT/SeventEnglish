import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// vitest 不能加载含 Cloudflare Vite plugin 的 vite.config.ts（该插件与 vitest 不兼容），
// 因此为测试单独使用一份不含该插件的配置。
// 注：vite 8.x + vitest 4 存在上游 bug——测试全部通过后进程偶发不退出（dev server close() 挂起），
// 已在 scripts/test.mjs 中做超时兜底（不影响测试结果，仅防卡死）。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    passWithNoTests: true,
  },
});
