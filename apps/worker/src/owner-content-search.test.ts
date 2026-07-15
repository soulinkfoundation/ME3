import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { searchAgentOwnerContent } from "@me3-core/plugin-agent-chat";

type SearchRow = {
  source_type: "journal" | "mission_task";
  source_id: string;
  title: string;
  snippet: string | null;
  project_id: string | null;
  project_name: string | null;
  status: string | null;
  source_date: string | null;
  updated_at: string;
};

describe("owner content search", () => {
  it("finds a mistyped title beyond the old 100-task listing ceiling", async () => {
    const titles = Array.from({ length: 125 }, (_, index) => taskRow(
      `task-${index}`,
      `Routine backlog item ${index}`,
    ));
    titles.push(taskRow("task-cooking", "Eating our own AI cooking"));
    const database = searchDb({ titles });

    const found = await searchAgentOwnerContent(database.db, "owner", {
      query: "Eting our own AI cooking",
      sourceType: "mission_task",
    });

    expect(found.results[0]).toMatchObject({
      sourceId: "task-cooking",
      title: "Eating our own AI cooking",
      match: "fuzzy_title",
    });
    expect(database.calls[1]?.sql).not.toContain("LIMIT");
  });

  it("marks similarly strong title candidates as ambiguous", async () => {
    const database = searchDb({
      titles: [
        taskRow("task-me3", "Launch plan for ME3"),
        taskRow("task-soulink", "Launch plan for Soulink"),
      ],
    });

    const found = await searchAgentOwnerContent(database.db, "owner", {
      query: "Launch plan",
    });

    expect(found.ambiguous).toBe(true);
    expect(found.results.map((result) => result.sourceId)).toEqual([
      "task-me3",
      "task-soulink",
    ]);
  });

  it("returns mixed lightweight FTS candidates and bounds long snippets", async () => {
    const database = searchDb({
      fullText: [
        {
          ...journalRow("journal-1", "Agent context notes"),
          snippet: "context ".repeat(100),
        },
        {
          ...taskRow("task-1", "Harden agent context"),
          snippet: "Preserve the selected source between turns.",
        },
      ],
    });

    const found = await searchAgentOwnerContent(database.db, "owner", {
      query: "agent context",
      limit: 10,
    });

    expect(found.results.map((result) => result.sourceType)).toEqual([
      "journal",
      "mission_task",
    ]);
    expect(found.results[0]?.snippet?.length).toBeLessThanOrEqual(280);
    expect(found.results[0]).not.toHaveProperty("body");
  });

  it("scopes source, project, status, and date filters in both queries", async () => {
    const database = searchDb();

    await searchAgentOwnerContent(database.db, "owner", {
      query: "launch",
      sourceType: "mission_task",
      projectId: "project-me3",
      status: "in_progress",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    for (const call of database.calls) {
      expect(call.sql).toContain("source_type = ?");
      expect(call.sql).toContain("project_id = ?");
      expect(call.sql).toContain("status = ?");
      expect(call.sql).toContain("source_date >= ?");
      expect(call.sql).toContain("source_date <= ?");
      expect(call.values).toEqual(expect.arrayContaining([
        "owner",
        "mission_task",
        "project-me3",
        "in_progress",
        "2026-07-01",
        "2026-07-31",
      ]));
    }
  });

  it("backfills only active sources and removes archived records through update triggers", () => {
    const migration = readFileSync(
      new URL("../migrations/0019_owner_content_search.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE VIRTUAL TABLE owner_content_search USING fts5");
    expect(migration).toMatch(/owner_content_search_journal_update[\s\S]*DELETE FROM owner_content_search[\s\S]*WHERE NEW\.archived_at IS NULL/);
    expect(migration).toMatch(/owner_content_search_task_update[\s\S]*DELETE FROM owner_content_search[\s\S]*WHERE NEW\.archived_at IS NULL/);
    expect(migration).toMatch(/FROM journal_entries\s+WHERE archived_at IS NULL/);
    expect(migration).toMatch(/FROM mission_tasks t[\s\S]*WHERE t\.archived_at IS NULL/);
  });
});

function searchDb(input: { fullText?: SearchRow[]; titles?: SearchRow[] } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async all<T>() {
          calls.push({ sql, values });
          const rows = sql.includes("MATCH") ? input.fullText || [] : input.titles || [];
          return { results: rows as T[] };
        },
      };
    },
  };
  return { db, calls };
}

function taskRow(id: string, title: string): SearchRow {
  return {
    source_type: "mission_task",
    source_id: id,
    title,
    snippet: null,
    project_id: "project-me3",
    project_name: "ME3",
    status: "in_progress",
    source_date: "2026-07-20",
    updated_at: "2026-07-15T10:00:00Z",
  };
}

function journalRow(id: string, title: string): SearchRow {
  return {
    source_type: "journal",
    source_id: id,
    title,
    snippet: null,
    project_id: null,
    project_name: null,
    status: null,
    source_date: "2026-07-14",
    updated_at: "2026-07-14T10:00:00Z",
  };
}
