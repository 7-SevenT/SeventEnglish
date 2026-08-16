import type { AiModelRuntimeConfig } from "./aiConfig";
import type { ArticleAnalysis, ExpressionItem, ParagraphAnalysis } from "./db";

export function splitParagraphs(content: string): string[] {
  return content.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
}

export function extractJson(text: string): unknown {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (match ? match[1] : text).trim();
  if (!candidate) throw new Error("AI response is empty");
  try { return JSON.parse(candidate); } catch { throw new Error("AI response is not valid JSON"); }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function validateExpression(value: unknown, label: string): ExpressionItem {
  const v = object(value, label);
  return { text: string(v.text, `${label}.text`), meaning: string(v.meaning, `${label}.meaning`), usage: string(v.usage, `${label}.usage`), ...(v.example === undefined ? {} : { example: string(v.example, `${label}.example`) }) };
}

export function validateArticleAnalysis(value: unknown, paragraphs: string[]): ArticleAnalysis {
  const v = object(value, "analysis");
  if (v.version !== 1) throw new Error("analysis.version must be 1");
  const rawParagraphs = array(v.paragraphs, "analysis.paragraphs");
  if (rawParagraphs.length !== paragraphs.length) throw new Error("analysis.paragraphs count mismatch");
  const parsed: ParagraphAnalysis[] = rawParagraphs.map((raw, i) => {
    const p = object(raw, `paragraphs[${i}]`);
    if (p.index !== i) throw new Error(`paragraphs[${i}].index mismatch`);
    if (p.original !== paragraphs[i]) throw new Error(`paragraphs[${i}].original mismatch`);
    return { index: i, original: paragraphs[i], translation: string(p.translation, `paragraphs[${i}].translation`), expressions: array(p.expressions, `paragraphs[${i}].expressions`).map((x, j) => validateExpression(x, `paragraphs[${i}].expressions[${j}]`)) };
  });
  return { version: 1, paragraphs: parsed };
}

export const SYSTEM_PROMPT = `You are an English reading analyst. Return only valid JSON matching this shape: {"version":1,"paragraphs":[{"index":0,"original":"exact paragraph text","translation":"Chinese translation","expressions":[{"text":"expression (chunk)","meaning":"Chinese meaning","usage":"English explanation of usage, WITHOUT any example sentence","example":"one short English example sentence, optional"}]}]}. Preserve every paragraph original exactly.

For "expressions", select the MOST WORTHWHILE English expressions to remember and reuse from each paragraph (collocations, phrasal verbs, fixed phrases, and other chunks). Every selected item must satisfy ALL of these criteria:
- High-frequency, natural, and reusable in everyday or formal contexts;
- Common in quality journalism, news, and formal English;
- Each word is familiar on its own, but the combination is not easy to understand or guess;
- Worth memorizing as a single chunk;
- Transferable to other articles and situations;
- Never select proper nouns, low-frequency words, or expressions unique to this article;
- Quality over quantity: fewer good items are better; return an empty array when a paragraph yields nothing worth memorizing.

Field rules: "meaning" is a concise Chinese gloss. "usage" is a brief English explanation of how the expression is used; do NOT embed example sentences or labels like "Example:" / "e.g." in it. "example" is an optional single English sentence demonstrating the expression in context (plain sentence only, no "Example:" prefix). Omit "example" when you cannot produce a natural one.`;

export async function generateArticleAnalysis(config: AiModelRuntimeConfig, title: string, content: string, timeoutMs = 300_000): Promise<ArticleAnalysis> {
  const paragraphs = splitParagraphs(content);
  const base = config.baseUrl.replace(/\/$/, "");
  // fetch 必须带超时：AI 提供商无响应/响应过慢时若无限等待，队列 consumer 会挂到平台 wall-time 上限
  // 才被终止，状态将长时间停留在 processing。长文章（十数段落）生成完整 JSON 分析实测需 2-5 分钟，
  // 故默认超时设为 5 分钟（consumer 的 15 分钟 wall time 足够容纳）。
  //
  // 流式（stream:true）解决 Cloudflare Workers 默认 100s 边缘代理超时（HTTP 524）：
  // 普通 fetch 到外部 API 时，Cloudflare 边缘代理在 100 秒无响应后终止连接返回 524。
  // DeepSeek-V4-Flash 等模型分析长文章完整 JSON 经常超过 100 秒。
  // 启用流式后 SSE 数据持续流动，连接不会空闲超时。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        // 不使用 response_format（某些 API 与服务商不兼容 stream + json_object），
        // 依靠 system prompt 约束模型输出 JSON + extractJson 兜底解析。
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Title: ${title}\n\nArticle:\n${content}` },
        ],
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`AI request timed out after ${timeoutMs}ms`);
    throw error instanceof Error ? error : new Error("AI request failed");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`AI request failed with status ${response.status}`);
  if (!response.body) throw new Error("AI response has no body stream");

  // 读取 SSE 流，累积所有 delta.content
  // 流读取阶段。注意：不用 Promise.race 给 reader.read() 设超时——
  // race 中若 timeout 先胜出，reader.read() 仍在 pending，
  // finally 中的 releaseLock() 会抛 "outstanding read promises"。
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  let streamDone = false;
  let hasSseData = false;
  const streamStart = Date.now();
  try {
    while (!streamDone) {
      // 总耗时检查：超出 timeoutMs 时，若有已累积内容则直接返回
      // （可能已经收到完整 JSON），否则抛出超时异常
      const elapsed = Date.now() - streamStart;
      if (elapsed > timeoutMs) {
        if (accumulated) break;
        throw new Error(`Stream reading timed out after ${timeoutMs}ms`);
      }

      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 格式：每行 "data: {json}" 以 \n 分隔，消息以 \n\n 结束
      const lines = buffer.split("\n");
      // 保留最后未完成的行（可能不完整）
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // SSE 格式："data: {json}"，解析 delta.content；
        // 非 SSE 行：若从未见过 SSE marker 则作为原始内容累积（兜底非标准流式实现）
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
    try { reader.releaseLock(); } catch { /* 忽略 releaseLock 错误 */ }
  }

  if (!accumulated) throw new Error("AI response has no content");
  return validateArticleAnalysis(extractJson(accumulated), paragraphs);
}
