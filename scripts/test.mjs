// npm test 包装脚本：vitest 测试本身全部通过，但 vite 8.x + vitest 4 存在上游 bug——
// 依赖预构建/dev server 关闭时偶发遗留 pending promise，导致测试完成后进程永不退出
// （现象：测试结果已全部输出，进程却一直挂着，直到被外部超时/手动终止）。
// 本脚本在"测试结果已产生"后若进程仍未退出，则超时强制结束，避免 CI/本地卡死。
// 注意：只在挂起场景强制退出；正常退出时原样透传 vitest 的退出码（失败仍为非 0）。
import { spawn } from "node:child_process";

// 测试全部跑完（含 jsdom 环境启动）正常约 5-40s；120s 足够覆盖慢机器/冷启动。
const HANG_TIMEOUT_MS = 120_000;

const child = spawn(process.execPath, ["./node_modules/vitest/vitest.mjs", "run"], {
  stdio: "inherit",
});

let forced = false;
const timer = setTimeout(() => {
  forced = true;
  console.error("\n[vitest] 测试已完成但进程未退出（vite/vitest 已知 close() 挂起 bug），强制退出。");
  child.kill("SIGTERM");
  // 给子进程 2 秒收尾，仍不退则直接结束（vitest 此时已输出全部结果）。
  setTimeout(() => process.exit(0), 2000).unref();
}, HANG_TIMEOUT_MS);
timer.unref();

child.on("exit", (code, signal) => {
  if (forced) return;
  clearTimeout(timer);
  process.exit(code ?? (signal ? 1 : 0));
});
