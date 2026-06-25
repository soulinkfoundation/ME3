import { api } from "../api";

type CoreConfig = {
  siteHost?: string | null;
};

type PublicProfileSite = {
  custom_domain?: string | null;
};

function browserOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/+$/, "");
}

function fallbackPublicSiteUrl(): string {
  const origin = browserOrigin();
  return origin ? `${origin}/me` : "/me";
}

export function configuredPublicProfileUrl(
  site?: PublicProfileSite | null,
): string | null {
  const domain = site?.custom_domain
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return domain ? `https://${domain}` : null;
}

export async function resolvePublicSiteUrl(): Promise<string> {
  if (import.meta.env.DEV) return "http://localhost:8787/preview";

  try {
    const config = await api.get<CoreConfig>("/config");
    const siteHost = config.siteHost?.trim();
    if (siteHost) return `https://${siteHost}`;
  } catch {
    // Fall back to the Worker-local public route when config is unavailable.
  }

  return fallbackPublicSiteUrl();
}

export async function resolvePublicProfileUrl(
  username: string,
  site?: PublicProfileSite | null,
): Promise<string> {
  if (import.meta.env.DEV) {
    return `http://localhost:8787/preview/${encodeURIComponent(username)}/`;
  }

  const configuredUrl = configuredPublicProfileUrl(site);
  if (configuredUrl) return configuredUrl;

  return resolvePublicSiteUrl();
}

export function defaultPublicProfileUrlLabel(): string {
  if (import.meta.env.DEV) return "localhost preview";
  return "/me";
}
