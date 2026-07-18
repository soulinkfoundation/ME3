import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createManagedExportEnvelope,
  deriveManagedExportPassphrase,
  resolveManagedExportMasterKey,
  verifyManagedExportEnvelope,
} from "./managed-export-envelope.mjs";

test("selects only an exact retained export-key version", () => {
  const v1 = "managed-export-v1-master-key-at-least-32-bytes";
  const v2 = "managed-export-v2-master-key-at-least-32-bytes";
  const keyring = JSON.stringify({ v1, v2 });
  assert.equal(resolveManagedExportMasterKey(keyring, "v1"), v1);
  assert.throws(() => resolveManagedExportMasterKey(keyring, "v3"), /key v3 is unavailable/);
  assert.throws(() => resolveManagedExportMasterKey(keyring, "current"), /version is invalid/);
});

test("wraps the complete portable-v1 directory without leaving owner plaintext in the artifact", async () => {
  const root = mkdtempSync(join(tmpdir(), "me3-managed-envelope-test-"));
  const archive = join(root, "source.me3-portable");
  const output = join(root, "export.me3-managed-export");
  const operationId = randomUUID();
  mkdirSync(join(archive, "data"), { recursive: true });
  writeFileSync(join(archive, "manifest.json"), '{"format":"me3-portable-v1"}\n');
  writeFileSync(join(archive, "data", "owner.txt"), "private-owner-payload-must-be-encrypted");
  const passphrase = deriveManagedExportPassphrase(
    "test-master-key-that-is-at-least-thirty-two-bytes-long",
    "mi-1234567890abcdef",
    operationId,
  );

  try {
    const created = await createManagedExportEnvelope({
      archive,
      output,
      passphrase,
      installationId: "mi-1234567890abcdef",
      operationId,
      keyVersion: "v1",
    });
    assert.equal(created.ok, true);
    assert.equal(created.installationId, "mi-1234567890abcdef");
    assert.equal(readFileSync(output).includes("private-owner-payload-must-be-encrypted"), false);
    assert.equal(
      (
        await verifyManagedExportEnvelope({
          envelope: output,
          passphrase,
          expectedInstallationId: "mi-1234567890abcdef",
          expectedOperationId: operationId,
          expectedKeyVersion: "v1",
        })
      ).ok,
      true,
    );

    const bytes = readFileSync(output);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(output, bytes);
    await assert.rejects(
      verifyManagedExportEnvelope({
        envelope: output,
        passphrase,
        expectedInstallationId: "mi-1234567890abcdef",
        expectedOperationId: operationId,
        expectedKeyVersion: "v1",
      }),
      /checksum|authenticate|Unsupported state/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
