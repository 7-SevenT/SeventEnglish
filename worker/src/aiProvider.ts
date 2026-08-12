import type { AiModelRuntimeConfig } from "./aiConfig";

export type UpstreamModel = { id: string; object?: string };

function providerUrl(config: AiModelRuntimeConfig, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
}

export async function listUpstreamModels(config: AiModelRuntimeConfig): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(providerUrl(config, "/models"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
  } catch {
    throw new Error("AI provider request failed");
  }
  if (!response.ok) throw new Error("AI provider request failed");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("AI provider response is invalid");
  }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("AI provider response is invalid");
  }
  const ids = (payload as { data: unknown[] }).data
    .map((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id.trim() : "")
    .filter(Boolean);
  if (ids.length !== (payload as { data: unknown[] }).data.length) throw new Error("AI provider response is invalid");
  return [...new Set(ids)];
}

export async function testUpstreamModel(config: AiModelRuntimeConfig): Promise<{ model: string; modelCount: number; modelListed: boolean }> {
  const models = await listUpstreamModels(config);
  return {
    model: config.model,
    modelCount: models.length,
    modelListed: models.includes(config.model),
  };
}
