import { describe, expect, it } from "vitest";
import { profileRequiresCommerce } from "./commerce-readiness";

describe("profile commerce readiness", () => {
  it("does not gate free booking profiles", () => {
    expect(profileRequiresCommerce({
      version: "0.1",
      handle: "owner",
      name: "Owner",
      intents: {
        book: {
          enabled: true,
          offers: [{ pricing: { enabled: false } }],
        },
      },
    })).toBe(false);
  });

  it("gates paid bookings nested under booking types", () => {
    expect(profileRequiresCommerce({
      version: "0.1",
      handle: "owner",
      name: "Owner",
      intents: {
        book: {
          enabled: true,
          bookingTypes: [{ offers: [{ pricing: { enabled: true } }] }],
        },
      },
    })).toBe(true);
  });

  it("gates available products but ignores unavailable ones", () => {
    expect(profileRequiresCommerce({
      version: "0.1",
      handle: "owner",
      name: "Owner",
      products: [{ slug: "kit", available: true }],
    })).toBe(true);
    expect(profileRequiresCommerce({
      version: "0.1",
      handle: "owner",
      name: "Owner",
      products: [{ slug: "kit", available: false }],
    })).toBe(false);
  });
});
