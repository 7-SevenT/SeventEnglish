import { getSetting, setSetting } from "./db";

const AI_CONFIG_KEY = "ai_model_config";
const VERSION = 1 as const;
type EncryptedSecret = { version: typeof VERSION; iv: string; ciphertext: string };

type StoredAiModelConfig = {
  base_url: string;
  model: string;
  api_key: EncryptedSecret;
  updated_at: string;
};

export type AiModelConfigInput = {
  base_url: string;
  model: string;
  api_key?: string;
};

export type AiModelPublicConfig = {
  base_url: string;
  model: string;
  has_api_key: boolean;
  updated_at: string | null;
};

export type AiModelRuntimeConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

function toBytes(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

async function deriveKey(encryptionKey: string, usages: KeyUsage[]): Promise<CryptoKey> {
  if (!encryptionKey.trim()) throw new Error("ENCRYPTION_KEY is not configured");
  const digest = await crypto.subtle.digest("SHA-256", toBytes(encryptionKey));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

export async function encryptSecret(secret: string, encryptionKey: string): Promise<EncryptedSecret> {
  if (!secret.trim()) throw new Error("API Key is required");
  const key = await deriveKey(encryptionKey, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, toBytes(secret));
  return {
    version: VERSION,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptSecret(value: EncryptedSecret, encryptionKey: string): Promise<string> {
  if (value.version !== VERSION || !value.iv || !value.ciphertext) throw new Error("Invalid encrypted API Key");
  const key = await deriveKey(encryptionKey, ["decrypt"]);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(value.iv) },
      key,
      fromBase64Url(value.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Unable to decrypt AI API Key");
  }
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Base URL must use http or https");
  return trimmed;
}

function parseStoredConfig(value: string): StoredAiModelConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Stored AI model config is invalid");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Stored AI model config is invalid");
  const config = parsed as Partial<StoredAiModelConfig>;
  if (typeof config.base_url !== "string" || typeof config.model !== "string" || typeof config.updated_at !== "string") {
    throw new Error("Stored AI model config is invalid");
  }
  const encrypted = config.api_key;
  if (!encrypted || encrypted.version !== VERSION || typeof encrypted.iv !== "string" || typeof encrypted.ciphertext !== "string") {
    throw new Error("Stored AI API Key is invalid");
  }
  return {
    base_url: normalizeBaseUrl(config.base_url),
    model: config.model.trim(),
    api_key: encrypted,
    updated_at: config.updated_at,
  };
}

export async function readAiModelConfig(db: D1Database, _encryptionKey: string): Promise<AiModelPublicConfig | null> {
  const raw = await getSetting(db, AI_CONFIG_KEY);
  if (!raw) return null;
  const config = parseStoredConfig(raw);
  return {
    base_url: config.base_url,
    model: config.model,
    has_api_key: true,
    updated_at: config.updated_at,
  };
}

export async function readAiModelRuntimeConfig(db: D1Database, encryptionKey: string): Promise<AiModelRuntimeConfig | null> {
  const raw = await getSetting(db, AI_CONFIG_KEY);
  if (!raw) return null;
  const config = parseStoredConfig(raw);
  const apiKey = await decryptSecret(config.api_key, encryptionKey);
  return { baseUrl: config.base_url, model: config.model, apiKey };
}

export async function writeAiModelConfig(
  db: D1Database,
  encryptionKey: string,
  input: AiModelConfigInput,
): Promise<AiModelPublicConfig> {
  const baseUrl = normalizeBaseUrl(input.base_url);
  const model = input.model.trim();
  if (!model) throw new Error("Model is required");

  const existingRaw = await getSetting(db, AI_CONFIG_KEY);
  const existing = existingRaw ? parseStoredConfig(existingRaw) : null;
  const apiKey = input.api_key?.trim() || null;
  const encryptedApiKey = apiKey
    ? await encryptSecret(apiKey, encryptionKey)
    : existing?.api_key;
  if (!encryptedApiKey) throw new Error("API Key is required");

  const updatedAt = new Date().toISOString();
  await setSetting(db, AI_CONFIG_KEY, JSON.stringify({
    base_url: baseUrl,
    model,
    api_key: encryptedApiKey,
    updated_at: updatedAt,
  } satisfies StoredAiModelConfig));

  return { base_url: baseUrl, model, has_api_key: true, updated_at: updatedAt };
}
