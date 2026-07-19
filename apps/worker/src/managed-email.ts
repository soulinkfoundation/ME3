import {
  Me3CloudJwtVerificationError,
  verifyMe3CloudJwt,
} from "./me3-cloud-jwt";
import {
  deliverInboundEmail,
  MAX_INBOUND_EMAIL_BYTES,
  type ForwardableEmailMessageLike,
} from "./mailbox-inbound";
import { normalizeEmail, originFromUrl } from "./sites";
import type { EmailProviderAttachment, EmailSendPurpose } from "./email-providers";
import type { Env } from "./types";

export const MANAGED_EMAIL_INBOUND_PATH = "/internal/shared-email/inbound";
export const MANAGED_EMAIL_INBOUND_AUDIENCE = "me3-managed-email-inbound";
export const MANAGED_EMAIL_INBOUND_TOKEN_TYPE = "me3_managed_email_inbound";
export const MANAGED_EMAIL_PROVIDER_ID = "managed_gateway" as const;
export const MANAGED_EMAIL_MAX_JWT_LIFETIME_SECONDS = 300;
export const MANAGED_EMAIL_MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const MANAGED_EMAIL_MAX_AUTHORIZATION_BYTES = 16 * 1024;

const CORE_INSTALL_ID_SECRET = "ME3_CORE_INSTALL_ID";
const CORE_UPDATE_TOKEN_SECRET = "ME3_CLOUD_CORE_TOKEN";
const CLOUD_OWNER_ID_SECRET = "ME3_CLOUD_OWNER_ID";
const DELIVERY_ID = /^[A-Za-z0-9._:-]{8,200}$/;
const MANAGED_INSTALLATION_ID = /^mi-[A-Za-z0-9][A-Za-z0-9._:-]{2,198}$/;
const CORE_INSTALL_ID = /^core_[A-Za-z0-9][A-Za-z0-9._:-]{2,198}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const AMBIGUOUS_GATEWAY_ERROR_CODES = new Set([
  "delivery_processing",
  "delivery_unknown",
]);

type ManagedEmailInboundClaims = {
  iss?: unknown;
  exp?: unknown;
  iat?: unknown;
  aud?: unknown;
  typ?: unknown;
  sub?: unknown;
  jti?: unknown;
  managed_installation_id?: unknown;
  core_install_id?: unknown;
  delivery_id?: unknown;
  body_sha256?: unknown;
  recipient?: unknown;
};

export type ManagedEmailGatewaySendInput = {
  auditId: string;
  purpose: EmailSendPurpose;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachments: EmailProviderAttachment[];
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  approvedByUserId: string | null;
  metadata: Record<string, string>;
};

export type ManagedEmailGatewaySendResult = {
  providerMessageId: string | null;
  providerStatus: string;
  raw: unknown;
};

export class ManagedEmailGatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly definitive: boolean,
    readonly raw: unknown = null,
  ) {
    super(message);
    this.name = "ManagedEmailGatewayError";
  }
}

class ManagedInboundRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type ManagedEmailRuntimeIdentity = {
  managedInstallationId: string;
  coreInstallId: string;
};

type ManagedEmailGatewayConfig = ManagedEmailRuntimeIdentity & {
  origin: string;
  coreUpdateToken: string;
  cloudOwnerId: string;
};

export function isManagedEmailDeployment(env: Env): boolean {
  return String(env.ME3_DEPLOYMENT_MODE || "").trim().toLowerCase() === "managed";
}

export function hasManagedEmailGatewayCapability(env: Env): boolean {
  return Boolean(
    isManagedEmailDeployment(env) &&
      normalizedManagedInstallationId(env.ME3_MANAGED_INSTALLATION_ID) &&
      managedEmailGatewayOrigin(env),
  );
}

export async function receiveManagedEmailInbound(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isManagedEmailDeployment(env)) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  try {
    if (request.method.toUpperCase() !== "POST") {
      throw new ManagedInboundRequestError("Method not allowed", 405, "method_not_allowed");
    }
    if (new URL(request.url).pathname !== MANAGED_EMAIL_INBOUND_PATH) {
      throw new ManagedInboundRequestError("Route not found", 404, "not_found");
    }
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.startsWith("message/rfc822")) {
      throw new ManagedInboundRequestError(
        "Content-Type must be message/rfc822",
        415,
        "unsupported_media_type",
      );
    }
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_INBOUND_EMAIL_BYTES) {
      throw new ManagedInboundRequestError(
        "Message is too large for this ME3 mailbox",
        413,
        "too_large",
      );
    }

    const identity = await getManagedEmailRuntimeIdentity(env);
    const deliveryId = requiredHeader(request, "X-ME3-Delivery-ID");
    const managedInstallationId = requiredHeader(request, "X-ME3-Install-ID");
    const recipient = normalizeEmail(requiredHeader(request, "X-ME3-Recipient")) || "";
    const expectedBodySha256 = requiredHeader(request, "X-ME3-Body-SHA256").toLowerCase();
    if (!DELIVERY_ID.test(deliveryId)) {
      throw new ManagedInboundRequestError("Delivery ID is invalid", 400, "invalid_delivery_id");
    }
    if (managedInstallationId !== identity.managedInstallationId) {
      throw new ManagedInboundRequestError(
        "Delivery is for a different managed installation",
        403,
        "installation_mismatch",
      );
    }
    if (!recipient) {
      throw new ManagedInboundRequestError("Recipient is invalid", 400, "invalid_recipient");
    }
    if (!SHA256_HEX.test(expectedBodySha256)) {
      throw new ManagedInboundRequestError("Body hash is invalid", 400, "invalid_body_hash");
    }

    const token = bearerToken(request.headers.get("authorization"));
    const claims = await verifyManagedEmailInboundToken(env, token, identity, {
      deliveryId,
      recipient,
      bodySha256: expectedBodySha256,
    });
    const rawBytes = await readRequestBytes(request, MAX_INBOUND_EMAIL_BYTES);
    const actualBodySha256 = await sha256Hex(rawBytes);
    if (actualBodySha256 !== claims.body_sha256) {
      throw new ManagedInboundRequestError(
        "Message body hash does not match the delivery token",
        401,
        "body_hash_mismatch",
      );
    }

    const message = rawMimeMessage(rawBytes, recipient);
    const result = await deliverInboundEmail(message, env, {
      providerId: MANAGED_EMAIL_PROVIDER_ID,
      providerDeliveryId: deliveryId,
      recipient,
      allowNativeForwarding: false,
      managedDelivery: {
        deliveryId,
        managedInstallationId: identity.managedInstallationId,
        coreInstallId: identity.coreInstallId,
        bodySha256: actualBodySha256,
        recipient,
      },
    });

    if (result.status === "accepted") {
      return jsonResponse(
        { status: "accepted", deliveryId, messageId: result.messageId },
        201,
      );
    }
    if (result.status === "duplicate") {
      return jsonResponse(
        { status: "duplicate", deliveryId, messageId: result.messageId },
        200,
      );
    }
    if (result.status === "conflict") {
      return jsonResponse({ status: "conflict", error: result.reason }, 409);
    }
    if (result.status === "paused") {
      return jsonResponse({ status: "paused", error: result.reason }, 409);
    }
    if (result.status === "too_large") {
      return jsonResponse({ status: "too_large", error: result.reason }, 413);
    }
    return jsonResponse({ status: "unavailable", error: result.reason }, 503);
  } catch (error) {
    if (error instanceof ManagedInboundRequestError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    console.warn("Managed email inbound request failed", {
      error: error instanceof Error ? error.message : "Unknown managed email error",
    });
    return jsonResponse(
      {
        error: "Managed email delivery is temporarily unavailable",
        code: "internal_unavailable",
      },
      503,
    );
  }
}

export async function sendManagedEmailThroughGateway(
  env: Env,
  input: ManagedEmailGatewaySendInput,
): Promise<ManagedEmailGatewaySendResult> {
  const config = await getManagedEmailGatewayConfig(env);
  const path = `/v1/installs/${encodeURIComponent(config.coreInstallId)}/email/send`;
  const payload = {
    from: {
      address: input.fromAddress,
      name: input.fromName,
    },
    to: input.toAddress,
    subject: input.subject,
    text: input.textBody,
    ...(input.htmlBody ? { html: input.htmlBody } : {}),
    ...(input.replyToAddress ? { replyTo: input.replyToAddress } : {}),
    attachments: input.attachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.mimeType,
      contentBase64: encodeBase64Bytes(attachment.content),
    })),
    ...(input.messageIdHeader || input.inReplyTo || input.referencesHeader
      ? {
          threading: {
            ...(input.messageIdHeader ? { messageId: input.messageIdHeader } : {}),
            ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
            ...(input.referencesHeader ? { references: input.referencesHeader } : {}),
          },
        }
      : {}),
    purpose: input.purpose,
    approval: {
      auditId: input.auditId,
      ownerApproved: Boolean(input.approvedByUserId),
      approvedByMe3OwnerId: input.approvedByUserId ? config.cloudOwnerId : null,
    },
    metadata: input.metadata,
  };
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MANAGED_EMAIL_MAX_REQUEST_BYTES) {
    throw new ManagedEmailGatewayError(
      "Managed email message exceeds the encoded request limit",
      413,
      "request_too_large",
      true,
    );
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, config.origin), {
      method: "POST",
      // Cloudflare Workers accepts only "follow" or "manual". Never follow a
      // redirect with the signed Core token or owner-approved message body.
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        "X-ME3-Core-Install-ID": config.coreInstallId,
        "X-ME3-Core-Update-Token": config.coreUpdateToken,
        "Idempotency-Key": input.auditId,
      },
      body,
    });
  } catch (error) {
    throw new ManagedEmailGatewayError(
      error instanceof Error ? error.message : "Managed email gateway request failed",
      502,
      "gateway_unreachable",
      false,
    );
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ManagedEmailGatewayError(
      "Managed email gateway returned an unexpected redirect",
      502,
      "gateway_redirect",
      true,
      { status: response.status },
    );
  }

  const responseBody = await safeJson(response);
  if (!response.ok) {
    const message =
      isRecord(responseBody) && typeof responseBody.error === "string"
        ? responseBody.error
        : "Managed email gateway rejected the message";
    const code =
      isRecord(responseBody) && typeof responseBody.code === "string"
        ? responseBody.code
        : `gateway_${response.status}`;
    throw new ManagedEmailGatewayError(
      message,
      response.status || 502,
      code,
      response.status >= 400 &&
        response.status < 500 &&
        !AMBIGUOUS_GATEWAY_ERROR_CODES.has(code),
      responseBody,
    );
  }

  const status =
    isRecord(responseBody) && typeof responseBody.status === "string"
      ? responseBody.status
      : "accepted";
  if (status !== "accepted" && status !== "duplicate") {
    throw new ManagedEmailGatewayError(
      "Managed email gateway returned an invalid acceptance response",
      502,
      "invalid_gateway_response",
      false,
      responseBody,
    );
  }
  const providerMessageId = isRecord(responseBody)
    ? typeof responseBody.providerMessageId === "string"
      ? responseBody.providerMessageId
      : typeof responseBody.messageId === "string"
        ? responseBody.messageId
        : null
    : null;
  return {
    providerMessageId,
    providerStatus: status,
    raw: { status, providerMessageId },
  };
}

async function verifyManagedEmailInboundToken(
  env: Env,
  token: string,
  identity: ManagedEmailRuntimeIdentity,
  request: { deliveryId: string; recipient: string; bodySha256: string },
): Promise<Required<Pick<ManagedEmailInboundClaims, "body_sha256">> & ManagedEmailInboundClaims> {
  let claims: ManagedEmailInboundClaims;
  try {
    claims = await verifyMe3CloudJwt<ManagedEmailInboundClaims>(env, token);
  } catch (error) {
    if (
      error instanceof Me3CloudJwtVerificationError &&
      error.kind === "unavailable"
    ) {
      throw new ManagedInboundRequestError(
        "Managed email authentication is temporarily unavailable",
        503,
        "authentication_unavailable",
      );
    }
    throw new ManagedInboundRequestError(
      "Managed email delivery token is invalid",
      401,
      "invalid_token",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.aud !== MANAGED_EMAIL_INBOUND_AUDIENCE ||
    claims.typ !== MANAGED_EMAIL_INBOUND_TOKEN_TYPE ||
    claims.sub !== identity.managedInstallationId ||
    claims.managed_installation_id !== identity.managedInstallationId ||
    claims.core_install_id !== identity.coreInstallId ||
    claims.jti !== request.deliveryId ||
    claims.delivery_id !== request.deliveryId ||
    claims.body_sha256 !== request.bodySha256 ||
    typeof claims.recipient !== "string" ||
    claims.recipient.toLowerCase() !== request.recipient.toLowerCase() ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    claims.exp - claims.iat > MANAGED_EMAIL_MAX_JWT_LIFETIME_SECONDS ||
    claims.exp <= claims.iat ||
    claims.iat > now + 30 ||
    claims.exp > now + MANAGED_EMAIL_MAX_JWT_LIFETIME_SECONDS
  ) {
    throw new ManagedInboundRequestError(
      "Managed email delivery token does not match this request",
      401,
      "token_claim_mismatch",
    );
  }
  return claims as Required<Pick<ManagedEmailInboundClaims, "body_sha256">> &
    ManagedEmailInboundClaims;
}

async function getManagedEmailRuntimeIdentity(
  env: Env,
): Promise<ManagedEmailRuntimeIdentity> {
  const managedInstallationId = normalizedManagedInstallationId(
    env.ME3_MANAGED_INSTALLATION_ID,
  );
  const coreInstallId = normalizeCoreInstallId(
    await getInstallSecret(env, CORE_INSTALL_ID_SECRET),
  );
  if (!managedInstallationId || !coreInstallId) {
    throw new ManagedInboundRequestError(
      "Managed email identity is not configured",
      503,
      "managed_email_not_configured",
    );
  }
  return { managedInstallationId, coreInstallId };
}

async function getManagedEmailGatewayConfig(env: Env): Promise<ManagedEmailGatewayConfig> {
  if (!isManagedEmailDeployment(env)) {
    throw new ManagedEmailGatewayError(
      "ME3 managed email is unavailable on self-hosted installations",
      503,
      "managed_email_unavailable",
      true,
    );
  }
  const origin = managedEmailGatewayOrigin(env);
  const managedInstallationId = normalizedManagedInstallationId(
    env.ME3_MANAGED_INSTALLATION_ID,
  );
  const [coreInstallIdValue, coreUpdateToken, cloudOwnerId] = await Promise.all([
    getInstallSecret(env, CORE_INSTALL_ID_SECRET),
    getInstallSecret(env, CORE_UPDATE_TOKEN_SECRET),
    getInstallSecret(env, CLOUD_OWNER_ID_SECRET),
  ]);
  const coreInstallId = normalizeCoreInstallId(coreInstallIdValue);
  if (
    !origin ||
    !managedInstallationId ||
    !coreInstallId ||
    !coreUpdateToken ||
    !cloudOwnerId
  ) {
    throw new ManagedEmailGatewayError(
      "ME3 managed email gateway is not configured",
      503,
      "managed_email_not_configured",
      true,
    );
  }
  return {
    origin,
    managedInstallationId,
    coreInstallId,
    coreUpdateToken,
    cloudOwnerId,
  };
}

function rawMimeMessage(
  bytes: Uint8Array,
  recipient: string,
): ForwardableEmailMessageLike {
  const rawCopy = bytes.slice();
  return {
    from: "",
    to: recipient,
    headers: new Headers(),
    raw: new Blob([rawCopy.buffer as ArrayBuffer]).stream(),
    rawSize: rawCopy.byteLength,
    canBeForwarded: false,
    setReject() {},
    async forward() {},
  };
}

async function readRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ManagedInboundRequestError(
        "Message is too large for this ME3 mailbox",
        413,
        "too_large",
      );
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim() || "";
  if (!value) {
    throw new ManagedInboundRequestError(
      `${name} header is required`,
      400,
      "missing_header",
    );
  }
  return value;
}

function bearerToken(authorization: string | null): string {
  const header = authorization?.trim() || "";
  if (new TextEncoder().encode(header).byteLength > MANAGED_EMAIL_MAX_AUTHORIZATION_BYTES) {
    throw new ManagedInboundRequestError(
      "Managed email delivery token is too large",
      401,
      "invalid_token",
    );
  }
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match?.[1]) {
    throw new ManagedInboundRequestError(
      "Managed email delivery token is required",
      401,
      "missing_token",
    );
  }
  return match[1];
}

function managedEmailGatewayOrigin(env: Env): string {
  const origin = originFromUrl(env.ME3_MANAGED_EMAIL_GATEWAY_ORIGIN);
  if (!origin) return "";
  const url = new URL(origin);
  if (url.protocol === "https:") return origin;
  const environment = String(env.ENVIRONMENT || "").trim().toLowerCase();
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return environment !== "production" && loopback && url.protocol === "http:" ? origin : "";
}

function normalizedManagedInstallationId(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return MANAGED_INSTALLATION_ID.test(normalized) ? normalized : "";
}

function normalizeCoreInstallId(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return CORE_INSTALL_ID.test(normalized) ? normalized : "";
}

async function getInstallSecret(env: Env, name: string): Promise<string> {
  try {
    const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
      .bind(name)
      .first<{ value: string }>();
    return typeof row?.value === "string" ? row.value.trim() : "";
  } catch {
    return "";
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = bytes.slice();
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
