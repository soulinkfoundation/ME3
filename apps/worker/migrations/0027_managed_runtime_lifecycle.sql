-- Hosted-only lifecycle coordination for dedicated managed installations.
-- These records contain control metadata only and are excluded from portable exports.

CREATE TABLE managed_runtime_state (
  id TEXT PRIMARY KEY CHECK (id = 'managed'),
  installation_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'quiesced', 'suspended')),
  generation INTEGER NOT NULL DEFAULT 1,
  quiesced_at TEXT,
  suspended_at TEXT,
  credentials_revoked_at TEXT,
  storage_purged_at TEXT,
  last_request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE managed_runtime_control_requests (
  request_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('quiesce', 'suspend', 'resume', 'revoke_credentials', 'purge_storage')),
  expected_generation INTEGER NOT NULL CHECK (expected_generation >= 1),
  status TEXT NOT NULL DEFAULT 'applying'
    CHECK (status IN ('applying', 'applied')),
  applied_generation INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX idx_managed_runtime_control_requests_install_created
  ON managed_runtime_control_requests(installation_id, created_at DESC);

CREATE TABLE managed_runtime_write_leases (
  lease_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path_class TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_managed_runtime_write_leases_install_created
  ON managed_runtime_write_leases(installation_id, created_at);
