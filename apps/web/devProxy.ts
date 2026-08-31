const blockedCampaignAction =
  /^\/api\/email\/campaigns\/[^/?]+\/(?:send|test|cancel)\/?$/;
const blockedCampaignDelete = /^\/api\/email\/campaigns\/[^/?]+\/?$/;

export function isBlockedRemoteDevRequest(
  method: string | undefined,
  requestUrl: string | undefined,
): boolean {
  if (!method || !requestUrl) return false;
  const normalizedMethod = method.toUpperCase();
  const pathname = new URL(requestUrl, "http://localhost").pathname;
  return (
    (normalizedMethod === "POST" && blockedCampaignAction.test(pathname)) ||
    (normalizedMethod === "DELETE" && blockedCampaignDelete.test(pathname))
  );
}
