CREATE TABLE IF NOT EXISTS assistant_message_assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  thread_id TEXT REFERENCES assistant_threads(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES assistant_messages(id) ON DELETE CASCADE,
  attachment_id TEXT REFERENCES assistant_attachments(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('generated_output', 'input_reference')),
  display_order INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owner_profile(id)
);
