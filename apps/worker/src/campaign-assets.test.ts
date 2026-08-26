import { describe, expect, it } from "vitest";
import {
  CampaignAssetInputError,
  campaignAssetStoragePath,
  validateCampaignImage,
} from "./campaign-assets";

function bytes(values: number[]): ArrayBuffer {
  return Uint8Array.from(values).buffer;
}

describe("campaign image validation", () => {
  it("accepts signature-matched email-safe image formats", () => {
    expect(validateCampaignImage(bytes([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe("image/jpeg");
    expect(
      validateCampaignImage(
        bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/png",
      ),
    ).toBe("image/png");
    expect(validateCampaignImage(new TextEncoder().encode("GIF89a").buffer, "image/gif")).toBe(
      "image/gif",
    );
  });

  it("rejects spoofed and unsupported image input", () => {
    expect(() => validateCampaignImage(new TextEncoder().encode("<svg>").buffer, "image/png"))
      .toThrow(CampaignAssetInputError);
    expect(() => validateCampaignImage(bytes([0x52, 0x49, 0x46, 0x46]), "image/webp"))
      .toThrow("Campaign images must be JPEG, PNG, or GIF");
  });

  it("builds immutable content-addressed campaign paths", () => {
    expect(campaignAssetStoragePath("campaign:launch", "A".repeat(64), "png")).toBe(
      `campaigns/campaign-launch/${"a".repeat(64)}.png`,
    );
  });
});
