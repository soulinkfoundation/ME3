import {
  getOrCreateInstallEncryptionKey,
  hasInstallEncryptionKey,
} from "./install-secrets";
import type { Env } from "./types";

type AiGatewaySettingsRow = {
  user_id: string;
  account_id: string | null;
  gateway_id: string | null;
  encrypted_api_token: string | null;
  api_token_hint: string | null;
  api_token_updated_at: string | null;
  route_workers_ai: number;
  route_external_providers: number;
  created_at: string;
  updated_at: string;
};

type CloudflareAiGatewayLog = {
  id?: string;
  created_at?: string;
  provider?: string;
  model?: string;
  success?: boolean;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost?: number | null;
};

type CloudflareListLogsResponse = {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: CloudflareAiGatewayLog[];
  result_info?: {
    page?: number;
    per_page?: number;
    total_count?: number;
    count?: number;
  };
};

const DEFAULT_AI_GATEWAY_ID = "default";

export type AiGatewaySettingsResponse = {
  encryptionConfigured: boolean;
  configured: boolean;
  accountId: string;
  gatewayId: string;
  apiTokenHint: string | null;
  apiTokenUpdatedAt: string | null;
  routeWorkersAi: boolean;
  routeExternalProviders: boolean;
  source: "environment" | "stored" | "not_configured";
};

export type AiGatewayRuntimeConfig = {
  accountId: string | null;
  gatewayId: string | null;
  apiToken: string | null;
  routeWorkersAi: boolean;
  routeExternalProviders: boolean;
};

export type AiGatewayUsageSummary = {
  configured: boolean;
  setupRequired: boolean;
  period: {
    id: "current_month";
    startsAt: string;
    endsAt: string;
  };
  currency: "usd";
  totalCost: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  models: Array<{
    provider: string;
    model: string;
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    cost: number;
  }>;
  recent: Array<{
    id: string;
    createdAt: string;
    provider: string;
    model: string;
    success: boolean;
    totalTokens: number;
    cost: number;
  }>;
  fetchedAt: string | null;
  estimated: boolean;
  truncated: boolean;
  error: string | null;
};

export class AiGatewayInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AiGatewayInputError";
  }
}

export async function getAiGatewaySettings(
  env: Env,
  userId: string,
): Promise<AiGatewaySettingsResponse> {
  const row = await getAiGatewaySettingsRow(env, userId);
  const accountId = row?.account_id || env.CLOUDFLARE_ACCOUNT_ID || "";
  const explicitGatewayId = resolveAiGatewayId(
    row?.gateway_id,
    env.CLOUDFLARE_AI_GATEWAY_ID,
    env.ME3_AI_GATEWAY_ID,
  );
  const gatewayId = explicitGatewayId || DEFAULT_AI_GATEWAY_ID;
  const hasStoredToken = Boolean(row?.encrypted_api_token);
  const hasEnvToken = Boolean(env.CLOUDFLARE_API_TOKEN);
  const configured = Boolean(accountId && gatewayId && (hasStoredToken || hasEnvToken));
  const source =
    row && (row.account_id || row.gateway_id || hasStoredToken)
      ? "stored"
      : accountId || explicitGatewayId || hasEnvToken
        ? "environment"
        : "not_configured";

  return {
    encryptionConfigured: await hasInstallEncryptionKey(env),
    configured,
    accountId,
    gatewayId,
    apiTokenHint: row?.api_token_hint || (hasEnvToken ? "environment" : null),
    apiTokenUpdatedAt: normalizeDbDateTime(row?.api_token_updated_at || null),
    routeWorkersAi: configured,
    routeExternalProviders: configured,
    source,
  };
}

export async function updateAiGatewaySettings(
  env: Env,
  userId: string,
  input: unknown,
): Promise<AiGatewaySettingsResponse> {
  if (!isRecord(input)) {
    throw new AiGatewayInputError("AI Gateway settings payload is required");
  }

  const current = await getAiGatewaySettingsRow(env, userId);
  const accountId =
    input.accountId === undefined
      ? current?.account_id || ""
      : normalizeOptionalText(input.accountId, 128);
  const gatewayId =
    input.gatewayId === undefined
      ? current?.gateway_id || ""
      : normalizeOptionalText(input.gatewayId, 64);
  let encryptedApiToken = current?.encrypted_api_token || null;
  let apiTokenHint = current?.api_token_hint || null;
  let apiTokenUpdatedAt = current?.api_token_updated_at || null;

  if (input.clearApiToken === true || input.apiToken === null) {
    encryptedApiToken = null;
    apiTokenHint = null;
    apiTokenUpdatedAt = null;
  } else if (typeof input.apiToken === "string" && input.apiToken.trim()) {
    const apiToken = input.apiToken.trim();
    encryptedApiToken = await encryptSecret(
      apiToken,
      await getOrCreateInstallEncryptionKey(env),
    );
    apiTokenHint = getSecretHint(apiToken);
    apiTokenUpdatedAt = new Date().toISOString();
  }

  const routeWorkersAi =
    input.routeWorkersAi === undefined
      ? current
        ? current.route_workers_ai !== 0
        : true
      : input.routeWorkersAi === true;
  const routeExternalProviders =
    input.routeExternalProviders === undefined
      ? current
        ? current.route_external_providers !== 0
        : true
      : input.routeExternalProviders === true;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO ai_gateway_settings (
       user_id, account_id, gateway_id, encrypted_api_token, api_token_hint,
       api_token_updated_at, route_workers_ai, route_external_providers,
       created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       account_id = excluded.account_id,
       gateway_id = excluded.gateway_id,
       encrypted_api_token = excluded.encrypted_api_token,
       api_token_hint = excluded.api_token_hint,
       api_token_updated_at = excluded.api_token_updated_at,
       route_workers_ai = excluded.route_workers_ai,
       route_external_providers = excluded.route_external_providers,
       updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      accountId || null,
      gatewayId || null,
      encryptedApiToken,
      apiTokenHint,
      apiTokenUpdatedAt,
      routeWorkersAi ? 1 : 0,
      routeExternalProviders ? 1 : 0,
      now,
      now,
    )
    .run();

  return getAiGatewaySettings(env, userId);
}

export async function getAiGatewayRuntimeConfig(
  env: Env,
  userId: string,
): Promise<AiGatewayRuntimeConfig> {
  const row = await getAiGatewaySettingsRow(env, userId);
  const accountId = row?.account_id || env.CLOUDFLARE_ACCOUNT_ID || null;
  const gatewayId =
    resolveAiGatewayId(row?.gateway_id, env.CLOUDFLARE_AI_GATEWAY_ID, env.ME3_AI_GATEWAY_ID) ||
    (accountId ? DEFAULT_AI_GATEWAY_ID : null);
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

export async function getAiGatewayUsageSummary(
  env: Env,
  userId: string,
): Promise<AiGatewayUsageSummary> {
  const now = new Date();
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = now;
  const empty = createEmptyUsageSummary(startsAt, endsAt);
  const config = await getAiGatewayRuntimeConfig(env, userId);

  if (!config.accountId || !config.gatewayId || !config.apiToken) {
    return {
      ...empty,
      configured: false,
      setupRequired: true,
      error: "AI Gateway usage needs a Cloudflare account ID and API token.",
    };
  }

  const models = new Map<string, AiGatewayUsageSummary["models"][number]>();
  const recent: AiGatewayUsageSummary["recent"] = [];
  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let totalCost = 0;
  let truncated = false;

  try {
    for (let page = 1; page <= 10; page += 1) {
      const payload = await listCloudflareAiGatewayLogs(
        {
          accountId: config.accountId,
          gatewayId: config.gatewayId,
          apiToken: config.apiToken,
        },
        {
          page,
          startsAt,
          endsAt,
        },
      );
      const logs = payload.result || [];
      for (const log of logs) {
        const createdAt = log.created_at || "";
        if (createdAt && new Date(createdAt).getTime() < startsAt.getTime()) {
          truncated = false;
          continue;
        }
        const provider = normalizeProviderLabel(log.provider);
        const model = normalizeModelLabel(log.model);
        const key = `${provider}\n${model}`;
        const inTokens = normalizeNumber(log.tokens_in);
        const outTokens = normalizeNumber(log.tokens_out);
        const cost = normalizeNumber(log.cost);
        const success = log.success !== false;
        let row = models.get(key);
        if (!row) {
          row = {
            provider,
            model,
            requests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            tokensIn: 0,
            tokensOut: 0,
            totalTokens: 0,
            cost: 0,
          };
          models.set(key, row);
        }
        row.requests += 1;
        row.successfulRequests += success ? 1 : 0;
        row.failedRequests += success ? 0 : 1;
        row.tokensIn += inTokens;
        row.tokensOut += outTokens;
        row.totalTokens += inTokens + outTokens;
        row.cost += cost;
        totalRequests += 1;
        successfulRequests += success ? 1 : 0;
        failedRequests += success ? 0 : 1;
        tokensIn += inTokens;
        tokensOut += outTokens;
        totalCost += cost;
        if (recent.length < 8) {
          recent.push({
            id: log.id || `${createdAt}-${recent.length}`,
            createdAt,
            provider,
            model,
            success,
            totalTokens: inTokens + outTokens,
            cost,
          });
        }
      }
      const info = payload.result_info;
      const perPage = info?.per_page || 50;
      const totalCount = info?.total_count || 0;
      const hasMore =
        logs.length === perPage && (!totalCount || page * perPage < totalCount);
      if (!hasMore) break;
      truncated = page === 10;
    }
  } catch (error) {
    return {
      ...empty,
      configured: true,
      setupRequired: false,
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "AI Gateway usage could not load.",
    };
  }

  return {
    configured: true,
    setupRequired: false,
    period: empty.period,
    currency: "usd",
    totalCost,
    totalRequests,
    successfulRequests,
    failedRequests,
    tokensIn,
    tokensOut,
    totalTokens: tokensIn + tokensOut,
    models: Array.from(models.values())
      .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens)
      .slice(0, 12),
    recent,
    fetchedAt: new Date().toISOString(),
    estimated: true,
    truncated,
    error: null,
  };
}

async function listCloudflareAiGatewayLogs(
  config: { accountId: string; gatewayId: string; apiToken: string },
  options: { page: number; startsAt: Date; endsAt: Date },
): Promise<CloudflareListLogsResponse> {
  const params = new URLSearchParams({
    page: String(options.page),
    per_page: "50",
    order_by: "created_at",
    order_by_direction: "desc",
    start_date: options.startsAt.toISOString(),
    end_date: options.endsAt.toISOString(),
  });
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      config.accountId,
    )}/ai-gateway/gateways/${encodeURIComponent(config.gatewayId)}/logs?${params}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | CloudflareListLogsResponse
    | null;
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.find((item) => item.message)?.message ||
      `Cloudflare AI Gateway logs request failed (${response.status})`;
    throw new Error(message);
  }
  return payload || {};
}

async function getAiGatewaySettingsRow(
  env: Env,
  userId: string,
): Promise<AiGatewaySettingsRow | null> {
  try {
    return (
      (await env.DB.prepare(
        `SELECT user_id, account_id, gateway_id, encrypted_api_token,
                api_token_hint, api_token_updated_at, route_workers_ai,
                route_external_providers, created_at, updated_at
         FROM ai_gateway_settings
         WHERE user_id = ?`,
      )
        .bind(userId)
        .first<AiGatewaySettingsRow>()) || null
    );
  } catch {
    return null;
  }
}

function createEmptyUsageSummary(startsAt: Date, endsAt: Date): AiGatewayUsageSummary {
  return {
    configured: false,
    setupRequired: false,
    period: {
      id: "current_month",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    },
    currency: "usd",
    totalCost: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    tokensIn: 0,
    tokensOut: 0,
    totalTokens: 0,
    models: [],
    recent: [],
    fetchedAt: null,
    estimated: true,
    truncated: false,
    error: null,
  };
}

function normalizeOptionalText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function resolveAiGatewayId(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeProviderLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

function normalizeModelLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

function normalizeDbDateTime(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("T")) return value;
  return `${value.replace(" ", "T")}Z`;
}

function getSecretHint(secret: string): string {
  const trimmed = secret.trim();
  return trimmed.length <= 8 ? "saved" : `...${trimmed.slice(-4)}`;
}

async function decryptSecretSafely(env: Env, encrypted: string): Promise<string | null> {
  const installKey = env.TOKEN_ENCRYPTION_KEY || (await getInstallEncryptionKey(env));
  return installKey ? decryptSecret(encrypted, installKey) : null;
}

async function getInstallEncryptionKey(env: Env): Promise<string | null> {
  try {
    const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
      .bind("token_encryption_key")
      .first<{ value: string }>();
    return row?.value || null;
  } catch {
    return null;
  }
}

async function encryptSecret(secret: string, installKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importSecretCryptoKey(installKey, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret),
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptSecret(encrypted: string, installKey: string): Promise<string | null> {
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
  secret: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - (value.length % 4)) % 4,
  )}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
