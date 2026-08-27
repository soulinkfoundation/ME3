CREATE TABLE site_branding (
  site_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  logo_ref TEXT,
  accent_color TEXT NOT NULL DEFAULT '#147d64',
  background_color TEXT NOT NULL DEFAULT '#f4f5f4',
  surface_color TEXT NOT NULL DEFAULT '#ffffff',
  text_color TEXT NOT NULL DEFAULT '#18201d',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
