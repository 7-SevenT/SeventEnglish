# 阅读页面与 AI 分析实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为文章上传流程接入 OpenAI 兼容 AI 分析，并实现按段落阅读、重点词汇折叠解释、任意文本标注/评论和持久化笔记。

**Architecture:** 文章原文继续保存在 `articles.content`，AI 分析作为校验后的 JSON 保存在文章字段中；用户标记和笔记使用独立 D1 表。Worker 负责 AI 调用、JSON 校验和 CRUD，React 负责段落渲染、选中文本工具栏、评论查看和笔记自动保存。

**Tech Stack:** React 19、TypeScript、Vite、Hono、Cloudflare Workers、D1、Vitest、原生 CSS。

## Global Constraints

- AI 使用 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`，API Key 只在 Worker 使用。
- AI 分析、用户标记、用户笔记必须分开保存。
- 原文按段落展示，重点词汇/短语加粗，每段分析使用折叠块。
- 标记支持用户选择任意文本，并保存文章全文偏移量与选中文本。
- AI 失败不能阻止原文阅读，失败结果不得展示给用户。
- 桌面端左文右笔记，移动端笔记放到文章底部。
- 不新增 UI 依赖，沿用 `src/styles.css` 设计 token。

---

### Task 1: 扩展 D1 schema 与数据库类型

**Files:**
- Modify: `db/schema.sql`
- Modify: `worker/src/db.ts`
- Modify: `worker/src/db.test.ts`
- Test: `worker/src/db.test.ts`

**Interfaces:**
- Produces `ArticleAnalysis`、`ParagraphAnalysis`、`HighlightItem`、`WritingSentence`、`Annotation`、`ArticleNote` 类型。
- Produces数据库函数：`getArticleAnnotations(db, articleId)`、`createAnnotation(db, articleId, data)`、`updateAnnotation(db, id, data)`、`deleteAnnotation(db, id)`、`getArticleNote(db, articleId)`、`upsertArticleNote(db, articleId, content)`。

- [ ] **Step 1: 编写失败测试**：验证 `applySchema` 创建 `annotations` 与 `article_notes`，并验证文章返回 `analysis_status`、`analysis_json`、`analysis_error` 字段。
- [ ] **Step 2: 运行测试确认失败**：`npx vitest run worker/src/db.test.ts`，预期因新表/字段不存在失败。
- [ ] **Step 3: 修改 schema**：为 `articles` 增加三个分析字段；创建 `annotations`（含 article_id、offset、selected_text、color、comment、时间字段）和 `article_notes`，并为 article_id 建索引。
- [ ] **Step 4: 同步 `defaultSchema` 与类型**：确保内嵌 schema 与 `db/schema.sql` 完全一致；增加分析 JSON 类型和数据库行类型。
- [ ] **Step 5: 实现数据库 CRUD**：所有查询使用参数绑定；`upsertArticleNote` 使用 article_id 唯一约束；删除文章时使用外键级联或在删除函数中显式清理关联数据。
- [ ] **Step 6: 运行测试确认通过**：`npx vitest run worker/src/db.test.ts`。
- [ ] **Step 7: 提交**：`git add db/schema.sql worker/src/db.ts worker/src/db.test.ts && git commit -m "feat: add article analysis annotations and notes schema"`。

### Task 2: 实现 AI JSON 校验与 OpenAI 兼容客户端

**Files:**
- Create: `worker/src/articleAnalysis.ts`
- Create: `worker/src/articleAnalysis.test.ts`
- Modify: `worker/src/auth.ts`（扩展 Env 类型）

**Interfaces:**
- `export function splitParagraphs(content: string): string[]`
- `export function extractJson(text: string): unknown`
- `export function validateArticleAnalysis(value: unknown, paragraphs: string[]): ArticleAnalysis`
- `export async function generateArticleAnalysis(env: Env, title: string, content: string): Promise<ArticleAnalysis>`

- [ ] **Step 1: 写失败测试**：覆盖空行分段、Markdown 代码块 JSON 提取、缺字段/错误类型拒绝、段落原文不一致拒绝、合法分析通过。
- [ ] **Step 2: 运行测试确认失败**：`npx vitest run worker/src/articleAnalysis.test.ts`。
- [ ] **Step 3: 实现纯函数**：按连续空行拆分段落；支持直接 JSON 和 ```json 代码块；校验 version、paragraphs、每段 index/original/translation/highlights/writing_sentences 及每个条目字段。
- [ ] **Step 4: 实现客户端**：向 `${OPENAI_BASE_URL}/chat/completions` 发送 `model`、system prompt、用户文章内容，并设置 JSON response format；检查 HTTP 状态，解析 content 后调用提取和校验函数。
- [ ] **Step 5: 运行测试确认通过**：`npx vitest run worker/src/articleAnalysis.test.ts`。
- [ ] **Step 6: 提交**：`git add worker/src/articleAnalysis.ts worker/src/articleAnalysis.test.ts worker/src/auth.ts && git commit -m "feat: add structured article analysis client"`。

### Task 3: 接入文章创建、分析状态与阅读 API

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `src/api/articles.ts`
- Modify: `src/api/admin.ts`
- Create: `worker/src/articles-api.test.ts`

**Interfaces:**
- `POST /api/articles` 创建文章后启动分析并返回 `analysis_status`。
- `POST /api/admin/articles/:id/analyze` 重新分析。
- `GET /api/articles/:id` 返回文章、annotations、note。
- 前端产生 `createAnnotation`、`updateAnnotation`、`deleteAnnotation`、`getArticleNote`、`saveArticleNote`、`reanalyzeArticle` API 函数。

- [ ] **Step 1: 写 Worker API 失败测试**：验证创建文章先保存原文；AI 成功变为 completed；AI 失败变为 failed；失败仍返回文章；非法文章 id 返回 404。
- [ ] **Step 2: 运行测试确认失败**：`npx vitest run worker/src/articles-api.test.ts`。
- [ ] **Step 3: 实现文章分析流程**：创建文章时写入 pending/processing，调用 `generateArticleAnalysis`，成功更新 JSON 和 completed，异常写入安全错误和 failed；不要把 API Key 或完整上游错误返回给客户端。
- [ ] **Step 4: 实现重新分析路由**：验证 id 和文章存在，更新 processing，调用同一分析函数并返回最新文章。
- [ ] **Step 5: 扩展详情聚合响应**：读取文章、标记和笔记，返回统一详情对象。
- [ ] **Step 6: 添加标记/笔记路由**：参数校验 offset、color、selected_text；限制评论和笔记为字符串；使用数据库 CRUD。
- [ ] **Step 7: 实现前端 API 封装**：保持现有 `apiFetch` 风格，并导出明确的 TypeScript 类型。
- [ ] **Step 8: 运行测试确认通过**：`npx vitest run worker/src/articles-api.test.ts worker/src/articleAnalysis.test.ts`。
- [ ] **Step 9: 提交**：`git add worker/src/index.ts src/api/articles.ts src/api/admin.ts worker/src/articles-api.test.ts && git commit -m "feat: expose article analysis annotation and note APIs"`。

### Task 4: 构建段落阅读与 AI 折叠分析组件

**Files:**
- Create: `src/components/ArticleParagraph.tsx`
- Create: `src/components/ArticleAnalysisPanel.tsx`
- Modify: `src/pages/ArticleDetail.tsx`
- Modify: `src/styles.css`
- Create: `src/components/ArticleParagraph.test.tsx`

**Interfaces:**
- `ArticleParagraph` 接收 `ParagraphAnalysis`、当前文章标记和文本选择回调。
- `ArticleAnalysisPanel` 接收 `ParagraphAnalysis`，通过 `<details>` 展示词汇、短语、翻译和写作句子。

- [ ] **Step 1: 写组件测试**：验证重点词/短语使用 `<strong>`，折叠内容默认不展开，展开后出现 meaning/usage/translation/writing sentence；无分析时仅显示原文。
- [ ] **Step 2: 运行测试确认失败**：`npx vitest run src/components/ArticleParagraph.test.tsx`。
- [ ] **Step 3: 实现文本分段渲染**：依据 AI highlights 在原文中匹配词/短语，未匹配时保留原文，不使用 `dangerouslySetInnerHTML`。
- [ ] **Step 4: 实现折叠面板**：使用语义化 `<details><summary>`，为重点词汇、翻译和写作句子提供清晰标题。
- [ ] **Step 5: 改造 `ArticleDetail`**：按分析 paragraphs 渲染；分析处理中/失败/完成分别展示状态；分析失败仍展示原始段落；添加重新分析按钮。
- [ ] **Step 6: 添加左右布局与移动端 CSS**：文章区和笔记区使用 grid；`@media` 下变为单列；沿用现有 token。
- [ ] **Step 7: 运行测试确认通过**：`npx vitest run src/components/ArticleParagraph.test.tsx`。
- [ ] **Step 8: 提交**：`git add src/components/ArticleParagraph.tsx src/components/ArticleAnalysisPanel.tsx src/pages/ArticleDetail.tsx src/styles.css src/components/ArticleParagraph.test.tsx && git commit -m "feat: render paragraph article analysis"`。

### Task 5: 实现任意文字荧光标记与隐藏评论

**Files:**
- Create: `src/components/TextAnnotationToolbar.tsx`
- Create: `src/components/AnnotatedArticleText.tsx`
- Create: `src/hooks/useTextSelection.ts`
- Modify: `src/components/ArticleParagraph.tsx`
- Modify: `src/styles.css`
- Create: `src/components/AnnotatedArticleText.test.tsx`

**Interfaces:**
- `useTextSelection()` 返回 `{ selection, clearSelection }`，selection 含 start_offset、end_offset、selected_text。
- `AnnotatedArticleText` 接收原文和 `Annotation[]`，触发 `onCreateAnnotation`、`onUpdateAnnotation`、`onDeleteAnnotation`。

- [ ] **Step 1: 写失败测试**：验证选中文本生成正确 offset；黄色标记渲染为 `<mark>`；评论默认隐藏、点击评论标识后显示；删除标记触发回调。
- [ ] **Step 2: 运行测试确认失败**：`npx vitest run src/components/AnnotatedArticleText.test.tsx`。
- [ ] **Step 3: 实现选区 hook**：使用 `window.getSelection()`，通过 Range 起点/终点计算相对文章全文的 offset；忽略跨段选择并清理空选择。
- [ ] **Step 4: 实现工具栏**：桌面端选区附近显示荧光标记/添加评论；移动端使用固定底部操作栏；评论为空不提交。
- [ ] **Step 5: 实现安全文本分片**：按 offset 切分文本，用 `<mark>` 和评论按钮渲染，不拼接 HTML；无效 offset 或 selected_text 不匹配时跳过并显示失效状态。
- [ ] **Step 6: 接入 paragraph 与 API**：创建、更新、删除成功后更新本地状态；失败时保留 UI 状态并显示重试提示。
- [ ] **Step 7: 运行测试确认通过**：`npx vitest run src/components/AnnotatedArticleText.test.tsx`。
- [ ] **Step 8: 提交**：`git add src/components/TextAnnotationToolbar.tsx src/components/AnnotatedArticleText.tsx src/hooks/useTextSelection.ts src/components/ArticleParagraph.tsx src/styles.css src/components/AnnotatedArticleText.test.tsx && git commit -m "feat: add text highlighting and comments"`。

### Task 6: 实现文章笔记自动保存与完成阅读页面

**Files:**
- Create: `src/components/ArticleNotes.tsx`
- Modify: `src/pages/ArticleDetail.tsx`
- Modify: `src/styles.css`
- Create: `src/components/ArticleNotes.test.tsx`

**Interfaces:**
- `ArticleNotes` 接收 `articleId`、初始 note 内容，调用 `saveArticleNote(articleId, content)`。

- [ ] **Step 1: 写失败测试**：验证初始内容展示，编辑后 debounce 调用保存，保存中/成功/失败状态正确显示。
- [ ] **Step 2: 运行测试确认失败**：`npx vitest run src/components/ArticleNotes.test.tsx`。
- [ ] **Step 3: 实现 500ms 防抖保存**：组件卸载时清理 timer；保存失败保留编辑内容并显示重试按钮。
- [ ] **Step 4: 接入详情页**：桌面端右侧 sticky，移动端文章下方可折叠；详情 API 返回的 note 作为初始值。
- [ ] **Step 5: 运行测试确认通过**：`npx vitest run src/components/ArticleNotes.test.tsx`。
- [ ] **Step 6: 提交**：`git add src/components/ArticleNotes.tsx src/pages/ArticleDetail.tsx src/styles.css src/components/ArticleNotes.test.tsx && git commit -m "feat: add persistent article notes"`。

### Task 7: 完成管理员状态展示、配置文档与全量验证

**Files:**
- Modify: `src/pages/admin/ArticlesAdmin.tsx`
- Modify: `src/api/admin.ts`
- Modify: `README.md`
- Modify: `.dev.vars.example`（如项目已有同类示例文件则在该文件补充）

- [ ] **Step 1: 为管理员页面写失败测试**：创建/编辑后显示 AI 分析状态；失败文章显示重新分析按钮；重新分析后刷新文章列表状态。
- [ ] **Step 2: 运行对应测试确认失败**：`npx vitest run src/pages/admin/ArticlesAdmin.test.tsx`。
- [ ] **Step 3: 实现状态展示与重新分析**：列表或编辑区显示 pending/processing/completed/failed 中文状态；失败时调用 reanalyze API；避免重复点击。
- [ ] **Step 4: 更新环境变量文档**：说明 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`，强调 Key 只配置在 Worker secret，不进入前端。
- [ ] **Step 5: 运行全量验证**：`npm test`、`npm run build`。
- [ ] **Step 6: 检查数据库 schema 与 README 文档一致**：确认新表和分析字段可由 `health` 幂等创建。
- [ ] **Step 7: 提交**：`git add src/pages/admin/ArticlesAdmin.tsx src/api/admin.ts README.md .dev.vars.example && git commit -m "feat: show article analysis status and document AI config"`。
