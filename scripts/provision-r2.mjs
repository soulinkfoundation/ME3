#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  getPreferredSiteAssetsBucketName,
  upsertSiteAssetsBinding,
} from "./wrangler-toml.mjs";

const DEFAULT_BUCKET = "me3-site-assets";
const DEFAULT_CONFIG = "wrangler.toml";
const BINDING = "SITE_ASSETS";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || DEFAULT_CONFIG;

if (!existsSync(configPath)) {
  fail(`Could not find ${configPath}. Run this from the ME3 Core repo root.`);
}

const before = readFileSync(configPath, "utf8");
const existingBucketName = getPreferredSiteAssetsBucketName(before, DEFAULT_BUCKET);
const bucketName =
  args.bucket ||
  process.env.ME3_R2_BUCKET_NAME ||
  existingBucketName ||
  (args.yes ? DEFAULT_BUCKET : await promptBucketName());

if (!isValidBucketName(bucketName)) {
  fail(
    `Invalid R2 bucket name "${bucketName}". Use lowercase letters, numbers, and hyphens.`,
  );
}

if (!args.skipCreate) {
  runWrangler(["r2", "bucket", "create", bucketName]);
}

const after = upsertSiteAssetsBinding(before, bucketName, {
  comment: "# Optional large-site media storage.",
  insertBeforeHeaders: ["[assets]"],
});

if (after === before) {
  console.log(`${configPath} already binds ${BINDING} to ${bucketName}.`);
} else {
  writeFileSync(configPath, after);
  console.log(`Updated ${configPath}: ${BINDING} -> ${bucketName}`);
}

console.log("R2 large-site storage is ready for the next deploy.");

function parseArgs(values) {
  const parsed = {
    bucket: "",
    config: "",
    yes: false,
    skipCreate: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") {
      continue;
    } else if (value === "--yes" || value === "-y") {
      parsed.yes = true;
    } else if (value === "--skip-create") {
      parsed.skipCreate = true;
    } else if (value === "--bucket") {
      parsed.bucket = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--bucket=")) {
      parsed.bucket = value.slice("--bucket=".length);
    } else if (value === "--config") {
      parsed.config = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--config=")) {
      parsed.config = value.slice("--config=".length);
    } else {
      fail(`Unknown option: ${value}`);
    }
  }

  return parsed;
}

async function promptBucketName() {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`R2 bucket name (${DEFAULT_BUCKET}): `);
    return answer.trim() || DEFAULT_BUCKET;
  } finally {
    rl.close();
  }
}

function runWrangler(commandArgs) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...commandArgs], {
    encoding: "utf8",
  });

  const outputText = `${result.stdout || ""}\n${result.stderr || ""}`;
  const normalizedOutputText = stripAnsi(outputText);

  if (result.status === 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return;
  }

  if (isAlreadyOwnedBucketError(normalizedOutputText)) {
    console.log(`R2 bucket ${bucketName} already exists; continuing.`);
    return;
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  fail(
    "Could not create the R2 bucket. Make sure Wrangler is logged in, or rerun with --skip-create if the bucket already exists.",
  );
}

function isAlreadyOwnedBucketError(value) {
  return (
    /\b10004\b/.test(value) ||
    /already exists/i.test(value) ||
    /bucket[\s\S]*exists/i.test(value)
  );
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function isValidBucketName(value) {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
