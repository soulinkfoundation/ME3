import { describe, expect, it } from "vitest";
import { normalizeCtaUrl } from "./cta-url";

describe("normalizeCtaUrl", () => {
  it("accepts external and internal call-to-action links", () => {
    expect(normalizeCtaUrl("example.com/book")).toBe("https://example.com/book");
    expect(normalizeCtaUrl("/services/one-to-one")).toBe("/services/one-to-one");
    expect(normalizeCtaUrl("#booking")).toBe("#booking");
    expect(normalizeCtaUrl("mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
    expect(normalizeCtaUrl("tel:+353 87 123 4567")).toBe(
      "tel:+353 87 123 4567",
    );
  });

  it("rejects empty, unsafe, and ambiguous links", () => {
    expect(normalizeCtaUrl("")).toBeNull();
    expect(normalizeCtaUrl("#")).toBeNull();
    expect(normalizeCtaUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeCtaUrl("services")).toBeNull();
  });
});
