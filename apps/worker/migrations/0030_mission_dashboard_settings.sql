CREATE TABLE IF NOT EXISTS mission_dashboard_settings (
  user_id TEXT PRIMARY KEY DEFAULT 'owner',
  cards_json TEXT NOT NULL DEFAULT '[]',
  quick_links_json TEXT NOT NULL DEFAULT '[]',
  settings_json TEXT NOT NULL DEFAULT '{}',
  mission_statement TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
