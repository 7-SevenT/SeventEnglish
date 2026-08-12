import { describe, it, expect } from "vitest";
import { verifyLogin, signToken, verifyToken } from "./auth";
import type { Env } from "./auth";

const SECRET = "test-secret";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    LOGIN: "correct-horse",
    SESSION_SECRET: SECRET,
    ENCRYPTION_KEY: "test-encryption-key",
    DB: {} as D1Database,
    BUCKET: {} as R2Bucket,
    ...overrides,
  } as Env;
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
    const token = await signToken(SECRET, payload);
    expect(await verifyToken(SECRET, token)).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    const [payload, signature] = token.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(await verifyToken(SECRET, tampered)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await signToken(SECRET, String(Date.now()));
    const [payload, signature] = token.split(".");
    // 翻转签名末尾的十六进制字符。
    const flippedSig =
      signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    const tampered = `${payload}.${flippedSig}`;
    expect(await verifyToken(SECRET, tampered)).toBe(false);
  });

  it("rejects an invalid token (non payload.signature shape)", async () => {
    expect(await verifyToken(SECRET, "garbage")).toBe(false);
  });

  it("rejects an expired token (valid signature, payload older than 7 days)", async () => {
    // 对“很久以前”（1970 年，epoch 0）的 payload 签名，得到结构合法但过期的 token。
    const expired = await signToken(SECRET, "123");
    expect(await verifyToken(SECRET, expired)).toBe(false);
  });

  it("rejects a token whose payload is in the future", async () => {
    const future = await signToken(SECRET, String(Date.now() + 24 * 3600 * 1000));
    expect(await verifyToken(SECRET, future)).toBe(false);
  });

  it("returns false for an empty/missing token (unauthenticated)", async () => {
    expect(await verifyToken(SECRET, "")).toBe(false);
  });

  it("does not verify a token signed with a different secret", async () => {
    const token = await signToken("other-secret", String(Date.now()));
    expect(await verifyToken(SECRET, token)).toBe(false);
  });
});
