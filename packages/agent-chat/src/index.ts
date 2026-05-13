export const AGENT_CHAT_PLUGIN_ID = "me3.agent-chat";

export const AGENT_CHAT_RUNTIME = {
  id: AGENT_CHAT_PLUGIN_ID,
  packageName: "@me3-core/plugin-agent-chat",
  bundled: true,
  runtimeStatus: "sandbox_chat_runtime",
  routes: ["/api/agent/sandbox"],
  notes: [
    "Core bundles the owner chat runtime through a first-party plugin package.",
    "The plugin is enabled by default because agent chat is part of the baseline ME3 Core experience.",
    "Tool surfaces should be added behind this package boundary so hosted ME3 and Core installs share one implementation contract.",
  ],
} as const;

export type AgentChatSource =
  | "openai"
  | "anthropic"
  | "workers-ai"
  | "workers-ai-gateway"
  | "fallback"
  | "tool"
  | null;

export type AgentSandboxDispatchInput = {
  userId: string;
  connectionId: string;
  sourceEventId: string;
  turnId: string;
  messageText: string;
  replyToMessageId?: string | number | null;
};

export type AgentSandboxDispatchResponse = {
  ok: boolean;
  auditId: string | null;
  turnId: string | null;
  specialist: string | null;
  replyText: string | null;
  model: string | null;
  source: AgentChatSource;
  fallbackReason?: string | null;
  debugError?: string | null;
  emailAction?: null;
  reminderAction?: null;
  contentAction?: null;
  contactsChanged?: boolean;
  error?: string;
};

type CoreAgentChatEnv = {
  DB: D1Like;
  AI?: {
    run(model: string, input: unknown): Promise<unknown>;
  };
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ME3_AI_MODEL?: string;
  ME3_AI_DEFAULT_PROVIDER?: string;
  ME3_AI_DEFAULT_MODEL?: string;
  ME3_AI_CHAT_PROVIDER?: string;
  ME3_AI_CHAT_MODEL?: string;
};

type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<unknown>;
    };
    first<T = unknown>(): Promise<T | null>;
  };
};

type AgentSandboxConnection = {
  id: string;
};

type AgentSandboxSourceEvent = {
  id: string;
};

export type AgentSandboxTurnRecord = {
  connection: AgentSandboxConnection;
  sourceEvent: AgentSandboxSourceEvent;
  turnId: string;
  messageText: string;
  replyToMessageId: string | number | null;
};

type StorageLike = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
};

type OwnerProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  bio: string | null;
  timezone: string | null;
  locale?: string | null;
};

type AiCredentialRow = {
  provider_id: string;
  encrypted_api_key: string | null;
};

type AiDefaultRow = {
  provider_id: string;
  model: string;
};

type AiProviderId = "workers-ai" | "openai" | "anthropic";

type AiRoute = {
  providerId: AiProviderId;
  model: string;
  apiKey: string | null;
  ai: CoreAgentChatEnv["AI"] | null;
  configured: boolean;
};

const DEFAULT_WORKERS_AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest";
const INSTALL_ENCRYPTION_KEY_NAME = "TOKEN_ENCRYPTION_KEY";

export function isAgentSandboxDispatchInput(
  value: unknown,
): value is AgentSandboxDispatchInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<AgentSandboxDispatchInput>;
  return (
    typeof input.userId === "string" &&
    typeof input.connectionId === "string" &&
    typeof input.sourceEventId === "string" &&
    typeof input.turnId === "string" &&
    typeof input.messageText === "string"
  );
}

export async function createAgentSandboxTurnRecord(
  env: Pick<CoreAgentChatEnv, "DB">,
  input: {
    userId: string;
    messageText: string;
    replyToMessageId?: string | number | null;
  },
): Promise<AgentSandboxTurnRecord> {
  const messageText = input.messageText.trim();
  const replyToMessageId =
    typeof input.replyToMessageId === "string" ||
    typeof input.replyToMessageId === "number"
      ? input.replyToMessageId
      : null;
  const connection = await upsertSandboxConnection(env, input.userId);
  const turnId = crypto.randomUUID();
  const sourceEvent = await insertSandboxEvent(env, {
    connectionId: connection.id,
    turnId,
    messageText,
    replyToMessageId,
  });

  return {
    connection,
    sourceEvent,
    turnId,
    messageText,
    replyToMessageId,
  };
}

export async function dispatchAgentSandboxTurn(
  env: CoreAgentChatEnv,
  storage: StorageLike,
  input: AgentSandboxDispatchInput,
): Promise<AgentSandboxDispatchResponse> {
  const resultKey = `agent-chat:sandbox:${input.turnId}`;
  const existing = await storage.get<AgentSandboxDispatchResponse>(resultKey);
  if (existing) return { ...existing, ok: true };

  await storage.put("userId", input.userId);
  await storage.put("lastSandboxConnectionId", input.connectionId);
  await storage.put("lastSandboxTurnId", input.turnId);
  await storage.put("lastSandboxTurnAt", new Date().toISOString());

  const owner = await getOwnerProfile(env, input.userId);
  const route = await resolveAiRoute(env, input.userId);
  const recent = await loadRecentMessages(env, input.userId);
  const messages = buildChatMessages(owner, recent, input.messageText);

  let response: AgentSandboxDispatchResponse;
  if (!route.configured) {
    response = {
      ok: true,
      auditId: null,
      turnId: input.turnId,
      specialist: "core.agent-chat",
      replyText:
        "ME3 Core chat is connected. Add an AI provider in Account settings or bind Workers AI to turn this into a live model response.",
      model: route.model,
      source: "fallback",
      fallbackReason: "AI provider setup required",
      debugError: null,
      emailAction: null,
      reminderAction: null,
      contentAction: null,
      contactsChanged: false,
    };
  } else {
    response = await runModelTurn(route, messages, input.turnId);
  }

  await persistAssistantMessage(env, input.userId, "user", input.messageText);
  if (response.replyText) {
    await persistAssistantMessage(env, input.userId, "assistant", response.replyText);
  }

  await storage.put(resultKey, response);
  return response;
}

async function upsertSandboxConnection(
  env: Pick<CoreAgentChatEnv, "DB">,
  ownerId: string,
): Promise<AgentSandboxConnection> {
  const existing = await env.DB.prepare(
    `SELECT id
     FROM agent_channel_connections
     WHERE user_id = ? AND channel = 'sandbox'
     LIMIT 1`,
  )
    .bind(ownerId)
    .first<AgentSandboxConnection>();

  if (existing?.id) {
    await env.DB.prepare(
      `UPDATE agent_channel_connections
       SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(existing.id)
      .run();
    return existing;
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO agent_channel_connections
       (id, user_id, channel, status, setup_token, connected_at, created_at, updated_at)
     VALUES (?, ?, 'sandbox', 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(id, ownerId, crypto.randomUUID())
    .run();

  return { id };
}

async function insertSandboxEvent(
  env: Pick<CoreAgentChatEnv, "DB">,
  input: {
    connectionId: string;
    turnId: string;
    messageText: string;
    replyToMessageId: string | number | null;
  },
): Promise<AgentSandboxSourceEvent> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO agent_channel_events
       (id, connection_id, channel, direction, event_type, status,
        reply_to_message_id, text_body, raw_json, created_at, updated_at)
     VALUES (?, ?, 'sandbox', 'inbound', 'message', 'received',
        ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      input.connectionId,
      input.replyToMessageId === null ? null : String(input.replyToMessageId),
      input.messageText,
      JSON.stringify({ runtime: "sandbox", turnId: input.turnId }),
    )
    .run();

  return { id };
}

async function runModelTurn(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  turnId: string,
): Promise<AgentSandboxDispatchResponse> {
  try {
    const replyText =
      route.providerId === "openai"
        ? await runOpenAi(route, messages)
        : route.providerId === "anthropic"
          ? await runAnthropic(route, messages)
        : await runWorkersAi(route, messages);

    return {
      ok: true,
      auditId: null,
      turnId,
      specialist: "core.agent-chat",
      replyText,
      model: route.model,
      source: route.providerId,
      fallbackReason: null,
      debugError: null,
      emailAction: null,
      reminderAction: null,
      contentAction: null,
      contactsChanged: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model request failed";
    return {
      ok: true,
      auditId: null,
      turnId,
      specialist: "core.agent-chat",
      replyText:
        "I reached the ME3 Core agent runtime, but the model call failed. Check your AI provider settings and try again.",
      model: route.model,
      source: "fallback",
      fallbackReason: "Model request failed",
      debugError: message,
      emailAction: null,
      reminderAction: null,
      contentAction: null,
      contactsChanged: false,
    };
  }
}

async function runOpenAi(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.apiKey) throw new Error("OpenAI API key is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${route.apiKey}`,
    },
    body: JSON.stringify({
      model: route.model,
      messages,
      temperature: 0.4,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI request failed (${response.status})`);
  }

  return (
    payload?.choices?.[0]?.message?.content?.trim() ||
    "I couldn't turn that into a useful reply just yet."
  );
}

async function runAnthropic(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.apiKey) throw new Error("Anthropic API key is not configured");

  const system = messages.find((message) => message.role === "system")?.content || "";
  const turns = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role, content: message.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": route.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: route.model,
      max_tokens: 800,
      system,
      messages: turns,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Anthropic request failed (${response.status})`);
  }

  return (
    payload?.content
      ?.map((part) => (part.type === "text" ? part.text || "" : ""))
      .join("")
      .trim() || "I couldn't turn that into a useful reply just yet."
  );
}

async function runWorkersAi(
  route: AiRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!route.ai) throw new Error("Workers AI binding is not configured");
  const result = (await route.ai.run(route.model, { messages })) as
    | { response?: string; result?: { response?: string } }
    | string
    | null;

  if (typeof result === "string") return result.trim();
  return (
    result?.response?.trim() ||
    result?.result?.response?.trim() ||
    "I couldn't turn that into a useful reply just yet."
  );
}

async function resolveAiRoute(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<AiRoute> {
  const stored = await getStoredChatDefault(env, ownerId);
  const envProvider = normalizeProviderId(env.ME3_AI_CHAT_PROVIDER);
  const envModel = normalizeModel(env.ME3_AI_CHAT_MODEL) || normalizeModel(env.ME3_AI_MODEL);
  const storedProvider = normalizeProviderId(stored?.provider_id);
  const providerId =
    storedProvider ||
    envProvider ||
    (envModel ? "workers-ai" : null) ||
    (env.OPENAI_API_KEY ? "openai" : null) ||
    (env.ANTHROPIC_API_KEY ? "anthropic" : null) ||
    (env.AI ? "workers-ai" : "workers-ai");
  const model =
    normalizeModel(stored?.model) ||
    envModel ||
    defaultModelForProvider(providerId);
  const apiKey =
    providerId === "openai"
      ? env.OPENAI_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
      : providerId === "anthropic"
        ? env.ANTHROPIC_API_KEY || (await getStoredApiKey(env, ownerId, providerId))
        : null;

  return {
    providerId,
    model,
    apiKey,
    ai: env.AI || null,
    configured:
      providerId === "workers-ai" ? Boolean(env.AI && model) : Boolean(apiKey && model),
  };
}

async function getStoredChatDefault(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<AiDefaultRow | null> {
  try {
    return env.DB.prepare(
      `SELECT provider_id, model
       FROM ai_model_defaults
       WHERE user_id = ? AND use_case = 'chat'
       LIMIT 1`,
    )
      .bind(ownerId)
      .first<AiDefaultRow>();
  } catch {
    return null;
  }
}

async function getStoredApiKey(
  env: CoreAgentChatEnv,
  ownerId: string,
  providerId: AiProviderId,
): Promise<string | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT provider_id, encrypted_api_key
       FROM ai_provider_credentials
       WHERE user_id = ? AND provider_id = ?
       LIMIT 1`,
    )
      .bind(ownerId, providerId)
      .first<AiCredentialRow>();
    if (!row?.encrypted_api_key) return null;
    const installKey = await getInstallEncryptionKey(env);
    return installKey ? decryptProviderSecret(row.encrypted_api_key, installKey) : null;
  } catch {
    return null;
  }
}

async function getInstallEncryptionKey(env: CoreAgentChatEnv): Promise<string | null> {
  if (env.TOKEN_ENCRYPTION_KEY) return env.TOKEN_ENCRYPTION_KEY;
  try {
    const row = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
      .bind(INSTALL_ENCRYPTION_KEY_NAME)
      .first<{ value: string }>();
    return row?.value || null;
  } catch {
    return null;
  }
}

async function decryptProviderSecret(
  encrypted: string,
  installKey: string,
): Promise<string | null> {
  const parts = encrypted.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const iv = decodeBase64UrlBytes(parts[1]);
  const ciphertext = decodeBase64UrlBytes(parts[2]);
  const key = await importSecretCryptoKey(installKey, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function importSecretCryptoKey(
  installKey: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(installKey),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function getOwnerProfile(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<OwnerProfileRow | null> {
  try {
    return env.DB.prepare(
      `SELECT id, email, name, username, bio, timezone
       FROM owner_profile
       WHERE id = ?
       LIMIT 1`,
    )
      .bind(ownerId)
      .first<OwnerProfileRow>();
  } catch {
    return null;
  }
}

async function loadRecentMessages(
  env: CoreAgentChatEnv,
  ownerId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  try {
    const rows = await env.DB.prepare(
      `SELECT role, content
       FROM assistant_messages
       WHERE owner_id = ? AND role IN ('user', 'assistant')
       ORDER BY created_at DESC
       LIMIT 12`,
    )
      .bind(ownerId)
      .all<{ role: "user" | "assistant"; content: string }>();
    return (rows.results || []).reverse();
  } catch {
    return [];
  }
}

function buildChatMessages(
  owner: OwnerProfileRow | null,
  recent: Array<{ role: "user" | "assistant"; content: string }>,
  messageText: string,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const ownerName = owner?.name?.trim() || owner?.username?.trim() || "the owner";
  const system = [
    "You are ME3 Core, a concise personal/business assistant running inside the owner's private ME3 Core install.",
    `The owner is ${ownerName}.`,
    owner?.bio ? `Owner profile context: ${owner.bio}` : null,
    owner?.timezone ? `Owner timezone: ${owner.timezone}` : null,
    "Answer helpfully and plainly. Do not claim external actions are complete unless a tool result says they are.",
    "This first Core chat slice can converse and reason, but richer plugin tools are still being wired in.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    ...recent,
    { role: "user", content: messageText },
  ];
}

async function persistAssistantMessage(
  env: CoreAgentChatEnv,
  ownerId: string,
  role: "user" | "assistant",
  content: string,
) {
  try {
    await env.DB.prepare(
      "INSERT INTO assistant_messages (id, owner_id, role, content) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), ownerId, role, content)
      .run();
  } catch {
    // Conversation persistence is useful context, but chat turns should not fail on audit writes.
  }
}

function normalizeProviderId(value: unknown): AiProviderId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "openai") return "openai";
  if (normalized === "anthropic" || normalized === "claude") return "anthropic";
  if (
    normalized === "workers-ai" ||
    normalized === "workers_ai" ||
    normalized === "workers" ||
    normalized === "cloudflare"
  ) {
    return "workers-ai";
  }
  return null;
}

function normalizeModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const model = value.trim();
  if (!model || model.length > 160) return null;
  return model;
}

function defaultModelForProvider(providerId: AiProviderId): string {
  if (providerId === "openai") return DEFAULT_OPENAI_MODEL;
  if (providerId === "anthropic") return DEFAULT_ANTHROPIC_MODEL;
  return DEFAULT_WORKERS_AI_MODEL;
}
