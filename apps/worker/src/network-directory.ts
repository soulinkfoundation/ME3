import type {
  CoreNetworkDirectoryOffering,
  CoreNetworkDirectoryToolServices,
} from "./agent-chat";
import { getMe3CloudApiOrigin } from "./sites";
import type { Env } from "./types";

const OWNER_SECRET = "ME3_CLOUD_OWNER_ID";
const INSTALL_SECRET = "ME3_CORE_INSTALL_ID";
const TOKEN_SECRET = "ME3_CLOUD_CORE_TOKEN";
const REQUEST_TIMEOUT_MS = 5_000;

type NetworkDirectoryBridgeConfig = {
  origin: string;
  headers: Record<string, string>;
};

export class Me3NetworkDirectoryError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "Me3NetworkDirectoryError";
  }
}

export function createMe3NetworkDirectoryToolServices(
  env: Env,
): CoreNetworkDirectoryToolServices {
  return {
    search: (input) => searchMe3Network(env, input),
  };
}

export async function syncPublishedProfileToMe3Network(
  env: Env,
  profile: unknown,
): Promise<"synced" | "not_connected" | "not_listed"> {
  const config = await getNetworkDirectoryBridgeConfig(env);
  if (!config) return "not_connected";
  const response = await fetchWithTimeout(`${config.origin}/v1/network/profile`, {
    method: "PUT",
    headers: { ...config.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  const data = await readJson(response);
  if (
    (response.status === 403 && data.code === "soulink_membership_required") ||
    (response.status === 422 && data.code === "profile_private")
  ) {
    return "not_listed";
  }
  if (!response.ok) throw bridgeError(data, response.status, "Failed to sync the ME3 Network profile.");
  return "synced";
}

export async function removePublishedProfileFromMe3Network(
  env: Env,
): Promise<"removed" | "not_connected"> {
  const config = await getNetworkDirectoryBridgeConfig(env);
  if (!config) return "not_connected";
  const response = await fetchWithTimeout(`${config.origin}/v1/network/profile`, {
    method: "DELETE",
    headers: config.headers,
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw bridgeError(data, response.status, "Failed to remove the directory profile.");
  }
  return "removed";
}

export async function searchMe3Network(
  env: Env,
  input: Parameters<CoreNetworkDirectoryToolServices["search"]>[0],
): ReturnType<CoreNetworkDirectoryToolServices["search"]> {
  const config = await getNetworkDirectoryBridgeConfig(env);
  if (!config) {
    throw new Me3NetworkDirectoryError(
      "Connect this installation to me3.app before searching the ME3 Network.",
      503,
      "me3_cloud_not_connected",
    );
  }
  const response = await fetchWithTimeout(`${config.origin}/v1/network/search`, {
    method: "POST",
    headers: { ...config.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: input.query.trim().slice(0, 200),
      offeringType: input.offeringType,
      countryCode: input.countryCode?.trim().slice(0, 2).toUpperCase(),
      limit: Math.min(10, Math.max(1, Math.floor(input.limit || 5))),
    }),
  });
  const data = await readJson(response);
  if (!response.ok) throw bridgeError(data, response.status, "Failed to search the ME3 Network.");
  return normalizeSearchResponse(data, input.query);
}

export async function getNetworkDirectoryBridgeConfig(
  env: Env,
): Promise<NetworkDirectoryBridgeConfig | null> {
  const [ownerId, installId, token] = await Promise.all([
    getInstallSecret(env, OWNER_SECRET),
    getInstallSecret(env, INSTALL_SECRET),
    getInstallSecret(env, TOKEN_SECRET),
  ]);
  if (!ownerId || !installId || !token) return null;
  return {
    origin: getMe3CloudApiOrigin(env),
    headers: {
      "X-ME3-Core-Owner-ID": ownerId,
      "X-ME3-Core-Install-ID": installId,
      "X-ME3-Core-Update-Token": token,
    },
  };
}

function normalizeSearchResponse(
  data: Record<string, unknown>,
  fallbackQuery: string,
): Awaited<ReturnType<CoreNetworkDirectoryToolServices["search"]>> {
  const results = Array.isArray(data.results)
    ? data.results.slice(0, 10).flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const result = value as Record<string, unknown>;
        const name = string(result.name, 160);
        const profileUrl = httpsUrl(result.profileUrl);
        if (!name || !profileUrl) return [];
        const rawLocation = result.location && typeof result.location === "object"
          ? result.location as Record<string, unknown>
          : null;
        return [{
          name,
          handle: string(result.handle, 120),
          kind: string(result.kind, 40) || "person",
          bio: string(result.bio, 2_000),
          avatarUrl: httpsUrl(result.avatarUrl),
          profileUrl,
          publicUrl: httpsUrl(result.publicUrl),
          location: rawLocation && string(rawLocation.label, 160)
            ? {
                label: string(rawLocation.label, 160)!,
                precision: string(rawLocation.precision, 40) || "unknown",
                locality: string(rawLocation.locality, 120),
                region: string(rawLocation.region, 120),
                country: string(rawLocation.country, 120),
                countryCode: string(rawLocation.countryCode, 2),
              }
            : null,
          offerings: normalizeOfferings(result.offerings),
          reasons: Array.isArray(result.reasons)
            ? result.reasons.map((reason) => string(reason, 200)).filter(isString).slice(0, 3)
            : [],
          indexedAt: string(result.indexedAt, 80) || "",
        }];
      })
    : [];
  return {
    query: string(data.query, 200) || fallbackQuery,
    results,
    total: results.length,
  };
}

function normalizeOfferings(value: unknown): CoreNetworkDirectoryOffering[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const offering = entry as Record<string, unknown>;
    const type: CoreNetworkDirectoryOffering["type"] | null =
      offering.type === "service" || offering.type === "product"
      ? offering.type
      : null;
    const id = string(offering.id, 200);
    const title = string(offering.title, 200);
    if (!type || !id || !title) return [];
    const rawPrice = offering.price && typeof offering.price === "object"
      ? offering.price as Record<string, unknown>
      : null;
    const amount = string(rawPrice?.amount, 40);
    const currency = string(rawPrice?.currency, 12);
    return [{
      type,
      id,
      title,
      description: string(offering.description, 1_000),
      url: httpsUrl(offering.url),
      durationMinutes: typeof offering.durationMinutes === "number" && Number.isFinite(offering.durationMinutes)
        ? Math.max(1, Math.floor(offering.durationMinutes))
        : null,
      price: amount && currency ? { amount, currency } : null,
    }];
  });
}

async function getInstallSecret(env: Env, name: string): Promise<string | null> {
  try {
    const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
      .bind(name)
      .first<{ value: string }>();
    return string(row?.value, 4_000);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Me3NetworkDirectoryError("ME3 Network search timed out.", 504, "network_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().then(
    (value) => value && typeof value === "object" ? value as Record<string, unknown> : {},
    () => ({}),
  );
}

function bridgeError(
  data: Record<string, unknown>,
  status: number,
  fallback: string,
): Me3NetworkDirectoryError {
  return new Me3NetworkDirectoryError(
    string(data.error, 500) || fallback,
    status,
    string(data.code, 100),
  );
}

function httpsUrl(value: unknown): string | null {
  const candidate = string(value, 2_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function string(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function isString(value: string | null): value is string {
  return Boolean(value);
}
