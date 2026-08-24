import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const portableHtml = readFileSync(
  resolve(process.cwd(), "public/portable-index.html"),
  "utf8",
);

describe("portable site navigation", () => {
  it("keeps Standard and Compact navigation behavior aligned with hosted sites", () => {
    expect(portableHtml).toContain('profile.links._navigation_style === "compact"');
    expect(portableHtml).toContain("page.navigationGroup.trim()");
    expect(portableHtml).toContain('aria-haspopup="dialog"');
    expect(portableHtml).toContain('aria-label="Close menu"');
    expect(portableHtml).toContain("dialog.showModal()");
    expect(portableHtml).toContain("closeButton.focus()");
  });

  it("contains valid inline application JavaScript", () => {
    const scripts = Array.from(
      portableHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
    );
    const applicationScript = scripts.at(-1)?.[1] || "";

    expect(applicationScript).toContain("renderNav");
    expect(() => new Function(applicationScript)).not.toThrow();
  });
});
