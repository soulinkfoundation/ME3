import { describe, expect, it, vi } from "vitest";
import {
  runCoreAgentToolTurn,
  type AgentToolMessage,
} from "@me3-core/plugin-agent-chat";
import {
  readJournalEntriesForAgent,
} from "@me3-core/plugin-journal";

type JournalRow = {
  id: string;
  user_id: string;
  entry_date: string;
  title: string | null;
  body: string;
  body_format: string;
  updated_at: string;
  revision: number;
  archived_at: string | null;
};

type ToolExecution = {
  id: string;
  user_id: string;
  request_id: string;
  tool_call_id: string;
  tool_name: string;
  status: "running" | "succeeded" | "failed";
  result_json: string | null;
  error_message: string | null;
};

describe("Journal Agent read contract", () => {
  it("reads the latest seven non-empty entries by default", async () => {
    const database = createJournalDb(
      Array.from({ length: 9 }, (_, index) =>
        journalRow(
          `2026-07-${String(index + 1).padStart(2, "0")}`,
          `Entry ${index + 1}`,
        )
      ),
    );

    const result = await readJournalEntriesForAgent(
      database.db,
      "owner",
      { mode: "latest" },
    );

    expect(result.entries).toHaveLength(7);
    expect(result.entries[0]?.date).toBe("2026-07-09");
    expect(result.entries[6]?.date).toBe("2026-07-03");
    expect(result.hasMore).toBe(true);
  });

  it("reads an exact date and an inclusive range", async () => {
    const database = createJournalDb([
      journalRow("2026-07-01", "First"),
      journalRow("2026-07-02", "Second"),
      journalRow("2026-07-03", "Third"),
    ]);

    const exact = await readJournalEntriesForAgent(
      database.db,
      "owner",
      { mode: "date", date: "2026-07-02" },
    );
    const range = await readJournalEntriesForAgent(
      database.db,
      "owner",
      {
        mode: "range",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-02",
      },
    );

    expect(exact.entries.map((entry) => entry.title)).toEqual(["Second"]);
    expect(range.entries.map((entry) => entry.title)).toEqual(["First", "Second"]);
  });

  it("rejects an inverted date range", async () => {
    const database = createJournalDb([]);
    await expect(
      readJournalEntriesForAgent(database.db, "owner", {
        mode: "range",
        dateFrom: "2026-07-10",
        dateTo: "2026-07-01",
      }),
    ).rejects.toThrow("on or before");
  });
});

describe("Journal Agent Runtime v2 tool", () => {
  it("returns Journal data through the general read capability", async () => {
    const database = createJournalDb([
      journalRow("2026-07-28", "Today", "<p>Grounded Journal text.</p>"),
    ]);
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: "journal-read-1",
            name: "core_journal_read",
            arguments: {
              mode: "date",
              date: "2026-07-28",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        response: "Your Journal entry says: Grounded Journal text.",
      });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "journal-read-request",
      turnId: "journal-read-turn",
      ownerTimezone: "Europe/Dublin",
      route: {
        providerId: "workers-ai",
        model: "workers-test-model",
        backupModel: null,
        apiKey: null,
        ai: { run: aiRun },
        aiGateway: null,
        configured: true,
      } as never,
      messages: baseMessages("Read my Journal entry for today."),
    });

    expect(response).toMatchObject({
      specialist: "core.journal.read",
      replyText: "Your Journal entry says: Grounded Journal text.",
      sourceReference: {
        sourceType: "journal",
        sourceId: "journal-2026-07-28",
      },
    });
    expect(database.executions).toHaveLength(1);
    expect(database.executions[0]?.result_json).toContain("Grounded Journal text.");
  });
});

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function journalRow(
  date: string,
  title: string,
  body = `Body for ${title}.`,
): JournalRow {
  return {
    id: `journal-${date}`,
    user_id: "owner",
    entry_date: date,
    title,
    body,
    body_format: "html",
    updated_at: `${date}T12:00:00.000Z`,
    revision: 1,
    archived_at: null,
  };
}

function createJournalDb(initialRows: JournalRow[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const executions: ToolExecution[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM agent_tool_executions")) {
                return (executions.find(
                  (execution) =>
                    execution.user_id === values[0] &&
                    execution.request_id === values[1] &&
                    execution.tool_call_id === values[2],
                ) || null) as T;
              }
              return null as T;
            },
            async all<T>() {
              if (sql.includes("FROM journal_entries")) {
                return {
                  results: selectJournalRows(rows, sql, values) as T[],
                };
              }
              return { results: [] as T[] };
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
                if (!executions.some(
                  (execution) =>
                    execution.user_id === values[1] &&
                    execution.request_id === values[2] &&
                    execution.tool_call_id === values[3],
                )) {
                  executions.push({
                    id: values[0] as string,
                    user_id: values[1] as string,
                    request_id: values[2] as string,
                    tool_call_id: values[3] as string,
                    tool_name: values[4] as string,
                    status: "running",
                    result_json: null,
                    error_message: null,
                  });
                }
              }
              if (sql.includes("UPDATE agent_tool_executions")) {
                const execution = executions.find((item) => item.id === values[1]);
                if (execution && sql.includes("status = 'succeeded'")) {
                  execution.status = "succeeded";
                  execution.result_json = values[0] as string;
                }
                if (execution && sql.includes("status = 'failed'")) {
                  execution.status = "failed";
                  execution.error_message = values[0] as string;
                }
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { db, rows, executions };
}

function selectJournalRows(
  rows: JournalRow[],
  sql: string,
  values: unknown[],
): JournalRow[] {
  const ownerId = String(values[0]);
  let selected = rows.filter(
    (row) =>
      row.user_id === ownerId &&
      row.archived_at === null &&
      (row.title?.trim() || row.body.trim()),
  );
  let limit = 1;

  if (sql.includes("entry_date = ?")) {
    selected = selected.filter((row) => row.entry_date === values[1]);
  } else if (sql.includes("entry_date >= ?")) {
    selected = selected
      .filter(
        (row) =>
          row.entry_date >= String(values[1]) &&
          row.entry_date <= String(values[2]),
      )
      .sort((left, right) => left.entry_date.localeCompare(right.entry_date));
    limit = Number(values[3]);
  } else {
    selected = selected.sort((left, right) =>
      right.entry_date.localeCompare(left.entry_date)
    );
    limit = Number(values[1]);
  }

  return selected.slice(0, limit);
}
