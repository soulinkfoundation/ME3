import { describe, expect, it } from "vitest";
import { isBlockedRemoteDevRequest } from "./devProxy";

describe("remote development API guard", () => {
  it.each(["send", "test", "cancel"])(
    "blocks campaign %s actions",
    (action) => {
      expect(
        isBlockedRemoteDevRequest(
          "POST",
          `/api/email/campaigns/campaign-1/${action}`,
        ),
      ).toBe(true);
    },
  );

  it("allows campaign drafts and reads", () => {
    expect(isBlockedRemoteDevRequest("POST", "/api/email/campaigns")).toBe(
      false,
    );
    expect(
      isBlockedRemoteDevRequest(
        "PUT",
        "/api/email/campaigns/campaign-1?autosave=1",
      ),
    ).toBe(false);
    expect(
      isBlockedRemoteDevRequest(
        "GET",
        "/api/email/campaigns/campaign-1/review",
      ),
    ).toBe(false);
  });
});
