CREATE TABLE IF NOT EXISTS site_files (
  site_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content BLOB NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, path),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_files_site_path
  ON site_files(site_id, path);
