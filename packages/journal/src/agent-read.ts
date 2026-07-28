import {
  normalizeJournalBodyFormat,
  normalizeJournalDateKey,
  type JournalBodyFormat,
} from "./schema";

type JournalAgentStatement = {
  all<T = unknown>(): Promise<{ results?: T[] }>;
};

export type JournalAgentDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): JournalAgentStatement;
  };
};

export type JournalAgentReadInput =
  | {
      mode: "latest";
      limit?: number;
    }
  | {
      mode: "date";
      date: string;
    }
  | {
      mode: "range";
      dateFrom: string;
      dateTo: string;
      limit?: number;
    };

export type JournalAgentEntry = {
  id: string;
  date: string;
  title: string | null;
  body: string;
  bodyFormat: JournalBodyFormat;
  updatedAt: string;
  revision: number;
  bodyTruncated: boolean;
};

export type JournalAgentReadResult = {
  mode: JournalAgentReadInput["mode"];
  dateFrom: string | null;
  dateTo: string | null;
  entries: JournalAgentEntry[];
  hasMore: boolean;
};

type JournalAgentEntryRow = {
  id: string;
  entry_date: string;
  title: string | null;
  body: string;
  body_format: string;
  updated_at: string;
  revision: number;
};

const DEFAULT_LATEST_JOURNAL_LIMIT = 7;
const DEFAULT_RANGE_JOURNAL_LIMIT = 31;
const MAX_JOURNAL_READ_LIMIT = 50;
const MAX_AGENT_JOURNAL_BODY_CHARS = 12_000;

export async function readJournalEntriesForAgent(
  db: JournalAgentDb,
  userId: string,
  input: JournalAgentReadInput,
): Promise<JournalAgentReadResult> {
  if (input.mode === "date") {
    const date = requiredJournalDate(input.date, "Journal date");
    const rows = await db.prepare(
      `SELECT id, entry_date, title, body, body_format, updated_at, revision
       FROM journal_entries
       WHERE user_id = ? AND entry_date = ? AND archived_at IS NULL
       LIMIT 1`,
    )
      .bind(userId, date)
      .all<JournalAgentEntryRow>();
    return {
      mode: input.mode,
      dateFrom: date,
      dateTo: date,
      entries: (rows.results || []).map(serializeJournalAgentEntry),
      hasMore: false,
    };
  }

  if (input.mode === "range") {
    const dateFrom = requiredJournalDate(input.dateFrom, "Journal start date");
    const dateTo = requiredJournalDate(input.dateTo, "Journal end date");
    if (dateFrom > dateTo) {
      throw new Error("Journal start date must be on or before the end date.");
    }
    const limit = journalReadLimit(input.limit, DEFAULT_RANGE_JOURNAL_LIMIT);
    const rows = await db.prepare(
      `SELECT id, entry_date, title, body, body_format, updated_at, revision
       FROM journal_entries
       WHERE user_id = ? AND entry_date >= ? AND entry_date <= ?
         AND archived_at IS NULL
         AND (TRIM(COALESCE(title, '')) != '' OR TRIM(COALESCE(body, '')) != '')
       ORDER BY entry_date ASC, updated_at ASC
       LIMIT ?`,
    )
      .bind(userId, dateFrom, dateTo, limit + 1)
      .all<JournalAgentEntryRow>();
    const entries = rows.results || [];
    return {
      mode: input.mode,
      dateFrom,
      dateTo,
      entries: entries.slice(0, limit).map(serializeJournalAgentEntry),
      hasMore: entries.length > limit,
    };
  }

  const limit = journalReadLimit(input.limit, DEFAULT_LATEST_JOURNAL_LIMIT);
  const rows = await db.prepare(
    `SELECT id, entry_date, title, body, body_format, updated_at, revision
     FROM journal_entries
     WHERE user_id = ? AND archived_at IS NULL
       AND (TRIM(COALESCE(title, '')) != '' OR TRIM(COALESCE(body, '')) != '')
     ORDER BY entry_date DESC, updated_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit + 1)
    .all<JournalAgentEntryRow>();
  const entries = rows.results || [];
  return {
    mode: input.mode,
    dateFrom: null,
    dateTo: null,
    entries: entries.slice(0, limit).map(serializeJournalAgentEntry),
    hasMore: entries.length > limit,
  };
}

function requiredJournalDate(value: unknown, label: string): string {
  const date = normalizeJournalDateKey(value);
  if (!date) throw new Error(`${label} must use YYYY-MM-DD.`);
  return date;
}

function journalReadLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), MAX_JOURNAL_READ_LIMIT));
}

function serializeJournalAgentEntry(row: JournalAgentEntryRow): JournalAgentEntry {
  const body = typeof row.body === "string" ? row.body : "";
  const bodyTruncated = body.length > MAX_AGENT_JOURNAL_BODY_CHARS;
  return {
    id: row.id,
    date: row.entry_date,
    title: row.title?.trim() || null,
    body: bodyTruncated ? body.slice(0, MAX_AGENT_JOURNAL_BODY_CHARS) : body,
    bodyFormat: normalizeJournalBodyFormat(row.body_format) || "plain_text",
    updatedAt: row.updated_at,
    revision: Number(row.revision || 0),
    bodyTruncated,
  };
}
