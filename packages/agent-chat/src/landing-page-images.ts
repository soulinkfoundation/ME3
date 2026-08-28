import type { LandingPageImageAttribution } from "@me3-core/plugin-landing-pages";

const PEXELS_SEARCH_ENDPOINT = "https://api.pexels.com/v1/search";
const PEXELS_IMAGE_HOST = "images.pexels.com";
const IMAGE_FETCH_TIMEOUT_MS = 8_000;
const D1_IMAGE_MAX_BYTES = 1_900_000;
const R2_IMAGE_MAX_BYTES = 8_000_000;

type LandingPageImageD1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
};

type LandingPageImageR2Like = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

export type AgentLandingPageImageEnv = {
  DB: LandingPageImageD1Like;
  SITE_ASSETS?: LandingPageImageR2Like;
  PEXELS_API_KEY?: string;
  fetch?: typeof fetch;
};

export type AgentLandingPageStoredImage = {
  path: string;
  provider: "pexels";
  storage: "d1" | "r2";
  attribution: LandingPageImageAttribution;
};

type PexelsPhoto = {
  id?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  src?: {
    landscape?: string;
    large?: string;
    large2x?: string;
  };
};

export async function findAndStoreAgentLandingPageHero(
  env: AgentLandingPageImageEnv,
  input: {
    siteId: string;
    siteUsername: string;
    pageId: string;
    query: string;
  },
): Promise<AgentLandingPageStoredImage | null> {
  const apiKey = env.PEXELS_API_KEY?.trim();
  const query = normalizeImageQuery(input.query);
  if (!apiKey || !query) return null;

  try {
    const searchUrl = new URL(PEXELS_SEARCH_ENDPOINT);
    searchUrl.searchParams.set("query", query);
    searchUrl.searchParams.set("orientation", "landscape");
    searchUrl.searchParams.set("size", "large");
    searchUrl.searchParams.set("per_page", "8");
    const searchResponse = await fetchWithTimeout(
      env.fetch || fetch,
      searchUrl,
      { headers: { Authorization: apiKey } },
    );
    if (!searchResponse.ok) return null;
    const payload = (await searchResponse.json().catch(() => null)) as {
      photos?: PexelsPhoto[];
    } | null;
    const photo = payload?.photos?.find((candidate) => validPexelsPhoto(candidate));
    if (!photo) return null;

    const imageUrl = validPexelsImageUrl(
      photo.src?.landscape || photo.src?.large || photo.src?.large2x || "",
    );
    if (!imageUrl) return null;
    const imageResponse = await fetchWithTimeout(env.fetch || fetch, imageUrl);
    if (!imageResponse.ok) return null;
    const contentType = normalizeImageContentType(
      imageResponse.headers.get("content-type"),
    );
    if (!contentType) return null;
    const declaredSize = Number(imageResponse.headers.get("content-length") || 0);
    const maxBytes = env.SITE_ASSETS ? R2_IMAGE_MAX_BYTES : D1_IMAGE_MAX_BYTES;
    if (declaredSize > maxBytes) return null;
    const bytes = await imageResponse.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > maxBytes) return null;

    const extension = contentType === "image/webp" ? "webp" : "jpg";
    const filename = `${input.pageId}-hero.${extension}`;
    const publicPath = `public/files/${filename}`;
    const path = `files/${filename}`;
    const attribution: LandingPageImageAttribution = {
      provider: "pexels",
      photographer: String(photo.photographer || "Pexels photographer").slice(0, 120),
      photographerUrl: validPexelsPageUrl(photo.photographer_url || "") || "https://www.pexels.com/",
      sourceUrl: validPexelsPageUrl(photo.url || "") || "https://www.pexels.com/",
    };

    if (env.SITE_ASSETS) {
      await env.SITE_ASSETS.put(
        siteAssetKey(input.siteUsername, publicPath),
        bytes,
        {
          httpMetadata: { contentType },
          customMetadata: {
            provider: "pexels",
            photoId: String(photo.id || ""),
            photographer: attribution.photographer,
            sourceUrl: attribution.sourceUrl,
          },
        },
      );
      return { path, provider: "pexels", storage: "r2", attribution };
    }

    await env.DB.prepare(
      `INSERT INTO site_files (site_id, path, content, content_type, size, sha256, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(site_id, path) DO UPDATE SET
         content = excluded.content,
         content_type = excluded.content_type,
         size = excluded.size,
         sha256 = excluded.sha256,
         updated_at = datetime('now')`,
    )
      .bind(
        input.siteId,
        publicPath,
        bytes,
        contentType,
        bytes.byteLength,
        await sha256(bytes),
      )
      .run();
    return { path, provider: "pexels", storage: "d1", attribution };
  } catch {
    return null;
  }
}

export async function deleteAgentLandingPageHero(
  env: AgentLandingPageImageEnv,
  input: {
    siteId: string;
    siteUsername: string;
    image: AgentLandingPageStoredImage | null;
  },
): Promise<void> {
  if (!input.image) return;
  const publicPath = `public/${input.image.path.replace(/^\/+/, "")}`;
  if (input.image.storage === "r2" && env.SITE_ASSETS) {
    await env.SITE_ASSETS.delete(siteAssetKey(input.siteUsername, publicPath));
    return;
  }
  await env.DB.prepare("DELETE FROM site_files WHERE site_id = ? AND path = ?")
    .bind(input.siteId, publicPath)
    .run();
}

function normalizeImageQuery(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function validPexelsPhoto(photo: PexelsPhoto): boolean {
  return Boolean(
    photo &&
      photo.photographer?.trim() &&
      validPexelsImageUrl(
        photo.src?.landscape || photo.src?.large || photo.src?.large2x || "",
      ),
  );
}

function validPexelsImageUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === PEXELS_IMAGE_HOST
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function validPexelsPageUrl(value: string): string {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (hostname === "pexels.com" || hostname.endsWith(".pexels.com"))
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function normalizeImageContentType(value: string | null): "image/jpeg" | "image/webp" | null {
  const contentType = value?.split(";")[0]?.trim().toLowerCase();
  if (contentType === "image/jpeg" || contentType === "image/jpg") return "image/jpeg";
  if (contentType === "image/webp") return "image/webp";
  return null;
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function siteAssetKey(username: string, path: string): string {
  return `sites/${username}/${path.replace(/^\/+/, "")}`;
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
