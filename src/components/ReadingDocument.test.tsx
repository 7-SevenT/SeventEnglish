// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ParagraphAnalysis, Annotation } from "../../worker/src/db";
import { ReadingDocument } from "./ReadingDocument";

const paragraphs: ParagraphAnalysis[] = [{
  index: 0,
  original: "Learn by doing.",
  translation: "边做边学",
  expressions: [{ text: "Learn by doing", meaning: "在做中学", usage: "proverb-like advice" }],
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

describe("ReadingDocument", () => {
  it("renders both AI and user highlight DOM markers", () => {
    render(<ReadingDocument paragraphs={paragraphs} annotations={annotations} onSelectionChange={vi.fn()} />);
    expect(document.querySelector(".article-highlight")).toBeTruthy();
    expect(document.querySelector('mark[data-annotation-id="9"]')).toBeTruthy();
  });

  it("renders the expression list with meaning and usage below the paragraph", () => {
    render(<ReadingDocument paragraphs={paragraphs} annotations={[]} onSelectionChange={vi.fn()} />);
    expect(document.querySelector(".analysis-word__text")?.textContent).toBe("Learn by doing");
    expect(document.querySelector(".analysis-word__meaning")?.textContent).toBe("在做中学");
    expect(document.querySelector(".analysis-word__usage")?.textContent).toBe("Usage: proverb-like advice");
  });

  it("places the paragraph analysis directly below its paragraph", () => {
    render(<ReadingDocument paragraphs={paragraphs} annotations={[]} onSelectionChange={vi.fn()} />);
    const paragraph = document.querySelector(".article-paragraph");
    expect(paragraph?.querySelector(".article-paragraph__text")).toBeTruthy();
    expect(paragraph?.querySelector(".article-paragraph__analysis")).toBeTruthy();
    expect(paragraph?.querySelector("summary")?.textContent).toBe("段落翻译 & 表达积累");
  });
});
