-- Journal plugin-owned private writing entries.

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  entry_date TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  body_format TEXT NOT NULL DEFAULT 'plain_text'
    CHECK (body_format IN ('plain_text', 'markdown', 'html')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  UNIQUE(user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date
  ON journal_entries(user_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_updated
  ON journal_entries(user_id, updated_at);
