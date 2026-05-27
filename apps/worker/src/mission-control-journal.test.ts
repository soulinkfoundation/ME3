import { describe, expect, it } from "vitest";
import { listMissionJournalEntries } from "./mission-control";
import type { Env } from "./types";

type StoredJournalRow = {
  id: string;
  user_id: string;
  date: string;
  title: string | null;
  journal_text: string;
  created_at: string;
  updated_at: string;
};

function createJournalEnv(rows: StoredJournalRow[]) {
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async all<T>() {
              if (sql.includes("FROM mission_daily_notes")) {
                const [userId, limit] = values;
                const results = rows
                  .filter(
                    (row) =>
                      row.user_id === userId && row.journal_text.trim().length > 0,
                  )
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, Number(limit || 100));
                return { results: results as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  };

  return { DB: db } as unknown as Env;
}

describe("Mission Control journal archive", () => {
  it("lists non-empty journal entries newest first with a compact preview", async () => {
    const env = createJournalEnv([
      {
        id: "old",
        user_id: "owner",
        date: "2026-05-20",
        title: null,
        journal_text: "Older entry",
        created_at: "2026-05-20T09:00:00Z",
        updated_at: "2026-05-20T09:00:00Z",
      },
      {
        id: "blank",
        user_id: "owner",
        date: "2026-05-21",
        title: null,
        journal_text: "   ",
        created_at: "2026-05-21T09:00:00Z",
        updated_at: "2026-05-21T09:00:00Z",
      },
      {
        id: "new",
        user_id: "owner",
        date: "2026-05-22",
        title: null,
        journal_text: "A newer\n\nentry with spacing.",
        created_at: "2026-05-22T09:00:00Z",
        updated_at: "2026-05-22T09:00:00Z",
      },
    ]);

    await expect(listMissionJournalEntries(env, "owner")).resolves.toEqual([
      {
        id: "new",
        date: "2026-05-22",
        preview: "A newer entry with spacing.",
        journalText: "A newer\n\nentry with spacing.",
      },
      {
        id: "old",
        date: "2026-05-20",
        preview: "Older entry",
        journalText: "Older entry",
      },
    ]);
  });
});
