import { describe, expect, it } from "vitest";
import {
  createSitePage,
  publishSitePage,
  unpublishSitePage,
} from "./site-pages";
import type { DbSite, DbSitePage, DbSitePageRevision, Env } from "./types";

type State = {
  pages: DbSitePage[];
  revisions: DbSitePageRevision[];
  files: Map<string, string>;
};

function createEnv() {
  const state: State = { pages: [], revisions: [], files: new Map() };
  const DB = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...input: unknown[]) {
          values = input;
          return this;
        },
        async run() {
          if (sql.includes("INSERT INTO site_pages")) {
            state.pages.push({
              id: values[0] as string,
              site_id: values[1] as string,
              slug: values[2] as string,
              kind: "landing_page",
              title: values[3] as string,
              template_id: values[4] as string,
              draft_json: values[5] as string,
              published_revision_id: null,
              created_at: "2026-07-10T12:00:00Z",
              updated_at: "2026-07-10T12:00:00Z",
              published_at: null,
            });
          } else if (sql.includes("INSERT INTO site_page_revisions")) {
            state.revisions.push({
              id: values[0] as string,
              page_id: values[1] as string,
              document_json: values[2] as string,
              rendered_html: values[3] as string,
              created_at: "2026-07-10T12:01:00Z",
            });
          } else if (sql.includes("INSERT INTO site_files")) {
            state.files.set(`${values[0]}:${values[1]}`, new TextDecoder().decode(values[2] as Uint8Array));
          } else if (sql.includes("published_revision_id = ?")) {
            const page = state.pages.find((candidate) => candidate.id === values[1]);
            if (page) {
              page.published_revision_id = values[0] as string;
              page.published_at = "2026-07-10T12:01:00Z";
            }
          } else if (sql.includes("published_revision_id = NULL")) {
            const page = state.pages.find((candidate) => candidate.id === values[0]);
            if (page) {
              page.published_revision_id = null;
              page.published_at = null;
            }
          } else if (sql.includes("DELETE FROM site_files")) {
            state.files.delete(`${values[0]}:${values[1]}`);
          }
          return { meta: { changes: 1 } };
        },
        async first<T>() {
          if (sql.includes("FROM site_pages")) {
            return (state.pages.find(
              (page) => page.site_id === values[0] && page.id === values[1],
            ) || null) as T | null;
          }
          if (sql.includes("FROM site_page_revisions")) {
            return (state.revisions.find((revision) => revision.id === values[0]) || null) as T | null;
          }
          return null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
    },
  };
  return { env: { DB } as unknown as Env, state };
}

const site: DbSite = {
  id: "site-1",
  user_id: "owner",
  username: "owner",
  site_type: "profile",
  template_id: null,
  custom_domain: null,
  custom_domain_status: null,
  custom_domain_cf_id: null,
  created_at: "2026-07-10T12:00:00Z",
  updated_at: "2026-07-10T12:00:00Z",
  published_at: "2026-07-10T12:00:00Z",
};

describe("site pages", () => {
  it("publishes a waitlist as a versioned path with a working signup action", async () => {
    const { env, state } = createEnv();
    const page = await createSitePage(env, site, {
      username: site.username,
      slug: "private-launch",
      brief: "A private launch list for thoughtful founders.",
      template: "waitlist",
      profile: { name: "Owner", bio: null, avatar: null, profileUrl: null },
    });

    const published = await publishSitePage(env, site, page.id);
    const html = state.files.get("site-1:public/private-launch/index.html") || "";

    expect(published.page.published_revision_id).toBe(published.revision.id);
    expect(state.revisions).toHaveLength(1);
    expect(html).toContain("/api/sites/owner/subscribe");
    expect(html).toContain(`name="pageId" value="${page.id}"`);

    await unpublishSitePage(env, site, page.id);
    expect(state.files.has("site-1:public/private-launch/index.html")).toBe(false);
  });

  it("fails closed when a booking action has no selected offer", async () => {
    const { env } = createEnv();
    const page = await createSitePage(env, site, {
      username: site.username,
      slug: "strategy",
      brief: "A strategy session for independent consultants.",
      template: "service",
      profile: { name: "Owner", bio: null, avatar: null, profileUrl: null },
    });

    await expect(publishSitePage(env, site, page.id)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Choose a booking"),
    });
  });
});
