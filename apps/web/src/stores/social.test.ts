import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { api } from "../api";
import {
  useSocialStore,
  type PostVersion,
  type Publication,
  type SocialPostDetail,
  type SocialSuggestion,
} from "./social";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class extends Error {},
}));

describe("social store Post workflow", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads source-backed Posts for one site", async () => {
    vi.mocked(api.get).mockResolvedValue({ posts: [{ post: { id: "post-1" }, versions: [] }] });

    const result = await useSocialStore().fetchSocialPosts("site one");

    expect(result).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/social/posts?siteId=site%20one");
  });

  it("creates a Post from explicit pasted Source text", async () => {
    const input = {
      siteId: "site-1",
      sourceType: "pasted" as const,
      sourceSnapshot: "Owner-authored source",
      sourceText: "Owner-authored source",
      ideaText: "Owner-authored source",
      versions: [{ platform: "linkedin" as const, bodyText: "Owner-authored source" }],
    };
    const post = { post: { id: "post-1" }, versions: [] };
    vi.mocked(api.post).mockResolvedValue({ post });

    expect(await useSocialStore().createSocialPost(input)).toBe(post);
    expect(api.post).toHaveBeenCalledWith("/social/posts", input);
  });

  it("loads, edits, discards, and chooses grounded Suggestions", async () => {
    const suggestion = {
      id: "suggestion-1",
      bodyText: "Grounded text",
      updatedAt: "2026-07-18T08:00:00.000Z",
    } as SocialSuggestion;
    const post = {
      post: {
        id: "post-1",
        siteId: "site-1",
        sourceType: "journal",
        sourceRef: "journal:journal-1",
        sourceSnapshot: '{"id":"journal-1"}',
        sourceText: "Grounded Source text",
        ideaText: "Grounded text",
        goal: null,
        status: "ready",
        createdBy: "user",
        createdAt: "2026-07-18T08:00:00.000Z",
        updatedAt: "2026-07-18T08:00:00.000Z",
      },
      versions: [],
    } satisfies SocialPostDetail;
    vi.mocked(api.get).mockResolvedValue({ suggestions: [suggestion] });
    vi.mocked(api.patch).mockResolvedValue({ suggestion });
    vi.mocked(api.delete).mockResolvedValue({ suggestion });
    vi.mocked(api.post).mockResolvedValue({ suggestion, post });
    const store = useSocialStore();

    expect(await store.fetchSocialSuggestions("site one")).toEqual([suggestion]);
    expect(api.get).toHaveBeenCalledWith("/social/suggestions?siteId=site%20one");
    expect(
      await store.updateSocialSuggestion("suggestion one", {
        bodyText: "Grounded text",
        expectedUpdatedAt: suggestion.updatedAt,
      }),
    ).toBe(suggestion);
    expect(api.patch).toHaveBeenCalledWith("/social/suggestions/suggestion%20one", {
      bodyText: "Grounded text",
      expectedUpdatedAt: suggestion.updatedAt,
    });
    expect(
      await store.discardSocialSuggestion("suggestion one", suggestion.updatedAt),
    ).toBe(suggestion);
    expect(api.delete).toHaveBeenCalledWith(
      "/social/suggestions/suggestion%20one?expectedUpdatedAt=2026-07-18T08%3A00%3A00.000Z",
    );
    expect(
      await store.chooseSocialSuggestion(
        "suggestion one",
        ["linkedin", "x"],
        suggestion.updatedAt,
      ),
    ).toEqual({ suggestion, post });
    expect(api.post).toHaveBeenCalledWith("/social/suggestions/suggestion%20one/post", {
      platforms: ["linkedin", "x"],
      expectedUpdatedAt: suggestion.updatedAt,
    });
  });

  it("updates one exact Post Version", async () => {
    const version = {
      id: "version-1",
      postId: "post-1",
      platform: "linkedin",
      approvalStatus: "approved",
    } as PostVersion;
    vi.mocked(api.patch).mockResolvedValue({ version });

    const result = await useSocialStore().updatePostVersion("version-1", {
      targetAccountId: "account-1",
      approvalStatus: "approved",
    });

    expect(result).toBe(version);
    expect(api.patch).toHaveBeenCalledWith("/social/versions/version-1", {
      targetAccountId: "account-1",
      approvalStatus: "approved",
    });
  });

  it("lists Publications for one exact Post Version", async () => {
    const publication = { id: "publication-1", versionId: "version-1" } as Publication;
    vi.mocked(api.get).mockResolvedValue({ publications: [publication] });

    const result = await useSocialStore().listPostVersionPublications("version one");

    expect(result).toEqual([publication]);
    expect(api.get).toHaveBeenCalledWith(
      "/social/versions/version%20one/publications",
    );
  });

  it("creates a scheduled Publication for one exact Post Version", async () => {
    const publication = { id: "publication-1", versionId: "version-1" } as Publication;
    const input = {
      scheduledFor: "2026-08-01T09:00:00.000Z",
      timezone: "Europe/Dublin",
      requestContext: { source: "social-library" },
    };
    vi.mocked(api.post).mockResolvedValue({ publication });

    const result = await useSocialStore().createPostVersionPublication("version-1", input);

    expect(result).toBe(publication);
    expect(api.post).toHaveBeenCalledWith(
      "/social/versions/version-1/publications",
      input,
    );
  });

  it("creates an immediate Publication through the publish action", async () => {
    const publication = { id: "publication-1", versionId: "version-1" } as Publication;
    vi.mocked(api.post).mockResolvedValue({ publication });

    expect(await useSocialStore().publishPostVersion("version-1")).toBe(publication);
    expect(api.post).toHaveBeenCalledWith("/social/versions/version-1/publish", {});
  });

  it("cancels one Publication by Publication id", async () => {
    const publication = { id: "publication-1", versionId: "version-1" } as Publication;
    vi.mocked(api.delete).mockResolvedValue({ publication });

    expect(await useSocialStore().cancelPublication("publication one")).toBe(publication);
    expect(api.delete).toHaveBeenCalledWith("/social/publications/publication%20one");
  });

  it("resolves an ambiguous outcome by Publication id", async () => {
    const publication = { id: "publication-1", versionId: "version-1" } as Publication;
    vi.mocked(api.post).mockResolvedValue({ publication });

    expect(
      await useSocialStore().resolvePublicationOutcome(
        "publication one",
        "published",
        "https://linkedin.example/posts/1",
      ),
    ).toBe(publication);
    expect(api.post).toHaveBeenCalledWith(
      "/social/publications/publication%20one/resolve",
      {
        outcome: "published",
        platformPostUrl: "https://linkedin.example/posts/1",
      },
    );
  });

  it("sends the selected OAuth credential source", async () => {
    vi.mocked(api.post).mockResolvedValue({ url: "https://linkedin.example/oauth" });

    await useSocialStore().startSocialOAuth("linkedin", "site-1", "/social", "byo");

    expect(api.post).toHaveBeenCalledWith("/social/linkedin/authorize", {
      siteId: "site-1",
      returnPath: "/social",
      credentialSource: "byo",
    });
  });
});
