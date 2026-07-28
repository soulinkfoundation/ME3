import { describe, expect, it, vi } from "vitest";
import {
  runCoreAgentToolTurn,
  type AgentToolMessage,
} from "@me3-core/plugin-agent-chat";
import { readCalendarEventsForAgent } from "@me3-core/plugin-calendar";

describe("Calendar Agent read contract", () => {
  it("reads owner-scoped personal and imported events through Runtime v2", async () => {
    const database = createCalendarDb();
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: "calendar-read-1",
            name: "core_calendar_events_list",
            arguments: {
              dateFrom: "2026-07-28",
              dateTo: "2026-07-28",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        response: "You have a planning session and an imported client call today.",
      });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "calendar-read-request",
      turnId: "calendar-read-turn",
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
      messages: baseMessages("What is on my calendar today?"),
    });

    expect(response).toMatchObject({
      specialist: "core.calendar.events.list",
      replyText: "You have a planning session and an imported client call today.",
    });
    expect(JSON.stringify(aiRun.mock.calls[1]?.[1])).toContain("Planning session");
    expect(JSON.stringify(aiRun.mock.calls[1]?.[1])).toContain("Imported client call");
    expect(JSON.stringify(aiRun.mock.calls[1]?.[1])).not.toContain("Other owner event");
    expect(database.executions[0]?.result_json).toContain("Imported client call");
  });

  it("rejects calendar reads longer than 31 days", async () => {
    const database = createCalendarDb();
    await expect(
      readCalendarEventsForAgent(
        database.db,
        "owner",
        "Europe/Dublin",
        { dateFrom: "2026-07-01", dateTo: "2026-08-01" },
      ),
    ).rejects.toThrow("limited to 31 days");
  });
});

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function createCalendarDb() {
  const nativeEvents = [
    {
      id: "native-1",
      user_id: "owner",
      title: "Planning session",
      notes: "Review the launch plan.",
      location: "Studio",
      starts_at: "2026-07-28T09:00:00.000Z",
      ends_at: "2026-07-28T10:00:00.000Z",
      timezone: "Europe/Dublin",
      all_day: 0,
      kind: "event",
      recurrence_rule: null,
    },
    {
      id: "native-other",
      user_id: "someone-else",
      title: "Other owner event",
      notes: null,
      location: null,
      starts_at: "2026-07-28T11:00:00.000Z",
      ends_at: "2026-07-28T12:00:00.000Z",
      timezone: "Europe/Dublin",
      all_day: 0,
      kind: "event",
      recurrence_rule: null,
    },
  ];
  const importedEvents = [
    {
      id: "imported-1",
      user_id: "owner",
      source_status: "active",
      source_name: "Work calendar",
      title: "Imported client call",
      notes: null,
      location: "Online",
      starts_at: "2026-07-28T13:00:00.000Z",
      ends_at: "2026-07-28T14:00:00.000Z",
      timezone: "Europe/Dublin",
      all_day: 0,
      recurrence_rule: null,
    },
  ];
  const executions: Array<{
    id: string;
    user_id: string;
    request_id: string;
    tool_call_id: string;
    tool_name: string;
    status: string;
    result_json: string | null;
    error_message: string | null;
  }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (!sql.includes("FROM agent_tool_executions")) return null as T;
              return (executions.find(
                (item) =>
                  item.user_id === values[0] &&
                  item.request_id === values[1] &&
                  item.tool_call_id === values[2],
              ) || null) as T;
            },
            async all<T>() {
              if (sql.includes("FROM user_calendar_events")) {
                const recurring = sql.includes("recurrence_rule IS NOT NULL");
                const rows = nativeEvents.filter(
                  (event) =>
                    event.user_id === values[0] &&
                    (recurring
                      ? event.recurrence_rule !== null
                      : event.recurrence_rule === null &&
                        event.ends_at > String(values[1]) &&
                        event.starts_at < String(values[2])),
                );
                return { results: rows as T[] };
              }
              if (sql.includes("FROM calendar_source_events")) {
                const rows = importedEvents.filter(
                  (event) =>
                    event.user_id === values[0] &&
                    event.source_status === "active" &&
                    event.ends_at > String(values[1]) &&
                    event.starts_at < String(values[2]),
                );
                return { results: rows as T[] };
              }
              return { results: [] as T[] };
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
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
  return { db, executions };
}
