-- Owner-managed Telegram bot settings for standalone Core installs.

CREATE TABLE IF NOT EXISTS telegram_settings (
  user_id TEXT PRIMARY KEY,
  bot_username TEXT,
  encrypted_bot_token TEXT,
  bot_token_hint TEXT,
  bot_token_updated_at TEXT,
  encrypted_webhook_secret TEXT,
  webhook_secret_hint TEXT,
  webhook_secret_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);
