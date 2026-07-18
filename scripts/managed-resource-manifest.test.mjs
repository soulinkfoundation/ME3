import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readManagedResourceManifest } from "./managed-resource-manifest.mjs";

test("extracts only the exact isolated managed resource manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "me3-managed-manifest-"));
  const configPath = join(root, "wrangler.toml");
  writeFileSync(
    configPath,
    [
      'name = "me3-mi-1234567890abcdef"',
      "[vars]",
      'ME3_DEPLOYMENT_MODE = "managed"',
      'ME3_MANAGED_INSTALLATION_ID = "mi-1234567890abcdef"',
      "[[durable_objects.bindings]]",
      'name = "ME3_USER_AGENT"',
      'class_name = "Me3UserAgent"',
      "[[d1_databases]]",
      'binding = "DB"',
      'database_name = "me3-mi-1234567890abcdef-d1"',
      'database_id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"',
      "[[r2_buckets]]",
      'binding = "SITE_ASSETS"',
      'bucket_name = "me3-mi-1234567890abcdef-r2"',
      "[[queues.producers]]",
      'binding = "SOCIAL_PUBLISH_QUEUE"',
      'queue = "me3-mi-1234567890abcdef-social-publish"',
      "[[queues.consumers]]",
      'queue = "me3-mi-1234567890abcdef-social-publish"',
      'dead_letter_queue = "me3-mi-1234567890abcdef-social-publish-dlq"',
      "",
    ].join("\n"),
  );

  try {
    assert.deepEqual(
      readManagedResourceManifest({
        configPath,
        installationId: "mi-1234567890abcdef",
        workerName: "me3-mi-1234567890abcdef",
        d1Name: "me3-mi-1234567890abcdef-d1",
        r2Name: "me3-mi-1234567890abcdef-r2",
      }),
      {
        installationId: "mi-1234567890abcdef",
        workerName: "me3-mi-1234567890abcdef",
        d1Name: "me3-mi-1234567890abcdef-d1",
        d1Id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        r2Name: "me3-mi-1234567890abcdef-r2",
        queueNames: [
          "me3-mi-1234567890abcdef-social-publish",
          "me3-mi-1234567890abcdef-social-publish-dlq",
        ],
        durableObjectClassName: "Me3UserAgent",
      },
    );
    const unsafe = readFileSync(configPath, "utf8").replace(
      /me3-mi-1234567890abcdef-social-publish/g,
      "me3-social-publish",
    );
    writeFileSync(configPath, unsafe);
    assert.throws(
      () =>
        readManagedResourceManifest({
          configPath,
          installationId: "mi-1234567890abcdef",
          workerName: "me3-mi-1234567890abcdef",
          d1Name: "me3-mi-1234567890abcdef-d1",
          r2Name: "me3-mi-1234567890abcdef-r2",
        }),
      /not installation-isolated/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
