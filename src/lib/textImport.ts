// 词条文本批量解析：粘贴的"每行一个词条"文本 → 结构化词条。
// 不做释义切分：整行（trim 后）即为词条，支持单词、短语、数字组合与标点（如 take off、3:00 pm、New York, NY）。
// 纯函数、无 DOM 依赖，可独立单元测试。

export const MAX_WORD_LENGTH = 100;

export interface ParsedWordEntry {
  word: string;
  definition: string; // 恒为空串：本工具不解析释义，保留字段仅为兼容后端 words.definition
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

export function parseWordListText(text: string): ParseResult {
  const items: ParsedWordEntry[] = [];
  const errors: ParseError[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((raw, index) => {
    const line = index + 1;
    const word = raw.trim();
    if (!word) return; // 空行 / 纯空白跳过
    if (word.length > MAX_WORD_LENGTH) {
      errors.push({ line, message: `词条超过 ${MAX_WORD_LENGTH} 字符` });
      return;
    }
    items.push({ word, definition: "", line });
  });
  return { items, errors };
}
