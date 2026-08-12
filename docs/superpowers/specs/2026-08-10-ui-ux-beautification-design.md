# UI/UX 美化设计 — SeventEnglish

日期：2026-08-10

## 背景与目标

SeventEnglish 是一个个人英语阅读与听力练习工具（React 19 + Vite + Cloudflare Workers 全栈 SPA）。当前前端**完全没有 CSS 样式**（无任何 css 文件），所有页面为纯裸 HTML 元素。目标是做一次全面的 UI/UX 美化升级，建立统一、清爽、现代、专注阅读的视觉体系。

- 方案：**原生 CSS 设计系统**（CSS 变量 + 语义 token，无额外依赖，契合 Workers 精简栈）。
- 风格：**清爽现代・专注阅读**，浅色为主。
- 范围：全部 10 个页面（Login / Read / ArticleDetail / Listen / BookUnits / Practice / Settings / AdminLayout / ArticlesAdmin / BooksAdmin）+ 全局骨架（Nav）。

## 设计 Token

三层 token：primitive（原始值）→ semantic（语义别名）→ component（组件级）。

### 1.1 原色板（Primitive）

| Token | 值 | 说明 |
|---|---|---|
| `--c-gray-50` | `#FAFAF8` | 页面背景（暖白，利于长时间阅读） |
| `--c-gray-100` | `#F3F4F6` | 次级背景 / 卡片块 |
| `--c-gray-200` | `#E5E7EB` | 边框 |
| `--c-gray-500` | `#6B7280` | 次要文字 |
| `--c-gray-900` | `#1F2937` | 主要文字（墨黑） |
| `--c-teal-600` | `#0D9488` | 强调主色（青绿，冷静专注） |
| `--c-teal-700` | `#0F766E` | 强调 hover/深色 |
| `--c-teal-50` | `#F0FDFA` | 强调浅底 |
| `--c-green-600` | `#16A34A` | 成功 / 正确 |
| `--c-red-600` | `#DC2626` | 危险 / 错误 |

### 1.2 语义别名（Semantic）

| Token | 引用 |
|---|---|
| `--bg` | `var(--c-gray-50)` |
| `--bg-soft` | `var(--c-gray-100)` |
| `--border` | `var(--c-gray-200)` |
| `--fg` | `var(--c-gray-900)` |
| `--fg-muted` | `var(--c-gray-500)` |
| `--primary` | `var(--c-teal-600)` |
| `--primary-hover` | `var(--c-teal-700)` |
| `--primary-soft` | `var(--c-teal-50)` |
| `--success` | `var(--c-green-600)` |
| `--danger` | `var(--c-red-600)` |

### 1.3 字体与排版

- 全局字体栈（系统字体，无外链）：
  ```
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  ```
- **文章阅读正文**用衬线增强可读性：
  ```
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
  ```
- 字阶：`--fs-sm: 0.875rem`、`--fs-base: 1rem`、`--fs-lg: 1.125rem`、`--fs-xl: 1.375rem`、`--fs-2xl: 1.75rem`。
- 行高：正文 `1.75`，标题 `1.3`。

### 1.4 间距 / 圆角 / 阴影

- 间距基准 4px：`--space-1..6`（`.25rem / .5rem / .75rem / 1rem / 1.5rem / 2rem`）。
- 圆角：`--radius-sm: .375rem`、`--radius: .5rem`、`--radius-lg: .75rem`。
- 阴影：`--shadow-sm: 0 1px 2px rgb(0 0 0/.05)`、`--shadow-md: 0 4px 12px rgb(0 0 0/.06)`、`--ring: 0 0 0 3px rgb(13 148 136/.2)`（焦点）。

### 1.5 组件级 token

- `--btn-bg: var(--primary)`、`--btn-bg-hover: var(--primary-hover)`。
- `--card-bg: #fff`、`--card-border: var(--border)`、`--card-radius: var(--radius-lg)`。

## 布局与骨架

- **顶部吸顶导航**（`src/components/Nav.tsx`，当前为返回 `null` 的空组件）：
  - 左侧品牌"SeventEnglish"，右侧链接：阅读 / 听力 / 设置 / 管理。
  - 白色头部、底部细边框、吸顶（`position: sticky`）、活动链接高亮强调色 + 浅底。
- **内容容器**：`.container` 居中 `max-width: 760px`（`--container-read` 详情页 720px），`padding: 0 1.5rem`。
- 全局响应式：移动端单列、字号微调。
- 链接、按钮、输入框的中性重置，保证各组件一致性。

## 各页面处理

| 页面 | 处理 |
|---|---|
| **Login** | 全屏居中卡片（白底圆角+阴影），标题"登录"，密码输入 + 主按钮"登录"，错误用红色文字徽标。 |
| **Read 时间线** | 日期作为页面分组的左侧强调小标题；文章呈现为卡片行，title 链接 hover 变色 + 箭头；空态提示"暂无文章"。 |
| **ArticleDetail** | 返回链接"← 返回时间线"；衬线正文阅读排版（宽 720px、行高 1.75、段距）、发布日期置灰。 |
| **Listen 单词书** | 卡片网格（`grid`，移动端单列）；卡片含书名（强调）与描述（灰色）。空态提示。 |
| **BookUnits 单元** | 返回链接"← 返回单词书"；单元卡片列表，行内编号。 |
| **Practice 听写** | 居中练习卡片：进度"第 x / n 题"、音频控件、输入框、提交/下一题按钮；正确→绿色"正确 ✅"，错误→红色"错误 ❌ 正确答案：x"。完成态文案。 |
| **Settings** | 卡片化设置区 + 次级说明文字 + 危险色"退出登录"按钮。 |
| **AdminLayout** | 页头"管理后台" + Tab 式导航（文章/单词书，`NavLink` 活动态）。 |
| **ArticlesAdmin** | 表单卡片（标题/日期/内容 textarea）带栅格；文章列表行 hover；编辑/删除按钮；"暂存为空"校验错误红色提示；绿 success / 红 error 消息。 |
| **BooksAdmin** | 单词书卡片（可展开）+ 新增表单；单元内嵌行 + 上传表单；删除均用危险色，`window.confirm` 保留。 |

## 交互细节

- 按钮变体：主按钮（青绿实底）/ 次级（透明描边）/ 危险（红色）。统一 hover、active、disabled、focus ring。
- 输入框：1px 描边、focus 青绿 ring、内边距统一。
- 卡片 hover 过渡：背景微变 + 轻阴影抬升（`transition`）。
- 反馈：success（绿）/ error（红）统一消息条风格。
- 顶栏导航活动态：青绿文字 + 浅青底。

## 范围边界（非目标）

- 不动任何后端 / API / 数据层 / 路由逻辑，仅改 `src/**` 的 JSX 结构与新增样式。
- 不引入 Tailwind / shadcn / 外链字体 / 任何新 npm 依赖。
- 不实现基础功能以外的 Markdown 渲染 / 暗色主题（后续迭代）。
- 保留现有 `window.confirm` 删除确认逻辑不变。

## 实现方式

- 新增 `src/styles.css`（全部设计系统 + 组件样式，按 token → reset → layout → 组件分组）。
- 在 `src/main.tsx` 引入 `import "./styles.css"`。
- 逐个修改 `src/pages/**` 与 `src/components/Nav.tsx`，为元素补齐 `className`，去掉内联的 `style={{ color: "red" }}` 等，改用语义 CSS 类。
- 校验：`npm run build`（TypeScript + Vite 构建通过）。
