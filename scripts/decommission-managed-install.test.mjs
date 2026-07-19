import assert from "node:assert/strict";
import test from "node:test";
import { decommissionManagedInstall } from "./decommission-managed-install.mjs";

const ACCOUNT_ID = "a".repeat(32);
const INSTALLATION_ID = "mi-1234567890abcdef";
const WORKER_NAME = `me3-${INSTALLATION_ID}`;
const EXPORT_OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const OPERATION_ID = "22222222-2222-4222-8222-222222222222";
const D1_ID = "33333333-3333-4333-8333-333333333333";
const DO_ID = "d".repeat(32);
const MD5 = "b".repeat(32);
const SHA256 = "c".repeat(64);
const DEDICATED_QUEUE = `${WORKER_NAME}-assistant-job-events`;
const SHARED_QUEUE = "me3-booking-reminders";

test("deletes the exact manifest, matches queue script_name, verifies absence, and retries safely", async () => {
  const fake = createCloudflareFixture();
  const stages = [];
  let tombstones = 0;
  const options = {
    request: fake.request,
    reportStage: async (stage) => stages.push(stage),
    deployTombstone: async ({ workerName, operationId }) => {
      tombstones += 1;
      assert.equal(workerName, WORKER_NAME);
      assert.equal(operationId, OPERATION_ID);
      fake.state.namespaces = [];
    },
  };

  const first = await decommissionManagedInstall(contract(), options);
  assert.equal(first.ok, true);
  assert.equal(first.exportWaived, false);
  assert.deepEqual(stages, [
    "deleting_r2",
    "removing_consumers",
    "deleting_queues",
    "deleting_worker",
    "deleting_d1",
    "verifying_absence",
  ]);
  assert.equal(tombstones, 1);
  assert.equal(fake.state.worker, false);
  assert.equal(fake.state.d1, null);
  assert.equal(fake.state.r2, null);
  assert.equal(fake.state.queues.has(DEDICATED_QUEUE), false);
  assert.deepEqual(
    fake.state.queues.get(SHARED_QUEUE).consumers.map((consumer) => consumer.script_name),
    ["unrelated-worker"],
  );
  assert.equal(
    fake.calls.some(
      ({ method, path }) =>
        method === "DELETE" && path.endsWith("/consumers/shared-managed-consumer"),
    ),
    true,
  );
  assert.equal(
    fake.calls.some(
      ({ method, path }) =>
        method === "DELETE" && path.endsWith("/consumers/shared-unrelated-consumer"),
    ),
    false,
  );

  stages.length = 0;
  const retried = await decommissionManagedInstall(contract(), options);
  assert.equal(retried.ok, true);
  assert.equal(tombstones, 1);
  assert.equal(stages.at(-1), "verifying_absence");
});

test("decommissions with an explicit export waiver while preserving every resource proof", async () => {
  const fake = createCloudflareFixture();
  const stages = [];
  const result = await decommissionManagedInstall(waivedContract(), {
    request: fake.request,
    reportStage: async (stage) => stages.push(stage),
    deployTombstone: async ({ workerName, operationId }) => {
      assert.equal(workerName, WORKER_NAME);
      assert.equal(operationId, OPERATION_ID);
      fake.state.namespaces = [];
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.exportWaived, true);
  assert.deepEqual(stages, [
    "deleting_r2",
    "removing_consumers",
    "deleting_queues",
    "deleting_worker",
    "deleting_d1",
    "verifying_absence",
  ]);
  assert.equal(fake.state.worker, false);
  assert.equal(fake.state.d1, null);
  assert.equal(fake.state.r2, null);
  assert.equal(fake.state.queues.has(DEDICATED_QUEUE), false);
  assert.deepEqual(
    fake.state.queues.get(SHARED_QUEUE).consumers.map((consumer) => consumer.script_name),
    ["unrelated-worker"],
  );
  const runtimeProofIndex = fake.calls.findIndex(({ path }) =>
    path.includes(`/d1/database/${D1_ID}/query`),
  );
  const firstDeleteIndex = fake.calls.findIndex(({ method }) => method === "DELETE");
  assert.notEqual(runtimeProofIndex, -1);
  assert.ok(runtimeProofIndex < firstDeleteIndex);
});

test("requires an explicit strict export waiver value before any provider request", async (t) => {
  for (const value of [undefined, null, 0, "TRUE", "yes"]) {
    await t.test(String(value), async () => {
      let requests = 0;
      await assert.rejects(
        decommissionManagedInstall(
          { ...contract(), exportWaived: value },
          {
            request: async () => {
              requests += 1;
              throw new Error("must not request");
            },
          },
        ),
        /export waiver must be explicitly true or false/,
      );
      assert.equal(requests, 0);
    });
  }
});

test("requires every retained-export input to be absent when export is waived", async (t) => {
  const evidence = contract();
  for (const field of [
    "exportOperationId",
    "exportKeyVersion",
    "exportObjectKey",
    "exportSha256",
    "exportMd5",
    "exportEtag",
    "exportSizeBytes",
    "exportHead",
  ]) {
    await t.test(field, async () => {
      let requests = 0;
      await assert.rejects(
        decommissionManagedInstall(
          { ...waivedContract(), [field]: evidence[field] },
          {
            request: async () => {
              requests += 1;
              throw new Error("must not request");
            },
          },
        ),
        /resource contract is invalid|retained export inputs must be empty/,
      );
      assert.equal(requests, 0);
    });
  }
});

test("ordinary decommission still requires every retained-export proof", async (t) => {
  for (const field of [
    "exportOperationId",
    "exportKeyVersion",
    "exportObjectKey",
    "exportSha256",
    "exportMd5",
    "exportEtag",
    "exportSizeBytes",
    "exportHead",
  ]) {
    await t.test(field, async () => {
      let requests = 0;
      await assert.rejects(
        decommissionManagedInstall(
          { ...contract(), [field]: undefined },
          {
            request: async () => {
              requests += 1;
              throw new Error("must not request");
            },
          },
        ),
        /resource contract is invalid|verified retained export evidence is required/,
      );
      assert.equal(requests, 0);
    });
  }
});

test("refuses waived decommission when source R2 is not proven empty", async () => {
  let requests = 0;
  await assert.rejects(
    decommissionManagedInstall(
      {
        ...waivedContract(),
        r2EmptyListing: {
          IsTruncated: false,
          Contents: [{ Key: "still-present", Size: 1, ETag: '"etag"' }],
        },
      },
      {
        request: async () => {
          requests += 1;
          throw new Error("must not request");
        },
      },
    ),
    /verifiably empty/,
  );
  assert.equal(requests, 0);
});

test("refuses waived decommission until runtime purge is persisted", async () => {
  const fake = createCloudflareFixture();
  fake.state.lifecycle.credentials_revoked_at = null;
  await assert.rejects(
    decommissionManagedInstall(waivedContract(), { request: fake.request }),
    /persisted runtime termination is required/,
  );
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
  assert.notEqual(fake.state.worker, false);
  assert.notEqual(fake.state.d1, null);
  assert.notEqual(fake.state.r2, null);
});

test("refuses waived Worker deletion when its runtime proof database is missing", async () => {
  const fake = createCloudflareFixture();
  fake.state.d1 = null;
  await assert.rejects(
    decommissionManagedInstall(waivedContract(), { request: fake.request }),
    /runtime termination proof is unavailable/,
  );
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
  assert.equal(fake.state.worker, true);
  assert.notEqual(fake.state.r2, null);
});

test("refuses a mismatched exact manifest before waived decommission deletes anything", async () => {
  const fake = createCloudflareFixture();
  fake.state.namespaces[0].script = "unrelated-worker";
  await assert.rejects(
    decommissionManagedInstall(waivedContract(), { request: fake.request }),
    /Durable Object namespace identity does not match/,
  );
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
  assert.equal(fake.state.worker, true);
  assert.notEqual(fake.state.d1, null);
  assert.notEqual(fake.state.r2, null);
});

test("performs no provider deletion when final control-plane authorization is rejected", async () => {
  const fake = createCloudflareFixture();
  await assert.rejects(
    decommissionManagedInstall(contract(), {
      request: fake.request,
      reportStage: async (stage) => {
        assert.equal(stage, "deleting_r2");
        throw new Error("terminal authorization rejected");
      },
    }),
    /terminal authorization rejected/,
  );
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
  assert.notEqual(fake.state.r2, null);
  assert.notEqual(fake.state.d1, null);
});

test("fails closed when a shared queue consumer listing is incomplete", async () => {
  const fake = createCloudflareFixture();
  const incompleteRequest = async (url, init = {}) => {
    const parsed = new URL(url);
    const response = await fake.request(url, init);
    if (
      (init.method || "GET") === "GET" &&
      parsed.pathname.endsWith("/queues/shared-id/consumers")
    ) {
      const body = await response.json();
      return success(body.result.slice(0, 1));
    }
    return response;
  };

  await assert.rejects(
    decommissionManagedInstall(contract(), { request: incompleteRequest }),
    /shared queue consumer listing is incomplete/,
  );
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
  assert.notEqual(fake.state.r2, null);
});

test("retries safely after every destructive stage has already taken effect", async (t) => {
  const stages = ["r2", "consumer", "queue", "tombstone", "worker", "d1"];
  for (const interruptedAfter of stages) {
    await t.test(interruptedAfter, async () => {
      const fake = createCloudflareFixture();
      let injected = false;
      const deployTombstone = async () => {
        fake.state.namespaces = [];
        if (interruptedAfter === "tombstone" && !injected) {
          injected = true;
          throw new Error("simulated interruption after tombstone deployment");
        }
      };
      const flakyRequest = async (url, init = {}) => {
        const response = await fake.request(url, init);
        const path = new URL(url).pathname;
        const method = init.method || "GET";
        const matched =
          (interruptedAfter === "r2" && method === "DELETE" && path.includes("/r2/buckets/")) ||
          (interruptedAfter === "consumer" && method === "DELETE" && path.includes("/consumers/")) ||
          (interruptedAfter === "queue" && method === "DELETE" && /\/queues\/[^/]+$/.test(path)) ||
          (interruptedAfter === "worker" && method === "DELETE" && path.includes("/workers/scripts/")) ||
          (interruptedAfter === "d1" && method === "DELETE" && path.includes("/d1/database/"));
        if (matched && !injected) {
          injected = true;
          throw new Error(`simulated interruption after ${interruptedAfter}`);
        }
        return response;
      };

      await assert.rejects(
        decommissionManagedInstall(contract(), {
          request: flakyRequest,
          deployTombstone,
        }),
        /simulated interruption/,
      );
      assert.equal(injected, true);
      const retried = await decommissionManagedInstall(contract(), {
        request: fake.request,
        deployTombstone: async () => {
          fake.state.namespaces = [];
        },
      });
      assert.equal(retried.ok, true);
      assert.equal(fake.state.worker, false);
      assert.equal(fake.state.d1, null);
      assert.equal(fake.state.r2, null);
    });
  }
});

test("does not continue after Worker loss without persisted runtime termination proof", async () => {
  const fake = createCloudflareFixture();
  fake.state.worker = false;
  fake.state.lifecycle.storage_purged_at = null;
  await assert.rejects(
    decommissionManagedInstall(contract(), { request: fake.request }),
    /persisted runtime termination is required/,
  );
  assert.notEqual(fake.state.d1, null);
  assert.notEqual(fake.state.r2, null);
});

function contract() {
  return {
    accountId: ACCOUNT_ID,
    apiToken: "cloudflare-api-token",
    installationId: INSTALLATION_ID,
    operationId: OPERATION_ID,
    exportWaived: false,
    exportOperationId: EXPORT_OPERATION_ID,
    exportKeyVersion: "v1",
    workerName: WORKER_NAME,
    d1Name: `${WORKER_NAME}-d1`,
    d1Id: D1_ID,
    r2Name: `${WORKER_NAME}-r2`,
    queueNames: [DEDICATED_QUEUE, SHARED_QUEUE],
    durableObjectNamespaceId: DO_ID,
    exportObjectKey:
      `managed-exports/${INSTALLATION_ID}/${EXPORT_OPERATION_ID}.me3-managed-export-v1.enc`,
    exportSha256: SHA256,
    exportMd5: MD5,
    exportEtag: MD5,
    exportSizeBytes: 42,
    exportHead: {
      ContentLength: 42,
      ETag: `"${MD5}"`,
      Metadata: {
        sha256: SHA256,
        md5: MD5,
        format: "me3-managed-export-v1",
        installation: INSTALLATION_ID,
        operation: EXPORT_OPERATION_ID,
        keyversion: "v1",
      },
    },
    r2EmptyListing: { IsTruncated: false, Contents: [] },
  };
}

function waivedContract() {
  const input = contract();
  input.exportWaived = true;
  delete input.exportOperationId;
  delete input.exportKeyVersion;
  delete input.exportObjectKey;
  delete input.exportSha256;
  delete input.exportMd5;
  delete input.exportEtag;
  delete input.exportSizeBytes;
  delete input.exportHead;
  return input;
}

function createCloudflareFixture() {
  const state = {
    worker: true,
    d1: { uuid: D1_ID, name: `${WORKER_NAME}-d1` },
    r2: { name: `${WORKER_NAME}-r2` },
    namespaces: [{ id: DO_ID, script: WORKER_NAME, class: "Me3UserAgent" }],
    lifecycle: {
      state: "suspended",
      credentials_revoked_at: "2026-07-18T12:00:00Z",
      storage_purged_at: "2026-07-18T12:01:00Z",
    },
    queues: new Map([
      [
        DEDICATED_QUEUE,
        {
          queue_id: "dedicated-id",
          queue_name: DEDICATED_QUEUE,
          consumers: [
            {
              consumer_id: "dedicated-managed-consumer",
              type: "worker",
              script_name: WORKER_NAME,
            },
          ],
        },
      ],
      [
        SHARED_QUEUE,
        {
          queue_id: "shared-id",
          queue_name: SHARED_QUEUE,
          consumers: [
            {
              consumer_id: "shared-managed-consumer",
              type: "worker",
              script_name: WORKER_NAME,
            },
            {
              consumer_id: "shared-unrelated-consumer",
              type: "worker",
              script_name: "unrelated-worker",
            },
          ],
        },
      ],
    ]),
  };
  const calls = [];
  const request = async (url, init = {}) => {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const method = init.method || "GET";
    calls.push({ method, path });
    const prefix = `/client/v4/accounts/${ACCOUNT_ID}`;
    assert.equal(parsed.pathname.startsWith(prefix), true, parsed.pathname);
    const resource = parsed.pathname.slice(prefix.length);

    if (resource === `/d1/database/${D1_ID}/query` && method === "POST") {
      return success([
        {
          results: [state.lifecycle],
        },
      ]);
    }
    if (resource === `/d1/database/${D1_ID}`) {
      if (method === "DELETE") state.d1 = null;
      return state.d1 ? success(state.d1) : missing();
    }
    if (resource === `/r2/buckets/${WORKER_NAME}-r2`) {
      if (method === "DELETE") state.r2 = null;
      return state.r2 ? success(state.r2) : missing();
    }
    if (resource === "/queues" && method === "GET") {
      const queue = state.queues.get(parsed.searchParams.get("name"));
      return success(queue ? [publicQueue(queue)] : []);
    }
    const consumerList = /^\/queues\/([^/]+)\/consumers$/.exec(resource);
    if (consumerList && method === "GET") {
      const queue = queueById(state, consumerList[1]);
      return queue ? success(queue.consumers) : missing();
    }
    const consumerDelete = /^\/queues\/([^/]+)\/consumers\/([^/]+)$/.exec(resource);
    if (consumerDelete && method === "DELETE") {
      const queue = queueById(state, consumerDelete[1]);
      if (!queue) return missing();
      queue.consumers = queue.consumers.filter(
        (consumer) => consumer.consumer_id !== consumerDelete[2],
      );
      return success(null);
    }
    const queueDelete = /^\/queues\/([^/]+)$/.exec(resource);
    if (queueDelete && method === "DELETE") {
      const queue = queueById(state, queueDelete[1]);
      if (!queue) return missing();
      state.queues.delete(queue.queue_name);
      return success(null);
    }
    if (resource === "/workers/durable_objects/namespaces" && method === "GET") {
      return success(state.namespaces);
    }
    if (resource === `/workers/scripts/${WORKER_NAME}`) {
      if (method === "DELETE") state.worker = false;
      return state.worker
        ? new Response("worker module", { status: 200, headers: { "Content-Type": "text/plain" } })
        : missing();
    }
    throw new Error(`unexpected Cloudflare fixture request: ${method} ${resource}`);
  };
  return { state, calls, request };
}

function queueById(state, id) {
  return [...state.queues.values()].find((queue) => queue.queue_id === id) || null;
}

function publicQueue(queue) {
  return {
    queue_id: queue.queue_id,
    queue_name: queue.queue_name,
    consumers_total_count: queue.consumers.length,
  };
}

function success(result) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function missing() {
  return new Response(JSON.stringify({ success: false }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
