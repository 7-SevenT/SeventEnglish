import { describe, expect, it } from "vitest";
import type { ParagraphAnalysis, Annotation } from "../../worker/src/db";
import { buildArticleDoc } from "./articleDocument";

const paragraph: ParagraphAnalysis = {
  index: 0,
  original: "Learn by doing.",
  translation: "边做边学",
  highlights: [{ text: "Learn", type: "word", meaning: "学习", usage: "verb" }],
  writing_sentences: [],
};

const annotation: Annotation = {
  id: 9,
  article_id: 1,
  from_position: 1,
  to_position: 7,
  selected_text: "Learn ",
  color: "yellow",
  comment: "key",
  created_at: "",
  updated_at: "",
};

describe("buildArticleDoc", () => {
  it("creates paragraph nodes and keeps AI highlight marks", () => {
    const doc = buildArticleDoc([paragraph], []);
    expect(doc.type).toBe("doc");
    expect(doc.content?.[0].type).toBe("paragraph");
    expect(doc.content?.[0].content?.[0].marks).toEqual([{ type: "aiHighlight" }]);
  });

  it("adds annotation and AI marks without replacing either", () => {
    const doc = buildArticleDoc([paragraph], [annotation]);
    const marks = doc.content?.[0].content?.[0].marks ?? [];
    expect(marks.map((mark) => mark.type)).toEqual(expect.arrayContaining(["aiHighlight", "annotation"]));
    expect(marks.find((mark) => mark.type === "annotation")?.attrs).toEqual({ annotationId: 9, color: "yellow" });
  });

  it("splits a cross-paragraph annotation at paragraph boundaries", () => {
    const second: ParagraphAnalysis = { ...paragraph, index: 1, original: "Keep going." };
    const crossParagraph = { ...annotation, from_position: 14, to_position: 21 };
    const doc = buildArticleDoc([paragraph, second], [crossParagraph]);
    expect(doc.content?.[0].content?.some((node) => node.marks?.some((mark) => mark.type === "annotation"))).toBe(true);
    expect(doc.content?.[1].content?.some((node) => node.marks?.some((mark) => mark.type === "annotation"))).toBe(true);
  });
});
