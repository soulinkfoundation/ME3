import type { Env } from "./types";

export const MAILBOX_DELIVERY_UNKNOWN_AFTER_MS = 5 * 60 * 1000;

export type MailboxDraftDeliveryStatus = {
  id: string;
  state: "draft" | "sending" | "delivery_unknown" | "sent" | "failed" | "rejected";
  checkedAt: string;
  unknownAfter: string | null;
  canMarkSent: boolean;
  canRetryAnyway: boolean;
};

type MailboxDeliveryError = { error: string; status: number };

type MailboxDeliveryRow = {
  id: string;
  message_kind: "email" | "draft" | "system";
  status: string;
  approved_at: string | null;
  updated_at: string;
  created_at: string;
};

export async function getMailboxDraftDeliveryStatus(
  env: Pick<Env, "DB">,
  ownerId: string,
  draftId: string,
  now = new Date(),
): Promise<MailboxDraftDeliveryStatus | MailboxDeliveryError> {
  const row = await env.DB.prepare(
    `SELECT m.id, m.message_kind, m.status, m.approved_at, m.updated_at, m.created_at
     FROM mailbox_messages m
     JOIN mailbox_aliases a ON a.id = m.mailbox_id
     WHERE a.user_id = ? AND m.id = ?`,
  )
    .bind(ownerId, draftId)
    .first<MailboxDeliveryRow>();
  if (!row) return { error: "Draft not found", status: 404 };

  const checkedAt = now.toISOString();
  if (row.message_kind === "email" && row.status === "sent") {
    return statusResponse(row.id, "sent", checkedAt, null);
  }
  if (row.message_kind !== "draft") return { error: "Draft not found", status: 404 };
  if (row.status === "failed") return statusResponse(row.id, "failed", checkedAt, null);
  if (row.status === "rejected") return statusResponse(row.id, "rejected", checkedAt, null);
  if (row.status !== "approved") return statusResponse(row.id, "draft", checkedAt, null);

  const approvedAt = parseDate(row.approved_at || row.updated_at || row.created_at);
  const unknownAfter = approvedAt
    ? new Date(approvedAt.getTime() + MAILBOX_DELIVERY_UNKNOWN_AFTER_MS)
    : now;
  const state = now.getTime() >= unknownAfter.getTime() ? "delivery_unknown" : "sending";
  return statusResponse(row.id, state, checkedAt, unknownAfter.toISOString());
}

export async function markMailboxDraftSentByOwner(
  env: Pick<Env, "DB">,
  ownerId: string,
  draftId: string,
  now = new Date(),
): Promise<{ ok: true; id: string; sentAt: string } | MailboxDeliveryError> {
  const sentAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - MAILBOX_DELIVERY_UNKNOWN_AFTER_MS).toISOString();
  const result = await env.DB.prepare(
    `UPDATE mailbox_messages
     SET message_kind = 'email',
         status = 'sent',
         folder = 'sent',
         provider_id = COALESCE(provider_id, 'owner-confirmed'),
         error_message = NULL,
         sent_at = ?,
         updated_at = ?
     WHERE id = ?
       AND mailbox_id IN (SELECT id FROM mailbox_aliases WHERE user_id = ?)
       AND message_kind = 'draft'
       AND status = 'approved'
       AND julianday(COALESCE(approved_at, updated_at, created_at)) <= julianday(?)
       AND NOT EXISTS (
         SELECT 1 FROM email_send_audit a
         WHERE a.user_id = ? AND a.mailbox_message_id = mailbox_messages.id
           AND a.requested_at >= COALESCE(
             mailbox_messages.approved_at,
             mailbox_messages.updated_at,
             mailbox_messages.created_at
           )
           AND a.status IN ('sent', 'failed')
       )`,
  )
    .bind(sentAt, sentAt, draftId, ownerId, staleBefore, ownerId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    return { error: "Draft delivery is not awaiting confirmation", status: 409 };
  }
  return { ok: true, id: draftId, sentAt };
}

export async function prepareMailboxDraftRetryAnyway(
  env: Pick<Env, "DB">,
  ownerId: string,
  draftId: string,
  now = new Date(),
): Promise<{ ok: true } | MailboxDeliveryError> {
  const updatedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - MAILBOX_DELIVERY_UNKNOWN_AFTER_MS).toISOString();
  const result = await env.DB.prepare(
    `UPDATE mailbox_messages
     SET status = 'failed',
         folder = 'drafts',
         error_message = 'Delivery was unconfirmed. Owner chose Retry anyway.',
         updated_at = ?
     WHERE id = ?
       AND mailbox_id IN (SELECT id FROM mailbox_aliases WHERE user_id = ?)
       AND message_kind = 'draft'
       AND status = 'approved'
       AND julianday(COALESCE(approved_at, updated_at, created_at)) <= julianday(?)
       AND NOT EXISTS (
         SELECT 1 FROM email_send_audit a
         WHERE a.user_id = ? AND a.mailbox_message_id = mailbox_messages.id
           AND a.requested_at >= COALESCE(
             mailbox_messages.approved_at,
             mailbox_messages.updated_at,
             mailbox_messages.created_at
           )
           AND a.status IN ('sent', 'failed')
       )`,
  )
    .bind(updatedAt, draftId, ownerId, staleBefore, ownerId)
    .run();
  if ((result.meta?.changes || 0) === 0) {
    return { error: "Draft delivery is not awaiting confirmation", status: 409 };
  }
  return { ok: true };
}

function statusResponse(
  id: string,
  state: MailboxDraftDeliveryStatus["state"],
  checkedAt: string,
  unknownAfter: string | null,
): MailboxDraftDeliveryStatus {
  const canResolve = state === "delivery_unknown";
  return {
    id,
    state,
    checkedAt,
    unknownAfter,
    canMarkSent: canResolve,
    canRetryAnyway: canResolve,
  };
}

function parseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
