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

  it("renders escaped markdown links and images as html", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Markdown Site",
        pages: [{ slug: "now", title: "Now", file: "now.md" }],
      },
      [
        {
          name: "now.md",
          content:
            "### Work\n\n\\[\\*\\*ME3\\*\\*\\](https://me3.app)\n\n![Alt text](./files/now-1.webp)",
        },
      ],
    );

    expect(files["now.html"]).toContain("<h3>Work</h3>");
    expect(files["now.html"]).toContain(
      '<a href="https://me3.app" target="_blank" rel="noopener"><strong>ME3</strong></a>',
    );
    expect(files["now.html"]).toContain(
      '<img src="./files/now-1.webp" alt="Alt text"',
    );
    expect(files["now.html"]).not.toContain("\\[\\*\\*ME3");
  });

  it("renders homepage booking, testimonials, and newsletter like the app site", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Booking Site",
        testimonials: [
          {
            name: "Alie Rae",
            quote:
              "Kieran was a pleasure to work with. Incredibly talented in technology.",
            handle: "Author",
            profileUrl: "https://example.com",
          },
        ],
        intents: {
          subscribe: {
            enabled: true,
            title: "Newsletter",
            description: "Ideas from the future.",
          },
          book: {
            enabled: true,
            title: "Book a call",
            description: "Choose what fits.",
            availability: { timezone: "Europe/Dublin", windows: { monday: ["09:00"] } },
            offers: [
              { title: "ME3 Setup", duration: 60, pricing: { enabled: false } },
              {
                title: "Coaching call",
                duration: 60,
                pricing: {
                  enabled: true,
                  currency: "EUR",
                  suggestedAmount: 75,
                  allowFlexiblePricing: true,
                },
              },
            ],
          },
        },
      },
      [],
    );

    expect(files["index.html"]).toContain("<h2>Book a session</h2>");
    expect(files["index.html"]).not.toContain("<h2>Book a call</h2>");
    expect(files["index.html"]).toContain("ME3 Setup");
    expect(files["index.html"]).toContain("Coaching call");
    expect(files["index.html"]).toContain("From €75");
    expect(files["index.html"]).toContain("Choose an offer");
    expect(files["index.html"]).toContain('type="date"');
    expect(files["index.html"]).toContain("No available times on this day.");
    expect(files["index.html"]).toContain("<h2>Testimonials</h2>");
    expect(files["index.html"]).toContain("testimonial-card__quote");
    expect(files["index.html"]).toContain("<h2>Newsletter</h2>");
    expect(files["index.html"]).not.toContain("readonly");
  });
});
