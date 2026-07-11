import { getMe3CloudApiOrigin } from "./sites";
import type { Env } from "./types";

const OWNER_SECRET = "ME3_CLOUD_OWNER_ID";
const INSTALL_SECRET = "ME3_CORE_INSTALL_ID";
const TOKEN_SECRET = "ME3_CLOUD_CORE_TOKEN";
const DEVICE_ID = /^[A-Za-z0-9._:-]{8,200}$/;
const APNS_TOKEN = /^[0-9a-f]{64}$/;

export class PushNotificationInputError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 502) {
    super(message);
  }
}

export async function getPushNotificationDevice(env: Env, deviceIdValue: unknown) {
  const deviceId = normalizeDeviceId(deviceIdValue);
  return relayRequest(env, `/api/push/devices/${encodeURIComponent(deviceId)}`);
}

export async function registerPushNotificationDevice(env: Env, input: unknown) {
  if (!isRecord(input)) throw new PushNotificationInputError("Invalid push device", 400);
  const deviceId = normalizeDeviceId(input.deviceId);
  const token = typeof input.token === "string" ? input.token.trim().toLowerCase() : "";
  if (!APNS_TOKEN.test(token)) throw new PushNotificationInputError("Invalid APNs token", 400);
  return relayRequest(env, "/api/push/devices", {
    method: "PUT",
    body: JSON.stringify({
      deviceId,
      token,
      environment: input.environment === "production" ? "production" : "sandbox",
      dailyBriefingEnabled: input.dailyBriefingEnabled !== false,
    }),
  });
}

export async function unregisterPushNotificationDevice(env: Env, deviceIdValue: unknown) {
  const deviceId = normalizeDeviceId(deviceIdValue);
  return relayRequest(env, `/api/push/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
}

export async function notifyDailyBriefingReady(env: Env, briefingId: string) {
  try {
    return await relayRequest(
      env,
      `/api/push/daily-briefings/${encodeURIComponent(briefingId)}`,
      { method: "POST" },
    );
  } catch (error) {
    console.warn("Daily Briefing push was skipped", {
      briefingId,
      error: error instanceof Error ? error.message : "Unknown push relay error",
    });
    return { ok: false, skipped: true };
  }
}

async function relayRequest(env: Env, path: string, init: RequestInit = {}) {
  const context = await relayContext(env);
  if (!context) throw new PushNotificationInputError("ME3 Cloud is not linked", 409);
  const response = await fetch(new URL(path, getMe3CloudApiOrigin(env)), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-ME3-Core-Owner-ID": context.ownerId,
      "X-ME3-Core-Install-ID": context.installId,
      "X-ME3-Core-Update-Token": context.token,
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new PushNotificationInputError(
      typeof payload?.error === "string" ? payload.error : "Push relay request failed",
      response.status === 400 ? 400 : response.status === 409 ? 409 : 502,
    );
  }
  return payload || { ok: true };
}

async function relayContext(env: Env) {
  const rows = await Promise.all(
    [OWNER_SECRET, INSTALL_SECRET, TOKEN_SECRET].map((name) =>
      env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
        .bind(name)
        .first<{ value: string }>(),
    ),
  );
  const [ownerId, installId, token] = rows.map((row) => row?.value?.trim() || "");
  return ownerId && installId && token ? { ownerId, installId, token } : null;
}

function normalizeDeviceId(value: unknown) {
  const deviceId = typeof value === "string" ? value.trim() : "";
  if (!DEVICE_ID.test(deviceId)) throw new PushNotificationInputError("Invalid device ID", 400);
  return deviceId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
