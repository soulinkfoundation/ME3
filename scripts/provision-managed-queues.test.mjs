import assert from "node:assert/strict";
import test from "node:test";
import { provisionManagedQueues } from "./provision-managed-queues.mjs";

test("creates and verifies only installation-isolated queues idempotently", () => {
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
      if (args[0] === "queues" && args[1] === "create" && args[2].endsWith("-dlq")) {
        return { ok: false, output: "Queue already exists" };
      }
      return { ok: true, output: "ok" };
    },
  });
  assert.deepEqual(result, [...queueNames].sort());
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call[1]), ["create", "info", "create", "info"]);

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
