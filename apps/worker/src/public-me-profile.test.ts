import { describe, expect, it } from "vitest";
import { validateProfile } from "me3-protocol";
import type { Me3SiteProfile } from "@me3-core/site-renderer";
import { buildPublicMe3Profile } from "./public-me-profile";

describe("public me.json profile", () => {
  it("converts private legacy site configuration into protocol 0.2", () => {
    const source: Me3SiteProfile = {
      version: "0.1",
      name: "Kieran Butler",
      handle: "kieran",
      bio: "Builder",
      avatar: "./files/avatar.jpg",
      location: "Ireland",
      locationData: {
        label: "Ireland",
        latitude: 53.4,
        longitude: -8.2,
        precision: "country",
        country: "Ireland",
        countryCode: "IE",
      },
      links: {
        twitter: "kieranofearth",
        email: "hey@example.com",
        _vibe: "me3",
      },
      pages: [
        { slug: "about", title: "About", file: "about.md", visible: true },
        { slug: "hidden", title: "Hidden", file: "hidden.md", visible: false },
      ],
      posts: [
        { slug: "public", title: "Public", file: "blog/public.md" },
        { slug: "draft", title: "Draft", file: "blog/draft.md", draft: true },
      ],
      products: [
        {
          slug: "guide",
          title: "Guide",
          file: "shop/guide.md",
          price: 2900,
          currency: "EUR",
          available: true,
        },
      ],
      business: {
        positioningStatement: "I help founders clarify their offer.",
      },
      intents: {
        subscribe: {
          enabled: true,
          title: "Newsletter",
          description: "A useful weekly note.",
        },
        book: {
          enabled: true,
          title: "Book a session",
          offers: [
            {
              id: "coaching",
              title: "Coaching",
              description: "<p>A calm conversation.</p>",
              duration: 60,
              pricing: {
                enabled: true,
                suggestedAmount: 90,
                currency: "EUR",
                minimumAmount: 5,
                allowFlexiblePricing: true,
                allowFree: false,
              },
            },
          ],
        },
      },
    };

    const profile = buildPublicMe3Profile(source, "https://kieranbutler.com");

    expect(validateProfile(profile).valid).toBe(true);
    expect(profile).toMatchObject({
      version: "0.2",
      kind: "person",
      id: "https://kieranbutler.com/me.json",
      url: "https://kieranbutler.com/",
      links: [
        { rel: "twitter", href: "https://x.com/kieranofearth" },
        { rel: "email", href: "mailto:hey@example.com" },
      ],
      products: [
        {
          id: "product:guide",
          price: { amount: "29.00", currency: "EUR" },
        },
      ],
      services: [
        {
          id: "service:coaching",
          description: "A calm conversation.",
          price: { amount: "90.00", currency: "EUR" },
        },
      ],
      capabilities: {
        subscribe: { action: "subscribe" },
        book: {
          action: "book",
          offeringIds: ["service:coaching"],
        },
        purchase: {
          action: "purchase",
          offeringIds: ["product:guide"],
        },
      },
    });
    expect(profile.pages?.map((page) => page.id)).toEqual(["about"]);
    expect(profile.posts?.map((post) => post.id)).toEqual(["public"]);
    expect(JSON.stringify(profile)).not.toContain("minimumAmount");
    expect(JSON.stringify(profile)).not.toContain("allowFlexiblePricing");
    expect(JSON.stringify(profile)).not.toContain("_vibe");
  });

  it("publishes a valid identity-only profile when no public HTTPS origin exists", () => {
    const profile = buildPublicMe3Profile({
      version: "0.1",
      name: "Local Owner",
      handle: "owner",
      intents: { book: { enabled: true, title: "Local booking" } },
    });

    expect(validateProfile(profile).valid).toBe(true);
    expect(profile.version).toBe("0.2");
    expect(profile.actions).toBeUndefined();
    expect(profile.capabilities).toBeUndefined();
  });
});
