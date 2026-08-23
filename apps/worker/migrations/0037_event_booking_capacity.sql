ALTER TABLE bookings
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);

ALTER TABLE booking_holds
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1);

CREATE INDEX IF NOT EXISTS idx_bookings_event_capacity
  ON bookings(site_id, booking_type, offer_id, starts_at, ends_at, status);

CREATE INDEX IF NOT EXISTS idx_booking_holds_event_capacity
  ON booking_holds(site_id, booking_type, offer_id, slot_start, slot_end, status, expires_at);
