CREATE TABLE IF NOT EXISTS me3_install_claim_states (
  state TEXT PRIMARY KEY,
  redirect_path TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_me3_install_claim_states_expires_at
  ON me3_install_claim_states(expires_at);
