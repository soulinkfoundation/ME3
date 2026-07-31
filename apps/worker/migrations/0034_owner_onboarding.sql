CREATE TABLE owner_onboarding (
  user_id TEXT PRIMARY KEY,
  profile_source TEXT NOT NULL
    CHECK (profile_source IN ('hosted_starter')),
  profile_site_id TEXT NOT NULL,
  current_step INTEGER
    CHECK (current_step IS NULL OR current_step IN (2, 3)),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);
