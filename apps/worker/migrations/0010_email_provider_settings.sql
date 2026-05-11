CREATE TABLE IF NOT EXISTS email_provider_settings (
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  encrypted_secret TEXT,
  secret_hint TEXT,
  secret_updated_at TEXT,
  config_json TEXT,
  last_status TEXT CHECK (last_status IN ('not_configured', 'ready', 'failed')),
  last_status_checked_at TEXT,
  last_test_sent_at TEXT,
  last_test_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, provider_id),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_provider_settings_active
  ON email_provider_settings(user_id, is_active);

CREATE TABLE IF NOT EXISTS email_send_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mailbox_id TEXT,
  mailbox_message_id TEXT,
  provider_id TEXT NOT NULL,
  provider_message_id TEXT,
  provider_status TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  purpose TEXT NOT NULL DEFAULT 'test'
    CHECK (purpose IN ('test', 'draft', 'reply', 'workflow')),
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  thread_key TEXT,
  message_id_header TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  metadata_json TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL DEFAULT 'owner',
  approved_by_user_id TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (mailbox_id) REFERENCES mailbox_aliases(id) ON DELETE SET NULL,
  FOREIGN KEY (mailbox_message_id) REFERENCES mailbox_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_send_audit_user_created
  ON email_send_audit(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_audit_message
  ON email_send_audit(mailbox_message_id);

ALTER TABLE mailbox_messages ADD COLUMN provider_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mailbox_messages_provider_message
  ON mailbox_messages(provider_id, provider_message_id);
