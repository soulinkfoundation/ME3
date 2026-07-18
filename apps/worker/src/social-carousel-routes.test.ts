import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSocialCarouselRoutes } from "./routes/social-carousels";

const socialPublishing = vi.hoisted(() => ({
  getSocialCarouselMediaBytes: vi.fn(),
  getSocialCarouselMediaBytesByHash: vi.fn(),
  getSocialCarouselRenderedAsset: vi.fn(),
  getSocialCarouselRenderSet: vi.fn(),
  getSocialPublishingRuntimeStatus: vi.fn(),
  listSocialCarouselMedia: vi.fn(),
  renderAndAttachSocialCarousel: vi.fn(),
  uploadSocialCarouselMedia: vi.fn(),
}));

vi.mock("./social-publishing", () => ({
  ...socialPublishing,
  CAROUSEL_RASTER_MIME_TYPES: ["image/png", "image/jpeg", "image/webp"],
  SOCIAL_CAROUSEL_MEDIA_MAX_BYTES: 640_000,
  SocialCarouselInputError: class SocialCarouselInputError extends Error {
    constructor(
      message: string,
      readonly status = 400,
      readonly issues: unknown[] = [],
    ) {
      super(message);
    }
  },
  SocialPublishingGateError: class SocialPublishingGateError extends Error {
    readonly status = 403;

    constructor(readonly gate: unknown) {
      super("Social Publishing is not ready");
    }
  },
}));

describe("Social Carousel routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({ ready: true });
  });

  it("uploads bounded raster bytes with an exact owner and site scope", async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const media = carouselMedia(bytes);
    socialPublishing.uploadSocialCarouselMedia.mockResolvedValue(media);
    const env = {};

    const response = await createApp().fetch(new Request(
      "http://localhost/api/social/carousels/media?siteId=site-1",
      {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: bytes,
      },
    ), env as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, media });
    expect(socialPublishing.uploadSocialCarouselMedia).toHaveBeenCalledTimes(1);
    const [calledEnv, ownerId, input] = socialPublishing.uploadSocialCarouselMedia.mock.calls[0]!;
    expect(calledEnv).toBe(env);
    expect(ownerId).toBe("owner");
    expect(input).toMatchObject({ siteId: "site-1", claimedMimeType: "image/png" });
    expect(input.bytes).toEqual(bytes);
  });

  it("lists bounded media metadata for the exact owner and site", async () => {
    const media = [carouselMedia(Uint8Array.from([0x89]))];
    socialPublishing.listSocialCarouselMedia.mockResolvedValue(media);
    const env = {};

    const response = await createApp().fetch(new Request(
      "http://localhost/api/social/carousels/media?siteId=site-1&limit=25",
    ), env as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ media });
    expect(socialPublishing.listSocialCarouselMedia).toHaveBeenCalledWith(
      env,
      "owner",
      "site-1",
      "25",
    );
  });

  it("rejects unsupported types and oversized bodies before persistence", async () => {
    const app = createApp();
    const unsupported = await app.fetch(new Request(
      "http://localhost/api/social/carousels/media?siteId=site-1",
      {
        method: "POST",
        headers: { "content-type": "image/svg+xml" },
        body: "<svg/>",
      },
    ), {} as never);
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({
      ok: false,
      error: "Use a PNG, JPEG, or WebP image",
      issues: [],
    });

    const oversized = await app.fetch(new Request(
      "http://localhost/api/social/carousels/media?siteId=site-1",
      {
        method: "POST",
        headers: {
          "content-length": "640001",
          "content-type": "image/png",
        },
        body: Uint8Array.from([0x89]),
      },
    ), {} as never);
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({
      ok: false,
      error: "Carousel media must be 640 KB or smaller",
    });
    expect(socialPublishing.uploadSocialCarouselMedia).not.toHaveBeenCalled();
  });

  it("serves owner-scoped media with private immutable caching and ETags", async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const media = carouselMedia(bytes);
    socialPublishing.getSocialCarouselMediaBytes.mockResolvedValue({ media, bytes });
    const app = createApp();
    const env = {};
    const url = "http://localhost/api/social/carousels/media/media-1?siteId=site-1";

    const response = await app.fetch(new Request(url), env as never);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers.get("etag")).toBe(`"${"a".repeat(64)}"`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(socialPublishing.getSocialCarouselMediaBytes).toHaveBeenCalledWith(
      env,
      "owner",
      "site-1",
      "media-1",
    );

    const notModified = await app.fetch(new Request(url, {
      headers: { "if-none-match": `"${"a".repeat(64)}"` },
    }), env as never);
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
  });

  it("serves the exact owner-scoped content-addressed media locator", async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const media = carouselMedia(bytes);
    socialPublishing.getSocialCarouselMediaBytesByHash.mockResolvedValue({ media, bytes });
    const hash = "a".repeat(64);
    const app = createApp();
    const env = {};

    const response = await app.fetch(new Request(
      `http://localhost/api/social/media/sha256/${hash}.png?siteId=site-1`,
    ), env as never);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(socialPublishing.getSocialCarouselMediaBytesByHash).toHaveBeenCalledWith(
      env,
      "owner",
      "site-1",
      `sha256:${hash}`,
    );

    const extraQuery = await app.fetch(new Request(
      `http://localhost/api/social/media/sha256/${hash}.png?siteId=site-1&other=1`,
    ), env as never);
    expect(extraQuery.status).toBe(400);

    const wrongExtension = await app.fetch(new Request(
      `http://localhost/api/social/media/sha256/${hash}.jpg?siteId=site-1`,
    ), env as never);
    expect(wrongExtension.status).toBe(404);
  });

  it("renders and attaches an exact Version then reads its immutable render set", async () => {
    const renderSet = {
      id: "render-set-1",
      siteId: "site-1",
      assets: [{
        id: "asset-1",
        immutableUrl: "/api/social/carousels/assets/asset-1?siteId=site-1",
        svg: "<svg>heavy</svg>",
      }],
    };
    const renderSetMetadata = {
      id: "render-set-1",
      siteId: "site-1",
      assets: [{
        id: "asset-1",
        immutableUrl: "/api/social/carousels/assets/asset-1?siteId=site-1",
      }],
    };
    const version = {
      id: "version-1",
      postId: "post-1",
      approvalStatus: "draft",
      carouselRenderSetId: "render-set-1",
    };
    socialPublishing.renderAndAttachSocialCarousel.mockResolvedValue({
      renderSet,
      version,
      approvalPreserved: false,
    });
    socialPublishing.getSocialCarouselRenderSet.mockResolvedValue(renderSet);
    const app = createApp();
    const env = {};
    const input = {
      siteId: "site-1",
      postId: "post-1",
      versionId: "version-1",
      expectedVersionUpdatedAt: "2026-07-18T09:00:00.000Z",
      model: { modelVersion: "me3.carousel-model.v1", slides: [] },
    };

    const renderResponse = await app.fetch(jsonRequest(
      "http://localhost/api/social/carousels/render",
      "POST",
      input,
    ), env as never);
    expect(renderResponse.status).toBe(200);
    expect(await renderResponse.json()).toEqual({
      ok: true,
      renderSet: renderSetMetadata,
      version,
      approvalPreserved: false,
    });
    expect(socialPublishing.renderAndAttachSocialCarousel).toHaveBeenCalledWith(
      env,
      "owner",
      input,
    );

    const readResponse = await app.fetch(new Request(
      "http://localhost/api/social/carousels/render-sets/render-set-1?siteId=site-1",
    ), env as never);
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toEqual({ renderSet: renderSetMetadata });
    expect(socialPublishing.getSocialCarouselRenderSet).toHaveBeenCalledWith(
      env,
      "owner",
      "site-1",
      "render-set-1",
    );
  });

  it("serves deterministic SVG assets with a constrained document policy", async () => {
    const svg = "<svg/>";
    socialPublishing.getSocialCarouselRenderedAsset.mockResolvedValue({
      id: "asset-1",
      renderSetId: "render-set-1",
      contentHash: `sha256:${"b".repeat(64)}`,
      fileName: "01-source-backed.svg",
      mimeType: "image/svg+xml",
      byteLength: new TextEncoder().encode(svg).byteLength,
      svg,
    });
    const env = {};

    const response = await createApp().fetch(new Request(
      "http://localhost/api/social/carousels/assets/asset-1?siteId=site-1",
    ), env as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(svg);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="01-source-backed.svg"',
    );
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(socialPublishing.getSocialCarouselRenderedAsset).toHaveBeenCalledWith(
      env,
      "owner",
      "site-1",
      "asset-1",
    );
  });

  it("requires owner auth and plugin readiness before any Carousel operation", async () => {
    const unauthorized = await createApp(null).fetch(new Request(
      "http://localhost/api/social/carousels/render-sets/render-set-1?siteId=site-1",
    ), {} as never);
    expect(unauthorized.status).toBe(401);
    expect(socialPublishing.getSocialPublishingRuntimeStatus).not.toHaveBeenCalled();

    socialPublishing.getSocialPublishingRuntimeStatus.mockResolvedValue({
      ready: false,
      status: "setup_required",
    });
    const gated = await createApp().fetch(new Request(
      "http://localhost/api/social/carousels/render-sets/render-set-1?siteId=site-1",
    ), {} as never);
    expect(gated.status).toBe(403);
    expect(await gated.json()).toEqual({
      ok: false,
      error: "Social Publishing is not ready",
      plugin: { ready: false, status: "setup_required" },
    });
    expect(socialPublishing.getSocialCarouselRenderSet).not.toHaveBeenCalled();
  });

  it("returns structured renderer validation issues without flattening them", async () => {
    const { SocialCarouselInputError } = await import("./social-publishing");
    const issues = [{
      code: "source_evidence" as const,
      path: "slides[0].sourceEvidence",
      message: "Source evidence must match the saved Source",
      slideId: "cover",
    }];
    socialPublishing.renderAndAttachSocialCarousel.mockRejectedValue(
      new SocialCarouselInputError("Carousel validation failed", 400, issues),
    );

    const response = await createApp().fetch(jsonRequest(
      "http://localhost/api/social/carousels/render",
      "POST",
      { siteId: "site-1" },
    ), {} as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Carousel validation failed",
      issues,
    });
  });

  it("uses generic not-found responses for owner-scoped media, sets, and assets", async () => {
    socialPublishing.getSocialCarouselMediaBytes.mockResolvedValue(null);
    socialPublishing.getSocialCarouselRenderSet.mockResolvedValue(null);
    socialPublishing.getSocialCarouselRenderedAsset.mockResolvedValue(null);
    const app = createApp();

    const responses = await Promise.all([
      app.fetch(new Request(
        "http://localhost/api/social/carousels/media/hidden?siteId=site-1",
      ), {} as never),
      app.fetch(new Request(
        "http://localhost/api/social/carousels/render-sets/hidden?siteId=site-1",
      ), {} as never),
      app.fetch(new Request(
        "http://localhost/api/social/carousels/assets/hidden?siteId=site-1",
      ), {} as never),
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
  });
});

function createApp(ownerId: string | null = "owner") {
  const app = new Hono<{ Bindings: Record<string, unknown> }>();
  registerSocialCarouselRoutes(app as never, {
    requireOwner: vi.fn().mockResolvedValue(ownerId),
    unauthorized: () => new Response("Unauthorized", { status: 401 }),
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

function carouselMedia(bytes: Uint8Array) {
  return {
    id: "media-1",
    siteId: "site-1",
    contentHash: `sha256:${"a".repeat(64)}`,
    storageKey: `social-media/sha256/${"a".repeat(64)}.png`,
    immutableUrl: `/api/social/media/sha256/${"a".repeat(64)}.png?siteId=site-1`,
    mimeType: "image/png",
    pixelWidth: 1200,
    pixelHeight: 1200,
    byteLength: bytes.byteLength,
    createdAt: "2026-07-18T09:00:00.000Z",
  };
}
