ALTER TABLE email_campaigns ADD COLUMN current_revision_id TEXT;
ALTER TABLE email_campaigns ADD COLUMN audience_snapshot_id TEXT;
ALTER TABLE email_campaigns ADD COLUMN sender_ref TEXT;
ALTER TABLE email_campaigns ADD COLUMN from_address TEXT;
ALTER TABLE email_campaigns ADD COLUMN failure_reason TEXT;

CREATE TABLE email_campaign_recipient_jobs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  audience_snapshot_id TEXT,
  audience_member_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('campaign', 'test')),
  recipient_ref TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'submitting', 'accepted', 'delivered', 'delayed', 'bounced',
    'complained', 'suppressed', 'rejected', 'retry_wait', 'failed',
    'delivery_unknown', 'unresolved', 'cancelled', 'paused'
  )),
  request_json TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT NOT NULL,
  provider_reason TEXT,
  accepted_at TEXT,
  terminal_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (revision_id) REFERENCES email_campaign_revisions(id) ON DELETE RESTRICT,
  FOREIGN KEY (audience_snapshot_id) REFERENCES email_campaign_audience_snapshots(id) ON DELETE RESTRICT,
  FOREIGN KEY (audience_member_id) REFERENCES email_campaign_audience_members(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX idx_email_campaign_recipient_jobs_member
  ON email_campaign_recipient_jobs(campaign_id, audience_member_id)
  WHERE kind = 'campaign';

CREATE INDEX idx_email_campaign_recipient_jobs_due
  ON email_campaign_recipient_jobs(status, next_attempt_at, created_at);

CREATE INDEX idx_email_campaign_recipient_jobs_campaign
  ON email_campaign_recipient_jobs(campaign_id, status, created_at);

CREATE TABLE email_campaign_events (
  event_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  recipient_ref TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_type TEXT NOT NULL,
  reason TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operation_id) REFERENCES email_campaign_recipient_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE
);

CREATE INDEX idx_email_campaign_events_campaign
  ON email_campaign_events(campaign_id, occurred_at DESC);

CREATE TABLE email_campaign_transport_state (
  id TEXT PRIMARY KEY CHECK (id = 'managed'),
  sender_ref TEXT,
  from_address TEXT,
  sender_domain TEXT,
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
  unavailable_reason TEXT,
  event_cursor TEXT,
  last_checked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
