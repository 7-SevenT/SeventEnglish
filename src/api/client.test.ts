import { describe, expect, it, vi, afterEach } from "vitest";
import { apiFetch, onUnauthorized, UnauthorizedError } from "./client";

const originalFetch = globalThis.fetch;

function stubFetch(status: number, body: string): void {
  globalThis.fetch = vi.fn(
    async () => new Response(body, { status, headers: { "Content-Type": "application/json" } })
  ) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiFetch 401 → 全局 auth:unauthorized 事件 (Fix 1)", () => {
  it("401 时抛出 UnauthorizedError 并触发 onUnauthorized 监听器", async () => {
    stubFetch(401, JSON.stringify({ error: "unauthorized" }));
    let fired = 0;
    const off = onUnauthorized(() => fired++);
    try {
      await expect(apiFetch("/articles")).rejects.toBeInstanceOf(UnauthorizedError);
    } finally {
      off();
    }
    expect(fired).toBe(1);
  });

  it("非 401 响应不触发监听器", async () => {
    stubFetch(200, JSON.stringify({ ok: true }));
    let fired = 0;
    const off = onUnauthorized(() => fired++);
    try {
      await apiFetch("/articles");
    } finally {
      off();
    }
    expect(fired).toBe(0);
  });
});
