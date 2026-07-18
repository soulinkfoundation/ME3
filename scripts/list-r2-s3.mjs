#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function listR2Objects(input, { run = runAws } = {}) {
  if (
    !isSafeEndpoint(input.endpoint) ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(input.bucket || "")
  ) {
    throw new Error("managed R2 listing contract is invalid");
  }

  const contents = [];
  let continuationToken = "";
  for (let page = 0; page < 100_000; page += 1) {
    const args = [
      "s3api",
      "list-objects-v2",
      "--no-paginate",
      "--endpoint-url",
      input.endpoint,
      "--bucket",
      input.bucket,
      ...(continuationToken ? ["--continuation-token", continuationToken] : []),
    ];
    const result = run(args);
    if (!result.ok) {
      if (input.allowMissing === true && page === 0 && isAuthoritativeMissing(result.output)) {
        return { Missing: true, IsTruncated: false, KeyCount: 0, Contents: [] };
      }
      throw new Error("managed R2 listing failed");
    }
    const pageResult = JSON.parse(result.stdout);
    if (!Array.isArray(pageResult.Contents || [])) throw new Error("managed R2 listing is invalid");
    contents.push(...(pageResult.Contents || []));
    if (pageResult.IsTruncated !== true) {
      continuationToken = "";
      break;
    }
    continuationToken = pageResult.NextContinuationToken;
    if (typeof continuationToken !== "string" || !continuationToken) {
      throw new Error("managed R2 listing pagination is invalid");
    }
  }
  if (continuationToken) throw new Error("managed R2 listing exceeded the page limit");
  const keys = contents.map((object) => object?.Key);
  const normalizedKeys = keys.map(normalizePortableObjectKey);
  if (new Set(normalizedKeys).size !== normalizedKeys.length) {
    throw new Error("managed R2 listing contains duplicate or invalid keys");
  }
  contents.sort((a, b) => a.Key.localeCompare(b.Key));
  return { Missing: false, IsTruncated: false, KeyCount: contents.length, Contents: contents };
}

function normalizePortableObjectKey(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("managed R2 listing contains duplicate or invalid keys");
  }
  const normalized = value.normalize("NFC");
  if (normalized !== value) {
    throw new Error("managed R2 listing contains duplicate or invalid keys");
  }
  return normalized;
}

function runAws(args) {
  const result = spawnSync("aws", args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    output: `${result.stdout || ""}\n${result.stderr || ""}`,
  };
}

function isAuthoritativeMissing(output) {
  return /(?:NoSuchBucket|specified bucket does not exist|status code:\s*404|\(404\)|HTTP 404)/i.test(
    output || "",
  );
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [endpoint, bucket, output, mode] = process.argv.slice(2);
  if (!output || (mode && mode !== "--allow-missing")) {
    throw new Error("managed R2 listing contract is invalid");
  }
  const result = listR2Objects({
    endpoint,
    bucket,
    allowMissing: mode === "--allow-missing",
  });
  writeFileSync(output, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify({ ok: true, missing: result.Missing, objects: result.Contents.length }),
  );
}
