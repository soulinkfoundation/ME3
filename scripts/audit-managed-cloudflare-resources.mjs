#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const MAX_MANIFESTS = 10_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_PAGES = 1_000;
const PAGE_SIZE = 100;

const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;
const INSTALLATION_ID_PATTERN = /^mi-[0-9a-f]{16}$/;
const WORKER_NAME_PATTERN = /^me3-mi-[0-9a-f]{16}$/;
const D1_NAME_PATTERN = /^me3-mi-[0-9a-f]{16}-d1$/;
const R2_NAME_PATTERN = /^me3-mi-[0-9a-f]{16}-r2$/;
const D1_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLOUDFLARE_ID_PATTERN = /^[0-9a-f]{32}$/;
const QUEUE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MANAGED_QUEUE_NAME_PATTERN =
  /^(me3-mi-[0-9a-f]{16})-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;
const DURABLE_OBJECT_CLASS = "Me3UserAgent";

const REQUIRED_MANIFEST_KEYS = [
  "d1Id",
  "d1Name",
  "durableObjectNamespaceId",
  "installationId",
  "queueNames",
  "r2Name",
  "workerName",
];
const OPTIONAL_MANIFEST_KEYS = ["durableObjectClassName"];

export class ManagedResourceAuditError extends Error {
  constructor(code) {
    super(code);
    this.name = "ManagedResourceAuditError";
    this.code = code;
  }
}

export function normalizeExpectedManagedResourceManifests(value) {
  let parsed = value;
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > MAX_JSON_BYTES) {
      throw new ManagedResourceAuditError("expected_manifests_too_large");
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ManagedResourceAuditError("expected_manifests_invalid_json");
    }
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_MANIFESTS) {
    throw new ManagedResourceAuditError("expected_manifests_invalid");
  }

  const manifests = parsed.map((item) => normalizeManifest(item));
  assertUnique(manifests.map((item) => item.installationId), "duplicate_installation_id");
  assertUnique(manifests.map((item) => item.workerName), "duplicate_worker_name");
  assertUnique(manifests.map((item) => item.d1Name), "duplicate_d1_name");
  assertUnique(manifests.map((item) => item.d1Id), "duplicate_d1_id");
  assertUnique(manifests.map((item) => item.r2Name), "duplicate_r2_name");
  assertUnique(
    manifests.flatMap((item) => item.queueNames),
    "duplicate_queue_name",
  );
  assertUnique(
    manifests.map((item) => item.durableObjectNamespaceId),
    "duplicate_durable_object_namespace_id",
  );
  return manifests.sort((left, right) => left.installationId.localeCompare(right.installationId));
}

export async function auditManagedCloudflareResources(
  { accountId, apiToken, expectedManifests },
  request = globalThis.fetch,
) {
  if (!ACCOUNT_ID_PATTERN.test(accountId || "") || typeof apiToken !== "string" || !apiToken) {
    throw new ManagedResourceAuditError("cloudflare_credentials_invalid");
  }
  if (typeof request !== "function") {
    throw new ManagedResourceAuditError("cloudflare_request_invalid");
  }
  const expected = normalizeExpectedManagedResourceManifests(expectedManifests);
  const api = createReadOnlyCloudflareApi({ accountId, apiToken, request });

  const [workers, databases, buckets, queues, durableObjectNamespaces] = await Promise.all([
    listWorkers(api),
    listNumberedResources(api, "d1/database", "d1"),
    listR2Buckets(api),
    listNumberedResources(api, "queues", "queues"),
    listNumberedResources(
      api,
      "workers/durable_objects/namespaces",
      "durable_object_namespaces",
    ),
  ]);

  const actual = normalizeManagedInventory({
    workers,
    databases,
    buckets,
    queues,
    durableObjectNamespaces,
  });
  return compareManagedInventory(expected, actual);
}

export async function runManagedCloudflareResourceAudit({
  env = process.env,
  request = globalThis.fetch,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const report = await auditManagedCloudflareResources(
      {
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.CLOUDFLARE_API_TOKEN,
        expectedManifests: env.ME3_MANAGED_EXPECTED_MANIFESTS,
      },
      request,
    );
    stdout.write(`${JSON.stringify(report)}\n`);
    return report.ok ? 0 : 1;
  } catch (error) {
    const code =
      error instanceof ManagedResourceAuditError
        ? error.code
        : "managed_resource_audit_failed";
    stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
    return 2;
  }
}

function normalizeManifest(item) {
  if (!isPlainObject(item)) {
    throw new ManagedResourceAuditError("expected_manifest_invalid");
  }
  const keys = Object.keys(item).sort();
  const allowedKeys = new Set([...REQUIRED_MANIFEST_KEYS, ...OPTIONAL_MANIFEST_KEYS]);
  if (
    REQUIRED_MANIFEST_KEYS.some((key) => !Object.hasOwn(item, key)) ||
    keys.some((key) => !allowedKeys.has(key))
  ) {
    throw new ManagedResourceAuditError("expected_manifest_invalid");
  }

  const installationId = exactString(item.installationId);
  const workerName = exactString(item.workerName);
  const d1Name = exactString(item.d1Name);
  const d1Id = exactString(item.d1Id);
  const r2Name = exactString(item.r2Name);
  const durableObjectNamespaceId = exactString(item.durableObjectNamespaceId);
  const durableObjectClassName = Object.hasOwn(item, "durableObjectClassName")
    ? exactString(item.durableObjectClassName)
    : DURABLE_OBJECT_CLASS;
  const expectedWorkerName = `me3-${installationId}`;

  if (
    !INSTALLATION_ID_PATTERN.test(installationId) ||
    workerName !== expectedWorkerName ||
    !WORKER_NAME_PATTERN.test(workerName) ||
    d1Name !== `${workerName}-d1` ||
    !D1_NAME_PATTERN.test(d1Name) ||
    !D1_ID_PATTERN.test(d1Id) ||
    r2Name !== `${workerName}-r2` ||
    !R2_NAME_PATTERN.test(r2Name) ||
    !CLOUDFLARE_ID_PATTERN.test(durableObjectNamespaceId) ||
    durableObjectClassName !== DURABLE_OBJECT_CLASS ||
    !Array.isArray(item.queueNames) ||
    item.queueNames.length < 1 ||
    item.queueNames.length > 10
  ) {
    throw new ManagedResourceAuditError("expected_manifest_invalid");
  }

  const queueNames = item.queueNames.map(exactString);
  if (
    new Set(queueNames).size !== queueNames.length ||
    queueNames.some(
      (name) =>
        !QUEUE_NAME_PATTERN.test(name) ||
        MANAGED_QUEUE_NAME_PATTERN.exec(name)?.[1] !== workerName,
    )
  ) {
    throw new ManagedResourceAuditError("expected_manifest_invalid");
  }

  return {
    installationId,
    workerName,
    d1Name,
    d1Id,
    r2Name,
    queueNames: [...queueNames].sort(),
    durableObjectNamespaceId,
    durableObjectClassName,
  };
}

function normalizeManagedInventory({
  workers,
  databases,
  buckets,
  queues,
  durableObjectNamespaces,
}) {
  return {
    workers: workers
      .map((item) => exactString(item?.id))
      .filter((name) => WORKER_NAME_PATTERN.test(name))
      .map((name) => ({ name })),
    d1: databases
      .map((item) => ({
        name: exactString(item?.name),
        id: normalizeSafeId(item?.uuid ?? item?.id, D1_ID_PATTERN),
      }))
      .filter((item) => D1_NAME_PATTERN.test(item.name)),
    r2: buckets
      .map((item) => ({ name: exactString(item?.name) }))
      .filter((item) => R2_NAME_PATTERN.test(item.name)),
    queues: queues
      .map((item) => ({
        name: exactString(item?.queue_name),
        id: normalizeSafeId(item?.queue_id, CLOUDFLARE_ID_PATTERN),
      }))
      .filter((item) => isManagedQueueName(item.name)),
    durableObjectNamespaces: durableObjectNamespaces
      .map((item) => ({
        name: exactString(item?.script),
        id: normalizeSafeId(item?.id ?? item?.namespace_id, CLOUDFLARE_ID_PATTERN),
        expectedClass: item?.class === DURABLE_OBJECT_CLASS,
      }))
      .filter((item) => WORKER_NAME_PATTERN.test(item.name)),
  };
}

function compareManagedInventory(expected, actual) {
  const missing = [];
  const unexpected = [];
  const identityMismatches = [];

  compareNameResources({
    resourceType: "worker",
    expected: expected.map((item) => ({ name: item.workerName })),
    actual: actual.workers,
    missing,
    unexpected,
    identityMismatches,
  });
  compareIdResources({
    resourceType: "d1",
    expected: expected.map((item) => ({ name: item.d1Name, id: item.d1Id })),
    actual: actual.d1,
    missing,
    unexpected,
    identityMismatches,
  });
  compareNameResources({
    resourceType: "r2",
    expected: expected.map((item) => ({ name: item.r2Name })),
    actual: actual.r2,
    missing,
    unexpected,
    identityMismatches,
  });
  compareQueueResources({
    expected: expected.flatMap((item) => item.queueNames.map((name) => ({ name }))),
    actual: actual.queues,
    missing,
    unexpected,
    identityMismatches,
  });
  compareDurableObjectResources({
    expected: expected.map((item) => ({
      name: item.workerName,
      id: item.durableObjectNamespaceId,
    })),
    actual: actual.durableObjectNamespaces,
    missing,
    unexpected,
    identityMismatches,
  });

  sortEvidence(missing);
  sortEvidence(unexpected);
  sortEvidence(identityMismatches);
  const expectedCounts = {
    workers: expected.length,
    d1: expected.length,
    r2: expected.length,
    queues: expected.reduce((count, item) => count + item.queueNames.length, 0),
    durableObjectNamespaces: expected.length,
  };
  const observedManagedCounts = {
    workers: actual.workers.length,
    d1: actual.d1.length,
    r2: actual.r2.length,
    queues: actual.queues.length,
    durableObjectNamespaces: actual.durableObjectNamespaces.length,
  };
  return {
    ok: missing.length === 0 && unexpected.length === 0 && identityMismatches.length === 0,
    manifestCount: expected.length,
    counts: {
      expected: expectedCounts,
      observedManaged: observedManagedCounts,
      missing: missing.length,
      unexpected: unexpected.length,
      identityMismatches: identityMismatches.length,
    },
    missing,
    unexpected,
    identityMismatches,
  };
}

function compareNameResources({
  resourceType,
  expected,
  actual,
  missing,
  unexpected,
  identityMismatches,
}) {
  const actualByName = groupBy(actual, (item) => item.name);
  for (const expectedItem of expected) {
    const matches = actualByName.get(expectedItem.name) || [];
    if (matches.length === 0) {
      missing.push({ resourceType, name: expectedItem.name });
    } else if (matches.length > 1) {
      identityMismatches.push({
        resourceType,
        name: expectedItem.name,
        reason: "duplicate_observed_identity",
        observedCount: matches.length,
      });
    }
  }
  const expectedNames = new Set(expected.map((item) => item.name));
  for (const actualItem of actual) {
    if (!expectedNames.has(actualItem.name)) {
      unexpected.push({ resourceType, name: actualItem.name });
    }
  }
}

function compareIdResources({
  resourceType,
  expected,
  actual,
  missing,
  unexpected,
  identityMismatches,
}) {
  const actualByName = groupBy(actual, (item) => item.name);
  const actualById = groupBy(actual, (item) => item.id);
  const expectedIdentities = new Set(
    expected.map((item) => resourceIdentity(item.name, item.id)),
  );
  for (const expectedItem of expected) {
    const named = actualByName.get(expectedItem.name) || [];
    const exact = named.filter((item) => item.id === expectedItem.id);
    if (exact.length === 1) continue;
    const related = [
      ...new Set([...named, ...(actualById.get(expectedItem.id) || [])]),
    ];
    if (related.length === 0) {
      missing.push({ resourceType, name: expectedItem.name, id: expectedItem.id });
      continue;
    }
    identityMismatches.push({
      resourceType,
      name: expectedItem.name,
      id: expectedItem.id,
      reason: exact.length > 1 ? "duplicate_observed_identity" : "name_or_id_mismatch",
      observedCount: related.length,
      observedNames: uniqueSafeValues(related.map((item) => item.name)),
      observedIds: uniqueSafeValues(related.map((item) => item.id)),
    });
  }
  for (const actualItem of actual) {
    if (!expectedIdentities.has(resourceIdentity(actualItem.name, actualItem.id))) {
      unexpected.push(compactEvidence({
        resourceType,
        name: actualItem.name,
        id: actualItem.id,
      }));
    }
  }
}

function compareQueueResources({ expected, actual, missing, unexpected, identityMismatches }) {
  const expectedNames = new Set(expected.map((item) => item.name));
  const actualByName = groupBy(actual, (item) => item.name);
  for (const expectedItem of expected) {
    const matches = actualByName.get(expectedItem.name) || [];
    if (matches.length === 0) {
      missing.push({ resourceType: "queue", name: expectedItem.name });
    } else if (matches.length > 1 || matches[0].id === null) {
      identityMismatches.push({
        resourceType: "queue",
        name: expectedItem.name,
        reason:
          matches.length > 1 ? "duplicate_observed_identity" : "invalid_observed_id",
        observedCount: matches.length,
        observedIds: uniqueSafeValues(matches.map((item) => item.id)),
      });
    }
  }
  for (const actualItem of actual) {
    if (!expectedNames.has(actualItem.name)) {
      unexpected.push(compactEvidence({
        resourceType: "queue",
        name: actualItem.name,
        id: actualItem.id,
      }));
    }
  }
}

function compareDurableObjectResources({
  expected,
  actual,
  missing,
  unexpected,
  identityMismatches,
}) {
  const actualByName = groupBy(actual, (item) => item.name);
  const actualById = groupBy(actual, (item) => item.id);
  const expectedIdentities = new Set(
    expected.map((item) => resourceIdentity(item.name, item.id)),
  );
  for (const expectedItem of expected) {
    const named = actualByName.get(expectedItem.name) || [];
    const exact = named.filter(
      (item) =>
        item.id === expectedItem.id &&
        item.expectedClass,
    );
    if (exact.length === 1) continue;
    const related = [
      ...new Set([...named, ...(actualById.get(expectedItem.id) || [])]),
    ];
    if (related.length === 0) {
      missing.push({
        resourceType: "durable_object_namespace",
        name: expectedItem.name,
        id: expectedItem.id,
      });
      continue;
    }
    identityMismatches.push({
      resourceType: "durable_object_namespace",
      name: expectedItem.name,
      id: expectedItem.id,
      reason: exact.length > 1 ? "duplicate_observed_identity" : "script_id_or_class_mismatch",
      observedCount: related.length,
      observedNames: uniqueSafeValues(related.map((item) => item.name)),
      observedIds: uniqueSafeValues(related.map((item) => item.id)),
    });
  }
  for (const actualItem of actual) {
    if (
      !actualItem.expectedClass ||
      !expectedIdentities.has(resourceIdentity(actualItem.name, actualItem.id))
    ) {
      unexpected.push(compactEvidence({
        resourceType: "durable_object_namespace",
        name: actualItem.name,
        id: actualItem.id,
      }));
    }
  }
}

function createReadOnlyCloudflareApi({ accountId, apiToken, request }) {
  return async (resourcePath, query) => {
    const url = new URL(`${API_ROOT}/accounts/${accountId}/${resourcePath}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    let response;
    try {
      response = await request(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        redirect: "error",
      });
    } catch {
      throw new ManagedResourceAuditError("cloudflare_request_failed");
    }
    if (!response?.ok) {
      const status = Number.isInteger(response?.status) ? response.status : 0;
      throw new ManagedResourceAuditError(`cloudflare_response_${status}`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new ManagedResourceAuditError("cloudflare_response_invalid_json");
    }
    if (!isPlainObject(body) || body.success !== true || !Object.hasOwn(body, "result")) {
      throw new ManagedResourceAuditError("cloudflare_response_invalid");
    }
    return body;
  };
}

async function listWorkers(api) {
  // Cloudflare's List Workers endpoint returns the full script array and does
  // not expose page or cursor parameters. The other four inventory endpoints
  // below use their documented pagination contracts.
  const body = await api("workers/scripts");
  if (!Array.isArray(body.result)) {
    throw new ManagedResourceAuditError("cloudflare_workers_listing_invalid");
  }
  return body.result;
}

async function listNumberedResources(api, resourcePath, scope) {
  const resources = [];
  let declaredTotalPages = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await api(resourcePath, { page, per_page: PAGE_SIZE });
    if (!Array.isArray(body.result)) {
      throw new ManagedResourceAuditError(`cloudflare_${scope}_listing_invalid`);
    }
    resources.push(...body.result);
    const resultInfo = body.result_info;
    if (resultInfo !== undefined && !isPlainObject(resultInfo)) {
      throw new ManagedResourceAuditError(`cloudflare_${scope}_pagination_invalid`);
    }
    const hasTotalPages = !!resultInfo && Object.hasOwn(resultInfo, "total_pages");
    const totalPages = optionalPositiveInteger(resultInfo?.total_pages);
    if (hasTotalPages && totalPages === null) {
      throw new ManagedResourceAuditError(`cloudflare_${scope}_pagination_invalid`);
    }
    const reportedPage = resultInfo?.page;
    if (
      reportedPage !== undefined &&
      (!Number.isSafeInteger(reportedPage) || reportedPage !== page)
    ) {
      throw new ManagedResourceAuditError(`cloudflare_${scope}_pagination_invalid`);
    }
    if (totalPages !== null) {
      if (totalPages < page || (declaredTotalPages !== null && totalPages !== declaredTotalPages)) {
        throw new ManagedResourceAuditError(`cloudflare_${scope}_pagination_invalid`);
      }
      declaredTotalPages = totalPages;
      if (page >= totalPages) return resources;
      continue;
    }
    if (body.result.length < PAGE_SIZE) return resources;
  }
  throw new ManagedResourceAuditError(`cloudflare_${scope}_pagination_limit`);
}

async function listR2Buckets(api) {
  const buckets = [];
  const seenCursors = new Set();
  let cursor;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await api("r2/buckets", { per_page: PAGE_SIZE, cursor });
    if (!isPlainObject(body.result) || !Array.isArray(body.result.buckets)) {
      throw new ManagedResourceAuditError("cloudflare_r2_listing_invalid");
    }
    if (body.result_info !== undefined && !isPlainObject(body.result_info)) {
      throw new ManagedResourceAuditError("cloudflare_r2_pagination_invalid");
    }
    buckets.push(...body.result.buckets);
    const nextCursor = body.result_info?.cursor;
    if (nextCursor === undefined || nextCursor === null || nextCursor === "") return buckets;
    if (typeof nextCursor !== "string" || seenCursors.has(nextCursor)) {
      throw new ManagedResourceAuditError("cloudflare_r2_pagination_invalid");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new ManagedResourceAuditError("cloudflare_r2_pagination_limit");
}

function assertUnique(values, errorCode) {
  if (new Set(values).size !== values.length) {
    throw new ManagedResourceAuditError(errorCode);
  }
}

function exactString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeSafeId(value, pattern) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return pattern.test(normalized) ? normalized : null;
}

function isManagedQueueName(name) {
  return QUEUE_NAME_PATTERN.test(name) && MANAGED_QUEUE_NAME_PATTERN.test(name);
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === null) return null;
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function uniqueSafeValues(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))].sort();
}

function groupBy(items, keyFor) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const values = grouped.get(key);
    if (values) values.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

function resourceIdentity(name, id) {
  return `${name}\u0000${id || ""}`;
}

function compactEvidence(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null));
}

function sortEvidence(items) {
  items.sort((left, right) =>
    [left.resourceType, left.name, left.id || "", left.reason || ""]
      .join("\u0000")
      .localeCompare(
        [right.resourceType, right.name, right.id || "", right.reason || ""].join("\u0000"),
      ),
  );
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runManagedCloudflareResourceAudit();
}
