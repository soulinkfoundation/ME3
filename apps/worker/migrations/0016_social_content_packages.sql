ALTER TABLE social_packages ADD COLUMN source_type TEXT NOT NULL DEFAULT 'site';
ALTER TABLE social_packages ADD COLUMN source_ref TEXT;
ALTER TABLE social_packages ADD COLUMN source_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE social_packages ADD COLUMN idea_text TEXT NOT NULL DEFAULT '';

UPDATE social_packages
SET source_ref = COALESCE(source_ref, 'post:' || post_slug),
    source_snapshot = CASE
      WHEN source_snapshot = '' THEN post_title_snapshot
      ELSE source_snapshot
    END,
    idea_text = CASE
      WHEN idea_text = '' THEN post_title_snapshot
      ELSE idea_text
    END;

ALTER TABLE social_variants ADD COLUMN target_account_id TEXT;
ALTER TABLE social_variants ADD COLUMN approved_at TEXT;
ALTER TABLE social_variants ADD COLUMN approved_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_social_packages_source
  ON social_packages(site_id, source_type, source_ref);

CREATE INDEX IF NOT EXISTS idx_social_variants_target_account
  ON social_variants(target_account_id, approval_status, scheduled_for);
