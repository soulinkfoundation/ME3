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
      fileId: " file-1 ",
      mimeType: " image/png ",
      kind: "image",
      altText: "  A concise image description.  ",
      contentHash: ` SHA256:${"A".repeat(64)} `,
      byteLength: 42.4,
      assetIndex: 1.2,
      ignored: "not part of the provider contract",
    }])).toEqual([{
      url: "https://cdn.example/image.png",
      fileId: "file-1",
      filename: undefined,
      mimeType: "image/png",
      kind: "image",
      altText: "A concise image description.",
      contentHash: `sha256:${"a".repeat(64)}`,
      byteLength: 42,
      path: undefined,
      assetIndex: 1,
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

describe("Instagram publishing adapter", () => {
  it("creates ordered child containers and publishes an image carousel", async () => {
    const mediaBodies: URLSearchParams[] = [];
    const markProviderWriteStarted = vi.fn(async () => undefined);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/ig-owner/media")) {
        const body = init?.body as URLSearchParams;
        mediaBodies.push(body);
        return Response.json({ id: `container-${mediaBodies.length}` });
      }
      if (url.includes("/container-3?fields=status_code")) {
        return Response.json({ status_code: "FINISHED" });
      }
      if (url.endsWith("/ig-owner/media_publish")) {
        expect(String(init?.body)).toContain("creation_id=container-3");
        return Response.json({ id: "instagram-post-1" });
      }
      throw new Error(`Unexpected Instagram request: ${url}`);
    });

    const result = await adapterFor("instagram").publish({
      accessToken: "ig-token",
      accountId: "ig-owner",
      bodyText: "An ordered carousel.",
      assets: [
        { url: "https://media.example/one.jpg", kind: "image", assetIndex: 0 },
        { url: "https://media.example/two.jpg", kind: "image", assetIndex: 1 },
      ],
      fetcher: fetcher as typeof fetch,
      markProviderWriteStarted,
    });

    expect(result).toMatchObject({ ok: true, platformPostId: "instagram-post-1" });
    expect(mediaBodies.map((body) => Object.fromEntries(body))).toEqual([
      {
        image_url: "https://media.example/one.jpg",
        is_carousel_item: "true",
        access_token: "ig-token",
      },
      {
        image_url: "https://media.example/two.jpg",
        is_carousel_item: "true",
        access_token: "ig-token",
      },
      {
        media_type: "CAROUSEL",
        children: "container-1,container-2",
        caption: "An ordered carousel.",
        access_token: "ig-token",
      },
    ]);
    expect(markProviderWriteStarted).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("https://graph.instagram.com/v21.0/ig-owner/media"),
      expect.any(Object),
    );
  });

  it("waits for Reel processing before publishing", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/ig-owner/media")) {
        expect(Object.fromEntries(init?.body as URLSearchParams)).toMatchObject({
          media_type: "REELS",
          video_url: "https://media.example/reel.mp4",
          share_to_feed: "true",
        });
        return Response.json({ id: "reel-container" });
      }
      if (url.includes("/reel-container?fields=status_code")) {
        return Response.json({ status_code: "FINISHED" });
      }
      if (url.endsWith("/ig-owner/media_publish")) {
        return Response.json({ id: "instagram-reel-1" });
      }
      throw new Error(`Unexpected Instagram request: ${url}`);
    });

    await expect(adapterFor("instagram").publish({
      accessToken: "ig-token",
      accountId: "ig-owner",
      bodyText: "A short Reel.",
      assets: [{ url: "https://media.example/reel.mp4", kind: "video", mimeType: "video/mp4" }],
      fetcher: fetcher as typeof fetch,
    })).resolves.toMatchObject({ ok: true, platformPostId: "instagram-reel-1" });
  });

  it("rejects mixed Reel media and oversized carousels before delivery", () => {
    expect(adapterFor("instagram").validateDraft({
      bodyText: "Mixed media.",
      assets: [
        { url: "https://media.example/reel.mp4", kind: "video" },
        { url: "https://media.example/image.jpg", kind: "image" },
      ],
    })).toEqual({ ok: false, error: "An Instagram Reel must contain one video and no images." });

    expect(adapterFor("instagram").validateDraft({
      bodyText: "Too many images.",
      assets: Array.from({ length: 11 }, (_, index) => ({
        url: `https://media.example/${index}.jpg`,
        kind: "image" as const,
      })),
    })).toEqual({ ok: false, error: "Instagram carousels support up to 10 images." });
  });
});

describe("TikTok draft upload adapter", () => {
  it("initializes FILE_UPLOAD and streams a short video into the creator inbox", async () => {
    const markProviderWriteStarted = vi.fn(async () => undefined);
    const videoBytes = new Uint8Array([1, 2, 3, 4]);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v2/post/publish/inbox/video/init/")) {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tiktok-token");
        expect(JSON.parse(String(init?.body))).toEqual({
          source_info: {
            source: "FILE_UPLOAD",
            video_size: 4,
            chunk_size: 4,
            total_chunk_count: 1,
          },
        });
        return Response.json({
          data: {
            publish_id: "v_inbox_file~demo-1",
            upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=demo-1",
          },
          error: { code: "ok", message: "", log_id: "log-1" },
        });
      }
      if (url === "https://media.example/short.mp4") {
        expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-3");
        return new Response(videoBytes, { status: 206 });
      }
      if (url.startsWith("https://open-upload.tiktokapis.com/video/")) {
        const headers = new Headers(init?.headers);
        expect(init?.method).toBe("PUT");
        expect(headers.get("Content-Type")).toBe("video/mp4");
        expect(headers.get("Content-Length")).toBe("4");
        expect(headers.get("Content-Range")).toBe("bytes 0-3/4");
        expect(new Uint8Array(await new Response(init?.body).arrayBuffer())).toEqual(videoBytes);
        return new Response(null, { status: 201 });
      }
      if (url.endsWith("/v2/post/publish/status/fetch/")) {
        expect(JSON.parse(String(init?.body))).toEqual({ publish_id: "v_inbox_file~demo-1" });
        return Response.json({
          data: { status: "SEND_TO_USER_INBOX", uploaded_bytes: 4 },
          error: { code: "ok", message: "", log_id: "log-2" },
        });
      }
      throw new Error(`Unexpected TikTok request: ${url}`);
    });

    const result = await adapterFor("tiktok").publish({
      accessToken: "tiktok-token",
      accountId: "creator-open-id",
      bodyText: "Editable in TikTok.",
      assets: [{
        url: "https://media.example/short.mp4",
        kind: "video",
        mimeType: "video/mp4",
        byteLength: videoBytes.byteLength,
      }],
      fetcher: fetcher as typeof fetch,
      markProviderWriteStarted,
    });

    expect(result).toMatchObject({
      ok: true,
      platformPostId: "v_inbox_file~demo-1",
      providerResponse: {
        delivery: "creator_draft",
        creatorActionRequired: true,
      },
    });
    expect(markProviderWriteStarted).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("uses sequential chunks and merges trailing bytes into the final chunk", async () => {
    const byteLength = 70 * 1024 * 1024;
    const uploadStatuses = [206, 201];
    const sourceRanges: string[] = [];
    const uploadRanges: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v2/post/publish/inbox/video/init/")) {
        expect(JSON.parse(String(init?.body)).source_info).toEqual({
          source: "FILE_UPLOAD",
          video_size: byteLength,
          chunk_size: 32 * 1024 * 1024,
          total_chunk_count: 2,
        });
        return Response.json({
          data: { publish_id: "chunked", upload_url: "https://upload.example/chunked" },
          error: { code: "ok" },
        });
      }
      if (url === "https://media.example/large.mp4") {
        sourceRanges.push(new Headers(init?.headers).get("Range")!);
        return new Response(new Uint8Array([1]), { status: 206 });
      }
      if (url === "https://upload.example/chunked") {
        uploadRanges.push(new Headers(init?.headers).get("Content-Range")!);
        return new Response(null, { status: uploadStatuses.shift()! });
      }
      if (url.endsWith("/v2/post/publish/status/fetch/")) {
        return Response.json({
          data: { status: "SEND_TO_USER_INBOX", uploaded_bytes: byteLength },
          error: { code: "ok" },
        });
      }
      throw new Error(`Unexpected TikTok request: ${url}`);
    });

    await expect(adapterFor("tiktok").publish({
      accessToken: "token",
      accountId: "creator",
      bodyText: "",
      assets: [{
        url: "https://media.example/large.mp4",
        kind: "video",
        mimeType: "video/mp4",
        byteLength,
      }],
      fetcher: fetcher as typeof fetch,
    })).resolves.toMatchObject({ ok: true, platformPostId: "chunked" });

    expect(sourceRanges).toEqual([
      "bytes=0-33554431",
      `bytes=33554432-${byteLength - 1}`,
    ]);
    expect(uploadRanges).toEqual([
      `bytes 0-33554431/${byteLength}`,
      `bytes 33554432-${byteLength - 1}/${byteLength}`,
    ]);
  });

  it("rejects missing, mixed, or unsupported video manifests", () => {
    expect(adapterFor("tiktok").validateDraft({ bodyText: "", assets: [] })).toEqual({
      ok: false,
      error: "TikTok draft upload requires exactly one video.",
    });
    expect(adapterFor("tiktok").validateDraft({
      bodyText: "",
      assets: [{ url: "https://media.example/video.avi", kind: "video", mimeType: "video/avi", byteLength: 12 }],
    })).toEqual({
      ok: false,
      error: "TikTok supports MP4, QuickTime, and WebM video uploads.",
    });
  });
});
