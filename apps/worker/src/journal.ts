import {
  normalizeJournalBodyFormat,
  normalizeJournalDateKey,
  type JournalBodyFormat,
} from "@me3-core/plugin-journal";
import type { Env } from "./types";

export class JournalInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 = 400,
  ) {
    super(message);
  }
}

type JournalEntryRow = {
  id: string;
  user_id: string;
  entry_date: string;
  title: string | null;
  body: string;
  body_format: JournalBodyFormat;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

function requireDateKey(value: unknown): string {
  const normalized = normalizeJournalDateKey(value);
  if (!normalized) {
    throw new JournalInputError("Journal date must use YYYY-MM-DD");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 180) : null;
}

function normalizeListLimit(value: unknown, fallback = 100): number {
  const parsed =
    typeof value === "string" || typeof value === "number"
      ? Number.parseInt(String(value), 10)
      : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 200));
}

function newJournalEntryId(date: string): string {
  return `journal_${date}_${crypto.randomUUID()}`;
}

function serializeEntry(row: JournalEntryRow) {
  return {
    id: row.id,
    date: row.entry_date,
    title: row.title,
    body: row.body,
    bodyFormat: row.body_format,
    metadata: JSON.parse(row.metadata_json || "{}") as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function journalBodyPreview(body: string): string {
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function rowHasJournalContent(row: JournalEntryRow): boolean {
  return Boolean((row.title || "").trim() || journalBodyPreview(row.body));
}

function serializeArchiveEntry(row: JournalEntryRow) {
  return {
    ...serializeEntry(row),
    preview: journalBodyPreview(row.body),
  };
}

export async function getJournalDay(env: Env, userId: string, date: string) {
  const normalizedDate = requireDateKey(date);
  const row = await env.DB.prepare(
    `SELECT id, user_id, entry_date, title, body, body_format, metadata_json,
            created_at, updated_at, archived_at
     FROM journal_entries
     WHERE user_id = ? AND entry_date = ? AND archived_at IS NULL`,
  )
    .bind(userId, normalizedDate)
    .first<JournalEntryRow>();

  return { entry: row ? serializeEntry(row) : null };
}

export async function updateJournalDay(
  env: Env,
  userId: string,
  date: string,
  input: unknown,
) {
  const normalizedDate = requireDateKey(date);
  const body = isRecord(input) ? input : {};
  const entryBody = typeof body.body === "string" ? body.body : "";
  const title = normalizeNullableText(body.title);
  const bodyFormat = normalizeJournalBodyFormat(body.bodyFormat) || "html";
  const now = new Date().toISOString();
  const id = newJournalEntryId(normalizedDate);

  await env.DB.prepare(
    `INSERT INTO journal_entries (
       id, user_id, entry_date, title, body, body_format, metadata_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)
     ON CONFLICT(user_id, entry_date) DO UPDATE SET
       title = excluded.title,
       body = excluded.body,
       body_format = excluded.body_format,
       updated_at = excluded.updated_at,
       archived_at = NULL`,
  )
    .bind(id, userId, normalizedDate, title, entryBody, bodyFormat, now, now)
    .run();

  const saved = await env.DB.prepare(
    `SELECT id, user_id, entry_date, title, body, body_format, metadata_json,
            created_at, updated_at, archived_at
     FROM journal_entries
     WHERE user_id = ? AND entry_date = ?`,
  )
    .bind(userId, normalizedDate)
    .first<JournalEntryRow>();

  if (!saved) throw new JournalInputError("Journal entry could not be saved");
  return { entry: serializeEntry(saved) };
}

export async function deleteJournalDay(env: Env, userId: string, date: string) {
  const normalizedDate = requireDateKey(date);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE journal_entries
     SET archived_at = ?, updated_at = ?
     WHERE user_id = ? AND entry_date = ? AND archived_at IS NULL`,
  )
    .bind(now, now, userId, normalizedDate)
    .run();

  return { ok: true };
}

export async function listJournalArchive(
  env: Env,
  userId: string,
  options: { limit?: unknown } = {},
) {
  const limit = normalizeListLimit(options.limit, 100);
  const rows = await env.DB.prepare(
    `SELECT id, user_id, entry_date, title, body, body_format, metadata_json,
            created_at, updated_at, archived_at
     FROM journal_entries
     WHERE user_id = ?
       AND archived_at IS NULL
     ORDER BY entry_date DESC, updated_at DESC
     LIMIT ?`,
  )
    .bind(userId, 200)
    .all<JournalEntryRow>();

  return {
    entries: (rows.results || [])
      .filter(rowHasJournalContent)
      .slice(0, limit)
      .map(serializeArchiveEntry),
  };
}
