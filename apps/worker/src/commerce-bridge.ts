import { getMe3CloudApiOrigin, originFromUrl } from "./sites";
import type { Env } from "./types";

const ME3_CLOUD_OWNER_SECRET_NAME = "ME3_CLOUD_OWNER_ID";
const ME3_CLOUD_CORE_TOKEN_SECRET_NAME = "ME3_CLOUD_CORE_TOKEN";
const ME3_CORE_INSTALL_ID_SECRET_NAME = "ME3_CORE_INSTALL_ID";

export type ManagedCommerceBridgeConfig = {
  origin: string;
  headers: Record<string, string>;
  mode: "explicit" | "cloud";
};

export type ManagedCommerceConnectionStatus = {
  connected: boolean;
  status: "not_connected" | "pending" | "restricted" | "active";
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
};

export type ManagedCommerceOnboardingLink = {
  url: string;
  accountId: string;
  mode: "onboard" | "refresh";
};

export class ManagedCommerceBridgeError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "ManagedCommerceBridgeError";
  }
}

/**
 * Resolve the credentials used for managed commerce requests.
 *
 * Explicit ME3_COMMERCE_BRIDGE_* settings are retained for installations that
 * have a dedicated bridge credential. Claimed ME3 Cloud installations can
 * instead reuse their existing cloud API identity, which avoids provisioning a
 * second bearer secret just for commerce.
 */
export async function getManagedCommerceBridgeConfig(
  env: Env,
): Promise<ManagedCommerceBridgeConfig | null> {
  const explicitOrigin = originFromUrl(env.ME3_COMMERCE_BRIDGE_ORIGIN);
  const explicitToken = normalizeSecret(env.ME3_COMMERCE_BRIDGE_TOKEN);

  if (explicitOrigin && explicitToken) {
    return {
      origin: explicitOrigin,
      headers: {
        Authorization: `Bearer ${explicitToken}`,
      },
      mode: "explicit",
    };
  }

  // A partially configured explicit bridge must not cause the cloud identity
  // to be sent to an arbitrary host. Treat it as not configured instead.
  if (env.ME3_COMMERCE_BRIDGE_ORIGIN || env.ME3_COMMERCE_BRIDGE_TOKEN) return null;

  const [ownerId, coreToken, installId] = await Promise.all([
    getInstallSecret(env, ME3_CLOUD_OWNER_SECRET_NAME),
    getInstallSecret(env, ME3_CLOUD_CORE_TOKEN_SECRET_NAME),
    getInstallSecret(env, ME3_CORE_INSTALL_ID_SECRET_NAME),
  ]);
  if (!ownerId || !coreToken) return null;

  const origin = getMe3CloudApiOrigin(env);
  if (!origin) return null;

  const headers: Record<string, string> = {
    "X-ME3-Core-Owner-ID": ownerId,
    "X-ME3-Core-Update-Token": coreToken,
  };
  if (installId) headers["X-ME3-Core-Install-ID"] = installId;
  const coreOrigin = originFromUrl(env.CORE_WEB_ORIGIN);
  const coreApiOrigin = originFromUrl(env.CORE_API_ORIGIN);
  if (coreOrigin) headers["X-ME3-Core-Origin"] = coreOrigin;
  if (coreApiOrigin) headers["X-ME3-Core-API-Origin"] = coreApiOrigin;

  return { origin, headers, mode: "cloud" };
}

export async function hasManagedCommerceBridge(env: Env): Promise<boolean> {
  return Boolean(await getManagedCommerceBridgeConfig(env));
}

export async function getManagedCommerceConnectionStatus(
  env: Env,
): Promise<ManagedCommerceConnectionStatus | null> {
  const bridge = await getManagedCommerceBridgeConfig(env);
  if (!bridge) return null;

  const response = await fetch(`${bridge.origin}/v1/commerce/connect/status`, {
    headers: bridge.headers,
  });
  const data = await readBridgeJson(response);
  if (!response.ok) {
    throw new ManagedCommerceBridgeError(
      normalizeSecret(data.error) || "Failed to check Stripe connection status.",
      response.status,
    );
  }

  const status = normalizeManagedStatus(data.status);
  return {
    connected: data.connected === true,
    status,
    accountId: normalizeSecret(data.accountId) || null,
    chargesEnabled: data.chargesEnabled === true,
    payoutsEnabled: data.payoutsEnabled === true,
    requirementsDue: Array.isArray(data.requirementsDue)
      ? data.requirementsDue.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export async function createManagedCommerceOnboardingLink(
  env: Env,
  input: {
    country?: string;
    returnUrl: string;
    mode?: "onboard" | "refresh";
  },
): Promise<ManagedCommerceOnboardingLink> {
  const bridge = await getManagedCommerceBridgeConfig(env);
  if (!bridge) {
    throw new ManagedCommerceBridgeError(
      "Managed commerce is not available for this installation.",
      503,
    );
  }

  const mode = input.mode === "refresh" ? "refresh" : "onboard";
  const response = await fetch(`${bridge.origin}/v1/commerce/connect/${mode}`, {
    method: "POST",
    headers: {
      ...bridge.headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      country: normalizeSecret(input.country).toUpperCase() || undefined,
      returnUrl: input.returnUrl,
    }),
  });
  const data = await readBridgeJson(response);
  if (!response.ok) {
    throw new ManagedCommerceBridgeError(
      normalizeSecret(data.error) || "Failed to start Stripe setup.",
      response.status,
    );
  }

  const url = normalizeSecret(data.url);
  const accountId = normalizeSecret(data.accountId);
  if (!url || !accountId) {
    throw new ManagedCommerceBridgeError("Stripe setup returned an invalid response.");
  }
  return { url, accountId, mode };
}

async function getInstallSecret(env: Env, name: string): Promise<string | null> {
  try {
    const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
      .bind(name)
      .first<{ value: string }>();
    return normalizeSecret(row?.value);
  } catch {
    return null;
  }
}

async function readBridgeJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().then(
    (value) => value && typeof value === "object"
      ? value as Record<string, unknown>
      : {},
    () => ({}),
  );
}

function normalizeManagedStatus(
  value: unknown,
): ManagedCommerceConnectionStatus["status"] {
  return value === "active" || value === "restricted" || value === "pending"
    ? value
    : "not_connected";
}

function normalizeSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
