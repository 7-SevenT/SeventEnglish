# SeventEnglish 设计文档

英语阅读与听力练习应用 —— 框架设计与数据结构概览。

- 日期：2026-08-09
- 状态：已获用户批准（框架阶段）

## 一、项目目标

个人英语学习工具，核心功能：

1. **阅读**：文章按发布日期展示成时间线，点击进入详情页阅读（文章内容支持标记等富文本）。
2. **听力练习**：先选单词书 → 进入单词书选单元 → 播放单元内音频，通过输入拼写判对错。
3. **设置**：应用级设置界面。
4. **管理后台**：网页内发布文章、上传音频、创建单词书/单元。

细节功能（随机乱序等）与 UI 美化在框架完成后逐步迭代，不在本框架范围内。

## 二、技术选型

| 方面 | 选择 | 说明 |
|------|------|------|
| 托管 | Cloudflare Workers | 单 Worker 全栈托管 |
| 数据库 | Cloudflare D1 (SQLite) | 结构化数据 |
| 对象存储 | Cloudflare R2 | 音频文件等二进制 |
| 前端 | React 18 + Vite + TypeScript | SPA 单页应用 |
| API 框架 | Hono | 路由清晰，Worker 推荐框架 |
| 路由 | React Router | 客户端路由 |
| 认证 | 全站登录 | 密码存环境变量，HttpOnly cookie 会话 |

## 三、整体架构

单个 Cloudflare Worker 通过 Hono 同时处理：

- **静态资源**：构建后的 SPA 前端（Vite 产物）。
- **API**：`/api/*` 下的数据接口，直接访问 D1。

本地开发：`npm run dev`（wrangler dev）一条命令同时调试前后端。
部署：`wrangler deploy` 一键上线。

```
项目结构
SeventEnglish/
├── src/                  # 前端 React SPA 源码
│   ├── pages/
│   │   ├── Login.tsx           # 登录页
│   │   ├── Read.tsx            # 阅读页（时间线）
│   │   ├── ArticleDetail.tsx   # 文章详情
│   │   ├── Listen.tsx          # 听力页（选单词书）
│   │   ├── BookUnits.tsx       # 选单元
│   │   ├── Practice.tsx        # 单元听写练习
│   │   ├── Settings.tsx        # 设置页
│   │   └── admin/              # 管理后台
│   │       ├── ArticlesAdmin.tsx
│   │       ├── BooksAdmin.tsx
│   │       ├── UnitsAdmin.tsx
│   │       └── WordsAdmin.tsx
│   ├── components/       # 公共组件（导航栏等）
│   ├── api/              # API 客户端封装
│   └── ...
├── worker/               # Worker（Hono API + 认证 + 静态托管）
├── wrangler.toml         # Cloudflare 配置（D1/R2 绑定、环境变量）
├── db/
│   └── schema.sql        # D1 数据库结构
├── public/               # Vite 静态资源
├── index.html
└── vite.config.ts
```

## 四、页面结构与路由

```
/login                    登录页（未认证跳转至此）
/read                     阅读页：时间线，按发布日分组显示文章
/read/:articleId          文章详情页（渲染 Markdown，含标记）
/listen                   听力页：先选单词书
/listen/:bookId           选单元页
/listen/:bookId/:unitId   单元听写练习页（播放音频→输入→判对错）
/settings                 设置页
/admin                    管理后台
  /admin/articles         文章管理（新增/编辑/删除）
  /admin/books            单词书管理
  /admin/units            单元管理
  /admin/words            单词/音频管理（上传音频，文件名即答案）
```

导航栏包含：阅读、听力、设置、管理后台、退出登录。

## 五、数据模型（D1 / SQLite）

### 阅读模块

```sql
CREATE TABLE articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,        -- Markdown 正文，支持标记
  publish_date DATE NOT NULL,        -- 发布日期，时间线按此分组
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);
```

### 听力模块

```sql
CREATE TABLE word_books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES word_books(id),
  name        TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE words (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id     INTEGER NOT NULL REFERENCES units(id),
  word        TEXT NOT NULL,         -- 答案（单词本身）
  audio_key   TEXT NOT NULL,         -- R2 中的音频对象键
  sort_order  INTEGER DEFAULT 0
);
```

### 设置模块

```sql
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

> **设置页：保留极简骨架。** 导航项 + 空白设置容器保留，`settings` 表作为键值存储底子，`/settings` 页面暂时只显示占位内容。练习偏好、音频速度、学习统计等具体条目在后续迭代按需填入，不在本框架阶段实现。

## 六、核心交互逻辑

### 阅读时间线

```sql
-- 按发布日分组，倒序取
SELECT publish_date, GROUP_CONCAT(id || ':' || title) , COUNT(*)
FROM articles
GROUP BY publish_date
ORDER BY publish_date DESC;
```

点击文章进入 `/read/:id`，渲染 Markdown 内容。

### 听力练习流程

1. `/listen` 列出 `word_books`，选一个 → `/listen/:bookId`
2. 该页列出该书的 `units`，选一个 → `/listen/:bookId/:unitId`
3. 练习页加载该单元的 `words`（含 `word` 答案与 `audio_key`）：播放音频 → 用户在输入框输入 → 比对 `word` 判对错。
4. 音频从 R2 通过公开 URL 或签名 URL 播放。

（随机乱序等细化功能留待后续迭代补充。）

## 七、认证

- 全局登录保护：未认证请求一律重定向至 `/login`。
- Worker 校验密码字段与 `SITE_PASSWORD` 环境变量比对。
- 登录成功后下发 HttpOnly 签名 cookie 建立会话。
- 退出登录清除 cookie。
- SPA 端在请求 `/api` 时携带 cookie；401 时跳转登录页。

## 八、数据录入与管理后台

- 内置 `/admin` 管理界面，无需外部命令。
- 文章：表单填标题、发布日、Markdown 正文。
- 单词书 / 单元：名称与排序。
- 单词 / 音频：上传音频文件到 R2，**音频文件名即答案**，从文件名提取 `word` 存入 `words` 表，`audio_key` 指向 R2 对象。

## 九、范围与里程碑（框架阶段）

本框架阶段聚焦：

- [x] 项目脚手架（Vite + React + TS）
- [x] Worker（Hono API + 静态托管 + 认证）
- [x] D1 表结构 + 迁移/schema
- [x] 导航栏与全部路由占位页面
- [x] 登录系统
- [x] 管理后台骨架与数据读写

UI 美化、听力随机乱序、阅读标记交互等细化功能在框架完成后迭代实现。

## 十、测试与错误处理

- Worker API 通过单元测试验证（Hono 的 `app.request()` 可测）。
- D1 查询封装在数据访问层，便于替换/测试。
- API 错误返回统一 JSON 结构 `{ error: message }`。
- 前端对 API 错误做友好提示。
