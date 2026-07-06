import { getMe3CloudApiOrigin } from "./sites";
import type { Env } from "./types";

type JwtHeader = {
  alg?: string;
  kid?: string;
};

export async function verifyMe3CloudJwt<T extends { iss?: unknown; exp?: unknown }>(
  env: Env,
  token: string,
): Promise<T> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token must be a JWT");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodeBase64Url(encodedHeader)) as JwtHeader;
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Token uses an unsupported signature");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as T;
  const issuer = getMe3CloudApiOrigin(env);
  if (payload.iss !== issuer) throw new Error("Token issuer is invalid");
  if (typeof payload.exp !== "number" || payload.exp <= currentUnixTime()) {
    throw new Error("Token is expired");
  }

  const jwksResponse = await fetch(new URL("/.well-known/jwks.json", issuer).toString());
  if (!jwksResponse.ok) throw new Error("Could not fetch ME3 Cloud signing keys");

  const jwks = (await jwksResponse.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Token signing key was not found");

  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = decodeBase64UrlBytes(encodedSignature);
  const signature = new ArrayBuffer(signatureBytes.byteLength);
  new Uint8Array(signature).set(signatureBytes);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("Token signature is invalid");

  return payload;
}

function currentUnixTime(): number {
  return Math.floor(Date.now() / 1000);
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
