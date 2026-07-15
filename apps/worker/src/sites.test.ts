import { describe, expect, it } from "vitest";
import {
  generateUnsubscribeToken,
  hashSubscriberIdentifier,
  listBookingEnabledSiteIds,
  verifyUnsubscribeToken,
} from "./sites";
import type { Env } from "./types";

describe("site unsubscribe tokens", () => {
  it("keys tokens to the install secret", async () => {
    const env = { JWT_SECRET: "install-a" } as Env;
    const otherEnv = { JWT_SECRET: "install-b" } as Env;

    const token = await generateUnsubscribeToken(env, "OWNER@example.com", "SiteOwner");
    const publicHash = (await hashSubscriberIdentifier("owner@example.comsiteowner")).slice(0, 32);

    expect(token).toHaveLength(32);
    expect(token).not.toBe(publicHash);
    expect(await generateUnsubscribeToken(otherEnv, "owner@example.com", "siteowner")).not.toBe(token);
    expect(await verifyUnsubscribeToken(env, "owner@example.com", "siteowner", token)).toBe(true);
    expect(await verifyUnsubscribeToken(otherEnv, "owner@example.com", "siteowner", token)).toBe(false);
  });
});

describe("site booking capabilities", () => {
  it("uses the saved source profile to identify booking-enabled sites", async () => {
    const env = createBookingCapabilityEnv([
      profileFile("active-public", "public/me.json", true),
      profileFile("source-wins", "public/me.json", true),
      profileFile("source-wins", "src/me.json", false),
      profileFile("active-source", "src/me.json", true),
      profileFile("invalid", "src/me.json", "not json"),
    ]);

    await expect(listBookingEnabledSiteIds(env, "owner")).resolves.toEqual(
      new Set(["active-public", "active-source"]),
    );
  });
});

type BookingProfileFile = {
  site_id: string;
  path: "src/me.json" | "public/me.json";
  content: Uint8Array;
};

function profileFile(
  siteId: string,
  path: BookingProfileFile["path"],
  enabled: boolean | string,
): BookingProfileFile {
  const content =
    typeof enabled === "boolean"
      ? JSON.stringify({ intents: { book: { enabled } } })
      : enabled;
  return {
    site_id: siteId,
    path,
    content: new TextEncoder().encode(content),
  };
}

function createBookingCapabilityEnv(files: BookingProfileFile[]): Env {
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all<T>() {
                return { results: files as T[] };
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
}
