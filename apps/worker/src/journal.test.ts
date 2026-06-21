import { describe, expect, it } from "vitest";
import {
  deleteJournalDay,
  getJournalDay,
  listJournalArchive,
  updateJournalDay,
} from "./journal";
import type { Env } from "./types";

type StoredJournalRow = {
  id: string;
  user_id: string;
  entry_date: string;
  title: string | null;
  body: string;
  body_format: "plain_text" | "markdown" | "html";
  metadata_json: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

function createJournalEnv(rows: StoredJournalRow[] = []) {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (!sql.includes("FROM journal_entries")) return null;
              const [userId, date] = values;
              return (rows.find(
                (row) =>
                  row.user_id === userId &&
                  row.entry_date === date &&
                  row.archived_at === null,
              ) || null) as T | null;
            },
            async all<T>() {
              if (!sql.includes("FROM journal_entries")) {
                return { results: [] as T[] };
              }
              const [userId, limit] = values;
              const results = rows
                .filter(
                  (row) =>
                    row.user_id === userId &&
                    row.archived_at === null,
                )
                .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
                .slice(0, Number(limit || 100));
              return { results: results as T[] };
            },
            async run() {
              if (sql.includes("UPDATE journal_entries")) {
                const [archivedAt, updatedAt, userId, date] = values as string[];
                const existing = rows.find(
                  (row) =>
                    row.user_id === userId &&
                    row.entry_date === date &&
                    row.archived_at === null,
                );
                if (existing) {
                  existing.archived_at = archivedAt;
                  existing.updated_at = updatedAt;
                }
                return {};
              }
              if (!sql.includes("INSERT INTO journal_entries")) return {};
              const [id, userId, date, title, body, bodyFormat, createdAt, updatedAt] =
                values as string[];
              const existingIndex = rows.findIndex(
                (row) => row.user_id === userId && row.entry_date === date,
              );
              const nextRow: StoredJournalRow = {
                id,
                user_id: userId,
                entry_date: date,
                title: title || null,
                body,
                body_format: bodyFormat as StoredJournalRow["body_format"],
                metadata_json: "{}",
                created_at: createdAt,
                updated_at: updatedAt,
                archived_at: null,
              };
              if (existingIndex >= 0) {
                rows[existingIndex] = { ...rows[existingIndex], ...nextRow };
              } else {
                rows.push(nextRow);
              }
              return {};
            },
          };
        },
      };
    },
  };

  return { DB: db } as unknown as Env;
}

describe("Journal plugin entries", () => {
  it("does not create an entry when reading an empty day", async () => {
    const env = createJournalEnv();

    await expect(getJournalDay(env, "owner", "2026-06-02")).resolves.toEqual({
      entry: null,
    });
  });

  it("upserts a titled rich-text daily entry", async () => {
    const env = createJournalEnv();

    const result = await updateJournalDay(env, "owner", "2026-06-02", {
      title: "Launch notes",
      body: "<p>Remember this.</p>",
      bodyFormat: "html",
    });

    expect(result.entry.title).toBe("Launch notes");
    expect(result.entry.body).toBe("<p>Remember this.</p>");
    expect(result.entry.bodyFormat).toBe("html");
    await expect(getJournalDay(env, "owner", "2026-06-02")).resolves.toMatchObject({
      entry: {
        title: "Launch notes",
        body: "<p>Remember this.</p>",
      },
    });
  });

  it("lists non-empty archive entries newest first", async () => {
    const env = createJournalEnv([
      {
        id: "old",
        user_id: "owner",
        entry_date: "2026-05-20",
        title: null,
        body: "Older entry",
        body_format: "html",
        metadata_json: "{}",
        created_at: "2026-05-20T09:00:00Z",
        updated_at: "2026-05-20T09:00:00Z",
        archived_at: null,
      },
      {
        id: "blank",
        user_id: "owner",
        entry_date: "2026-05-21",
        title: "",
        body: "<p></p>",
        body_format: "html",
        metadata_json: "{}",
        created_at: "2026-05-21T09:00:00Z",
        updated_at: "2026-05-21T09:00:00Z",
        archived_at: null,
      },
      {
        id: "title-only",
        user_id: "owner",
        entry_date: "2026-05-23",
        title: "Title only",
        body: "<p></p>",
        body_format: "html",
        metadata_json: "{}",
        created_at: "2026-05-23T09:00:00Z",
        updated_at: "2026-05-23T09:00:00Z",
        archived_at: null,
      },
      {
        id: "new",
        user_id: "owner",
        entry_date: "2026-05-22",
        title: "Newer",
        body: "<p>A newer entry.</p>",
        body_format: "html",
        metadata_json: "{}",
        created_at: "2026-05-22T09:00:00Z",
        updated_at: "2026-05-22T09:00:00Z",
        archived_at: null,
      },
    ]);

    await expect(listJournalArchive(env, "owner")).resolves.toMatchObject({
      entries: [
        { id: "title-only", title: "Title only", preview: "" },
        { id: "new", title: "Newer", preview: "A newer entry." },
        { id: "old", title: null, preview: "Older entry" },
      ],
    });
  });

  it("soft-deletes an entry from day reads and archive lists", async () => {
    const env = createJournalEnv([
      {
        id: "entry",
        user_id: "owner",
        entry_date: "2026-05-24",
        title: "Delete me",
        body: "<p>Gone soon.</p>",
        body_format: "html",
        metadata_json: "{}",
        created_at: "2026-05-24T09:00:00Z",
        updated_at: "2026-05-24T09:00:00Z",
        archived_at: null,
      },
    ]);

    await expect(
      deleteJournalDay(env, "owner", "2026-05-24"),
    ).resolves.toEqual({ ok: true });

    await expect(getJournalDay(env, "owner", "2026-05-24")).resolves.toEqual({
      entry: null,
    });
    await expect(listJournalArchive(env, "owner")).resolves.toEqual({
      entries: [],
    });
  });
});
