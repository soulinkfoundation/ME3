import assert from "node:assert/strict";
import test from "node:test";
import { inspectManagedDecommissionState } from "./inspect-managed-decommission-state.mjs";

const ACCOUNT_ID = "a".repeat(32);
const INSTALLATION_ID = "mi-1234567890abcdef";
const WORKER_NAME = `me3-${INSTALLATION_ID}`;
const D1_ID = "11111111-1111-4111-8111-111111111111";
const BASE = {
  accountId: ACCOUNT_ID,
  apiToken: "api-token",
  installationId: INSTALLATION_ID,
  workerName: WORKER_NAME,
  d1Name: `${WORKER_NAME}-d1`,
  d1Id: D1_ID,
  r2Name: `${WORKER_NAME}-r2`,
};

test("requires lifecycle control while the intact runtime is still present", async () => {
  const fixture = createFixture();
  assert.deepEqual(await inspectManagedDecommissionState(BASE, fixture.request), {
    ok: true,
    workerPresent: true,
    d1Present: true,
    r2Present: true,
    runtimeTerminated: false,
  });
  assert.equal(fixture.queryCount, 0);
});

test("recognizes a tombstone or absent Worker only from persisted terminal D1 evidence", async () => {
  for (const workerPresent of [true, false]) {
    const fixture = createFixture({
      workerPresent,
      r2Present: false,
      lifecycle: {
        state: "suspended",
        credentials_revoked_at: "2026-07-18T12:00:00Z",
        storage_purged_at: "2026-07-18T12:01:00Z",
      },
    });
    const inspected = await inspectManagedDecommissionState(BASE, fixture.request);
    assert.equal(inspected.runtimeTerminated, true);
    assert.equal(fixture.queryCount, 1);
  }

  const unsafe = createFixture({
    workerPresent: false,
    r2Present: false,
    lifecycle: {
      state: "suspended",
      credentials_revoked_at: "2026-07-18T12:00:00Z",
      storage_purged_at: null,
    },
  });
  await assert.rejects(
    inspectManagedDecommissionState(BASE, unsafe.request),
    /does not prove completed runtime termination/,
  );
});

test("never treats authorization or transient lookup failures as absence", async () => {
  await assert.rejects(
    inspectManagedDecommissionState(BASE, async () => json({ success: false }, 403)),
    /status 403/,
  );
});

function createFixture({
  workerPresent = true,
  d1Present = true,
  r2Present = true,
  lifecycle = null,
} = {}) {
  const fixture = { queryCount: 0 };
  fixture.request = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path.endsWith(`/workers/scripts/${WORKER_NAME}`)) {
      return workerPresent ? new Response("worker", { status: 200 }) : missing();
    }
    if (path.endsWith(`/d1/database/${D1_ID}/query`)) {
      fixture.queryCount += 1;
      assert.equal(init.method, "POST");
      return json({ success: true, result: [{ results: lifecycle ? [lifecycle] : [] }] });
    }
    if (path.endsWith(`/d1/database/${D1_ID}`)) {
      return d1Present
        ? json({ success: true, result: { uuid: D1_ID, name: `${WORKER_NAME}-d1` } })
        : missing();
    }
    if (path.endsWith(`/r2/buckets/${WORKER_NAME}-r2`)) {
      return r2Present
        ? json({ success: true, result: { name: `${WORKER_NAME}-r2` } })
        : missing();
    }
    throw new Error(`unexpected inspection request: ${path}`);
  };
  return fixture;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function missing() {
  return json({ success: false }, 404);
}
