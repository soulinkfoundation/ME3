export interface Env {
  DB: D1Database;
  ME3_USER_AGENT?: DurableObjectNamespace;
  AI?: Ai;

  ENVIRONMENT: string;
  CORE_WEB_ORIGIN: string;
  CORE_API_ORIGIN: string;

  JWT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ADMIN_BOOTSTRAP_CODE?: string;

  ME3_AI_DEFAULT_PROVIDER?: string;
  ME3_AI_DEFAULT_MODEL?: string;
  ME3_AI_CHAT_PROVIDER?: string;
  ME3_AI_CHAT_MODEL?: string;
  ME3_AI_REASONING_PROVIDER?: string;
  ME3_AI_REASONING_MODEL?: string;
  ME3_AI_EXTRACTION_PROVIDER?: string;
  ME3_AI_EXTRACTION_MODEL?: string;
  TELEGRAM_BOT_USERNAME?: string;

  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

export interface OwnerProfile {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  timezone: string | null;
}

export interface DbSite {
  id: string;
  user_id: string;
  username: string;
  site_type: "profile" | "landing_page";
  template_id: string | null;
  custom_domain: string | null;
  custom_domain_status: "pending" | "active" | "failed" | null;
  custom_domain_cf_id: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface DbBooking {
  id: string;
  site_id: string;
  offer_id: string | null;
  booking_type: "one_to_one" | "class" | "retreat" | null;
  guest_name: string;
  guest_email: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  calendar_event_id: string | null;
  status: "confirmed" | "cancelled";
  notes: string | null;
  created_at: string;
  cancelled_at: string | null;
  payment_intent_id: string | null;
  amount_paid: number | null;
  suggested_amount: number | null;
  currency: "usd" | "gbp" | "eur" | "cad" | "aud" | "chf" | "sgd" | "inr" | "pkr" | null;
  payment_status: "pending" | "succeeded" | "failed" | "not_required" | null;
  is_free_booking: number;
  paid_at: string | null;
}

export interface DbUserReminder {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  timezone: string | null;
  recurrence_rule: string | null;
  context_type: "contact" | "booking" | null;
  context_id: string | null;
  context_label: string | null;
  status: "pending" | "delivered" | "dismissed" | "cancelled" | "failed";
  delivered_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface DbUserCalendarEvent {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  all_day: number;
  kind: "event" | "birthday";
  recurrence_rule: string | null;
  created_at: string;
}

export interface DbCalendarSource {
  id: string;
  user_id: string;
  kind: "ics_upload";
  name: string;
  original_filename: string | null;
  imported_event_count: number;
  created_at: string;
}

export interface DbCalendarSourceEvent {
  id: string;
  source_id: string;
  external_key: string;
  external_uid: string | null;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  all_day: number;
  created_at: string;
}

export interface DbContact {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: "booking" | "manual" | "agent" | "import" | "outreach" | "soulink";
  source_ref: string | null;
  relationship: "client" | "prospect" | "contact";
  status: "active" | "archived" | "dormant";
  notes: string | null;
  tags: string | null;
  last_interaction_at: string | null;
  next_followup_at: string | null;
  outreach_status:
    | "new"
    | "drafted"
    | "sent"
    | "replied"
    | "booked"
    | "converted"
    | "not_interested"
    | "no_response"
    | null;
  social_handles: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  booking_count?: number | null;
  last_booking_at?: string | null;
}

export interface DbMailboxAlias {
  id: string;
  user_id: string;
  alias_local_part: string;
  forwarding_email: string;
  forwarding_status: "pending" | "verified";
  forwarding_enabled: number;
  forwarding_mode: "me3_only" | "forward";
  status: "pending_setup" | "active" | "paused";
  approval_policy: "all";
  daily_inbound_limit: number;
  daily_outbound_limit: number;
  activated_at: string | null;
  cf_destination_id: string | null;
  cf_destination_verified_at: string | null;
  cf_rule_id: string | null;
  cf_last_synced_at: string | null;
  cf_last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMailboxMessage {
  id: string;
  direction: "inbound" | "outbound";
  message_kind: "email" | "draft" | "system";
  status:
    | "received"
    | "forwarded"
    | "pending_approval"
    | "approved"
    | "rejected"
    | "sent"
    | "failed"
    | "dropped";
  thread_key: string | null;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  raw_headers_json: string | null;
  raw_message: string | null;
  metadata_json: string | null;
  source_id: string | null;
  folder: "inbox" | "drafts" | "sent" | "archive" | "trash";
  read_at: string | null;
  agent_summary: string | null;
  agent_labels_json: string | null;
  forwarded_to: string | null;
  error_message: string | null;
  created_by: string;
  approved_by_user_id: string | null;
  received_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface DbAgentChannelConnection {
  id: string;
  user_id: string;
  channel: "telegram" | "sandbox";
  status: "pending" | "active" | "disconnected";
  setup_token: string;
  telegram_user_id: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAgentChannelEvent {
  id: string;
  connection_id: string;
  channel: "telegram" | "sandbox";
  direction: "inbound" | "outbound" | "system";
  event_type: "start" | "message" | "link" | "send" | "error";
  status: "received" | "pending" | "sent" | "failed" | "linked" | "skipped";
  telegram_message_id: string | null;
  reply_to_message_id: string | null;
  telegram_user_id: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  text_body: string | null;
  raw_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
