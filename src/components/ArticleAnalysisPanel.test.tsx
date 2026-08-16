import { describe, expect, it } from "vitest";
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
  expressions: [{ text: "rapid change", meaning: "快速变化", usage: "used to describe fast shifts" }],
};

describe("ArticleAnalysisPanel", () => {
  it("renders one collapsed disclosure containing translation and expressions sections", () => {
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
    expect(analysisContentChildren).toHaveLength(2);
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
    ).toEqual(["段落翻译", "最值得积累的英语表达"]);
  });

  it("renders expression items in meaning | usage format", () => {
    const panel = ArticleAnalysisPanel({ analysis });
    const disclosureText = JSON.stringify(panel);
    expect(disclosureText).toContain("rapid change");
    expect(disclosureText).toContain("快速变化");
    expect(disclosureText).toContain("used to describe fast shifts");
    expect(disclosureText).toContain("快速的变化需要仔细规划。");
  });

  it("shows the empty state when no expressions exist", () => {
    const panel = ArticleAnalysisPanel({ analysis: { ...analysis, expressions: [] } });
    const disclosureText = JSON.stringify(panel);
    expect(disclosureText).toContain("本段暂无值得积累的表达。");
  });
});
