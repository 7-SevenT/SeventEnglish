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
  it("accepts correct password", async () => {
    expect(await verifyLogin(makeEnv(), "correct-horse")).toBe(true);
  });
  it("rejects wrong password", async () => {
    expect(await verifyLogin(makeEnv(), "wrong")).toBe(false);
  });
  it("rejects when LOGIN is not set", async () => {
    expect(await verifyLogin(makeEnv({ LOGIN: "" }), "anything")).toBe(false);
  });

  it("signs and verifies a token (round trip)", async () => {
    const payload = String(Date.now());
    const token = await signToken(KEY, payload);
    expect(await verifyToken(KEY, token)).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken(KEY, String(Date.now()));
    const [payload, signature] = token.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(await verifyToken(KEY, tampered)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await signToken(KEY, String(Date.now()));
    const [payload, signature] = token.split(".");
    // 翻转签名末尾的十六进制字符。
    const flippedSig =
      signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    const tampered = `${payload}.${flippedSig}`;
    expect(await verifyToken(KEY, tampered)).toBe(false);
  });

  it("rejects an invalid token (non payload.signature shape)", async () => {
    expect(await verifyToken(KEY, "garbage")).toBe(false);
  });

  it("rejects an expired token (valid signature, payload older than 7 days)", async () => {
    // 对“很久以前”（1970 年，epoch 0）的 payload 签名，得到结构合法但过期的 token。
    const expired = await signToken(KEY, "123");
    expect(await verifyToken(KEY, expired)).toBe(false);
  });

  it("rejects a token whose payload is in the future", async () => {
    const future = await signToken(KEY, String(Date.now() + 24 * 3600 * 1000));
    expect(await verifyToken(KEY, future)).toBe(false);
  });

  it("returns false for an empty/missing token (unauthenticated)", async () => {
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
