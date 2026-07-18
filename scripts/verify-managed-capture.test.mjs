import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyManagedCapture } from "./verify-managed-capture.mjs";

test("accepts only a drained D1 barrier and independently identical R2 bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "me3-managed-capture-test-"));
  const database = join(root, "source.sqlite");
  const objects = join(root, "r2");
  mkdirSync(join(objects, "nested"), { recursive: true });
  writeFileSync(join(objects, "one.txt"), "one");
  writeFileSync(join(objects, "nested", "two.txt"), "second");
  const verificationObjects = join(root, "r2-verification");
  cpSync(objects, verificationObjects, { recursive: true });
  runSqlite(
    database,
    `CREATE TABLE managed_runtime_state (
       id TEXT PRIMARY KEY, installation_id TEXT, state TEXT, storage_purged_at TEXT
     );
     CREATE TABLE managed_runtime_write_leases (lease_id TEXT PRIMARY KEY);
     INSERT INTO managed_runtime_state VALUES
       ('managed', 'mi-1234567890abcdef', 'quiesced', NULL);`,
  );
  const listing = {
    IsTruncated: false,
    Contents: [
      { Key: "nested/two.txt", Size: 6, ETag: '"etag-two"' },
      { Key: "one.txt", Size: 3, ETag: '"etag-one"' },
    ],
  };

  try {
    assert.deepEqual(
      await verifyManagedCapture({
        database,
        r2Before: listing,
        r2After: structuredClone(listing),
        r2Directory: objects,
        r2VerificationDirectory: verificationObjects,
        installationId: "mi-1234567890abcdef",
      }),
      {
        ok: true,
        installationId: "mi-1234567890abcdef",
        runtimeState: "quiesced",
        activeWrites: 0,
        r2Objects: 2,
        r2Bytes: 9,
        r2ListingSha256:
          "12b2f7c673a93e18ca9c4566ab5d176462d59c645148f429bcab7a623e59e1b2",
      },
    );
    await assert.rejects(
      () =>
        verifyManagedCapture({
          database,
          r2Before: listing,
          r2After: { ...listing, Contents: listing.Contents.slice(1) },
          r2Directory: objects,
          r2VerificationDirectory: verificationObjects,
          installationId: "mi-1234567890abcdef",
        }),
      /changed during capture/,
    );
    runSqlite(
      database,
      "INSERT INTO managed_runtime_write_leases VALUES ('still-writing');",
    );
    await assert.rejects(
      () =>
        verifyManagedCapture({
          database,
          r2Before: listing,
          r2After: listing,
          r2Directory: objects,
          r2VerificationDirectory: verificationObjects,
          installationId: "mi-1234567890abcdef",
        }),
      /active write leases/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function runSqlite(database, sql) {
  const result = spawnSync("sqlite3", [database], { input: `.bail on\n${sql}\n`, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
