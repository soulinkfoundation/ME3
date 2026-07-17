import { describe, expect, it } from "vitest";
import { parseSiteBlogPostArchiveChatRequest } from "../../../packages/agent-chat/src/site-blog";

function createBlogEnv() {
  const files = new Map<string, string>([
    [
      "src/me.json",
      JSON.stringify({
        handle: "kieran",
        posts: [
          {
            slug: "old-launch-notes",
            title: "Old Launch Notes",
            file: "blog/old-launch-notes.md",
            draft: false,
          },
        ],
      }),
    ],
    ["src/blog/old-launch-notes.md", "# Old Launch Notes\n\nLegacy body."],
  ]);

  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async all() {
                if (!sql.includes("FROM sites")) return { results: [] };
                return {
                  results: [
                    {
                      id: "site-profile",
                      username: "kieran",
                      site_type: "profile",
                      custom_domain: null,
                      published_at: null,
                      updated_at: "2026-06-01T00:00:00.000Z",
                    },
                  ],
                };
              },
              async first() {
                if (!sql.includes("FROM site_files")) return null;
                const path = values[1];
                const content = typeof path === "string" ? files.get(path) : undefined;
                return content === undefined
                  ? null
                  : {
                    site_id: values[0],
                    path,
                    content,
                    content_type: "text/plain",
                    updated_at: "2026-06-01T00:00:00.000Z",
                  };
              },
            };
          },
        };
      },
    },
  } as never;
}

describe("site blog command parsing", () => {
  it("resolves the title from a post archive request", async () => {
    const result = await parseSiteBlogPostArchiveChatRequest(
      createBlogEnv(),
      "owner",
      "Delete the old launch notes post.",
    );

    expect(result).toMatchObject({
      site: { username: "kieran" },
      post: { slug: "old-launch-notes", title: "Old Launch Notes" },
    });
  });
});
