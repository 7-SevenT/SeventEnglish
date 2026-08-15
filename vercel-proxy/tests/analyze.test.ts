import { afterEach, describe, expect, it, vi } from "vitest";

// analyze.ts 在模块加载时读取 process.env.ANALYZE_TOKEN，需在 import 前注入。
vi.hoisted(() => {
  process.env.ANALYZE_TOKEN = "test-token";
});

// module.exports = handler，ESM 下经 default 导出
import analyzeHandler from "../api/analyze";

function makeReq(body?: unknown, token = "test-token") {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return {
    headers: { authorization: `Bearer ${token}` },
    on(ev: "data" | "end", cb: (chunk?: Buffer) => void) {
      if (ev === "data" && raw) cb(Buffer.from(raw));
      if (ev === "end") cb();
      return this;
    },
  } as unknown as import("node:http").IncomingMessage;
}

function makeRes() {
  let statusCode = 200;
  let payload: unknown = null;
  let written = "";
  return {
    get statusCode() { return statusCode; },
    get body() { return payload; },
    status(code: number) { statusCode = code; return this; },
    json(obj: unknown) { payload = obj; return this; },
    writeHead(code: number) { statusCode = code; return this; },
    write(chunk: string) { written += chunk; return true; },
    end(chunk?: string) { if (chunk !== undefined) written += chunk; payload = written; return this; },
  };
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  } as unknown as Response;
}

const VALID_ANALYSIS = {
  version: 1,
  summary: "s",
  paragraphs: [
    { index: 0, original: "P1", translation: "t", highlights: [], writing_sentences: [] },
    { index: 1, original: "P2", translation: "t", highlights: [], writing_sentences: [] },
  ],
  writing_sentences: [],
};

describe("vercel-proxy analyze handler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects requests without a valid token", async () => {
    const res = makeRes();
    await analyzeHandler(makeReq({}, "wrong-token") as never, res as never);
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe("unauthorized");
  });

  it("rejects invalid json body", async () => {
    const res = makeRes();
    await analyzeHandler(makeReq() as never, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid json");
  });

  it("rejects missing fields", async () => {
    const res = makeRes();
    await analyzeHandler(makeReq({ title: "T", content: "C" }) as never, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid request");
  });

  it("rejects a non-http base url", async () => {
    const res = makeRes();
    await analyzeHandler(makeReq({ title: "T", content: "C", baseUrl: "ftp://x", model: "m", apiKey: "k" }) as never, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid base url");
  });

  it("returns the validated analysis on success (single chunk)", async () => {
    const payload = JSON.stringify(VALID_ANALYSIS);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: payload.slice(0, 40) } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: payload.slice(40) } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    ));
    const res = makeRes();
    await analyzeHandler(
      makeReq({ title: "T", content: "P1\n\nP2", baseUrl: "https://api.test/v1", model: "m", apiKey: "k" }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(String(res.body).trim())).toEqual(VALID_ANALYSIS);
    const [url, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.test/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });

  it("merges parallel chunks into a full analysis (4 paragraphs -> 2 chunks)", async () => {
    // 4 段 → 每块 2 段 → 2 个并发 fetch，各自返回对应块的 JSON（summary 仅首块）
    const chunk0 = {
      version: 1,
      summary: "whole article summary",
      paragraphs: [
        { index: 0, original: "P1", translation: "t1", highlights: [], writing_sentences: [] },
        { index: 1, original: "P2", translation: "t2", highlights: [], writing_sentences: [] },
      ],
      writing_sentences: [{ text: "s", translation: "ts", usage: "u" }],
    };
    const chunk1 = {
      version: 1,
      summary: "",
      paragraphs: [
        { index: 2, original: "P3", translation: "t3", highlights: [], writing_sentences: [] },
        { index: 3, original: "P4", translation: "t4", highlights: [], writing_sentences: [] },
      ],
      writing_sentences: [],
    };
    // 直接驱动 handler：按请求体（user 内容）区分块，返回对应块的 JSON（summary 仅首块）
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const user = body.messages[1].content as string;
      const isFirst = user.includes("[0] P1");
      const chunk = isFirst ? chunk0 : chunk1;
      const payload = JSON.stringify(chunk);
      return sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: payload.slice(0, 50) } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: payload.slice(50) } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await analyzeHandler(
      makeReq({ title: "T", content: "P1\n\nP2\n\nP3\n\nP4", baseUrl: "https://api.test/v1", model: "m", apiKey: "k" }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(res.body).trim())).toEqual({
      version: 1,
      summary: "whole article summary",
      paragraphs: [
        { index: 0, original: "P1", translation: "t1", highlights: [], writing_sentences: [] },
        { index: 1, original: "P2", translation: "t2", highlights: [], writing_sentences: [] },
        { index: 2, original: "P3", translation: "t3", highlights: [], writing_sentences: [] },
        { index: 3, original: "P4", translation: "t4", highlights: [], writing_sentences: [] },
      ],
      writing_sentences: [{ text: "s", translation: "ts", usage: "u" }],
    });
  });

  it("returns 200 with error body when the AI provider fails (streaming response)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
    }));
    const res = makeRes();
    await analyzeHandler(
      makeReq({ title: "T", content: "C", baseUrl: "https://api.test/v1", model: "m", apiKey: "k" }) as never,
      res as never,
    );
    // 响应头已先行发出（200），分析失败以 body 中的 error 表达
    expect(res.statusCode).toBe(200);
    expect((JSON.parse(String(res.body).trim()) as { error: string }).error).toContain("AI request failed with status 401");
  });
});
