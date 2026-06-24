import type { Env } from "./types";
import { AGENT_CHAT_RUNTIME } from "./agent-chat";
import { CALENDAR_RUNTIME } from "./calendar";
import { ACCOUNTS_PLUGIN_ID } from "./accounts";
import { JOURNAL_PLUGIN_ID, JOURNAL_RUNTIME } from "@me3-core/plugin-journal";
import { LANDING_PAGES_RUNTIME } from "@me3-core/plugin-landing-pages";
import { LOCAL_EXECUTOR_PLUGIN_ID, LOCAL_EXECUTOR_RUNTIME } from "@me3-core/plugin-local-executor";
import { MISSION_CONTROL_RUNTIME } from "@me3-core/plugin-mission-control";
import { SOCIAL_PUBLISHING_RUNTIME } from "./social-publishing";
import {
  defineMe3AgentCapabilityContract,
  ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
  validateMe3AgentCapabilityContract,
  type Me3AgentCapabilityApprovalMode,
  type Me3AgentCapabilityCategory,
  type Me3AgentCapabilityContract,
  type Me3AgentCapabilitySideEffect,
} from "@me3/knowledge";

export const CORE_PLUGIN_CATALOG_VERSION = "2026-06-11.v1";
const PUBLIC_BASELINE_MIGRATION_PATH =
  "./apps/worker/migrations/0001_initial_public_schema.sql";

function publicBaselineMigration(id: string, description: string) {
  return {
    id,
    path: PUBLIC_BASELINE_MIGRATION_PATH,
    destructive: false,
    description,
  };
}

function agentTool(
  input: Omit<CorePluginAgentTool, "auditEventKind" | "examples"> &
    Partial<Pick<CorePluginAgentTool, "auditEventKind" | "examples">>,
): CorePluginAgentTool {
  return {
    ...input,
    auditEventKind:
      input.auditEventKind || `${input.id.replace(/[^a-z0-9]+/gi, "_")}_requested`,
    examples: input.examples || {
      positive: [`Use ${input.label.toLowerCase()}.`],
      negative: ["What can this plugin do?"],
    },
  };
}

export type CorePluginStatus =
  | "available"
  | "installed"
  | "setup_required"
  | "disabled"
  | "coming_soon";

export type CorePluginSetupRequirement = {
  id: string;
  label: string;
  kind: "package" | "secret" | "binding" | "migration" | "queue" | "cron";
  required: boolean;
  configured: boolean;
  note?: string;
};

export type CorePluginAgentTool = {
  id: string;
  label: string;
  sideEffect: Me3AgentCapabilitySideEffect;
  approvalMode: Me3AgentCapabilityApprovalMode;
  auditEventKind: string;
  examples: {
    positive: readonly string[];
    negative: readonly string[];
  };
};

export type CorePluginManifestSummary = {
  schemaVersion: string;
  id: string;
  name: string;
  version: string;
  description: string;
  trustTier: "first_party" | "third_party";
  distribution: "workspace_package" | "npm_package" | "remote_bundle";
  installMode: "enabled_by_owner_config";
  defaultEnabled?: boolean;
  releaseStage?: "available" | "coming_soon";
  activationAllowed?: boolean;
  implementationStatus: "catalog_only" | "bundled";
  capabilityIds: string[];
  permissions: { id: string; label: string }[];
  routes: { id: string; path: string; methods: string[]; auth: string }[];
  uiSlots: { id: string; slot: string; label: string }[];
  dashboardCards?: {
    id: string;
    label: string;
    componentKey: string;
    defaultEnabled: boolean;
    defaultSize: "small" | "medium" | "wide";
    dataEndpoint?: string;
    requiresPluginIds?: string[];
    requiresCapabilityIds?: string[];
  }[];
  dashboardQuickActions?: {
    id: string;
    label: string;
    icon: string;
    defaultEnabled: boolean;
    destinationId: string;
    requiresPluginIds?: string[];
  }[];
  agentTools: CorePluginAgentTool[];
  secrets: { name: string; label: string; required: boolean }[];
  migrations: { id: string; path: string; destructive: boolean; description?: string }[];
  queuesAndCrons: {
    id: string;
    kind: "queue" | "cron";
    binding?: string;
    queueName?: string;
    schedule?: string;
    producerEntrypoint?: string;
    consumerEntrypoint?: string;
    maxRetries?: number;
  }[];
  notes: string[];
};

export type DbPluginInstallation = {
  plugin_id: string;
  version: string;
  enabled: number;
  status: "installed" | "setup_required" | "disabled";
  granted_permissions_json: string;
  setup_state_json: string;
  installed_at: string;
  updated_at: string;
};

export type CorePluginRecord = CorePluginManifestSummary & {
  status: CorePluginStatus;
  statusLabel: string;
  installed: boolean;
  enabled: boolean;
  grantedPermissions: string[];
  setupRequirements: CorePluginSetupRequirement[];
  installedAt: string | null;
  updatedAt: string | null;
};

export class PluginInstallInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404,
  ) {
    super(message);
  }
}

const SOCIAL_PUBLISHING_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.social-publishing",
  name: "ME3 Social Publishing",
  version: "0.1.0",
  description:
    "First-party social publishing capability pack for content drafts, account connections, scheduling, provider publishing, and audit history.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  implementationStatus: SOCIAL_PUBLISHING_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: ["content.social_assistant"],
  permissions: [
    {
      id: "content.social.publish",
      label: "Publish approved social content",
    },
    {
      id: "content.social.accounts.manage",
      label: "Connect social provider accounts",
    },
  ],
  routes: [
    {
      id: "social.status.api",
      path: "/api/social/status",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "social.accounts.read.api",
      path: "/api/social/accounts",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "content.items.api",
      path: "/api/content/items",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "content.item.api",
      path: "/api/content/items/:id",
      methods: ["PUT", "DELETE"],
      auth: "owner",
    },
    {
      id: "content.queue.api",
      path: "/api/content/items/:id/queue",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "content.publish.api",
      path: "/api/content/items/:id/publish",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "social.oauth.start.api",
      path: "/api/social/:platform/authorize",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "social.oauth.callback.api",
      path: "/api/social/:platform/callback",
      methods: ["GET"],
      auth: "public",
    },
  ],
  uiSlots: [
    {
      id: "social.dashboard.nav",
      slot: "dashboard.nav",
      label: "Content",
    },
    {
      id: "social.accounts.panel",
      slot: "dashboard.panel",
      label: "Social accounts",
    },
    {
      id: "social.article-share",
      slot: "site.editor",
      label: "Share article",
    },
  ],
  dashboardCards: [
    {
      id: "social.queue-summary",
      label: "Social Queue",
      componentKey: "SocialQueueSummaryCard",
      defaultEnabled: false,
      defaultSize: "medium",
      requiresPluginIds: ["me3.social-publishing"],
    },
  ],
  dashboardQuickActions: [
    {
      id: "social.schedule",
      label: "Schedule a post",
      icon: "Send",
      defaultEnabled: true,
      destinationId: "social.schedule",
      requiresPluginIds: ["me3.social-publishing"],
    },
  ],
  agentTools: [
    agentTool({
      id: "content.write_preview",
      label: "Preview social content",
      sideEffect: "none",
      approvalMode: "approval_required",
    }),
    agentTool({
      id: "content.publish",
      label: "Queue approved social content",
      sideEffect: "external_write",
      approvalMode: "approval_required",
    }),
  ],
  secrets: [],
  migrations: [
    publicBaselineMigration(
      "social.public-baseline",
      "Social accounts, OAuth state, content bank, packages, variants, publications, and audit tables are included in the initial public schema.",
    ),
  ],
  queuesAndCrons: [...SOCIAL_PUBLISHING_RUNTIME.queuesAndCrons],
  notes: [
    "Bundled through @me3-core/plugin-social-publishing as a first-party Core package.",
    "Current runtime exposes owner-only content bank, OAuth account connection, account inventory reads, and approval-first queue dispatch when installed.",
    "ME3-hosted provider OAuth should supply social app credentials; Core installs should only connect their own social accounts.",
    "External publishing workers and cron dispatch are package-owned and remain gated by plugin readiness, approval, and account state.",
  ],
};

const MISSION_CONTROL_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.mission-control",
  name: "ME3 Mission Control",
  version: "0.1.0",
  description:
    "Operational workspace for reviewing projects, tasks, approvals, private memory, sources, and assistant activity.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: true,
  implementationStatus: MISSION_CONTROL_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: [
    "workspace.mission_control",
    "workspace.tasks",
    "workspace.approvals",
    "workspace.private_memory",
    "workspace.context_sources",
    "workspace.agent_runs",
    "workspace.local_daemon_bridge",
  ],
  permissions: [
    {
      id: "mission.tasks.manage",
      label: "Create and manage Mission Control tasks and projects",
    },
    {
      id: "mission.approvals.manage",
      label: "Review and resolve assistant approvals",
    },
    {
      id: "mission.memory.manage",
      label: "Store and manage private owner memory",
    },
    {
      id: "mission.context_sources.manage",
      label: "Manage private context source inventory",
    },
    {
      id: "mission.agent_runs.read",
      label: "Read agent run history and plugin activity",
    },
    {
      id: "mission.daemon.pair",
      label: "Pair optional local daemon bridges",
    },
  ],
  routes: [
    {
      id: "mission.projects.api",
      path: "/api/mission-control/projects",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "mission.dashboard.api",
      path: "/api/mission-control/dashboard",
      methods: ["GET", "PATCH"],
      auth: "owner",
    },
    {
      id: "mission.dashboard.ai_usage.api",
      path: "/api/mission-control/dashboard/cards/mission.ai-usage",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.wheel.api",
      path: "/api/mission-control/wheel",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.wheel.settings.api",
      path: "/api/mission-control/wheel/settings",
      methods: ["PATCH"],
      auth: "owner",
    },
    {
      id: "mission.wheel.snapshots.api",
      path: "/api/mission-control/wheel/snapshots",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "mission.tasks.api",
      path: "/api/mission-control/tasks",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "mission.task.api",
      path: "/api/mission-control/tasks/:id",
      methods: ["PATCH", "DELETE"],
      auth: "owner",
    },
    {
      id: "mission.approvals.api",
      path: "/api/mission-control/approvals",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.approval.api",
      path: "/api/mission-control/approvals/:id",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "mission.runs.api",
      path: "/api/mission-control/agent-runs",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.memory.api",
      path: "/api/mission-control/memory",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "mission.memory.item.api",
      path: "/api/mission-control/memory/:id",
      methods: ["PATCH", "DELETE"],
      auth: "owner",
    },
    {
      id: "mission.context-sources.api",
      path: "/api/mission-control/context-sources",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "mission.context-source.api",
      path: "/api/mission-control/context-sources/:id",
      methods: ["PATCH", "DELETE"],
      auth: "owner",
    },
    {
      id: "mission.plugin-activity.api",
      path: "/api/mission-control/plugin-activity",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.setup.api",
      path: "/api/mission-control/setup",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.daemon.api",
      path: "/api/mission-control/daemon/*",
      methods: ["GET", "POST", "PATCH"],
      auth: "owner",
    },
  ],
  uiSlots: [
    {
      id: "mission.dashboard.nav",
      slot: "dashboard.nav",
      label: "🚀 Mission Control",
    },
    {
      id: "mission.workspace.page",
      slot: "dashboard.page",
      label: "Mission Control",
    },
    {
      id: "mission.setup.panel",
      slot: "account.plugins.setup",
      label: "Mission Control setup",
    },
    {
      id: "mission.approvals.panel",
      slot: "app.shell.alerts",
      label: "Pending approvals",
    },
  ],
  dashboardCards: [
    {
      id: "mission.daily-briefing",
      label: "Daily Briefing",
      componentKey: "DailyBriefingCard",
      defaultEnabled: true,
      defaultSize: "medium",
      dataEndpoint: "/api/mission-control/dashboard/cards/mission.daily-briefing",
    },
    {
      id: "mission.mission-statement",
      label: "Mission Statement",
      componentKey: "MissionStatementCard",
      defaultEnabled: true,
      defaultSize: "medium",
    },
    {
      id: "mission.wheel-latest-snapshot",
      label: "Wheel of Life Snapshot",
      componentKey: "WheelSnapshotCard",
      defaultEnabled: true,
      defaultSize: "medium",
      dataEndpoint: "/api/mission-control/dashboard/cards/mission.wheel-latest-snapshot",
    },
    {
      id: "mission.quick-task-add",
      label: "Quick Task Add",
      componentKey: "QuickProjectTaskCard",
      defaultEnabled: true,
      defaultSize: "medium",
    },
    {
      id: "mission.projects-summary",
      label: "Projects Summary",
      componentKey: "ProjectsSummaryCard",
      defaultEnabled: false,
      defaultSize: "medium",
    },
    {
      id: "mission.ai-usage",
      label: "AI Usage",
      componentKey: "AiUsageCard",
      defaultEnabled: true,
      defaultSize: "medium",
      dataEndpoint: "/api/mission-control/dashboard/cards/mission.ai-usage",
    },
  ],
  dashboardQuickActions: [
    {
      id: "mission.projects",
      label: "View Projects",
      icon: "ListChecks",
      defaultEnabled: true,
      destinationId: "mission.projects",
    },
  ],
  agentTools: [
    agentTool({
      id: "mission.task.create",
      label: "Create task",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    }),
    agentTool({
      id: "mission.memory.write",
      label: "Write private memory",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    }),
    agentTool({
      id: "mission.approval.request",
      label: "Request owner approval",
      sideEffect: "internal_write",
      approvalMode: "none",
    }),
    agentTool({
      id: "mission.daemon.read",
      label: "Read approved local context through paired daemon",
      sideEffect: "local_read",
      approvalMode: "approval_required",
    }),
    agentTool({
      id: "mission.daemon.write",
      label: "Write approved local files through paired daemon",
      sideEffect: "local_write",
      approvalMode: "approval_required",
    }),
    agentTool({
      id: "mission.daemon.shell",
      label: "Run approved local shell command through paired daemon",
      sideEffect: "local_shell",
      approvalMode: "approval_required",
    }),
  ],
  secrets: [],
  migrations: [
    publicBaselineMigration(
      "mission.public-baseline",
      "Mission projects, tasks, approvals, agent runs, plugin activity, private memory, context sources, daemon pairing, and dashboard tables are included in the initial public schema.",
    ),
  ],
  queuesAndCrons: [],
  notes: [
    "Mission Control is bundled as a first-party package and enabled by default.",
    "Public me.json remains Core-owned and separate from plugin private memory.",
    "Local daemon access is optional, owner-paired, path-scoped, and approval-gated.",
  ],
};

const CALENDAR_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.calendar",
  name: "ME3 Calendar",
  version: "0.1.0",
  description:
    "First-party calendar workspace for bookings, reminders, personal events, birthdays, imported calendars, and recurring event expansion.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: true,
  implementationStatus: CALENDAR_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: ["workspace.calendar"],
  permissions: [
    {
      id: "calendar.events.manage",
      label: "Create and manage personal calendar events",
    },
    {
      id: "calendar.reminders.manage",
      label: "Create and manage owner reminders",
    },
  ],
  routes: [
    {
      id: "calendar.feed.api",
      path: "/api/calendar/feed",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "calendar.events.api",
      path: "/api/calendar/events",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "calendar.event.api",
      path: "/api/calendar/events/:id",
      methods: ["PUT", "DELETE"],
      auth: "owner",
    },
    {
      id: "calendar.reminders.api",
      path: "/api/agent/reminders",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "calendar.reminder.api",
      path: "/api/agent/reminders/:id",
      methods: ["PUT"],
      auth: "owner",
    },
    {
      id: "calendar.reminder.cancel.api",
      path: "/api/agent/reminders/:id/cancel",
      methods: ["PUT"],
      auth: "owner",
    },
  ],
  uiSlots: [
    {
      id: "calendar.dashboard.nav",
      slot: "dashboard.nav",
      label: "Calendar",
    },
    {
      id: "calendar.workspace.panel",
      slot: "dashboard.panel",
      label: "Calendar",
    },
  ],
  dashboardCards: [
    {
      id: "calendar.today",
      label: "Calendar Today",
      componentKey: "CalendarTodayCard",
      defaultEnabled: false,
      defaultSize: "medium",
      requiresPluginIds: ["me3.calendar"],
    },
  ],
  agentTools: [
    agentTool({
      id: "calendar.event.create",
      label: "Create calendar event",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    }),
    agentTool({
      id: "calendar.reminder.create",
      label: "Create reminder",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    }),
  ],
  secrets: [],
  migrations: [
    publicBaselineMigration(
      "calendar.public-baseline",
      "Calendar events, sources, reminders, bookings, and recurrence-capable event fields are included in the initial public schema.",
    ),
  ],
  queuesAndCrons: [],
  notes: [
    "Bundled through @me3-core/plugin-calendar as a first-party Core package.",
    "Calendar is currently a default workspace surface while plugin install state becomes the long-term owner configuration surface.",
    "Recurring event normalization and feed expansion live in the plugin package so hosted ME3 can mirror the same behavior.",
  ],
};

const ACCOUNTS_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: ACCOUNTS_PLUGIN_ID,
  name: "ME3 Accounts",
  version: "0.1.0",
  description:
    "Use ME3 to manage your accounts.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: false,
  implementationStatus: "bundled",
  capabilityIds: ["workspace.accounts", "finance.ledger", "finance.invoice_receipt_triage_context"],
  permissions: [
    {
      id: "accounts.entries.manage",
      label: "Create and manage account ledger entries",
    },
    {
      id: "accounts.csv.import_export",
      label: "Import and export account CSV files",
    },
    {
      id: "accounts.stripe.sync",
      label: "Sync Stripe charges using the owner-stored Stripe key",
    },
  ],
  routes: [
    {
      id: "accounts.entries.api",
      path: "/api/accounts/entries",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "accounts.entry.api",
      path: "/api/accounts/entries/:id",
      methods: ["PUT", "DELETE"],
      auth: "owner",
    },
    {
      id: "accounts.categories.api",
      path: "/api/accounts/categories",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "accounts.category.api",
      path: "/api/accounts/categories/:id",
      methods: ["DELETE"],
      auth: "owner",
    },
    {
      id: "accounts.csv.api",
      path: "/api/accounts/import",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "accounts.export.api",
      path: "/api/accounts/export",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "accounts.stripe.api",
      path: "/api/accounts/stripe/*",
      methods: ["GET", "POST"],
      auth: "owner",
    },
  ],
  uiSlots: [
    {
      id: "accounts.ledger.page",
      slot: "app.page",
      label: "Accounts",
    },
    {
      id: "accounts.setup.panel",
      slot: "account.plugins.setup",
      label: "Accounts setup",
    },
  ],
  dashboardCards: [
    {
      id: "accounts.summary",
      label: "Accounts Summary",
      componentKey: "AccountsSummaryCard",
      defaultEnabled: false,
      defaultSize: "medium",
      requiresPluginIds: [ACCOUNTS_PLUGIN_ID],
    },
  ],
  dashboardQuickActions: [
    {
      id: "accounts.ledger",
      label: "Open Accounts",
      icon: "WalletCards",
      defaultEnabled: true,
      destinationId: "accounts.ledger",
      requiresPluginIds: [ACCOUNTS_PLUGIN_ID],
    },
  ],
  agentTools: [
    agentTool({
      id: "accounts.entry.create",
      label: "Create account entry",
      sideEffect: "money_or_account",
      approvalMode: "approval_required",
    }),
    agentTool({
      id: "accounts.entry.review",
      label: "Mark account entry for review",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    }),
  ],
  secrets: [],
  migrations: [
    publicBaselineMigration(
      "accounts.public-baseline",
      "Financial categories and ledger entries are included in the initial public schema.",
    ),
    {
      id: "accounts.financial-entry-projects",
      path: "./apps/worker/migrations/0011_financial_entry_projects.sql",
      destructive: false,
      description: "Adds optional Mission Control project links to financial entries.",
    },
  ],
  queuesAndCrons: [],
  notes: [
    "Accounts is optional because not every Core owner wants finance records in their install.",
    "The plugin stores only owner-scoped ledger and category rows; Stripe secrets stay in Account commerce settings.",
    "Invoice and receipt triage jobs should write low-confidence items as needs_review entries.",
  ],
};

const AGENT_CHAT_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.agent-chat",
  name: "ME3 Agent Chat",
  version: "0.1.0",
  description:
    "Chat with your ME3 assistant in the full AI chat workspace.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: true,
  implementationStatus: AGENT_CHAT_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: ["chat.core_reply"],
  permissions: [
    {
      id: "agent.chat.reply",
      label: "Respond to owner chat messages",
    },
  ],
  routes: [
    {
      id: "assistant.chat.turn.api",
      path: "/api/assistant/chat/turn",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "assistant.voice.transcribe.api",
      path: "/api/assistant/voice/transcribe",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "agent.sandbox.api",
      path: "/api/agent/sandbox",
      methods: ["POST"],
      auth: "owner",
    },
  ],
  uiSlots: [
    {
      id: "agent.chat.launcher",
      slot: "app.shell",
      label: "Agent chat launcher",
    },
  ],
  dashboardQuickActions: [
    {
      id: "assistant.chat",
      label: "Chat with ME3",
      icon: "MessageCircle",
      defaultEnabled: true,
      destinationId: "assistant.chat",
    },
  ],
  agentTools: [
    agentTool({
      id: "chat.core_reply",
      label: "Core chat reply",
      sideEffect: "none",
      approvalMode: "none",
    }),
  ],
  secrets: [
    {
      name: "OPENAI_API_KEY",
      label: "OpenAI API key",
      required: false,
    },
    {
      name: "ANTHROPIC_API_KEY",
      label: "Anthropic API key",
      required: false,
    },
  ],
  migrations: [
    publicBaselineMigration(
      "agent-chat.public-baseline",
      "Owner profile, assistant messages, threads, attachments, AI provider settings, mailbox, contacts, and agent channel tables are included in the initial public schema.",
    ),
  ],
  queuesAndCrons: [],
  notes: [
    "Bundled through @me3-core/plugin-agent-chat as a first-party Core package.",
    "Enabled by default because chat is the baseline ME3 Core experience, while plugin packaging keeps future tools portable.",
    "Current runtime supports general chat through configured Core AI routes; richer tool actions should be added behind this package boundary.",
  ],
};

const LANDING_PAGES_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.landing-pages",
  name: "ME3 Landing Pages",
  version: "0.1.0",
  description:
    "First-party landing-page package for draft generation, template metadata, document validation, and static HTML rendering.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: false,
  releaseStage: "coming_soon",
  activationAllowed: false,
  implementationStatus: LANDING_PAGES_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: ["sites.landing_pages", "agent.landing_page_generation"],
  permissions: [
    {
      id: "sites.landing_pages.manage",
      label: "Create and manage landing-page drafts",
    },
    {
      id: "agent.landing_pages.generate",
      label: "Generate landing-page copy and structure",
    },
  ],
  routes: [
    {
      id: "sites.landing-page.read.api",
      path: "/api/sites/:username/landing-page",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "sites.landing-page.save.api",
      path: "/api/sites/:username/landing-page",
      methods: ["PUT"],
      auth: "owner",
    },
    {
      id: "agent.landing-page.generate.api",
      path: "/api/agent/landing-pages/generate",
      methods: ["POST"],
      auth: "owner",
    },
  ],
  uiSlots: [
    {
      id: "sites.landing-pages.tab",
      slot: "sites.nav",
      label: "Landing pages",
    },
    {
      id: "sites.landing-pages.builder",
      slot: "sites.builder",
      label: "Landing page builder",
    },
  ],
  dashboardCards: [
    {
      id: "sites.blog-summary",
      label: "Blog",
      componentKey: "SitesBlogSummaryCard",
      defaultEnabled: false,
      defaultSize: "medium",
      requiresPluginIds: ["me3.landing-pages"],
    },
  ],
  dashboardQuickActions: [
    {
      id: "sites.blog",
      label: "Write a blog",
      icon: "FileText",
      defaultEnabled: true,
      destinationId: "sites.blog",
      requiresPluginIds: ["me3.landing-pages"],
    },
  ],
  agentTools: [
    agentTool({
      id: "landing_pages.generate_draft",
      label: "Generate landing page draft",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    }),
  ],
  secrets: [],
  migrations: [],
  queuesAndCrons: [],
  notes: [
    "Bundled through @me3-core/plugin-landing-pages as a first-party optional Core package.",
    "The package owns template metadata, v1 document normalization, deterministic draft generation, and HTML rendering.",
    "Worker routes retain owner auth, site lookup, file persistence, and publish behavior.",
    "Hosted ME3 should keep Pro gating, me3.app URL defaults, quotas, and billing copy outside this shared package.",
  ],
};

const LOCAL_EXECUTOR_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: LOCAL_EXECUTOR_PLUGIN_ID,
  name: "Local Executor",
  version: "0.1.0",
  description:
    "Connect ME3 to your local computer to run tasks there. Setup required.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: false,
  implementationStatus: LOCAL_EXECUTOR_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: ["local_executor.run"],
  permissions: [
    {
      id: "local_executor.pair",
      label: "Pair local runners",
    },
    {
      id: "local_executor.policies.manage",
      label: "Manage local project policies",
    },
    {
      id: "local_executor.runs.manage",
      label: "Queue and review local runner jobs",
    },
  ],
  routes: [
    {
      id: "local-executor.status.api",
      path: "/api/local-executor/status",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "local-executor.pairing.api",
      path: "/api/local-executor/pairing/start",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "local-executor.policies.api",
      path: "/api/local-executor/policies",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "local-executor.policy.api",
      path: "/api/local-executor/policies/:id",
      methods: ["PATCH", "DELETE"],
      auth: "owner",
    },
    {
      id: "local-executor.runs.api",
      path: "/api/local-executor/runs",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "local-executor.mission-task-run.api",
      path: "/api/mission-control/tasks/:id/local-run",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "local-executor.run.api",
      path: "/api/local-executor/runs/:id",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "local-executor.audit.api",
      path: "/api/local-executor/audit",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "local-executor.daemon.api",
      path: "/api/local-executor/daemon/*",
      methods: ["POST"],
      auth: "daemon_token",
    },
  ],
  uiSlots: [
    {
      id: "local-executor.account.setup",
      slot: "account.plugins.setup",
      label: "Local Executor setup",
    },
  ],
  agentTools: [
    agentTool({
      id: "local_executor.run",
      label: "Queue a bounded local runner job",
      sideEffect: "local_shell",
      approvalMode: "approval_required",
    }),
  ],
  secrets: [],
  migrations: [
    publicBaselineMigration(
      "local-executor.public-baseline",
      "Local runner pairings, project policies, runs, run events, and audit events are included in the initial public schema.",
    ),
  ],
  queuesAndCrons: [],
  notes: [
    "Bundled through @me3-core/plugin-local-executor as an optional first-party Core package.",
    "The plugin owns runner pairing, project policies, queued local runs, daemon token auth, and audit.",
    "Mission Control remains the canonical owner-facing approval, result, history, and activity surface.",
    "OpenCode is the default provider preset, with Codex and Claude presets available for local CLI users.",
  ],
};

const JOURNAL_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: JOURNAL_PLUGIN_ID,
  name: "ME3 Journal",
  version: "0.1.0",
  description:
    "Private daily writing workspace for notes, braindumps, drafts, and longer-form capture.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: true,
  implementationStatus: JOURNAL_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: ["workspace.journal", "journal.entries.manage"],
  permissions: [
    {
      id: "journal.entries.manage",
      label: "Create and manage private journal entries",
    },
  ],
  routes: [
    {
      id: "journal.day.read.api",
      path: "/api/journal/days/:date",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "journal.day.save.api",
      path: "/api/journal/days/:date",
      methods: ["PATCH"],
      auth: "owner",
    },
    {
      id: "journal.archive.api",
      path: "/api/journal/archive",
      methods: ["GET"],
      auth: "owner",
    },
  ],
  uiSlots: [
    {
      id: "journal.nav",
      slot: "dashboard.nav",
      label: "Journal",
    },
  ],
  dashboardCards: [
    {
      id: "journal.latest-entry",
      label: "Latest Journal Entry",
      componentKey: "JournalLatestEntryCard",
      defaultEnabled: false,
      defaultSize: "medium",
      requiresPluginIds: [JOURNAL_PLUGIN_ID],
    },
  ],
  dashboardQuickActions: [
    {
      id: "journal.today",
      label: "Add Journal Entry",
      icon: "BookOpen",
      defaultEnabled: true,
      destinationId: "journal.today",
      requiresPluginIds: [JOURNAL_PLUGIN_ID],
    },
  ],
  agentTools: [],
  secrets: [],
  migrations: [
    publicBaselineMigration(
      "journal.public-baseline",
      "Journal entries are included in the initial public schema.",
    ),
  ],
  queuesAndCrons: [],
  notes: [
    "Bundled through @me3-core/plugin-journal as a first-party Core package.",
    "Journal owns private owner-scoped writing entries and is surfaced through Mission Control workflows.",
    "Assistant actions from journal text should be added through explicit capabilities in a later pass.",
  ],
};

export const CORE_PLUGIN_CATALOG: readonly CorePluginManifestSummary[] = [
  AGENT_CHAT_PLUGIN,
  MISSION_CONTROL_PLUGIN,
  JOURNAL_PLUGIN,
  ACCOUNTS_PLUGIN,
  CALENDAR_PLUGIN,
  LOCAL_EXECUTOR_PLUGIN,
  LANDING_PAGES_PLUGIN,
  SOCIAL_PUBLISHING_PLUGIN,
];

export function listCorePluginAgentToolContracts(
  plugins: readonly CorePluginManifestSummary[] = CORE_PLUGIN_CATALOG,
): Me3AgentCapabilityContract[] {
  return plugins.flatMap((plugin) =>
    plugin.agentTools.map((tool) => corePluginAgentToolToContract(plugin, tool)),
  );
}

export function validateCorePluginAgentToolContracts(
  plugins: readonly CorePluginManifestSummary[] = CORE_PLUGIN_CATALOG,
) {
  return listCorePluginAgentToolContracts(plugins).flatMap((capability) =>
    validateMe3AgentCapabilityContract(capability),
  );
}

function corePluginAgentToolToContract(
  plugin: CorePluginManifestSummary,
  tool: CorePluginAgentTool,
): Me3AgentCapabilityContract {
  return defineMe3AgentCapabilityContract({
    id: tool.id,
    owner: "plugin",
    pluginId: plugin.id,
    version: plugin.version,
    ownerFacingLabel: tool.label,
    summary: `${plugin.name}: ${tool.label}.`,
    category: categoryForPlugin(plugin.id),
    handler: {
      surface: "plugin_tool",
      route: tool.id,
    },
    sideEffect: tool.sideEffect,
    approvalMode: tool.approvalMode,
    requiresSetup: setupRequirementIdsForPluginContract(plugin),
    inputSchema: ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
    outputSchema: ME3_EMPTY_AGENT_CAPABILITY_SCHEMA,
    auditEventKind: tool.auditEventKind,
    examples: tool.examples,
  });
}

function categoryForPlugin(pluginId: string): Me3AgentCapabilityCategory {
  if (pluginId === "me3.agent-chat") return "assistant";
  if (pluginId === "me3.mission-control") return "mission_control";
  if (pluginId === "me3.calendar") return "calendar";
  if (pluginId === "me3.social-publishing") return "content";
  if (pluginId === "me3.accounts") return "accounts";
  if (pluginId === "me3.landing-pages") return "sites";
  if (pluginId === "me3.local-executor") return "local";
  return "provider";
}

function setupRequirementIdsForPluginContract(
  plugin: CorePluginManifestSummary,
): string[] {
  return [
    ...plugin.secrets
      .filter((secret) => secret.required)
      .map((secret) => `secret:${secret.name}`),
    ...plugin.migrations.map((migration) => `migration:${migration.id}`),
  ];
}

export async function activateCorePlugin(
  env: Env,
  pluginId: string,
): Promise<CorePluginRecord> {
  const plugin = getCorePluginManifest(pluginId);
  if (!isPluginActivationAllowed(plugin)) {
    throw new PluginInstallInputError(
      `${plugin.name} is coming soon and cannot be activated yet`,
      400,
    );
  }
  const now = new Date().toISOString();
  const setupRequirements = getSetupRequirements(env, plugin, {
    plugin_id: plugin.id,
    version: plugin.version,
    enabled: 1,
    status: "installed",
    granted_permissions_json: "[]",
    setup_state_json: "{}",
    installed_at: now,
    updated_at: now,
  });
  const setupBlocked = setupRequirements.some(
    (requirement) => requirement.required && !requirement.configured,
  );
  const status = setupBlocked ? "setup_required" : "installed";

  await env.DB.prepare(
    `INSERT INTO plugin_installations (
       plugin_id, version, enabled, status, granted_permissions_json,
       setup_state_json, installed_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(plugin_id) DO UPDATE SET
       version = excluded.version,
       enabled = excluded.enabled,
       status = excluded.status,
       granted_permissions_json = excluded.granted_permissions_json,
       setup_state_json = excluded.setup_state_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      plugin.id,
      plugin.version,
      1,
      status,
      JSON.stringify(plugin.permissions.map((permission) => permission.id)),
      JSON.stringify({ activatedFromCatalogVersion: CORE_PLUGIN_CATALOG_VERSION }),
      now,
      now,
    )
    .run();

  return serializePluginRecord(env, plugin, await getPluginInstallation(env, plugin.id));
}

export async function deactivateCorePlugin(
  env: Env,
  pluginId: string,
): Promise<CorePluginRecord> {
  const plugin = getCorePluginManifest(pluginId);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO plugin_installations (
       plugin_id, version, enabled, status, granted_permissions_json,
       setup_state_json, installed_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(plugin_id) DO UPDATE SET
       version = excluded.version,
       enabled = excluded.enabled,
       status = excluded.status,
       setup_state_json = excluded.setup_state_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      plugin.id,
      plugin.version,
      0,
      "disabled",
      JSON.stringify([]),
      JSON.stringify({ deactivatedAt: now }),
      now,
      now,
    )
    .run();

  return serializePluginRecord(env, plugin, await getPluginInstallation(env, plugin.id));
}

export async function listCorePluginRecords(env: Env): Promise<CorePluginRecord[]> {
  const installations = await listPluginInstallations(env);
  return CORE_PLUGIN_CATALOG.map((plugin) =>
    serializePluginRecord(env, plugin, installations.get(plugin.id) || null),
  );
}

export async function isCorePluginEnabled(
  env: Env,
  pluginId: string,
): Promise<boolean> {
  const plugin = getCorePluginManifest(pluginId);
  const record = serializePluginRecord(
    env,
    plugin,
    await getPluginInstallation(env, plugin.id),
  );
  return record.enabled && record.status === "installed";
}

function getCorePluginManifest(pluginId: string): CorePluginManifestSummary {
  const plugin = CORE_PLUGIN_CATALOG.find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    throw new PluginInstallInputError("Plugin is not in the Core catalog", 404);
  }
  return plugin;
}

async function listPluginInstallations(env: Env): Promise<Map<string, DbPluginInstallation>> {
  const rows = await env.DB.prepare(
    `SELECT plugin_id, version, enabled, status, granted_permissions_json,
            setup_state_json, installed_at, updated_at
     FROM plugin_installations
     ORDER BY plugin_id`,
  ).all<DbPluginInstallation>();

  return new Map((rows.results || []).map((row) => [row.plugin_id, row]));
}

async function getPluginInstallation(
  env: Env,
  pluginId: string,
): Promise<DbPluginInstallation | null> {
  return env.DB.prepare(
    `SELECT plugin_id, version, enabled, status, granted_permissions_json,
            setup_state_json, installed_at, updated_at
     FROM plugin_installations
     WHERE plugin_id = ?`,
  )
    .bind(pluginId)
    .first<DbPluginInstallation>();
}

function serializePluginRecord(
  env: Env,
  plugin: CorePluginManifestSummary,
  installation: DbPluginInstallation | null,
): CorePluginRecord {
  const setupRequirements = getSetupRequirements(env, plugin, installation);
  const activationAllowed = isPluginActivationAllowed(plugin);
  const alwaysEnabled = plugin.id === JOURNAL_PLUGIN_ID && plugin.defaultEnabled === true;
  const defaultInstalled = !installation && plugin.defaultEnabled === true;
  const installed = Boolean(installation) || defaultInstalled;
  const enabled =
    activationAllowed &&
    installed &&
    (alwaysEnabled ||
      ((defaultInstalled || installation?.enabled !== 0) &&
        installation?.status !== "disabled"));
  const setupBlocked = setupRequirements.some(
    (requirement) => requirement.required && !requirement.configured,
  );
  let status: CorePluginStatus = "installed";
  if (!activationAllowed) {
    status = "coming_soon";
  } else if (!installed) {
    status = "available";
  } else if (!enabled) {
    status = "disabled";
  } else if (setupBlocked || installation?.status === "setup_required") {
    status = "setup_required";
  }

  return {
    ...plugin,
    releaseStage: plugin.releaseStage || "available",
    activationAllowed,
    status,
    statusLabel: statusToLabel(status),
    installed,
    enabled,
    grantedPermissions: alwaysEnabled
      ? plugin.permissions.map((permission) => permission.id)
      : installation
        ? parseJsonStringArray(installation.granted_permissions_json || null)
        : defaultInstalled
          ? plugin.permissions.map((permission) => permission.id)
          : [],
    setupRequirements,
    installedAt: installation?.installed_at || null,
    updatedAt: installation?.updated_at || null,
  };
}

function isPluginActivationAllowed(plugin: CorePluginManifestSummary): boolean {
  return plugin.activationAllowed !== false && plugin.releaseStage !== "coming_soon";
}

function getSetupRequirements(
  env: Env,
  plugin: CorePluginManifestSummary,
  installation: DbPluginInstallation | null,
): CorePluginSetupRequirement[] {
  const envRecord = env as unknown as Record<string, unknown>;
  const requirements: CorePluginSetupRequirement[] = [
    {
      id: `${plugin.id}.package`,
      label: "Implementation package",
      kind: "package",
      required: true,
      configured: plugin.implementationStatus === "bundled",
      note:
        plugin.implementationStatus === "bundled"
          ? "Bundled into this Core build."
          : "Not bundled in this Core build yet.",
    },
  ];

  for (const secret of plugin.secrets) {
    requirements.push({
      id: `${plugin.id}.secret.${secret.name}`,
      label: secret.label,
      kind: "secret",
      required: secret.required,
      configured: Boolean(envRecord[secret.name]),
      note: secret.required ? undefined : "Optional provider setup.",
    });
  }

  for (const item of plugin.queuesAndCrons) {
    requirements.push({
      id: `${plugin.id}.${item.kind}.${item.id}`,
      label: item.kind === "queue" ? item.binding || item.id : `Cron ${item.schedule}`,
      kind: item.kind,
      required: false,
      configured: item.kind === "queue" ? Boolean(item.binding && envRecord[item.binding]) : true,
      note:
        item.kind === "queue"
          ? "Optional until the publishing worker is extracted."
          : "Declared schedule.",
    });
  }

  requirements.push({
    id: `${plugin.id}.migrations`,
    label: `${plugin.migrations.length} plugin migration${plugin.migrations.length === 1 ? "" : "s"}`,
    kind: "migration",
    required: true,
    configured: Boolean(installation) || plugin.defaultEnabled === true,
    note:
      installation
        ? "Tracked by install state."
        : plugin.defaultEnabled === true
          ? "Enabled by default in this Core build."
        : "Pending until install.",
  });

  return requirements;
}

function statusToLabel(status: CorePluginStatus): string {
  switch (status) {
    case "installed":
      return "Installed";
    case "setup_required":
      return "Setup required";
    case "disabled":
      return "Disabled";
    case "coming_soon":
      return "Coming soon";
    default:
      return "Available";
  }
}

function parseJsonStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}
