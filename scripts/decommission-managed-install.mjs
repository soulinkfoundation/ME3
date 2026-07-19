#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sendManagedLifecycleWorkflowCallback } from "./managed-lifecycle-workflow-callback.mjs";

const API_ROOT = "https://api.cloudflare.com/client/v4";
const LEGACY_SHARED_QUEUES = new Set([
  "me3-assistant-job-events",
  "me3-assistant-job-events-dlq",
  "me3-booking-reminders",
  "me3-booking-reminders-dlq",
  "me3-social-publish",
  "me3-social-publish-dlq",
]);
const QUEUE_DETACH_MAX_ATTEMPTS = 30;
const QUEUE_DETACH_DELAY_MS = 1_000;
export const MANAGED_DECOMMISSION_TOMBSTONE_SOURCE = [
  "export default {",
  "  fetch() { return new Response('Managed ME3 is decommissioning', { status: 410 }); },",
  // Cloudflare can validate a replacement upload against the prior Queue
  // consumer trigger even after the consumer API reports it absent. Keep a
  // fail-closed handler in the transient tombstone: retryAll explicitly avoids
  // acknowledging a late delivery while the binding-free deploy settles.
  "  queue(batch) { batch.retryAll(); },",
  "};",
  "",
].join("\n");

export async function decommissionManagedInstall(
  input,
  {
    request = globalThis.fetch,
    deployTombstone = deployDurableObjectTombstone,
    reportStage = async () => {},
    pause = delay,
    queueDetachMaxAttempts = QUEUE_DETACH_MAX_ATTEMPTS,
  } = {},
) {
  const contract = validateContract(input);
  validateExportDisposition(input, contract);
  validateR2DeletionPrecondition(input.r2EmptyListing, contract.exportWaived);
  const api = createCloudflareApi(
    { accountId: input.accountId, apiToken: input.apiToken },
    request,
  );

  const presence = await assertExistingResourceIdentities(api, contract);
  if (presence.d1) {
    await assertPersistedRuntimeTermination(api, input.accountId, contract.d1Id);
  } else if (presence.worker) {
    throw new Error("persisted runtime termination proof is unavailable before Worker deletion");
  } else if (presence.r2) {
    // R2 is deleted before Worker and D1 in this workflow. A remaining bucket
    // without the exact D1 purge attestation is therefore not a valid retry
    // state, even when the user waived export retention.
    throw new Error("persisted runtime termination proof is unavailable before R2 deletion");
  }
  // The control-plane callback is the final authorization barrier. A stale or
  // cancelled attempt must be rejected here before the first provider delete.
  await reportStage("deleting_r2");
  await deleteIfPresent(api, `/accounts/${input.accountId}/r2/buckets/${contract.r2Name}`);
  await assertMissing(api, `/accounts/${input.accountId}/r2/buckets/${contract.r2Name}`, "R2 bucket");

  await reportStage("removing_consumers");
  for (const queueName of contract.queueNames) {
    const queue = await findQueue(api, input.accountId, queueName);
    if (!queue) continue;
    for (const consumer of await listQueueConsumers(api, input.accountId, queue)) {
      if (isWorkerConsumer(consumer, contract.workerName)) {
        await deleteIfPresent(
          api,
          `/accounts/${input.accountId}/queues/${queue.queue_id}/consumers/${consumer.consumer_id}`,
        );
      }
    }
  }
  await waitForManagedQueueConsumersDetached(
    api,
    input.accountId,
    contract.queueNames,
    contract.workerName,
    { pause, maxAttempts: queueDetachMaxAttempts },
  );

  // Queue producer bindings belong to the Worker deployment, not the Queue
  // consumer records above. Deploy the exact binding-free tombstone before
  // deleting dedicated queues so Cloudflare no longer rejects their deletion.
  // Keep this inside the already-authorized removing_consumers stage so the
  // externally reported lifecycle stages remain strictly monotonic.
  let namespaces = await listDurableObjectNamespaces(api, input.accountId);
  const namespace = namespaces.find((item) => namespaceId(item) === contract.durableObjectNamespaceId);
  if (presence.worker || namespace) {
    if (
      namespace &&
      (namespace.script !== contract.workerName || namespace.class !== "Me3UserAgent")
    ) {
      throw new Error("Durable Object namespace identity does not match the managed install");
    }
    await deployTombstone({
      workerName: contract.workerName,
      operationId: contract.operationId,
      deleteDurableObject: Boolean(namespace),
    });
    namespaces = await listDurableObjectNamespaces(api, input.accountId);
    if (namespaces.some((item) => namespaceId(item) === contract.durableObjectNamespaceId)) {
      throw new Error("Durable Object namespace deletion was not verified");
    }
  }
  await clearManagedWorkerBindings(api, input.accountId, contract.workerName);

  const dedicatedQueueNames = orderedDedicatedQueueNames(
    contract.queueNames,
    contract.workerName,
  );
  await waitForManagedQueueBindingsDetached(api, input.accountId, dedicatedQueueNames, {
    pause,
    maxAttempts: queueDetachMaxAttempts,
  });

  await reportStage("deleting_queues");
  for (const queueName of dedicatedQueueNames) {
    const queue = await findQueue(api, input.accountId, queueName);
    if (queue) await deleteIfPresent(api, `/accounts/${input.accountId}/queues/${queue.queue_id}`);
  }

  await reportStage("deleting_worker");
  await deleteIfPresent(
    api,
    `/accounts/${input.accountId}/workers/scripts/${contract.workerName}`,
  );

  // D1 contains the persisted revoke/purge proof needed to authorize a safe
  // retry. Keep it until every other provider resource has been re-read as
  // absent, rather than trusting successful DELETE responses alone.
  await assertManagedProviderResourcesAbsent(api, input.accountId, contract);

  await reportStage("deleting_d1");
  await deleteIfPresent(
    api,
    `/accounts/${input.accountId}/d1/database/${contract.d1Id}`,
  );

  await reportStage("verifying_absence");
  await assertManagedProviderResourcesAbsent(api, input.accountId, contract);
  await assertMissing(
    api,
    `/accounts/${input.accountId}/d1/database/${contract.d1Id}`,
    "D1 database",
  );

  return {
    ok: true,
    installationId: contract.installationId,
    operationId: contract.operationId,
    exportWaived: contract.exportWaived,
    resourcesAbsent: {
      worker: true,
      d1: true,
      r2: true,
      durableObjectNamespace: true,
      dedicatedQueues: dedicatedQueueNames,
      legacySharedQueueConsumers: contract.queueNames.filter((name) => LEGACY_SHARED_QUEUES.has(name)),
    },
  };
}

export function validateManagedDecommissionContract(input) {
  return validateContract(input);
}

function validateContract(input) {
  const installationId = String(input.installationId || "").toLowerCase();
  const operationId = String(input.operationId || "").toLowerCase();
  const exportOperationId = String(input.exportOperationId || "").toLowerCase();
  const exportKeyVersion = String(input.exportKeyVersion || "").toLowerCase();
  const exportWaived = parseExportWaived(input.exportWaived);
  const workerName = String(input.workerName || "");
  const d1Name = String(input.d1Name || "");
  const d1Id = String(input.d1Id || "").toLowerCase();
  const r2Name = String(input.r2Name || "");
  const durableObjectNamespaceId = String(input.durableObjectNamespaceId || "").toLowerCase();
  let queueNames;
  try {
    queueNames = typeof input.queueNames === "string" ? JSON.parse(input.queueNames) : input.queueNames;
  } catch {
    throw new Error("managed queue manifest is invalid");
  }
  if (
    !/^mi-[0-9a-f]{16}$/.test(installationId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId) ||
    (exportWaived
      ? exportOperationId !== "" || exportKeyVersion !== ""
      : !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(exportOperationId) ||
        operationId === exportOperationId ||
        !/^v[1-9][0-9]{0,8}$/.test(exportKeyVersion)) ||
    workerName !== `me3-${installationId}` ||
    d1Name !== `${workerName}-d1` ||
    r2Name !== `${workerName}-r2` ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d1Id) ||
    !/^[0-9a-f]{32}$/.test(durableObjectNamespaceId) ||
    !Array.isArray(queueNames) ||
    queueNames.length === 0 ||
    new Set(queueNames).size !== queueNames.length ||
    queueNames.some(
      (name) =>
        typeof name !== "string" ||
        (!name.startsWith(`${workerName}-`) && !LEGACY_SHARED_QUEUES.has(name)),
    )
  ) {
    throw new Error("managed decommission resource contract is invalid");
  }
  return {
    installationId,
    operationId,
    exportOperationId,
    exportKeyVersion,
    exportWaived,
    workerName,
    d1Name,
    d1Id,
    r2Name,
    durableObjectNamespaceId,
    queueNames: [...queueNames].sort(),
  };
}

function parseExportWaived(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error("managed export waiver must be explicitly true or false");
}

function validateExportDisposition(input, contract) {
  if (!contract.exportWaived) {
    validateRetainedExport(input, contract);
    return;
  }

  const exportInputs = [
    input.exportOperationId,
    input.exportKeyVersion,
    input.exportObjectKey,
    input.exportSha256,
    input.exportMd5,
    input.exportEtag,
    input.exportSizeBytes,
    input.exportHead,
  ];
  if (exportInputs.some((value) => value !== undefined && value !== null && value !== "")) {
    throw new Error("retained export inputs must be empty when export is waived");
  }
}

function validateRetainedExport(input, contract) {
  const expectedKey =
    `managed-exports/${contract.installationId}/${contract.exportOperationId}.me3-managed-export-v1.enc`;
  const head = input.exportHead;
  const sha256 = String(input.exportSha256 || "").toLowerCase();
  const md5 = String(input.exportMd5 || "").toLowerCase();
  const etag = String(input.exportEtag || "").replace(/^"|"$/g, "").toLowerCase();
  const sizeBytes = Number(input.exportSizeBytes);
  if (
    input.exportObjectKey !== expectedKey ||
    !/^[0-9a-f]{64}$/.test(sha256) ||
    !/^[0-9a-f]{32}$/.test(md5) ||
    etag !== md5 ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    Number(head?.ContentLength) !== sizeBytes ||
    String(head?.ETag || "").replace(/^"|"$/g, "").toLowerCase() !== etag ||
    String(head?.Metadata?.sha256 || "").toLowerCase() !== sha256 ||
    String(head?.Metadata?.md5 || "").toLowerCase() !== md5 ||
    head?.Metadata?.format !== "me3-managed-export-v1" ||
    head?.Metadata?.installation !== contract.installationId ||
    head?.Metadata?.operation !== contract.exportOperationId ||
    head?.Metadata?.keyversion !== contract.exportKeyVersion
  ) {
    throw new Error("verified retained export evidence is required before decommission");
  }
}

function validateR2DeletionPrecondition(listing, exportWaived) {
  // Retained-export decommission independently lists the source bucket with
  // job-scoped S3 credentials. The waived path deliberately has no S3
  // credentials: its proof is the exact D1 runtime purge attestation below,
  // followed by Cloudflare REST bucket deletion and verified absence.
  if (exportWaived && (listing === undefined || listing === null)) return;
  if (
    !listing ||
    listing.IsTruncated === true ||
    listing.NextContinuationToken ||
    (Array.isArray(listing.Contents) && listing.Contents.length > 0) ||
    (!Array.isArray(listing.Contents) && listing.Contents !== undefined)
  ) {
    throw new Error("R2 bucket must be verifiably empty before decommission");
  }
}

async function assertExistingResourceIdentities(api, contract) {
  const worker = await api(
    `/accounts/${api.accountId}/workers/scripts/${contract.workerName}`,
    {},
    { missingOk: true },
  );
  const d1 = await api(
    `/accounts/${api.accountId}/d1/database/${contract.d1Id}`,
    {},
    { missingOk: true },
  );
  if (
    d1 &&
    (String(d1.uuid || d1.id || "").toLowerCase() !== contract.d1Id ||
      String(d1.name || "") !== contract.d1Name)
  ) {
    throw new Error("D1 resource identity does not match the managed install");
  }
  const r2 = await api(
    `/accounts/${api.accountId}/r2/buckets/${contract.r2Name}`,
    {},
    { missingOk: true },
  );
  if (r2 && String(r2.name || contract.r2Name) !== contract.r2Name) {
    throw new Error("R2 resource identity does not match the managed install");
  }
  for (const queueName of contract.queueNames) {
    const queue = await findQueue(api, api.accountId, queueName);
    if (queue) await listQueueConsumers(api, api.accountId, queue);
  }
  const namespaces = await listDurableObjectNamespaces(api, api.accountId);
  const namespace = namespaces.find(
    (item) => namespaceId(item) === contract.durableObjectNamespaceId,
  );
  if (
    namespace &&
    (namespace.script !== contract.workerName || namespace.class !== "Me3UserAgent")
  ) {
    throw new Error("Durable Object namespace identity does not match the managed install");
  }
  return { worker: Boolean(worker), d1: Boolean(d1), r2: Boolean(r2) };
}

async function assertPersistedRuntimeTermination(api, accountId, d1Id) {
  const result = await api(
    `/accounts/${accountId}/d1/database/${d1Id}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT state, credentials_revoked_at, storage_purged_at
              FROM managed_runtime_state
              WHERE id = 'managed'`,
      }),
    },
  );
  const rows = Array.isArray(result)
    ? result.flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []))
    : [];
  if (
    rows.length !== 1 ||
    rows[0]?.state !== "suspended" ||
    !rows[0]?.credentials_revoked_at ||
    !rows[0]?.storage_purged_at
  ) {
    throw new Error("persisted runtime termination is required after Worker deletion");
  }
}

function createCloudflareApi({ accountId, apiToken }, request) {
  if (!/^[0-9a-f]{32}$/.test(accountId || "") || !apiToken) {
    throw new Error("Cloudflare decommission credentials are invalid");
  }
  const api = async (path, init = {}, options = {}) => {
    const response = await request(`${API_ROOT}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiToken}`, ...(init.headers || {}) },
    });
    if (response.status === 404 && options.missingOk) return null;
    let body = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json")) body = await response.json();
    if (!response.ok || (body && body.success === false)) {
      throw new Error(`Cloudflare resource operation failed with status ${response.status}`);
    }
    if (!body) return { present: true };
    return Object.hasOwn(body, "result") ? body.result : body;
  };
  api.accountId = accountId;
  return api;
}

async function deleteIfPresent(api, path) {
  await api(path, { method: "DELETE" }, { missingOk: true });
}

async function assertMissing(api, path, label) {
  const result = await api(path, {}, { missingOk: true });
  if (result !== null) throw new Error(`${label} absence was not verified`);
}

async function assertManagedProviderResourcesAbsent(api, accountId, contract) {
  await assertMissing(
    api,
    `/accounts/${accountId}/r2/buckets/${contract.r2Name}`,
    "R2 bucket",
  );
  await assertMissing(
    api,
    `/accounts/${accountId}/workers/scripts/${contract.workerName}`,
    "Worker",
  );
  for (const queueName of contract.queueNames) {
    const queue = await findQueue(api, accountId, queueName);
    if (queueName.startsWith(`${contract.workerName}-`) && queue) {
      throw new Error(`managed queue deletion was not verified: ${queueName}`);
    }
    if (
      queue &&
      (await listQueueConsumers(api, accountId, queue)).some((consumer) =>
        isWorkerConsumer(consumer, contract.workerName),
      )
    ) {
      throw new Error(`managed queue consumer removal was not verified: ${queueName}`);
    }
  }
  const namespaces = await listDurableObjectNamespaces(api, accountId);
  if (namespaces.some((item) => namespaceId(item) === contract.durableObjectNamespaceId)) {
    throw new Error("Durable Object namespace absence was not verified");
  }
}

async function findQueue(api, accountId, name) {
  const query = new URLSearchParams({ name, page: "1", per_page: "100" });
  const queues = await api(`/accounts/${accountId}/queues?${query}`);
  if (!Array.isArray(queues)) throw new Error("Cloudflare queue listing is invalid");
  const matches = queues.filter((queue) => queue?.queue_name === name);
  if (matches.length > 1) throw new Error(`Cloudflare queue identity is ambiguous: ${name}`);
  return matches[0] || null;
}

export async function waitForManagedQueueBindingsDetached(
  api,
  accountId,
  queueNames,
  {
    pause = delay,
    maxAttempts = QUEUE_DETACH_MAX_ATTEMPTS,
  } = {},
) {
  if (
    typeof api !== "function" ||
    !/^[0-9a-f]{32}$/.test(accountId || "") ||
    !Array.isArray(queueNames) ||
    typeof pause !== "function" ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > QUEUE_DETACH_MAX_ATTEMPTS
  ) {
    throw new Error("managed queue detachment proof configuration is invalid");
  }
  for (const queueName of queueNames) {
    let detached = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const queue = await findQueue(api, accountId, queueName);
      if (!queue) {
        detached = true;
        break;
      }
      const consumerCount = Number(queue.consumers_total_count);
      const producerCount = Number(queue.producers_total_count);
      if (
        !Array.isArray(queue.consumers) ||
        !Array.isArray(queue.producers) ||
        !Number.isSafeInteger(consumerCount) ||
        consumerCount < 0 ||
        queue.consumers.length !== consumerCount ||
        !Number.isSafeInteger(producerCount) ||
        producerCount < 0 ||
        queue.producers.length !== producerCount
      ) {
        throw new Error(`Cloudflare queue binding counts are invalid: ${queueName}`);
      }
      if (consumerCount === 0 && producerCount === 0) {
        detached = true;
        break;
      }
      if (attempt < maxAttempts) await pause(QUEUE_DETACH_DELAY_MS);
    }
    if (!detached) {
      throw new Error(`managed queue bindings did not detach: ${queueName}`);
    }
  }
}

export async function waitForManagedQueueConsumersDetached(
  api,
  accountId,
  queueNames,
  workerName,
  {
    pause = delay,
    maxAttempts = QUEUE_DETACH_MAX_ATTEMPTS,
  } = {},
) {
  if (
    typeof api !== "function" ||
    !/^[0-9a-f]{32}$/.test(accountId || "") ||
    !Array.isArray(queueNames) ||
    !workerName ||
    typeof pause !== "function" ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > QUEUE_DETACH_MAX_ATTEMPTS
  ) {
    throw new Error("managed queue consumer detachment proof configuration is invalid");
  }

  for (const queueName of queueNames) {
    let detached = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const queue = await findQueue(api, accountId, queueName);
      if (!queue) {
        detached = true;
        break;
      }
      const consumers = await listQueueConsumers(api, accountId, queue);
      if (!consumers.some((consumer) => isWorkerConsumer(consumer, workerName))) {
        detached = true;
        break;
      }
      if (attempt < maxAttempts) await pause(QUEUE_DETACH_DELAY_MS);
    }
    if (!detached) {
      throw new Error(`managed queue consumer did not detach: ${queueName}`);
    }
  }
}

export async function clearManagedWorkerBindings(api, accountId, workerName) {
  if (
    typeof api !== "function" ||
    !/^[0-9a-f]{32}$/.test(accountId || "") ||
    !workerName
  ) {
    throw new Error("managed Worker binding cleanup configuration is invalid");
  }
  const path = `/accounts/${accountId}/workers/scripts/${workerName}/settings`;
  const before = await api(path, {}, { missingOk: true });
  if (!before) return;
  if (!Array.isArray(before.bindings)) {
    throw new Error("Cloudflare managed Worker binding listing is invalid");
  }
  if (before.bindings.length > 0) {
    const body = new FormData();
    body.set("settings", JSON.stringify({ bindings: [] }));
    await api(path, { method: "PATCH", body });
  }
  const after = await api(path, {}, { missingOk: true });
  const retainedBindings = after?.bindings;
  if (
    after &&
    (!Array.isArray(retainedBindings) ||
      retainedBindings.some(
        (binding) =>
          binding?.type !== "secret_text" && binding?.type !== "version_metadata",
      ))
  ) {
    throw new Error("managed Worker resource binding removal was not verified");
  }
}

export function orderedDedicatedQueueNames(queueNames, workerName) {
  return queueNames
    .filter((name) => name.startsWith(`${workerName}-`))
    .sort(
      (left, right) =>
        Number(left.endsWith("-dlq")) - Number(right.endsWith("-dlq")) ||
        left.localeCompare(right),
    );
}

async function listQueueConsumers(api, accountId, queue) {
  if (!queue?.queue_id) throw new Error("Cloudflare queue id is invalid");
  const consumers = await api(
    `/accounts/${accountId}/queues/${queue.queue_id}/consumers`,
  );
  if (!Array.isArray(consumers)) throw new Error("Cloudflare queue consumer listing is invalid");
  // Cloudflare exposes this endpoint as a single page. Require its length to
  // match the Queue summary before treating an exact Worker consumer as absent.
  const expectedCount = Number(queue.consumers_total_count);
  if (
    !Number.isSafeInteger(expectedCount) ||
    expectedCount < 0 ||
    consumers.length !== expectedCount
  ) {
    const scope = LEGACY_SHARED_QUEUES.has(queue.queue_name) ? "shared" : "dedicated";
    throw new Error(`Cloudflare ${scope} queue consumer listing is incomplete`);
  }
  return consumers;
}

function isWorkerConsumer(consumer, workerName) {
  return (
    consumer?.script_name === workerName &&
    (consumer?.type === undefined || consumer?.type === "worker")
  );
}

async function listDurableObjectNamespaces(api, accountId) {
  const namespaces = [];
  for (let page = 1; page <= 100; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: "100" });
    const result = await api(`/accounts/${accountId}/workers/durable_objects/namespaces?${query}`);
    if (!Array.isArray(result)) throw new Error("Cloudflare Durable Object listing is invalid");
    namespaces.push(...result);
    if (result.length < 100) return namespaces;
  }
  throw new Error("Cloudflare Durable Object listing exceeded the safe page limit");
}

function namespaceId(namespace) {
  return String(namespace?.id || namespace?.namespace_id || "").toLowerCase();
}

export function deployDurableObjectTombstone({
  workerName,
  operationId,
  deleteDurableObject = true,
}) {
  const root = mkdtempSync(join(tmpdir(), "me3-managed-do-delete-"));
  const configPath = join(root, "wrangler.toml");
  try {
    writeFileSync(
      join(root, "tombstone.mjs"),
      MANAGED_DECOMMISSION_TOMBSTONE_SOURCE,
      { mode: 0o600 },
    );
    const config = [
      `name = "${workerName}"`,
      'main = "tombstone.mjs"',
      'compatibility_date = "2026-06-24"',
      "workers_dev = false",
      ...(deleteDurableObject
        ? [
            "[[migrations]]",
            `tag = "managed-delete-${operationId}"`,
            'deleted_classes = ["Me3UserAgent"]',
          ]
        : []),
      "",
    ];
    writeFileSync(configPath, config.join("\n"), { mode: 0o600 });
    const result = spawnSync(
      "pnpm",
      ["exec", "wrangler", "deploy", "--config", configPath, "--strict"],
      {
        encoding: "utf8",
        cwd: process.env.ME3_MANAGED_SOURCE_DIR || process.cwd(),
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `Durable Object delete migration failed: ${summarizeManagedCommandFailure(result)}`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function summarizeManagedCommandFailure(result) {
  let output = [result?.error?.message, result?.stdout, result?.stderr]
    .filter(Boolean)
    .join("\n")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim();

  for (const [name, value] of Object.entries(process.env)) {
    if (
      /(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)/i.test(name) &&
      typeof value === "string" &&
      value.length >= 8
    ) {
      output = output.split(value).join("[redacted]");
    }
  }

  output = output
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(api[_ -]?token\s*[=:]\s*)[^\s]+/gi, "$1[redacted]");

  if (!output) {
    return `exit status ${String(result?.status ?? "unknown")}`;
  }
  return output.slice(-3_000);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--") || !values[index + 1]) throw new Error("invalid argument");
    parsed[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const exportHeadPath = args["export-head"];
  const r2EmptyListingPath = args["r2-empty-listing"];
  const result = await decommissionManagedInstall(
    {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      installationId: args["installation-id"],
      operationId: args["operation-id"],
      exportWaived: args["export-waived"],
      exportOperationId: args["export-operation-id"],
      exportKeyVersion: args["export-key-version"],
      workerName: args["worker-name"],
      d1Name: args["d1-name"],
      d1Id: args["d1-id"],
      r2Name: args["r2-name"],
      queueNames: args["queue-names"],
      durableObjectNamespaceId: args["durable-object-namespace-id"],
      exportObjectKey: args["export-object-key"],
      exportSha256: args["export-sha256"],
      exportMd5: args["export-md5"],
      exportEtag: args["export-etag"],
      exportSizeBytes: args["export-size-bytes"],
      exportHead:
        exportHeadPath && args["export-waived"] !== "true"
          ? JSON.parse(readFileSync(exportHeadPath, "utf8"))
          : exportHeadPath,
      r2EmptyListing: r2EmptyListingPath
        ? JSON.parse(readFileSync(r2EmptyListingPath, "utf8"))
        : undefined,
    },
    {
      reportStage: async (stage) => {
        if (process.env.GITHUB_ENV) {
          appendFileSync(process.env.GITHUB_ENV, `ME3_MANAGED_FAILURE_STAGE=${stage}\n`);
        }
        await sendManagedLifecycleWorkflowCallback({
          ...process.env,
          ME3_MANAGED_STATUS: "running",
          ME3_MANAGED_STAGE: stage,
        });
      },
    },
  );
  console.log(JSON.stringify(result));
}
