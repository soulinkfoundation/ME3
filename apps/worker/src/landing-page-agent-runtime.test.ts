import { describe, expect, it } from "vitest";
import {
  createAgentLandingPageDraft,
  listAgentLandingPages,
  updateAgentLandingPageDraft,
} from "@me3-core/plugin-agent-chat";
import {
  normalizeLandingPageDocument,
  type LandingPageDocumentV3,
} from "@me3-core/plugin-landing-pages";

type PageRow = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  template_id: string;
  draft_json: string;
  published_revision_id: string | null;
  updated_at: string;
  published_at: string | null;
};

describe("landing-page Agent runtime", () => {
  it("creates, lists, and revises a versioned draft without publishing it", async () => {
    const database = createLandingPageAgentDb();
    const first = await createAgentLandingPageDraft(
      { DB: database.db },
      "owner",
      {
        purpose: "service",
        brief: "A focused positioning sprint for independent consultants.",
        headline: "Make the offer obvious",
        subheadline: "A focused sprint that turns expertise into a clear offer.",
        highlights: "Positioning: Choose a sharp promise\nPage: Write the sales story",
        ctaLabel: "Book the sprint",
      },
    );
    const second = await createAgentLandingPageDraft(
      { DB: database.db },
      "owner",
      {
        purpose: "service",
        brief: "A focused positioning sprint for independent consultants.",
        headline: "Make the offer obvious",
      },
    );

    expect(first).toMatchObject({
      siteUsername: "owner-site",
      slug: "make-the-offer-obvious",
      designPackId: "starter-service-01",
      published: false,
    });
    expect(first.editorPath).toContain(first.id);
    expect(first.previewPath).toContain(first.id);
    expect(second.slug).toBe("make-the-offer-obvious-2");

    const listed = await listAgentLandingPages(
      { DB: database.db },
      "owner",
    );
    expect(listed).toHaveLength(2);

    const updated = await updateAgentLandingPageDraft(
      { DB: database.db },
      "owner",
      {
        pageId: first.id,
        headline: "A clearer offer in one focused sprint",
        ctaLabel: "Start a conversation",
      },
    );
    expect(updated).toMatchObject({
      id: first.id,
      title: "A clearer offer in one focused sprint",
      published: false,
    });

    const document = normalizeLandingPageDocument(
      JSON.parse(database.pages.find((page) => page.id === first.id)!.draft_json),
    ) as LandingPageDocumentV3;
    expect(document.hero.headline).toBe("A clearer offer in one focused sprint");
    expect(document.actions[0]?.label).toBe("Start a conversation");
    expect(document.content.sections.find((section) => section.type === "feature-list"))
      .toMatchObject({
        items: [
          { title: "Positioning", body: "Choose a sharp promise" },
          { title: "Page", body: "Write the sales story" },
        ],
      });
  });

  it("rejects a design intended for a different page purpose", async () => {
    const database = createLandingPageAgentDb();
    await expect(
      createAgentLandingPageDraft(
        { DB: database.db },
        "owner",
        {
          purpose: "event",
          designPackId: "starter-waitlist-01",
          brief: "A small Saturday workshop.",
        },
      ),
    ).rejects.toThrow(/does not support event pages/);
    expect(database.pages).toHaveLength(0);
  });
});

function createLandingPageAgentDb() {
  const pages: PageRow[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM plugin_installations")) {
                return { enabled: 1, status: "installed" } as T;
              }
              if (sql.includes("FROM owner_profile")) {
                return {
                  name: "Owner Name",
                  bio: "A thoughtful independent consultant.",
                  avatar_url: null,
                } as T;
              }
              if (sql.includes("FROM site_pages") && sql.includes("id = ?")) {
                const [siteId, pageId] = values as [string, string];
                return (pages.find(
                  (page) => page.site_id === siteId && page.id === pageId,
                ) || null) as T | null;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM sites")) {
                return {
                  results: [
                    {
                      id: "site-1",
                      username: "owner-site",
                      custom_domain: null,
                      updated_at: "2026-07-20T12:00:00.000Z",
                    },
                  ] as T[],
                };
              }
              if (sql.includes("SELECT slug FROM site_pages")) {
                return {
                  results: pages.map((page) => ({ slug: page.slug })) as T[],
                };
              }
              if (sql.includes("FROM site_pages")) {
                return { results: [...pages].reverse() as T[] };
              }
              return { results: [] as T[] };
            },
            async run() {
              if (sql.includes("INSERT INTO site_pages")) {
                const [id, siteId, slug, title, templateId, draftJson] =
                  values as [string, string, string, string, string, string];
                pages.push({
                  id,
                  site_id: siteId,
                  slug,
                  title,
                  template_id: templateId,
                  draft_json: draftJson,
                  published_revision_id: null,
                  updated_at: "2026-07-20T12:00:00.000Z",
                  published_at: null,
                });
                return { meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE site_pages")) {
                const [title, templateId, draftJson, id, siteId] =
                  values as [string, string, string, string, string];
                const page = pages.find(
                  (candidate) => candidate.id === id && candidate.site_id === siteId,
                );
                if (page) {
                  page.title = title;
                  page.template_id = templateId;
                  page.draft_json = draftJson;
                }
                return { meta: { changes: page ? 1 : 0 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
  };
  return { db, pages };
}
