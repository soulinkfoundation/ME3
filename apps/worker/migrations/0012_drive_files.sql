-- Runtime migrations may have already repaired older local installs before
-- Wrangler records this D1 migration, so keep this migration idempotent.
CREATE TABLE IF NOT EXISTS drive_folders (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'owner',
  parent_id TEXT REFERENCES drive_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trashed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  UNIQUE(owner_id, parent_id, name)
);

CREATE TABLE IF NOT EXISTS drive_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'owner',
  folder_id TEXT REFERENCES drive_folders(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  etag TEXT,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('uploading', 'ready', 'trashed', 'failed')),
  preview_kind TEXT NOT NULL DEFAULT 'download'
    CHECK (preview_kind IN ('image', 'pdf', 'text', 'markdown', 'csv', 'spreadsheet', 'download')),
  extracted_text TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  UNIQUE(owner_id, folder_id, filename)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_folders_root_name
  ON drive_folders(owner_id, name)
  WHERE parent_id IS NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_files_root_filename
  ON drive_files(owner_id, filename)
  WHERE folder_id IS NULL AND status = 'ready';

CREATE INDEX IF NOT EXISTS idx_drive_folders_owner_parent
  ON drive_folders(owner_id, parent_id, status, name);

CREATE INDEX IF NOT EXISTS idx_drive_folders_owner_path
  ON drive_folders(owner_id, path);

CREATE INDEX IF NOT EXISTS idx_drive_files_owner_folder
  ON drive_files(owner_id, folder_id, status, filename);

CREATE INDEX IF NOT EXISTS idx_drive_files_owner_updated
  ON drive_files(owner_id, updated_at DESC);
