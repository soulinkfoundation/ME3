CREATE INDEX IF NOT EXISTS idx_mailbox_messages_mailbox_thread_activity
  ON mailbox_messages(
    mailbox_id,
    thread_key,
    COALESCE(sent_at, received_at, approved_at, created_at) DESC,
    id DESC
  );
