# 会话签名密钥改用 ENCRYPTION_KEY 派生（HKDF）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除独立 `SESSION_SECRET` 环境变量，会话签名密钥改为从 `ENCRYPTION_KEY` 通过 HKDF-SHA256 域分离派生，使生产环境只需 `LOGIN` + `ENCRYPTION_KEY` 两个变量（与 SeventFinance 一致）。

**Architecture:** `worker/src/auth.ts` 的 `Env` 接口删除 `SESSION_SECRET`；`signToken`/`verifyToken` 参数语义从"直接 HMAC 密钥"改为"ENCRYPTION_KEY"，内部先用 HKDF-SHA256（固定 salt/info）派生出会话签名专用 HMAC key 再签名/验签，实现加密（AES-GCM）与签名（HMAC）的密钥材料域分离。调用方（`index.ts`）仅替换 `c.env.SESSION_SECRET` → `c.env.ENCRYPTION_KEY`。旧会话 cookie 全部失效（预期，用户重新登录即可）。

**Tech Stack:** TypeScript / Cloudflare Workers / Web Crypto API（`crypto.subtle`：importKey + deriveKey(HKDF) + sign/verify(HMAC)）/ Vitest

## Global Constraints

- `ENCRYPTION_KEY` 是 32 字节 base64url 随机串（如 `5FpQwCW-5nLElovYiW14TqhADHRvtVfw8Dx8rgzfNgw`）。
- 派生参数（salt/info）必须固定常量，保证跨请求/跨部署稳定（否则已签 token 无法验证）。
- HKDF salt/info 加入 `v1` 后缀以便未来轮换派生参数（届时旧 token 失效属预期）。
- `verifyToken`/`requireAuth` 每次调用都重新派生（不缓存 CryptoKey），保持实现简单、测试互不污染。
- 空/缺失 ENCRYPTION_KEY 时 `signToken` 必须抛错（早失败），`verifyToken` 返回 false（与现有一致）。
- 不改变：token 格式（`payload.signature`）、7 天有效期、常数时间比较、`verifyLogin`（仍用 `LOGIN`）。
- 测试环境与生产环境 mock 的 `Env` 全部移除 `SESSION_SECRET` 字段。

---

### Task 1: auth.ts 支持 ENCRYPTION_KEY 派生会话密钥（TDD）

**Files:**
- Modify: `worker/src/auth.ts`
- Test: `worker/src/auth.test.ts`

**Interfaces:**
- Consumes: 现有 `Env`（`LOGIN`/`ENCRYPTION_KEY`/`DB`/`BUCKET`）、`signToken(secret, payload)`、`verifyToken(secret, token)` 的调用约定
- Produces:
  - `Env` 删除 `SESSION_SECRET` 字段
  - `signToken(encryptionKey: string, payload: string): Promise<string>`（语义：从 encryptionKey HKDF 派生 HMAC key 后签名）
  - `verifyToken(encryptionKey: string, token: string): Promise<boolean>`（同上派生后验签）
  - 模块私有 `deriveSessionKey(encryptionKey: string): Promise<CryptoKey>`

- [ ] **Step 1: 改造 auth.test.ts 为失败态（红）**

将 `worker/src/auth.test.ts` 的 `SECRET = "test-secret"` 改为 `KEY = "test-encryption-key"`，`makeEnv` 删除 `SESSION_SECRET` 字段，所有 `signToken(SECRET, ...)` / `verifyToken(SECRET, ...)` 改为 `KEY`，"different secret" 用例改用 `"other-encryption-key"`，并新增两个用例：

```ts
import { describe, it, expect } from "vitest";
import { verifyLogin, signToken, verifyToken } from "./auth";
import type { Env } from "./auth";

const KEY = "test-encryption-key";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    LOGIN: "correct-horse",
    ENCRYPTION_KEY: KEY,
    DB: {} as D1Database,
    BUCKET: {} as R2Bucket,
    ...overrides,
  } as Env;
}

// 参考实现：把传入字符串直接当作 HMAC raw key（旧实现行为），用于证明新实现走 HKDF 派生。
async function rawHmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("auth", () => {
  // ……保留原有 verifyLogin 全部用例（不改）……

  it("signs and verifies a token (round trip)", async () => {
    const payload = String(Date.now());
    const token = await signToken(KEY, payload);
    expect(await verifyToken(KEY, token)).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken(KEY, String(Date.now()));
    const [payload, signature] = token.split(".");
    expect(await verifyToken(KEY, `${payload}x.${signature}`)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await signToken(KEY, String(Date.now()));
    const [payload, signature] = token.split(".");
    const flippedSig = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    expect(await verifyToken(KEY, `${payload}.${flippedSig}`)).toBe(false);
  });

  it("rejects an invalid token (non payload.signature shape)", async () => {
    expect(await verifyToken(KEY, "garbage")).toBe(false);
  });

  it("rejects an expired token (payload older than 7 days)", async () => {
    const expired = await signToken(KEY, "123");
    expect(await verifyToken(KEY, expired)).toBe(false);
  });

  it("rejects a token whose payload is in the future", async () => {
    const future = await signToken(KEY, String(Date.now() + 24 * 3600 * 1000));
    expect(await verifyToken(KEY, future)).toBe(false);
  });

  it("returns false for an empty/missing token", async () => {
    expect(await verifyToken(KEY, "")).toBe(false);
  });

  it("does not verify a token signed with a different ENCRYPTION_KEY", async () => {
    const token = await signToken("other-encryption-key", String(Date.now()));
    expect(await verifyToken(KEY, token)).toBe(false);
  });

  it("derives the session key via HKDF (domain separation)", async () => {
    // 新实现必须不是“直接用 ENCRYPTION_KEY 做 HMAC key”：
    // 若实现仍为旧行为，签名会等于 rawHmacHex 结果，本断言失败（红）。
    const payload = String(Date.now());
    const token = await signToken(KEY, payload);
    const rawSig = await rawHmacHex(KEY, payload);
    expect(token.endsWith(rawSig)).toBe(false);
  });

  it("rejects signing with an empty ENCRYPTION_KEY", async () => {
    await expect(signToken("", String(Date.now()))).rejects.toThrow(/ENCRYPTION_KEY/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败（红）**

Run: `npx vitest run worker/src/auth.test.ts`
Expected: 失败 —— 旧实现仍直接 importKey(raw, secret)，`SESSION_SECRET` 从 Env 删除后 `makeEnv` 类型报错；`derives the session key via HKDF` 断言失败（token.endsWith(rawSig) === true）。

- [ ] **Step 3: 实现 auth.ts（绿）**

修改 `worker/src/auth.ts`：

```ts
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  LOGIN: string;
  ENCRYPTION_KEY: string; // 派生会话签名密钥 + AES-GCM 加密（域分离）
}

// HKDF 域分离参数：固定常量，保证跨部署派生结果稳定。
// v1 后缀用于未来轮换派生参数（届时旧 token 失效属预期）。
const SESSION_SALT = new TextEncoder().encode("seventenglish-session-hkdf-salt-v1");
const SESSION_INFO = new TextEncoder().encode("seventenglish-session-signing-v1");

// 从 ENCRYPTION_KEY 用 HKDF-SHA256 派生会话签名专用 HMAC 密钥：
// 加密（AES-GCM）与签名（HMAC）使用不同派生密钥材料，避免同一密钥跨用途复用。
async function deriveSessionKey(encryptionKey: string): Promise<CryptoKey> {
  if (!encryptionKey.trim()) throw new Error("ENCRYPTION_KEY is not configured");
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toBytes(encryptionKey),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SESSION_SALT, info: SESSION_INFO },
    baseKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
```

将原 `sign(data, secret)` 改为：

```ts
async function sign(encryptionKey: string, data: string): Promise<string> {
  const key = await deriveSessionKey(encryptionKey);
  const sig = await crypto.subtle.sign("HMAC", key, toBytes(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 签发无状态会话 token：`payload.signature`，payload 为签发时 epoch 毫秒。
// 签名密钥由 ENCRYPTION_KEY 经 HKDF 派生（见 deriveSessionKey）。
export async function signToken(encryptionKey: string, payload: string): Promise<string> {
  const signature = await sign(encryptionKey, payload);
  return `${payload}.${signature}`;
}

// 验签无状态会话 token：重算签名做常数时间比较，再校验 7 天有效期。任一步失败返回 false。
export async function verifyToken(encryptionKey: string, token: string): Promise<boolean> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  try {
    const expected = await sign(encryptionKey, payload);
    if (!constantTimeEqual(toBytes(signature), toBytes(expected))) return false;
    const age = Date.now() - Number(payload);
    return age >= 0 && age < SESSION_TTL_MS;
  } catch {
    return false; // ENCRYPTION_KEY 缺失/非法时，一律视为未认证
  }
}
```

`isAuthenticated` 与 `requireAuth` 保持不动（它们经由 `env.SESSION_SECRET` → 需改为 `env.ENCRYPTION_KEY`，见 Task 2 调用点；注意 `isAuthenticated` 内部 `verifyToken(env.SESSION_SECRET, ...)` 改为 `verifyToken(env.ENCRYPTION_KEY, ...)`）。文件顶部注释同步更新为 ENCRYPTION_KEY 派生语义。

- [ ] **Step 4: 运行测试确认通过（绿）**

Run: `npx vitest run worker/src/auth.test.ts`
Expected: PASS（全部用例，含新增 HKDF 域分离与空密钥用例）

- [ ] **Step 5: 提交**

```bash
git add worker/src/auth.ts worker/src/auth.test.ts
git commit -m "feat: 会话签名密钥改为由 ENCRYPTION_KEY 经 HKDF 派生，去掉独立 SESSION_SECRET"
```

---

### Task 2: 更新 index.ts 调用点与其余测试 Env mock

**Files:**
- Modify: `worker/src/index.ts:35,52`
- Modify: `worker/src/index.test.ts:43`
- Modify: `worker/src/ai-admin-api.test.ts:38`
- Modify: `worker/src/articles-api.test.ts:36`

**Interfaces:**
- Consumes: Task 1 的 `Env`（无 `SESSION_SECRET`）、`signToken`/`verifyToken` 的新语义
- Produces: 全仓库不再引用 `SESSION_SECRET`

- [ ] **Step 1: 改 index.ts 两处调用**

`worker/src/index.ts`：

```ts
// 第 35 行附近
const token = await signToken(c.env.ENCRYPTION_KEY, String(Date.now()));
// 第 52 行附近
if (!t || !(await verifyToken(c.env.ENCRYPTION_KEY, t))) {
```

同时把文件内注释里提到的 `SESSION_SECRET` 字样一并更新（如有）。

- [ ] **Step 2: 清理三个测试文件的 Env mock**

`worker/src/index.test.ts` 的 `mockEnv()`：删除 `SESSION_SECRET: SECRET,` 行（保留 `ENCRYPTION_KEY: "test-encryption-key",`）；若文件顶部有 `const SECRET = ...` 常量且仅用于 mock，一并删除。
`worker/src/ai-admin-api.test.ts`：`return { LOGIN: "sevent", SESSION_SECRET: secret, ... }` → 删除 `SESSION_SECRET: secret,`。
`worker/src/articles-api.test.ts`：`return { LOGIN: "pw", SESSION_SECRET: secret, ... }` → 删除 `SESSION_SECRET: secret,`；若 `secret` 变量仅用于此处，一并删除其定义。

- [ ] **Step 3: 全量跑测试**

Run: `npx vitest run`
Expected: 31 个文件全部 PASS（189+ 用例）

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 错误

- [ ] **Step 5: 确认无残留引用并提交**

Run: `grep -rn "SESSION_SECRET" worker src | grep -v node_modules`
Expected: 无输出（全仓库已无 SESSION_SECRET）

```bash
git add worker/src/index.ts worker/src/index.test.ts worker/src/ai-admin-api.test.ts worker/src/articles-api.test.ts
git commit -m "refactor: 会话调用点改用 ENCRYPTION_KEY，清理测试 Env 的 SESSION_SECRET"
```

---

### Task 3: 更新文档与配置样例

**Files:**
- Modify: `.dev.vars.example`
- Modify: `README.md:18,56,72`
- Modify: `AGENTS.md:36`

- [ ] **Step 1: 更新 .dev.vars.example**

```text
LOGIN=sevent
ENCRYPTION_KEY=change-me-to-a-long-random-secret
```
（删除 `SESSION_SECRET=change-me` 行）

- [ ] **Step 2: 更新 README.md**

- 第 18 行认证描述：把"会话 token 由 `SESSION_SECRET` 做 HMAC-SHA256 签名"改为"会话 token 由 `ENCRYPTION_KEY` 经 HKDF-SHA256 派生密钥做 HMAC-SHA256 签名（域分离，加密/签名不同密钥材料）"。
- 第 56 行部署绑定说明：`（LOGIN / SESSION_SECRET / ENCRYPTION_KEY）` → `（LOGIN / ENCRYPTION_KEY）`。
- 第 72 行 AI 配置：`设置 LOGIN、SESSION_SECRET 和 ENCRYPTION_KEY` → `设置 LOGIN 和 ENCRYPTION_KEY`。

- [ ] **Step 3: 更新 AGENTS.md 第 36 行**

"认证为无状态签名 cookie：`SESSION_SECRET` 做 HMAC-SHA256 签名，密码比对先 SHA-256 定长化再常数时间比较。" → "认证为无状态签名 cookie：会话签名密钥由 `ENCRYPTION_KEY` 经 HKDF-SHA256 派生（域分离），密码比对先 SHA-256 定长化再常数时间比较。"

- [ ] **Step 4: 提交**

```bash
git add .dev.vars.example README.md AGENTS.md
git commit -m "docs: 环境变量改为 LOGIN + ENCRYPTION_KEY，会话密钥由 ENCRYPTION_KEY HKDF 派生"
```

---

### Task 4: 生产环境切换与验证

**Files:**
- 无代码改动（wrangler secret 操作 + 部署 + 线上验证）

**Interfaces:**
- Consumes: Task 1-3 的代码与文档改动（需已推送或直接本地部署）

- [ ] **Step 1: 删除生产 SESSION_SECRET secret**

Run: `echo | npx wrangler secret delete SESSION_SECRET --name sevent-english`
Expected: `Successfully deleted secret SESSION_SECRET`

- [ ] **Step 2: 构建并部署**

Run: `npm run deploy`
Expected: 部署成功，绑定 D1/R2 不变，输出新版 Version ID

- [ ] **Step 3: 线上验证（curl，输出仅状态码/短 JSON）**

```bash
B=https://sevent-english.2280520637.workers.dev
# 登录成功（LOGIN）
curl -s -X POST $B/api/login -H 'Content-Type: application/json' -d '{"password":"sevent"}'
# 期望 {"ok":true}
# 带 cookie 访问受保护 API（ENCRYPTION_KEY 派生密钥验签）
curl -s -b <cookie> $B/api/me   # 期望 {"authenticated":true}
curl -s -b <cookie> $B/api/articles  # 期望 []
# 错误密码 401
curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/login -H 'Content-Type: application/json' -d '{"password":"wrong"}'
```

Expected: 登录 ok、me 认证通过、articles 返回空数组、错误密码 401。

- [ ] **Step 4: 提交/推送收尾**

若 Task 1-3 尚未推送，执行 `git push origin main`（GitHub 集成会同步最新 wrangler.toml 与代码）。

- [ ] **Step 5: 更新生产密钥记录**

向用户汇报：生产环境现有 `LOGIN` / `ENCRYPTION_KEY` 两个 secret；`SESSION_SECRET` 已删除；告知旧会话已全部失效需重新登录。
