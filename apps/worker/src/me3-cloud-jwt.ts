import { getMe3CloudApiOrigin } from "./sites";
import type { Env } from "./types";

type JwtHeader = {
  alg?: string;
  kid?: string;
};

export class Me3CloudJwtVerificationError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid" | "unavailable",
  ) {
    super(message);
    this.name = "Me3CloudJwtVerificationError";
  }
}

export async function verifyMe3CloudJwt<T extends { iss?: unknown; exp?: unknown }>(
  env: Env,
  token: string,
): Promise<T> {
  const parts = token.split(".");
  if (parts.length !== 3) throw invalidToken("Token must be a JWT");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: JwtHeader;
  let payload: T;
  try {
    header = JSON.parse(decodeBase64Url(encodedHeader)) as JwtHeader;
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as T;
  } catch {
    throw invalidToken("Token encoding is invalid");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw invalidToken("Token uses an unsupported signature");
  }

  const issuer = getMe3CloudApiOrigin(env);
  if (payload.iss !== issuer) throw invalidToken("Token issuer is invalid");
  if (typeof payload.exp !== "number" || payload.exp <= currentUnixTime()) {
    throw invalidToken("Token is expired");
  }

  let jwksResponse: Response;
  try {
    jwksResponse = await fetch(new URL("/.well-known/jwks.json", issuer).toString());
  } catch {
    throw unavailableKeys();
  }
  if (!jwksResponse.ok) throw unavailableKeys();

  let jwks: { keys?: Array<JsonWebKey & { kid?: string }> };
  try {
    jwks = (await jwksResponse.json()) as {
      keys?: Array<JsonWebKey & { kid?: string }>;
    };
  } catch {
    throw unavailableKeys();
  }
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw unavailableKeys();

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { ...jwk, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw unavailableKeys();
  }
  const signatureBytes = decodeBase64UrlBytes(encodedSignature);
  const signature = new ArrayBuffer(signatureBytes.byteLength);
  new Uint8Array(signature).set(signatureBytes);
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    throw unavailableKeys();
  }
  if (!valid) throw invalidToken("Token signature is invalid");

  return payload;
}

function invalidToken(message: string): Me3CloudJwtVerificationError {
  return new Me3CloudJwtVerificationError(message, "invalid");
}

function unavailableKeys(): Me3CloudJwtVerificationError {
  return new Me3CloudJwtVerificationError(
    "ME3 Cloud signing keys are temporarily unavailable",
    "unavailable",
  );
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
