#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.cloudflare.com/client/v4";

export async function attachManagedCustomDomain(input, request = globalThis.fetch) {
  const accountId = String(input.accountId || "").toLowerCase();
  const zoneId = String(input.zoneId || "").toLowerCase();
  const apiToken = String(input.apiToken || "");
  const workerName = String(input.workerName || "").toLowerCase();
  const hostname = String(input.hostname || "").toLowerCase();
  if (
    !/^[0-9a-f]{32}$/.test(accountId) ||
    !/^[0-9a-f]{32}$/.test(zoneId) ||
    !apiToken ||
    !/^me3-mi-[0-9a-f]{16}$/.test(workerName) ||
    !/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]\.me3\.app$/.test(hostname)
  ) {
    throw new Error("managed custom domain contract is invalid");
  }

  const api = async (path, init = {}) => {
    const response = await request(`${API_ROOT}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true || !Object.hasOwn(body, "result")) {
      throw new Error("managed custom domain request failed");
    }
    return body.result;
  };

  const listDomains = async (filter) => {
    const query = new URLSearchParams(filter);
    const result = await api(`/accounts/${accountId}/workers/domains?${query}`);
    if (!Array.isArray(result)) {
      throw new Error("managed custom domain listing is invalid");
    }
    return result;
  };

  const beforeByHostname = await listDomains({ hostname });
  const beforeByWorker = await listDomains({ service: workerName });
  const hostnameMatches = beforeByHostname.filter(
    (domain) => String(domain?.hostname || "").toLowerCase() === hostname,
  );
  const workerDomains = beforeByWorker.filter(
    (domain) => String(domain?.service || "").toLowerCase() === workerName,
  );
  if (
    hostnameMatches.some(
      (domain) =>
        String(domain?.service || "").toLowerCase() !== workerName ||
        String(domain?.zone_id || "").toLowerCase() !== zoneId,
    ) ||
    workerDomains.some(
      (domain) => String(domain?.hostname || "").toLowerCase() !== hostname,
    )
  ) {
    throw new Error("managed custom domain conflicts with an existing assignment");
  }

  if (hostnameMatches.length === 0) {
    await api(`/accounts/${accountId}/workers/domains`, {
      method: "PUT",
      body: JSON.stringify({ hostname, service: workerName, zone_id: zoneId }),
    });
  }

  const after = await listDomains({ hostname });
  const exact = after.filter(
    (domain) =>
      String(domain?.hostname || "").toLowerCase() === hostname &&
      String(domain?.service || "").toLowerCase() === workerName &&
      String(domain?.zone_id || "").toLowerCase() === zoneId,
  );
  if (exact.length !== 1) {
    throw new Error("managed custom domain attachment could not be verified");
  }

  return {
    hostname,
    origin: `https://${hostname}`,
    domainId: String(exact[0].id || ""),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await attachManagedCustomDomain({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    zoneId: process.env.ME3_MANAGED_ZONE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    workerName: process.env.WORKER_NAME,
    hostname: process.env.ME3_MANAGED_CANONICAL_HOSTNAME,
  });
  if (process.env.GITHUB_ENV) {
    appendFileSync(
      process.env.GITHUB_ENV,
      `ME3_MANAGED_ORIGIN=${result.origin}\nME3_MANAGED_CUSTOM_DOMAIN_ID=${result.domainId}\n`,
    );
  }
  console.log(JSON.stringify({ ok: true, ...result }));
}
