export interface ParsedAnswer {
  prefix: string;
  suffix: string;
  digits: string;
  rest: string;
  full: string;
}

const CURRENCIES = ["$", "£", "€"];
// 仅 °C 作为预填后缀；% 需用户自行填写，不预填。
const SUFFIX_SET = ["°C"];

export function parseAnswer(word: string): ParsedAnswer {
  const full = word.trim();
  let rest = full;
  let prefix = "";
  for (const c of CURRENCIES) {
    if (rest.startsWith(c)) {
      prefix = c;
      rest = rest.slice(c.length);
      break;
    }
  }
  let suffix = "";
  for (const s of SUFFIX_SET) {
    if (rest.endsWith(s)) {
      let idx = rest.length - s.length;
      if (idx > 0 && rest[idx - 1] === " ") {
        idx -= 1;
        suffix = " " + s;
      } else {
        suffix = s;
      }
      rest = rest.slice(0, idx);
      break;
    }
  }
  rest = rest.trim();
  const split = splitCore(rest);
  return { prefix, suffix, digits: split.digits, rest: split.rest, full };
}

// 仅当前缀是"数字(可含 . 与千分位,可选空格 字母单位)"时拆 digits；否则整体入 rest。
function splitCore(core: string): { digits: string; rest: string } {
  const m = core.match(/^(\d+(?:[.,]\d+)*)( *(?:[A-Za-z][A-Za-z ]*)?)$/);
  if (m) return { digits: m[1].replace(/,/g, ""), rest: m[2] };
  return { digits: "", rest: core };
}

export function sanitizeDigitsInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

export function formatThousands(raw: string): string {
  const neg = raw.startsWith("-");
  const s = neg ? raw.slice(1) : raw;
  const dot = s.indexOf(".");
  const int = dot >= 0 ? s.slice(0, dot) : s;
  const frac = dot >= 0 ? s.slice(dot) : "";
  // Trim trailing zeros but avoid a dangling dot: if nothing remains after the dot, drop it entirely.
  const fracTrimmed = frac === "" ? "" : (() => {
    const t = frac.replace(/0+$/, "");
    return t === "." ? "" : t;
  })();
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + intFormatted + fracTrimmed;
}

export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
}

export function isCorrect(userDigits: string, userRest: string, parsed: ParsedAnswer): boolean {
  const expected = normalize(parsed.digits + " " + parsed.rest);
  const got = normalize(userDigits.replace(/,/g, "") + " " + userRest);
  return got === expected;
}

/**
 * 单输入框判定：用户在一个框内输入听到的完整内容（数字/点/英文单位/符号打在一起），
 * 预填的 prefix/suffix（$ £ € % °C）只读显示、不计入用户输入。
 * 比较时忽略大小写、多余空格与千分位逗号。
 */
export function isCorrectInput(userInput: string, parsed: ParsedAnswer): boolean {
  const expected = normalize(parsed.digits + " " + parsed.rest);
  const got = normalize(userInput);
  return got === expected;
}
