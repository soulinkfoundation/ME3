import type { AgentSandboxDispatchResponse } from "./agent-chat";
import type { DbAgentChannelConnection, DbAgentChannelEvent, Env } from "./types";

export type ProviderChannelEventInput = {
  channel: "sandbox" | "soulink";
  connectionId: string;
  direction: "inbound" | "outbound" | "system";
  eventType: "start" | "message" | "link" | "send" | "error";
  status: "received" | "pending" | "sent" | "failed" | "linked" | "skipped";
  providerEventId: string | null;
  providerMessageId: string | null;
  replyToMessageId: string | number | null;
  textBody: string | null;
  rawJson: unknown;
  errorMessage: string | null;
};

export async function getAgentChannelEventByProviderEventId(
  env: Env,
  connectionId: string,
  providerEventId: string,
) {
  return env.DB.prepare(
    `SELECT id, connection_id, channel, direction, event_type, status,
            provider_event_id, provider_message_id,
            telegram_message_id, reply_to_message_id, telegram_user_id,
            telegram_chat_id, telegram_username, text_body, raw_json,
            error_message, created_at, updated_at
     FROM agent_channel_events
     WHERE connection_id = ? AND provider_event_id = ?`,
  )
    .bind(connectionId, providerEventId)
    .first<DbAgentChannelEvent>();
}

export async function insertProviderChannelEventOnce(env: Env, input: ProviderChannelEventInput) {
  if (input.providerEventId) {
    const existing = await getAgentChannelEventByProviderEventId(
      env,
      input.connectionId,
      input.providerEventId,
    );
    if (existing) return existing.id;
  }

  return insertProviderChannelEvent(env, input);
}

export async function insertProviderChannelEvent(
  env: Env,
  input: ProviderChannelEventInput,
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO agent_channel_events
       (id, connection_id, channel, direction, event_type, status,
        provider_event_id, provider_message_id, reply_to_message_id,
        text_body, raw_json, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      input.connectionId,
      input.channel,
      input.direction,
      input.eventType,
      input.status,
      input.providerEventId,
      input.providerMessageId,
      input.replyToMessageId === null ? null : String(input.replyToMessageId),
      input.textBody,
      JSON.stringify(input.rawJson),
      input.errorMessage,
    )
    .run();
  return id;
}

export async function dispatchAgentChannelTurn(
  env: Env,
  input: {
    userId: string;
    connectionId: string;
    sourceEventId: string;
    turnId: string;
    messageText: string;
    replyToMessageId: unknown;
  },
): Promise<AgentSandboxDispatchResponse> {
  const runtime = env.ME3_USER_AGENT;
  if (!runtime) {
    return {
      ok: false,
      auditId: null,
      turnId: input.turnId,
      specialist: "core.agent-chat",
      replyText: null,
      model: null,
      source: null,
      error: "Agent chat runtime is not configured",
    };
  }

  const id = runtime.idFromName(input.userId);
  const stub = runtime.get(id);
  const response = await stub.fetch("https://me3-core-user-agent.internal/dispatch/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: input.userId,
      connectionId: input.connectionId,
      sourceEventId: input.sourceEventId,
      turnId: input.turnId,
      messageText: input.messageText,
      replyToMessageId:
        typeof input.replyToMessageId === "string" ||
        typeof input.replyToMessageId === "number"
          ? input.replyToMessageId
          : null,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | AgentSandboxDispatchResponse
    | null;

  if (!response.ok || payload?.ok !== true) {
    return {
      ok: false,
      auditId: null,
      turnId: input.turnId,
      specialist: "core.agent-chat",
      replyText: null,
      model: null,
      source: null,
      error:
        typeof payload?.error === "string"
          ? payload.error
          : `Agent chat runtime request failed (${response.status})`,
    };
  }

  return payload;
}

export async function getActiveSoulinkConnectionForThread(env: Env, streamChannelId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token,
            provider_connection_id, provider_user_id, provider_thread_id,
            provider_username, provider_metadata_json,
            telegram_user_id, telegram_chat_id, telegram_username,
            telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at,
            updated_at
     FROM agent_channel_connections
     WHERE provider_thread_id = ? AND channel = 'soulink' AND status = 'active'`,
  )
    .bind(streamChannelId)
    .first<DbAgentChannelConnection>();
}

export function verifySoulinkDispatchAuth(
  connection: DbAgentChannelConnection,
  authorization: string | undefined,
) {
  const dispatchToken = connection.setup_token;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (!token || !constantTimeEqual(token, dispatchToken)) {
    return { ok: false, status: 401, error: "Invalid Soulink dispatch token" };
  }
  return { ok: true as const };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}
