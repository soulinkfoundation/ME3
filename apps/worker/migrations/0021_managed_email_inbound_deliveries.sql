CREATE TABLE IF NOT EXISTS managed_email_inbound_deliveries (
  delivery_id TEXT PRIMARY KEY,
  managed_installation_id TEXT NOT NULL,
  core_install_id TEXT NOT NULL,
  mailbox_id TEXT NOT NULL,
  mailbox_message_id TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES mailbox_aliases(id) ON DELETE CASCADE,
  FOREIGN KEY (mailbox_message_id) REFERENCES mailbox_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_managed_email_inbound_install_received
  ON managed_email_inbound_deliveries(managed_installation_id, received_at DESC);
