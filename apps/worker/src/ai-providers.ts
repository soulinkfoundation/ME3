import type { DbAiModelDefault, DbAiProviderCredential, Env } from "./types";
import {
  getOrCreateInstallEncryptionKey,
  hasInstallEncryptionKey,
} from "./install-secrets";

export const AI_ROUTE_IDS = ["default", "chat", "reasoning", "extraction"] as const;

export type AiRouteId = (typeof AI_ROUTE_IDS)[number];
export type AiProviderId = "workers-ai" | "openai" | "anthropic" | "executor";

type AiProviderAdapter = {
  id: AiProviderId;
  label: string;
  description: string;
  setupLabel: string;
  supportsApiKey: boolean;
  secretLabel: string | null;
  secretEnv?: keyof Env;
  bindingEnv?: keyof Env;
  recommendedModels: Record<AiRouteId, string>;
};

export type AiProviderSettingsRecord = {
  id: AiProviderId;
  label: string;
  description: string;
  setupLabel: string;
  supportsApiKey: boolean;
  secretLabel: string | null;
  configured: boolean;
  setupRequired: boolean;
  statusLabel: string;
  source: "binding" | "environment" | "stored" | "not_configured";
  keyHint: string | null;
  keyUpdatedAt: string | null;
  recommendedModels: Record<AiRouteId, string>;
};

export type AiModelRouteRecord = {
  id: AiRouteId;
  label: string;
  providerId: AiProviderId;
  providerLabel: string;
  model: string;
  configured: boolean;
  setupRequired: boolean;
  source: "stored" | "environment" | "recommended";
};

export type AiSettingsResponse = {
  encryptionConfigured: boolean;
  providers: AiProviderSettingsRecord[];
  routes: AiModelRouteRecord[];
  defaults: Record<AiRouteId, AiModelRouteRecord>;
};

type AiProviderUpdate = {
  id?: unknown;
  apiKey?: unknown;
  clearApiKey?: unknown;
};

type AiRouteUpdate = {
  providerId?: unknown;
  model?: unknown;
};

const AI_PROVIDER_ADAPTERS: readonly AiProviderAdapter[] = [
  {
    id: "workers-ai",
    label: "Cloudflare Workers AI",
    description:
      "Uses the local Workers AI binding for installs that want no external API key.",
    setupLabel: "AI binding",
    supportsApiKey: false,
    secretLabel: null,
    bindingEnv: "AI",
    recommendedModels: {
      default: "@cf/meta/llama-3.1-8b-instruct",
      chat: "@cf/meta/llama-3.1-8b-instruct",
      reasoning: "@cf/meta/llama-3.1-8b-instruct",
      extraction: "@cf/meta/llama-3.1-8b-instruct",
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    description:
      "Stores an owner-supplied OpenAI key for general chat, extraction, and reasoning routes.",
    setupLabel: "OpenAI API key",
    supportsApiKey: true,
    secretLabel: "API key",
    secretEnv: "OPENAI_API_KEY",
    recommendedModels: {
      default: "gpt-4.1-mini",
      chat: "gpt-4.1-mini",
      reasoning: "gpt-4.1-mini",
      extraction: "gpt-4.1-mini",
    },
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description:
      "Stores an owner-supplied Anthropic key for Claude chat and reasoning routes.",
    setupLabel: "Anthropic API key",
    supportsApiKey: true,
    secretLabel: "API key",
    secretEnv: "ANTHROPIC_API_KEY",
    recommendedModels: {
      default: "claude-3-5-haiku-latest",
      chat: "claude-3-5-haiku-latest",
      reasoning: "claude-3-5-haiku-latest",
      extraction: "claude-3-5-haiku-latest",
    },
  },
  {
    id: "executor",
    label: "External executor",
    description:
      "Placeholder adapter for future executor-style providers owned by plugins or local tools.",
    setupLabel: "Executor adapter",
    supportsApiKey: false,
    secretLabel: null,
    recommendedModels: {
      default: "executor-default",
      chat: "executor-chat",
      reasoning: "executor-reasoning",
      extraction: "executor-extraction",
    },
  },
];

const ROUTE_LABELS: Record<AiRouteId, string> = {
  default: "Default",
  chat: "Chat",
  reasoning: "Reasoning",
  extraction: "Extraction",
};

const ROUTE_ENV_KEYS: Record<
  AiRouteId,
  { provider: keyof Env; model: keyof Env }
> = {
  default: {
    provider: "ME3_AI_DEFAULT_PROVIDER",
    model: "ME3_AI_DEFAULT_MODEL",
  },
  chat: {
    provider: "ME3_AI_CHAT_PROVIDER",
    model: "ME3_AI_CHAT_MODEL",
  },
  reasoning: {
    provider: "ME3_AI_REASONING_PROVIDER",
    model: "ME3_AI_REASONING_MODEL",
  },
  extraction: {
    provider: "ME3_AI_EXTRACTION_PROVIDER",
    model: "ME3_AI_EXTRACTION_MODEL",
  },
};

const PROVIDER_ALIASES: Record<string, AiProviderId> = {
  anthropic: "anthropic",
  claude: "anthropic",
  cloudflare: "workers-ai",
  "cloudflare-workers-ai": "workers-ai",
  executor: "executor",
  openai: "openai",
  workers: "workers-ai",
  "workers-ai": "workers-ai",
  workers_ai: "workers-ai",
};

export class AiSettingsInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AiSettingsInputError";
  }
}

export async function getAiSettings(env: Env, ownerId: string): Promise<AiSettingsResponse> {
  const credentials = await listAiCredentials(env, ownerId);
  const storedDefaults = await listAiModelDefaults(env, ownerId);
  const encryptionConfigured = await hasInstallEncryptionKey(env);
  const providers = AI_PROVIDER_ADAPTERS.map((adapter) =>
    serializeProvider(adapter, credentials.get(adapter.id) || null, env),
  );
  const defaultRoute = resolveRoute(
    "default",
    providers,
    storedDefaults.get("default") || null,
    env,
  );
  const defaults = Object.fromEntries(
    AI_ROUTE_IDS.map((routeId) => [
      routeId,
      routeId === "default"
        ? defaultRoute
        : resolveRoute(routeId, providers, storedDefaults.get(routeId) || null, env, defaultRoute),
    ]),
  ) as Record<AiRouteId, AiModelRouteRecord>;

  return {
    encryptionConfigured,
    providers,
    routes: AI_ROUTE_IDS.map((routeId) => defaults[routeId]),
    defaults,
  };
}

export async function updateAiSettings(
  env: Env,
  ownerId: string,
  input: unknown,
): Promise<AiSettingsResponse> {
  if (!isRecord(input)) {
    throw new AiSettingsInputError("AI settings payload is required");
  }

  let changed = false;
  const providerUpdates = input.providers;
  if (providerUpdates !== undefined) {
    if (!Array.isArray(providerUpdates)) {
      throw new AiSettingsInputError("providers must be an array");
    }
    for (const update of providerUpdates) {
      await applyProviderUpdate(env, ownerId, update as AiProviderUpdate);
      changed = true;
    }
  }

  const routeUpdates = input.defaults;
  if (routeUpdates !== undefined) {
    if (!isRecord(routeUpdates)) {
      throw new AiSettingsInputError("defaults must be an object");
    }
    for (const routeId of AI_ROUTE_IDS) {
      if (Object.prototype.hasOwnProperty.call(routeUpdates, routeId)) {
        await applyRouteUpdate(
          env,
          ownerId,
          routeId,
          routeUpdates[routeId] as AiRouteUpdate | null,
        );
        changed = true;
      }
    }
  }

  if (!changed) {
    throw new AiSettingsInputError("providers or defaults is required");
  }

  return getAiSettings(env, ownerId);
}

export async function getAiRoutingSummary(
  env: Env,
  ownerId: string,
): Promise<Record<AiRouteId, AiModelRouteRecord>> {
  const settings = await getAiSettings(env, ownerId);
  return settings.defaults;
}

export async function hasConfiguredAiProvider(env: Env, ownerId: string): Promise<boolean> {
  try {
    const settings = await getAiSettings(env, ownerId);
    return settings.providers.some((provider) => provider.configured);
  } catch {
    return Boolean(env.AI || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY);
  }
}

async function applyProviderUpdate(
  env: Env,
  ownerId: string,
  update: AiProviderUpdate,
) {
  if (!isRecord(update)) {
    throw new AiSettingsInputError("provider updates must be objects");
  }

  const providerId = normalizeProviderId(update.id);
  const adapter = providerId ? getProviderAdapter(providerId) : null;
  if (!providerId || !adapter) {
    throw new AiSettingsInputError("Unknown AI provider");
  }

  if (update.clearApiKey === true || update.apiKey === null) {
    await env.DB.prepare(
      "DELETE FROM ai_provider_credentials WHERE user_id = ? AND provider_id = ?",
    )
      .bind(ownerId, providerId)
      .run();
    return;
  }

  if (update.apiKey === undefined || update.apiKey === "") {
    return;
  }

  if (!adapter.supportsApiKey) {
    throw new AiSettingsInputError(`${adapter.label} does not accept an API key`);
  }

  if (typeof update.apiKey !== "string") {
    throw new AiSettingsInputError("API key must be a string");
  }

  const apiKey = update.apiKey.trim();
  if (!apiKey) return;

  const installKey = await getOrCreateInstallEncryptionKey(env);
  const encryptedApiKey = await encryptProviderSecret(apiKey, installKey);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO ai_provider_credentials (
       user_id, provider_id, encrypted_api_key, api_key_hint,
       api_key_updated_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider_id) DO UPDATE SET
       encrypted_api_key = excluded.encrypted_api_key,
       api_key_hint = excluded.api_key_hint,
       api_key_updated_at = excluded.api_key_updated_at,
       updated_at = excluded.updated_at`,
  )
    .bind(ownerId, providerId, encryptedApiKey, getSecretHint(apiKey), now, now, now)
    .run();
}

async function applyRouteUpdate(
  env: Env,
  ownerId: string,
  routeId: AiRouteId,
  update: AiRouteUpdate | null,
) {
  if (update === null) {
    await env.DB.prepare(
      "DELETE FROM ai_model_defaults WHERE user_id = ? AND use_case = ?",
    )
      .bind(ownerId, routeId)
      .run();
    return;
  }

  if (!isRecord(update)) {
    throw new AiSettingsInputError(`${ROUTE_LABELS[routeId]} defaults must be an object`);
  }

  const providerId = normalizeProviderId(update.providerId);
  if (!providerId || !getProviderAdapter(providerId)) {
    throw new AiSettingsInputError(`Unknown provider for ${ROUTE_LABELS[routeId]} route`);
  }

  const model = normalizeModel(update.model);
  if (!model) {
    throw new AiSettingsInputError(`Model is required for ${ROUTE_LABELS[routeId]} route`);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO ai_model_defaults (
       user_id, use_case, provider_id, model, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, use_case) DO UPDATE SET
       provider_id = excluded.provider_id,
       model = excluded.model,
       updated_at = excluded.updated_at`,
  )
    .bind(ownerId, routeId, providerId, model, now, now)
    .run();
}

async function listAiCredentials(
  env: Env,
  ownerId: string,
): Promise<Map<AiProviderId, DbAiProviderCredential>> {
  let rows: D1Result<DbAiProviderCredential>;
  try {
    rows = await env.DB.prepare(
      `SELECT user_id, provider_id, encrypted_api_key, api_key_hint,
              api_key_updated_at, created_at, updated_at
       FROM ai_provider_credentials
       WHERE user_id = ?`,
    )
      .bind(ownerId)
      .all<DbAiProviderCredential>();
  } catch (error) {
    if (isMissingAiSettingsTableError(error)) return new Map();
    throw error;
  }

  return new Map(
    (rows.results || [])
      .map((row) => [normalizeProviderId(row.provider_id), row] as const)
      .filter((entry): entry is readonly [AiProviderId, DbAiProviderCredential] =>
        Boolean(entry[0]),
      ),
  );
}

async function listAiModelDefaults(
  env: Env,
  ownerId: string,
): Promise<Map<AiRouteId, DbAiModelDefault>> {
  let rows: D1Result<DbAiModelDefault>;
  try {
    rows = await env.DB.prepare(
      `SELECT user_id, use_case, provider_id, model, created_at, updated_at
       FROM ai_model_defaults
       WHERE user_id = ?`,
    )
      .bind(ownerId)
      .all<DbAiModelDefault>();
  } catch (error) {
    if (isMissingAiSettingsTableError(error)) return new Map();
    throw error;
  }

  return new Map(
    (rows.results || [])
      .map((row) => [normalizeRouteId(row.use_case), row] as const)
      .filter((entry): entry is readonly [AiRouteId, DbAiModelDefault] =>
        Boolean(entry[0]),
      ),
  );
}

function serializeProvider(
  adapter: AiProviderAdapter,
  credential: DbAiProviderCredential | null,
  env: Env,
): AiProviderSettingsRecord {
  const hasBinding = Boolean(adapter.bindingEnv && env[adapter.bindingEnv]);
  const hasEnvSecret = Boolean(adapter.secretEnv && env[adapter.secretEnv]);
  const hasStoredSecret = Boolean(credential?.encrypted_api_key);
  const configured = hasBinding || hasEnvSecret || hasStoredSecret;
  const source = hasBinding
    ? "binding"
    : hasStoredSecret
      ? "stored"
      : hasEnvSecret
        ? "environment"
        : "not_configured";

  return {
    id: adapter.id,
    label: adapter.label,
    description: adapter.description,
    setupLabel: adapter.setupLabel,
    supportsApiKey: adapter.supportsApiKey,
    secretLabel: adapter.secretLabel,
    configured,
    setupRequired: !configured,
    statusLabel: configured ? "Ready" : "Setup required",
    source,
    keyHint: credential?.api_key_hint || null,
    keyUpdatedAt: credential?.api_key_updated_at || null,
    recommendedModels: adapter.recommendedModels,
  };
}

function resolveRoute(
  routeId: AiRouteId,
  providers: AiProviderSettingsRecord[],
  storedDefault: DbAiModelDefault | null,
  env: Env,
  fallbackRoute?: AiModelRouteRecord,
): AiModelRouteRecord {
  const envKeys = ROUTE_ENV_KEYS[routeId];
  const storedProviderId = normalizeProviderId(storedDefault?.provider_id);
  const envProviderId = normalizeProviderId(env[envKeys.provider]);
  const firstConfiguredProvider = providers.find((provider) => provider.configured)?.id;
  const providerId =
    storedProviderId ||
    envProviderId ||
    fallbackRoute?.providerId ||
    firstConfiguredProvider ||
    "workers-ai";
  const adapter = getProviderAdapter(providerId) || getProviderAdapter("workers-ai")!;
  const provider = providers.find((candidate) => candidate.id === adapter.id);
  const source = storedProviderId
    ? "stored"
    : envProviderId || env[envKeys.model]
      ? "environment"
      : "recommended";
  const model =
    normalizeModel(storedDefault?.model) ||
    normalizeModel(env[envKeys.model]) ||
    fallbackRoute?.model ||
    adapter.recommendedModels[routeId];
  const configured = Boolean(provider?.configured && model);

  return {
    id: routeId,
    label: ROUTE_LABELS[routeId],
    providerId: adapter.id,
    providerLabel: adapter.label,
    model,
    configured,
    setupRequired: !configured,
    source,
  };
}

function getProviderAdapter(providerId: AiProviderId): AiProviderAdapter | null {
  return AI_PROVIDER_ADAPTERS.find((adapter) => adapter.id === providerId) || null;
}

function normalizeProviderId(value: unknown): AiProviderId | null {
  if (typeof value !== "string") return null;
  return PROVIDER_ALIASES[value.trim().toLowerCase()] || null;
}

function normalizeRouteId(value: unknown): AiRouteId | null {
  return typeof value === "string" && AI_ROUTE_IDS.includes(value as AiRouteId)
    ? (value as AiRouteId)
    : null;
}

function normalizeModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const model = value.trim();
  if (!model || model.length > 160) return null;
  return model;
}

function getSecretHint(secret: string): string {
  return `***${secret.slice(-4)}`;
}

async function encryptProviderSecret(secret: string, installKey: string): Promise<string> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMissingAiSettingsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ai_provider_credentials") ||
    message.includes("ai_model_defaults")
  ) && /no such table|does not exist/i.test(message);
}
