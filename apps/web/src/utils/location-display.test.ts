import { describe, expect, it } from "vitest";
import { formatPublicLocation } from "./location-display";

describe("formatPublicLocation", () => {
  it("shortens verbose lookup labels with country codes", () => {
    expect(
      formatPublicLocation({
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
      }),
    ).toBe("Cork, Ireland");
  });

  it("uses an explicit locality when present", () => {
    expect(
      formatPublicLocation({
        location: "Barcelona, Catalonia, Spain",
        locationData: {
          label: "Barcelona, Catalonia, Spain",
          locality: "Barcelona",
          country: "Spain",
          countryCode: "ES",
        },
      }),
    ).toBe("Barcelona, Spain");
  });

  it("keeps legacy freeform locations unchanged", () => {
    expect(formatPublicLocation({ location: "Somewhere near the sea" })).toBe(
      "Somewhere near the sea",
    );
  });
});
