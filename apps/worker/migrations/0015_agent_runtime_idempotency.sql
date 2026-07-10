CREATE TABLE IF NOT EXISTS agent_turn_results (
  user_id TEXT NOT NULL DEFAULT 'owner',
  request_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_turn_results_user_updated
  ON agent_turn_results(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_tool_executions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  request_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, request_id, tool_call_id),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_executions_request
  ON agent_tool_executions(user_id, request_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_reminders_agent_dispatch
  ON user_reminders(user_id, source_dispatch_id)
  WHERE source_dispatch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_tasks_agent_source
  ON mission_tasks(user_id, source_kind, source_ref)
  WHERE source_kind = 'agent' AND source_ref IS NOT NULL;

ALTER TABLE mailbox_messages ADD COLUMN agent_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailbox_drafts_agent_idempotency
  ON mailbox_messages(mailbox_id, agent_idempotency_key)
  WHERE message_kind = 'draft' AND agent_idempotency_key IS NOT NULL;
