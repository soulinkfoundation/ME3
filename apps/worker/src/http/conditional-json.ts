import type { AppContext } from "./types";

export async function privateConditionalJson(
  c: AppContext,
  value: unknown,
  status = 200,
): Promise<Response> {
  const body = JSON.stringify(value);
  const eTag = await contentETag(body);
  const headers = {
    "cache-control": "private, no-cache",
    "content-type": "application/json; charset=UTF-8",
    etag: eTag,
    vary: "Authorization",
  };

  if (status === 200 && ifNoneMatchContains(c.req.header("If-None-Match"), eTag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status, headers });
}

export async function contentETag(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `"sha256-${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}"`;
}

export function ifNoneMatchContains(header: string | undefined, eTag: string): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const normalized = candidate.trim();
    return normalized === "*" || normalized === eTag || normalized === `W/${eTag}`;
  });
}
