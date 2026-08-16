CREATE TABLE IF NOT EXISTS articles (
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
  book_id     INTEGER NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS words (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id     INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
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
