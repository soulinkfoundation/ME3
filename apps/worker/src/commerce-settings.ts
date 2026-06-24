import type { Env } from "./types";
import {
  getOrCreateInstallEncryptionKey,
  hasInstallEncryptionKey,
} from "./install-secrets";

type CommerceSettingsRow = {
  user_id: string;
  encrypted_stripe_secret_key: string | null;
  stripe_key_hint: string | null;
  stripe_key_updated_at: string | null;
  default_currency: string | null;
  created_at: string;
  updated_at: string;
};

export type CommerceSettingsResponse = {
  encryptionConfigured: boolean;
  defaultCurrency: string;
  stripe: {
    configured: boolean;
    source: "environment" | "stored" | "not_configured";
    keyHint: string | null;
    keyUpdatedAt: string | null;
    mode: "direct";
  };
};

export class CommerceSettingsInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CommerceSettingsInputError";
  }
}

const DEFAULT_COMMERCE_CURRENCY = "USD";
const DEFAULT_CURRENCY_REGEX = /^[A-Z]{3}$/;

export async function getCommerceSettings(
  env: Env,
  ownerId: string,
): Promise<CommerceSettingsResponse> {
  const row = await getCommerceSettingsRow(env, ownerId);
  const envKey = normalizeSecret(env.STRIPE_SECRET_KEY);
  const hasEnvKey = Boolean(envKey);
  const hasStoredKey = Boolean(row?.encrypted_stripe_secret_key);

  return {
    encryptionConfigured: await hasInstallEncryptionKey(env),
    defaultCurrency: await resolveDefaultCurrency(env, ownerId, row),
    stripe: {
      configured: hasEnvKey || hasStoredKey,
      source: hasEnvKey ? "environment" : hasStoredKey ? "stored" : "not_configured",
      keyHint: hasEnvKey
        ? getSecretHint(envKey)
        : row?.stripe_key_hint || null,
      keyUpdatedAt: hasEnvKey ? null : row?.stripe_key_updated_at || null,
      mode: "direct",
    },
  };
}

export async function updateCommerceSettings(
  env: Env,
  ownerId: string,
  input: unknown,
): Promise<CommerceSettingsResponse> {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const existingRow = await getCommerceSettingsRow(env, ownerId);
  const stripeSecretKey = normalizeSecret(body.stripeSecretKey);
  const clearStripeSecretKey = body.clearStripeSecretKey === true;
  const hasDefaultCurrencyInput = Object.prototype.hasOwnProperty.call(body, "defaultCurrency");
  const defaultCurrencyInput = hasDefaultCurrencyInput
    ? normalizeDefaultCurrency(body.defaultCurrency)
    : null;

  if (hasDefaultCurrencyInput && !defaultCurrencyInput) {
    throw new CommerceSettingsInputError("Use a three-letter default currency code.");
  }

  if (!stripeSecretKey && !clearStripeSecretKey && !hasDefaultCurrencyInput) {
    return getCommerceSettings(env, ownerId);
  }

  let encryptedStripeSecretKey = existingRow?.encrypted_stripe_secret_key || null;
  let stripeKeyHint = existingRow?.stripe_key_hint || null;
  let stripeKeyUpdatedAt = existingRow?.stripe_key_updated_at || null;
  const defaultCurrency =
    defaultCurrencyInput || await resolveDefaultCurrency(env, ownerId, existingRow);

  if (clearStripeSecretKey) {
    encryptedStripeSecretKey = null;
    stripeKeyHint = null;
    stripeKeyUpdatedAt = null;
  }

  if (stripeSecretKey) {
    validateStripeSecretKey(stripeSecretKey);
    const installKey = await getOrCreateInstallEncryptionKey(env);
    encryptedStripeSecretKey = await encryptSecret(stripeSecretKey, installKey);
    stripeKeyHint = getSecretHint(stripeSecretKey);
    stripeKeyUpdatedAt = new Date().toISOString();
  }

  await env.DB.prepare(
    `INSERT INTO commerce_settings (
       user_id, encrypted_stripe_secret_key, stripe_key_hint,
       stripe_key_updated_at, default_currency, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       encrypted_stripe_secret_key = excluded.encrypted_stripe_secret_key,
       stripe_key_hint = excluded.stripe_key_hint,
       stripe_key_updated_at = excluded.stripe_key_updated_at,
       default_currency = excluded.default_currency,
       updated_at = datetime('now')`,
  )
    .bind(ownerId, encryptedStripeSecretKey, stripeKeyHint, stripeKeyUpdatedAt, defaultCurrency)
    .run();

  return getCommerceSettings(env, ownerId);
}

export async function getDefaultCommerceCurrency(
  env: Env,
  ownerId: string,
): Promise<string> {
  const row = await getCommerceSettingsRow(env, ownerId);
  return resolveDefaultCurrency(env, ownerId, row);
}

export async function getStripeSecretKey(
  env: Env,
  ownerId: string,
): Promise<string | null> {
  const envKey = normalizeSecret(env.STRIPE_SECRET_KEY);
  if (envKey) return envKey;

  const row = await getCommerceSettingsRow(env, ownerId);
  if (!row?.encrypted_stripe_secret_key) return null;

  const installKey = await getOrCreateInstallEncryptionKey(env);
  return decryptSecret(row.encrypted_stripe_secret_key, installKey);
}

async function getCommerceSettingsRow(
  env: Env,
  ownerId: string,
): Promise<CommerceSettingsRow | null> {
  try {
    return (
      (await env.DB.prepare(
        `SELECT user_id, encrypted_stripe_secret_key, stripe_key_hint,
                stripe_key_updated_at, default_currency, created_at, updated_at
         FROM commerce_settings
         WHERE user_id = ?`,
      )
        .bind(ownerId)
        .first<CommerceSettingsRow>()) || null
    );
  } catch (error) {
    if (isMissingCommerceSettingsTableError(error)) return null;
    throw error;
  }
}

function normalizeDefaultCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return DEFAULT_CURRENCY_REGEX.test(currency) ? currency : null;
}

async function resolveDefaultCurrency(
  env: Env,
  ownerId: string,
  row: CommerceSettingsRow | null,
): Promise<string> {
  return (
    normalizeDefaultCurrency(row?.default_currency) ||
    inferDefaultCurrencyFromTimezone(await getOwnerTimezone(env, ownerId)) ||
    DEFAULT_COMMERCE_CURRENCY
  );
}

async function getOwnerTimezone(env: Env, ownerId: string): Promise<string | null> {
  try {
    const owner = await env.DB.prepare("SELECT timezone FROM owner_profile WHERE id = ?")
      .bind(ownerId)
      .first<{ timezone: string | null }>();
    return typeof owner?.timezone === "string" ? owner.timezone : null;
  } catch (error) {
    if (isMissingOwnerProfileTableError(error)) return null;
    throw error;
  }
}

function inferDefaultCurrencyFromTimezone(timezone: string | null): string | null {
  if (!timezone) return null;
  if (timezone === "Europe/London") return "GBP";
  if (timezone === "Europe/Zurich") return "CHF";
  if (timezone.startsWith("Europe/")) return "EUR";
  if (timezone.startsWith("Australia/")) return "AUD";
  if (timezone === "Pacific/Auckland") return "NZD";
  if (timezone === "Asia/Singapore") return "SGD";
  if (timezone === "Asia/Hong_Kong") return "HKD";
  if (timezone === "Asia/Tokyo") return "JPY";
  if (timezone === "Asia/Kolkata" || timezone === "Asia/Calcutta") return "INR";
  if (timezone === "Asia/Karachi") return "PKR";
  if (
    timezone === "America/Toronto" ||
    timezone === "America/Vancouver" ||
    timezone === "America/Edmonton" ||
    timezone === "America/Winnipeg" ||
    timezone === "America/Halifax" ||
    timezone === "America/St_Johns"
  ) {
    return "CAD";
  }
  if (timezone.startsWith("America/")) return "USD";
  return null;
}

function normalizeSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateStripeSecretKey(value: string): void {
  if (!/^sk_(test|live)_[A-Za-z0-9_]+$/.test(value)) {
    throw new CommerceSettingsInputError(
      "Use a Stripe secret key that starts with sk_test_ or sk_live_.",
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
    throw new CommerceSettingsInputError("Stored Stripe key is invalid", 500);
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

function isMissingCommerceSettingsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("commerce_settings") &&
    /no such table|does not exist/i.test(message)
  );
}

function isMissingOwnerProfileTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("owner_profile") &&
    /no such table|does not exist/i.test(message)
  );
}
