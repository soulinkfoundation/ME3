import { describe, expect, it, vi } from "vitest";
import { adapterFor } from "@me3-core/plugin-social-publishing";

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
