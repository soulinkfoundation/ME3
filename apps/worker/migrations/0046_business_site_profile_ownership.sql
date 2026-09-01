ALTER TABLE sites
  ADD COLUMN profile_site_id TEXT REFERENCES sites(id) ON DELETE RESTRICT;

-- Existing Business Sites follow the installation's canonical profile. Legacy
-- installs without a profile remain readable, but new Business Sites require
-- an explicit profile association.
UPDATE sites AS business_site
SET profile_site_id = (
  SELECT profile.id
  FROM sites AS profile
  WHERE profile.user_id = business_site.user_id
    AND profile.site_role = 'profile'
  ORDER BY profile.created_at ASC, profile.id ASC
  LIMIT 1
)
WHERE business_site.site_role = 'organization'
  AND business_site.profile_site_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sites_profile_site
  ON sites(profile_site_id, created_at)
  WHERE profile_site_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS sites_profile_ownership_insert
BEFORE INSERT ON sites
WHEN (
    NEW.site_role = 'profile'
    AND NEW.profile_site_id IS NOT NULL
  ) OR (
    NEW.site_role = 'organization'
    AND (
      NEW.profile_site_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM sites AS profile
        WHERE profile.id = NEW.profile_site_id
          AND profile.user_id = NEW.user_id
          AND profile.site_role = 'profile'
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_PROFILE_OWNERSHIP');
END;

CREATE TRIGGER IF NOT EXISTS sites_profile_ownership_update
BEFORE UPDATE OF user_id, site_role, profile_site_id ON sites
WHEN (
    NEW.site_role = 'profile'
    AND NEW.profile_site_id IS NOT NULL
  ) OR (
    NEW.site_role = 'organization'
    AND (
      NEW.profile_site_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM sites AS profile
        WHERE profile.id = NEW.profile_site_id
          AND profile.user_id = NEW.user_id
          AND profile.site_role = 'profile'
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_PROFILE_OWNERSHIP');
END;
