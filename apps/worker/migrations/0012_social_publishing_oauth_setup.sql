-- Plugin-owned Social Publishing OAuth setup tables.
-- Stores owner-supplied provider app configuration and short-lived OAuth states.
-- No hosted ME3 Cloud routes, production Cloudflare IDs, Google, or YouTube setup are included.

CREATE TABLE IF NOT EXISTS social_provider_settings (
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL CHECK (provider_id IN ('x', 'linkedin', 'instagram', 'instagram_business')),
  client_id TEXT NOT NULL DEFAULT '',
  encrypted_client_secret TEXT,
  secret_hint TEXT,
  secret_updated_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider_id)
);

CREATE TABLE IF NOT EXISTS social_oauth_states (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'linkedin', 'instagram', 'instagram_business')),
  return_path TEXT NOT NULL DEFAULT '/social',
  code_verifier TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_social_oauth_states_state_platform
  ON social_oauth_states(state, platform);
