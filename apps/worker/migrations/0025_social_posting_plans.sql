ALTER TABLE social_packages ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE social_posting_preferences (
  account_id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL,
  preferred_times_json TEXT NOT NULL DEFAULT '[]',
  minimum_gap_minutes INTEGER NOT NULL DEFAULT 120
    CHECK (minimum_gap_minutes BETWEEN 0 AND 10080),
  minimum_repost_days INTEGER
    CHECK (minimum_repost_days IS NULL OR minimum_repost_days BETWEEN 0 AND 3650),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
);

CREATE TABLE social_posting_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'confirming', 'needs_attention', 'confirmed', 'expired')),
  request_json TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  confirmation_token TEXT,
  confirmation_started_at TEXT,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'confirming' AND confirmation_token IS NOT NULL AND confirmation_started_at IS NOT NULL)
    OR (status <> 'confirming' AND confirmation_token IS NULL AND confirmation_started_at IS NULL)
  ),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
);

CREATE TABLE social_posting_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  variant_id TEXT NOT NULL,
  version_updated_at_snapshot TEXT NOT NULL,
  approval_status_snapshot TEXT NOT NULL CHECK (approval_status_snapshot = 'approved'),
  version_fingerprint TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  timezone TEXT NOT NULL,
  is_repost INTEGER NOT NULL DEFAULT 0 CHECK (is_repost IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'reserved', 'scheduled', 'blocked')),
  publication_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (plan_id, position),
  UNIQUE (plan_id, variant_id),
  FOREIGN KEY (plan_id) REFERENCES social_posting_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES social_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES social_publications(id) ON DELETE SET NULL
);

CREATE TABLE social_posting_reservations (
  id TEXT PRIMARY KEY,
  plan_item_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'fulfilled', 'released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_item_id) REFERENCES social_posting_plan_items(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_social_posting_plans_owner_status
  ON social_posting_plans(user_id, status, created_at DESC);

CREATE INDEX idx_social_posting_plan_items_plan
  ON social_posting_plan_items(plan_id, position ASC);

CREATE INDEX idx_social_posting_reservations_account_time
  ON social_posting_reservations(account_id, status, range_start, range_end);
