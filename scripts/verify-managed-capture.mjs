#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export async function verifyManagedCapture({
  database,
  r2Before,
  r2After,
  r2Directory,
  r2VerificationDirectory,
  installationId,
}) {
  if (!/^mi-[0-9a-f]{16}$/.test(installationId || "")) {
    throw new Error("managed installation id is invalid");
  }
  if (!existsSync(database)) throw new Error("managed D1 capture is missing");
  const state = sqliteJson(
    database,
    `SELECT installation_id AS installationId, state, storage_purged_at AS storagePurgedAt
     FROM managed_runtime_state WHERE id = 'managed';`,
  );
  if (
    state.length !== 1 ||
    state[0].installationId !== installationId ||
    !["quiesced", "suspended"].includes(state[0].state) ||
    state[0].storagePurgedAt !== null
  ) {
    throw new Error("managed D1 capture was not produced behind an intact write barrier");
  }
  const leases = Number(
    sqliteScalar(database, "SELECT COUNT(*) FROM managed_runtime_write_leases;"),
  );
  if (leases !== 0) throw new Error("managed D1 capture still contains active write leases");

  const before = normalizeR2Listing(r2Before);
  const after = normalizeR2Listing(r2After);
  if (stableJson(before) !== stableJson(after)) {
    throw new Error("managed R2 listing changed during capture");
  }
  const local = await materializedR2Listing(r2Directory);
  const verification = await materializedR2Listing(r2VerificationDirectory);
  if (
    before.length !== local.length ||
    before.some((object, index) => {
      const captured = local[index];
      return object.key !== captured?.key || object.size !== captured.size;
    })
  ) {
    throw new Error("managed R2 materialization does not match the stable source listing");
  }
  if (stableJson(local) !== stableJson(verification)) {
    throw new Error("managed R2 materialization failed independent byte verification");
  }

  return {
    ok: true,
    installationId,
    runtimeState: state[0].state,
    activeWrites: leases,
    r2Objects: local.length,
    r2Bytes: local.reduce((sum, object) => sum + object.size, 0),
    r2ListingSha256: createHash("sha256").update(stableJson(before)).digest("hex"),
  };
}

function normalizeR2Listing(value) {
  const document = typeof value === "string" ? JSON.parse(value) : value;
  if (!document || document.IsTruncated === true || document.NextContinuationToken) {
    throw new Error("managed R2 listing is incomplete");
  }
  const contents = document.Contents || [];
  if (!Array.isArray(contents)) throw new Error("managed R2 listing is invalid");
  const objects = contents.map((object) => {
    const key = normalizeObjectKey(object?.Key);
    const size = Number(object?.Size);
    const etag = typeof object?.ETag === "string" ? object.ETag : "";
    if (!key || !Number.isSafeInteger(size) || size < 0 || !etag) {
      throw new Error("managed R2 listing contains an invalid object");
    }
    return { key, size, etag };
  });
  objects.sort((a, b) => a.key.localeCompare(b.key));
  if (new Set(objects.map((object) => object.key)).size !== objects.length) {
    throw new Error("managed R2 listing contains duplicate keys");
  }
  return objects;
}

async function materializedR2Listing(directory) {
  const root = resolve(directory);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error("managed R2 materialization is missing");
  }
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      const details = lstatSync(path);
      if (details.isSymbolicLink()) throw new Error("managed R2 materialization contains a symlink");
      if (details.isDirectory()) visit(path);
      else if (details.isFile()) {
        files.push({
          key: normalizeObjectKey(relative(root, path).split(sep).join("/")),
          size: details.size,
          path,
        });
      } else {
        throw new Error("managed R2 materialization contains an unsupported entry");
      }
    }
  };
  visit(root);
  const listed = [];
  for (const file of files.sort((a, b) => a.key.localeCompare(b.key))) {
    listed.push({ key: file.key, size: file.size, sha256: await sha256File(file.path) });
  }
  return listed;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function normalizeObjectKey(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("managed R2 object key is unsafe");
  }
  return value;
}

function sqliteJson(database, sql) {
  const output = runSqlite(database, ["-json", database], sql).trim();
  return output ? JSON.parse(output) : [];
}

function sqliteScalar(database, sql) {
  return runSqlite(database, [database], sql).trim();
}

function runSqlite(_database, args, sql) {
  const result = spawnSync("sqlite3", args, { input: `.bail on\n${sql}\n`, encoding: "utf8" });
  if (result.status !== 0) throw new Error("managed D1 capture validation failed");
  return result.stdout;
}

function stableJson(value) {
  return JSON.stringify(value);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--") || !values[index + 1]) throw new Error("invalid argument");
    parsed[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    JSON.stringify(
      await verifyManagedCapture({
        database: args.db,
        r2Before: await readText(args["r2-before"]),
        r2After: await readText(args["r2-after"]),
        r2Directory: args["r2-dir"],
        r2VerificationDirectory: args["r2-verify-dir"],
        installationId: args["installation-id"],
      }),
    ),
  );
}

async function readText(path) {
  if (!path) throw new Error("managed capture argument is missing");
  return (await import("node:fs/promises")).readFile(path, "utf8");
}
