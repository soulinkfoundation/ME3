PRAGMA defer_foreign_keys = ON;

-- D1 applies configured ON DELETE actions while rebuilding a parent table,
-- even when foreign-key validation is deferred. Preserve the two dependent
-- plugin tables explicitly and restore them after the Publication table is
-- back in place.
CREATE TABLE social_posting_plan_items_0031_backup AS
SELECT * FROM social_posting_plan_items;
CREATE TABLE social_media_delivery_grants_0031_backup AS
SELECT * FROM social_media_delivery_grants;

CREATE TABLE social_publications_0031_new (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  platform TEXT NOT NULL
    CHECK (platform IN ('x', 'linkedin', 'instagram', 'instagram_business', 'youtube', 'tiktok')),
  status TEXT NOT NULL
    CHECK (status IN ('scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_for TEXT,
  timezone TEXT,
  target_account_id_snapshot TEXT,
  format_snapshot TEXT
    CHECK (
      format_snapshot IS NULL
      OR format_snapshot IN ('post', 'image', 'carousel', 'short_video')
    ),
  body_text_snapshot TEXT,
  asset_manifest_json_snapshot TEXT,
  approval_status_snapshot TEXT
    CHECK (
      approval_status_snapshot IS NULL
      OR approval_status_snapshot IN ('draft', 'approved', 'rejected')
    ),
  approved_at_snapshot TEXT,
  approved_by_user_id_snapshot TEXT,
  requested_by_type TEXT
    CHECK (requested_by_type IS NULL OR requested_by_type IN ('owner', 'agent', 'migration')),
  requested_by_user_id TEXT,
  request_context_json TEXT NOT NULL DEFAULT '{}',
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
INSERT INTO social_publications_0031_new
SELECT * FROM social_publications;
DROP TABLE social_publications;
ALTER TABLE social_publications_0031_new RENAME TO social_publications;

CREATE INDEX idx_social_publications_status
  ON social_publications(status, scheduled_for, created_at DESC);
CREATE INDEX idx_social_publications_variant
  ON social_publications(variant_id, created_at DESC);
CREATE UNIQUE INDEX idx_social_publications_same_time_scheduled
  ON social_publications(variant_id, scheduled_for)
  WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;
CREATE UNIQUE INDEX idx_social_publications_one_in_flight_variant
  ON social_publications(variant_id)
  WHERE status IN ('queued', 'publishing');

DELETE FROM social_posting_plan_items;
DELETE FROM social_media_delivery_grants;
INSERT INTO social_posting_plan_items
SELECT * FROM social_posting_plan_items_0031_backup;
INSERT INTO social_media_delivery_grants
SELECT * FROM social_media_delivery_grants_0031_backup;

DROP TABLE social_posting_plan_items_0031_backup;
DROP TABLE social_media_delivery_grants_0031_backup;

PRAGMA defer_foreign_keys = OFF;
