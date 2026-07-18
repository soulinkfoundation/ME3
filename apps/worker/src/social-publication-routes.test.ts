import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSocialContentRoutes } from "./routes/social-content";

const socialPublishing = vi.hoisted(() => ({
  cancelPublication: vi.fn(),
  createPostVersionPublication: vi.fn(),
  createSocialPost: vi.fn(),
  getSocialPost: vi.fn(),
  getSocialPublishingRuntimeStatus: vi.fn(),
  listApprovedPostVersionsForScheduling: vi.fn(),
  listPostVersionPublications: vi.fn(),
  listSocialPosts: vi.fn(),
  resolvePublicationOutcome: vi.fn(),
  reschedulePublication: vi.fn(),
  updatePostVersion: vi.fn(),
}));

vi.mock("./social-publishing", () => ({
  ...socialPublishing,
  SocialPostInputError: class SocialPostInputError extends Error {
    readonly status = 400;
  },
  SocialPublishingGateError: class SocialPublishingGateError extends Error {
    readonly gate = { ready: false };
    readonly status = 403;
  },
  SocialPublishingInputError: class SocialPublishingInputError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message);
    }
  },
}));

describe("social Publication routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({ ready: true });
  });

  it("lists and creates Publications for one Version with owner attribution", async () => {
    const app = createApp();
    const env = {};
    const publication = {
      id: "publication-1",
      versionId: "version-1",
      status: "scheduled",
      scheduledFor: "2026-08-01T09:00:00.000Z",
      timezone: "Europe/Dublin",
    };
    socialPublishing.listPostVersionPublications.mockResolvedValue([publication]);
    socialPublishing.createPostVersionPublication.mockResolvedValue(publication);

    const listResponse = await app.fetch(
      new Request("http://localhost/api/social/versions/version-1/publications"),
      env as never,
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ publications: [publication] });
    expect(socialPublishing.listPostVersionPublications).toHaveBeenCalledWith(
      env,
      "owner",
      "version-1",
    );

    const input = {
      scheduledFor: "2026-08-01T09:00:00.000Z",
      timezone: "Europe/Dublin",
      requestedByType: "agent",
      requestContext: { source: "social-library" },
    };
    const createResponse = await app.fetch(
      new Request("http://localhost/api/social/versions/version-1/publications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      env as never,
    );
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual({
      ok: true,
      publication,
      result: {
        action: "scheduled",
        publicationId: "publication-1",
        status: "scheduled",
        scheduledFor: "2026-08-01T09:00:00.000Z",
        timezone: "Europe/Dublin",
      },
    });
    expect(socialPublishing.createPostVersionPublication).toHaveBeenCalledWith(
      env,
      "owner",
      "version-1",
      {
        ...input,
        requestedByType: "owner",
      },
    );
  });

  it("lists safe approved Versions and reschedules one exact owner Publication", async () => {
    const app = createApp();
    const env = {};
    const version = {
      versionId: "version-1",
      postId: "post-1",
      postTitle: "Launch Post",
      platform: "linkedin",
    };
    const publication = {
      id: "publication-1",
      versionId: "version-1",
      status: "scheduled",
      scheduledFor: "2026-08-02T09:00:00.000Z",
      timezone: "Europe/Dublin",
    };
    const result = {
      action: "rescheduled",
      publication,
      previousScheduledFor: "2026-08-01T09:00:00.000Z",
      previousTimezone: "UTC",
      approvalPreserved: true,
      auditEvent: "scheduled",
    };
    socialPublishing.listApprovedPostVersionsForScheduling.mockResolvedValue([version]);
    socialPublishing.reschedulePublication.mockResolvedValue(result);

    const chooserResponse = await app.fetch(
      new Request(
        "http://localhost/api/social/scheduling/approved-versions?siteId=site-1",
      ),
      env as never,
    );
    expect(chooserResponse.status).toBe(200);
    expect(await chooserResponse.json()).toEqual({ versions: [version] });
    expect(
      socialPublishing.listApprovedPostVersionsForScheduling,
    ).toHaveBeenCalledWith(env, "owner", "site-1");

    const input = {
      scheduledFor: "2026-08-02T09:00:00.000Z",
      timezone: "Europe/Dublin",
      expectedUpdatedAt: "2026-07-18T09:00:00.000Z",
      requestContext: { source: "calendar" },
    };
    const response = await app.fetch(
      new Request("http://localhost/api/social/publications/publication-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      env as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, publication, result });
    expect(socialPublishing.reschedulePublication).toHaveBeenCalledWith(
      env,
      "owner",
      "publication-1",
      input,
    );
  });

  it("requires owner authorization before Calendar scheduling reads or writes", async () => {
    const app = createApp(null);
    const env = {};

    const chooser = await app.fetch(
      new Request("http://localhost/api/social/scheduling/approved-versions"),
      env as never,
    );
    const reschedule = await app.fetch(
      new Request("http://localhost/api/social/publications/publication-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      env as never,
    );

    expect(chooser.status).toBe(401);
    expect(reschedule.status).toBe(401);
    expect(socialPublishing.listApprovedPostVersionsForScheduling).not.toHaveBeenCalled();
    expect(socialPublishing.reschedulePublication).not.toHaveBeenCalled();
  });

  it("creates an immediate Publication through the publish action", async () => {
    const app = createApp();
    const env = {};
    const publication = { id: "publication-1", versionId: "version-1" };
    socialPublishing.createPostVersionPublication.mockResolvedValue(publication);

    const response = await app.fetch(
      new Request("http://localhost/api/social/versions/version-1/publish", { method: "POST" }),
      env as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, publication });
    expect(socialPublishing.createPostVersionPublication).toHaveBeenCalledWith(
      env,
      "owner",
      "version-1",
      { requestedByType: "owner" },
    );
  });

  it("cancels and resolves by Publication id, not Version id", async () => {
    const app = createApp();
    const env = {};
    const publication = { id: "publication-1", versionId: "version-1" };
    socialPublishing.cancelPublication.mockResolvedValue({ ...publication, status: "cancelled" });
    socialPublishing.resolvePublicationOutcome.mockResolvedValue({
      ...publication,
      status: "published",
    });

    const cancelResponse = await app.fetch(
      new Request("http://localhost/api/social/publications/publication-1", {
        method: "DELETE",
      }),
      env as never,
    );
    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toEqual({
      ok: true,
      publication: { ...publication, status: "cancelled" },
      result: {
        action: "cancelled",
        publicationId: "publication-1",
        status: "cancelled",
      },
    });
    expect(socialPublishing.cancelPublication).toHaveBeenCalledWith(
      env,
      "owner",
      "publication-1",
    );

    const resolveInput = {
      outcome: "published",
      platformPostUrl: "https://linkedin.example/posts/1",
    };
    const resolveResponse = await app.fetch(
      new Request("http://localhost/api/social/publications/publication-1/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resolveInput),
      }),
      env as never,
    );
    expect(resolveResponse.status).toBe(200);
    expect(socialPublishing.resolvePublicationOutcome).toHaveBeenCalledWith(
      env,
      "owner",
      "publication-1",
      resolveInput,
    );

    const obsoleteResponse = await app.fetch(
      new Request("http://localhost/api/social/versions/version-1/resolve", { method: "POST" }),
      env as never,
    );
    expect(obsoleteResponse.status).toBe(404);
  });
});

function createApp(ownerId: string | null = "owner") {
  const app = new Hono();
  registerSocialContentRoutes(app as never, {
    requireOwner: async () => ownerId,
    unauthorized: () => new Response(null, { status: 401 }),
  });
  return app;
}
