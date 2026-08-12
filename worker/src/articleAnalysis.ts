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

export async function generateArticleAnalysis(config: AiModelRuntimeConfig, title: string, content: string): Promise<ArticleAnalysis> {
  const paragraphs = splitParagraphs(content);
  const base = config.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: `Title: ${title}\n\nArticle:\n${content}` }] }) });
  if (!response.ok) throw new Error(`AI request failed with status ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI response has no content");
  return validateArticleAnalysis(extractJson(text), paragraphs);
}
