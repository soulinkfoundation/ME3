export interface LoginRedirectOptions {
  origin: string;
  hostname: string;
  dev: boolean;
  setupIncomplete?: boolean;
}

export function isStartRedirectPath(pathname: string): boolean {
  return pathname === "/start" || pathname === "/start/";
}

export function normalizeSafeLoginRedirect(
  raw: unknown,
  options: LoginRedirectOptions,
): string | null {
  if (typeof raw !== "string") return null;
  const redirect = raw.trim();
  if (!redirect) return null;

  if (redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }

  try {
    const parsed = new URL(redirect);
    const sameHost = parsed.hostname === options.hostname;
    const devLocalhost =
      options.dev && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (
      (sameHost || devLocalhost) &&
      ["http:", "https:"].includes(parsed.protocol)
    ) {
      return parsed.toString();
    }
  } catch {
    // Fall through to unsafe.
  }

  return null;
}

export function isStartLoginRedirect(redirect: string, origin: string): boolean {
  return isStartRedirectPath(new URL(redirect, origin).pathname);
}

export function resolveMe3OAuthRedirect(
  raw: unknown,
  options: LoginRedirectOptions,
): string {
  if (options.setupIncomplete) return "/start";

  const redirect = normalizeSafeLoginRedirect(raw, options);
  if (!redirect || isStartLoginRedirect(redirect, options.origin)) {
    return "/";
  }
  return redirect;
}
