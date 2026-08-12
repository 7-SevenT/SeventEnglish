import { describe, expect, it, vi } from "vitest";
import app from "./index";
import { signToken } from "./auth";
import type { Env } from "./auth";
import { writeAiModelConfig } from "./aiConfig";

const secret = "test-encryption-key"; // 测试用 ENCRYPTION_KEY（签名密钥由它派生）

function env() {
  const rows = new Map<number, any>([[1, { id: 1, title: "Seed", content: "C", publish_date: "2026-01-01", analysis_status: "pending", analysis_json: null, analysis_error: null }]]);
  const settings = new Map<string, string>();
  let next = 2;
  const db = {
    prepare(sql: string) {
      let params: any[] = [];
      const run = async () => {
        if (/INSERT INTO articles/.test(sql)) {
          const id = next++; rows.set(id, { id, title: params[0], content: params[1], publish_date: params[2], analysis_status: "pending", analysis_json: null, analysis_error: null });
        }
        if (/UPDATE articles/.test(sql)) {
          const row = rows.get(params.at(-1)); if (row) { if (["processing", "completed", "failed", "unconfigured"].includes(params[0])) row.analysis_status = params[0]; if (params[1] && params[0] === "completed") row.analysis_json = params[1]; if (["analysis failed", "AI model is not configured"].includes(params[1])) row.analysis_error = params[1]; }
        }
        if (/INSERT INTO settings/.test(sql)) settings.set(String(params[0]), String(params[1]));
        return {};
      };
      const first = async () => {
        if (/last_insert_rowid/.test(sql)) return { id: next - 1 };
        if (/FROM articles/.test(sql)) return rows.get(params[0]) ?? null;
        if (/SELECT value FROM settings/.test(sql)) return settings.has(String(params[0])) ? { value: settings.get(String(params[0])) } : null;
        return null;
      };
      const all = async () => ({ results: [], meta: {} });
      return { run, first, all, bind: (...p: any[]) => { params = p; return { run, first, all }; } };
    },
  } as unknown as D1Database;
  return { LOGIN: "pw", ENCRYPTION_KEY: "test-encryption-key", DB: db, BUCKET: {} as R2Bucket } as Env;
}

async function configuredEnv() {
  const e = env();
  await writeAiModelConfig(e.DB, e.ENCRYPTION_KEY, {
    base_url: "https://example.test/v1",
    model: "test",
    api_key: "secret",
  });
  return e;
}

async function request(path: string, init: RequestInit, e: Env) {
  const token = await signToken(secret, String(Date.now()));
  const pending: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil(promise: Promise<unknown>) { pending.push(promise); },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
  const response = await app.request(
    path,
    { ...init, headers: { cookie: `session=${token}`, ...init.headers } },
    e,
    executionCtx,
  );
  await Promise.all(pending);
  return response;
}


describe("article analysis API", () => {
  it("rejects invalid annotation positions and colors", async () => {
    const e = env();
    const response = await request("/api/articles/1/annotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from_position: 8, to_position: 2, selected_text: "bad", color: "orange", comment: null }),
    }, e);
    expect(response.status).toBe(400);
  });

  it("returns 404 when updating or deleting a missing annotation", async () => {
    const update = await request("/api/annotations/999", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "missing" }),
    }, env());
    const remove = await request("/api/annotations/999", { method: "DELETE" }, env());
    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);
  });

  it("rejects an invalid article id", async () => {
    const response = await request("/api/admin/articles/nope/analyze", { method: "POST" }, env());
    expect(response.status).toBe(404);
  });

  it("keeps the article when analysis fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream secret")));
    const e = await configuredEnv();
    const response = await request("/api/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "T", content: "C", publish_date: "2026-01-01" }) }, e);
    expect(response.status).toBe(201);
    const followup = await request("/api/articles/2", {}, e);
    const body = await followup.json<any>();
    expect(body.analysis_status).toBe("failed");
    expect(body.analysis_error).toBe("analysis failed");
    vi.unstubAllGlobals();
  });

  it("keeps the article and marks it unconfigured when AI is not configured", async () => {
    const e = env();
    const response = await request("/api/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "T", content: "C", publish_date: "2026-01-01" }) }, e);
    expect(response.status).toBe(201);
    const followup = await request("/api/articles/2", {}, e);
    const body = await followup.json<any>();
    expect(body.analysis_status).toBe("unconfigured");
    expect(body.analysis_error).toBe("AI model is not configured");
  });
});
