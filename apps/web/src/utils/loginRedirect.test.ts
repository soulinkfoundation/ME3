import { describe, expect, it } from "vitest";
import { resolveMe3OAuthRedirect } from "./loginRedirect";

const options = {
  origin: "https://core.example",
  hostname: "core.example",
  dev: false,
};

describe("login redirects", () => {
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
