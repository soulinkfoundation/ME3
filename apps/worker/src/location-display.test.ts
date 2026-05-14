import { describe, expect, it } from "vitest";
import { formatPublicLocation } from "./location-display";

describe("formatPublicLocation", () => {
  it("shortens verbose lookup labels with country codes", () => {
    expect(
      formatPublicLocation({
        location: "Cork, County Cork, Eire / Ireland",
        locationData: {
          label: "Cork, County Cork, Eire / Ireland",
          precision: "city",
          region: "County Cork",
          country: "Eire / Ireland",
          countryCode: "IE",
        },
      }),
    ).toBe("Cork, Ireland");
  });

  it("keeps legacy freeform locations unchanged", () => {
    expect(formatPublicLocation({ location: "Somewhere near the sea" })).toBe(
      "Somewhere near the sea",
    );
  });
});
