import type { JSONContent } from "@tiptap/core";
import type { Annotation, ParagraphAnalysis } from "../../worker/src/db";
import { filterRenderableAnnotations } from "./annotations";

export type TextMark = { type: "aiHighlight" | "annotation"; attrs?: Record<string, string | number> };
type Interval = { start: number; end: number; marks: TextMark[] };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 在段落原文中查找表达式位置。优先精确匹配（大小写不敏感、折叠空白）；
// 失败时对纯字母数字词块做"词序列容错匹配"（容忍词间少量标点/空格，如
// "souped up" 匹配 "souped-up"、"take off" 匹配 "take, off"），
// 覆盖 AI 词块与原文存在细微差异时漏加粗的情况。
function findExpressionMatch(text: string, needle: string): { start: number; end: number } | null {
  const exact = new RegExp(escapeRegExp(needle).replace(/\s+/g, "\\s+"), "i").exec(text);
  if (exact) return { start: exact.index, end: exact.index + exact[0].length };
  const words = needle.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((word) => /^[\w'-]+$/.test(word))) {
    const pattern = `\\b${words.map(escapeRegExp).join("[\\s\\S]{0,3}?")}\\b`;
    const match = new RegExp(pattern, "i").exec(text);
    if (match) return { start: match.index, end: match.index + match[0].length };
  }
  return null;
}

function aiIntervals(text: string, paragraph: ParagraphAnalysis): Interval[] {
  const matches: Interval[] = [];
  const expressions = [...paragraph.expressions].sort((a, b) => b.text.length - a.text.length);
  for (const expression of expressions) {
    const needle = expression.text.trim();
    if (!needle) continue;
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const found = findExpressionMatch(text.slice(searchFrom), needle);
      if (!found) break;
      const start = searchFrom + found.start;
      const end = searchFrom + found.end;
      if (!matches.some((item) => start < item.end && end > item.start)) {
        matches.push({ start, end, marks: [{ type: "aiHighlight" }] });
      }
      searchFrom = end > start ? end : start + 1;
    }
  }
  return matches;
}

function annotationIntervals(
  text: string,
  paragraphStart: number,
  annotations: Annotation[],
  documentSize: number,
): Interval[] {
  const intervals: Interval[] = [];
  for (const annotation of filterRenderableAnnotations(annotations, documentSize)) {
    const start = Math.max(0, annotation.from_position - paragraphStart);
    const end = Math.min(text.length, annotation.to_position - paragraphStart);
    if (start >= end) continue;
    // Overlapping user marks are rejected by the UI. Keep the first valid one
    // when old data contains overlaps so marks never become nested.
    if (intervals.some((item) => start < item.end && end > item.start)) continue;
    intervals.push({
      start,
      end,
      marks: [{ type: "annotation", attrs: { annotationId: annotation.id, color: annotation.color } }],
    });
  }
  return intervals;
}

function paragraphContent(
  text: string,
  paragraph: ParagraphAnalysis,
  paragraphStart: number,
  annotations: Annotation[],
  documentSize: number,
): JSONContent[] {
  const intervals = [...aiIntervals(text, paragraph), ...annotationIntervals(text, paragraphStart, annotations, documentSize)];
  const boundaries = [...new Set([0, text.length, ...intervals.flatMap((item) => [item.start, item.end])])].sort((a, b) => a - b);
  const content: JSONContent[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (start === end) continue;
    const marks = intervals
      .filter((item) => item.start <= start && item.end >= end)
      .flatMap((item) => item.marks);
    content.push({ type: "text", text: text.slice(start, end), ...(marks.length ? { marks } : {}) });
  }
  return content.length ? content : [{ type: "text", text }];
}

export function buildArticleDoc(paragraphs: ParagraphAnalysis[], annotations: Annotation[], showAnalysis = true): JSONContent {
  const documentSize = paragraphs.reduce((size, paragraph) => size + paragraph.original.length + 2, 0);
  let paragraphStart = 1;
  const content = paragraphs.map((paragraph) => {
    const node: JSONContent = {
      type: "paragraph",
      attrs: { paragraphIndex: paragraph.index, analysis: showAnalysis ? paragraph : null },
      content: paragraphContent(paragraph.original, paragraph, paragraphStart, annotations, documentSize),
    };
    paragraphStart += paragraph.original.length + 2;
    return node;
  });
  return { type: "doc", content };
}
