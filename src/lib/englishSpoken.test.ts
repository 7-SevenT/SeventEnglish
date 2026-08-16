import { describe, expect, it } from "vitest";
import { numberToWords, toEnglishSpokenText } from "./englishSpoken";

describe("numberToWords", () => {
  it("converts basic integers", () => {
    expect(numberToWords(0)).toBe("zero");
    expect(numberToWords(7)).toBe("seven");
    expect(numberToWords(12)).toBe("twelve");
    expect(numberToWords(19)).toBe("nineteen");
    expect(numberToWords(20)).toBe("twenty");
    expect(numberToWords(42)).toBe("forty-two");
    expect(numberToWords(100)).toBe("one hundred");
    expect(numberToWords(123)).toBe("one hundred twenty-three");
    expect(numberToWords(1000)).toBe("one thousand");
    expect(numberToWords(1234)).toBe("one thousand two hundred thirty-four");
    expect(numberToWords(1_000_000)).toBe("one million");
  });

  it("falls back to the raw string for out-of-range values", () => {
    expect(numberToWords(-5)).toBe("-5");
    expect(numberToWords(1.5)).toBe("1.5");
    expect(numberToWords(1_000_000_000)).toBe("1000000000");
  });
});

describe("toEnglishSpokenText", () => {
  it("keeps plain text unchanged", () => {
    expect(toEnglishSpokenText("take off")).toBe("take off");
    expect(toEnglishSpokenText("New York, NY")).toBe("New York, NY");
  });

  it("converts plain numbers to English words", () => {
    expect(toEnglishSpokenText("2024")).toBe("two thousand twenty-four");
    expect(toEnglishSpokenText("Unit 3")).toBe("Unit three");
    expect(toEnglishSpokenText("1,000")).toBe("one thousand");
    expect(toEnglishSpokenText("3.14")).toBe("three point one four");
  });

  it("converts clock times to English words", () => {
    expect(toEnglishSpokenText("3:00")).toBe("three o'clock");
    expect(toEnglishSpokenText("3:30 pm")).toBe("three thirty pm");
    expect(toEnglishSpokenText("12:05 am")).toBe("twelve oh five am");
    expect(toEnglishSpokenText("8:45 PM")).toBe("eight forty-five pm");
  });

  it("converts percentages and currency", () => {
    expect(toEnglishSpokenText("50%")).toBe("fifty percent");
    expect(toEnglishSpokenText("12.5%")).toBe("twelve point five percent");
    expect(toEnglishSpokenText("$5")).toBe("five dollars");
    expect(toEnglishSpokenText("£1")).toBe("one pound");
  });

  it("handles mixed text", () => {
    expect(toEnglishSpokenText("Flight 3:30 pm, 50% off")).toBe("Flight three thirty pm, fifty percent off");
  });
});
