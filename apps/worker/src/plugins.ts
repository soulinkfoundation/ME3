import type { Env } from "./types";
import { AGENT_CHAT_RUNTIME } from "./agent-chat";
import { CALENDAR_RUNTIME } from "./calendar";
import { LANDING_PAGES_RUNTIME } from "@me3-core/plugin-landing-pages";
import { MISSION_CONTROL_RUNTIME } from "@me3-core/plugin-mission-control";
import { SOCIAL_PUBLISHING_RUNTIME } from "./social-publishing";

export const CORE_PLUGIN_CATALOG_VERSION = "2026-05-15.v1";

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
  agentTools: { id: string; label: string; sideEffect: string; approvalMode: string }[];
  secrets: { name: string; label: string; required: boolean }[];
  migrations: { id: string; path: string; destructive: false }[];
  queuesAndCrons: { id: string; kind: "queue" | "cron"; binding?: string; schedule?: string }[];
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
  agentTools: [
    {
      id: "content.write_preview",
      label: "Preview social content",
      sideEffect: "none",
      approvalMode: "approval_required",
    },
    {
      id: "content.publish",
      label: "Queue approved social content",
      sideEffect: "external_write",
      approvalMode: "approval_required",
    },
  ],
  secrets: [],
  migrations: [
    {
      id: "social.0011",
      path: "./apps/worker/migrations/0011_social_publishing_plugin.sql",
      destructive: false,
    },
    {
      id: "social.0012",
      path: "./apps/worker/migrations/0012_social_publishing_oauth_setup.sql",
      destructive: false,
    },
  ],
  queuesAndCrons: [
    {
      id: "social.publish-queue",
      kind: "queue",
      binding: "SOCIAL_PUBLISH_QUEUE",
    },
    {
      id: "social.scheduled-dispatch",
      kind: "cron",
      schedule: "* * * * *",
    },
  ],
  notes: [
    "Bundled through @me3-core/plugin-social-publishing as a first-party Core package.",
    "Current runtime exposes owner-only content bank, OAuth account connection, account inventory reads, and approval-first queue state when installed.",
    "ME3-hosted provider OAuth should supply social app credentials; Core installs should only connect their own social accounts.",
    "External publishing workers and cron dispatch remain approval-first follow-up work.",
  ],
};

const MISSION_CONTROL_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.mission-control",
  name: "ME3 Mission Control",
  version: "0.1.0",
  description:
    "Default first-party Core workspace for daily capture, tasks, projects, approvals, agent run history, plugin activity, private memory, context sources, setup status, and optional local-daemon bridge.",
  trustTier: "first_party",
  distribution: "workspace_package",
  installMode: "enabled_by_owner_config",
  defaultEnabled: true,
  implementationStatus: MISSION_CONTROL_RUNTIME.bundled ? "bundled" : "catalog_only",
  capabilityIds: [
    "workspace.mission_control",
    "workspace.daily_capture",
    "workspace.tasks",
    "workspace.approvals",
    "workspace.private_memory",
    "workspace.context_sources",
    "workspace.agent_runs",
    "workspace.local_daemon_bridge",
  ],
  permissions: [
    {
      id: "mission.capture.manage",
      label: "Create and manage daily captures and journal entries",
    },
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
      id: "mission.overview.api",
      path: "/api/mission-control/overview",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.day.api",
      path: "/api/mission-control/days/:date",
      methods: ["GET", "PATCH"],
      auth: "owner",
    },
    {
      id: "mission.journal_archive.api",
      path: "/api/mission-control/journal-archive",
      methods: ["GET"],
      auth: "owner",
    },
    {
      id: "mission.capture.api",
      path: "/api/mission-control/capture",
      methods: ["GET", "POST"],
      auth: "owner",
    },
    {
      id: "mission.capture.item.api",
      path: "/api/mission-control/capture/:id",
      methods: ["PATCH", "DELETE"],
      auth: "owner",
    },
    {
      id: "mission.projects.api",
      path: "/api/mission-control/projects",
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
  agentTools: [
    {
      id: "mission.capture.create",
      label: "Create daily capture",
      sideEffect: "internal_write",
      approvalMode: "none",
    },
    {
      id: "mission.task.create",
      label: "Create task",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    },
    {
      id: "mission.memory.write",
      label: "Write private memory",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    },
    {
      id: "mission.approval.request",
      label: "Request owner approval",
      sideEffect: "internal_write",
      approvalMode: "none",
    },
    {
      id: "mission.daemon.read",
      label: "Read approved local context through paired daemon",
      sideEffect: "local_read",
      approvalMode: "approval_required",
    },
    {
      id: "mission.daemon.write",
      label: "Write approved local files through paired daemon",
      sideEffect: "local_write",
      approvalMode: "approval_required",
    },
    {
      id: "mission.daemon.shell",
      label: "Run approved local shell command through paired daemon",
      sideEffect: "local_shell",
      approvalMode: "approval_required",
    },
  ],
  secrets: [],
  migrations: [
    {
      id: "mission.0015",
      path: "./apps/worker/migrations/0015_mission_control_plugin.sql",
      destructive: false,
    },
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
  agentTools: [
    {
      id: "calendar.event.create",
      label: "Create calendar event",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    },
    {
      id: "calendar.reminder.create",
      label: "Create reminder",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    },
  ],
  secrets: [],
  migrations: [
    {
      id: "calendar.0003",
      path: "./apps/worker/migrations/0003_workspace_surfaces.sql",
      destructive: false,
    },
    {
      id: "calendar.0013",
      path: "./apps/worker/migrations/0013_calendar_plugin_recurrence.sql",
      destructive: false,
    },
  ],
  queuesAndCrons: [],
  notes: [
    "Bundled through @me3-core/plugin-calendar as a first-party Core package.",
    "Calendar is currently a default workspace surface while plugin install state becomes the long-term owner configuration surface.",
    "Recurring event normalization and feed expansion live in the plugin package so hosted ME3 can mirror the same behavior.",
  ],
};

const AGENT_CHAT_PLUGIN: CorePluginManifestSummary = {
  schemaVersion: CORE_PLUGIN_CATALOG_VERSION,
  id: "me3.agent-chat",
  name: "ME3 Agent Chat",
  version: "0.1.0",
  description:
    "First-party owner chat runtime for the ME3 assistant, exposed through the sandbox chat API and per-owner Durable Object.",
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
  agentTools: [
    {
      id: "chat.core_reply",
      label: "Core chat reply",
      sideEffect: "none",
      approvalMode: "none",
    },
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
    {
      id: "agent-chat.0001",
      path: "./apps/worker/migrations/0001_core_bootstrap.sql",
      destructive: false,
    },
    {
      id: "agent-chat.0003",
      path: "./apps/worker/migrations/0003_workspace_surfaces.sql",
      destructive: false,
    },
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
  agentTools: [
    {
      id: "landing_pages.generate_draft",
      label: "Generate landing page draft",
      sideEffect: "internal_write",
      approvalMode: "approval_required",
    },
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

export const CORE_PLUGIN_CATALOG: readonly CorePluginManifestSummary[] = [
  AGENT_CHAT_PLUGIN,
  MISSION_CONTROL_PLUGIN,
  CALENDAR_PLUGIN,
  LANDING_PAGES_PLUGIN,
  SOCIAL_PUBLISHING_PLUGIN,
];

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
  const defaultInstalled = !installation && plugin.defaultEnabled === true;
  const installed = Boolean(installation) || defaultInstalled;
  const enabled =
    activationAllowed &&
    installed &&
    (defaultInstalled || installation?.enabled !== 0) &&
    installation?.status !== "disabled";
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
    grantedPermissions: installation
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
