import {
  activateAgentMailbox,
  createAgentMailboxDraft,
  getAgentMailboxDraftForApproval,
  getAgentMailboxMessage,
  getAgentMailboxOutboundHeaders,
  getAgentMailboxOverview,
  listAgentMailboxMessages,
  markAgentMailboxDraftFailed,
  markAgentMailboxDraftSent,
  moveAgentMailboxMessage,
  pauseAgentMailbox,
  rejectAgentMailboxDraft,
  setAgentMailboxMessageReadState,
  trashAgentMailboxMessage,
  updateAgentMailboxDraft,
  upsertAgentMailbox,
  type AgentMailboxDraftInput,
  type AgentMailboxMessage,
  type AgentMailboxUpdateInput,
} from "../agent-chat";
import {
  EmailProviderInputError,
  sendEmailWithProvider,
  type EmailProviderAttachment,
} from "../email-providers";
import type { AppContext, AppHono } from "../http/types";
import { getOwnerProfile, normalizeEmail } from "../sites";
import type { DbMailboxAlias, Env } from "../types";
import {
  decodeMimeHeaderValue,
  parseEmailAddressHeader,
} from "../../../../shared/email-headers";

const INBOUND_EMAIL_PROVIDER_ID = "cloudflare-email-routing";
const MAX_INBOUND_EMAIL_BYTES = 1024 * 1024;
const MAX_MAILBOX_ATTACHMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_MAILBOX_ATTACHMENT_UPLOAD_COUNT = 10;

type MailboxRouteDeps = {
  requireOwner(c: AppContext): Promise<string | null>;
  unauthorized(c: AppContext): Response;
};

export type ForwardableEmailMessageLike = {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  readonly canBeForwarded: boolean;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
};

export function registerMailboxRoutes(app: AppHono, deps: MailboxRouteDeps) {
  const { requireOwner, unauthorized } = deps;

  app.get("/api/mailbox", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const owner = await getOwnerProfile(c.env, ownerId);
    return c.json(await getAgentMailboxOverview(c.env, ownerId, owner || undefined));
  });

  app.put("/api/mailbox", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const body = await c.req.json<AgentMailboxUpdateInput>().catch((): AgentMailboxUpdateInput => ({}));
    const owner = await getOwnerProfile(c.env, ownerId);
    const result = await upsertAgentMailbox(c.env, ownerId, body, owner || undefined);
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.post("/api/mailbox/activate", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const result = await activateAgentMailbox(c.env, ownerId);
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.post("/api/mailbox/pause", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const result = await pauseAgentMailbox(c.env, ownerId);
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.get("/api/mailbox/messages", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    return c.json(await listAgentMailboxMessages(c.env, ownerId, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      status: c.req.query("status") || "",
      createdBy: c.req.query("created_by") || "",
      direction: c.req.query("direction") || "outbound",
      folder: c.req.query("folder") || "",
      query: c.req.query("q") || "",
      unread: c.req.query("unread") || "",
    }));
  });

  app.get("/api/mailbox/messages/:messageId", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const result = await getAgentMailboxMessage(c.env, ownerId, c.req.param("messageId"));
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.get("/api/mailbox/messages/:messageId/attachments/:attachmentIndex", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    if (!c.env.SITE_ASSETS) {
      return c.json({ error: "Mailbox attachment storage is not configured" }, 503);
    }

    const row = await c.env.DB.prepare(
      `SELECT m.metadata_json
       FROM mailbox_messages m
       JOIN mailbox_aliases a ON a.id = m.mailbox_id
       WHERE a.user_id = ? AND m.id = ?`,
    )
      .bind(ownerId, c.req.param("messageId"))
      .first<{ metadata_json: string | null }>();
    if (!row) return c.json({ error: "Message not found" }, 404);

    const attachments = getStoredMailboxAttachments(row.metadata_json);
    const index = Number.parseInt(c.req.param("attachmentIndex"), 10);
    const attachment = Number.isInteger(index) ? attachments[index] : null;
    if (!attachment?.storageKey) return c.json({ error: "Attachment not found" }, 404);

    const object = await c.env.SITE_ASSETS.get(attachment.storageKey);
    if (!object) return c.json({ error: "Attachment not found" }, 404);

    const filename = sanitizeAttachmentFilename(
      attachment.filename || "",
      `attachment-${index + 1}`,
    );
    return new Response(object.body, {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Length": String(object.size),
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "'")}"`,
      },
    });
  });

  app.post("/api/mailbox/messages/:messageId/unsubscribe", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const row = await c.env.DB.prepare(
      `SELECT m.id, m.direction, m.message_kind, m.raw_headers_json
       FROM mailbox_messages m
       JOIN mailbox_aliases a ON a.id = m.mailbox_id
       WHERE a.user_id = ? AND m.id = ?`,
    )
      .bind(ownerId, c.req.param("messageId"))
      .first<{
        id: string;
        direction: string;
        message_kind: string;
        raw_headers_json: string | null;
      }>();
    if (!row) return c.json({ error: "Message not found" }, 404);
    if (row.direction !== "inbound" || row.message_kind !== "email") {
      return c.json({ error: "Unsubscribe is only available for inbound email" }, 400);
    }

    const action = resolveMailboxUnsubscribeAction(row.raw_headers_json);
    if (!action) return c.json({ error: "This message does not include an unsubscribe action" }, 404);

    if (action.mode === "one_click") {
      try {
        const response = await fetch(action.url, {
          method: "POST",
          headers: {
            Accept: "text/plain, */*",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "List-Unsubscribe=One-Click",
          redirect: "follow",
        });
        if (!response.ok) {
          return c.json(
            { error: `Unsubscribe request failed with status ${response.status}` },
            502,
          );
        }
        return c.json({ ok: true, mode: "one_click", status: response.status });
      } catch (error) {
        console.error("Mailbox one-click unsubscribe error:", error);
        return c.json({ error: "Failed to send unsubscribe request" }, 502);
      }
    }

    return c.json({ ok: true, mode: "open", url: action.url });
  });

  app.post("/api/mailbox/attachments", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    if (!c.env.SITE_ASSETS) {
      return c.json({ error: "Mailbox attachment storage is not configured" }, 503);
    }

    const mailbox = await c.env.DB.prepare(
      `SELECT id
       FROM mailbox_aliases
       WHERE user_id = ?
       ORDER BY created_at ASC
       LIMIT 1`,
    )
      .bind(ownerId)
      .first<{ id: string }>();
    if (!mailbox) return c.json({ error: "Mailbox not found" }, 404);

    const form = await c.req.formData().catch(() => null);
    if (!form) return c.json({ error: "Attachment upload is invalid" }, 400);
    const files = form
      .getAll("attachments")
      .filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) return c.json({ error: "Choose at least one attachment" }, 400);
    if (files.length > MAX_MAILBOX_ATTACHMENT_UPLOAD_COUNT) {
      return c.json(
        { error: `Upload up to ${MAX_MAILBOX_ATTACHMENT_UPLOAD_COUNT} attachments at a time` },
        400,
      );
    }

    const uploaded: StoredMailboxAttachment[] = [];
    for (const [index, file] of files.entries()) {
      if (file.size > MAX_MAILBOX_ATTACHMENT_UPLOAD_BYTES) {
        return c.json(
          { error: `${file.name || `Attachment ${index + 1}`} is larger than 25 MB` },
          400,
        );
      }
      const filename = sanitizeAttachmentFilename(file.name, `attachment-${index + 1}`);
      const mimeType = file.type || "application/octet-stream";
      const storageKey = [
        "mailbox",
        mailbox.id,
        "uploads",
        `${new Date().toISOString().slice(0, 10)}`,
        `${crypto.randomUUID()}-${filename}`,
      ].join("/");
      const content = await file.arrayBuffer();
      await c.env.SITE_ASSETS.put(storageKey, content, {
        httpMetadata: {
          contentType: mimeType,
        },
        customMetadata: {
          mailboxId: mailbox.id,
          filename,
          disposition: "attachment",
        },
      });
      uploaded.push({
        filename,
        mimeType,
        disposition: "attachment",
        size: file.size,
        storageKey,
        sourceMessageId: "",
      });
    }

    return c.json({ attachments: uploaded }, 201);
  });

  app.post("/api/mailbox/drafts", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const body = await c.req.json<AgentMailboxDraftInput>().catch((): AgentMailboxDraftInput => ({}));
    const result = await createAgentMailboxDraft(c.env, ownerId, body);
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result, 201);
  });

  app.put("/api/mailbox/drafts/:draftId", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const body = await c.req.json<AgentMailboxDraftInput>().catch((): AgentMailboxDraftInput => ({}));
    const result = await updateAgentMailboxDraft(c.env, ownerId, c.req.param("draftId"), body);
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.post("/api/mailbox/drafts/:draftId/reject", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const result = await rejectAgentMailboxDraft(c.env, ownerId, c.req.param("draftId"));
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.post("/api/mailbox/drafts/:draftId/approve", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const draftId = c.req.param("draftId");
    const approval = await getAgentMailboxDraftForApproval(c.env, ownerId, draftId);
    if ("error" in approval) return c.json({ error: approval.error }, approval.status as any);

    try {
      const { mailbox, draft } = approval;
      const outboundHeaders = getAgentMailboxOutboundHeaders(draft);
      const attachments = await loadDraftProviderAttachments(c.env, draft);
      const draftFromAddress =
        draft.fromAddress && !draft.fromAddress.toLowerCase().endsWith("@me3.local")
          ? draft.fromAddress
          : null;
      const result = await sendEmailWithProvider(c.env, ownerId, {
        purpose: draft.sourceId ? "reply" : "draft",
        mailboxId: mailbox.id,
        mailboxMessageId: draft.id,
        fromAddress: draftFromAddress,
        toAddress: draft.toAddress || "",
        subject: draft.subject || "(no subject)",
        textBody: draft.body || "",
        htmlBody: draft.htmlBody,
        attachments,
        threadKey: draft.threadKey,
        messageIdHeader: outboundHeaders.messageIdHeader,
        inReplyTo: outboundHeaders.inReplyTo,
        referencesHeader: outboundHeaders.referencesHeader,
        metadata: {
          mailbox_message_id: draft.id,
          source_id: draft.sourceId,
        },
        createdBy: draft.createdBy,
        approvedByUserId: ownerId,
      });
      const sent = await markAgentMailboxDraftSent(c.env, ownerId, draft.id, {
        providerId: result.providerId,
        providerMessageId: result.providerMessageId,
        sentAt: result.sentAt,
        approvedByUserId: ownerId,
      });
      if ("error" in sent) return c.json({ error: sent.error }, sent.status as any);
      return c.json(sent);
    } catch (error) {
      if (error instanceof EmailProviderInputError) {
        await markAgentMailboxDraftFailed(c.env, ownerId, draftId, { errorMessage: error.message });
        return c.json({ error: error.message }, error.status as any);
      }
      throw error;
    }
  });

  app.post("/api/mailbox/messages/:messageId/read", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const body = await c.req.json<{ read?: boolean }>().catch(() => ({ read: true }));
    const result = await setAgentMailboxMessageReadState(
      c.env,
      ownerId,
      c.req.param("messageId"),
      body.read !== false,
    );
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.post("/api/mailbox/messages/:messageId/move", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const body = await c.req.json<{ folder?: string }>().catch((): { folder?: string } => ({}));
    const result = await moveAgentMailboxMessage(c.env, ownerId, c.req.param("messageId"), body.folder);
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });

  app.delete("/api/mailbox/messages/:messageId", async (c) => {
    const ownerId = await requireOwner(c);
    if (!ownerId) return unauthorized(c);

    const result = await trashAgentMailboxMessage(c.env, ownerId, c.req.param("messageId"));
    if ("error" in result) return c.json({ error: result.error }, result.status as any);
    return c.json(result);
  });
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function handleInboundEmail(
  message: ForwardableEmailMessageLike,
  env: Env,
): Promise<void> {
  try {
    const mailbox = await getActiveMailboxForInbound(env);
    if (!mailbox) {
      message.setReject("ME3 Core mailbox is not active for this installation.");
      return;
    }

    if (message.rawSize > MAX_INBOUND_EMAIL_BYTES) {
      message.setReject("Message is too large for this ME3 Core mailbox.");
      return;
    }

    const rawMessage = await readEmailRawText(message.raw, MAX_INBOUND_EMAIL_BYTES);
    const parsed = parseInboundEmail(rawMessage, message.headers);
    const now = new Date().toISOString();
    const providerMessageId =
      normalizeEmailHeaderValue(parsed.headers["message-id"]) || crypto.randomUUID();
    const threadKey =
      normalizeEmailHeaderValue(parsed.headers.references) ||
      normalizeEmailHeaderValue(parsed.headers["in-reply-to"]) ||
      providerMessageId;
    const rowId = crypto.randomUUID();
    const storedAttachments = await storeInboundEmailAttachments(
      env,
      mailbox.id,
      rowId,
      parsed.attachments,
    );

    await env.DB.prepare(
      `INSERT INTO mailbox_messages (
         id, mailbox_id, direction, message_kind, status, thread_key,
         provider_id, provider_message_id, from_address, to_address, subject,
         text_body, html_body, raw_headers_json, raw_message, metadata_json,
         folder, created_by, received_at, created_at, updated_at
       )
       VALUES (
         ?, ?, 'inbound', 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         'inbox', 'cloudflare-email-routing', ?, ?, ?
       )`,
    )
      .bind(
        rowId,
        mailbox.id,
        "received",
        threadKey,
        INBOUND_EMAIL_PROVIDER_ID,
        providerMessageId,
        parseEmailAddressHeader(parsed.headers.from)?.address ||
          normalizeEmail(message.from) ||
          normalizeEmailHeaderValue(parsed.headers.from),
        parseEmailAddressHeader(parsed.headers.to)?.address ||
          normalizeEmail(message.to) ||
          normalizeEmailHeaderValue(parsed.headers.to),
        parsed.subject || "(no subject)",
        parsed.textBody || parsed.htmlBody || "",
        parsed.htmlBody,
        JSON.stringify(parsed.headers),
        rawMessage,
        JSON.stringify({
          rawSize: message.rawSize,
          envelopeFrom: message.from,
          envelopeTo: message.to,
          attachmentCount: storedAttachments.length,
          attachments: storedAttachments,
        }),
        now,
        now,
        now,
      )
      .run();

    if (mailbox.forwarding_enabled && mailbox.forwarding_email && message.canBeForwarded) {
      await message.forward(mailbox.forwarding_email);
      await markInboundEmailForwarded(env, mailbox.id, rowId, mailbox.forwarding_email);
    }
  } catch (error) {
    console.error("Inbound email processing failed", error);
    message.setReject("ME3 Core could not process this email.");
  }
}

async function getActiveMailboxForInbound(env: Env): Promise<DbMailboxAlias | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, user_id, alias_local_part, forwarding_email, forwarding_status,
              forwarding_enabled, forwarding_mode, status, approval_policy,
              daily_inbound_limit, daily_outbound_limit, activated_at,
              cf_destination_id, cf_destination_verified_at, cf_rule_id,
              cf_last_synced_at, cf_last_error, created_at, updated_at
       FROM mailbox_aliases
       WHERE status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
      .bind()
      .first<DbMailboxAlias>()) || null
  );
}

async function markInboundEmailForwarded(
  env: Env,
  mailboxId: string,
  messageId: string,
  forwardedTo: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE mailbox_messages
     SET status = 'forwarded',
         forwarded_to = ?,
         updated_at = ?
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(forwardedTo, new Date().toISOString(), messageId, mailboxId)
    .run();
}

async function readEmailRawText(
  raw: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const reader = raw.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      throw new Error("Inbound email exceeded ME3 Core raw message limit.");
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseInboundEmail(
  rawMessage: string,
  envelopeHeaders: Headers,
): {
  headers: Record<string, string>;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachments: ParsedInboundEmailAttachment[];
} {
  const [rawHeaderText, ...bodyParts] = rawMessage.split(/\r?\n\r?\n/);
  const headers = {
    ...headersToRecord(envelopeHeaders),
    ...parseRawEmailHeaders(rawHeaderText || ""),
  };
  const body = bodyParts.join("\n\n");
  const contentType = headers["content-type"] || "";
  const parsedBody = parseEmailBody(body, contentType, headers["content-transfer-encoding"]);

  return {
    headers,
    subject: decodeMimeHeaderValue(normalizeEmailHeaderValue(headers.subject)) || "",
    textBody: parsedBody.textBody,
    htmlBody: parsedBody.htmlBody,
    attachments: parsedBody.attachments,
  };
}

type ParsedInboundEmailAttachment = {
  filename: string;
  mimeType: string;
  disposition: "attachment" | "inline";
  contentId: string | null;
  content: Uint8Array;
};

type StoredMailboxAttachment = {
  filename: string;
  mimeType: string;
  disposition: "attachment" | "inline";
  size: number;
  storageKey: string;
  contentId?: string | null;
  sourceMessageId: string;
};

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function parseRawEmailHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let currentHeader = "";

  for (const line of rawHeaders.split(/\r?\n/)) {
    if (/^\s/.test(line) && currentHeader) {
      headers[currentHeader] = `${headers[currentHeader]} ${line.trim()}`;
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    currentHeader = line.slice(0, separatorIndex).trim().toLowerCase();
    headers[currentHeader] = line.slice(separatorIndex + 1).trim();
  }

  return headers;
}

type MailboxUnsubscribeAction =
  | { mode: "one_click"; url: string }
  | { mode: "link"; url: string }
  | { mode: "mailto"; url: string };

function resolveMailboxUnsubscribeAction(
  rawHeadersJson: string | null,
): MailboxUnsubscribeAction | null {
  const headers = parseJsonRecord(rawHeadersJson);
  const listUnsubscribe = getHeaderValue(headers, "list-unsubscribe");
  if (!listUnsubscribe) return null;

  const urls = parseListUnsubscribeUrls(listUnsubscribe);
  const httpsUrl = urls.find(isHttpsUrl);
  const mailtoUrl = urls.find((url) => url.trim().toLowerCase().startsWith("mailto:"));
  const oneClick =
    getHeaderValue(headers, "list-unsubscribe-post")?.trim().toLowerCase() ===
    "list-unsubscribe=one-click";

  if (oneClick && httpsUrl) return { mode: "one_click", url: httpsUrl };
  if (httpsUrl) return { mode: "link", url: httpsUrl };
  if (mailtoUrl) return { mode: "mailto", url: mailtoUrl };
  return null;
}

function getHeaderValue(headers: Record<string, unknown>, name: string): string | null {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && typeof value === "string") {
      return value;
    }
  }
  return null;
}

function parseListUnsubscribeUrls(value: string): string[] {
  const bracketed = [...value.matchAll(/<([^>]+)>/g)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean);
  if (bracketed.length > 0) return bracketed;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseEmailBody(
  body: string,
  contentType: string,
  transferEncoding: string | undefined,
): { textBody: string; htmlBody: string | null; attachments: ParsedInboundEmailAttachment[] } {
  const boundary = extractMimeBoundary(contentType);
  if (!boundary) {
    const decoded = decodeEmailBody(body, transferEncoding);
    if (/text\/html/i.test(contentType)) {
      return { textBody: stripHtml(decoded), htmlBody: decoded.trim() || null, attachments: [] };
    }
    return { textBody: decoded.trim(), htmlBody: null, attachments: [] };
  }

  let textBody = "";
  let htmlBody: string | null = null;
  const attachments: ParsedInboundEmailAttachment[] = [];
  for (const part of body.split(`--${boundary}`)) {
    if (!part.trim() || part.trim() === "--") continue;
    const [partHeadersText, ...partBodyParts] = part
      .replace(/^(\r?\n)/, "")
      .split(/\r?\n\r?\n/);
    const partHeaders = parseRawEmailHeaders(partHeadersText || "");
    const partContentType = partHeaders["content-type"] || "";
    const partBody = partBodyParts.join("\n\n").replace(/\r?\n--$/, "");
    const partDisposition = partHeaders["content-disposition"] || "";
    const filename = extractMimeFilename(partContentType, partDisposition);
    const isAttachment =
      /^attachment\b/i.test(partDisposition) ||
      (Boolean(filename) && !/^text\/(?:plain|html)\b/i.test(partContentType));

    if (isAttachment && filename) {
      const content = decodeEmailBodyBytes(
        partBody,
        partHeaders["content-transfer-encoding"],
      );
      attachments.push({
        filename,
        mimeType: normalizeMimeType(partContentType),
        disposition: /^inline\b/i.test(partDisposition) ? "inline" : "attachment",
        contentId: normalizeEmailHeaderValue(partHeaders["content-id"]) || null,
        content,
      });
      continue;
    }

    const decoded = decodeEmailBody(partBody, partHeaders["content-transfer-encoding"]).trim();
    if (!textBody && /^text\/plain\b/i.test(partContentType)) {
      textBody = decoded;
    } else if (!htmlBody && /^text\/html\b/i.test(partContentType)) {
      htmlBody = decoded;
    }
  }

  return {
    textBody: textBody || (htmlBody ? stripHtml(htmlBody) : ""),
    htmlBody,
    attachments,
  };
}

function extractMimeBoundary(contentType: string): string | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return (match?.[1] || match?.[2] || "").trim() || null;
}

function decodeEmailBody(body: string, transferEncoding: string | undefined): string {
  return new TextDecoder().decode(decodeEmailBodyBytes(body, transferEncoding));
}

function decodeEmailBodyBytes(body: string, transferEncoding: string | undefined): Uint8Array {
  const encoding = (transferEncoding || "").trim().toLowerCase();
  if (encoding === "base64") {
    try {
      const binary = atob(body.replace(/\s/g, ""));
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch {
      return new TextEncoder().encode(body);
    }
  }
  if (encoding === "quoted-printable") {
    const decoded = body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9a-f]{2})/gi, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0) & 0xff);
  }
  return new TextEncoder().encode(body);
}

function extractMimeFilename(contentType: string, contentDisposition: string): string | null {
  return (
    extractMimeParameter(contentDisposition, "filename*") ||
    extractMimeParameter(contentDisposition, "filename") ||
    extractMimeParameter(contentType, "name*") ||
    extractMimeParameter(contentType, "name")
  );
}

function extractMimeParameter(header: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedName}=("[^"]*"|[^;]+)`, "i").exec(header);
  const raw = (match?.[1] || "").trim();
  if (!raw) return null;
  const value = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  const rfc5987 = /^utf-8''(.+)$/i.exec(value);
  try {
    return decodeURIComponent(rfc5987?.[1] || value).trim() || null;
  } catch {
    return value.trim() || null;
  }
}

function normalizeMimeType(contentType: string): string {
  return (contentType.split(";")[0] || "application/octet-stream").trim().toLowerCase();
}

function sanitizeAttachmentFilename(value: string, fallback: string): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return sanitized || fallback;
}

async function storeInboundEmailAttachments(
  env: Env,
  mailboxId: string,
  messageId: string,
  attachments: ParsedInboundEmailAttachment[],
): Promise<StoredMailboxAttachment[]> {
  if (!env.SITE_ASSETS || attachments.length === 0) return [];

  const stored: StoredMailboxAttachment[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const filename = sanitizeAttachmentFilename(
      attachment.filename,
      `attachment-${index + 1}`,
    );
    const storageKey = [
      "mailbox",
      mailboxId,
      "messages",
      messageId,
      "attachments",
      `${index}-${crypto.randomUUID()}-${filename}`,
    ].join("/");
    await env.SITE_ASSETS.put(storageKey, attachment.content, {
      httpMetadata: {
        contentType: attachment.mimeType,
      },
      customMetadata: {
        mailboxId,
        messageId,
        filename,
        disposition: attachment.disposition,
      },
    });
    stored.push({
      filename,
      mimeType: attachment.mimeType,
      disposition: attachment.disposition,
      size: attachment.content.byteLength,
      storageKey,
      contentId: attachment.contentId,
      sourceMessageId: messageId,
    });
  }
  return stored;
}

function getStoredMailboxAttachments(metadataJson: string | null): StoredMailboxAttachment[] {
  const metadata = parseJsonRecord(metadataJson);
  const rawAttachments = Array.isArray(metadata.attachments)
    ? metadata.attachments
    : [];
  return rawAttachments
    .filter((attachment): attachment is Record<string, unknown> =>
      Boolean(attachment && typeof attachment === "object" && !Array.isArray(attachment)),
    )
    .map((attachment) => ({
      filename: typeof attachment.filename === "string" ? attachment.filename : "",
      mimeType:
        typeof attachment.mimeType === "string" && attachment.mimeType.trim()
          ? attachment.mimeType
          : "application/octet-stream",
      disposition:
        attachment.disposition === "inline" ? ("inline" as const) : ("attachment" as const),
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size)
          ? attachment.size
          : 0,
      storageKey:
        typeof attachment.storageKey === "string" ? attachment.storageKey : "",
      contentId:
        typeof attachment.contentId === "string" ? attachment.contentId : null,
      sourceMessageId:
        typeof attachment.sourceMessageId === "string"
          ? attachment.sourceMessageId
          : "",
    }))
    .filter((attachment) => attachment.storageKey.startsWith("mailbox/"));
}

async function loadDraftProviderAttachments(
  env: Env,
  draft: AgentMailboxMessage,
): Promise<EmailProviderAttachment[]> {
  if (!env.SITE_ASSETS) return [];
  const rawAttachments = Array.isArray(draft.metadata.attachments)
    ? draft.metadata.attachments
    : [];
  const attachments = getStoredMailboxAttachments(
    JSON.stringify({ attachments: rawAttachments }),
  );
  const loaded: EmailProviderAttachment[] = [];
  for (const attachment of attachments) {
    const object = await env.SITE_ASSETS.get(attachment.storageKey);
    if (!object) continue;
    loaded.push({
      filename: sanitizeAttachmentFilename(
        attachment.filename,
        `attachment-${loaded.length + 1}`,
      ),
      mimeType: attachment.mimeType || "application/octet-stream",
      content: new Uint8Array(await object.arrayBuffer()),
    });
  }
  return loaded;
}

function stripHtml(value: string): string {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmailHeaderValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
