-- Generalize agent channel audit tables for Soulink while keeping Telegram
-- columns for backward compatibility with existing Core installs.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS agent_channel_connections_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  channel TEXT NOT NULL DEFAULT 'soulink'
    CHECK (channel IN ('telegram', 'sandbox', 'soulink')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'disconnected')),
  setup_token TEXT NOT NULL UNIQUE,
  provider_connection_id TEXT,
  provider_user_id TEXT,
  provider_thread_id TEXT,
  provider_username TEXT,
  provider_metadata_json TEXT,
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  connected_at TEXT,
  disconnected_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  UNIQUE (user_id, channel)
);

INSERT OR IGNORE INTO agent_channel_connections_v2 (
  id, user_id, channel, status, setup_token,
  provider_connection_id, provider_user_id, provider_thread_id,
  provider_username, provider_metadata_json,
  telegram_user_id, telegram_chat_id, telegram_username, telegram_first_name,
  telegram_last_name, connected_at, disconnected_at, last_inbound_at,
  last_outbound_at, created_at, updated_at
)
SELECT
  id, user_id, channel, status, setup_token,
  NULL, NULL, NULL, NULL, NULL,
  telegram_user_id, telegram_chat_id, telegram_username, telegram_first_name,
  telegram_last_name, connected_at, disconnected_at, last_inbound_at,
  last_outbound_at, created_at, updated_at
FROM agent_channel_connections;

CREATE TABLE IF NOT EXISTS agent_channel_events_v2 (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'soulink'
    CHECK (channel IN ('telegram', 'sandbox', 'soulink')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  event_type TEXT NOT NULL CHECK (event_type IN ('start', 'message', 'link', 'send', 'error')),
  status TEXT NOT NULL CHECK (status IN ('received', 'pending', 'sent', 'failed', 'linked', 'skipped')),
  provider_event_id TEXT,
  provider_message_id TEXT,
  telegram_message_id TEXT,
  reply_to_message_id TEXT,
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  text_body TEXT,
  raw_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (connection_id) REFERENCES agent_channel_connections(id) ON DELETE CASCADE,
  UNIQUE (connection_id, provider_event_id)
);

INSERT OR IGNORE INTO agent_channel_events_v2 (
  id, connection_id, channel, direction, event_type, status,
  provider_event_id, provider_message_id,
  telegram_message_id, reply_to_message_id, telegram_user_id,
  telegram_chat_id, telegram_username, text_body, raw_json, error_message,
  created_at, updated_at
)
SELECT
  id, connection_id, channel, direction, event_type, status,
  NULL, NULL,
  telegram_message_id, reply_to_message_id, telegram_user_id,
  telegram_chat_id, telegram_username, text_body, raw_json, error_message,
  created_at, updated_at
FROM agent_channel_events;

DROP TABLE agent_channel_events;
DROP TABLE agent_channel_connections;

ALTER TABLE agent_channel_connections_v2 RENAME TO agent_channel_connections;
ALTER TABLE agent_channel_events_v2 RENAME TO agent_channel_events;

CREATE INDEX IF NOT EXISTS idx_agent_channel_connections_user_channel
  ON agent_channel_connections(user_id, channel);

CREATE INDEX IF NOT EXISTS idx_agent_channel_connections_provider_thread
  ON agent_channel_connections(channel, provider_thread_id);

CREATE INDEX IF NOT EXISTS idx_agent_channel_events_connection_created
  ON agent_channel_events(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_channel_events_provider_event
  ON agent_channel_events(connection_id, provider_event_id);

PRAGMA foreign_keys = ON;
