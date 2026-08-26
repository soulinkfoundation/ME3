CREATE TABLE email_campaign_assets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/gif')),
  size INTEGER NOT NULL CHECK (size > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, content_hash),
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE email_campaign_revision_assets (
  revision_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (revision_id, asset_id),
  FOREIGN KEY (revision_id) REFERENCES email_campaign_revisions(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES email_campaign_assets(id) ON DELETE RESTRICT
);

CREATE INDEX idx_email_campaign_assets_campaign
  ON email_campaign_assets(campaign_id, created_at DESC);

CREATE INDEX idx_email_campaign_assets_site_hash
  ON email_campaign_assets(site_id, content_hash);

CREATE INDEX idx_email_campaign_revision_assets_asset
  ON email_campaign_revision_assets(asset_id);
