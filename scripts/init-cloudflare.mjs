#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import {
  getPreferredSiteAssetsBucketName,
  upsertSiteAssetsBinding,
} from "./wrangler-toml.mjs";

const DEFAULT_CONFIG = "wrangler.toml";
const DEFAULT_DB_NAME = "me3-core-db";
const DEFAULT_BUCKET = "me3-site-assets";
const D1_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || DEFAULT_CONFIG;
const aiGatewayAccountId =
  (
    args.cloudflareAccountId ||
    process.env.ME3_AI_GATEWAY_CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    ""
  ).trim();
const aiGatewayApiToken =
  (
    args.cloudflareApiToken ||
    process.env.ME3_AI_GATEWAY_CLOUDFLARE_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    ""
  ).trim();

if (!existsSync(configPath)) {
  fail(`Could not find ${configPath}. Run this from the ME3 Core repo root.`);
}

const originalConfig = readFileSync(configPath, "utf8");
let config = originalConfig;
const db = getD1Config(config);
const dbName = args.dbName || db.databaseName || DEFAULT_DB_NAME;
const bucketName = args.bucket || getPreferredSiteAssetsBucketName(config, DEFAULT_BUCKET) || DEFAULT_BUCKET;

if (!isValidResourceName(dbName)) {
  fail(`Invalid D1 database name "${dbName}". Use lowercase letters, numbers, and hyphens.`);
}

if (!isValidResourceName(bucketName)) {
  fail(`Invalid R2 bucket name "${bucketName}". Use lowercase letters, numbers, and hyphens.`);
}

if (args.dbId && !isValidDatabaseId(args.dbId)) {
  fail(`Invalid D1 database id "${args.dbId}". Expected a UUID from \`wrangler d1 list\`.`);
}

console.log("Preparing ME3 Core for a manual Cloudflare deploy.");
console.log(`Wrangler config: ${configPath}`);

if (!args.yes) {
  await confirm("This will create or reuse Cloudflare D1/R2 resources and put Worker secrets. Continue?");
}

runWrangler(["whoami"], {
  failureMessage: "Wrangler is not authenticated. Run `pnpm exec wrangler login` and try again.",
});

if (args.dbId) {
  config = setD1Config(config, dbName, args.dbId);
  console.log(`Configured DB -> ${dbName} (${args.dbId})`);
} else if (!db.databaseId || db.databaseId === D1_PLACEHOLDER) {
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

  config = setD1Config(config, dbName, createdDatabaseId);
  console.log(`Configured DB -> ${dbName} (${createdDatabaseId})`);
} else {
  console.log(`Configured DB already present -> ${db.databaseName} (${db.databaseId})`);
}

if (!args.skipR2) {
  runWrangler(["r2", "bucket", "create", bucketName], {
    allowAlreadyExists: true,
    failureMessage: "Could not create the R2 bucket.",
  });
  config = upsertSiteAssetsBinding(config, bucketName);
  console.log(`Configured SITE_ASSETS -> ${bucketName}`);
}

config = ensureEmailSendBinding(config);
console.log("Configured EMAIL send binding for Cloudflare Email Service.");

if (!args.skipQueues) {
  const existingQueueNames = getExistingCloudflareQueueNames();
  for (const queueName of parseQueueNames(config)) {
    if (existingQueueNames.has(queueName)) {
      console.log(`Configured queue already present -> ${queueName}`);
      continue;
    }

    runWrangler(["queues", "create", queueName], {
      allowAlreadyExists: true,
      failureMessage: `Could not create Cloudflare queue ${queueName}.`,
    });
    console.log(`Configured queue -> ${queueName}`);
  }
}

if (config !== originalConfig) {
  writeFileSync(configPath, config);
  console.log(`Updated ${configPath}.`);
} else {
  console.log(`${configPath} already has the needed resource bindings.`);
}

if (!args.skipSecrets) {
  const setupPassword = args.setupPassword || randomBytes(16).toString("hex");

  putSecret("SETUP_PASSWORD", setupPassword);
  putAiGatewaySecrets();

  console.log("");
  console.log("Remote standalone setup password secret is set.");
  console.log(`SETUP_PASSWORD=${setupPassword}`);
  console.log("Save that setup password somewhere private; it is needed only for advanced standalone setup or recovery.");
}

console.log("");
console.log("Next:");
console.log("  pnpm deploy:cloudflare");
console.log("  pnpm exec wrangler deployments status --config wrangler.toml");

function parseArgs(values) {
  const parsed = {
    setupPassword: "",
    bucket: "",
    config: "",
    dbId: "",
    dbName: "",
    cloudflareAccountId: "",
    cloudflareApiToken: "",
    skipR2: false,
    skipQueues: false,
    skipSecrets: false,
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
    } else if (value === "--skip-queues") {
      parsed.skipQueues = true;
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
    } else if (value === "--cloudflare-account-id") {
      parsed.cloudflareAccountId = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--cloudflare-account-id=")) {
      parsed.cloudflareAccountId = value.slice("--cloudflare-account-id=".length);
    } else if (value === "--cloudflare-api-token") {
      parsed.cloudflareApiToken = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--cloudflare-api-token=")) {
      parsed.cloudflareApiToken = value.slice("--cloudflare-api-token=".length);
    } else if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown option: ${value}`);
    }
  }

  return parsed;
}

function parseQueueNames(value) {
  const queueNames = new Set();
  const queuePattern = /^\s*(?:queue|dead_letter_queue)\s*=\s*"([^"]+)"\s*$/gm;
  let match = queuePattern.exec(value);
  while (match) {
    const queueName = match[1]?.trim();
    if (queueName) queueNames.add(queueName);
    match = queuePattern.exec(value);
  }
  return [...queueNames].sort();
}

function getExistingCloudflareQueueNames() {
  const output = runWrangler(["queues", "list"], {
    quiet: true,
    failureMessage: "Could not list Cloudflare queues.",
  });
  return parseQueueListOutput(output);
}

function parseQueueListOutput(output) {
  const names = new Set();
  for (const line of output.split(/\r?\n/)) {
    const columns = line
      .split(/[│|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (columns.length < 2 || columns[0] === "id" || /^[-─]+$/.test(columns[0])) {
      continue;
    }
    const name = columns[1];
    if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) names.add(name);
  }
  return names;
}

function printHelp() {
  console.log(`Usage: pnpm init:cloudflare -- [options]

Prepares Cloudflare resources for a manual ME3 Core deploy.

Options:
  --config <path>          Wrangler config path (default: wrangler.toml)
  --db-name <name>         D1 database name
  --db-id <uuid>           Existing D1 database id
  --bucket <name>          R2 bucket name
  --setup-password <value> SETUP_PASSWORD secret value
  --cloudflare-account-id <id>
                           Set CLOUDFLARE_ACCOUNT_ID for AI Gateway usage
  --cloudflare-api-token <token>
                           Set CLOUDFLARE_API_TOKEN for AI Gateway usage
  --skip-r2                Do not create or configure SITE_ASSETS
  --skip-queues            Do not create queues from wrangler.toml
  --skip-secrets           Do not write Worker secrets
  --yes, -y                Skip confirmation prompts
  --help, -h               Show this help
`);
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

  if (!options.quiet && result.stdout) process.stdout.write(result.stdout);
  if (!options.quiet && result.stderr) process.stderr.write(result.stderr);

  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 || (options.allowAlreadyExists && /already exists/i.test(text))) {
    return text;
  }

  fail(options.failureMessage || `Wrangler command failed: wrangler ${commandArgs.join(" ")}`);
}

function putSecret(name, value) {
  runWrangler(["secret", "put", name, "--config", configPath], {
    input: `${value}\n`,
    failureMessage:
      `Could not put the ${name} Worker secret. ` +
      `You can set it later with \`pnpm exec wrangler secret put ${name} --config ${configPath}\`.`,
  });
}

function putAiGatewaySecrets() {
  if (!aiGatewayAccountId && !aiGatewayApiToken) {
    console.log(
      "Skipped AI Gateway secrets; set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN later to enable usage reporting.",
    );
    return;
  }

  if (!aiGatewayAccountId || !aiGatewayApiToken) {
    console.warn(
      "Skipped AI Gateway secrets; both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.",
    );
    return;
  }

  putSecret("CLOUDFLARE_ACCOUNT_ID", aiGatewayAccountId);
  putSecret("CLOUDFLARE_API_TOKEN", aiGatewayApiToken);
  console.log("AI Gateway Worker secrets are set.");
}

function getD1Config(value) {
  const block = value.match(
    /\n\[\[d1_databases\]\]\n(?:(?!\n\[)[\s\S])*?binding\s*=\s*"DB"(?:(?!\n\[)[\s\S])*/,
  )?.[0];

  return {
    databaseId: block?.match(/database_id\s*=\s*"([^"]+)"/)?.[1] || "",
    databaseName: block?.match(/database_name\s*=\s*"([^"]+)"/)?.[1] || "",
  };
}

function setD1Config(value, databaseName, databaseId) {
  const blockPattern =
    /\n\[\[d1_databases\]\]\n(?:(?!\n\[)[\s\S])*?binding\s*=\s*"DB"(?:(?!\n\[)[\s\S])*/;

  if (!blockPattern.test(value)) {
    fail(`Could not find a [[d1_databases]] block with binding = "DB" in ${configPath}.`);
  }

  return value.replace(blockPattern, (block) => {
    let next = setTomlString(block, "database_name", databaseName);
    next = setTomlString(next, "database_id", databaseId);
    return next;
  });
}

function ensureEmailSendBinding(value) {
  if (getSendEmailBinding(value, "EMAIL")) return value;

  const block = [
    "",
    "# Cloudflare Email Service sender binding. Account -> Email stores the sender",
    "# address; this deploy-time binding lets the Worker call env.EMAIL.send().",
    "[[send_email]]",
    'name = "EMAIL"',
    "",
  ].join("\n");

  const varsIndex = value.indexOf("\n[vars]");
  if (varsIndex !== -1) {
    return `${value.slice(0, varsIndex)}${block}${value.slice(varsIndex)}`;
  }

  const assetsIndex = value.indexOf("\n[assets]");
  if (assetsIndex !== -1) {
    return `${value.slice(0, assetsIndex)}${block}${value.slice(assetsIndex)}`;
  }

  return `${value.trimEnd()}${block}`;
}

function getSendEmailBinding(value, name) {
  const blocks = value.match(/\n\[\[send_email\]\]\n(?:(?!\n\[)[\s\S])*/g) || [];
  return blocks.find((block) => block.match(/name\s*=\s*"([^"]+)"/)?.[1] === name) || "";
}

function setTomlString(block, key, value) {
  const pattern = new RegExp(`${key}\\s*=\\s*"[^"]*"`);
  if (pattern.test(block)) {
    return block.replace(pattern, `${key} = "${value}"`);
  }
  return `${block.trimEnd()}\n${key} = "${value}"\n`;
}

function parseDatabaseId(text) {
  return (
    text.match(/database_id\s*=\s*"([^"]+)"/)?.[1] ||
    text.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ||
    text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1] ||
    ""
  );
}

function isValidResourceName(value) {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
}

function isValidDatabaseId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
