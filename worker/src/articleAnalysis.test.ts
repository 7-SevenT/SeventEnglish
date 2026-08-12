import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  splitParagraphs,
  extractJson,
  validateArticleAnalysis,
  generateArticleAnalysis,
  SYSTEM_PROMPT,
} from "./articleAnalysis";
import type { AiModelRuntimeConfig } from "./aiConfig";

// ---------- splitParagraphs ----------

describe("splitParagraphs", () => {
  it("splits by consecutive blank lines", () => {
    const content = "First paragraph.\n\nSecond one.\n\nThird.";
    expect(splitParagraphs(content)).toEqual([
      "First paragraph.",
      "Second one.",
      "Third.",
    ]);
  });

  it("treats 3+ blank lines the same as 2", () => {
    const content = "A\n\n\n\nB";
    expect(splitParagraphs(content)).toEqual(["A", "B"]);
  });

  it("trims leading/trailing whitespace and drops empty result segments", () => {
    const content = "\n\nA\n\n\nB\n\n";
    expect(splitParagraphs(content)).toEqual(["A", "B"]);
  });

  it("returns single paragraph when no blank line separators", () => {
    expect(splitParagraphs("Only one\nline here")).toEqual(["Only one\nline here"]);
  });

  it("returns empty array for blank input", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("\n\n\n")).toEqual([]);
  });

  it("normalizes single newlines within a paragraph but keeps single-line paragraphs", () => {
    // Single newlines (not blank lines) should NOT split a paragraph.
    const content = "Line1\nLine2\n\nLine3";
    expect(splitParagraphs(content)).toEqual(["Line1\nLine2", "Line3"]);
  });
});

// ---------- extractJson ----------

describe("extractJson", () => {
  it("parses plain JSON object", () => {
    const text = '{"version":1,"paragraphs":[]}';
    expect(extractJson(text)).toEqual({ version: 1, paragraphs: [] });
  });

  it("parses JSON wrapped in ```json code block", () => {
    const text = 'Some prose\n```json\n{"version":1,"paragraphs":[]}\n```\ntrailing';
    expect(extractJson(text)).toEqual({ version: 1, paragraphs: [] });
  });

  it("parses JSON wrapped in bare ``` code block", () => {
    const text = '```\n{"version":1}\n```';
    expect(extractJson(text)).toEqual({ version: 1 });
  });

  it("throws on non-JSON text", () => {
    expect(() => extractJson("just plain text")).toThrow();
  });

  it("throws when code block has no JSON", () => {
    expect(() => extractJson("```json\nnot json here\n```")).toThrow();
  });

  it("throws on empty input", () => {
    expect(() => extractJson("")).toThrow();
  });
});

// ---------- validateArticleAnalysis ----------

function validParagraph(index: number, original: string, translation = "译") {
  return {
    index,
    original,
    translation,
    highlights: [
      {
        text: "word",
        type: "word" as const,
        meaning: "意思",
        usage: "用法",
        example: "an example",
        ielts_category: "reading" as const,
      },
    ],
    writing_sentences: [
      { text: "a sentence", translation: "翻译", usage: "用途", tags: ["academic"] },
    ],
  };
}

const validParagraphsContent = "Para A\n\nPara B";
const validAnalysis = {
  version: 1,
  summary: "概要",
  paragraphs: [
    validParagraph(0, "Para A"),
    validParagraph(1, "Para B"),
  ],
  writing_sentences: [
    { text: "global sentence", translation: "全局句译", usage: "用途", tags: [] },
  ],
};

describe("validateArticleAnalysis", () => {
  it("accepts a well-formed analysis", () => {
    const out = validateArticleAnalysis(validAnalysis, ["Para A", "Para B"]);
    expect(out.version).toBe(1);
    expect(out.paragraphs).toHaveLength(2);
    expect(out.paragraphs[0].index).toBe(0);
    expect(out.paragraphs[1].highlights[0].ielts_category).toBe("reading");
  });

  it("rejects wrong version", () => {
    expect(() =>
      validateArticleAnalysis({ ...validAnalysis, version: 2 }, ["Para A", "Para B"])
    ).toThrow(/version/i);
  });

  it("rejects missing paragraphs", () => {
    const { paragraphs, ...rest } = validAnalysis;
    void paragraphs;
    expect(() => validateArticleAnalysis(rest, ["Para A", "Para B"])).toThrow();
  });

  it("rejects paragraphs count mismatch", () => {
    expect(() =>
      validateArticleAnalysis(
        { ...validAnalysis, paragraphs: [validParagraph(0, "Para A")] },
        ["Para A", "Para B"]
      )
    ).toThrow(/paragraph/i);
  });

  it("rejects paragraph original that does not match input segments", () => {
    expect(() =>
      validateArticleAnalysis(
        { ...validAnalysis, paragraphs: [validParagraph(0, "WRONG"), validParagraph(1, "Para B")] },
        ["Para A", "Para B"]
      )
    ).toThrow(/original/i);
  });

  it("rejects paragraph index mismatch (out of order)", () => {
    expect(() =>
      validateArticleAnalysis(
        {
          ...validAnalysis,
          paragraphs: [validParagraph(1, "Para A"), validParagraph(0, "Para B")],
        },
        ["Para A", "Para B"]
      )
    ).toThrow(/index/i);
  });

  it("rejects highlight with invalid type", () => {
    const bad = JSON.parse(JSON.stringify(validAnalysis));
    bad.paragraphs[0].highlights[0].type = "nonexistent";
    expect(() => validateArticleAnalysis(bad, ["Para A", "Para B"])).toThrow(/type/i);
  });

  it("rejects highlight missing meaning", () => {
    const bad = JSON.parse(JSON.stringify(validAnalysis));
    delete bad.paragraphs[0].highlights[0].meaning;
    expect(() => validateArticleAnalysis(bad, ["Para A", "Para B"])).toThrow(/meaning/i);
  });

  it("rejects writing_sentence missing translation", () => {
    const bad = JSON.parse(JSON.stringify(validAnalysis));
    delete bad.paragraphs[0].writing_sentences[0].translation;
    expect(() => validateArticleAnalysis(bad, ["Para A", "Para B"])).toThrow(/translation/i);
  });

  it("rejects top-level writing_sentences not an array", () => {
    const bad = { ...validAnalysis, writing_sentences: "not array" };
    expect(() => validateArticleAnalysis(bad, ["Para A", "Para B"])).toThrow(/writing_sentences/i);
  });

  it("rejects invalid ielts_category", () => {
    const bad = JSON.parse(JSON.stringify(validAnalysis));
    bad.paragraphs[0].highlights[0].ielts_category = "invalid";
    expect(() => validateArticleAnalysis(bad, ["Para A", "Para B"])).toThrow(/ielts/i);
  });

  it("rejects non-object root", () => {
    expect(() => validateArticleAnalysis("string", ["Para A", "Para B"])).toThrow();
  });
});

describe("SYSTEM_PROMPT", () => {
  it("requires selective, optional writing sentence analysis", () => {
    expect(SYSTEM_PROMPT).toContain("at most one");
    expect(SYSTEM_PROMPT).toContain("empty array");
    expect(SYSTEM_PROMPT).toContain("transferable IELTS writing value");
  });
});

// ---------- generateArticleAnalysis ----------

function makeConfig(): AiModelRuntimeConfig {
  return {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    model: "gpt-4o-mini",
  };
}

function mockFetchResponse(content: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { choices: [{ message: { content } }] };
    },
    async text() {
      return JSON.stringify({ choices: [{ message: { content } }] });
    },
  };
}

describe("generateArticleAnalysis", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the supplied runtime config for chat completions", async () => {
    const body = JSON.stringify({
      summary: "概要",
      version: 1,
      paragraphs: [validParagraph(0, "Para A"), validParagraph(1, "Para B")],
      writing_sentences: [],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse(body) as unknown as Response,
    );
    const config: AiModelRuntimeConfig = {
      baseUrl: "https://provider.example/v1",
      model: "model-a",
      apiKey: "api-secret",
    };

    await generateArticleAnalysis(config, "Title", validParagraphsContent);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://provider.example/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer api-secret" }),
        body: expect.stringContaining('"model":"model-a"'),
      }),
    );
  });

  it("sends request and returns validated analysis", async () => {
    const body = JSON.stringify({
      summary: "概要",
      version: 1,
      paragraphs: [
        validParagraph(0, "Para A"),
        validParagraph(1, "Para B"),
      ],
      writing_sentences: [],
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse(body) as unknown as Response
    );

    const out = await generateArticleAnalysis(makeConfig(), "Title", validParagraphsContent);
    expect(out.version).toBe(1);
    expect(out.paragraphs).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    void init;
    expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("sends request and parses ```json code block response", async () => {
    const obj = {
      summary: "概要",
      version: 1,
      paragraphs: [validParagraph(0, "Para A"), validParagraph(1, "Para B")],
      writing_sentences: [],
    };
    const body = "```json\n" + JSON.stringify(obj) + "\n```";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse(body) as unknown as Response
    );

    const out = await generateArticleAnalysis(makeConfig(), "Title", validParagraphsContent);
    expect(out.version).toBe(1);
  });

  it("throws on non-2xx HTTP status", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      async json() {
        return { error: "bad" };
      },
      async text() {
        return JSON.stringify({ error: "bad" });
      },
    } as unknown as Response);
    void fetchSpy;

    await expect(
      generateArticleAnalysis(makeConfig(), "Title", validParagraphsContent)
    ).rejects.toThrow(/401|http|status/i);
  });

  it("throws when analysis JSON fails validation", async () => {
    const body = JSON.stringify({ version: 2 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchResponse(body) as unknown as Response
    );

    await expect(
      generateArticleAnalysis(makeConfig(), "Title", validParagraphsContent)
    ).rejects.toThrow();
  });

  it("aborts the request and throws a timeout error when the provider never responds", async () => {
    // fetch 永不 resolve：模拟 AI 提供商无响应。超时由 AbortSignal 触发。
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (!signal) throw new Error("expected an abort signal");
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })
    );

    await expect(
      generateArticleAnalysis(makeConfig(), "Title", validParagraphsContent, 50)
    ).rejects.toThrow(/timed out after 50ms/);
  });
});