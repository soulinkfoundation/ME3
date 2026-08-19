CREATE TABLE IF NOT EXISTS mobile_push_preferences (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  daily_briefing_enabled INTEGER NOT NULL DEFAULT 1,
  calendar_notifications_json TEXT NOT NULL DEFAULT '{"enabled":true,"categories":{"events":true,"bookings":true,"birthdays":true,"reminders":true,"tasks":true,"subscribed_calendars":true}}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar_push_dispatches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('events', 'bookings', 'birthdays', 'reminders', 'tasks', 'subscribed_calendars')
  ),
  item_id TEXT NOT NULL,
  occurrence_id TEXT NOT NULL,
  alert_offset_minutes INTEGER NOT NULL,
  alert_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, category, item_id, occurrence_id, alert_offset_minutes),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_push_dispatches_due
  ON calendar_push_dispatches(user_id, alert_at, status);
