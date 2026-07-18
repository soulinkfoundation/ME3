import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCalendarRoutes } from "./routes/calendar";

const socialPublishing = vi.hoisted(() => ({
  getSocialPublishingRuntimeStatus: vi.fn(),
  listCalendarSocialPublications: vi.fn(),
}));

vi.mock("./social-publishing", () => socialPublishing);

describe("Calendar Social Publishing source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialPublishing.listCalendarSocialPublications.mockResolvedValue([]);
  });

  it("does not expose the source or query Publications while the plugin is not ready", async () => {
    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({ ready: false });
    const { app, env, statements } = createApp();

    const response = await app.fetch(calendarFeedRequest(), env as never);
    const body = await response.json() as { socialPublishing: unknown };

    expect(response.status).toBe(200);
    expect(body.socialPublishing).toEqual({
      ready: false,
      publications: [],
    });
    expect(socialPublishing.listCalendarSocialPublications).not.toHaveBeenCalled();
    expect(statements.some((sql) => sql.includes("INSERT INTO user_calendar_events"))).toBe(false);
  });

  it("merges the bounded plugin projection when Social Publishing is ready", async () => {
    const publication = {
      id: "publication-1",
      postId: "post-1",
      versionId: "version-1",
      displayAt: "2026-07-20T09:30:00.000Z",
    };
    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({ ready: true });
    socialPublishing.listCalendarSocialPublications.mockResolvedValue([publication]);
    const { app, env } = createApp();

    const response = await app.fetch(calendarFeedRequest(), env as never);
    const body = await response.json() as { socialPublishing: unknown };

    expect(response.status).toBe(200);
    expect(body.socialPublishing).toEqual({
      ready: true,
      publications: [publication],
    });
    expect(socialPublishing.listCalendarSocialPublications).toHaveBeenCalledWith(
      env,
      "owner",
      {
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-08-01T00:00:00.000Z",
      },
    );
  });
});

function createApp() {
  const app = new Hono();
  const statements: string[] = [];
  const env = {
    DB: {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind() {
            return {
              async first<T>() {
                return null as T | null;
              },
              async all<T>() {
                return { results: [] as T[] };
              },
            };
          },
        };
      },
    },
  };
  registerCalendarRoutes(app as never, {
    requireOwner: async () => "owner",
    unauthorized: () => new Response(null, { status: 401 }),
  });
  return { app, env, statements };
}

function calendarFeedRequest() {
  return new Request(
    "http://localhost/api/calendar/feed?start=2026-07-01T00%3A00%3A00.000Z&end=2026-08-01T00%3A00%3A00.000Z",
  );
}
