export type MobilePairingStatus =
  | "pending"
  | "approved"
  | "claimed"
  | "expired"
  | "revoked";

export function mobilePairingStatusMessage(status: MobilePairingStatus) {
  switch (status) {
    case "approved":
      return "Approved. Return to the ME3 app to finish connecting.";
    case "claimed":
      return "This device is connected.";
    case "expired":
      return "This pairing expired. Start again in the ME3 app.";
    case "pending":
      return "Waiting for approval.";
    case "revoked":
      return "This pairing is no longer available.";
  }
}
