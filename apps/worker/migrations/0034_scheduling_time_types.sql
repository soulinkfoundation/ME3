-- Agent-assisted scheduling: owner-defined time types and sharing policy.

CREATE TABLE IF NOT EXISTS scheduling_time_types (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  windows_json TEXT NOT NULL DEFAULT '{}',
  allowed_tiers_json TEXT NOT NULL DEFAULT '["close_contact"]',
  payment_mode TEXT NOT NULL DEFAULT 'free'
    CHECK (payment_mode IN ('free', 'paid_checkout', 'owner_review')),
  public_booking_offer_id TEXT,
  owner_pre_review TEXT NOT NULL DEFAULT 'unless_close_contact'
    CHECK (owner_pre_review IN ('always', 'unless_close_contact')),
  allow_close_contact_candidate_sharing INTEGER NOT NULL DEFAULT 1,
  final_approval TEXT NOT NULL DEFAULT 'both_owners'
    CHECK (final_approval IN ('both_owners')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduling_time_types_user_id
  ON scheduling_time_types(user_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduling_time_types_public_offer
  ON scheduling_time_types(user_id, public_booking_offer_id)
  WHERE public_booking_offer_id IS NOT NULL;
