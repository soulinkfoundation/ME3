-- Core booking reminder queue state.

CREATE TABLE IF NOT EXISTS booking_reminders (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'owner',
  reminder_type TEXT NOT NULL
    CHECK (reminder_type IN ('booking_reminder_24h', 'booking_reminder_2h')),
  channel TEXT NOT NULL
    CHECK (channel IN ('email', 'telegram', 'soulink')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'queued', 'processing', 'sent', 'cancelled', 'failed', 'skipped')),
  scheduled_for TEXT NOT NULL,
  queued_at TEXT,
  sent_at TEXT,
  cancelled_at TEXT,
  failed_at TEXT,
  dead_lettered_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_reminders_unique_delivery
  ON booking_reminders(booking_id, reminder_type, channel);

CREATE INDEX IF NOT EXISTS idx_booking_reminders_booking_id
  ON booking_reminders(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_reminders_site_status
  ON booking_reminders(site_id, status);

CREATE INDEX IF NOT EXISTS idx_booking_reminders_due
  ON booking_reminders(status, scheduled_for);
