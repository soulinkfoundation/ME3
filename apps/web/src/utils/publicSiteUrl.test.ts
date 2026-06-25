import { describe, expect, it } from "vitest";
import { configuredPublicProfileUrl } from "./publicSiteUrl";

describe("configuredPublicProfileUrl", () => {
  it("uses a configured custom domain", () => {
    expect(configuredPublicProfileUrl({ custom_domain: "example.com" })).toBe(
      "https://example.com",
    );
  });

  it("falls back when no custom domain is configured", () => {
    expect(configuredPublicProfileUrl({ custom_domain: null })).toBeNull();
  });
});
