import { adapterFor } from "./adapters";

export const SOCIAL_PUBLISHING_PLUGIN_ID = "me3.social-publishing";
export const SOCIAL_PUBLISH_QUEUE_NAME = "me3-social-publish";
export const SOCIAL_PUBLISH_QUEUE_BINDING = "SOCIAL_PUBLISH_QUEUE";

export const SOCIAL_PUBLISHING_RUNTIME = {
  id: SOCIAL_PUBLISHING_PLUGIN_ID,
  packageName: "@me3-core/plugin-social-publishing",
  bundled: true,
  runtimeStatus: "approval_first_publish_runtime",
  supportedPlatforms: ["x", "linkedin", "instagram", "instagram_business"],
  excludedProviders: ["youtube"],
  queuesAndCrons: [
    {
      id: "social.publish-queue",
      kind: "queue",
      binding: SOCIAL_PUBLISH_QUEUE_BINDING,
      queueName: SOCIAL_PUBLISH_QUEUE_NAME,
      producerEntrypoint:
        "@me3-core/plugin-social-publishing#createQueuedContentPublicationAndEnqueue",
      consumerEntrypoint:
        "@me3-core/plugin-social-publishing#processSocialPublishBatch",
      maxRetries: 2,
    },
    {
      id: "social.scheduled-dispatch",
      kind: "cron",
      schedule: "* * * * *",
      consumerEntrypoint:
        "@me3-core/plugin-social-publishing#dispatchDueSocialPublications",
    },
  ],
  notes: [
    "Core bundles the plugin runtime through an explicit workspace package.",
    "This slice exposes owner-only status, provider setup, OAuth account connection, account inventory reads, and approval-first queue dispatch.",
    "Live provider writes are disabled unless the plugin is installed, enabled, the content item is human-approved, and a matching active account is connected.",
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

export const SOCIAL_PLATFORMS = [
  "x",
  "linkedin",
  "instagram",
  "instagram_business",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialProviderSetting = {
  providerId: SocialPlatform;
  label: string;
  clientId: string;
  configured: boolean;
  enabled: boolean;
  secretHint: string | null;
  secretUpdatedAt: string | null;
  callbackPath: string;
};

export type SocialAuthorizeInput = {
  platform?: unknown;
  siteId?: unknown;
  returnPath?: unknown;
};

export type SocialAuthorizeOptions = {
  apiOrigin: string;
  hostedOAuthOrigin?: string | null;
};

export type SocialCallbackOptions = {
  apiOrigin: string;
  webOrigin: string;
  fetch: typeof fetch;
  installKey: string;
  hostedOAuthOrigin?: string | null;
};

export type SocialProviderSettingsUpdate = {
  providers?: unknown;
};

export type ContentPlatform = SocialPlatform;

export type ContentItemStatus =
  | "bank"
  | "queued"
  | "scheduled"
  | "publishing"
  | "posted"
  | "failed"
  | "archived";

export type ContentMediaAsset = {
  url: string;
  filename?: string;
  mimeType?: string;
  kind?: "image" | "video";
  path?: string;
  assetIndex?: number;
};

export type ContentItem = {
  id: string;
  siteId: string;
  siteUsername: string;
  userId: string;
  body: string;
  mediaManifest: ContentMediaAsset[];
  platforms: ContentPlatform[];
  sourceType: "original" | "blog_extract" | "imported" | "reworked";
  sourceRef: string | null;
  status: ContentItemStatus;
  queuePosition: number | null;
  scheduledFor: string | null;
  timezone: string | null;
  createdBy: "human" | "agent_suggested";
  approvedByHuman: boolean;
  evergreen: boolean;
  timesPosted: number;
  lastPostedAt: string | null;
  cooldownDays: number;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentStats = {
  bankCount: number;
  queuedCount: number;
  postedCount: number;
  nextScheduledAt: string | null;
};

export type CreateContentItemInput = {
  siteId?: unknown;
  body?: unknown;
  platforms?: unknown;
  mediaManifest?: unknown;
  timezone?: unknown;
  notes?: unknown;
  evergreen?: unknown;
  tags?: unknown;
};

export type UpdateContentItemInput = Partial<CreateContentItemInput> & {
  status?: unknown;
};

type PluginInstallationRow = {
  enabled: number;
  status: "installed" | "setup_required" | "disabled";
};

type SiteRow = {
  id: string;
  user_id: string;
  username?: string;
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

type SocialProviderSettingRow = {
  user_id: string;
  provider_id: string;
  client_id: string;
  encrypted_client_secret: string | null;
  secret_hint: string | null;
  secret_updated_at: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type SocialOauthStateRow = {
  id: string;
  state: string;
  user_id: string;
  site_id: string;
  platform: SocialPlatform;
  return_path: string;
  code_verifier: string | null;
  expires_at: string;
};

type ContentItemRow = {
  id: string;
  site_id: string;
  site_username: string;
  user_id: string;
  body: string;
  media_manifest_json: string;
  platforms_json: string;
  source_type: ContentItem["sourceType"];
  source_ref: string | null;
  status: ContentItemStatus;
  queue_position: number | null;
  scheduled_for: string | null;
  timezone: string | null;
  created_by: ContentItem["createdBy"];
  approved_by_human: number;
  evergreen: number;
  times_posted: number;
  last_posted_at: string | null;
  cooldown_days: number;
  tags_json: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ContentQueueRow = {
  id: string;
  status: ContentItemStatus;
  queue_position: number | null;
};

type SocialPublicationEventType =
  | "generated"
  | "approved"
  | "queued"
  | "publishing"
  | "published"
  | "failed"
  | "retried";

type SocialPublicationRow = {
  publication_id: string;
  variant_id: string;
  site_id: string;
  platform: SocialPlatform;
  pub_status: "queued" | "publishing" | "published" | "failed" | "cancelled";
  body: string;
  media_manifest_json: string;
  platforms_json: string;
  approved_by_human: number;
  user_id: string;
  account_id: string | null;
  platform_account_id: string | null;
  access_token_ciphertext: string | null;
  token_expires_at: string | null;
  account_status: string | null;
};

export type SocialPublishQueueMessage = {
  publicationId: string;
};

type D1StatementLike = {
  bind(...values: unknown[]): {
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results?: T[] }>;
    run(): Promise<unknown>;
  };
};

type SocialPublishingEnv = {
  DB: {
    prepare(sql: string): D1StatementLike;
  };
  SOCIAL_PUBLISH_QUEUE?: {
    send(message: SocialPublishQueueMessage): Promise<unknown>;
  };
  CORE_API_ORIGIN?: string;
  CORE_WEB_ORIGIN?: string;
  ME3_API_HOST?: string;
  ME3_SITE_HOST?: string;
  ME3_CUSTOM_DOMAIN?: string;
  TOKEN_ENCRYPTION_KEY?: string;
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

export class SocialPublishingInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SocialPublishingInputError";
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

export async function listSocialProviderSettings(
  env: SocialPublishingEnv,
  ownerId: string,
): Promise<SocialProviderSetting[]> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const rows = await listProviderSettingRows(env, ownerId);
  return SOCIAL_PLATFORMS.map((platform) =>
    serializeProviderSetting(platform, rows.get(platform) || null),
  );
}

export async function updateSocialProviderSettings(
  env: SocialPublishingEnv,
  ownerId: string,
  input: SocialProviderSettingsUpdate,
  installKey: string,
): Promise<SocialProviderSetting[]> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);
  if (!isRecord(input) || !Array.isArray(input.providers)) {
    throw new SocialPublishingInputError("providers must be an array");
  }

  const existing = await listProviderSettingRows(env, ownerId);
  const now = new Date().toISOString();
  for (const item of input.providers) {
    if (!isRecord(item)) {
      throw new SocialPublishingInputError("provider updates must be objects");
    }
    const platform = normalizePlatform(item.id ?? item.providerId);
    if (!platform) throw new SocialPublishingInputError("Unknown social provider");

    const current = existing.get(platform) || null;
    const clientId = normalizeClientId(item.clientId ?? current?.client_id ?? "");
    let encryptedSecret = current?.encrypted_client_secret || null;
    let secretHint = current?.secret_hint || null;
    let secretUpdatedAt = current?.secret_updated_at || null;
    const secretInput = normalizeSecretInput(item.clientSecret);

    if (item.clearSecret === true || secretInput === null) {
      encryptedSecret = null;
      secretHint = null;
      secretUpdatedAt = null;
    } else if (secretInput) {
      encryptedSecret = await encryptSecret(secretInput, installKey);
      secretHint = getSecretHint(secretInput);
      secretUpdatedAt = now;
    }

    const enabled = item.enabled === undefined ? Boolean(clientId && encryptedSecret) : item.enabled === true;
    await env.DB.prepare(
      `INSERT INTO social_provider_settings (
         user_id, provider_id, client_id, encrypted_client_secret, secret_hint,
         secret_updated_at, enabled, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider_id) DO UPDATE SET
         client_id = excluded.client_id,
         encrypted_client_secret = excluded.encrypted_client_secret,
         secret_hint = excluded.secret_hint,
         secret_updated_at = excluded.secret_updated_at,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    )
      .bind(
        ownerId,
        platform,
        clientId,
        encryptedSecret,
        secretHint,
        secretUpdatedAt,
        enabled ? 1 : 0,
        current?.created_at || now,
        now,
      )
      .run();
  }

  return listSocialProviderSettings(env, ownerId);
}

export async function startSocialOAuth(
  env: SocialPublishingEnv,
  ownerId: string,
  input: SocialAuthorizeInput,
  options: SocialAuthorizeOptions,
): Promise<{ url: string; platform: SocialPlatform }> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const platform = normalizePlatform(input.platform);
  if (!platform) throw new SocialPublishingInputError("Unsupported social platform");
  const siteId = normalizeId(input.siteId);
  if (!siteId) throw new SocialPublishingInputError("siteId is required");

  const site = await env.DB.prepare("SELECT id, user_id FROM sites WHERE id = ? AND user_id = ?")
    .bind(siteId, ownerId)
    .first<SiteRow>();
  if (!site) throw new SocialPublishingInputError("Site not found", 404);

  if (options.hostedOAuthOrigin) {
    const id = randomToken("socst");
    const state = randomToken(`soc_${platform}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const returnPath = sanitizeReturnPath(input.returnPath);

    await env.DB.prepare(
      `INSERT INTO social_oauth_states (
         id, state, user_id, site_id, platform, return_path, code_verifier, expires_at, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, datetime('now'))`,
    )
      .bind(id, state, ownerId, siteId, platform, returnPath, expiresAt)
      .run();

    return {
      platform,
      url: buildHostedAuthorizeUrl(platform, state, options),
    };
  }

  const setting = await getProviderSettingRow(env, ownerId, platform);
  if (!setting?.enabled || !setting.client_id || !setting.encrypted_client_secret) {
    throw new SocialPublishingInputError(`${platformLabel(platform)} integration is not configured`, 424);
  }

  const id = randomToken("socst");
  const state = randomToken(`soc_${platform}`);
  const codeVerifier = platform === "x" ? randomVerifier() : null;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const returnPath = sanitizeReturnPath(input.returnPath);

  await env.DB.prepare(
    `INSERT INTO social_oauth_states (
       id, state, user_id, site_id, platform, return_path, code_verifier, expires_at, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(id, state, ownerId, siteId, platform, returnPath, codeVerifier, expiresAt)
    .run();

  return {
    platform,
    url: await buildAuthorizeUrl(platform, setting.client_id, state, codeVerifier, options.apiOrigin),
  };
}

function buildHostedAuthorizeUrl(
  platform: SocialPlatform,
  state: string,
  options: SocialAuthorizeOptions,
): string {
  const origin = options.hostedOAuthOrigin?.replace(/\/$/, "");
  if (!origin) throw new SocialPublishingInputError("Hosted social OAuth is not configured", 424);
  const url = new URL(`/api/social/${platform}/authorize`, origin);
  url.searchParams.set("state", state);
  url.searchParams.set("core_callback", `${options.apiOrigin.replace(/\/$/, "")}/api/social/${platform}/callback`);
  return url.toString();
}

export async function completeSocialOAuth(
  env: SocialPublishingEnv,
  platformInput: unknown,
  query: { code?: string | null; state?: string | null; error?: string | null; handoff?: string | null },
  options: SocialCallbackOptions,
): Promise<string> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  const platform = normalizePlatform(platformInput);
  const frontend = options.webOrigin;
  if (query.error) return buildFrontendRedirect(frontend, "/social", { social_error: query.error });
  if (!platform || !query.state) {
    return buildFrontendRedirect(frontend, "/social", { social_error: "missing_params" });
  }
  if (!gate.ready) {
    return buildFrontendRedirect(frontend, "/social", { social_error: gate.status });
  }

  const stateRow = await env.DB.prepare(
    `SELECT id, state, user_id, site_id, platform, return_path, code_verifier, expires_at
     FROM social_oauth_states
     WHERE state = ? AND platform = ?`,
  )
    .bind(query.state, platform)
    .first<SocialOauthStateRow>();

  if (!stateRow || new Date(stateRow.expires_at) < new Date()) {
    return buildFrontendRedirect(frontend, "/social", { social_error: "state_expired" });
  }

  if (query.handoff) {
    return completeHostedSocialOAuth(env, stateRow, query.handoff, options);
  }

  if (!query.code) {
    return buildFrontendRedirect(frontend, "/social", { social_error: "missing_params" });
  }

  const setting = await getProviderSettingRow(env, stateRow.user_id, platform);
  if (!setting?.client_id || !setting.encrypted_client_secret) {
    return buildFrontendRedirect(frontend, stateRow.return_path, { social_error: "config" });
  }

  const clientSecret = await decryptSecret(setting.encrypted_client_secret, options.installKey);
  const token = await exchangeOAuthCode(platform, query.code, setting.client_id, clientSecret, stateRow.code_verifier, options);
  const profile = await fetchSocialProfile(platform, token.accessToken, options.fetch);
  const now = new Date().toISOString();

  await env.DB.prepare("DELETE FROM social_oauth_states WHERE id = ?")
    .bind(stateRow.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO social_accounts (
       id, user_id, site_id, platform, platform_account_id, platform_handle, display_name,
       access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes_json,
       status, metadata_json, last_verified_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
     ON CONFLICT(site_id, platform, platform_account_id) DO UPDATE SET
       platform_handle = excluded.platform_handle,
       display_name = excluded.display_name,
       access_token_ciphertext = excluded.access_token_ciphertext,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       token_expires_at = excluded.token_expires_at,
       scopes_json = excluded.scopes_json,
       status = 'active',
       metadata_json = excluded.metadata_json,
       last_verified_at = excluded.last_verified_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      randomToken("socacct"),
      stateRow.user_id,
      stateRow.site_id,
      platform,
      profile.id,
      profile.handle,
      profile.displayName,
      await encryptSecret(token.accessToken, options.installKey),
      token.refreshToken ? await encryptSecret(token.refreshToken, options.installKey) : null,
      token.expiresAt,
      JSON.stringify(token.scopes),
      JSON.stringify({ provider: platform }),
      now,
      now,
      now,
    )
    .run();

  return buildFrontendRedirect(frontend, stateRow.return_path, { social_connected: platform });
}

async function completeHostedSocialOAuth(
  env: SocialPublishingEnv,
  stateRow: SocialOauthStateRow,
  handoff: string,
  options: SocialCallbackOptions,
): Promise<string> {
  const origin = options.hostedOAuthOrigin?.replace(/\/$/, "");
  if (!origin) {
    return buildFrontendRedirect(options.webOrigin, stateRow.return_path, { social_error: "config" });
  }

  const response = await options.fetch(`${origin}/api/social/oauth/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handoff,
      state: stateRow.state,
      platform: stateRow.platform,
    }),
  });
  const payload = await readJsonResponse<{
    account?: {
      id?: string;
      handle?: string | null;
      displayName?: string | null;
    };
    token?: {
      accessToken?: string;
      refreshToken?: string | null;
      expiresAt?: string | null;
      scopes?: string[];
    };
  }>(response);

  if (!payload.account?.id || !payload.token?.accessToken) {
    throw new SocialPublishingInputError("Hosted social handoff was invalid", 502);
  }

  const now = new Date().toISOString();
  await env.DB.prepare("DELETE FROM social_oauth_states WHERE id = ?")
    .bind(stateRow.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO social_accounts (
       id, user_id, site_id, platform, platform_account_id, platform_handle, display_name,
       access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes_json,
       status, metadata_json, last_verified_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
     ON CONFLICT(site_id, platform, platform_account_id) DO UPDATE SET
       platform_handle = excluded.platform_handle,
       display_name = excluded.display_name,
       access_token_ciphertext = excluded.access_token_ciphertext,
       refresh_token_ciphertext = excluded.refresh_token_ciphertext,
       token_expires_at = excluded.token_expires_at,
       scopes_json = excluded.scopes_json,
       status = 'active',
       metadata_json = excluded.metadata_json,
       last_verified_at = excluded.last_verified_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      randomToken("socacct"),
      stateRow.user_id,
      stateRow.site_id,
      stateRow.platform,
      payload.account.id,
      payload.account.handle || null,
      payload.account.displayName || null,
      await encryptSecret(payload.token.accessToken, options.installKey),
      payload.token.refreshToken ? await encryptSecret(payload.token.refreshToken, options.installKey) : null,
      payload.token.expiresAt || null,
      JSON.stringify(Array.isArray(payload.token.scopes) ? payload.token.scopes : []),
      JSON.stringify({ provider: stateRow.platform, credentialSource: "hosted_oauth" }),
      now,
      now,
      now,
    )
    .run();

  return buildFrontendRedirect(options.webOrigin, stateRow.return_path, { social_connected: stateRow.platform });
}

export async function listContentItems(
  env: SocialPublishingEnv,
  ownerId: string,
  siteIdInput: unknown,
  statusInput?: unknown,
): Promise<ContentItem[]> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const siteId = normalizeId(siteIdInput);
  if (!siteId) throw new SocialPublishingInputError("siteId is required");
  const site = await getOwnedSite(env, ownerId, siteId);
  if (!site) return [];

  const status = normalizeContentStatus(statusInput);
  const rows = await env.DB.prepare(
    `SELECT c.*, s.username AS site_username
     FROM content_bank_items c
     JOIN sites s ON s.id = c.site_id
     WHERE c.user_id = ?
       AND c.site_id = ?
       AND (? IS NULL OR c.status = ?)
     ORDER BY
       CASE
         WHEN c.status IN ('queued', 'scheduled') THEN 0
         WHEN c.status = 'publishing' THEN 1
         WHEN c.status = 'posted' THEN 3
         ELSE 2
       END ASC,
       CASE
         WHEN c.status IN ('queued', 'scheduled') THEN COALESCE(c.queue_position, 2147483647)
         ELSE NULL
       END ASC,
       CASE
         WHEN c.status = 'posted' THEN COALESCE(c.last_posted_at, c.updated_at)
         ELSE c.updated_at
       END DESC`,
  )
    .bind(ownerId, site.id, status ?? null, status ?? null)
    .all<ContentItemRow>();

  return (rows.results || []).map(serializeContentItem);
}

export async function getContentStats(
  env: SocialPublishingEnv,
  ownerId: string,
  siteIdInput: unknown,
): Promise<ContentStats | null> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const siteId = normalizeId(siteIdInput);
  if (!siteId) throw new SocialPublishingInputError("siteId is required");
  const site = await getOwnedSite(env, ownerId, siteId);
  if (!site) return null;

  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'bank' THEN 1 ELSE 0 END) AS bank_count,
       SUM(CASE WHEN status IN ('queued', 'scheduled') THEN 1 ELSE 0 END) AS queued_count,
       SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) AS posted_count,
       MIN(CASE WHEN status = 'scheduled' THEN scheduled_for ELSE NULL END) AS next_scheduled_at
     FROM content_bank_items
     WHERE user_id = ? AND site_id = ?`,
  )
    .bind(ownerId, site.id)
    .first<{
      bank_count: number | null;
      queued_count: number | null;
      posted_count: number | null;
      next_scheduled_at: string | null;
    }>();

  return {
    bankCount: row?.bank_count || 0,
    queuedCount: row?.queued_count || 0,
    postedCount: row?.posted_count || 0,
    nextScheduledAt: row?.next_scheduled_at || null,
  };
}

export async function createContentItem(
  env: SocialPublishingEnv,
  ownerId: string,
  input: CreateContentItemInput,
): Promise<ContentItem> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const siteId = normalizeId(input.siteId);
  if (!siteId) throw new SocialPublishingInputError("siteId is required");
  const site = await getOwnedSite(env, ownerId, siteId);
  if (!site) throw new SocialPublishingInputError("Site not found", 404);

  const body = normalizeBody(input.body);
  if (!body) throw new SocialPublishingInputError("Content body is required");
  const platforms = normalizeContentPlatforms(input.platforms);
  if (platforms.length === 0) {
    throw new SocialPublishingInputError("Choose at least one platform");
  }

  const id = randomToken("content");
  await env.DB.prepare(
    `INSERT INTO content_bank_items (
       id, site_id, user_id, body, media_manifest_json, platforms_json,
       source_type, source_ref, timezone, notes, evergreen, tags_json,
       approved_by_human, created_by, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, 'original', NULL, ?, ?, ?, ?, 1, 'human', datetime('now'), datetime('now'))`,
  )
    .bind(
      id,
      site.id,
      ownerId,
      body,
      JSON.stringify(normalizeMediaManifest(input.mediaManifest)),
      JSON.stringify(platforms),
      typeof input.timezone === "string" ? input.timezone.trim() || null : null,
      typeof input.notes === "string" ? input.notes.trim() || null : null,
      input.evergreen === true ? 1 : 0,
      JSON.stringify(normalizeTags(input.tags)),
    )
    .run();

  const created = await getOwnedContentItem(env, ownerId, id);
  if (!created) throw new SocialPublishingInputError("Could not create content item", 500);
  return serializeContentItem(created);
}

export async function updateContentItem(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
  input: UpdateContentItemInput,
): Promise<ContentItem | null> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const id = normalizeId(idInput);
  if (!id) throw new SocialPublishingInputError("Content item id is required");
  const existing = await getOwnedContentItem(env, ownerId, id);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.body !== undefined) {
    const body = normalizeBody(input.body);
    if (!body) throw new SocialPublishingInputError("Content body is required");
    updates.push("body = ?");
    values.push(body);
  }
  if (input.platforms !== undefined) {
    const platforms = normalizeContentPlatforms(input.platforms);
    if (platforms.length === 0) {
      throw new SocialPublishingInputError("Choose at least one platform");
    }
    updates.push("platforms_json = ?");
    values.push(JSON.stringify(platforms));
  }
  if (input.mediaManifest !== undefined) {
    updates.push("media_manifest_json = ?");
    values.push(JSON.stringify(normalizeMediaManifest(input.mediaManifest)));
  }
  if (input.status !== undefined) {
    const status = normalizeContentStatus(input.status);
    if (!status) throw new SocialPublishingInputError("Unsupported content status");
    updates.push("status = ?");
    values.push(status);
  }
  if (input.timezone !== undefined) {
    updates.push("timezone = ?");
    values.push(typeof input.timezone === "string" ? input.timezone.trim() || null : null);
  }
  if (input.notes !== undefined) {
    updates.push("notes = ?");
    values.push(typeof input.notes === "string" ? input.notes.trim() || null : null);
  }
  if (input.evergreen !== undefined) {
    updates.push("evergreen = ?");
    values.push(input.evergreen === true ? 1 : 0);
  }
  if (input.tags !== undefined) {
    updates.push("tags_json = ?");
    values.push(JSON.stringify(normalizeTags(input.tags)));
  }

  if (updates.length === 0) return serializeContentItem(existing);

  await env.DB.prepare(
    `UPDATE content_bank_items
     SET ${updates.join(", ")}, approved_by_human = 1, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(...values, id, ownerId)
    .run();

  const updated = await getOwnedContentItem(env, ownerId, id);
  return updated ? serializeContentItem(updated) : null;
}

export async function deleteContentItem(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
): Promise<boolean> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const id = normalizeId(idInput);
  if (!id) throw new SocialPublishingInputError("Content item id is required");
  const existing = await getOwnedContentItem(env, ownerId, id);
  if (!existing) return false;

  await env.DB.prepare("DELETE FROM content_bank_items WHERE id = ? AND user_id = ?")
    .bind(id, ownerId)
    .run();

  if (existing.status === "queued" || existing.status === "scheduled") {
    await resequenceContentQueue(env, ownerId, existing.site_id);
  }
  return true;
}

export async function appendContentItemMedia(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
  asset: ContentMediaAsset,
): Promise<ContentItem | null> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const id = normalizeId(idInput);
  if (!id) throw new SocialPublishingInputError("Content item id is required");
  const existing = await getOwnedContentItem(env, ownerId, id);
  if (!existing) return null;

  const nextManifest = [
    ...normalizeMediaManifest(parseJsonArray(existing.media_manifest_json)),
    asset,
  ];

  await env.DB.prepare(
    `UPDATE content_bank_items
     SET media_manifest_json = ?, approved_by_human = 1, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(JSON.stringify(nextManifest), id, ownerId)
    .run();

  const updated = await getOwnedContentItem(env, ownerId, id);
  return updated ? serializeContentItem(updated) : null;
}

export async function queueContentItem(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
): Promise<ContentItem | null> {
  return setContentQueueState(env, ownerId, idInput, "queued");
}

export async function unqueueContentItem(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
): Promise<ContentItem | null> {
  return setContentQueueState(env, ownerId, idInput, "bank");
}

export async function markContentItemPublishing(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
): Promise<ContentItem | null> {
  const item = await setContentQueueState(env, ownerId, idInput, "publishing");
  return item;
}

export async function createQueuedContentPublicationAndEnqueue(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
): Promise<{ item: ContentItem; publicationIds: string[] } | null> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const id = normalizeId(idInput);
  if (!id) throw new SocialPublishingInputError("Content item id is required");
  const existing = await getOwnedContentItem(env, ownerId, id);
  if (!existing) return null;
  if (existing.approved_by_human !== 1) {
    throw new SocialPublishingInputError("Content item must be approved before publishing", 403);
  }
  if (existing.status === "publishing") {
    throw new SocialPublishingInputError("This item is already publishing");
  }

  const platforms = normalizeContentPlatforms(parseJsonArray(existing.platforms_json));
  if (platforms.length === 0) {
    throw new SocialPublishingInputError("Choose at least one platform");
  }

  const accounts = await listActiveAccountsByPlatform(env, ownerId, existing.site_id, platforms);
  const missing = platforms.filter((platform) => !accounts.has(platform));
  if (missing.length > 0) {
    throw new SocialPublishingInputError(
      `Connect ${missing.map(platformLabel).join(", ")} before publishing`,
      424,
    );
  }

  const publicationIds: string[] = [];
  for (const platform of platforms) {
    const existingPublication = await env.DB.prepare(
      `SELECT id, status
       FROM social_publications
       WHERE variant_id = ? AND platform = ? AND status IN ('queued', 'publishing')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
      .bind(existing.id, platform)
      .first<{ id: string; status: string }>();

    if (existingPublication) {
      publicationIds.push(existingPublication.id);
      continue;
    }

    const publicationId = randomToken("socpub");
    publicationIds.push(publicationId);
    await env.DB.prepare(
      `INSERT INTO social_publications (
         id, variant_id, site_id, platform, status, queued_at, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, 'queued', ?, datetime('now'), datetime('now'))`,
    )
      .bind(publicationId, existing.id, existing.site_id, platform, new Date().toISOString())
      .run();
    await insertSocialPublicationEvent(env, {
      publicationId,
      variantId: existing.id,
      eventType: "queued",
      payload: { platform, contentItemId: existing.id },
    });
    if (env.SOCIAL_PUBLISH_QUEUE) {
      await env.SOCIAL_PUBLISH_QUEUE.send({ publicationId });
    }
  }

  await setContentQueueState(env, ownerId, existing.id, "publishing");
  if (!env.SOCIAL_PUBLISH_QUEUE) {
    for (const publicationId of publicationIds) {
      await publishQueuedContentPublication(env, publicationId);
    }
  }

  const updated = await getOwnedContentItem(env, ownerId, existing.id);
  if (!updated) throw new SocialPublishingInputError("Could not update content item", 500);
  return { item: serializeContentItem(updated), publicationIds };
}

export async function dispatchDueSocialPublications(
  env: SocialPublishingEnv,
): Promise<{ queued: number; skipped: number }> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) return { queued: 0, skipped: 0 };

  const rows = await env.DB.prepare(
    `SELECT c.*, s.username AS site_username
     FROM content_bank_items c
     JOIN sites s ON s.id = c.site_id
     WHERE c.status = 'scheduled'
       AND c.approved_by_human = 1
       AND c.scheduled_for IS NOT NULL
       AND datetime(c.scheduled_for) <= datetime('now')
     ORDER BY c.scheduled_for ASC
     LIMIT 20`,
  )
    .bind()
    .all<ContentItemRow>();

  let queued = 0;
  let skipped = 0;
  for (const row of rows.results || []) {
    try {
      const result = await createQueuedContentPublicationAndEnqueue(env, row.user_id, row.id);
      queued += result?.publicationIds.length || 0;
    } catch {
      skipped += 1;
    }
  }
  return { queued, skipped };
}

export async function processSocialPublishBatch(
  batch: {
    messages: ReadonlyArray<{
      body: SocialPublishQueueMessage;
      ack(): void;
      retry(): void;
    }>;
  },
  env: SocialPublishingEnv,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await publishQueuedContentPublication(env, message.body.publicationId, fetch);
      message.ack();
    } catch (error) {
      console.error("social publish job failed", message.body.publicationId, error);
      message.retry();
    }
  }
}

export async function publishQueuedContentPublication(
  env: SocialPublishingEnv,
  publicationIdInput: unknown,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  const publicationId = normalizeId(publicationIdInput);
  if (!publicationId) throw new SocialPublishingInputError("publicationId is required");

  const row = await getQueuedPublicationRow(env, publicationId);
  if (!row) return;
  if (row.pub_status === "published" || row.pub_status === "cancelled") return;

  if (!gate.ready) {
    await failContentPublication(env, row, gate.status, gateErrorMessage(gate));
    return;
  }

  if (row.approved_by_human !== 1) {
    await failContentPublication(
      env,
      row,
      "not_approved",
      "Content item must be approved before publishing.",
    );
    return;
  }

  if (!row.account_id || !row.platform_account_id || !row.access_token_ciphertext) {
    await failContentPublication(
      env,
      row,
      "no_account",
      `Connect ${platformLabel(row.platform)} before publishing.`,
    );
    return;
  }

  if (row.account_status !== "active" || tokenLooksExpired(row.token_expires_at)) {
    await failContentPublication(
      env,
      row,
      "account_not_ready",
      `${platformLabel(row.platform)} connection is not ready.`,
    );
    return;
  }

  const assets = absolutizeContentAssets(env, normalizeMediaManifest(parseJsonArray(row.media_manifest_json)));
  const adapter = adapterFor(row.platform);
  const validation = adapter.validateDraft({ bodyText: row.body, assets });
  if (!validation.ok) {
    await failContentPublication(env, row, "validation_failed", validation.error);
    return;
  }

  await env.DB.prepare(
    `UPDATE social_publications
     SET status = 'publishing', updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(row.publication_id)
    .run();
  await insertSocialPublicationEvent(env, {
    publicationId: row.publication_id,
    variantId: row.variant_id,
    eventType: "publishing",
    payload: { platform: row.platform, contentItemId: row.variant_id },
  });

  const accessToken = await decryptSecret(row.access_token_ciphertext, await resolveInstallKey(env));
  const result = await adapter.publish({
    accessToken,
    accountId: row.platform_account_id,
    bodyText: row.body,
    assets,
    fetcher,
  });

  if (!result.ok) {
    await failContentPublication(
      env,
      row,
      result.errorCode || "provider_failed",
      result.errorMessage || "Social provider publish failed.",
      result.providerResponse,
    );
    return;
  }

  await env.DB.prepare(
    `UPDATE social_publications
     SET status = 'published',
         platform_post_id = ?,
         platform_post_url = ?,
         provider_response_json = ?,
         published_at = datetime('now'),
         error_code = NULL,
         error_message = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      result.platformPostId || null,
      result.platformPostUrl || null,
      result.providerResponse !== undefined ? JSON.stringify(result.providerResponse) : null,
      row.publication_id,
    )
    .run();

  await insertSocialPublicationEvent(env, {
    publicationId: row.publication_id,
    variantId: row.variant_id,
    eventType: "published",
    payload: {
      platform: row.platform,
      contentItemId: row.variant_id,
      platformPostId: result.platformPostId,
      platformPostUrl: result.platformPostUrl,
    },
  });
  await syncContentItemStatusFromPublications(env, row.variant_id);
}

export async function reorderContentQueue(
  env: SocialPublishingEnv,
  ownerId: string,
  siteIdInput: unknown,
  itemIdsInput: unknown,
): Promise<ContentItem[]> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const siteId = normalizeId(siteIdInput);
  if (!siteId) throw new SocialPublishingInputError("siteId is required");
  const site = await getOwnedSite(env, ownerId, siteId);
  if (!site) throw new SocialPublishingInputError("Site not found", 404);
  const itemIds = Array.isArray(itemIdsInput)
    ? Array.from(
        new Set(
          itemIdsInput
            .map(normalizeId)
            .filter((id): id is string => Boolean(id)),
        ),
      )
    : [];
  if (itemIds.length === 0) throw new SocialPublishingInputError("Queue order is required");

  const rows = await listQueueRows(env, ownerId, site.id);
  const currentIds = rows.map((row) => row.id);
  if (
    itemIds.length !== currentIds.length ||
    itemIds.some((id) => !currentIds.includes(id))
  ) {
    throw new SocialPublishingInputError("Queue order does not match current queue");
  }

  await resequenceContentQueue(env, ownerId, site.id, itemIds);
  return listContentItems(env, ownerId, site.id, null);
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

async function listProviderSettingRows(
  env: SocialPublishingEnv,
  ownerId: string,
): Promise<Map<SocialPlatform, SocialProviderSettingRow>> {
  const rows = await env.DB.prepare(
    `SELECT user_id, provider_id, client_id, encrypted_client_secret, secret_hint,
            secret_updated_at, enabled, created_at, updated_at
     FROM social_provider_settings
     WHERE user_id = ?`,
  )
    .bind(ownerId)
    .all<SocialProviderSettingRow>();

  return new Map(
    (rows.results || [])
      .map((row) => [normalizePlatform(row.provider_id), row] as const)
      .filter((entry): entry is [SocialPlatform, SocialProviderSettingRow] => Boolean(entry[0])),
  );
}

async function getProviderSettingRow(
  env: SocialPublishingEnv,
  ownerId: string,
  platform: SocialPlatform,
): Promise<SocialProviderSettingRow | null> {
  return env.DB.prepare(
    `SELECT user_id, provider_id, client_id, encrypted_client_secret, secret_hint,
            secret_updated_at, enabled, created_at, updated_at
     FROM social_provider_settings
     WHERE user_id = ? AND provider_id = ?`,
  )
    .bind(ownerId, platform)
    .first<SocialProviderSettingRow>();
}

function serializeProviderSetting(
  platform: SocialPlatform,
  row: SocialProviderSettingRow | null,
): SocialProviderSetting {
  const configured = Boolean(row?.client_id && row.encrypted_client_secret);
  return {
    providerId: platform,
    label: platformLabel(platform),
    clientId: row?.client_id || "",
    configured,
    enabled: configured && row?.enabled !== 0,
    secretHint: row?.secret_hint || null,
    secretUpdatedAt: row?.secret_updated_at || null,
    callbackPath: `/api/social/${platform}/callback`,
  };
}

async function buildAuthorizeUrl(
  platform: SocialPlatform,
  clientId: string,
  state: string,
  codeVerifier: string | null,
  apiOrigin: string,
): Promise<string> {
  const redirectUri = `${apiOrigin.replace(/\/$/, "")}/api/social/${platform}/callback`;
  if (platform === "x") {
    if (!codeVerifier) throw new SocialPublishingInputError("X OAuth verifier is missing");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: ["tweet.read", "tweet.write", "media.write", "users.read", "offline.access"].join(" "),
      state,
      code_challenge: await pkceChallenge(codeVerifier),
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  if (platform === "linkedin") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: ["openid", "profile", "email", "w_member_social"].join(" "),
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  if (platform === "instagram") {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: ["instagram_business_basic", "instagram_business_content_publish"].join(","),
      state,
    });
    return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ["pages_show_list", "pages_read_engagement", "business_management"].join(","),
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

async function exchangeOAuthCode(
  platform: SocialPlatform,
  code: string,
  clientId: string,
  clientSecret: string,
  codeVerifier: string | null,
  options: SocialCallbackOptions,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null; scopes: string[] }> {
  const redirectUri = `${options.apiOrigin.replace(/\/$/, "")}/api/social/${platform}/callback`;
  if (platform === "x") {
    const response = await options.fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier || "",
      }),
    });
    const body = await readJsonResponse<{ access_token?: string; refresh_token?: string; expires_in?: number }>(response);
    return normalizeToken(body, ["tweet.read", "tweet.write", "media.write", "users.read", "offline.access"]);
  }

  if (platform === "linkedin") {
    const response = await options.fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const body = await readJsonResponse<{ access_token?: string; refresh_token?: string; expires_in?: number }>(response);
    return normalizeToken(body, ["openid", "profile", "email", "w_member_social"]);
  }

  const tokenUrl =
    platform === "instagram"
      ? "https://api.instagram.com/oauth/access_token"
      : "https://graph.facebook.com/v21.0/oauth/access_token";
  const response = await options.fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const body = await readJsonResponse<{ access_token?: string; refresh_token?: string; expires_in?: number }>(response);
  return normalizeToken(
    body,
    platform === "instagram"
      ? ["instagram_business_basic", "instagram_business_content_publish"]
      : ["pages_show_list", "pages_read_engagement", "business_management"],
  );
}

async function fetchSocialProfile(
  platform: SocialPlatform,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<{ id: string; handle: string | null; displayName: string | null }> {
  if (platform === "x") {
    const response = await fetcher("https://api.twitter.com/2/users/me?user.fields=username,name", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await readJsonResponse<{ data?: { id?: string; username?: string; name?: string } }>(response);
    if (!body.data?.id) throw new SocialPublishingInputError("Social profile response was invalid", 502);
    return { id: body.data.id, handle: body.data.username || null, displayName: body.data.name || null };
  }

  if (platform === "linkedin") {
    const response = await fetcher("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await readJsonResponse<{ sub?: string; name?: string; given_name?: string }>(response);
    if (!body.sub) throw new SocialPublishingInputError("Social profile response was invalid", 502);
    return { id: body.sub, handle: null, displayName: body.name || body.given_name || null };
  }

  const response = await fetcher("https://graph.instagram.com/me?fields=id,username", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readJsonResponse<{ id?: string; username?: string; name?: string }>(response);
  if (!body.id) throw new SocialPublishingInputError("Social profile response was invalid", 502);
  return { id: body.id, handle: body.username || null, displayName: body.name || body.username || null };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new SocialPublishingInputError("Social provider request failed", 502);
  }
  return response.json() as Promise<T>;
}

function normalizeToken(
  body: { access_token?: string; refresh_token?: string; expires_in?: number },
  scopes: string[],
): { accessToken: string; refreshToken: string | null; expiresAt: string | null; scopes: string[] } {
  if (!body.access_token) throw new SocialPublishingInputError("Social token response was invalid", 502);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
    scopes,
  };
}

async function getOwnedSite(
  env: SocialPublishingEnv,
  ownerId: string,
  siteId: string,
): Promise<Required<Pick<SiteRow, "id" | "user_id" | "username">> | null> {
  return env.DB.prepare("SELECT id, user_id, username FROM sites WHERE id = ? AND user_id = ?")
    .bind(siteId, ownerId)
    .first<Required<Pick<SiteRow, "id" | "user_id" | "username">>>();
}

async function listActiveAccountsByPlatform(
  env: SocialPublishingEnv,
  ownerId: string,
  siteId: string,
  platforms: SocialPlatform[],
): Promise<Map<SocialPlatform, SocialAccountRow>> {
  const rows = await env.DB.prepare(
    `SELECT id, site_id, platform, platform_account_id, platform_handle, display_name,
            status, scopes_json, last_verified_at, created_at, updated_at
     FROM social_accounts
     WHERE user_id = ?
       AND site_id = ?
       AND status = 'active'`,
  )
    .bind(ownerId, siteId)
    .all<SocialAccountRow>();
  const wanted = new Set(platforms);
  return new Map(
    (rows.results || [])
      .map((row) => [normalizePlatform(row.platform), row] as const)
      .filter((entry): entry is [SocialPlatform, SocialAccountRow] =>
        Boolean(entry[0] && wanted.has(entry[0])),
      ),
  );
}

async function getQueuedPublicationRow(
  env: SocialPublishingEnv,
  publicationId: string,
): Promise<SocialPublicationRow | null> {
  return env.DB.prepare(
    `SELECT pub.id AS publication_id,
            pub.variant_id,
            pub.site_id,
            pub.platform,
            pub.status AS pub_status,
            c.body,
            c.media_manifest_json,
            c.platforms_json,
            c.approved_by_human,
            c.user_id,
            acct.id AS account_id,
            acct.platform_account_id,
            acct.access_token_ciphertext,
            acct.token_expires_at,
            acct.status AS account_status
     FROM social_publications pub
     JOIN content_bank_items c ON c.id = pub.variant_id
     LEFT JOIN social_accounts acct
       ON acct.site_id = pub.site_id
      AND acct.platform = pub.platform
      AND acct.status = 'active'
     WHERE pub.id = ?
     LIMIT 1`,
  )
    .bind(publicationId)
    .first<SocialPublicationRow>();
}

async function insertSocialPublicationEvent(
  env: SocialPublishingEnv,
  input: {
    publicationId: string | null;
    variantId: string;
    eventType: SocialPublicationEventType;
    payload?: unknown;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO social_publication_events (
       id, publication_id, variant_id, event_type, payload_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      randomToken("socevt"),
      input.publicationId,
      input.variantId,
      input.eventType,
      input.payload === undefined ? null : JSON.stringify(input.payload),
    )
    .run();
}

async function failContentPublication(
  env: SocialPublishingEnv,
  row: Pick<SocialPublicationRow, "publication_id" | "variant_id">,
  code: string,
  message: string,
  providerResponse?: unknown,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE social_publications
     SET status = 'failed',
         error_code = ?,
         error_message = ?,
         provider_response_json = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      code,
      message,
      providerResponse === undefined ? null : JSON.stringify(providerResponse),
      row.publication_id,
    )
    .run();
  await insertSocialPublicationEvent(env, {
    publicationId: row.publication_id,
    variantId: row.variant_id,
    eventType: "failed",
    payload: { code, message },
  });
  await syncContentItemStatusFromPublications(env, row.variant_id);
}

async function syncContentItemStatusFromPublications(
  env: SocialPublishingEnv,
  contentItemId: string,
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT status, published_at
     FROM social_publications
     WHERE variant_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(contentItemId)
    .all<{ status: string; published_at: string | null }>();

  const publications = rows.results || [];
  if (publications.length === 0) return;
  const hasPending = publications.some(
    (row) => row.status === "queued" || row.status === "publishing",
  );
  const hasPublished = publications.some((row) => row.status === "published");
  const hasFailed = publications.some((row) => row.status === "failed");
  if (hasPending) return;

  if (hasPublished) {
    const latestPublishedAt =
      publications
        .map((row) => row.published_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) || null;
    await env.DB.prepare(
      `UPDATE content_bank_items
       SET status = 'posted',
           queue_position = NULL,
           scheduled_for = NULL,
           times_posted = times_posted + 1,
           last_posted_at = COALESCE(?, last_posted_at, datetime('now')),
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(latestPublishedAt, contentItemId)
      .run();
    return;
  }

  if (hasFailed) {
    await env.DB.prepare(
      `UPDATE content_bank_items
       SET status = 'failed',
           queue_position = NULL,
           scheduled_for = NULL,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(contentItemId)
      .run();
  }
}

function absolutizeContentAssets(
  env: SocialPublishingEnv,
  assets: ContentMediaAsset[],
): ContentMediaAsset[] {
  const origin = getPublicAssetOrigin(env);
  return assets.map((asset) => {
    if (!asset.url.startsWith("/") || !origin) return asset;
    return { ...asset, url: `${origin}${asset.url}` };
  });
}

function getPublicAssetOrigin(env: SocialPublishingEnv): string | null {
  const origin =
    env.CORE_API_ORIGIN ||
    env.CORE_WEB_ORIGIN ||
    (env.ME3_API_HOST ? `https://${env.ME3_API_HOST}` : null) ||
    (env.ME3_CUSTOM_DOMAIN ? `https://${env.ME3_CUSTOM_DOMAIN}` : null);
  return origin ? origin.replace(/\/$/, "") : null;
}

function tokenLooksExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time < Date.now() - 60_000;
}

async function resolveInstallKey(env: SocialPublishingEnv): Promise<string> {
  if (env.TOKEN_ENCRYPTION_KEY) return env.TOKEN_ENCRYPTION_KEY;
  const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
    .bind("TOKEN_ENCRYPTION_KEY")
    .first<{ value: string }>();
  if (!row?.value) {
    throw new SocialPublishingInputError("Token encryption key is not configured", 424);
  }
  return row.value;
}

async function getOwnedContentItem(
  env: SocialPublishingEnv,
  ownerId: string,
  id: string,
): Promise<ContentItemRow | null> {
  return env.DB.prepare(
    `SELECT c.*, s.username AS site_username
     FROM content_bank_items c
     JOIN sites s ON s.id = c.site_id
     WHERE c.id = ? AND c.user_id = ?`,
  )
    .bind(id, ownerId)
    .first<ContentItemRow>();
}

async function listQueueRows(
  env: SocialPublishingEnv,
  ownerId: string,
  siteId: string,
): Promise<ContentQueueRow[]> {
  const rows = await env.DB.prepare(
    `SELECT id, status, queue_position
     FROM content_bank_items
     WHERE user_id = ?
       AND site_id = ?
       AND status IN ('queued', 'scheduled')
     ORDER BY COALESCE(queue_position, 2147483647), updated_at DESC`,
  )
    .bind(ownerId, siteId)
    .all<ContentQueueRow>();
  return rows.results || [];
}

async function resequenceContentQueue(
  env: SocialPublishingEnv,
  ownerId: string,
  siteId: string,
  orderedIds?: string[],
): Promise<void> {
  const rows = await listQueueRows(env, ownerId, siteId);
  const ids = orderedIds && orderedIds.length > 0 ? orderedIds : rows.map((row) => row.id);
  for (const [index, id] of ids.entries()) {
    await env.DB.prepare(
      `UPDATE content_bank_items
       SET queue_position = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND site_id = ?`,
    )
      .bind(index + 1, id, ownerId, siteId)
      .run();
  }
}

async function setContentQueueState(
  env: SocialPublishingEnv,
  ownerId: string,
  idInput: unknown,
  status: "bank" | "queued" | "publishing",
): Promise<ContentItem | null> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);

  const id = normalizeId(idInput);
  if (!id) throw new SocialPublishingInputError("Content item id is required");
  const existing = await getOwnedContentItem(env, ownerId, id);
  if (!existing) return null;
  if (existing.status === "publishing") {
    throw new SocialPublishingInputError("This item is already publishing");
  }

  let queuePosition: number | null = null;
  if (status === "queued") {
    const alreadyQueued = existing.status === "queued" || existing.status === "scheduled";
    const rows = await listQueueRows(env, ownerId, existing.site_id);
    queuePosition = alreadyQueued
      ? existing.queue_position || rows.length || 1
      : rows.length + 1;
  }

  await env.DB.prepare(
    `UPDATE content_bank_items
     SET status = ?,
         queue_position = ?,
         scheduled_for = NULL,
         approved_by_human = 1,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(status, queuePosition, id, ownerId)
    .run();

  if (
    existing.status === "queued" ||
    existing.status === "scheduled" ||
    status === "queued"
  ) {
    await resequenceContentQueue(env, ownerId, existing.site_id);
  }

  const updated = await getOwnedContentItem(env, ownerId, id);
  return updated ? serializeContentItem(updated) : null;
}

function serializeContentItem(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    siteId: row.site_id,
    siteUsername: row.site_username,
    userId: row.user_id,
    body: row.body,
    mediaManifest: normalizeMediaManifest(parseJsonArray(row.media_manifest_json)),
    platforms: normalizeContentPlatforms(parseJsonArray(row.platforms_json)),
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    status: row.status,
    queuePosition: row.queue_position,
    scheduledFor: row.scheduled_for,
    timezone: row.timezone,
    createdBy: row.created_by,
    approvedByHuman: row.approved_by_human === 1,
    evergreen: row.evergreen === 1,
    timesPosted: row.times_posted,
    lastPostedAt: row.last_posted_at,
    cooldownDays: row.cooldown_days,
    tags: normalizeTags(parseJsonArray(row.tags_json)),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeContentStatus(value: unknown): ContentItemStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return [
    "bank",
    "queued",
    "scheduled",
    "publishing",
    "posted",
    "failed",
    "archived",
  ].includes(normalized)
    ? (normalized as ContentItemStatus)
    : null;
}

function normalizeContentPlatforms(value: unknown): ContentPlatform[] {
  if (!Array.isArray(value)) return [];
  const platforms = value
    .map(normalizePlatform)
    .filter((platform): platform is ContentPlatform => Boolean(platform));
  return Array.from(new Set(platforms));
}

function normalizeBody(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMediaManifest(value: unknown): ContentMediaAsset[] {
  if (!Array.isArray(value)) return [];
  const assets: ContentMediaAsset[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url) continue;
    assets.push({
      url,
      filename: typeof item.filename === "string" ? item.filename.trim() || undefined : undefined,
      mimeType: typeof item.mimeType === "string" ? item.mimeType.trim() || undefined : undefined,
      kind: item.kind === "image" || item.kind === "video" ? item.kind : undefined,
      path: typeof item.path === "string" ? item.path.trim() || undefined : undefined,
      assetIndex:
        typeof item.assetIndex === "number" && Number.isFinite(item.assetIndex)
          ? Math.round(item.assetIndex)
          : undefined,
    });
  }
  return assets;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function gateErrorMessage(gate: SocialPublishingGate): string {
  if (gate.status === "available") return "Social Publishing is not installed";
  if (gate.status === "setup_required") return "Social Publishing setup is required";
  return "Social Publishing is disabled";
}

function normalizePlatform(value: unknown): SocialPlatform | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SOCIAL_PLATFORMS.includes(normalized as SocialPlatform)
    ? (normalized as SocialPlatform)
    : null;
}

function platformLabel(platform: SocialPlatform): string {
  switch (platform) {
    case "x":
      return "X";
    case "linkedin":
      return "LinkedIn";
    case "instagram":
      return "Instagram";
    case "instagram_business":
      return "Instagram Business";
  }
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 160 ? trimmed : null;
}

function normalizeClientId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 300);
}

function normalizeSecretInput(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new SocialPublishingInputError("Client secret must be a string");
  const trimmed = value.trim();
  return trimmed || undefined;
}

function sanitizeReturnPath(raw: unknown): string {
  if (typeof raw !== "string") return "/social";
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/social";
  return value;
}

function buildFrontendRedirect(
  frontend: string,
  returnPath: string,
  params: Record<string, string>,
): string {
  const url = new URL(sanitizeReturnPath(returnPath), frontend);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function randomToken(prefix: string): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `${prefix}_${encodeBase64Url(bytes)}`;
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return encodeBase64Url(hash);
}

function getSecretHint(secret: string): string {
  return `***${secret.slice(-4)}`;
}

async function encryptSecret(secret: string, installKey: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await importSecretCryptoKey(installKey, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret),
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}

async function decryptSecret(ciphertext: string, installKey: string): Promise<string> {
  const parts = ciphertext.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new SocialPublishingInputError("Stored social secret is invalid", 500);
  }
  const iv = decodeBase64Url(parts[1]);
  const data = decodeBase64Url(parts[2]);
  const key = await importSecretCryptoKey(installKey, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: copyBytes(iv) },
    key,
    copyBytes(data),
  );
  return new TextDecoder().decode(plain);
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

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
