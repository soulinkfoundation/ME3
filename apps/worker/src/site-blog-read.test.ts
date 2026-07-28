import { describe, expect, it } from "vitest";
import { readAgentSiteBlogPosts } from "../../../packages/agent-chat/src/site-blog";

describe("site blog Agent read contract", () => {
  it("lists previews and reads one full owner-scoped post", async () => {
    const env = createBlogEnv();

    const list = await readAgentSiteBlogPosts(env, "owner", {});
    expect(list).toMatchObject({
      ok: true,
      mode: "list",
      site: { username: "kieran" },
      posts: [
        {
          slug: "agent-context",
          title: "Agent Context",
          bodyMarkdown: "# Agent Context Context keeps the assistant grounded.",
        },
      ],
    });

    const read = await readAgentSiteBlogPosts(env, "owner", {
      post: "agent context",
    });
    expect(read).toMatchObject({
      ok: true,
      mode: "post",
      posts: [
        {
          slug: "agent-context",
          bodyMarkdown: "# Agent Context\n\nContext keeps the assistant grounded.",
        },
      ],
    });
  });

  it("does not read another owner's profile site", async () => {
    const result = await readAgentSiteBlogPosts(createBlogEnv(), "other-owner", {});
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("could not find a profile site"),
    });
  });
});

function createBlogEnv() {
  const files = new Map<string, unknown>([
    [
      "site-profile:src/me.json",
      Array.from(
        new TextEncoder().encode(
          JSON.stringify({
            handle: "kieran",
            posts: [
              {
                slug: "agent-context",
                title: "Agent Context",
                file: "blog/agent-context.md",
                draft: false,
              },
            ],
          }),
        ),
      ),
    ],
    [
      "site-profile:src/blog/agent-context.md",
      Object.fromEntries(
        new TextEncoder()
          .encode("# Agent Context\n\nContext keeps the assistant grounded.")
          .entries(),
      ),
    ],
  ]);

  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async all() {
                if (!sql.includes("FROM sites") || values[0] !== "owner") {
                  return { results: [] };
                }
                return {
                  results: [
                    {
                      id: "site-profile",
                      username: "kieran",
                      custom_domain: null,
                      published_at: null,
                      updated_at: "2026-06-01T00:00:00.000Z",
                    },
                  ],
                };
              },
              async first() {
                if (!sql.includes("FROM site_files")) return null;
                const content = files.get(`${values[0]}:${values[1]}`);
                return content === undefined ? null : { content };
              },
            };
          },
        };
      },
    },
  } as never;
}
