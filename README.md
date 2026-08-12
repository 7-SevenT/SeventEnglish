# SeventEnglish

个人英语阅读与听力练习工具。

- **阅读**：文章按发布日期生成时间线，支持 Markdown 与标记。
- **听力练习**：单词书 → 单元 → 听写练习。听写为**分轮循环**：一页展示当轮全部空位与小圆点播放列表，支持整体开始/暂停；每音频间隔 5 秒自动顺序播放，当前播放项高亮，点圆点可复听（进行中回听当前项后仍续播）；全部播完才统一提交判对错，错词随机重排进入下一轮循环，直到全部正确完成一大轮。每个空位为一个单独输入框（无占位提示），答案含 `$ £ € °C` 等符号时自动预填在输入框两侧（只读，用户不需输入），`%` 需用户自行填写；用户只需输入听到的核心内容，判定时忽略大小写、多余空格与千分位逗号（如 500,000 与 500000 均判对）。
- **设置**：应用级设置。
- **管理后台**：网页内发布文章、**多选音频批量上传**（以音频文件名作为答案词，一次可多选文件）并管理单词书/单元。

## 技术栈

- 前端：React 19 + Vite + TypeScript（SPA）
- 阅读标注：Tiptap/ProseMirror 只读文档模型（跨段落选区、荧光 Mark 与绑定评论）
- 前端样式：原生 CSS 设计系统（`src/styles.css`，CSS 变量三层 token，无额外依赖），清爽现代・专注阅读风格
- 后端：Cloudflare Workers + Hono，全栈单 Worker
- 数据库：Cloudflare D1 (SQLite)
- 存储：Cloudflare R2（音频文件）
- 认证：全站登录（`LOGIN` 存于环境变量，当前值为 `sevent`，`POST /api/login` / `POST /api/logout` / `GET /api/me`），前端 `AuthContext` + `RequireAuth` 路由守卫（未登录重定向 `/login`，登录后跳回来源页，刷新经 `/api/me` 保持登录），无状态签名 cookie 认证——会话 token 由 `ENCRYPTION_KEY` 经 HKDF-SHA256 派生签名密钥（域分离：AES-GCM 加密与 HMAC 签名使用不同派生密钥材料）做 HMAC-SHA256 签名（`payload.signature`，payload 为签发 epoch 毫秒，7 天有效）直接置于 httpOnly cookie，服务器验签自校验，不依赖 DB/KV 会话状态
- 安全：密码比对先将 LOGIN 与输入各自 SHA-256 散列为定长串再常数时间比较，消除密码长度侧信道；AI API Key 使用 ENCRYPTION_KEY 通过 AES-GCM 加密后存入 D1，不返回明文
- 数据 API 鉴权：除 /api/login / /api/logout / /api/me / /api/health 公开外，其余 /api/* 均需登录。统一由 `worker/src/auth.ts` 导出的 `requireAuth` 中间件按数据集前缀挂载（如 `/api/articles`、`/api/articles/*`），后续 /api/books、/api/units、/api/words 一律照此复制挂载。未认证返回 401 `{error:"unauthorized"}`

## 开发

```bash
npm install
npm run dev        # wrangler dev，本地调试前后端（127.0.0.1:8788）
npm test           # vitest 全量测试
npx tsc --noEmit   # TypeScript 类型检查
npm run build      # 生产构建
```

## 数据层

- 数据库表结构：`db/schema.sql`（articles / word_books / units / words / settings / annotations / article_notes）。
- 阅读标注数据：annotation 使用 ProseMirror `from_position/to_position`；从旧版 `start_offset/end_offset` 升级时会清空旧荧光标记和评论，不迁移文章与笔记。
- 数据访问层：`worker/src/db.ts`（`applySchema` + 查询函数，`defaultSchema` 已内嵌 schema 原文）。
- 测试：`npm test` 全量运行；数据层单测 `npx vitest run worker/src/db.test.ts`（mock D1）。

## 部署

```bash
npm run deploy   # npm run build + wrangler deploy
```

### 部署清单（建表）

首次部署（或更换空白 D1 数据库）需先显式建表，否则所有数据 API 会因表不存在而报错：

```bash
# 1. 显式建表（推荐，sqlite schema 原文与 db.ts 的 defaultSchema 一致）
npx wrangler d1 execute <database_name> --file=./db/schema.sql --remote
```

其中 `<database_name>` 替换为 `wrangler.toml` 中 d1_databases 的 `database_name`（如 `sevent-english-db`）。

> **本地/部署绑定说明**：`wrangler.toml` 已启用 D1(`DB`) 与 R2(`BUCKET`) 绑定并回填生产资源（D1 `sevent-english-db`、R2 `sevent-english-assets`，均已在云端创建）。本地 dev 时 wrangler 会在 `.wrangler/state` 维护本地 sqlite / Miniflare 对象存储，无需真实云端资源即可本地跑通数据流。生产环境变量/密钥（`LOGIN` / `ENCRYPTION_KEY`）不写入配置文件，通过 `npx wrangler secret put <KEY> --name sevent-english` 单独配置。

**兜底机制**：`GET /api/health`（公开探活端点）会在每次被调用时执行幂等的 `applySchema`（`CREATE TABLE IF NOT EXISTS`），可作为建表兜底。部署后调用一次 `health` 即自动建表；显式 `d1 execute` 与 health 兜底二者不冲突，可都保留。

本地开发也可用等价方式初始化 D1：

```bash
npx wrangler d1 execute <database_name> --file=./db/schema.sql
```

详见 [设计文档](docs/superpowers/specs/2026-08-09-seventenglish-design.md)。阅读页面与 AI 雅思分析方案见 [阅读分析设计](docs/superpowers/specs/2026-02-14-reading-analysis-design.md)，实施步骤见 [阅读分析实施计划](docs/superpowers/plans/2026-02-14-reading-analysis.md)。段落分析总折叠块设计见 [设计文档](docs/superpowers/specs/2026-08-21-reading-analysis-disclosure-design.md)，实施计划见 [实施计划](docs/superpowers/plans/2026-08-21-reading-analysis-disclosure.md)。数据库分析基础测试位于 `worker/src/db.test.ts`。AI 分析客户端测试位于 `worker/src/articleAnalysis.test.ts`。文章分析接口测试位于 `worker/src/articles-api.test.ts`。段落阅读组件测试位于 `src/components/ArticleParagraph.test.tsx`。文章任意文本标记与评论通过 `ReadingDocument` 的 Tiptap/ProseMirror Mark 保存。文章笔记由 `ArticleNotes` 防抖自动保存。阅读页 UI 参考 ecoSite 的暖米色、深红和衬线卡片风格；重点词/短语在正文中仅使用黑体加粗，每段原文下面紧跟该段词汇、段落翻译与写作句型折叠解析；跨段落划词后会出现受视口边界约束的荧光/评论工具栏，评论以独立弹层展示，删除标记使用带遮罩的现代确认对话框。划词本身不会保存荧光，只有点击工具栏后才会创建标记。

管理后台全链路重构设计见 [管理工作台设计](docs/superpowers/specs/2026-08-12-admin-workbench-design.md)，包含文章、听写、AI模型三个工作台模块及加密 AI 配置方案。导航模式重构见 [导航栏设计](docs/superpowers/specs/2026-08-12-admin-navigation-design.md)，区分学习模式与管理模式。

### AI 配置

复制 `.dev.vars.example` 为本地 `.dev.vars`，设置 `LOGIN` 和 `ENCRYPTION_KEY`。AI 的 Base URL、API Key 和模型名在管理后台的「AI模型」页面配置；API Key 会使用 `ENCRYPTION_KEY` 加密后存入 D1。已有 D1 数据库会在首次访问数据 API 时自动补齐文章分析字段和新表；AI 分析在后台执行，阅读页会自动轮询状态。也可以手动访问 `/api/health` 执行迁移。

### 前端样式

UI 样式集中在 `src/styles.css`（设计系统 + 组件样式），在 `src/main.tsx` 引入。页面组件以语义化 `className` 引用样式，不内联颜色。改动样式/页面时保持设计 token 一致。

导航使用 `@phosphor-icons/react` 图标库：学习端桌面顶部导航与移动端底部 Tab 均带图标（阅读/听力/统计/管理）；顶部导航页面链接靠左紧邻品牌，云端备份/恢复（WebDAV）与退出登录按钮独立置于右侧；管理端保留侧边栏结构且使用与学习端一致的浅色配色，侧边栏含文章/听写/AI模型/设置四个模块。登录页为独立全屏界面（不显示顶部导航栏），居中卡片式设计（品牌 logo + 访问密码 + 背景光斑），风格与 SeventFinance 一致。

WebDAV 云端备份：WebDAV 地址/用户名/密码在管理后台「设置」模块配置（密码用 `ENCRYPTION_KEY` 加密存储），导航栏按钮一键备份/恢复全库（articles/word_books/units/words/annotations/article_notes/settings），备份文件位于 WebDAV 的 `SeventEnglish/seventenglish-backup.json`；后端实现见 `worker/src/backup.ts` 与 `worker/src/webdavConfig.ts`。学习端 `/stats` 为统计页占位（待实现）。
