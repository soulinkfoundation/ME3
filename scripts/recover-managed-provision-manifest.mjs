#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getTomlArrayBlocks, getTomlString } from "./wrangler-toml.mjs";

const API_ROOT = "https://api.cloudflare.com/client/v4";

export async function recoverManagedProvisionManifest(
  input,
  request = globalThis.fetch,
  { sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {},
) {
  const installationId = String(input.installationId || "").toLowerCase();
  const workerName = String(input.workerName || "");
  const d1Name = String(input.d1Name || "");
  if (
    !/^mi-[0-9a-f]{16}$/.test(installationId) ||
    workerName !== `me3-${installationId}` ||
    d1Name !== `${workerName}-d1` ||
    !/^[0-9a-f]{32}$/.test(input.accountId || "") ||
    !input.apiToken
  ) {
    throw new Error("managed provision recovery contract is invalid");
  }

  let queueNames;
  let configuredD1Id;
  if (input.configPath && existsSync(input.configPath)) {
    const config = readFileSync(input.configPath, "utf8");
    queueNames = [
      ...config.matchAll(/^\s*(?:queue|dead_letter_queue)\s*=\s*"([^"]+)"\s*$/gm),
    ]
      .map((match) => match[1])
      .filter((name, index, values) => values.indexOf(name) === index)
      .sort();
    if (
      queueNames.length === 0 ||
      queueNames.some((name) => !name.startsWith(`${workerName}-`))
    ) {
      throw new Error("managed queue recovery manifest is invalid");
    }
    const database = getTomlArrayBlocks(config, "d1_databases", "DB")
      .map((block) => ({
        name: getTomlString(block, "database_name"),
        id: getTomlString(block, "database_id").toLowerCase(),
      }))
      .find((item) => item.name === d1Name);
    if (database && isUuid(database.id) && !/^0+$/.test(database.id.replaceAll("-", ""))) {
      configuredD1Id = database.id;
    }
  }

  const api = async (path) => {
    const response = await request(`${API_ROOT}${path}`, {
      headers: { Authorization: `Bearer ${input.apiToken}` },
    });
    if (!response.ok) throw new Error("managed provision recovery lookup failed");
    const body = await response.json();
    if (body?.success !== true || !Object.hasOwn(body, "result")) {
      throw new Error("managed provision recovery lookup is invalid");
    }
    return body.result;
  };

  const workerResponse = await request(
    `${API_ROOT}/accounts/${input.accountId}/workers/scripts/${workerName}`,
    { headers: { Authorization: `Bearer ${input.apiToken}` } },
  );
  const workerPresent = workerResponse.status !== 404;
  if (!workerResponse.ok && workerResponse.status !== 404) {
    throw new Error("managed Worker recovery lookup failed");
  }

  let workerPublic = false;
  let origin;
  if (workerPresent) {
    const subdomainState = await api(
      `/accounts/${input.accountId}/workers/scripts/${workerName}/subdomain`,
    );
    if (
      !subdomainState ||
      typeof subdomainState.enabled !== "boolean" ||
      typeof subdomainState.previews_enabled !== "boolean"
    ) {
      throw new Error("managed Worker subdomain recovery proof is invalid");
    }
    workerPublic = subdomainState.enabled || subdomainState.previews_enabled;
    if (subdomainState.enabled) {
      const accountSubdomain = await api(`/accounts/${input.accountId}/workers/subdomain`);
      const label = String(accountSubdomain?.subdomain || "").toLowerCase();
      if (!isDnsLabel(label)) {
        throw new Error("managed account subdomain recovery proof is invalid");
      }
      const candidateOrigin = `https://${workerName}.${label}.workers.dev`;
      if (
        await verifyManagedPublicOrigin(candidateOrigin, request, sleep)
      ) {
        origin = candidateOrigin;
      }
    }
  }

  const query = new URLSearchParams({ name: d1Name, page: "1", per_page: "100" });
  const databases = await api(`/accounts/${input.accountId}/d1/database?${query}`);
  const d1Matches = Array.isArray(databases)
    ? databases.filter((database) => database?.name === d1Name)
    : [];
  if (d1Matches.length > 1) throw new Error("managed D1 recovery identity is ambiguous");
  const listedD1Id = String(
    d1Matches[0]?.uuid || d1Matches[0]?.id || d1Matches[0]?.database_id || "",
  ).toLowerCase();
  if (listedD1Id && !isUuid(listedD1Id)) {
    throw new Error("managed D1 recovery identity is invalid");
  }
  if (configuredD1Id && listedD1Id && configuredD1Id !== listedD1Id) {
    throw new Error("managed D1 recovery identities conflict");
  }
  const d1Id = configuredD1Id || listedD1Id || undefined;

  const namespaces = [];
  let namespaceListingComplete = false;
  for (let page = 1; page <= 100; page += 1) {
    const namespaceQuery = new URLSearchParams({ page: String(page), per_page: "100" });
    const result = await api(
      `/accounts/${input.accountId}/workers/durable_objects/namespaces?${namespaceQuery}`,
    );
    if (!Array.isArray(result)) throw new Error("managed Durable Object recovery listing is invalid");
    namespaces.push(
      ...result.filter(
        (namespace) => namespace?.script === workerName && namespace?.class === "Me3UserAgent",
      ),
    );
    if (result.length < 100) {
      namespaceListingComplete = true;
      break;
    }
  }
  if (!namespaceListingComplete) {
    throw new Error("managed Durable Object recovery listing exceeded the page limit");
  }
  if (namespaces.length > 1) {
    throw new Error("managed Durable Object recovery identity is ambiguous");
  }
  const durableObjectNamespaceId = namespaces.length
    ? String(namespaces[0]?.id || namespaces[0]?.namespace_id || "").toLowerCase()
    : undefined;
  if (durableObjectNamespaceId && !/^[0-9a-f]{32}$/.test(durableObjectNamespaceId)) {
    throw new Error("managed Durable Object recovery identity is invalid");
  }
  return {
    installationId,
    workerPresent,
    workerPublic,
    ...(origin ? { origin } : {}),
    ...(d1Id ? { d1Id } : {}),
    ...(queueNames ? { queueNames } : {}),
    ...(durableObjectNamespaceId ? { durableObjectNamespaceId } : {}),
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function isDnsLabel(value) {
  return (
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) &&
    value.length <= 63
  );
}

async function verifyManagedPublicOrigin(origin, request, sleep) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [healthResponse, mobileResponse] = await Promise.all([
        request(`${origin}/health`, { headers: { Accept: "application/json" } }),
        request(`${origin}/api/mobile/config`, { headers: { Accept: "application/json" } }),
      ]);
      if (healthResponse.ok && mobileResponse.ok) {
        const health = await healthResponse.json();
        const mobile = await mobileResponse.json();
        if (
          health?.ok === true &&
          health?.service === "me3-core" &&
          health?.bindings?.db === true &&
          health?.bindings?.userAgent === true &&
          health?.bindings?.workersAi === true &&
          /^core_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            mobile?.installId || "",
          ) &&
          new URL(mobile?.publicURL || "").origin === origin &&
          mobile?.mobileApiVersion === 1 &&
          mobile?.auth?.pairing === "owner-approved-code"
        ) {
          return true;
        }
      }
    } catch {
      // A public route can take a moment to become routable after deployment.
    }
    if (attempt < 4) await sleep(250 * 2 ** attempt);
  }
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await recoverManagedProvisionManifest({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    installationId: process.env.ME3_MANAGED_INSTALLATION_ID,
    workerName: process.env.WORKER_NAME,
    d1Name: process.env.D1_NAME,
    configPath: process.argv[2],
  });
  if (process.env.GITHUB_ENV) {
    appendFileSync(
      process.env.GITHUB_ENV,
      [
        `ME3_MANAGED_WORKER_PRESENT=${manifest.workerPresent}`,
        `ME3_MANAGED_WORKER_PUBLIC=${manifest.workerPublic}`,
        `ME3_MANAGED_ORIGIN=${manifest.origin || ""}`,
        ...(manifest.d1Id ? [`ME3_MANAGED_D1_ID=${manifest.d1Id}`] : []),
        ...(manifest.queueNames
          ? [`ME3_MANAGED_QUEUE_NAMES=${JSON.stringify(manifest.queueNames)}`]
          : []),
        ...(manifest.durableObjectNamespaceId
          ? [`ME3_MANAGED_DO_NAMESPACE_ID=${manifest.durableObjectNamespaceId}`]
          : []),
        "",
      ].join("\n"),
    );
  }
  console.log(JSON.stringify({ ok: true, ...manifest }));
}
