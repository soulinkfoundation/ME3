import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  retainManagedExport,
  verifyManagedRetainedExport,
} from "./managed-retained-export.mjs";

const IDENTITY = {
  endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
  bucket: "managed-retention",
  installationId: "mi-1234567890abcdef",
  exportOperationId: "11111111-1111-4111-8111-111111111111",
  exportKeyVersion: "v1",
  objectKey:
    "managed-exports/mi-1234567890abcdef/11111111-1111-4111-8111-111111111111.me3-managed-export-v1.enc",
};

test("uses write-once Content-MD5 and independently hashes retained downloads", async () => {
  const root = mkdtempSync(join(tmpdir(), "me3-retained-export-test-"));
  const first = join(root, "first.enc");
  const second = join(root, "second.enc");
  writeFileSync(first, "first immutable managed export bytes");
  writeFileSync(second, "different retry bytes must never overwrite");
  const fake = createFakeS3(root);
  let envelopeVerifications = 0;

  try {
    const retained = await retainManagedExport(
      {
        ...IDENTITY,
        file: first,
        verificationFile: join(root, "download-one.enc"),
        verifyEnvelope: async (path) => {
          envelopeVerifications += 1;
          assert.equal(readFileSync(path, "utf8"), readFileSync(first, "utf8"));
        },
      },
      { run: fake.run },
    );
    assert.equal(retained.sha256, digest(first, "sha256"));
    assert.equal(retained.md5, digest(first, "md5"));
    assert.equal(retained.etag, retained.md5);
    assert.equal(retained.sizeBytes, statSync(first).size);
    assert.equal(envelopeVerifications, 1);
    assert.equal(fake.puts, 1);
    assert.equal(fake.gets, 1);
    assert.equal(fake.putArgs.includes("--if-none-match"), true);
    assert.equal(fake.putArgs[fake.putArgs.indexOf("--if-none-match") + 1], "*");
    assert.equal(
      fake.putArgs[fake.putArgs.indexOf("--content-md5") + 1],
      Buffer.from(retained.md5, "hex").toString("base64"),
    );

    const retried = await retainManagedExport(
      {
        ...IDENTITY,
        file: second,
        verificationFile: join(root, "download-two.enc"),
        verifyEnvelope: async (path) => {
          envelopeVerifications += 1;
          assert.equal(readFileSync(path, "utf8"), readFileSync(first, "utf8"));
        },
      },
      { run: fake.run },
    );
    assert.deepEqual(retried, retained);
    assert.equal(fake.puts, 2);
    assert.equal(fake.preconditionFailures, 1);
    assert.equal(envelopeVerifications, 2);
    assert.equal(readFileSync(fake.objectPath, "utf8"), readFileSync(first, "utf8"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects and removes a retained download whose full SHA-256 differs", async () => {
  const root = mkdtempSync(join(tmpdir(), "me3-retained-corruption-test-"));
  const source = join(root, "source.enc");
  writeFileSync(source, "authentic retained bytes");
  const fake = createFakeS3(root);
  let retained;
  try {
    retained = await retainManagedExport(
      {
        ...IDENTITY,
        file: source,
        verificationFile: join(root, "initial-download.enc"),
      },
      { run: fake.run },
    );
    fake.corruptDownloads = true;
    const verificationFile = join(root, "corrupt-download.enc");
    await assert.rejects(
      verifyManagedRetainedExport(
        {
          ...IDENTITY,
          ...retained,
          verificationFile,
        },
        { run: fake.run },
      ),
      /downloaded bytes do not match evidence/,
    );
    assert.equal(existsSync(verificationFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createFakeS3(root) {
  const state = {
    objectPath: join(root, "stored-object.enc"),
    head: null,
    puts: 0,
    gets: 0,
    preconditionFailures: 0,
    putArgs: [],
    corruptDownloads: false,
  };
  state.run = (args) => {
    const command = args[1];
    if (command === "put-object") {
      state.puts += 1;
      state.putArgs = [...args];
      if (state.head) {
        state.preconditionFailures += 1;
        return { ok: false, preconditionFailed: true, stdout: "" };
      }
      const body = option(args, "--body");
      const metadata = Object.fromEntries(
        option(args, "--metadata").split(",").map((entry) => entry.split("=")),
      );
      copyFileSync(body, state.objectPath);
      state.head = {
        ContentLength: statSync(body).size,
        ETag: `"${metadata.md5}"`,
        Metadata: metadata,
      };
      return { ok: true, preconditionFailed: false, stdout: "{}" };
    }
    if (command === "head-object") {
      return state.head
        ? { ok: true, stdout: JSON.stringify(state.head), preconditionFailed: false }
        : { ok: false, stdout: "", preconditionFailed: false };
    }
    if (command === "get-object") {
      state.gets += 1;
      const destination = args.at(-1);
      if (state.corruptDownloads) writeFileSync(destination, "corrupt retained bytes");
      else copyFileSync(state.objectPath, destination);
      return { ok: true, stdout: "{}", preconditionFailed: false };
    }
    throw new Error(`unexpected fake AWS command: ${args.join(" ")}`);
  };
  return state;
}

function option(args, name) {
  const index = args.indexOf(name);
  assert.notEqual(index, -1, `${name} is required`);
  return args[index + 1];
}

function digest(path, algorithm) {
  return createHash(algorithm).update(readFileSync(path)).digest("hex");
}
