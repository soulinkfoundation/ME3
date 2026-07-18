import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSocialContentRoutes } from "./routes/social-content";

const socialPublishing = vi.hoisted(() => ({
  cancelPublication: vi.fn(),
  chooseSocialSuggestion: vi.fn(),
  confirmPostingPlan: vi.fn(),
  createPostVersionPublication: vi.fn(),
  createPostingPlan: vi.fn(),
  createSocialPost: vi.fn(),
  createSocialSuggestions: vi.fn(),
  discardSocialSuggestion: vi.fn(),
  getPostingPlan: vi.fn(),
  getPreferredPostingTimes: vi.fn(),
  getSocialPost: vi.fn(),
  getSocialPublishingRuntimeStatus: vi.fn(),
  listApprovedPostVersionsForScheduling: vi.fn(),
  listPostVersionPublications: vi.fn(),
  listSocialPosts: vi.fn(),
  listSocialSuggestions: vi.fn(),
  resolvePublicationOutcome: vi.fn(),
  reschedulePublication: vi.fn(),
  searchPostLibrary: vi.fn(),
  updatePostVersion: vi.fn(),
  updatePreferredPostingTimes: vi.fn(),
  updateSocialPost: vi.fn(),
  updateSocialSuggestion: vi.fn(),
}));

vi.mock("./social-publishing", () => ({
  ...socialPublishing,
  SocialPostInputError: class SocialPostInputError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message);
    }
  },
  SocialPostingPlanInputError: class SocialPostingPlanInputError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message);
    }
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

describe("Social Post library and Posting plan routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({ ready: true });
  });

  it("passes every Post library filter through the owner-scoped route", async () => {
    const item = { postId: "post-1", versionId: "version-1" };
    socialPublishing.searchPostLibrary.mockResolvedValue([item]);
    const env = {};
    const response = await createApp().fetch(new Request(
      "http://localhost/api/social/library?siteId=site-1&query=launch&source=essay&platform=linkedin&accountId=account-1&approvalStatus=approved&deliveryState=published&tag=launch&publishedFrom=2026-07-01T00%3A00%3A00.000Z&publishedTo=2026-08-01T00%3A00%3A00.000Z&limit=50",
    ), env as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [item] });
    expect(socialPublishing.searchPostLibrary).toHaveBeenCalledWith(env, "owner", {
      siteId: "site-1",
      query: "launch",
      source: "essay",
      platform: "linkedin",
      accountId: "account-1",
      approvalStatus: "approved",
      deliveryState: "published",
      tag: "launch",
      publishedFrom: "2026-07-01T00:00:00.000Z",
      publishedTo: "2026-08-01T00:00:00.000Z",
      limit: "50",
    });
  });

  it("writes tags through the canonical Social Post update route", async () => {
    const post = { id: "post-1", tags: ["launch", "founder"] };
    socialPublishing.updateSocialPost.mockResolvedValue(post);
    const env = {};
    const input = { tags: ["Launch", "Founder"], expectedUpdatedAt: "2026-07-18T09:00:00.000Z" };
    const response = await createApp().fetch(jsonRequest(
      "http://localhost/api/social/posts/post-1",
      "PATCH",
      input,
    ), env as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, post });
    expect(socialPublishing.updateSocialPost).toHaveBeenCalledWith(
      env,
      "owner",
      "post-1",
      input,
    );
  });

  it("reads and writes Preferred posting times for the exact account", async () => {
    const app = createApp();
    const env = {};
    const preference = {
      accountId: "account-1",
      timezone: "Europe/Dublin",
      times: [{ day: "monday", localTime: "09:00" }],
      minimumGapMinutes: 120,
      minimumRepostDays: 30,
    };
    socialPublishing.getPreferredPostingTimes.mockResolvedValue(preference);
    socialPublishing.updatePreferredPostingTimes.mockResolvedValue(preference);

    const readResponse = await app.fetch(new Request(
      "http://localhost/api/social/accounts/account-1/preferred-posting-times",
    ), env as never);
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toEqual({ preference });

    const writeResponse = await app.fetch(jsonRequest(
      "http://localhost/api/social/accounts/account-1/preferred-posting-times",
      "PUT",
      preference,
    ), env as never);
    expect(writeResponse.status).toBe(200);
    expect(socialPublishing.updatePreferredPostingTimes).toHaveBeenCalledWith(
      env,
      "owner",
      "account-1",
      preference,
    );
  });

  it("proposes, reads, and explicitly confirms Posting plans", async () => {
    const app = createApp();
    const env = {};
    const plan = { id: "plan-1", status: "suggested", updatedAt: "2026-07-18T09:00:00.000Z" };
    const confirmedPlan = { ...plan, status: "confirmed" };
    const proposal = {
      accountId: "account-1",
      versionIds: ["version-1"],
      windowStart: "2026-07-20T00:00:00.000Z",
      windowEnd: "2026-07-27T00:00:00.000Z",
      count: 1,
    };
    socialPublishing.createPostingPlan.mockResolvedValue(plan);
    socialPublishing.getPostingPlan.mockResolvedValue(plan);
    socialPublishing.confirmPostingPlan.mockResolvedValue(confirmedPlan);

    const createResponse = await app.fetch(jsonRequest(
      "http://localhost/api/social/posting-plans",
      "POST",
      proposal,
    ), env as never);
    expect(createResponse.status).toBe(201);
    expect(socialPublishing.createPostingPlan).toHaveBeenCalledWith(env, "owner", proposal);

    const getResponse = await app.fetch(new Request(
      "http://localhost/api/social/posting-plans/plan-1",
    ), env as never);
    expect(getResponse.status).toBe(200);

    const confirmation = { confirmed: true, expectedUpdatedAt: plan.updatedAt };
    const confirmResponse = await app.fetch(jsonRequest(
      "http://localhost/api/social/posting-plans/plan-1/confirm",
      "POST",
      confirmation,
    ), env as never);
    expect(confirmResponse.status).toBe(200);
    expect(await confirmResponse.json()).toEqual({ ok: true, plan: confirmedPlan });
    expect(socialPublishing.confirmPostingPlan).toHaveBeenCalledWith(
      env,
      "owner",
      "plan-1",
      confirmation,
      { requestedByType: "owner" },
    );
  });

  it.each([
    ["GET", "http://localhost/api/social/library"],
    ["PATCH", "http://localhost/api/social/posts/post-1"],
    ["GET", "http://localhost/api/social/accounts/account-1/preferred-posting-times"],
    ["PUT", "http://localhost/api/social/accounts/account-1/preferred-posting-times"],
    ["POST", "http://localhost/api/social/posting-plans"],
    ["GET", "http://localhost/api/social/posting-plans/plan-1"],
    ["POST", "http://localhost/api/social/posting-plans/plan-1/confirm"],
  ])("requires the owner before %s %s", async (method, url) => {
    const response = await createApp(null).fetch(routeRequest(url, method), {} as never);
    expect(response.status).toBe(401);
    expect(socialPublishing.getSocialPublishingRuntimeStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", "http://localhost/api/social/library"],
    ["PATCH", "http://localhost/api/social/posts/post-1"],
    ["GET", "http://localhost/api/social/accounts/account-1/preferred-posting-times"],
    ["PUT", "http://localhost/api/social/accounts/account-1/preferred-posting-times"],
    ["POST", "http://localhost/api/social/posting-plans"],
    ["GET", "http://localhost/api/social/posting-plans/plan-1"],
    ["POST", "http://localhost/api/social/posting-plans/plan-1/confirm"],
  ])("honours the plugin gate before %s %s", async (method, url) => {
    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({ ready: false });
    const response = await createApp().fetch(routeRequest(url, method), {} as never);
    expect(response.status).toBe(403);
  });

  it("returns visible not-found and conflict responses", async () => {
    const app = createApp();
    socialPublishing.getPostingPlan.mockResolvedValue(null);
    socialPublishing.confirmPostingPlan.mockResolvedValue(null);

    const missingRead = await app.fetch(new Request(
      "http://localhost/api/social/posting-plans/missing",
    ), {} as never);
    expect(missingRead.status).toBe(404);

    const missingConfirm = await app.fetch(jsonRequest(
      "http://localhost/api/social/posting-plans/missing/confirm",
      "POST",
      { confirmed: true, expectedUpdatedAt: "2026-07-18T09:00:00.000Z" },
    ), {} as never);
    expect(missingConfirm.status).toBe(404);

    const SocialPostingPlanInputError = (await import("./social-publishing"))
      .SocialPostingPlanInputError;
    socialPublishing.createPostingPlan.mockRejectedValue(
      new SocialPostingPlanInputError("The reviewed Version changed", 409),
    );
    const conflict = await app.fetch(jsonRequest(
      "http://localhost/api/social/posting-plans",
      "POST",
      { accountId: "account-1" },
    ), {} as never);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ ok: false, error: "The reviewed Version changed" });
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

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeRequest(url: string, method: string): Request {
  return method === "GET" ? new Request(url) : jsonRequest(url, method, {});
}
