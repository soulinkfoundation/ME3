import { describe, expect, it } from "vitest";
import {
  resolveMe3OAuthRedirect,
  resolveProfileSetupPath,
} from "./loginRedirect";

const options = {
  origin: "https://core.example",
  hostname: "core.example",
  dev: false,
};

describe("login redirects", () => {
  it("only routes to setup after a successful empty site lookup", () => {
    expect(
      resolveProfileSetupPath({
        sitesLoaded: false,
        hasProfileSite: false,
        defaultPath: "/mission-control",
      }),
    ).toBe("/mission-control");
    expect(
      resolveProfileSetupPath({
        sitesLoaded: true,
        hasProfileSite: true,
        defaultPath: "/mission-control",
      }),
    ).toBe("/mission-control");
    expect(
      resolveProfileSetupPath({
        sitesLoaded: true,
        hasProfileSite: false,
        defaultPath: "/mission-control",
      }),
    ).toBe("/create");
  });

  it("resumes imported managed onboarding even when the profile site exists", () => {
    expect(
      resolveProfileSetupPath({
        sitesLoaded: true,
        hasProfileSite: true,
        onboardingStartStep: 2,
        defaultPath: "/mission-control",
      }),
    ).toBe("/create");
  });

  it("sends first ME3.app claims to profile setup", () => {
    expect(
      resolveMe3OAuthRedirect(undefined, {
        ...options,
        setupIncomplete: true,
      }),
    ).toBe("/create");
    expect(
      resolveMe3OAuthRedirect("/mission-control", {
        ...options,
        setupIncomplete: true,
      }),
    ).toBe("/create");
  });

  it("returns to root for ME3.app OAuth when setup state should decide", () => {
    expect(resolveMe3OAuthRedirect(undefined, options)).toBe("/");
  });

  it("keeps safe same-origin redirects", () => {
    expect(resolveMe3OAuthRedirect("/account?section=connections", options)).toBe(
      "/account?section=connections",
    );
  });
});
