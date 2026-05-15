import {
  getUtcMsForLocalTime,
  normalizeTimeZone,
} from "@me3-core/plugin-calendar";
import {
  buildMe3CapabilityContext,
  type Me3KnowledgeRuntimeContext,
} from "@me3/knowledge";

export {
  createAgentContentItem,
  deleteAgentContentItem,
  getAgentContentStats,
  listAgentContentItems,
  markAgentContentItemPublishing,
  queueAgentContentItem,
  reorderAgentContentQueue,
  unqueueAgentContentItem,
  updateAgentContentItem,
  type AgentContentCreateInput,
  type AgentContentItem,
  type AgentContentStats,
  type AgentContentUpdateInput,
} from "./content";

export const AGENT_CHAT_PLUGIN_ID = "me3.agent-chat";

export const AGENT_CHAT_RUNTIME = {
  id: AGENT_CHAT_PLUGIN_ID,
  packageName: "@me3-core/plugin-agent-chat",
  bundled: true,
  runtimeStatus: "sandbox_chat_runtime",
  routes: ["/api/agent/sandbox"],
  notes: [
    "Core bundles the owner chat runtime through a first-party plugin package.",
    "The plugin is enabled by default because agent chat is part of the baseline ME3 Core experience.",
    "Tool surfaces should be added behind this package boundary so hosted ME3 and Core installs share one implementation contract.",
  ],
} as const;

export type AgentChatSource =
  | "openai"
  | "anthropic"
  | "workers-ai"
  | "workers-ai-gateway"
  | "fallback"
  | "tool"
  | null;

export type AgentSandboxDispatchInput = {
  userId: string;
  connectionId: string;
  sourceEventId: string;
  turnId: string;
  messageText: string;
  replyToMessageId?: string | number | null;
};

export type AgentSandboxDispatchResponse = {
  ok: boolean;
  auditId: string | null;
  turnId: string | null;
  specialist: string | null;
  replyText: string | null;
  model: string | null;
  source: AgentChatSource;
  fallbackReason?: string | null;
  debugError?: string | null;
  emailAction?: null;
  reminderAction?: null;
  contentAction?: null;
  contactsChanged?: boolean;
  error?: string;
};

export type AgentReminderInput = {
  title?: unknown;
  notes?: unknown;
  date?: unknown;
  time?: unknown;
  timezone?: unknown;
  recurrence?: unknown;
};

export type AgentReminder = {
  id: string;
  title: string;
  notes: string | null;
  remindAt: string;
  timezone: string | null;
  recurrenceRule: string | null;
  contextType?: "contact" | "booking" | null;
  contextId?: string | null;
  contextLabel?: string | null;
  status: "pending" | "delivered" | "dismissed" | "cancelled" | "failed";
  deliveredAt?: string | null;
  dismissedAt?: string | null;
  createdAt?: string;
};

export type AgentReminderParseResult =
  | {
      title: string;
      notes: string | null;
      remindAt: string;
      timezone: string;
      recurrenceRule: string | null;
    }
  | { error: string };

export type AgentContactSource =
  | "booking"
  | "manual"
  | "agent"
  | "import"
  | "outreach"
  | "soulink";

export type AgentContactRelationship = "client" | "prospect" | "contact";
export type AgentContactStatus = "active" | "archived" | "dormant";
export type AgentContactCloseness = "very_close" | "close" | "acquaintance" | null;
export type AgentContactOutreachStatus =
  | "new"
  | "drafted"
  | "sent"
  | "replied"
  | "booked"
  | "converted"
  | "not_interested"
  | "no_response"
  | null;

export type AgentContactInput = Partial<{
  name: string;
  email: string | null;
  phone: string | null;
  source: AgentContactSource;
  sourceRef: string | null;
  relationship: AgentContactRelationship;
  closeness: AgentContactCloseness;
  status: AgentContactStatus;
  notes: string | null;
  tags: string[];
  lastInteractionAt: string | null;
  nextFollowupAt: string | null;
  outreachStatus: AgentContactOutreachStatus;
  socialHandles: Record<string, string>;
  metadata: Record<string, unknown> | null;
}>;

export type AgentContact = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: AgentContactSource;
  sourceRef: string | null;
  relationship: AgentContactRelationship;
  closeness: string | null;
  status: AgentContactStatus;
  notes: string | null;
  tags: string[];
  lastInteractionAt: string | null;
  nextFollowupAt: string | null;
  outreachStatus: AgentContactOutreachStatus;
  socialHandles: Record<string, string>;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  bookingCount: number;
  lastBookingAt: string | null;
};

export type AgentContactsSummary = {
  total: number;
  clients: number;
  prospects: number;
  contacts: number;
  active: number;
  dormant: number;
  archived: number;
  needsFollowUp: number;
  outreach: Record<Exclude<AgentContactOutreachStatus, null>, number>;
};

export type AgentMailboxUpdateInput = {
  aliasLocalPart?: unknown;
  forwardingEmail?: unknown;
  forwardingEnabled?: unknown;
};

export type AgentMailboxDraftInput = {
  fromAddress?: unknown;
  to?: unknown;
  toAddress?: unknown;
  subject?: unknown;
  textBody?: unknown;
  htmlBody?: unknown;
  source?: unknown;
  replyToMessageId?: unknown;
};

export type AgentMailboxMessageListOptions = {
  limit?: unknown;
  offset?: unknown;
  status?: unknown;
  createdBy?: unknown;
  direction?: unknown;
  folder?: unknown;
  query?: unknown;
  unread?: unknown;
};

export type AgentMailbox = ReturnType<typeof serializeAgentMailbox>;
export type AgentMailboxSource = ReturnType<typeof serializeAgentMailboxDefaultSource>;
export type AgentMailboxMessage = ReturnType<typeof serializeAgentMailboxMessage>;

export type AgentMailboxOverview = {
  tier: "core";
  available: true;
  approvalRequired: true;
  cloudflareManaged: false;
  suggestedAliasLocalPart: string;
  mailbox: AgentMailbox | null;
  sources: AgentMailboxSource[];
  recentActivity: AgentMailboxMessage[];
};

export type AgentMailboxDraftSendInput = {
  providerId: string;
  providerMessageId: string | null;
  sentAt: string;
  approvedByUserId: string;
};

export type AgentMailboxDraftFailureInput = {
  errorMessage: string;
};

type CoreAgentChatEnv = {
  DB: D1Like;
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
  };
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ME3_AI_MODEL?: string;
  ME3_AI_DEFAULT_PROVIDER?: string;
  ME3_AI_DEFAULT_MODEL?: string;
  ME3_AI_CHAT_PROVIDER?: string;
  ME3_AI_CHAT_MODEL?: string;
};

type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
    first<T = unknown>(): Promise<T | null>;
  };
};

type AgentSandboxConnection = {
  id: string;
};

type AgentSandboxSourceEvent = {
  id: string;
};

export type AgentSandboxTurnRecord = {
  connection: AgentSandboxConnection;
  sourceEvent: AgentSandboxSourceEvent;
  turnId: string;
  messageText: string;
  replyToMessageId: string | number | null;
};

type StorageLike = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
};

type OwnerProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  bio: string | null;
  timezone: string | null;
  locale?: string | null;
};

type AiCredentialRow = {
  provider_id: string;
  encrypted_api_key: string | null;
};

type AiDefaultRow = {
  provider_id: string;
  model: string;
};

type DbPluginInstallationRow = {
  plugin_id: string;
  enabled: number;
  status: string;
};

type DbReminderRow = {
  id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  timezone: string | null;
  recurrence_rule: string | null;
  context_type?: "contact" | "booking" | null;
  context_id?: string | null;
  context_label?: string | null;
  status: "pending" | "delivered" | "dismissed" | "cancelled" | "failed";
  delivered_at?: string | null;
  dismissed_at?: string | null;
  created_at?: string;
};

type DbContactRow = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: AgentContactSource;
  source_ref: string | null;
  relationship: AgentContactRelationship;
  status: AgentContactStatus;
  notes: string | null;
  tags: string | null;
  last_interaction_at: string | null;
  next_followup_at: string | null;
  outreach_status: AgentContactOutreachStatus;
  social_handles: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  booking_count?: number | string | null;
  last_booking_at?: string | null;
};

type DbMailboxAliasRow = {
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
};

type DbMailboxMessageRow = {
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
  provider_id: string | null;
  provider_message_id: string | null;
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
};

type NormalizedMailboxDraftInput = {
  fromAddress: string;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  sourceId: string | null;
  threadKey: string;
  messageIdHeader: string;
  inReplyTo: string | null;
  referencesHeader: string | null;
  createdBy: string;
};

type D1RunResultLike = {
  meta?: {
    changes?: number;
  };
};

type AiProviderId = "workers-ai" | "openai" | "anthropic";

type AiRoute = {
  providerId: AiProviderId;
  model: string;
  apiKey: string | null;
  ai: CoreAgentChatEnv["AI"] | null;
  configured: boolean;
};

const DEFAULT_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest";
const INSTALL_ENCRYPTION_KEY_NAME = "TOKEN_ENCRYPTION_KEY";
const CONTACT_SOURCES = new Set<AgentContactSource>([
  "booking",
  "manual",
  "agent",
  "import",
  "outreach",
  "soulink",
]);
const CONTACT_RELATIONSHIPS = new Set<AgentContactRelationship>([
  "client",
  "prospect",
  "contact",
]);
const CONTACT_STATUSES = new Set<AgentContactStatus>([
  "active",
  "archived",
  "dormant",
]);
const OUTREACH_STATUSES = new Set<Exclude<AgentContactOutreachStatus, null>>([
  "new",
  "drafted",
  "sent",
  "replied",
  "booked",
  "converted",
  "not_interested",
  "no_response",
]);
const MAILBOX_ALIAS_REGEX = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAILBOX_FOLDERS = new Set(["inbox", "drafts", "sent", "archive", "trash"]);

export function isAgentSandboxDispatchInput(
  value: unknown,
): value is AgentSandboxDispatchInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<AgentSandboxDispatchInput>;
  return (
    typeof input.userId === "string" &&
    typeof input.connectionId === "string" &&
    typeof input.sourceEventId === "string" &&
    typeof input.turnId === "string" &&
    typeof input.messageText === "string"
  );
}

export function parseAgentReminderInput(
  input: AgentReminderInput | null | undefined,
): AgentReminderParseResult {
  const title = normalizeNullableText(input?.title);
  const notes = normalizeNullableText(input?.notes);
  const date = typeof input?.date === "string" ? input.date.trim() : "";
  const time = typeof input?.time === "string" ? input.time.trim() : "";

  if (!title) return { error: "Title is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Date must be in YYYY-MM-DD format" };
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { error: "Time must be in HH:MM format" };
  }

  const timezone = normalizeTimeZone(input?.timezone) || "UTC";
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const remindAt = new Date(
    getUtcMsForLocalTime({ year, month, day, hour, minute }, timezone),
  ).toISOString();
  const recurrenceRule = parseReminderRecurrenceRule(input?.recurrence, date);
  if (hasExplicitReminderRecurrence(input?.recurrence) && !recurrenceRule) {
    return { error: "Invalid recurrence value" };
  }

  return { title, notes, remindAt, timezone, recurrenceRule };
}

export function parseAgentContactInput(value: unknown): AgentContactInput {
  if (!isPlainObject(value)) return {};
  return {
    name: normalizeNullableText(value.name) || undefined,
    email: normalizeEmail(value.email),
    phone: normalizeNullableText(value.phone),
    source: CONTACT_SOURCES.has(String(value.source) as AgentContactSource)
      ? (value.source as AgentContactSource)
      : "manual",
    sourceRef: normalizeNullableText(value.sourceRef),
    relationship: CONTACT_RELATIONSHIPS.has(
      String(value.relationship) as AgentContactRelationship,
    )
      ? (value.relationship as AgentContactRelationship)
      : "contact",
    closeness: normalizeNullableText(value.closeness) as AgentContactCloseness,
    status: CONTACT_STATUSES.has(String(value.status) as AgentContactStatus)
      ? (value.status as AgentContactStatus)
      : "active",
    notes: normalizeNullableText(value.notes),
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    lastInteractionAt: normalizeNullableText(value.lastInteractionAt),
    nextFollowupAt: normalizeNullableText(value.nextFollowupAt),
    outreachStatus: normalizeContactOutreachStatus(value.outreachStatus),
    socialHandles: isPlainObject(value.socialHandles)
      ? stringRecord(value.socialHandles)
      : {},
    metadata: isPlainObject(value.metadata)
      ? { ...(value.metadata as Record<string, unknown>) }
      : null,
  };
}

export async function listAgentContacts(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<{ contacts: AgentContact[]; summary: AgentContactsSummary }> {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.user_id, c.name, c.email, c.phone, c.source, c.source_ref,
            c.relationship, c.status, c.notes, c.tags, c.last_interaction_at,
            c.next_followup_at, c.outreach_status, c.social_handles, c.metadata,
            c.created_at, c.updated_at,
            COUNT(b.id) AS booking_count,
            MAX(b.starts_at) AS last_booking_at
     FROM contacts c
     LEFT JOIN bookings b ON b.guest_email = c.email
     LEFT JOIN sites s ON s.id = b.site_id AND s.user_id = c.user_id
     WHERE c.user_id = ?
     GROUP BY c.id
     ORDER BY COALESCE(c.last_interaction_at, c.updated_at, c.created_at) DESC`,
  )
    .bind(userId)
    .all<DbContactRow>();

  const contacts = (rows.results || []).map(serializeAgentContact);
  return { contacts, summary: summarizeAgentContacts(contacts) };
}

export async function createAgentContact(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  value: unknown,
): Promise<AgentContact | { error: string; status: 400 }> {
  const input = parseAgentContactInput(value);
  if (!input.name?.trim()) {
    return { error: "Contact name is required", status: 400 };
  }

  const id = crypto.randomUUID();
  const metadata = normalizeContactMetadata(input);
  await env.DB.prepare(
    `INSERT INTO contacts (
       id, user_id, name, email, phone, source, source_ref, relationship, status,
       notes, tags, last_interaction_at, next_followup_at, outreach_status,
       social_handles, metadata
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      input.name,
      input.email || null,
      input.phone || null,
      input.source || "manual",
      input.sourceRef || null,
      input.relationship || "contact",
      input.status || "active",
      input.notes || null,
      JSON.stringify(input.tags || []),
      input.lastInteractionAt || null,
      input.nextFollowupAt || null,
      input.outreachStatus || null,
      JSON.stringify(input.socialHandles || {}),
      metadata ? JSON.stringify(metadata) : null,
    )
    .run();

  const contact = await getAgentContact(env, userId, id);
  if (!contact) return { error: "Contact not found", status: 400 };
  return contact;
}

export async function updateAgentContact(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  contactId: string,
  value: unknown,
): Promise<AgentContact | { error: string; status: 404 }> {
  const input = parseAgentContactInput(value);
  const existing = await getAgentContactRow(env, userId, contactId);
  if (!existing) return { error: "Contact not found", status: 404 };

  const merged: AgentContactInput = {
    name: input.name ?? existing.name,
    email: input.email ?? existing.email,
    phone: input.phone ?? existing.phone,
    source: input.source ?? existing.source,
    sourceRef: input.sourceRef ?? existing.source_ref,
    relationship: input.relationship ?? existing.relationship,
    status: input.status ?? existing.status,
    notes: input.notes ?? existing.notes,
    tags: input.tags ?? parseJsonArray(existing.tags),
    lastInteractionAt: input.lastInteractionAt ?? existing.last_interaction_at,
    nextFollowupAt: input.nextFollowupAt ?? existing.next_followup_at,
    outreachStatus: input.outreachStatus ?? existing.outreach_status,
    socialHandles: input.socialHandles ?? stringRecord(parseJsonRecord(existing.social_handles)),
    metadata: input.metadata ?? parseJsonRecord(existing.metadata),
    closeness:
      input.closeness ??
      (parseJsonRecord(existing.metadata).closeness as AgentContactCloseness),
  };
  const metadata = normalizeContactMetadata(merged);

  await env.DB.prepare(
    `UPDATE contacts
     SET name = ?, email = ?, phone = ?, source = ?, source_ref = ?,
         relationship = ?, status = ?, notes = ?, tags = ?,
         last_interaction_at = ?, next_followup_at = ?, outreach_status = ?,
         social_handles = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
  )
    .bind(
      merged.name,
      merged.email || null,
      merged.phone || null,
      merged.source || "manual",
      merged.sourceRef || null,
      merged.relationship || "contact",
      merged.status || "active",
      merged.notes || null,
      JSON.stringify(merged.tags || []),
      merged.lastInteractionAt || null,
      merged.nextFollowupAt || null,
      merged.outreachStatus || null,
      JSON.stringify(merged.socialHandles || {}),
      metadata ? JSON.stringify(metadata) : null,
      userId,
      contactId,
    )
    .run();

  const contact = await getAgentContact(env, userId, contactId);
  return contact || { error: "Contact not found", status: 404 };
}

export async function deleteAgentContact(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  contactId: string,
): Promise<{ ok: true } | { error: string; status: 404 }> {
  const result = (await env.DB.prepare("DELETE FROM contacts WHERE user_id = ? AND id = ?")
    .bind(userId, contactId)
    .run()) as D1RunResultLike;
  if ((result.meta?.changes || 0) === 0) {
    return { error: "Contact not found", status: 404 };
  }
  return { ok: true };
}

export async function updateAgentContactOutreachStatus(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  contactId: string,
  input: { outreachStatus?: unknown; nextFollowupAt?: unknown },
): Promise<AgentContact | { error: string; status: 404 }> {
  const outreachStatus = normalizeContactOutreachStatus(input.outreachStatus);
  const result = (await env.DB.prepare(
    `UPDATE contacts
     SET outreach_status = ?, next_followup_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
  )
    .bind(outreachStatus, normalizeNullableText(input.nextFollowupAt), userId, contactId)
    .run()) as D1RunResultLike;
  if ((result.meta?.changes || 0) === 0) {
    return { error: "Contact not found", status: 404 };
  }

  const contact = await getAgentContact(env, userId, contactId);
  return contact || { error: "Contact not found", status: 404 };
}

export async function convertAgentContactToClient(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  contactId: string,
): Promise<AgentContact | { error: string; status: 404 }> {
  const result = (await env.DB.prepare(
    `UPDATE contacts
     SET relationship = 'client', outreach_status = 'converted', updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
  )
    .bind(userId, contactId)
    .run()) as D1RunResultLike;
  if ((result.meta?.changes || 0) === 0) {
    return { error: "Contact not found", status: 404 };
  }

  const contact = await getAgentContact(env, userId, contactId);
  return contact || { error: "Contact not found", status: 404 };
}

export async function getAgentMailboxOverview(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  ownerHint?: { username?: string | null; email?: string | null },
): Promise<AgentMailboxOverview> {
  const mailbox = await getAgentMailboxRow(env, userId);
  const suggestedAliasLocalPart =
    mailbox?.alias_local_part ||
    suggestAgentMailboxAlias(ownerHint?.username || ownerHint?.email || "owner");

  return {
    tier: "core",
    available: true,
    approvalRequired: true,
    cloudflareManaged: false,
    suggestedAliasLocalPart,
    mailbox: mailbox ? serializeAgentMailbox(mailbox) : null,
    sources: mailbox ? [serializeAgentMailboxDefaultSource(mailbox)] : [],
    recentActivity: mailbox ? await getAgentMailboxActivity(env, mailbox.id, 25, 0) : [],
  };
}

export async function upsertAgentMailbox(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  input: AgentMailboxUpdateInput,
  ownerHint?: { email?: string | null },
): Promise<{ mailbox: AgentMailbox | null; sources: AgentMailboxSource[] } | { error: string; status: number }> {
  const existing = await getAgentMailboxRow(env, userId);
  const aliasLocalPart = normalizeAgentMailboxAlias(
    typeof input.aliasLocalPart === "string" ? input.aliasLocalPart : "",
  );
  const forwardingEnabled = input.forwardingEnabled === true;
  const forwardingEmail =
    typeof input.forwardingEmail === "string" ? input.forwardingEmail.trim() : "";

  if (!aliasLocalPart || !MAILBOX_ALIAS_REGEX.test(aliasLocalPart)) {
    return {
      error:
        "Mailbox alias must start and end with a letter or number and may contain dots, underscores, or hyphens.",
      status: 400,
    };
  }

  if (forwardingEnabled && !isValidEmail(forwardingEmail)) {
    return { error: "Enter a valid forwarding email address.", status: 400 };
  }

  const savedForwardingEmail =
    forwardingEnabled ? forwardingEmail : existing?.forwarding_email || ownerHint?.email || "";
  const forwardingStatus =
    forwardingEnabled && savedForwardingEmail !== existing?.forwarding_email
      ? "pending"
      : existing?.forwarding_status || "pending";
  const forwardingMode = forwardingEnabled ? "forward" : "me3_only";
  const now = new Date().toISOString();

  try {
    if (existing) {
      await env.DB.prepare(
        `UPDATE mailbox_aliases
         SET alias_local_part = ?,
             forwarding_email = ?,
             forwarding_status = ?,
             forwarding_enabled = ?,
             forwarding_mode = ?,
             updated_at = ?
         WHERE user_id = ?`,
      )
        .bind(
          aliasLocalPart,
          savedForwardingEmail,
          forwardingStatus,
          forwardingEnabled ? 1 : 0,
          forwardingMode,
          now,
          userId,
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO mailbox_aliases (
           id, user_id, alias_local_part, forwarding_email, forwarding_status,
           forwarding_enabled, forwarding_mode, status, approval_policy,
           daily_inbound_limit, daily_outbound_limit, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_setup', 'all', 25, 25, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          userId,
          aliasLocalPart,
          savedForwardingEmail,
          forwardingStatus,
          forwardingEnabled ? 1 : 0,
          forwardingMode,
          now,
          now,
        )
        .run();
    }
  } catch {
    return { error: "Mailbox alias is already in use.", status: 409 };
  }

  const mailbox = await getAgentMailboxRow(env, userId);
  return {
    mailbox: mailbox ? serializeAgentMailbox(mailbox) : null,
    sources: mailbox ? [serializeAgentMailboxDefaultSource(mailbox)] : [],
  };
}

export async function activateAgentMailbox(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<{ mailbox: AgentMailbox | null } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE mailbox_aliases
     SET status = 'active',
         activated_at = COALESCE(activated_at, ?),
         updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(now, now, userId)
    .run();

  const updated = await getAgentMailboxRow(env, userId);
  return { mailbox: updated ? serializeAgentMailbox(updated) : null };
}

export async function pauseAgentMailbox(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<{ mailbox: AgentMailbox | null } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  await env.DB.prepare(
    `UPDATE mailbox_aliases
     SET status = 'paused',
         updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(new Date().toISOString(), userId)
    .run();

  const updated = await getAgentMailboxRow(env, userId);
  return { mailbox: updated ? serializeAgentMailbox(updated) : null };
}

export async function listAgentMailboxMessages(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  options: AgentMailboxMessageListOptions,
): Promise<{ messages: AgentMailboxMessage[]; total: number; limit: number; offset: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  const limit = clampNumber(options.limit, 50, 0, 100);
  const offset = clampNumber(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  if (!mailbox) return { messages: [], total: 0, limit, offset };

  const { where, bindings } = buildAgentMailboxMessageFilters(mailbox.id, {
    status: normalizeNullableText(options.status) || "",
    createdBy: normalizeNullableText(options.createdBy) || "",
    direction: normalizeNullableText(options.direction) || "outbound",
    folder: normalizeNullableText(options.folder) || "",
    query: normalizeNullableText(options.query) || "",
    unread: normalizeNullableText(options.unread) || "",
  });

  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM mailbox_messages WHERE ${where}`)
    .bind(...bindings)
    .first<{ count: number | string | null }>();
  const total = Number(count?.count || 0);

  if (limit === 0) return { messages: [], total, limit, offset };

  const rows = await env.DB.prepare(
    `${agentMailboxMessageSelectSql()} WHERE ${where}
     ORDER BY COALESCE(sent_at, received_at, approved_at, created_at) DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, limit, offset)
    .all<DbMailboxMessageRow>();

  return {
    messages: (rows.results || []).map(serializeAgentMailboxMessage),
    total,
    limit,
    offset,
  };
}

export async function createAgentMailboxDraft(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  input: AgentMailboxDraftInput,
): Promise<{ draft: AgentMailboxMessage } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const normalized = await normalizeAgentMailboxDraftInput(env, mailbox, input);
  if ("error" in normalized) return normalized;

  const draft = await insertAgentMailboxDraft(env, mailbox, normalized);
  return { draft: serializeAgentMailboxMessage(draft) };
}

export async function updateAgentMailboxDraft(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  draftId: string,
  input: AgentMailboxDraftInput,
): Promise<{ draft: AgentMailboxMessage | null } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const existing = await getAgentMailboxMessageById(env, mailbox.id, draftId);
  if (!existing || existing.message_kind !== "draft") {
    return { error: "Draft not found", status: 404 };
  }

  const normalized = await normalizeAgentMailboxDraftInput(env, mailbox, input, existing);
  if ("error" in normalized) return normalized;

  const draft = await updateAgentMailboxDraftRow(env, mailbox.id, existing.id, normalized);
  return { draft: draft ? serializeAgentMailboxMessage(draft) : null };
}

export async function rejectAgentMailboxDraft(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  draftId: string,
): Promise<{ draft: AgentMailboxMessage } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE mailbox_messages
     SET status = 'rejected',
         folder = 'trash',
         approved_by_user_id = ?,
         approved_at = ?,
         updated_at = ?
     WHERE id = ? AND mailbox_id = ? AND message_kind = 'draft'`,
  )
    .bind(userId, now, now, draftId, mailbox.id)
    .run();

  const draft = await getAgentMailboxMessageById(env, mailbox.id, draftId);
  if (!draft) return { error: "Draft not found", status: 404 };
  return { draft: serializeAgentMailboxMessage(draft) };
}

export async function getAgentMailboxDraftForApproval(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  draftId: string,
): Promise<{ mailbox: AgentMailbox; draft: AgentMailboxMessage } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const draft = await getAgentMailboxMessageById(env, mailbox.id, draftId);
  if (!draft || draft.message_kind !== "draft") {
    return { error: "Draft not found", status: 404 };
  }
  if (!draft.to_address || !isValidEmail(draft.to_address)) {
    return { error: "Draft recipient is required", status: 400 };
  }

  return {
    mailbox: serializeAgentMailbox(mailbox),
    draft: serializeAgentMailboxMessage(draft),
  };
}

export function getAgentMailboxOutboundHeaders(message: AgentMailboxMessage): {
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
} {
  const outboundHeaders = isPlainObject(message.metadata.outbound_headers)
    ? message.metadata.outbound_headers
    : {};
  return {
    messageIdHeader: normalizeMessageHeader(outboundHeaders.message_id),
    inReplyTo: normalizeMessageHeader(outboundHeaders.in_reply_to),
    referencesHeader: normalizeReferencesHeader(outboundHeaders.references),
  };
}

export async function markAgentMailboxDraftSent(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  draftId: string,
  input: AgentMailboxDraftSendInput,
): Promise<{ draft: AgentMailboxMessage | null } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  await env.DB.prepare(
    `UPDATE mailbox_messages
     SET message_kind = 'email',
         status = 'sent',
         folder = 'sent',
         provider_id = ?,
         provider_message_id = ?,
         error_message = NULL,
         approved_by_user_id = ?,
         approved_at = ?,
         sent_at = ?,
         updated_at = ?
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(
      input.providerId,
      input.providerMessageId,
      input.approvedByUserId,
      input.sentAt,
      input.sentAt,
      input.sentAt,
      draftId,
      mailbox.id,
    )
    .run();

  const sent = await getAgentMailboxMessageById(env, mailbox.id, draftId);
  return { draft: sent ? serializeAgentMailboxMessage(sent) : null };
}

export async function markAgentMailboxDraftFailed(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  draftId: string,
  input: AgentMailboxDraftFailureInput,
): Promise<void> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return;

  await env.DB.prepare(
    `UPDATE mailbox_messages
     SET status = 'failed',
         error_message = ?,
         updated_at = ?
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(input.errorMessage, new Date().toISOString(), draftId, mailbox.id)
    .run();
}

export async function setAgentMailboxMessageReadState(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageId: string,
  read: boolean,
): Promise<{ ok: true } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const result = await env.DB.prepare(
    `UPDATE mailbox_messages
     SET read_at = CASE WHEN ? THEN COALESCE(read_at, CURRENT_TIMESTAMP) ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(read, messageId, mailbox.id)
    .run();

  if ((result.meta?.changes || 0) === 0) return { error: "Message not found", status: 404 };
  return { ok: true };
}

export async function moveAgentMailboxMessage(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageId: string,
  folderInput: unknown,
): Promise<{ ok: true; id: string; folder: string } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const folder = normalizeFolder(folderInput);
  if (!folder) return { error: "Invalid folder", status: 400 };

  const result = await env.DB.prepare(
    `UPDATE mailbox_messages
     SET folder = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(folder, messageId, mailbox.id)
    .run();

  if ((result.meta?.changes || 0) === 0) return { error: "Message not found", status: 404 };
  return { ok: true, id: messageId, folder };
}

export async function trashAgentMailboxMessage(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const result = await env.DB.prepare(
    `UPDATE mailbox_messages
     SET folder = 'trash', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(messageId, mailbox.id)
    .run();

  if ((result.meta?.changes || 0) === 0) return { error: "Message not found", status: 404 };
  return { ok: true };
}

export async function createAgentReminder(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  input: AgentReminderInput,
): Promise<AgentReminder | { error: string }> {
  const parsed = parseAgentReminderInput(input);
  if ("error" in parsed) return parsed;

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO user_reminders
       (id, user_id, title, notes, remind_at, timezone, recurrence_rule, status, created_via)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'agent')`,
  )
    .bind(
      id,
      userId,
      parsed.title,
      parsed.notes,
      parsed.remindAt,
      parsed.timezone,
      parsed.recurrenceRule,
    )
    .run();

  return {
    id,
    title: parsed.title,
    notes: parsed.notes,
    remindAt: parsed.remindAt,
    timezone: parsed.timezone,
    recurrenceRule: parsed.recurrenceRule,
    status: "pending",
  };
}

export async function updateAgentReminder(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  reminderId: string,
  input: AgentReminderInput,
): Promise<AgentReminder | { error: string; status?: 400 | 404 }> {
  const parsed = parseAgentReminderInput(input);
  if ("error" in parsed) return { ...parsed, status: 400 };

  const result = (await env.DB.prepare(
    `UPDATE user_reminders
     SET title = ?, notes = ?, remind_at = ?, timezone = ?, recurrence_rule = ?,
         error_message = NULL, updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND status IN ('pending', 'failed')`,
  )
    .bind(
      parsed.title,
      parsed.notes,
      parsed.remindAt,
      parsed.timezone,
      parsed.recurrenceRule,
      reminderId,
      userId,
    )
    .run()) as D1RunResultLike;

  if ((result.meta?.changes || 0) === 0) {
    return { error: "Reminder not found", status: 404 };
  }

  return {
    id: reminderId,
    title: parsed.title,
    notes: parsed.notes,
    remindAt: parsed.remindAt,
    timezone: parsed.timezone,
    recurrenceRule: parsed.recurrenceRule,
    status: "pending",
  };
}

export async function cancelAgentReminder(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  reminderId: string,
): Promise<{ ok: true } | { error: string; status: 404 }> {
  const result = (await env.DB.prepare(
    `UPDATE user_reminders
     SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND user_id = ? AND status IN ('pending', 'failed')`,
  )
    .bind(reminderId, userId)
    .run()) as D1RunResultLike;

  if ((result.meta?.changes || 0) === 0) {
    return { error: "Reminder not found", status: 404 };
  }
  return { ok: true };
}

export function serializeAgentReminder(reminder: DbReminderRow): AgentReminder {
  return {
    id: reminder.id,
    title: reminder.title,
    notes: reminder.notes,
    remindAt: reminder.remind_at,
    timezone: reminder.timezone,
    recurrenceRule: reminder.recurrence_rule,
    contextType: reminder.context_type ?? null,
    contextId: reminder.context_id ?? null,
    contextLabel: reminder.context_label ?? null,
    status: reminder.status,
    deliveredAt: reminder.delivered_at ?? null,
    dismissedAt: reminder.dismissed_at ?? null,
    createdAt: reminder.created_at,
  };
}

export function serializeAgentContact(row: DbContactRow): AgentContact {
  const metadata = parseJsonRecord(row.metadata);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    sourceRef: row.source_ref,
    relationship: row.relationship,
    closeness: typeof metadata.closeness === "string" ? metadata.closeness : null,
    status: row.status,
    notes: row.notes,
    tags: parseJsonArray(row.tags),
    lastInteractionAt: row.last_interaction_at,
    nextFollowupAt: row.next_followup_at,
    outreachStatus: row.outreach_status,
    socialHandles: stringRecord(parseJsonRecord(row.social_handles)),
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bookingCount: Number(row.booking_count || 0),
    lastBookingAt: row.last_booking_at || null,
  };
}

export async function createAgentSandboxTurnRecord(
  env: Pick<CoreAgentChatEnv, "DB">,
  input: {
    userId: string;
    messageText: string;
    replyToMessageId?: string | number | null;
  },
): Promise<AgentSandboxTurnRecord> {
  const messageText = input.messageText.trim();
  const replyToMessageId =
    typeof input.replyToMessageId === "string" ||
    typeof input.replyToMessageId === "number"
      ? input.replyToMessageId
      : null;
  const connection = await upsertSandboxConnection(env, input.userId);
  const turnId = crypto.randomUUID();
  const sourceEvent = await insertSandboxEvent(env, {
    connectionId: connection.id,
    turnId,
    messageText,
    replyToMessageId,
  });

  return {
    connection,
    sourceEvent,
    turnId,
    messageText,
    replyToMessageId,
  };
}

export async function dispatchAgentSandboxTurn(
  env: CoreAgentChatEnv,
  storage: StorageLike,
  input: AgentSandboxDispatchInput,
): Promise<AgentSandboxDispatchResponse> {
  const resultKey = `agent-chat:sandbox:${input.turnId}`;
  const existing = await storage.get<AgentSandboxDispatchResponse>(resultKey);
  if (existing) return { ...existing, ok: true };

  await storage.put("userId", input.userId);
  await storage.put("lastSandboxConnectionId", input.connectionId);
  await storage.put("lastSandboxTurnId", input.turnId);
  await storage.put("lastSandboxTurnAt", new Date().toISOString());

  const owner = await getOwnerProfile(env, input.userId);
  const route = await resolveAiRoute(env, input.userId);
  const recent = await loadRecentMessages(env, input.userId);
  const knowledgeContext = await loadMe3KnowledgeRuntimeContext(env, route.configured);
  const messages = buildChatMessages(
    owner,
    recent,
    input.messageText,
    knowledgeContext,
  );

  let response: AgentSandboxDispatchResponse;
  if (!route.configured) {
    response = {
      ok: true,
      auditId: null,
      turnId: input.turnId,
      specialist: "core.agent-chat",
      replyText:
        "ME3 Core chat is connected. Add an AI provider in Account settings or bind Workers AI to turn this into a live model response.",
      model: route.model,
      source: "fallback",
      fallbackReason: "AI provider setup required",
      debugError: null,
      emailAction: null,
      reminderAction: null,
      contentAction: null,
      contactsChanged: false,
    };
  } else {
    response = await runModelTurn(route, messages, input.turnId);
  }

  await persistAssistantMessage(env, input.userId, "user", input.messageText);
  if (response.replyText) {
    await persistAssistantMessage(env, input.userId, "assistant", response.replyText);
  }

  await storage.put(resultKey, response);
  return response;
}

function parseReminderRecurrenceRule(recurrence: unknown, date: string): string | null {
  const normalized =
    typeof recurrence === "string" ? recurrence.trim().toLowerCase() : recurrence;
  if (normalized == null || normalized === "" || normalized === "none") return null;
  if (normalized === "daily") return "daily";

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const weekday =
    ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
      new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay()
    ];

  if (normalized === "weekly") return `weekly:${weekday}`;
  if (normalized === "monthly") return `monthly:${day}`;
  return null;
}

function hasExplicitReminderRecurrence(recurrence: unknown): boolean {
  if (recurrence == null) return false;
  if (typeof recurrence !== "string") return true;
  const normalized = recurrence.trim().toLowerCase();
  return normalized !== "" && normalized !== "none";
}

async function getAgentContact(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  contactId: string,
): Promise<AgentContact | null> {
  const row = await getAgentContactRow(env, userId, contactId);
  return row ? serializeAgentContact(row) : null;
}

async function getAgentContactRow(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  contactId: string,
): Promise<DbContactRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, name, email, phone, source, source_ref,
            relationship, status, notes, tags, last_interaction_at,
            next_followup_at, outreach_status, social_handles, metadata,
            created_at, updated_at, 0 AS booking_count, NULL AS last_booking_at
     FROM contacts
     WHERE user_id = ? AND id = ?`,
  )
    .bind(userId, contactId)
    .first<DbContactRow>();
}

function summarizeAgentContacts(contacts: AgentContact[]): AgentContactsSummary {
  const outreach: AgentContactsSummary["outreach"] = {
    new: 0,
    drafted: 0,
    sent: 0,
    replied: 0,
    booked: 0,
    converted: 0,
    not_interested: 0,
    no_response: 0,
  };
  for (const contact of contacts) {
    if (contact.outreachStatus && contact.outreachStatus in outreach) {
      outreach[contact.outreachStatus] += 1;
    }
  }
  return {
    total: contacts.length,
    clients: contacts.filter((contact) => contact.relationship === "client").length,
    prospects: contacts.filter((contact) => contact.relationship === "prospect").length,
    contacts: contacts.filter((contact) => contact.relationship === "contact").length,
    active: contacts.filter((contact) => contact.status === "active").length,
    dormant: contacts.filter((contact) => contact.status === "dormant").length,
    archived: contacts.filter((contact) => contact.status === "archived").length,
    needsFollowUp: contacts.filter(
      (contact) => contact.nextFollowupAt && contact.status === "active",
    ).length,
    outreach,
  };
}

async function getAgentMailboxRow(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<DbMailboxAliasRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, alias_local_part, forwarding_email, forwarding_status,
            forwarding_enabled, forwarding_mode, status, approval_policy,
            daily_inbound_limit, daily_outbound_limit, activated_at,
            cf_destination_id, cf_destination_verified_at, cf_rule_id,
            cf_last_synced_at, cf_last_error, created_at, updated_at
     FROM mailbox_aliases
     WHERE user_id = ?`,
  )
    .bind(userId)
    .first<DbMailboxAliasRow>();
}

function suggestAgentMailboxAlias(value: string): string {
  const base = value
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return base || "owner";
}

function normalizeAgentMailboxAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeEmailText(value: unknown): string | null {
  return normalizeNullableText(value)?.toLowerCase() || null;
}

function getAgentMailboxAddress(localPart: string): string {
  return `${localPart}@me3.local`;
}

function serializeAgentMailbox(row: DbMailboxAliasRow) {
  return {
    id: row.id,
    aliasLocalPart: row.alias_local_part,
    aliasAddress: getAgentMailboxAddress(row.alias_local_part),
    forwardingEmail: row.forwarding_email,
    forwardingStatus: row.forwarding_status,
    forwardingEnabled: Boolean(row.forwarding_enabled),
    forwardingMode: row.forwarding_mode,
    status: row.status,
    approvalPolicy: row.approval_policy,
    dailyInboundLimit: row.daily_inbound_limit,
    dailyOutboundLimit: row.daily_outbound_limit,
    activatedAt: row.activated_at,
    forwardingVerifiedAt: row.cf_destination_verified_at,
    cloudflareDestinationId: row.cf_destination_id,
    cloudflareRuleId: row.cf_rule_id,
    cloudflareLastSyncedAt: row.cf_last_synced_at,
    cloudflareLastError: row.cf_last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAgentMailboxDefaultSource(row: DbMailboxAliasRow) {
  return {
    id: row.id,
    type: "me3_alias",
    address: getAgentMailboxAddress(row.alias_local_part),
    status: row.status === "active" ? "active" : row.status === "paused" ? "paused" : "pending",
    inboundEnabled: row.status === "active",
    outboundEnabled: true,
  };
}

function agentMailboxMessageSelectSql(): string {
  return `SELECT id, direction, message_kind, status, thread_key, from_address,
                 provider_id, provider_message_id, to_address, subject, text_body,
                 html_body, raw_headers_json, raw_message, metadata_json, source_id, folder, read_at,
                 agent_summary, agent_labels_json, forwarded_to, error_message,
                 created_by, approved_by_user_id, received_at, approved_at,
                 sent_at, created_at
          FROM mailbox_messages`;
}

async function getAgentMailboxActivity(
  env: Pick<CoreAgentChatEnv, "DB">,
  mailboxId: string,
  limit: number,
  offset: number,
): Promise<AgentMailboxMessage[]> {
  const rows = await env.DB.prepare(
    `${agentMailboxMessageSelectSql()}
     WHERE mailbox_id = ?
     ORDER BY COALESCE(sent_at, received_at, approved_at, created_at) DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(mailboxId, limit, offset)
    .all<DbMailboxMessageRow>();

  return (rows.results || []).map(serializeAgentMailboxMessage);
}

function buildAgentMailboxMessageFilters(
  mailboxId: string,
  options: {
    status: string;
    createdBy: string;
    direction: string;
    folder: string;
    query: string;
    unread: string;
  },
) {
  const conditions = ["mailbox_id = ?"];
  const bindings: (string | number)[] = [mailboxId];
  const folder = normalizeFolder(options.folder);
  if (folder) {
    conditions.push("folder = ?");
    bindings.push(folder);
  }
  if (options.status) {
    const statuses = options.status.split(",").map((status) => status.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push("status = ?");
      bindings.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`status IN (${statuses.map(() => "?").join(",")})`);
      bindings.push(...statuses);
    }
  }
  if (options.createdBy) {
    conditions.push("created_by = ?");
    bindings.push(options.createdBy);
  }
  if (options.direction && options.direction !== "all") {
    conditions.push("direction = ?");
    bindings.push(options.direction);
  }
  if (["1", "true", "yes"].includes(options.unread.toLowerCase())) {
    conditions.push("direction = 'inbound'");
    conditions.push("read_at IS NULL");
  }
  if (options.query.trim()) {
    conditions.push(
      `(LOWER(COALESCE(subject, '')) LIKE ? OR LOWER(COALESCE(text_body, '')) LIKE ? OR LOWER(COALESCE(from_address, '')) LIKE ? OR LOWER(COALESCE(to_address, '')) LIKE ?)`,
    );
    const like = `%${options.query.trim().toLowerCase()}%`;
    bindings.push(like, like, like, like);
  }

  return { where: conditions.join(" AND "), bindings };
}

function normalizeFolder(value: unknown): string | null {
  const folder = typeof value === "string" ? value.trim().toLowerCase() : "";
  return MAILBOX_FOLDERS.has(folder) ? folder : null;
}

function serializeAgentMailboxMessage(row: DbMailboxMessageRow) {
  const metadata = parseJsonRecord(row.metadata_json);
  const agentLabels = parseJsonArray(row.agent_labels_json);
  return {
    id: row.id,
    direction: row.direction,
    kind: row.message_kind,
    status: row.status,
    threadKey: row.thread_key,
    providerId: row.provider_id,
    providerMessageId: row.provider_message_id,
    fromAddress: row.from_address,
    fromName: null,
    toAddress: row.to_address,
    subject: row.subject || "(no subject)",
    body: row.text_body || "",
    htmlBody: row.html_body || null,
    preview: (row.text_body || "").slice(0, 280),
    metadata,
    sourceId: row.source_id,
    folder: row.folder,
    readAt: row.read_at,
    unread: row.direction === "inbound" && !row.read_at,
    agentSummary: row.agent_summary,
    agentLabels,
    forwardedTo: row.forwarded_to,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    approvedByUserId: row.approved_by_user_id,
    receivedAt: row.received_at,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

async function normalizeAgentMailboxDraftInput(
  env: Pick<CoreAgentChatEnv, "DB">,
  mailbox: DbMailboxAliasRow,
  body: AgentMailboxDraftInput,
  existing?: DbMailboxMessageRow,
): Promise<NormalizedMailboxDraftInput | { error: string; status: number }> {
  const fromAddress = normalizeEmailText(body.fromAddress) || existing?.from_address || getAgentMailboxAddress(mailbox.alias_local_part);
  const toAddress = normalizeEmailText(body.toAddress ?? body.to) || existing?.to_address || "";
  if (!isValidEmail(fromAddress)) {
    return { error: "Draft sender is invalid", status: 400 };
  }
  if (!isValidEmail(toAddress)) {
    return { error: "Draft recipient is required", status: 400 };
  }

  const replyToMessageId = normalizeNullableText(body.replyToMessageId);
  const replyTo = replyToMessageId
    ? await getAgentMailboxMessageById(env, mailbox.id, replyToMessageId)
    : null;
  const threadKey =
    replyTo?.thread_key ||
    replyTo?.id ||
    existing?.thread_key ||
    crypto.randomUUID();
  const existingHeaders = getDraftOutboundHeaders(existing);
  const replyHeaders = getReplyThreadHeaders(replyTo);
  const messageIdHeader =
    existingHeaders.messageIdHeader || createMessageIdHeader(fromAddress);
  const source = normalizeNullableText(body.source);

  return {
    fromAddress,
    toAddress,
    subject: normalizeNullableText(body.subject) || existing?.subject || "",
    textBody: normalizeNullableText(body.textBody) || existing?.text_body || "",
    htmlBody:
      body.htmlBody === undefined
        ? existing?.html_body || null
        : normalizeNullableText(body.htmlBody),
    sourceId: replyTo?.id || existing?.source_id || null,
    threadKey,
    messageIdHeader,
    inReplyTo: replyHeaders.inReplyTo || existingHeaders.inReplyTo,
    referencesHeader: replyHeaders.referencesHeader || existingHeaders.referencesHeader,
    createdBy: source === "agent" ? "agent" : "owner",
  };
}

async function insertAgentMailboxDraft(
  env: Pick<CoreAgentChatEnv, "DB">,
  mailbox: DbMailboxAliasRow,
  input: NormalizedMailboxDraftInput,
): Promise<DbMailboxMessageRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO mailbox_messages (
       id, mailbox_id, direction, message_kind, status, thread_key,
       from_address, to_address, subject, text_body, html_body,
       metadata_json, source_id, folder, created_by, created_at, updated_at
     )
     VALUES (?, ?, 'outbound', 'draft', 'pending_approval', ?, ?, ?, ?, ?, ?, ?, ?, 'drafts', ?, ?, ?)`,
  )
    .bind(
      id,
      mailbox.id,
      input.threadKey,
      input.fromAddress,
      input.toAddress,
      input.subject,
      input.textBody,
      input.htmlBody,
      JSON.stringify(createDraftMetadata(input)),
      input.sourceId,
      input.createdBy,
      now,
      now,
    )
    .run();

  const draft = await getAgentMailboxMessageById(env, mailbox.id, id);
  if (!draft) throw new Error("Inserted draft could not be loaded");
  return draft;
}

async function updateAgentMailboxDraftRow(
  env: Pick<CoreAgentChatEnv, "DB">,
  mailboxId: string,
  draftId: string,
  input: NormalizedMailboxDraftInput,
): Promise<DbMailboxMessageRow | null> {
  await env.DB.prepare(
    `UPDATE mailbox_messages
     SET status = 'pending_approval',
         thread_key = ?,
         from_address = ?,
         to_address = ?,
         subject = ?,
         text_body = ?,
         html_body = ?,
         metadata_json = ?,
         source_id = ?,
         folder = 'drafts',
         created_by = ?,
         error_message = NULL,
         updated_at = ?
     WHERE id = ? AND mailbox_id = ? AND message_kind = 'draft'`,
  )
    .bind(
      input.threadKey,
      input.fromAddress,
      input.toAddress,
      input.subject,
      input.textBody,
      input.htmlBody,
      JSON.stringify(createDraftMetadata(input)),
      input.sourceId,
      input.createdBy,
      new Date().toISOString(),
      draftId,
      mailboxId,
    )
    .run();

  return getAgentMailboxMessageById(env, mailboxId, draftId);
}

function createDraftMetadata(input: NormalizedMailboxDraftInput): Record<string, unknown> {
  return {
    approval_required: true,
    outbound_headers: {
      message_id: input.messageIdHeader,
      in_reply_to: input.inReplyTo,
      references: input.referencesHeader,
    },
  };
}

function createMessageIdHeader(fromAddress: string): string {
  const domain = fromAddress.split("@")[1] || "me3.local";
  return `<${crypto.randomUUID()}@${domain}>`;
}

function getDraftOutboundHeaders(row?: DbMailboxMessageRow | null): {
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
} {
  const metadata = parseJsonRecord(row?.metadata_json || null);
  const outboundHeaders = isPlainObject(metadata.outbound_headers)
    ? metadata.outbound_headers
    : {};
  return {
    messageIdHeader: normalizeMessageHeader(outboundHeaders.message_id),
    inReplyTo: normalizeMessageHeader(outboundHeaders.in_reply_to),
    referencesHeader: normalizeReferencesHeader(outboundHeaders.references),
  };
}

function getReplyThreadHeaders(row?: DbMailboxMessageRow | null): {
  inReplyTo: string | null;
  referencesHeader: string | null;
} {
  if (!row) return { inReplyTo: null, referencesHeader: null };
  const rawHeaders = parseJsonRecord(row.raw_headers_json);
  const messageId = normalizeMessageHeader(
    rawHeaders["message-id"] ?? rawHeaders["Message-ID"] ?? rawHeaders.messageId,
  );
  const previousReferences = normalizeReferencesHeader(
    rawHeaders.references ?? rawHeaders.References,
  );
  return {
    inReplyTo: messageId,
    referencesHeader: normalizeReferencesHeader(
      [previousReferences, messageId].filter(Boolean).join(" "),
    ),
  };
}

function normalizeMessageHeader(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const header = value.trim();
  return header && header.length <= 998 ? header : null;
}

function normalizeReferencesHeader(value: unknown): string | null {
  if (Array.isArray(value)) {
    return normalizeReferencesHeader(value.filter((item) => typeof item === "string").join(" "));
  }
  return normalizeMessageHeader(value);
}

async function getAgentMailboxMessageById(
  env: Pick<CoreAgentChatEnv, "DB">,
  mailboxId: string,
  messageId: string,
): Promise<DbMailboxMessageRow | null> {
  return (
    (await env.DB.prepare(`${agentMailboxMessageSelectSql()} WHERE id = ? AND mailbox_id = ?`)
      .bind(messageId, mailboxId)
      .first<DbMailboxMessageRow>()) || null
  );
}

function normalizeContactMetadata(
  input: AgentContactInput,
): Record<string, unknown> | null {
  const metadata = { ...(input.metadata || {}) };
  if (input.closeness) metadata.closeness = input.closeness;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

function normalizeContactOutreachStatus(value: unknown): AgentContactOutreachStatus {
  const normalized = typeof value === "string" ? value.trim() : "";
  return OUTREACH_STATUSES.has(normalized as Exclude<AgentContactOutreachStatus, null>)
    ? (normalized as Exclude<AgentContactOutreachStatus, null>)
    : null;
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

async function upsertSandboxConnection(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<AgentSandboxConnection> {
  const existing = await env.DB.prepare(
    `SELECT id
     FROM agent_channel_connections
     WHERE user_id = ? AND channel = 'sandbox'
     LIMIT 1`,
  )
    .bind(ownerId)
    .first<AgentSandboxConnection>();

  if (existing?.id) {
    await env.DB.prepare(
      `UPDATE agent_channel_connections
       SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(existing.id)
      .run();
    return existing;
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO agent_channel_connections
       (id, user_id, channel, status, setup_token, connected_at, created_at, updated_at)
     VALUES (?, ?, 'sandbox', 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(id, ownerId, crypto.randomUUID())
    .run();

  return { id };
}

async function insertSandboxEvent(
  env: Pick<CoreAgentChatEnv, "DB">,
  input: {
    connectionId: string;
    turnId: string;
    messageText: string;
    replyToMessageId: string | number | null;
  },
): Promise<AgentSandboxSourceEvent> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO agent_channel_events
       (id, connection_id, channel, direction, event_type, status,
        reply_to_message_id, text_body, raw_json, created_at, updated_at)
     VALUES (?, ?, 'sandbox', 'inbound', 'message', 'received',
        ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      input.connectionId,
      input.replyToMessageId === null ? null : String(input.replyToMessageId),
      input.messageText,
      JSON.stringify({ runtime: "sandbox", turnId: input.turnId }),
    )
    .run();

  return { id };
}

async function runModelTurn(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  turnId: string,
): Promise<AgentSandboxDispatchResponse> {
  try {
    const replyText =
      route.providerId === "openai"
        ? await runOpenAi(route, messages)
        : route.providerId === "anthropic"
          ? await runAnthropic(route, messages)
        : await runWorkersAi(route, messages);

    return {
      ok: true,
      auditId: null,
      turnId,
      specialist: "core.agent-chat",
      replyText,
      model: route.model,
      source: route.providerId,
      fallbackReason: null,
      debugError: null,
      emailAction: null,
      reminderAction: null,
      contentAction: null,
      contactsChanged: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model request failed";
    return {
      ok: true,
      auditId: null,
      turnId,
      specialist: "core.agent-chat",
      replyText:
        "I reached the ME3 Core agent runtime, but the model call failed. Check your AI provider settings and try again.",
      model: route.model,
      source: "fallback",
      fallbackReason: "Model request failed",
      debugError: message,
      emailAction: null,
      reminderAction: null,
      contentAction: null,
      contactsChanged: false,
    };
  }
}

async function runOpenAi(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.apiKey) throw new Error("OpenAI API key is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${route.apiKey}`,
    },
    body: JSON.stringify({
      model: route.model,
      messages,
      temperature: 0.4,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI request failed (${response.status})`);
  }

  return (
    payload?.choices?.[0]?.message?.content?.trim() ||
    "I couldn't turn that into a useful reply just yet."
  );
}

async function runAnthropic(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.apiKey) throw new Error("Anthropic API key is not configured");

  const system = messages.find((message) => message.role === "system")?.content || "";
  const turns = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role, content: message.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": route.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: route.model,
      max_tokens: 800,
      system,
      messages: turns,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Anthropic request failed (${response.status})`);
  }

  return (
    payload?.content
      ?.map((part) => (part.type === "text" ? part.text || "" : ""))
      .join("")
      .trim() || "I couldn't turn that into a useful reply just yet."
  );
}

async function runWorkersAi(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.ai) throw new Error("Workers AI binding is not configured");
  const result = (await route.ai.run(route.model, { messages })) as
    | { response?: string; result?: { response?: string } }
    | string
    | null;

  if (typeof result === "string") return result.trim();
  return (
    result?.response?.trim() ||
    result?.result?.response?.trim() ||
    "I couldn't turn that into a useful reply just yet."
  );
}

async function resolveAiRoute(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<AiRoute> {
  const stored = await getStoredChatDefault(env, ownerId);
  const envProvider = normalizeProviderId(env.ME3_AI_CHAT_PROVIDER);
  const envModel = normalizeModel(env.ME3_AI_CHAT_MODEL) || normalizeModel(env.ME3_AI_MODEL);
  const storedProvider = normalizeProviderId(stored?.provider_id);
  const providerId =
    storedProvider ||
    envProvider ||
    (envModel ? "workers-ai" : null) ||
    (env.OPENAI_API_KEY ? "openai" : null) ||
    (env.ANTHROPIC_API_KEY ? "anthropic" : null) ||
    (env.AI ? "workers-ai" : "workers-ai");
  const model =
    normalizeModel(stored?.model) ||
    envModel ||
    defaultModelForProvider(providerId);
  const apiKey =
    providerId === "openai"
      ? env.OPENAI_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
      : providerId === "anthropic"
        ? env.ANTHROPIC_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
        : null;

  return {
    providerId,
    model,
    apiKey,
    ai: env.AI || null,
    configured:
      providerId === "workers-ai" ? Boolean(env.AI && model) : Boolean(apiKey && model),
  };
}

async function getStoredChatDefault(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<AiDefaultRow | null> {
  try {
    return env.DB.prepare(
      `SELECT provider_id, model
       FROM ai_model_defaults
       WHERE user_id = ? AND use_case = 'chat'
       LIMIT 1`,
    )
      .bind(ownerId)
      .first<AiDefaultRow>();
  } catch {
    return null;
  }
}

async function getStoredApiKey(
  env: CoreAgentChatEnv,
  ownerId: string,
  providerId: AiProviderId,
): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT provider_id, encrypted_api_key
       FROM ai_provider_credentials
       WHERE user_id = ? AND provider_id = ?
       LIMIT 1`,
    )
      .bind(ownerId, providerId)
      .first<AiCredentialRow>();
    if (!row?.encrypted_api_key) return null;
    const installKey = await getInstallEncryptionKey(env);
    return installKey ? decryptProviderSecret(row.encrypted_api_key, installKey) : null;
  } catch {
    return null;
  }
}

async function getInstallEncryptionKey(env: CoreAgentChatEnv): Promise<string | null> {
  if (env.TOKEN_ENCRYPTION_KEY) return env.TOKEN_ENCRYPTION_KEY;
  try {
    const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
      .bind(INSTALL_ENCRYPTION_KEY_NAME)
      .first<{ value: string }>();
    return row?.value || null;
  } catch {
    return null;
  }
}

async function decryptProviderSecret(
  encrypted: string,
  installKey: string,
): Promise<string | null> {
  const parts = encrypted.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const iv = decodeBase64UrlBytes(parts[1]);
  const ciphertext = decodeBase64UrlBytes(parts[2]);
  const key = await importSecretCryptoKey(installKey, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function importSecretCryptoKey(
  installKey: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(installKey),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function getOwnerProfile(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<OwnerProfileRow | null> {
  try {
    return env.DB.prepare(
      `SELECT id, email, name, username, bio, timezone
       FROM owner_profile
       WHERE id = ?
       LIMIT 1`,
    )
      .bind(ownerId)
      .first<OwnerProfileRow>();
  } catch {
    return null;
  }
}

async function loadRecentMessages(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const rows = await env.DB.prepare(
      `SELECT role, content
       FROM assistant_messages
       WHERE owner_id = ? AND role IN ('user', 'assistant')
       ORDER BY created_at DESC
       LIMIT 12`,
    )
      .bind(ownerId)
      .all<{ role: "user" | "assistant"; content: string }>();
    return (rows.results || []).reverse();
  } catch {
    return [];
  }
}

function buildChatMessages(
  owner: OwnerProfileRow | null,
  recent: Array<{ role: "user" | "assistant"; content: string }>,
  messageText: string,
  knowledgeContext: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const ownerName = owner?.name?.trim() || owner?.username?.trim() || "the owner";
  const system = [
    "You are ME3 Core, a concise personal/business assistant running inside the owner's private ME3 Core install.",
    `The owner is ${ownerName}.`,
    owner?.bio ? `Owner profile context: ${owner.bio}` : null,
    owner?.timezone ? `Owner timezone: ${owner.timezone}` : null,
    knowledgeContext,
    "Answer helpfully and plainly. Do not claim external actions are complete unless a tool result says they are.",
    "This first Core chat slice can converse and reason, but richer plugin tools are still being wired in.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    ...recent,
    { role: "user", content: messageText },
  ];
}

async function loadMe3KnowledgeRuntimeContext(
  env: CoreAgentChatEnv,
  aiRouteConfigured: boolean,
): Promise<string> {
  const context: Me3KnowledgeRuntimeContext = {
    surface: "core",
    chatRuntime: "conversation_only",
    configuredFeatureIds: aiRouteConfigured ? ["ai.chat_provider"] : [],
    missingFeatureIds: aiRouteConfigured ? [] : ["ai.chat_provider"],
  };

  try {
    const rows = await env.DB.prepare(
      `SELECT plugin_id, enabled, status
       FROM plugin_installations
       ORDER BY plugin_id`,
    ).bind().all<DbPluginInstallationRow>();
    const installations = rows.results || [];
    context.installedPluginIds = installations.map((row) => row.plugin_id);
    context.enabledPluginIds = installations
      .filter((row) => row.enabled !== 0 && row.status === "installed")
      .map((row) => row.plugin_id);
    context.setupRequiredPluginIds = installations
      .filter((row) => row.enabled !== 0 && row.status === "setup_required")
      .map((row) => row.plugin_id);
    context.disabledPluginIds = installations
      .filter((row) => row.enabled === 0 || row.status === "disabled")
      .map((row) => row.plugin_id);
  } catch {
    // Knowledge context should improve answers, not break chat when plugin state
    // has not been migrated yet.
  }

  return buildMe3CapabilityContext(context);
}

async function persistAssistantMessage(
  env: CoreAgentChatEnv,
  ownerId: string,
  role: "user" | "assistant",
  content: string,
) {
  try {
    await env.DB.prepare(
      "INSERT INTO assistant_messages (id, owner_id, role, content) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), ownerId, role, content)
      .run();
  } catch {
    // Conversation persistence is useful context, but chat turns should not fail on audit writes.
  }
}

function normalizeProviderId(value: unknown): AiProviderId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai") return "openai";
  if (normalized === "anthropic" || normalized === "claude") return "anthropic";
  if (
    normalized === "workers-ai" ||
    normalized === "workers_ai" ||
    normalized === "workers" ||
    normalized === "cloudflare"
  ) {
    return "workers-ai";
  }
  return null;
}

function normalizeModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const model = value.trim();
  if (!model || model.length > 160) return null;
  return model;
}

function defaultModelForProvider(providerId: AiProviderId): string {
  if (providerId === "openai") return DEFAULT_OPENAI_MODEL;
  if (providerId === "anthropic") return DEFAULT_ANTHROPIC_MODEL;
  return DEFAULT_WORKERS_AI_MODEL;
}
