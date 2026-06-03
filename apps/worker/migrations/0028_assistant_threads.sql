CREATE TABLE IF NOT EXISTS assistant_threads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  origin_surface TEXT NOT NULL DEFAULT 'assistant'
    CHECK (origin_surface IN ('assistant', 'launcher', 'soulink', 'job', 'system')),
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  pinned_at TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owner_profile(id),
  FOREIGN KEY (project_id) REFERENCES mission_projects(id) ON DELETE SET NULL
);

ALTER TABLE assistant_messages ADD COLUMN thread_id TEXT REFERENCES assistant_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_threads_owner_status_updated
  ON assistant_threads(owner_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_threads_owner_last_message
  ON assistant_threads(owner_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread_created
  ON assistant_messages(thread_id, created_at ASC);
