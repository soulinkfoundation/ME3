import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runCoreAgentToolTurn,
  type AgentToolMessage,
} from "@me3-core/plugin-agent-chat";

describe("Assistant read tools Runtime v2 contract", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads upcoming confirmed owner bookings through a model-selected tool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T10:00:00.000Z"));
    const database = createReadToolsDb();
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: "bookings-read-1",
            name: "core_bookings_lookup",
            arguments: { limit: 8 },
          },
        ],
      })
      .mockResolvedValueOnce({
        response: "You have one upcoming confirmed booking.",
      });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "bookings-read-request",
      turnId: "bookings-read-turn",
      ownerTimezone: "Europe/Dublin",
      route: testRoute(aiRun),
      messages: baseMessages("What bookings do I have coming up?"),
    });

    expect(response).toMatchObject({
      specialist: "core.bookings.lookup",
      replyText: "You have one upcoming confirmed booking.",
    });
    expect(JSON.stringify(aiRun.mock.calls[1]?.[1])).toContain("Ada Lovelace");
    expect(JSON.stringify(aiRun.mock.calls[1]?.[1])).not.toContain("Other Owner");
    expect(database.executions[0]?.tool_name).toBe("core_bookings_lookup");
  });

  it("lists and reads owner blog posts through one read-only tool", async () => {
    const database = createReadToolsDb();
    const aiRun = vi.fn()
      .mockResolvedValueOnce({
        tool_calls: [
          {
            id: "blog-read-1",
            name: "core_sites_blog_post_read",
            arguments: { post: "Agent Context" },
          },
        ],
      })
      .mockResolvedValueOnce({
        response: "The Agent Context post explains how stored context keeps the assistant grounded.",
      });

    const response = await runCoreAgentToolTurn({
      db: database.db,
      userId: "owner",
      requestId: "blog-read-request",
      turnId: "blog-read-turn",
      ownerTimezone: "Europe/Dublin",
      route: testRoute(aiRun),
      messages: baseMessages("Read my Agent Context blog post."),
    });

    expect(response).toMatchObject({
      specialist: "core.sites.blog_post.read",
    });
    const secondModelInput = JSON.stringify(aiRun.mock.calls[1]?.[1]);
    expect(secondModelInput).toContain("Context keeps the assistant grounded");
    expect(secondModelInput).not.toContain("Other Owner Post");
    expect(database.executions[0]?.tool_name).toBe("core_sites_blog_post_read");
  });
});

function baseMessages(message: string): AgentToolMessage[] {
  return [
    { role: "system", content: "You are ME3." },
    { role: "user", content: message },
  ];
}

function testRoute(aiRun: ReturnType<typeof vi.fn>) {
  return {
    providerId: "workers-ai",
    model: "workers-test-model",
    backupModel: null,
    apiKey: null,
    ai: { run: aiRun },
    aiGateway: null,
    configured: true,
  } as never;
}

function createReadToolsDb() {
  const executions: Array<{
    id: string;
    user_id: string;
    request_id: string;
    tool_call_id: string;
    tool_name: string;
    status: string;
    result_json: string | null;
    error_message: string | null;
  }> = [];
  const files = new Map<string, string>([
    [
      "site-owner:src/me.json",
      JSON.stringify({
        handle: "owner-site",
        posts: [
          {
            slug: "agent-context",
            title: "Agent Context",
            file: "blog/agent-context.md",
            draft: false,
          },
        ],
      }),
    ],
    [
      "site-owner:src/blog/agent-context.md",
      "# Agent Context\n\nContext keeps the assistant grounded.",
    ],
    [
      "site-other:src/me.json",
      JSON.stringify({
        posts: [
          {
            slug: "other-owner-post",
            title: "Other Owner Post",
            file: "blog/other-owner.md",
          },
        ],
      }),
    ],
  ]);
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM agent_tool_executions")) {
                return (executions.find(
                  (item) =>
                    item.user_id === values[0] &&
                    item.request_id === values[1] &&
                    item.tool_call_id === values[2],
                ) || null) as T;
              }
              if (sql.includes("FROM site_files")) {
                const content = files.get(`${values[0]}:${values[1]}`);
                return (content === undefined ? null : { content }) as T;
              }
              return null as T;
            },
            async all<T>() {
              if (sql.includes("FROM bookings b")) {
                const rows = values[0] === "owner"
                  ? [
                      {
                        site_username: "owner-site",
                        booking_type: "one_to_one",
                        guest_name: "Ada Lovelace",
                        guest_email: "ada@example.com",
                        starts_at: "2026-07-29T09:00:00.000Z",
                        ends_at: "2026-07-29T09:30:00.000Z",
                        duration_minutes: 30,
                        notes: "Launch review.",
                        payment_status: "not_required",
                        is_free_booking: 1,
                      },
                    ]
                  : [
                      {
                        site_username: "other-site",
                        guest_name: "Other Owner",
                      },
                    ];
                return { results: rows as T[] };
              }
              if (sql.includes("FROM sites")) {
                const rows = values[0] === "owner"
                  ? [
                      {
                        id: "site-owner",
                        username: "owner-site",
                        custom_domain: null,
                        published_at: null,
                        updated_at: "2026-07-28T00:00:00.000Z",
                      },
                    ]
                  : [
                      {
                        id: "site-other",
                        username: "other-site",
                        custom_domain: null,
                        published_at: null,
                        updated_at: "2026-07-28T00:00:00.000Z",
                      },
                    ];
                return { results: rows as T[] };
              }
              return { results: [] as T[] };
            },
            async run() {
              if (sql.includes("INSERT OR IGNORE INTO agent_tool_executions")) {
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
              if (sql.includes("UPDATE agent_tool_executions")) {
                const execution = executions.find((item) => item.id === values[1]);
                if (execution && sql.includes("status = 'succeeded'")) {
                  execution.status = "succeeded";
                  execution.result_json = values[0] as string;
                }
                if (execution && sql.includes("status = 'failed'")) {
                  execution.status = "failed";
                  execution.error_message = values[0] as string;
                }
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { db, executions };
}
