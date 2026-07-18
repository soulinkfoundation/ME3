import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSocialContentRoutes } from "./routes/social-content";

const socialPublishing = vi.hoisted(() => ({
  cancelPublication: vi.fn(),
  chooseSocialSuggestion: vi.fn(),
  createPostVersionPublication: vi.fn(),
  createSocialPost: vi.fn(),
  createSocialSuggestions: vi.fn(),
  discardSocialSuggestion: vi.fn(),
  getSocialPost: vi.fn(),
  getSocialPublishingRuntimeStatus: vi.fn(),
  listPostVersionPublications: vi.fn(),
  listSocialPosts: vi.fn(),
  listSocialSuggestions: vi.fn(),
  resolvePublicationOutcome: vi.fn(),
  updatePostVersion: vi.fn(),
  updateSocialSuggestion: vi.fn(),
}));

vi.mock("./social-publishing", () => ({
  ...socialPublishing,
  SocialPostInputError: class SocialPostInputError extends Error {
    readonly status: 400 | 403 | 404 | 409;
    constructor(message: string, status: 400 | 403 | 404 | 409 = 400) {
      super(message);
      this.status = status;
    }
  },
  SocialPublishingGateError: class SocialPublishingGateError extends Error {
    readonly gate = { ready: false };
    readonly status = 403;
  },
  SocialPublishingInputError: class SocialPublishingInputError extends Error {
    readonly status = 400;
  },
}));

describe("grounded Social Suggestion routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({ ready: true });
  });

  it("lists owner Suggestions for one site", async () => {
    const suggestion = { id: "suggestion-1", status: "suggested" };
    socialPublishing.listSocialSuggestions.mockResolvedValue([suggestion]);

    const response = await createApp().fetch(
      new Request("http://localhost/api/social/suggestions?siteId=site-1&status=suggested"),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [suggestion] });
    expect(socialPublishing.listSocialSuggestions).toHaveBeenCalledWith(
      {},
      "owner",
      "site-1",
      "suggested",
    );
  });

  it("records route-created Suggestions as owner-authored actions", async () => {
    const input = {
      siteId: "site-1",
      sourceType: "pasted",
      sourceTitle: "Pasted Source",
      sourceSnapshot: "Owner text",
      sourceText: "Owner text",
      createdBy: "agent",
      suggestions: [
        { kind: "quote", bodyText: "Owner text", sourceExcerpt: "Owner text" },
        { kind: "short_post", bodyText: "Owner text", sourceExcerpt: "Owner text" },
      ],
    };
    socialPublishing.createSocialSuggestions.mockResolvedValue([{ id: "suggestion-1" }]);

    const env = {};
    const response = await createApp().fetch(jsonRequest(
      "http://localhost/api/social/suggestions",
      "POST",
      input,
    ), env as never);

    expect(response.status).toBe(201);
    expect(socialPublishing.createSocialSuggestions).toHaveBeenCalledWith(
      env,
      "owner",
      { ...input, createdBy: "user" },
    );
  });

  it("edits, discards, and chooses the exact Suggestion", async () => {
    const app = createApp();
    const env = {};
    const expectedUpdatedAt = "2026-07-18T08:00:00.000Z";
    socialPublishing.updateSocialSuggestion.mockResolvedValue({
      id: "suggestion-1",
      bodyText: "Edited text",
    });
    socialPublishing.discardSocialSuggestion.mockResolvedValue({
      id: "suggestion-1",
      status: "discarded",
    });
    socialPublishing.chooseSocialSuggestion.mockResolvedValue({
      suggestion: { id: "suggestion-1", status: "chosen", selectedPostId: "post-1" },
      post: { post: { id: "post-1" }, versions: [] },
    });

    const updateResponse = await app.fetch(jsonRequest(
      "http://localhost/api/social/suggestions/suggestion-1",
      "PATCH",
      { bodyText: "Edited text", expectedUpdatedAt },
    ), env as never);
    expect(updateResponse.status).toBe(200);
    expect(socialPublishing.updateSocialSuggestion).toHaveBeenCalledWith(
      env,
      "owner",
      "suggestion-1",
      { bodyText: "Edited text", expectedUpdatedAt },
    );

    const discardResponse = await app.fetch(
      new Request(`http://localhost/api/social/suggestions/suggestion-1?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, {
        method: "DELETE",
      }),
      env as never,
    );
    expect(discardResponse.status).toBe(200);
    expect(socialPublishing.discardSocialSuggestion).toHaveBeenCalledWith(
      env,
      "owner",
      "suggestion-1",
      { expectedUpdatedAt },
    );

    const chooseResponse = await app.fetch(jsonRequest(
      "http://localhost/api/social/suggestions/suggestion-1/post",
      "POST",
      { platforms: ["linkedin", "x"], expectedUpdatedAt },
    ), env as never);
    expect(chooseResponse.status).toBe(201);
    expect(socialPublishing.chooseSocialSuggestion).toHaveBeenCalledWith(
      env,
      "owner",
      "suggestion-1",
      { platforms: ["linkedin", "x"], expectedUpdatedAt },
    );
  });

  it("returns a visible rejection for a Source-less save", async () => {
    const SocialPostInputError = (await import("./social-publishing")).SocialPostInputError;
    socialPublishing.createSocialSuggestions.mockRejectedValue(
      new SocialPostInputError("A human-authored Source snapshot is required"),
    );

    const response = await createApp().fetch(jsonRequest(
      "http://localhost/api/social/suggestions",
      "POST",
      { siteId: "site-1", suggestions: [] },
    ), {} as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "A human-authored Source snapshot is required",
    });
  });
});

function createApp() {
  const app = new Hono();
  registerSocialContentRoutes(app as never, {
    requireOwner: async () => "owner",
    unauthorized: () => new Response(null, { status: 401 }),
  });
  return app;
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
