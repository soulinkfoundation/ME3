import { parseSingleByteRange } from "./files";
import type { Env } from "./types";

type DeliveryGrantRow = {
  id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  size: number | string;
  provider: string;
};

const INSTAGRAM_IMAGE_PROVIDERS = new Set(["instagram", "instagram_business"]);
const INSTAGRAM_TRANSCODE_MIME_TYPES = new Set(["image/png", "image/webp"]);
const INSTAGRAM_JPEG_MAX_WIDTH = 1_440;
const INSTAGRAM_JPEG_QUALITY = 90;

export class SocialMediaDeliveryError extends Error {
  constructor(message = "Media delivery URL is invalid or expired.", public status = 404) {
    super(message);
    this.name = "SocialMediaDeliveryError";
  }
}

export async function getSocialMediaDeliveryResponse(
  env: Env,
  tokenInput: string,
  options: { rangeHeader?: string | null; head?: boolean } = {},
): Promise<Response> {
  if (!env.SITE_ASSETS) throw new SocialMediaDeliveryError("Media storage is unavailable.", 503);
  const token = normalizeDeliveryToken(tokenInput);
  const tokenHash = await sha256Hex(new TextEncoder().encode(token));
  const row = await env.DB.prepare(
    `SELECT grant.id, grant.provider, file.storage_key, file.filename, file.mime_type, file.size
     FROM social_media_delivery_grants grant
     JOIN drive_files file
       ON file.id = grant.file_id
      AND file.owner_id = grant.owner_id
      AND file.status = 'ready'
     WHERE grant.token_hash = ?
       AND grant.revoked_at IS NULL
       AND datetime(grant.expires_at) > datetime('now')
     LIMIT 1`,
  )
    .bind(tokenHash)
    .first<DeliveryGrantRow>();
  if (!row) throw new SocialMediaDeliveryError();

  const transcodeForInstagram = shouldTranscodeForInstagram(row);
  if (transcodeForInstagram && !env.IMAGES) {
    throw new SocialMediaDeliveryError(
      "Instagram image conversion is unavailable.",
      503,
    );
  }

  const size = Number(row.size || 0);
  const range = options.head || transcodeForInstagram
    ? null
    : parseSingleByteRange(options.rangeHeader, size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: providerHeaders(row, {
        contentLength: 0,
        contentRange: `bytes */${size}`,
      }),
    });
  }

  const object = options.head
    ? await env.SITE_ASSETS.head(row.storage_key)
    : await env.SITE_ASSETS.get(
        row.storage_key,
        range ? { range: { offset: range.start, length: range.length } } : undefined,
      );
  if (!object) throw new SocialMediaDeliveryError();

  await recordGrantAccess(env, row.id);

  if (transcodeForInstagram) {
    if (options.head) {
      return new Response(null, {
        status: 200,
        headers: providerHeaders(row, {
          contentType: "image/jpeg",
          filename: instagramJpegFilename(row.filename),
          acceptRanges: false,
        }),
      });
    }

    try {
      const result = await env.IMAGES!
        .input((object as R2ObjectBody).body)
        .transform({
          width: INSTAGRAM_JPEG_MAX_WIDTH,
          fit: "scale-down",
          background: "#FFFFFF",
        })
        .output({
          format: "image/jpeg",
          quality: INSTAGRAM_JPEG_QUALITY,
        });
      const transformed = result.response();
      if (!transformed.ok || !transformed.body) {
        throw new Error(`Image transformation failed (${transformed.status})`);
      }
      return new Response(transformed.body, {
        status: transformed.status,
        headers: providerHeaders(row, {
          contentType: "image/jpeg",
          filename: instagramJpegFilename(row.filename),
          contentLength: responseContentLength(transformed),
          etag: transformed.headers.get("ETag"),
          acceptRanges: false,
        }),
      });
    } catch {
      throw new SocialMediaDeliveryError(
        "Instagram image conversion failed.",
        502,
      );
    }
  }

  const headers = providerHeaders(row, {
    contentLength: range?.length ?? object.size,
    contentRange: range ? `bytes ${range.start}-${range.end}/${size}` : null,
    etag: object.httpEtag,
  });
  return new Response(options.head ? null : (object as R2ObjectBody).body, {
    status: range ? 206 : 200,
    headers,
  });
}

function providerHeaders(
  row: Pick<DeliveryGrantRow, "filename" | "mime_type">,
  values: {
    contentLength?: number | null;
    contentRange?: string | null;
    contentType?: string;
    filename?: string;
    etag?: string | null;
    acceptRanges?: boolean;
  },
): Headers {
  const headers = new Headers({
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": `inline; filename="${sanitizeFilename(values.filename || row.filename)}"`,
    "Content-Type": values.contentType || row.mime_type,
    "X-Content-Type-Options": "nosniff",
  });
  if (values.acceptRanges !== false) headers.set("Accept-Ranges", "bytes");
  if (values.contentLength !== null && values.contentLength !== undefined) {
    headers.set("Content-Length", String(values.contentLength));
  }
  if (values.contentRange) headers.set("Content-Range", values.contentRange);
  if (values.etag) headers.set("ETag", values.etag);
  return headers;
}

async function recordGrantAccess(env: Env, grantId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE social_media_delivery_grants
     SET access_count = access_count + 1,
         last_accessed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revoked_at IS NULL`,
  )
    .bind(grantId)
    .run();
}

function shouldTranscodeForInstagram(
  row: Pick<DeliveryGrantRow, "provider" | "mime_type">,
): boolean {
  return (
    INSTAGRAM_IMAGE_PROVIDERS.has(row.provider) &&
    INSTAGRAM_TRANSCODE_MIME_TYPES.has(row.mime_type.toLowerCase())
  );
}

function instagramJpegFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "") || "instagram-image";
  return `${stem}.jpg`;
}

function responseContentLength(response: Response): number | null {
  const header = response.headers.get("Content-Length");
  if (!header) return null;
  const value = Number(header);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeDeliveryToken(value: string): string {
  const token = value.trim();
  if (!/^socmedia_[A-Za-z0-9_-]{20,160}$/.test(token)) throw new SocialMediaDeliveryError();
  return token;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\r\n"]/g, "'").slice(0, 160);
}

async function sha256Hex(value: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
