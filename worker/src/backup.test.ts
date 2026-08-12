import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { backupAll, restoreAll } from "./backup";
import { writeWebdavConfig } from "./webdavConfig";
import type { Env } from "./auth";

const KEY = "test-encryption-key";
const WEBDAV = "https://dav.example.com/dav/";

const app = new Hono<{ Bindings: Env }>();
app.post("/backup", async (c) => backupAll(c));
app.post("/backup/restore", async (c) => restoreAll(c));
// 支持 settings 读取 + 各表 SELECT/DELETE/INSERT 的最小 mock D1
function backupDb(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const ops: string[] = [];
  return {
    ops,
    db: {
      prepare(statement: string) {
        let params: unknown[] = [];
        const all = async () => {
          if (statement.includes("SELECT value FROM settings")) {
            return { results: [], meta: {} };
          }
          const table = statement.replace(/^SELECT \* FROM /, "").trim();
          return { results: table === "articles" ? [{ id: 1, title: "A" }] : [], meta: {} };
        };
        const first = async () => {
          if (!statement.includes("SELECT value FROM settings")) return null;
          return values.has(String(params[0])) ? { value: values.get(String(params[0])) } : null;
        };
        const run = async () => {
          ops.push(statement);
          if (statement.includes("INSERT INTO settings")) values.set(String(params[0]), String(params[1]));
          return { meta: {} };
        };
        return {
          bind: (...next: unknown[]) => {
            params = next;
            return { all, first, run };
          },
          all,
          first,
          run,
        };
      },
      batch: async (stmts: D1PreparedStatement[]) => {
        for (let i = 0; i < stmts.length; i++) ops.push("BATCH");
        return stmts.map(() => ({ meta: {} }));
      },
    } as unknown as D1Database,
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init))));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backup routes (worker)", () => {
  it("rejects backup when WebDAV is not configured", async () => {
    const { db } = backupDb();
    const res = await app.request("/backup", { method: "POST" }, { DB: db, ENCRYPTION_KEY: KEY } as Env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "未配置 WebDAV，请到管理后台设置" });
  });

  it("uploads all tables to WebDAV with Basic auth", async () => {
    const { db } = backupDb();
    await writeWebdavConfig(db, KEY, { url: WEBDAV, username: "user", password: "pass" });

    const calls: { url: string; method?: string; auth?: string }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, method: init?.method, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
      if (init?.method === "MKCOL" || init?.method === "PROPFIND") return new Response(null, { status: 201 });
      return new Response(null, { status: 200 });
    });

    const res = await app.request("/backup", { method: "POST" }, { DB: db, ENCRYPTION_KEY: KEY } as Env);
    expect(res.status).toBe(200);
    const body = await res.json<{ data: { ok: boolean; createdAt: string } }>();
    expect(body.data.ok).toBe(true);

    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("https://dav.example.com/dav/SeventEnglish/seventenglish-backup.json");
    expect(put?.auth).toBe("Basic " + btoa("user:pass"));
  });

  it("returns 502 when WebDAV upload fails", async () => {
    const { db } = backupDb();
    await writeWebdavConfig(db, KEY, { url: WEBDAV, username: "user", password: "pass" });
    mockFetch(() => new Response("denied", { status: 403 }));
    const res = await app.request("/backup", { method: "POST" }, { DB: db, ENCRYPTION_KEY: KEY } as Env);
    expect(res.status).toBe(502);
  });

  it("restores tables from WebDAV backup", async () => {
    const { db, ops } = backupDb();
    await writeWebdavConfig(db, KEY, { url: WEBDAV, username: "user", password: "pass" });

    const payload = {
      app: "sevent-english",
      version: 1,
      tables: {
        articles: [{ id: 7, title: "Restored", content: "x", publish_date: "2026-01-01", analysis_status: "pending" }],
        word_books: [],
        units: [],
        words: [],
        annotations: [],
        article_notes: [],
        settings: [],
      },
    };
    mockFetch((_url, init) => {
      if (init?.method === "GET") return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(null, { status: 200 });
    });

    const res = await app.request("/backup/restore", { method: "POST" }, { DB: db, ENCRYPTION_KEY: KEY } as Env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });

    // 恢复的 DELETE + INSERT 全部通过 batch 执行（子表删除先行 + 带原 id 插入）
    expect(ops.filter((op) => op.startsWith("BATCH")).length).toBeGreaterThan(0);
    expect(ops.length).toBeGreaterThan(2);
  });

  it("rejects restore with invalid backup payload", async () => {
    const { db } = backupDb();
    await writeWebdavConfig(db, KEY, { url: WEBDAV, username: "user", password: "pass" });
    mockFetch(() => new Response("not json", { status: 200 }));
    const res = await app.request("/backup/restore", { method: "POST" }, { DB: db, ENCRYPTION_KEY: KEY } as Env);
    expect(res.status).toBe(400);
  });
});
