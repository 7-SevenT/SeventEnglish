import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  readAiModelConfig,
  readAiModelRuntimeConfig,
  writeAiModelConfig,
} from "./aiConfig";

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

describe("AI model config", () => {
  it("round-trips an API key without storing plaintext", async () => {
    const encrypted = await encryptSecret("api-secret", "encryption-secret");

    expect(encrypted.ciphertext).not.toContain("api-secret");
    await expect(decryptSecret(encrypted, "encryption-secret")).resolves.toBe("api-secret");
  });

  it("retains the existing key when a later update leaves api_key blank", async () => {
    const db = settingsDb();
    await writeAiModelConfig(db, "encryption-secret", {
      base_url: "https://provider.example/v1/",
      model: "model-a",
      api_key: "api-secret",
    });
    await writeAiModelConfig(db, "encryption-secret", {
      base_url: "https://provider.example/v2",
      model: "model-b",
      api_key: "   ",
    });

    const runtime = await readAiModelRuntimeConfig(db, "encryption-secret");
    expect(runtime).toEqual({
      baseUrl: "https://provider.example/v2",
      model: "model-b",
      apiKey: "api-secret",
    });
  });

  it("returns a redacted public config", async () => {
    const db = settingsDb();
    await writeAiModelConfig(db, "encryption-secret", {
      base_url: "https://provider.example/v1",
      model: "model-a",
      api_key: "api-secret",
    });

    const publicConfig = await readAiModelConfig(db, "encryption-secret");
    expect(publicConfig).toMatchObject({
      base_url: "https://provider.example/v1",
      model: "model-a",
      has_api_key: true,
    });
    expect(publicConfig).not.toHaveProperty("api_key");
    expect(publicConfig).not.toHaveProperty("ciphertext");
  });

  it("rejects an invalid Base URL and a missing initial API key", async () => {
    const db = settingsDb();

    await expect(writeAiModelConfig(db, "encryption-secret", {
      base_url: "not-a-url",
      model: "model-a",
      api_key: "api-secret",
    })).rejects.toThrow("Base URL");

    await expect(writeAiModelConfig(db, "encryption-secret", {
      base_url: "https://provider.example/v1",
      model: "model-a",
    })).rejects.toThrow("API Key");
  });
});
