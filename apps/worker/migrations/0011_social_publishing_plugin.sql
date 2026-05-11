-- Plugin-owned Social Publishing Core tables.
-- Curated from me3-app social publishing migrations for the ME3 Core package boundary.
-- Hosted-only OAuth providers, queue config, Cloudflare IDs, and YouTube/Google setup are intentionally absent.

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'linkedin', 'instagram', 'instagram_business')),
  platform_account_id TEXT NOT NULL,
  platform_handle TEXT,
  display_name TEXT,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  token_expires_at TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  metadata_json TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, platform, platform_account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_user_site
  ON social_accounts(user_id, site_id);

CREATE INDEX IF NOT EXISTS idx_social_accounts_site_platform
  ON social_accounts(site_id, platform);

CREATE TABLE IF NOT EXISTS social_packages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  post_slug TEXT NOT NULL,
  post_title_snapshot TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'partially_published', 'published', 'failed', 'archived')),
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'agent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, post_slug)
);

CREATE INDEX IF NOT EXISTS idx_social_packages_site_created
  ON social_packages(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_variants (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'linkedin', 'instagram', 'instagram_business')),
  format TEXT NOT NULL DEFAULT 'post',
  title TEXT,
  body_text TEXT NOT NULL,
  first_comment TEXT,
  hashtags_json TEXT NOT NULL DEFAULT '[]',
  asset_manifest_json TEXT NOT NULL DEFAULT '[]',
  source_excerpt TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'approved', 'rejected')),
  scheduled_for TEXT,
  timezone TEXT,
  published_variant_id TEXT,
  agent_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(package_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_variants_package
  ON social_variants(package_id);

CREATE INDEX IF NOT EXISTS idx_social_variants_schedule
  ON social_variants(approval_status, scheduled_for);

CREATE TABLE IF NOT EXISTS social_publications (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('x', 'linkedin', 'instagram', 'instagram_business')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'publishing', 'published', 'failed', 'cancelled')),
  platform_post_id TEXT,
  platform_post_url TEXT,
  error_code TEXT,
  error_message TEXT,
  provider_response_json TEXT,
  queued_at TEXT,
  published_at TEXT,
  last_polled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_social_publications_variant
  ON social_publications(variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_publications_status
  ON social_publications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS social_publication_events (
  id TEXT PRIMARY KEY,
  publication_id TEXT,
  variant_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('generated', 'approved', 'queued', 'publishing', 'published', 'failed', 'retried')),
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_social_publication_events_publication
  ON social_publication_events(publication_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_social_publication_events_variant
  ON social_publication_events(variant_id, created_at ASC);

CREATE TABLE IF NOT EXISTS content_bank_items (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  media_manifest_json TEXT NOT NULL DEFAULT '[]',
  platforms_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'original'
    CHECK (source_type IN ('original', 'blog_extract', 'imported', 'reworked')),
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'bank'
    CHECK (status IN ('bank', 'queued', 'scheduled', 'publishing', 'posted', 'failed', 'archived')),
  queue_position INTEGER,
  scheduled_for TEXT,
  timezone TEXT,
  created_by TEXT NOT NULL DEFAULT 'human'
    CHECK (created_by IN ('human', 'agent_suggested')),
  approved_by_human INTEGER NOT NULL DEFAULT 0,
  evergreen INTEGER NOT NULL DEFAULT 0,
  times_posted INTEGER NOT NULL DEFAULT 0,
  last_posted_at TEXT,
  cooldown_days INTEGER NOT NULL DEFAULT 30,
  tags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_bank_site_status
  ON content_bank_items(site_id, status);

CREATE INDEX IF NOT EXISTS idx_content_bank_queue
  ON content_bank_items(site_id, status, queue_position)
  WHERE status IN ('queued', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_content_bank_evergreen
  ON content_bank_items(site_id, evergreen, last_posted_at)
  WHERE evergreen = 1;

CREATE INDEX IF NOT EXISTS idx_content_bank_source
  ON content_bank_items(site_id, source_type);
