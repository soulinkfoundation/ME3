#!/usr/bin/env node

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const MANAGED_UPGRADE_CALLBACK_URL =
  "https://api.me3.app/api/managed-install/upgrade/callback";

const INSTALLATION_PATTERN = /^mi-[0-9a-f]{16}$/;
const RELEASE_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const V4_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOSTNAME_PATTERN =
  /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]\.me3\.app$/;
const RESOURCE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function managedUpgradeContractFromEnv(env = process.env) {
  return normalizeManagedUpgradeContract({
    attemptId: env.ME3_MANAGED_ATTEMPT_ID,
    installationId: env.ME3_MANAGED_INSTALLATION_ID,
    currentReleaseTag: env.ME3_MANAGED_CURRENT_RELEASE_TAG,
    targetReleaseTag: env.ME3_MANAGED_TARGET_RELEASE_TAG,
    targetReleaseSha: env.ME3_MANAGED_TARGET_RELEASE_SHA,
    callbackUrl: env.ME3_MANAGED_CALLBACK_URL,
    workerName: env.WORKER_NAME,
    d1Name: env.D1_NAME,
    d1Id: env.D1_ID,
    r2Name: env.R2_NAME,
    queueNames: env.QUEUE_NAMES,
    durableObjectNamespaceId: env.DO_NAMESPACE_ID,
    publicOrigin: env.PUBLIC_ORIGIN,
    canonicalHostname: env.ME3_MANAGED_CANONICAL_HOSTNAME,
    zoneId: env.ME3_MANAGED_ZONE_ID,
  });
}

export function normalizeManagedUpgradeContract(input) {
  const attemptId = text(input.attemptId).toLowerCase();
  const installationId = text(input.installationId).toLowerCase();
  const currentReleaseTag = text(input.currentReleaseTag);
  const targetReleaseTag = text(input.targetReleaseTag);
  const targetReleaseSha = text(input.targetReleaseSha).toLowerCase();
  const callbackUrl = text(input.callbackUrl);
  const workerName = text(input.workerName).toLowerCase();
  const d1Name = text(input.d1Name).toLowerCase();
  const d1Id = text(input.d1Id).toLowerCase();
  const r2Name = text(input.r2Name).toLowerCase();
  const durableObjectNamespaceId = text(input.durableObjectNamespaceId).toLowerCase();
  const publicOrigin = text(input.publicOrigin);
  const canonicalHostname = text(input.canonicalHostname).toLowerCase();
  const zoneId = text(input.zoneId).toLowerCase();
  const queueNames = normalizeQueueNames(input.queueNames);

  if (
    !V4_UUID_PATTERN.test(attemptId) ||
    !INSTALLATION_PATTERN.test(installationId) ||
    !RELEASE_PATTERN.test(currentReleaseTag) ||
    !RELEASE_PATTERN.test(targetReleaseTag) ||
    !/^[0-9a-f]{40}$/.test(targetReleaseSha) ||
    callbackUrl !== MANAGED_UPGRADE_CALLBACK_URL ||
    workerName !== `me3-${installationId}` ||
    !RESOURCE_NAME_PATTERN.test(workerName) ||
    d1Name !== `${workerName}-d1` ||
    !UUID_PATTERN.test(d1Id) ||
    r2Name !== `${workerName}-r2` ||
    !RESOURCE_NAME_PATTERN.test(r2Name) ||
    !/^[0-9a-f]{32}$/.test(durableObjectNamespaceId) ||
    !HOSTNAME_PATTERN.test(canonicalHostname) ||
    publicOrigin !== `https://${canonicalHostname}` ||
    !/^[0-9a-f]{32}$/.test(zoneId) ||
    queueNames.length === 0 ||
    queueNames.some(
      (name) =>
        !RESOURCE_NAME_PATTERN.test(name) ||
        !name.startsWith(`${workerName}-`),
    )
  ) {
    throw new Error("managed upgrade contract is invalid");
  }

  return {
    attemptId,
    installationId,
    currentReleaseTag,
    targetReleaseTag,
    targetReleaseSha,
    callbackUrl,
    workerName,
    d1Name,
    d1Id,
    r2Name,
    queueNames,
    durableObjectNamespaceId,
    publicOrigin,
    canonicalHostname,
    zoneId,
  };
}

export function managedUpgradeResourceManifest(contractInput) {
  const contract = normalizeManagedUpgradeContract(contractInput);
  return {
    workerName: contract.workerName,
    d1Name: contract.d1Name,
    d1Id: contract.d1Id,
    r2Name: contract.r2Name,
    queueNames: contract.queueNames,
    durableObjectNamespaceId: contract.durableObjectNamespaceId,
    publicOrigin: contract.publicOrigin,
    canonicalHostname: contract.canonicalHostname,
    zoneId: contract.zoneId,
  };
}

export function hashManagedUpgradeResourceManifest(contractInput) {
  return createHash("sha256")
    .update(JSON.stringify(managedUpgradeResourceManifest(contractInput)))
    .digest("hex");
}

function normalizeQueueNames(value) {
  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("managed upgrade contract is invalid");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    new Set(parsed).size !== parsed.length ||
    parsed.some((name) => typeof name !== "string" || name !== name.trim())
  ) {
    throw new Error("managed upgrade contract is invalid");
  }
  return [...parsed].sort();
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(managedUpgradeContractFromEnv()));
}
