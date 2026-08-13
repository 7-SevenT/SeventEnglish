// 部署入口：构建 → 移除 queue consumer → 重新部署（deploy 会重新创建 consumer）。
//
// 背景（2026-08-12 实测确认）：Cloudflare 平台存在 queue consumer 版本不跟随最新部署的问题
// （相关 issue：cloudflare/workers-sdk#6619）。wrangler deploy 更新 worker 版本后，
// 已存在的 consumer 仍继续运行旧版本代码——例如部署 300s fetch 超时版本后，
// consumer 仍执行 120s 旧版，分析结果与预期不符。手动 remove + deploy 后恢复。
// 因此每次部署前先移除 consumer，让 wrangler deploy 重新创建并绑定最新版本。
//
// 注意：build 失败时不执行 remove/deploy，避免把线上 consumer 弄丢。

import { execSync } from "node:child_process";

const QUEUE = "article-analysis";
const SCRIPT = "sevent-english";

// wrangler 默认从 dist/sevent_english/wrangler.json 读取配置，该文件由 @cloudflare/vite-plugin 在 build 时生成。
// 移除并重建 queue consumer 的 workaround 说明：
// Cloudflare 平台（workers-sdk#6619 等已知 issue）在 wrangler deploy 更新 worker 版本后，
// 已存在的 queue consumer 会继续运行旧版本代码，需要移除后重新 deploy 才能绑定最新版本。
// 2026-08-12 实测证实：deploy 300s 超时版本后 consumer 仍执行 120s 旧版长达 30+ 分钟，
// 移除 consumer 并重新部署后立即恢复。

function run(cmd, opts = {}) {
  console.log(`\n[deploy] 执行: ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

try {
  run("npm run build");

  try {
    run(`npx wrangler queues consumer remove ${QUEUE} ${SCRIPT}`);
  } catch {
    console.log(`[deploy] 移除 consumer 失败（可能不存在，忽略继续）`);
  }

  run("npx wrangler deploy");
  console.log("\n[deploy] 部署完成 ✓（queue consumer 已重建并绑定最新版本）");
} catch (error) {
  console.error("\n[deploy] 部署失败:", error.message);
  process.exit(1);
}
