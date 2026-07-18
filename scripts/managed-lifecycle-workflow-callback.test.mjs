import assert from "node:assert/strict";
import test from "node:test";
import { sendManagedLifecycleWorkflowCallback } from "./managed-lifecycle-workflow-callback.mjs";

const base = {
  ME3_MANAGED_CALLBACK_URL: "https://api.me3.app/api/managed-install/lifecycle/callback",
  ME3_MANAGED_LIFECYCLE_CALLBACK_SECRET: "callback-secret",
  ME3_MANAGED_INSTALLATION_ID: "mi-1234567890abcdef",
  ME3_MANAGED_OPERATION_ID: "11111111-1111-4111-8111-111111111111",
  ME3_MANAGED_ATTEMPT_ID: "22222222-2222-4222-8222-222222222222",
};

test("sends export completion with attempt identity and exact retained metadata", async () => {
  let payload;
  await sendManagedLifecycleWorkflowCallback(
    {
      ...base,
      ME3_MANAGED_OPERATION: "export",
      ME3_MANAGED_STATUS: "succeeded",
      ME3_MANAGED_STAGE: "completed",
      ME3_MANAGED_EXPORT_OBJECT_KEY:
        "managed-exports/mi-1234567890abcdef/11111111-1111-4111-8111-111111111111.me3-managed-export-v1.enc",
      ME3_MANAGED_EXPORT_SHA256: "a".repeat(64),
      ME3_MANAGED_EXPORT_MD5: "b".repeat(32),
      ME3_MANAGED_EXPORT_ETAG: `"${"b".repeat(32)}"`,
      ME3_MANAGED_EXPORT_SIZE_BYTES: "42",
      ME3_MANAGED_EXPORT_KEY_VERSION: "v1",
    },
    async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(payload.attemptId, base.ME3_MANAGED_ATTEMPT_ID);
  assert.deepEqual(payload.export, {
    format: "me3-managed-export-v1",
    keyVersion: "v1",
    objectKey:
      "managed-exports/mi-1234567890abcdef/11111111-1111-4111-8111-111111111111.me3-managed-export-v1.enc",
    sha256: "a".repeat(64),
    md5: "b".repeat(32),
    etag: "b".repeat(32),
    sizeBytes: 42,
  });
});

test("only exact terminal stages can report success", async () => {
  const request = async () => new Response(null, { status: 204 });
  await sendManagedLifecycleWorkflowCallback(
    {
      ...base,
      ME3_MANAGED_OPERATION: "decommission",
      ME3_MANAGED_STATUS: "succeeded",
      ME3_MANAGED_STAGE: "verified_absent",
    },
    request,
  );
  await assert.rejects(
    sendManagedLifecycleWorkflowCallback(
      {
        ...base,
        ME3_MANAGED_OPERATION: "decommission",
        ME3_MANAGED_STATUS: "succeeded",
        ME3_MANAGED_STAGE: "completed",
      },
      request,
    ),
    /status transition is invalid/,
  );
  await assert.rejects(
    sendManagedLifecycleWorkflowCallback(
      {
        ...base,
        ME3_MANAGED_ATTEMPT_ID: "stale",
        ME3_MANAGED_OPERATION: "export",
        ME3_MANAGED_STATUS: "running",
        ME3_MANAGED_STAGE: "validating",
      },
      request,
    ),
    /configuration is invalid/,
  );

  let cleanupPayload;
  await sendManagedLifecycleWorkflowCallback(
    {
      ...base,
      ME3_MANAGED_OPERATION: "cleanup_failed_provision",
      ME3_MANAGED_STATUS: "running",
      ME3_MANAGED_STAGE: "deleting_failed_provision",
    },
    async (_url, init) => {
      cleanupPayload = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(cleanupPayload.operation, "cleanup_failed_provision");
  assert.equal(cleanupPayload.stage, "deleting_failed_provision");
  await sendManagedLifecycleWorkflowCallback(
    {
      ...base,
      ME3_MANAGED_OPERATION: "cleanup_failed_provision",
      ME3_MANAGED_STATUS: "succeeded",
      ME3_MANAGED_STAGE: "verified_absent",
    },
    request,
  );
});

test("reports an explicit lifecycle capability blocker for the current attempt", async () => {
  let payload;
  await sendManagedLifecycleWorkflowCallback(
    {
      ...base,
      ME3_MANAGED_OPERATION: "export",
      ME3_MANAGED_STATUS: "failed",
      ME3_MANAGED_STAGE: "validating",
      ME3_MANAGED_ERROR_CODE: "runtime_upgrade_required",
    },
    async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    },
  );
  assert.deepEqual(payload, {
    installationId: base.ME3_MANAGED_INSTALLATION_ID,
    operationId: base.ME3_MANAGED_OPERATION_ID,
    attemptId: base.ME3_MANAGED_ATTEMPT_ID,
    operation: "export",
    status: "failed",
    stage: "validating",
    errorCode: "runtime_upgrade_required",
  });
});

test("attests retained bytes before termination without leaking terminal evidence early", async () => {
  let payload;
  await sendManagedLifecycleWorkflowCallback(
    {
      ...base,
      ME3_MANAGED_OPERATION: "export",
      ME3_MANAGED_STATUS: "running",
      ME3_MANAGED_STAGE: "retention_reverified",
      ME3_MANAGED_EXPORT_OBJECT_KEY:
        "managed-exports/mi-1234567890abcdef/11111111-1111-4111-8111-111111111111.me3-managed-export-v1.enc",
      ME3_MANAGED_EXPORT_SHA256: "a".repeat(64),
      ME3_MANAGED_EXPORT_MD5: "b".repeat(32),
      ME3_MANAGED_EXPORT_ETAG: "b".repeat(32),
      ME3_MANAGED_EXPORT_SIZE_BYTES: "42",
      ME3_MANAGED_EXPORT_KEY_VERSION: "v1",
    },
    async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    },
  );
  assert.equal(payload.stage, "retention_reverified");
  assert.equal(Object.hasOwn(payload, "export"), false);
});
