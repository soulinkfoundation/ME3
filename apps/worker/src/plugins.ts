import type { Env } from "./types";

export const CORE_PLUGIN_CATALOG_VERSION = "2026-05-11.v1";

export type CorePluginStatus =
  | "available"
  | "installed"
  | "setup_required"
  | "disabled";

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
  implementationStatus: "catalog_only",
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
      id: "social.accounts.api",
      path: "/api/social/accounts",
      methods: ["GET", "DELETE"],
      auth: "owner",
    },
    {
      id: "social.oauth.api",
      path: "/api/social/:platform/authorize",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "social.oauth.callbacks",
      path: "/api/social/:platform/callback",
      methods: ["GET"],
      auth: "public",
    },
    {
      id: "content.bank.api",
      path: "/api/content/items",
      methods: ["GET", "POST", "PUT", "DELETE"],
      auth: "owner",
    },
    {
      id: "content.queue.api",
      path: "/api/content/queue",
      methods: ["POST", "PUT"],
      auth: "owner",
    },
    {
      id: "content.media.api",
      path: "/api/content/items/:id/media",
      methods: ["POST"],
      auth: "owner",
    },
    {
      id: "content.publish.api",
      path: "/api/content/items/:id/publish",
      methods: ["POST"],
      auth: "owner",
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
  secrets: [
    {
      name: "TOKEN_ENCRYPTION_KEY",
      label: "Token encryption key",
      required: true,
    },
    {
      name: "X_CLIENT_SECRET",
      label: "X OAuth client secret",
      required: false,
    },
    {
      name: "LINKEDIN_SOCIAL_CLIENT_SECRET",
      label: "LinkedIn social OAuth client secret",
      required: false,
    },
    {
      name: "INSTAGRAM_APP_SECRET",
      label: "Instagram app secret",
      required: false,
    },
    {
      name: "GOOGLE_CLIENT_SECRET",
      label: "Google OAuth client secret for YouTube publishing",
      required: false,
    },
  ],
  migrations: [
    {
      id: "social.0028",
      path: "./apps/worker/migrations/0028_social_publishing.sql",
      destructive: false,
    },
    {
      id: "social.0029",
      path: "./apps/worker/migrations/0029_social_platform_expansion.sql",
      destructive: false,
    },
    {
      id: "social.0046",
      path: "./apps/worker/migrations/0046_content_bank_items.sql",
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
    "Catalog-only in Core until the Social Publishing workspace package is extracted and bundled.",
    "External publishing remains approval-first and audit-backed.",
  ],
};

export const CORE_PLUGIN_CATALOG: readonly CorePluginManifestSummary[] = [
  SOCIAL_PUBLISHING_PLUGIN,
];

export async function activateCorePlugin(
  env: Env,
  pluginId: string,
): Promise<CorePluginRecord> {
  const plugin = getCorePluginManifest(pluginId);
  const now = new Date().toISOString();
  const setupRequirements = getSetupRequirements(env, plugin, null);
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
  const installed = Boolean(installation);
  const enabled = installed && installation?.enabled !== 0 && installation?.status !== "disabled";
  const setupBlocked = setupRequirements.some(
    (requirement) => requirement.required && !requirement.configured,
  );
  const status: CorePluginStatus = !installed
    ? "available"
    : !enabled
      ? "disabled"
      : setupBlocked || installation?.status === "setup_required"
        ? "setup_required"
        : "installed";

  return {
    ...plugin,
    status,
    statusLabel: statusToLabel(status),
    installed,
    enabled,
    grantedPermissions: parseJsonStringArray(installation?.granted_permissions_json || null),
    setupRequirements,
    installedAt: installation?.installed_at || null,
    updatedAt: installation?.updated_at || null,
  };
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
      required: item.kind === "queue",
      configured: item.kind === "queue" ? Boolean(item.binding && envRecord[item.binding]) : true,
      note: item.kind === "queue" ? "Cloudflare queue binding." : "Declared schedule.",
    });
  }

  requirements.push({
    id: `${plugin.id}.migrations`,
    label: `${plugin.migrations.length} plugin migration${plugin.migrations.length === 1 ? "" : "s"}`,
    kind: "migration",
    required: true,
    configured: Boolean(installation),
    note: installation ? "Tracked by install state." : "Pending until install.",
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
