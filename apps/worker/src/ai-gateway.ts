import {
  INSTALL_ENCRYPTION_KEY_NAME,
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

type LocalAiUsageEventRow = {
  id?: string;
  provider?: string | null;
  model?: string | null;
  kind?: string | null;
  request_count?: number | string | null;
  successful_request_count?: number | string | null;
  failed_request_count?: number | string | null;
  tokens_in?: number | string | null;
  tokens_out?: number | string | null;
  estimated_cost_usd?: number | string | null;
  created_at?: string | null;
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
  const gatewayId = row?.gateway_id?.trim() || DEFAULT_AI_GATEWAY_ID;
  const hasStoredToken = Boolean(row?.encrypted_api_token);
  const hasEnvToken = Boolean(env.CLOUDFLARE_API_TOKEN);
  const configured = Boolean(accountId && gatewayId && (hasStoredToken || hasEnvToken));
  const source =
    row && (row.account_id || row.gateway_id || hasStoredToken)
      ? "stored"
      : accountId || hasEnvToken
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

export async function getAiGatewayUsageSummary(
  env: Env,
  userId: string,
): Promise<AiGatewayUsageSummary> {
  const now = new Date();
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = now;
  const empty = createEmptyUsageSummary(startsAt, endsAt);
  const usage = createUsageAccumulator();
  const localTruncated = await addLocalAiUsageEvents(
    env,
    userId,
    startsAt,
    endsAt,
    usage,
  );
  const config = await getAiGatewayRuntimeConfig(env, userId);

  if (!config.accountId || !config.gatewayId || !config.apiToken) {
    if (usage.totalRequests > 0) {
      return buildUsageSummary(empty, usage, {
        configured: false,
        setupRequired: false,
        fetchedAt: new Date().toISOString(),
        truncated: localTruncated,
      });
    }
    return {
      ...empty,
      configured: false,
      setupRequired: true,
      error: "AI Gateway usage needs a Cloudflare account ID and API token.",
    };
  }

  let gatewayTruncated = false;

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
          gatewayTruncated = false;
          continue;
        }
        const provider = normalizeProviderLabel(log.provider);
        const model = normalizeModelLabel(log.model);
        const inTokens = normalizeNumber(log.tokens_in);
        const outTokens = normalizeNumber(log.tokens_out);
        const cost = normalizeNumber(log.cost);
        const success = log.success !== false;
        addUsageEvent(usage, {
          id: log.id || `${createdAt || "gateway"}-${usage.recent.length}`,
          createdAt,
          provider,
          model,
          requests: 1,
          successfulRequests: success ? 1 : 0,
          failedRequests: success ? 0 : 1,
          tokensIn: inTokens,
          tokensOut: outTokens,
          cost,
        });
      }
      const info = payload.result_info;
      const perPage = info?.per_page || 50;
      const totalCount = info?.total_count || 0;
      const hasMore =
        logs.length === perPage && (!totalCount || page * perPage < totalCount);
      if (!hasMore) break;
      gatewayTruncated = page === 10;
    }
  } catch (error) {
    if (usage.totalRequests > 0) {
      return buildUsageSummary(empty, usage, {
        configured: true,
        setupRequired: false,
        fetchedAt: new Date().toISOString(),
        truncated: localTruncated,
      });
    }
    return {
      ...empty,
      configured: true,
      setupRequired: false,
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "AI Gateway usage could not load.",
    };
  }

  return buildUsageSummary(empty, usage, {
    configured: true,
    setupRequired: false,
    fetchedAt: new Date().toISOString(),
    truncated: localTruncated || gatewayTruncated,
  });
}

type UsageAccumulator = {
  models: Map<string, AiGatewayUsageSummary["models"][number]>;
  recent: AiGatewayUsageSummary["recent"];
  totalCost: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  tokensIn: number;
  tokensOut: number;
};

type UsageEventInput = {
  id: string;
  createdAt: string;
  provider: string;
  model: string;
  requests: number;
  successfulRequests: number;
  failedRequests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
};

function createUsageAccumulator(): UsageAccumulator {
  return {
    models: new Map(),
    recent: [],
    totalCost: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    tokensIn: 0,
    tokensOut: 0,
  };
}

async function addLocalAiUsageEvents(
  env: Env,
  userId: string,
  startsAt: Date,
  endsAt: Date,
  usage: UsageAccumulator,
): Promise<boolean> {
  try {
    const rows =
      (
        await env.DB.prepare(
          `SELECT id, provider, model, kind, request_count,
                  successful_request_count, failed_request_count, tokens_in,
                  tokens_out, estimated_cost_usd, created_at
           FROM ai_usage_events
           WHERE user_id = ? AND created_at >= ? AND created_at <= ?
           ORDER BY created_at DESC
           LIMIT 200`,
        )
          .bind(userId, startsAt.toISOString(), endsAt.toISOString())
          .all<LocalAiUsageEventRow>()
      ).results || [];

    for (const row of rows) {
      const requests = Math.max(1, Math.round(normalizeNumber(row.request_count)));
      let successfulRequests = Math.max(
        0,
        Math.round(normalizeNumber(row.successful_request_count)),
      );
      let failedRequests = Math.max(
        0,
        Math.round(normalizeNumber(row.failed_request_count)),
      );
      if (successfulRequests + failedRequests === 0) {
        successfulRequests = requests;
      }
      successfulRequests = Math.min(requests, successfulRequests);
      failedRequests = Math.min(requests - successfulRequests, failedRequests);
      addUsageEvent(usage, {
        id: row.id || `local-${usage.recent.length}`,
        createdAt: normalizeDbDateTime(row.created_at || null) || "",
        provider: normalizeProviderLabel(row.provider),
        model: normalizeModelLabel(row.model),
        requests,
        successfulRequests,
        failedRequests,
        tokensIn: normalizeNumber(row.tokens_in),
        tokensOut: normalizeNumber(row.tokens_out),
        cost: normalizeNumber(row.estimated_cost_usd),
      });
    }

    return rows.length === 200;
  } catch {
    return false;
  }
}

function addUsageEvent(usage: UsageAccumulator, event: UsageEventInput): void {
  const key = `${event.provider}\n${event.model}`;
  let row = usage.models.get(key);
  if (!row) {
    row = {
      provider: event.provider,
      model: event.model,
      requests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      tokensIn: 0,
      tokensOut: 0,
      totalTokens: 0,
      cost: 0,
    };
    usage.models.set(key, row);
  }
  row.requests += event.requests;
  row.successfulRequests += event.successfulRequests;
  row.failedRequests += event.failedRequests;
  row.tokensIn += event.tokensIn;
  row.tokensOut += event.tokensOut;
  row.totalTokens += event.tokensIn + event.tokensOut;
  row.cost += event.cost;

  usage.totalRequests += event.requests;
  usage.successfulRequests += event.successfulRequests;
  usage.failedRequests += event.failedRequests;
  usage.tokensIn += event.tokensIn;
  usage.tokensOut += event.tokensOut;
  usage.totalCost += event.cost;
  usage.recent.push({
    id: event.id,
    createdAt: event.createdAt,
    provider: event.provider,
    model: event.model,
    success: event.failedRequests === 0,
    totalTokens: event.tokensIn + event.tokensOut,
    cost: event.cost,
  });
}

function buildUsageSummary(
  empty: AiGatewayUsageSummary,
  usage: UsageAccumulator,
  options: {
    configured: boolean;
    setupRequired: boolean;
    fetchedAt: string;
    truncated: boolean;
  },
): AiGatewayUsageSummary {
  return {
    configured: options.configured,
    setupRequired: options.setupRequired,
    period: empty.period,
    currency: "usd",
    totalCost: usage.totalCost,
    totalRequests: usage.totalRequests,
    successfulRequests: usage.successfulRequests,
    failedRequests: usage.failedRequests,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    totalTokens: usage.tokensIn + usage.tokensOut,
    models: Array.from(usage.models.values())
      .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens)
      .slice(0, 12),
    recent: usage.recent
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 8),
    fetchedAt: options.fetchedAt,
    estimated: true,
    truncated: options.truncated,
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

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
      .bind(INSTALL_ENCRYPTION_KEY_NAME)
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
