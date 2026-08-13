import type { AiModelRuntimeConfig } from "./aiConfig";
import type { ArticleAnalysis, HighlightItem, ParagraphAnalysis, WritingSentence } from "./db";

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

function validateWriting(value: unknown, label: string): WritingSentence {
  const v = object(value, label);
  const tags = v.tags === undefined ? undefined : array(v.tags, `${label}.tags`).map((x, i) => string(x, `${label}.tags[${i}]`));
  return { text: string(v.text, `${label}.text`), translation: string(v.translation, `${label}.translation`), usage: string(v.usage, `${label}.usage`), ...(tags ? { tags } : {}) };
}

function validateHighlight(value: unknown, label: string): HighlightItem {
  const v = object(value, label);
  const type = string(v.type, `${label}.type`);
  if (type !== "word" && type !== "phrase") throw new Error(`${label}.type is invalid`);
  const category = v.ielts_category === undefined ? undefined : string(v.ielts_category, `${label}.ielts_category`);
  if (category && !["reading", "writing", "speaking", "general"].includes(category)) throw new Error(`${label}.ielts_category is invalid`);
  return { text: string(v.text, `${label}.text`), type, meaning: string(v.meaning, `${label}.meaning`), usage: string(v.usage, `${label}.usage`), ...(v.example === undefined ? {} : { example: string(v.example, `${label}.example`) }), ...(category ? { ielts_category: category } : {}) } as HighlightItem;
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
    return { index: i, original: paragraphs[i], translation: string(p.translation, `paragraphs[${i}].translation`), highlights: array(p.highlights, `paragraphs[${i}].highlights`).map((x, j) => validateHighlight(x, `paragraphs[${i}].highlights[${j}]`)), writing_sentences: array(p.writing_sentences, `paragraphs[${i}].writing_sentences`).map((x, j) => validateWriting(x, `paragraphs[${i}].writing_sentences[${j}]`)) };
  });
  return { version: 1, ...(v.summary === undefined ? {} : { summary: string(v.summary, "analysis.summary") }), paragraphs: parsed, writing_sentences: array(v.writing_sentences, "analysis.writing_sentences").map((x, i) => validateWriting(x, `writing_sentences[${i}]`)) };
}

export const SYSTEM_PROMPT = `You are an IELTS English reading analyst. Return only valid JSON matching this shape: {"version":1,"summary":"string","paragraphs":[{"index":0,"original":"exact paragraph","translation":"Chinese translation","highlights":[{"text":"word or phrase","type":"word|phrase","meaning":"Chinese meaning","usage":"usage","example":"optional","ielts_category":"reading|writing|speaking|general"}],"writing_sentences":[{"text":"sentence","translation":"Chinese translation","usage":"IELTS usage","tags":["tag"]}]}],"writing_sentences":[]}. Preserve every paragraph original exactly. Keep highlights selective and useful; do not list ordinary words or generic explanations. For writing_sentences, select at most one sentence per paragraph and only include it when it has clearly transferable IELTS writing value (a reusable structure, contrast, concession, cause-effect, comparison, or other strong academic pattern). Never include a merely correct or ordinary sentence just to fill the field; return an empty array when no sentence is especially valuable. Apply the same strict rule to the top-level writing_sentences.`;

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
  // 流读取阶段也有自己的超时：reader.read() 可能在网络异常时无限挂起。
  // 总超时 timeoutMs 已覆盖 fetch 阶段（AbortController），流读取阶段分配剩余时间。
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  let streamDone = false;
  let hasSseData = false;
  try {
    while (!streamDone) {
      const readPromise = reader.read();
      // 给每次 read 单独设保底超时，防止单次 read 无限挂起
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Stream read timed out")), timeoutMs),
      );
      const { done, value } = await Promise.race([readPromise, timeoutPromise]);
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
    reader.releaseLock();
  }

  if (!accumulated) throw new Error("AI response has no content");
  return validateArticleAnalysis(extractJson(accumulated), paragraphs);
}
