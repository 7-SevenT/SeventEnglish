export type AnalysisStatus = "pending" | "processing" | "completed" | "failed" | "unconfigured";

// AI 文章分析队列消息体：由 analyze 路由入队，队列 consumer 消费后执行 AI 调用。
// 长任务必须走队列：worker 的 waitUntil 任务在响应返回后最多只能再跑 30 秒（平台限制），
// 而队列 consumer 的 wall time 上限为 15 分钟，足以容纳 AI 生成完整分析。
export type AnalyzeJob = { id: number; title: string; content: string };

export interface ArticleAnalysis {
  version: 1;
  summary?: string;
  paragraphs: ParagraphAnalysis[];
  writing_sentences: WritingSentence[];
}

export interface ParagraphAnalysis {
  index: number;
  original: string;
  translation: string;
  highlights: HighlightItem[];
  writing_sentences: WritingSentence[];
}

export interface HighlightItem {
  text: string;
  type: "word" | "phrase";
  meaning: string;
  usage: string;
  example?: string;
  ielts_category?: "reading" | "writing" | "speaking" | "general";
}

export interface WritingSentence {
  text: string;
  translation: string;
  usage: string;
  tags?: string[];
}

export interface Article {
  id: number;
  title: string;
  content: string;
  publish_date: string;
  analysis_status: AnalysisStatus;
  analysis_json: ArticleAnalysis | null;
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Annotation {
  id: number;
  article_id: number;
  from_position: number;
  to_position: number;
  selected_text: string;
  color: "yellow" | "green" | "blue" | "pink";
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleNote {
  id: number;
  article_id: number;
  content: string;
  updated_at: string;
}
export interface WordBook {
  id: number;
  name: string;
  description: string;
  created_at: string;
}
export interface Unit {
  id: number;
  book_id: number;
  name: string;
  sort_order: number;
  created_at: string;
}
export interface Word {
  id: number;
  unit_id: number;
  word: string;
  audio_key: string;   // 非空 = R2 key（音频词条）；空串 '' = TTS 词条
  definition: string;  // 释义（TTS 词条可带），可为空串
  sort_order: number;
}
export interface Setting {
  key: string;
  value: string | null;
  updated_at: string;
}

// db/schema.sql 的完整原文，内嵌以避免运行时额外读文件。
export const defaultSchema = `CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  publish_date    TEXT NOT NULL,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  analysis_json   TEXT,
  analysis_error  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS word_books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES word_books(id),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS words (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id     INTEGER NOT NULL REFERENCES units(id),
  word        TEXT NOT NULL,
  audio_key   TEXT NOT NULL,
  definition  TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id    INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  from_position INTEGER NOT NULL,
  to_position   INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  color         TEXT NOT NULL,
  comment       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_publish_date ON articles(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_units_book_id ON units(book_id);
CREATE INDEX IF NOT EXISTS idx_words_unit_id ON words(unit_id);
CREATE INDEX IF NOT EXISTS idx_annotations_article_id ON annotations(article_id);
CREATE INDEX IF NOT EXISTS idx_article_notes_article_id ON article_notes(article_id);
`;

export async function applySchema(db: D1Database): Promise<void> {
  // workerd 内置 D1 的 db.exec() 对多语句脚本或单条 CREATE TABLE 会抛
  // "incomplete input"（sqlite shell 风格解析限制），因此改用 prepare().run()
  // 逐条执行 DDL。schema 语句内不含内联分号，split(';') 后再 trim 安全。
  const statements = defaultSchema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }

  // 旧版本使用 start_offset/end_offset，按需求清空旧标记并重建表；
  // 文章、笔记等其他表不受影响。PRAGMA 在轻量测试 mock 中返回空结果，仍保持幂等。
  const annotationColumns = await db.prepare("PRAGMA table_info(annotations)").all<{ name: string }>();
  if (annotationColumns.results.some((column) => column.name === "start_offset" || column.name === "end_offset")) {
    await db.prepare("DROP TABLE IF EXISTS annotations").run();
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        from_position INTEGER NOT NULL,
        to_position INTEGER NOT NULL,
        selected_text TEXT NOT NULL,
        color TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_annotations_article_id ON annotations(article_id)").run();
  }

  // 兼容已有 D1 数据库：CREATE TABLE IF NOT EXISTS 不会为旧 articles 表补列。
  // 这些迁移可重复执行；字段已存在时忽略 SQLite 的 duplicate column 错误。
  const migrations = [
    "ALTER TABLE articles ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'pending'",
    "ALTER TABLE articles ADD COLUMN analysis_json TEXT",
    "ALTER TABLE articles ADD COLUMN analysis_error TEXT",
    // words.definition：文本导入（TTS 词条）的释义列；audio_key 语义扩展为"空串 = TTS 词条"，无需改列约束。
    "ALTER TABLE words ADD COLUMN definition TEXT NOT NULL DEFAULT ''",
  ];
  for (const migration of migrations) {
    try {
      await db.prepare(migration).run();
    } catch (error) {
      if (!/duplicate column name/i.test(String(error))) throw error;
    }
  }
}

export async function listArticlesGroupedByDate(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT publish_date,
              json_group_array(json_object('id', id, 'title', title, 'analysis_status', analysis_status)) AS articles
       FROM articles
       GROUP BY publish_date
       ORDER BY publish_date DESC`
    )
    .all<{ publish_date: string; articles: string }>();
  return results.map((r) => ({
    date: r.publish_date,
    articles: JSON.parse(r.articles) as { id: number; title: string }[],
  }));
}

export async function getArticle(db: D1Database, id: number) {
  const row = await db.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first<Article & { analysis_json: string | null }>();
  if (!row) return null;
  return {
    ...row,
    analysis_json: row.analysis_json ? JSON.parse(row.analysis_json) as ArticleAnalysis : null,
  };
}

export async function createArticle(
  db: D1Database,
  data: { title: string; content: string; publish_date: string }
) {
  await db
    .prepare("INSERT INTO articles (title, content, publish_date) VALUES (?, ?, ?)")
    .bind(data.title, data.content, data.publish_date)
    .run();
  return getArticle(db, Number(await lastRowId(db)));
}

async function lastRowId(db: D1Database) {
  const r = await db.prepare("SELECT last_insert_rowid() AS id").first<{ id: number }>();
  return r?.id;
}

export async function getArticleAnnotations(db: D1Database, articleId: number) {
  const { results } = await db
    .prepare("SELECT * FROM annotations WHERE article_id = ? ORDER BY from_position, id")
    .bind(articleId)
    .all<Annotation>();
  return results;
}

export type CreateAnnotationData = Pick<Annotation, "from_position" | "to_position" | "selected_text" | "color"> &
  Pick<Annotation, "comment">;
export type UpdateAnnotationData = Partial<CreateAnnotationData>;

export async function createAnnotation(
  db: D1Database,
  articleId: number,
  data: CreateAnnotationData
) {
  await db
    .prepare(
      "INSERT INTO annotations (article_id, from_position, to_position, selected_text, color, comment) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(articleId, data.from_position, data.to_position, data.selected_text, data.color, data.comment)
    .run();
  return db.prepare("SELECT * FROM annotations WHERE id = ?").bind(await lastRowId(db)).first<Annotation>();
}

export async function updateAnnotation(db: D1Database, id: number, data: UpdateAnnotationData) {
  const allowedFields = new Set(["from_position", "to_position", "selected_text", "color", "comment"]);
  const fields = Object.entries(data).filter(([field, value]) => allowedFields.has(field) && value !== undefined);
  if (fields.length === 0) {
    return db.prepare("SELECT * FROM annotations WHERE id = ?").bind(id).first<Annotation>();
  }
  const assignments = fields.map(([field]) => `${field} = ?`).join(", ");
  await db
    .prepare(`UPDATE annotations SET ${assignments}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...fields.map(([, value]) => value), id)
    .run();
  return db.prepare("SELECT * FROM annotations WHERE id = ?").bind(id).first<Annotation>();
}

export async function deleteAnnotation(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM annotations WHERE id = ?").bind(id).run();
}

export async function getArticleNote(db: D1Database, articleId: number) {
  return db.prepare("SELECT * FROM article_notes WHERE article_id = ?").bind(articleId).first<ArticleNote>();
}

export async function upsertArticleNote(db: D1Database, articleId: number, content: string) {
  await db
    .prepare(
      "INSERT INTO article_notes (article_id, content) VALUES (?, ?) ON CONFLICT(article_id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')"
    )
    .bind(articleId, content)
    .run();
  return getArticleNote(db, articleId);
}

export async function listWordBooks(db: D1Database) {
  const { results } = await db
    .prepare("SELECT * FROM word_books ORDER BY id")
    .all<WordBook>();
  return results;
}

export type WordBookOverview = WordBook & {
  unit_count: number;
  word_count: number;
};

export async function listWordBooksOverview(db: D1Database): Promise<WordBookOverview[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id, b.name, b.description, b.created_at,
              COUNT(DISTINCT u.id) AS unit_count,
              COUNT(w.id) AS word_count
       FROM word_books b
       LEFT JOIN units u ON u.book_id = b.id
       LEFT JOIN words w ON w.unit_id = u.id
       GROUP BY b.id
       ORDER BY b.id`
    )
    .all<WordBookOverview>();
  return results;
}

export async function listUnits(db: D1Database, bookId: number) {
  const { results } = await db
    .prepare("SELECT * FROM units WHERE book_id = ? ORDER BY sort_order, id")
    .bind(bookId)
    .all<Unit>();
  return results;
}

export async function listWords(db: D1Database, unitId: number) {
  const { results } = await db
    .prepare("SELECT * FROM words WHERE unit_id = ? ORDER BY sort_order, id")
    .bind(unitId)
    .all<Word>();
  return results;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, value)
    .run();
}
