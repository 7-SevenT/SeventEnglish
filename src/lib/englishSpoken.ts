// 朗读文本预处理：把词条里的数字/时间/百分比/货币转成英文单词形式。
// 目的：即使浏览器没有英文 TTS 语音、不得不退回系统默认（中文）语音，
// 数字也会以英文单词（如 three、fifty percent）朗读，而不是读成中文数字。
// 纯函数、无 DOM 依赖，可独立单元测试。

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];
const SCALES = ["", "thousand", "million"];

/** 0 <= n < 100 转英文单词。 */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one === 0 ? TENS[ten] : `${TENS[ten]}-${ONES[one]}`;
}

/** 0 <= n < 1000 转英文单词。 */
function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundred > 0) parts.push(`${ONES[hundred]} hundred`);
  if (rest > 0) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/** 整数（0 <= n < 1e9）转英文单词。 */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000_000) return String(n);
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (let scale = 0; n > 0; scale++) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const words = threeDigits(chunk);
      parts.unshift(scale === 0 ? words : `${words} ${SCALES[scale]}`);
    }
    n = Math.floor(n / 1000);
  }
  return parts.join(" ");
}

function stripCommas(s: string): string {
  return s.replace(/,/g, "");
}

function readDecimal(integerPart: number, fracDigits: string): string {
  const digits = fracDigits.split("").map((d) => ONES[Number(d)]).join(" ");
  return `${numberToWords(integerPart)} point ${digits}`;
}

function readTime(hour: number, minute: number, meridiem: string): string {
  const h = numberToWords(hour);
  let m: string;
  if (minute === 0) m = "o'clock";
  else if (minute < 10) m = `oh ${ONES[minute]}`;
  else m = twoDigits(minute);
  const suffix = meridiem ? ` ${meridiem.toLowerCase()}` : "";
  return `${h} ${m}${suffix}`;
}

/** 把文本中的数字类内容转成英文单词形式；其余内容原样保留。 */
export function toEnglishSpokenText(text: string): string {
  let out = text;

  // 1) 时间：h:mm（可选 am/pm），如 3:30 pm → three thirty pm
  out = out.replace(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/gi, (_match, h: string, m: string, meridiem?: string) =>
    readTime(Number(h), Number(m), meridiem ?? "")
  );

  // 2) 百分比：50% → fifty percent
  out = out.replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, n: string) =>
    n.includes(".") ? `${toEnglishSpokenText(n)} percent` : `${numberToWords(Number(n))} percent`
  );

  // 3) 货币：$5 / €5 / £5 → five dollars / five euros / five pounds
  out = out.replace(/[$€£]\s*(\d+(?:\.\d+)?)/g, (_match, n: string) => {
    const amount = Number(n);
    const currency = _match[0] === "$" ? "dollar" : _match[0] === "€" ? "euro" : "pound";
    const words = amount === 1 ? `${numberToWords(amount)} ${currency}` : `${numberToWords(amount)} ${currency}s`;
    return words;
  });

  // 4) 千分位整数：1,000 → one thousand
  out = out.replace(/\d{1,3}(?:,\d{3})+/g, (m) => numberToWords(Number(stripCommas(m))));

  // 5) 普通整数 / 小数：2024 → two thousand twenty-four；3.14 → three point one four
  out = out.replace(/\d+(\.\d+)?/g, (m) => {
    if (m.includes(".")) {
      const [intPart, frac] = m.split(".");
      return readDecimal(Number(intPart), frac);
    }
    return numberToWords(Number(m));
  });

  return out;
}
