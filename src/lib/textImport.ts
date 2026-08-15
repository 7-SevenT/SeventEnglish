// 单词文本批量解析：粘贴的"每行一个单词（可带释义）"文本 → 结构化词条。
// 纯函数、无 DOM 依赖，可独立单元测试。

export const MAX_WORD_LENGTH = 100;
export const MAX_DEFINITION_LENGTH = 500;

export interface ParsedWordEntry {
  word: string;
  definition: string;
  line: number; // 原文本行号（1 起）
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  items: ParsedWordEntry[];
  errors: ParseError[];
}

/** 去重比较用的规范化（trim + 小写）。 */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

/** 按首个分隔符切分 word 与 definition；无分隔符则整行为 word。 */
function splitEntry(line: string): { word: string; definition: string } {
  const tab = line.indexOf("\t");
  const commaEn = line.indexOf(",");
  const commaCn = line.indexOf("，");
  const multiSpace = line.search(/ {2,}/);
  const candidates = [tab, commaEn, commaCn, multiSpace].filter((i) => i >= 0);
  if (candidates.length === 0) return { word: line.trim(), definition: "" };
  const idx = Math.min(...candidates);
  return {
    word: line.slice(0, idx).trim(),
    definition: line.slice(idx + 1).trim(),
  };
}

export function parseWordListText(text: string): ParseResult {
  const items: ParsedWordEntry[] = [];
  const errors: ParseError[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return; // 空行 / 纯空白跳过
    const { word, definition } = splitEntry(trimmed);
    if (!word) {
      errors.push({ line, message: "缺少单词" });
      return;
    }
    if (word.length > MAX_WORD_LENGTH) {
      errors.push({ line, message: `单词超过 ${MAX_WORD_LENGTH} 字符` });
      return;
    }
    items.push({
      word,
      definition: definition.slice(0, MAX_DEFINITION_LENGTH),
      line,
    });
  });
  return { items, errors };
}
