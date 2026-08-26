import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runCoreAgentToolTurn,
  type AgentChatRuntimeStreamEvent,
  type AgentToolMessage,
} from "@me3-core/plugin-agent-chat";

afterEach(() => {
  vi.useRealTimers();
});

describe("Status update agent runtime", () => {
  it("builds a bounded current briefing in one model request without email or Journal reads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T09:00:00.000Z"));
    const database = createStatusUpdateDb();
    const events: AgentChatRuntimeStreamEvent[] = [];
    const run = vi.fn(async (
      _model: string,
      _input: unknown,
      _options?: unknown,
    ) => ({
      response: [
        "**Now**",
        "Start the launch checklist before your client call.",
        "",
        "**Coming up**",
        "Client call at 1pm today.",
        "",
        "**Reminders**",
        "Call Sarah tomorrow morning.",
      ].join("\n"),
    }));

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "status-update-request",
      turnId: "status-update-turn",
      ownerTimezone: "Europe/Dublin",
      route: workersGatewayRoute(run) as never,
      messages: baseMessages("Status update"),
      streamOptions: {
        onEvent: (event) => {
          events.push(event);
        },
      },
    });

    expect(response.replyText).toContain("**Now**");
    expect(run).toHaveBeenCalledTimes(1);
    const modelInput = run.mock.calls[0]?.[1] as {
      messages: AgentToolMessage[];
      tools: unknown[];
    };
    expect(modelInput.tools).toEqual([]);
    expect(modelInput.messages[0]?.content).toContain("Status update mode:");
    expect(modelInput.messages[0]?.content).toContain("Now, Coming up, and Reminders");
    expect(modelInput.messages[0]?.content).toContain("Launch ME3 calmly");
    expect(modelInput.messages[0]?.content).toContain("Ship launch checklist");
    expect(modelInput.messages[0]?.content).toContain("Client call");
    expect(modelInput.messages[0]?.content).toContain("Call Sarah");
    expect(modelInput.messages[0]?.content).toContain(
      "Want me to check your email or Journal entries too?",
    );
    const snapshotJson = modelInput.messages[0]?.content.split(
      "Bounded status snapshot: ",
    )[1] || "";
    expect(snapshotJson.length).toBeGreaterThan(0);
    expect(snapshotJson.length).toBeLessThan(4_000);
    expect(run.mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      gateway: expect.objectContaining({ requestTimeoutMs: 12_000 }),
    }));
    expect(database.sql.join("\n")).not.toMatch(
      /mailbox_messages|journal_entries|mission_private_memory/i,
    );
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "status",
        data: expect.objectContaining({ state: "status_update_loading" }),
      }),
      expect.objectContaining({
        event: "status",
        data: expect.objectContaining({
          state: "model_started",
          intent: "status_update",
        }),
      }),
    ]));
    expect(response.streamMetrics).toMatchObject({
      modelRequestCount: 1,
      toolCallCount: 0,
      availableToolCount: 0,
      toolSchemaCharacterCount: 0,
    });
  });

  it("marks a failed calendar source as unavailable instead of calling it clear", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T09:00:00.000Z"));
    const database = createStatusUpdateDb({ failCalendar: true });
    const run = vi.fn(async (_model: string, _input: unknown) => ({
      response: "**Now**\nYour calendar is unavailable, so I have not assumed you are free.",
    }));

    await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "status-update-partial-request",
      turnId: "status-update-partial-turn",
      ownerTimezone: "Europe/Dublin",
      route: workersGatewayRoute(run) as never,
      messages: baseMessages("Give me a status update."),
    });

    const modelInput = run.mock.calls[0]?.[1] as { messages: AgentToolMessage[] };
    expect(modelInput.messages[0]?.content).toContain(
      '"calendar":{"status":"unavailable"',
    );
  });
});

function baseMessages(message: string): AgentToolMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are ME3.",
        "Mission statement:",
        "- Help people work calmly.",
        "Goals:",
        "- Launch ME3 calmly",
      ].join("\n"),
    },
    { role: "user", content: message },
  ];
}

function workersGatewayRoute(run: ReturnType<typeof vi.fn>) {
  return {
    providerId: "workers-ai" as const,
    model: "workers-test-model",
    backupModel: null,
    apiKey: null,
    ai: { run },
    aiGateway: {
      accountId: null,
      gatewayId: "default",
      apiToken: null,
      routeWorkersAi: true,
      routeExternalProviders: false,
    },
    aiGatewayRequestPolicy: {
      requestTimeoutMs: 12_000,
      maxAttempts: 1 as const,
    },
    configured: true,
  };
}

function createStatusUpdateDb(options: { failCalendar?: boolean } = {}) {
  const sql: string[] = [];
  const db = {
    prepare(query: string) {
      sql.push(query);
      return {
        bind(..._values: unknown[]) {
          return {
            async first<T>() {
              return null as T | null;
            },
            async run() {
              return { meta: { changes: 0 } };
            },
            async all<T>() {
              if (query.includes("SUM(CASE WHEN status = 'in_progress'")) {
                return {
                  results: [{
                    in_progress_count: 0,
                    backlog_count: 2,
                    overdue_count: 0,
                    due_today_count: 1,
                  }] as T[],
                };
              }
              if (query.includes("FROM mission_tasks t")) {
                return {
                  results: [{
                    id: "task-launch",
                    title: "Ship launch checklist",
                    description: "Complete the final launch readiness checks.",
                    project_name: "ME3 Launch",
                    status: "backlog",
                    priority: 1,
                    due_at: "2026-08-26",
                    scheduled_for: null,
                    pinned_at: null,
                  }] as T[],
                };
              }
              if (query.includes("FROM user_calendar_events")) {
                if (options.failCalendar) throw new Error("calendar unavailable");
                if (query.includes("recurrence_rule IS NOT NULL")) {
                  return { results: [] as T[] };
                }
                return {
                  results: [{
                    id: "event-client-call",
                    title: "Client call",
                    notes: null,
                    location: "Online",
                    starts_at: "2026-08-26T12:00:00.000Z",
                    ends_at: "2026-08-26T12:30:00.000Z",
                    timezone: "Europe/Dublin",
                    all_day: 0,
                    kind: "event",
                    recurrence_rule: null,
                  }] as T[],
                };
              }
              if (query.includes("FROM calendar_source_events")) {
                if (options.failCalendar) throw new Error("calendar unavailable");
                return { results: [] as T[] };
              }
              if (query.includes("FROM bookings b")) {
                return { results: [] as T[] };
              }
              if (query.includes("FROM user_reminders")) {
                return {
                  results: [{
                    id: "reminder-sarah",
                    title: "Call Sarah",
                    notes: null,
                    remind_at: "2026-08-27T08:00:00.000Z",
                    timezone: "Europe/Dublin",
                    recurrence_rule: null,
                    context_type: null,
                    context_id: null,
                    context_label: null,
                    status: "pending",
                    delivered_at: null,
                    dismissed_at: null,
                    created_at: "2026-08-25T08:00:00.000Z",
                  }] as T[],
                };
              }
              throw new Error(`Unexpected query: ${query}`);
            },
          };
        },
      };
    },
  };
  return { db, sql };
}
