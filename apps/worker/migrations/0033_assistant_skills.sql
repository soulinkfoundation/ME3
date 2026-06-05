CREATE TABLE IF NOT EXISTS assistant_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  name TEXT NOT NULL,
  description TEXT,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('url', 'repo', 'upload', 'core', 'plugin')),
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'invalid', 'archived')),
  trust_level TEXT NOT NULL DEFAULT 'user'
    CHECK (trust_level IN ('core', 'plugin', 'user')),
  trigger_hints_json TEXT NOT NULL DEFAULT '[]',
  skill_md TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  validation_errors_json TEXT NOT NULL DEFAULT '[]',
  scripts_available INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assistant_skills_user_status
  ON assistant_skills(user_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_skills_user_source_ref
  ON assistant_skills(user_id, source_ref)
  WHERE source_ref IS NOT NULL AND status != 'archived';
