import { api } from "../api";

type CoreConfig = {
  siteHost?: string | null;
};

function browserOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/+$/, "");
}

function fallbackPublicSiteUrl(): string {
  const origin = browserOrigin();
  return origin ? `${origin}/me` : "/me";
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

export async function resolvePublicProfileUrl(username: string): Promise<string> {
  if (import.meta.env.DEV) {
    return `http://localhost:8787/preview/${encodeURIComponent(username)}/`;
  }

  return resolvePublicSiteUrl();
}

export function defaultPublicProfileUrlLabel(): string {
  if (import.meta.env.DEV) return "localhost preview";
  return "/me";
}
