import {
  getOrCreateInstallEncryptionKey,
  hasInstallEncryptionKey,
} from "./install-secrets";
import type { DbEmailProviderSetting, Env } from "./types";

export const EMAIL_PROVIDER_IDS = ["cloudflare-email", "postmark"] as const;
export type EmailProviderId = (typeof EMAIL_PROVIDER_IDS)[number];
export type EmailSendPurpose = "test" | "draft" | "reply" | "workflow";

type EmailProviderSource = "binding" | "stored" | "manual" | "not_configured";
type EmailProviderStatus = "not_configured" | "ready" | "failed";

type EmailProviderConfig = {
  transport: "binding" | "rest";
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  sendingDomain: string;
  accountId: string;
  messageStream: string;
};

export type EmailProviderSettingsRecord = {
  id: EmailProviderId;
  label: string;
  description: string;
  recommended: boolean;
  stable: boolean;
  configured: boolean;
  setupRequired: boolean;
  statusLabel: string;
  source: EmailProviderSource;
  secretLabel: string | null;
  keyHint: string | null;
  keyUpdatedAt: string | null;
  lastStatus: EmailProviderStatus;
  lastStatusCheckedAt: string | null;
  lastTestSentAt: string | null;
  lastTestError: string | null;
  setupRequirements: Array<{
    id: string;
    label: string;
    required: boolean;
    configured: boolean;
    note?: string;
  }>;
  config: EmailProviderConfig;
};

export type FutureEmailProviderRecord = {
  id: "mailgun" | "smtp" | "ses" | "resend" | "sendgrid";
  label: string;
  description: string;
};

export type EmailProviderSettingsResponse = {
  encryptionConfigured: boolean;
  activeProviderId: EmailProviderId;
  providers: EmailProviderSettingsRecord[];
  futureProviders: FutureEmailProviderRecord[];
};

export type EmailProviderSendRequest = {
  providerId?: EmailProviderId | null;
  purpose: EmailSendPurpose;
  mailboxId?: string | null;
  mailboxMessageId?: string | null;
  fromAddress?: string | null;
  fromName?: string | null;
  replyToAddress?: string | null;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  threadKey?: string | null;
  messageIdHeader?: string | null;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
  approvedByUserId?: string | null;
};

export type EmailProviderSendResponse = {
  auditId: string;
  providerId: EmailProviderId;
  providerLabel: string;
  providerMessageId: string | null;
  providerStatus: string | null;
  sentAt: string;
};

type EmailProviderUpdate = {
  id?: unknown;
  transport?: unknown;
  fromAddress?: unknown;
  fromName?: unknown;
  replyToAddress?: unknown;
  sendingDomain?: unknown;
  accountId?: unknown;
  messageStream?: unknown;
  apiToken?: unknown;
  serverToken?: unknown;
  clearSecret?: unknown;
};

type EmailProviderSendMessage = {
  auditId: string;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  metadata: Record<string, string>;
};

type EmailProviderSendResult = {
  providerMessageId: string | null;
  providerStatus: string | null;
  raw: unknown;
};

type ResolvedEmailProvider = {
  adapter: EmailProviderAdapter;
  providerId: EmailProviderId;
  row: DbEmailProviderSetting | null;
  config: EmailProviderConfig;
  source: EmailProviderSource;
  secret: string | null;
};

type EmailProviderAdapter = {
  id: EmailProviderId;
  label: string;
  description: string;
  recommended: boolean;
  stable: boolean;
  secretLabel: string | null;
  defaultConfig: EmailProviderConfig;
  isConfigured(
    row: DbEmailProviderSetting | null,
    config: EmailProviderConfig,
    env: Env,
  ): boolean;
  source(
    row: DbEmailProviderSetting | null,
    config: EmailProviderConfig,
    env: Env,
  ): EmailProviderSource;
  setupRequirements(
    row: DbEmailProviderSetting | null,
    config: EmailProviderConfig,
    env: Env,
  ): EmailProviderSettingsRecord["setupRequirements"];
  send(
    env: Env,
    config: EmailProviderConfig,
    secret: string | null,
    message: EmailProviderSendMessage,
  ): Promise<EmailProviderSendResult>;
};

const CLOUDFLARE_EMAIL_PROVIDER: EmailProviderAdapter = {
  id: "cloudflare-email",
  label: "Cloudflare Email Service",
  description:
    "Recommended Workers-native sender using an Email Service binding first, with REST API credentials as a fallback.",
  recommended: true,
  stable: false,
  secretLabel: "Cloudflare API token",
  defaultConfig: createDefaultConfig("binding", ""),
  isConfigured(row, config, env) {
    const hasRestCredentials = Boolean(row?.encrypted_secret && config.accountId);
    return Boolean(
      config.fromAddress &&
        (config.transport === "rest"
          ? hasRestCredentials
          : env.EMAIL || hasRestCredentials),
    );
  },
  source(row, config, env) {
    if (config.transport !== "rest" && env.EMAIL) return "binding";
    if (row?.encrypted_secret && config.accountId) return "stored";
    if (config.fromAddress || config.sendingDomain) return "manual";
    return "not_configured";
  },
  setupRequirements(row, config, env) {
    const hasBinding = Boolean(env.EMAIL);
    const hasRestCredentials = Boolean(row?.encrypted_secret && config.accountId);
    const hasTransport =
      config.transport === "rest" ? hasRestCredentials : hasBinding || hasRestCredentials;
    return [
      {
        id: "workers-paid",
        label: "Workers Paid plan",
        required: true,
        configured: hasTransport,
        note: "Cloudflare outbound Email Service requires Workers Paid.",
      },
      {
        id: "cloudflare-dns",
        label: "Domain on Cloudflare DNS",
        required: true,
        configured: Boolean(config.sendingDomain || domainFromEmail(config.fromAddress)),
        note: "Cloudflare Email Service sender domains must use Cloudflare DNS.",
      },
      {
        id: "verified-sender",
        label: "Sending address or domain verified",
        required: true,
        configured: Boolean(config.fromAddress),
        note: "Verify SPF, DKIM, and sending records in Cloudflare Email Service.",
      },
      {
        id: "binding-or-api",
        label: "Email Service binding or REST API configured",
        required: true,
        configured: hasTransport,
        note: "Use a send_email binding named EMAIL, or store a Cloudflare account ID and API token.",
      },
    ];
  },
  async send(env, config, secret, message) {
    if (config.transport !== "rest" && env.EMAIL) {
      const result = await env.EMAIL.send({
        from: message.fromName
          ? { email: message.fromAddress, name: message.fromName }
          : message.fromAddress,
        to: message.toAddress,
        replyTo: message.replyToAddress || undefined,
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody || undefined,
        headers: {
          "X-ME3-Audit-ID": message.auditId,
          "X-ME3-Provider": "cloudflare-email",
          ...(message.messageIdHeader ? { "Message-ID": message.messageIdHeader } : {}),
          ...(message.inReplyTo ? { "In-Reply-To": message.inReplyTo } : {}),
          ...(message.referencesHeader ? { References: message.referencesHeader } : {}),
        },
      });
      return {
        providerMessageId: result.messageId || null,
        providerStatus: "sent",
        raw: { messageId: result.messageId || null },
      };
    }
    if (!config.accountId || !secret) {
      throw new EmailProviderInputError(
        "Cloudflare Email Service needs an EMAIL binding or REST API account ID and token.",
        503,
      );
    }
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
        config.accountId,
      )}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: message.toAddress,
          from: message.fromName
            ? { address: message.fromAddress, name: message.fromName }
            : message.fromAddress,
          reply_to: message.replyToAddress || undefined,
          subject: message.subject,
          text: message.textBody,
          html: message.htmlBody || undefined,
          headers: {
            "X-ME3-Audit-ID": message.auditId,
            "X-ME3-Provider": "cloudflare-email",
            ...(message.messageIdHeader ? { "Message-ID": message.messageIdHeader } : {}),
            ...(message.inReplyTo ? { "In-Reply-To": message.inReplyTo } : {}),
            ...(message.referencesHeader ? { References: message.referencesHeader } : {}),
          },
        }),
      },
    );
    const body = await safeJson(response);
    if (!response.ok || !isCloudflareSuccess(body)) {
      throw new EmailProviderSendError(
        cloudflareErrorMessage(body, response.statusText),
        response.status || 500,
        cloudflareErrorCode(body),
        body,
      );
    }
    return { providerMessageId: null, providerStatus: "accepted", raw: body };
  },
};

const POSTMARK_PROVIDER: EmailProviderAdapter = {
  id: "postmark",
  label: "Postmark",
  description:
    "Stable external sender using a Postmark Server API token and a confirmed sender signature or verified domain.",
  recommended: false,
  stable: true,
  secretLabel: "Server API token",
  defaultConfig: createDefaultConfig("rest", "outbound"),
  isConfigured(row, config) {
    return Boolean(row?.encrypted_secret && config.fromAddress);
  },
  source(row, config) {
    if (row?.encrypted_secret) return "stored";
    if (config.fromAddress || config.messageStream !== "outbound") return "manual";
    return "not_configured";
  },
  setupRequirements(row, config) {
    return [
      {
        id: "server-token",
        label: "Postmark Server API token",
        required: true,
        configured: Boolean(row?.encrypted_secret),
        note: "Owner-supplied tokens are encrypted in Core and never returned to the browser.",
      },
      {
        id: "sender-signature",
        label: "Confirmed sender signature or verified domain",
        required: true,
        configured: Boolean(config.fromAddress),
        note: "Postmark rejects mail from unconfirmed senders.",
      },
      {
        id: "message-stream",
        label: "Transactional message stream",
        required: true,
        configured: Boolean(config.messageStream),
        note: "Defaults to Postmark's outbound transactional stream.",
      },
    ];
  },
  async send(_env, config, secret, message) {
    if (!secret) {
      throw new EmailProviderInputError("Postmark Server API token is required.", 503);
    }
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": secret,
      },
      body: JSON.stringify({
        From: formatAddress(message.fromAddress, message.fromName),
        To: message.toAddress,
        Subject: message.subject,
        TextBody: message.textBody,
        HtmlBody: message.htmlBody || undefined,
        ReplyTo: message.replyToAddress || undefined,
        MessageStream: config.messageStream || "outbound",
        Metadata: message.metadata,
        Headers: [
          { Name: "X-ME3-Audit-ID", Value: message.auditId },
          { Name: "X-ME3-Provider", Value: "postmark" },
          ...(message.messageIdHeader
            ? [{ Name: "Message-ID", Value: message.messageIdHeader }]
            : []),
          ...(message.inReplyTo ? [{ Name: "In-Reply-To", Value: message.inReplyTo }] : []),
          ...(message.referencesHeader
            ? [{ Name: "References", Value: message.referencesHeader }]
            : []),
        ],
      }),
    });
    const body = await safeJson(response);
    if (!response.ok || !isPostmarkSuccess(body)) {
      throw new EmailProviderSendError(
        postmarkErrorMessage(body, response.statusText),
        response.status || 500,
        postmarkErrorCode(body),
        body,
      );
    }
    return {
      providerMessageId:
        isRecord(body) && typeof body.MessageID === "string" ? body.MessageID : null,
      providerStatus:
        isRecord(body) && typeof body.Message === "string" ? body.Message : "OK",
      raw: body,
    };
  },
};

const EMAIL_PROVIDER_ADAPTERS = [CLOUDFLARE_EMAIL_PROVIDER, POSTMARK_PROVIDER] as const;
const PROVIDER_ALIASES: Record<string, EmailProviderId> = {
  cloudflare: "cloudflare-email",
  "cloudflare-email": "cloudflare-email",
  "cloudflare-email-service": "cloudflare-email",
  "email-service": "cloudflare-email",
  postmark: "postmark",
};

const FUTURE_EMAIL_PROVIDERS: readonly FutureEmailProviderRecord[] = [
  { id: "mailgun", label: "Mailgun", description: "Future domain-based sender." },
  { id: "smtp", label: "SMTP", description: "Future generic SMTP sender." },
  { id: "ses", label: "Amazon SES", description: "Future AWS sender." },
  { id: "resend", label: "Resend", description: "Future API sender." },
  { id: "sendgrid", label: "SendGrid", description: "Future transactional sender." },
];

export class EmailProviderInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "EmailProviderInputError";
  }
}

class EmailProviderSendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = "EmailProviderSendError";
  }
}

export async function getEmailProviderSettings(
  env: Env,
  ownerId: string,
): Promise<EmailProviderSettingsResponse> {
  const settings = await listEmailProviderRows(env, ownerId);
  const activeProviderId =
    getActiveProviderId(settings) ||
    normalizeEmailProviderId(env.ME3_EMAIL_DEFAULT_PROVIDER) ||
    "cloudflare-email";

  return {
    encryptionConfigured: await hasInstallEncryptionKey(env),
    activeProviderId,
    providers: EMAIL_PROVIDER_ADAPTERS.map((adapter) =>
      serializeProvider(adapter, settings.get(adapter.id) || null, env),
    ),
    futureProviders: [...FUTURE_EMAIL_PROVIDERS],
  };
}

export async function updateEmailProviderSettings(
  env: Env,
  ownerId: string,
  input: unknown,
): Promise<EmailProviderSettingsResponse> {
  if (!isRecord(input)) {
    throw new EmailProviderInputError("Email provider settings payload is required");
  }
  const existing = await listEmailProviderRows(env, ownerId);
  const activeProviderId =
    normalizeEmailProviderId(input.activeProviderId) ||
    getActiveProviderId(existing) ||
    "cloudflare-email";
  let changed = false;

  if (input.providers !== undefined) {
    if (!Array.isArray(input.providers)) {
      throw new EmailProviderInputError("providers must be an array");
    }
    for (const update of input.providers) {
      await applyProviderUpdate(
        env,
        ownerId,
        update as EmailProviderUpdate,
        existing,
        activeProviderId,
      );
      changed = true;
    }
  }
  if (input.activeProviderId !== undefined || changed) {
    await setActiveProvider(env, ownerId, activeProviderId, existing);
    changed = true;
  }
  if (!changed) {
    throw new EmailProviderInputError("providers or activeProviderId is required");
  }
  return getEmailProviderSettings(env, ownerId);
}

export async function sendEmailProviderTest(
  env: Env,
  ownerId: string,
  ownerEmail: string | null | undefined,
  input: unknown,
): Promise<EmailProviderSendResponse & { ok: true; sentTo: string }> {
  const body = isRecord(input) ? input : {};
  const toAddress =
    typeof body.to === "string" && body.to.trim()
      ? body.to.trim().toLowerCase()
      : ownerEmail?.trim().toLowerCase() || "";
  if (!isValidEmail(toAddress)) {
    throw new EmailProviderInputError("Enter a valid test recipient email address");
  }

  const providerId = normalizeEmailProviderId(body.providerId) || null;
  try {
    const result = await sendEmailWithProvider(env, ownerId, {
      providerId,
      purpose: "test",
      toAddress,
      subject: "ME3 Core test email",
      textBody: "This is a test email from your ME3 Core outbound sender settings.",
      htmlBody: "<p>This is a test email from your ME3 Core outbound sender settings.</p>",
      metadata: { test: true },
    });
    await updateProviderTestStatus(env, ownerId, result.providerId, "ready", result.sentAt, null);
    return { ok: true, sentTo: toAddress, ...result };
  } catch (error) {
    const sendError = normalizeSendError(error);
    if (providerId) {
      await updateProviderTestStatus(
        env,
        ownerId,
        providerId,
        "failed",
        null,
        sendError.message,
      );
    }
    throw new EmailProviderInputError(sendError.message, sendError.status);
  }
}

export async function sendEmailWithProvider(
  env: Env,
  ownerId: string,
  input: EmailProviderSendRequest,
): Promise<EmailProviderSendResponse> {
  const resolved = await resolveReadyProvider(env, ownerId, input.providerId || null);
  const fromAddress = (input.fromAddress || resolved.config.fromAddress).trim().toLowerCase();
  const fromName = (input.fromName || resolved.config.fromName || "ME3 Core").trim();
  const replyToAddress = (input.replyToAddress || resolved.config.replyToAddress || "")
    .trim()
    .toLowerCase();
  const toAddress = input.toAddress.trim().toLowerCase();
  const subject = input.subject.trim() || "(no subject)";
  const auditId = crypto.randomUUID();
  const requestedAt = new Date().toISOString();

  if (!isValidEmail(fromAddress)) {
    throw new EmailProviderInputError("Configured sender email address is invalid", 503);
  }
  if (!isValidEmail(toAddress)) {
    throw new EmailProviderInputError("Enter a valid recipient email address");
  }
  if (replyToAddress && !isValidEmail(replyToAddress)) {
    throw new EmailProviderInputError("Configured reply-to email address is invalid", 503);
  }

  const message: EmailProviderSendMessage = {
    auditId,
    fromAddress,
    fromName,
    replyToAddress,
    toAddress,
    subject,
    textBody: input.textBody,
    htmlBody: input.htmlBody || null,
    messageIdHeader: input.messageIdHeader || null,
    inReplyTo: input.inReplyTo || null,
    referencesHeader: input.referencesHeader || null,
    metadata: stringifyMetadata({
      me3_audit_id: auditId,
      me3_purpose: input.purpose,
      ...(input.metadata || {}),
    }),
  };

  try {
    const result = await resolved.adapter.send(
      env,
      resolved.config,
      resolved.secret,
      message,
    );
    const sentAt = new Date().toISOString();
    await insertEmailSendAudit(env, {
      auditId,
      ownerId,
      mailboxId: input.mailboxId || null,
      mailboxMessageId: input.mailboxMessageId || null,
      providerId: resolved.providerId,
      providerMessageId: result.providerMessageId,
      providerStatus: result.providerStatus,
      status: "sent",
      purpose: input.purpose,
      fromAddress,
      toAddress,
      subject,
      threadKey: input.threadKey || null,
      messageIdHeader: input.messageIdHeader || null,
      inReplyTo: input.inReplyTo || null,
      referencesHeader: input.referencesHeader || null,
      metadata: { raw: result.raw, source: resolved.source, ...(input.metadata || {}) },
      errorMessage: null,
      createdBy: input.createdBy || "owner",
      approvedByUserId: input.approvedByUserId || null,
      requestedAt,
      sentAt,
    });
    return {
      auditId,
      providerId: resolved.providerId,
      providerLabel: resolved.adapter.label,
      providerMessageId: result.providerMessageId,
      providerStatus: result.providerStatus,
      sentAt,
    };
  } catch (error) {
    const sendError = normalizeSendError(error);
    await insertEmailSendAudit(env, {
      auditId,
      ownerId,
      mailboxId: input.mailboxId || null,
      mailboxMessageId: input.mailboxMessageId || null,
      providerId: resolved.providerId,
      providerMessageId: null,
      providerStatus: sendError.code,
      status: "failed",
      purpose: input.purpose,
      fromAddress,
      toAddress,
      subject,
      threadKey: input.threadKey || null,
      messageIdHeader: input.messageIdHeader || null,
      inReplyTo: input.inReplyTo || null,
      referencesHeader: input.referencesHeader || null,
      metadata: { raw: sendError.raw, source: resolved.source, ...(input.metadata || {}) },
      errorMessage: sendError.message,
      createdBy: input.createdBy || "owner",
      approvedByUserId: input.approvedByUserId || null,
      requestedAt,
      sentAt: null,
    });
    throw new EmailProviderInputError(sendError.message, sendError.status);
  }
}

async function applyProviderUpdate(
  env: Env,
  ownerId: string,
  update: EmailProviderUpdate,
  existing: Map<EmailProviderId, DbEmailProviderSetting>,
  activeProviderId: EmailProviderId,
) {
  if (!isRecord(update)) throw new EmailProviderInputError("provider updates must be objects");
  const providerId = normalizeEmailProviderId(update.id);
  if (!providerId) throw new EmailProviderInputError("Unknown email provider");
  const adapter = getProviderAdapter(providerId);
  const current = existing.get(providerId) || null;
  const config = normalizeProviderConfigUpdate(
    normalizeProviderConfig(current, adapter),
    update,
    providerId,
  );
  const now = new Date().toISOString();
  const secretInput = normalizeSecretInput(update);
  let encryptedSecret = current?.encrypted_secret || null;
  let secretHint = current?.secret_hint || null;
  let secretUpdatedAt = current?.secret_updated_at || null;

  if (update.clearSecret === true || secretInput === null) {
    encryptedSecret = null;
    secretHint = null;
    secretUpdatedAt = null;
  } else if (secretInput) {
    encryptedSecret = await encryptProviderSecret(
      secretInput,
      await getOrCreateInstallEncryptionKey(env),
    );
    secretHint = getSecretHint(secretInput);
    secretUpdatedAt = now;
  }

  await upsertEmailProviderRow(env, {
    userId: ownerId,
    providerId,
    isActive: providerId === activeProviderId,
    encryptedSecret,
    secretHint,
    secretUpdatedAt,
    config,
    now,
  });
  existing.set(providerId, {
    user_id: ownerId,
    provider_id: providerId,
    is_active: providerId === activeProviderId ? 1 : 0,
    encrypted_secret: encryptedSecret,
    secret_hint: secretHint,
    secret_updated_at: secretUpdatedAt,
    config_json: JSON.stringify(config),
    last_status: current?.last_status || null,
    last_status_checked_at: current?.last_status_checked_at || null,
    last_test_sent_at: current?.last_test_sent_at || null,
    last_test_error: current?.last_test_error || null,
    created_at: current?.created_at || now,
    updated_at: now,
  });
}

async function setActiveProvider(
  env: Env,
  ownerId: string,
  providerId: EmailProviderId,
  existing: Map<EmailProviderId, DbEmailProviderSetting>,
) {
  await env.DB.prepare("UPDATE email_provider_settings SET is_active = 0 WHERE user_id = ?")
    .bind(ownerId)
    .run();
  if (existing.has(providerId)) {
    await env.DB.prepare(
      `UPDATE email_provider_settings
       SET is_active = 1, updated_at = ?
       WHERE user_id = ? AND provider_id = ?`,
    )
      .bind(new Date().toISOString(), ownerId, providerId)
      .run();
    return;
  }
  const adapter = getProviderAdapter(providerId);
  const now = new Date().toISOString();
  await upsertEmailProviderRow(env, {
    userId: ownerId,
    providerId,
    isActive: true,
    encryptedSecret: null,
    secretHint: null,
    secretUpdatedAt: null,
    config: normalizeProviderConfig(null, adapter),
    now,
  });
}

async function resolveReadyProvider(
  env: Env,
  ownerId: string,
  requestedProviderId: EmailProviderId | null,
): Promise<ResolvedEmailProvider> {
  const settings = await listEmailProviderRows(env, ownerId);
  const providerId =
    requestedProviderId ||
    getActiveProviderId(settings) ||
    normalizeEmailProviderId(env.ME3_EMAIL_DEFAULT_PROVIDER) ||
    "cloudflare-email";
  const adapter = getProviderAdapter(providerId);
  const row = settings.get(providerId) || null;
  const config = normalizeProviderConfig(row, adapter);
  if (!adapter.isConfigured(row, config, env)) {
    throw new EmailProviderInputError(`${adapter.label} is not ready to send yet`, 503);
  }
  const secret = row?.encrypted_secret
    ? await decryptProviderSecret(
        row.encrypted_secret,
        await getOrCreateInstallEncryptionKey(env),
      )
    : null;
  return {
    adapter,
    providerId,
    row,
    config,
    source: adapter.source(row, config, env),
    secret,
  };
}

async function listEmailProviderRows(
  env: Env,
  ownerId: string,
): Promise<Map<EmailProviderId, DbEmailProviderSetting>> {
  try {
    const rows = await env.DB.prepare(
      `SELECT user_id, provider_id, is_active, encrypted_secret, secret_hint,
              secret_updated_at, config_json, last_status, last_status_checked_at,
              last_test_sent_at, last_test_error, created_at, updated_at
       FROM email_provider_settings
       WHERE user_id = ?`,
    )
      .bind(ownerId)
      .all<DbEmailProviderSetting>();
    return new Map(
      (rows.results || [])
        .map((row) => [normalizeEmailProviderId(row.provider_id), row] as const)
        .filter((entry): entry is readonly [EmailProviderId, DbEmailProviderSetting] =>
          Boolean(entry[0]),
        ),
    );
  } catch (error) {
    if (isMissingEmailProviderTableError(error)) return new Map();
    throw error;
  }
}

async function upsertEmailProviderRow(
  env: Env,
  row: {
    userId: string;
    providerId: EmailProviderId;
    isActive: boolean;
    encryptedSecret: string | null;
    secretHint: string | null;
    secretUpdatedAt: string | null;
    config: EmailProviderConfig;
    now: string;
  },
) {
  await env.DB.prepare(
    `INSERT INTO email_provider_settings (
       user_id, provider_id, is_active, encrypted_secret, secret_hint,
       secret_updated_at, config_json, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider_id) DO UPDATE SET
       is_active = excluded.is_active,
       encrypted_secret = excluded.encrypted_secret,
       secret_hint = excluded.secret_hint,
       secret_updated_at = excluded.secret_updated_at,
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      row.userId,
      row.providerId,
      row.isActive ? 1 : 0,
      row.encryptedSecret,
      row.secretHint,
      row.secretUpdatedAt,
      JSON.stringify(row.config),
      row.now,
      row.now,
    )
    .run();
}

async function insertEmailSendAudit(
  env: Env,
  input: {
    auditId: string;
    ownerId: string;
    mailboxId: string | null;
    mailboxMessageId: string | null;
    providerId: EmailProviderId;
    providerMessageId: string | null;
    providerStatus: string | null;
    status: "sent" | "failed";
    purpose: EmailSendPurpose;
    fromAddress: string;
    toAddress: string;
    subject: string;
    threadKey: string | null;
    messageIdHeader: string | null;
    inReplyTo: string | null;
    referencesHeader: string | null;
    metadata: Record<string, unknown>;
    errorMessage: string | null;
    createdBy: string;
    approvedByUserId: string | null;
    requestedAt: string;
    sentAt: string | null;
  },
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO email_send_audit (
       id, user_id, mailbox_id, mailbox_message_id, provider_id,
       provider_message_id, provider_status, status, purpose, from_address,
       to_address, subject, thread_key, message_id_header, in_reply_to,
       references_header, metadata_json, error_message, created_by,
       approved_by_user_id, requested_at, sent_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.auditId,
      input.ownerId,
      input.mailboxId,
      input.mailboxMessageId,
      input.providerId,
      input.providerMessageId,
      input.providerStatus,
      input.status,
      input.purpose,
      input.fromAddress,
      input.toAddress,
      input.subject,
      input.threadKey,
      input.messageIdHeader,
      input.inReplyTo,
      input.referencesHeader,
      JSON.stringify(input.metadata),
      input.errorMessage,
      input.createdBy,
      input.approvedByUserId,
      input.requestedAt,
      input.sentAt,
      now,
      now,
    )
    .run();
}

async function updateProviderTestStatus(
  env: Env,
  ownerId: string,
  providerId: EmailProviderId,
  status: "ready" | "failed",
  sentAt: string | null,
  error: string | null,
) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE email_provider_settings
     SET last_status = ?,
         last_status_checked_at = ?,
         last_test_sent_at = COALESCE(?, last_test_sent_at),
         last_test_error = ?,
         updated_at = ?
     WHERE user_id = ? AND provider_id = ?`,
  )
    .bind(status, now, sentAt, error, now, ownerId, providerId)
    .run();
}

function serializeProvider(
  adapter: EmailProviderAdapter,
  row: DbEmailProviderSetting | null,
  env: Env,
): EmailProviderSettingsRecord {
  const config = normalizeProviderConfig(row, adapter);
  const configured = adapter.isConfigured(row, config, env);
  const lastStatus = row?.last_status || (configured ? "ready" : "not_configured");
  return {
    id: adapter.id,
    label: adapter.label,
    description: adapter.description,
    recommended: adapter.recommended,
    stable: adapter.stable,
    configured,
    setupRequired: !configured,
    statusLabel: configured
      ? lastStatus === "failed"
        ? "Test failed"
        : "Ready"
      : "Setup required",
    source: adapter.source(row, config, env),
    secretLabel: adapter.secretLabel,
    keyHint: row?.secret_hint || null,
    keyUpdatedAt: row?.secret_updated_at || null,
    lastStatus,
    lastStatusCheckedAt: row?.last_status_checked_at || null,
    lastTestSentAt: row?.last_test_sent_at || null,
    lastTestError: row?.last_test_error || null,
    setupRequirements: adapter.setupRequirements(row, config, env),
    config,
  };
}

function normalizeProviderConfig(
  row: DbEmailProviderSetting | null,
  adapter: EmailProviderAdapter,
): EmailProviderConfig {
  let config = { ...adapter.defaultConfig };
  if (row?.config_json) {
    try {
      const parsed = JSON.parse(row.config_json) as unknown;
      if (isRecord(parsed)) config = normalizeProviderConfigUpdate(config, parsed, adapter.id);
    } catch {
      config = { ...adapter.defaultConfig };
    }
  }
  if (adapter.id === "postmark" && !config.messageStream) config.messageStream = "outbound";
  if (adapter.id === "cloudflare-email") config.messageStream = "";
  if (!config.sendingDomain && config.fromAddress) {
    config.sendingDomain = domainFromEmail(config.fromAddress);
  }
  return config;
}

function normalizeProviderConfigUpdate(
  current: EmailProviderConfig,
  input: Record<string, unknown>,
  providerId: EmailProviderId | null,
): EmailProviderConfig {
  const next: EmailProviderConfig = { ...current };
  if (typeof input.transport === "string") {
    next.transport = input.transport === "rest" ? "rest" : "binding";
  }
  if (typeof input.fromAddress === "string") {
    next.fromAddress = input.fromAddress.trim().toLowerCase();
  }
  if (typeof input.fromName === "string") next.fromName = input.fromName.trim().slice(0, 120);
  if (typeof input.replyToAddress === "string") {
    next.replyToAddress = input.replyToAddress.trim().toLowerCase();
  }
  if (typeof input.sendingDomain === "string") {
    next.sendingDomain = normalizeDomain(input.sendingDomain);
  }
  if (typeof input.accountId === "string") next.accountId = input.accountId.trim();
  if (typeof input.messageStream === "string") {
    next.messageStream = input.messageStream.trim().slice(0, 80);
  }
  if (!next.fromName) next.fromName = "ME3 Core";
  if (providerId === "postmark" && !next.messageStream) next.messageStream = "outbound";
  if (providerId === "cloudflare-email") next.messageStream = "";
  if (!next.sendingDomain && next.fromAddress) next.sendingDomain = domainFromEmail(next.fromAddress);
  if (next.fromAddress && !isValidEmail(next.fromAddress)) {
    throw new EmailProviderInputError("Enter a valid sender email address");
  }
  if (next.replyToAddress && !isValidEmail(next.replyToAddress)) {
    throw new EmailProviderInputError("Enter a valid reply-to email address");
  }
  return next;
}

function createDefaultConfig(
  transport: EmailProviderConfig["transport"],
  messageStream: string,
): EmailProviderConfig {
  return {
    transport,
    fromAddress: "",
    fromName: "ME3 Core",
    replyToAddress: "",
    sendingDomain: "",
    accountId: "",
    messageStream,
  };
}

function normalizeSecretInput(update: EmailProviderUpdate): string | null | undefined {
  const raw = update.apiToken ?? update.serverToken;
  if (raw === null) return null;
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw !== "string") {
    throw new EmailProviderInputError("Provider token must be a string");
  }
  const secret = raw.trim();
  return secret || undefined;
}

function normalizeEmailProviderId(value: unknown): EmailProviderId | null {
  if (typeof value !== "string") return null;
  return PROVIDER_ALIASES[value.trim().toLowerCase()] || null;
}

function getProviderAdapter(providerId: EmailProviderId): EmailProviderAdapter {
  const adapter = EMAIL_PROVIDER_ADAPTERS.find((candidate) => candidate.id === providerId);
  if (!adapter) throw new EmailProviderInputError("Unknown email provider");
  return adapter;
}

function getActiveProviderId(
  settings: Map<EmailProviderId, DbEmailProviderSetting>,
): EmailProviderId | null {
  for (const [providerId, row] of settings) {
    if (row.is_active) return providerId;
  }
  return null;
}

function formatAddress(email: string, name: string): string {
  return name ? `${quoteAddressName(name)} <${email}>` : email;
}

function quoteAddressName(name: string): string {
  if (/^[a-z0-9 ._-]+$/i.test(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

function domainFromEmail(email: string): string {
  const atIndex = email.lastIndexOf("@");
  return atIndex >= 0 ? email.slice(atIndex + 1).toLowerCase() : "";
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function stringifyMetadata(metadata: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
}

function getSecretHint(secret: string): string {
  return `***${secret.slice(-4)}`;
}

async function encryptProviderSecret(secret: string, installKey: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await importSecretCryptoKey(installKey, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret),
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}

async function decryptProviderSecret(encrypted: string, installKey: string): Promise<string> {
  const [version, ivBase64, ciphertextBase64] = encrypted.split(".");
  if (version !== "v1" || !ivBase64 || !ciphertextBase64) {
    throw new EmailProviderInputError("Stored email provider token is invalid", 500);
  }
  const key = await importSecretCryptoKey(installKey, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivBase64) },
    key,
    decodeBase64Url(ciphertextBase64),
  );
  return new TextDecoder().decode(plaintext);
}

async function importSecretCryptoKey(
  installKey: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(installKey),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
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

function isCloudflareSuccess(body: unknown): boolean {
  return isRecord(body) && body.success === true;
}

function cloudflareErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && Array.isArray(body.errors) && body.errors.length > 0) {
    const first = body.errors[0];
    if (isRecord(first) && typeof first.message === "string") return first.message;
  }
  return fallback || "Cloudflare Email Service send failed";
}

function cloudflareErrorCode(body: unknown): string | null {
  if (isRecord(body) && Array.isArray(body.errors) && body.errors.length > 0) {
    const first = body.errors[0];
    if (isRecord(first) && typeof first.code === "number") return String(first.code);
    if (isRecord(first) && typeof first.message === "string") return first.message;
  }
  return null;
}

function isPostmarkSuccess(body: unknown): boolean {
  return isRecord(body) && body.ErrorCode === 0;
}

function postmarkErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.Message === "string") return body.Message;
  return fallback || "Postmark send failed";
}

function postmarkErrorCode(body: unknown): string | null {
  if (isRecord(body) && typeof body.ErrorCode === "number") return String(body.ErrorCode);
  return null;
}

function normalizeSendError(error: unknown): {
  message: string;
  status: number;
  code: string | null;
  raw: unknown;
} {
  if (error instanceof EmailProviderSendError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
      raw: error.raw,
    };
  }
  if (error instanceof EmailProviderInputError) {
    return { message: error.message, status: error.status, code: null, raw: null };
  }
  return {
    message: error instanceof Error ? error.message : "Email provider send failed",
    status: 500,
    code: null,
    raw: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMissingEmailProviderTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("email_provider_settings") &&
    /no such table|does not exist/i.test(message)
  );
}
