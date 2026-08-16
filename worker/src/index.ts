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
import type { AiModelRuntimeConfig } from "./aiConfig";
import { readAiModelConfig, readAiModelRuntimeConfig, writeAiModelConfig } from "./aiConfig";
import { listUpstreamModels, testUpstreamModel } from "./aiProvider";
import { clearAnalyzeServiceConfig, readAnalyzeServicePublicConfig, readAnalyzeServiceRuntimeConfig, writeAnalyzeServiceConfig } from "./analyzeServiceConfig";
import type { AnalyzeServiceRuntimeConfig } from "./analyzeServiceConfig";
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

// 队列 consumer 核心：把分析任务转发到 Vercel 分析服务（vercel-proxy），结果写回 articles 表。
// 背景：Workers 免费计划 CPU 限制 10ms/请求，AI 分析（SSE 流解析 + JSON 校验）约需 2 秒 CPU，
// 直接调用 AI 提供商会被平台以 exceededCpu 终止（重试 3 次后消息丢弃，状态永久 processing）。
// Vercel 函数无 10ms CPU 限制，故 AI 调用移到 Vercel 执行；Worker 只做转发 + 入库（CPU 约 25ms）。
// 所有可预期的失败（服务未配置 / 请求失败 / 超时 / 空响应）都收敛为明确的
// analysis_status 与 analysis_error；网络层失败（本地到 Vercel 连接中断）自动重试一次。
// 导出以支持单元测试直接驱动。
export async function handleAnalyzeJob(env: Env, job: AnalyzeJob): Promise<void> {
  let service: AnalyzeServiceRuntimeConfig | null;
  try {
    service = await readAnalyzeServiceRuntimeConfig(env.DB, env.ENCRYPTION_KEY);
  } catch (error) {
    await setAnalysisStatus(env, job.id, "failed", error instanceof Error ? error.message : "analyze service config is invalid");
    return;
  }
  if (!service) {
    await setAnalysisStatus(env, job.id, "unconfigured", null);
    return;
  }
  let aiConfig: AiModelRuntimeConfig | null;
  try {
    aiConfig = await readAiModelRuntimeConfig(env.DB, env.ENCRYPTION_KEY);
  } catch (error) {
    await setAnalysisStatus(env, job.id, "failed", error instanceof Error ? error.message : "AI config is invalid");
    return;
  }
  if (!aiConfig) {
    await setAnalysisStatus(env, job.id, "unconfigured", null);
    return;
  }
  await setAnalysisStatus(env, job.id, "processing", null);
  // 网络层失败（fetch/text 抛错）重试一次：本地/运营商到 Vercel 的长连接偶发中断时可自愈；
  // 业务错误（Vercel 明确返回的错误/校验失败）不重试，避免重复消耗 AI 额度。
  const callAnalyze = async (): Promise<string> => {
    // Vercel 函数上限 300s，这里给 330s 兜底（fetch 等待是 I/O 不占 CPU，不会触发 CPU 限制）。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 330_000);
    let response: Response;
    try {
      response = await fetch(`${service.url.replace(/\/+$/, "")}/api/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${service.token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          title: job.title,
          content: job.content,
          baseUrl: aiConfig.baseUrl,
          model: aiConfig.model,
          apiKey: aiConfig.apiKey,
        }),
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("analyze service request timed out");
      throw error instanceof Error ? error : new Error("analyze service request failed");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let message = `analyze service returned ${response.status}`;
      try {
        const payload = (await response.json()) as { error?: unknown };
        if (typeof payload?.error === "string" && payload.error) message = payload.error;
      } catch {
        /* 响应体不是 JSON 时保留默认错误信息 */
      }
      throw new Error(message);
    }
    // Vercel 立即返回 200 + 完整 body：成功为 analysis JSON，失败为 {"ok":false,"error":...}。
    // 用文本前缀区分（避免 Worker 侧 JSON.parse 占用免费计划 CPU 配额）。
    const analysisJson = (await response.text()).trim();
    if (analysisJson.startsWith("{\"version")) return analysisJson;
    let message = "analyze service returned an error";
    try {
      const payload = JSON.parse(analysisJson) as { error?: unknown };
      if (typeof payload?.error === "string" && payload.error) message = payload.error;
    } catch {
      /* 非 JSON 响应时保留默认错误信息 */
    }
    throw new Error(message);
  };
  try {
    let analysisJson: string;
    try {
      analysisJson = await callAnalyze();
    } catch (firstError) {
      const message = firstError instanceof Error ? firstError.message : "";
      if (!/network|connection|timed out|fetch failed/i.test(message)) throw firstError;
      analysisJson = await callAnalyze();
    }
    await setAnalysisStatus(env, job.id, "completed", null, analysisJson);
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

// ---- AI 分析服务（Vercel proxy）管理 ----------------
app.get("/api/admin/analyze-service", async (c) => {
  try {
    return c.json(await readAnalyzeServicePublicConfig(c.env.DB, c.env.ENCRYPTION_KEY));
  } catch {
    return c.json({ error: "analyze service config is invalid" }, 500);
  }
});

app.put("/api/admin/analyze-service", async (c) => {
  const body = await readJson<{ url?: unknown; token?: unknown }>(c.req.raw);
  if (!body || typeof body !== "object") return c.json({ error: "bad request" }, 400);
  const input: { url?: string; token?: string } = {};
  for (const key of ["url", "token"] as const) {
    const value = body[key];
    if (value !== undefined && typeof value !== "string") return c.json({ error: "bad request" }, 400);
    if (typeof value === "string") input[key] = value;
  }
  try {
    return c.json(await writeAnalyzeServiceConfig(c.env.DB, c.env.ENCRYPTION_KEY, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid analyze service config";
    return c.json({ error: message }, 400);
  }
});

app.delete("/api/admin/analyze-service", async (c) => {
  await clearAnalyzeServiceConfig(c.env.DB);
  return c.json({ ok: true });
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

// 文本批量导入（TTS 词条）：JSON body { items: [{ word, definition? }] }，单次 1-500 条。
// 校验 + 同单元去重（大小写不敏感）+ sort_order 递增插入；audio_key 写空串 ''（语义 = TTS 词条，
// 前端用浏览器 speechSynthesis 朗读，无需 R2 音频）。返回 created / skipped / duplicates / invalid。
app.post("/api/units/:unitId/words/bulk", async (c) => {
  const unitId = Number(c.req.param("unitId"));
  if (Number.isNaN(unitId) || !Number.isInteger(unitId) || unitId <= 0) {
    return c.json({ error: "not found" }, 404);
  }
  const body = await c.req.json<{ items?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.items)) return c.json({ error: "items required" }, 400);
  if (body.items.length === 0 || body.items.length > 500) {
    return c.json({ error: "items must be 1-500" }, 400);
  }
  const unit = await c.env.DB.prepare("SELECT id FROM units WHERE id = ?")
    .bind(unitId)
    .first<{ id: number }>();
  if (!unit) return c.json({ error: "unit not found" }, 404);

  // 同单元已有词条（小写）用于去重
  const existing = await c.env.DB.prepare("SELECT LOWER(word) AS word FROM words WHERE unit_id = ?")
    .bind(unitId)
    .all<{ word: string }>();
  const seen = new Set(existing.results.map((r) => r.word));

  const maxRow = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM words WHERE unit_id = ?")
    .bind(unitId)
    .first<{ m: number }>();
  let sortOrder = maxRow?.m ?? 0;

  const duplicates: string[] = [];
  const invalid: string[] = [];
  const rows: { word: string; definition: string }[] = [];
  for (const item of body.items) {
    if (typeof item !== "object" || item === null) {
      invalid.push("(invalid item)");
      continue;
    }
    const word = typeof (item as { word?: unknown }).word === "string" ? (item as { word: string }).word.trim() : "";
    if (!word || word.length > 100) {
      invalid.push(word.slice(0, 50) || "(empty word)");
      continue;
    }
    const key = word.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(word);
      continue;
    }
    seen.add(key);
    const definition =
      typeof (item as { definition?: unknown }).definition === "string"
        ? (item as { definition: string }).definition.trim().slice(0, 500)
        : "";
    rows.push({ word, definition });
  }

  for (const row of rows) {
    sortOrder += 1;
    await c.env.DB.prepare(
      "INSERT INTO words (unit_id, word, audio_key, definition, sort_order) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(unitId, row.word, "", row.definition, sortOrder)
      .run();
  }
  return c.json({
    ok: true,
    created: rows.length,
    skipped: duplicates.length + invalid.length,
    duplicates,
    invalid,
  });
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

// 批量删除 R2 音频对象。audio_key 非空才是 R2 对象（TTS 词条 audio_key 为空串），
// 删除失败仅告警不中断（R2 偶发错误不应让删除 API 失败）。
async function deleteR2Audio(bucket: R2Bucket, audioKeys: string[]): Promise<void> {
  await Promise.all(
    audioKeys
      .filter((key) => key)
      .map((key) => bucket.delete(key).catch(() => undefined))
  );
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
  // 正文变更后旧分析结果与内容错位（段落 index/原文不匹配），
  // 重置分析状态并重新入队；仅改标题/日期时不触发，避免浪费 AI 额度。
  if (content !== article.content) {
    await setAnalysisStatus(c.env, article.id, "processing", null);
    await enqueueAnalysis(c, article.id, title, content);
  }
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
  // D1 默认强制外键约束：删除父行前必须先删子行（words → units），
  // 否则 FOREIGN KEY constraint failed → 500（见 schema 注释）。
  // 同时收集该书全部音频 key 一并清理，避免 R2 孤儿对象。
  const { results: audioRows } = await c.env.DB.prepare(
    "SELECT w.audio_key FROM words w JOIN units u ON w.unit_id = u.id WHERE u.book_id = ? AND w.audio_key != ''"
  ).bind(Number(id)).all<{ audio_key: string }>();
  await c.env.DB.prepare("DELETE FROM words WHERE unit_id IN (SELECT id FROM units WHERE book_id = ?)").bind(Number(id)).run();
  await c.env.DB.prepare("DELETE FROM units WHERE book_id = ?").bind(Number(id)).run();
  await c.env.DB.prepare("DELETE FROM word_books WHERE id = ?").bind(Number(id)).run();
  await deleteR2Audio(c.env.BUCKET, audioRows.map((row) => row.audio_key));
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
  // 同删除单词书：先删子表 words（D1 强制外键），再删单元，并清理 R2 音频对象。
  const { results: audioRows } = await c.env.DB.prepare(
    "SELECT audio_key FROM words WHERE unit_id = ? AND audio_key != ''"
  ).bind(Number(id)).all<{ audio_key: string }>();
  await c.env.DB.prepare("DELETE FROM words WHERE unit_id = ?").bind(Number(id)).run();
  await c.env.DB.prepare("DELETE FROM units WHERE id = ?").bind(Number(id)).run();
  await deleteR2Audio(c.env.BUCKET, audioRows.map((row) => row.audio_key));
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
  const existing = await c.env.DB.prepare("SELECT audio_key FROM words WHERE id = ?").bind(Number(id)).first<{ audio_key: string }>();
  if (!existing) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare("DELETE FROM words WHERE id = ?").bind(Number(id)).run();
  // 顺带清理 R2 音频对象（TTS 词条 audio_key 为空串，跳过）。
  await deleteR2Audio(c.env.BUCKET, [existing.audio_key]);
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
      // 音频 key 含时间戳（unitId/timestamp-sanitizedName），内容不可变，可安全长缓存。
      "Cache-Control": "public, max-age=31536000, immutable",
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
