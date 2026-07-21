import { parseSingleByteRange } from "./files";
import type { Env } from "./types";

type DeliveryGrantRow = {
  id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  size: number | string;
};

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
    `SELECT grant.id, file.storage_key, file.filename, file.mime_type, file.size
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

  const size = Number(row.size || 0);
  const range = options.head ? null : parseSingleByteRange(options.rangeHeader, size);
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

  await env.DB.prepare(
    `UPDATE social_media_delivery_grants
     SET access_count = access_count + 1,
         last_accessed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND revoked_at IS NULL`,
  )
    .bind(row.id)
    .run();

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
  values: { contentLength: number; contentRange?: string | null; etag?: string | null },
): Headers {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": `inline; filename="${sanitizeFilename(row.filename)}"`,
    "Content-Length": String(values.contentLength),
    "Content-Type": row.mime_type,
    "X-Content-Type-Options": "nosniff",
  });
  if (values.contentRange) headers.set("Content-Range", values.contentRange);
  if (values.etag) headers.set("ETag", values.etag);
  return headers;
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
