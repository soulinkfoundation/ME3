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
  });
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

function getStep(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const end = workflow.indexOf("\n      - name: ", start + 1);
  return workflow.slice(start, end === -1 ? undefined : end);
}
