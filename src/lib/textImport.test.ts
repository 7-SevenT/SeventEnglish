import { describe, expect, it } from "vitest";
import { parseWordListText, normalizeWord, MAX_WORD_LENGTH } from "./textImport";

describe("parseWordListText", () => {
  it("parses a plain word list (one per line)", () => {
    const { items, errors } = parseWordListText("apple\nbanana\ncherry");
    expect(errors).toEqual([]);
    expect(items.map((i) => i.word)).toEqual(["apple", "banana", "cherry"]);
    expect(items.map((i) => i.definition)).toEqual(["", "", ""]);
  });

  it("parses definitions separated by tab / multi-space / commas", () => {
    const text = [
      "apple\t苹果",
      "banana  香蕉（两个空格）",
      "cherry, 樱桃",
      "date，枣",
    ].join("\n");
    const { items, errors } = parseWordListText(text);
    expect(errors).toEqual([]);
    expect(items[0]).toEqual({ word: "apple", definition: "苹果", line: 1 });
    expect(items[1]).toEqual({ word: "banana", definition: "香蕉（两个空格）", line: 2 });
    expect(items[2]).toEqual({ word: "cherry", definition: "樱桃", line: 3 });
    expect(items[3]).toEqual({ word: "date", definition: "枣", line: 4 });
  });

  it("keeps phrases with a single space as one word", () => {
    const { items, errors } = parseWordListText("take off\nwell-known");
    expect(errors).toEqual([]);
    expect(items.map((i) => i.word)).toEqual(["take off", "well-known"]);
  });

  it("skips blank lines and keeps correct line numbers", () => {
    const { items, errors } = parseWordListText("\napple\n\n\nbanana\n");
    expect(errors).toEqual([]);
    expect(items.map((i) => ({ w: i.word, line: i.line }))).toEqual([
      { w: "apple", line: 2 },
      { w: "banana", line: 5 },
    ]);
  });

  it("reports lines that lack a word", () => {
    const { items, errors } = parseWordListText("apple\n, 只有释义\nbanana");
    expect(items.map((i) => i.word)).toEqual(["apple", "banana"]);
    expect(errors).toEqual([{ line: 2, message: "缺少单词" }]);
  });

  it("reports overly long words", () => {
    const long = "x".repeat(MAX_WORD_LENGTH + 1);
    const { items, errors } = parseWordListText(`ok\n${long}`);
    expect(items.map((i) => i.word)).toEqual(["ok"]);
    expect(errors).toEqual([{ line: 2, message: `单词超过 ${MAX_WORD_LENGTH} 字符` }]);
  });

  it("trims surrounding whitespace from word and definition", () => {
    const { items } = parseWordListText("  apple \t 红苹果  ");
    expect(items[0].word).toBe("apple");
    expect(items[0].definition).toBe("红苹果");
  });

  it("handles CRLF line endings", () => {
    const { items, errors } = parseWordListText("apple\r\nbanana\r\n");
    expect(errors).toEqual([]);
    expect(items.map((i) => i.word)).toEqual(["apple", "banana"]);
  });

  it("normalizeWord lowercases and trims", () => {
    expect(normalizeWord("  Apple ")).toBe("apple");
    expect(normalizeWord("Take Off")).toBe("take off");
  });
});
