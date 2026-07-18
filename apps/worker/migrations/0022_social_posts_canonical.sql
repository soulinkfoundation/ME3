ALTER TABLE social_packages ADD COLUMN source_text TEXT NOT NULL DEFAULT '';

-- Older rows used "original" for content whose human-authored Source cannot be
-- reconstructed. Keep those rows visible, but do not present them as pasted or
-- otherwise canonically source-backed.
UPDATE social_packages
SET source_type = 'legacy_content_bank_read_only'
WHERE source_type = 'original';

UPDATE social_packages
SET source_text = source_snapshot
WHERE source_text = '' AND source_snapshot <> '';

-- The legacy table remains intact. Stable IDs make this bridge safe to retry and
-- give compatibility code a deterministic old-item -> Post mapping.
INSERT OR IGNORE INTO social_packages (
  id,
  site_id,
  post_slug,
  post_title_snapshot,
  source_hash,
  goal,
  status,
  created_by,
  created_at,
  updated_at,
  source_type,
  source_ref,
  source_snapshot,
  source_text,
  idea_text
)
SELECT
  'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB))),
  item.site_id,
  '_legacy-content-bank-' || lower(hex(CAST(item.id AS BLOB))),
  substr(item.body, 1, 120),
  'legacy-content-bank-' || lower(hex(CAST(item.id AS BLOB))),
  NULL,
  CASE item.status
    WHEN 'bank' THEN 'draft'
    WHEN 'posted' THEN 'published'
    WHEN 'failed' THEN 'failed'
    WHEN 'archived' THEN 'archived'
    ELSE 'ready'
  END,
  CASE item.created_by WHEN 'agent_suggested' THEN 'agent' ELSE 'user' END,
  item.created_at,
  item.updated_at,
  'legacy_content_bank_read_only',
  'content-bank:' || item.id,
  item.body,
  item.body,
  item.body
FROM content_bank_items AS item;

-- JSON platform values are normalized exactly as the legacy service normalized
-- them. DISTINCT collapses duplicate/case-variant entries into one Version.
INSERT OR IGNORE INTO social_variants (
  id,
  package_id,
  platform,
  format,
  title,
  body_text,
  first_comment,
  hashtags_json,
  asset_manifest_json,
  source_excerpt,
  approval_status,
  scheduled_for,
  timezone,
  published_variant_id,
  agent_notes,
  created_at,
  updated_at,
  target_account_id,
  approved_at,
  approved_by_user_id
)
SELECT DISTINCT
  'social-variant-legacy-' || lower(hex(CAST(item.id AS BLOB))) || '-' ||
    lower(trim(CAST(platform.value AS TEXT))),
  'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB))),
  lower(trim(CAST(platform.value AS TEXT))),
  'post',
  NULL,
  item.body,
  NULL,
  '[]',
  item.media_manifest_json,
  NULL,
  CASE WHEN item.approved_by_human = 1 THEN 'approved' ELSE 'draft' END,
  CASE
    WHEN lower(trim(CAST(platform.value AS TEXT))) = 'linkedin'
      THEN item.scheduled_for
    ELSE NULL
  END,
  CASE
    WHEN lower(trim(CAST(platform.value AS TEXT))) = 'linkedin'
      THEN item.timezone
    ELSE NULL
  END,
  NULL,
  item.notes,
  item.created_at,
  item.updated_at,
  NULL,
  NULL,
  CASE WHEN item.approved_by_human = 1 THEN item.user_id ELSE NULL END
FROM content_bank_items AS item
JOIN json_each(
  CASE
    WHEN json_valid(item.platforms_json) AND json_type(item.platforms_json) = 'array'
      THEN item.platforms_json
    ELSE '[]'
  END
) AS platform
WHERE platform.type = 'text'
  AND lower(trim(CAST(platform.value AS TEXT))) IN (
    'x',
    'linkedin',
    'instagram',
    'instagram_business'
  );

-- Published history is reusable history, not an in-flight idempotency conflict.
-- Narrowing the old guard allows every historical Publication to move to its
-- platform Version while retaining one queued/publishing operation at a time.
DROP INDEX IF EXISTS idx_social_publications_one_active_variant;

UPDATE social_publications
SET variant_id = (
  SELECT version.id
  FROM content_bank_items AS item
  JOIN social_variants AS version
    ON version.package_id =
      'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB)))
   AND version.platform = lower(trim(social_publications.platform))
  WHERE item.id = social_publications.variant_id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM content_bank_items AS item
  JOIN social_variants AS version
    ON version.package_id =
      'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB)))
   AND version.platform = lower(trim(social_publications.platform))
  WHERE item.id = social_publications.variant_id
);

-- Publication-linked events inherit the now-canonical Version from their
-- Publication. Event and Publication IDs, payloads, and timestamps do not move.
UPDATE social_publication_events
SET variant_id = (
  SELECT publication.variant_id
  FROM social_publications AS publication
  JOIN social_variants AS version ON version.id = publication.variant_id
  JOIN content_bank_items AS item
    ON version.package_id =
      'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB)))
  WHERE publication.id = social_publication_events.publication_id
    AND item.id = social_publication_events.variant_id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM social_publications AS publication
  JOIN social_variants AS version ON version.id = publication.variant_id
  JOIN content_bank_items AS item
    ON version.package_id =
      'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB)))
  WHERE publication.id = social_publication_events.publication_id
    AND item.id = social_publication_events.variant_id
);

-- Older generated/approved events can have no Publication. Reparent only when
-- their payload names a valid platform Version; otherwise leave the legacy link.
UPDATE social_publication_events
SET variant_id = (
  SELECT version.id
  FROM content_bank_items AS item
  JOIN social_variants AS version
    ON version.package_id =
      'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB)))
   AND version.platform = lower(trim(CAST(json_extract(
     CASE
       WHEN json_valid(social_publication_events.payload_json)
         THEN social_publication_events.payload_json
       ELSE '{}'
     END,
     '$.platform'
   ) AS TEXT)))
  WHERE item.id = social_publication_events.variant_id
  LIMIT 1
)
WHERE (
    social_publication_events.publication_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM social_publications AS publication
      WHERE publication.id = social_publication_events.publication_id
    )
  )
  AND EXISTS (
    SELECT 1
    FROM content_bank_items AS item
    JOIN social_variants AS version
      ON version.package_id =
        'social-post-legacy-' || lower(hex(CAST(item.id AS BLOB)))
     AND version.platform = lower(trim(CAST(json_extract(
       CASE
         WHEN json_valid(social_publication_events.payload_json)
           THEN social_publication_events.payload_json
         ELSE '{}'
       END,
       '$.platform'
     ) AS TEXT)))
    WHERE item.id = social_publication_events.variant_id
  );

UPDATE social_variants
SET published_variant_id = (
  SELECT publication.id
  FROM social_publications AS publication
  WHERE publication.variant_id = social_variants.id
    AND publication.status = 'published'
  ORDER BY
    COALESCE(publication.published_at, publication.updated_at, publication.created_at) DESC,
    publication.id DESC
  LIMIT 1
)
WHERE social_variants.id LIKE 'social-variant-legacy-%'
  AND EXISTS (
    SELECT 1
    FROM social_publications AS publication
    WHERE publication.variant_id = social_variants.id
      AND publication.status = 'published'
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_publications_one_active_variant
  ON social_publications(variant_id)
  WHERE variant_id LIKE 'social-variant-%'
    AND status IN ('queued', 'publishing');
