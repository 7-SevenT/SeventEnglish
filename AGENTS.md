# SeventEnglish Agent 指南

个人英语阅读与听力练习工具。全栈单仓库：React 19 SPA + Cloudflare Workers (Hono) + D1 + R2。

## 基础协作规范

- 始终用中文回复。
- 每次功能开发或修复前，先询问是否使用 superpowers 插件工作流程。
- 每次 git 提交前，检查并更新 `README.md` / `AGENTS.md`（内容有变更时）。
- 使用 subagent 时默认当前模型；若认为其他模型更优，先说明理由并征得同意。
- 如果一件事情尝试多次未成功，先汇报，由用户决定是否继续。

## 项目结构

```
src/                前端 React SPA（页面 / 组件 / hooks / lib / api）
worker/src/         后端 Cloudflare Worker（Hono 路由 / db / auth / aiConfig / backup）
db/schema.sql       D1 建表脚本（与 worker/src/db.ts 内嵌的 defaultSchema 一致）
docs/superpowers/   设计文档（specs）与实施计划（plans）
```

## 常用命令

```bash
npm test                # vitest 全量测试
npx vitest run <path>   # 单文件测试
npx tsc --noEmit        # TypeScript 类型检查（strict）
npm run build           # 生产构建
npm run dev             # 本地开发（wrangler dev，127.0.0.1:8788）
npm run deploy          # 构建 + wrangler deploy
```

## 后端规范

- 数据 API 一律挂 `requireAuth` 中间件（`worker/src/auth.ts`），白名单仅 /api/login、/api/logout、/api/me、/api/health。
- 认证为无状态签名 cookie：`SESSION_SECRET` 做 HMAC-SHA256 签名，密码比对先 SHA-256 定长化再常数时间比较。
- AI API Key 与 WebDAV 密码用 `ENCRYPTION_KEY` 做 AES-GCM 加密后存入 D1，绝不返回明文。
- 数据库迁移写进 `applySchema`（幂等），新表/新列在此补充，不手工改线上库。
- 所有 id 参数、multipart 文件名做校验/净化，动态 SQL 字段用白名单。

## 前端规范

- 样式集中在 `src/styles.css`（CSS 变量三层 token 设计系统），页面不内联颜色，改动保持 token 一致。
- 图标用 `@phosphor-icons/react`；阅读标注用 Tiptap/ProseMirror 只读文档模型。
- 会话失效（401）统一走 `src/api/client.ts` 的 `notifyUnauthorized` 事件总线，由 `AuthContext` 决定登出。

## 浏览器自动化（playwright-cli）

- 浏览器会话长驻复用，打开方式必须加 `--headed` 和 `--persistent` 参数。
- `open` 只在浏览器未打开时执行一次，且不带 URL，用后台方式启动使命令立即返回。
- 打开后所有导航/操作一律用 `goto`、`click`、`snapshot` 等命令复用现有会话，绝不重复执行 `open`。
- 若命令疑似卡住（浏览器已开但命令无返回），先 `playwright-cli kill-all` 再重试，不要等它自己超时。

## MCP

- 网页搜索用 exa；查库/框架文档用 context7；搜索公开仓库代码用 searchcode。
