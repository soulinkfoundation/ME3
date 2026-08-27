const blockedCampaignAction =
  /^\/api\/email\/campaigns\/[^/?]+\/(?:send|test|cancel)\/?$/;

export function isBlockedRemoteDevRequest(
  method: string | undefined,
  requestUrl: string | undefined,
): boolean {
  if (method?.toUpperCase() !== "POST" || !requestUrl) return false;
  return blockedCampaignAction.test(
    new URL(requestUrl, "http://localhost").pathname,
  );
}
