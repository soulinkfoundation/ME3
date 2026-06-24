import {
  getUtcMsForLocalTime,
  normalizeTimeZone,
} from "@me3-core/plugin-calendar";
import {
  isCoreChatReminderCreateRequest,
  isCoreChatWeeklyReviewRequest,
  planCoreChatToolTurn,
  type CoreChatToolPlannerDecision,
} from "./planner";
import {
  buildMe3AgentContextPrompt,
  buildMe3CapabilityContext,
  createMe3AgentContextManifest,
  ME3_BUNDLED_AGENT_SKILLS,
  resolveMe3AgentContextPacket,
  summarizeMe3AgentContextManifest,
  type Me3AgentContextCalendarEvent,
  type Me3AgentContextContact,
  type Me3AgentContextEmailThread,
  type Me3AgentContextLifeSnapshot,
  type Me3AgentContextMissionStatement,
  type Me3AgentContextManifest,
  type Me3AgentContextPrivateMemory,
  type Me3AgentContextProject,
  type Me3AgentContextRecentMessage,
  type Me3AgentContextSource,
  type Me3AgentContextSkill,
  type Me3AgentContextTask,
  type Me3KnowledgeRuntimeContext,
} from "@me3/knowledge";
import {
  decodeMimeHeaderValue,
  parseEmailAddressHeader,
} from "../../../shared/email-headers";
import { classifyAssistantImageIntent } from "./image-intent";
import {
  DEFAULT_WORKERS_AI_IMAGE_GENERATION_MODEL,
  modelSupportsCapability,
  type AssistantImageCapability,
} from "./model-capabilities";

export {
  isCoreChatBookingLookupRequest,
  isCoreChatCapabilityExplorationRequest,
  isCoreChatMailboxDraftRecipientContinuation,
  isCoreChatMailboxDraftSaveRequest,
  isCoreChatMissionTaskArchiveRequest,
  isCoreChatMissionTaskCreateRequest,
  isCoreChatMissionTaskListRequest,
  isCoreChatMissionTaskUpdateRequest,
  isCoreChatReminderCreateRequest,
  isCoreChatReminderListRequest,
  isCoreChatWeeklyReviewRequest,
  planCoreChatToolTurn,
  type CoreChatCapabilityId,
  type CoreChatPlannerIntentKind,
  type CoreChatSideEffectLevel,
  type CoreChatToolPlannerDecision,
  type CoreChatToolPlannerInput,
} from "./planner";

export {
  CORE_CHAT_CAPABILITIES,
  CORE_CHAT_CAPABILITY_IDS,
  getCoreChatCapability,
  isCoreChatCapabilityApprovalRequired,
  validateCoreChatCapabilityContracts,
  type CoreChatApprovalMode,
  type CoreChatCapabilityContract,
  type CoreChatCapabilitySideEffect,
} from "./capabilities";

export {
  classifyAssistantImageIntent,
  type AssistantImageTurnIntent,
} from "./image-intent";

export {
  DEFAULT_WORKERS_AI_IMAGE_GENERATION_MODEL,
  modelSupportsCapability,
  modelSupportsImageInput,
  type AiAgentModelCapability,
  type AiAgentModelProviderId,
  type AssistantImageCapability,
} from "./model-capabilities";

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
export const CORE_MAILBOX_DAILY_INBOUND_LIMIT = 200;
export const CORE_MAILBOX_DAILY_OUTBOUND_LIMIT = 200;

export const AGENT_CHAT_RUNTIME = {
  id: AGENT_CHAT_PLUGIN_ID,
  packageName: "@me3-core/plugin-agent-chat",
  bundled: true,
  runtimeStatus: "assistant_chat_runtime",
  routes: ["/api/assistant/chat/turn", "/api/agent/sandbox"],
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
  threadId?: string | null;
  messageText: string;
  attachmentTextContext?: string | null;
  replyToMessageId?: string | number | null;
  selectedModel?: AgentChatModelSelection | null;
  attachments?: AgentChatAttachmentReference[];
};

export type AgentChatAttachmentReference = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  kind?: "text" | "image" | string | null;
  status?: string | null;
  storageKey?: string | null;
  hasText?: boolean | null;
  textTruncated?: boolean | null;
};

export type AgentChatModelSelection = {
  providerId: AiProviderId;
  model: string;
  optionId?: string | null;
};

export type AgentChatActionCardStatus =
  | "draft"
  | "pending_approval"
  | "pending"
  | "complete"
  | "failed";

export type AgentChatActionCardField = {
  label: string;
  value: string;
};

export type AgentChatActionCardLink = {
  label: string;
  href: string;
};

export type AgentChatActionCardRecord = {
  kind: "mailbox_draft" | "reminder" | "mission_task";
  id: string;
};

export type AgentChatActionCard = {
  id: string;
  kind:
    | "mailbox.draft_saved"
    | "reminder.created"
    | "mission.task_created"
    | "mission.task_updated"
    | "mission.task_archived";
  capabilityId: string;
  title: string;
  summary: string | null;
  status: AgentChatActionCardStatus;
  statusLabel: string;
  changed: AgentChatActionCardField[];
  records: AgentChatActionCardRecord[];
  primaryAction: AgentChatActionCardLink | null;
  secondaryActions: AgentChatActionCardLink[];
};

export type AgentSandboxDispatchResponse = {
  ok: boolean;
  auditId: string | null;
  turnId: string | null;
  threadId?: string | null;
  specialist: string | null;
  replyText: string | null;
  model: string | null;
  source: AgentChatSource;
  fallbackReason?: string | null;
  debugError?: string | null;
  contextPacketId?: string | null;
  contextManifest?: Me3AgentContextManifest | null;
  contextSummary?: string | null;
  emailAction?: {
    kind: "drafted" | "sent";
    draftId?: string;
  } | null;
  reminderAction?: {
    kind: "created" | "updated" | "cancelled" | "dismissed" | "listed";
    reminderId?: string;
    title?: string;
    remindAt?: string;
  } | null;
  actionCards?: AgentChatActionCard[] | null;
  imageAction?: AgentChatImageAction | null;
  contentAction?: null;
  contactsChanged?: boolean;
  modelAttempts?: AgentChatModelAttemptTrace[] | null;
  trace?: AgentChatTurnTrace | null;
  error?: string;
};

export type AgentChatImageAction = {
  kind: "generated" | "edited" | "blocked";
  status: "complete" | "failed" | "blocked";
  prompt: string;
  revisedPrompt: string | null;
  providerId: string | null;
  model: string | null;
  reason?: string | null;
  assets: Array<{
    id: string;
    attachmentId: string;
    name: string;
    mimeType: string;
    size: number;
    width?: number | null;
    height?: number | null;
    url: string;
    storageKey: string;
  }>;
};

type AgentChatGeneratedImageAsset = AgentChatImageAction["assets"][number];

type PendingAssistantMessageAssetLink = {
  id: string;
  attachmentId: string;
  role: "generated_output" | "input_reference";
  displayOrder: number;
  metadata: Record<string, unknown>;
};

type WorkersAiImageUsageEstimate = {
  width: number;
  height: number;
  outputTiles: number;
  costUsd: number;
  neurons: number;
  pricing: string;
};

export type AgentChatModelAttemptTrace = {
  providerId: AiProviderId;
  model: string;
  status: "succeeded" | "empty" | "failed";
  error: string | null;
};

export type AgentChatTurnTrace = {
  turnId: string;
  planner: CoreChatToolPlannerDecision;
  route: {
    path: "tool" | "model" | "fallback";
    capabilityId: string;
    ownerFacingLabel: string;
    handlerRoute: string;
    reason: string;
    setupChecks: string[];
    approvalRequired: boolean;
    sideEffectLevel: string;
    auditEventKind: string;
  };
  selectedModel: {
    providerId: AiProviderId;
    model: string;
    backupModel: string | null;
    configured: boolean;
    responseModel: string | null;
  } | null;
  context: {
    status: "not_attempted" | "loaded" | "failed";
    packetId: string | null;
    summary: string | null;
    sourceCount: number;
    sources: Array<{
      id: string;
      kind: string;
      label: string | null;
      visibility: string | null;
      reason: string | null;
    }>;
    error: string | null;
  };
  modelCall: {
    status: "not_attempted" | "succeeded" | "failed" | "fallback";
    providerId: AiProviderId | null;
    model: string | null;
    fallbackReason: string | null;
    debugError: string | null;
    attempts: AgentChatModelAttemptTrace[];
  };
  imageGeneration?: {
    intent: "generate" | "edit";
    status: "blocked" | "started" | "succeeded" | "failed";
    providerId: AiProviderId | null;
    model: string | null;
    capabilityChecked: AssistantImageCapability;
    assetCount: number;
    error: string | null;
  } | null;
  toolResult: {
    status: "not_attempted" | "succeeded" | "failed" | "clarified";
    specialist: string | null;
    source: AgentChatSource;
  };
  audit: {
    auditId: string | null;
  };
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
  preservedAttachmentKeys?: unknown;
  uploadedAttachments?: unknown;
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
    run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  };
  SITE_ASSETS?: R2Like;
  ENVIRONMENT?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ME3_ASSISTANT_DEBUG_TRACE?: string;
  ME3_ASSISTANT_TRACE?: string;
  ME3_AI_MODEL?: string;
  ME3_AI_DEFAULT_PROVIDER?: string;
  ME3_AI_DEFAULT_MODEL?: string;
  ME3_AI_CHAT_PROVIDER?: string;
  ME3_AI_CHAT_MODEL?: string;
  ME3_AI_CHAT_BACKUP_MODEL?: string;
  ME3_AI_IMAGE_GENERATION_PROVIDER?: string;
  ME3_AI_IMAGE_GENERATION_MODEL?: string;
  CORE_API_ORIGIN?: string;
  CORE_WEB_ORIGIN?: string;
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

type R2Like = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(key: string | string[]): Promise<void>;
};

type R2ObjectLike = {
  size: number;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
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

type CoreChatToolTurnPlan = {
  decision: CoreChatToolPlannerDecision;
  recent: Array<{ role: "user" | "assistant"; content: string }>;
  pendingMailboxDraftSave: PendingMailboxDraftSave | null;
};

type PendingMailboxDraftSave = {
  capabilityId: "core.mailbox.draft";
  status: "active" | "resolved" | "expired";
  missingField: "toAddress";
  threadId: string | null;
  draftText: string;
  subject: string | null;
  textBody: string;
  createdAt: string;
  expiresAt: string;
};

type OwnerProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  bio: string | null;
  timezone: string | null;
  locale?: string | null;
  assistant_name?: string | null;
};

type AiCredentialRow = {
  provider_id: string;
  encrypted_api_key: string | null;
};

type AiGatewaySettingsRow = {
  account_id: string | null;
  gateway_id: string | null;
  encrypted_api_token: string | null;
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

type DbCoreSetupProfileSiteRow = {
  username: string | null;
  custom_domain: string | null;
  custom_domain_status: string | null;
  published_at: string | null;
};

type CoreSetupPluginReadiness = {
  total: number;
  enabled: number;
  setupRequired: number;
  disabled: number;
};

type CoreSetupJobsReadiness = {
  total: number;
  active: number;
  needsSetup: number;
  paused: number;
  draft: number;
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

type DbBookingRow = {
  id: string;
  site_id: string;
  site_username: string | null;
  offer_id: string | null;
  booking_type: "one_to_one" | "class" | "retreat" | null;
  guest_name: string;
  guest_email: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: "confirmed" | "cancelled";
  notes: string | null;
  payment_status?: string | null;
  is_free_booking?: number | null;
  created_at: string;
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

type MailboxUnsubscribeAction = {
  available: true;
  mode: "one_click" | "link" | "mailto";
};

type DbMissionMemoryRow = {
  id: string;
  memory_kind: string;
  scope_kind: string;
  scope_id: string | null;
  title: string | null;
  body: string;
  confidence: number | null;
  source_ref: string | null;
  updated_at: string;
};

type DbMissionProjectRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  source_ref: string | null;
  updated_at: string;
};

type DbMissionTaskRow = {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  scheduled_for: string | null;
  source_ref: string | null;
  updated_at: string;
};

type AgentMissionTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  dueAt: string | null;
  status: string;
};

type DbAssistantSkillRow = {
  id: string;
  name: string;
  description: string | null;
  source_kind: string;
  source_ref: string | null;
  trust_level: string;
  trigger_hints_json: string;
  skill_md: string | null;
  updated_at: string;
};

type DbCalendarContextEventRow = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  created_at: string;
  updated_at?: string | null;
};

type DbMissionDashboardSettingsRow = {
  mission_statement: string | null;
  updated_at: string;
};

type DbMissionWheelSnapshotRow = {
  id: string;
  segments_json: string;
  notes_json: string;
  created_at: string;
};

type CoreChatAgentContextResult = {
  status: "loaded" | "failed";
  prompt: string | null;
  manifest: Me3AgentContextManifest | null;
  summary: string | null;
  error: string | null;
};

type CoreChatSetupReadiness = {
  prompt: string;
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
  preservedAttachments: AgentMailboxAttachmentMetadata[];
};

type AgentMailboxAttachmentMetadata = {
  filename?: string | null;
  mimeType?: string | null;
  disposition?: string | null;
  size?: number | null;
  storageKey?: string | null;
  sourceMessageId?: string | null;
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
  backupModel: string | null;
  apiKey: string | null;
  ai: CoreAgentChatEnv["AI"] | null;
  aiGateway: AiGatewayRuntimeConfig | null;
  configured: boolean;
};

type AiGatewayRuntimeConfig = {
  accountId: string | null;
  gatewayId: string | null;
  apiToken: string | null;
  routeWorkersAi: boolean;
  routeExternalProviders: boolean;
};

const DEFAULT_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const DEFAULT_WORKERS_AI_BACKUP_MODEL = "@cf/zai-org/glm-4.7-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_AI_GATEWAY_ID = "default";
const DEFAULT_IMAGE_GENERATION_WIDTH = 1024;
const DEFAULT_IMAGE_GENERATION_HEIGHT = 1024;
const INSTALL_ENCRYPTION_KEY_NAME = "TOKEN_ENCRYPTION_KEY";
const CHAT_CONTEXT_PROMPT_BUDGET_CHARS = 3500;
const DEFAULT_MISSION_STATEMENT_TEMPLATE_MARKER = "[who/what]";
const MAX_WHEEL_SNAPSHOT_AREAS = 8;
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
const PENDING_MAILBOX_DRAFT_SAVE_TTL_MS = 2 * 60 * 60 * 1000;

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
    typeof input.messageText === "string" &&
    isValidAgentChatModelSelection(input.selectedModel) &&
    isValidAgentChatAttachments(input.attachments)
  );
}

function isValidAgentChatAttachments(
  value: unknown,
): value is AgentChatAttachmentReference[] | null | undefined {
  if (value === undefined || value === null) return true;
  return Array.isArray(value);
}

function isValidAgentChatModelSelection(
  value: unknown,
): value is AgentChatModelSelection | null | undefined {
  if (value === undefined || value === null) return true;
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<AgentChatModelSelection>;
  return Boolean(
    normalizeProviderId(model.providerId) &&
      typeof model.model === "string" &&
      normalizeModel(model.model),
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
): Promise<AgentContact | { error: string; status: 400 | 409 }> {
  const input = parseAgentContactInput(value);
  if (!input.name?.trim()) {
    return { error: "Contact name is required", status: 400 };
  }
  if (input.email && (await contactEmailExists(env, userId, input.email))) {
    return duplicateContactEmailError();
  }

  const id = crypto.randomUUID();
  const metadata = normalizeContactMetadata(input);
  try {
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
  } catch (error) {
    if (isDuplicateContactEmailError(error)) return duplicateContactEmailError();
    throw error;
  }

  const contact = await getAgentContact(env, userId, id);
  if (!contact) return { error: "Contact not found", status: 400 };
  return contact;
}

export async function upsertAgentContact(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  value: unknown,
): Promise<
  { contact: AgentContact; created: boolean } | { error: string; status: 400 | 404 | 409 }
> {
  const input = parseAgentContactInput(value);
  if (!input.name?.trim()) {
    return { error: "Contact name is required", status: 400 };
  }

  const source = input.source || "manual";
  const sourceRef = input.sourceRef || null;
  const email = input.email || null;
  const { contacts } = await listAgentContacts(env, userId);
  const existing =
    (sourceRef
      ? contacts.find(
          (contact) =>
            contact.source === source && contact.sourceRef === sourceRef,
        )
      : null) ||
    (sourceRef && source === "soulink"
      ? contacts.find((contact) => contact.metadata?.soulinkNodeId === sourceRef)
      : null) ||
    (email
      ? contacts.find(
          (contact) => contact.email?.trim().toLowerCase() === email,
        )
      : null);

  if (!existing) {
    const created = await createAgentContact(env, userId, input);
    if ("error" in created) return created;
    return { contact: created, created: true };
  }

  const incomingMetadata = normalizeContactMetadata(input) || {};
  const existingMetadata = existing.metadata || {};
  const canRefreshIdentity =
    existing.source === source || existing.source === "soulink";
  const merged = await updateAgentContact(env, userId, existing.id, {
    name: canRefreshIdentity ? input.name || existing.name : existing.name,
    email: existing.email || input.email || null,
    phone: existing.phone,
    source: existing.source,
    sourceRef: canRefreshIdentity
      ? input.sourceRef || existing.sourceRef
      : existing.sourceRef,
    relationship: existing.relationship,
    status: existing.status,
    notes: existing.notes,
    tags: existing.tags,
    lastInteractionAt: input.lastInteractionAt || existing.lastInteractionAt,
    nextFollowupAt: existing.nextFollowupAt,
    outreachStatus: existing.outreachStatus,
    socialHandles: {
      ...existing.socialHandles,
      ...(input.socialHandles || {}),
    },
    metadata: {
      ...existingMetadata,
      ...incomingMetadata,
    },
  });

  if ("error" in merged) return merged;
  return { contact: merged, created: false };
}

export async function updateAgentContact(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  contactId: string,
  value: unknown,
): Promise<AgentContact | { error: string; status: 404 | 409 }> {
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
  if (
    merged.email &&
    (await contactEmailExists(env, userId, merged.email, contactId))
  ) {
    return duplicateContactEmailError();
  }

  try {
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
  } catch (error) {
    if (isDuplicateContactEmailError(error)) return duplicateContactEmailError();
    throw error;
  }

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
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_setup', 'all', ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          userId,
          aliasLocalPart,
          savedForwardingEmail,
          forwardingStatus,
          forwardingEnabled ? 1 : 0,
          forwardingMode,
          CORE_MAILBOX_DAILY_INBOUND_LIMIT,
          CORE_MAILBOX_DAILY_OUTBOUND_LIMIT,
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

export async function getAgentMailboxMessage(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageId: string,
): Promise<{ message: AgentMailboxMessage } | { error: string; status: number }> {
  const mailbox = await getAgentMailboxRow(env, userId);
  if (!mailbox) return { error: "Mailbox not found", status: 404 };

  const message = await getAgentMailboxMessageById(env, mailbox.id, messageId);
  if (!message) return { error: "Message not found", status: 404 };

  return { message: serializeAgentMailboxMessage(message) };
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
    metadata?: Record<string, unknown> | null;
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
    metadata: input.metadata,
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
  if (existing) return applyAgentTurnTracePolicy(env, { ...existing, ok: true });

  await storage.put("userId", input.userId);
  await storage.put("lastSandboxConnectionId", input.connectionId);
  await storage.put("lastSandboxTurnId", input.turnId);
  await storage.put("lastSandboxTurnAt", new Date().toISOString());

  const owner = await getOwnerProfile(env, input.userId);
  const toolPlan = await loadCoreChatToolTurnPlan(env, storage, input);
  const toolResponse = await maybeHandleCoreToolTurn(env, storage, input, owner, toolPlan);
  if (toolResponse) {
    await persistAssistantMessage(
      env,
      input.userId,
      "user",
      input.messageText,
      input.threadId,
      assistantUserMessageMetadataForInput(input),
    );
    if (toolResponse.replyText) {
      await persistAssistantMessage(
        env,
        input.userId,
        "assistant",
        toolResponse.replyText,
        input.threadId,
        assistantMessageMetadataForResponse(toolResponse),
      );
    }
    let response: AgentSandboxDispatchResponse = {
      ...toolResponse,
      threadId: input.threadId ?? null,
    };
    await touchAssistantThread(env, input.userId, input.threadId);
    response = attachAgentTurnTrace(env, response, {
      input,
      plannerDecision: toolPlan.decision,
      route: null,
      context: null,
    });
    await storage.put(resultKey, response);
    return response;
  }

  const imageIntent = classifyAssistantImageIntent(
    input.messageText,
    input.attachments,
  );
  const imageTurn = await maybeHandleAssistantImageTurn(
    env,
    input,
    imageIntent,
  );
  if (imageTurn) {
    await persistAssistantMessage(
      env,
      input.userId,
      "user",
      input.messageText,
      input.threadId,
      assistantUserMessageMetadataForInput(input),
    );
    if (imageTurn.response.replyText) {
      const assistantMessageId = await persistAssistantMessage(
        env,
        input.userId,
        "assistant",
        imageTurn.response.replyText,
        input.threadId,
        assistantMessageMetadataForResponse(imageTurn.response),
      );
      if (assistantMessageId && imageTurn.messageAssetLinks?.length) {
        await persistAssistantMessageAssetLinks(env, {
          ownerId: input.userId,
          threadId: input.threadId ?? null,
          messageId: assistantMessageId,
          links: imageTurn.messageAssetLinks,
        });
      }
    }
    let response: AgentSandboxDispatchResponse = {
      ...imageTurn.response,
      threadId: input.threadId ?? null,
    };
    await touchAssistantThread(env, input.userId, input.threadId);
    response = attachAgentTurnTrace(env, response, {
      input,
      plannerDecision: toolPlan.decision,
      route: imageTurn.route,
      context: null,
    });
    await storage.put(resultKey, response);
    return response;
  }

  const route = await resolveAiRoute(env, input.userId, input.selectedModel);
  const runtimeMessageText = appendAgentAttachmentReferenceContext(
    input.messageText,
    input.attachments,
    input.attachmentTextContext,
  );
  const recent = toolPlan.recent;
  const knowledgeContext = await loadMe3KnowledgeRuntimeContext(env, route.configured);
  const setupReadiness = await loadCoreChatSetupReadiness(
    env,
    input.userId,
    route.configured,
    owner,
  );
  const agentContext = await loadCoreChatAgentContext(env, {
    ownerId: input.userId,
    owner,
    recent,
    messageText: runtimeMessageText,
  });
  const messages = buildChatMessages(
    owner,
    recent,
    runtimeMessageText,
    knowledgeContext,
    agentContext?.prompt ?? null,
    buildCoreChatOrientationPrompt(toolPlan.decision, setupReadiness),
  );

  let response: AgentSandboxDispatchResponse;
  if (!route.configured) {
    response = {
      ok: true,
      auditId: null,
      turnId: input.turnId,
      specialist: "core.agent-chat",
      replyText: isCoreChatOrientationTurn(toolPlan.decision)
        ? buildCoreChatOrientationFallbackReply(owner, setupReadiness)
        : "ME3 chat is connected for your ME3 installation. Add an AI provider in Account settings or bind Workers AI to turn this into a live model response.",
      model: route.model,
      source: "fallback",
      fallbackReason: "AI provider setup required",
      debugError: null,
      emailAction: null,
      reminderAction: null,
      actionCards: null,
      contentAction: null,
      contactsChanged: false,
    };
  } else {
    response = await runModelTurn(route, messages, input.turnId);
  }
  response = attachAgentContextToResponse(response, agentContext);
  if (toolPlan.pendingMailboxDraftSave) {
    await resolvePendingMailboxDraftSave(storage, input);
  }

  await persistAssistantMessage(
    env,
    input.userId,
    "user",
    input.messageText,
    input.threadId,
    assistantUserMessageMetadataForInput(input),
  );
  if (response.replyText) {
    await persistAssistantMessage(
      env,
      input.userId,
      "assistant",
      response.replyText,
      input.threadId,
      assistantMessageMetadataForResponse(response),
    );
  }
  response.threadId = input.threadId ?? null;
  await touchAssistantThread(env, input.userId, input.threadId);
  response = attachAgentTurnTrace(env, response, {
    input,
    plannerDecision: toolPlan.decision,
    route,
    context: agentContext,
  });

  await storage.put(resultKey, response);
  return response;
}

function appendAgentAttachmentReferenceContext(
  messageText: string,
  attachments: AgentSandboxDispatchInput["attachments"],
  attachmentTextContext?: string | null,
) {
  const references = normalizeAgentAttachmentReferences(attachments);
  const textContext = normalizeNullableText(attachmentTextContext);
  if (references.length === 0 && !textContext) return messageText;
  const rendered = references
    .map((attachment, index) =>
      [
        `${index + 1}. ${attachment.name || "Attachment"}`,
        `kind=${attachment.kind || "unknown"}`,
        `type=${attachment.mimeType || "unknown"}`,
        `size=${typeof attachment.size === "number" ? attachment.size : "unknown"}`,
        attachment.hasText ? "text=available" : null,
        attachment.textTruncated ? "text=truncated" : null,
        attachment.storageKey ? `storageRef=${attachment.storageKey}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    )
    .join("\n");
  const parts = [messageText];
  if (rendered) parts.push(`Assistant attachment references:\n${rendered}`);
  if (textContext) parts.push(textContext);
  return parts.join("\n\n");
}

function normalizeAgentAttachmentReferences(
  attachments: AgentSandboxDispatchInput["attachments"],
): AgentChatAttachmentReference[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((attachment) => attachment && typeof attachment === "object")
    .map((attachment) => ({
      id: normalizeNullableText((attachment as AgentChatAttachmentReference).id),
      name: normalizeNullableText((attachment as AgentChatAttachmentReference).name),
      mimeType: normalizeNullableText((attachment as AgentChatAttachmentReference).mimeType),
      size:
        typeof (attachment as AgentChatAttachmentReference).size === "number" &&
        Number.isFinite((attachment as AgentChatAttachmentReference).size)
          ? Math.max(0, Math.round((attachment as AgentChatAttachmentReference).size || 0))
          : null,
      kind: normalizeNullableText((attachment as AgentChatAttachmentReference).kind),
      status: normalizeNullableText((attachment as AgentChatAttachmentReference).status),
      storageKey: normalizeNullableText((attachment as AgentChatAttachmentReference).storageKey),
      hasText: Boolean((attachment as AgentChatAttachmentReference).hasText),
      textTruncated: Boolean((attachment as AgentChatAttachmentReference).textTruncated),
    }))
    .filter((attachment) => attachment.status === "ready" && Boolean(attachment.id));
}

function assistantUserMessageMetadataForInput(
  input: Pick<AgentSandboxDispatchInput, "attachments">,
): Record<string, unknown> | null {
  const attachments = normalizeAgentAttachmentReferences(input.attachments);
  return attachments.length ? { attachments } : null;
}

type AssistantImageTurnResult = {
  response: AgentSandboxDispatchResponse;
  route: AiRoute | null;
  messageAssetLinks?: PendingAssistantMessageAssetLink[];
};

async function maybeHandleAssistantImageTurn(
  env: CoreAgentChatEnv,
  input: AgentSandboxDispatchInput,
  intent: ReturnType<typeof classifyAssistantImageIntent>,
): Promise<AssistantImageTurnResult | null> {
  if (intent.kind === "none") return null;

  const prompt = input.messageText.trim();
  if (intent.kind === "ambiguous") {
    return {
      route: null,
      response: blockedImageResponse({
        turnId: input.turnId,
        prompt,
        kind: "blocked",
        reason: "image_generation_intent_ambiguous",
        replyText:
          "Do you want me to generate an image, or write a text prompt for one?",
        route: null,
      }),
    };
  }

  if (intent.capability === "image_edit") {
    return {
      route: null,
      response: blockedImageResponse({
        turnId: input.turnId,
        prompt,
        kind: "blocked",
        reason: "image_edit_not_enabled",
        replyText:
          "Image editing is not enabled in ME3 Core yet. I can help draft edit instructions, but I won't send this to a text model as if it can edit images.",
        route: null,
      }),
    };
  }

  const route = await resolveImageGenerationRoute(
    env,
    input.userId,
    input.selectedModel,
    intent.capability,
  );

  if (!route) {
    return {
      route: null,
      response: blockedImageResponse({
        turnId: input.turnId,
        prompt,
        kind: "blocked",
        reason: "image_generation_route_unavailable",
        replyText:
          "Image generation needs a compatible image route. Configure Workers AI or another image provider before trying again.",
        route: null,
      }),
    };
  }

  if (!modelSupportsCapability(route.providerId, route.model, intent.capability)) {
    return {
      route,
      response: blockedImageResponse({
        turnId: input.turnId,
        prompt,
        kind: "blocked",
        reason: "image_generation_route_incompatible",
        replyText:
          "The configured image route does not support image generation. Use Workers AI FLUX.2 [dev] or another tested image model.",
        route,
      }),
    };
  }

  if (!route.configured) {
    return {
      route,
      response: blockedImageResponse({
        turnId: input.turnId,
        prompt,
        kind: "blocked",
        reason: "image_generation_provider_unconfigured",
        replyText:
          "Image generation is routed to a compatible model, but the provider is not configured yet. Add the provider setup in Account > AI model before trying again.",
        route,
      }),
    };
  }

  if (!env.SITE_ASSETS) {
    return {
      route,
      response: failedImageResponse({
        turnId: input.turnId,
        prompt,
        reason: "image_generation_storage_unavailable",
        replyText:
          "Image generation needs the SITE_ASSETS R2 binding so generated files can be saved. Add storage before trying again.",
        route,
      }),
    };
  }

  try {
    const generated = await runAssistantImageGeneration(env, {
      ownerId: input.userId,
      threadId: input.threadId ?? null,
      turnId: input.turnId,
      prompt,
      route,
    });
    const replyText = "Generated an image and saved it to this conversation.";
    return {
      route,
      messageAssetLinks: generated.messageAssetLinks,
      response: {
        ok: true,
        auditId: null,
        turnId: input.turnId,
        specialist: "core.agent-chat.image-generation",
        replyText,
        model: route.model,
        source: route.providerId,
        fallbackReason: null,
        debugError: null,
        emailAction: null,
        reminderAction: null,
        actionCards: null,
        imageAction: {
          kind: "generated",
          status: "complete",
          prompt,
          revisedPrompt: generated.revisedPrompt,
          providerId: route.providerId,
          model: route.model,
          reason: null,
          assets: generated.assets,
        },
        contentAction: null,
        contactsChanged: false,
      },
    };
  } catch (error) {
    return {
      route,
      response: failedImageResponse({
        turnId: input.turnId,
        prompt,
        reason: "image_generation_failed",
        replyText:
          "I tried to generate the image, but the image provider or asset storage failed before I could save it.",
        route,
        debugError: modelErrorMessage(error),
      }),
    };
  }

}

function blockedImageResponse(input: {
  turnId: string;
  prompt: string;
  kind: AgentChatImageAction["kind"];
  reason: string;
  replyText: string;
  route: AiRoute | null;
}): AgentSandboxDispatchResponse {
  return {
    ok: true,
    auditId: null,
    turnId: input.turnId,
    specialist: "core.agent-chat.image-generation",
    replyText: input.replyText,
    model: input.route?.model ?? null,
    source: "fallback",
    fallbackReason: "Image generation blocked",
    debugError: input.reason,
    emailAction: null,
    reminderAction: null,
    actionCards: null,
    imageAction: {
      kind: input.kind,
      status: "blocked",
      prompt: input.prompt,
      revisedPrompt: null,
      providerId: input.route?.providerId ?? null,
      model: input.route?.model ?? null,
      reason: input.reason,
      assets: [],
    },
    contentAction: null,
    contactsChanged: false,
  };
}

function failedImageResponse(input: {
  turnId: string;
  prompt: string;
  reason: string;
  replyText: string;
  route: AiRoute | null;
  debugError?: string | null;
}): AgentSandboxDispatchResponse {
  return {
    ok: true,
    auditId: null,
    turnId: input.turnId,
    specialist: "core.agent-chat.image-generation",
    replyText: input.replyText,
    model: input.route?.model ?? null,
    source: "fallback",
    fallbackReason: "Image generation failed",
    debugError: input.debugError || input.reason,
    emailAction: null,
    reminderAction: null,
    actionCards: null,
    imageAction: {
      kind: "generated",
      status: "failed",
      prompt: input.prompt,
      revisedPrompt: null,
      providerId: input.route?.providerId ?? null,
      model: input.route?.model ?? null,
      reason: input.reason,
      assets: [],
    },
    contentAction: null,
    contactsChanged: false,
  };
}

async function runAssistantImageGeneration(
  env: CoreAgentChatEnv,
  input: {
    ownerId: string;
    threadId: string | null;
    turnId: string;
    prompt: string;
    route: AiRoute;
  },
): Promise<{
  revisedPrompt: string | null;
  assets: AgentChatGeneratedImageAsset[];
  messageAssetLinks: PendingAssistantMessageAssetLink[];
}> {
  if (input.route.providerId !== "workers-ai") {
    throw new Error(`${input.route.providerId} image generation is not supported yet.`);
  }
  if (!input.route.ai) throw new Error("Workers AI binding is not configured.");
  if (!env.SITE_ASSETS) throw new Error("SITE_ASSETS R2 binding is not configured.");

  const { bytes, mimeType, revisedPrompt } = await runWorkersAiImageGeneration(
    input.route,
    input.prompt,
  );
  const attachmentId = crypto.randomUUID();
  const extension = extensionForMimeType(mimeType);
  const filename = `generated-image-${attachmentId}.${extension}`;
  const storageKey = [
    "assistant",
    input.ownerId,
    "generated",
    new Date().toISOString().slice(0, 10),
    filename,
  ].join("/");
  const metadata = {
    source: "assistant-image-generation",
    providerId: input.route.providerId,
    model: input.route.model,
    revisedPrompt,
    turnId: input.turnId,
  };

  await env.SITE_ASSETS.put(storageKey, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      ownerId: input.ownerId,
      threadId: input.threadId || "",
      attachmentId,
      source: "assistant-image-generation",
    },
  });

  try {
    await env.DB.prepare(
      `INSERT INTO assistant_attachments
         (id, owner_id, thread_id, filename, mime_type, size, kind, status,
          storage_key, extracted_text, text_truncated, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, 'image', 'ready', ?, NULL, 0, ?)`,
    )
      .bind(
        attachmentId,
        input.ownerId,
        input.threadId,
        filename,
        mimeType,
        bytes.byteLength,
        storageKey,
        JSON.stringify(metadata),
      )
      .run();
  } catch (error) {
    await env.SITE_ASSETS.delete(storageKey).catch(() => undefined);
    throw error;
  }

  await recordAssistantImageUsage(env, {
    ownerId: input.ownerId,
    providerId: input.route.providerId,
    model: input.route.model,
    width: DEFAULT_IMAGE_GENERATION_WIDTH,
    height: DEFAULT_IMAGE_GENERATION_HEIGHT,
    turnId: input.turnId,
    attachmentId,
  }).catch(() => undefined);

  const asset: AgentChatGeneratedImageAsset = {
    id: attachmentId,
    attachmentId,
    name: filename,
    mimeType,
    size: bytes.byteLength,
    width: null,
    height: null,
    url: `/api/assistant/attachments/${encodeURIComponent(attachmentId)}/content`,
    storageKey,
  };

  return {
    revisedPrompt,
    assets: [asset],
    messageAssetLinks: [
      {
        id: crypto.randomUUID(),
        attachmentId,
        role: "generated_output",
        displayOrder: 0,
        metadata,
      },
    ],
  };
}

async function runWorkersAiImageGeneration(
  route: AiRoute,
  prompt: string,
): Promise<{ bytes: Uint8Array; mimeType: string; revisedPrompt: string | null }> {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(DEFAULT_IMAGE_GENERATION_WIDTH));
  form.append("height", String(DEFAULT_IMAGE_GENERATION_HEIGHT));
  const formResponse = new Response(form);
  const body = formResponse.body;
  const contentType = formResponse.headers.get("content-type");
  if (!body || !contentType) {
    throw new Error("Could not prepare Workers AI image request.");
  }
  const result = await route.ai!.run(
    route.model,
    {
      multipart: {
        body,
        contentType,
      },
    },
  );
  return normalizeWorkersAiImageResult(result);
}

async function recordAssistantImageUsage(
  env: CoreAgentChatEnv,
  input: {
    ownerId: string;
    providerId: AiProviderId;
    model: string;
    width: number;
    height: number;
    turnId: string;
    attachmentId: string;
  },
): Promise<void> {
  const estimate = estimateWorkersAiImageUsage(input.model, {
    width: input.width,
    height: input.height,
  });
  await env.DB.prepare(
    `INSERT INTO ai_usage_events (
       id, user_id, source, kind, provider, model, request_count,
       successful_request_count, failed_request_count, tokens_in, tokens_out,
       estimated_cost_usd, metadata_json, created_at
     )
     VALUES (?, ?, 'local', 'image', ?, ?, 1, 1, 0, 0, 0, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.ownerId,
      input.providerId,
      input.model,
      estimate.costUsd,
      JSON.stringify({
        estimated: true,
        pricing: estimate.pricing,
        width: estimate.width,
        height: estimate.height,
        outputTiles: estimate.outputTiles,
        neurons: estimate.neurons,
        turnId: input.turnId,
        attachmentId: input.attachmentId,
      }),
      new Date().toISOString(),
    )
    .run();
}

function estimateWorkersAiImageUsage(
  model: string,
  input: { width: number; height: number },
): WorkersAiImageUsageEstimate {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const outputTiles = Math.max(1, Math.ceil(width / 512) * Math.ceil(height / 512));
  const normalizedModel = model.trim().toLowerCase();

  if (normalizedModel === "@cf/black-forest-labs/flux-2-klein-4b") {
    return {
      width,
      height,
      outputTiles,
      costUsd: outputTiles * 0.000287,
      neurons: outputTiles * 26.05,
      pricing: "workers-ai-flux-2-klein-4b-output-tiles",
    };
  }

  if (normalizedModel === "@cf/black-forest-labs/flux-2-dev") {
    const assumedSteps = 25;
    return {
      width,
      height,
      outputTiles,
      costUsd: outputTiles * assumedSteps * 0.00041,
      neurons: outputTiles * assumedSteps * 37.5,
      pricing: "workers-ai-flux-2-dev-output-tiles-assumed-25-steps",
    };
  }

  return {
    width,
    height,
    outputTiles,
    costUsd: 0,
    neurons: 0,
    pricing: "unknown-workers-ai-image-model",
  };
}

async function normalizeWorkersAiImageResult(
  result: unknown,
): Promise<{ bytes: Uint8Array; mimeType: string; revisedPrompt: string | null }> {
  if (result instanceof Response) {
    const bytes = new Uint8Array(await result.arrayBuffer());
    return {
      bytes,
      mimeType: inferImageMimeType(bytes, result.headers.get("content-type")),
      revisedPrompt: null,
    };
  }

  if (result instanceof ArrayBuffer) {
    const bytes = new Uint8Array(result);
    return { bytes, mimeType: inferImageMimeType(bytes, null), revisedPrompt: null };
  }

  if (ArrayBuffer.isView(result)) {
    const bytes = new Uint8Array(
      result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength),
    );
    return { bytes, mimeType: inferImageMimeType(bytes, null), revisedPrompt: null };
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    const imageBase64 =
      normalizeNullableText(record.image) ||
      normalizeNullableText(record.data) ||
      normalizeNullableText(record.result);
    if (imageBase64) {
      const bytes = decodeBase64Image(imageBase64);
      return {
        bytes,
        mimeType: inferImageMimeType(bytes, normalizeNullableText(record.mimeType)),
        revisedPrompt:
          normalizeNullableText(record.revised_prompt) ||
          normalizeNullableText(record.revisedPrompt),
      };
    }
  }

  throw new Error("Workers AI image response did not include image bytes.");
}

function decodeBase64Image(value: string): Uint8Array {
  const normalized = value.includes(",") ? value.split(",").pop() || "" : value;
  const binary = atob(normalized.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.byteLength === 0) {
    throw new Error("Workers AI returned an empty image.");
  }
  return bytes;
}

function inferImageMimeType(bytes: Uint8Array, fallback: string | null): string {
  const normalizedFallback = fallback?.split(";")[0]?.trim().toLowerCase() || "";
  if (normalizedFallback.startsWith("image/")) return normalizedFallback;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

function extensionForMimeType(mimeType: string): "png" | "jpg" | "webp" {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function loadCoreChatToolTurnPlan(
  env: CoreAgentChatEnv,
  storage: StorageLike,
  input: AgentSandboxDispatchInput,
): Promise<CoreChatToolTurnPlan> {
  const [recent, pendingMailboxDraftSave] = await Promise.all([
    loadRecentMessages(env, input.userId, input.threadId),
    loadPendingMailboxDraftSave(storage, input),
  ]);
  return {
    recent,
    pendingMailboxDraftSave,
    decision: planCoreChatToolTurn({
      messageText: input.messageText.trim(),
      hasRecentAssistantEmailDraft: Boolean(latestAssistantEmailDraft(recent)),
      hasPendingMailboxDraftRecipient: Boolean(pendingMailboxDraftSave),
    }),
  };
}

async function maybeHandleCoreToolTurn(
  env: CoreAgentChatEnv,
  storage: StorageLike,
  input: AgentSandboxDispatchInput,
  owner: OwnerProfileRow | null,
  toolPlan: CoreChatToolTurnPlan,
): Promise<AgentSandboxDispatchResponse | null> {
  const messageText = input.messageText.trim();
  const recent = toolPlan.recent;
  const plannerDecision = toolPlan.decision;

  if (
    plannerDecision.kind === "conversation" ||
    plannerDecision.capabilityId === "core.agent-chat.conversation"
  ) {
    return null;
  }

  if (plannerDecision.capabilityId === "core.mailbox.draft") {
    const draftPlan = await parseMailboxDraftSaveRequest(
      env,
      input.userId,
      messageText,
      recent,
      toolPlan.pendingMailboxDraftSave,
    );
    if ("error" in draftPlan) {
      if (draftPlan.pendingMailboxDraftSave) {
        await savePendingMailboxDraftSave(
          storage,
          input,
          draftPlan.pendingMailboxDraftSave,
        );
      }
      return toolResponse(input.turnId, "core.mailbox.draft", draftPlan.error, {
        fallbackReason: "Mailbox draft details required",
      });
    }

    const draft = await createAgentMailboxDraft(env, input.userId, draftPlan.input);
    if ("error" in draft) {
      return toolResponse(input.turnId, "core.mailbox.draft", draft.error, {
        fallbackReason: "Mailbox draft could not be saved",
      });
    }
    await resolvePendingMailboxDraftSave(storage, input);

    return toolResponse(
      input.turnId,
      "core.mailbox.draft",
      "Done. I saved that email as a draft in `/email` for your review. It has not been sent.",
      {
        emailAction: {
          kind: "drafted",
          draftId: draft.draft.id,
        },
        actionCards: [
          buildMailboxDraftSavedActionCard(
            draft.draft,
            draftPlan.input.toAddress,
            draftPlan.input.subject,
          ),
        ],
      },
    );
  }

  if (plannerDecision.capabilityId === "core.reminders.list") {
    const reminders = await listPendingAgentReminders(env, input.userId);
    const replyText = reminders.length
      ? [
          `You have ${reminders.length} pending reminder${reminders.length === 1 ? "" : "s"}:`,
          ...reminders.map(
            (reminder) =>
              `- ${reminder.title} at ${formatAgentDateTime(reminder.remindAt, owner?.timezone || reminder.timezone)}`,
          ),
        ].join("\n")
      : "You do not have any pending reminders right now.";

    return toolResponse(input.turnId, "core.reminders.list", replyText, {
      reminderAction: { kind: "listed" },
    });
  }

  if (plannerDecision.capabilityId === "core.reminders.create") {
    const reminderPlan = parseReminderChatRequest(messageText, owner);
    if (!reminderPlan) return null;
    if ("error" in reminderPlan) {
      return toolResponse(input.turnId, "core.reminders.create", reminderPlan.error, {
        fallbackReason: "Reminder details required",
      });
    }

    const reminder = await createAgentReminder(env, input.userId, reminderPlan.input);
    if ("error" in reminder) {
      return toolResponse(input.turnId, "core.reminders.create", reminder.error, {
        fallbackReason: "Reminder could not be created",
      });
    }

    return toolResponse(
      input.turnId,
      "core.reminders.create",
      `Done. I set a reminder for ${formatAgentDateTime(reminder.remindAt, reminder.timezone)}: ${reminder.title}.`,
      {
        reminderAction: {
          kind: "created",
          reminderId: reminder.id,
          title: reminder.title,
          remindAt: reminder.remindAt,
        },
        actionCards: [buildReminderCreatedActionCard(reminder)],
      },
    );
  }

  if (plannerDecision.capabilityId === "core.mission.task.create") {
    const taskPlan = await parseMissionTaskChatRequest(env, input.userId, messageText, owner);
    if ("error" in taskPlan) {
      return toolResponse(input.turnId, "core.mission.task.create", taskPlan.error, {
        fallbackReason: "Mission task details required",
      });
    }

    const task = await createAgentMissionTask(env, input.userId, taskPlan.input);
    if ("error" in task) {
      return toolResponse(input.turnId, "core.mission.task.create", task.error, {
        fallbackReason: "Mission task could not be created",
      });
    }

    return toolResponse(
      input.turnId,
      "core.mission.task.create",
      `Done. I added "${task.title}" to ${task.projectName} in Mission Control.`,
      {
        actionCards: [buildMissionTaskCreatedActionCard(task)],
      },
    );
  }

  if (plannerDecision.capabilityId === "core.mission.task.list") {
    const taskPlan = await parseMissionTaskListChatRequest(env, input.userId, messageText);
    if ("error" in taskPlan) {
      return toolResponse(input.turnId, "core.mission.task.list", taskPlan.error, {
        fallbackReason: "Mission task list details required",
      });
    }

    const replyText = formatMissionTaskListReply(taskPlan.tasks, taskPlan.filterLabel);
    return toolResponse(input.turnId, "core.mission.task.list", replyText);
  }

  if (plannerDecision.capabilityId === "core.mission.task.update") {
    const taskPlan = await parseMissionTaskUpdateChatRequest(env, input.userId, messageText, owner);
    if ("error" in taskPlan) {
      return toolResponse(input.turnId, "core.mission.task.update", taskPlan.error, {
        fallbackReason: "Mission task update details required",
      });
    }

    const task = await updateAgentMissionTask(env, input.userId, taskPlan.input);
    if ("error" in task) {
      return toolResponse(input.turnId, "core.mission.task.update", task.error, {
        fallbackReason: "Mission task could not be updated",
      });
    }

    return toolResponse(
      input.turnId,
      "core.mission.task.update",
      `Done. I updated "${task.title}" in Mission Control.`,
      {
        actionCards: [buildMissionTaskActionCard(task, "updated")],
      },
    );
  }

  if (plannerDecision.capabilityId === "core.mission.task.archive") {
    const taskPlan = await parseMissionTaskArchiveChatRequest(env, input.userId, messageText);
    if ("error" in taskPlan) {
      return toolResponse(input.turnId, "core.mission.task.archive", taskPlan.error, {
        fallbackReason: "Mission task archive details required",
      });
    }

    const task = await archiveAgentMissionTask(env, input.userId, taskPlan.input);
    if ("error" in task) {
      return toolResponse(input.turnId, "core.mission.task.archive", task.error, {
        fallbackReason: "Mission task could not be archived",
      });
    }

    return toolResponse(
      input.turnId,
      "core.mission.task.archive",
      `Done. I archived "${task.title}" in Mission Control.`,
      {
        actionCards: [buildMissionTaskActionCard(task, "archived")],
      },
    );
  }

  if (plannerDecision.capabilityId === "core.bookings.lookup") {
    const bookings = await listUpcomingBookings(env, input.userId);
    const replyText = bookings.length
      ? [
          `You have ${bookings.length} upcoming booking${bookings.length === 1 ? "" : "s"}:`,
          ...bookings.map(
            (booking) =>
              `- ${booking.guest_name} at ${formatAgentDateTime(booking.starts_at, owner?.timezone)} (${booking.duration_minutes} min)`,
          ),
        ].join("\n")
      : "I could not find any upcoming confirmed bookings.";

    return toolResponse(input.turnId, "core.bookings.lookup", replyText);
  }

  return null;
}

function toolResponse(
  turnId: string,
  specialist: string,
  replyText: string,
  options: Partial<
    Pick<
      AgentSandboxDispatchResponse,
      | "fallbackReason"
      | "debugError"
      | "emailAction"
      | "reminderAction"
      | "actionCards"
    >
  > = {},
): AgentSandboxDispatchResponse {
  return {
    ok: true,
    auditId: null,
    turnId,
    specialist,
    replyText,
    model: null,
    source: "tool",
    fallbackReason: options.fallbackReason ?? null,
    debugError: options.debugError ?? null,
    emailAction: options.emailAction ?? null,
    reminderAction: options.reminderAction ?? null,
    actionCards: options.actionCards ?? null,
    contentAction: null,
    contactsChanged: false,
  };
}

function buildMailboxDraftSavedActionCard(
  draft: AgentMailboxMessage,
  fallbackToAddress: unknown,
  fallbackSubject: unknown,
): AgentChatActionCard {
  const toAddress = draft.toAddress || normalizeNullableText(fallbackToAddress) || "Unknown";
  const subject = draft.subject || normalizeNullableText(fallbackSubject) || "(no subject)";
  return {
    id: `mailbox-draft:${draft.id}`,
    kind: "mailbox.draft_saved",
    capabilityId: "core.mailbox.draft",
    title: "Email draft saved",
    summary: "Saved to mailbox drafts for review. It has not been sent.",
    status: "pending_approval",
    statusLabel: "Needs review",
    changed: [
      { label: "Draft", value: "Saved in mailbox" },
      { label: "To", value: toAddress },
      { label: "Subject", value: subject },
      { label: "Status", value: "Not sent" },
    ],
    records: [{ kind: "mailbox_draft", id: draft.id }],
    primaryAction: { label: "Review draft", href: "/email" },
    secondaryActions: [],
  };
}

function buildReminderCreatedActionCard(reminder: AgentReminder): AgentChatActionCard {
  return {
    id: `reminder:${reminder.id}`,
    kind: "reminder.created",
    capabilityId: "core.reminders.create",
    title: "Reminder created",
    summary: reminder.title,
    status: "complete",
    statusLabel: "Complete",
    changed: [
      { label: "Reminder", value: reminder.title },
      {
        label: "When",
        value: formatAgentDateTime(reminder.remindAt, reminder.timezone),
      },
      { label: "Status", value: "Pending reminder" },
    ],
    records: [{ kind: "reminder", id: reminder.id }],
    primaryAction: { label: "Open calendar", href: "/calendar" },
    secondaryActions: [],
  };
}

function buildMissionTaskCreatedActionCard(task: AgentMissionTask): AgentChatActionCard {
  return buildMissionTaskActionCard(task, "created");
}

function buildMissionTaskActionCard(
  task: AgentMissionTask,
  action: "created" | "updated" | "archived",
): AgentChatActionCard {
  const title =
    action === "created"
      ? "Mission Control task created"
      : action === "updated"
        ? "Mission Control task updated"
        : "Mission Control task archived";
  const capabilityId =
    action === "created"
      ? "core.mission.task.create"
      : action === "updated"
        ? "core.mission.task.update"
        : "core.mission.task.archive";
  return {
    id: `mission-task:${task.id}`,
    kind:
      action === "created"
        ? "mission.task_created"
        : action === "updated"
          ? "mission.task_updated"
          : "mission.task_archived",
    capabilityId,
    title,
    summary: task.title,
    status: "complete",
    statusLabel: "Complete",
    changed: [
      { label: "Task", value: task.title },
      { label: "Project", value: task.projectName },
      ...(task.dueAt ? [{ label: "Due", value: task.dueAt }] : []),
      { label: "Status", value: action === "archived" ? "archived" : task.status },
    ],
    records: [{ kind: "mission_task", id: task.id }],
    primaryAction: { label: "Open Mission Control", href: "/mission-control" },
    secondaryActions: [],
  };
}

async function parseMissionTaskChatRequest(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageText: string,
  owner: OwnerProfileRow | null,
): Promise<
  | { input: { title: string; projectId: string; projectName: string; dueAt: string | null } }
  | { error: string }
> {
  const projects = await loadAgentMissionProjects(env, userId);
  const projectName = extractMissionTaskProjectName(messageText);
  const project = projectName
    ? findAgentMissionProject(projects, projectName)
    : projects.find((item) => item.slug === "personal") || projects[0];
  if (!project) {
    return { error: "I could not find a Mission Control project to add that to." };
  }
  if (projectName && !findAgentMissionProject(projects, projectName)) {
    return { error: `I could not find a Mission Control project called "${projectName}".` };
  }

  const title = extractMissionTaskTitle(messageText, projectName);
  if (!title) {
    return { error: "Please include the task title to add to Mission Control." };
  }

  return {
    input: {
      title,
      projectId: project.id,
      projectName: project.name,
      dueAt: extractMissionTaskDueDate(messageText, owner?.timezone || "UTC"),
    },
  };
}

async function createAgentMissionTask(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  input: { title: string; projectId: string; projectName: string; dueAt: string | null },
): Promise<AgentMissionTask | { error: string }> {
  const id = crypto.randomUUID();
  const status = "backlog";
  const columnId = `${input.projectId}:${status}`;

  try {
    // ponytail: duplicate the tiny Mission Control insert here; extract shared service if chat writes grow.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mission_project_columns
         (id, user_id, project_id, name, status, position)
       VALUES (?, ?, ?, 'Backlog', 'backlog', 0)`,
    )
      .bind(columnId, userId, input.projectId)
      .run()
      .catch(() => null);

    await env.DB.prepare(
      `INSERT INTO mission_tasks
         (id, user_id, project_id, column_id, title, description, status, priority, due_at, source_kind)
       VALUES (?, ?, ?, ?, ?, NULL, 'backlog', 3, ?, 'agent_chat')`,
    )
      .bind(id, userId, input.projectId, columnId, input.title, input.dueAt)
      .run();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Mission task could not be created.",
    };
  }

  return {
    id,
    title: input.title,
    projectId: input.projectId,
    projectName: input.projectName,
    dueAt: input.dueAt,
    status,
  };
}

async function parseMissionTaskListChatRequest(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageText: string,
): Promise<
  | { tasks: AgentMissionTask[]; filterLabel: string }
  | { error: string }
> {
  const [tasks, projects] = await Promise.all([
    loadAgentMissionTasks(env, userId),
    loadAgentMissionProjects(env, userId),
  ]);
  const projectName = extractMissionTaskProjectName(messageText) ||
    extractMissionTaskListProjectName(messageText);
  const project = projectName ? findAgentMissionProject(projects, projectName) : null;
  if (projectName && !project) {
    return { error: `I could not find a Mission Control project called "${projectName}".` };
  }

  const status = parseMissionTaskStatus(messageText);
  const filtered = tasks.filter((task) => {
    if (project && task.projectId !== project.id) return false;
    if (status && task.status !== status) return false;
    return true;
  });
  const parts = [
    status ? missionTaskStatusLabel(status) : null,
    "tasks",
    project ? `for ${project.name}` : null,
  ].filter(Boolean);

  return {
    tasks: filtered,
    filterLabel: parts.join(" "),
  };
}

async function parseMissionTaskUpdateChatRequest(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageText: string,
  owner: OwnerProfileRow | null,
): Promise<
  | {
      input: {
        taskId: string;
        title: string;
        projectId: string;
        projectName: string;
        status: string;
        dueAt: string | null;
      };
    }
  | { error: string }
> {
  const tasks = await loadAgentMissionTasks(env, userId);
  const projects = await loadAgentMissionProjects(env, userId);
  const parsed = parseMissionTaskUpdateText(messageText, owner?.timezone || "UTC");
  if (!parsed.targetTitle) {
    return { error: "Please include the task title to update." };
  }

  const task = findAgentMissionTask(tasks, parsed.targetTitle);
  if ("error" in task) return task;

  const projectName = parsed.projectName;
  const project = projectName ? findAgentMissionProject(projects, projectName) : null;
  if (projectName && !project) {
    return { error: `I could not find a Mission Control project called "${projectName}".` };
  }

  const status = parsed.status || task.status || "backlog";
  return {
    input: {
      taskId: task.id,
      title: parsed.title || task.title,
      projectId: project?.id || task.projectId,
      projectName: project?.name || task.projectName,
      status,
      dueAt: parsed.dueAt === undefined ? task.dueAt : parsed.dueAt,
    },
  };
}

async function parseMissionTaskArchiveChatRequest(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageText: string,
): Promise<
  | { input: { taskId: string; title: string; projectId: string; projectName: string; dueAt: string | null; status: string } }
  | { error: string }
> {
  const targetTitle = normalizeNullableText(
    messageText
      .replace(/^(?:please\s+)?/i, "")
      .replace(/^(?:can|could|would|will)\s+you\s+/i, "")
      .replace(/^(?:delete|archive|remove)\s+(?:the\s+)?(?:mission\s+control\s+)?task\s*/i, "")
      .replace(/[.?!]+$/g, ""),
  );
  if (!targetTitle) return { error: "Please include the task title to archive." };
  const task = findAgentMissionTask(await loadAgentMissionTasks(env, userId), targetTitle);
  if ("error" in task) return task;
  return {
    input: {
      taskId: task.id,
      title: task.title,
      projectId: task.projectId,
      projectName: task.projectName,
      dueAt: task.dueAt,
      status: task.status,
    },
  };
}

async function updateAgentMissionTask(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  input: {
    taskId: string;
    title: string;
    projectId: string;
    projectName: string;
    status: string;
    dueAt: string | null;
  },
): Promise<AgentMissionTask | { error: string }> {
  const columnId = `${input.projectId}:${input.status}`;

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mission_project_columns
         (id, user_id, project_id, name, status, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        columnId,
        userId,
        input.projectId,
        missionTaskStatusLabel(input.status),
        input.status,
        missionTaskStatusPosition(input.status),
      )
      .run()
      .catch(() => null);

    await env.DB.prepare(
      `UPDATE mission_tasks
       SET project_id = ?, column_id = ?, title = ?, status = ?, due_at = ?,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
      .bind(
        input.projectId,
        columnId,
        input.title,
        input.status,
        input.dueAt,
        input.taskId,
        userId,
      )
      .run();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Mission task could not be updated.",
    };
  }

  return {
    id: input.taskId,
    title: input.title,
    projectId: input.projectId,
    projectName: input.projectName,
    dueAt: input.dueAt,
    status: input.status,
  };
}

async function archiveAgentMissionTask(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  input: {
    taskId: string;
    title: string;
    projectId: string;
    projectName: string;
    dueAt: string | null;
    status: string;
  },
): Promise<AgentMissionTask | { error: string }> {
  try {
    await env.DB.prepare(
      `UPDATE mission_tasks
       SET archived_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
      .bind(input.taskId, userId)
      .run();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Mission task could not be archived.",
    };
  }

  return {
    id: input.taskId,
    title: input.title,
    projectId: input.projectId,
    projectName: input.projectName,
    dueAt: input.dueAt,
    status: input.status,
  };
}

async function loadAgentMissionProjects(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<Array<{ id: string; name: string; slug: string }>> {
  const rows = await env.DB.prepare(
    `SELECT id, name, slug
     FROM mission_projects
     WHERE user_id = ? AND status != 'archived'
     ORDER BY CASE WHEN slug = 'personal' THEN 0 ELSE 1 END, name ASC`,
  )
    .bind(userId)
    .all<{ id: string; name: string; slug: string }>();
  return rows.results || [];
}

async function loadAgentMissionTasks(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<AgentMissionTask[]> {
  const rows = await env.DB.prepare(
    `SELECT t.id, t.title, t.project_id, t.status, t.due_at, t.scheduled_for,
            p.name AS project_name
     FROM mission_tasks t
     LEFT JOIN mission_projects p
       ON p.id = t.project_id AND p.user_id = t.user_id
     WHERE t.user_id = ? AND t.archived_at IS NULL
     ORDER BY t.updated_at DESC, t.id ASC
     LIMIT 100`,
  )
    .bind(userId)
    .all<{
      id: string;
      title: string;
      project_id: string | null;
      status: string;
      due_at: string | null;
      scheduled_for: string | null;
      project_name: string | null;
    }>();

  return (rows.results || []).flatMap((row) => {
    if (!row.project_id) return [];
    return [
      {
        id: row.id,
        title: row.title,
        projectId: row.project_id,
        projectName: row.project_name || "Mission Control",
        dueAt: row.due_at || row.scheduled_for || null,
        status: row.status,
      },
    ];
  });
}

function findAgentMissionTask(
  tasks: AgentMissionTask[],
  title: string,
): AgentMissionTask | { error: string } {
  const normalized = normalizeMissionTaskText(title);
  const exact = tasks.filter((task) => normalizeMissionTaskText(task.title) === normalized);
  if (exact.length === 1) return exact[0];

  const partial = tasks.filter((task) => normalizeMissionTaskText(task.title).includes(normalized));
  const matches = exact.length ? exact : partial;
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return { error: `I found multiple Mission Control tasks matching "${title}". Please use a more specific title.` };
  }
  return { error: `I could not find a Mission Control task matching "${title}".` };
}

function findAgentMissionProject(
  projects: Array<{ id: string; name: string; slug: string }>,
  name: string,
) {
  const normalized = normalizeMissionTaskText(name);
  return projects.find(
    (project) =>
      normalizeMissionTaskText(project.name) === normalized ||
      normalizeMissionTaskText(project.slug) === normalized,
  );
}

function parseMissionTaskUpdateText(
  messageText: string,
  timezone: string,
): {
  targetTitle: string | null;
  title: string | null;
  projectName: string | null;
  status: string | null;
  dueAt: string | null | undefined;
} {
  const rename = messageText.match(
    /^\s*(?:please\s+)?(?:rename|update)\s+(?:the\s+)?(?:mission\s+control\s+)?task\s+["“]?(.+?)["”]?\s+to\s+["“]?(.+?)["”]?[.?!]*$/i,
  );
  if (rename) {
    return {
      targetTitle: normalizeNullableText(rename[1]),
      title: normalizeNullableText(rename[2]),
      projectName: null,
      status: null,
      dueAt: undefined,
    };
  }

  const projectName = extractMissionTaskProjectName(messageText);
  const status = parseMissionTaskStatus(messageText);
  const hasDue = /\b(?:due|by|today|tomorrow|20\d{2}-\d{2}-\d{2})\b/i.test(messageText);
  const dueAt = hasDue
    ? extractMissionTaskDueDate(messageText, timezone)
    : undefined;
  let target = messageText
    .replace(/^(?:please\s+)?/i, "")
    .replace(/^(?:can|could|would|will)\s+you\s+/i, "")
    .replace(/^(?:mark|move|update|reschedule|organize|organise)\s+(?:the\s+)?(?:mission\s+control\s+)?task\s*/i, "")
    .replace(/\b(?:as|to)\s+(?:done|complete|completed|backlog|todo|to do|doing|in progress|review)\b/gi, "")
    .replace(/\b(?:due|by|to)\s+(?:today|tomorrow|20\d{2}-\d{2}-\d{2})\b/gi, "")
    .replace(/\b(?:today|tomorrow|20\d{2}-\d{2}-\d{2})\b/gi, "");

  if (projectName) {
    target = target.replace(
      new RegExp(
        `\\b(?:to|in|under|for)\\s+(?:the\\s+)?(?:mission\\s+control\\s+)?project\\s+["“]?${escapeRegExp(projectName)}["”]?`,
        "i",
      ),
      "",
    );
  }

  return {
    targetTitle: normalizeNullableText(target.replace(/[.?!]+$/g, "")),
    title: null,
    projectName,
    status,
    dueAt,
  };
}

function formatMissionTaskListReply(tasks: AgentMissionTask[], filterLabel: string): string {
  if (!tasks.length) return `I could not find any ${filterLabel}.`;
  const completedTasks = tasks.filter((task) => task.status === "done");
  const openTasks = tasks.filter((task) => task.status !== "done");
  const lines = [`I found ${tasks.length} ${filterLabel}:`];
  if (openTasks.length > 0) {
    lines.push(
      "",
      "Open tasks:",
      ...openTasks.slice(0, 20).map((task, index) => {
        const due = task.dueAt ? `, due ${task.dueAt}` : "";
        return `${index + 1}. ${task.title} (${task.projectName}, ${missionTaskStatusLabel(task.status)}${due})`;
      }),
    );
  }
  if (completedTasks.length > 0) {
    lines.push(
      "",
      "Completed tasks:",
      ...completedTasks.slice(0, 20).map((task, index) => `${index + 1}. ${task.title}`),
    );
  }
  const shown = Math.min(openTasks.length, 20) + Math.min(completedTasks.length, 20);
  return [
    ...lines,
    ...(tasks.length > shown ? [`...and ${tasks.length - shown} more.`] : []),
  ].join("\n");
}

function extractMissionTaskProjectName(messageText: string): string | null {
  const match = messageText.match(
    /\b(?:to|in|under|for)\s+(?:the\s+)?(?:mission\s+control\s+)?project\s+["“]?([^"”?.]+?)["”]?(?:\s+(?:to|due|by|today|tomorrow)\b|[.?!]*$)/i,
  );
  return normalizeNullableText(match?.[1]);
}

function extractMissionTaskListProjectName(messageText: string): string | null {
  const match = messageText.match(
    /\b(?:for|in)\s+["“]?([^"”?.]+?)["”]?(?:\s+(?:tasks?|todos?)\b|[.?!]*$)/i,
  );
  const value = normalizeNullableText(match?.[1]);
  if (!value || /^(?:backlog|todo|to do|doing|in progress|review|done|complete|completed)$/i.test(value)) {
    return null;
  }
  return value;
}

function parseMissionTaskStatus(messageText: string): string | null {
  if (/\b(?:done|complete|completed)\b/i.test(messageText)) return "done";
  if (/\b(?:doing|in progress)\b/i.test(messageText)) return "in_progress";
  if (/\breview\b/i.test(messageText) && !isCoreChatWeeklyReviewRequest(messageText)) return "review";
  if (/\b(?:backlog|todo|to do)\b/i.test(messageText)) return "backlog";
  return null;
}

function missionTaskStatusLabel(status: string): string {
  if (status === "in_progress") return "Doing";
  if (status === "review") return "Review";
  if (status === "done") return "Done";
  return "Backlog";
}

function missionTaskStatusPosition(status: string): number {
  if (status === "in_progress") return 1;
  if (status === "review") return 2;
  if (status === "done") return 3;
  return 0;
}

function extractMissionTaskTitle(
  messageText: string,
  projectName: string | null,
): string | null {
  let title = messageText
    .replace(/^(?:please\s+)?/i, "")
    .replace(/^(?:can|could|would|will)\s+you\s+/i, "")
    .replace(/^(?:add|create|make)\s+(?:a\s+)?(?:mission\s+control\s+)?task\s*/i, "")
    .replace(/\b(?:called|named|titled)\s+/i, "")
    .replace(/\b(?:today|tomorrow|due\s+(?:today|tomorrow)|by\s+(?:today|tomorrow))\b/gi, "")
    .replace(/\bdue\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\bby\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "");

  if (projectName) {
    title = title.replace(
      new RegExp(
        `\\b(?:to|in|under|for)\\s+(?:the\\s+)?(?:mission\\s+control\\s+)?project\\s+["“]?${escapeRegExp(projectName)}["”]?`,
        "i",
      ),
      "",
    );
  }

  return normalizeNullableText(
    title
      .replace(/^\s*(?:to|for|about|that)\s+/i, "")
      .replace(/[.?!]+$/g, ""),
  );
}

function extractMissionTaskDueDate(
  messageText: string,
  timezone: string,
): string | null {
  const explicit = messageText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit) return explicit[1];
  if (/\btomorrow\b/i.test(messageText)) return localDateKey(1, timezone);
  if (/\btoday\b/i.test(messageText)) return localDateKey(0, timezone);
  return null;
}

function localDateKey(offsetDays: number, timezone: string): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timezone) || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function normalizeMissionTaskText(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function parseMailboxDraftSaveRequest(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageText: string,
  recent: Array<{ role: "user" | "assistant"; content: string }>,
  pendingMailboxDraftSave?: PendingMailboxDraftSave | null,
): Promise<
  | { input: AgentMailboxDraftInput }
  | { error: string; pendingMailboxDraftSave?: PendingMailboxDraftSave }
> {
  const latestAssistantDraft = pendingMailboxDraftSave
    ? { content: pendingMailboxDraftSave.draftText }
    : latestAssistantEmailDraft(recent);
  if (!latestAssistantDraft) {
    return {
      error:
        "I can save a draft, but I need the draft text first. Paste the email body or ask me to draft it again.",
    };
  }

  const parsed = pendingMailboxDraftSave
    ? {
        subject: pendingMailboxDraftSave.subject,
        body: pendingMailboxDraftSave.textBody,
      }
    : parseDraftText(latestAssistantDraft.content);
  const textBody = parsed.body.trim();
  if (!textBody) {
    return {
      error:
        "I found the request to save a draft, but I could not identify the email body to save.",
    };
  }

  const toAddress =
    extractEmailAddress(messageText) ||
    extractEmailAddress(latestAssistantDraft.content) ||
    (await resolveDraftRecipientFromContacts(env, userId, messageText, latestAssistantDraft.content));
  if (!toAddress) {
    return {
      error:
        "I can save that as a draft, but I need the recipient email address first.",
      pendingMailboxDraftSave: buildPendingMailboxDraftSave(
        latestAssistantDraft.content,
        parsed,
      ),
    };
  }

  return {
    input: {
      toAddress,
      subject: parsed.subject || "Draft email",
      textBody,
      source: "agent",
    },
  };
}

function buildPendingMailboxDraftSave(
  draftText: string,
  parsed: { subject: string | null; body: string },
): PendingMailboxDraftSave {
  const nowMs = Date.now();
  return {
    capabilityId: "core.mailbox.draft",
    status: "active",
    missingField: "toAddress",
    threadId: null,
    draftText: draftText.trim(),
    subject: parsed.subject,
    textBody: parsed.body.trim(),
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + PENDING_MAILBOX_DRAFT_SAVE_TTL_MS).toISOString(),
  };
}

async function loadPendingMailboxDraftSave(
  storage: StorageLike,
  input: Pick<AgentSandboxDispatchInput, "userId" | "threadId">,
): Promise<PendingMailboxDraftSave | null> {
  try {
    const key = pendingMailboxDraftSaveStorageKey(input);
    const pending = normalizePendingMailboxDraftSave(await storage.get(key));
    if (!pending) return null;
    if (!isActivePendingMailboxDraftSave(pending)) {
      await storage.put(key, {
        ...pending,
        status: "expired",
        expiresAt: new Date().toISOString(),
      });
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

async function savePendingMailboxDraftSave(
  storage: StorageLike,
  input: Pick<AgentSandboxDispatchInput, "userId" | "threadId">,
  pending: PendingMailboxDraftSave,
): Promise<void> {
  try {
    const threadId = normalizePendingMailboxDraftThreadId(input.threadId);
    await storage.put(pendingMailboxDraftSaveStorageKey(input), {
      ...pending,
      status: "active",
      threadId,
    });
  } catch {
    // Pending clarification state should improve follow-up routing, not fail chat.
  }
}

async function resolvePendingMailboxDraftSave(
  storage: StorageLike,
  input: Pick<AgentSandboxDispatchInput, "userId" | "threadId">,
): Promise<void> {
  try {
    const key = pendingMailboxDraftSaveStorageKey(input);
    const pending = normalizePendingMailboxDraftSave(await storage.get(key));
    if (!pending) return;
    await storage.put(key, {
      ...pending,
      status: "resolved",
      expiresAt: new Date().toISOString(),
    });
  } catch {
    // Draft persistence has already succeeded; stale pending state can expire.
  }
}

function pendingMailboxDraftSaveStorageKey(
  input: Pick<AgentSandboxDispatchInput, "userId" | "threadId">,
): string {
  const threadKey = normalizePendingMailboxDraftThreadId(input.threadId) || "__global__";
  return `agent-chat:pending:core.mailbox.draft:${encodeURIComponent(input.userId)}:${encodeURIComponent(threadKey)}`;
}

function normalizePendingMailboxDraftThreadId(value: unknown): string | null {
  return normalizeNullableText(value);
}

function normalizePendingMailboxDraftSave(value: unknown): PendingMailboxDraftSave | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingMailboxDraftSave>;
  if (candidate.capabilityId !== "core.mailbox.draft") return null;
  if (
    candidate.status !== "active" &&
    candidate.status !== "resolved" &&
    candidate.status !== "expired"
  ) {
    return null;
  }
  if (candidate.status !== "active") return null;
  if (candidate.missingField !== "toAddress") return null;
  const draftText = normalizeNullableText(candidate.draftText);
  const textBody = normalizeNullableText(candidate.textBody);
  const expiresAt = normalizeNullableText(candidate.expiresAt);
  const createdAt = normalizeNullableText(candidate.createdAt);
  if (!draftText || !textBody || !expiresAt || !createdAt) return null;
  return {
    capabilityId: "core.mailbox.draft",
    status: "active",
    missingField: "toAddress",
    threadId: normalizePendingMailboxDraftThreadId(candidate.threadId),
    draftText,
    subject: normalizeNullableText(candidate.subject),
    textBody,
    createdAt,
    expiresAt,
  };
}

function isActivePendingMailboxDraftSave(pending: PendingMailboxDraftSave): boolean {
  const expiresAtMs = Date.parse(pending.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

function latestAssistantEmailDraft(
  recent: Array<{ role: "user" | "assistant"; content: string }>,
) {
  return [...recent]
    .reverse()
    .find((message) => message.role === "assistant" && looksLikeEmailDraft(message.content));
}

function looksLikeEmailDraft(text: string): boolean {
  return /\b(subject|subject line|to:|hi|hello|dear)\b/i.test(text) &&
    /\b(save this|save it|draft|send|recipient|to:|subject:|regards|thanks|best)\b/i.test(text);
}

function parseDraftText(text: string): { subject: string | null; body: string } {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const subjectMatch = normalized.match(
    /^\s*(?:\*\*)?\s*(?:subject|subject line)\s*:?\s*(?:\*\*)?\s*(.+)$/im,
  );
  const subject = stripSimpleMarkdown(subjectMatch?.[1] || "").trim() || null;
  let body = stripAgentDraftWrapperText(normalized)
    .replace(/^\s*[-–—]{3,}\s*$/gm, "")
    .replace(/^\s*(?:\*\*)?\s*(?:subject|subject line)\s*:?\s*(?:\*\*)?\s*.+$/im, "")
    .replace(/^\s*(?:\*\*)?\s*(?:to|recipient)\s*:?\s*(?:\*\*)?\s*.+$/im, "")
    .trim();
  const savePromptIndex = body.search(
    /\n\s*(?:[-–—]\s*)?(?:this is a chat draft only|if you want|if you(?:'|’)d like|if you(?:'|’)re happy|want me to|would you like|send me|I can save)/i,
  );
  if (savePromptIndex >= 0) body = body.slice(0, savePromptIndex).trim();
  return { subject, body: stripSimpleMarkdown(body).trim() };
}

function stripAgentDraftWrapperText(text: string): string {
  let body = text.replace(/\r\n/g, "\n").trim();
  const draftMarker = body.match(
    /(?:^|\n)\s*(?:here(?:'|’)s|here is)\s+(?:the\s+)?(?:a\s+)?(?:friendly\s+)?draft(?:\s+(?:email|reply|message))?(?:\s+for\s+(?:the\s+)?(?:email|reply|message)(?:\s+to\s+[^:\n]+)?)?\s*:?\s*(?:\n|$)/i,
  );
  if (draftMarker?.index !== undefined) {
    body = body.slice(draftMarker.index + draftMarker[0].length).trim();
  }
  body = body.replace(
    /^\s*(?:here(?:'|’)s|here is)\s+(?:a\s+)?(?:friendly\s+)?draft(?:\s+(?:email|reply|message))?(?:\s+for\s+(?:the\s+)?(?:email|reply|message)(?:\s+to\s+[^:\n]+)?)?\s*:?\s*$/im,
    "",
  );
  const closingPromptIndex = body.search(
    /\n\s*(?:[-–—]\s*)?(?:please\s+let\s+me\s+know\s+if\s+you(?:'|’)d\s+like\s+(?:me\s+)?to\s+(?:make\s+any\s+changes\s+or\s+if\s+you(?:'|’)d\s+like\s+me\s+to\s+)?save\s+this\s+draft\.?|this is a chat draft only|if you want|if you(?:'|’)d like|if you(?:'|’)re happy|want me to|would you like|send me|I can save)/i,
  );
  if (closingPromptIndex >= 0) body = body.slice(0, closingPromptIndex).trim();
  return body.trim();
}

function stripSimpleMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
}

function extractEmailAddress(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.trim().toLowerCase() || null;
}

async function resolveDraftRecipientFromContacts(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  messageText: string,
  draftText: string,
): Promise<string | null> {
  const name = extractDraftRecipientName(messageText) || extractDraftRecipientName(draftText);
  const needle = normalizeContactLookupName(name);
  if (!needle) return null;
  const { contacts } = await listAgentContacts(env, userId);
  const match = contacts.find(
    (contact) =>
      contact.status !== "archived" &&
      Boolean(contact.email) &&
      contactMatchesDraftRecipientName(contact, needle),
  );
  return normalizeEmail(match?.email);
}

function extractDraftRecipientName(text: string): string | null {
  const match = text.match(/\bto\s+["'“”]?([^"'“”,.!?;\n]+)["'“”]?/iu);
  const phrase = match?.[1]
    ?.replace(/\b(?:about|regarding|re|subject|saying|with)\b[\s\S]*$/i, "")
    .trim();
  return phrase || null;
}

function contactMatchesDraftRecipientName(contact: AgentContact, needle: string): boolean {
  return contactDraftRecipientNames(contact).some((candidate) => {
    const normalized = normalizeContactLookupName(candidate);
    if (!normalized) return false;
    return normalized === needle || normalized.split(" ")[0] === needle;
  });
}

function contactDraftRecipientNames(contact: AgentContact): string[] {
  const metadata = contact.metadata || {};
  const aliases = Array.isArray(metadata.aliases)
    ? metadata.aliases.filter((alias): alias is string => typeof alias === "string")
    : [];
  return [contact.name, ...aliases, ...contact.tags];
}

function normalizeContactLookupName(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/^["'“”]+|["'“”]+$/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    : "";
}

function parseReminderChatRequest(
  messageText: string,
  owner: OwnerProfileRow | null,
): { input: AgentReminderInput } | { error: string } | null {
  if (!isCoreChatReminderCreateRequest(messageText)) return null;

  const timezone = normalizeTimeZone(owner?.timezone) || "UTC";
  const explicitDate = parseExplicitDate(messageText);
  const relativeMs = parseRelativeReminderOffsetMs(messageText);
  const weekdayDate = parseReminderWeekdayDate(messageText, timezone);
  const dayOffset = /\btomorrow\b/i.test(messageText) ? 1 : 0;
  const time = parseExplicitReminderTime(messageText) || "09:00";
  const recurrence = parseReminderRecurrenceInput(messageText);
  let date: string;
  let parsedTime = time;

  if (relativeMs !== null) {
    const parts = dateTimePartsForInstant(new Date(Date.now() + relativeMs), timezone);
    date = parts.date;
    parsedTime = parts.time;
  } else {
    date = explicitDate || weekdayDate || addDaysToDate(localDateForTimezone(timezone), dayOffset);
  }

  const title = extractReminderTitle(messageText);
  if (!title) {
    return {
      error:
        "I can set that reminder, but I need what you want to be reminded about.",
    };
  }

  if (
    !explicitDate &&
    !weekdayDate &&
    relativeMs === null &&
    !/\btoday|tomorrow\b/i.test(messageText)
  ) {
    return {
      error:
        "I can set that reminder. Please include a date, or say today/tomorrow or in a few hours.",
    };
  }

  return {
    input: {
      title,
      date,
      time: parsedTime,
      timezone,
      recurrence,
    },
  };
}

function parseExplicitDate(messageText: string): string | null {
  const match = messageText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1] || null;
}

function parseRelativeReminderOffsetMs(messageText: string): number | null {
  const match = messageText.match(/\bin\s+(\d+)\s+(minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2].toLowerCase();
  if (unit.startsWith("min")) return amount * 60 * 1000;
  if (unit.startsWith("hour") || unit.startsWith("hr")) return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function parseReminderWeekdayDate(messageText: string, timezone: string): string | null {
  const match = messageText.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (!match) return null;
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = weekdays.indexOf(match[1].toLowerCase());
  const today = localDateForTimezone(timezone);
  const current = new Date(`${today}T12:00:00Z`).getUTCDay();
  const daysUntil = (target - current + 7) % 7;
  return addDaysToDate(today, daysUntil);
}

function parseExplicitReminderTime(messageText: string): string | null {
  const match =
    messageText.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
    messageText.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseReminderRecurrenceInput(messageText: string): string | null {
  if (/\bevery day|daily\b/i.test(messageText)) return "daily";
  if (/\bevery week|weekly\b/i.test(messageText)) return "weekly";
  if (/\bevery month|monthly\b/i.test(messageText)) return "monthly";
  return null;
}

function extractReminderTitle(messageText: string): string | null {
  const stripped = messageText
    .replace(/^(?:please\s+)?/i, "")
    .replace(/^(?:can|could|would|will)\s+you\s+/i, "")
    .replace(/^(?:remind me|set (?:a )?reminder|create (?:a )?reminder|add (?:a )?reminder)\s+(?:to|for|about|that)?\s*/i, "")
    .replace(/^(?:don't|dont) let me forget\s+(?:to|about|that)?\s*/i, "")
    .replace(/\b(?:today|tomorrow)\b/gi, "")
    .replace(/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\bon\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\bin\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\b(?:every day|daily|every week|weekly|every month|monthly)\b/gi, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  return stripped || null;
}

async function listPendingAgentReminders(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<AgentReminder[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, title, notes, remind_at, timezone, recurrence_rule, context_type,
              context_id, context_label, status, delivered_at, dismissed_at, created_at
       FROM user_reminders
       WHERE user_id = ? AND status IN ('pending', 'failed')
       ORDER BY remind_at ASC
       LIMIT 8`,
    )
      .bind(userId)
      .all<DbReminderRow>();
    return (rows.results || []).map(serializeAgentReminder);
  } catch {
    return [];
  }
}

async function listUpcomingBookings(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
): Promise<DbBookingRow[]> {
  try {
    const rows = await env.DB.prepare(
      `SELECT b.id, b.site_id, s.username AS site_username, b.offer_id,
              b.booking_type, b.guest_name, b.guest_email, b.starts_at, b.ends_at,
              b.duration_minutes, b.status, b.notes, b.payment_status,
              b.is_free_booking, b.created_at
       FROM bookings b
       JOIN sites s ON s.id = b.site_id
       WHERE s.user_id = ? AND b.status = 'confirmed' AND b.starts_at >= ?
       ORDER BY b.starts_at ASC
       LIMIT 8`,
    )
      .bind(userId, new Date().toISOString())
      .all<DbBookingRow>();
    return rows.results || [];
  } catch {
    return [];
  }
}

function formatAgentDateTime(iso: string, timezone: string | null | undefined): string {
  const normalizedTimezone = normalizeTimeZone(timezone) || "UTC";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: normalizedTimezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function dateTimePartsForInstant(date: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function addDaysToDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
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
  const headers = parseJsonRecord(row.raw_headers_json);
  const fromHeader = parseEmailAddressHeader(getHeaderValue(headers, "from"));
  const agentLabels = parseJsonArray(row.agent_labels_json);
  const unsubscribeAction = getMailboxUnsubscribeAction(row);
  const body = getSerializedAgentMailboxMessageBody(row);
  return {
    id: row.id,
    direction: row.direction,
    kind: row.message_kind,
    status: row.status,
    threadKey: row.thread_key,
    providerId: row.provider_id,
    providerMessageId: row.provider_message_id,
    fromAddress: fromHeader?.address || row.from_address,
    fromName: fromHeader?.name || null,
    toAddress: row.to_address,
    subject: decodeMimeHeaderValue(row.subject || "(no subject)"),
    body,
    htmlBody: row.html_body || null,
    preview: body.slice(0, 280),
    metadata,
    unsubscribeAction,
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

function getSerializedAgentMailboxMessageBody(row: DbMailboxMessageRow): string {
  const body = row.text_body || "";
  if (
    row.message_kind === "draft" &&
    row.status === "pending_approval" &&
    row.created_by === "agent"
  ) {
    return stripAgentDraftWrapperText(body);
  }
  return body;
}

function getMailboxUnsubscribeAction(
  row: DbMailboxMessageRow,
): MailboxUnsubscribeAction | null {
  if (row.direction !== "inbound" || row.message_kind !== "email") return null;
  const headers = parseJsonRecord(row.raw_headers_json);
  const listUnsubscribe = getHeaderValue(headers, "list-unsubscribe");
  if (!listUnsubscribe) return null;

  const urls = parseListUnsubscribeUrls(listUnsubscribe);
  const oneClick =
    getHeaderValue(headers, "list-unsubscribe-post")?.trim().toLowerCase() ===
    "list-unsubscribe=one-click";
  if (oneClick && urls.some((url) => isHttpsUrl(url))) {
    return { available: true, mode: "one_click" };
  }
  if (urls.some((url) => isHttpsUrl(url))) {
    return { available: true, mode: "link" };
  }
  if (urls.some((url) => url.trim().toLowerCase().startsWith("mailto:"))) {
    return { available: true, mode: "mailto" };
  }
  return null;
}

function getHeaderValue(headers: Record<string, unknown>, name: string): string | null {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && typeof value === "string") {
      return value;
    }
  }
  return null;
}

function parseListUnsubscribeUrls(value: string): string[] {
  const bracketed = [...value.matchAll(/<([^>]+)>/g)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean);
  if (bracketed.length > 0) return bracketed;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
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
  const createdBy = source === "agent" ? "agent" : "owner";
  const normalizedTextBody = normalizeNullableText(body.textBody) || existing?.text_body || "";
  const allowedAttachmentSources = [replyTo, existing].filter(
    (row): row is DbMailboxMessageRow => Boolean(row),
  );
  const preservedAttachments = selectPreservedAttachments(
    allowedAttachmentSources,
    body.preservedAttachmentKeys,
  );
  const uploadedAttachments = normalizeUploadedAttachments(
    mailbox.id,
    body.uploadedAttachments,
  );

  return {
    fromAddress,
    toAddress,
    subject: normalizeNullableText(body.subject) || existing?.subject || "",
    textBody:
      createdBy === "agent"
        ? stripAgentDraftWrapperText(normalizedTextBody)
        : normalizedTextBody,
    htmlBody:
      body.htmlBody === undefined
        ? existing?.html_body || null
        : normalizeNullableText(body.htmlBody),
    sourceId: replyTo?.id || existing?.source_id || null,
    threadKey,
    messageIdHeader,
    inReplyTo: replyHeaders.inReplyTo || existingHeaders.inReplyTo,
    referencesHeader: replyHeaders.referencesHeader || existingHeaders.referencesHeader,
    createdBy,
    preservedAttachments: mergeAttachmentMetadata([
      ...preservedAttachments,
      ...uploadedAttachments,
    ]),
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
    attachmentCount: input.preservedAttachments.length,
    attachments: input.preservedAttachments,
    outbound_headers: {
      message_id: input.messageIdHeader,
      in_reply_to: input.inReplyTo,
      references: input.referencesHeader,
    },
  };
}

function selectPreservedAttachments(
  sources: DbMailboxMessageRow[],
  rawKeys: unknown,
): AgentMailboxAttachmentMetadata[] {
  const requested = normalizePreservedAttachmentKeys(rawKeys);
  if (requested.size === 0 || sources.length === 0) return [];

  const selected: AgentMailboxAttachmentMetadata[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const attachment of getMailboxAttachmentMetadata(source)) {
      const storageKey = attachment.storageKey?.trim();
      if (!storageKey || !requested.has(storageKey) || seen.has(storageKey)) continue;
      selected.push({
        filename: attachment.filename || null,
        mimeType: attachment.mimeType || null,
        disposition: attachment.disposition || "attachment",
        size: attachment.size || null,
        storageKey,
        sourceMessageId: attachment.sourceMessageId || source.id,
      });
      seen.add(storageKey);
    }
  }
  return selected;
}

function normalizePreservedAttachmentKeys(rawKeys: unknown): Set<string> {
  if (!Array.isArray(rawKeys)) return new Set();
  return new Set(
    rawKeys
      .map((key) => (typeof key === "string" ? key.trim() : ""))
      .filter((key) => key.length > 0),
  );
}

function normalizeUploadedAttachments(
  mailboxId: string,
  rawAttachments: unknown,
): AgentMailboxAttachmentMetadata[] {
  if (!Array.isArray(rawAttachments)) return [];
  const allowedPrefix = `mailbox/${mailboxId}/uploads/`;
  const normalized: AgentMailboxAttachmentMetadata[] = [];
  for (const attachment of rawAttachments) {
    if (!isPlainObject(attachment)) continue;
    const storageKey = normalizeNullableText(attachment.storageKey);
    if (!storageKey?.startsWith(allowedPrefix)) continue;
    normalized.push({
      filename: normalizeNullableText(attachment.filename) || null,
      mimeType: normalizeNullableText(attachment.mimeType) || null,
      disposition: "attachment",
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size)
          ? attachment.size
          : null,
      storageKey,
      sourceMessageId: null,
    });
  }
  return normalized;
}

function mergeAttachmentMetadata(
  attachments: AgentMailboxAttachmentMetadata[],
): AgentMailboxAttachmentMetadata[] {
  const seen = new Set<string>();
  const merged: AgentMailboxAttachmentMetadata[] = [];
  for (const attachment of attachments) {
    const storageKey = attachment.storageKey?.trim();
    if (!storageKey || seen.has(storageKey)) continue;
    merged.push(attachment);
    seen.add(storageKey);
  }
  return merged;
}

function getMailboxAttachmentMetadata(row: DbMailboxMessageRow): AgentMailboxAttachmentMetadata[] {
  const metadata = parseJsonRecord(row.metadata_json);
  const rawAttachments = Array.isArray(metadata.attachments)
    ? metadata.attachments
    : [];
  return rawAttachments
    .filter(isPlainObject)
    .map((attachment) => ({
      filename: normalizeNullableText(attachment.filename),
      mimeType: normalizeNullableText(attachment.mimeType),
      disposition: normalizeNullableText(attachment.disposition),
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size)
          ? attachment.size
          : null,
      storageKey: normalizeNullableText(attachment.storageKey),
      sourceMessageId: normalizeNullableText(attachment.sourceMessageId),
    }))
    .filter((attachment) => Boolean(attachment.storageKey));
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

async function contactEmailExists(
  env: Pick<CoreAgentChatEnv, "DB">,
  userId: string,
  email: string,
  exceptContactId?: string,
): Promise<boolean> {
  const { contacts } = await listAgentContacts(env, userId);
  return contacts.some(
    (contact) =>
      contact.id !== exceptContactId &&
      contact.email?.trim().toLowerCase() === email,
  );
}

function duplicateContactEmailError() {
  return { error: "This email is already saved as a contact.", status: 409 as const };
}

function isDuplicateContactEmailError(error: unknown): boolean {
  return error instanceof Error &&
    /UNIQUE constraint failed: contacts\.user_id, contacts\.email|SQLITE_CONSTRAINT_UNIQUE/i.test(
      error.message,
    );
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

function parseJsonRecordArray(value: string | null): Record<string, unknown>[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => isPlainObject(item))
      : [];
  } catch {
    return [];
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

function contextSource(input: {
  id: string;
  kind: Me3AgentContextSource["kind"];
  label: string;
  visibility: Me3AgentContextSource["visibility"];
  reason?: string;
  sourceRef?: string | null;
  updatedAt?: string | null;
}): Me3AgentContextSource {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    visibility: input.visibility,
    reason: input.reason,
    sourceRef: input.sourceRef ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

function summarizeRequest(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function summarizeContextText(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
    : normalized;
}

function normalizeMissionStatementForContext(value: string | null): string | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  if (normalized.includes(DEFAULT_MISSION_STATEMENT_TEMPLATE_MARKER)) return null;
  return summarizeContextText(normalized, 800);
}

function coreMeJsonUrl(env: CoreAgentChatEnv): string | null {
  const origin = normalizeOrigin(env.CORE_API_ORIGIN || env.CORE_WEB_ORIGIN);
  return origin ? `${origin}/.well-known/me.json` : null;
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) return null;
  return trimmed;
}

function localDateForTimezone(timezone: string | null): string {
  const normalizedTimezone = normalizeTimeZone(timezone) || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: normalizedTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to UTC if the stored timezone is invalid in this runtime.
  }
  return new Date().toISOString().slice(0, 10);
}

function contactAliases(row: DbContactRow): string[] {
  const metadata = parseJsonRecord(row.metadata);
  const aliases = Array.isArray(metadata.aliases)
    ? metadata.aliases.filter((alias): alias is string => typeof alias === "string")
    : [];
  return uniqueStrings([
    ...aliases,
    ...parseJsonArray(row.tags),
    row.email || "",
    ...Object.values(stringRecord(parseJsonRecord(row.social_handles))),
  ]);
}

function summarizeContactRow(row: DbContactRow): string {
  const parts = [
    row.notes,
    row.outreach_status ? `Outreach: ${row.outreach_status}.` : null,
    row.next_followup_at ? `Next follow-up: ${row.next_followup_at}.` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ");
}

function summarizeMailboxRow(row: DbMailboxMessageRow): string {
  const body = normalizeWhitespace(row.text_body || "");
  if (body) return body.length > 420 ? `${body.slice(0, 417)}...` : body;
  return row.subject ? `Email about ${row.subject}.` : "Email thread with no summary yet.";
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function tokenizeContextText(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2),
    ),
  );
}

function scoreContextSkillMatch(queryTokens: string[], value: string) {
  const haystack = new Set(tokenizeContextText(value));
  return queryTokens.reduce((score, token) => score + (haystack.has(token) ? 1 : 0), 0);
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function contactIdForEmail(
  email: string | null,
  contactsByEmail: ReadonlyMap<string, string>,
): string | null {
  if (!email) return null;
  return contactsByEmail.get(email.trim().toLowerCase()) || null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    result.push(normalized);
  }
  return result;
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
    metadata?: Record<string, unknown> | null;
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
      JSON.stringify({
        runtime: "sandbox",
        turnId: input.turnId,
        ...(input.metadata || {}),
      }),
    )
    .run();

  return { id };
}

async function runModelTurn(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  turnId: string,
): Promise<AgentSandboxDispatchResponse> {
  const attempts =
    route.providerId === "workers-ai" && route.backupModel && route.backupModel !== route.model
      ? [route.model, route.backupModel]
      : [route.model];
  let lastError: unknown = null;
  const modelAttempts: AgentChatModelAttemptTrace[] = [];

  for (const model of attempts) {
    try {
      const attemptRoute = { ...route, model };
      const replyText =
        route.providerId === "openai"
          ? await runOpenAi(attemptRoute, messages)
          : route.providerId === "anthropic"
            ? await runAnthropic(attemptRoute, messages)
            : await runWorkersAi(attemptRoute, messages);

      if (!isEmptyModelReply(replyText, attemptRoute)) {
        modelAttempts.push({
          providerId: route.providerId,
          model,
          status: "succeeded",
          error: null,
        });
        return {
          ok: true,
          auditId: null,
          turnId,
          specialist: "core.agent-chat",
          replyText,
          model,
          source: route.providerId,
          fallbackReason: null,
          debugError: null,
          emailAction: null,
          reminderAction: null,
          actionCards: null,
          contentAction: null,
          contactsChanged: false,
          modelAttempts,
        };
      }

      const message = "Model returned an empty reply.";
      modelAttempts.push({
        providerId: route.providerId,
        model,
        status: "empty",
        error: message,
      });
      lastError = new Error(emptyModelReply(attemptRoute));
    } catch (error) {
      const message = modelErrorMessage(error);
      modelAttempts.push({
        providerId: route.providerId,
        model,
        status: "failed",
        error: message,
      });
      lastError = error;
    }
  }

  return modelFallbackResponse(route, turnId, modelAttempts, lastError);
}

function modelFallbackResponse(
  route: AiRoute,
  turnId: string,
  modelAttempts: AgentChatModelAttemptTrace[],
  lastError: unknown,
): AgentSandboxDispatchResponse {
  const onlyEmptyReplies =
    modelAttempts.length > 0 && modelAttempts.every((attempt) => attempt.status === "empty");
  const attemptedBackup = modelAttempts.some((attempt) => attempt.model !== route.model);
  const debugError =
    modelErrorMessage(lastError) ||
    modelAttempts
      .map((attempt) => attempt.error)
      .filter(Boolean)
      .join("; ") ||
    "Model request failed";

  return {
      ok: true,
      auditId: null,
      turnId,
      specialist: "core.agent-chat",
      replyText: onlyEmptyReplies
        ? [
            "I reached the configured AI model, but it returned an empty reply.",
            attemptedBackup
              ? "I also tried the backup model, but it did not return usable text."
              : null,
            "Try another model, or check Account > AI model before trying again.",
          ]
            .filter(Boolean)
            .join(" ")
        : [
            "I reached the ME3 Core agent runtime, but the model provider failed before it could answer.",
            attemptedBackup
              ? "I also tried the backup model and it failed too."
              : null,
            "Check your AI provider settings or try another model.",
          ]
            .filter(Boolean)
            .join(" "),
      model: route.model,
      source: "fallback",
      fallbackReason: onlyEmptyReplies
        ? "Model returned empty response"
        : "Model request failed",
      debugError,
      emailAction: null,
      reminderAction: null,
      actionCards: null,
      contentAction: null,
      contactsChanged: false,
      modelAttempts,
  };
}

function modelErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "";
}

async function runOpenAi(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.apiKey) throw new Error("OpenAI API key is not configured");
  const body: Record<string, unknown> = {
    model: route.model,
    messages,
  };
  if (!isOpenAiReasoningModel(route.model)) {
    body.temperature = 0.4;
  }

  const gatewayUrl = externalProviderGatewayUrl(route, "openai", "chat/completions");
  const response = await fetch(gatewayUrl || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${route.apiKey}`,
      ...(gatewayUrl && route.aiGateway?.apiToken
        ? { "cf-aig-authorization": `Bearer ${route.aiGateway.apiToken}` }
        : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{ message?: { content?: unknown; refusal?: unknown } }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI request failed (${response.status})`);
  }

  const message = payload?.choices?.[0]?.message;
  return (
    extractModelText(message?.content) ||
    extractModelText(message?.refusal) ||
    emptyModelReply(route)
  );
}

function isOpenAiReasoningModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return /^gpt-5(?:[.-]|$)/.test(normalized) || /^o\d(?:[.-]|$)/.test(normalized);
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

  const gatewayUrl = externalProviderGatewayUrl(route, "anthropic", "v1/messages");
  const response = await fetch(gatewayUrl || "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": route.apiKey,
      "anthropic-version": "2023-06-01",
      ...(gatewayUrl && route.aiGateway?.apiToken
        ? { "cf-aig-authorization": `Bearer ${route.aiGateway.apiToken}` }
        : {}),
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

  return extractModelText(payload?.content) || emptyModelReply(route);
}

async function runWorkersAi(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.ai) throw new Error("Workers AI binding is not configured");
  const requestOptions =
    route.aiGateway?.routeWorkersAi && route.aiGateway.gatewayId
      ? {
          gateway: {
            id: route.aiGateway.gatewayId,
          },
        }
      : undefined;
  const result = requestOptions
    ? await route.ai.run(route.model, { messages }, requestOptions)
    : await route.ai.run(route.model, { messages });
  return extractModelText(result) || emptyModelReply(route);
}

function externalProviderGatewayUrl(
  route: AiRoute,
  provider: "openai" | "anthropic",
  path: string,
): string | null {
  const gateway = route.aiGateway;
  if (
    !gateway?.routeExternalProviders ||
    !gateway.accountId ||
    !gateway.gatewayId ||
    !gateway.apiToken
  ) {
    return null;
  }
  return `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(
    gateway.accountId,
  )}/${encodeURIComponent(gateway.gatewayId)}/${provider}/${path}`;
}

function extractModelText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((part) => extractModelText(part)).join("").trim();
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  return (
    extractModelText(record.text) ||
    extractModelText(record.output_text) ||
    extractModelText(record.response) ||
    extractModelText(record.content) ||
    extractModelText(record.parsed) ||
    extractModelText(record.data) ||
    extractModelText(record.message) ||
    extractModelText(record.choices) ||
    extractModelText(record.delta) ||
    extractModelText(record.result) ||
    extractModelText(record.output)
  );
}

function emptyModelReply(route: AiRoute): string {
  return `I reached ${route.providerId} (${route.model}), but it returned an empty reply. Check Account > AI model or try another model.`;
}

function isEmptyModelReply(replyText: string, route: AiRoute): boolean {
  return replyText === emptyModelReply(route);
}

async function resolveAiRoute(
  env: CoreAgentChatEnv,
  ownerId: string,
  selectedModel?: AgentChatModelSelection | null,
): Promise<AiRoute> {
  const stored = await getStoredChatDefault(env, ownerId);
  const selectedProvider = normalizeProviderId(selectedModel?.providerId);
  const selectedModelName = normalizeModel(selectedModel?.model);
  const envProvider = normalizeProviderId(env.ME3_AI_CHAT_PROVIDER);
  const envModel = normalizeModel(env.ME3_AI_CHAT_MODEL) || normalizeModel(env.ME3_AI_MODEL);
  const storedProvider = normalizeProviderId(stored?.provider_id);
  const providerId =
    selectedProvider ||
    storedProvider ||
    envProvider ||
    (envModel ? "workers-ai" : null) ||
    (env.OPENAI_API_KEY ? "openai" : null) ||
    (env.ANTHROPIC_API_KEY ? "anthropic" : null) ||
    (env.AI ? "workers-ai" : "workers-ai");
  const model =
    selectedModelName ||
    normalizeModel(stored?.model) ||
    envModel ||
    defaultModelForProvider(providerId);
  const backupModel =
    providerId === "workers-ai"
      ? normalizeModel(env.ME3_AI_CHAT_BACKUP_MODEL) ||
        (model !== DEFAULT_WORKERS_AI_BACKUP_MODEL ? DEFAULT_WORKERS_AI_BACKUP_MODEL : null)
      : null;
  const apiKey =
    providerId === "openai"
      ? env.OPENAI_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
      : providerId === "anthropic"
        ? env.ANTHROPIC_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
        : null;
  const aiGateway = await getAiGatewayRuntimeConfig(env, ownerId).catch(() => null);

  return {
    providerId,
    model,
    backupModel,
    apiKey,
    ai: env.AI || null,
    aiGateway,
    configured:
      providerId === "workers-ai" ? Boolean(env.AI && model) : Boolean(apiKey && model),
  };
}

async function resolveImageGenerationRoute(
  env: CoreAgentChatEnv,
  ownerId: string,
  selectedModel: AgentChatModelSelection | null | undefined,
  capability: AssistantImageCapability,
): Promise<AiRoute | null> {
  const selectedProvider = normalizeProviderId(selectedModel?.providerId);
  const selectedModelName = normalizeModel(selectedModel?.model);
  if (
    selectedProvider &&
    selectedModelName &&
    modelSupportsCapability(selectedProvider, selectedModelName, capability)
  ) {
    return buildAiRoute(env, ownerId, selectedProvider, selectedModelName, null);
  }

  const stored = await getStoredImageGenerationDefault(env, ownerId);
  const storedProvider = normalizeProviderId(stored?.provider_id);
  const storedModel = normalizeModel(stored?.model);
  if (storedProvider && storedModel) {
    return buildAiRoute(env, ownerId, storedProvider, storedModel, null);
  }

  const envProvider = normalizeProviderId(env.ME3_AI_IMAGE_GENERATION_PROVIDER);
  const envModel = normalizeModel(env.ME3_AI_IMAGE_GENERATION_MODEL);
  if (envModel) {
    return buildAiRoute(env, ownerId, envProvider || "workers-ai", envModel, null);
  }

  if (capability === "image_generation" && env.AI) {
    return buildAiRoute(
      env,
      ownerId,
      "workers-ai",
      DEFAULT_WORKERS_AI_IMAGE_GENERATION_MODEL,
      null,
    );
  }

  return null;
}

async function buildAiRoute(
  env: CoreAgentChatEnv,
  ownerId: string,
  providerId: AiProviderId,
  model: string,
  backupModel: string | null,
): Promise<AiRoute> {
  const apiKey =
    providerId === "openai"
      ? env.OPENAI_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
      : providerId === "anthropic"
        ? env.ANTHROPIC_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
        : null;
  const aiGateway = await getAiGatewayRuntimeConfig(env, ownerId).catch(() => null);

  return {
    providerId,
    model,
    backupModel,
    apiKey,
    ai: env.AI || null,
    aiGateway,
    configured:
      providerId === "workers-ai" ? Boolean(env.AI && model) : Boolean(apiKey && model),
  };
}

async function getAiGatewayRuntimeConfig(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<AiGatewayRuntimeConfig> {
  const row = await getAiGatewaySettingsRow(env, ownerId);
  const accountId = row?.account_id || env.CLOUDFLARE_ACCOUNT_ID || null;
  const gatewayId = row?.gateway_id?.trim() || (accountId ? DEFAULT_AI_GATEWAY_ID : null);
  const storedToken = row?.encrypted_api_token
    ? await decryptSecretSafely(env, row.encrypted_api_token)
    : null;
  const apiToken = storedToken || env.CLOUDFLARE_API_TOKEN || null;

  return {
    accountId,
    gatewayId,
    apiToken,
    routeWorkersAi: Boolean(accountId && gatewayId && apiToken),
    routeExternalProviders: Boolean(accountId && gatewayId && apiToken),
  };
}

async function getAiGatewaySettingsRow(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<AiGatewaySettingsRow | null> {
  try {
    return env.DB.prepare(
      `SELECT account_id, gateway_id, encrypted_api_token
       FROM ai_gateway_settings
       WHERE user_id = ?
       LIMIT 1`,
    )
      .bind(ownerId)
      .first<AiGatewaySettingsRow>();
  } catch {
    return null;
  }
}

async function decryptSecretSafely(
  env: CoreAgentChatEnv,
  encrypted: string,
): Promise<string | null> {
  try {
    const installKey = await getInstallEncryptionKey(env);
    return installKey ? decryptProviderSecret(encrypted, installKey) : null;
  } catch {
    return null;
  }
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

async function getStoredImageGenerationDefault(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<AiDefaultRow | null> {
  try {
    return env.DB.prepare(
      `SELECT provider_id, model
       FROM ai_model_defaults
       WHERE user_id = ? AND use_case = 'image_generation'
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
      `SELECT id, email, name, username, bio, timezone, assistant_name
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
  threadId?: string | null,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const hasThread = typeof threadId === "string" && threadId.trim().length > 0;
    const rows = await env.DB.prepare(
      hasThread
        ? `SELECT role, content
           FROM assistant_messages
           WHERE owner_id = ? AND thread_id = ? AND role IN ('user', 'assistant')
           ORDER BY created_at DESC
           LIMIT 12`
        : `SELECT role, content
           FROM assistant_messages
           WHERE owner_id = ? AND role IN ('user', 'assistant')
           ORDER BY created_at DESC
           LIMIT 12`,
    )
      .bind(...(hasThread ? [ownerId, threadId] : [ownerId]))
      .all<{ role: "user" | "assistant"; content: string }>();
    return (rows.results || [])
      .reverse()
      .filter((message) => !isProviderSetupFallbackMessage(message.content));
  } catch {
    return [];
  }
}

function buildChatMessages(
  owner: OwnerProfileRow | null,
  recent: Array<{ role: "user" | "assistant"; content: string }>,
  messageText: string,
  knowledgeContext: string,
  agentContextPrompt: string | null,
  orientationPrompt: string | null,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const ownerName = owner?.name?.trim() || owner?.username?.trim() || "the owner";
  const assistantName = normalizeAssistantDisplayName(owner?.assistant_name);
  const system = [
    "You are a concise personal/business assistant running inside the owner's private ME3 installation.",
    `Your assistant display name is ${JSON.stringify(assistantName)}.`,
    "If asked who you are or what your name is, use the assistant display name.",
    `The owner is ${ownerName}.`,
    owner?.bio ? `Owner profile context: ${owner.bio}` : null,
    owner?.timezone ? `Owner timezone: ${owner.timezone}` : null,
    knowledgeContext,
    agentContextPrompt,
    orientationPrompt,
    "Answer helpfully and plainly. Do not claim external actions are complete unless a tool result says they are.",
    "When the owner is setting up ME3, testing the assistant, or asking what you can do, acknowledge their goal and explain useful next steps from the available capability/context map. Treat capability examples as context unless the owner clearly asks for one concrete action.",
    "When the owner asks to configure ME3, use the setup readiness summary first: separate what already looks ready from the most useful missing next steps. Use 'your ME3 installation' in owner-facing setup copy, not 'Core install'.",
    "For public setup, say 'Public site/profile' and focus on profile basics, published/draft site status, and custom domain. Do not mention me.json, projects, or mission as public profile setup items.",
    "For email drafting, say 'save a draft' instead of 'stage a draft' or 'stage it in the ME3 mailbox'. If the owner asks to save the draft, the tool layer will handle saving it to /email.",
    "This ME3 installation can converse with the owner and can use bundled first-party API surfaces for reminders, contacts, mailbox, content, calendar, and site workflows as they are routed by the host.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    ...recent,
    { role: "user", content: messageText },
  ];
}

function normalizeAssistantDisplayName(value: unknown): string {
  const normalized = normalizeNullableText(value);
  if (!normalized) return "ME3";
  const safe = normalized
    .replace(/[\u0000-\u001f\u007f{}\[\]<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return safe || "ME3";
}

function isCoreChatOrientationTurn(decision: CoreChatToolPlannerDecision): boolean {
  return (
    decision.kind === "conversation" &&
    decision.capabilityId === "core.agent-chat.conversation" &&
    decision.confidence >= 0.9
  );
}

function buildCoreChatOrientationPrompt(
  decision: CoreChatToolPlannerDecision,
  setupReadiness: CoreChatSetupReadiness,
): string | null {
  if (!isCoreChatOrientationTurn(decision)) return null;

  return [
    "ME3 first-run/setup orientation mode:",
    "- The owner is exploring setup, context, or capabilities. Treat capability examples as context, not action requests.",
    "- Acknowledge the owner's setup/testing goal first.",
    "- Name what is available now using the setup readiness summary and capability map.",
    "- Name what needs setup plainly. Do not pretend unconfigured tools are ready.",
    "- For configure requests, prefer a compact 'already set up' / 'good next steps' answer over a generic list of every possible setting.",
    "- Offer 2-4 useful test prompts or next actions.",
    "- Ask at most one focused question, and only if it materially helps.",
    "- In owner-facing wording, say 'your ME3 installation' instead of 'Core install'.",
    "- For public setup, say 'Public site/profile'. Do not mention me.json, projects, or mission as public profile setup items.",
    "- If Mission statement or Wheel of Life context appears in the ME3 agent context packet, mention it as private context available for planning.",
    "- Avoid internal product nouns such as recipes, event ingress, capability registry, run artifact, or review packet unless the owner asks about internals.",
    setupReadiness.prompt,
  ].join("\n");
}

function buildCoreChatOrientationFallbackReply(
  owner: OwnerProfileRow | null,
  setupReadiness: CoreChatSetupReadiness,
): string {
  const name = owner?.name?.trim() || owner?.username?.trim() || "there";
  return [
    `Yes, ${name}, ME3 chat is connected for your ME3 installation, and I can help you explore setup.`,
    "",
    "Available now: I can explain ME3, inspect the current setup state, use owner-scoped context that Core has loaded, and route direct tool requests when the relevant Core surface is ready.",
    "",
    setupReadiness.prompt,
    "",
    "Next best setup step: add an AI provider in Account settings or bind Workers AI so setup questions get live model-backed answers.",
    "",
    "Good test prompts after that:",
    "- What context do you have available about me?",
    "- Do I have any pending reminders?",
    "- Draft a reply to the latest email from Ada.",
  ].join("\n");
}

function attachAgentContextToResponse(
  response: AgentSandboxDispatchResponse,
  context: CoreChatAgentContextResult | null,
): AgentSandboxDispatchResponse {
  return {
    ...response,
    contextPacketId: context?.manifest?.packetId ?? null,
    contextManifest: context?.manifest ?? null,
    contextSummary: context?.summary ?? null,
  };
}

function attachAgentTurnTrace(
  env: CoreAgentChatEnv,
  response: AgentSandboxDispatchResponse,
  input: {
    input: AgentSandboxDispatchInput;
    plannerDecision: CoreChatToolPlannerDecision;
    route: AiRoute | null;
    context: CoreChatAgentContextResult | null;
  },
): AgentSandboxDispatchResponse {
  if (!isAgentChatTraceEnabled(env)) return removeAgentTurnTrace(response);
  const { modelAttempts: _modelAttempts, ...publicResponse } = response;
  return {
    ...publicResponse,
    trace: buildAgentTurnTrace(response, input),
  };
}

function applyAgentTurnTracePolicy(
  env: CoreAgentChatEnv,
  response: AgentSandboxDispatchResponse,
): AgentSandboxDispatchResponse {
  return isAgentChatTraceEnabled(env) ? response : removeAgentTurnTrace(response);
}

function removeAgentTurnTrace(
  response: AgentSandboxDispatchResponse,
): AgentSandboxDispatchResponse {
  const { trace: _trace, modelAttempts: _modelAttempts, ...withoutTrace } = response;
  return withoutTrace;
}

function buildAgentTurnTrace(
  response: AgentSandboxDispatchResponse,
  input: {
    input: AgentSandboxDispatchInput;
    plannerDecision: CoreChatToolPlannerDecision;
    route: AiRoute | null;
    context: CoreChatAgentContextResult | null;
  },
): AgentChatTurnTrace {
  const routePath = response.source === "tool"
    ? "tool"
    : response.source === "fallback"
      ? "fallback"
      : "model";
  return {
    turnId: input.input.turnId,
    planner: input.plannerDecision,
    route: {
      path: routePath,
      capabilityId: input.plannerDecision.capabilityId,
      ownerFacingLabel: input.plannerDecision.ownerFacingLabel,
      handlerRoute: input.plannerDecision.handlerRoute,
      reason: input.plannerDecision.reason,
      setupChecks: input.plannerDecision.requiredSetupChecks,
      approvalRequired: input.plannerDecision.approvalRequired,
      sideEffectLevel: input.plannerDecision.sideEffectLevel,
      auditEventKind: input.plannerDecision.auditEventKind,
    },
    selectedModel: input.route
      ? {
          providerId: input.route.providerId,
          model: input.route.model,
          backupModel: input.route.backupModel,
          configured: input.route.configured,
          responseModel: response.model,
        }
      : null,
    context: buildAgentTraceContext(input.context),
    modelCall: {
      status: modelCallTraceStatus(response, input.route),
      providerId: input.route?.providerId ?? null,
      model: response.model ?? input.route?.model ?? null,
      fallbackReason: response.fallbackReason ?? null,
      debugError: response.debugError ?? null,
      attempts: response.modelAttempts ?? [],
    },
    imageGeneration: buildAgentTraceImageGeneration(response),
    toolResult: {
      status: toolResultTraceStatus(response, input.plannerDecision),
      specialist: response.specialist,
      source: response.source,
    },
    audit: {
      auditId: response.auditId,
    },
  };
}

function buildAgentTraceImageGeneration(
  response: AgentSandboxDispatchResponse,
): AgentChatTurnTrace["imageGeneration"] {
  const action = response.imageAction;
  if (!action) return null;
  return {
    intent: action.kind === "edited" ? "edit" : "generate",
    status:
      action.status === "complete"
        ? "succeeded"
        : action.status === "failed"
          ? "failed"
          : "blocked",
    providerId: normalizeProviderId(action.providerId),
    model: action.model,
    capabilityChecked:
      action.kind === "edited" ? "image_edit" : "image_generation",
    assetCount: action.assets.length,
    error: action.reason ?? null,
  };
}

function buildAgentTraceContext(
  context: CoreChatAgentContextResult | null,
): AgentChatTurnTrace["context"] {
  if (!context) {
    return {
      status: "not_attempted",
      packetId: null,
      summary: null,
      sourceCount: 0,
      sources: [],
      error: null,
    };
  }
  if (context.status === "failed") {
    return {
      status: "failed",
      packetId: null,
      summary: null,
      sourceCount: 0,
      sources: [],
      error: context.error,
    };
  }

  const sources = context.manifest?.sources || [];
  return {
    status: "loaded",
    packetId: context.manifest?.packetId ?? null,
    summary: context.summary,
    sourceCount: sources.length,
    sources: sources.slice(0, 12).map((source) => ({
      id: source.id,
      kind: source.kind,
      label: source.label ?? null,
      visibility: source.visibility ?? null,
      reason: source.reason ?? null,
    })),
    error: null,
  };
}

function modelCallTraceStatus(
  response: AgentSandboxDispatchResponse,
  route: AiRoute | null,
): AgentChatTurnTrace["modelCall"]["status"] {
  if (!route || response.source === "tool") return "not_attempted";
  if (!route.configured) return "not_attempted";
  if (
    response.source === "openai" ||
    response.source === "anthropic" ||
    response.source === "workers-ai" ||
    response.source === "workers-ai-gateway"
  ) {
    return "succeeded";
  }
  if (
    response.fallbackReason === "Model request failed" ||
    response.fallbackReason === "Model returned empty response"
  ) {
    return "failed";
  }
  return "fallback";
}

function toolResultTraceStatus(
  response: AgentSandboxDispatchResponse,
  plannerDecision: CoreChatToolPlannerDecision,
): AgentChatTurnTrace["toolResult"]["status"] {
  if (response.source !== "tool") return "not_attempted";
  if (plannerDecision.kind === "clarify") return "clarified";
  return response.fallbackReason ? "failed" : "succeeded";
}

function isAgentChatTraceEnabled(env: CoreAgentChatEnv): boolean {
  return (
    isTruthyEnvFlag(env.ME3_ASSISTANT_DEBUG_TRACE) ||
    isTruthyEnvFlag(env.ME3_ASSISTANT_TRACE) ||
    env.ENVIRONMENT === "development"
  );
}

function isTruthyEnvFlag(value: unknown): boolean {
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

async function loadCoreChatAgentContext(
  env: CoreAgentChatEnv,
  input: {
    ownerId: string;
    owner: OwnerProfileRow | null;
    recent: Array<{ role: "user" | "assistant"; content: string }>;
    messageText: string;
  },
): Promise<CoreChatAgentContextResult> {
  try {
    const activeDate = localDateForTimezone(input.owner?.timezone || null);
    const contacts = await loadCoreContextContacts(env, input.ownerId);
    const [
      emailThreads,
      projects,
      tasks,
      calendarEvents,
      privateMemory,
      missionStatement,
      lifeSnapshot,
      skills,
    ] =
      await Promise.all([
        loadCoreContextEmailThreads(env, input.ownerId, contacts),
        loadCoreContextProjects(env, input.ownerId),
        loadCoreContextTasks(env, input.ownerId),
        loadCoreContextCalendarEvents(env, input.ownerId),
        loadCoreContextPrivateMemory(env, input.ownerId),
        loadCoreContextMissionStatement(env, input.ownerId),
        loadCoreContextLifeSnapshot(env, input.ownerId),
        loadCoreContextSkills(env, input.ownerId, input.messageText),
      ]);

    const packet = resolveMe3AgentContextPacket({
      ownerId: input.ownerId,
      purpose: "chat_reply",
      surface: "core",
      requestSummary: summarizeRequest(input.messageText),
      requestText: input.messageText,
      ownerProfile: input.owner ? mapOwnerProfileToContext(input.owner) : null,
      missionStatement,
      lifeSnapshot,
      publicIdentity: input.owner
        ? {
            summary: input.owner.bio,
            meJsonUrl: coreMeJsonUrl(env),
            actions: ["chat"],
            source: contextSource({
              id: "owner-me-json",
              kind: "public_me_json",
              label: "Public me.json",
              visibility: "public",
              reason: "Public identity context for agents.",
            }),
          }
        : null,
      candidateContacts: contacts,
      candidateEmailThreads: emailThreads,
      candidateProjects: projects,
      candidateTasks: tasks,
      candidateCalendarEvents: calendarEvents,
      candidatePrivateMemory: privateMemory,
      candidateRecentMessages: mapRecentMessagesToContext(input.recent),
      resolverOptions: { maxContacts: 12 },
      skills,
      activeScope: { date: activeDate },
      budget: { maxPromptChars: CHAT_CONTEXT_PROMPT_BUDGET_CHARS },
    });

    const prompt = buildMe3AgentContextPrompt(packet);
    const manifest = createMe3AgentContextManifest(packet, prompt.budget);
    return {
      status: "loaded",
      prompt: prompt.text,
      manifest,
      summary: summarizeMe3AgentContextManifest(manifest),
      error: null,
    };
  } catch (error) {
    return {
      status: "failed",
      prompt: null,
      manifest: null,
      summary: null,
      error: error instanceof Error ? error.message : "Agent context lookup failed",
    };
  }
}

async function loadCoreContextContacts(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<Me3AgentContextContact[]> {
  const rows = await env.DB.prepare(
    `SELECT id, user_id, name, email, phone, source, source_ref,
            relationship, status, notes, tags, last_interaction_at,
            next_followup_at, outreach_status, social_handles, metadata,
            created_at, updated_at
     FROM contacts
     WHERE user_id = ? AND status != 'archived'
     ORDER BY COALESCE(last_interaction_at, updated_at, created_at) DESC
     LIMIT 40`,
  )
    .bind(ownerId)
    .all<DbContactRow>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    aliases: contactAliases(row),
    email: row.email,
    relationship: row.relationship,
    summary: summarizeContactRow(row),
    lastInteractionAt: row.last_interaction_at,
    source: contextSource({
      id: row.id,
      kind: "contact",
      label: row.name,
      visibility: "private",
      sourceRef: row.source_ref,
      updatedAt: row.updated_at,
    }),
  }));
}

async function loadCoreContextEmailThreads(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
  contacts: readonly Me3AgentContextContact[],
): Promise<Me3AgentContextEmailThread[]> {
  const rows = await env.DB.prepare(
    `SELECT m.id, m.direction, m.message_kind, m.status, m.thread_key, m.from_address,
            m.provider_id, m.provider_message_id, m.to_address, m.subject, m.text_body,
            m.html_body, m.raw_headers_json, m.raw_message, m.metadata_json, m.source_id,
            m.folder, m.read_at, m.agent_summary, m.agent_labels_json, m.forwarded_to,
            m.error_message, m.created_by, m.approved_by_user_id, m.received_at,
            m.approved_at, m.sent_at, m.created_at
     FROM mailbox_messages m
     JOIN mailbox_aliases a ON a.id = m.mailbox_id
     WHERE a.user_id = ? AND m.folder != 'trash'
     ORDER BY COALESCE(m.sent_at, m.received_at, m.approved_at, m.created_at) DESC
     LIMIT 40`,
  )
    .bind(ownerId)
    .all<DbMailboxMessageRow>();

  const contactsByEmail = new Map(
    contacts
      .map((contact) => [contact.email?.toLowerCase() || "", contact.id] as const)
      .filter(([email]) => Boolean(email)),
  );
  const byThread = new Map<string, Me3AgentContextEmailThread>();

  for (const row of rows.results || []) {
    const metadata = parseJsonRecord(row.metadata_json);
    const id = row.thread_key || row.id;
    const existing = byThread.get(id);
    const participants = uniqueStrings([
      ...(existing?.participants || []),
      row.from_address || "",
      row.to_address || "",
    ]);
    const contactId =
      stringValue(metadata.contactId) ||
      existing?.contactId ||
      contactIdForEmail(row.from_address, contactsByEmail) ||
      contactIdForEmail(row.to_address, contactsByEmail);
    const projectId = stringValue(metadata.projectId) || existing?.projectId || null;
    const summary = row.agent_summary || summarizeMailboxRow(row);
    const lastMessageAt =
      row.sent_at || row.received_at || row.approved_at || row.created_at || existing?.lastMessageAt;

    byThread.set(id, {
      id,
      subject: existing?.subject || row.subject || "(no subject)",
      participants,
      contactId,
      projectId,
      summary: existing ? existing.summary : summary,
      lastMessageAt,
      source: contextSource({
        id,
        kind: "email_thread",
        label: row.subject || id,
        visibility: "private",
        sourceRef: row.source_id || row.id,
        updatedAt: lastMessageAt || null,
      }),
    });
  }

  return [...byThread.values()];
}

async function loadCoreContextProjects(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<Me3AgentContextProject[]> {
  const rows = await env.DB.prepare(
    `SELECT id, name, slug, description, status, source_ref, updated_at
     FROM mission_projects
     WHERE user_id = ? AND status != 'archived'
     ORDER BY updated_at DESC
     LIMIT 30`,
  )
    .bind(ownerId)
    .all<DbMissionProjectRow>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    aliases: [row.slug].filter(Boolean),
    summary: row.description,
    status: row.status,
    source: contextSource({
      id: row.id,
      kind: "project",
      label: row.name,
      visibility: "private",
      sourceRef: row.source_ref,
      updatedAt: row.updated_at,
    }),
  }));
}

async function loadCoreContextTasks(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<Me3AgentContextTask[]> {
  const rows = await env.DB.prepare(
    `SELECT id, project_id, title, description, status, due_at, scheduled_for,
            source_ref, updated_at
     FROM mission_tasks
     WHERE user_id = ?
       AND archived_at IS NULL
       AND status NOT IN ('done', 'cancelled')
     ORDER BY priority ASC, COALESCE(due_at, scheduled_for, updated_at) ASC
     LIMIT 50`,
  )
    .bind(ownerId)
    .all<DbMissionTaskRow>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    title: row.description ? `${row.title}: ${row.description}` : row.title,
    status: row.status,
    dueAt: row.due_at || row.scheduled_for,
    projectId: row.project_id,
    source: contextSource({
      id: row.id,
      kind: "task",
      label: row.title,
      visibility: "private",
      sourceRef: row.source_ref,
      updatedAt: row.updated_at,
    }),
  }));
}

async function loadCoreContextCalendarEvents(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<Me3AgentContextCalendarEvent[]> {
  const rows = await env.DB.prepare(
    `SELECT id, title, notes, starts_at, ends_at, timezone, created_at, updated_at
     FROM user_calendar_events
     WHERE user_id = ?
     ORDER BY starts_at ASC
     LIMIT 30`,
  )
    .bind(ownerId)
    .all<DbCalendarContextEventRow>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    title: row.notes ? `${row.title}: ${row.notes}` : row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    source: contextSource({
      id: row.id,
      kind: "calendar_event",
      label: row.title,
      visibility: "private",
      updatedAt: row.updated_at || row.created_at,
    }),
  }));
}

async function loadCoreContextPrivateMemory(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<Me3AgentContextPrivateMemory[]> {
  const rows = await env.DB.prepare(
    `SELECT id, memory_kind, scope_kind, scope_id, title, body, confidence,
            source_ref, updated_at
     FROM mission_private_memory
     WHERE user_id = ? AND review_status = 'active'
     ORDER BY updated_at DESC
     LIMIT 40`,
  )
    .bind(ownerId)
    .all<DbMissionMemoryRow>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    kind: row.memory_kind,
    title: row.title,
    body: row.body,
    scope: row.scope_id ? `${row.scope_kind}:${row.scope_id}` : row.scope_kind,
    confidence: row.confidence,
    source: contextSource({
      id: row.id,
      kind: "private_memory",
      label: row.title || row.memory_kind,
      visibility: "private",
      sourceRef: row.source_ref,
      updatedAt: row.updated_at,
    }),
  }));
}

async function loadCoreContextSkills(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
  requestText: string,
): Promise<Me3AgentContextSkill[]> {
  const requestTokens = tokenizeContextText(requestText);
  if (requestTokens.length === 0) return [];
  const bundledMatches = matchBundledCoreContextSkills(requestTokens);
  try {
    const rows = await env.DB.prepare(
      `SELECT id, name, description, source_kind, source_ref, trust_level,
              trigger_hints_json, skill_md, updated_at
       FROM assistant_skills
       WHERE user_id = ? AND status = 'active'
       ORDER BY updated_at DESC, name ASC
       LIMIT 100`,
    )
      .bind(ownerId)
      .all<DbAssistantSkillRow>();

    const bundledSourceRefs = new Set(ME3_BUNDLED_AGENT_SKILLS.map((skill) => skill.sourceRef));
    const storedMatches = (rows.results || [])
      .filter((row) => !row.source_ref || !bundledSourceRefs.has(row.source_ref))
      .map((row) => ({
        row,
        score: scoreContextSkillMatch(
          requestTokens,
          [
            row.name,
            row.description || "",
            row.source_ref || "",
            ...parseJsonStringArray(row.trigger_hints_json),
          ].join(" "),
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.row.name.localeCompare(right.row.name))
      .map(({ row, score }) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        instructions: row.skill_md ? summarizeContextText(row.skill_md, 3200) : null,
        reason:
          score >= 3
            ? "Skill triggers matched this request."
            : "Skill metadata matched this request.",
        source: contextSource({
          id: row.id,
          kind: "agent_skill",
          label: row.name,
          visibility: "private",
          reason:
            row.skill_md
              ? "Matched skill instructions loaded for this turn."
              : "Matched installed skill; full instructions are not available yet.",
          sourceRef: row.source_ref,
          updatedAt: row.updated_at,
        }),
      }));
    return [...bundledMatches, ...storedMatches].slice(0, 4);
  } catch {
    return bundledMatches.slice(0, 4);
  }
}

function matchBundledCoreContextSkills(
  requestTokens: string[],
): Me3AgentContextSkill[] {
  return ME3_BUNDLED_AGENT_SKILLS
    .map((skill) => ({
      skill,
      score: scoreContextSkillMatch(
        requestTokens,
        [
          skill.name,
          skill.description,
          skill.sourceRef,
          ...skill.triggerHints,
        ].join(" "),
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .map(({ skill, score }) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      instructions: summarizeContextText(skill.instructions, 3200),
      reason:
        score >= 3
          ? "Bundled core skill triggers matched this request."
          : "Bundled core skill metadata matched this request.",
      source: contextSource({
        id: skill.id,
        kind: "agent_skill",
        label: skill.name,
        visibility: "private",
        reason: "Bundled core skill instructions loaded for this turn.",
        sourceRef: skill.sourceRef,
        updatedAt: skill.updatedAt,
      }),
    }));
}

async function loadCoreContextMissionStatement(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<Me3AgentContextMissionStatement | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT mission_statement, updated_at
       FROM mission_dashboard_settings
       WHERE user_id = ?`,
    )
      .bind(ownerId)
      .first<DbMissionDashboardSettingsRow>();
    const statement = normalizeMissionStatementForContext(row?.mission_statement || null);
    if (!statement) return null;
    return {
      statement,
      source: contextSource({
        id: "mission-statement",
        kind: "mission_statement",
        label: "Mission statement",
        visibility: "private",
        reason: "Primary owner intent for agent replies.",
        sourceRef: "/mission-control",
        updatedAt: row?.updated_at || null,
      }),
    };
  } catch {
    return null;
  }
}

async function loadCoreContextLifeSnapshot(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<Me3AgentContextLifeSnapshot | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT id, segments_json, notes_json, created_at
       FROM mission_wheel_snapshots
       WHERE user_id = ?
       ORDER BY created_at DESC, id ASC
       LIMIT 1`,
    )
      .bind(ownerId)
      .first<DbMissionWheelSnapshotRow>();
    if (!row) return null;

    const notes = parseJsonRecord(row.notes_json);
    const areas = parseJsonRecordArray(row.segments_json)
      .map((segment) => {
        const id = stringValue(segment.id);
        const label = stringValue(segment.label);
        if (!id || !label) return null;
        const rawScore =
          typeof segment.value === "number" ? segment.value : Number(segment.value);
        const score =
          segment.value === null || segment.value === undefined || !Number.isFinite(rawScore)
            ? null
            : Math.max(0, Math.min(10, rawScore));
        const note = stringValue(notes[id]);
        return {
          label,
          score,
          note: note ? summarizeContextText(note, 160) : null,
        };
      })
      .filter(
        (
          area,
        ): area is {
          label: string;
          score: number | null;
          note: string | null;
        } => Boolean(area),
      )
      .slice(0, MAX_WHEEL_SNAPSHOT_AREAS);
    if (!areas.length) return null;

    const scoredAreas = areas.filter((area) => typeof area.score === "number");
    const lowest = [...scoredAreas]
      .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))
      .slice(0, 2)
      .map((area) => area.label);
    const highest = [...scoredAreas]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .slice(0, 2)
      .map((area) => area.label);
    const summary =
      highest.length || lowest.length
        ? [
            highest.length ? `Strongest: ${highest.join(", ")}` : null,
            lowest.length ? `Needs attention: ${lowest.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join(". ")
        : null;

    return {
      id: row.id,
      createdAt: row.created_at,
      summary,
      areas,
      source: contextSource({
        id: row.id,
        kind: "wheel_of_life",
        label: "Wheel of Life snapshot",
        visibility: "private",
        reason: "Current life snapshot for balancing advice.",
        sourceRef: "/mission-control/wheel-of-life",
        updatedAt: row.created_at,
      }),
    };
  } catch {
    return null;
  }
}

function mapOwnerProfileToContext(owner: OwnerProfileRow) {
  return {
    displayName: owner.name,
    username: owner.username,
    bio: owner.bio,
    timezone: owner.timezone,
    source: contextSource({
      id: owner.id,
      kind: "owner_profile",
      label: "Owner profile",
      visibility: "public",
      reason: "Always include a small owner profile.",
    }),
  };
}

function mapRecentMessagesToContext(
  recent: Array<{ role: "user" | "assistant"; content: string }>,
): Me3AgentContextRecentMessage[] {
  return recent.map((message, index) => ({
    id: `recent-${index + 1}`,
    role: message.role,
    content: message.content,
    source: contextSource({
      id: `recent-${index + 1}`,
      kind: "assistant_message",
      label: "Recent chat",
      visibility: "private",
    }),
  }));
}

async function loadCoreChatSetupReadiness(
  env: CoreAgentChatEnv,
  ownerId: string,
  aiRouteConfigured: boolean,
  owner: OwnerProfileRow | null,
): Promise<CoreChatSetupReadiness> {
  const [
    mailbox,
    profileSite,
    plugins,
    jobs,
    hasCalendarSource,
    hasSoulink,
    hasTelegram,
    hasLocalDaemon,
  ] = await Promise.all([
    loadCoreSetupMailboxReadiness(env, ownerId),
    loadCoreSetupProfileSiteReadiness(env, ownerId),
    loadCoreSetupPluginReadiness(env),
    loadCoreSetupJobsReadiness(env, ownerId),
    hasCoreSetupRow(
      env,
      `SELECT id FROM calendar_sources WHERE user_id = ? AND status = 'active' LIMIT 1`,
      ownerId,
    ),
    hasCoreSetupRow(
      env,
      `SELECT id FROM agent_channel_connections
       WHERE user_id = ? AND channel = 'soulink' AND status = 'active'
       LIMIT 1`,
      ownerId,
    ),
    hasCoreSetupRow(
      env,
      `SELECT id FROM agent_channel_connections
       WHERE user_id = ? AND channel = 'telegram' AND status = 'active'
       LIMIT 1`,
      ownerId,
    ),
    hasCoreSetupRow(
      env,
      `SELECT id FROM local_executor_pairings
       WHERE user_id = ? AND status = 'active'
       LIMIT 1`,
      ownerId,
    ),
  ]);

  const mailboxLine = mailbox
    ? mailbox.status === "active"
      ? "- Mailbox: active alias configured. Drafting can save to /email; sending is still approval-first."
      : `- Mailbox: needs setup. Current alias status is ${mailbox.status || "pending"}; configure /email before promising mailbox actions.`
    : "- Mailbox: needs setup before saving or sending drafts from the mailbox.";
  const calendarSourceText =
    hasCalendarSource === true
      ? "an external calendar source is connected"
      : hasCalendarSource === false
        ? "no external calendar source is connected yet"
        : "external calendar source state is unknown";
  const messagingText = describeCoreSetupMessaging(hasSoulink, hasTelegram);
  const localDaemonText =
    hasLocalDaemon === true
      ? "paired"
      : hasLocalDaemon === false
        ? "not paired; optional setup is needed for local files, repos, or shell/code actions"
        : "setup state unknown";

  return {
    prompt: [
      "ME3 setup readiness summary:",
      aiRouteConfigured
        ? "- AI provider: ready for model-backed chat."
        : "- AI provider: needs setup before live model-backed chat. Add Workers AI, OpenAI, or Anthropic in Account settings.",
      describeCoreSetupProfileSite(profileSite, owner),
      `- Calendar/reminders: Core native reminders and calendar records are available; ${calendarSourceText}.`,
      `- Soulink/Telegram: ${messagingText}.`,
      mailboxLine,
      describeCoreSetupPlugins(plugins),
      describeCoreSetupJobs(jobs),
      "- Updates: release/version metadata is available through the Updates flow; check updates before upgrading this installation.",
      `- Local daemon: ${localDaemonText}.`,
    ].join("\n"),
  };
}

async function loadCoreSetupProfileSiteReadiness(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<DbCoreSetupProfileSiteRow | null> {
  try {
    return (
      (await env.DB.prepare(
        `SELECT username, custom_domain, custom_domain_status, published_at
         FROM sites
         WHERE user_id = ? AND COALESCE(site_type, 'profile') = 'profile'
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
        .bind(ownerId)
        .first<DbCoreSetupProfileSiteRow>()) || null
    );
  } catch {
    return null;
  }
}

async function loadCoreSetupPluginReadiness(
  env: Pick<CoreAgentChatEnv, "DB">,
): Promise<CoreSetupPluginReadiness | null> {
  try {
    const rows = await env.DB.prepare(
      `SELECT plugin_id, enabled, status
       FROM plugin_installations
       ORDER BY plugin_id`,
    )
      .bind()
      .all<DbPluginInstallationRow>();
    const plugins = rows.results || [];
    return {
      total: plugins.length,
      enabled: plugins.filter((plugin) => plugin.enabled !== 0 && plugin.status === "installed")
        .length,
      setupRequired: plugins.filter(
        (plugin) => plugin.enabled !== 0 && plugin.status === "setup_required",
      ).length,
      disabled: plugins.filter((plugin) => plugin.enabled === 0 || plugin.status === "disabled")
        .length,
    };
  } catch {
    return null;
  }
}

async function loadCoreSetupJobsReadiness(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<CoreSetupJobsReadiness | null> {
  try {
    const rows = await env.DB.prepare(
      `SELECT status
       FROM assistant_jobs
       WHERE user_id = ? AND archived_at IS NULL
       LIMIT 100`,
    )
      .bind(ownerId)
      .all<{ status: string | null }>();
    const jobs = rows.results || [];
    return {
      total: jobs.length,
      active: jobs.filter((job) => job.status === "active").length,
      needsSetup: jobs.filter((job) => job.status === "needs_setup" || job.status === "failing")
        .length,
      paused: jobs.filter((job) => job.status === "paused").length,
      draft: jobs.filter((job) => job.status === "draft").length,
    };
  } catch {
    return null;
  }
}

function describeCoreSetupProfileSite(
  site: DbCoreSetupProfileSiteRow | null,
  owner: OwnerProfileRow | null,
): string {
  const bioText = owner?.bio?.trim()
    ? "short profile bio is set"
    : "short profile bio is not set yet";
  if (!site) {
    return `- Public site/profile: no profile site found yet; ${bioText}.`;
  }
  const username = site.username ? `@${site.username}` : "a profile site";
  const publishText = site.published_at ? "published" : "saved as a draft";
  const domainText = site.custom_domain
    ? site.custom_domain_status === "active"
      ? `custom domain ${site.custom_domain} is active`
      : `custom domain ${site.custom_domain} is ${site.custom_domain_status || "pending"}`
    : "custom domain is not set yet";
  return `- Public site/profile: ${username} is ${publishText}; ${bioText}; ${domainText}.`;
}

function describeCoreSetupMessaging(
  hasSoulink: boolean | null,
  hasTelegram: boolean | null,
): string {
  if (hasSoulink === true && hasTelegram === true) return "Soulink and Telegram are connected";
  if (hasSoulink === true) return "Soulink is connected; Telegram is not connected yet";
  if (hasTelegram === true) return "Telegram is connected; Soulink is not connected yet";
  if (hasSoulink === false && hasTelegram === false) return "neither Soulink nor Telegram is connected yet";
  return "messaging setup state is unknown";
}

function describeCoreSetupPlugins(plugins: CoreSetupPluginReadiness | null): string {
  if (!plugins) return "- Plugins: setup state is unknown.";
  if (plugins.total === 0) return "- Plugins: no optional plugin installs are recorded yet.";
  const parts = [
    `${plugins.enabled} enabled`,
    plugins.setupRequired ? `${plugins.setupRequired} need setup` : null,
    plugins.disabled ? `${plugins.disabled} disabled` : null,
  ].filter(Boolean);
  return `- Plugins: ${parts.join(", ")}.`;
}

function describeCoreSetupJobs(jobs: CoreSetupJobsReadiness | null): string {
  if (!jobs) return "- Jobs: setup state is unknown.";
  if (jobs.total === 0) return "- Jobs: no scheduled assistant jobs created yet.";
  const parts = [
    `${jobs.active} active`,
    jobs.needsSetup ? `${jobs.needsSetup} need setup or attention` : null,
    jobs.paused ? `${jobs.paused} paused` : null,
    jobs.draft ? `${jobs.draft} draft` : null,
  ].filter(Boolean);
  return `- Jobs: ${parts.join(", ")}.`;
}

async function loadCoreSetupMailboxReadiness(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<{ status: string | null } | null> {
  try {
    return (
      (await env.DB.prepare(
        `SELECT status
         FROM mailbox_aliases
         WHERE user_id = ?
         LIMIT 1`,
      )
        .bind(ownerId)
        .first<{ status: string | null }>()) || null
    );
  } catch {
    return null;
  }
}

async function hasCoreSetupRow(
  env: Pick<CoreAgentChatEnv, "DB">,
  sql: string,
  ownerId: string,
): Promise<boolean | null> {
  try {
    const row = await env.DB.prepare(sql).bind(ownerId).first<Record<string, unknown>>();
    return Boolean(row);
  } catch {
    return null;
  }
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
  threadId?: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<string | null> {
  if (role === "assistant" && isProviderSetupFallbackMessage(content)) return null;

  try {
    const id = crypto.randomUUID();
    const normalizedThreadId =
      typeof threadId === "string" && threadId.trim() ? threadId.trim() : null;
    const metadataJson = metadata && Object.keys(metadata).length > 0
      ? JSON.stringify(metadata)
      : null;
    if (normalizedThreadId) {
      if (metadataJson) {
        await env.DB.prepare(
          "INSERT INTO assistant_messages (id, owner_id, role, content, thread_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(id, ownerId, role, content, normalizedThreadId, metadataJson)
          .run();
        return id;
      }

      await env.DB.prepare(
        "INSERT INTO assistant_messages (id, owner_id, role, content, thread_id) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(id, ownerId, role, content, normalizedThreadId)
        .run();
      return id;
    }

    if (metadataJson) {
      await env.DB.prepare(
        "INSERT INTO assistant_messages (id, owner_id, role, content, metadata_json) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(id, ownerId, role, content, metadataJson)
        .run();
      return id;
    }

    await env.DB.prepare(
      "INSERT INTO assistant_messages (id, owner_id, role, content) VALUES (?, ?, ?, ?)",
    )
      .bind(id, ownerId, role, content)
      .run();
    return id;
  } catch {
    // Conversation persistence is useful context, but chat turns should not fail on audit writes.
    return null;
  }
}

async function persistAssistantMessageAssetLinks(
  env: CoreAgentChatEnv,
  input: {
    ownerId: string;
    threadId: string | null;
    messageId: string;
    links: PendingAssistantMessageAssetLink[];
  },
) {
  try {
    for (const link of input.links) {
      await env.DB.prepare(
        `INSERT INTO assistant_message_assets
           (id, owner_id, thread_id, message_id, attachment_id, role, display_order, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          link.id,
          input.ownerId,
          input.threadId,
          input.messageId,
          link.attachmentId,
          link.role,
          link.displayOrder,
          JSON.stringify(link.metadata),
        )
        .run();
    }
  } catch {
    // The assistant message metadata still carries generated assets for refresh.
  }
}

function assistantMessageMetadataForResponse(
  response: Pick<AgentSandboxDispatchResponse, "actionCards" | "imageAction">,
): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  if (response.actionCards?.length) metadata.actionCards = response.actionCards;
  if (response.imageAction) metadata.imageAction = response.imageAction;
  return Object.keys(metadata).length ? metadata : null;
}

async function touchAssistantThread(
  env: CoreAgentChatEnv,
  ownerId: string,
  threadId?: string | null,
) {
  if (typeof threadId !== "string" || !threadId.trim()) return;
  try {
    await env.DB.prepare(
      `UPDATE assistant_threads
       SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND owner_id = ?`,
    )
      .bind(threadId.trim(), ownerId)
      .run();
  } catch {
    // Thread timestamps are useful for history ordering, but should not fail a turn.
  }
}

function isProviderSetupFallbackMessage(content: string): boolean {
  return /add an AI provider in Account settings|AI provider setup required|bind Workers AI|model provider failed|returned an empty reply/i.test(
    content,
  );
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
