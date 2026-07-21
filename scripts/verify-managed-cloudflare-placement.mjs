#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.cloudflare.com/client/v4";

export async function verifyManagedCloudflarePlacement(
  input,
  request = globalThis.fetch,
) {
  const accountId = String(input.accountId || "").trim().toLowerCase();
  const zoneId = String(input.zoneId || "").trim().toLowerCase();
  const apiToken = String(input.apiToken || "");
  if (
    !/^[0-9a-f]{32}$/.test(accountId) ||
    !/^[0-9a-f]{32}$/.test(zoneId) ||
    !apiToken
  ) {
    throw new Error("managed Cloudflare placement contract is invalid");
  }

  const response = await request(`${API_ROOT}/zones/${zoneId}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const body = await response.json().catch(() => null);
  if (
    !response.ok ||
    body?.success !== true ||
    !body?.result ||
    typeof body.result !== "object"
  ) {
    throw new Error(
      `managed Cloudflare zone lookup failed with status ${response.status}${summarizeCloudflareApiErrors(body)}`,
    );
  }

  const zoneAccountId = String(body.result.account?.id || "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(zoneAccountId)) {
    throw new Error("managed Cloudflare zone ownership response is invalid");
  }
  if (zoneAccountId !== accountId) {
    throw new Error(
      "managed Cloudflare account does not own the configured hostname zone",
    );
  }

  return {
    ok: true,
    accountId,
    zoneId,
    zoneName: String(body.result.name || "").toLowerCase(),
  };
}

function summarizeCloudflareApiErrors(body) {
  const errors = Array.isArray(body?.errors) ? body.errors.slice(0, 3) : [];
  const summaries = errors.map((error) => {
    const code =
      typeof error?.code === "number" || typeof error?.code === "string"
        ? String(error.code)
        : "unknown";
    const message =
      typeof error?.message === "string"
        ? error.message
            .replace(/[^\x20-\x7e]+/g, " ")
            .replace(/(?:bearer\s+)?[A-Za-z0-9_-]{32,}/gi, "[redacted]")
            .trim()
            .slice(0, 300)
        : "unknown";
    return `${code}: ${message}`;
  });
  return summaries.length > 0 ? ` (${summaries.join("; ")})` : "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(
    JSON.stringify(
      await verifyManagedCloudflarePlacement({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        zoneId: process.env.ME3_MANAGED_ZONE_ID,
        apiToken: process.env.CLOUDFLARE_API_TOKEN,
      }),
    ),
  );
}
