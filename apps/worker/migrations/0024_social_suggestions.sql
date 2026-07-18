CREATE TABLE IF NOT EXISTS social_suggestions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('journal', 'mission_task', 'site', 'file', 'script', 'pasted')),
  source_ref TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_snapshot TEXT NOT NULL,
  source_text TEXT NOT NULL,
  suggestion_kind TEXT NOT NULL
    CHECK (suggestion_kind IN ('quote', 'short_post', 'thread', 'carousel_outline')),
  body_text TEXT NOT NULL,
  source_excerpt TEXT NOT NULL,
  quote_trimmed INTEGER NOT NULL DEFAULT 0 CHECK (quote_trimmed IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'choosing', 'chosen', 'discarded')),
  selected_post_id TEXT,
  choose_token TEXT,
  choosing_at TEXT,
  choose_platforms_json TEXT,
  created_by TEXT NOT NULL DEFAULT 'agent' CHECK (created_by IN ('user', 'agent')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'choosing' AND choose_token IS NOT NULL AND choosing_at IS NOT NULL
      AND choose_platforms_json IS NOT NULL)
    OR (status <> 'choosing' AND choose_token IS NULL AND choosing_at IS NULL)
  ),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_post_id) REFERENCES social_packages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_social_suggestions_site_status
  ON social_suggestions(site_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_suggestions_source
  ON social_suggestions(site_id, source_type, source_ref, created_at ASC);
