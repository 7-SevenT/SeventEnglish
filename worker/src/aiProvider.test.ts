import { afterEach, describe, expect, it, vi } from "vitest";
import { listUpstreamModels, testUpstreamModel } from "./aiProvider";
import type { AiModelRuntimeConfig } from "./aiConfig";

const config: AiModelRuntimeConfig = {
  baseUrl: "https://provider.example/v1",
  model: "model-a",
  apiKey: "api-secret",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAI-compatible AI provider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists unique model IDs from /models", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      data: [{ id: "model-a" }, { id: "model-b" }, { id: "model-a" }],
    }));

    await expect(listUpstreamModels(config)).resolves.toEqual(["model-a", "model-b"]);
    expect(fetchSpy).toHaveBeenCalledWith("https://provider.example/v1/models", expect.objectContaining({
      headers: {
        Accept: "application/json",
        Authorization: "Bearer api-secret",
      },
    }));
  });

  it("reports whether the configured model appears in the upstream list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ data: [{ id: "other-model" }] }));

    await expect(testUpstreamModel(config)).resolves.toEqual({
      model: "model-a",
      modelCount: 1,
      modelListed: false,
    });
  });

  it("rejects non-success responses without exposing the upstream body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: { message: "secret provider detail" } }, 401));

    await expect(listUpstreamModels(config)).rejects.toThrow("AI provider request failed");
    await expect(listUpstreamModels(config)).rejects.not.toThrow("secret provider detail");
  });

  it("rejects malformed model responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ models: [] }));

    await expect(listUpstreamModels(config)).rejects.toThrow("AI provider response is invalid");
  });
});
