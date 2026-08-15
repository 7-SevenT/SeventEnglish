import { getSetting, setSetting } from "./db";
import { decryptSecret, encryptSecret } from "./aiConfig";

// AI 分析服务（Vercel proxy）配置：url + token 加密存储。
// Worker 的 queue consumer 不再直接调用 AI 提供商（免费计划 CPU 限制 10ms 无法完成分析），
// 而是把分析任务转发到 Vercel 上的 analyze 服务，结果回传后直接入库。
// token 用于 Vercel 侧鉴权（与 Vercel 环境变量 ANALYZE_TOKEN 或 TOKEN 保持一致），防止接口被滥用。

const ANALYZE_SERVICE_KEY = "ai_analyze_service";

type StoredAnalyzeServiceConfig = {
  url: string;
  token: Awaited<ReturnType<typeof encryptSecret>>;
  updated_at: string;
};

export type AnalyzeServicePublicConfig = {
  configured: boolean;
  url: string | null;
  has_token: boolean;
  updated_at: string | null;
};

export type AnalyzeServiceRuntimeConfig = {
  url: string;
  token: string;
};

export type AnalyzeServiceConfigInput = {
  url?: string;
  token?: string;
};

function parseStored(raw: string): StoredAnalyzeServiceConfig | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAnalyzeServiceConfig>;
    if (
      typeof parsed.url !== "string" ||
      !parsed.token ||
      typeof parsed.token.version !== "number" ||
      typeof parsed.token.iv !== "string" ||
      typeof parsed.token.ciphertext !== "string" ||
      typeof parsed.updated_at !== "string"
    ) {
      return null;
    }
    return parsed as StoredAnalyzeServiceConfig;
  } catch {
    return null;
  }
}

function normalizeServiceUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("分析服务 URL 格式无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("分析服务 URL 必须使用 http 或 https");
  }
  return trimmed;
}

/** 读取完整配置（含解密后的 token），供 handleAnalyzeJob 调用。未配置或解密失败返回 null。 */
export async function readAnalyzeServiceRuntimeConfig(db: D1Database, encryptionKey: string): Promise<AnalyzeServiceRuntimeConfig | null> {
  const raw = await getSetting(db, ANALYZE_SERVICE_KEY);
  if (!raw) return null;
  const stored = parseStored(raw);
  if (!stored || !stored.url || !stored.token) return null;
  const token = await decryptSecret(stored.token, encryptionKey).catch(() => "");
  if (!token) return null;
  return { url: stored.url, token };
}

/** 脱敏配置状态（不返回明文 token），供管理后台展示。 */
export async function readAnalyzeServicePublicConfig(db: D1Database, _encryptionKey: string): Promise<AnalyzeServicePublicConfig> {
  const raw = await getSetting(db, ANALYZE_SERVICE_KEY);
  if (!raw) return { configured: false, url: null, has_token: false, updated_at: null };
  const stored = parseStored(raw);
  if (!stored) return { configured: false, url: null, has_token: false, updated_at: null };
  return {
    configured: Boolean(stored.url && stored.token),
    url: stored.url || null,
    has_token: Boolean(stored.token),
    updated_at: stored.updated_at || null,
  };
}

/** 保存分析服务配置：只更新提供的字段，缺省字段保留现值；token 传空字符串表示保留原 token。 */
export async function writeAnalyzeServiceConfig(
  db: D1Database,
  encryptionKey: string,
  input: AnalyzeServiceConfigInput,
): Promise<AnalyzeServicePublicConfig> {
  const raw = await getSetting(db, ANALYZE_SERVICE_KEY);
  const existing = raw ? parseStored(raw) : null;

  const url = input.url !== undefined ? normalizeServiceUrl(input.url) : existing?.url;
  const token = input.token?.trim()
    ? await encryptSecret(input.token.trim(), encryptionKey)
    : existing?.token;
  if (!url) throw new Error("分析服务 URL 不能为空");
  if (!token) throw new Error("分析服务 Token 不能为空");

  const stored: StoredAnalyzeServiceConfig = { url, token, updated_at: new Date().toISOString() };
  await setSetting(db, ANALYZE_SERVICE_KEY, JSON.stringify(stored));
  return { configured: true, url, has_token: true, updated_at: stored.updated_at };
}

/** 清除分析服务配置。 */
export async function clearAnalyzeServiceConfig(db: D1Database): Promise<void> {
  await setSetting(db, ANALYZE_SERVICE_KEY, "");
}
