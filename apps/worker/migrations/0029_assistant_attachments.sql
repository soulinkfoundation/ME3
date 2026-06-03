CREATE TABLE IF NOT EXISTS assistant_attachments (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  thread_id TEXT REFERENCES assistant_threads(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'error', 'deleted')),
  storage_key TEXT,
  extracted_text TEXT,
  text_truncated INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owner_profile(id)
);

CREATE INDEX IF NOT EXISTS idx_assistant_attachments_owner_created
  ON assistant_attachments(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_attachments_thread_created
  ON assistant_attachments(thread_id, created_at DESC);
