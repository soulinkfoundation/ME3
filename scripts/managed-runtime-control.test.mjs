import assert from "node:assert/strict";
import test from "node:test";
import {
  ManagedRuntimeControlError,
  callManagedRuntimeControl,
} from "./managed-runtime-control.mjs";

const BASE = {
  installationId: "mi-1234567890abcdef",
  operationId: "11111111-1111-4111-8111-111111111111",
  attemptId: "22222222-2222-4222-8222-222222222222",
  callbackSecret: "lifecycle-secret",
  expectedReleaseTag: "v0.1.103",
};

test("binds attempt identity and a fresh request UUID through broker and exact runtime", async () => {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1 || calls.length === 3) {
      return jsonResponse({
        ok: true,
        origin: "https://me3-mi-1234567890abcdef.workers.dev",
        token: "header.payload.signature",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    return jsonResponse({
      ok: true,
      runtime:
        calls.length === 2
          ? runtimeStatus({ generation: 7 })
          : runtimeStatus({ state: "quiesced", generation: 8 }),
    });
  };

  const result = await callManagedRuntimeControl(
    { ...BASE, action: "quiesce" },
    request,
  );
  assert.equal(calls.length, 4);
  const statusBrokerBody = JSON.parse(calls[0].init.body);
  const brokerBody = JSON.parse(calls[2].init.body);
  const runtimeBody = JSON.parse(calls[3].init.body);
  assert.equal(statusBrokerBody.action, "status");
  assert.equal(Object.hasOwn(statusBrokerBody, "expectedGeneration"), false);
  assert.deepEqual(
    {
      installationId: brokerBody.installationId,
      operationId: brokerBody.operationId,
      attemptId: brokerBody.attemptId,
      action: brokerBody.action,
    },
    {
      installationId: BASE.installationId,
      operationId: BASE.operationId,
      attemptId: BASE.attemptId,
      action: "quiesce",
    },
  );
  assert.match(brokerBody.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(brokerBody.expectedGeneration, 7);
  assert.equal(runtimeBody.requestId, brokerBody.requestId);
  assert.equal(runtimeBody.expectedGeneration, 7);
  assert.equal(result.requestId, brokerBody.requestId);
  assert.equal(calls[2].init.headers.Authorization, "Bearer lifecycle-secret");
  assert.equal(calls[3].init.headers.Authorization, "Bearer header.payload.signature");
});

test("exposes a generation-fenced resume control", async () => {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1 || calls.length === 3) {
      return jsonResponse({
        ok: true,
        origin: "https://me3-mi-1234567890abcdef.workers.dev",
        token: "header.payload.signature",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    return jsonResponse({
      ok: true,
      runtime:
        calls.length === 2
          ? runtimeStatus({ state: "suspended", generation: 12 })
          : runtimeStatus({ state: "active", generation: 13 }),
    });
  };

  const result = await callManagedRuntimeControl(
    { ...BASE, action: "resume" },
    request,
  );
  const brokerBody = JSON.parse(calls[2].init.body);
  const runtimeBody = JSON.parse(calls[3].init.body);
  assert.equal(brokerBody.action, "resume");
  assert.equal(brokerBody.expectedGeneration, 12);
  assert.equal(runtimeBody.expectedGeneration, 12);
  assert.equal(result.runtime.state, "active");
  assert.equal(result.runtime.generation, 13);
});

test("classifies a legacy runtime without lifecycle route as upgrade-required", async () => {
  let calls = 0;
  await assert.rejects(
    callManagedRuntimeControl(
      { ...BASE, action: "status" },
      async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({
            ok: true,
            origin: "https://me3-mi-1234567890abcdef.workers.dev",
            token: "header.payload.signature",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
        }
        return jsonResponse({ ok: false, error: "Not found" }, 404);
      },
    ),
    (error) => {
      assert.equal(error instanceof ManagedRuntimeControlError, true);
      assert.equal(error.code, "runtime_upgrade_required");
      return true;
    },
  );
});

test("fails closed when runtime release does not match the immutable manifest", async () => {
  let calls = 0;
  await assert.rejects(
    callManagedRuntimeControl(
      { ...BASE, action: "status" },
      async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({
              ok: true,
              origin: "https://me3-mi-1234567890abcdef.workers.dev",
              token: "header.payload.signature",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            })
          : jsonResponse({
              ok: true,
              runtime: runtimeStatus({ releaseVersion: "0.1.102" }),
            });
      },
    ),
    (error) => {
      assert.equal(error.code, "runtime_release_mismatch");
      return true;
    },
  );
});

function runtimeStatus(overrides = {}) {
  return {
    installationId: BASE.installationId,
    lifecycleProtocol: "me3-managed-lifecycle-v2",
    portableExportPolicy: "me3-portable-v1-policy-1",
    releaseVersion: "0.1.103",
    state: "active",
    generation: 1,
    quiescedAt: null,
    suspendedAt: null,
    credentialsRevokedAt: null,
    storagePurgedAt: null,
    activeWrites: 0,
    exportReady: false,
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
