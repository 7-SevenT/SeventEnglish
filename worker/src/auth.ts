import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

// 无状态认证：签名 cookie 直载真实会话 token，不起依赖任何 DB/KV 会话状态。
// - verifyLogin：LOGIN 与输入密码各自 SHA-256 得到定长 hex 串，再做常数时间比较，
//   消除长度不一致时提前返回的密钥长度侧信道。
// - signToken / verifyToken：由 ENCRYPTION_KEY 经 HKDF-SHA256 派生会话签名专用 HMAC 密钥
//   （域分离：AES-GCM 加密与 HMAC 签名使用不同派生密钥材料），对 payload 做 HMAC-SHA256 自校验签名，
//   payload 为签发时 epoch 毫秒，验签成功后校验 7 天有效期。
// 本模块不再 import ./db，无任何数据库状态。

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  LOGIN: string;
  ENCRYPTION_KEY: string; // 派生会话签名密钥 + AES-GCM 加密（域分离）
}

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

// HKDF 域分离参数：固定常量，保证跨部署/跨请求派生结果稳定。
// v1 后缀用于未来轮换派生参数（届时旧 token 失效属预期）。
const SESSION_SALT = new TextEncoder().encode("seventenglish-session-hkdf-salt-v1");
const SESSION_INFO = new TextEncoder().encode("seventenglish-session-signing-v1");

// 从 ENCRYPTION_KEY 用 HKDF-SHA256 派生会话签名专用 HMAC 密钥：
// 加密（AES-GCM）与签名（HMAC）使用不同派生密钥材料，避免同一密钥跨用途复用。
// 空/缺失 ENCRYPTION_KEY 时抛错（早失败）。
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

function toBytes(s: string): Uint8Array<ArrayBuffer> {
  // TextEncoder.encode 始终返回 ArrayBuffer 背书的 buffer，这里显式收窄类型以匹配 crypto.subtle 的 BufferSource 约束。
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

// 常数时间比较，避免时序侧信道泄露被测值。比较双方应为等长输入（此处为定长 SHA-256 hex 串）。
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyLogin(env: Env, password: string): Promise<boolean> {
  if (!env.LOGIN) return false;
  // 先各自散列为定长 hex（64 字符），再常数时间比较，避免比较长度提前返回泄露密码长度。
  const [expected, given] = [await sha256Hex(env.LOGIN), await sha256Hex(password)];
  return constantTimeEqual(toBytes(expected), toBytes(given));
}

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
    // ENCRYPTION_KEY 缺失/非法时，一律视为未认证。
    return false;
  }
}

// 统一鉴权决策（纯函数，便于独立单测）：读取请求的 session cookie，校验其签名与有效期。
// 返回 true 表示放行，false 表示未认证。所有受保护数据 API 都复用此判断，保证口径一致。
export async function isAuthenticated(env: Env, cookieToken: string | undefined): Promise<boolean> {
  return !!cookieToken && (await verifyToken(env.ENCRYPTION_KEY, cookieToken));
}

// 统一鉴权中间件：挂在受保护数据 API 前缀上（如 /api/articles、后续的 /api/books 等）。
// 未认证返回 401 {error:"unauthorized"}；认证通过则继续执行后续 handler。
export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = createMiddleware(
  async (c, next) => {
    if (!(await isAuthenticated(c.env, getCookie(c, "session")))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  }
);
