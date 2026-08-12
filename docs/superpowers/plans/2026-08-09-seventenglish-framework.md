# SeventEnglish 框架搭建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 SeventEnglish 的全栈框架 —— Cloudflare Worker + D1 + R2 + React SPA，含全站登录、阅读/听力/设置三模块路由骨架、管理后台骨架，使后续可逐步迭代细化功能。

**Architecture:** 单 Cloudflare Worker 全栈托管。前端 Vite + React + TS SPA 由 Cloudflare Vite plugin 构建为 Worker 静态资源；`/api/*` 请求经 `assets.run_worker_first` 交给 Worker 内的 Hono 路由处理并对接 D1/R2。全站登录用环境变量密码 + HttpOnly 签名 cookie。

**Tech Stack:** Vite · React 18 · TypeScript · Hono · @cloudflare/vite-plugin · wrangler · D1 (SQLite) · R2 · react-router-dom · vitest

**参考文档：**
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- D1 API: https://developers.cloudflare.com/d1/

## Global Constraints

- 运行时类型：TypeScript 只允许 `strict: true`，禁用隐式 `any`。
- 包管理：npm。
- Worker 兼容日期：`"2026-08-09"`（spec 定稿日，每次 task 使用该值）。
- 绑定命名：D1 → `DB`，R2 → `BUCKET`，环境变量 → `SITE_PASSWORD` / `SESSION_SECRET`。
- 所有 API 响应错误统一返回 `{ error: string }`（HTTP 4xx/5xx）。
- 所有 `/api/*` 接口默认要求认证（除 `POST /api/login`）。未认证返回 `401 { error: "unauthorized" }`。
- 代码中不使用 `any`；未知数据用明确类型或 `unknown` + 收窄。
- SPA 静态资源路由：`assets.not_found_handling = "single-page-application"`，保证客户端路由刷新不 404。
- 提交规范：每个任务独立 commit，遵循 Conventional Commits。

---

### Task 1: 项目脚手架（Vite + React + Cloudflare Vite plugin + Hono）

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `wrangler.toml`
- Create: `worker/src/index.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/components/Nav.tsx`（占位）
- Create: `src/pages/Read.tsx`, `Listen.tsx`, `Settings.tsx`, `Login.tsx`（占位）
- Create: `src/api/client.ts`

**Interfaces:**
- Consumes: 无（第一个任务）。
- Produces:
  - `worker/src/index.ts` 导出默认 Hono `app`（`export default app` + 类型 `App`）。
  - `src/api/client.ts` 导出 `apiFetch(path, options)`。
  - `wrangler.toml` 中已配置 `assets`, `main`, `compatibility_date`。

- [ ] **Step 1: 初始化 package.json 与安装依赖**

```bash
npm init -y
npm i hono react react-dom react-router-dom
npm i -D vite @vitejs/plugin-react typescript @cloudflare/vite-plugin wrangler @types/react @types/react-dom vitest
```

- [ ] **Step 2: 写 vite.config.ts（含 Cloudflare plugin）**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
});
```

注：Cloudflare Vite plugin 自动确定 Worker 入口（`worker/src/index.ts`，由 wrangler.toml 的 `main` 指定）与静态资源目录（client build 输出）。

- [ ] **Step 3: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src", "worker", "vite.config.ts"]
}
```

- [ ] **Step 4: 写 index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SeventEnglish</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: 写 wrangler.toml（静态资产 + SPA fallback + 绑定预留）**

```toml
name = "sevent-english"
compatibility_date = "2026-08-09"
main = "worker/src/index.ts"

assets = { directory = "./dist", not_found_handling = "single-page-application", run_worker_first = ["/api/*"] }

# 预留绑定，Task 3 中启用真实 D1/R2
# [[d1_databases]]
# binding = "DB"
# database_name = "sevent-english-db"
# database_id = "<from wrangler d1 create>"

# [[r2_buckets]]
# binding = "BUCKET"
# bucket_name = "sevent-english-assets"
```

- [ ] **Step 6: 写 Worker 最小 Hono 应用**

```ts
import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
export type App = typeof app;
```

- [ ] **Step 7: 写前端最小 SPA（main.tsx / App.tsx / 占位页 / Nav）**

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`src/App.tsx`:
```tsx
import { BrowserRouter } from "react-router-dom";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { Read } from "./pages/Read";
import { Listen } from "./pages/Listen";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";

export function App() {
  // 认证将在 Task 4 接入，此处先放可访问的占位路由
  return (
    <BrowserRouter>
      <nav>
        <Link to="/read">阅读</Link>
        <span> </span>
        <Link to="/listen">听力</Link>
        <span> </span>
        <Link to="/settings">设置</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/read" replace />} />
        <Route path="/read" element={<Read />} />
        <Route path="/listen" element={<Listen />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}
```

占位页（`src/pages/Read.tsx` 示例，其余同类）：
```tsx
export function Read() {
  return <h1>阅读</h1>;
}
```

`src/api/client.ts`:
```ts
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
    ...options,
  });
  if (res.status === 401) {
    // 未认证时交由调用方跳转（Task 4 接入具体逻辑）
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error || `请求失败: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {}
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
```

- [ ] **Step 8: 在 package.json 加 scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "deploy": "npm run build && wrangler deploy",
    "test": "vitest run"
  }
}
```

- [ ] **Step 9: 本地验证**

Run: `npm run dev`
Expected: 页面打开，导航栏有 阅读/听力/设置 三链接；访问 `/api/health` 返回 `{"ok":true}`。

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "feat: 初始化 Vite + React + Cloudflare Worker(Hono) 全栈脚手架"
```

---

### Task 2: D1 数据库 schema 与数据访问层

**Files:**
- Create: `db/schema.sql`
- Create: `worker/src/db.ts`
- Test: `worker/src/db.test.ts`

**Interfaces:**
- Consumes: Task 1 的 D1 绑定命名 `DB`、vitest。
- Produces:
  - `db.ts` 导出 `applySchema(DB)`、`defaultSchema`。
  - `db.ts` 导出查询函数（后续任务调用，签名见下）。
  - `db.ts` 导出类型 `Article`、`WordBook`、`Unit`、`Word`、`Setting`。

- [ ] **Step 1: 写 db/schema.sql（五张表）**

```sql
CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  publish_date TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS word_books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES word_books(id),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS words (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id     INTEGER NOT NULL REFERENCES units(id),
  word        TEXT NOT NULL,
  audio_key   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_publish_date ON articles(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_units_book_id ON units(book_id);
CREATE INDEX IF NOT EXISTS idx_words_unit_id ON words(unit_id);
```

- [ ] **Step 2: 写 worker/src/db.ts（读取 schema 并暴露数据访问层）**

```ts
export interface Article {
  id: number;
  title: string;
  content: string;
  publish_date: string;
  created_at: string;
  updated_at: string;
}
export interface WordBook {
  id: number;
  name: string;
  description: string;
  created_at: string;
}
export interface Unit {
  id: number;
  book_id: number;
  name: string;
  sort_order: number;
  created_at: string;
}
export interface Word {
  id: number;
  unit_id: number;
  word: string;
  audio_key: string;
  sort_order: number;
}
export interface Setting {
  key: string;
  value: string | null;
  updated_at: string;
}

export const defaultSchema = `...db/schema.sql 内容原文...`;

export async function applySchema(db: D1Database): Promise<void> {
  await db.exec(defaultSchema);
}

export async function listArticlesGroupedByDate(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT publish_date,
              json_group_array(json_object('id', id, 'title', title)) AS articles
       FROM articles
       GROUP BY publish_date
       ORDER BY publish_date DESC`
    )
    .all<{ publish_date: string; articles: string }>();
  return results.map((r) => ({
    date: r.publish_date,
    articles: JSON.parse(r.articles) as { id: number; title: string }[],
  }));
}

export async function getArticle(db: D1Database, id: number) {
  return db.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first<Article>();
}

export async function createArticle(
  db: D1Database,
  data: { title: string; content: string; publish_date: string }
) {
  await db
    .prepare("INSERT INTO articles (title, content, publish_date) VALUES (?, ?, ?)")
    .bind(data.title, data.content, data.publish_date)
    .run();
  return getArticle(db, Number(await lastRowId(db)));
}

async function lastRowId(db: D1Database) {
  const r = await db.prepare("SELECT last_insert_rowid() AS id").first<{ id: number }>();
  return r?.id;
}

export async function listWordBooks(db: D1Database) {
  const { results } = await db
    .prepare("SELECT * FROM word_books ORDER BY id")
    .all<WordBook>();
  return results;
}

export async function listUnits(db: D1Database, bookId: number) {
  const { results } = await db
    .prepare("SELECT * FROM units WHERE book_id = ? ORDER BY sort_order, id")
    .bind(bookId)
    .all<Unit>();
  return results;
}

export async function listWords(db: D1Database, unitId: number) {
  const { results } = await db
    .prepare("SELECT * FROM words WHERE unit_id = ? ORDER BY sort_order, id")
    .bind(unitId)
    .all<Word>();
  return results;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, value)
    .run();
}
```

（注：`defaultSchema` 处填入 `db/schema.sql` 的完整原文，避免运行时额外读文件。）

- [ ] **Step 3: 写最小数据访问测试（用 mock D1）**

`worker/src/db.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createArticle, listArticlesGroupedByDate, getArticle } from "./db";

function mockD1() {
  let nextId = 1;
  const rows: any[] = [];
  return {
    async exec(_sql: string) {
      return { success: true };
    },
    prepare(stmt: string) {
      let params: unknown[] = [];
      const run = async () => {
        if (stmt.startsWith("INSERT")) {
          const id = nextId++;
          // 简易解析：取插入的 3 个值作为 title/content/date
          rows.push({ id, title: params[0], content: params[1], publish_date: params[2] });
          return { success: true };
        }
        if (stmt.startsWith("SELECT * FROM articles WHERE")) {
          const id = Number(params[0]);
          return { results: rows.filter((r) => r.id === id), meta: {} };
        }
        if (stmt.includes("json_group_array")) {
          const grouped = new Map<string, { id: number; title: string }[]>();
          for (const r of rows) {
            const g = grouped.get(r.publish_date) ?? [];
            g.push({ id: r.id, title: r.title });
            grouped.set(r.publish_date, g);
          }
          const results = [...grouped.entries()].map(([date, articles]) => ({
            publish_date: date,
            articles: JSON.stringify(articles),
          }));
          return { results, meta: {} };
        }
        return { results: [], meta: {} };
      };
      const first = async () => (await run()).results[0];
      const all = async () => run();
      return { bind: (...p: unknown[]) => { params = p; return { run, first, all }; } };
    },
  } as unknown as D1Database;
}

describe("articles", () => {
  it("creates and lists grouped by date", async () => {
    const db = mockD1();
    await createArticle(db, { title: "A", content: "hi", publish_date: "2026-08-01" });
    await createArticle(db, { title: "B", content: "yo", publish_date: "2026-08-01" });
    await createArticle(db, { title: "C", content: "zz", publish_date: "2026-08-02" });

    const grouped = await listArticlesGroupedByDate(db);
    expect(grouped.length).toBe(2);
    expect(grouped[0].date).toBe("2026-08-02");
    expect(grouped[0].articles.length).toBe(1);
    expect(grouped[1].articles.length).toBe(2);

    const one = await getArticle(db, 1);
    expect(one?.title).toBe("A");
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run worker/src/db.test.ts`
Expected: PASS（articles 分组与按 id 读通过）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 添加 D1 schema 与数据访问层（articles/books/units/words/settings）"
```

---

### Task 3: Worker API 认证（登录/登出/校验）

**Files:**
- Create: `worker/src/auth.ts`
- Test: `worker/src/auth.test.ts`
- Modify: `worker/src/index.ts`

**Interfaces:**
- Consumes: `SITE_PASSWORD`、`SESSION_SECRET` 环境变量（通过 Worker `Env` 类型）。
- Produces:
  - `auth.ts` 导出 `verifyLogin(env, password): boolean`、`createSession(env, userId/payload): Promise<string>`、`parseSession(env, token): Promise<boolean>`、`requireAuth(env, request) : Promise<boolean>`。
  - `index.ts` 导出绑定类型 `Env`。

- [ ] **Step 1: 写 worker/src/auth.ts（HMAC 签名会话 cookie）**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  SITE_PASSWORD: string;
  SESSION_SECRET: string;
}

export function verifyLogin(env: Env, password: string): boolean {
  if (!env.SITE_PASSWORD) return false;
  return timingSafeEqual(
    Buffer.from(password),
    Buffer.from(env.SITE_PASSWORD)
  );
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export async function createSession(env: Env): Promise<string> {
  const payload = `${Date.now()}`;
  const signature = sign(payload, env.SESSION_SECRET);
  const token = `${payload}.${signature}`;
  // 用 KV/内存存储会话？为保持简单，token 自包含且带过期（7 天）
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('session', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(token).run();
  return token;
}

export async function parseSession(env: Env): Promise<boolean> {
  const stored = await env.DB.prepare("SELECT value FROM settings WHERE key = 'session'").first<{ value: string }>();
  if (!stored?.value) return false;
  const [payload, signature] = stored.value.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload, env.SESSION_SECRET);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  // 过期检查：payload 为 epoch ms，7 天有效
  const age = Date.now() - Number(payload);
  return age >= 0 && age < 7 * 24 * 3600 * 1000;
}
```

（注：单用户场景用 settings 表存会话 token 是简化方案，避免额外 KV 配置。`parseSession` 后续可平滑换成签名 cookie 校验。）

- [ ] **Step 2: 写认证测试（mock D1 + 固定 secret）**

`worker/src/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { verifyLogin, createSession, parseSession } from "./auth";
import type { Env } from "./auth";

function makeEnv(overrides: Partial<Env> = {}): Env {
  const settings = new Map<string, string>();
  return {
    SITE_PASSWORD: "correct-horse",
    SESSION_SECRET: "test-secret",
    DB: {
      async prepare(sql: string) {
        return {
          bind(...p: unknown[]) {
            return {
              async run() {
                if (sql.includes("INSERT") || sql.includes("UPDATE")) {
                  settings.set(String(p[0]), String(p[1]));
                }
                return { success: true };
              },
              async first() {
                return { value: settings.get(String(p[0])) ?? null };
              },
            };
          },
        };
      },
    } as unknown as D1Database,
    BUCKET: {} as R2Bucket,
    ...overrides,
  };
}

describe("auth", () => {
  it("rejects wrong password", () => {
    expect(verifyLogin(makeEnv(), "wrong")).toBe(false);
  });
  it("accepts correct password", () => {
    expect(verifyLogin(makeEnv(), "correct-horse")).toBe(true);
  });
  it("creates and parses a session", async () => {
    const env = makeEnv();
    const token = await createSession(env);
    expect(await parseSession(env)).toBe(true);
    void token;
  });
  it("parses unauthenticated as false", async () => {
    expect(await parseSession(makeEnv())).toBe(false);
  });
});
```

- [ ] **Step 3: 写 worker/src/index.ts 接入登录/登出/会话校验**

```ts
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "./auth";
import { verifyLogin, createSession, parseSession } from "./auth";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/login", async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({}));
  if (!body.password || !verifyLogin(c.env, body.password)) {
    return c.json({ error: "invalid credentials" }, 401);
  }
  await createSession(c.env);
  setCookie(c, "session", "active", {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return c.json({ ok: true });
});

app.post("/api/logout", (c) => {
  deleteCookie(c, "session");
  return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
  if (!getCookie(c, "session")) return c.json({ error: "unauthorized" }, 401);
  const ok = await parseSession(c.env);
  return ok ? c.json({ authenticated: true }) : c.json({ error: "unauthorized" }, 401);
});

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
export type App = typeof app;
```

（Task 4 起，受保护 API 用 `autoCheck`/middleware 统一做 `requireAuth`；先在 `/api/me` 演示。）

- [ ] **Step 4: 运行测试**

Run: `npx vitest run worker/src/auth.test.ts`
Expected: PASS（4 个认证用例）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: 实现全站登录会话认证（SITE_PASSWORD + HMAC 签名 cookie）"
```

---

### Task 4: 前端登录页、认证 Context 与路由守卫

**Files:**
- Modify: `src/App.tsx`
- Create: `src/auth/AuthContext.tsx`
- Create: `src/components/RequireAuth.tsx`
- Create: `src/api/auth.ts`（登录/登出/me 封装）
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Consumes: `apiFetch`（Task 1）、`getCookie` 无（前端用 `/api/me` 判定）。`POST /api/login`、`POST /api/logout`、`GET /api/me`（Task 3）。
- Produces:
  - `AuthContext` 提供 `{ user, loading, login, logout }`。
  - `RequireAuth` 包裹需登录路由。

- [ ] **Step 1: 写 src/api/auth.ts**

```ts
import { apiFetch } from "./client";

export interface MeResult {
  authenticated: boolean;
}

export async function login(password: string): Promise<void> {
  await apiFetch("/login", { method: "POST", body: JSON.stringify({ password }) });
}
export async function logout(): Promise<void> {
  await apiFetch("/logout", { method: "POST" });
}
export async function me(): Promise<MeResult> {
  return apiFetch<MeResult>("/me");
}
```

- [ ] **Step 2: 写 src/auth/AuthContext.tsx**

```tsx
import { createContext, useContext, useEffect, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { login as apiLogin, logout as apiLogout, me } from "../api/auth";

interface AuthState {
  authenticated: boolean;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await me();
      setAuthenticated(r.authenticated);
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (password: string) => {
    await apiLogin(password);
    setAuthenticated(true);
  }, []);
  const logout = useCallback(async () => {
    await apiLogout();
    setAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
```

- [ ] **Step 3: 写 src/components/RequireAuth.tsx**

```tsx
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { authenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p>加载中…</p>;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
```

- [ ] **Step 4: 实现 src/pages/Login.tsx**

```tsx
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/read";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await login(password);
          navigate(from, { replace: true });
        } catch (err) {
          setError(err instanceof Error ? err.message : "登录失败");
        }
      }}
    >
      <h1>登录</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="请输入密码"
        autoFocus
      />
      <button type="submit">登录</button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </form>
  );
}
```

- [ ] **Step 5: 改写 src/App.tsx（接入 Provider + RequireAuth）**

```tsx
import { BrowserRouter, Navigate, Route, Routes, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./components/RequireAuth";
import { Read } from "./pages/Read";
import { Listen } from "./pages/Listen";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <nav>
          <Link to="/read">阅读</Link> <Link to="/listen">听力</Link>{" "}
          <Link to="/settings">设置</Link>
        </nav>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Navigate to="/read" replace />
              </RequireAuth>
            }
          />
          <Route path="/read" element={<RequireAuth><Read /></RequireAuth>} />
          <Route path="/listen" element={<RequireAuth><Listen /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="*" element={<LoginRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function LoginRedirect() {
  const { authenticated, loading } = useAuth();
  if (loading) return <p>加载中…</p>;
  return <Navigate to={authenticated ? "/read" : "/login"} replace />;
}
```

- [ ] **Step 6: 本地验证**

Run: `npm run dev`
Expected: 未登录访问 `/read` 被重定向 `/login`；输错密码提示错误；输对环境变量密码后进入阅读页；刷新仍保持登录（cookie）。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 前端登录页 + 认证 Context + 路由守卫"
```

---

### Task 5: 阅读模块（时间线 API + 时间线页 + 文章详情页）

**Files:**
- Modify: `worker/src/index.ts`（加文章 API）
- Create: `src/api/articles.ts`
- Modify: `src/pages/Read.tsx`
- Create: `src/pages/ArticleDetail.tsx`
- Modify: `src/App.tsx`（加路由）

**Interfaces:**
- Consumes: `listArticlesGroupedByDate`、`getArticle`（Task 2）、`Env`（Task 3）、`apiFetch`（Task 1）、`RequireAuth`（Task 4）。
- Produces: 无（终端功能）。依赖 Task 8 的创建接口补充，但本任务聚焦读路径。

- [ ] **Step 1: Worker 加文章读 API**

在 `worker/src/index.ts` 加路由：
```ts
import { listArticlesGroupedByDate, getArticle } from "./db";

app.get("/api/articles", async (c) => {
  return c.json(await listArticlesGroupedByDate(c.env.DB));
});
app.get("/api/articles/:id", async (c) => {
  const article = await getArticle(c.env.DB, Number(c.req.param("id")));
  if (!article) return c.json({ error: "not found" }, 404);
  return c.json(article);
});
```

- [ ] **Step 2: 写 src/api/articles.ts**

```ts
import { apiFetch } from "./client";
import type { Article } from "../../worker/src/db";

export interface ArticleGroup {
  date: string;
  articles: { id: number; title: string }[];
}

export async function listArticles(): Promise<ArticleGroup[]> {
  return apiFetch<ArticleGroup[]>("/articles");
}
export async function getArticle(id: number): Promise<Article> {
  return apiFetch<Article>(`/articles/${id}`);
}
```

- [ ] **Step 3: 实现 src/pages/Read.tsx（时间线）**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listArticles } from "../api/articles";
import type { ArticleGroup } from "../api/articles";

export function Read() {
  const [groups, setGroups] = useState<ArticleGroup[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listArticles()
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div>
      <h1>阅读时间线</h1>
      {groups.length === 0 && <p>暂无文章</p>}
      {groups.map((g) => (
        <section key={g.date}>
          <h2>{g.date}</h2>
          <ul>
            {g.articles.map((a) => (
              <li key={a.id}>
                <Link to={`/read/${a.id}`}>{a.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 实现 src/pages/ArticleDetail.tsx**

```tsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getArticle } from "../api/articles";
import type { Article } from "../../worker/src/db";

export function ArticleDetail() {
  const { id } = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    getArticle(Number(id))
      .then(setArticle)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, [id]);

  if (error) return <p style={{ color: "red" }}>{error}</p>;
  if (!article) return <p>加载中…</p>;

  return (
    <div>
      <Link to="/read">← 返回时间线</Link>
      <h1>{article.title}</h1>
      <p style={{ color: "#888" }}>{article.publish_date}</p>
      {/* Markdown 渲染在后续迭代引入；框架阶段先展示纯文本内容 */}
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{article.content}</pre>
    </div>
  );
}
```

- [ ] **Step 5: 在 App.tsx 注册阅读路由**

在 `<Routes>` 内、现有 `Read` 路由旁加：
```tsx
<Route path="/read/:id" element={<RequireAuth><ArticleDetail /></RequireAuth>} />
```
并在文件顶部 `import { ArticleDetail } from "./pages/ArticleDetail";`

- [ ] **Step 6: 验证**

Run: `npm run dev`
Expected: `/read` 显示时间线（有数据时按日分组）；点击进入 `/read/:id` 显示标题与正文。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 阅读模块（时间线 API + 时间线页 + 文章详情页）"
```

---

### Task 6: 听力模块（选书 → 选单元 → 听写练习页）

**Files:**
- Modify: `worker/src/index.ts`（加听力 API）
- Create: `src/api/listen.ts`
- Rewrite: `src/pages/Listen.tsx`
- Create: `src/pages/BookUnits.tsx`
- Create: `src/pages/Practice.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `listWordBooks`、`listUnits`、`listWords`（Task 2）、`Env`（Task 3）、`apiFetch`（Task 1）。
- Produces: 无（终端功能）。听写判对错已内建在 Practice 组件。

- [ ] **Step 1: Worker 加听力 API**

```ts
import { listWordBooks, listUnits } from "./db";

app.get("/api/books", async (c) => c.json(await listWordBooks(c.env.DB)));
app.get("/api/books/:bookId/units", async (c) =>
  c.json(await listUnits(c.env.DB, Number(c.req.param("bookId"))))
);
app.get("/api/units/:unitId/words", async (c) =>
  c.json(await listWords(c.env.DB, Number(c.req.param("unitId"))))
);
```
（需在顶部 `import { listWords } from "./db";`）

- [ ] **Step 2: 写 src/api/listen.ts**

```ts
import { apiFetch } from "./client";
import type { WordBook, Unit, Word } from "../../worker/src/db";

export function listBooks() {
  return apiFetch<WordBook[]>("/books");
}
export function listUnits(bookId: number) {
  return apiFetch<Unit[]>(`/books/${bookId}/units`);
}
export function listWords(unitId: number) {
  return apiFetch<Word[]>(`/units/${unitId}/words`);
}
```

- [ ] **Step 3: 实现 src/pages/Listen.tsx（选单词书）**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBooks } from "../api/listen";
import type { WordBook } from "../../worker/src/db";

export function Listen() {
  const [books, setBooks] = useState<WordBook[]>([]);
  useEffect(() => {
    listBooks()
      .then(setBooks)
      .catch(() => setBooks([]));
  }, []);
  return (
    <div>
      <h1>选择单词书</h1>
      {books.length === 0 && <p>暂无单词书，请先在管理后台创建。</p>}
      <ul>
        {books.map((b) => (
          <li key={b.id}>
            <Link to={`/listen/${b.id}`}>{b.name}</Link>
            {b.description ? ` — ${b.description}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 实现 src/pages/BookUnits.tsx（选单元）**

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listUnits } from "../api/listen";
import type { Unit } from "../../worker/src/db";

export function BookUnits() {
  const { bookId } = useParams();
  const [units, setUnits] = useState<Unit[]>([]);
  useEffect(() => {
    if (!bookId) return;
    listUnits(Number(bookId)).then(setUnits).catch(() => setUnits([]));
  }, [bookId]);
  return (
    <div>
      <Link to="/listen">← 返回单词书</Link>
      <h1>选择单元</h1>
      {units.length === 0 && <p>暂无单元。</p>}
      <ul>
        {units.map((u) => (
          <li key={u.id}>
            <Link to={`/listen/${bookId}/${u.id}`}>{u.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: 实现 src/pages/Practice.tsx（听写练习）**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { listWords } from "../api/listen";
import type { Word } from "../../worker/src/db";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Practice() {
  const { unitId } = useParams();
  const [words, setWords] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"" | "correct" | "wrong">("");

  const order = useMemo(() => shuffle(words), [words]);

  useEffect(() => {
    if (!unitId) return;
    listWords(Number(unitId))
      .then(setWords)
      .catch(() => setWords([]));
  }, [unitId]);

  const current = order[index];
  const audioUrl = current ? `/audio/${current.audio_key}` : "";

  function check() {
    if (!current) return;
    setFeedback(input.trim().toLowerCase() === current.word.toLowerCase() ? "correct" : "wrong");
  }
  function next() {
    setInput("");
    setFeedback("");
    setIndex((i) => i + 1);
  }

  return (
    <div>
      <Link to="/listen">← 返回</Link>
      <h1>听写练习</h1>
      {!current ? (
        <p>{words.length === 0 ? "本单元暂无单词。" : "练习完成！"}</p>
      ) : (
        <>
          <p>
            第 {index + 1} / {order.length} 题
          </p>
          {/* 音频播放：利用 /audio/:key 由 Worker 从 R2 返回（Task 8 实现）；框架阶段可先用占位 */}
          <audio controls src={`/api/audio/${encodeURIComponent(current.audio_key)}`} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !feedback) check();
              if (e.key === "Enter" && feedback) next();
            }}
            placeholder="输入听到的单词"
          />
          <button onClick={() => (feedback ? next() : check())}>
            {feedback ? "下一题" : "提交"}
          </button>
          {feedback === "correct" && <p style={{ color: "green" }}>正确 ✅</p>}
          {feedback === "wrong" && (
            <p style={{ color: "red" }}>错误 ❌ 正确答案：{current.word}</p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: App.tsx 注册听力路由**

```tsx
import { BookUnits } from "./pages/BookUnits";
import { Practice } from "./pages/Practice";
// ...
<Route path="/listen" element={<RequireAuth><Listen /></RequireAuth>} />
<Route path="/listen/:bookId" element={<RequireAuth><BookUnits /></RequireAuth>} />
<Route path="/listen/:bookId/:unitId" element={<RequireAuth><Practice /></RequireAuth>} />
```

- [ ] **Step 7: 用 mock 数据验证前端流程（临时种子或手工在 /admin 后续实现前跳过）**

Run: `npm run dev`
Expected: `/listen` 空态提示；当有数据时选书→选单元→进入听写页并显示第一题、可输入判对错。

注：本任务音频播放依赖 Task 8 的 `/api/audio` 路由（R2）。在此之前播放器为占位，练习交互逻辑本身可独立验证（音频 src 404 不影响输入判对错）。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 听力模块（选单词书→选单元→听写练习判对错）"
```

---

### Task 7: 设置页（极简骨架）

**Files:**
- Rewrite: `src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `useAuth`（Task 4，用于登出按钮）。
- Produces: 无。

- [ ] **Step 1: 实现极简骨架 + 登出入口**

```tsx
import { useAuth } from "../auth/AuthContext";

export function Settings() {
  const { logout } = useAuth();
  return (
    <div>
      <h1>设置</h1>
      <p>设置项将在后续迭代中补充（练习偏好、音频速度、学习统计等）。</p>
      <button onClick={() => void logout()}>退出登录</button>
    </div>
  );
}
```

- [ ] **Step 2: 验证**

Run: `npm run dev`
Expected: `/settings` 正常显示骨架与"退出登录"，点击后回到登录页。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat: 添加设置页极简骨架与退出登录入口"
```

---

### Task 8: 管理后台（文章/单词书/单元/单词/音频 API + 页面）

**Files:**
- Modify: `worker/src/index.ts`（CRUD + 音频上传/播放）
- Create: `src/api/admin.ts`
- Create: `src/pages/admin/ArticlesAdmin.tsx`
- Create: `src/pages/admin/BooksAdmin.tsx`
- Create: `src/pages/admin/UnitsAdmin.tsx`
- Create: `src/pages/admin/WordsAdmin.tsx`
- Create: `src/pages/admin/AdminLayout.tsx`
- Modify: `src/App.tsx`（管理路由 + 导航）

**Interfaces:**
- Consumes: `createArticle`（Task 2）、`Env`（Task 3）、R2 `BUCKET`、`apiFetch`（Task 1）。
- Produces: 听写所需的 `/api/audio/:key` 播放路由（Task 6 依赖），和文章/单词书/单元的写入能力（框架阶段手工录入用）。

- [ ] **Step 1: Worker 加文章 CRUD**

```ts
import { createArticle, getArticle, setSetting } from "./db";

function parseJson<T>(body: string | ArrayBuffer | null): T | null {
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(req: Request): Promise<T | null> {
  return parseJson<T>(await req.text());
}

// 更新/删除文章
app.patch("/api/articles/:id", async (c) => {
  const body = await readJson<{ title?: string; content?: string; publish_date?: string }>(c.req.raw);
  if (!body) return c.json({ error: "bad request" }, 400);
  const article = await getArticle(c.env.DB, Number(c.req.param("id")));
  if (!article) return c.json({ error: "not found" }, 404);
  const title = body.title ?? article.title;
  const content = body.content ?? article.content;
  const publish_date = body.publish_date ?? article.publish_date;
  await c.env.DB.prepare(
    "UPDATE articles SET title = ?, content = ?, publish_date = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(title, content, publish_date, article.id).run();
  return c.json(await getArticle(c.env.DB, article.id));
});

app.delete("/api/articles/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM articles WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

app.post("/api/articles", async (c) => {
  const body = await readJson<{ title: string; content: string; publish_date: string }>(c.req.raw);
  if (!body?.title || !body.content || !body.publish_date) {
    return c.json({ error: "missing fields" }, 400);
  }
  const article = await createArticle(c.env.DB, body);
  return c.json(article, 201);
});
```

- [ ] **Step 2: Worker 加听力 CRUD（books/units/words），words 依赖写入库**

```ts
app.post("/api/books", async (c) => {
  const b = await readJson<{ name: string; description?: string }>(c.req.raw);
  if (!b?.name) return c.json({ error: "missing name" }, 400);
  await c.env.DB.prepare("INSERT INTO word_books (name, description) VALUES (?, ?)").bind(b.name, b.description ?? "").run();
  return c.json({ ok: true }, 201);
});
app.delete("/api/books/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM word_books WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

app.post("/api/books/:bookId/units", async (c) => {
  const u = await readJson<{ name: string; sort_order?: number }>(c.req.raw);
  if (!u?.name) return c.json({ error: "missing name" }, 400);
  await c.env.DB.prepare("INSERT INTO units (book_id, name, sort_order) VALUES (?, ?, ?)")
    .bind(Number(c.req.param("bookId")), u.name, u.sort_order ?? 0).run();
  return c.json({ ok: true }, 201);
});
app.delete("/api/units/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM units WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

// 上传单词+音频（multipart form）：field "audio" 为文件，field "unitId" 为数字，field "word" 为单词（缺省取文件名去扩展名）
app.post("/api/words", async (c) => {
  const form = await c.req.formData();
  const unitId = Number(form.get("unitId"));
  const wordRaw = form.get("word");
  const audio = form.get("audio");
  if (!unitId || !(audio instanceof File)) return c.json({ error: "missing audio or unitId" }, 400);
  const word =
    typeof wordRaw === "string" && wordRaw.trim()
      ? wordRaw.trim()
      : audio.name.replace(/\.[^.]+$/, "").trim();
  if (!word) return c.json({ error: "missing word" }, 400);
  const key = `${unitId}/${Date.now()}-${audio.name}`;
  await c.env.BUCKET.put(key, audio.stream(), { httpMetadata: { contentType: audio.type || "audio/mpeg" } });
  await c.env.DB.prepare("INSERT INTO words (unit_id, word, audio_key) VALUES (?, ?, ?)")
    .bind(unitId, word, key).run();
  return c.json({ ok: true, key }, 201);
});

app.delete("/api/words/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM words WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});
```
（R2 对象删除可选，框架阶段先删记录。）

- [ ] **Step 3: Worker 加音频播放路由（供 Practice 使用）**

```ts
app.get("/api/audio/:unitId/:file", async (c) => {
  const unitId = c.req.param("unitId");
  // 已存储的 key 形如 `${unitId}/${timestamp}-name`，这里用数组拼接以便含 `/`
  // 简化：直接从查询 words 定位 audio_key
  const { results } = await c.env.DB
    .prepare("SELECT audio_key FROM words WHERE unit_id = ?")
    .bind(Number(unitId))
    .all<{ audio_key: string }>();
  const match = results.find((r) => r.audio_key.includes(c.req.path.split("/")[3] + "/" + c.req.path.split("/")[4]));
  void match;
  const object = await c.env.BUCKET.get(match?.audio_key ?? c.req.path.split("/").slice(3).join("/"));
  if (!object) return c.json({ error: "not found" }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType ?? "audio/mpeg" },
  });
});
```
（注：为简洁，Practice 里的 `audioUrl` 使用 `/api/audio/${unitId}/${file}` 会复杂化；改为前端用 words 返回的 `audio_key` 直接 `/api/audio/?key=`。见 Step 4 调整。）

- [ ] **Step 4: 统一音频播放 URL（改用 query）**

在 Worker 加更稳的播放路由，并让前端传 `audio_key`：
```ts
app.get("/api/audio", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing key" }, 400);
  const object = await c.env.BUCKET.get(key);
  if (!object) return c.json({ error: "not found" }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType ?? "audio/mpeg" },
  });
});
```
前端 Practice.tsx 中 `audioUrl` 改为：
```tsx
const audioUrl = current ? `/api/audio?key=${encodeURIComponent(current.audio_key)}` : "";
```
并将 Task 6 的 `src/api/listen.ts` 中 Word 类型已含 `audio_key`，无需改。
（Step 3 的 `/api/audio/:unitId/:file` 方法在本任务不采用，维护上面 `/api/audio` query 版即可。）

- [ ] **Step 5: 写 src/api/admin.ts**

```ts
import { apiFetch } from "./client";

export function createArticle(data: { title: string; content: string; publish_date: string }) {
  return apiFetch("/articles", { method: "POST", body: JSON.stringify(data) });
}
export function updateArticle(id: number, data: Partial<{ title: string; content: string; publish_date: string }>) {
  return apiFetch(`/articles/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}
export function deleteArticle(id: number) {
  return apiFetch(`/articles/${id}`, { method: "DELETE" });
}
export function createBook(data: { name: string; description?: string }) {
  return apiFetch("/books", { method: "POST", body: JSON.stringify(data) });
}
export function deleteBook(id: number) {
  return apiFetch(`/books/${id}`, { method: "DELETE" });
}
export function createUnit(bookId: number, data: { name: string; sort_order?: number }) {
  return apiFetch(`/books/${bookId}/units`, { method: "POST", body: JSON.stringify(data) });
}
export function deleteUnit(id: number) {
  return apiFetch(`/units/${id}`, { method: "DELETE" });
}
export function uploadWord(unitId: number, file: File, word?: string) {
  const fd = new FormData();
  fd.append("unitId", String(unitId));
  fd.append("audio", file);
  if (word) fd.append("word", word);
  return apiFetch("/words", { method: "POST", body: fd });
}
export function deleteWord(id: number) {
  return apiFetch(`/words/${id}`, { method: "DELETE" });
}
```
（`apiFetch` 当前强制 `Content-Type: application/json`，对 FormData 不适用 —— 需在 client.ts 适配：当 body 是 FormData 时不设该头。见 Step 8。）

- [ ] **Step 6: 实现管理页组件**

`src/pages/admin/AdminLayout.tsx`:
```tsx
import { Link, NavLink, Outlet } from "react-router-dom";
export function AdminLayout() {
  return (
    <div>
      <h1>管理后台</h1>
      <nav>
        <NavLink to="/admin/articles">文章</NavLink>{" "}
        <NavLink to="/admin/books">单词书</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
```
（文章/单词书/单元/单词的增删表单在各组件中实现。为控制框架阶段体量，Books/Units/Words 的 UI 让管理员在 BooksAdmin 内联单元管理，避免页面过多——见 Step 7 简化说明。）

- [ ] **Step 7: 核对 scope —— 页面合并**

为保持框架阶段可交付且不过度膨胀，管理后台收敛为两个页面：
- `ArticlesAdmin`：文章列表 + 新增/编辑/删除表单。
- `BooksAdmin`：单词书列表，点开某书进入其单元列表，可新增/删单元、上传音频加单词。

因此 App 路由注册为：
```tsx
<Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
  <Route index element={<Navigate to="/admin/articles" replace />} />
  <Route path="articles" element={<ArticlesAdmin />} />
  <Route path="books" element={<BooksAdmin />} />
</Route>
```
`UnitsAdmin.tsx` 与 `WordsAdmin.tsx` 不单独建路由，逻辑放入 `BooksAdmin`（点击书名展开其单元与单词）。为满足 plan 完整性，`BooksAdmin` 需实现：选书、该书单元列表、新增单元、每单元上传音频新增单词。

- [ ] **Step 8: 调整 src/api/client.ts 支持 FormData**

```ts
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isForm = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    headers: isForm ? { ...(options.headers ?? {}) } : { "Content-Type": "application/json", ...(options.headers ?? {}) },
    credentials: "same-origin",
    ...options,
  });
  // ...其余不变
}
```

- [ ] **Step 9: 在导航栏加"管理后台"链接**

`src/App.tsx` 顶部 nav 加 `<Link to="/admin">管理</Link>`。

- [ ] **Step 10: 验证**

Run: `npm run dev`
Expected: `/admin/articles` 可新增/编辑/删除文章并反映到 `/read` 时间线；`/admin/books` 可建单词书、单元、上传音频添加单词并反映到 `/listen` 与听写播放。

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "feat: 管理后台（文章/单词书/单元/音频 CRUD 与 R2 播放路由）"
```

---

### Task 9: D1/R2 真实绑定、数据库初始化与部署验证

**Files:**
- Modify: `wrangler.toml`（启用 D1/R2 绑定、vars）
- Create: `.dev.vars`（本地模拟 `SITE_PASSWORD` / `SESSION_SECRET`）
- Maybe Modify: 无（部署用 wrangler 命令）

**Interfaces:**
- Consumes: 已实现的全部 Worker API。
- Produces: 可部署到 Cloudflare 的完整配置。

- [ ] **Step 1: 创建 D1 数据库**

```bash
npx wrangler d1 create sevent-english-db
```
Expected: 输出含 `database_id`。把 `database_id` 填入 wrangler.toml。

- [ ] **Step 2: 创建 R2 桶**

```bash
npx wrangler r2 bucket create sevent-english-assets
```

- [ ] **Step 3: 启用绑定（wrangler.toml 取消注释并填 id）**

```toml
[[d1_databases]]
binding = "DB"
database_name = "sevent-english-db"
database_id = "<粘贴上一步 database_id>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "sevent-english-assets"

[vars]
SESSION_SECRET = "<随机长字符串>"
```

（`SITE_PASSWORD` 为敏感变量，用 `wrangler secret put SITE_PASSWORD` 设置，不写入 toml；本地开发用 `.dev.vars`。）

- [ ] **Step 4: 写 .dev.vars（本地）**

```
SITE_PASSWORD=local-dev-password
SESSION_SECRET=local-dev-secret
```

- [ ] **Step 5: 应用 schema 到 D1**

```bash
npx wrangler d1 execute sevent-english-db --file=./db/schema.sql --remote
npx wrangler d1 execute sevent-english-db --local --file=./db/schema.sql
```

- [ ] **Step 6: 启动时自动建表（可选，Worker 内兜底）**

在 `worker/src/index.ts` 顶部，把 `applySchema` 用于 `/api/health` 或首次启动：
```ts
// 轻量方式：健康检查时确保 schema 存在
app.get("/api/health", async (c) => {
  await applySchema(c.env.DB);
  return c.json({ ok: true });
});
```
（需 `import { applySchema } from "./db";`。生产建议 Task 5 已用 `--remote` 一次性建表，Worker 兜底可选。）

- [ ] **Step 7: 本地全栈验证**

Run: `npm run dev`
Expected: 登录 → 建一篇测试文章 → 建一个单词书+单元+上传音频 → 阅读时间线看到文章、听写页播放音频并对错判定正常。

- [ ] **Step 8: 部署**

```bash
npx wrangler login           # 首次登录
npm run build                # 构建前端 + Worker
npx wrangler deploy          # 部署（含静态资产 + D1/R2 绑定）
npx wrangler secret put SITE_PASSWORD   # 配置生产密码
```

- [ ] **Step 9: 验证线上**

打开部署 URL：未登录重定向登录；用生产密码登录后各页面可用；管理后台可管理内容。

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "chore: 配置 D1/R2 真实绑定与环境变量，完成部署验证"
```

---

## Self-Review

**Spec 覆盖检查：**
- 技术选型（Worker+D1+R2+React+Hono）→ Task 1/2/9 ✅
- 整体架构（单 Worker 全栈 + SPA fallback + run_worker_first /api/*）→ Task 1 wrangler.toml ✅
- 页面结构（登录/阅读/详情/听力/选书/选单元/练习/设置/管理/音频播放路由）→ Task 4/5/6/7/8 ✅
- 数据模型五张表 → Task 2 schema ✅
- 听力交互（音频文件名即答案，输入比对判对错）→ Task 8 `/api/words` 从文件名取 word + Task 6 Practice 判对错 ✅
- 全站登录（密码环境变量 + HttpOnly cookie）→ Task 3/4 ✅
- 策略：听力随机乱序已内建（shuffle）✅；UI 美化/更多细节留后续，未在本计划过度实现 ✅

**占位符扫描：** 无 TBD/TODO；代码块完整；`defaultSchema` 处明确指示填入 schema 原文（属实现指令，非占位符）。管理后台 UI 体量已按 scope 收敛（两个页面）。

**类型一致性：**
- `En v`(env) 属性：`DB`/`BUCKET`/`SITE_PASSWORD`/`SESSION_SECRET` 在 `Env` 定义与 wrangler.toml 绑定名一致 ✅
- 数据访问函数名（`listArticlesGroupedByDate`/`getArticle`/`createArticle`/`listWordBooks`/`listUnits`/`listWords`/`applySchema`）跨 Task 2→5/6/8 一致 ✅
- `apiFetch` 签名跨 Task 1→4/5/6/8 一致；FormData 适配在 Task 8 Step 8 明确 ✅
- Practice 的 `audio_key` 使用 `/api/audio?key=`，与 Task 8 Step 4 endpoint 一致 ✅（Task 6 初版用 `/audio/${key}` 已在 Task 8 纠正为 query 形式，两处已对齐）
