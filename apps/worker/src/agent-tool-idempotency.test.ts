import { describe, expect, it } from "vitest";
import { executeIdempotentAgentTool } from "./agent-chat";

describe("agent tool execution idempotency", () => {
  it("returns the stored structured result without repeating a completed write", async () => {
    const db = new ToolExecutionDb();
    let writes = 0;
    const input = {
      userId: "owner",
      requestId: "request-1",
      toolCallId: "call-1",
      toolName: "reminders_create",
    };

    const first = await executeIdempotentAgentTool(db, input, async () => {
      writes += 1;
      return { ok: true, reminderId: "reminder-1" };
    });
    const replay = await executeIdempotentAgentTool(db, input, async () => {
      writes += 1;
      return { ok: true, reminderId: "wrong" };
    });

    expect(first).toEqual({ ok: true, reminderId: "reminder-1" });
    expect(replay).toEqual(first);
    expect(writes).toBe(1);
  });

  it.each([
    ["reminders_create", "reminder"],
    ["mission_task_create", "task"],
    ["mailbox_draft", "draft"],
  ])(
    "recovers %s after a crash without duplicating its domain write",
    async (toolName, domain) => {
      const db = new ToolExecutionDb();
      const input = {
        userId: "owner",
        requestId: `request-${domain}`,
        toolCallId: "call-1",
        toolName,
      };
      const executionId = `execution-${domain}`;
      db.seedRunning(input, executionId);

      // This is the state left when the process dies after the domain insert
      // but before the execution result is recorded.
      const domainRows = new Map([[executionId, { id: `${domain}-1` }]]);
      const result = await executeIdempotentAgentTool(
        db,
        input,
        async ({ idempotencyKey }) => {
          if (!domainRows.has(idempotencyKey)) {
            domainRows.set(idempotencyKey, { id: `${domain}-duplicate` });
          }
          return domainRows.get(idempotencyKey);
        },
      );

      expect(result).toEqual({ id: `${domain}-1` });
      expect(domainRows.size).toBe(1);
      expect(db.row(input)?.status).toBe("succeeded");
    },
  );
});

type ToolExecutionRow = {
  id: string;
  user_id: string;
  request_id: string;
  tool_call_id: string;
  tool_name: string;
  status: "running" | "succeeded" | "failed";
  result_json: string | null;
  error_message: string | null;
};

class ToolExecutionDb {
  private readonly rows = new Map<string, ToolExecutionRow>();

  prepare(sql: string) {
    return {
      bind: (...values: unknown[]) => ({
        first: async <T>() => {
          if (!sql.includes("FROM agent_tool_executions")) return null;
          return (this.rows.get(key(values[0], values[1], values[2])) || null) as T | null;
        },
        run: async () => {
          if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
            const row: ToolExecutionRow = {
              id: String(values[0]),
              user_id: String(values[1]),
              request_id: String(values[2]),
              tool_call_id: String(values[3]),
              tool_name: String(values[4]),
              status: "running",
              result_json: null,
              error_message: null,
            };
            const rowKey = key(row.user_id, row.request_id, row.tool_call_id);
            if (!this.rows.has(rowKey)) this.rows.set(rowKey, row);
          } else if (sql.includes("status = 'succeeded'")) {
            this.updateById(String(values[1]), {
              status: "succeeded",
              result_json: String(values[0]),
              error_message: null,
            });
          } else if (sql.includes("status = 'failed'")) {
            this.updateById(String(values[1]), {
              status: "failed",
              error_message: String(values[0]),
            });
          }
          return { success: true };
        },
      }),
    };
  }

  seedRunning(
    input: {
      userId: string;
      requestId: string;
      toolCallId: string;
      toolName: string;
    },
    executionId: string,
  ) {
    this.rows.set(key(input.userId, input.requestId, input.toolCallId), {
      id: executionId,
      user_id: input.userId,
      request_id: input.requestId,
      tool_call_id: input.toolCallId,
      tool_name: input.toolName,
      status: "running",
      result_json: null,
      error_message: null,
    });
  }

  row(input: { userId: string; requestId: string; toolCallId: string }) {
    return this.rows.get(key(input.userId, input.requestId, input.toolCallId));
  }

  private updateById(id: string, update: Partial<ToolExecutionRow>) {
    for (const [rowKey, row] of this.rows) {
      if (row.id === id) this.rows.set(rowKey, { ...row, ...update });
    }
  }
}

function key(...values: unknown[]) {
  return values.map(String).join(":");
}
