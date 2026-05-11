export const SOCIAL_PUBLISHING_PLUGIN_ID = "me3.social-publishing";

export const SOCIAL_PUBLISHING_RUNTIME = {
  id: SOCIAL_PUBLISHING_PLUGIN_ID,
  packageName: "@me3-core/plugin-social-publishing",
  bundled: true,
  runtimeStatus: "oauth_setup_runtime",
  supportedPlatforms: ["x", "linkedin", "instagram", "instagram_business"],
  excludedProviders: ["youtube"],
  notes: [
    "Core bundles the plugin runtime through an explicit workspace package.",
    "This slice exposes owner-only status, provider setup, OAuth account connection, and account inventory reads.",
    "Queue consumers, cron dispatch, and live provider publishing writes remain outside Core for now.",
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
};

export type SocialCallbackOptions = {
  apiOrigin: string;
  webOrigin: string;
  fetch: typeof fetch;
  installKey: string;
};

export type SocialProviderSettingsUpdate = {
  providers?: unknown;
};

type PluginInstallationRow = {
  enabled: number;
  status: "installed" | "setup_required" | "disabled";
};

type SiteRow = {
  id: string;
  user_id: string;
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

export async function completeSocialOAuth(
  env: SocialPublishingEnv,
  platformInput: unknown,
  query: { code?: string | null; state?: string | null; error?: string | null },
  options: SocialCallbackOptions,
): Promise<string> {
  const gate = await getSocialPublishingRuntimeStatus(env);
  const platform = normalizePlatform(platformInput);
  const frontend = options.webOrigin;
  if (query.error) return buildFrontendRedirect(frontend, "/social", { social_error: query.error });
  if (!platform || !query.code || !query.state) {
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
