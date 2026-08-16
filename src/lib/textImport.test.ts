import { describe, expect, it } from "vitest";
import { parseWordListText, normalizeWord, MAX_WORD_LENGTH } from "./textImport";

describe("parseWordListText", () => {
  it("parses a plain word list (one per line)", () => {
    const { items, errors } = parseWordListText("apple\nbanana\ncherry");
    expect(errors).toEqual([]);
    expect(items.map((i) => i.word)).toEqual(["apple", "banana", "cherry"]);
    expect(items.map((i) => i.definition)).toEqual(["", "", ""]);
  });

  it("keeps the whole line as one entry, no definition splitting", () => {
    // 每行一个条目：Tab、逗号、多空格等不再被当作释义分隔符，整行原样作为词条
    const text = [
      "take off",
      "3:00 pm",
      "New York, NY",
      "well-known",
      "to be or not to be",
    ].join("\n");
    const { items, errors } = parseWordListText(text);
    expect(errors).toEqual([]);
    expect(items.map((i) => i.word)).toEqual([
      "take off",
      "3:00 pm",
      "New York, NY",
      "well-known",
      "to be or not to be",
    ]);
    expect(items.every((i) => i.definition === "")).toBe(true);
  });

  it("keeps phrases with a single space as one entry", () => {
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

  it("treats any non-empty line as an entry", () => {
    // 旧格式的"只有释义"行（如 ", 只有释义"）现在也按词条导入
    const { items, errors } = parseWordListText("apple\n, 只有释义\nbanana");
    expect(errors).toEqual([]);
    expect(items.map((i) => i.word)).toEqual(["apple", ", 只有释义", "banana"]);
  });

  it("reports overly long entries", () => {
    const long = "x".repeat(MAX_WORD_LENGTH + 1);
    const { items, errors } = parseWordListText(`ok\n${long}`);
    expect(items.map((i) => i.word)).toEqual(["ok"]);
    expect(errors).toEqual([{ line: 2, message: `词条超过 ${MAX_WORD_LENGTH} 字符` }]);
  });

  it("trims surrounding whitespace from each entry", () => {
    const { items } = parseWordListText("  apple  \n  take off  ");
    expect(items.map((i) => i.word)).toEqual(["apple", "take off"]);
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
