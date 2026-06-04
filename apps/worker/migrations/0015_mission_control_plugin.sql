CREATE TABLE IF NOT EXISTS mission_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  color TEXT,
  icon TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'daemon_repo', 'beads', 'import')),
  source_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_mission_projects_user_status
  ON mission_projects(user_id, status);

CREATE TABLE IF NOT EXISTS mission_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog', 'in_progress', 'review', 'done', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 3,
  due_at TEXT,
  scheduled_for TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'capture', 'agent', 'beads', 'daemon')),
  source_ref TEXT,
  approval_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  FOREIGN KEY (project_id) REFERENCES mission_projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mission_tasks_user_status
  ON mission_tasks(user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_project_status
  ON mission_tasks(project_id, status);

CREATE TABLE IF NOT EXISTS mission_approvals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  plugin_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  requested_by TEXT NOT NULL DEFAULT 'agent',
  resolved_by TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mission_approvals_user_status
  ON mission_approvals(user_id, status, requested_at);

CREATE TABLE IF NOT EXISTS mission_agent_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  source TEXT NOT NULL DEFAULT 'core'
    CHECK (source IN ('core', 'daemon', 'hosted_cloud', 'import')),
  project_id TEXT,
  task_id TEXT,
  approval_id TEXT,
  title TEXT NOT NULL,
  prompt_summary TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  model TEXT,
  runner_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  cost_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  artifact_manifest_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_agent_runs_user_status
  ON mission_agent_runs(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS mission_agent_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES mission_agent_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_agent_run_events_run_created
  ON mission_agent_run_events(run_id, created_at);

CREATE TABLE IF NOT EXISTS mission_plugin_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  plugin_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT,
  related_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_plugin_activity_user_created
  ON mission_plugin_activity(user_id, created_at);

CREATE TABLE IF NOT EXISTS mission_private_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  memory_kind TEXT NOT NULL
    CHECK (memory_kind IN ('owner_note', 'project_context', 'preference', 'relationship_note', 'correction', 'learning')),
  scope_kind TEXT NOT NULL DEFAULT 'owner'
    CHECK (scope_kind IN ('owner', 'project', 'contact', 'plugin')),
  scope_id TEXT,
  title TEXT,
  body TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'agent', 'import', 'daemon')),
  source_ref TEXT,
  review_status TEXT NOT NULL DEFAULT 'active'
    CHECK (review_status IN ('active', 'needs_review', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_private_memory_scope_status
  ON mission_private_memory(user_id, scope_kind, review_status);

CREATE TABLE IF NOT EXISTS mission_context_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('public_me_json', 'mission_statement', 'wheel_of_life', 'private_memory', 'core_table', 'plugin_table', 'daemon_directory', 'daemon_repo', 'provider', 'upload', 'url')),
  label TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'setup_required', 'paused', 'failed', 'archived')),
  source_ref TEXT,
  last_indexed_at TEXT,
  grants_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_context_sources_user_status
  ON mission_context_sources(user_id, status, source_kind);

CREATE TABLE IF NOT EXISTS mission_daemon_pairings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  runner_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  public_key TEXT,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'paused', 'revoked', 'unhealthy')),
  version TEXT,
  platform TEXT,
  last_seen_at TEXT,
  health_json TEXT NOT NULL DEFAULT '{}',
  paired_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, runner_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_daemon_pairings_user_last_seen
  ON mission_daemon_pairings(user_id, last_seen_at);

CREATE TABLE IF NOT EXISTS mission_daemon_allowlist_entries (
  id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL,
  label TEXT NOT NULL,
  path_hint TEXT NOT NULL,
  resource_kind TEXT NOT NULL CHECK (resource_kind IN ('directory', 'repo')),
  permission_tier TEXT NOT NULL DEFAULT 'metadata'
    CHECK (permission_tier IN ('metadata', 'read', 'write', 'shell')),
  shell_policy_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'revoked', 'missing')),
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pairing_id) REFERENCES mission_daemon_pairings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_daemon_allowlist_pairing_status
  ON mission_daemon_allowlist_entries(pairing_id, status);

CREATE TABLE IF NOT EXISTS mission_daemon_audit_events (
  id TEXT PRIMARY KEY,
  pairing_id TEXT,
  allowlist_entry_id TEXT,
  run_id TEXT,
  approval_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('pair_requested', 'paired', 'grant_added', 'grant_changed', 'grant_revoked', 'health_check', 'metadata_read', 'file_read', 'file_write', 'shell_run', 'denied', 'error')),
  actor TEXT NOT NULL DEFAULT 'owner',
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pairing_id) REFERENCES mission_daemon_pairings(id) ON DELETE SET NULL,
  FOREIGN KEY (allowlist_entry_id) REFERENCES mission_daemon_allowlist_entries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mission_daemon_audit_events_created
  ON mission_daemon_audit_events(created_at);

INSERT OR IGNORE INTO mission_projects (
  id,
  user_id,
  name,
  slug,
  description,
  color,
  icon,
  source_kind
)
VALUES (
  'mission-project-personal',
  'owner',
  'Personal',
  'personal',
  'Default Mission Control project.',
  'teal',
  'sparkles',
  'manual'
);
