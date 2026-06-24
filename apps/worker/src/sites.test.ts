import { describe, expect, it } from "vitest";
import {
  generateUnsubscribeToken,
  hashSubscriberIdentifier,
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
