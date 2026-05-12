CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  source TEXT NOT NULL DEFAULT 'me3',
  subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TEXT,
  ip_hash TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_site_email
  ON subscribers(site_id, email);

CREATE INDEX IF NOT EXISTS idx_subscribers_site_id
  ON subscribers(site_id);

CREATE INDEX IF NOT EXISTS idx_subscribers_email
  ON subscribers(email);
