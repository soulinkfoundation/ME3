ALTER TABLE subscribers
  ADD COLUMN marketing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (marketing_status IN ('pending', 'marketable'));

ALTER TABLE subscribers
  ADD COLUMN marketing_permission_method TEXT
    CHECK (
      marketing_permission_method IS NULL
      OR marketing_permission_method IN ('single_opt_in', 'double_opt_in', 'import_attested')
    );

ALTER TABLE subscribers
  ADD COLUMN marketing_permission_granted_at TEXT;

ALTER TABLE subscribers
  ADD COLUMN marketing_permission_evidence_json TEXT;

ALTER TABLE subscribers
  ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'deliverable'
    CHECK (delivery_status IN ('deliverable', 'bounced', 'complained', 'suppressed'));

ALTER TABLE subscribers
  ADD COLUMN delivery_status_changed_at TEXT;

-- Existing ME3 forms were explicit newsletter subscription forms. Preserve
-- those as single opt-in. A recognized Substack audience is also usable, while
-- generic imports and manually entered addresses wait for one owner attestation.
UPDATE subscribers
SET marketing_status = CASE
      WHEN source IN ('me3', 'substack_import') THEN 'marketable'
      ELSE 'pending'
    END,
    marketing_permission_method = CASE
      WHEN source = 'me3' THEN 'single_opt_in'
      WHEN source = 'substack_import' THEN 'import_attested'
      ELSE NULL
    END,
    marketing_permission_granted_at = CASE
      WHEN source IN ('me3', 'substack_import') THEN subscribed_at
      ELSE NULL
    END,
    marketing_permission_evidence_json = CASE
      WHEN source = 'me3'
        THEN '{"version":1,"kind":"site_form","source":"legacy_me3_signup"}'
      WHEN source = 'substack_import'
        THEN '{"version":1,"kind":"legacy_import","source":"substack_import"}'
      ELSE NULL
    END
WHERE marketing_permission_method IS NULL
  AND marketing_permission_granted_at IS NULL
  AND marketing_permission_evidence_json IS NULL;

CREATE TABLE email_campaigns (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled campaign',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_for TEXT,
  sent_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE email_campaign_revisions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  subject TEXT NOT NULL DEFAULT '',
  preview_text TEXT NOT NULL DEFAULT '',
  reply_to_address TEXT,
  document_version TEXT NOT NULL DEFAULT 'me3.campaign-document.v1',
  document_json TEXT NOT NULL DEFAULT '{"version":"me3.campaign-document.v1","blocks":[]}',
  renderer_version TEXT,
  rendered_html TEXT,
  rendered_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, revision_number),
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE
);

CREATE TABLE email_campaign_audience_snapshots (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  eligible_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  excluded_count INTEGER NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  exclusion_counts_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (revision_id) REFERENCES email_campaign_revisions(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE email_campaign_audience_members (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  subscriber_id INTEGER,
  normalized_email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  permission_method TEXT NOT NULL
    CHECK (permission_method IN ('single_opt_in', 'double_opt_in', 'import_attested')),
  permission_granted_at TEXT NOT NULL,
  permission_evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (snapshot_id, normalized_email),
  FOREIGN KEY (snapshot_id) REFERENCES email_campaign_audience_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE SET NULL
);

CREATE INDEX idx_email_campaigns_site_updated
  ON email_campaigns(site_id, updated_at DESC);

CREATE INDEX idx_email_campaigns_status_schedule
  ON email_campaigns(status, scheduled_for);

CREATE INDEX idx_email_campaign_revisions_campaign
  ON email_campaign_revisions(campaign_id, revision_number DESC);

CREATE INDEX idx_email_campaign_audience_snapshots_campaign
  ON email_campaign_audience_snapshots(campaign_id, created_at DESC);

CREATE INDEX idx_email_campaign_audience_members_snapshot
  ON email_campaign_audience_members(snapshot_id);

CREATE INDEX idx_subscribers_campaign_eligibility
  ON subscribers(site_id, marketing_status, delivery_status, unsubscribed_at);
