DROP INDEX IF EXISTS idx_social_publications_one_active_variant;
DROP INDEX IF EXISTS idx_social_publications_one_in_flight_variant;
DROP INDEX IF EXISTS idx_social_publications_same_time_scheduled;

CREATE TABLE social_publications_0023_new (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  platform TEXT NOT NULL
    CHECK (platform IN ('x', 'linkedin', 'instagram', 'instagram_business')),
  status TEXT NOT NULL
    CHECK (status IN ('scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_for TEXT,
  timezone TEXT,
  target_account_id_snapshot TEXT,
  format_snapshot TEXT
    CHECK (format_snapshot IS NULL OR format_snapshot IN ('post', 'carousel')),
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

-- Existing Publication payloads were not immutable. Preserve their delivery
-- history exactly, and take the best available content/account snapshot from a
-- canonical Version or the intact legacy content row. Active in-flight work
-- takes the current canonical approval so delivery can continue; completed
-- historical approval and request identity remain unknown.
INSERT INTO social_publications_0023_new (
  id,
  variant_id,
  site_id,
  platform,
  status,
  scheduled_for,
  timezone,
  target_account_id_snapshot,
  format_snapshot,
  body_text_snapshot,
  asset_manifest_json_snapshot,
  approval_status_snapshot,
  approved_at_snapshot,
  approved_by_user_id_snapshot,
  requested_by_type,
  requested_by_user_id,
  request_context_json,
  platform_post_id,
  platform_post_url,
  error_code,
  error_message,
  provider_response_json,
  queued_at,
  published_at,
  last_polled_at,
  created_at,
  updated_at
)
SELECT
  publication.id,
  publication.variant_id,
  publication.site_id,
  publication.platform,
  publication.status,
  NULL,
  NULL,
  version.target_account_id,
  COALESCE(version.format, CASE WHEN legacy_item.id IS NOT NULL THEN 'post' END),
  COALESCE(version.body_text, legacy_item.body),
  COALESCE(version.asset_manifest_json, legacy_item.media_manifest_json),
  CASE
    WHEN publication.status IN ('scheduled', 'queued', 'publishing')
      THEN version.approval_status
    ELSE NULL
  END,
  CASE
    WHEN publication.status IN ('scheduled', 'queued', 'publishing')
      THEN version.approved_at
    ELSE NULL
  END,
  CASE
    WHEN publication.status IN ('scheduled', 'queued', 'publishing')
      THEN version.approved_by_user_id
    ELSE NULL
  END,
  'migration',
  NULL,
  json_object(
    'migration', '0023_social_publications_reusable',
    'snapshotSource', CASE
      WHEN version.id IS NOT NULL THEN 'canonical_version'
      WHEN legacy_item.id IS NOT NULL THEN 'legacy_content_bank'
      ELSE 'unavailable'
    END
  ),
  publication.platform_post_id,
  publication.platform_post_url,
  publication.error_code,
  publication.error_message,
  publication.provider_response_json,
  publication.queued_at,
  publication.published_at,
  publication.last_polled_at,
  publication.created_at,
  publication.updated_at
FROM social_publications AS publication
LEFT JOIN social_variants AS version ON version.id = publication.variant_id
LEFT JOIN content_bank_items AS legacy_item ON legacy_item.id = publication.variant_id;

DROP TABLE social_publications;
ALTER TABLE social_publications_0023_new RENAME TO social_publications;

CREATE TABLE social_publication_events_0023_new (
  id TEXT PRIMARY KEY,
  publication_id TEXT,
  variant_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'generated',
      'approved',
      'scheduled',
      'queued',
      'publishing',
      'published',
      'failed',
      'retried',
      'cancelled'
    )
  ),
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO social_publication_events_0023_new (
  id, publication_id, variant_id, event_type, payload_json, created_at
)
SELECT id, publication_id, variant_id, event_type, payload_json, created_at
FROM social_publication_events;

DROP TABLE social_publication_events;
ALTER TABLE social_publication_events_0023_new RENAME TO social_publication_events;

-- A Version-level schedule becomes one deterministic Publication. Existing
-- scheduled or in-flight work wins, so the migration never creates parallel
-- delivery for a Version that is already active.
INSERT OR IGNORE INTO social_publications (
  id,
  variant_id,
  site_id,
  platform,
  status,
  scheduled_for,
  timezone,
  target_account_id_snapshot,
  format_snapshot,
  body_text_snapshot,
  asset_manifest_json_snapshot,
  approval_status_snapshot,
  approved_at_snapshot,
  approved_by_user_id_snapshot,
  requested_by_type,
  requested_by_user_id,
  request_context_json,
  created_at,
  updated_at
)
SELECT
  'social-publication-scheduled-' || lower(hex(CAST(version.id AS BLOB))) || '-' ||
    lower(hex(CAST(version.scheduled_for AS BLOB))),
  version.id,
  post.site_id,
  version.platform,
  'scheduled',
  version.scheduled_for,
  version.timezone,
  version.target_account_id,
  version.format,
  version.body_text,
  version.asset_manifest_json,
  version.approval_status,
  version.approved_at,
  version.approved_by_user_id,
  'migration',
  NULL,
  json_object(
    'migration', '0023_social_publications_reusable',
    'source', 'social_variants.scheduled_for'
  ),
  COALESCE(version.updated_at, version.created_at, datetime('now')),
  COALESCE(version.updated_at, version.created_at, datetime('now'))
FROM social_variants AS version
JOIN social_packages AS post ON post.id = version.package_id
WHERE version.platform = 'linkedin'
  AND version.approval_status = 'approved'
  AND version.scheduled_for IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM social_publications AS active
    WHERE active.variant_id = version.id
      AND active.status IN ('scheduled', 'queued', 'publishing')
  );

INSERT OR IGNORE INTO social_publication_events (
  id, publication_id, variant_id, event_type, payload_json, created_at
)
SELECT
  'social-event-scheduled-' || lower(hex(CAST(version.id AS BLOB))) || '-' ||
    lower(hex(CAST(version.scheduled_for AS BLOB))),
  publication.id,
  version.id,
  'scheduled',
  json_object(
    'migration', '0023_social_publications_reusable',
    'scheduledFor', publication.scheduled_for,
    'timezone', publication.timezone
  ),
  publication.created_at
FROM social_variants AS version
JOIN social_publications AS publication
  ON publication.id =
    'social-publication-scheduled-' || lower(hex(CAST(version.id AS BLOB))) || '-' ||
      lower(hex(CAST(version.scheduled_for AS BLOB)))
WHERE version.platform = 'linkedin'
  AND version.approval_status = 'approved'
  AND version.scheduled_for IS NOT NULL
  AND publication.status = 'scheduled'
  AND publication.variant_id = version.id
  AND publication.scheduled_for = version.scheduled_for;

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

CREATE INDEX idx_social_publication_events_publication
  ON social_publication_events(publication_id, created_at ASC);

CREATE INDEX idx_social_publication_events_variant
  ON social_publication_events(variant_id, created_at ASC);
