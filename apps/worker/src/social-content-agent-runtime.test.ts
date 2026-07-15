import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runCoreAgentToolTurn,
  type AgentToolMessage,
} from "@me3-core/plugin-agent-chat";

type Row = Record<string, unknown>;

afterEach(() => {
  vi.useRealTimers();
});

describe("Social content Agent Runtime v2", () => {
  it("reads today's Journal entry and saves distinct platform drafts for review", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00Z"));
    const database = createSocialAgentDb({
      journals: [{
        id: "journal-1",
        user_id: "owner",
        entry_date: "2026-07-10",
        title: "Small useful slices",
        body: "Today we shipped the smallest useful slice and learned from it.",
        body_format: "markdown",
        updated_at: "2026-07-10T11:00:00Z",
        archived_at: null,
      }],
    });
    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "social-journal",
      turnId: "turn-social-journal",
      ownerTimezone: "Europe/Dublin",
      route: workersRoute([
        toolCall("read-journal", "core_social_source_read", {
          sourceType: "journal",
          sourceId: "today",
        }),
        toolCall("save-journal", "core_social_draft_create", {
          sourceType: "journal",
          sourceId: "today",
          ideaText: "Small useful slices create faster learning.",
          linkedinBody: "The fastest way to learn is to ship a small useful slice.\n\nToday we did exactly that—and the feedback made the next step clearer.",
          xBody: "Ship the smallest useful slice. Learn. Then sharpen the next one.",
          instagramBody: "Small can still be useful. ✨\n\nShip one clear slice. Learn from real feedback. Make the next move sharper.",
        }),
        { response: "I saved three platform-specific drafts for your review." },
      ]) as never,
      messages: baseMessages("Turn today's journal into LinkedIn, X, and Instagram drafts."),
    });

    expect(response).toMatchObject({
      specialist: "core.social.draft.create",
      contentAction: {
        kind: "saved",
        packageId: expect.stringMatching(/^social-package-/),
        platforms: ["linkedin", "x", "instagram"],
      },
      actionCards: [expect.objectContaining({
        kind: "social.draft_saved",
        status: "pending_approval",
      })],
    });
    expect(database.packages[0]).toMatchObject({
      source_type: "journal",
      source_ref: "journal:journal-1",
      created_by: "agent",
    });
    expect(database.packages[0]?.source_snapshot).toContain(
      "Today we shipped the smallest useful slice",
    );
    expect(database.variants.map((variant) => variant.platform)).toEqual([
      "linkedin",
      "x",
      "instagram",
    ]);
    expect(new Set(database.variants.map((variant) => variant.body_text)).size).toBe(3);
    expect(database.variants.every((variant) => variant.approval_status === "draft")).toBe(true);
  });

  it("reads an exact Mission Control task and preserves its provenance", async () => {
    const database = createSocialAgentDb({
      tasks: [{
        id: "task-1",
        user_id: "owner",
        title: "Publish the social workflow",
        description: "Make journal-to-social drafting feel effortless.",
        status: "in_progress",
        priority: 2,
        due_at: "2026-07-15",
        project_id: "project-me3",
        project_name: "ME3",
        updated_at: "2026-07-10T10:00:00Z",
        archived_at: null,
      }],
    });
    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "social-task",
      turnId: "turn-social-task",
      ownerTimezone: "Europe/Dublin",
      route: workersRoute([
        toolCall("read-task", "core_social_source_read", {
          sourceType: "mission_task",
          sourceId: "task-1",
        }),
        toolCall("save-task", "core_social_draft_create", {
          sourceType: "mission_task",
          sourceId: "task-1",
          ideaText: "Turn planning work into useful public progress notes.",
          linkedinBody: "Your task list can be more than admin. It can become the raw material for useful progress notes.",
        }),
        { response: "Saved a LinkedIn draft from the Mission Control task." },
      ]) as never,
      messages: baseMessages("Use Mission Control task ID task-1 for a LinkedIn post."),
    });

    expect(response.contentAction?.platforms).toEqual(["linkedin"]);
    expect(database.packages[0]).toMatchObject({
      source_type: "mission_task",
      source_ref: "mission_task:task-1",
    });
    expect(database.packages[0]?.source_snapshot).toContain("project-me3");
    expect(database.variants[0]).toMatchObject({
      platform: "linkedin",
      approval_status: "draft",
      target_account_id: null,
    });
  });

  it("revalidates a source selected in a previous turn before saving drafts", async () => {
    const database = createSocialAgentDb({
      tasks: [{
        id: "task-cross-turn",
        user_id: "owner",
        title: "Eating our own AI cooking",
        description: "The first source snapshot.",
        status: "in_progress",
        priority: 2,
        due_at: null,
        project_id: "project-me3",
        project_name: "ME3",
        updated_at: "2026-07-14T10:00:00Z",
        archived_at: null,
      }],
    });
    const selected = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "social-cross-turn-read",
      turnId: "turn-social-cross-turn-read",
      ownerTimezone: "Europe/Dublin",
      route: workersRoute([
        toolCall("read-cross-turn", "core_social_source_read", {
          sourceType: "mission_task",
          sourceId: "task-cross-turn",
        }),
        { response: "I found and read the requested task." },
      ]) as never,
      messages: baseMessages("Use the task Eating our own AI cooking."),
    });
    const sourceReference = selected.replyText || "";
    expect(sourceReference).toContain("Source: mission_task:task-cross-turn");

    database.tasks[0]!.description = "The fresh source snapshot after selection.";
    database.tasks[0]!.updated_at = "2026-07-15T10:00:00Z";
    const drafted = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "social-cross-turn-draft",
      turnId: "turn-social-cross-turn-draft",
      ownerTimezone: "Europe/Dublin",
      route: workersRoute([
        toolCall("save-cross-turn", "core_social_draft_create", {
          sourceType: "mission_task",
          sourceId: "task-cross-turn",
          ideaText: "Use your own product to discover the rough edges.",
          linkedinBody: "The fastest way to improve an AI product is to use it for your own real work.",
        }),
        { response: "Saved the selected source as a LinkedIn draft." },
      ]) as never,
      messages: [
        ...baseMessages("Use the task Eating our own AI cooking."),
        { role: "assistant" as const, content: sourceReference },
        { role: "user", content: "Great, create the LinkedIn draft." },
      ],
    });

    expect(drafted.contentAction?.platforms).toEqual(["linkedin"]);
    expect(database.packages[0]?.source_snapshot).toContain(
      "The fresh source snapshot after selection.",
    );
    expect(database.packages[0]?.source_snapshot).not.toContain("The first source snapshot.");
  });

  it("refuses to create drafts when the exact source cannot be revalidated", async () => {
    const database = createSocialAgentDb();
    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "social-unread",
      turnId: "turn-social-unread",
      ownerTimezone: "Europe/Dublin",
      route: workersRoute([
        toolCall("save-unread", "core_social_draft_create", {
          sourceType: "journal",
          sourceId: "today",
          ideaText: "An invented angle",
          xBody: "An invented post.",
        }),
        { response: "I need to read the source before I can save the draft." },
      ]) as never,
      messages: baseMessages("Make an X post from today's journal."),
    });

    expect(response.replyText).toContain("read the source");
    expect(response.contentAction).toBeNull();
    expect(database.packages).toHaveLength(0);
    expect(database.executions[0]).toMatchObject({
      status: "failed",
      error_message: expect.stringContaining("No Journal entry was found"),
    });
  });
});

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function toolCall(id: string, name: string, args: Row) {
  return { tool_calls: [{ id, name, arguments: args }] };
}

function workersRoute(payloads: unknown[]) {
  return {
    providerId: "workers-ai" as const,
    model: "workers-test-model",
    backupModel: null,
    apiKey: null,
    ai: { run: vi.fn(async () => payloads.shift()) },
    aiGateway: null,
    configured: true,
  };
}

function createSocialAgentDb(input: { journals?: Row[]; tasks?: Row[] } = {}) {
  const state = {
    sites: [{ id: "site-1", user_id: "owner", site_type: "profile", created_at: "2026-01-01" }],
    journals: input.journals || [],
    tasks: input.tasks || [],
    executions: [] as Row[],
    packages: [] as Row[],
    variants: [] as Row[],
    events: [] as Row[],
  };
  const db = {
    prepare(sql: string) {
      return new Statement(sql, state);
    },
    async batch(statements: Statement[]) {
      for (const statement of statements) await statement.run();
      return [];
    },
  };
  return { db, ...state };
}

class Statement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly state: {
      sites: Row[];
      journals: Row[];
      tasks: Row[];
      executions: Row[];
      packages: Row[];
      variants: Row[];
      events: Row[];
    },
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    if (this.sql.includes("FROM agent_tool_executions")) {
      const [userId, requestId, toolCallId] = this.values;
      return (this.state.executions.find((row) =>
        row.user_id === userId && row.request_id === requestId && row.tool_call_id === toolCallId
      ) || null) as T | null;
    }
    if (this.sql.includes("FROM journal_entries")) {
      const [userId, ref] = this.values;
      const key = this.sql.includes("entry_date = ?") ? "entry_date" : "id";
      return (this.state.journals.find((row) =>
        row.user_id === userId && row[key] === ref && row.archived_at === null
      ) || null) as T | null;
    }
    if (this.sql.includes("FROM mission_tasks t")) {
      const [userId, taskId] = this.values;
      return (this.state.tasks.find((row) =>
        row.user_id === userId && row.id === taskId && row.archived_at === null
      ) || null) as T | null;
    }
    if (this.sql.includes("SELECT id FROM sites") && this.sql.includes("WHERE id = ?")) {
      const [siteId, userId] = this.values;
      return (this.state.sites.find((row) => row.id === siteId && row.user_id === userId) || null) as T | null;
    }
    if (this.sql.includes("SELECT id FROM sites")) {
      const [userId] = this.values;
      return (this.state.sites.find((row) => row.user_id === userId) || null) as T | null;
    }
    if (this.sql.includes("FROM social_packages p")) {
      const [packageId, userId] = this.values;
      const pkg = this.state.packages.find((row) => row.id === packageId);
      const site = this.state.sites.find((row) => row.id === pkg?.site_id && row.user_id === userId);
      return (site ? pkg : null) as T | null;
    }
    return null as T | null;
  }

  async all<T>() {
    if (this.sql.includes("FROM social_variants")) {
      const [packageId] = this.values;
      return { results: this.state.variants.filter((row) => row.package_id === packageId) as T[] };
    }
    return { results: [] as T[] };
  }

  async run() {
    if (this.sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
      const [id, userId, requestId, toolCallId, toolName] = this.values;
      this.state.executions.push({
        id,
        user_id: userId,
        request_id: requestId,
        tool_call_id: toolCallId,
        tool_name: toolName,
        status: "running",
        result_json: null,
        error_message: null,
      });
    } else if (this.sql.includes("UPDATE agent_tool_executions")) {
      const execution = this.state.executions.find((row) => row.id === this.values[1]);
      if (execution && this.sql.includes("status = 'succeeded'")) {
        Object.assign(execution, { status: "succeeded", result_json: this.values[0], error_message: null });
      }
      if (execution && this.sql.includes("status = 'failed'")) {
        Object.assign(execution, { status: "failed", error_message: this.values[0] });
      }
    } else if (this.sql.includes("INSERT INTO social_packages")) {
      const [id, siteId, postSlug, title, sourceHash, goal, createdBy, sourceType, sourceRef, sourceSnapshot, ideaText, createdAt, updatedAt] = this.values;
      this.state.packages.push({
        id, site_id: siteId, post_slug: postSlug, post_title_snapshot: title,
        source_hash: sourceHash, goal, status: "ready", created_by: createdBy,
        source_type: sourceType, source_ref: sourceRef, source_snapshot: sourceSnapshot,
        idea_text: ideaText, created_at: createdAt, updated_at: updatedAt,
      });
    } else if (this.sql.includes("INSERT INTO social_variants")) {
      const [id, packageId, platform, targetAccountId, format, bodyText, assets, sourceExcerpt, createdAt, updatedAt] = this.values;
      this.state.variants.push({
        id, package_id: packageId, platform, target_account_id: targetAccountId,
        format, body_text: bodyText, asset_manifest_json: assets,
        source_excerpt: sourceExcerpt, approval_status: "draft", approved_at: null,
        approved_by_user_id: null, scheduled_for: null, timezone: null,
        created_at: createdAt, updated_at: updatedAt,
      });
    } else if (this.sql.includes("INSERT INTO social_publication_events")) {
      this.state.events.push({ id: this.values[0], variant_id: this.values[1] });
    }
    return { meta: { changes: 1 } };
  }
}
