-- Support read-only calendar subscriptions by encrypted iCalendar URL.

PRAGMA foreign_keys = OFF;

ALTER TABLE calendar_source_events RENAME TO calendar_source_events_old;
ALTER TABLE calendar_sources RENAME TO calendar_sources_old;

CREATE TABLE calendar_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  kind TEXT NOT NULL DEFAULT 'ics_upload' CHECK (kind IN ('ics_upload', 'ics_url')),
  name TEXT NOT NULL,
  original_filename TEXT,
  encrypted_source_url TEXT,
  source_url_hint TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  imported_event_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT,
  last_sync_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE TABLE calendar_source_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  external_uid TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE
);

INSERT INTO calendar_sources (
  id, user_id, kind, name, original_filename, encrypted_source_url,
  source_url_hint, status, imported_event_count, last_synced_at,
  last_sync_error, created_at, updated_at
)
SELECT
  id, user_id, kind, name, original_filename, NULL, NULL, status,
  imported_event_count, NULL, NULL, created_at, updated_at
FROM calendar_sources_old;

INSERT INTO calendar_source_events (
  id, source_id, external_key, external_uid, title, notes, location,
  starts_at, ends_at, timezone, all_day, created_at, updated_at
)
SELECT
  id, source_id, external_key, external_uid, title, notes, location,
  starts_at, ends_at, timezone, all_day, created_at, updated_at
FROM calendar_source_events_old;

DROP TABLE calendar_source_events_old;
DROP TABLE calendar_sources_old;

CREATE INDEX idx_calendar_source_events_window
  ON calendar_source_events(source_id, starts_at, ends_at);

CREATE INDEX idx_calendar_sources_url_refresh
  ON calendar_sources(kind, status, last_synced_at);

PRAGMA foreign_keys = ON;
