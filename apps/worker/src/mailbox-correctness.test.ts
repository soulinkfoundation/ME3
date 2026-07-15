import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createAgentMailboxDraft,
  getAgentMailboxDraftForApproval,
  markAgentMailboxDraftFailed,
  markAgentMailboxDraftSent,
  rejectAgentMailboxDraft,
  updateAgentMailboxDraft,
} from "./agent-chat";
import { registerMailboxRoutes } from "./routes/mailbox";

type MailboxMessageRow = {
  id: string;
  mailbox_id: string;
  direction: "inbound" | "outbound";
  message_kind: "email" | "draft" | "system";
  status: "received" | "pending_approval" | "approved" | "sent" | "failed";
  thread_key: string | null;
  provider_id: string | null;
  provider_message_id: string | null;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  raw_headers_json: string | null;
  raw_message: string | null;
  metadata_json: string | null;
  agent_idempotency_key: string | null;
  source_id: string | null;
  folder: "inbox" | "drafts" | "sent" | "archive" | "trash";
  read_at: string | null;
  agent_summary: string | null;
  agent_labels_json: string | null;
  forwarded_to: string | null;
  error_message: string | null;
  created_by: string;
  approved_by_user_id: string | null;
  received_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

describe("mailbox correctness", () => {
  it("permanently deletes messages while preserving referenced attachment objects", async () => {
    const state = createMailboxState();
    const uniqueKey = "mailbox/mailbox-1/uploads/unique.txt";
    const sharedKey = "mailbox/mailbox-1/messages/source/attachments/shared.txt";
    state.messages.push(
      mailboxMessage({
        id: "delete-me",
        folder: "trash",
        metadata_json: JSON.stringify({
          attachments: [{ storageKey: uniqueKey }, { storageKey: sharedKey }],
        }),
      }),
      mailboxMessage({
        id: "keep-me",
        metadata_json: JSON.stringify({ attachments: [{ storageKey: sharedKey }] }),
      }),
    );
    const deleteObjects = vi.fn(async (_keys: string | string[]) => undefined);
    const app = new Hono();
    registerMailboxRoutes(app as never, {
      requireOwner: async () => "owner",
      unauthorized: () => new Response(null, { status: 401 }),
    });

    const response = await app.fetch(
      new Request("http://localhost/api/mailbox/messages/delete-me", { method: "DELETE" }),
      { DB: state.db, SITE_ASSETS: { delete: deleteObjects } } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(state.messages.map((message) => message.id)).toEqual(["keep-me"]);
    expect(deleteObjects).toHaveBeenCalledWith([uniqueKey]);

    const missing = await app.fetch(
      new Request("http://localhost/api/mailbox/messages/delete-me", { method: "DELETE" }),
      { DB: state.db, SITE_ASSETS: { delete: deleteObjects } } as never,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Message not found" });
  });

  it("saves incomplete drafts and validates recipients only when sending", async () => {
    const state = createMailboxState();
    const created = await createAgentMailboxDraft(state as never, "owner", {
      subject: "Started",
    });
    expect("error" in created).toBe(false);
    if ("error" in created) return;

    expect(created.draft).toMatchObject({
      status: "pending_approval",
      toAddress: "",
      subject: "Started",
      body: "",
    });
    await expect(
      getAgentMailboxDraftForApproval(state as never, "owner", created.draft.id),
    ).resolves.toEqual({ error: "Draft recipient is required", status: 400 });

    const invalid = await updateAgentMailboxDraft(
      state as never,
      "owner",
      created.draft.id,
      { to: "not-an-email", subject: "", textBody: "" },
    );
    expect("error" in invalid).toBe(false);
    if ("error" in invalid) return;
    expect(invalid.draft).toMatchObject({
      id: created.draft.id,
      toAddress: "not-an-email",
      subject: "(no subject)",
      body: "",
    });
    expect(state.messages[0]?.subject).toBe("");
    await expect(
      getAgentMailboxDraftForApproval(state as never, "owner", created.draft.id),
    ).resolves.toEqual({ error: "Draft recipient is invalid", status: 400 });
  });

  it("retries a failed send on the same draft and makes repeated approval safe", async () => {
    const state = createMailboxState();
    const created = await createAgentMailboxDraft(state as never, "owner", {
      to: "client@example.com",
      subject: "Hello",
      textBody: "Body",
    });
    if ("error" in created) throw new Error(created.error);
    const draftId = created.draft.id;

    const firstApproval = await getAgentMailboxDraftForApproval(state as never, "owner", draftId);
    expect(firstApproval).toMatchObject({ alreadySent: false, draft: { id: draftId, status: "approved" } });
    await expect(
      getAgentMailboxDraftForApproval(state as never, "owner", draftId),
    ).resolves.toEqual({ error: "Draft is already being sent", status: 409 });
    await expect(
      updateAgentMailboxDraft(state as never, "owner", draftId, { subject: "Changed" }),
    ).resolves.toEqual({ error: "Draft is already being sent", status: 409 });
    await expect(
      rejectAgentMailboxDraft(state as never, "owner", draftId),
    ).resolves.toEqual({ error: "Draft is already being sent", status: 409 });

    await markAgentMailboxDraftFailed(state as never, "owner", draftId, {
      errorMessage: "Provider unavailable",
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      id: draftId,
      message_kind: "draft",
      status: "failed",
      folder: "drafts",
      error_message: "Provider unavailable",
    });

    const retry = await getAgentMailboxDraftForApproval(state as never, "owner", draftId);
    expect(retry).toMatchObject({ alreadySent: false, draft: { id: draftId, status: "approved" } });
    const sentAt = "2026-07-15T12:00:00.000Z";
    const sent = await markAgentMailboxDraftSent(state as never, "owner", draftId, {
      providerId: "postmark",
      providerMessageId: "provider-1",
      sentAt,
      approvedByUserId: "owner",
    });
    expect(sent).toMatchObject({ draft: { id: draftId, status: "sent" } });

    const repeatedTransition = await markAgentMailboxDraftSent(state as never, "owner", draftId, {
      providerId: "postmark",
      providerMessageId: "provider-1",
      sentAt,
      approvedByUserId: "owner",
    });
    expect(repeatedTransition).toMatchObject({ draft: { id: draftId, status: "sent" } });
    const repeatedApproval = await getAgentMailboxDraftForApproval(state as never, "owner", draftId);
    expect(repeatedApproval).toMatchObject({ alreadySent: true, draft: { id: draftId, status: "sent" } });
    expect(state.messages).toHaveLength(1);
  });

  it("reconciles an interrupted send from its completed provider audit", async () => {
    const state = createMailboxState();
    state.messages.push(
      mailboxMessage({
        id: "stuck-draft",
        message_kind: "draft",
        status: "approved",
        folder: "drafts",
        sent_at: null,
      }),
    );
    state.sendAudits.push({
      user_id: "owner",
      mailbox_message_id: "stuck-draft",
      status: "sent",
      provider_id: "postmark",
      provider_message_id: "provider-2",
      sent_at: "2026-07-15T12:30:00.000Z",
    });
    const app = new Hono();
    registerMailboxRoutes(app as never, {
      requireOwner: async () => "owner",
      unauthorized: () => new Response(null, { status: 401 }),
    });

    const response = await app.fetch(
      new Request("http://localhost/api/mailbox/drafts/stuck-draft/approve", {
        method: "POST",
      }),
      { DB: state.db } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      draft: { id: "stuck-draft", status: "sent", folder: "sent" },
    });
    expect(state.messages[0]).toMatchObject({
      message_kind: "email",
      status: "sent",
      provider_message_id: "provider-2",
    });
  });
});

function createMailboxState() {
  const now = "2026-07-15T10:00:00.000Z";
  const mailbox = {
    id: "mailbox-1",
    user_id: "owner",
    alias_local_part: "owner",
    forwarding_email: "owner@example.com",
    forwarding_status: "verified",
    forwarding_enabled: 0,
    forwarding_mode: "me3_only",
    status: "active",
    approval_policy: "all",
    daily_inbound_limit: 200,
    daily_outbound_limit: 200,
    activated_at: now,
    cf_destination_id: null,
    cf_destination_verified_at: null,
    cf_rule_id: null,
    cf_last_synced_at: null,
    cf_last_error: null,
    created_at: now,
    updated_at: now,
  };
  const messages: MailboxMessageRow[] = [];
  const sendAudits: Array<{
    user_id: string;
    mailbox_message_id: string;
    status: "sent";
    provider_id: string;
    provider_message_id: string | null;
    sent_at: string;
  }> = [];

  const execute = (sql: string, values: unknown[]) => ({
    async first<T = unknown>(): Promise<T | null> {
      if (sql.includes("FROM mailbox_aliases")) {
        return (values[0] === mailbox.user_id ? mailbox : null) as T | null;
      }
      if (sql.includes("FROM email_send_audit")) {
        const [userId, messageId] = values as [string, string];
        return (sendAudits.find(
          (audit) =>
            audit.user_id === userId &&
            audit.mailbox_message_id === messageId &&
            audit.status === "sent",
        ) || null) as T | null;
      }
      if (sql.includes("instr(COALESCE(metadata_json")) {
        const [mailboxId, storageKey] = values as [string, string];
        return (messages.find(
          (message) =>
            message.mailbox_id === mailboxId &&
            (message.metadata_json || "").includes(storageKey),
        ) || null) as T | null;
      }
      if (sql.includes("FROM mailbox_messages") && sql.includes("WHERE id = ? AND mailbox_id = ?")) {
        const [id, mailboxId] = values as [string, string];
        return (messages.find(
          (message) => message.id === id && message.mailbox_id === mailboxId,
        ) || null) as T | null;
      }
      return null;
    },
    async all<T = unknown>(): Promise<{ results: T[] }> {
      return { results: [] };
    },
    async run(): Promise<{ meta: { changes: number } }> {
      if (sql.includes("INSERT") && sql.includes("INTO mailbox_messages")) {
        const [
          id,
          mailboxId,
          threadKey,
          fromAddress,
          toAddress,
          subject,
          textBody,
          htmlBody,
          metadataJson,
          idempotencyKey,
          sourceId,
          createdBy,
          createdAt,
          updatedAt,
        ] = values as string[];
        messages.push({
          ...mailboxMessage({ id, mailbox_id: mailboxId }),
          direction: "outbound",
          message_kind: "draft",
          status: "pending_approval",
          thread_key: threadKey,
          from_address: fromAddress,
          to_address: toAddress,
          subject,
          text_body: textBody,
          html_body: htmlBody || null,
          metadata_json: metadataJson,
          agent_idempotency_key: idempotencyKey || null,
          source_id: sourceId || null,
          folder: "drafts",
          created_by: createdBy,
          sent_at: null,
          created_at: createdAt,
          updated_at: updatedAt,
        });
        return { meta: { changes: 1 } };
      }

      if (sql.startsWith("DELETE FROM mailbox_messages")) {
        const [id, mailboxId] = values as [string, string];
        const index = messages.findIndex(
          (message) => message.id === id && message.mailbox_id === mailboxId,
        );
        if (index < 0) return { meta: { changes: 0 } };
        messages.splice(index, 1);
        return { meta: { changes: 1 } };
      }

      if (sql.includes("SET status = 'approved'")) {
        const [approvedBy, approvedAt, updatedAt, id, mailboxId] = values as string[];
        const message = messages.find(
          (row) =>
            row.id === id &&
            row.mailbox_id === mailboxId &&
            row.message_kind === "draft" &&
            ["pending_approval", "failed"].includes(row.status),
        );
        if (!message) return { meta: { changes: 0 } };
        Object.assign(message, {
          status: "approved",
          error_message: null,
          approved_by_user_id: approvedBy,
          approved_at: approvedAt,
          updated_at: updatedAt,
        });
        return { meta: { changes: 1 } };
      }

      if (sql.includes("SET message_kind = 'email'")) {
        const [providerId, providerMessageId, approvedBy, approvedAt, sentAt, updatedAt, id, mailboxId] = values as string[];
        const message = messages.find(
          (row) =>
            row.id === id &&
            row.mailbox_id === mailboxId &&
            row.message_kind === "draft" &&
            row.status === "approved",
        );
        if (!message) return { meta: { changes: 0 } };
        Object.assign(message, {
          message_kind: "email",
          status: "sent",
          folder: "sent",
          provider_id: providerId,
          provider_message_id: providerMessageId || null,
          error_message: null,
          approved_by_user_id: approvedBy,
          approved_at: approvedAt,
          sent_at: sentAt,
          updated_at: updatedAt,
        });
        return { meta: { changes: 1 } };
      }

      if (sql.includes("SET status = 'failed'")) {
        const [errorMessage, updatedAt, id, mailboxId] = values as string[];
        const message = messages.find(
          (row) =>
            row.id === id &&
            row.mailbox_id === mailboxId &&
            row.message_kind === "draft" &&
            row.status === "approved",
        );
        if (!message) return { meta: { changes: 0 } };
        Object.assign(message, {
          status: "failed",
          folder: "drafts",
          error_message: errorMessage,
          updated_at: updatedAt,
        });
        return { meta: { changes: 1 } };
      }

      if (sql.includes("SET status = 'rejected'")) {
        const [approvedBy, approvedAt, updatedAt, id, mailboxId] = values as string[];
        const message = messages.find(
          (row) =>
            row.id === id &&
            row.mailbox_id === mailboxId &&
            row.message_kind === "draft" &&
            ["pending_approval", "failed"].includes(row.status),
        );
        if (!message) return { meta: { changes: 0 } };
        Object.assign(message, {
          status: "rejected",
          folder: "trash",
          approved_by_user_id: approvedBy,
          approved_at: approvedAt,
          updated_at: updatedAt,
        });
        return { meta: { changes: 1 } };
      }

      if (sql.includes("SET status = 'pending_approval'")) {
        const [threadKey, fromAddress, toAddress, subject, textBody, htmlBody, metadataJson, sourceId, createdBy, updatedAt, id, mailboxId] = values as string[];
        const message = messages.find(
          (row) =>
            row.id === id &&
            row.mailbox_id === mailboxId &&
            row.message_kind === "draft" &&
            ["pending_approval", "failed"].includes(row.status),
        );
        if (!message) return { meta: { changes: 0 } };
        Object.assign(message, {
          status: "pending_approval",
          thread_key: threadKey,
          from_address: fromAddress,
          to_address: toAddress,
          subject,
          text_body: textBody,
          html_body: htmlBody || null,
          metadata_json: metadataJson,
          source_id: sourceId || null,
          folder: "drafts",
          created_by: createdBy,
          error_message: null,
          updated_at: updatedAt,
        });
        return { meta: { changes: 1 } };
      }

      return { meta: { changes: 0 } };
    },
  });

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return execute(sql, values);
        },
        async first<T = unknown>(): Promise<T | null> {
          return execute(sql, []).first<T>();
        },
      };
    },
  };

  return { DB: db, db, mailbox, messages, sendAudits };
}

function mailboxMessage(overrides: Partial<MailboxMessageRow>): MailboxMessageRow {
  const now = "2026-07-15T10:00:00.000Z";
  return {
    id: "message-1",
    mailbox_id: "mailbox-1",
    direction: "outbound",
    message_kind: "email",
    status: "sent",
    thread_key: "thread-1",
    provider_id: null,
    provider_message_id: null,
    from_address: "owner@me3.local",
    to_address: "client@example.com",
    subject: "Subject",
    text_body: "Body",
    html_body: null,
    raw_headers_json: null,
    raw_message: null,
    metadata_json: null,
    agent_idempotency_key: null,
    source_id: null,
    folder: "sent",
    read_at: null,
    agent_summary: null,
    agent_labels_json: null,
    forwarded_to: null,
    error_message: null,
    created_by: "owner",
    approved_by_user_id: null,
    received_at: null,
    approved_at: null,
    sent_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
