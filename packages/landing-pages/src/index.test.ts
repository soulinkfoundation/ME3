import { describe, expect, it } from "vitest";
import {
  buildLandingPageDocument,
  normalizeLandingPageDocument,
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
    expect(normalizeLandingPageDocument({ version: 1, template: "event" })).toBeNull();
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
    expect(html).not.toContain("<Launch>");
  });
});
