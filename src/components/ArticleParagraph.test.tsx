import { describe, expect, it } from "vitest";
import { splitHighlightedText } from "./ArticleParagraph";
import { ArticleAnalysisPanel } from "./ArticleAnalysisPanel";
import type { ParagraphAnalysis } from "../../worker/src/db";

function containsElementType(node: any, type: string): boolean {
  if (Array.isArray(node)) return node.some((child) => containsElementType(child, type));
  if (!node || typeof node !== "object") return false;
  if (node.type === type) return true;
  return containsElementType(node.props?.children, type);
}

const analysis: ParagraphAnalysis = {
  index: 0,
  original: "The rapid change requires careful planning.",
  translation: "快速的变化需要仔细规划。",
  highlights: [{ text: "rapid change", type: "phrase", meaning: "快速变化", usage: "描述变化", example: "A rapid change occurred." }],
  writing_sentences: [{ text: "This requires careful planning.", translation: "这需要仔细规划。", usage: "用于提出必要措施" }],
};

describe("ArticleParagraph", () => {
  it("uses strong for matched words or phrases and preserves unmatched text", () => {
    const segments = splitHighlightedText(analysis.original, analysis.highlights);
    expect(segments.find((segment) => segment.highlight)?.text).toBe("rapid change");
    expect(segments.some((segment) => segment.highlight && segment.text === "rapid change")).toBe(true);
    expect(segments.some((segment) => segment.text.includes("careful planning"))).toBe(true);
  });

  it("renders one collapsed disclosure containing all three analysis sections", () => {
    const panel = ArticleAnalysisPanel({ analysis });
    const disclosure = panel.props.children as any;
    expect(disclosure.type).toBe("details");
    expect(disclosure.props.className).toBe("analysis-disclosure");
    expect(disclosure.props.open).toBeUndefined();

    const disclosureChildren = Array.isArray(disclosure.props.children)
      ? disclosure.props.children
      : [disclosure.props.children];
    expect(disclosureChildren).toHaveLength(2);
    expect(disclosureChildren[0].type).toBe("summary");
    expect(disclosureChildren[1].type).toBe("div");
    expect(disclosureChildren[1].props.className).toBe("analysis-content");

    const analysisContentChildren = Array.isArray(disclosureChildren[1].props.children)
      ? disclosureChildren[1].props.children
      : [disclosureChildren[1].props.children];
    expect(analysisContentChildren).toHaveLength(3);
    expect(analysisContentChildren.every((child: any) => child.type === "section")).toBe(true);
    expect(containsElementType(disclosureChildren[1], "details")).toBe(false);
    expect(
      analysisContentChildren.map((section: any) => {
        const heading = Array.isArray(section.props.children) ? section.props.children[0] : section.props.children;
        const headingText = Array.isArray(heading.props.children)
          ? heading.props.children.join("")
          : heading.props.children;
        return headingText.replace(/\s*\(\d+\)$/, "");
      }),
    ).toEqual(["重点词/短语", "段落翻译", "雅思句型分析"]);

    const disclosureText = JSON.stringify(disclosure);
    expect(disclosureText).toContain("重点词/短语");
    expect(disclosureText).toContain("段落翻译");
    expect(disclosureText).toContain("雅思句型分析");
    expect(disclosureText).toContain("快速变化");
    expect(disclosureText).toContain("快速的变化需要仔细规划。");
    expect(disclosureText).toContain("这需要仔细规划。");
  });

  it("keeps empty states inside the single disclosure", () => {
    const panel = ArticleAnalysisPanel({ analysis: { ...analysis, highlights: [], writing_sentences: [] } });
    const disclosureText = JSON.stringify(panel);
    expect(disclosureText).toContain("本段暂无重点词汇。");
    expect(disclosureText).not.toContain("雅思句型分析");
  });

  it("hides the writing sentence section when no strong sentence exists", () => {
    const panel = ArticleAnalysisPanel({ analysis: { ...analysis, writing_sentences: [] } });
    const disclosure = panel.props.children as any;
    const content = disclosure.props.children[1];
    const sections = (content.props.children as any[]).filter(Boolean);
    expect(sections).toHaveLength(2);
    expect(JSON.stringify(content)).not.toContain("写作句型");
  });

  it("renders original text when no analysis highlights exist", () => {
    const noAnalysis = { ...analysis, highlights: [], writing_sentences: [] };
    const segments = splitHighlightedText(noAnalysis.original, noAnalysis.highlights);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe(analysis.original);
    expect(segments[0].highlight).toBe(false);
  });
});

