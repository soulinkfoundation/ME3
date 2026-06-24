#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  escapeRegExp,
  getPreferredSiteAssetsBucketName,
  getTomlArrayBlock,
  getTomlString,
  removeSiteAssetsBinding,
  setTomlString,
  upsertSiteAssetsBinding,
} from "./wrangler-toml.mjs";

const DEFAULT_CONFIG = "wrangler.toml";
const D1_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || DEFAULT_CONFIG;

if (!existsSync(configPath)) {
  fail(`Could not find ${configPath}. Run this from the ME3 Core repo root.`);
}

const originalConfig = readFileSync(configPath, "utf8");
let config = originalConfig;
const workerName = getTopLevelTomlString(config, "name") || "my-me3";
const resourcePrefix = normalizeResourcePrefix(workerName);
const d1Block = getTomlArrayBlock(config, "d1_databases", "DB");
const defaultBucketName = buildResourceName(resourcePrefix, "site-assets");
const dbName =
  args.dbName ||
  getTomlString(d1Block, "database_name") ||
  buildResourceName(resourcePrefix, "db");
const bucketName =
  args.bucket ||
  process.env.ME3_R2_BUCKET_NAME ||
  getPreferredSiteAssetsBucketName(config, defaultBucketName) ||
  defaultBucketName;
let databaseId = getTomlString(d1Block, "database_id");

if (!isValidResourceName(dbName)) {
  fail(`Invalid D1 database name "${dbName}". Use lowercase letters, numbers, and hyphens.`);
}

if (!args.skipR2 && !isValidResourceName(bucketName)) {
  fail(`Invalid R2 bucket name "${bucketName}". Use lowercase letters, numbers, and hyphens.`);
}

if (!databaseId || databaseId === D1_PLACEHOLDER) {
  databaseId = args.skipCreate ? D1_PLACEHOLDER : ensureD1Database(dbName);
}

config = upsertD1Binding(config, dbName, databaseId);
console.log(
  `Configured DB -> ${dbName}${databaseId === D1_PLACEHOLDER ? "" : ` (${databaseId})`}`,
);

if (args.skipR2) {
  config = removeSiteAssetsBinding(config);
  console.log("Skipped storage; email attachments and assistant image uploads will be unavailable.");
} else {
  const r2Ready = args.skipCreate || ensureR2Bucket(bucketName);
  if (!r2Ready) {
    fail(
      [
        `Could not create or reuse Cloudflare storage bucket "${bucketName}".`,
        "R2 storage needs to be activated to proceed.",
        "Activate R2 storage: https://dash.cloudflare.com/?to=/:account/r2/plans",
        "Then rerun `pnpm deploy:cloudflare`.",
        "To deploy without file/email attachment storage, use `pnpm deploy:cloudflare:d1-only`.",
      ].join("\n"),
    );
  }
  config = upsertSiteAssetsBinding(config, bucketName);
  console.log(`Configured SITE_ASSETS -> ${bucketName}`);
}

if (config !== originalConfig) {
  writeFileSync(configPath, config);
  console.log(`Updated ${configPath}.`);
} else {
  console.log(`${configPath} already has the needed deploy bindings.`);
}

function parseArgs(values) {
  const parsed = {
    bucket: "",
    config: "",
    dbName: "",
    skipCreate: false,
    skipR2: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") {
      continue;
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
    } else if (value === "--db-name") {
      parsed.dbName = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--db-name=")) {
      parsed.dbName = value.slice("--db-name=".length);
    } else if (value === "--skip-create") {
      parsed.skipCreate = true;
    } else if (value === "--skip-r2") {
      parsed.skipR2 = true;
    } else if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown option: ${value}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: pnpm deploy:prepare -- [options]

Creates or reuses the Cloudflare resources ME3 needs for deploy, then writes
their bindings into wrangler.toml. Resource names are derived from the Worker
project name so Deploy to Cloudflare can keep the setup form small. Storage
must be active for email attachments, assistant image uploads, and larger media.

Options:
  --config <path>   Wrangler config path (default: wrangler.toml)
  --db-name <name>  D1 database name
  --bucket <name>   R2 bucket name
  --skip-r2         Remove storage and deploy without file/email attachments
  --skip-create     Update config only; do not call Cloudflare APIs
  --help, -h        Show this help
`);
}

function ensureD1Database(databaseName) {
  const createOutput = runWrangler(["d1", "create", databaseName], {
    allowAlreadyExists: true,
    quiet: true,
  });
  const createdId = parseDatabaseId(createOutput);
  if (createdId) return createdId;

  const listedId = findD1DatabaseId(databaseName);
  if (listedId) return listedId;

  fail(
    `Could not determine the database_id for D1 database "${databaseName}". ` +
      "Create it manually with Wrangler, then rerun deploy.",
  );
}

function findD1DatabaseId(databaseName) {
  const output = runWrangler(["d1", "list", "--json"], {
    quiet: true,
    failureMessage: "Could not list D1 databases.",
  });

  try {
    const parsed = JSON.parse(output);
    const databases = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.result)
        ? parsed.result
        : Array.isArray(parsed.databases)
          ? parsed.databases
          : [];
    const match = databases.find((database) => {
      const name = database?.name || database?.database_name;
      return typeof name === "string" && name === databaseName;
    });
    return match?.uuid || match?.id || match?.database_id || "";
  } catch {
    return "";
  }
}

function ensureR2Bucket(bucketName) {
  const result = spawnWrangler(["r2", "bucket", "create", bucketName], {
    allowAlreadyExists: true,
    quiet: true,
  });

  if (result.ok) return true;

  return false;
}

function runWrangler(commandArgs, options = {}) {
  const result = spawnWrangler(commandArgs, options);
  if (result.ok) return result.text;

  fail(options.failureMessage || `Wrangler command failed: wrangler ${commandArgs.join(" ")}`);
}

function spawnWrangler(commandArgs, options = {}) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...commandArgs, "--config", configPath], {
    encoding: "utf8",
  });

  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (!options.quiet && result.stdout) process.stdout.write(result.stdout);
  if (!options.quiet && result.stderr) process.stderr.write(result.stderr);

  return {
    ok: result.status === 0 || (options.allowAlreadyExists && /already exists/i.test(text)),
    text,
  };
}

function upsertD1Binding(value, databaseName, databaseId) {
  const block = getTomlArrayBlock(value, "d1_databases", "DB");
  if (block) {
    return value.replace(block, () => {
      let next = setTomlString(block, "database_name", databaseName);
      next = setTomlString(next, "database_id", databaseId);
      next = setTomlString(next, "migrations_dir", "apps/worker/migrations");
      return next;
    });
  }

  return insertTomlBlock(
    value,
    [
      "",
      "[[d1_databases]]",
      'binding = "DB"',
      `database_name = "${databaseName}"`,
      `database_id = "${databaseId}"`,
      'migrations_dir = "apps/worker/migrations"',
      "",
    ].join("\n"),
    ["[[r2_buckets]]", "[triggers]", "[assets]"],
  );
}

function insertTomlBlock(value, block, beforeHeaders) {
  for (const header of beforeHeaders) {
    const index = value.indexOf(`\n${header}`);
    if (index !== -1) return `${value.slice(0, index)}${block}${value.slice(index)}`;
  }
  return `${value.trimEnd()}${block}\n`;
}

function getTopLevelTomlString(value, key) {
  return value.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]+)"`, "m"))?.[1] || "";
}

function parseDatabaseId(text) {
  return (
    text.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ||
    text.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ||
    text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ||
    ""
  );
}

function normalizeResourcePrefix(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "my-me3";
}

function buildResourceName(prefix, suffix) {
  const suffixText = `-${suffix}`;
  const maxPrefixLength = 63 - suffixText.length;
  return `${prefix.slice(0, maxPrefixLength).replace(/-$/g, "")}${suffixText}`;
}

function isValidResourceName(value) {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
