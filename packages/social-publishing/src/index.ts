export const SOCIAL_PUBLISHING_PLUGIN_ID = "me3.social-publishing";

export const SOCIAL_PUBLISHING_RUNTIME = {
  id: SOCIAL_PUBLISHING_PLUGIN_ID,
  packageName: "@me3-core/plugin-social-publishing",
  bundled: true,
  runtimeStatus: "read_only_runtime",
  supportedPlatforms: ["x", "linkedin", "instagram", "instagram_business"],
  excludedProviders: ["youtube"],
  notes: [
    "Core bundles the plugin runtime through an explicit workspace package.",
    "This slice exposes owner-only status and account inventory reads.",
    "Provider OAuth, queue consumers, cron dispatch, and live provider writes remain outside Core for now.",
  ],
} as const;

export type SocialPublishingRuntimeStatus =
  | "available"
  | "installed"
  | "setup_required"
  | "disabled";

export type SocialPublishingGate = {
  pluginId: typeof SOCIAL_PUBLISHING_PLUGIN_ID;
  status: SocialPublishingRuntimeStatus;
  enabled: boolean;
  ready: boolean;
  statusLabel: string;
};

export type SocialPublishingAccount = {
  id: string;
  siteId: string;
  platform: string;
  platformAccountId: string;
  handle: string | null;
  displayName: string | null;
  status: string;
  scopes: string[];
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PluginInstallationRow = {
  enabled: number;
  status: "installed" | "setup_required" | "disabled";
};

type SocialAccountRow = {
  id: string;
  site_id: string;
  platform: string;
  platform_account_id: string;
  platform_handle: string | null;
  display_name: string | null;
  status: string;
  scopes_json: string;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type D1StatementLike = {
  bind(...values: unknown[]): {
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results?: T[] }>;
  };
};

type SocialPublishingEnv = {
  DB: {
    prepare(sql: string): D1StatementLike;
  };
};

export class SocialPublishingGateError extends Error {
  constructor(
    public readonly gate: SocialPublishingGate,
    message = gateErrorMessage(gate),
  ) {
    super(message);
    this.name = "SocialPublishingGateError";
  }

  get status(): 403 | 404 | 424 {
    if (this.gate.status === "available") return 404;
    if (this.gate.status === "setup_required") return 424;
    return 403;
  }
}

export async function getSocialPublishingRuntimeStatus(
  env: SocialPublishingEnv,
): Promise<SocialPublishingGate> {
  const row = await env.DB.prepare(
    `SELECT enabled, status
     FROM plugin_installations
     WHERE plugin_id = ?`,
  )
    .bind(SOCIAL_PUBLISHING_PLUGIN_ID)
    .first<PluginInstallationRow>();

  if (!row) return createGate("available", false);
  if (row.enabled === 0 || row.status === "disabled") return createGate("disabled", false);
  if (row.status === "setup_required") return createGate("setup_required", true);
  return createGate("installed", true);
}

export async function listSocialPublishingAccounts(
  env: SocialPublishingEnv,
  ownerId: string,
): Promise<SocialPublishingAccount[]> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) {
    throw new SocialPublishingGateError(gate);
  }

  const rows = await env.DB.prepare(
    `SELECT id, site_id, platform, platform_account_id, platform_handle, display_name,
            status, scopes_json, last_verified_at, created_at, updated_at
     FROM social_accounts
     WHERE user_id = ?
       AND platform IN ('x', 'linkedin', 'instagram', 'instagram_business')
     ORDER BY updated_at DESC`,
  )
    .bind(ownerId)
    .all<SocialAccountRow>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    siteId: row.site_id,
    platform: row.platform,
    platformAccountId: row.platform_account_id,
    handle: row.platform_handle,
    displayName: row.display_name,
    status: row.status,
    scopes: parseStringArray(row.scopes_json),
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function createGate(
  status: SocialPublishingRuntimeStatus,
  enabled: boolean,
): SocialPublishingGate {
  return {
    pluginId: SOCIAL_PUBLISHING_PLUGIN_ID,
    status,
    enabled,
    ready: status === "installed" && enabled,
    statusLabel: statusToLabel(status),
  };
}

function statusToLabel(status: SocialPublishingRuntimeStatus): string {
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

function gateErrorMessage(gate: SocialPublishingGate): string {
  if (gate.status === "available") return "Social Publishing is not installed";
  if (gate.status === "setup_required") return "Social Publishing setup is required";
  return "Social Publishing is disabled";
}

function parseStringArray(raw: string | null): string[] {
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
