#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import {
  D1_PLACEHOLDER,
  DEFAULT_INSTALL_MANIFEST,
  createInstallManifest,
  getD1Config,
  getR2BucketName,
  isValidDatabaseId,
  isValidResourceName,
  prepareDeployConfig,
  writeInstallManifest,
} from "./lib/deploy-config.mjs";

const DEFAULT_CONFIG = "wrangler.toml";
const DEFAULT_DB_NAME = "me3-core-db";
const DEFAULT_BUCKET = "me3-site-assets";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || DEFAULT_CONFIG;
const manifestPath = args.manifest || DEFAULT_INSTALL_MANIFEST;

if (!existsSync(configPath)) {
  fail(`Could not find ${configPath}. Run this from the ME3 Core repo root.`);
}

const originalConfig = readFileSync(configPath, "utf8");
const db = getD1Config(originalConfig);
const dbName = args.dbName || db.databaseName || DEFAULT_DB_NAME;
const bucketName = args.bucket || getR2BucketName(originalConfig) || DEFAULT_BUCKET;
const workerName = args.workerName || getWorkerName(originalConfig) || "me3-core-worker";
let databaseId = "";

if (!isValidResourceName(dbName)) {
  fail(`Invalid D1 database name "${dbName}". Use lowercase letters, numbers, and hyphens.`);
}

if (!isValidResourceName(bucketName)) {
  fail(`Invalid R2 bucket name "${bucketName}". Use lowercase letters, numbers, and hyphens.`);
}

if (!isValidResourceName(workerName)) {
  fail(`Invalid Worker name "${workerName}". Use lowercase letters, numbers, and hyphens.`);
}

if (args.dbId && !isValidDatabaseId(args.dbId)) {
  fail(`Invalid D1 database id "${args.dbId}". Expected a UUID from \`wrangler d1 list\`.`);
}

console.log("Preparing ME3 Core for a manual Cloudflare deploy.");
console.log(`Wrangler config: ${configPath}`);
console.log(`Install manifest: ${manifestPath}`);

if (!args.yes) {
  await confirm("This will create or reuse Cloudflare D1/R2 resources and put Worker secrets. Continue?");
}

runWrangler(["whoami"], {
  failureMessage: "Wrangler is not authenticated. Run `pnpm exec wrangler login` and try again.",
});

if (args.dbId) {
  databaseId = args.dbId;
  console.log(`Configured DB -> ${dbName} (${args.dbId})`);
} else if (db.databaseId && db.databaseId !== D1_PLACEHOLDER) {
  databaseId = db.databaseId;
  console.log(`Configured DB already present -> ${db.databaseName} (${db.databaseId})`);
} else {
  const createOutput = runWrangler(["d1", "create", dbName], {
    allowAlreadyExists: true,
    failureMessage: "Could not create the D1 database.",
  });
  const createdDatabaseId = parseDatabaseId(createOutput);

  if (!createdDatabaseId) {
    fail(
      `D1 database ${dbName} may already exist, but Wrangler did not print a database_id. ` +
        "Rerun this script with `--db-id <existing-database-id>`.",
    );
  }

  databaseId = createdDatabaseId;
  console.log(`Configured DB -> ${dbName} (${createdDatabaseId})`);
}

if (!args.skipR2) {
  runWrangler(["r2", "bucket", "create", bucketName], {
    allowAlreadyExists: true,
    failureMessage: "Could not create the R2 bucket.",
  });
  console.log(`Configured SITE_ASSETS -> ${bucketName}`);
}

const now = new Date().toISOString();
await writeInstallManifest(
  path.resolve(manifestPath),
  createInstallManifest({
    workerName,
    databaseName: dbName,
    databaseId,
    bucketName,
    createdAt: now,
    updatedAt: now,
  }),
);

console.log(`Updated ${manifestPath}.`);

const preparedConfig = await prepareDeployConfig({
  templateConfig: configPath,
  manifest: manifestPath,
});
console.log(`Generated ${preparedConfig.configPathRelative}.`);

if (!args.skipSecrets) {
  const setupPassword = args.setupPassword || randomBytes(16).toString("hex");

  putSecret("SETUP_PASSWORD", setupPassword, preparedConfig.configPath);

  console.log("");
  console.log("Remote standalone setup password secret is set.");
  console.log(`SETUP_PASSWORD=${setupPassword}`);
  console.log("Save that setup password somewhere private; it is needed only for advanced standalone setup or recovery.");
}

console.log("");
console.log("Next:");
console.log("  pnpm deploy");
console.log(`  pnpm exec wrangler deployments status --config ${preparedConfig.configPathRelative}`);

function parseArgs(values) {
  const parsed = {
    setupPassword: "",
    bucket: "",
    config: "",
    manifest: "",
    dbId: "",
    dbName: "",
    skipR2: false,
    skipSecrets: false,
    workerName: "",
    yes: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") {
      continue;
    } else if (value === "--yes" || value === "-y") {
      parsed.yes = true;
    } else if (value === "--skip-r2") {
      parsed.skipR2 = true;
    } else if (value === "--skip-secrets") {
      parsed.skipSecrets = true;
    } else if (value === "--setup-password") {
      parsed.setupPassword = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--setup-password=")) {
      parsed.setupPassword = value.slice("--setup-password=".length);
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
    } else if (value === "--manifest") {
      parsed.manifest = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--manifest=")) {
      parsed.manifest = value.slice("--manifest=".length);
    } else if (value === "--db-name") {
      parsed.dbName = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--db-name=")) {
      parsed.dbName = value.slice("--db-name=".length);
    } else if (value === "--db-id") {
      parsed.dbId = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--db-id=")) {
      parsed.dbId = value.slice("--db-id=".length);
    } else if (value === "--worker-name") {
      parsed.workerName = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--worker-name=")) {
      parsed.workerName = value.slice("--worker-name=".length);
    } else {
      fail(`Unknown option: ${value}`);
    }
  }

  return parsed;
}

async function confirm(question) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("Cancelled.");
      process.exit(0);
    }
  } finally {
    rl.close();
  }
}

function runWrangler(commandArgs, options = {}) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...commandArgs], {
    encoding: "utf8",
    input: options.input,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 || (options.allowAlreadyExists && /already exists/i.test(text))) {
    return text;
  }

  fail(options.failureMessage || `Wrangler command failed: wrangler ${commandArgs.join(" ")}`);
}

function putSecret(name, value, deployConfigPath) {
  runWrangler(["secret", "put", name, "--config", deployConfigPath], {
    input: `${value}\n`,
    failureMessage:
      `Could not put the ${name} Worker secret. ` +
      `You can set it later with \`pnpm exec wrangler secret put ${name} --config ${deployConfigPath}\`.`,
  });
}

function parseDatabaseId(text) {
  return (
    text.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ||
    text.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ||
    text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ||
    ""
  );
}

function getWorkerName(value) {
  return value.match(/^name\s*=\s*"([^"]+)"/m)?.[1] || "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
