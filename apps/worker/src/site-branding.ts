import { getPublicSiteOrigin, getSiteFileText } from "./sites";
import type { DbSite, Env } from "./types";

export type SiteBranding = {
  siteId: string;
  siteUsername: string;
  displayName: string;
  logoRef: string | null;
  logoUrl: string | null;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  updatedAt: string | null;
  persisted: boolean;
};

type SiteBrandingSite = Pick<
  DbSite,
  "id" | "username" | "custom_domain" | "custom_domain_status"
>;

type SiteBrandingRow = {
  site_id: string;
  display_name: string;
  logo_ref: string | null;
  accent_color: string;
  background_color: string;
  surface_color: string;
  text_color: string;
  updated_at: string;
};

type SiteProfileBrandSeed = {
  name?: unknown;
  logo?: unknown;
  avatar?: unknown;
  links?: Record<string, unknown> | null;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DEFAULT_COLORS = {
  accentColor: "#147d64",
  backgroundColor: "#f4f5f4",
  surfaceColor: "#ffffff",
  textColor: "#18201d",
} as const;

export class SiteBrandingInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "SiteBrandingInputError";
  }
}

export async function getSiteBranding(
  env: Env,
  site: SiteBrandingSite,
  persistDefaults = false,
): Promise<SiteBranding> {
  const existing = await readSiteBranding(env, site.id);
  if (existing) return serializeSiteBranding(env, site, existing, true);

  const seed = await deriveSiteBranding(env, site);
  if (!persistDefaults) return seed;

  await env.DB.prepare(
    `INSERT INTO site_branding
       (site_id, display_name, logo_ref, accent_color, background_color,
        surface_color, text_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(site_id) DO NOTHING`,
  )
    .bind(
      site.id,
      seed.displayName,
      seed.logoRef,
      seed.accentColor,
      seed.backgroundColor,
      seed.surfaceColor,
      seed.textColor,
    )
    .run();
  const persisted = await readSiteBranding(env, site.id);
  return persisted
    ? serializeSiteBranding(env, site, persisted, true)
    : seed;
}

export async function updateSiteBranding(
  env: Env,
  site: SiteBrandingSite,
  input: Record<string, unknown>,
): Promise<SiteBranding> {
  const displayName = normalizeText(input.displayName, 120);
  if (!displayName) throw new SiteBrandingInputError("Site branding needs a display name");

  const logoRef = normalizeLogoRef(input.logoRef);
  const accentColor = requireColor(input.accentColor, "Accent colour");
  const backgroundColor = requireColor(input.backgroundColor, "Background colour");
  const surfaceColor = requireColor(input.surfaceColor, "Surface colour");
  const textColor = requireColor(input.textColor, "Text colour");

  await env.DB.prepare(
    `INSERT INTO site_branding
       (site_id, display_name, logo_ref, accent_color, background_color,
        surface_color, text_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(site_id) DO UPDATE SET
       display_name = excluded.display_name,
       logo_ref = excluded.logo_ref,
       accent_color = excluded.accent_color,
       background_color = excluded.background_color,
       surface_color = excluded.surface_color,
       text_color = excluded.text_color,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      site.id,
      displayName,
      logoRef,
      accentColor,
      backgroundColor,
      surfaceColor,
      textColor,
    )
    .run();

  const updated = await readSiteBranding(env, site.id);
  if (!updated) throw new SiteBrandingInputError("Site branding could not be saved");
  return serializeSiteBranding(env, site, updated, true);
}

async function deriveSiteBranding(
  env: Env,
  site: SiteBrandingSite,
): Promise<SiteBranding> {
  const profile = await readSiteProfileSeed(env, site.id);
  const displayName = normalizeText(profile?.name, 120) || site.username;
  const logoRef = tryNormalizeLogoRef(profile?.logo ?? profile?.avatar ?? null);
  const accentColor = normalizeColor(profile?.links?._accent, DEFAULT_COLORS.accentColor);
  return {
    siteId: site.id,
    siteUsername: site.username,
    displayName,
    logoRef,
    logoUrl: resolveLogoUrl(env, site, logoRef),
    accentColor,
    backgroundColor: DEFAULT_COLORS.backgroundColor,
    surfaceColor: DEFAULT_COLORS.surfaceColor,
    textColor: DEFAULT_COLORS.textColor,
    updatedAt: null,
    persisted: false,
  };
}

async function readSiteProfileSeed(
  env: Env,
  siteId: string,
): Promise<SiteProfileBrandSeed | null> {
  const source =
    (await getSiteFileText(env, siteId, "src/me.json")) ||
    (await getSiteFileText(env, siteId, "public/me.json"));
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === "object" ? parsed as SiteProfileBrandSeed : null;
  } catch {
    return null;
  }
}

async function readSiteBranding(env: Env, siteId: string) {
  return env.DB.prepare(
    `SELECT site_id, display_name, logo_ref, accent_color, background_color,
            surface_color, text_color, updated_at
     FROM site_branding WHERE site_id = ?`,
  )
    .bind(siteId)
    .first<SiteBrandingRow>();
}

function serializeSiteBranding(
  env: Env,
  site: SiteBrandingSite,
  row: SiteBrandingRow,
  persisted: boolean,
): SiteBranding {
  return {
    siteId: row.site_id,
    siteUsername: site.username,
    displayName: row.display_name,
    logoRef: row.logo_ref,
    logoUrl: resolveLogoUrl(env, site, row.logo_ref),
    accentColor: row.accent_color,
    backgroundColor: row.background_color,
    surfaceColor: row.surface_color,
    textColor: row.text_color,
    updatedAt: row.updated_at,
    persisted,
  };
}

function resolveLogoUrl(
  env: Env,
  site: SiteBrandingSite,
  logoRef: string | null,
): string | null {
  if (!logoRef) return null;
  const homeUrl = getPublicSiteOrigin(env, {
    custom_domain: site.custom_domain_status === "active" ? site.custom_domain : null,
  }) || "https://me3.app";
  try {
    const url = new URL(logoRef, `${homeUrl.replace(/\/$/, "")}/`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeLogoRef(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeText(value, 2048);
  if (!normalized) return null;
  if (normalized.startsWith("./") || normalized.startsWith("/")) return normalized;
  try {
    const url = new URL(normalized);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    // Fall through to the input error below.
  }
  throw new SiteBrandingInputError("Site branding logo must use a Site path or HTTP(S) URL");
}

function tryNormalizeLogoRef(value: unknown): string | null {
  try {
    return normalizeLogoRef(value);
  } catch {
    return null;
  }
}

function requireColor(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!HEX_COLOR.test(normalized)) {
    throw new SiteBrandingInputError(`${label} must be a six-digit hex colour`);
  }
  return normalized;
}

function normalizeColor(value: unknown, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return HEX_COLOR.test(normalized) ? normalized : fallback;
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
