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
  upgradeLandingPageDocument,
} from "./index";

describe("landing pages package", () => {
  it("builds a structured service page with a booking action slot", () => {
    const page = buildLandingPageDocument({
      username: "owner",
      brief:
        "Leadership sprint for creative founders.\n- Audit the offer\n- Rewrite the page\n- Build a launch plan",
      template: "service",
      profile: {
        name: "ME3 Owner",
        bio: "A calm operator for creative businesses.",
        avatar: null,
        profileUrl: "https://core.example/sites/owner",
      },
    });

    expect(page.version).toBe(3);
    if (page.version !== 3) throw new Error("Expected v3 service page");
    expect(page.recipe.id).toBe("service-offer");
    expect(page.actions[0]).toMatchObject({
      id: "primary-action",
      kind: "booking",
      label: "Book a Call",
    });
    expect(page.content.sections.at(-1)?.type).toBe("action");
  });

  it("normalizes known templates and rejects malformed documents", () => {
    expect(normalizeLandingTemplate("event")).toBe("event");
    expect(normalizeLandingTemplate("wedding")).toBeNull();
    expect(normalizeLandingRecipe("event-invite")).toBe("event-invite");
    expect(normalizeLandingRecipe("wedding-invite")).toBeNull();
    expect(normalizeLandingPageDocument({ version: 1, template: "event" })).toBeNull();
  });

  it("builds a richer v3 event recipe document", () => {
    const page = buildLandingPageDocument({
      username: "owner",
      brief:
        "Spring studio dinner.\nWhen: June 14 at 7pm\nWhere: The Warehouse Room\n- Seasonal food\n- A guided conversation\n- Limited seats",
      template: "event",
      sectionImage: "/files/table.jpg",
      profile: {
        name: "ME3 Owner",
        bio: "A host for thoughtful rooms.",
        avatar: null,
        profileUrl: "https://core.example/sites/owner",
      },
    });

    expect(page.version).toBe(3);
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

  it("renders functional subscribe and booking widgets without embedding credentials", () => {
    const waitlist = buildLandingPageDocument({
      username: "owner",
      brief: "A private launch list for thoughtful founders.",
      template: "waitlist",
      profile: { name: "Owner", bio: null, avatar: null, profileUrl: null },
    });
    const waitlistHtml = renderLandingPageHtml(waitlist, "owner", {
      pageId: "page-1",
      slug: "private-launch",
    });
    expect(waitlistHtml).toContain("/api/sites/owner/subscribe");
    expect(waitlistHtml).toContain('name="pageId" value="page-1"');

    const service = buildLandingPageDocument({
      username: "owner",
      brief: "A strategy session for independent consultants.",
      template: "service",
      profile: { name: "Owner", bio: null, avatar: null, profileUrl: null },
    });
    if (service.version !== 3) throw new Error("Expected v3 service page");
    service.actions[0].resourceId = "strategy-session";
    const serviceHtml = renderLandingPageHtml(service, "owner", { pageId: "page-2" });
    expect(serviceHtml).toContain('data-offer="strategy-session"');
    expect(serviceHtml).toContain("/api/book/");
    expect(serviceHtml).not.toContain("sk_test_");
  });

  it("upgrades valid v1 documents to editable v3 documents", () => {
    const legacy = normalizeLandingPageDocument({
      version: 1,
      template: "waitlist",
      title: "Legacy launch",
      brief: "A legacy page",
      meta: { description: "Join the launch" },
      hero: {
        headline: "Legacy launch",
        subheadline: "Join the launch",
        cta: { label: "Join", href: "#signup" },
      },
      sections: [
        { type: "signup", heading: "Join", body: "Hear first", buttonLabel: "Join" },
      ],
      footer: {},
      style: { vibe: "minimal", accentColor: "#0f766e" },
    });
    if (!legacy) throw new Error("Expected valid legacy page");
    const upgraded = upgradeLandingPageDocument(legacy);
    expect(upgraded.version).toBe(3);
    expect(upgraded.actions[0].kind).toBe("subscribe");
    expect(upgraded.content.sections[0]).toMatchObject({ type: "action" });
  });
});
