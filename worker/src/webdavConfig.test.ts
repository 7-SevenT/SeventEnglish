import { describe, expect, it } from "vitest";
import {
  clearWebdavConfig,
  readWebdavConfig,
  readWebdavPublicConfig,
  writeWebdavConfig,
} from "./webdavConfig";

const KEY = "test-encryption-key";

function settingsDb(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    prepare(statement: string) {
      let params: unknown[] = [];
      const first = async () => {
        if (!statement.includes("SELECT value FROM settings")) return null;
        return values.has(String(params[0])) ? { value: values.get(String(params[0])) } : null;
      };
      const run = async () => {
        if (statement.includes("INSERT INTO settings")) {
          values.set(String(params[0]), String(params[1]));
        }
        return {};
      };
      return {
        bind: (...next: unknown[]) => {
          params = next;
          return { first, run };
        },
        first,
        run,
      };
    },
  } as unknown as D1Database;
}

describe("webdavConfig", () => {
  it("saves and reads back config with encrypted password", async () => {
    const db = settingsDb();
    const pub = await writeWebdavConfig(db, KEY, {
      url: "https://dav.example.com/dav/",
      username: "user",
      password: "secret",
    });
    expect(pub).toEqual({ configured: true, url: "https://dav.example.com/dav/", username: "user", has_password: true });

    const full = await readWebdavConfig(db, KEY);
    expect(full).toEqual({ url: "https://dav.example.com/dav/", username: "user", password: "secret" });
  });

  it("does not leak plaintext password in public config", async () => {
    const db = settingsDb();
    await writeWebdavConfig(db, KEY, { url: "https://dav.example.com", username: "user", password: "secret" });
    const raw = await readWebdavPublicConfig(db, KEY);
    expect(raw).toEqual({ configured: true, url: "https://dav.example.com", username: "user", has_password: true });
    // 存储值不应包含明文密码
    const { getSetting } = await import("./db");
    const stored = await getSetting(db, "webdav_config");
    expect(stored).not.toContain("secret");
  });

  it("keeps existing password when new password is empty", async () => {
    const db = settingsDb();
    await writeWebdavConfig(db, KEY, { url: "https://dav.example.com", username: "user", password: "secret" });
    await writeWebdavConfig(db, KEY, { url: "https://dav.example.com", username: "user2" });
    const full = await readWebdavConfig(db, KEY);
    expect(full).toEqual({ url: "https://dav.example.com", username: "user2", password: "secret" });
  });

  it("rejects invalid url and missing fields", async () => {
    const db = settingsDb();
    await expect(writeWebdavConfig(db, KEY, { url: "ftp://dav", username: "u", password: "p" })).rejects.toThrow(/http|https/);
    await expect(writeWebdavConfig(db, KEY, { url: "not-a-url", username: "u", password: "p" })).rejects.toThrow(/URL/);
    await expect(writeWebdavConfig(db, KEY, { url: "", username: "", password: "" })).rejects.toThrow(/URL/);
  });

  it("returns unconfigured when cleared", async () => {
    const db = settingsDb();
    await writeWebdavConfig(db, KEY, { url: "https://dav.example.com", username: "user", password: "secret" });
    await clearWebdavConfig(db);
    expect(await readWebdavConfig(db, KEY)).toBeNull();
    expect(await readWebdavPublicConfig(db, KEY)).toEqual({ configured: false, url: null, username: null, has_password: false });
  });

  it("returns null when nothing stored", async () => {
    const db = settingsDb();
    expect(await readWebdavConfig(db, KEY)).toBeNull();
    expect(await readWebdavPublicConfig(db, KEY)).toEqual({ configured: false, url: null, username: null, has_password: false });
  });
});
