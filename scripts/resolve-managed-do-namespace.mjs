#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function resolveManagedDurableObjectNamespace(
  { accountId, apiToken, workerName, className = "Me3UserAgent" },
  request = globalThis.fetch,
) {
  if (!/^[0-9a-f]{32}$/.test(accountId || "") || !apiToken) {
    throw new Error("Cloudflare Durable Object lookup credentials are invalid");
  }
  if (!/^me3-mi-[0-9a-f]{16}$/.test(workerName || "") || className !== "Me3UserAgent") {
    throw new Error("managed Durable Object lookup identity is invalid");
  }
  const matches = [];
  let listingComplete = false;
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects/namespaces`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    const response = await request(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!response.ok) throw new Error("Cloudflare Durable Object lookup failed");
    const body = await response.json();
    if (body?.success !== true || !Array.isArray(body.result)) {
      throw new Error("Cloudflare Durable Object lookup returned an invalid response");
    }
    matches.push(
      ...body.result.filter(
        (namespace) => namespace?.script === workerName && namespace?.class === className,
      ),
    );
    const totalPages = Number(body.result_info?.total_pages || 1);
    if (page >= totalPages) {
      listingComplete = true;
      break;
    }
  }
  if (!listingComplete) throw new Error("Cloudflare Durable Object lookup exceeded the page limit");
  if (matches.length !== 1) {
    throw new Error("managed Durable Object namespace could not be resolved exactly");
  }
  const id = String(matches[0].id || matches[0].namespace_id || "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) {
    throw new Error("managed Durable Object namespace id is invalid");
  }
  return id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = await resolveManagedDurableObjectNamespace({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    workerName: process.env.WORKER_NAME,
    className: process.env.ME3_MANAGED_DO_CLASS || "Me3UserAgent",
  });
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `ME3_MANAGED_DO_NAMESPACE_ID=${id}\n`);
  }
  console.log(JSON.stringify({ ok: true, durableObjectNamespaceId: id }));
}
