import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAgentSandboxTurn } from "./agent-chat";

type FakeDbState = {
  owner: Record<string, unknown> | null;
  recentMessages: Array<Record<string, unknown>>;
  pluginInstallations: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  mailboxAliases: Array<Record<string, unknown>>;
  mailboxMessages: Array<Record<string, unknown>>;
  calendarSources: Array<Record<string, unknown>>;
  channelConnections: Array<Record<string, unknown>>;
  localExecutorPairings: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  calendarEvents: Array<Record<string, unknown>>;
  memory: Array<Record<string, unknown>>;
  missionDashboardSettings: Record<string, unknown> | null;
  wheelSnapshots: Array<Record<string, unknown>>;
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
    mailboxAliases: [],
    mailboxMessages: [],
    calendarSources: [],
    channelConnections: [],
    localExecutorPairings: [],
    projects: [],
    tasks: [],
    calendarEvents: [],
    memory: [],
    missionDashboardSettings: null,
    wheelSnapshots: [],
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
          if (sql.includes("FROM mailbox_aliases")) {
            return (dbState.mailboxAliases.find((alias) => alias.user_id === values[0]) || null) as T;
          }
          if (sql.includes("FROM calendar_sources")) {
            return (dbState.calendarSources.find(
              (source) => source.user_id === values[0] && source.status === "active",
            ) || null) as T;
          }
          if (sql.includes("FROM agent_channel_connections")) {
            return (dbState.channelConnections.find(
              (connection) =>
                connection.user_id === values[0] &&
                connection.channel === "soulink" &&
                connection.status === "active",
            ) || null) as T;
          }
          if (sql.includes("FROM local_executor_pairings")) {
            return (dbState.localExecutorPairings.find(
              (pairing) => pairing.user_id === values[0] && pairing.status === "active",
            ) || null) as T;
          }
          if (sql.includes("FROM mission_dashboard_settings")) {
            return values[0] === "owner" ? (dbState.missionDashboardSettings as T) : null;
          }
          if (sql.includes("FROM mission_wheel_snapshots")) {
            return (dbState.wheelSnapshots.find((snapshot) => snapshot.user_id === values[0]) || null) as T;
          }
          if (sql.includes("FROM mailbox_messages")) {
            if (sql.includes("WHERE id = ? AND mailbox_id = ?")) {
              return (dbState.mailboxMessages.find(
                (message) => message.id === values[0] && message.mailbox_id === values[1],
              ) || null) as T;
            }
            return (dbState.mailboxMessages.find(
              (message) => message.mailbox_id === values[0],
            ) || null) as T;
          }
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
          if (sql.includes("INSERT INTO mailbox_messages")) {
            dbState.mailboxMessages.push({
              id: values[0],
              mailbox_id: values[1],
              direction: "outbound",
              message_kind: "draft",
              status: "pending_approval",
              thread_key: values[2],
              provider_id: null,
              provider_message_id: null,
              from_address: values[3],
              to_address: values[4],
              subject: values[5],
              text_body: values[6],
              html_body: values[7],
              raw_headers_json: null,
              raw_message: null,
              metadata_json: values[8],
              source_id: values[9],
              folder: "drafts",
              read_at: null,
              agent_summary: null,
              agent_labels_json: null,
              forwarded_to: null,
              error_message: null,
              created_by: values[10],
              approved_by_user_id: null,
              received_at: null,
              approved_at: null,
              sent_at: null,
              created_at: values[11],
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
    expect(modelInput.messages[0]?.content).toContain(
      'Your assistant display name is "ME3".',
    );
    expect(modelInput.messages[0]?.content).not.toContain("ME3 agent context packet:");
  });

  it("uses the owner's custom assistant name in model instructions", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "Named reply.",
    }));
    const env = createEnv({
      owner: {
        id: "owner",
        email: "owner@example.com",
        name: "Kieran",
        username: "kieran",
        bio: "Builds useful agentic products.",
        timezone: "Europe/Dublin",
        assistant_name: "Atlas",
      },
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput("What's your name?"),
    );

    expect(response.replyText).toBe("Named reply.");
    const modelInput = aiRun.mock.calls[0]?.[1] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(modelInput.messages[0]?.content).toContain(
      'Your assistant display name is "Atlas".',
    );
    expect(modelInput.messages[0]?.content).toContain(
      "If asked who you are or what your name is, use the assistant display name.",
    );
  });

  it("adds contact directory context when the owner asks to list contacts", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "You have Ada, Grace, and Mina in contacts.",
    }));
    const env = createEnv({
      contacts: [
        contactRow("contact-ada", "Ada Lovelace", "ada@example.com", "client"),
        contactRow("contact-grace", "Grace Hopper", "grace@example.com", "contact"),
        contactRow("contact-mina", "Mina Murray", "mina@example.com", "prospect"),
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput("Can you list the contacts I have?"),
    );

    expect(response.replyText).toBe("You have Ada, Grace, and Mina in contacts.");
    expect(response.contextSummary).toContain("3 contacts");
    expect(response.contextManifest?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "contact-ada",
          kind: "contact",
          reason: "Contact directory requested by the owner.",
        }),
        expect.objectContaining({
          id: "contact-grace",
          kind: "contact",
          reason: "Contact directory requested by the owner.",
        }),
        expect.objectContaining({
          id: "contact-mina",
          kind: "contact",
          reason: "Contact directory requested by the owner.",
        }),
      ]),
    );
    const modelInput = aiRun.mock.calls[0]?.[1] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    const system = modelInput.messages[0]?.content || "";

    expect(system).toContain("Contacts\n- Ada Lovelace (client)");
    expect(system).toContain("- Grace Hopper (contact)");
    expect(system).toContain("- Mina Murray (prospect)");
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

  it("keeps setup and capability exploration prompts in the model path", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response:
        "Yes, that makes sense. I can help you explore ME3, inspect context, and turn useful gaps into code improvements.",
    }));
    const env = createEnv({
      missionDashboardSettings: missionDashboardSettingsRow(
        "Help builders steer their work with calm, useful systems.",
      ),
      wheelSnapshots: [wheelSnapshotRow()],
      reminders: [
        {
          id: "reminder-existing",
          user_id: "owner",
          title: "Ship ME3",
          notes: null,
          remind_at: "2026-06-07T09:00:00.000Z",
          timezone: "Europe/Dublin",
          recurrence_rule: null,
          status: "pending",
          delivered_at: null,
          dismissed_at: null,
          created_at: "2026-06-01T09:00:00.000Z",
        },
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, AI: { run: aiRun } } as never,
      createStorage(),
      dispatchInput(
        "I am setting up ME3 for the first time. I want to explore what you can do, ie the tools you can access here: profile, setting calendar reminders/events, updating mission control, tasks projects, what context you have available. Make sense?",
      ),
    );

    expect(response).toMatchObject({
      source: "workers-ai",
      specialist: "core.agent-chat",
      reminderAction: null,
    });
    expect(response.replyText).toContain("Yes, that makes sense");
    expect(aiRun).toHaveBeenCalledOnce();
    const modelInput = aiRun.mock.calls[0]?.[1] as unknown as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(modelInput.messages[0]?.content).toContain(
      "When the owner is setting up ME3, testing the assistant, or asking what you can do",
    );
    expect(modelInput.messages[0]?.content).toContain(
      "ME3 first-run/setup orientation mode:",
    );
    expect(modelInput.messages[0]?.content).toContain("ME3 setup readiness summary:");
    expect(modelInput.messages[0]?.content).toContain("AI provider: ready");
    expect(modelInput.messages[0]?.content).toContain("Soulink: needs setup");
    expect(modelInput.messages[0]?.content).toContain("Mailbox: needs setup");
    expect(modelInput.messages[0]?.content).toContain("Local daemon: not paired");
    expect(modelInput.messages[0]?.content).toContain(
      "Mission statement:\n- Help builders steer their work with calm, useful systems.",
    );
    expect(modelInput.messages[0]?.content).toContain("Wheel of Life snapshot:");
    expect(modelInput.messages[0]?.content).toContain("Offer 2-4 useful test prompts");
  });

  it("orients first-run setup prompts even before an AI provider is configured", async () => {
    const env = createEnv({
      mailboxAliases: [mailboxAliasRow("mailbox-owner", "owner")],
      calendarSources: [calendarSourceRow("calendar-source")],
      channelConnections: [soulinkConnectionRow("soulink-connection")],
      localExecutorPairings: [localExecutorPairingRow("local-pairing")],
    });

    const response = await dispatchAgentSandboxTurn(
      env as never,
      createStorage(),
      dispatchInput("I'm setting up ME3 for the first time. What can you do here?"),
    );

    expect(response).toMatchObject({
      source: "fallback",
      specialist: "core.agent-chat",
      fallbackReason: "AI provider setup required",
      reminderAction: null,
      emailAction: null,
    });
    expect(response.replyText).toContain("ME3 Core chat is connected");
    expect(response.replyText).toContain("AI provider: needs setup");
    expect(response.replyText).toContain("Calendar/reminders: Core native reminders");
    expect(response.replyText).toContain("Soulink: connected");
    expect(response.replyText).toContain("Mailbox: active alias configured");
    expect(response.replyText).toContain("Local daemon: paired");
    expect(response.replyText).toContain("Good test prompts");
    expect(env.state.persistedMessages.map((message) => message.role)).toEqual(["user"]);
  });

  it("attaches a development trace for model-first turns when enabled", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "Here is what I can help with.",
    }));
    const env = createEnv();

    const response = await dispatchAgentSandboxTurn(
      {
        ...env,
        AI: { run: aiRun },
        ME3_ASSISTANT_DEBUG_TRACE: "true",
      } as never,
      createStorage(),
      dispatchInput("What tools can you access here?"),
    );

    expect(response.trace).toMatchObject({
      planner: {
        kind: "conversation",
        capabilityId: "core.agent-chat.conversation",
      },
      route: {
        path: "model",
        capabilityId: "core.agent-chat.conversation",
      },
      selectedModel: {
        providerId: "workers-ai",
        configured: true,
        responseModel: "@cf/qwen/qwen3-30b-a3b-fp8",
      },
      context: {
        status: "loaded",
        packetId: "agent-context:owner:chat_reply",
      },
      modelCall: {
        status: "succeeded",
      },
      toolResult: {
        status: "not_attempted",
      },
    });
  });

  it("attaches a development trace for native tool turns when enabled", async () => {
    const env = createEnv({
      reminders: [
        {
          id: "reminder-existing",
          user_id: "owner",
          title: "Ship ME3",
          notes: null,
          remind_at: "2026-06-07T09:00:00.000Z",
          timezone: "Europe/Dublin",
          recurrence_rule: null,
          status: "pending",
          delivered_at: null,
          dismissed_at: null,
          created_at: "2026-06-01T09:00:00.000Z",
        },
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      { ...env, ME3_ASSISTANT_DEBUG_TRACE: "true" } as never,
      createStorage(),
      dispatchInput("Do I have any pending reminders?"),
    );

    expect(response.trace).toMatchObject({
      planner: {
        kind: "read_action",
        capabilityId: "core.reminders.list",
      },
      route: {
        path: "tool",
        capabilityId: "core.reminders.list",
      },
      selectedModel: null,
      context: {
        status: "not_attempted",
      },
      modelCall: {
        status: "not_attempted",
      },
      toolResult: {
        status: "succeeded",
        specialist: "core.reminders.list",
      },
    });
  });

  it("shows failed context lookup details in development trace", async () => {
    const aiRun = vi.fn(async (_model: string, _input: unknown) => ({
      response: "Plain reply.",
    }));
    const env = createEnv({
      failContextLookup: true,
      contacts: [contactRow("contact-ada", "Ada Lovelace", "ada@example.com", "client")],
    });

    const response = await dispatchAgentSandboxTurn(
      {
        ...env,
        AI: { run: aiRun },
        ME3_ASSISTANT_DEBUG_TRACE: "true",
      } as never,
      createStorage(),
      dispatchInput("Help me reply to Ada."),
    );

    expect(response.contextManifest).toBeNull();
    expect(response.trace).toMatchObject({
      context: {
        status: "failed",
        packetId: null,
        error: "mission_private_memory unavailable",
      },
      modelCall: {
        status: "succeeded",
      },
    });
  });

  it("still lists reminders for direct reminder list requests", async () => {
    const env = createEnv({
      reminders: [
        {
          id: "reminder-existing",
          user_id: "owner",
          title: "Ship ME3",
          notes: null,
          remind_at: "2026-06-07T09:00:00.000Z",
          timezone: "Europe/Dublin",
          recurrence_rule: null,
          status: "pending",
          delivered_at: null,
          dismissed_at: null,
          created_at: "2026-06-01T09:00:00.000Z",
        },
      ],
    });

    const response = await dispatchAgentSandboxTurn(
      env as never,
      createStorage(),
      dispatchInput("Do I have any pending reminders?"),
    );

    expect(response).toMatchObject({
      source: "tool",
      specialist: "core.reminders.list",
      reminderAction: { kind: "listed" },
    });
    expect(response.replyText).toContain("Ship ME3");
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
    expect(response.trace).toBeUndefined();
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

type GoldenTranscriptScenario = {
  name: string;
  messageText: string;
  aiReply?: string;
  withAi?: boolean;
  envState?: Partial<FakeDbState>;
  expected: {
    source: "workers-ai" | "tool" | "fallback";
    routePath: "model" | "tool" | "fallback";
    plannerKind: "conversation" | "read_action" | "write_action" | "clarify";
    capabilityId:
      | "core.agent-chat.conversation"
      | "core.mailbox.draft"
      | "core.reminders.list"
      | "core.reminders.create"
      | "core.bookings.lookup";
    toolResultStatus: "not_attempted" | "succeeded" | "failed" | "clarified";
    modelCallStatus: "not_attempted" | "succeeded" | "failed" | "fallback";
    specialist?: string;
    replyIncludes?: string[];
    contextSummary?: "present" | "absent";
    reminderActionKind?: "created" | "listed" | null;
    emailActionKind?: "drafted" | null;
    reminderDelta?: number;
    mailboxDraftDelta?: number;
    aiCalled?: boolean;
    fallbackReason?: string;
  };
};

const launchGoldenTranscriptScenarios: GoldenTranscriptScenario[] = [
  {
    name: "first-run setup and capability exploration gives orientation, not reminders",
    messageText:
      "I am setting up ME3 for the first time. I want to explore what you can do, ie profile, calendar reminders/events, mission control, tasks, projects, and what context you have available. Make sense?",
    aiReply:
      "Yes. Available now: chat, reminders, contacts, and context summaries. Needs setup: calendar sync and mailbox. Try asking what context I have, listing reminders, or drafting a reply.",
    withAi: true,
    envState: {
      reminders: [
        reminderRow("reminder-existing", "Ship ME3", "2026-06-07T09:00:00.000Z"),
      ],
      projects: [projectRow("project-launch", "ME3 Launch", "me3-launch")],
      tasks: [taskRow("task-launch", "Prepare launch checklist", "project-launch")],
    },
    expected: {
      source: "workers-ai",
      routePath: "model",
      plannerKind: "conversation",
      capabilityId: "core.agent-chat.conversation",
      toolResultStatus: "not_attempted",
      modelCallStatus: "succeeded",
      replyIncludes: ["Available now", "Needs setup", "Try asking"],
      contextSummary: "present",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: true,
    },
  },
  {
    name: "tool access question stays model-first",
    messageText: "What tools can you access here?",
    aiReply:
      "I can talk through ME3 capabilities and, when you ask directly, use safe tools like reminders, bookings, and mailbox drafts.",
    withAi: true,
    expected: {
      source: "workers-ai",
      routePath: "model",
      plannerKind: "conversation",
      capabilityId: "core.agent-chat.conversation",
      toolResultStatus: "not_attempted",
      modelCallStatus: "succeeded",
      replyIncludes: ["ME3 capabilities"],
      contextSummary: "present",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: true,
    },
  },
  {
    name: "context question stays model-first and includes context evidence",
    messageText: "What context do you know about me?",
    aiReply:
      "I can see your owner profile, timezone, recent assistant history, and relevant ME3 context when it matches your request.",
    withAi: true,
    envState: {
      memory: [
        memoryRow(
          "memory-owner-focus",
          "owner_note",
          "The owner wants ME3 to feel dependable during setup.",
          "owner",
          null,
        ),
      ],
    },
    expected: {
      source: "workers-ai",
      routePath: "model",
      plannerKind: "conversation",
      capabilityId: "core.agent-chat.conversation",
      toolResultStatus: "not_attempted",
      modelCallStatus: "succeeded",
      replyIncludes: ["owner profile", "timezone"],
      contextSummary: "present",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: true,
    },
  },
  {
    name: "direct reminder create runs the reminder tool",
    messageText: "Remind me tomorrow at 9 to follow up with Sam",
    expected: {
      source: "tool",
      routePath: "tool",
      plannerKind: "write_action",
      capabilityId: "core.reminders.create",
      specialist: "core.reminders.create",
      toolResultStatus: "succeeded",
      modelCallStatus: "not_attempted",
      replyIncludes: ["Done. I set a reminder", "follow up with Sam"],
      contextSummary: "absent",
      reminderActionKind: "created",
      emailActionKind: null,
      reminderDelta: 1,
      mailboxDraftDelta: 0,
      aiCalled: false,
    },
  },
  {
    name: "direct reminder list runs the reminder lookup tool",
    messageText: "Do I have any pending reminders?",
    envState: {
      reminders: [
        reminderRow("reminder-existing", "Ship ME3", "2026-06-07T09:00:00.000Z"),
      ],
    },
    expected: {
      source: "tool",
      routePath: "tool",
      plannerKind: "read_action",
      capabilityId: "core.reminders.list",
      specialist: "core.reminders.list",
      toolResultStatus: "succeeded",
      modelCallStatus: "not_attempted",
      replyIncludes: ["Ship ME3"],
      contextSummary: "absent",
      reminderActionKind: "listed",
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: false,
    },
  },
  {
    name: "calendar exploration with reminders mentioned does not list reminders",
    messageText:
      "I want to explore calendar events, reminders, and availability, but don't create or list anything yet.",
    aiReply:
      "We can explore how calendar events, reminders, and availability fit together without taking action yet.",
    withAi: true,
    envState: {
      reminders: [
        reminderRow("reminder-existing", "Ship ME3", "2026-06-07T09:00:00.000Z"),
      ],
      calendarEvents: [
        calendarEventRow(
          "event-planning",
          "Planning call",
          "2026-06-02T10:00:00.000Z",
          "2026-06-02T10:30:00.000Z",
        ),
      ],
    },
    expected: {
      source: "workers-ai",
      routePath: "model",
      plannerKind: "conversation",
      capabilityId: "core.agent-chat.conversation",
      toolResultStatus: "not_attempted",
      modelCallStatus: "succeeded",
      replyIncludes: ["without taking action"],
      contextSummary: "present",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: true,
    },
  },
  {
    name: "Mission Control task exploration stays model-first",
    messageText:
      "I want to test Mission Control tasks and projects. What would you use there?",
    aiReply:
      "For Mission Control I would use projects, tasks, and private memory as context before suggesting next steps.",
    withAi: true,
    envState: {
      projects: [projectRow("project-launch", "ME3 Launch", "me3-launch")],
      tasks: [taskRow("task-launch", "Prepare launch checklist", "project-launch")],
    },
    expected: {
      source: "workers-ai",
      routePath: "model",
      plannerKind: "conversation",
      capabilityId: "core.agent-chat.conversation",
      toolResultStatus: "not_attempted",
      modelCallStatus: "succeeded",
      replyIncludes: ["projects", "tasks"],
      contextSummary: "present",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: true,
    },
  },
  {
    name: "mailbox draft request writes no mailbox state until save is requested",
    messageText: "Can you draft a reply to Ada about the workflow notes?",
    aiReply:
      "Subject: Workflow notes\n\nHi Ada,\n\nHere is a concise update on the workflow notes.\n\nBest,\nKieran",
    withAi: true,
    envState: {
      contacts: [contactRow("contact-ada", "Ada Lovelace", "ada@example.com", "client")],
      mailboxMessages: [
        mailboxRow({
          id: "message-ada",
          threadKey: "thread-ada",
          from: "ada@example.com",
          subject: "Workflow notes",
          body: "Ada asked for a crisp workflow update.",
        }),
      ],
    },
    expected: {
      source: "workers-ai",
      routePath: "model",
      plannerKind: "conversation",
      capabilityId: "core.agent-chat.conversation",
      toolResultStatus: "not_attempted",
      modelCallStatus: "succeeded",
      replyIncludes: ["Subject: Workflow notes"],
      contextSummary: "present",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: true,
    },
  },
  {
    name: "save latest email draft follow-up creates a mailbox draft only",
    messageText: "Save that draft to ada@example.com",
    envState: {
      recentMessages: [
        {
          role: "assistant",
          content:
            "Subject: Workflow notes\n\nHi Ada,\n\nHere is a concise update on the workflow notes.\n\nThanks,\nKieran",
        },
      ],
      mailboxAliases: [mailboxAliasRow("mailbox-owner", "owner")],
    },
    expected: {
      source: "tool",
      routePath: "tool",
      plannerKind: "write_action",
      capabilityId: "core.mailbox.draft",
      specialist: "core.mailbox.draft",
      toolResultStatus: "succeeded",
      modelCallStatus: "not_attempted",
      replyIncludes: ["saved that email as a draft", "It has not been sent"],
      contextSummary: "absent",
      reminderActionKind: null,
      emailActionKind: "drafted",
      reminderDelta: 0,
      mailboxDraftDelta: 1,
      aiCalled: false,
    },
  },
  {
    name: "ambiguous reminder create asks for details without creating one",
    messageText: "Remind me to follow up with Sam",
    expected: {
      source: "tool",
      routePath: "tool",
      plannerKind: "clarify",
      capabilityId: "core.reminders.create",
      specialist: "core.reminders.create",
      toolResultStatus: "clarified",
      modelCallStatus: "not_attempted",
      replyIncludes: ["Please include a date"],
      contextSummary: "absent",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: false,
      fallbackReason: "Reminder details required",
    },
  },
  {
    name: "missing AI provider falls back without claiming action",
    messageText: "Hello, are you working?",
    expected: {
      source: "fallback",
      routePath: "fallback",
      plannerKind: "conversation",
      capabilityId: "core.agent-chat.conversation",
      toolResultStatus: "not_attempted",
      modelCallStatus: "not_attempted",
      replyIncludes: ["ME3 Core chat is connected"],
      contextSummary: "present",
      reminderActionKind: null,
      emailActionKind: null,
      reminderDelta: 0,
      mailboxDraftDelta: 0,
      aiCalled: false,
      fallbackReason: "AI provider setup required",
    },
  },
];

describe("Core chat mailbox draft continuations", () => {
  it("saves a pending draft when the owner replies with only the missing recipient", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T12:00:00Z"));

    const aiRun = vi.fn(async () => ({
      response: "The model should not handle mailbox draft continuation.",
    }));
    const env = createEnv({
      recentMessages: [
        {
          role: "assistant",
          content:
            "Subject: Workflow notes\n\nHi Ada,\n\nHere is a concise update on the workflow notes.\n\nThanks,\nKieran",
        },
      ],
      mailboxAliases: [mailboxAliasRow("mailbox-owner", "owner")],
    });
    const storage = createStorage();
    const runtimeEnv = {
      ...env,
      AI: { run: aiRun },
      ME3_ASSISTANT_DEBUG_TRACE: "true",
    };

    const clarify = await dispatchAgentSandboxTurn(
      runtimeEnv as never,
      storage,
      dispatchInput("did you save it?"),
    );

    expect(clarify).toMatchObject({
      source: "tool",
      specialist: "core.mailbox.draft",
      fallbackReason: "Mailbox draft details required",
      emailAction: null,
    });
    expect(clarify.replyText).toContain("need the recipient email address");
    expect(countMailboxDrafts(env.state.mailboxMessages)).toBe(0);

    const saved = await dispatchAgentSandboxTurn(
      runtimeEnv as never,
      storage,
      dispatchInput("test@samualburns.com"),
    );

    expect(saved).toMatchObject({
      source: "tool",
      specialist: "core.mailbox.draft",
      fallbackReason: null,
      emailAction: {
        kind: "drafted",
      },
    });
    expect(saved.replyText).toContain("saved that email as a draft");
    expect(aiRun).not.toHaveBeenCalled();
    expect(countMailboxDrafts(env.state.mailboxMessages)).toBe(1);
    expect(env.state.mailboxMessages[0]).toMatchObject({
      to_address: "test@samualburns.com",
      subject: "Workflow notes",
      text_body: "Hi Ada,\n\nHere is a concise update on the workflow notes.\n\nThanks,\nKieran",
      created_by: "agent",
    });
  });
});

describe("Core chat golden transcript evals", () => {
  it.each(launchGoldenTranscriptScenarios)("$name", async (scenario) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T12:00:00Z"));

    const aiRun = vi.fn(async () => ({
      response: scenario.aiReply || "Model-backed launch eval reply.",
    }));
    const env = createEnv(scenario.envState);
    const initialReminderCount = env.state.reminders.length;
    const initialMailboxDraftCount = countMailboxDrafts(env.state.mailboxMessages);
    const runtimeEnv = {
      ...env,
      ME3_ASSISTANT_DEBUG_TRACE: "true",
      ...(scenario.withAi ? { AI: { run: aiRun } } : {}),
    };

    const response = await dispatchAgentSandboxTurn(
      runtimeEnv as never,
      createStorage(),
      dispatchInput(scenario.messageText),
    );

    expect(response).toMatchObject({
      source: scenario.expected.source,
      specialist: scenario.expected.specialist || expect.any(String),
      fallbackReason: scenario.expected.fallbackReason ?? null,
    });
    expect(response.trace).toMatchObject({
      planner: {
        kind: scenario.expected.plannerKind,
        capabilityId: scenario.expected.capabilityId,
      },
      route: {
        path: scenario.expected.routePath,
        capabilityId: scenario.expected.capabilityId,
      },
      modelCall: {
        status: scenario.expected.modelCallStatus,
      },
      toolResult: {
        status: scenario.expected.toolResultStatus,
      },
    });

    for (const snippet of scenario.expected.replyIncludes || []) {
      expect(response.replyText).toContain(snippet);
    }

    if (scenario.expected.contextSummary === "present") {
      expect(response.contextSummary).toEqual(expect.any(String));
    } else if (scenario.expected.contextSummary === "absent") {
      expect(response.contextSummary ?? null).toBeNull();
    }

    expect(response.reminderAction?.kind ?? null).toBe(
      scenario.expected.reminderActionKind ?? null,
    );
    expect(response.emailAction?.kind ?? null).toBe(
      scenario.expected.emailActionKind ?? null,
    );
    if (response.source !== "tool") {
      expect(response.reminderAction).toBeNull();
      expect(response.emailAction).toBeNull();
      expect(response.replyText).not.toContain("Done. I set a reminder");
      expect(response.replyText).not.toContain("saved that email as a draft");
    }
    expect(env.state.reminders).toHaveLength(
      initialReminderCount + (scenario.expected.reminderDelta ?? 0),
    );
    expect(countMailboxDrafts(env.state.mailboxMessages)).toBe(
      initialMailboxDraftCount + (scenario.expected.mailboxDraftDelta ?? 0),
    );
    if (scenario.expected.aiCalled) {
      expect(aiRun).toHaveBeenCalledOnce();
    } else {
      expect(aiRun).not.toHaveBeenCalled();
    }
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

function mailboxAliasRow(id: string, aliasLocalPart: string): Record<string, unknown> {
  return {
    id,
    user_id: "owner",
    alias_local_part: aliasLocalPart,
    forwarding_email: "owner@example.com",
    forwarding_status: "verified",
    forwarding_enabled: 1,
    forwarding_mode: "forward",
    status: "active",
    approval_policy: "manual",
    daily_inbound_limit: 200,
    daily_outbound_limit: 200,
    activated_at: "2026-05-15T09:00:00Z",
    cf_destination_id: null,
    cf_destination_verified_at: null,
    cf_rule_id: null,
    cf_last_synced_at: null,
    cf_last_error: null,
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T09:00:00Z",
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
    mailbox_id: "mailbox-owner",
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

function reminderRow(id: string, title: string, remindAt: string): Record<string, unknown> {
  return {
    id,
    user_id: "owner",
    title,
    notes: null,
    remind_at: remindAt,
    timezone: "Europe/Dublin",
    recurrence_rule: null,
    status: "pending",
    delivered_at: null,
    dismissed_at: null,
    created_at: "2026-06-01T09:00:00.000Z",
  };
}

function calendarEventRow(
  id: string,
  title: string,
  startsAt: string,
  endsAt: string,
): Record<string, unknown> {
  return {
    id,
    title,
    notes: null,
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: "Europe/Dublin",
    created_at: "2026-05-15T09:00:00Z",
    updated_at: "2026-05-15T09:00:00Z",
  };
}

function missionDashboardSettingsRow(statement: string): Record<string, unknown> {
  return {
    user_id: "owner",
    mission_statement: statement,
    timeframe: "weekly",
    updated_at: "2026-05-15T09:00:00Z",
  };
}

function wheelSnapshotRow(): Record<string, unknown> {
  return {
    id: "wheel-snapshot",
    user_id: "owner",
    segments_json: JSON.stringify([
      { id: "health", label: "Health", value: 7 },
      { id: "work", label: "Work", value: 8 },
      { id: "relationships", label: "Relationships", value: 6 },
    ]),
    notes_json: JSON.stringify({
      work: "Keep useful systems calm and practical.",
    }),
    created_at: "2026-05-15T09:00:00Z",
  };
}

function calendarSourceRow(id: string): Record<string, unknown> {
  return {
    id,
    user_id: "owner",
    provider: "google",
    status: "active",
    created_at: "2026-05-15T09:00:00Z",
  };
}

function soulinkConnectionRow(id: string): Record<string, unknown> {
  return {
    id,
    user_id: "owner",
    channel: "soulink",
    status: "active",
    created_at: "2026-05-15T09:00:00Z",
  };
}

function localExecutorPairingRow(id: string): Record<string, unknown> {
  return {
    id,
    user_id: "owner",
    status: "active",
    created_at: "2026-05-15T09:00:00Z",
  };
}

function countMailboxDrafts(messages: Array<Record<string, unknown>>): number {
  return messages.filter((message) => message.message_kind === "draft").length;
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
