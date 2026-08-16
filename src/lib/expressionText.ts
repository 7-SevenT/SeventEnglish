// 表达条目的展示拆分工具。
// AI 生成的 usage 可能是「英文解释 + Example」拼接（如 "Used to describe ... Example: '...'"），
// 展示时拆成两行：英文解释用法（usage）与例句（example）。
export function splitUsage(usage: string): { usage: string; example?: string } {
  const match = usage.match(/^(.*?)(?:Example\s*[:：])(.*)$/is);
  if (!match) return { usage: usage.trim() };
  const before = match[1].trim();
  const after = `Example: ${match[2].trim()}`;
  return { usage: before, example: after };
}
