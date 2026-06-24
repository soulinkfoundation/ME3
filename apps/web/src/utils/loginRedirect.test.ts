import { describe, expect, it } from "vitest";
import {
  isStartLoginRedirect,
  normalizeSafeLoginRedirect,
} from "./loginRedirect";
import { DEFAULT_APP_PATH } from "./navigation";

const options = {
  origin: "https://core.example",
  hostname: "core.example",
  dev: false,
};

function resolveMe3OAuthRedirect(raw: unknown): string {
  const redirect = normalizeSafeLoginRedirect(raw, options);
  if (!redirect || isStartLoginRedirect(redirect, options.origin)) {
    return DEFAULT_APP_PATH;
  }
  return redirect;
}

describe("login redirects", () => {
  it("does not send /start through ME3.app OAuth", () => {
    expect(resolveMe3OAuthRedirect(undefined)).toBe(DEFAULT_APP_PATH);
    expect(resolveMe3OAuthRedirect("/start")).toBe(DEFAULT_APP_PATH);
    expect(resolveMe3OAuthRedirect("https://core.example/start")).toBe(
      DEFAULT_APP_PATH,
    );
  });

  it("keeps safe non-start redirects", () => {
    expect(resolveMe3OAuthRedirect("/account?section=connections")).toBe(
      "/account?section=connections",
    );
  });
});
