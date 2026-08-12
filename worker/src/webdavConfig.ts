import { getSetting, setSetting } from "./db";
import { decryptSecret, encryptSecret } from "./aiConfig";

const WEBDAV_CONFIG_KEY = "webdav_config";

export type WebdavStoredConfig = {
  url: string;
  username: string;
  password: Awaited<ReturnType<typeof encryptSecret>>;
  updated_at: string;
};

export type WebdavPublicConfig = {
  configured: boolean;
  url: string | null;
  username: string | null;
  has_password: boolean;
};

export type WebdavConfig = {
  url: string;
  username: string;
  password: string;
};

export type WebdavConfigInput = {
  url?: string;
  username?: string;
  password?: string;
};

function parseStored(raw: string): WebdavStoredConfig | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WebdavStoredConfig>;
    if (
      typeof parsed.url !== "string" ||
      typeof parsed.username !== "string" ||
      !parsed.password ||
      typeof parsed.password.version !== "number" ||
      typeof parsed.password.iv !== "string" ||
      typeof parsed.password.ciphertext !== "string" ||
      typeof parsed.updated_at !== "string"
    ) {
      return null;
    }
    return parsed as WebdavStoredConfig;
  } catch {
    return null;
  }
}

/** 读取完整 WebDAV 配置（含解密后的密码），用于备份/恢复。未配置或解密失败返回 null。 */
export async function readWebdavConfig(db: D1Database, encryptionKey: string): Promise<WebdavConfig | null> {
  const raw = await getSetting(db, WEBDAV_CONFIG_KEY);
  if (!raw) return null;
  const stored = parseStored(raw);
  if (!stored || !stored.url || !stored.username) return null;
  const password = await decryptSecret(stored.password, encryptionKey).catch(() => "");
  if (!password) return null;
  return { url: stored.url, username: stored.username, password };
}

/** 脱敏配置状态（不返回明文密码），供管理后台展示。 */
export async function readWebdavPublicConfig(db: D1Database, _encryptionKey: string): Promise<WebdavPublicConfig> {
  const raw = await getSetting(db, WEBDAV_CONFIG_KEY);
  if (!raw) return { configured: false, url: null, username: null, has_password: false };
  const stored = parseStored(raw);
  if (!stored) return { configured: false, url: null, username: null, has_password: false };
  return {
    configured: Boolean(stored.url && stored.username && stored.password),
    url: stored.url || null,
    username: stored.username || null,
    has_password: Boolean(stored.password),
  };
}

/**
 * 保存 WebDAV 配置：只更新提供的字段，缺省字段保留现值。
 * url/username 传空字符串表示清除；password 传空字符串表示保留原密码。
 */
export async function writeWebdavConfig(
  db: D1Database,
  encryptionKey: string,
  input: WebdavConfigInput,
): Promise<WebdavPublicConfig> {
  const raw = await getSetting(db, WEBDAV_CONFIG_KEY);
  const existing = raw ? parseStored(raw) : null;

  const url = input.url?.trim() ?? existing?.url ?? "";
  const username = input.username?.trim() ?? existing?.username ?? "";
  const password = input.password?.trim() ? await encryptSecret(input.password.trim(), encryptionKey) : existing?.password;

  if (!url) throw new Error("WebDAV URL 不能为空");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("WebDAV URL 格式无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("WebDAV URL 必须使用 http 或 https");
  }
  if (!username) throw new Error("WebDAV 用户名不能为空");
  if (!password) throw new Error("WebDAV 密码不能为空");

  const stored: WebdavStoredConfig = { url, username, password, updated_at: new Date().toISOString() };
  await setSetting(db, WEBDAV_CONFIG_KEY, JSON.stringify(stored));
  return { configured: true, url, username, has_password: true };
}

/** 清除 WebDAV 配置。 */
export async function clearWebdavConfig(db: D1Database): Promise<void> {
  await setSetting(db, WEBDAV_CONFIG_KEY, "");
}
