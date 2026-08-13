import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "./auth";
import { verifyLogin, signToken, verifyToken, requireAuth } from "./auth";
import {
  listArticlesGroupedByDate,
  getArticle,
  createArticle,
  listWordBooks,
  listWordBooksOverview,
  listUnits,
  listWords,
  applySchema,
  getArticleAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getArticleNote,
  upsertArticleNote,
} from "./db";
import type { AnalyzeJob, AnalysisStatus } from "./db";
import { generateArticleAnalysis } from "./articleAnalysis";
import type { AiModelRuntimeConfig } from "./aiConfig";
import { readAiModelConfig, readAiModelRuntimeConfig, writeAiModelConfig } from "./aiConfig";
import { listUpstreamModels, testUpstreamModel } from "./aiProvider";
import { backupAll, restoreAll } from "./backup";
import { clearWebdavConfig, readWebdavPublicConfig, writeWebdavConfig } from "./webdavConfig";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/login", async (c) => {
  const body = await c.req.json<{ password?: string }>().catch((): { password?: string } => ({}));
  if (!body.password || !(await verifyLogin(c.env, body.password))) {
    return c.json({ error: "invalid credentials" }, 401);
  }
  const token = await signToken(c.env.ENCRYPTION_KEY, String(Date.now()));
  setCookie(c, "session", token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return c.json({ ok: true });
});

app.post("/api/logout", (c) => {
  deleteCookie(c, "session");
  return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
  const t = getCookie(c, "session");
  if (!t || !(await verifyToken(c.env.ENCRYPTION_KEY, t))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return c.json({ authenticated: true });
});

app.get("/api/health", async (c) => {
  // 建表兜底：首次运行（本地 dev / 生产首启）D1 表可能不存在，所有数据 API 会报错。
  // applySchema 幂等（CREATE TABLE IF NOT EXISTS），在此调用作为建表兜底；
  // 部署前仍推荐用 wrangler d1 execute 显式建表（见 README 部署清单）。
  await applySchema(c.env.DB);
  return c.json({ ok: true });
});

// 数据 API 统一鉴权：对所有受保护数据集前缀挂载 requireAuth。
// 后续 /api/books、/api/units、/api/words 等一律照此复制挂载，保持口径一致。
// 白名单（/api/login、/api/logout、/api/me、/api/health）不受此中间件影响。
app.use("/api/articles", requireAuth);
app.use("/api/articles/*", requireAuth);
app.use("/api/books", requireAuth);
app.use("/api/books/*", requireAuth);
app.use("/api/units", requireAuth);
app.use("/api/units/*", requireAuth);
app.use("/api/words", requireAuth);
app.use("/api/words/*", requireAuth);
app.use("/api/backup", requireAuth);
app.use("/api/backup/*", requireAuth);
app.use("/api/audio", requireAuth);
app.use("/api/audio/*", requireAuth);
app.use("/api/admin", requireAuth);
app.use("/api/admin/*", requireAuth);

// 鉴权通过后执行幂等 schema 初始化与迁移，兼容已有 D1 数据库。
// 首次访问数据接口时会自动补齐新字段和新表，不要求手动访问 /api/health。
app.use("/api/*", async (c, next) => {
  const statement = c.env.DB.prepare("SELECT 1");
  if (typeof statement.run === "function") await applySchema(c.env.DB);
  await next();
});

app.get("/api/articles", async (c) => {
  return c.json(await listArticlesGroupedByDate(c.env.DB));
});
app.get("/api/articles/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id) || !Number.isInteger(id) || id <= 0) return c.json({ error: "not found" }, 404);
  const article = await getArticle(c.env.DB, id);
  if (!article) return c.json({ error: "not found" }, 404);
  const [annotations, note] = await Promise.all([
    getArticleAnnotations(c.env.DB, id),
    getArticleNote(c.env.DB, id),
  ]);
  return c.json({ ...article, annotations, note: note ?? null });
});

// ---- AI 文章分析（队列驱动）----
// 背景：此前用 c.executionCtx.waitUntil() 在响应返回后继续跑 AI 分析，
// 但 Cloudflare 平台限制 waitUntil 任务在响应/断开后最多只能再运行 30 秒，
// AI 生成完整分析（长文章）远超 30 秒，任务被平台硬终止且不触发 JS catch，
// 导致 analysis_status 永久停留在 processing（“一直分析中”）。
// 现改为：analyze 路由只做「设 processing + 入队」，由队列 consumer 执行 AI 调用
// （consumer wall time 上限 15 分钟，足以容纳长任务）。

async function setAnalysisStatus(env: Env, id: number, status: AnalysisStatus, error: string | null, analysisJson?: string): Promise<void> {
  // 失败/未配置时同时清空 analysis_json，避免前端轮询到旧数据与 failed 状态共存。
  // （前端虽按 analysis_status === "completed" 判断展示，但数据层应保持干净。）
  if (analysisJson !== undefined) {
    await env.DB.prepare("UPDATE articles SET analysis_status = ?, analysis_json = ?, analysis_error = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(status, analysisJson, error, id).run();
  } else if (status === "failed" || status === "unconfigured") {
    await env.DB.prepare("UPDATE articles SET analysis_status = ?, analysis_json = NULL, analysis_error = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(status, error, id).run();
  } else {
    await env.DB.prepare("UPDATE articles SET analysis_status = ?, analysis_error = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(status, error, id).run();
  }
}

// 队列 consumer 核心：读取 AI 配置并执行一次完整分析，结果写回 articles 表。
// 所有可预期的失败（AI 未配置 / 请求失败 / 超时 / JSON 校验失败）都收敛为明确的
// analysis_status 与 analysis_error，不重试（重复调用会浪费 AI 额度；用户可通过
// “重新分析”按钮手动重试）。导出以支持单元测试直接驱动。
export async function handleAnalyzeJob(env: Env, job: AnalyzeJob): Promise<void> {
  let config: AiModelRuntimeConfig | null;
  try {
    config = await readAiModelRuntimeConfig(env.DB, env.ENCRYPTION_KEY);
  } catch (error) {
    // 配置读取失败（如密钥解密失败）属于永久性错误，重试无意义，直接标记失败。
    await setAnalysisStatus(env, job.id, "failed", error instanceof Error ? error.message : "AI config is invalid");
    return;
  }
  if (!config) {
    await setAnalysisStatus(env, job.id, "unconfigured", null);
    return;
  }
  await setAnalysisStatus(env, job.id, "processing", null);
  try {
    const analysis = await generateArticleAnalysis(config, job.title, job.content);
    await setAnalysisStatus(env, job.id, "completed", null, JSON.stringify(analysis));
  } catch (error) {
    await setAnalysisStatus(env, job.id, "failed", error instanceof Error ? error.message : "analysis failed");
  }
}

// analyze 路由统一入口：设 processing 后入队，响应立即返回，前端按 analysis_status 轮询。
async function enqueueAnalysis(c: Context<{ Bindings: Env }>, id: number, title: string, content: string): Promise<void> {
  await c.env.ANALYSIS_QUEUE.send({ id, title, content });
}

// ---- AI 模型管理 ----------------
app.get("/api/admin/ai-model", async (c) => {
  try {
    return c.json(await readAiModelConfig(c.env.DB, c.env.ENCRYPTION_KEY));
  } catch {
    return c.json({ error: "AI model config is invalid" }, 500);
  }
});

app.put("/api/admin/ai-model", async (c) => {
  const body = await readJson<{ base_url?: unknown; model?: unknown; api_key?: unknown }>(c.req.raw);
  if (typeof body?.base_url !== "string" || typeof body.model !== "string" || (body.api_key !== undefined && typeof body.api_key !== "string")) {
    return c.json({ error: "bad request" }, 400);
  }
  try {
    return c.json(await writeAiModelConfig(c.env.DB, c.env.ENCRYPTION_KEY, {
      base_url: body.base_url,
      model: body.model,
      ...(body.api_key === undefined ? {} : { api_key: body.api_key }),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid AI model config";
    return c.json({ error: message }, 400);
  }
});

app.post("/api/admin/ai-model/models", async (c) => {
  const body = await readJson<{ base_url?: unknown; api_key?: unknown }>(c.req.raw);
  try {
    const config = typeof body?.base_url === "string" && typeof body.api_key === "string"
      ? { baseUrl: body.base_url.replace(/\/+$/, ""), model: "", apiKey: body.api_key }
      : await readAiModelRuntimeConfig(c.env.DB, c.env.ENCRYPTION_KEY);
    if (!config) return c.json({ error: "AI model is not configured" }, 400);
    return c.json({ models: await listUpstreamModels(config) });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured")
      ? error.message
      : "AI provider request failed";
    return c.json({ error: message }, 502);
  }
});

app.post("/api/admin/ai-model/test", async (c) => {
  const body = await readJson<{ base_url?: unknown; model?: unknown; api_key?: unknown }>(c.req.raw);
  try {
    const config = typeof body?.base_url === "string" && typeof body.model === "string" && typeof body.api_key === "string"
      ? { baseUrl: body.base_url.replace(/\/+$/, ""), model: body.model.trim(), apiKey: body.api_key }
      : await readAiModelRuntimeConfig(c.env.DB, c.env.ENCRYPTION_KEY);
    if (!config) return c.json({ error: "AI model is not configured" }, 400);
    return c.json(await testUpstreamModel(config));
  } catch (error) {
    const message = error instanceof Error && messageIsSafeConfigError(error.message)
      ? error.message
      : "AI provider request failed";
    return c.json({ error: message }, 502);
  }
});

// ---- WebDAV 备份 ----------------
app.post("/api/backup", async (c) => backupAll(c));
app.post("/api/backup/restore", async (c) => restoreAll(c));

// ---- WebDAV 配置（管理后台）-------
app.get("/api/admin/webdav", async (c) => {
  return c.json(await readWebdavPublicConfig(c.env.DB, c.env.ENCRYPTION_KEY));
});

app.put("/api/admin/webdav", async (c) => {
  const body = await readJson<{ url?: unknown; username?: unknown; password?: unknown }>(c.req.raw);
  if (!body || typeof body !== "object") return c.json({ error: "bad request" }, 400);
  const input: { url?: string; username?: string; password?: string } = {};
  for (const key of ["url", "username", "password"] as const) {
    const value = body[key];
    if (value !== undefined && typeof value !== "string") return c.json({ error: "bad request" }, 400);
    if (typeof value === "string") input[key] = value;
  }
  try {
    return c.json(await writeWebdavConfig(c.env.DB, c.env.ENCRYPTION_KEY, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid webdav config";
    return c.json({ error: message }, 400);
  }
});

app.delete("/api/admin/webdav", async (c) => {
  await clearWebdavConfig(c.env.DB);
  return c.json({ ok: true });
});

function messageIsSafeConfigError(message: string): boolean {
  return /not configured|invalid|required|must use/i.test(message);
}

app.get("/api/admin/dictation/overview", async (c) => {
  return c.json(await listWordBooksOverview(c.env.DB));
});

// ---- 听力模块 ----------------
// 读 API：选书 → 选单元 → 读单词。均已由上方 requireAuth 保护。
app.get("/api/books", async (c) => c.json(await listWordBooks(c.env.DB)));
app.get("/api/books/:bookId/units", async (c) => {
  const bookId = Number(c.req.param("bookId"));
  if (Number.isNaN(bookId) || !Number.isInteger(bookId) || bookId <= 0) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(await listUnits(c.env.DB, bookId));
});
app.get("/api/units/:unitId/words", async (c) => {
  const unitId = Number(c.req.param("unitId"));
  if (Number.isNaN(unitId) || !Number.isInteger(unitId) || unitId <= 0) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(await listWords(c.env.DB, unitId));
});

// ==================== 管理后台写 API ====================

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(req: Request): Promise<T | null> {
  const body = await req.text().catch(() => null);
  return typeof body === "string" ? parseJson<T>(body) : null;
}

// 与读路由同一口径的非法 id 防护。
function isInvalidId(value: string): boolean {
  const n = Number(value);
  return Number.isNaN(n) || !Number.isInteger(n) || n <= 0;
}

// ---- 文章 CRUD ----
app.post("/api/articles", async (c) => {
  const body = await readJson<{
    title?: string;
    content?: string;
    publish_date?: string;
  }>(c.req.raw);
  if (!body?.title || !body.content || !body.publish_date) {
    return c.json({ error: "missing fields" }, 400);
  }
  const article = await createArticle(c.env.DB, {
    title: body.title,
    content: body.content,
    publish_date: body.publish_date,
  });
  // 兼容极简 D1 mock；真实 D1 始终返回刚插入的文章。
  if (!article) return c.json(article, 201);
  await setAnalysisStatus(c.env, article.id, "processing", null);
  await enqueueAnalysis(c, article.id, article.title, article.content);
  return c.json(await getArticle(c.env.DB, article.id), 201);
});

app.post("/api/admin/articles/:id/analyze", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  const article = await getArticle(c.env.DB, Number(id));
  if (!article) return c.json({ error: "not found" }, 404);
  await setAnalysisStatus(c.env, article.id, "processing", null);
  await enqueueAnalysis(c, article.id, article.title, article.content);
  return c.json(await getArticle(c.env.DB, article.id));
});

app.post("/api/articles/:id/annotations", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id) || !(await getArticle(c.env.DB, Number(id)))) return c.json({ error: "not found" }, 404);
  const body = await readJson<Record<string, unknown>>(c.req.raw);
  const from = body?.from_position, to = body?.to_position;
  const colors = ["yellow", "green", "blue", "pink"];
  if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 1 || (to as number) <= (from as number) || typeof body?.selected_text !== "string" || !body.selected_text.trim() || !colors.includes(String(body.color)) || (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string")) return c.json({ error: "bad request" }, 400);
  const annotation = await createAnnotation(c.env.DB, Number(id), { from_position: from as number, to_position: to as number, selected_text: body.selected_text as string, color: body.color as "yellow" | "green" | "blue" | "pink", comment: (body.comment as string | null | undefined) ?? null });
  return c.json(annotation, 201);
});

app.patch("/api/annotations/:id", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  const existing = await c.env.DB.prepare("SELECT * FROM annotations WHERE id = ?").bind(Number(id)).first<{
    from_position: number;
    to_position: number;
    selected_text: string;
    color: "yellow" | "green" | "blue" | "pink";
    comment: string | null;
  }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await readJson<Record<string, unknown>>(c.req.raw);
  const from = body?.from_position ?? existing.from_position;
  const to = body?.to_position ?? existing.to_position;
  if (!body || !Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 1 || (to as number) <= (from as number) || (body.comment !== undefined && body.comment !== null && typeof body.comment !== "string") || (body.selected_text !== undefined && (typeof body.selected_text !== "string" || !body.selected_text.trim())) || (body.color !== undefined && !["yellow", "green", "blue", "pink"].includes(String(body.color)))) return c.json({ error: "bad request" }, 400);
  const annotation = await updateAnnotation(c.env.DB, Number(id), body as never);
  return c.json(annotation);
});

app.delete("/api/annotations/:id", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  const existing = await c.env.DB.prepare("SELECT id FROM annotations WHERE id = ?").bind(Number(id)).first<{ id: number }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  await deleteAnnotation(c.env.DB, Number(id));
  return c.json({ ok: true });
});

app.get("/api/articles/:id/notes", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id) || !(await getArticle(c.env.DB, Number(id)))) return c.json({ error: "not found" }, 404);
  return c.json({ note: (await getArticleNote(c.env.DB, Number(id))) ?? null });
});

app.put("/api/articles/:id/notes", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id) || !(await getArticle(c.env.DB, Number(id)))) return c.json({ error: "not found" }, 404);
  const body = await readJson<{ content?: unknown }>(c.req.raw);
  if (typeof body?.content !== "string") return c.json({ error: "bad request" }, 400);
  return c.json({ note: await upsertArticleNote(c.env.DB, Number(id), body.content) });
});

app.patch("/api/articles/:id", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  const body = await readJson<{
    title?: string;
    content?: string;
    publish_date?: string;
  }>(c.req.raw);
  if (!body) return c.json({ error: "bad request" }, 400);
  const article = await getArticle(c.env.DB, Number(id));
  if (!article) return c.json({ error: "not found" }, 404);
  const title = body.title ?? article.title;
  const content = body.content ?? article.content;
  const publish_date = body.publish_date ?? article.publish_date;
  await c.env.DB.prepare(
    "UPDATE articles SET title = ?, content = ?, publish_date = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(title, content, publish_date, Number(id))
    .run();
  return c.json(await getArticle(c.env.DB, Number(id)));
});

app.delete("/api/articles/:id", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare("DELETE FROM articles WHERE id = ?")
    .bind(Number(id))
    .run();
  return c.json({ ok: true });
});

// ---- 单词书 CRUD ----
app.post("/api/books", async (c) => {
  const b = await readJson<{ name?: string; description?: string }>(c.req.raw);
  if (!b?.name) return c.json({ error: "missing name" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO word_books (name, description) VALUES (?, ?)"
  )
    .bind(b.name, b.description ?? "")
    .run();
  return c.json({ ok: true }, 201);
});

app.delete("/api/books/:id", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare("DELETE FROM word_books WHERE id = ?")
    .bind(Number(id))
    .run();
  return c.json({ ok: true });
});

// ---- 单元 CRUD ----
app.post("/api/books/:bookId/units", async (c) => {
  const bookId = c.req.param("bookId");
  if (isInvalidId(bookId)) return c.json({ error: "not found" }, 404);
  const u = await readJson<{ name?: string; sort_order?: number }>(c.req.raw);
  if (!u?.name) return c.json({ error: "missing name" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO units (book_id, name, sort_order) VALUES (?, ?, ?)"
  )
    .bind(Number(bookId), u.name, u.sort_order ?? 0)
    .run();
  return c.json({ ok: true }, 201);
});

app.delete("/api/units/:id", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare("DELETE FROM units WHERE id = ?")
    .bind(Number(id))
    .run();
  return c.json({ ok: true });
});

// ---- 单词 + 音频上传 ----
// multipart form：field "unitId"（数字）、"word"（可选）、"audio"（文件）。
// word 缺省取去除扩展名的音频文件名（"音频文件名即答案"）。
app.post("/api/words", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "bad request" }, 400);
  }
  const unitIdRaw = form.get("unitId");
  const unitId = Number(unitIdRaw);
  if (Number.isNaN(unitId) || !Number.isInteger(unitId) || unitId <= 0) {
    return c.json({ error: "missing unitId" }, 400);
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return c.json({ error: "missing audio" }, 400);
  }
  const wordRaw = form.get("word");
  const word =
    typeof wordRaw === "string" && wordRaw.trim()
      ? wordRaw.trim()
      : audio.name.replace(/\.[^.]+$/, "").trim();
  if (!word) return c.json({ error: "missing word" }, 400);
  // 上传前校验 unitId 对应的 unit 存在，避免产生孤儿单词记录。
  const unit = await c.env.DB.prepare("SELECT id FROM units WHERE id = ?")
    .bind(unitId)
    .first<{ id: number }>();
  if (!unit) return c.json({ error: "unit not found" }, 404);
  // R2 key 文件名净化：替换非安全字符（/、空白、控制字符等），并折叠连续点
  // 以消除 `..`，确保 key 不含 /、..、路径分隔符或控制字符，避免异常键/存储混乱。
  const sanitizedName = audio.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.\.+/g, ".");
  const key = `${unitId}/${Date.now()}-${sanitizedName}`;
  await c.env.BUCKET.put(key, audio.stream(), {
    httpMetadata: { contentType: audio.type || "audio/mpeg" },
  });
  await c.env.DB.prepare(
    "INSERT INTO words (unit_id, word, audio_key) VALUES (?, ?, ?)"
  )
    .bind(unitId, word, key)
    .run();
  return c.json({ ok: true, key }, 201);
});

app.delete("/api/words/:id", async (c) => {
  const id = c.req.param("id");
  if (isInvalidId(id)) return c.json({ error: "not found" }, 404);
  // 仅删 DB 记录；R2 对象删除可选，框架阶段先不删对象。
  await c.env.DB.prepare("DELETE FROM words WHERE id = ?")
    .bind(Number(id))
    .run();
  return c.json({ ok: true });
});

// ---- 音频播放路由（听写播放）----
app.get("/api/audio", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing key" }, 400);
  const object = await c.env.BUCKET.get(key);
  if (!object) return c.json({ error: "not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "audio/mpeg",
    },
  });
});

export default {
  fetch: app.fetch,
  // AI 文章分析队列 consumer：Hono 测试环境通过命名导出 app 直接驱动路由测试，
  // consumer 核心逻辑（handleAnalyzeJob）同样命名导出以便单元测试。
  // 注意：默认导出只暴露 Cloudflare 认识的 handler（fetch / queue），
  // 不要加额外属性（如 request 转发）——那会被误识别为自定义 handler。
  queue: async (batch: MessageBatch<AnalyzeJob>, env: Env) => {
    for (const message of batch.messages) {
      try {
        await handleAnalyzeJob(env, message.body);
      } catch (error) {
        // handleAnalyzeJob 内部已覆盖所有可预期失败；此处兜底防 DB 层意外错误击穿循环。
        console.error("analysis job failed", error);
      }
    }
  },
};
export { app };
export type App = typeof app;
