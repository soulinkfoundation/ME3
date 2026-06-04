PRAGMA foreign_keys = off;

CREATE TABLE IF NOT EXISTS mission_context_sources_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('public_me_json', 'mission_statement', 'wheel_of_life', 'private_memory', 'core_table', 'plugin_table', 'daemon_directory', 'daemon_repo', 'provider', 'upload', 'url')),
  label TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'setup_required', 'paused', 'failed', 'archived')),
  source_ref TEXT,
  last_indexed_at TEXT,
  grants_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO mission_context_sources_next (
  id,
  user_id,
  source_kind,
  label,
  description,
  visibility,
  status,
  source_ref,
  last_indexed_at,
  grants_json,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  source_kind,
  label,
  description,
  visibility,
  status,
  source_ref,
  last_indexed_at,
  grants_json,
  metadata_json,
  created_at,
  updated_at
FROM mission_context_sources;

DROP TABLE mission_context_sources;
ALTER TABLE mission_context_sources_next RENAME TO mission_context_sources;

CREATE INDEX IF NOT EXISTS idx_mission_context_sources_user_status
  ON mission_context_sources(user_id, status, source_kind);

PRAGMA foreign_keys = on;
