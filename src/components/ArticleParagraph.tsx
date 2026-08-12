import type { ParagraphAnalysis } from "../../worker/src/db";
import { ArticleAnalysisPanel } from "./ArticleAnalysisPanel";

type TextSegment = { text: string; highlight: boolean; key: string };

/** Match AI vocabulary without injecting HTML, while preserving unmatched source text. */
export function splitHighlightedText(original: string, highlights: ParagraphAnalysis["highlights"]): TextSegment[] {
  const matches: Array<{ start: number; end: number; text: string }> = [];
  const ordered = [...highlights].sort((a, b) => b.text.length - a.text.length);
  for (const highlight of ordered) {
    if (!highlight.text.trim()) continue;
    const needle = highlight.text.trim();
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(original))) {
      const start = match.index;
      const end = start + match[0].length;
      if (!matches.some((item) => start < item.end && end > item.start)) matches.push({ start, end, text: match[0] });
      if (match[0].length === 0) pattern.lastIndex++;
    }
  }
  matches.sort((a, b) => a.start - b.start);
  const segments: TextSegment[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) segments.push({ text: original.slice(cursor, match.start), highlight: false, key: `text-${index}` });
    segments.push({ text: match.text, highlight: true, key: `highlight-${index}` });
    cursor = match.end;
  });
  if (cursor < original.length || segments.length === 0) segments.push({ text: original.slice(cursor), highlight: false, key: "text-end" });
  return segments;
}

/**
 * Kept as a small analysis-only unit for existing analysis tests. Reading text
 * with user annotations is rendered exclusively by ReadingDocument.
 */
export function ArticleParagraph({ analysis }: { analysis: ParagraphAnalysis }) {
  return (
    <article className="article-paragraph">
      <p className="article-paragraph__text">
        {splitHighlightedText(analysis.original, analysis.highlights).map((segment) => segment.highlight
          ? <strong className="article-highlight" key={segment.key}>{segment.text}</strong>
          : <span key={segment.key}>{segment.text}</span>)}
      </p>
      <ArticleAnalysisPanel analysis={analysis} />
    </article>
  );
}
