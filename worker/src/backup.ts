import type { Context } from "hono";
import type { Env } from "./auth";
import { readWebdavConfig } from "./webdavConfig";

const BACKUP_DIR = "SeventEnglish";
const BACKUP_FILE = "seventenglish-backup.json";

const KNOWN_TABLES = [
  "articles",
  "word_books",
  "units",
  "words",
  "annotations",
  "article_notes",
  "settings",
];

// 插入按父表先行（articles → word_books → units → words → annotations/article_notes → settings），
// 删除按子表先行，即使 D1 外键约束开启也能保持引用完整性。
const INSERT_ORDER = KNOWN_TABLES;
const DELETE_ORDER = [
  "annotations",
  "article_notes",
  "words",
  "units",
  "word_books",
  "articles",
  "settings",
];

const COLUMN_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface WebdavTarget {
  base: string;
  fileUrl: string;
  auth: string;
}

async function getWebdavTarget(c: Context<{ Bindings: Env }>): Promise<WebdavTarget | null> {
  const config = await readWebdavConfig(c.env.DB, c.env.ENCRYPTION_KEY);
  if (!config) return null;
  const bytes = new TextEncoder().encode(`${config.username}:${config.password}`);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base = `${config.url.replace(/\/+$/, "")}/`;
  return {
    base,
    fileUrl: `${base}${BACKUP_DIR}/${BACKUP_FILE}`,
    auth: `Basic ${btoa(binary)}`,
  };
}

const WEBDAV_HEADERS: Record<string, string> = {
  "User-Agent": "SeventEnglish/1.0 (backup)",
  Accept: "*/*",
};

/** 确保备份目录存在（MKCOL 幂等创建，失败再 PROPFIND 探测），返回诊断信息 */
async function ensureBackupDir(target: WebdavTarget): Promise<{ ok: boolean; detail: string }> {
  const dirUrl = `${target.base}${BACKUP_DIR}/`;
  const mkcol = await fetch(dirUrl, {
    method: "MKCOL",
    headers: { ...WEBDAV_HEADERS, Authorization: target.auth },
    redirect: "manual",
  });
  if (mkcol.status === 201 || mkcol.status === 200 || mkcol.status === 405 || (mkcol.status >= 300 && mkcol.status < 400)) {
    return { ok: true, detail: `MKCOL ${mkcol.status}` };
  }
  const probe = await fetch(dirUrl, {
    method: "PROPFIND",
    headers: { ...WEBDAV_HEADERS, Authorization: target.auth, Depth: "0" },
    redirect: "manual",
  });
  if (probe.status === 207 || probe.status === 200 || (probe.status >= 300 && probe.status < 400)) {
    return { ok: true, detail: `MKCOL ${mkcol.status} → PROPFIND ${probe.status}` };
  }
  return { ok: false, detail: `MKCOL ${mkcol.status} ${mkcol.statusText}，PROPFIND ${probe.status} ${probe.statusText}` };
}

/** 备份：读取全库各表并上传 JSON 到 WebDAV */
export async function backupAll(c: Context<{ Bindings: Env }>): Promise<Response> {
  const target = await getWebdavTarget(c);
  if (!target) {
    return c.json({ error: "未配置 WebDAV，请到管理后台设置" }, 400);
  }

  const tables: Record<string, unknown[]> = {};
  for (const name of KNOWN_TABLES) {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${name}`).all();
    tables[name] = results;
  }

  const payload = {
    app: "sevent-english",
    version: 1,
    createdAt: new Date().toISOString(),
    tables,
  };

  const dir = await ensureBackupDir(target);
  if (!dir.ok) {
    return c.json({ error: `WebDAV 备份目录创建失败，请检查 WebDAV URL 是否正确（${dir.detail}）` }, 502);
  }

  const res = await fetch(target.fileUrl, {
    method: "PUT",
    headers: {
      Authorization: target.auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return c.json({ error: `WebDAV 上传失败（${res.status} ${res.statusText}）` }, 502);
  }

  return c.json({ data: { ok: true, createdAt: payload.createdAt } });
}

/** 恢复：从 WebDAV 拉取备份并清空导入本地（表名白名单 + 原子 batch） */
export async function restoreAll(c: Context<{ Bindings: Env }>): Promise<Response> {
  const target = await getWebdavTarget(c);
  if (!target) {
    return c.json({ error: "未配置 WebDAV，请到管理后台设置" }, 400);
  }

  const res = await fetch(target.fileUrl, { method: "GET", headers: { Authorization: target.auth } });
  if (!res.ok) {
    return c.json({ error: `WebDAV 下载失败（${res.status} ${res.statusText}）` }, 502);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return c.json({ error: "备份文件解析失败，不是有效的 JSON" }, 400);
  }
  if (!payload || typeof payload !== "object" || !("tables" in payload)) {
    return c.json({ error: "备份文件格式无效" }, 400);
  }

  const tables = (payload as { tables: Record<string, unknown> }).tables;
  const stmts: D1PreparedStatement[] = [];

  for (const name of DELETE_ORDER) {
    if (name in tables) stmts.push(c.env.DB.prepare(`DELETE FROM ${name}`));
  }
  for (const name of INSERT_ORDER) {
    const rows = tables[name];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const keys = Object.keys(record).filter((k) => COLUMN_NAME.test(k));
      if (keys.length === 0) continue;
      const cols = keys.join(", ");
      const placeholders = keys.map(() => "?").join(", ");
      const values = keys.map((k) => record[k]);
      stmts.push(c.env.DB.prepare(`INSERT INTO ${name} (${cols}) VALUES (${placeholders})`).bind(...values));
    }
  }

  if (stmts.length > 0) {
    // D1 batch 整体有 30 秒执行上限，数据量大时分批执行避免恢复超时整批回滚
    const BATCH_SIZE = 200;
    for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
      await c.env.DB.batch(stmts.slice(i, i + BATCH_SIZE));
    }
  }

  return c.json({ data: { ok: true } });
}
