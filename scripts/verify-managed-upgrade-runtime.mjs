#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export async function verifyManagedUpgradeRuntime(
  input,
  request = globalThis.fetch,
  options = {},
) {
  const publicOrigin = String(input.publicOrigin || "").trim();
  const canonicalHostname = String(input.canonicalHostname || "")
    .trim()
    .toLowerCase();
  const expectedReleaseTag = String(input.expectedReleaseTag || "").trim();
  if (
    publicOrigin !== `https://${canonicalHostname}` ||
    !/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]\.me3\.app$/.test(
      canonicalHostname,
    ) ||
    !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(expectedReleaseTag)
  ) {
    throw new Error("managed upgrade runtime contract is invalid");
  }
  const attempts = positiveInteger(options.attempts, 15);
  const delayMs = nonNegativeInteger(options.delayMs, 2_000);
  const version = expectedReleaseTag.slice(1);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const [health, mobile, core] = await Promise.all([
        fetchJson(`${publicOrigin}/health`, request),
        fetchJson(`${publicOrigin}/api/mobile/config`, request),
        fetchJson(`${publicOrigin}/api/core/version`, request),
      ]);
      if (runtimeMatches({
        health,
        mobile,
        core,
        version,
        publicOrigin,
        canonicalHostname,
      })) {
        return {
          ok: true,
          releaseTag: expectedReleaseTag,
          version,
          publicOrigin,
          canonicalHostname,
          coreInstallId: mobile.installId,
        };
      }
    } catch {
      // A new Worker version and its custom hostname can take a short time to
      // converge. Retry both transport and semantic release checks together.
    }
    if (attempt < attempts && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("managed upgrade live runtime does not match");
}

function runtimeMatches({
  health,
  mobile,
  core,
  version,
  publicOrigin,
  canonicalHostname,
}) {
  return (
    health?.ok === true &&
    health?.service === "me3-core" &&
    health?.core?.version === version &&
    health?.core?.releaseChannel === "stable" &&
    ["db", "userAgent", "workersAi", "siteAssets"].every(
      (binding) => health?.bindings?.[binding] === true,
    ) &&
    health?.hosts?.admin === canonicalHostname &&
    health?.hosts?.api === canonicalHostname &&
    /^core_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      mobile?.installId || "",
    ) &&
    safeOrigin(mobile?.publicURL) === publicOrigin &&
    mobile?.mobileApiVersion === 1 &&
    mobile?.auth?.pairing === "owner-approved-code" &&
    core?.version === version &&
    core?.releaseChannel === "stable"
  );
}

function safeOrigin(value) {
  try {
    return new URL(value || "").origin;
  } catch {
    return "";
  }
}

async function fetchJson(url, request) {
  const response = await request(url, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("managed upgrade runtime request failed");
  return response.json();
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--") || !values[index + 1]) {
      throw new Error("invalid argument");
    }
    parsed[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function required(args, key) {
  if (!args[key]) throw new Error(`--${key} is required`);
  return args[key];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    JSON.stringify(
      await verifyManagedUpgradeRuntime({
        publicOrigin: required(args, "public-origin"),
        canonicalHostname: required(args, "canonical-hostname"),
        expectedReleaseTag: required(args, "expected-release-tag"),
      }),
    ),
  );
}
