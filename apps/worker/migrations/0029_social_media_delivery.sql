-- Durable multipart upload sessions keep large video bytes out of Worker memory.
CREATE TABLE IF NOT EXISTS drive_multipart_uploads (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  r2_upload_id TEXT NOT NULL,
  part_size INTEGER NOT NULL,
  total_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'completed', 'aborted', 'failed')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES drive_files(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS drive_multipart_parts (
  upload_id TEXT NOT NULL,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (upload_id, part_number),
  FOREIGN KEY (upload_id) REFERENCES drive_multipart_uploads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_drive_multipart_uploads_owner_status
  ON drive_multipart_uploads(owner_id, status, updated_at DESC);

-- Provider delivery grants expose one private Files object through an opaque,
-- short-lived URL without making the R2 bucket public.
CREATE TABLE IF NOT EXISTS social_media_delivery_grants (
  id TEXT PRIMARY KEY,
  publication_id TEXT,
  file_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES social_publications(id) ON DELETE SET NULL,
  FOREIGN KEY (file_id) REFERENCES drive_files(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_social_media_delivery_grants_lookup
  ON social_media_delivery_grants(token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_media_delivery_grants_publication
  ON social_media_delivery_grants(publication_id, file_id, provider);
