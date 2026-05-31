import type { Env } from "./types";
import {
  getOrCreateInstallEncryptionKey,
  hasInstallEncryptionKey,
} from "./install-secrets";

type TelegramSettingsRow = {
  user_id: string;
  bot_username: string | null;
  encrypted_bot_token: string | null;
  bot_token_hint: string | null;
  bot_token_updated_at: string | null;
  encrypted_webhook_secret: string | null;
  webhook_secret_hint: string | null;
  webhook_secret_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TelegramRuntimeSettings = {
  encryptionConfigured: boolean;
  botUsername: string | null;
  botUsernameSource: "environment" | "stored" | "not_configured";
  botTokenConfigured: boolean;
  botTokenSource: "environment" | "stored" | "not_configured";
  botTokenHint: string | null;
  botTokenUpdatedAt: string | null;
  webhookSecretConfigured: boolean;
  webhookSecretSource: "environment" | "stored" | "not_configured";
  webhookSecretHint: string | null;
  webhookSecretUpdatedAt: string | null;
};

export class TelegramSettingsInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "TelegramSettingsInputError";
  }
}

export async function getTelegramSettings(
  env: Env,
  ownerId: string,
): Promise<TelegramRuntimeSettings> {
  const row = await getTelegramSettingsRow(env, ownerId);
  const envBotUsername = normalizeBotUsername(env.TELEGRAM_BOT_USERNAME);
  const storedBotUsername = normalizeBotUsername(row?.bot_username);
  const envBotToken = normalizeSecret(env.TELEGRAM_BOT_TOKEN);
  const envWebhookSecret = normalizeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  const hasStoredBotToken = Boolean(row?.encrypted_bot_token);
  const hasStoredWebhookSecret = Boolean(row?.encrypted_webhook_secret);

  return {
    encryptionConfigured: await hasInstallEncryptionKey(env),
    botUsername: envBotUsername || storedBotUsername || null,
    botUsernameSource: envBotUsername
      ? "environment"
      : storedBotUsername
        ? "stored"
        : "not_configured",
    botTokenConfigured: Boolean(envBotToken || hasStoredBotToken),
    botTokenSource: envBotToken
      ? "environment"
      : hasStoredBotToken
        ? "stored"
        : "not_configured",
    botTokenHint: envBotToken ? getSecretHint(envBotToken) : row?.bot_token_hint || null,
    botTokenUpdatedAt: envBotToken ? null : row?.bot_token_updated_at || null,
    webhookSecretConfigured: Boolean(envWebhookSecret || hasStoredWebhookSecret),
    webhookSecretSource: envWebhookSecret
      ? "environment"
      : hasStoredWebhookSecret
        ? "stored"
        : "not_configured",
    webhookSecretHint: envWebhookSecret
      ? getSecretHint(envWebhookSecret)
      : row?.webhook_secret_hint || null,
    webhookSecretUpdatedAt: envWebhookSecret
      ? null
      : row?.webhook_secret_updated_at || null,
  };
}

export async function updateTelegramSettings(
  env: Env,
  ownerId: string,
  input: unknown,
): Promise<TelegramRuntimeSettings> {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const current = await getTelegramSettingsRow(env, ownerId);
  const botUsernameInput = normalizeBotUsername(body.botUsername);
  const botTokenInput = normalizeSecret(body.botToken);
  const webhookSecretInput = normalizeSecret(body.webhookSecret);
  const clearBotToken = body.clearBotToken === true;
  const clearWebhookSecret = body.clearWebhookSecret === true;
  const now = new Date().toISOString();

  let botUsername = current?.bot_username || null;
  let encryptedBotToken = current?.encrypted_bot_token || null;
  let botTokenHint = current?.bot_token_hint || null;
  let botTokenUpdatedAt = current?.bot_token_updated_at || null;
  let encryptedWebhookSecret = current?.encrypted_webhook_secret || null;
  let webhookSecretHint = current?.webhook_secret_hint || null;
  let webhookSecretUpdatedAt = current?.webhook_secret_updated_at || null;

  if (typeof body.botUsername === "string") {
    if (!botUsernameInput) {
      throw new TelegramSettingsInputError("Telegram bot username is required.");
    }
    validateBotUsername(botUsernameInput);
    botUsername = botUsernameInput;
  }

  if (clearBotToken) {
    encryptedBotToken = null;
    botTokenHint = null;
    botTokenUpdatedAt = null;
  } else if (botTokenInput) {
    validateBotToken(botTokenInput);
    encryptedBotToken = await encryptSecret(
      botTokenInput,
      await getOrCreateInstallEncryptionKey(env),
    );
    botTokenHint = getSecretHint(botTokenInput);
    botTokenUpdatedAt = now;
  }

  if (clearWebhookSecret) {
    encryptedWebhookSecret = null;
    webhookSecretHint = null;
    webhookSecretUpdatedAt = null;
  } else if (webhookSecretInput) {
    validateWebhookSecret(webhookSecretInput);
    encryptedWebhookSecret = await encryptSecret(
      webhookSecretInput,
      await getOrCreateInstallEncryptionKey(env),
    );
    webhookSecretHint = getSecretHint(webhookSecretInput);
    webhookSecretUpdatedAt = now;
  }

  await env.DB.prepare(
    `INSERT INTO telegram_settings (
       user_id, bot_username, encrypted_bot_token, bot_token_hint,
       bot_token_updated_at, encrypted_webhook_secret, webhook_secret_hint,
       webhook_secret_updated_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       bot_username = excluded.bot_username,
       encrypted_bot_token = excluded.encrypted_bot_token,
       bot_token_hint = excluded.bot_token_hint,
       bot_token_updated_at = excluded.bot_token_updated_at,
       encrypted_webhook_secret = excluded.encrypted_webhook_secret,
       webhook_secret_hint = excluded.webhook_secret_hint,
       webhook_secret_updated_at = excluded.webhook_secret_updated_at,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      ownerId,
      botUsername,
      encryptedBotToken,
      botTokenHint,
      botTokenUpdatedAt,
      encryptedWebhookSecret,
      webhookSecretHint,
      webhookSecretUpdatedAt,
    )
    .run();

  return getTelegramSettings(env, ownerId);
}

export async function resolveTelegramBotToken(
  env: Env,
  ownerId: string,
): Promise<string | null> {
  const envBotToken = normalizeSecret(env.TELEGRAM_BOT_TOKEN);
  if (envBotToken) return envBotToken;

  const row = await getTelegramSettingsRow(env, ownerId);
  if (!row?.encrypted_bot_token) return null;
  return decryptSecret(row.encrypted_bot_token, await getOrCreateInstallEncryptionKey(env));
}

export async function resolveTelegramWebhookSecret(
  env: Env,
  ownerId: string,
): Promise<string | null> {
  const envWebhookSecret = normalizeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  if (envWebhookSecret) return envWebhookSecret;

  const row = await getTelegramSettingsRow(env, ownerId);
  if (!row?.encrypted_webhook_secret) return null;
  return decryptSecret(
    row.encrypted_webhook_secret,
    await getOrCreateInstallEncryptionKey(env),
  );
}

export async function resolveTelegramWebhookSecretForInstall(
  env: Env,
): Promise<string | null> {
  const envWebhookSecret = normalizeSecret(env.TELEGRAM_WEBHOOK_SECRET);
  if (envWebhookSecret) return envWebhookSecret;

  const row = await getFirstTelegramSettingsRow(env);
  if (!row?.encrypted_webhook_secret) return null;
  return decryptSecret(
    row.encrypted_webhook_secret,
    await getOrCreateInstallEncryptionKey(env),
  );
}

export async function resolveTelegramBotTokenForInstall(
  env: Env,
): Promise<string | null> {
  const envBotToken = normalizeSecret(env.TELEGRAM_BOT_TOKEN);
  if (envBotToken) return envBotToken;

  const row = await getFirstTelegramBotTokenSettingsRow(env);
  if (!row?.encrypted_bot_token) return null;
  return decryptSecret(row.encrypted_bot_token, await getOrCreateInstallEncryptionKey(env));
}

async function getTelegramSettingsRow(
  env: Env,
  ownerId: string,
): Promise<TelegramSettingsRow | null> {
  try {
    return (
      (await env.DB.prepare(
        `SELECT user_id, bot_username, encrypted_bot_token, bot_token_hint,
                bot_token_updated_at, encrypted_webhook_secret,
                webhook_secret_hint, webhook_secret_updated_at,
                created_at, updated_at
         FROM telegram_settings
         WHERE user_id = ?`,
      )
        .bind(ownerId)
        .first<TelegramSettingsRow>()) || null
    );
  } catch (error) {
    if (isMissingTelegramSettingsTableError(error)) return null;
    throw error;
  }
}

async function getFirstTelegramSettingsRow(env: Env): Promise<TelegramSettingsRow | null> {
  try {
    return (
      (await env.DB.prepare(
        `SELECT user_id, bot_username, encrypted_bot_token, bot_token_hint,
                bot_token_updated_at, encrypted_webhook_secret,
                webhook_secret_hint, webhook_secret_updated_at,
                created_at, updated_at
         FROM telegram_settings
         WHERE encrypted_webhook_secret IS NOT NULL
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
        .bind()
        .first<TelegramSettingsRow>()) || null
    );
  } catch (error) {
    if (isMissingTelegramSettingsTableError(error)) return null;
    throw error;
  }
}

async function getFirstTelegramBotTokenSettingsRow(
  env: Env,
): Promise<TelegramSettingsRow | null> {
  try {
    return (
      (await env.DB.prepare(
        `SELECT user_id, bot_username, encrypted_bot_token, bot_token_hint,
                bot_token_updated_at, encrypted_webhook_secret,
                webhook_secret_hint, webhook_secret_updated_at,
                created_at, updated_at
         FROM telegram_settings
         WHERE encrypted_bot_token IS NOT NULL
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
        .bind()
        .first<TelegramSettingsRow>()) || null
    );
  } catch (error) {
    if (isMissingTelegramSettingsTableError(error)) return null;
    throw error;
  }
}

function normalizeBotUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^@/, "");
}

function normalizeSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateBotUsername(value: string): void {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value) || !/bot$/i.test(value)) {
    throw new TelegramSettingsInputError(
      "Telegram bot username must be 5-32 letters, numbers, or underscores and end in bot.",
    );
  }
}

function validateBotToken(value: string): void {
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(value)) {
    throw new TelegramSettingsInputError("Paste the full Telegram bot token from BotFather.");
  }
}

function validateWebhookSecret(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new TelegramSettingsInputError(
      "Webhook secret can only include letters, numbers, underscores, and hyphens.",
    );
  }
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

async function decryptSecret(encrypted: string, installKey: string): Promise<string> {
  const [version, ivBase64, ciphertextBase64] = encrypted.split(".");
  if (version !== "v1" || !ivBase64 || !ciphertextBase64) {
    throw new TelegramSettingsInputError("Stored Telegram secret is invalid", 500);
  }
  const key = await importSecretCryptoKey(installKey, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivBase64) },
    key,
    decodeBase64Url(ciphertextBase64),
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

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function isMissingTelegramSettingsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("telegram_settings") &&
    /no such table|does not exist/i.test(message)
  );
}
