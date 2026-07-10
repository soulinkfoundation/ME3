type AgentToolExecutionRow = {
  id: string;
  tool_name: string;
  status: "running" | "succeeded" | "failed";
  result_json: string | null;
  error_message: string | null;
};

type AgentToolExecutionDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

export type AgentToolExecutionContext = {
  executionId: string;
  idempotencyKey: string;
};

export async function executeIdempotentAgentTool<T>(
  db: AgentToolExecutionDb,
  input: {
    userId: string;
    requestId: string;
    toolCallId: string;
    toolName: string;
  },
  execute: (context: AgentToolExecutionContext) => Promise<T>,
): Promise<T> {
  let row = await getAgentToolExecution(db, input);
  if (row?.status === "succeeded") return parseStoredResult<T>(row.result_json);
  if (row?.status === "failed") {
    throw new Error(row.error_message || `Tool "${row.tool_name}" previously failed.`);
  }

  if (!row) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO agent_tool_executions
           (id, user_id, request_id, tool_call_id, tool_name, status,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.requestId,
        input.toolCallId,
        input.toolName,
      )
      .run();
    row = await getAgentToolExecution(db, input);
  }

  if (!row) throw new Error("Agent tool execution could not be reserved.");
  if (row.tool_name !== input.toolName) {
    throw new Error(
      `Tool call "${input.toolCallId}" was already reserved for "${row.tool_name}".`,
    );
  }

  try {
    const result = await execute({
      executionId: row.id,
      idempotencyKey: row.id,
    });
    await db
      .prepare(
        `UPDATE agent_tool_executions
         SET status = 'succeeded', result_json = ?, error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(JSON.stringify(result) ?? "null", row.id)
      .run();
    return result;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Tool execution failed.";
    await db
      .prepare(
        `UPDATE agent_tool_executions
         SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(message, row.id)
      .run();
    throw error;
  }
}

async function getAgentToolExecution(
  db: AgentToolExecutionDb,
  input: { userId: string; requestId: string; toolCallId: string },
): Promise<AgentToolExecutionRow | null> {
  return db
    .prepare(
      `SELECT id, tool_name, status, result_json, error_message
       FROM agent_tool_executions
       WHERE user_id = ? AND request_id = ? AND tool_call_id = ?`,
    )
    .bind(input.userId, input.requestId, input.toolCallId)
    .first<AgentToolExecutionRow>();
}

function parseStoredResult<T>(value: string | null): T {
  if (value === null) throw new Error("Stored agent tool result is missing.");
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error("Stored agent tool result is invalid.");
  }
}
