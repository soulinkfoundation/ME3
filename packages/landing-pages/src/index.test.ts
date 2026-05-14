import { describe, expect, it } from "vitest";
import {
  buildLandingPageDocument,
  getLandingPageRecipe,
  getLandingPageSectionImage,
  getLandingPageTemplateId,
  normalizeLandingPageDocument,
  normalizeLandingRecipe,
  normalizeLandingTemplate,
  renderLandingPageHtml,
} from "./index";

describe("landing pages package", () => {
  it("builds a service draft with the stable v1 document shape", () => {
    const page = buildLandingPageDocument({
      username: "owner",
      brief:
        "Leadership sprint for creative founders.\n- Audit the offer\n- Rewrite the page\n- Build a launch plan",
      template: "service",
      profile: {
        name: "ME3 Core Owner",
        bio: "A calm operator for creative businesses.",
        avatar: null,
        profileUrl: "https://core.example/sites/owner",
      },
    });

    expect(page.version).toBe(1);
    if (page.version !== 1) throw new Error("Expected v1 service fallback");
    expect(page.template).toBe("service");
    expect(page.hero.cta.label).toBe("Book a Call");
    expect(page.sections.map((section) => section.type)).toEqual([
      "text",
      "list",
      "profile",
    ]);
  });

  it("normalizes known templates and rejects malformed documents", () => {
    expect(normalizeLandingTemplate("event")).toBe("event");
    expect(normalizeLandingTemplate("wedding")).toBeNull();
    expect(normalizeLandingRecipe("event-invite")).toBe("event-invite");
    expect(normalizeLandingRecipe("wedding-invite")).toBeNull();
    expect(normalizeLandingPageDocument({ version: 1, template: "event" })).toBeNull();
  });

  it("builds a richer v2 event recipe document", () => {
    const page = buildLandingPageDocument({
      username: "owner",
      brief:
        "Spring studio dinner.\nWhen: June 14 at 7pm\nWhere: The Warehouse Room\n- Seasonal food\n- A guided conversation\n- Limited seats",
      template: "event",
      sectionImage: "/files/table.jpg",
      profile: {
        name: "ME3 Core Owner",
        bio: "A host for thoughtful rooms.",
        avatar: null,
        profileUrl: "https://core.example/sites/owner",
      },
    });

    expect(page.version).toBe(2);
    expect(getLandingPageTemplateId(page)).toBe("event");
    expect(getLandingPageRecipe("event-invite").sectionOrder).toContain("details");
    expect(getLandingPageSectionImage(page)).toBe("/files/table.jpg");
    expect(normalizeLandingPageDocument(page)).toEqual(page);
  });

  it("renders escaped HTML for persisted previews", () => {
    const page = buildLandingPageDocument({
      username: "owner",
      brief: "<Launch> the thing.",
      template: "waitlist",
      feedback: "CTA as Join <now>",
      profile: {
        name: "Owner",
        bio: null,
        avatar: null,
        profileUrl: null,
      },
    });

    const html = renderLandingPageHtml(page, "owner");
    expect(html).toContain("&lt;Launch&gt;");
    expect(html).toContain("Join &lt;now&gt;");
    expect(html).toContain("data-theme=\"signal-waitlist\"");
    expect(html).not.toContain("<Launch>");
  });
});
