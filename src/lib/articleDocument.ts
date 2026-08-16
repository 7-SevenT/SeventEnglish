import type { JSONContent } from "@tiptap/core";
import type { Annotation, ParagraphAnalysis } from "../../worker/src/db";
import { filterRenderableAnnotations } from "./annotations";

export type TextMark = { type: "aiHighlight" | "annotation"; attrs?: Record<string, string | number> };
type Interval = { start: number; end: number; marks: TextMark[] };

function escapedRegex(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
}

function aiIntervals(text: string, paragraph: ParagraphAnalysis): Interval[] {
  const matches: Interval[] = [];
  const expressions = [...paragraph.expressions].sort((a, b) => b.text.length - a.text.length);
  for (const expression of expressions) {
    const needle = expression.text.trim();
    if (!needle) continue;
    const pattern = escapedRegex(needle);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (!matches.some((item) => start < item.end && end > item.start)) {
        matches.push({ start, end, marks: [{ type: "aiHighlight" }] });
      }
      if (match[0].length === 0) pattern.lastIndex++;
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
