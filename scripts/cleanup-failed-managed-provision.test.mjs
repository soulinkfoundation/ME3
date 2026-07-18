import assert from "node:assert/strict";
import test from "node:test";
import { cleanupFailedManagedProvision } from "./cleanup-failed-managed-provision.mjs";

const ACCOUNT_ID = "a".repeat(32);
const INSTALLATION_ID = "mi-1234567890abcdef";
const WORKER_NAME = `me3-${INSTALLATION_ID}`;
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const D1_ID = "22222222-2222-4222-8222-222222222222";
const DO_ID = "d".repeat(32);
const QUEUE_NAME = `${WORKER_NAME}-assistant-job-events`;

test("cleans an authorized never-public provision and verifies exact absence", async () => {
  const fake = createFixture();
  const events = [];
  const options = {
    request: fake.request,
    reportStage: async (stage) => events.push(`stage:${stage}`),
    emptyR2: async () => {
      events.push("delete:r2-objects");
      fake.state.r2Objects = [];
    },
    deployTombstone: async ({ workerName, operationId }) => {
      assert.equal(workerName, WORKER_NAME);
      assert.equal(operationId, OPERATION_ID);
      events.push("delete:do-namespace");
      fake.state.namespaces = [];
    },
  };

  const result = await cleanupFailedManagedProvision(contract(), options);
  assert.equal(result.ok, true);
  assert.equal(events[0], "stage:deleting_failed_provision");
  assert.ok(events.indexOf("stage:deleting_failed_provision") < events.indexOf("delete:r2-objects"));
  assert.equal(fake.state.worker, false);
  assert.equal(fake.state.d1, null);
  assert.equal(fake.state.r2, null);
  assert.equal(fake.state.queues.size, 0);
  assert.equal(fake.state.namespaces.length, 0);

  events.length = 0;
  const retried = await cleanupFailedManagedProvision(contract(), options);
  assert.equal(retried.ok, true);
  assert.equal(events[0], "stage:deleting_failed_provision");
});

test("rejects current workers.dev or preview exposure before authorization", async (t) => {
  for (const field of ["enabled", "previews_enabled"]) {
    await t.test(field, async () => {
      const fake = createFixture();
      fake.state.subdomain[field] = true;
      let authorized = false;
      let emptied = false;
      await assert.rejects(
        cleanupFailedManagedProvision(contract(), {
          request: fake.request,
          reportStage: async () => {
            authorized = true;
          },
          emptyR2: async () => {
            emptied = true;
          },
        }),
        /public route/,
      );
      assert.equal(authorized, false);
      assert.equal(emptied, false);
      assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
    });
  }
});

test("rejects attached routes and custom domains before authorization", async (t) => {
  for (const exposure of ["route", "domain"]) {
    await t.test(exposure, async () => {
      const fake = createFixture();
      if (exposure === "route") {
        fake.state.routes.push({
          id: "route-id",
          pattern: "example.com/*",
          script: WORKER_NAME,
        });
      } else {
        fake.state.domains.push({
          id: "domain-id",
          hostname: "example.com",
          service: WORKER_NAME,
        });
      }
      let authorized = false;
      let emptied = false;
      await assert.rejects(
        cleanupFailedManagedProvision(contract(), {
          request: fake.request,
          reportStage: async () => {
            authorized = true;
          },
          emptyR2: async () => {
            emptied = true;
          },
        }),
        /public route/,
      );
      assert.equal(authorized, false);
      assert.equal(emptied, false);
      assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
    });
  }
});

test("rechecks every public route surface after current-attempt authorization", async () => {
  const fake = createFixture();
  let emptied = false;
  await assert.rejects(
    cleanupFailedManagedProvision(contract(), {
      request: fake.request,
      reportStage: async (stage) => {
        assert.equal(stage, "deleting_failed_provision");
        fake.state.routes.push({
          id: "racing-route-id",
          pattern: "example.com/*",
          script: WORKER_NAME,
        });
      },
      emptyR2: async () => {
        emptied = true;
      },
    }),
    /public route/,
  );
  assert.equal(emptied, false);
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
});

test("does nothing destructive when current-attempt authorization is rejected", async () => {
  const fake = createFixture();
  let emptied = false;
  await assert.rejects(
    cleanupFailedManagedProvision(contract(), {
      request: fake.request,
      reportStage: async (stage) => {
        assert.equal(stage, "deleting_failed_provision");
        throw new Error("never-activated authorization rejected");
      },
      emptyR2: async () => {
        emptied = true;
      },
    }),
    /authorization rejected/,
  );
  assert.equal(emptied, false);
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
});

test("requires backend never-public evidence and isolated resource identities", async () => {
  let requests = 0;
  await assert.rejects(
    cleanupFailedManagedProvision(
      { ...contract(), workerEverPublic: true },
      {
        request: async () => {
          requests += 1;
          throw new Error("must not request");
        },
      },
    ),
    /contract is invalid/,
  );
  assert.equal(requests, 0);

  const fake = createFixture();
  fake.state.queues.get(QUEUE_NAME).consumers.push({
    consumer_id: "unrelated-consumer",
    type: "worker",
    script_name: "unrelated-worker",
  });
  await assert.rejects(
    cleanupFailedManagedProvision(contract(), { request: fake.request }),
    /consumer identity does not match/,
  );
  assert.equal(fake.calls.some(({ method }) => method === "DELETE"), false);
});

test("retries after R2 objects were emptied but the first attempt was interrupted", async () => {
  const fake = createFixture();
  let interrupted = false;
  await assert.rejects(
    cleanupFailedManagedProvision(contract(), {
      request: fake.request,
      reportStage: async () => {},
      emptyR2: async () => {
        fake.state.r2Objects = [];
        if (!interrupted) {
          interrupted = true;
          throw new Error("simulated interruption after object deletion");
        }
      },
    }),
    /simulated interruption/,
  );

  const result = await cleanupFailedManagedProvision(contract(), {
    request: fake.request,
    reportStage: async () => {},
    emptyR2: async () => {
      fake.state.r2Objects = [];
    },
    deployTombstone: async () => {
      fake.state.namespaces = [];
    },
  });
  assert.equal(result.ok, true);
});

function contract() {
  return {
    accountId: ACCOUNT_ID,
    apiToken: "cloudflare-api-token",
    installationId: INSTALLATION_ID,
    operationId: OPERATION_ID,
    workerEverPublic: false,
    workerName: WORKER_NAME,
    d1Name: `${WORKER_NAME}-d1`,
    d1Id: D1_ID,
    r2Name: `${WORKER_NAME}-r2`,
    queueNames: [QUEUE_NAME],
    durableObjectNamespaceId: DO_ID,
  };
}

function createFixture() {
  const state = {
    worker: true,
    subdomain: { enabled: false, previews_enabled: false },
    routes: [],
    domains: [],
    d1: { uuid: D1_ID, name: `${WORKER_NAME}-d1` },
    r2: { name: `${WORKER_NAME}-r2` },
    r2Objects: ["bootstrap.txt"],
    namespaces: [{ id: DO_ID, script: WORKER_NAME, class: "Me3UserAgent" }],
    queues: new Map([
      [
        QUEUE_NAME,
        {
          queue_id: "queue-id",
          queue_name: QUEUE_NAME,
          consumers: [
            {
              consumer_id: "managed-consumer",
              type: "worker",
              script_name: WORKER_NAME,
            },
          ],
        },
      ],
    ]),
  };
  const calls = [];
  const request = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method || "GET";
    const prefix = `/client/v4/accounts/${ACCOUNT_ID}`;
    assert.equal(parsed.pathname.startsWith(prefix), true);
    const resource = parsed.pathname.slice(prefix.length);
    calls.push({ method, resource });

    if (resource === `/workers/scripts/${WORKER_NAME}/subdomain` && method === "GET") {
      return success(state.subdomain);
    }
    if (resource === "/workers/scripts" && method === "GET") {
      return success(
        state.worker
          ? [{ id: WORKER_NAME, routes: structuredClone(state.routes) }]
          : [],
      );
    }
    if (resource === "/workers/domains" && method === "GET") {
      return success(
        state.domains.filter(
          (domain) => domain.service === parsed.searchParams.get("service"),
        ),
      );
    }
    if (resource === `/workers/scripts/${WORKER_NAME}`) {
      if (method === "DELETE") state.worker = false;
      return state.worker
        ? new Response("worker module", { status: 200 })
        : missing();
    }
    if (resource === `/d1/database/${D1_ID}`) {
      if (method === "DELETE") state.d1 = null;
      return state.d1 ? success(state.d1) : missing();
    }
    if (resource === "/d1/database" && method === "GET") {
      return success(state.d1 ? [state.d1] : []);
    }
    if (resource === `/r2/buckets/${WORKER_NAME}-r2`) {
      if (method === "DELETE") {
        assert.equal(state.r2Objects.length, 0);
        state.r2 = null;
      }
      return state.r2 ? success(state.r2) : missing();
    }
    if (resource === "/queues" && method === "GET") {
      const queue = state.queues.get(parsed.searchParams.get("name"));
      return success(
        queue
          ? [
              {
                queue_id: queue.queue_id,
                queue_name: queue.queue_name,
                consumers_total_count: queue.consumers.length,
              },
            ]
          : [],
      );
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
    throw new Error(`unexpected request: ${method} ${resource}`);
  };
  return { state, calls, request };
}

function queueById(state, id) {
  return [...state.queues.values()].find((queue) => queue.queue_id === id) || null;
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
