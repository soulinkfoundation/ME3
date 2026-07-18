import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { sendManagedInstallWorkflowCallback } from "./managed-install-workflow-callback.mjs";

const rootDir = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(
  path.join(rootDir, ".github/workflows/provision-managed-install.yml"),
  "utf8",
);
const callbackEnv = {
  ME3_MANAGED_CALLBACK_URL:
    "https://api.me3.app/api/managed-install/provisioning/callback",
  ME3_MANAGED_CALLBACK_SECRET: "test-callback-secret",
  ME3_MANAGED_INSTALLATION_ID: "mi-1234567890abcdef",
  ME3_MANAGED_STATUS: "ready",
  ME3_MANAGED_ORIGIN:
    "https://me3-mi-1234567890abcdef.managed-test.workers.dev",
  ME3_MANAGED_D1_ID: "11111111-1111-4111-8111-111111111111",
  ME3_MANAGED_QUEUE_NAMES:
    '["me3-mi-1234567890abcdef-assistant-job-events"]',
  ME3_MANAGED_DO_NAMESPACE_ID: "a".repeat(32),
};

test("a rejected activation callback fails without exposing its response or secret", async () => {
  let requestBody;

  await assert.rejects(
    sendManagedInstallWorkflowCallback(callbackEnv, async (_url, init) => {
      assert.equal(init.headers.Authorization, "Bearer test-callback-secret");
      requestBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ ok: false, errorCode: "activation_failed" }),
        { status: 409 },
      );
    }),
    (error) => {
      assert.equal(error.message, "managed callback returned 409");
      assert.doesNotMatch(error.message, /activation_failed|test-callback-secret/);
      return true;
    },
  );

  assert.deepEqual(requestBody, {
    installationId: "mi-1234567890abcdef",
    status: "ready",
    origin: "https://me3-mi-1234567890abcdef.managed-test.workers.dev",
    d1Id: "11111111-1111-4111-8111-111111111111",
    queueNames: ["me3-mi-1234567890abcdef-assistant-job-events"],
    durableObjectNamespaceId: "a".repeat(32),
  });
});

test("ready cannot activate without every immutable resource identifier", async () => {
  await assert.rejects(
    sendManagedInstallWorkflowCallback(
      { ...callbackEnv, ME3_MANAGED_DO_NAMESPACE_ID: "" },
      async () => new Response(null, { status: 204 }),
    ),
    /complete resource manifest/,
  );
});

test("a failure callback carries exact recovered Worker deployment proof", async () => {
  let requestBody;
  await sendManagedInstallWorkflowCallback(
    {
      ...callbackEnv,
      ME3_MANAGED_STATUS: "failed",
      ME3_MANAGED_WORKER_PRESENT: "true",
      ME3_MANAGED_WORKER_PUBLIC: "false",
      ME3_MANAGED_ORIGIN: "",
    },
    async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    },
  );

  assert.equal(requestBody.workerPresent, true);
  assert.equal(requestBody.workerPublic, false);
  assert.equal(Object.hasOwn(requestBody, "origin"), false);

  await assert.rejects(
    sendManagedInstallWorkflowCallback(
      {
        ...callbackEnv,
        ME3_MANAGED_STATUS: "failed",
        ME3_MANAGED_WORKER_PRESENT: "false",
        ME3_MANAGED_WORKER_PUBLIC: "true",
        ME3_MANAGED_ORIGIN: "",
      },
      async () => new Response(null, { status: 204 }),
    ),
    /resource manifest is invalid/,
  );
  await assert.rejects(
    sendManagedInstallWorkflowCallback(
      {
        ...callbackEnv,
        ME3_MANAGED_STATUS: "failed",
        ME3_MANAGED_WORKER_PRESENT: "true",
        ME3_MANAGED_WORKER_PUBLIC: "true",
        ME3_MANAGED_ORIGIN: "https://unrelated.example",
      },
      async () => new Response(null, { status: 204 }),
    ),
    /resource manifest is invalid/,
  );
});

test("the workflow treats activation as a gate and reports only a generic follow-up failure", () => {
  const activation = getStep("Activate through ME3 Cloud");
  const failure = getStep("Report a safe failure");

  assert.match(activation, /ME3_MANAGED_STATUS: ready/);
  assert.match(
    activation,
    /run: node control\/scripts\/managed-install-workflow-callback\.mjs/,
  );
  assert.doesNotMatch(activation, /continue-on-error:\s*true/);
  assert.match(failure, /if: failure\(\)/);
  assert.match(failure, /ME3_MANAGED_STATUS: failed/);
  assert.match(failure, /ME3_MANAGED_ERROR_CODE: workflow_failed/);
  assert.ok(workflow.indexOf(activation) < workflow.indexOf(failure));
});

test("the workflow provisions the managed email install identity and HTTPS gateway origin", () => {
  assert.match(
    workflow,
    /ME3_MANAGED_EMAIL_GATEWAY_ORIGIN: https:\/\/api\.me3\.app/,
  );
  const configureCalls = workflow.match(/configure-managed-install\.mjs[^\n]+/g) || [];
  assert.equal(configureCalls.length, 2);
  for (const call of configureCalls) {
    assert.match(call, /"\$ME3_MANAGED_INSTALLATION_ID"/);
    assert.match(call, /"\$ME3_MANAGED_EMAIL_GATEWAY_ORIGIN"/);
  }
});

test("the workflow waits for a newly published managed origin to become routable", () => {
  const verification = getStep("Verify the real managed origin");
  const requests = verification.match(/^\s+curl [^\n]+$/gm) || [];

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.match(request, /--retry 15/);
    assert.match(request, /--retry-delay 2/);
    assert.match(request, /--retry-max-time 60/);
    assert.match(request, /--retry-all-errors/);
    assert.match(request, /--connect-timeout 10/);
  }
  assert.match(requests[0], /\/health/);
  assert.match(requests[1], /\/api\/mobile\/config/);
});

test("the workflow recovers authoritative Worker proof before a failure callback", () => {
  const publish = getStep("Publish the managed Worker");
  const recovery = getStep("Recover every known resource identifier");
  const failure = getStep("Report a safe failure");

  assert.match(recovery, /if: always\(\)/);
  assert.match(recovery, /recover-managed-provision-manifest\.mjs/);
  assert.ok(workflow.indexOf(publish) < workflow.indexOf(recovery));
  assert.ok(workflow.indexOf(recovery) < workflow.indexOf(failure));
});

function getStep(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const end = workflow.indexOf("\n      - name: ", start + 1);
  return workflow.slice(start, end === -1 ? undefined : end);
}
