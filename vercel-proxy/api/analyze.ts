// Vercel 无状态 AI 文章分析服务（SeventEnglish）
//
// 背景：Cloudflare Workers 免费计划 CPU 限制 10ms/请求，AI 文章分析（SSE 流解析 + JSON 校验）
// 实际消耗约 2 秒 CPU，queue consumer 每次投递都被平台以 exceededCpu 终止，线上分析永久卡 processing。
// 本服务把 AI 调用移到 Vercel（Hobby 函数最长 300s，无 10ms CPU 硬限制），Worker 只负责转发与入库。
//
// 协议：
//   POST /api/analyze
//   Authorization: Bearer <ANALYZE_TOKEN>   （环境变量，与管理后台配置的 token 一致，防滥用）
//   body: { title: string, content: string, baseUrl: string, model: string, apiKey: string }
//   成功: 200 { ok: true,  analysis: ArticleAnalysis }
//   失败: 4xx/5xx { ok: false, error: string }
//
// 注意：本文件的解析/校验逻辑与 worker/src/articleAnalysis.ts 保持同步（修改时两处都要改）。

// 兼容两种变量名：正式名 ANALYZE_TOKEN；历史部署可能用 TOKEN（与 SeventFinance relay 命名风格一致）。
const ANALYZE_TOKEN = process.env.ANALYZE_TOKEN || process.env.TOKEN || "";

// ---- 类型（与 worker/src/db.ts 的 ArticleAnalysis 形状一致，仅用于 JSDoc 参考）----
// ExpressionItem: { text, meaning, usage }
// ParagraphAnalysis: { index, original, translation, expressions[] }
// ArticleAnalysis: { version: 1, paragraphs[] }

function splitParagraphs(content) {
  return content.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
}

function extractJson(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (match ? match[1] : text).trim();
  if (!candidate) throw new Error("AI response is empty");
  try { return JSON.parse(candidate); } catch { /* 继续尝试兜底解析 */ }
  // 兜底：AI 偶发在 JSON 前后夹杂说明文字，提取首个 { 到最后一个 } 之间的内容再解析。
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* 仍失败则抛错 */ }
  }
  throw new Error("AI response is not valid JSON");
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function string(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}
function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function validateExpression(value, label) {
  const v = object(value, label);
  return { text: string(v.text, `${label}.text`), meaning: string(v.meaning, `${label}.meaning`), usage: string(v.usage, `${label}.usage`) };
}

function validateArticleAnalysis(value, paragraphs) {
  const v = object(value, "analysis");
  if (v.version !== 1) throw new Error("analysis.version must be 1");
  const rawParagraphs = array(v.paragraphs, "analysis.paragraphs");
  if (rawParagraphs.length !== paragraphs.length) throw new Error("analysis.paragraphs count mismatch");
  const parsed = rawParagraphs.map((raw, i) => {
    const p = object(raw, `paragraphs[${i}]`);
    if (p.index !== i) throw new Error(`paragraphs[${i}].index mismatch`);
    if (p.original !== paragraphs[i]) throw new Error(`paragraphs[${i}].original mismatch`);
    return { index: i, original: paragraphs[i], translation: string(p.translation, `paragraphs[${i}].translation`), expressions: array(p.expressions, `paragraphs[${i}].expressions`).map((x, j) => validateExpression(x, `paragraphs[${i}].expressions[${j}]`)) };
  });
  return { version: 1, paragraphs: parsed };
}

// 分块版提示词：要求 AI 只分析列出的段落（带全局 0-based index）。
// 多块并行可显著降低单次请求耗时，从而避开 Vercel Hobby 300s 上限、
// Cloudflare 边缘代理 100s 无响应 524、以及本地网络 ~180s 长连接断开三类限制。
const SYSTEM_PROMPT = `You are an English reading analyst. Analyze ONLY the article paragraphs listed below (each labeled with its global 0-based index into the full article). Return only valid JSON matching this shape: {"version":1,"paragraphs":[{"index":0,"original":"exact paragraph text","translation":"Chinese translation","expressions":[{"text":"expression (chunk)","meaning":"Chinese meaning","usage":"English explanation and usage"}]}]}. Preserve every paragraph original exactly.

For "expressions", select the MOST WORTHWHILE English expressions to remember and reuse from each paragraph (collocations, phrasal verbs, fixed phrases, and other chunks). Every selected item must satisfy ALL of these criteria:
- High-frequency, natural, and reusable in everyday or formal contexts;
- Common in quality journalism, news, and formal English;
- Each word is familiar on its own, but the combination is not easy to understand or guess;
- Worth memorizing as a single chunk;
- Transferable to other articles and situations;
- Never select proper nouns, low-frequency words, or expressions unique to this article;
- Quality over quantity: fewer good items are better; return an empty array when a paragraph yields nothing worth memorizing.`;

// 每块最多段落数：实测 2 段/块在 siliconflow 上约 18-45s（偶发 90s+），
// 16 段文章 8 块并行总耗时约 95s，压线但可接受；块更小可进一步降低总耗时。
const CHUNK_SIZE = 2;

/** 发起一次流式 chat/completions，返回累积的文本内容。 */
async function streamChatCompletion(base, model, apiKey, messages, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({ model, temperature: 0.2, stream: true, messages }),
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`AI request timed out after ${timeoutMs}ms`);
    throw error instanceof Error ? error : new Error("AI request failed");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`AI request failed with status ${response.status}`);
  if (!response.body) throw new Error("AI response has no body stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  let streamDone = false;
  let hasSseData = false;
  const streamStart = Date.now();
  try {
    while (!streamDone) {
      const elapsed = Date.now() - streamStart;
      if (elapsed > timeoutMs) {
        if (accumulated) break;
        throw new Error(`Stream reading timed out after ${timeoutMs}ms`);
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.startsWith("data: ")) {
          if (!hasSseData) accumulated += trimmed + "\n";
          continue;
        }
        hasSseData = true;
        const data = trimmed.slice(6).trim();
        if (data === "[DONE]") {
          streamDone = true;
          break;
        }
        try {
          const parsed = JSON.parse(data);
          const deltaContent = parsed?.choices?.[0]?.delta?.content;
          if (deltaContent) accumulated += deltaContent;
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* 忽略 */ }
  }

  if (!accumulated) throw new Error("AI response has no content");
  return accumulated;
}

/**
 * 分析一个块（1~CHUNK_SIZE 段）。返回 { paragraphs }，段落已校验 index/original/字段。
 */
async function analyzeChunk({ baseUrl, model, apiKey }, title, chunk, timeoutMs) {
  const base = baseUrl.replace(/\/+$/, "");
  const chunkText = chunk.map((p) => `[${p.index}] ${p.original}`).join("\n\n");
  const accumulated = await streamChatCompletion(
    base,
    model,
    apiKey,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Title: ${title}\n\nParagraphs:\n${chunkText}` },
    ],
    timeoutMs,
  );
  const v = object(extractJson(accumulated), "analysis");
  const rawParagraphs = array(v.paragraphs, "analysis.paragraphs");
  if (rawParagraphs.length !== chunk.length) throw new Error("analysis.paragraphs count mismatch");
  const paragraphs = rawParagraphs.map((raw, i) => {
    const p = object(raw, `paragraphs[${i}]`);
    if (p.index !== chunk[i].index) throw new Error(`paragraphs[${i}].index mismatch`);
    if (p.original !== chunk[i].original) throw new Error(`paragraphs[${i}].original mismatch`);
    return { index: chunk[i].index, original: chunk[i].original, translation: string(p.translation, `paragraphs[${i}].translation`), expressions: array(p.expressions, `paragraphs[${i}].expressions`).map((x, j) => validateExpression(x, `paragraphs[${i}].expressions[${j}]`)) };
  });
  return { paragraphs };
}

/**
 * 单块分析 + 一次性重试：AI 偶发输出格式漂移（非 JSON / 校验失败）时重试一次；
 * 超时类错误不重试（重试也会超时，浪费额度与时间）。
 */
async function analyzeChunkWithRetry(config, title, chunk, timeoutMs) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await analyzeChunk(config, title, chunk, timeoutMs);
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /timed out/i.test(error.message)) throw error;
    }
  }
  throw lastError;
}

/**
 * 生成完整 ArticleAnalysis。
 * 短文章（≤CHUNK_SIZE 段）单块执行；长文章按 CHUNK_SIZE 分块**并行**调用 AI，
 * 聚合后整体校验。timeoutMs 仅用于单块场景（默认 280s）；
 * 分块场景每块超时 100s（Cloudflare 边缘代理对 100s 无响应会返回 524）。
 */
async function generateArticleAnalysis(config, title, content, timeoutMs = 280000) {
  const rawParagraphs = splitParagraphs(content);
  const paragraphs = rawParagraphs.map((original, index) => ({ index, original }));
  const chunks = [];
  for (let i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
    chunks.push(paragraphs.slice(i, i + CHUNK_SIZE));
  }

  if (chunks.length === 1) {
    // 单块：直接完整分析
    const result = await analyzeChunkWithRetry(config, title, chunks[0], timeoutMs);
    const merged = { version: 1, paragraphs: result.paragraphs };
    return validateArticleAnalysis(merged, rawParagraphs);
  }

  const perChunkTimeout = Math.min(120000, timeoutMs);
  const results = await Promise.all(chunks.map((chunk) => analyzeChunkWithRetry(config, title, chunk, perChunkTimeout)));
  const allParagraphs = results.flatMap((r) => r.paragraphs).sort((a, b) => a.index - b.index);
  const merged = { version: 1, paragraphs: allParagraphs };
  return validateArticleAnalysis(merged, rawParagraphs);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

module.exports = async function handler(req, res) {
  try {
    const auth = req.headers.authorization || "";
    if (!ANALYZE_TOKEN || auth !== `Bearer ${ANALYZE_TOKEN}`) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const raw = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(raw || "");
    } catch {
      res.status(400).json({ ok: false, error: "invalid json" });
      return;
    }

    const { title, content, baseUrl, model, apiKey } = payload || {};
    if (
      typeof title !== "string" || typeof content !== "string" ||
      typeof baseUrl !== "string" || typeof model !== "string" || typeof apiKey !== "string" ||
      !title.trim() || !content.trim() || !model.trim() || !apiKey.trim()
    ) {
      res.status(400).json({ ok: false, error: "invalid request" });
      return;
    }
    if (!/^https?:\/\//.test(baseUrl.trim())) {
      res.status(400).json({ ok: false, error: "invalid base url" });
      return;
    }

    // 立即返回响应头，再在后台执行分析、完成后 end() 写入结果：
    // - 避免 Cloudflare 边缘代理对 100s 无响应头返回 HTTP 524；
    // - 避免本地网络/运营商对"等待响应"的空闲长连接（~180s）做空闲超时断开。
    // 分析期间每 5s 写一个空格保活（实测 20s 间隙仍可能被部分网络判定为空闲；5s 与 Vercel 流式
    // 心跳一致，可有效维持连接）。JSON 前导空白由 Worker 端 trim 处理。
    // 失败时 body 为 {"ok":false,"error":"..."}，Worker 用文本前缀区分成功/失败，不做 JSON.parse。
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    const keepAlive = setInterval(() => {
      try { res.write(" "); } catch { /* 连接已关闭 */ }
    }, 5000);
    try {
      const analysis = await generateArticleAnalysis(
        { baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() },
        title,
        content,
      );
      res.end(JSON.stringify(analysis));
    } catch (error) {
      console.error("analyze failed:", error instanceof Error ? error.message : String(error));
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      clearInterval(keepAlive);
    }
  } catch (error) {
    console.error("analyze handler error:", error instanceof Error ? error.message : String(error));
    try {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } catch { /* 响应已开始则忽略 */ }
  }
};
