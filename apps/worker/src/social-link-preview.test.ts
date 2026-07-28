import { describe, expect, it, vi } from "vitest";
import {
  fetchSocialLinkPreview,
  parseSocialLinkPreview,
} from "./social-link-preview";

describe("social link previews", () => {
  it("extracts Open Graph cards with relative images and decoded text", () => {
    expect(parseSocialLinkPreview(`
      <html>
        <head>
          <meta content="A useful &amp; visual story" property="og:title">
          <meta name="description" content="A short explanation.">
          <meta property="og:image" content="/images/card.jpg">
          <meta property="og:site_name" content="Example News">
        </head>
      </html>
    `, "https://www.example.com/posts/one#comments")).toEqual({
      url: "https://www.example.com/posts/one",
      title: "A useful & visual story",
      description: "A short explanation.",
      imageUrl: "https://www.example.com/images/card.jpg",
      siteName: "Example News",
    });
  });

  it("follows a bounded public redirect and rejects private targets", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://news.example/story" },
      }))
      .mockResolvedValueOnce(new Response(
        `<title>News story</title><meta name="twitter:image" content="https://cdn.example/card.png">`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ));

    await expect(fetchSocialLinkPreview("https://example.com/go", fetcher)).resolves.toEqual({
      url: "https://news.example/story",
      title: "News story",
      description: null,
      imageUrl: "https://cdn.example/card.png",
      siteName: "news.example",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await expect(fetchSocialLinkPreview("http://127.0.0.1/private", fetcher))
      .resolves.toBeNull();
    await expect(fetchSocialLinkPreview("https://metadata.internal/latest", fetcher))
      .resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized and non-HTML responses", async () => {
    const oversized = vi.fn().mockResolvedValue(new Response("<html></html>", {
      headers: {
        "content-type": "text/html",
        "content-length": String(600 * 1024),
      },
    }));
    const image = vi.fn().mockResolvedValue(new Response("png", {
      headers: { "content-type": "image/png" },
    }));

    await expect(fetchSocialLinkPreview("https://example.com/large", oversized))
      .resolves.toBeNull();
    await expect(fetchSocialLinkPreview("https://example.com/image", image))
      .resolves.toBeNull();
  });
});
