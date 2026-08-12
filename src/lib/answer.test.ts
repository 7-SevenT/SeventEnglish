import { describe, expect, it } from "vitest";
import { parseAnswer, formatThousands, isCorrect, normalize, sanitizeDigitsInput, isCorrectInput } from "./answer";

describe("parseAnswer 符号预填拆分", () => {
  it("货币前缀", () => {
    expect(parseAnswer("$184")).toEqual({ prefix: "$", suffix: "", digits: "184", rest: "", full: "$184" });
    expect(parseAnswer("£8.50")).toEqual({ prefix: "£", suffix: "", digits: "8.50", rest: "", full: "£8.50" });
    expect(parseAnswer("€77.50")).toEqual({ prefix: "€", suffix: "", digits: "77.50", rest: "", full: "€77.50" });
  });
  it("百分号/摄氏度后缀（含前导空格）", () => {
    expect(parseAnswer("40%")).toEqual({ prefix: "", suffix: "", digits: "", rest: "40%", full: "40%" });
    expect(parseAnswer("19 °C")).toEqual({ prefix: "", suffix: " °C", digits: "19", rest: "", full: "19 °C" });
  });
  it("千分位 + 英文单位（分隔为 digits 与 rest）", () => {
    const p = parseAnswer("500,000 tons");
    expect(p.digits).toBe("500000");
    expect(p.rest).toBe(" tons");
    expect(p.suffix).toBe("");
  });
  it("纯数字带千分位", () => {
    expect(parseAnswer("081260543216").digits).toBe("081260543216");
  });
  it("斜杠/横线分数年份整体入 rest", () => {
    expect(parseAnswer("2/3")).toEqual({ prefix: "", suffix: "", digits: "", rest: "2/3", full: "2/3" });
    expect(parseAnswer("1882-1883")).toEqual({ prefix: "", suffix: "", digits: "", rest: "1882-1883", full: "1882-1883" });
  });
});

describe("formatThousands 千分位实时补", () => {
  it("由小到大", () => {
    expect(formatThousands("5")).toBe("5");
    expect(formatThousands("5000")).toBe("5,000");
    expect(formatThousands("500000")).toBe("500,000");
    expect(formatThousands("5000000")).toBe("5,000,000");
  });
  it("小数保留", () => {
    expect(formatThousands("8.50")).toBe("8.5");
    expect(formatThousands("1234567.89")).toBe("1,234,567.89");
  });
});

describe("isCorrect 判定", () => {
  it("千分位差异判对", () => {
    const p = parseAnswer("500,000 tons");
    expect(isCorrect("500000", "tons", p)).toBe(true);
    expect(isCorrect("500,000", "tons", p)).toBe(true);
  });
  it("后缀符号无需输入", () => {
    const p = parseAnswer("19 °C");
    expect(isCorrect("19", "", p)).toBe(true);
  });
  it("货币前缀无需输入", () => {
    const p = parseAnswer("$184");
    expect(isCorrect("184", "", p)).toBe(true);
  });
  it("分数整体", () => {
    const p = parseAnswer("2/3");
    expect(isCorrect("", "2/3", p)).toBe(true);
  });
  it("大小写/空格容错", () => {
    const p = parseAnswer("100 metres");
    expect(isCorrect("100", "METRES ", p)).toBe(true);
  });
  it("错误判错", () => {
    const p = parseAnswer("$184");
    expect(isCorrect("185", "", p)).toBe(false);
  });
});

describe("normalize", () => {
  it("去逗号去空格小写", () => {
    expect(normalize("  500,000  TONS  ")).toBe("500000 tons");
  });
});

describe("sanitizeDigitsInput", () => {
  it("保留数字与单个小数点", () => {
    expect(sanitizeDigitsInput("8.50")).toBe("8.50");
    expect(sanitizeDigitsInput("85.0")).toBe("85.0");
    expect(sanitizeDigitsInput("123")).toBe("123");
  });
  it("剥掉逗号与字母", () => {
    expect(sanitizeDigitsInput("1,234.56")).toBe("1234.56");
    expect(sanitizeDigitsInput("8a.5b")).toBe("8.5");
  });
  it("限制最多一个小数点（丢弃第二个及之后）", () => {
    expect(sanitizeDigitsInput("1.2.3")).toBe("1.23");
    expect(sanitizeDigitsInput("..12..")).toBe(".12");
  });
  it("空串与纯非数字返回空串", () => {
    expect(sanitizeDigitsInput("")).toBe("");
    expect(sanitizeDigitsInput("abc")).toBe("");
  });
});

describe("formatThousands 边界", () => {
  it("不会产生悬空小数点", () => {
    expect(formatThousands("8.0")).not.toBe("8.");
    expect(formatThousands("8.0")).toBe("8");
    expect(formatThousands("100.00")).toBe("100");
  });
  it("保留有效小数位", () => {
    expect(formatThousands("8.50")).toBe("8.5");
    expect(formatThousands("1234.560")).toBe("1,234.56");
  });
});

describe("isCorrect + sanitizeDigitsInput 链路（小数答案回归）", () => {
  it("£8.50 判对", () => {
    const p = parseAnswer("£8.50");
    expect(isCorrect(sanitizeDigitsInput("8.50"), "", p)).toBe(true);
  });
  it("€77.50 判对", () => {
    const p = parseAnswer("€77.50");
    expect(isCorrect(sanitizeDigitsInput("77.50"), "", p)).toBe(true);
  });
  it("含千分位 + 小数 + 单位判对", () => {
    const p = parseAnswer("1,234.56 tons");
    expect(isCorrect(sanitizeDigitsInput("1,234.56"), "tons", p)).toBe(true);
  });
  it("用户输入带多余字符经清洗后仍判对", () => {
    const p = parseAnswer("£8.50");
    // User types "8.5o" (letter o instead of 0) → sanitized to "8.5"
    // parseAnswer keeps digits as "8.50"; normalized compare: "8.5" vs "8.50" differ
    // So only inputs that preserve the dot and all significant digits pass.
    expect(isCorrect(sanitizeDigitsInput("8.50abc"), "", p)).toBe(true); // "8.50"
    expect(isCorrect(sanitizeDigitsInput("£8.50"), "", p)).toBe(true);   // strips £ → "8.50"
  });
});

describe("isCorrectInput 单输入框判定", () => {
  it("小数答案（输入框保留点）判对", () => {
    expect(isCorrectInput("9.50", parseAnswer("9.50"))).toBe(true);
    expect(isCorrectInput("8.50", parseAnswer("£8.50"))).toBe(true);
    expect(isCorrectInput("77.50", parseAnswer("€77.50"))).toBe(true);
    // 答案 digits 保留了尾零（"8.50"），用户需输入一致（"8.5" 不匹配）
    expect(isCorrectInput("8.5", parseAnswer("£8.50"))).toBe(false);
  });
  it("预填后缀（°C）无需输入；% 需自行填写", () => {
    expect(isCorrectInput("19", parseAnswer("19 °C"))).toBe(true);
    const p40 = parseAnswer("40%");
    expect(isCorrectInput("40", p40)).toBe(false); // % 未填
    expect(isCorrectInput("40%", p40)).toBe(true);  // 用户自行输入 %
  });
  it("预填前缀（$）无需输入", () => {
    expect(isCorrectInput("184", parseAnswer("$184"))).toBe(true);
    expect(isCorrectInput("185", parseAnswer("$184"))).toBe(false);
  });
  it("千分位差异判对（忽略逗号与大小写）", () => {
    const p = parseAnswer("500,000 tons");
    expect(isCorrectInput("500000 tons", p)).toBe(true);
    expect(isCorrectInput("500,000 tonS", p)).toBe(true);
  });
  it("分数与年份整体输入", () => {
    expect(isCorrectInput("2/3", parseAnswer("2/3"))).toBe(true);
    expect(isCorrectInput("1882-1883", parseAnswer("1882-1883"))).toBe(true);
  });
  it("英文单位词容错（大小写/空格）", () => {
    expect(isCorrectInput("100 metres", parseAnswer("100 metres"))).toBe(true);
    expect(isCorrectInput("100 METRES", parseAnswer("100 metres"))).toBe(true);
    expect(isCorrectInput("100 m", parseAnswer("100 metres"))).toBe(false);
  });
});
