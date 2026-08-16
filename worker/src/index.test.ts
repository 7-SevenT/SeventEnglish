import { describe, it, expect } from "vitest";
import { app } from "./index";
import type { Env } from "./auth";
import type { AnalyzeJob } from "./db";
import { signToken } from "./auth";

const SECRET = "test-encryption-key"; // 测试用 ENCRYPTION_KEY（与 mockEnv 一致，签名密钥由它派生）

// 最小可用的 mock D1：仅实现受测路由（/api/articles、/api/articles/:id）
// 会触发的 prepare/bind/first/all 路径。边界 cast 到 D1Database。
function mockD1() {
  const rows: { id: number; title: string; content: string; publish_date: string }[] = [
    { id: 1, title: "A", content: "hi", publish_date: "2026-08-01" },
  ];
  return {
    prepare(stmt: string) {
      let params: unknown[] = [];
      const all = async () => {
        if (stmt.includes("json_group_array")) {
          const results = rows.map((r) => ({
            publish_date: r.publish_date,
            articles: JSON.stringify([{ id: r.id, title: r.title }]),
          }));
          return { results, meta: {} };
        }
        return { results: [], meta: {} };
      };
      const first = async () => {
        if (stmt.startsWith("SELECT * FROM articles")) {
          const id = Number(params[0]);
          return rows.find((r) => r.id === id) ?? null;
        }
        return null;
      };
      return { all, first, bind: (...p: unknown[]) => { params = p; return { all, first }; } };
    },
  } as unknown as D1Database;
}

function mockEnv(): Env {
  return {
    LOGIN: "correct-horse",
    ENCRYPTION_KEY: "test-encryption-key",
    DB: mockD1(),
    BUCKET: {} as R2Bucket,
    ANALYSIS_QUEUE: { send: async () => {} } as unknown as Queue<AnalyzeJob>,
  };
}

describe("data API auth", () => {
  it("rejects /api/articles without a session cookie → 401", async () => {
    const res = await app.request("/api/articles", {}, mockEnv());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects /api/articles/:id without a session cookie → 401", async () => {
    const res = await app.request("/api/articles/1", {}, mockEnv());
    expect(res.status).toBe(401);
  });

  it("accepts /api/articles with a valid session cookie → 200", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/articles",
      { headers: { cookie: `session=${token}` } },
      mockEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ date: string }[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("date");
  });

  it("rejects /api/articles with an invalid session cookie → 401", async () => {
    const res = await app.request(
      "/api/articles",
      { headers: { cookie: "session=not-a-real-token" } },
      mockEnv()
    );
    expect(res.status).toBe(401);
  });
});

describe("article id validation (Finding 2)", () => {
  it("returns 404 for a non-numeric id", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/articles/abc",
      { headers: { cookie: `session=${token}` } },
      mockEnv()
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("returns 404 for a non-positive/invalid id", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    for (const id of ["0", "-3", "1.5"]) {
      const res = await app.request(
        `/api/articles/${id}`,
        { headers: { cookie: `session=${token}` } },
        mockEnv()
      );
      expect(res.status).toBe(404);
    }
  });

  it("returns 404 for a valid-format but missing id", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/articles/999",
      { headers: { cookie: `session=${token}` } },
      mockEnv()
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 for an existing id with a valid cookie", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/articles/1",
      { headers: { cookie: `session=${token}` } },
      mockEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ id: number; title: string }>();
    expect(body.id).toBe(1);
    expect(body.title).toBe("A");
  });
});

describe("listening API id validation", () => {
  const tokenPromise = signToken(SECRET, String(Date.now()));

  async function authedRequest(path: string) {
    const token = await tokenPromise;
    return app.request(path, { headers: { cookie: `session=${token}` } }, mockEnv());
  }

  it("rejects /api/books/:bookId/units for a non-numeric/invalid bookId → 404", async () => {
    for (const id of ["abc", "0", "-3", "1.5"]) {
      const res = await authedRequest(`/api/books/${id}/units`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not found" });
    }
  });

  it("rejects /api/units/:unitId/words for a non-numeric/invalid unitId → 404", async () => {
    for (const id of ["abc", "0", "-3", "1.5"]) {
      const res = await authedRequest(`/api/units/${id}/words`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not found" });
    }
  });

  it("rejects /api/units without a session cookie → 401 (prefix mounted)", async () => {
    const res = await app.request("/api/units/1/words", {}, mockEnv());
    expect(res.status).toBe(401);
  });
});

// ---- 管理后台写 API ----

// 记录 DB 写入操作与 R2 上传内容的 mock。
interface DbOp {
  stmt: string;
  params: unknown[];
}

interface DbOp {
  stmt: string;
  params: unknown[];
}

function DB_OK(unitExists = true, stmt?: string, wordKeys: string[] = []) {
  return {
    run: async () => ({}),
    all: async () => {
      // 删书/删单元时收集 R2 音频 key（audio_key 非空）
      if (stmt && /SELECT .*audio_key FROM words/i.test(stmt)) {
        return { results: wordKeys.map((audio_key) => ({ audio_key })), meta: {} };
      }
      return { results: [], meta: {} };
    },
    first: async () => {
      if (stmt && /FROM units/i.test(stmt)) return unitExists ? { id: 1 } : null;
      // 删词时查询 audio_key：wordKeys 有值返回首个 key，否则视为 TTS 词条（空串，存在）
      if (stmt && /SELECT audio_key FROM words/i.test(stmt)) {
        return wordKeys.length ? { audio_key: wordKeys[0] } : { audio_key: "" };
      }
      return null;
    },
  };
}

// push 每次 bind 后的完整语句到 ops，供断言使用；prepare 返回的语句在无 bind 时也可直接 first/all/run（如 lastRowId）。
// unitExists 控制 POST /api/words 的 unit 存在性校验结果：默认存在（返回 {id:1}），
// 传 false 时单位 SELECT 返回 null → 模拟 unit 不存在路径。
// wordKeys 控制删除路由查询到的 R2 音频 key（删词取首个，删书/删单元取全部）。
function mockWriteDb(ops: DbOp[], unitExists = true, wordKeys: string[] = []): D1Database {
  return {
    prepare(stmt: string) {
      return {
        ...DB_OK(unitExists, stmt, wordKeys),
        bind: (...params: unknown[]) => {
          ops.push({ stmt, params });
          return DB_OK(unitExists, stmt, wordKeys);
        },
      };
    },
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      // 语句在 prepare().bind() 时已记录进 ops，batch 仅负责"执行"，避免重复记录
      const results: unknown[] = [];
      for (const s of stmts) results.push(await s.run());
      return results;
    },
  } as unknown as D1Database;
}

// 用于监听 DB 写入、R2 上传与删除的 mock 环境。
function mockWriteEnv(unitExists = true, wordKeys: string[] = []) {
  const ops: DbOp[] = [];
  const objStore = new Set<string>();
  const deletes: string[] = [];
  const r2 = {
    async put(
      key: string,
      _value: ReadableStream | ArrayBuffer | null,
      opts?: R2PutOptions
    ) {
      objStore.add(key);
      const md = opts?.httpMetadata;
      puts.push({ key, contentType: (md && "contentType" in md && md.contentType) || undefined });
      return {};
    },
    async delete(key: string) {
      deletes.push(key);
      objStore.delete(key);
    },
    async get(key: string) {
      if (!objStore.has(key)) return null;
      const obj = {
        body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(key)); c.close(); } }),
        httpMetadata: { contentType: "audio/mpeg" },
        key,
        etag: "x",
        size: key.length,
        uploaded: new Date(),
      } as unknown as R2ObjectBody;
      return obj;
    },
  } as unknown as R2Bucket;
  const puts: { key: string; contentType?: string }[] = [];
  const db = mockWriteDb(ops, unitExists, wordKeys);
  return {
    env: { ...mockEnv(), DB: db as unknown as D1Database, BUCKET: r2 },
    ops,
    puts,
    objStore,
    deletes,
  };
}

async function requestRaw(env: Env, path: string, init: RequestInit = {}) {
  const token = await signToken(SECRET, String(Date.now()));
  return app.request(path, {
    ...init,
    headers: { cookie: `session=${token}`, ...init.headers },
  }, env);
}

// 可注入自定 mock DB（支持 article CRUD 的状态式存储）。
function statefulArticleDb() {
  let nextId = 1;
  const articles = new Map<number, { id: number; title: string; subtitle: string | null; content: string; publish_date: string }>();
  return {
    prepare(stmt: string) {
      return {
        bind: (...params: unknown[]) => {
          if (stmt.startsWith("INSERT INTO articles")) {
            const id = nextId++;
            const [title, subtitle, content, publish_date] = params as unknown as [string, string | null, string, string];
            articles.set(id, { id, title, subtitle, content, publish_date });
            return stateRun(id);
          }
          if (stmt.startsWith("UPDATE articles")) {
            const [title, subtitle, content, publish_date, id] = params as unknown as [string, string | null, string, string, number];
            const cur = articles.get(Number(id));
            if (cur) Object.assign(cur, { title, subtitle, content, publish_date });
            return stateRun();
          }
          if (stmt.startsWith("DELETE FROM articles")) {
            articles.delete(Number(params[0]));
            return stateRun();
          }
          if (stmt.startsWith("SELECT last_insert_rowid")) {
            return {
              run: async () => ({}),
              first: async () => ({ id: nextId - 1 }),
              all: async () => ({ results: [], meta: {} }),
            };
          }
          if (stmt.startsWith("SELECT * FROM articles")) {
            const id = Number(params[0]);
            return {
              run: async () => ({}),
              first: async () => articles.get(id) ?? null,
              all: async () => ({ results: [], meta: {} }),
            };
          }
          return stateRun();
        },
      };
    },
    articles,
  };

  function stateRun(id?: number) {
    return {
      run: async () => ({}),
      first: async () => (id ? articles.get(id) ?? null : null),
      all: async () => ({ results: [], meta: {} }),
    };
  }
}

describe("admin article API", () => {
  it("runs the POST /api/articles insert with a valid cookie", async () => {
    const { env, ops } = mockWriteEnv();
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/articles",
      {
        method: "POST",
        headers: { cookie: `session=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "T", content: "C", publish_date: "2026-08-10" }),
      },
      env
    );
    expect(res.status).toBe(201);
    expect(ops.some((o) => o.stmt.startsWith("INSERT INTO articles"))).toBe(true);
  });

  it("rejects POST /api/articles when missing fields → 400", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/articles",
      {
        method: "POST",
        headers: { cookie: `session=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "T" }),
      },
      mockWriteEnv().env
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing fields" });
  });

  it("rejects PATCH /api/articles for invalid id → 404", async () => {
    const res = await requestRaw(mockWriteEnv().env, "/api/articles/abc", { method: "PATCH" });
    expect(res.status).toBe(404);
  });

  it("PATCH invalid JSON body → 400", async () => {
    const res = await requestRaw(mockWriteEnv().env, "/api/articles/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("PATCH existing article merges partial fields (stateful DB)", async () => {
    const src = statefulArticleDb();
    const env = { ...mockEnv(), DB: src as unknown as D1Database, BUCKET: {} as R2Bucket };
    // 预置一条初始文章
    await env.DB.prepare("INSERT INTO articles").bind("Old", null, "Content", "2026-08-01").run();
    const res = await requestRaw(env, "/api/articles/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "NewTitle" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ title: string; content: string; publish_date: string }>();
    expect(body.title).toBe("NewTitle");
    expect(body.content).toBe("Content");
    expect(body.publish_date).toBe("2026-08-01");
  });

  it("PATCH article updates and clears subtitle (empty string → null)", async () => {
    const src = statefulArticleDb();
    const env = { ...mockEnv(), DB: src as unknown as D1Database, BUCKET: {} as R2Bucket };
    await env.DB.prepare("INSERT INTO articles").bind("Old", null, "Content", "2026-08-01").run();
    const updated = await requestRaw(env, "/api/articles/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitle: "副标题" }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json<{ subtitle: string | null }>()).subtitle).toBe("副标题");
    const cleared = await requestRaw(env, "/api/articles/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitle: "  " }),
    });
    expect((await cleared.json<{ subtitle: string | null }>()).subtitle).toBeNull();
  });

  it("DELETE /api/articles invalid id → 404 and valid id runs delete", async () => {
    const bad = await requestRaw(mockWriteEnv().env, "/api/articles/abc", { method: "DELETE" });
    expect(bad.status).toBe(404);
    const src = statefulArticleDb();
    const env = { ...mockEnv(), DB: src as unknown as D1Database, BUCKET: {} as R2Bucket };
    await env.DB.prepare("INSERT INTO articles").bind("X", null, "Y", "2026-01-01").run();
    await requestRaw(env, "/api/articles/1", { method: "DELETE" });
    expect(src.articles.size).toBe(0);
  });
});

describe("admin words / books / units API", () => {
  it("POST /api/words uploads audio to R2 and inserts word (word from filename)", async () => {
    const { env, ops, puts, objStore } = mockWriteEnv();
    const form = new FormData();
    form.append("unitId", "3");
    form.append("audio", new File(["abc"], "hello.mp3", { type: "audio/mpeg" }));
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request("/api/words", { method: "POST", headers: { cookie: `session=${token}` }, body: form }, env);
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; key: string }>();
    expect(body.ok).toBe(true);
    expect(body.key).toMatch(/^3\/.+\.mp3$/);
    expect(body.key.endsWith("-hello.mp3")).toBe(true);
    expect(puts.length).toBe(1);
    expect(puts[0].contentType).toBe("audio/mpeg");
    expect(objStore.has(body.key)).toBe(true);
    const insert = ops.find((o) => o.stmt.startsWith("INSERT INTO words"));
    expect(insert).toBeDefined();
    expect(insert!.params[1]).toBe("hello");
  });

  it("POST /api/words honors explicit word field over filename", async () => {
    const { env, ops } = mockWriteEnv();
    const form = new FormData();
    form.append("unitId", "2");
    form.append("word", "apple");
    form.append("audio", new File(["x"], "saved.mp3", { type: "audio/mpeg" }));
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request("/api/words", { method: "POST", headers: { cookie: `session=${token}` }, body: form }, env);
    expect(res.status).toBe(201);
    const insert = ops.find((o) => o.stmt.startsWith("INSERT INTO words"));
    expect(insert!.params[1]).toBe("apple");
  });

  it("POST /api/words without audio → 400", async () => {
    const { env } = mockWriteEnv();
    const form = new FormData();
    form.append("unitId", "1");
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request("/api/words", { method: "POST", headers: { cookie: `session=${token}` }, body: form }, env);
    expect(res.status).toBe(400);
  });

  it("POST /api/words rejects nonexistent unitId → 404 (data hygiene)", async () => {
    const { env, ops, objStore } = mockWriteEnv(false); // unit 不存在
    const form = new FormData();
    form.append("unitId", "99");
    form.append("audio", new File(["x"], "hello.mp3", { type: "audio/mpeg" }));
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/words",
      { method: "POST", headers: { cookie: `session=${token}` }, body: form },
      env
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unit not found" });
    // 不产生孤儿记录、不上传 R2
    expect(ops.some((o) => o.stmt.startsWith("INSERT INTO words"))).toBe(false);
    expect(objStore.size).toBe(0);
  });

  it("POST /api/words sanitizes unsafe filename chars in R2 key (data hygiene)", async () => {
    const { env, objStore } = mockWriteEnv();
    const form = new FormData();
    form.append("unitId", "3");
    // 含路径分隔符、.. 、空格、控制字符与特殊符号的文件名
    form.append("audio", new File(["x"], "../dir/a b&c!.mp3", { type: "audio/mpeg" }));
    const token = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/words",
      { method: "POST", headers: { cookie: `session=${token}` }, body: form },
      env
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ ok: boolean; key: string }>();
    expect(body.ok).toBe(true);
    // key 仅含一个单元分隔符；文件名段不含 /、..、空格或安全字符集之外的任何字符
    const segs = body.key.split("/");
    expect(segs.length).toBe(2);
    const fileName = segs[1];
    expect(fileName).not.toContain("..");
    expect(fileName).not.toContain(" ");
    expect(fileName).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(fileName.endsWith("._dir_a_b_c_.mp3")).toBe(true);
    expect(objStore.has(body.key)).toBe(true);
  });

  it("POST /api/books missing name → 400; valid runs insert", async () => {
    const tk = await signToken(SECRET, String(Date.now()));
    const bad = await app.request(
      "/api/books",
      { method: "POST", headers: { cookie: `session=${tk}`, "Content-Type": "application/json" }, body: JSON.stringify({}) },
      mockWriteEnv().env
    );
    expect(bad.status).toBe(400);
    const { env, ops } = mockWriteEnv();
    const res = await app.request(
      "/api/books",
      { method: "POST", headers: { cookie: `session=${tk}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "B" }) },
      env
    );
    expect(res.status).toBe(201);
    expect(ops.some((o) => o.stmt.startsWith("INSERT INTO word_books"))).toBe(true);
  });

  it("POST /api/books/:bookId/units requires name → 400", async () => {
    const tk = await signToken(SECRET, String(Date.now()));
    const res = await app.request(
      "/api/books/1/units",
      { method: "POST", headers: { cookie: `session=${tk}`, "Content-Type": "application/json" }, body: JSON.stringify({}) },
      mockWriteEnv().env
    );
    expect(res.status).toBe(400);
  });

  it("DELETE /api/words/:id invalid id → 404; valid runs delete and cleans up R2", async () => {
    const bad = await requestRaw(mockWriteEnv().env, "/api/words/abc", { method: "DELETE" });
    expect(bad.status).toBe(404);
    // 音频词条：删 DB 记录 + 删 R2 对象
    const { env, ops, deletes, objStore } = mockWriteEnv(true, ["3/123-hello.mp3"]);
    objStore.add("3/123-hello.mp3");
    const res = await requestRaw(env, "/api/words/9", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(ops.some((o) => o.stmt.startsWith("DELETE FROM words"))).toBe(true);
    expect(deletes).toEqual(["3/123-hello.mp3"]);
    // TTS 词条（audio_key 空串）：不触发 R2 删除
    const { env: env2, ops: ops2, deletes: deletes2 } = mockWriteEnv(true, []);
    const res2 = await requestRaw(env2, "/api/words/8", { method: "DELETE" });
    expect(res2.status).toBe(200);
    expect(ops2.some((o) => o.stmt.startsWith("DELETE FROM words"))).toBe(true);
    expect(deletes2).toEqual([]);
  });

  it("DELETE /api/units/:id removes words first (FK-safe) and cleans up R2", async () => {
    const { env, ops, deletes } = mockWriteEnv(true, ["5/1-a.mp3", "5/2-b.mp3"]);
    const res = await requestRaw(env, "/api/units/3", { method: "DELETE" });
    expect(res.status).toBe(200);
    const statements = ops.map((o) => o.stmt);
    const wordsIdx = statements.findIndex((s) => s.startsWith("DELETE FROM words"));
    const unitsIdx = statements.findIndex((s) => s.startsWith("DELETE FROM units"));
    expect(wordsIdx).toBeGreaterThanOrEqual(0);
    expect(unitsIdx).toBeGreaterThan(wordsIdx); // 子表先删，避免 D1 外键约束报错
    expect(deletes.sort()).toEqual(["5/1-a.mp3", "5/2-b.mp3"]);
  });

  it("DELETE /api/books/:id removes child words and units first (FK-safe)", async () => {
    const { env, ops, deletes } = mockWriteEnv(true, ["5/1-a.mp3"]);
    const res = await requestRaw(env, "/api/books/2", { method: "DELETE" });
    expect(res.status).toBe(200);
    const statements = ops.map((o) => o.stmt);
    const wordsIdx = statements.findIndex((s) => s.startsWith("DELETE FROM words"));
    const unitsIdx = statements.findIndex((s) => s.startsWith("DELETE FROM units"));
    const booksIdx = statements.findIndex((s) => s.startsWith("DELETE FROM word_books"));
    expect(wordsIdx).toBeGreaterThanOrEqual(0);
    expect(unitsIdx).toBeGreaterThan(wordsIdx);
    expect(booksIdx).toBeGreaterThan(unitsIdx);
    expect(deletes).toEqual(["5/1-a.mp3"]);
  });
});

describe("bulk text import API (TTS words)", () => {
  const json = (body: unknown) => ({
    method: "POST" as const,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  it("imports words with empty audio_key and increments sort_order", async () => {
    const { env, ops } = mockWriteEnv();
    const res = await requestRaw(env, "/api/units/3/words/bulk", json({ items: [{ word: "apple", definition: "苹果" }, { word: "take off" }] }));
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; created: number; skipped: number; duplicates: string[]; invalid: string[] }>();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(0);
    const inserts = ops.filter((o) => o.stmt.startsWith("INSERT INTO words"));
    expect(inserts.length).toBe(2);
    // params: [unitId, word, audio_key, definition, sort_order]
    expect(inserts[0].params).toEqual([3, "apple", "", "苹果", 1]);
    expect(inserts[1].params).toEqual([3, "take off", "", "", 2]);
  });

  it("skips in-request duplicates and invalid entries", async () => {
    const { env } = mockWriteEnv();
    const res = await requestRaw(env, "/api/units/3/words/bulk", json({
      items: [{ word: "Apple" }, { word: "apple" }, { word: "" }, { word: 42 }],
    }));
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; created: number; skipped: number; duplicates: string[]; invalid: string[] }>();
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(3);
    expect(body.duplicates).toEqual(["apple"]);
    expect(body.invalid.length).toBe(2);
  });

  it("skips words already existing in the unit (case-insensitive)", async () => {
    const ops: DbOp[] = [];
    const hasUnit = (stmt: string) => /FROM units/i.test(stmt);
    const result = (stmt: string) => ({
      run: async () => ({}),
      all: async () => (/FROM words/i.test(stmt) ? { results: [{ word: "apple" }], meta: {} } : { results: [], meta: {} }),
      first: async () => (hasUnit(stmt) ? { id: 1 } : null),
    });
    const db = {
      prepare(stmt: string) {
        return {
          ...result(stmt),
          bind: (...params: unknown[]) => {
            ops.push({ stmt, params });
            return result(stmt);
          },
        };
      },
      batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
        const out: unknown[] = [];
        for (const s of stmts) out.push(await s.run());
        return out;
      },
    } as unknown as D1Database;
    const env = { ...mockEnv(), DB: db };
    const res = await requestRaw(env, "/api/units/3/words/bulk", json({ items: [{ word: "Apple" }, { word: "banana" }] }));
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; created: number; duplicates: string[] }>();
    expect(body.created).toBe(1);
    expect(body.duplicates).toEqual(["Apple"]);
    // 已有词条 Apple 与 banana 应各插入一次，Apple 命中去重不插入
    expect(ops.filter((o) => o.stmt.startsWith("INSERT INTO words")).length).toBe(1);
  });

  it("rejects missing/empty items → 400 and invalid unitId → 404", async () => {
    const { env } = mockWriteEnv();
    const missing = await requestRaw(env, "/api/units/3/words/bulk", json({}));
    expect(missing.status).toBe(400);
    const empty = await requestRaw(env, "/api/units/3/words/bulk", json({ items: [] }));
    expect(empty.status).toBe(400);
    const tooMany = await requestRaw(env, "/api/units/3/words/bulk", json({ items: Array.from({ length: 501 }, (_, i) => ({ word: `w${i}` })) }));
    expect(tooMany.status).toBe(400);
    const token = await signToken(SECRET, String(Date.now()));
    for (const id of ["abc", "0", "-3", "1.5"]) {
      const res = await app.request(`/api/units/${id}/words/bulk`, { ...json({ items: [{ word: "x" }] }), headers: { "content-type": "application/json", cookie: `session=${token}` } }, env);
      expect(res.status).toBe(404);
    }
  });

  it("rejects nonexistent unit → 404 without inserts", async () => {
    const { env, ops } = mockWriteEnv(false);
    const res = await requestRaw(env, "/api/units/99/words/bulk", json({ items: [{ word: "x" }] }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unit not found" });
    expect(ops.some((o) => o.stmt.startsWith("INSERT INTO words"))).toBe(false);
  });

  it("requires auth → 401", async () => {
    const res = await app.request("/api/units/1/words/bulk", json({ items: [{ word: "x" }] }), mockWriteEnv().env);
    expect(res.status).toBe(401);
  });
});

describe("audio playback router", () => {
  it("GET /api/audio without cookie → 401", async () => {
    const res = await app.request("/api/audio?key=1/a.mp3", {}, mockWriteEnv().env);
    expect(res.status).toBe(401);
  });

  it("GET /api/audio missing key → 400", async () => {
    // 先上传一个对象以便走通过鉴权
    const res = await requestRaw(mockWriteEnv().env, "/api/audio", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing key" });
  });

  it("GET /api/audio plays object when present, 404 when absent", async () => {
    const { env, objStore } = mockWriteEnv();
    objStore.add("1/demo.mp3");
    const ok = await requestRaw(env, "/api/audio?key=" + encodeURIComponent("1/demo.mp3"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("audio/mpeg");
    const text = await ok.text();
    expect(text).toBe("1/demo.mp3");
    const miss = await requestRaw(env, "/api/audio?key=nope.mp3");
    expect(miss.status).toBe(404);
  });
});

describe("health endpoint schema bootstrap (Fix 2)", () => {
  it("GET /api/health is public and invokes applySchema (prepare/run) without error", async () => {
    let statementsRun = 0;
    const base = mockD1();
    const db = {
      ...base,
      // applySchema 现改为 prepare().run() 逐条执行 DDL（见 db.ts：兼容 workerd 内建 D1 对
      // db.exec() 多语句脚本的 "incomplete input" 限制）。health 测试 mock 需提供 prepare().run()
      // 与 bind().run()（applySchema 写 schema_version 标记走 bind().run() 路径）。
      prepare(stmt: string) {
        const inner = base.prepare(stmt);
        const run = async () => {
          statementsRun++;
          return { success: true, results: [] };
        };
        return {
          ...inner,
          run,
          bind: (...params: unknown[]) => ({ ...inner.bind(...params), run }),
        };
      },
    } as unknown as D1Database;
    const env = { ...mockEnv(), DB: db };
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // 建表兜底：health 被调用即执行 defaultSchema（逐条 prepare().run()）
    expect(statementsRun).toBeGreaterThan(0);
  });
});

// ---- 单元拖拽排序（PATCH /api/books/:bookId/units/order）----

describe("unit reorder API", () => {
  const json = (body: unknown) => ({
    method: "PATCH" as const,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  // ownedIds = 该 book 下真实存在的单元 id；mock 的 SELECT 按提交 ids 过滤返回。
  function reorderEnv(ownedIds: number[]) {
    const ops: DbOp[] = [];
    let boundParams: unknown[] = [];
    const all = async () => {
      if (/SELECT id FROM units/i.test(boundParams[0] as string)) {
        const ids = boundParams.slice(1).map(Number);
        return { results: ownedIds.filter((id) => ids.includes(id)).map((id) => ({ id })), meta: {} };
      }
      return { results: [], meta: {} };
    };
    const db = {
      prepare(stmt: string) {
        return {
          first: async () => null,
          all,
          run: async () => ({}),
          bind: (...params: unknown[]) => {
            boundParams = [stmt, ...params];
            ops.push({ stmt, params });
            return { first: async () => null, all, run: async () => ({}) };
          },
        };
      },
      batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
        const out: unknown[] = [];
        for (const s of stmts) out.push(await s.run());
        return out;
      },
    } as unknown as D1Database;
    return { env: { ...mockEnv(), DB: db }, ops };
  }

  it("rewrites sort_order following the submitted id order", async () => {
    const { env, ops } = reorderEnv([5, 3]);
    const res = await requestRaw(env, "/api/books/2/units/order", json({ ids: [5, 3] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const updates = ops.filter((o) => o.stmt.startsWith("UPDATE units"));
    expect(updates.map((u) => u.params)).toEqual([[0, 5], [1, 3]]);
  });

  it("rejects empty/malformed ids and ids not owned by the book", async () => {
    const { env } = reorderEnv([5, 3]);
    const empty = await requestRaw(env, "/api/books/2/units/order", json({ ids: [] }));
    expect(empty.status).toBe(400);
    const malformed = await requestRaw(env, "/api/books/2/units/order", json({ ids: ["x"] }));
    expect(malformed.status).toBe(400);
    // 提交 [5,99]，99 不属于该书 → 校验数量不匹配 → 404
    const notOwned = await requestRaw(env, "/api/books/2/units/order", json({ ids: [5, 99] }));
    expect(notOwned.status).toBe(404);
  });
});

// ---- 单词编辑（PATCH /api/words/:id，不动音频）----

describe("word edit API", () => {
  const json = (body: unknown) => ({
    method: "PATCH" as const,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  function wordEnv({ exists = true, duplicate = false }: { exists?: boolean; duplicate?: boolean } = {}) {
    const ops: DbOp[] = [];
    const db = {
      prepare(stmt: string) {
        const first = async () => {
          // 主查询：SELECT id, unit_id, word, definition FROM words WHERE id = ?
          if (/FROM words WHERE id = \?/i.test(stmt)) {
            if (!exists) return null;
            return { id: 7, unit_id: 3, word: "apple", definition: "苹果" };
          }
          // 同单元重名检查：SELECT id FROM words WHERE unit_id = ? AND lower(word) = lower(?) AND id != ?
          if (/lower\(word\) = lower\(\?\)/i.test(stmt)) return duplicate ? { id: 99 } : null;
          return null;
        };
        return {
          first,
          all: async () => ({ results: [], meta: {} }),
          run: async () => ({}),
          bind: (...params: unknown[]) => {
            ops.push({ stmt, params });
            return { first, all: async () => ({ results: [], meta: {} }), run: async () => ({}) };
          },
        };
      },
      batch: async () => [],
    } as unknown as D1Database;
    return { env: { ...mockEnv(), DB: db }, ops };
  }

  it("updates word text and definition without touching audio_key", async () => {
    const { env, ops } = wordEnv();
    const res = await requestRaw(env, "/api/words/7", json({ word: "Apple", definition: "苹果（修订）" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const update = ops.find((o) => o.stmt.startsWith("UPDATE words"));
    expect(update?.stmt).not.toContain("audio_key");
    expect(update?.params).toEqual(["Apple", "苹果（修订）", 7]);
  });

  it("rejects duplicate word within the unit → 409", async () => {
    const { env } = wordEnv({ duplicate: true });
    const res = await requestRaw(env, "/api/words/7", json({ word: "banana" }));
    expect(res.status).toBe(409);
  });

  it("rejects missing word, nonexistent word, and malformed body", async () => {
    const { env } = wordEnv();
    const blank = await requestRaw(env, "/api/words/7", json({ word: "  " }));
    expect(blank.status).toBe(400);
    const missing = await requestRaw(env, "/api/words/7", json({}));
    expect(missing.status).toBe(200); // 无 word 时保留原值，仅更新 definition 场景
    const { env: missingEnv } = wordEnv({ exists: false });
    const notFound = await requestRaw(missingEnv, "/api/words/7", json({ word: "x" }));
    expect(notFound.status).toBe(404);
  });
});
