import { describe, expect, it } from "vitest";
import { generateSiteHtml } from "./site-generator";

describe("site generator", () => {
  it("generates me3 profile pages from me.json and markdown sources", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "test site",
        handle: "test",
        bio: "A generated ME3 site.",
        avatar: "./files/avatar.jpg",
        banner: "./files/banner.jpg",
        links: { _vibe: "tech" },
        buttons: [{ text: "Join my course", url: "https://example.com/course" }],
        pages: [{ slug: "about", title: "About", file: "about.md" }],
      },
      [{ name: "about.md", content: "# About\n\nGenerated from markdown." }],
    );

    expect(files["index.html"]).toContain('body data-vibe="tech"');
    expect(files["index.html"]).toContain('src="./files/avatar.jpg"');
    expect(files["index.html"]).toContain("Join my course");
    expect(files["about.html"]).toContain("Generated from markdown.");
    expect(files["me.json"]).toContain('"handle": "test"');
  });

  it("renders concise public locations from structured location data", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Cork Coach",
        location: "Cork, County Cork, Eire / Ireland",
        locationData: {
          label: "Cork, County Cork, Eire / Ireland",
          latitude: 51.89851,
          longitude: -8.47264,
          precision: "city",
          region: "County Cork",
          country: "Eire / Ireland",
          countryCode: "IE",
        },
      },
      [],
    );

    expect(files["index.html"]).toContain("Cork, Ireland");
    expect(files["index.html"]).not.toContain("County Cork, Eire / Ireland");
  });
});
