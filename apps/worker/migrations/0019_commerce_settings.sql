-- Owner-managed commerce settings for direct Stripe Checkout.

CREATE TABLE IF NOT EXISTS commerce_settings (
  user_id TEXT PRIMARY KEY,
  encrypted_stripe_secret_key TEXT,
  stripe_key_hint TEXT,
  stripe_key_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);
