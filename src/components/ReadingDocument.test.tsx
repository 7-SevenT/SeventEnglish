// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ParagraphAnalysis, Annotation } from "../../worker/src/db";
import { ReadingDocument } from "./ReadingDocument";

const paragraphs: ParagraphAnalysis[] = [{
  index: 0,
  original: "Learn by doing.",
  translation: "边做边学",
  highlights: [{ text: "Learn", type: "word", meaning: "学习", usage: "verb" }],
  writing_sentences: [],
}];

const annotations: Annotation[] = [{
  id: 9,
  article_id: 1,
  from_position: 1,
  to_position: 7,
  selected_text: "Learn ",
  color: "yellow",
  comment: "key",
  created_at: "",
  updated_at: "",
}];

const paragraphWithSentence: ParagraphAnalysis = {
  ...paragraphs[0],
  writing_sentences: [{ text: "Learn by doing.", translation: "边做边学。", usage: "用于强调实践的重要性。" }],
};

describe("ReadingDocument", () => {
  it("renders both AI and user highlight DOM markers", () => {
    render(<ReadingDocument paragraphs={paragraphs} annotations={annotations} onSelectionChange={vi.fn()} />);
    expect(document.querySelector(".article-highlight")).toBeTruthy();
    expect(document.querySelector('mark[data-annotation-id="9"]')).toBeTruthy();
  });

  it("renders a structured sentence card with separate translation and usage", () => {
    render(<ReadingDocument paragraphs={[paragraphWithSentence]} annotations={[]} onSelectionChange={vi.fn()} />);
    expect(document.querySelector(".analysis-sentence__eyebrow")?.textContent).toBe("可迁移句型");
    expect(document.querySelector(".analysis-sentence__translation")?.textContent).toContain("边做边学");
    expect(document.querySelector(".analysis-sentence__usage")?.textContent).toContain("实践的重要性");
  });

  it("places the paragraph analysis directly below its paragraph", () => {
    render(<ReadingDocument paragraphs={paragraphs} annotations={[]} onSelectionChange={vi.fn()} />);
    const paragraph = document.querySelector(".article-paragraph");
    expect(paragraph?.querySelector(".article-paragraph__text")).toBeTruthy();
    expect(paragraph?.querySelector(".article-paragraph__analysis")).toBeTruthy();
    expect(paragraph?.querySelector("summary")?.textContent).toBe("词句精析");
  });
});
