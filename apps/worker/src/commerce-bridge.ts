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

function normalizeSecret(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
