import { describe, expect, it, vi } from "vitest";
import app, { handleAnalyzeJob } from "./index";
import { signToken } from "./auth";
import type { Env } from "./auth";
import type { AnalyzeJob } from "./db";
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
          const row = rows.get(params.at(-1)); if (row) {
            row.analysis_status = params[0];
            if (params[0] === "completed") row.analysis_json = params[1];
            if (params[0] === "failed") row.analysis_error = params[1];
          }
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
  return { LOGIN: "pw", ENCRYPTION_KEY: "test-encryption-key", DB: db, BUCKET: {} as R2Bucket, ANALYSIS_QUEUE: { send: async () => {} } as unknown as Queue<AnalyzeJob> } as Env;
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
  return app.request(
    path,
    { ...init, headers: { cookie: `session=${token}`, ...init.headers } },
    e,
  );
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

  it("POST /api/admin/articles/:id/analyze enqueues a job and marks processing", async () => {
    const sends: AnalyzeJob[] = [];
    const e = {
      ...(await configuredEnv()),
      ANALYSIS_QUEUE: { send: async (job: AnalyzeJob) => { sends.push(job); } } as unknown as Queue<AnalyzeJob>,
    };
    const response = await request("/api/admin/articles/1/analyze", { method: "POST" }, e);
    expect(response.status).toBe(200);
    const body = await response.json<any>();
    expect(body.analysis_status).toBe("processing");
    expect(sends).toHaveLength(1);
    expect(sends[0]).toEqual({ id: 1, title: "Seed", content: "C" });
  });

  it("POST /api/admin/articles/:id/analyze rejects a missing article → 404", async () => {
    const response = await request("/api/admin/articles/999/analyze", { method: "POST" }, env());
    expect(response.status).toBe(404);
  });

  it("POST /api/articles enqueues an analysis job and marks processing", async () => {
    const sends: AnalyzeJob[] = [];
    const e = {
      ...(await configuredEnv()),
      ANALYSIS_QUEUE: { send: async (job: AnalyzeJob) => { sends.push(job); } } as unknown as Queue<AnalyzeJob>,
    };
    const response = await request("/api/articles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "T", content: "C", publish_date: "2026-01-01" }) }, e);
    expect(response.status).toBe(201);
    const body = await response.json<any>();
    expect(body.analysis_status).toBe("processing");
    expect(sends).toHaveLength(1);
    expect(sends[0]).toEqual({ id: 2, title: "T", content: "C" });
  });

  it("consumer marks the article failed with the concrete error when AI request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream secret")));
    const e = await configuredEnv();
    await handleAnalyzeJob(e, { id: 1, title: "Seed", content: "C" });
    const followup = await request("/api/articles/1", {}, e);
    const body = await followup.json<any>();
    expect(body.analysis_status).toBe("failed");
    expect(body.analysis_error).toBe("upstream secret");
    vi.unstubAllGlobals();
  });

  it("consumer marks the article unconfigured when AI is not configured", async () => {
    const e = env();
    await handleAnalyzeJob(e, { id: 1, title: "Seed", content: "C" });
    const followup = await request("/api/articles/1", {}, e);
    const body = await followup.json<any>();
    expect(body.analysis_status).toBe("unconfigured");
  });
});
