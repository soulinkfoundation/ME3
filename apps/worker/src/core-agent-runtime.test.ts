import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runCoreAgentToolTurn,
  type AgentChatRuntimeStreamEvent,
  type AgentToolMessage,
} from "@me3-core/plugin-agent-chat";

type ReminderRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  timezone: string | null;
  recurrence_rule: string | null;
  source_dispatch_id: string | null;
  status: "pending" | "failed" | "cancelled";
  created_at: string;
};

type ExecutionRow = {
  id: string;
  user_id: string;
  request_id: string;
  tool_call_id: string;
  tool_name: string;
  status: "running" | "succeeded" | "failed";
  result_json: string | null;
  error_message: string | null;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Core Agent Runtime v2 reminders", () => {
  it.each(["workers-ai", "openai", "anthropic"] as const)(
    "executes the same typed create contract through %s",
    async (providerId) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T10:00:00Z"));
      const database = createReminderDb();
      const route = providerRoute(providerId, [
        providerToolCall(providerId, "create-1", "core_reminders_create", {
          title: "Call Sam",
          remindAt: "2026-07-11T09:00:00+01:00",
          timezone: "Europe/Dublin",
        }),
        providerText(providerId, "Done. I set the reminder for Saturday at 9:00."),
      ]);

      const response = await runCoreAgentToolTurn({
        db: database.db,
        userId: "owner",
        requestId: `request-${providerId}`,
        turnId: `turn-${providerId}`,
        ownerTimezone: "Europe/Dublin",
        route: route as never,
        messages: baseMessages("Remind me Saturday at 9am to call Sam"),
      });

      expect(response).toMatchObject({
        source: providerId,
        specialist: "core.reminders.create",
        reminderAction: {
          kind: "created",
          title: "Call Sam",
          remindAt: "2026-07-11T08:00:00.000Z",
        },
        actionCards: [
          expect.objectContaining({
            kind: "reminder.created",
            capabilityId: "core.reminders.create",
          }),
        ],
      });
      expect(database.reminders).toHaveLength(1);
      expect(database.reminders[0]).toMatchObject({
        title: "Call Sam",
        remind_at: "2026-07-11T08:00:00.000Z",
        timezone: "Europe/Dublin",
      });
      expect(database.executions).toHaveLength(1);
      expect(database.executions[0]).toMatchObject({
        tool_name: "core_reminders_create",
        status: "succeeded",
      });
    },
  );

  it("lists before updating and keeps missing Workers AI call IDs collision-free", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T10:00:00Z"));
    const database = createReminderDb([
      reminderRow("reminder-1", "Call Sam", "2026-07-11T08:00:00.000Z"),
    ]);
    const route = providerRoute("workers-ai", [
      {
        tool_calls: [{ name: "core_reminders_list", arguments: {} }],
      },
      {
        tool_calls: [
          {
            name: "core_reminders_update",
            arguments: {
              reminderId: "reminder-1",
              title: "Call Sam about launch",
              remindAt: "2026-07-11T12:00:00+01:00",
              timezone: "Europe/Dublin",
            },
          },
        ],
      },
      { response: "Updated it to noon." },
    ]);

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "request-update",
      turnId: "turn-update",
      ownerTimezone: "Europe/Dublin",
      route: route as never,
      messages: baseMessages("Move the Call Sam reminder to noon Saturday"),
    });

    expect(response).toMatchObject({
      source: "workers-ai",
      specialist: "core.reminders.update",
      reminderAction: {
        kind: "updated",
        reminderId: "reminder-1",
        remindAt: "2026-07-11T11:00:00.000Z",
      },
      actionCards: [expect.objectContaining({ kind: "reminder.updated" })],
    });
    expect(database.reminders[0]).toMatchObject({
      title: "Call Sam about launch",
      remind_at: "2026-07-11T11:00:00.000Z",
    });
    expect(database.executions.map((row) => row.tool_call_id)).toEqual([
      "workers_ai_call_1:1",
      "workers_ai_call_1:2",
    ]);
  });

  it("does not guess when multiple reminders could match", async () => {
    const database = createReminderDb([
      reminderRow("reminder-1", "Call Sam", "2026-07-11T08:00:00.000Z"),
      reminderRow("reminder-2", "Call Sam", "2026-07-12T08:00:00.000Z"),
    ]);
    const route = providerRoute("workers-ai", [
      providerToolCall("workers-ai", "list-1", "core_reminders_list", {}),
      { response: "I found two Call Sam reminders. Which one should I cancel?" },
    ]);

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "request-ambiguous",
      turnId: "turn-ambiguous",
      ownerTimezone: "Europe/Dublin",
      route: route as never,
      messages: baseMessages("Cancel the Call Sam reminder"),
    });

    expect(response.replyText).toContain("Which one");
    expect(response.reminderAction).toEqual({ kind: "listed" });
    expect(database.reminders.map((row) => row.status)).toEqual([
      "pending",
      "pending",
    ]);
  });

  it("cancels only the reminder named by a stable ID and preserves its action card", async () => {
    const database = createReminderDb([
      reminderRow("reminder-1", "Call Sam", "2026-07-11T08:00:00.000Z"),
    ]);
    const route = providerRoute("workers-ai", [
      providerToolCall("workers-ai", "cancel-1", "core_reminders_cancel", {
        reminderId: "reminder-1",
      }),
      { response: "Cancelled the Call Sam reminder." },
    ]);

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "request-cancel",
      turnId: "turn-cancel",
      ownerTimezone: "Europe/Dublin",
      route: route as never,
      messages: baseMessages("Cancel reminder ID reminder-1"),
    });

    expect(response).toMatchObject({
      specialist: "core.reminders.cancel",
      reminderAction: {
        kind: "cancelled",
        reminderId: "reminder-1",
        title: "Call Sam",
      },
      actionCards: [expect.objectContaining({ kind: "reminder.cancelled" })],
    });
    expect(database.reminders[0]?.status).toBe("cancelled");
  });

  it("replays a completed Runtime v2 create without duplicating the reminder", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T10:00:00Z"));
    const database = createReminderDb();
    const run = () =>
      runCoreAgentToolTurn({
        db: database.db,
        userId: "owner",
        requestId: "request-replay",
        turnId: "turn-replay",
        ownerTimezone: "Europe/Dublin",
        route: providerRoute("workers-ai", [
          providerToolCall("workers-ai", "create-replay", "core_reminders_create", {
            title: "Call Sam",
            remindAt: "2026-07-11T09:00:00+01:00",
            timezone: "Europe/Dublin",
          }),
          { response: "Reminder set." },
        ]) as never,
        messages: baseMessages("Remind me to call Sam"),
      });

    const first = await run();
    const replay = await run();

    expect(first.reminderAction).toEqual(replay.reminderAction);
    expect(database.reminders).toHaveLength(1);
    expect(database.executions).toHaveLength(1);
    expect(database.executions[0]?.status).toBe("succeeded");
  });

  it("streams model and tool lifecycle events with TTFT metrics", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T10:00:00Z"));
    const database = createReminderDb();
    const events: AgentChatRuntimeStreamEvent[] = [];
    const route = providerRoute("workers-ai", [
      sseStream([
        streamEvent({ choices: [{ delta: { tool_calls: [{
          index: 0,
          id: "create-stream",
          function: {
            name: "core_reminders_create",
            arguments: JSON.stringify({
              title: "Call Sam",
              remindAt: "2026-07-11T09:00:00+01:00",
              timezone: "Europe/Dublin",
            }),
          },
        }] } }] }),
        "data: [DONE]\n\n",
      ]),
      sseStream([
        streamEvent({ choices: [{ delta: { content: "Reminder " } }] }),
        streamEvent({ choices: [{ delta: { content: "created." } }] }),
        "data: [DONE]\n\n",
      ]),
    ]);

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "request-stream",
      turnId: "turn-stream",
      ownerTimezone: "Europe/Dublin",
      route: route as never,
      messages: baseMessages("Remind me to call Sam on 11 July at 9am."),
      streamOptions: {
        onEvent: (event) => {
          events.push(event);
        },
      },
    });

    expect(response.replyText).toBe("Reminder created.");
    expect(response.streamMetrics).toMatchObject({
      timeToFirstTokenMs: expect.any(Number),
      totalDurationMs: expect.any(Number),
      deltaCount: 2,
    });
    expect(events.map((event) => `${event.event}:${String(event.data.state || "delta")}`))
      .toEqual([
        "status:model_started",
        "tool:started",
        "tool:completed",
        "status:model_started",
        "delta:delta",
        "delta:delta",
      ]);
    expect(events.find((event) => event.event === "tool")?.data).toMatchObject({
      clearText: true,
      capabilityId: "core.reminders.create",
    });
    expect(database.reminders).toHaveLength(1);
  });

  it("returns invalid and past timestamps to the model without writing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T10:00:00Z"));
    const database = createReminderDb();
    const run = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: "past-1",
            name: "core_reminders_create",
            arguments: {
              title: "Call Sam",
              remindAt: "2026-06-30T09:00:00+01:00",
              timezone: "Europe/Dublin",
            },
          },
        ],
      })
      .mockResolvedValueOnce({ response: "That time has passed. What future time should I use?" });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "request-past",
      turnId: "turn-past",
      ownerTimezone: "Europe/Dublin",
      route: workersRoute(run) as never,
      messages: baseMessages("Remind me yesterday to call Sam"),
    });

    expect(response.replyText).toContain("What future time");
    expect(response.reminderAction).toBeNull();
    expect(database.reminders).toHaveLength(0);
    expect(database.executions[0]).toMatchObject({
      status: "failed",
      error_message: expect.stringContaining("must be in the future"),
    });
    const secondRequest = run.mock.calls[1]?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(secondRequest.messages.at(-1)?.content).toContain(
      "Reminder time must be in the future",
    );
  });
});

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function providerRoute(providerId: "workers-ai" | "openai" | "anthropic", payloads: unknown[]) {
  const next = vi.fn(async () => payloads.shift());
  if (providerId === "workers-ai") return workersRoute(next);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(await next())),
  );
  return {
    providerId,
    model: `${providerId}-test-model`,
    backupModel: null,
    apiKey: "test-key",
    ai: null,
    aiGateway: null,
    configured: true,
  };
}

function workersRoute(run: ReturnType<typeof vi.fn>) {
  return {
    providerId: "workers-ai" as const,
    model: "workers-test-model",
    backupModel: null,
    apiKey: null,
    ai: { run },
    aiGateway: null,
    configured: true,
  };
}

function providerToolCall(
  providerId: "workers-ai" | "openai" | "anthropic",
  id: string,
  name: string,
  args: Record<string, unknown>,
): unknown {
  if (providerId === "openai") {
    return {
      choices: [{ message: { tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }] } }],
    };
  }
  if (providerId === "anthropic") {
    return { content: [{ type: "tool_use", id, name, input: args }] };
  }
  return { tool_calls: [{ id, name, arguments: args }] };
}

function providerText(
  providerId: "workers-ai" | "openai" | "anthropic",
  text: string,
): unknown {
  if (providerId === "openai") return { choices: [{ message: { content: text } }] };
  if (providerId === "anthropic") return { content: [{ type: "text", text }] };
  return { response: text };
}

function streamEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
}

function reminderRow(id: string, title: string, remindAt: string): ReminderRow {
  return {
    id,
    user_id: "owner",
    title,
    notes: null,
    remind_at: remindAt,
    timezone: "Europe/Dublin",
    recurrence_rule: null,
    source_dispatch_id: null,
    status: "pending",
    created_at: "2026-07-01T09:00:00.000Z",
  };
}

function createReminderDb(initialReminders: ReminderRow[] = []) {
  const reminders = initialReminders.map((row) => ({ ...row }));
  const executions: ExecutionRow[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM agent_tool_executions")) {
                return (executions.find(
                  (row) =>
                    row.user_id === values[0] &&
                    row.request_id === values[1] &&
                    row.tool_call_id === values[2],
                ) || null) as T;
              }
              if (sql.includes("source_dispatch_id = ?")) {
                return (reminders.find(
                  (row) =>
                    row.user_id === values[0] &&
                    row.source_dispatch_id === values[1],
                ) || null) as T;
              }
              if (sql.includes("WHERE id = ? AND user_id = ?")) {
                return (reminders.find(
                  (row) =>
                    row.id === values[0] &&
                    row.user_id === values[1] &&
                    (row.status === "pending" || row.status === "failed"),
                ) || null) as T;
              }
              return null as T;
            },
            async all<T>() {
              return {
                results: reminders
                  .filter(
                    (row) =>
                      row.user_id === values[0] &&
                      (row.status === "pending" || row.status === "failed"),
                  )
                  .sort((left, right) => left.remind_at.localeCompare(right.remind_at)) as T[],
              };
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
                if (!executions.some(
                  (row) =>
                    row.user_id === values[1] &&
                    row.request_id === values[2] &&
                    row.tool_call_id === values[3],
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
                const execution = executions.find((row) => row.id === values[1]);
                if (execution && sql.includes("status = 'succeeded'")) {
                  execution.status = "succeeded";
                  execution.result_json = values[0] as string;
                  execution.error_message = null;
                }
                if (execution && sql.includes("status = 'failed'")) {
                  execution.status = "failed";
                  execution.error_message = values[0] as string;
                }
              }
              if (sql.includes("INTO user_reminders")) {
                if (!reminders.some(
                  (row) =>
                    values[7] &&
                    row.user_id === values[1] &&
                    row.source_dispatch_id === values[7],
                )) {
                  reminders.push({
                    id: values[0] as string,
                    user_id: values[1] as string,
                    title: values[2] as string,
                    notes: values[3] as string | null,
                    remind_at: values[4] as string,
                    timezone: values[5] as string,
                    recurrence_rule: values[6] as string | null,
                    source_dispatch_id: values[7] as string | null,
                    status: "pending",
                    created_at: new Date().toISOString(),
                  });
                }
              }
              if (sql.includes("SET title = ?")) {
                const row = reminders.find(
                  (reminder) =>
                    reminder.id === values[5] &&
                    reminder.user_id === values[6] &&
                    (reminder.status === "pending" || reminder.status === "failed"),
                );
                if (row) {
                  row.title = values[0] as string;
                  row.notes = values[1] as string | null;
                  row.remind_at = values[2] as string;
                  row.timezone = values[3] as string;
                  row.recurrence_rule = values[4] as string | null;
                  row.status = "pending";
                }
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (sql.includes("status = 'cancelled'")) {
                const row = reminders.find(
                  (reminder) =>
                    reminder.id === values[0] &&
                    reminder.user_id === values[1] &&
                    (reminder.status === "pending" || reminder.status === "failed"),
                );
                if (row) row.status = "cancelled";
                return { meta: { changes: row ? 1 : 0 } };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { db, reminders, executions };
}
