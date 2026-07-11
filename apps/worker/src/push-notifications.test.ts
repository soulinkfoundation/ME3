import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyDailyBriefingReady,
  PushNotificationInputError,
  registerPushNotificationDevice,
} from "./push-notifications";
import type { Env } from "./types";

describe("push notification relay client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires a linked ME3 Cloud installation", async () => {
    const env = envWithSecrets({});
    await expect(registerPushNotificationDevice(env, {
      deviceId: "ios-device-123",
      token: "a".repeat(64),
    })).rejects.toEqual(expect.objectContaining<Partial<PushNotificationInputError>>({
      status: 409,
      message: "ME3 Cloud is not linked",
    }));
  });

  it("forwards device registration with install credentials", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = envWithSecrets(linkedSecrets());

    await registerPushNotificationDevice(env, {
      deviceId: "ios-device-123",
      token: "a".repeat(64),
      environment: "sandbox",
      dailyBriefingEnabled: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.me3.app/api/push/devices"),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "X-ME3-Core-Owner-ID": "cloud-owner",
          "X-ME3-Core-Install-ID": "core_11111111-1111-4111-8111-111111111111",
          "X-ME3-Core-Update-Token": "core-token",
        }),
      }),
    );
  });

  it("uses an opaque briefing ID and never fails the completed briefing", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await notifyDailyBriefingReady(envWithSecrets(linkedSecrets()), "briefing-123");
    const calls = fetchMock.mock.calls as unknown as Array<[URL, RequestInit]>;

    expect(result).toEqual({ ok: false, skipped: true });
    expect(String(calls[0]?.[0])).toBe(
      "https://api.me3.app/api/push/daily-briefings/briefing-123",
    );
    expect(calls[0]?.[1]?.body).toBeUndefined();
  });
});

function linkedSecrets() {
  return {
    ME3_CLOUD_OWNER_ID: "cloud-owner",
    ME3_CORE_INSTALL_ID: "core_11111111-1111-4111-8111-111111111111",
    ME3_CLOUD_CORE_TOKEN: "core-token",
  };
}

function envWithSecrets(secrets: Record<string, string>) {
  return {
    DB: {
      prepare() {
        return {
          bind(name: string) {
            return {
              first: async () => secrets[name] ? { value: secrets[name] } : null,
            };
          },
        };
      },
    } as unknown as D1Database,
    ME3_CLOUD_API_ORIGIN: "https://api.me3.app",
  } as Env;
}
