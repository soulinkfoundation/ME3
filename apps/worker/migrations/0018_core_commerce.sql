-- Core Commerce: direct Stripe Checkout support for paid bookings.

CREATE TABLE IF NOT EXISTS booking_holds (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  booking_id TEXT,
  offer_id TEXT,
  booking_type TEXT NOT NULL DEFAULT 'one_to_one'
    CHECK (booking_type IN ('one_to_one', 'class', 'retreat')),
  hold_token TEXT NOT NULL UNIQUE,
  slot_start TEXT NOT NULL,
  slot_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'confirmed', 'released', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_holds_site_id
  ON booking_holds(site_id);

CREATE INDEX IF NOT EXISTS idx_booking_holds_status
  ON booking_holds(status);

CREATE INDEX IF NOT EXISTS idx_booking_holds_slot_start
  ON booking_holds(slot_start);

CREATE INDEX IF NOT EXISTS idx_booking_holds_expires_at
  ON booking_holds(expires_at);

CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent
  ON bookings(payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status
  ON bookings(payment_status);
