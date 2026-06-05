CREATE TABLE IF NOT EXISTS scheduling_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  contact_id TEXT,
  time_type_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'candidates_shared',
      'review_required',
      'not_allowed',
      'voting',
      'pending_approval',
      'approved',
      'checkout_required',
      'finalized',
      'cancelled'
    )),
  requester_name TEXT,
  target_name TEXT,
  reason TEXT,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  candidate_slots_json TEXT NOT NULL DEFAULT '[]',
  selected_slot_json TEXT,
  policy_json TEXT,
  stream_payload_json TEXT,
  checkout_url TEXT,
  requester_approved_at TEXT,
  target_approved_at TEXT,
  finalized_calendar_event_id TEXT,
  finalized_booking_id TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduling_requests_user_status
  ON scheduling_requests(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS scheduling_request_votes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  participant_role TEXT NOT NULL CHECK (participant_role IN ('requester', 'target')),
  voter_label TEXT,
  slot_starts_at TEXT NOT NULL,
  slot_ends_at TEXT NOT NULL,
  preference TEXT NOT NULL DEFAULT 'yes' CHECK (preference IN ('yes', 'maybe', 'no')),
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES scheduling_requests(id) ON DELETE CASCADE,
  UNIQUE (request_id, participant_role, slot_starts_at, slot_ends_at)
);

CREATE INDEX IF NOT EXISTS idx_scheduling_request_votes_request
  ON scheduling_request_votes(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scheduling_request_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'owner',
  event_type TEXT NOT NULL CHECK (event_type IN (
    'request_created',
    'candidates_shared',
    'vote_recorded',
    'approval_recorded',
    'finalization_blocked',
    'checkout_handoff',
    'finalized'
  )),
  actor_role TEXT CHECK (actor_role IN ('system', 'assistant', 'requester', 'target', 'owner')),
  summary TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES scheduling_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduling_request_audit_request
  ON scheduling_request_audit(request_id, created_at DESC);
