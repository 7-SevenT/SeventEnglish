# SeventEnglish 管理工作台重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理后台重构为「文章 / 听写 / AI模型」三模块的现代化工作台，并用抽屉式文章录入、可恢复的批量音频导入和加密 AI 配置替换现有管理流程。

**Architecture:** 保留现有 React Router、原生 CSS 设计系统和 Hono API。后台由 `AdminLayout` 提供侧边导航和抽屉层，三个页面模块分别管理自己的列表与录入状态；Worker 新增 AI 配置/加密服务与 OpenAI 兼容上游服务，文章分析从 D1 读取配置而不是读取旧的 `OPENAI_*` 环境变量。现有用户侧阅读、听力页面和基础 CRUD API 保持兼容。

**Tech Stack:** React 19、React Router 7、TypeScript、Vitest、Testing Library、Cloudflare Workers、Hono、D1、R2、Web Crypto AES-GCM、原生 CSS token。

## Global Constraints

- 管理后台一级功能固定为：文章、听写、AI模型。
- 管理后台采用左侧导航、主工作区和右侧抽屉；移动端抽屉退化为全屏面板。
- 文章日期默认当天；正文支持粘贴或 Markdown/TXT 文件导入，并在抽屉内预览。
- 听写导入支持多个音频文件，文件名去扩展名后作为默认答案，每个文件可独立修正、显示进度和重试。
- AI 上游使用 OpenAI 兼容协议：`GET /models` 与 `/chat/completions`。
- API Key 使用 `ENCRYPTION_KEY` 通过 AES-GCM 加密后存入 D1 `settings`；前端和 API 响应不得返回明文。
- 登录密码环境变量改为 `LOGIN`，当前部署值为 `sevent`；`SESSION_SECRET` 继续用于会话签名。
- 删除 `SITE_PASSWORD`、`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL` 的运行时依赖，不做旧 AI 配置自动迁移。
- 不引入第三方 UI 框架；继续使用 `src/styles.css` 的设计 token。
- 不回滚或覆盖工作区中与阅读标注/文章分析相关的现有未提交改动。
- 每个任务必须先写失败测试，再写最小实现，并单独运行相关测试。
- 每次提交只暂存本任务明确列出的文件，不能把既有未提交改动带入提交。

---

## 文件地图

### Worker

- `worker/src/auth.ts`：认证环境变量类型与登录校验。
- `worker/src/aiConfig.ts`：AI 配置类型、AES-GCM 加解密、D1 设置读写和脱敏转换。
- `worker/src/aiProvider.ts`：OpenAI 兼容 `/models`、连接测试和上游错误转换。
- `worker/src/articleAnalysis.ts`：改为消费解密后的运行时 AI 配置。
- `worker/src/db.ts`：扩展分析状态和听写管理概览查询。
- `worker/src/index.ts`：AI 管理 API、听写概览 API、文章分析配置注入。
- `worker/src/auth.test.ts`、`worker/src/index.test.ts`、`worker/src/db.test.ts`：现有认证、路由、数据库测试。
- `worker/src/aiConfig.test.ts`、`worker/src/aiProvider.test.ts`、`worker/src/ai-admin-api.test.ts`：新增测试。

### 前端

- `src/App.tsx`：新增 `/admin/dictation`、`/admin/ai-model` 路由并保留旧路由重定向。
- `src/api/admin.ts`：新增 AI 配置、模型列表、连接测试和听写概览客户端函数。
- `src/api/articles.ts`：补充管理列表需要的文章数据类型或复用现有类型。
- `src/lib/adminImport.ts`：文章文件解析、音频类型判断、文件名答案解析。
- `src/lib/adminImport.test.ts`：导入工具测试。
- `src/pages/admin/AdminLayout.tsx`：工作台外壳。
- `src/pages/admin/ArticlesAdmin.tsx`：文章列表与工作台状态。
- `src/pages/admin/DictationAdmin.tsx`：听写单词书/单元管理。
- `src/pages/admin/AiModelAdmin.tsx`：AI 配置页。
- `src/pages/admin/BooksAdmin.tsx`：保留旧模块导出兼容，避免外部引用失效。
- `src/components/admin/AdminSidebar.tsx`、`AdminHeader.tsx`、`AdminDrawer.tsx`、`AdminToast.tsx`、`StatusBadge.tsx`、`EmptyState.tsx`：后台基础组件。
- `src/components/admin/ArticleEditorDrawer.tsx`：文章新增/编辑抽屉。
- `src/components/admin/DictationImportDrawer.tsx`、`UploadQueue.tsx`：听写导入队列。
- `src/components/admin/*.test.tsx`：后台组件交互测试。
- `src/styles.css`：后台工作台、抽屉、队列、状态和响应式样式。
- `.dev.vars.example`、`README.md`：环境变量和使用说明。

---

### Task 1: 切换登录环境变量并建立配置契约

**Files:**
- Modify: `worker/src/auth.ts`
- Modify: `worker/src/auth.test.ts`
- Modify: `worker/src/index.test.ts`
- Modify: `.dev.vars.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: 现有 `Env` 类型、`verifyLogin(env, password)`、无状态 session cookie 逻辑。
- Produces: `Env` 使用 `LOGIN`、`SESSION_SECRET`、`ENCRYPTION_KEY`；`verifyLogin` 只比较 `env.LOGIN`；所有测试 fixture 使用 `LOGIN`。

- [ ] **Step 1: 写失败测试**

在 `worker/src/auth.test.ts` 中新增/修改测试，明确 `LOGIN` 才是登录密码来源，并保留 `SESSION_SECRET` 会话签名：

```ts
it("accepts LOGIN and rejects the removed SITE_PASSWORD name", async () => {
  const env = { LOGIN: "sevent", SESSION_SECRET: "session-secret" } as Env;
  expect(await verifyLogin(env, "sevent")).toBe(true);
  expect(await verifyLogin(env, "wrong")).toBe(false);
});
```

在 `worker/src/index.test.ts` 的请求环境中将旧 `SITE_PASSWORD` fixture 改为 `LOGIN`，并保留 `SESSION_SECRET`。

运行：

```bash
npx vitest run worker/src/auth.test.ts worker/src/index.test.ts
```

预期：失败，原因是 `Env` 仍要求 `SITE_PASSWORD` 且 `verifyLogin` 读取旧字段。

- [ ] **Step 2: 实现最小认证修改**

在 `worker/src/auth.ts` 中：

```ts
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  LOGIN: string;
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string;
}

export async function verifyLogin(env: Env, password: string): Promise<boolean> {
  if (!env.LOGIN) return false;
  const [expected, given] = [await sha256Hex(env.LOGIN), await sha256Hex(password)];
  return constantTimeEqual(toBytes(expected), toBytes(given));
}
```

删除 `OPENAI_*` 字段和旧注释，但不删除 `SESSION_SECRET`。

- [ ] **Step 3: 更新本地配置样例和说明**

`.dev.vars.example` 改为：

```env
LOGIN=sevent
SESSION_SECRET=change-me
ENCRYPTION_KEY=change-me-to-a-long-random-secret
```

删除三个 `OPENAI_*` 样例，并在 README 中说明 `LOGIN`、`SESSION_SECRET`、`ENCRYPTION_KEY` 的用途；不要提交真实密钥。

- [ ] **Step 4: 运行测试**

运行：

```bash
npx vitest run worker/src/auth.test.ts worker/src/index.test.ts
```

预期：认证相关测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add worker/src/auth.ts worker/src/auth.test.ts worker/src/index.test.ts .dev.vars.example README.md
git commit -m "refactor: rename login configuration"
```

如果 README/其他文件已有无关改动，使用精确暂存，只提交本任务新增的行。

---

### Task 2: 实现 AI 配置加密与 D1 存储服务

**Files:**
- Create: `worker/src/aiConfig.ts`
- Create: `worker/src/aiConfig.test.ts`
- Modify: `worker/src/db.ts`
- Modify: `worker/src/db.test.ts`

**Interfaces:**
- Consumes: `getSetting(db, key)`、`setSetting(db, key, value)`、`Env.ENCRYPTION_KEY`。
- Produces:

```ts
export type AiModelConfigInput = {
  base_url: string;
  model: string;
  api_key?: string;
};

export type AiModelPublicConfig = {
  base_url: string;
  model: string;
  has_api_key: boolean;
  updated_at: string | null;
};

export type AiModelRuntimeConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export async function readAiModelConfig(db: D1Database, encryptionKey: string): Promise<AiModelPublicConfig | null>;
export async function readAiModelRuntimeConfig(db: D1Database, encryptionKey: string): Promise<AiModelRuntimeConfig | null>;
export async function writeAiModelConfig(db: D1Database, encryptionKey: string, input: AiModelConfigInput): Promise<AiModelPublicConfig>;
export async function encryptSecret(secret: string, encryptionKey: string): Promise<{ version: 1; iv: string; ciphertext: string }>;
export async function decryptSecret(value: { version: 1; iv: string; ciphertext: string }, encryptionKey: string): Promise<string>;
```

- [ ] **Step 1: 写失败测试**

在 `worker/src/aiConfig.test.ts` 覆盖：

```ts
it("round-trips an API key without storing plaintext", async () => {
  const encrypted = await encryptSecret("api-secret", "encryption-secret");
  expect(encrypted.ciphertext).not.toContain("api-secret");
  await expect(decryptSecret(encrypted, "encryption-secret")).resolves.toBe("api-secret");
});

it("retains the existing key when api_key is omitted or blank", async () => {
  // 使用现有 D1 mock 写入第一次配置，再用空 Key 更新 base_url/model。
  // 读取 runtime config 后仍应得到第一次保存的 API Key。
});

it("rejects invalid Base URL and missing initial API key", async () => {
  // Base URL 必须是 http/https；首次配置必须提供非空 API Key。
});
```

在 `worker/src/db.test.ts` 增加 `ai_model_config` setting 的写入/读取覆盖，确认不需要新增 SQL 表。

运行：

```bash
npx vitest run worker/src/aiConfig.test.ts worker/src/db.test.ts
```

预期：失败，因为 `worker/src/aiConfig.ts` 尚不存在。

- [ ] **Step 2: 实现 AES-GCM 和格式校验**

在 `worker/src/aiConfig.ts` 中：

1. 用 `SHA-256(ENCRYPTION_KEY)` 得到 256-bit AES key。
2. 每次 `encryptSecret` 生成 12-byte 随机 IV。
3. 使用 `crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)`。
4. 用 base64url 编码 IV 和密文。
5. 解密时检查 `version === 1`，任何格式/认证失败都抛出安全的配置错误。
6. `normalizeBaseUrl` 去除末尾 `/`，只允许 `http:` 或 `https:`。
7. 将 JSON 写入 `settings` 的 `ai_model_config` key。
8. `readAiModelConfig` 只返回脱敏对象，`readAiModelRuntimeConfig` 才解密 API Key。

实现时不要把 API Key 放入错误消息、日志或 public config。

- [ ] **Step 3: 实现配置更新语义**

`writeAiModelConfig` 的规则：

- 新配置没有已存 Key 时，`api_key` 必须是非空字符串。
- 已有配置时，`api_key === undefined` 或空白字符串表示保留旧密文。
- 非空新 Key 生成新 IV 并覆盖密文。
- `base_url` 和 `model` 去除首尾空白后校验不能为空。
- 返回值永远是 `AiModelPublicConfig`。

- [ ] **Step 4: 运行测试并检查类型**

```bash
npx vitest run worker/src/aiConfig.test.ts worker/src/db.test.ts
npx tsc --noEmit
```

预期：全部通过。

- [ ] **Step 5: 提交**

```bash
git add worker/src/aiConfig.ts worker/src/aiConfig.test.ts worker/src/db.ts worker/src/db.test.ts
git commit -m "feat: encrypt AI model configuration"
```

---

### Task 3: 将文章分析改为消费 D1 AI 配置

**Files:**
- Modify: `worker/src/articleAnalysis.ts`
- Modify: `worker/src/articleAnalysis.test.ts`
- Modify: `worker/src/db.ts`
- Modify: `worker/src/articles-api.test.ts`
- Modify: `worker/src/index.ts`

**Interfaces:**
- Consumes: `AiModelRuntimeConfig`、现有文章分析 JSON 校验和 `scheduleAnalysis`。
- Produces: `generateArticleAnalysis(config, title, content)`；新增 `AnalysisStatus` 值 `unconfigured`，用于文章已保存但 AI 尚未配置的状态。

- [ ] **Step 1: 写失败测试**

在 `worker/src/articleAnalysis.test.ts` 增加 fetch 断言，确认配置从参数传入：

```ts
it("uses the supplied runtime config for chat completions", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(validAnalysisResponse());
  await generateArticleAnalysis(
    { baseUrl: "https://provider.example/v1", model: "model-a", apiKey: "secret" },
    "Title",
    "Paragraph",
  );
  expect(fetchMock).toHaveBeenCalledWith(
    "https://provider.example/v1/chat/completions",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }),
  );
});
```

在 `worker/src/articles-api.test.ts` 增加无 AI 配置时文章仍创建且状态为 `unconfigured` 的测试。

运行：

```bash
npx vitest run worker/src/articleAnalysis.test.ts worker/src/articles-api.test.ts
```

预期：失败，因为当前函数读取 `env.OPENAI_*` 且状态类型没有 `unconfigured`。

- [ ] **Step 2: 修改分析函数签名**

将：

```ts
generateArticleAnalysis(env, title, content)
```

改为：

```ts
generateArticleAnalysis(
  config: AiModelRuntimeConfig,
  title: string,
  content: string,
): Promise<ArticleAnalysis>
```

请求 URL 使用 `config.baseUrl`，请求体使用 `config.model`，Authorization 使用 `config.apiKey`。保留现有系统提示、响应校验和 JSON 解析逻辑。

- [ ] **Step 3: 增加未配置状态并接入文章路由**

在 `worker/src/db.ts`：

```ts
export type AnalysisStatus = "pending" | "processing" | "completed" | "failed" | "unconfigured";
```

在 `worker/src/index.ts`：

1. `analyzeArticle` 读取 `readAiModelRuntimeConfig(c.env.DB, c.env.ENCRYPTION_KEY)`。
2. 配置为空时把文章状态更新为 `unconfigured`，写入安全的 `analysis_error` 文案，例如 `AI model is not configured`，不调用上游。
3. 有配置时把 runtime config 传给 `generateArticleAnalysis`。
4. 创建文章仍先写入文章；配置缺失不能阻塞创建。
5. 重新分析路由在配置缺失时返回文章的 `unconfigured` 状态。

- [ ] **Step 4: 更新前后端类型和测试**

更新现有文章状态断言、状态映射和测试 mock，确保旧的 `pending/processing/completed/failed` 行为不变。

运行：

```bash
npx vitest run worker/src/articleAnalysis.test.ts worker/src/articles-api.test.ts worker/src/db.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add worker/src/articleAnalysis.ts worker/src/articleAnalysis.test.ts worker/src/db.ts worker/src/articles-api.test.ts worker/src/index.ts
git commit -m "refactor: load article AI config from D1"
```

---

### Task 4: 增加 AI 管理与听写概览 API

**Files:**
- Create: `worker/src/aiProvider.ts`
- Create: `worker/src/aiProvider.test.ts`
- Create: `worker/src/ai-admin-api.test.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/src/db.ts`
- Modify: `worker/src/db.test.ts`

**Interfaces:**
- Consumes: `readAiModelConfig`、`readAiModelRuntimeConfig`、Hono 认证中间件、现有 books/units/words 查询。
- Produces:

```ts
export type UpstreamModel = { id: string; object?: string };
export async function listUpstreamModels(config: AiModelRuntimeConfig): Promise<string[]>;
export async function testUpstreamModel(config: AiModelRuntimeConfig): Promise<{ model: string; modelCount: number; modelListed: boolean }>;
```

HTTP API：

```text
GET  /api/admin/ai-model
PUT  /api/admin/ai-model
POST /api/admin/ai-model/models
POST /api/admin/ai-model/test
GET  /api/admin/dictation/overview
```

- [ ] **Step 1: 写上游 provider 失败测试**

在 `worker/src/aiProvider.test.ts` 覆盖：

```ts
it("lists IDs from an OpenAI-compatible /models response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }),
    { status: 200 },
  )));
  await expect(listUpstreamModels({
    baseUrl: "https://provider.example/v1",
    apiKey: "secret",
    model: "model-a",
  })).resolves.toEqual(["model-a", "model-b"]);
});
```

同时覆盖非 2xx、缺失 `data`、重复模型 ID，以及 selected model 不在列表时返回 `modelListed: false` 但不泄漏密钥、不把连接失败误报为成功。

- [ ] **Step 2: 实现上游请求封装**

在 `worker/src/aiProvider.ts`：

- 请求 `${baseUrl}/models`。
- 设置 `Accept: application/json`、`Authorization: Bearer ${apiKey}`。
- 解析 `{ data: Array<{ id: string }> }`，去重并按返回顺序保留。
- 不把上游响应全文放入异常；使用 `AI provider request failed` 等安全错误。
- `testUpstreamModel` 拉取模型列表；只要上游 `/models` 请求成功就判定凭据和 Base URL 可连接，同时返回 `modelListed`。模型未出现在列表时不判失败，以兼容允许手动输入模型名但模型列表不完整的服务。

- [ ] **Step 3: 写 AI 管理 API 失败测试**

在 `worker/src/ai-admin-api.test.ts` 使用现有 Hono `app.request()` 测试：

- 未认证请求返回 401。
- GET 返回 `base_url`、`model`、`has_api_key`，不包含 `api_key`、`ciphertext` 或 Authorization。
- PUT 首次配置要求非空 Key，后续空 Key 保留旧 Key。
- `/models` 使用保存配置并返回模型 ID。
- `/test` 返回安全的成功/失败状态。
- 上游错误转换为非敏感的 502/400 JSON。

运行：

```bash
npx vitest run worker/src/aiProvider.test.ts worker/src/ai-admin-api.test.ts
```

预期：失败，因为 provider 和路由尚不存在。

- [ ] **Step 4: 实现路由**

在 `worker/src/index.ts` 的受保护 admin 路由区域增加：

- `GET /api/admin/ai-model`：调用 `readAiModelConfig`。
- `PUT /api/admin/ai-model`：读取 JSON `{ base_url, model, api_key? }`，调用 `writeAiModelConfig`。
- `POST /api/admin/ai-model/models`：允许请求体提供未保存的 `{ base_url, api_key }`，否则使用 D1 runtime config；调用 `listUpstreamModels`。
- `POST /api/admin/ai-model/test`：使用请求提供或保存的完整 runtime config，调用 `testUpstreamModel`。

所有路由必须在 `app.use("/api/admin", requireAuth)` 后执行，不能返回密文或 API Key。

- [ ] **Step 5: 增加听写管理概览查询**

在 `worker/src/db.ts` 增加 `listWordBooksOverview(db)`，返回：

```ts
export type WordBookOverview = WordBook & {
  unit_count: number;
  word_count: number;
};
```

使用一个带 `LEFT JOIN` 和 `COUNT(DISTINCT ...)` 的查询，保证没有单元/单词的单词书也会返回。路由 `/api/admin/dictation/overview` 返回该结果；现有 `/api/books`、`/api/books/:bookId/units`、`/api/units/:unitId/words` 不变。

- [ ] **Step 6: 运行测试并提交**

```bash
npx vitest run worker/src/aiProvider.test.ts worker/src/ai-admin-api.test.ts worker/src/db.test.ts worker/src/index.test.ts
npx tsc --noEmit
```

```bash
git add worker/src/aiProvider.ts worker/src/aiProvider.test.ts worker/src/ai-admin-api.test.ts worker/src/index.ts worker/src/db.ts worker/src/db.test.ts
git commit -m "feat: add AI model and dictation admin APIs"
```

---

### Task 5: 建立后台共享 UI、导入工具和路由骨架

**Files:**
- Create: `src/components/admin/AdminSidebar.tsx`
- Create: `src/components/admin/AdminHeader.tsx`
- Create: `src/components/admin/AdminDrawer.tsx`
- Create: `src/components/admin/AdminToast.tsx`
- Create: `src/components/admin/StatusBadge.tsx`
- Create: `src/components/admin/EmptyState.tsx`
- Create: `src/lib/adminImport.ts`
- Create: `src/lib/adminImport.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/admin/AdminLayout.tsx`
- Modify: `src/api/admin.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `/api/admin/dictation/overview`、AI API 类型、现有 `ConfirmDialog`、现有 CSS token。
- Produces:

```ts
export function isSupportedAudioFile(file: File): boolean;
export function audioWordFromFilename(name: string): string;
export async function readArticleSource(file: File): Promise<string>;
```

`AdminDrawerProps`：`open`, `title`, `description?`, `children`, `footer`, `onClose`, `dirty?`。

- [ ] **Step 1: 写导入工具失败测试**

在 `src/lib/adminImport.test.ts`：

```ts
it("derives the answer from an audio filename", () => {
  expect(audioWordFromFilename("  New York City.MP3 ")).toBe("New York City");
});

it("accepts known audio extensions even when browser MIME is empty", () => {
  expect(isSupportedAudioFile(new File(["x"], "word.m4a", { type: "" }))).toBe(true);
  expect(isSupportedAudioFile(new File(["x"], "notes.pdf", { type: "" }))).toBe(false);
});

it("reads Markdown/TXT content and rejects unsupported files", async () => {
  await expect(readArticleSource(new File(["# Title"], "article.md"))).resolves.toBe("# Title");
  await expect(readArticleSource(new File(["x"], "article.pdf"))).rejects.toThrow();
});
```

运行：

```bash
npx vitest run src/lib/adminImport.test.ts
```

预期：失败，因为工具不存在。

- [ ] **Step 2: 实现导入工具**

- 支持 `.mp3`, `.wav`, `.m4a`, `.ogg`, `.aac` 和 `audio/*` MIME。
- `audioWordFromFilename` 去除最后一个扩展名并 trim，不改动答案内部空格。
- `readArticleSource` 只允许 `.md`、`.markdown`、`.txt` 或 `text/plain`，使用 `file.text()` 读取。
- 对空文件返回明确错误。

- [ ] **Step 3: 写共享组件测试**

新增 `src/components/admin/AdminDrawer.test.tsx`：

- `open=false` 不渲染。
- `open=true` 有 `role="dialog"`、标题和关闭按钮。
- 点击 Escape 调用 `onClose`。
- `dirty=true` 关闭时触发未保存确认，而不是直接关闭。

新增 `src/components/admin/StatusBadge.test.tsx`，覆盖 `completed`、`processing`、`failed`、`unconfigured`、上传中/成功/失败等状态文案和非颜色文本。

- [ ] **Step 4: 实现共享组件和 CSS 基础**

实现侧边栏、头部、抽屉、通知、状态徽章、空状态。抽屉要求：

- `role="dialog"`、`aria-modal="true"`。
- Escape 关闭。
- 背景遮罩点击关闭。
- 移动端 `width: 100%`，桌面端使用 `min(520px, 100vw)`。
- footer 固定在抽屉底部，内容区域可滚动。

在 `src/styles.css` 追加独立的 `.admin-*`、`.admin-drawer-*`、`.admin-toast-*`、`.admin-status-*`、`.admin-mobile-*` 样式，复用现有变量，不覆盖阅读页面样式。

- [ ] **Step 5: 建立路由与 API 客户端类型**

`src/App.tsx`：

```tsx
<Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
  <Route index element={<Navigate to="/admin/articles" replace />} />
  <Route path="articles" element={<ArticlesAdmin />} />
  <Route path="dictation" element={<DictationAdmin />} />
  <Route path="ai-model" element={<AiModelAdmin />} />
  <Route path="books" element={<Navigate to="/admin/dictation" replace />} />
</Route>
```

`src/api/admin.ts` 增加：

```ts
export type AiModelPublicConfig = {
  base_url: string;
  model: string;
  has_api_key: boolean;
  updated_at: string | null;
};

export function getAiModelConfig(): Promise<AiModelPublicConfig | null>;
export function saveAiModelConfig(data: { base_url: string; model: string; api_key?: string }): Promise<AiModelPublicConfig>;
export function fetchAiModels(data?: { base_url?: string; api_key?: string }): Promise<string[]>;
export function testAiModel(data?: { base_url?: string; model?: string; api_key?: string }): Promise<{ model: string; modelCount: number }>;
export function getDictationOverview(): Promise<WordBookOverview[]>;
```

保留现有 `createBook`, `createUnit`, `uploadWord`, `deleteWord` 等函数。

- [ ] **Step 6: 运行测试并提交**

```bash
npx vitest run src/lib/adminImport.test.ts src/components/admin/AdminDrawer.test.tsx src/components/admin/StatusBadge.test.tsx
npx tsc --noEmit
```

```bash
git add src/components/admin src/lib/adminImport.ts src/lib/adminImport.test.ts src/App.tsx src/pages/admin/AdminLayout.tsx src/api/admin.ts src/styles.css
git commit -m "feat: add admin workbench foundations"
```

---

### Task 6: 重写文章管理和文章编辑抽屉

**Files:**
- Create: `src/components/admin/ArticleEditorDrawer.tsx`
- Create: `src/components/admin/ArticleEditorDrawer.test.tsx`
- Modify: `src/pages/admin/ArticlesAdmin.tsx`
- Modify: `src/api/articles.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `createArticle`, `updateArticle`, `deleteArticle`, `getArticle`, `reanalyzeArticle`、`AdminDrawer`、`readArticleSource`。
- Produces: 文章列表使用现代卡片/表格、搜索/筛选和抽屉新增/编辑；保存成功后调用现有文章分析 API 流程。

- [ ] **Step 1: 写文章抽屉失败测试**

在 `ArticleEditorDrawer.test.tsx` 覆盖：

```tsx
it("defaults publish date to today for a new article", () => {
  render(<ArticleEditorDrawer open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
  expect(screen.getByLabelText("发布日期")).toHaveValue(new Date().toISOString().slice(0, 10));
});

it("imports a Markdown file into the content field", async () => {
  render(<ArticleEditorDrawer open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
  await userEvent.upload(screen.getByLabelText("导入 Markdown 或 TXT"), new File(["# Body"], "body.md"));
  expect(screen.getByLabelText("正文")).toHaveValue("# Body");
});

it("shows inline validation and does not save incomplete data", async () => {
  const save = vi.fn();
  render(<ArticleEditorDrawer open mode="create" onClose={vi.fn()} onSaved={save} />);
  await userEvent.click(screen.getByRole("button", { name: "保存并开始 AI 分析" }));
  expect(screen.getByText("标题不能为空")).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 实现文章抽屉**

实现 `ArticleEditorDrawer`：

- `mode="create" | "edit"`。
- create 时初始化今天日期；edit 时接收 `initialValue`。
- 支持粘贴正文和文件导入入口。
- 文件导入后显示预览，不能把文件名当正文。
- 保存按钮在请求期间禁用并显示“保存中…”。
- API 错误显示在抽屉内，不关闭抽屉。
- 成功调用 `onSaved(article)` 并关闭。
- `dirty` 状态交给 `AdminDrawer` 处理。

- [ ] **Step 3: 重写文章列表页面**

`ArticlesAdmin`：

- 加载现有 `listArticles()` 数据并扁平化。
- 使用 `useMemo` 实现标题搜索、日期筛选和状态筛选。
- 顶部显示文章总数、AI 完成数、待处理数。
- 列表显示标题、日期、内容摘要、状态徽章、更新时间和操作按钮。
- 新建打开空抽屉；编辑先调用 `getArticle(id)` 再打开。
- 删除使用 `ConfirmDialog`，成功后刷新列表。
- 重新分析使用按钮 loading 和页面通知。
- 处理 `unconfigured` 状态，显示“待配置 AI”和跳转 AI 模型页的链接。

- [ ] **Step 4: 运行组件测试和构建**

```bash
npx vitest run src/components/admin/ArticleEditorDrawer.test.tsx src/pages/admin/ArticlesAdmin.test.tsx
npx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add src/components/admin/ArticleEditorDrawer.tsx src/components/admin/ArticleEditorDrawer.test.tsx src/pages/admin/ArticlesAdmin.tsx src/pages/admin/ArticlesAdmin.test.tsx src/api/articles.ts src/styles.css
git commit -m "feat: modernize article admin workflow"
```

---

### Task 7: 重写听写管理和批量音频导入

**Files:**
- Create: `src/components/admin/DictationImportDrawer.tsx`
- Create: `src/components/admin/DictationImportDrawer.test.tsx`
- Create: `src/components/admin/UploadQueue.tsx`
- Create: `src/components/admin/UploadQueue.test.tsx`
- Create: `src/pages/admin/DictationAdmin.tsx`
- Create: `src/pages/admin/DictationAdmin.test.tsx`
- Modify: `src/pages/admin/BooksAdmin.tsx`
- Modify: `src/api/admin.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `WordBookOverview`、`listUnits`、`listWords`、`createBook`、`createUnit`、`uploadWord`、`deleteBook`、`deleteUnit`、`deleteWord`、`isSupportedAudioFile`、`audioWordFromFilename`。
- Produces:

```ts
type UploadItem = {
  id: string;
  file: File;
  word: string;
  status: "queued" | "uploading" | "success" | "failed";
  progress: number;
  error?: string;
};
```

- [ ] **Step 1: 写上传队列失败测试**

在 `UploadQueue.test.tsx` 覆盖：

```tsx
it("uploads multiple files with independent success and failure states", async () => {
  const upload = vi.fn()
    .mockResolvedValueOnce({ ok: true, key: "1/a.mp3" })
    .mockRejectedValueOnce(new Error("network"));
  render(<UploadQueue unitId={1} items={items} uploadWord={upload} onComplete={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "开始上传" }));
  expect(await screen.findByText("上传成功")).toBeInTheDocument();
  expect(screen.getByText("失败，可重试")).toBeInTheDocument();
});
```

覆盖单项重试、答案编辑、空队列不可提交和完成回调只触发一次。

- [ ] **Step 2: 实现 `UploadQueue`**

- 默认最多 3 个并发上传任务。
- 每个任务调用现有 `uploadWord(unitId, file, word)`，不改变单文件后端 API。
- 将结果写回任务状态；失败捕获为任务级 error。
- “重试失败项”只重新排队失败任务。
- 任务成功后不可重复上传；答案编辑只影响尚未开始/重试的请求。
- 全部任务成功或明确结束后调用 `onComplete`。
- UI 展示总进度、成功/失败计数、每项状态和进度条。

- [ ] **Step 3: 写导入抽屉失败测试**

在 `DictationImportDrawer.test.tsx` 覆盖：

- 未选择单词书或单元时不能开始。
- 多文件选择后生成文件队列。
- `lesson-01.mp3` 默认答案为 `lesson-01`。
- 非音频文件被拒绝并显示提示。
- 关闭抽屉时保留已成功任务，并对未提交任务发出确认。

- [ ] **Step 4: 实现导入抽屉**

- 第一步选择单词书/单元。
- 第二步拖入或选择多个音频。
- 文件进入队列后可逐行编辑答案。
- 使用 `UploadQueue` 管理上传，不使用 `alert`。
- 上传完成后刷新单元单词列表并显示完成通知。
- 选择位置的下拉列表加载当前资源；不存在单词书时提供“新建单词书”入口。

- [ ] **Step 5: 实现听写管理页**

`DictationAdmin`：

- 加载 `getDictationOverview()`，展示单词书卡片、单元数和单词数。
- 创建单词书使用抽屉，不再使用 `fieldset`。
- 展开单词书后显示单元列表和“新增单元”。
- 单元明细可加载单词列表，删除操作使用确认对话框。
- “导入听写音频”打开导入抽屉并预选当前单元（若从单元操作进入）。
- `BooksAdmin.tsx` 改为兼容导出：

```tsx
export { DictationAdmin as BooksAdmin } from "./DictationAdmin";
```

- [ ] **Step 6: 运行测试并提交**

```bash
npx vitest run src/components/admin/UploadQueue.test.tsx src/components/admin/DictationImportDrawer.test.tsx src/pages/admin/DictationAdmin.test.tsx
npx tsc --noEmit
```

```bash
git add src/components/admin/DictationImportDrawer.tsx src/components/admin/DictationImportDrawer.test.tsx src/components/admin/UploadQueue.tsx src/components/admin/UploadQueue.test.tsx src/pages/admin/DictationAdmin.tsx src/pages/admin/DictationAdmin.test.tsx src/pages/admin/BooksAdmin.tsx src/api/admin.ts src/styles.css
git commit -m "feat: modernize dictation import workflow"
```

---

### Task 8: 实现 AI 模型管理页面

**Files:**
- Create: `src/pages/admin/AiModelAdmin.tsx`
- Create: `src/pages/admin/AiModelAdmin.test.tsx`
- Modify: `src/components/admin/StatusBadge.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `getAiModelConfig`、`saveAiModelConfig`、`fetchAiModels`、`testAiModel`、`AdminToast`、`StatusBadge`。
- Produces: 可保存、脱敏、拉取模型和测试连接的 AI 管理页面。

- [ ] **Step 1: 写失败测试**

在 `AiModelAdmin.test.tsx` 覆盖：

```tsx
it("does not show the stored API key", async () => {
  mockGetAiModelConfig.mockResolvedValue({
    base_url: "https://provider.example/v1",
    model: "model-a",
    has_api_key: true,
    updated_at: "2026-08-12T00:00:00Z",
  });
  render(<AiModelAdmin />);
  expect(await screen.findByText("API Key 已配置")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("secret")).not.toBeInTheDocument();
});

it("refreshes model choices and tests the selected model", async () => {
  mockFetchAiModels.mockResolvedValue(["model-a", "model-b"]);
  mockTestAiModel.mockResolvedValue({ model: "model-b", modelCount: 2, modelListed: true });
  // 点击刷新模型列表、选择 model-b、点击测试连接并断言状态。
});
```

- [ ] **Step 2: 实现 AI 配置表单**

- 初始加载 public config。
- Base URL 和 model 为必填。
- API Key 输入框使用 password 类型；已配置时显示“已配置”，不回填密文。
- 保存空 Key 时发送 `api_key` 空字符串或省略，由后端保留已有 Key。
- 保存期间禁用提交，成功后刷新脱敏配置。
- API 错误显示安全的通知文本。

- [ ] **Step 3: 实现模型列表和连接测试**

- “刷新模型列表”调用 `fetchAiModels`，显示加载状态和数量。
- 选择模型时同步到表单；允许手动输入自定义模型。
- “测试连接”使用当前未保存表单值，未输入新 Key 时使用已保存配置。
- 测试成功显示模型名、发现模型数量和时间；`modelListed: false` 时额外显示“当前模型未出现在上游列表，请确认模型名”。
- 测试失败显示可理解的错误，不展示上游原始认证信息。
- 未配置时显示“尚未配置 AI”，文章页可链接回本页面。

- [ ] **Step 4: 运行测试并提交**

```bash
npx vitest run src/pages/admin/AiModelAdmin.test.tsx
npx tsc --noEmit
```

```bash
git add src/pages/admin/AiModelAdmin.tsx src/pages/admin/AiModelAdmin.test.tsx src/components/admin/StatusBadge.tsx src/styles.css
git commit -m "feat: add AI model admin page"
```

---

### Task 9: 完成工作台集成、文档和全量验证

**Files:**
- Modify: `src/pages/admin/AdminLayout.tsx`
- Modify: `src/pages/admin/ArticlesAdmin.tsx`
- Modify: `src/pages/admin/DictationAdmin.tsx`
- Modify: `src/pages/admin/AiModelAdmin.tsx`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `.dev.vars.example`
- Modify: 受影响的现有测试文件

**Interfaces:**
- Consumes: Tasks 1–8 的 API、组件和状态类型。
- Produces: 可从 `/admin` 完整走通的三模块工作台，旧 `/admin/books` 可兼容跳转，文档和测试与实现一致。

- [ ] **Step 1: 写集成回归测试**

覆盖：

- `/admin` 重定向到 `/admin/articles`。
- 侧边栏切换三模块并保持 active 状态。
- `/admin/books` 重定向到 `/admin/dictation`。
- 文章未配置 AI 时可以保存并显示待配置状态。
- 听写导入成功后单元列表刷新。
- AI 配置保存后文章重新分析入口可用。

- [ ] **Step 2: 做桌面端和移动端人工检查**

启动开发服务器：

```bash
npm run dev
```

检查：

1. 桌面宽度下侧边栏、主列表和右抽屉同时可用。
2. 手机宽度下抽屉变成全屏，底部操作固定且正文可滚动。
3. 键盘 Tab 能到达导航、抽屉关闭、表单和主操作。
4. Escape 能关闭抽屉；脏表单关闭会确认。
5. 上传队列不会因一个失败文件阻塞其他文件。
6. API Key 始终只显示脱敏状态。

- [ ] **Step 3: 更新文档和环境样例**

README 必须说明：

```env
LOGIN=sevent
SESSION_SECRET=change-me
ENCRYPTION_KEY=change-me-to-a-long-random-secret
```

并删除旧 `SITE_PASSWORD`/`OPENAI_*` 示例，补充 `/admin/dictation`、`/admin/ai-model` 和 AI 配置页面说明。确认设计规格链接保留。

- [ ] **Step 4: 运行全量验证**

```bash
npm test
npm run build
```

预期：所有 Vitest 测试通过，Vite 构建成功，无 TypeScript 错误。

- [ ] **Step 5: 检查工作区边界并提交**

```bash
git status --short
git diff --check
git diff --stat
```

只检查本次任务修改，不清理或回滚现有阅读标注相关改动。确认后提交：

```bash
git add src worker .dev.vars.example README.md package.json package-lock.json
# 只在这些文件确实属于本次实现时加入；不要使用 git add -A

git commit -m "feat: rebuild admin workbench"
```

---

## 计划自检

### 规格覆盖

- 统一工作台、三模块和旧路由兼容：Tasks 5、9。
- 文章抽屉、当天日期、Markdown/TXT 导入、预览、异步分析：Tasks 3、6、9。
- 听写单词书/单元层级、批量音频、文件名答案、逐项修正、进度和重试：Tasks 4、7、9。
- AI 模型 CRUD、OpenAI 兼容 `/models`、连接测试、D1 加密：Tasks 2、4、8。
- `LOGIN`、`SESSION_SECRET`、`ENCRYPTION_KEY` 和删除旧变量：Tasks 1、2、9。
- 错误处理、响应式、可访问性、无第三方 UI 依赖：Tasks 5–9。
- 测试和构建验证：每个任务的独立测试以及 Task 9 全量验证。

### 占位符检查

计划中没有未决占位符；每个任务均给出明确文件、接口、测试和提交动作。

### 类型一致性检查

- `AiModelRuntimeConfig` 在 Task 2 定义，Task 3/4/8 依赖同一字段：`baseUrl`、`model`、`apiKey`。
- `AiModelPublicConfig` 在 Task 2/5 定义并由 Task 8 使用：`base_url`、`model`、`has_api_key`、`updated_at`。
- `UploadItem` 在 Task 7 定义，`UploadQueue` 和 `DictationImportDrawer` 使用同一状态联合类型。
- `AnalysisStatus` 在 Task 3 增加 `unconfigured`，Task 6/9 的 UI 和回归测试覆盖该状态。
