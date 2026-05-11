import { describe, expect, it } from "vitest";
import { buildSocialPreviewContent } from "./social-preview";

describe("buildSocialPreviewContent", () => {
  it("builds a compact X preview with a canonical blog url", () => {
    const preview = buildSocialPreviewContent(
      "x",
      {
        title: "Launch notes for a smaller, sharper workflow",
        slug: "launch-notes",
        excerpt: "A quick walkthrough of what changed and why it matters.",
        content: "",
      },
      "kieran",
    );

    expect(preview.body).toContain("Launch notes");
    expect(preview.body).toContain("https://kieran.example.com/blog/launch-notes");
    expect(preview.characterCount).toBeLessThanOrEqual(280);
  });

  it("strips rich text markup when building LinkedIn previews", () => {
    const preview = buildSocialPreviewContent(
      "linkedin",
      {
        title: "From rough draft to published post",
        slug: "rough-draft",
        excerpt: "",
        content:
          "<p>This is a <strong>real post</strong> with <a href='https://example.com'>markup</a>.</p>",
      },
      "demo",
    );

    expect(preview.body).toContain("This is a real post with markup.");
    expect(preview.body).not.toContain("<strong>");
    expect(preview.url).toBe("https://demo.example.com/blog/rough-draft");
  });

  it("uses a custom blog path when provided", () => {
    const preview = buildSocialPreviewContent(
      "x",
      {
        title: "Offer update",
        slug: "spring-reset",
        excerpt: "A fresh offer for returning clients.",
        content: "",
      },
      "kieran",
      "writing",
    );

    expect(preview.url).toBe("https://kieran.example.com/writing/spring-reset");
    expect(preview.body).toContain(
      "https://kieran.example.com/writing/spring-reset",
    );
  });
});
