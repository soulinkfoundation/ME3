import assert from "node:assert/strict";
import test from "node:test";
import { provisionManagedQueues } from "./provision-managed-queues.mjs";

test("reuses existing installation-isolated queues without creating them", () => {
  const calls = [];
  const queueNames = [
    "me3-mi-1234567890abcdef-social-publish-dlq",
    "me3-mi-1234567890abcdef-social-publish",
  ];
  const result = provisionManagedQueues({
    queueNames,
    workerName: "me3-mi-1234567890abcdef",
    configPath: "wrangler.toml",
    run(args) {
      calls.push(args);
      return { ok: true, output: "ok" };
    },
  });
  assert.deepEqual(result, [...queueNames].sort());
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call[1]), ["info", "info"]);

  assert.throws(
    () =>
      provisionManagedQueues({
        queueNames: ["me3-social-publish"],
        workerName: "me3-mi-1234567890abcdef",
        configPath: "wrangler.toml",
        run: () => ({ ok: true, output: "" }),
      }),
    /manifest is invalid/,
  );
});

test("creates a missing queue and verifies the final Cloudflare state", () => {
  const calls = [];
  let infoCalls = 0;
  const result = provisionManagedQueues({
    queueNames: ["me3-mi-1234567890abcdef-social-publish"],
    workerName: "me3-mi-1234567890abcdef",
    configPath: "wrangler.toml",
    run(args) {
      calls.push(args);
      if (args[1] === "info") {
        infoCalls += 1;
        return { ok: infoCalls > 1, output: infoCalls > 1 ? "ok" : "not found" };
      }
      return { ok: true, output: "created" };
    },
  });

  assert.deepEqual(result, ["me3-mi-1234567890abcdef-social-publish"]);
  assert.deepEqual(calls.map((call) => call[1]), ["info", "create", "info"]);
});

test("accepts an existing queue when creation races or returns an unfamiliar error", () => {
  let infoCalls = 0;
  const result = provisionManagedQueues({
    queueNames: ["me3-mi-1234567890abcdef-social-publish"],
    workerName: "me3-mi-1234567890abcdef",
    configPath: "wrangler.toml",
    run(args) {
      if (args[1] === "info") {
        infoCalls += 1;
        return { ok: infoCalls > 1, output: "" };
      }
      return { ok: false, output: "A queue using this name is present" };
    },
  });

  assert.deepEqual(result, ["me3-mi-1234567890abcdef-social-publish"]);
});

test("fails safely when a queue is still unavailable after creation", () => {
  assert.throws(
    () =>
      provisionManagedQueues({
        queueNames: ["me3-mi-1234567890abcdef-social-publish"],
        workerName: "me3-mi-1234567890abcdef",
        configPath: "wrangler.toml",
        run: () => ({ ok: false, output: "unavailable" }),
      }),
    /managed queue provisioning failed/,
  );
});
