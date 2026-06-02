import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAgentSandboxTurn } from "./agent-chat";

type FakeDbState = {
  owner: Record<string, unknown> | null;
  recentMessages: Array<Record<string, unknown>>;
  pluginInstallations: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  mailboxMessages: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  calendarEvents: Array<Record<string, unknown>>;
  memory: Array<Record<string, unknown>>;
  reminders: Array<Record<string, unknown>>;
  bookings: Array<Record<string, unknown>>;
  persistedMessages: Array<{ ownerId: string; role: string; content: string }>;
  failContextLookup?: boolean;
};

function createStorage() {
  const values = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return values.get(key) as T | undefined;
    },
    async put<T = unknown>(key: string, value: T): Promise<void> {
      values.set(key, value);
    },
  };
}

function createEnv(state: Partial<FakeDbState> = {}) {
  const dbState: FakeDbState = {
    owner: {
      id: "owner",
      email: "owner@example.com",
      name: "Kieran",
      username: "kieran",
      bio: "Builds useful agentic products.",
      timezone: "Europe/Dublin",
    },
    recentMessages: [],
    pluginInstallations: [],
    contacts: [],
    mailboxMessages: [],
    projects: [],
    tasks: [],
    calendarEvents: [],
    memory: [],
    reminders: [],
    bookings: [],
    persistedMessages: [],
    ...state,
  };

  const db = {
    prepare(sql: string) {
      const boundStatement = (values: unknown[]) => ({
        async first<T>() {
          if (sql.includes("FROM owner_profile")) {
            return values[0] === dbState.owner?.id ? (dbState.owner as T) : null;
          }
          if (sql.includes("FROM ai_model_defaults")) return null;
          if (sql.includes("FROM ai_provider_credentials")) return null;
          if (sql.includes("FROM install_secrets")) return null;
          return null;
        },
        async all<T>() {
          if (dbState.failContextLookup && sql.includes("FROM mission_private_memory")) {
            throw new Error("mission_private_memory unavailable");
          }
          if (sql.includes("FROM assistant_messages")) {
            return { results: dbState.recentMessages as T[] };
          }
          if (sql.includes("FROM plugin_installations")) {
            return { results: dbState.pluginInstallations as T[] };
          }
          if (sql.includes("FROM contacts")) {
            return { results: dbState.contacts as T[] };
          }
          if (sql.includes("FROM mailbox_messages")) {
            return { results: dbState.mailboxMessages as T[] };
          }
          if (sql.includes("FROM mission_projects")) {
            return { results: dbState.projects as T[] };
          }
          if (sql.includes("FROM mission_tasks")) {
            return { results: dbState.tasks as T[] };
          }
          if (sql.includes("FROM user_calendar_events")) {
            return { results: dbState.calendarEvents as T[] };
          }
          if (sql.includes("FROM user_reminders")) {
            return { results: dbState.reminders as T[] };
          }
          if (sql.includes("FROM bookings b")) {
            return { results: dbState.bookings as T[] };
          }
          if (sql.includes("FROM mission_private_memory")) {
            return { results: dbState.memory as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes("INSERT INTO assistant_messages")) {
            dbState.persistedMessages.push({
              ownerId: values[1] as string,
              role: values[2] as string,
              content: values[3] as string,
            });
          }
          if (sql.includes("INSERT INTO user_reminders")) {
            dbState.reminders.push({
              id: values[0],
              user_id: values[1],
              title: values[2],
              notes: values[3],
              remind_at: values[4],
              timezone: values[5],
              recurrence_rule: values[6],
              status: "pending",
              created_at: new Date().toISOString(),
            });
          }
          return { meta: { changes: 1 } };
        },
      });

      return {
        bind(...values: unknown[]) {
          return boundStatement(values);
        },
        first<T>() {
          return boundStatement([]).first<T>();
        },
        all<T>() {
          return boundStatement([]).all<T>();
        },
      };
    },
  };

  return {
    DB: db,
    CORE_API_ORIGIN: "https://core.example.com",
    state: dbState,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

function dispatchInput(messageText: string) {
  return {
    userId: "owner",
    connectionId: "connection-1",
    sourceEventId: "event-1",
    turnId: crypto.randomUUID(),
    messageText,
  };
}

describe("Core chat native context", () => {
  it("adds source-labeled native context to model prompts", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "Context-aware reply.",
    }));
    const env = createEnv({
      recentMessages: [
        {
          role: "user",
          content: "Previous note about Ada.",
        },
      ],
      contacts: [
        contactRow("contact-ada", "Ada Lovelace", "ada@example.com", "client"),
        contactRow("contact-grace", "Grace Hopper", "grace@example.com", "contact"),
      ],
      mailboxMessages: [
        mailboxRow({
          id: "message-ada",
          threadKey: "thread-ada",
          from: "ada@example.com",
          subject: "Workflow notes",
          body: "Ada asked for a crisp update on the analytics workflow.",
          metadata: { projectId: "project-analytics" },
        }),
      ],
      projects: [
        projectRow("project-analytics", "Analytics Workflow", "analytics-workflow"),
        projectRow("project-compiler", "Compiler Notes", "compiler-notes"),
      ],
      tasks: [
        taskRow("task-ada", "Send Ada workflow update", "project-analytics"),
        taskRow("task-grace", "Review compiler paper", "project-compiler"),
      ],
      memory: [
        memoryRow(
          "memory-ada",
          "relationship_note",
          "Ada likes short, practical email replies.",
          "contact",
          "contact-ada",
        ),
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput("Help me reply to Ada about the workflow notes."),
    );

    expect(response.replyText).toBe("Context-aware reply.");
    expect(response.contextPacketId).toBe("agent-context:owner:chat_reply");
    expect(response.contextSummary).toContain("Used context from:");
    expect(response.contextManifest?.sources).toContainEqual(
      expect.objectContaining({
        id: "contact-ada",
        kind: "contact",
        reason: "Contact token matched the request.",
      }),
    );
    const modelInput = aiRun.mock.calls[0]?.[1] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    const system = modelInput.messages[0]?.content || "";

    expect(system).toContain("ME3 agent context packet:");
    expect(system).toContain("Contacts\n- Ada Lovelace (client)");
    expect(system).toContain("Email threads\n- Workflow notes");
    expect(system).toContain("Projects\n- Analytics Workflow");
    expect(system).toContain("Private memory\n- relationship_note");
    expect(system).toContain("Context sources");
    expect(system).toContain("contact:contact-ada");
    expect(system).not.toContain("Grace Hopper");
    expect(system).not.toContain("Compiler Notes");
  });

  it("falls back to current chat behavior when context lookup fails", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "Plain reply.",
    }));
    const env = createEnv({
      failContextLookup: true,
      contacts: [contactRow("contact-ada", "Ada Lovelace", "ada@example.com", "client")],
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput("Help me reply to Ada."),
    );

    expect(response.replyText).toBe("Plain reply.");
    expect(response.contextPacketId).toBeNull();
    expect(response.contextManifest).toBeNull();
    expect(response.contextSummary).toBeNull();
    const modelInput = aiRun.mock.calls[0]?.[1] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(modelInput.messages[0]?.content).toContain("You are ME3 Core");
    expect(modelInput.messages[0]?.content).not.toContain("ME3 agent context packet:");
  });

  it("extracts Workers AI chat-completion shaped replies", async () => {
    const aiRun = vi.fn(async () => ({
      choices: [{ message: { content: "Choice-shaped reply." } }],
    }));
    const env = createEnv();

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput("Are you working?"),
    );

    expect(response).toMatchObject({
      replyText: "Choice-shaped reply.",
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
      source: "workers-ai",
    });
  });

  it("uses the selected Workers AI model when provided", async () => {
    const aiRun = vi.fn(async () => ({
      response: "Selected model reply.",
    }));
    const env = createEnv();

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      {
        ...dispatchInput("Use this model."),
        selectedModel: {
          providerId: "workers-ai",
          model: "@cf/example/selected-model",
          optionId: "workers-selected",
        },
      },
    );

    expect(response).toMatchObject({
      replyText: "Selected model reply.",
      model: "@cf/example/selected-model",
      source: "workers-ai",
    });
    expect(aiRun).toHaveBeenCalledWith(
      "@cf/example/selected-model",
      expect.any(Object),
    );
  });

  it("does not feed old provider setup fallbacks back into the model", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "Yes, I am working through Qwen now.",
    }));
    const env = createEnv({
      recentMessages: [
        {
          role: "assistant",
          content:
            "ME3 Core chat is connected. Add an AI provider in Account settings or bind Workers AI to turn this into a live model response.",
        },
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput("Are you working now?"),
    );

    const modelInput = aiRun.mock.calls[0]?.[1] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(response.replyText).toBe("Yes, I am working through Qwen now.");
    expect(modelInput.messages).not.toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: expect.stringContaining("Add an AI provider"),
      }),
    );
  });

  it("uses the default Workers AI backup when a configured model is empty", async () => {
    const aiRun = vi.fn(async (model: string) =>
      model === "@cf/qwen/qwen3-30b-a3b-fp8"
        ? { response: "" }
        : { response: "Backup model reply." },
    );
    const env = createEnv();

    const response = await dispatchAgentSandboxTurn(
      {
        ...env,
        AI: { run: aiRun },
        ME3_AI_CHAT_MODEL: "@cf/qwen/qwen3-30b-a3b-fp8",
      } as never,
      createStorage(),
      dispatchInput("Are you working?"),
    );

    expect(aiRun.mock.calls.map(([model]) => model)).toEqual([
      "@cf/qwen/qwen3-30b-a3b-fp8",
      "@cf/zai-org/glm-4.7-flash",
    ]);
    expect(response).toMatchObject({
      replyText: "Backup model reply.",
      model: "@cf/zai-org/glm-4.7-flash",
      source: "workers-ai",
    });
  });

  it("creates reminders directly from sandbox chat", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T12:00:00Z"));
    const env = createEnv();

    const response = await dispatchAgentSandboxTurn(
      env as never,
      createStorage(),
      dispatchInput("Remind me to follow up with Sam tomorrow at 9am"),
    );

    expect(response).toMatchObject({
      source: "tool",
      specialist: "core.reminders.create",
      reminderAction: {
        kind: "created",
        title: "follow up with Sam",
      },
    });
    expect(response.replyText).toContain("Done. I set a reminder");
    expect(env.state.reminders).toHaveLength(1);
    expect(env.state.reminders[0]).toMatchObject({
      title: "follow up with Sam",
      remind_at: "2026-06-01T08:00:00.000Z",
      timezone: "Europe/Dublin",
      status: "pending",
    });
    expect(env.state.persistedMessages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("answers upcoming booking questions through the tool layer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T12:00:00Z"));
    const env = createEnv({
      bookings: [
        {
          id: "booking-1",
          site_id: "site-1",
          site_username: "kieran",
          offer_id: "strategy",
          booking_type: "one_to_one",
          guest_name: "Ada Lovelace",
          guest_email: "ada@example.com",
          starts_at: "2026-06-02T10:00:00.000Z",
          ends_at: "2026-06-02T10:30:00.000Z",
          duration_minutes: 30,
          status: "confirmed",
          notes: null,
          payment_status: "not_required",
          is_free_booking: 1,
          created_at: "2026-05-30T10:00:00.000Z",
        },
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      env as never,
      createStorage(),
      dispatchInput("Can you check my upcoming bookings this week?"),
    );

    expect(response).toMatchObject({
      source: "tool",
      specialist: "core.bookings.lookup",
    });
    expect(response.replyText).toContain("Ada Lovelace");
    expect(response.replyText).toContain("30 min");
  });

  it("keeps the no-provider fallback working", async () => {
    const env = createEnv({
      contacts: [contactRow("contact-ada", "Ada Lovelace", "ada@example.com", "client")],
    });

    const response = await dispatchAgentSandboxTurn(
      env as never,
      createStorage(),
      dispatchInput("Hello agent"),
    );

    expect(response).toMatchObject({
      ok: true,
      source: "fallback",
      fallbackReason: "AI provider setup required",
    });
    expect(env.state.persistedMessages.map((message) => message.role)).toEqual(["user"]);
  });

  it("trims oversized native context before model calls", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "Trimmed reply.",
    }));
    const env = createEnv({
      memory: [
        memoryRow(
          "memory-budget",
          "owner_note",
          `Budget context ${"very long ".repeat(900)}`,
          "owner",
          null,
        ),
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput("Use the budget context."),
    );

    const modelInput = aiRun.mock.calls[0]?.[1] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(modelInput.messages[0]?.content).toContain("[Context trimmed to prompt budget]");
    expect(response.contextManifest?.budget).toMatchObject({
      wasTrimmed: true,
      trimReason: "maxPromptChars",
    });
    expect(response.contextSummary).toContain("prompt trimmed");
  });
});

function contactRow(
  id: string,
  name: string,
  email: string,
  relationship: string,
): Record<string, unknown> {
  return {
    id,
    user_id: "owner",
    name,
    email,
    phone: null,
    source: "manual",
    source_ref: null,
    relationship,
    status: "active",
    notes: `${name} is relevant context.`,
    tags: "[]",
    last_interaction_at: "2026-05-15T10:00:00Z",
    next_followup_at: null,
    outreach_status: null,
    social_handles: "{}",
    metadata: "{}",
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T10:00:00Z",
  };
}

function mailboxRow(input: {
  id: string;
  threadKey: string;
  from: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: input.id,
    direction: "inbound",
    message_kind: "email",
    status: "received",
    thread_key: input.threadKey,
    provider_id: "test",
    provider_message_id: input.id,
    from_address: input.from,
    to_address: "owner@example.com",
    subject: input.subject,
    text_body: input.body,
    html_body: null,
    raw_headers_json: null,
    raw_message: null,
    metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    source_id: null,
    folder: "inbox",
    read_at: null,
    agent_summary: null,
    agent_labels_json: null,
    forwarded_to: null,
    error_message: null,
    created_by: "system",
    approved_by_user_id: null,
    received_at: "2026-05-15T11:00:00Z",
    approved_at: null,
    sent_at: null,
    created_at: "2026-05-15T11:00:00Z",
  };
}

function projectRow(id: string, name: string, slug: string): Record<string, unknown> {
  return {
    id,
    name,
    slug,
    description: `${name} project context.`,
    status: "active",
    source_ref: null,
    updated_at: "2026-05-15T12:00:00Z",
  };
}

function taskRow(id: string, title: string, projectId: string): Record<string, unknown> {
  return {
    id,
    project_id: projectId,
    title,
    description: null,
    status: "in_progress",
    due_at: "2026-05-20",
    scheduled_for: null,
    source_ref: null,
    updated_at: "2026-05-15T12:30:00Z",
  };
}

function memoryRow(
  id: string,
  kind: string,
  body: string,
  scopeKind: string,
  scopeId: string | null,
): Record<string, unknown> {
  return {
    id,
    memory_kind: kind,
    scope_kind: scopeKind,
    scope_id: scopeId,
    title: kind,
    body,
    confidence: 1,
    source_ref: null,
    updated_at: "2026-05-15T13:00:00Z",
  };
}
