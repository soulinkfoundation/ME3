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
    ).toBe("/start");
  });

  it("preserves an explicit setup path only for confirmed incomplete setup", () => {
    expect(
      resolveProfileSetupPath({
        sitesLoaded: false,
        hasProfileSite: false,
        defaultPath: "/mission-control",
        setupPath: "https://core.example/start",
      }),
    ).toBe("/mission-control");
    expect(
      resolveProfileSetupPath({
        sitesLoaded: true,
        hasProfileSite: false,
        defaultPath: "/mission-control",
        setupPath: "https://core.example/start",
      }),
    ).toBe("https://core.example/start");
  });

  it("resumes imported managed onboarding even when the profile site exists", () => {
    expect(
      resolveProfileSetupPath({
        sitesLoaded: true,
        hasProfileSite: true,
        onboardingStartStep: 2,
        defaultPath: "/mission-control",
      }),
    ).toBe("/start");
  });

  it("sends first ME3.app claims to start setup", () => {
    expect(
      resolveMe3OAuthRedirect(undefined, {
        ...options,
        setupIncomplete: true,
      }),
    ).toBe("/start");
    expect(
      resolveMe3OAuthRedirect("/mission-control", {
        ...options,
        setupIncomplete: true,
      }),
    ).toBe("/start");
  });

  it("returns to root for ME3.app OAuth when setup state should decide", () => {
    expect(resolveMe3OAuthRedirect(undefined, options)).toBe("/");
    expect(resolveMe3OAuthRedirect("/start", options)).toBe("/");
    expect(resolveMe3OAuthRedirect("https://core.example/start", options)).toBe(
      "/",
    );
  });

  it("keeps safe non-start redirects", () => {
    expect(resolveMe3OAuthRedirect("/account?section=connections", options)).toBe(
      "/account?section=connections",
    );
  });
});
