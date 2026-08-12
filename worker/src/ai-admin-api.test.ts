import { afterEach, describe, expect, it, vi } from "vitest";
import app from "./index";
import { signToken } from "./auth";
import type { Env } from "./auth";
import { writeAiModelConfig } from "./aiConfig";

const secret = "test-encryption-key"; // 测试用 ENCRYPTION_KEY（签名密钥由它派生）

function mockEnv(): Env {
  const settings = new Map<string, string>();
  const db = {
    prepare(statement: string) {
      let params: unknown[] = [];
      const run = async () => {
        if (statement.includes("INSERT INTO settings")) settings.set(String(params[0]), String(params[1]));
        return {};
      };
      const first = async () => {
        if (statement.includes("SELECT value FROM settings")) {
          const value = settings.get(String(params[0]));
          return value === undefined ? null : { value };
        }
        return null;
      };
      const all = async () => statement.includes("FROM word_books")
        ? { results: [{ id: 1, name: "Book", description: "Desc", created_at: "2026-01-01", unit_count: 2, word_count: 3 }], meta: {} }
        : { results: [], meta: {} };
      return {
        run,
        first,
        all,
        bind: (...next: unknown[]) => { params = next; return { run, first, all }; },
      };
    },
  } as unknown as D1Database;
  return {
    LOGIN: "sevent",
    ENCRYPTION_KEY: "test-encryption-key",
    DB: db,
    BUCKET: {} as R2Bucket,
  };
}

async function request(path: string, env: Env, init: RequestInit = {}) {
  const token = await signToken(secret, String(Date.now()));
  return app.request(path, {
    ...init,
    headers: { cookie: `session=${token}`, ...init.headers },
  }, env);
}

describe("AI model admin API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects unauthenticated AI config requests", async () => {
    const response = await app.request("/api/admin/ai-model", {}, mockEnv());
    expect(response.status).toBe(401);
  });

  it("returns a redacted saved config", async () => {
    const env = mockEnv();
    await writeAiModelConfig(env.DB, env.ENCRYPTION_KEY, {
      base_url: "https://provider.example/v1",
      model: "model-a",
      api_key: "api-secret",
    });

    const response = await request("/api/admin/ai-model", env);
    const body = await response.json<any>();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ base_url: "https://provider.example/v1", model: "model-a", has_api_key: true });
    expect(body).not.toHaveProperty("api_key");
    expect(JSON.stringify(body)).not.toContain("api-secret");
  });

  it("saves a config and fetches the upstream model list", async () => {
    const env = mockEnv();
    const response = await request("/api/admin/ai-model", env, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base_url: "https://provider.example/v1", model: "model-b", api_key: "api-secret" }),
    });
    expect(response.status).toBe(200);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const models = await request("/api/admin/ai-model/models", env, { method: "POST" });
    expect(models.status).toBe(200);
    expect(await models.json()).toEqual({ models: ["model-a", "model-b"] });
  });

  it("tests a configured model and reports when it is absent from the list", async () => {
    const env = mockEnv();
    await writeAiModelConfig(env.DB, env.ENCRYPTION_KEY, {
      base_url: "https://provider.example/v1",
      model: "custom-model",
      api_key: "api-secret",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ id: "other-model" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const response = await request("/api/admin/ai-model/test", env, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ model: "custom-model", modelCount: 1, modelListed: false });
  });

  it("returns the dictation overview for the admin workspace", async () => {
    const response = await request("/api/admin/dictation/overview", mockEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { id: 1, name: "Book", description: "Desc", created_at: "2026-01-01", unit_count: 2, word_count: 3 },
    ]);
  });
});
