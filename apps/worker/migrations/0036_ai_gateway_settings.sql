CREATE TABLE IF NOT EXISTS ai_gateway_settings (
  user_id TEXT PRIMARY KEY DEFAULT 'owner',
  account_id TEXT,
  gateway_id TEXT,
  encrypted_api_token TEXT,
  api_token_hint TEXT,
  api_token_updated_at TEXT,
  route_workers_ai INTEGER NOT NULL DEFAULT 1,
  route_external_providers INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);
