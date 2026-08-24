import { describe, expect, it } from "vitest";
import {
  generateUnsubscribeToken,
  getPublicSiteForHost,
  hashSubscriberIdentifier,
  isMissingSitePagesTableError,
  listBookingEnabledSiteIds,
  verifyUnsubscribeToken,
} from "./sites";
import type { DbSite, Env } from "./types";

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
      profileFile("active-public", "public/me.json", {
        capabilities: { book: { action: "book" } },
      }),
      profileFile("source-wins", "public/me.json", {
        capabilities: { book: { action: "book" } },
      }),
      profileFile("source-wins", "src/me.json", {
        intents: { book: { enabled: false } },
      }),
      profileFile("active-source", "src/me.json", {
        intents: { book: { enabled: true } },
      }),
      profileFile("invalid", "src/me.json", "not json"),
    ]);

    await expect(listBookingEnabledSiteIds(env, "owner")).resolves.toEqual(
      new Set(["active-public", "active-source"]),
    );
  });
});

describe("site pages compatibility", () => {
  it("recognizes Cloudflare D1's missing-table error format", () => {
    expect(
      isMissingSitePagesTableError(
        new Error("D1_ERROR: no such table: site_pages: SQLITE_ERROR"),
      ),
    ).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(isMissingSitePagesTableError(new Error("D1_ERROR: database is locked"))).toBe(
      false,
    );
  });
});

describe("public site host resolution", () => {
  const profile = siteRecord("profile", "owner", "profile", null);
  const studio = siteRecord(
    "studio",
    "studio",
    "organization",
    "studio.example.com",
  );
  const otherOwnerSite = {
    ...siteRecord(
      "other",
      "other-site",
      "organization",
      "other.example.com",
    ),
    user_id: "other-owner",
  };

  it("resolves the exact custom host before the configured profile", async () => {
    const env = createPublicRoutingEnv([profile, studio, otherOwnerSite]);

    await expect(
      getPublicSiteForHost(env, "STUDIO.EXAMPLE.COM"),
    ).resolves.toMatchObject({ id: "studio", username: "studio" });
    await expect(
      getPublicSiteForHost(env, "other.example.com"),
    ).resolves.toMatchObject({ id: "other", user_id: "other-owner" });
  });

  it("uses the profile only on the installation's known fallback host", async () => {
    const env = createPublicRoutingEnv([profile, studio]);

    await expect(
      getPublicSiteForHost(env, "owner.me3.app"),
    ).resolves.toMatchObject({ id: "profile" });
    await expect(
      getPublicSiteForHost(env, "unknown.example.com"),
    ).resolves.toBeNull();
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
  profile: Record<string, unknown> | string,
): BookingProfileFile {
  const content =
    typeof profile === "string" ? profile : JSON.stringify(profile);
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

function siteRecord(
  id: string,
  username: string,
  siteRole: "profile" | "organization",
  customDomain: string | null,
): DbSite {
  return {
    id,
    user_id: "owner",
    username,
    site_type: "profile",
    site_role: siteRole,
    template_id: "me3",
    custom_domain: customDomain,
    custom_domain_status: customDomain ? "active" : null,
    custom_domain_cf_id: null,
    created_at: "2026-08-24T09:00:00.000Z",
    updated_at: "2026-08-24T09:00:00.000Z",
    published_at: "2026-08-24T10:00:00.000Z",
  };
}

function createPublicRoutingEnv(siteRecords: DbSite[]): Env {
  return {
    CORE_WEB_ORIGIN: "https://owner.me3.app",
    ME3_SITE_USERNAME: "owner",
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first<T>() {
                if (sql.includes("lower(custom_domain)")) {
                  const host = String(values[0] || "").toLowerCase();
                  return (siteRecords.find(
                    (site) => site.custom_domain?.toLowerCase() === host,
                  ) || null) as T | null;
                }
                if (sql.includes("WHERE username = ?")) {
                  return (siteRecords.find(
                    (site) => site.username === values[0],
                  ) || null) as T | null;
                }
                return null;
              },
            };
          },
          async first<T>() {
            return (siteRecords.find((site) => site.site_role === "profile") ||
              null) as T | null;
          },
        };
      },
    },
  } as unknown as Env;
}
