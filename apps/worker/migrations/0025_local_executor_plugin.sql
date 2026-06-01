-- Local Executor plugin-owned daemon pairing, project policy, run queue, and audit.

CREATE TABLE IF NOT EXISTS local_executor_pairings (
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

CREATE INDEX IF NOT EXISTS idx_local_executor_pairings_user_last_seen
  ON local_executor_pairings(user_id, last_seen_at);

CREATE TABLE IF NOT EXISTS local_executor_project_policies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  project_label TEXT NOT NULL,
  path_hint TEXT NOT NULL,
  resource_kind TEXT NOT NULL DEFAULT 'repo'
    CHECK (resource_kind IN ('repo', 'directory')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'revoked', 'missing')),
  provider_preset TEXT NOT NULL DEFAULT 'opencode'
    CHECK (provider_preset IN ('opencode', 'codex', 'claude')),
  model_hint TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  allowed_git_target TEXT NOT NULL DEFAULT 'none'
    CHECK (allowed_git_target IN ('none', 'branch', 'main')),
  landing_policy TEXT NOT NULL DEFAULT 'report_only'
    CHECK (landing_policy IN ('report_only', 'commit', 'push')),
  direct_main INTEGER NOT NULL DEFAULT 0,
  command_policy_json TEXT NOT NULL DEFAULT '{}',
  quality_gates_json TEXT NOT NULL DEFAULT '[]',
  caps_json TEXT NOT NULL DEFAULT '{}',
  dirty_repo TEXT NOT NULL DEFAULT 'block'
    CHECK (dirty_repo IN ('block', 'allow')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_executor_policies_user_status
  ON local_executor_project_policies(user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS local_executor_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  assistant_job_id TEXT,
  assistant_job_run_id TEXT,
  project_policy_id TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'schedule', 'event', 'assistant_job')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'waiting_for_approval', 'running', 'succeeded', 'failed', 'cancelled', 'denied')),
  provider TEXT NOT NULL DEFAULT 'opencode'
    CHECK (provider IN ('opencode', 'codex', 'claude')),
  runner_id TEXT,
  approval_id TEXT,
  mission_agent_run_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  result_summary TEXT,
  output_preview TEXT,
  artifact_manifest_json TEXT NOT NULL DEFAULT '[]',
  changed_files_json TEXT NOT NULL DEFAULT '[]',
  quality_gates_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_policy_id) REFERENCES local_executor_project_policies(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_local_executor_runs_user_status
  ON local_executor_runs(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_local_executor_runs_policy_status
  ON local_executor_runs(project_policy_id, status, created_at);

CREATE TABLE IF NOT EXISTS local_executor_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'core',
  message TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES local_executor_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_local_executor_run_events_run_created
  ON local_executor_run_events(run_id, created_at);

CREATE TABLE IF NOT EXISTS local_executor_audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  pairing_id TEXT,
  project_policy_id TEXT,
  run_id TEXT,
  approval_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'owner',
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pairing_id) REFERENCES local_executor_pairings(id) ON DELETE SET NULL,
  FOREIGN KEY (project_policy_id) REFERENCES local_executor_project_policies(id) ON DELETE SET NULL,
  FOREIGN KEY (run_id) REFERENCES local_executor_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_local_executor_audit_user_created
  ON local_executor_audit_events(user_id, created_at);
