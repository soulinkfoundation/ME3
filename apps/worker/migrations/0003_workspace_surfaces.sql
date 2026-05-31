CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  username TEXT NOT NULL UNIQUE,
  site_type TEXT NOT NULL DEFAULT 'profile'
    CHECK (site_type IN ('profile', 'landing_page')),
  template_id TEXT,
  custom_domain TEXT,
  custom_domain_status TEXT CHECK (custom_domain_status IN ('pending', 'active', 'failed')),
  custom_domain_cf_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_username ON sites(username);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  offer_id TEXT,
  booking_type TEXT CHECK (booking_type IN ('one_to_one', 'class', 'retreat')),
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  calendar_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT,
  payment_intent_id TEXT,
  amount_paid INTEGER,
  suggested_amount INTEGER,
  currency TEXT CHECK (currency IN ('usd', 'gbp', 'eur', 'cad', 'aud', 'chf', 'sgd', 'inr', 'pkr')),
  payment_status TEXT DEFAULT 'not_required'
    CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'not_required')),
  is_free_booking INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bookings_site_id ON bookings(site_id);
CREATE INDEX IF NOT EXISTS idx_bookings_starts_at ON bookings(starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE TABLE IF NOT EXISTS user_calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  title TEXT NOT NULL,
  notes TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'event' CHECK (kind IN ('event', 'birthday')),
  recurrence_rule TEXT CHECK (recurrence_rule IN ('yearly')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_calendar_events_user_window
  ON user_calendar_events(user_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS user_reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  title TEXT NOT NULL,
  notes TEXT,
  remind_at TEXT NOT NULL,
  timezone TEXT,
  recurrence_rule TEXT,
  context_type TEXT CHECK (context_type IN ('contact', 'booking')),
  context_id TEXT,
  context_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'dismissed', 'cancelled', 'failed')),
  delivered_at TEXT,
  dismissed_at TEXT,
  cancelled_at TEXT,
  error_message TEXT,
  source_dispatch_id TEXT,
  created_via TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_reminders_user_remind_at
  ON user_reminders(user_id, remind_at);

CREATE TABLE IF NOT EXISTS calendar_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  kind TEXT NOT NULL DEFAULT 'ics_upload' CHECK (kind IN ('ics_upload')),
  name TEXT NOT NULL,
  original_filename TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  imported_event_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar_source_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  external_uid TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_source_events_window
  ON calendar_source_events(source_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('booking', 'manual', 'agent', 'import', 'outreach', 'soulink')),
  source_ref TEXT,
  relationship TEXT NOT NULL DEFAULT 'contact'
    CHECK (relationship IN ('client', 'prospect', 'contact')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'dormant')),
  notes TEXT,
  tags TEXT,
  last_interaction_at TEXT,
  next_followup_at TEXT,
  outreach_status TEXT CHECK (
    outreach_status IN (
      'new',
      'drafted',
      'sent',
      'replied',
      'booked',
      'converted',
      'not_interested',
      'no_response'
    )
  ),
  social_handles TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_user_email ON contacts(user_id, email)
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_next_followup ON contacts(user_id, next_followup_at)
  WHERE next_followup_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS mailbox_aliases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE DEFAULT 'owner',
  alias_local_part TEXT NOT NULL UNIQUE,
  forwarding_email TEXT NOT NULL,
  forwarding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (forwarding_status IN ('pending', 'verified')),
  forwarding_enabled INTEGER NOT NULL DEFAULT 0,
  forwarding_mode TEXT NOT NULL DEFAULT 'me3_only'
    CHECK (forwarding_mode IN ('me3_only', 'forward')),
  status TEXT NOT NULL DEFAULT 'pending_setup'
    CHECK (status IN ('pending_setup', 'active', 'paused')),
  approval_policy TEXT NOT NULL DEFAULT 'all'
    CHECK (approval_policy IN ('all')),
  daily_inbound_limit INTEGER NOT NULL DEFAULT 200,
  daily_outbound_limit INTEGER NOT NULL DEFAULT 200,
  activated_at TEXT,
  cf_destination_id TEXT,
  cf_destination_verified_at TEXT,
  cf_rule_id TEXT,
  cf_last_synced_at TEXT,
  cf_last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mailbox_messages (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_kind TEXT NOT NULL CHECK (message_kind IN ('email', 'draft', 'system')),
  status TEXT NOT NULL CHECK (
    status IN (
      'received',
      'forwarded',
      'pending_approval',
      'approved',
      'rejected',
      'sent',
      'failed',
      'dropped'
    )
  ),
  thread_key TEXT,
  provider_message_id TEXT,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  raw_headers_json TEXT,
  raw_message TEXT,
  metadata_json TEXT,
  source_id TEXT,
  folder TEXT NOT NULL DEFAULT 'inbox'
    CHECK (folder IN ('inbox', 'drafts', 'sent', 'archive', 'trash')),
  read_at TEXT,
  agent_summary TEXT,
  agent_labels_json TEXT,
  forwarded_to TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  approved_by_user_id TEXT,
  received_at TEXT,
  approved_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES mailbox_aliases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mailbox_messages_mailbox_created
  ON mailbox_messages(mailbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_folder_created
  ON mailbox_messages(mailbox_id, folder, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_status ON mailbox_messages(status);

CREATE TABLE IF NOT EXISTS agent_channel_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'owner',
  channel TEXT NOT NULL DEFAULT 'telegram'
    CHECK (channel IN ('telegram', 'sandbox')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'disconnected')),
  setup_token TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  connected_at TEXT,
  disconnected_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE,
  UNIQUE (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_agent_channel_connections_user_channel
  ON agent_channel_connections(user_id, channel);

CREATE TABLE IF NOT EXISTS agent_channel_events (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'telegram'
    CHECK (channel IN ('telegram', 'sandbox')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  event_type TEXT NOT NULL CHECK (event_type IN ('start', 'message', 'link', 'send', 'error')),
  status TEXT NOT NULL CHECK (status IN ('received', 'pending', 'sent', 'failed', 'linked', 'skipped')),
  telegram_message_id TEXT,
  reply_to_message_id TEXT,
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  text_body TEXT,
  raw_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (connection_id) REFERENCES agent_channel_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_channel_events_connection_created
  ON agent_channel_events(connection_id, created_at DESC);
