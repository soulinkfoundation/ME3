-- Track bounded authentication/setup attempts without storing raw IPs or emails.

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  route TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_rate_limits_route_subject
  ON auth_rate_limits(route, subject_hash);

CREATE INDEX idx_auth_rate_limits_locked_until
  ON auth_rate_limits(locked_until);
