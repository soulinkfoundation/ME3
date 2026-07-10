const MAX_CACHED_AGENT_TURN_RESULTS = 32;
const RESULT_KEYS_STORAGE_KEY = "agent-chat:sandbox:result-keys";

type TurnDb = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

type TurnStorage = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete?(key: string | string[]): Promise<unknown>;
};

type TurnResultRow = {
  turn_id: string;
  response_json: string;
};

type SandboxEventRow = {
  id: string;
  raw_json: string | null;
};

export function agentTurnResultStorageKey(requestId: string): string {
  return `agent-chat:sandbox:result:${encodeURIComponent(requestId)}`;
}

export async function recordAgentSandboxRequest(
  db: TurnDb,
  input: {
    connectionId: string;
    requestId: string;
    turnId: string;
    eventId: string;
    messageText: string;
    replyToMessageId: string | number | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<{ eventId: string; turnId: string }> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO agent_channel_events
         (id, connection_id, channel, direction, event_type, status,
          provider_event_id, reply_to_message_id, text_body, raw_json,
          created_at, updated_at)
       VALUES (?, ?, 'sandbox', 'inbound', 'message', 'received', ?,
          ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      input.eventId,
      input.connectionId,
      input.requestId,
      input.replyToMessageId === null ? null : String(input.replyToMessageId),
      input.messageText,
      JSON.stringify({
        runtime: "sandbox",
        requestId: input.requestId,
        turnId: input.turnId,
        ...(input.metadata || {}),
      }),
    )
    .run();

  const event = await db
    .prepare(
      `SELECT id, raw_json
       FROM agent_channel_events
       WHERE connection_id = ? AND provider_event_id = ?
       LIMIT 1`,
    )
    .bind(input.connectionId, input.requestId)
    .first<SandboxEventRow>();
  const turnId = sandboxEventTurnId(event?.raw_json);
  if (!event?.id || !turnId) throw new Error("Agent turn request could not be recorded.");
  return { eventId: event.id, turnId };
}

export async function getPersistedAgentTurnResult<T>(
  db: TurnDb,
  userId: string,
  requestId: string,
  expectedTurnId?: string,
): Promise<T | null> {
  const row = await db
    .prepare(
      `SELECT turn_id, response_json
       FROM agent_turn_results
       WHERE user_id = ? AND request_id = ?`,
    )
    .bind(userId, requestId)
    .first<TurnResultRow>();
  if (!row) return null;
  if (expectedTurnId && row.turn_id !== expectedTurnId) {
    throw new Error("Stored agent turn does not match this request.");
  }
  try {
    const result = JSON.parse(row.response_json) as T;
    if (!result || typeof result !== "object") throw new Error("invalid result");
    return result;
  } catch {
    throw new Error("Stored agent turn result is invalid.");
  }
}

export async function persistAgentTurnResult<T>(
  db: TurnDb,
  storage: TurnStorage,
  input: { userId: string; requestId: string; turnId: string },
  resultKey: string,
  response: T,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_turn_results
         (user_id, request_id, turn_id, response_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, request_id) DO UPDATE SET
         response_json = excluded.response_json,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(input.userId, input.requestId, input.turnId, JSON.stringify(response))
    .run();
  await cacheAgentTurnResult(storage, resultKey, response);
}

export async function cacheAgentTurnResult<T>(
  storage: TurnStorage,
  resultKey: string,
  response: T,
): Promise<void> {
  await storage.put(resultKey, response);
  const storedKeys = (await storage.get<string[]>(RESULT_KEYS_STORAGE_KEY)) || [];
  const keys = [resultKey, ...storedKeys.filter((key) => key !== resultKey)];
  const staleKeys = keys.slice(MAX_CACHED_AGENT_TURN_RESULTS);
  await storage.put(
    RESULT_KEYS_STORAGE_KEY,
    keys.slice(0, MAX_CACHED_AGENT_TURN_RESULTS),
  );
  if (staleKeys.length > 0 && storage.delete) await storage.delete(staleKeys);
}

function sandboxEventTurnId(rawJson: string | null | undefined): string | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    return typeof parsed.turnId === "string" && parsed.turnId
      ? parsed.turnId
      : null;
  } catch {
    return null;
  }
}
