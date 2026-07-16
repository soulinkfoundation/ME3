import { describe, expect, it } from "vitest";
import { mobilePairingStatusMessage } from "./mobilePairingStatus";

describe("mobilePairingStatusMessage", () => {
  it.each([
    ["approved", "Approved. Return to the ME3 app to finish connecting."],
    ["claimed", "This device is connected."],
    ["expired", "This pairing expired. Start again in the ME3 app."],
    ["pending", "Waiting for approval."],
    ["revoked", "This pairing is no longer available."],
  ] as const)("returns one message for %s pairings", (status, message) => {
    expect(mobilePairingStatusMessage(status)).toBe(message);
  });
});
