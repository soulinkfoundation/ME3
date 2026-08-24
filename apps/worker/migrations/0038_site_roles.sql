ALTER TABLE sites
  ADD COLUMN site_role TEXT
    CHECK (site_role IN ('profile', 'organization'));

-- Existing installations normally have one persistent profile site. If an
-- installation used the old four-site API envelope, preserve every row and
-- deterministically keep the oldest site as the profile.
UPDATE sites AS site
SET site_role = CASE
  WHEN site.id = (
    SELECT candidate.id
    FROM sites AS candidate
    WHERE candidate.user_id = site.user_id
      AND candidate.site_type = 'profile'
    ORDER BY candidate.created_at ASC, candidate.id ASC
    LIMIT 1
  ) THEN 'profile'
  ELSE 'organization'
END
WHERE site.site_type = 'profile'
  AND site.site_role IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_one_profile_per_owner
  ON sites(user_id)
  WHERE site_role = 'profile';

CREATE INDEX IF NOT EXISTS idx_sites_owner_role
  ON sites(user_id, site_role, created_at);

CREATE TRIGGER IF NOT EXISTS sites_role_required_insert
BEFORE INSERT ON sites
WHEN (NEW.site_type = 'profile' AND NEW.site_role IS NULL)
  OR (NEW.site_type = 'landing_page' AND NEW.site_role IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_ROLE_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS sites_role_required_update
BEFORE UPDATE OF site_type, site_role ON sites
WHEN (NEW.site_type = 'profile' AND NEW.site_role IS NULL)
  OR (NEW.site_type = 'landing_page' AND NEW.site_role IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_ROLE_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS sites_profile_limit_insert
BEFORE INSERT ON sites
WHEN NEW.site_role = 'profile'
  AND EXISTS (
    SELECT 1 FROM sites
    WHERE user_id = NEW.user_id AND site_role = 'profile'
  )
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_PROFILE_LIMIT');
END;

CREATE TRIGGER IF NOT EXISTS sites_profile_limit_update
BEFORE UPDATE OF user_id, site_role ON sites
WHEN NEW.site_role = 'profile'
  AND EXISTS (
    SELECT 1 FROM sites
    WHERE user_id = NEW.user_id
      AND site_role = 'profile'
      AND id <> OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_PROFILE_LIMIT');
END;

CREATE TRIGGER IF NOT EXISTS sites_organization_limit_insert
BEFORE INSERT ON sites
WHEN NEW.site_role = 'organization'
  AND (
    SELECT COUNT(*) FROM sites
    WHERE user_id = NEW.user_id AND site_role = 'organization'
  ) >= 3
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_ORGANIZATION_LIMIT');
END;

CREATE TRIGGER IF NOT EXISTS sites_organization_limit_update
BEFORE UPDATE OF user_id, site_role ON sites
WHEN NEW.site_role = 'organization'
  AND (
    SELECT COUNT(*) FROM sites
    WHERE user_id = NEW.user_id
      AND site_role = 'organization'
      AND id <> OLD.id
  ) >= 3
BEGIN
  SELECT RAISE(ABORT, 'ME3_SITE_ORGANIZATION_LIMIT');
END;
