import { describe, expect, it, vi } from "vitest";
import {
  adapterFor,
  normalizeSocialMediaAssets,
} from "@me3-core/plugin-social-publishing";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);

describe("LinkedIn publishing adapter", () => {
  it("publishes a current-version personal text post and returns its permalink", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v2/userinfo")) return Response.json({ sub: "member-1" });
      if (url.endsWith("/rest/posts")) {
        expect(new Headers(init?.headers).get("Linkedin-Version")).toBe("202606");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          author: "urn:li:person:member-1",
          commentary: "A useful LinkedIn post.",
          lifecycleState: "PUBLISHED",
        });
        return new Response("{}", {
          status: 201,
          headers: { "x-restli-id": "urn:li:share:12345" },
        });
      }
      throw new Error(`Unexpected LinkedIn request: ${url}`);
    });

    const result = await adapterFor("linkedin").publish({
      accessToken: "token",
      accountId: "member-1",
      bodyText: "A useful LinkedIn post.",
      assets: [],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      platformPostId: "urn:li:share:12345",
      platformPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:12345",
    });
  });

  it("uploads one image and attaches its image URN to the post", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v2/userinfo")) return Response.json({ sub: "member-1" });
      if (url === "https://cdn.example/post.png") {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        });
      }
      if (url.includes("/rest/images?action=initializeUpload")) {
        expect(JSON.parse(String(init?.body))).toEqual({
          initializeUploadRequest: { owner: "urn:li:person:member-1" },
        });
        return Response.json({
          value: {
            uploadUrl: "https://upload.linkedin.example/image",
            image: "urn:li:image:image-1",
          },
        });
      }
      if (url === "https://upload.linkedin.example/image") {
        expect(init?.method).toBe("PUT");
        expect(new Headers(init?.headers).get("Content-Type")).toBe("image/png");
        return new Response(null, { status: 201 });
      }
      if (url.endsWith("/rest/posts")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          content: { media: { id: "urn:li:image:image-1" } },
        });
        return new Response("{}", {
          status: 201,
          headers: { "x-restli-id": "urn:li:share:image-post" },
        });
      }
      throw new Error(`Unexpected LinkedIn request: ${url}`);
    });

    const result = await adapterFor("linkedin").publish({
      accessToken: "token",
      accountId: "member-1",
      bodyText: "Post with an image.",
      assets: [{ url: "https://cdn.example/post.png", kind: "image", mimeType: "image/png" }],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({ ok: true, platformPostId: "urn:li:share:image-post" });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("classifies a confirmed rate limit as safely retryable", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/v2/userinfo")) return Response.json({ sub: "member-1" });
      return Response.json({ message: "Too many requests" }, { status: 429 });
    });

    const result = await adapterFor("linkedin").publish({
      accessToken: "token",
      accountId: "member-1",
      bodyText: "Retry this later.",
      assets: [],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      failureClass: "retryable",
      errorCode: "linkedin_post_error",
    });
  });

  it("does not retry when LinkedIn gives no response after accepting the write request", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/v2/userinfo")) return Response.json({ sub: "member-1" });
      throw new Error("connection reset");
    });

    const result = await adapterFor("linkedin").publish({
      accessToken: "token",
      accountId: "member-1",
      bodyText: "Maybe published.",
      assets: [],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      failureClass: "outcome_unknown",
      errorCode: "linkedin_outcome_unknown",
    });
  });
});

describe("X publishing adapter", () => {
  it("normalizes optional alt text without retaining unknown manifest fields", () => {
    expect(normalizeSocialMediaAssets([{
      url: "  https://cdn.example/image.png  ",
      mimeType: " image/png ",
      kind: "image",
      altText: "  A concise image description.  ",
      ignored: "not part of the provider contract",
    }])).toEqual([{
      url: "https://cdn.example/image.png",
      filename: undefined,
      mimeType: "image/png",
      kind: "image",
      altText: "A concise image description.",
      path: undefined,
      assetIndex: undefined,
    }]);
  });

  it("publishes a text-only post through the current X API host", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.x.com/2/tweets");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer x-token");
      expect(JSON.parse(String(init?.body))).toEqual({ text: "A useful X post." });
      return Response.json({ data: { id: "post-123" } }, { status: 201 });
    });

    const result = await adapterFor("x").publish({
      accessToken: "x-token",
      accountId: "x-owner",
      bodyText: "  A useful X post.  ",
      assets: [],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      platformPostId: "post-123",
      platformPostUrl: "https://x.com/i/web/status/post-123",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("uploads ordered raster images, adds optional alt text, and attaches media ids", async () => {
    const uploadBodies: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://cdn.example/one.png") {
        return new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });
      }
      if (url === "https://cdn.example/two.jpg") {
        return new Response(JPEG_BYTES, { headers: { "content-type": "image/jpeg" } });
      }
      if (url === "https://api.x.com/2/media/upload") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        uploadBodies.push(body);
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer x-token");
        return Response.json({ data: { id: `media-${uploadBodies.length}` } });
      }
      if (url === "https://api.x.com/2/media/metadata") {
        expect(JSON.parse(String(init?.body))).toEqual({
          id: "media-1",
          metadata: { alt_text: { text: "A green field beneath a clear sky." } },
        });
        return Response.json({ data: { id: "media-1" } });
      }
      if (url === "https://api.x.com/2/tweets") {
        expect(JSON.parse(String(init?.body))).toEqual({
          text: "Two useful images.",
          media: { media_ids: ["media-1", "media-2"] },
        });
        return Response.json({ data: { id: "post-with-media" } }, { status: 201 });
      }
      throw new Error(`Unexpected X request: ${url}`);
    });

    const result = await adapterFor("x").publish({
      accessToken: "x-token",
      accountId: "x-owner",
      bodyText: "Two useful images.",
      assets: [
        {
          url: "https://cdn.example/one.png",
          kind: "image",
          mimeType: "image/png",
          altText: "  A green field beneath a clear sky.  ",
        },
        {
          url: "https://cdn.example/two.jpg",
          kind: "image",
          mimeType: "image/jpeg",
        },
      ],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({ ok: true, platformPostId: "post-with-media" });
    expect(uploadBodies).toEqual([
      {
        media: btoa(String.fromCharCode(...PNG_BYTES)),
        media_category: "tweet_image",
        media_type: "image/png",
      },
      {
        media: btoa(String.fromCharCode(...JPEG_BYTES)),
        media_category: "tweet_image",
        media_type: "image/jpeg",
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it.each([
    {
      label: "more than four images",
      assets: Array.from({ length: 5 }, (_, index) => ({
        url: `https://cdn.example/${index}.png`,
        kind: "image" as const,
        mimeType: "image/png",
      })),
      message: "up to 4 raster images",
    },
    {
      label: "video",
      assets: [{ url: "https://cdn.example/video.mp4", kind: "video" as const }],
      message: "raster images only",
    },
    {
      label: "SVG",
      assets: [{
        url: "https://cdn.example/image.svg",
        kind: "image" as const,
        mimeType: "image/svg+xml",
      }],
      message: "PNG, JPEG, and WebP",
    },
    {
      label: "overlong alt text",
      assets: [{
        url: "https://cdn.example/image.png",
        kind: "image" as const,
        mimeType: "image/png",
        altText: "a".repeat(1_001),
      }],
      message: "alt text is too long",
    },
  ])("rejects $label before delivery", ({ assets, message }) => {
    const result = adapterFor("x").validateDraft({ bodyText: "Valid text", assets });

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    if (!result.ok) expect(result.error).toContain(message);
  });

  it.each([
    [401, "reconnect_required"],
    [422, "rejected"],
    [429, "retryable"],
    [503, "retryable"],
  ] as const)("classifies a confirmed post status %i as %s", async (status, failureClass) => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ errors: [{ detail: `X error ${status}` }] }, { status }),
    );

    const result = await adapterFor("x").publish({
      accessToken: "x-token",
      accountId: "x-owner",
      bodyText: "A confirmed failure.",
      assets: [],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      failureClass,
      errorCode: "x_api_error",
      errorMessage: `X error ${status}`,
    });
  });

  it("classifies a confirmed media upload rate limit as retryable", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://cdn.example/image.png") {
        return new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });
      }
      return Response.json({ errors: [{ detail: "Media limit reached" }] }, { status: 429 });
    });

    const result = await adapterFor("x").publish({
      accessToken: "x-token",
      accountId: "x-owner",
      bodyText: "Upload later.",
      assets: [{
        url: "https://cdn.example/image.png",
        kind: "image",
        mimeType: "image/png",
      }],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      failureClass: "retryable",
      errorCode: "x_media_upload",
      errorMessage: "Media limit reached",
    });
  });

  it("rejects oversized and invalid raster bytes before contacting X", async () => {
    const tooLargeFetcher = vi.fn().mockResolvedValue(
      new Response(PNG_BYTES, {
        headers: {
          "content-length": String(5 * 1024 * 1024 + 1),
          "content-type": "image/png",
        },
      }),
    );
    const invalidTypeFetcher = vi.fn().mockResolvedValue(
      new Response("<svg xmlns=\"http://www.w3.org/2000/svg\" />", {
        headers: { "content-type": "image/png" },
      }),
    );
    const input = {
      accessToken: "x-token",
      accountId: "x-owner",
      bodyText: "Validate the image.",
      assets: [{
        url: "https://cdn.example/image.png",
        kind: "image" as const,
        mimeType: "image/png",
      }],
    };

    await expect(adapterFor("x").publish({
      ...input,
      fetcher: tooLargeFetcher as typeof fetch,
    })).resolves.toMatchObject({
      ok: false,
      failureClass: "unsupported",
      errorCode: "x_image_too_large",
    });
    await expect(adapterFor("x").publish({
      ...input,
      fetcher: invalidTypeFetcher as typeof fetch,
    })).resolves.toMatchObject({
      ok: false,
      failureClass: "unsupported",
      errorCode: "x_image_type",
    });
    expect(tooLargeFetcher).toHaveBeenCalledTimes(1);
    expect(invalidTypeFetcher).toHaveBeenCalledTimes(1);
  });

  it("freezes recovery when the final post request has an ambiguous outcome", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("connection reset after write"));

    const result = await adapterFor("x").publish({
      accessToken: "x-token",
      accountId: "x-owner",
      bodyText: "Maybe published.",
      assets: [],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      failureClass: "outcome_unknown",
      errorCode: "x_outcome_unknown",
    });
  });

  it("treats a successful post response without an id as outcome unknown", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: {} }, { status: 201 }));

    const result = await adapterFor("x").publish({
      accessToken: "x-token",
      accountId: "x-owner",
      bodyText: "Maybe published without an id.",
      assets: [],
      fetcher: fetcher as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      failureClass: "outcome_unknown",
      errorCode: "x_missing_id",
    });
  });
});
