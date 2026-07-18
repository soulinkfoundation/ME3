#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  createReadStream,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import {
  deriveManagedExportPassphrase,
  resolveManagedExportMasterKey,
  verifyManagedExportEnvelope,
} from "./managed-export-envelope.mjs";

const MAX_SINGLE_PART_BYTES = 5 * 1024 * 1024 * 1024;

export async function retainManagedExport(input, { run = runAws } = {}) {
  validateIdentity(input);
  if (!input.file || !existsSync(input.file) || !statSync(input.file).isFile()) {
    throw new Error("managed retained export file is missing");
  }
  const sizeBytes = statSync(input.file).size;
  if (sizeBytes <= 0 || sizeBytes > MAX_SINGLE_PART_BYTES) {
    throw new Error("managed retained export exceeds the safe single-part size limit");
  }
  const [sha256, md5] = await Promise.all([
    hashFile(input.file, "sha256"),
    hashFile(input.file, "md5"),
  ]);
  const contentMd5 = Buffer.from(md5, "hex").toString("base64");
  const put = run([
    "s3api",
    "put-object",
    "--endpoint-url",
    input.endpoint,
    "--bucket",
    input.bucket,
    "--key",
    input.objectKey,
    "--body",
    input.file,
    "--content-md5",
    contentMd5,
    "--if-none-match",
    "*",
    "--metadata",
    `sha256=${sha256},md5=${md5},format=me3-managed-export-v1,installation=${input.installationId},operation=${input.exportOperationId},keyversion=${input.exportKeyVersion}`,
  ]);
  if (!put.ok && !put.preconditionFailed) {
    throw new Error("managed retained export upload failed");
  }
  if (put.preconditionFailed) {
    const existing = readExistingEvidence(input, run);
    return verifyManagedRetainedExport({ ...input, ...existing }, { run });
  }
  return verifyManagedRetainedExport(
    { ...input, sha256, md5, etag: md5, sizeBytes },
    { run },
  );
}

export async function verifyManagedRetainedExport(input, { run = runAws } = {}) {
  validateIdentity(input);
  const sha256 = String(input.sha256 || "").toLowerCase();
  const md5 = String(input.md5 || "").toLowerCase();
  const etag = String(input.etag || "").replace(/^"|"$/g, "").toLowerCase();
  const sizeBytes = Number(input.sizeBytes);
  if (
    !/^[0-9a-f]{64}$/.test(sha256) ||
    !/^[0-9a-f]{32}$/.test(md5) ||
    etag !== md5 ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_SINGLE_PART_BYTES ||
    !input.verificationFile ||
    existsSync(input.verificationFile)
  ) {
    throw new Error("managed retained export evidence is invalid");
  }
  const headResult = run([
    "s3api",
    "head-object",
    "--endpoint-url",
    input.endpoint,
    "--bucket",
    input.bucket,
    "--key",
    input.objectKey,
  ]);
  if (!headResult.ok) throw new Error("managed retained export HEAD failed");
  const head = JSON.parse(headResult.stdout);
  if (
    Number(head.ContentLength) !== sizeBytes ||
    String(head.ETag || "").replace(/^"|"$/g, "").toLowerCase() !== etag ||
    head.Metadata?.sha256 !== sha256 ||
    head.Metadata?.md5 !== md5 ||
    head.Metadata?.format !== "me3-managed-export-v1" ||
    head.Metadata?.installation !== input.installationId ||
    head.Metadata?.operation !== input.exportOperationId ||
    head.Metadata?.keyversion !== input.exportKeyVersion
  ) {
    throw new Error("managed retained export HEAD identity is invalid");
  }
  const downloaded = run([
    "s3api",
    "get-object",
    "--endpoint-url",
    input.endpoint,
    "--bucket",
    input.bucket,
    "--key",
    input.objectKey,
    input.verificationFile,
  ]);
  if (!downloaded.ok || !existsSync(input.verificationFile)) {
    throw new Error("managed retained export verification download failed");
  }
  try {
    if (
      statSync(input.verificationFile).size !== sizeBytes ||
      (await hashFile(input.verificationFile, "sha256")) !== sha256 ||
      (await hashFile(input.verificationFile, "md5")) !== md5
    ) {
      throw new Error("managed retained export downloaded bytes do not match evidence");
    }
    if (input.verifyEnvelope) await input.verifyEnvelope(input.verificationFile);
  } catch (error) {
    rmSync(input.verificationFile, { force: true });
    throw error;
  }
  if (input.headOutput) {
    writeFileSync(input.headOutput, `${JSON.stringify(head)}\n`, { mode: 0o600 });
  }
  return {
    ok: true,
    format: "me3-managed-export-v1",
    keyVersion: input.exportKeyVersion,
    objectKey: input.objectKey,
    sha256,
    md5,
    etag,
    sizeBytes,
  };
}

function readExistingEvidence(input, run) {
  const headResult = run([
    "s3api",
    "head-object",
    "--endpoint-url",
    input.endpoint,
    "--bucket",
    input.bucket,
    "--key",
    input.objectKey,
  ]);
  if (!headResult.ok) throw new Error("managed retained export existing HEAD failed");
  const head = JSON.parse(headResult.stdout);
  const evidence = {
    sha256: String(head.Metadata?.sha256 || "").toLowerCase(),
    md5: String(head.Metadata?.md5 || "").toLowerCase(),
    etag: String(head.ETag || "").replace(/^"|"$/g, "").toLowerCase(),
    sizeBytes: Number(head.ContentLength),
  };
  if (
    head.Metadata?.format !== "me3-managed-export-v1" ||
    head.Metadata?.installation !== input.installationId ||
    head.Metadata?.operation !== input.exportOperationId ||
    head.Metadata?.keyversion !== input.exportKeyVersion
  ) {
    throw new Error("managed retained export existing identity is invalid");
  }
  return evidence;
}

function validateIdentity(input) {
  if (
    !isSafeEndpoint(input.endpoint) ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(input.bucket || "") ||
    !/^mi-[0-9a-f]{16}$/.test(input.installationId || "") ||
    !isUuid(input.exportOperationId) ||
    !/^v[1-9][0-9]{0,8}$/.test(input.exportKeyVersion || "") ||
    input.objectKey !==
      `managed-exports/${input.installationId}/${input.exportOperationId}.me3-managed-export-v1.enc`
  ) {
    throw new Error("managed retained export identity is invalid");
  }
}

async function hashFile(path, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function runAws(args) {
  const result = spawnSync("aws", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    preconditionFailed: result.status !== 0 && /(?:PreconditionFailed|status code:\s*412|\b412\b)/i.test(output),
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value || "");
}

function isSafeEndpoint(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".r2.cloudflarestorage.com")
    );
  } catch {
    return false;
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--") || !values[index + 1]) throw new Error("invalid argument");
    parsed[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...values] = process.argv.slice(2);
  const args = parseArgs(values);
  const common = {
    endpoint: args.endpoint,
    bucket: args.bucket,
    objectKey: args.key,
    installationId: args["installation-id"],
    exportOperationId: args["export-operation-id"],
    exportKeyVersion: args["export-key-version"],
    verificationFile: args["verification-file"],
    headOutput: args["head-output"],
    verifyEnvelope: async (file) => {
      const passphrase = deriveManagedExportPassphrase(
        resolveManagedExportMasterKey(
          process.env.ME3_MANAGED_EXPORT_KEYRING,
          args["export-key-version"],
        ),
        args["installation-id"],
        args["export-operation-id"],
      );
      await verifyManagedExportEnvelope({
        envelope: file,
        passphrase,
        expectedInstallationId: args["installation-id"],
        expectedOperationId: args["export-operation-id"],
        expectedKeyVersion: args["export-key-version"],
      });
    },
  };
  const result = command === "retain"
    ? await retainManagedExport({ ...common, file: args.file })
    : command === "verify"
      ? await verifyManagedRetainedExport({
          ...common,
          sha256: args.sha256,
          md5: args.md5,
          etag: args.etag,
          sizeBytes: args["size-bytes"],
        })
      : null;
  if (!result) throw new Error("usage: managed-retained-export.mjs <retain|verify> [options]");
  if (args["github-env"]) {
    appendFileSync(
      args["github-env"],
      [
        `ME3_MANAGED_EXPORT_OBJECT_KEY=${result.objectKey}`,
        `ME3_MANAGED_EXPORT_SHA256=${result.sha256}`,
        `ME3_MANAGED_EXPORT_MD5=${result.md5}`,
        `ME3_MANAGED_EXPORT_ETAG=${result.etag}`,
        `ME3_MANAGED_EXPORT_SIZE_BYTES=${result.sizeBytes}`,
        `ME3_MANAGED_EXPORT_KEY_VERSION=${result.keyVersion}`,
        "",
      ].join("\n"),
    );
  }
  console.log(JSON.stringify(result));
}
