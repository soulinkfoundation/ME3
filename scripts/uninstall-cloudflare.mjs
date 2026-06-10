#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_CONFIG = "wrangler.toml";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || DEFAULT_CONFIG;

if (!existsSync(configPath)) {
  fail(`Could not find ${configPath}. Run this from the copied ME3 Core install repo root.`);
}

const config = readFileSync(configPath, "utf8");
const resources = getInstallResources(config, args);
const steps = getUninstallSteps(resources, args);

printPlan(resources, steps, args);

if (!args.execute) {
  console.log("");
  console.log("Dry run only. Rerun with --execute to delete these Cloudflare resources.");
  process.exit(0);
}

if (steps.length === 0) {
  console.log("");
  console.log("Nothing to delete after applying the selected keep flags.");
  process.exit(0);
}

if (!args.yes) {
  const expected = getConfirmationText(resources);
  await confirmDestructiveAction(expected);
}

const failures = [];
for (const step of steps) {
  const result = runStep(step, args);
  if (result.status === 0) continue;

  if (step.nonFatal) {
    console.warn(`Continuing after non-fatal failure: ${step.label}`);
    if (step.advice) console.warn(step.advice);
    continue;
  }

  failures.push(step);
  if (step.advice) console.error(step.advice);
}

if (failures.length > 0) {
  console.error("");
  console.error("Cloudflare uninstall finished with failures:");
  for (const step of failures) {
    console.error(`- ${step.label}`);
  }
  console.error("Fix the failed resources, then rerun the command with keep flags for anything already deleted.");
  process.exit(1);
}

console.log("");
console.log("Cloudflare uninstall complete.");

function parseArgs(values) {
  const parsed = {
    bucket: "",
    config: "",
    dbName: "",
    execute: false,
    forceWorker: false,
    keepD1: false,
    keepData: false,
    keepQueues: false,
    keepR2: false,
    keepWorker: false,
    queues: [],
    r2Jurisdiction: "",
    workerName: "",
    yes: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") {
      continue;
    } else if (value === "--execute") {
      parsed.execute = true;
    } else if (value === "--yes" || value === "-y") {
      parsed.yes = true;
    } else if (value === "--force-worker") {
      parsed.forceWorker = true;
    } else if (value === "--keep-data") {
      parsed.keepData = true;
    } else if (value === "--keep-worker") {
      parsed.keepWorker = true;
    } else if (value === "--keep-d1") {
      parsed.keepD1 = true;
    } else if (value === "--keep-r2") {
      parsed.keepR2 = true;
    } else if (value === "--keep-queues") {
      parsed.keepQueues = true;
    } else if (value === "--worker-name") {
      parsed.workerName = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--worker-name=")) {
      parsed.workerName = value.slice("--worker-name=".length);
    } else if (value === "--db-name") {
      parsed.dbName = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--db-name=")) {
      parsed.dbName = value.slice("--db-name=".length);
    } else if (value === "--bucket") {
      parsed.bucket = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--bucket=")) {
      parsed.bucket = value.slice("--bucket=".length);
    } else if (value === "--queue") {
      parsed.queues.push(values[index + 1] || "");
      index += 1;
    } else if (value.startsWith("--queue=")) {
      parsed.queues.push(value.slice("--queue=".length));
    } else if (value === "--r2-jurisdiction") {
      parsed.r2Jurisdiction = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--r2-jurisdiction=")) {
      parsed.r2Jurisdiction = value.slice("--r2-jurisdiction=".length);
    } else if (value === "--config") {
      parsed.config = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--config=")) {
      parsed.config = value.slice("--config=".length);
    } else if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown option: ${value}`);
    }
  }

  if (parsed.keepData) {
    parsed.keepD1 = true;
    parsed.keepR2 = true;
    parsed.keepQueues = true;
  }

  parsed.queues = parsed.queues.map((queueName) => queueName.trim()).filter(Boolean);

  return parsed;
}

function printHelp() {
  console.log(`Usage: pnpm uninstall:cloudflare -- [options]

Deletes the Cloudflare resources declared by a copied ME3 Core install's
wrangler.toml. This command is a dry run unless --execute is provided.

Options:
  --execute               Actually delete resources; default is dry run
  --yes, -y               Skip the ME3 typed confirmation prompt
  --config <path>         Wrangler config path (default: wrangler.toml)
  --worker-name <name>    Worker name override
  --db-name <name>        D1 database name override
  --bucket <name>         R2 bucket name override
  --queue <name>          Extra queue name to delete; repeatable
  --r2-jurisdiction <id>  R2 jurisdiction for bucket deletion
  --keep-data             Do not explicitly delete D1, R2, or queues
  --keep-worker           Do not delete the Worker
  --keep-d1               Do not delete D1 databases
  --keep-r2               Do not delete R2 buckets
  --keep-queues           Do not delete Cloudflare queues
  --force-worker          Pass --force to wrangler delete
  --help, -h              Show this help

Examples:
  pnpm uninstall:cloudflare
  pnpm uninstall:cloudflare -- --execute
  pnpm uninstall:cloudflare -- --execute --keep-data
`);
}

function getInstallResources(value, options) {
  const workerName = options.workerName || getTopLevelTomlString(value, "name");

  const d1Databases = options.dbName
    ? [{ binding: "DB", name: options.dbName, databaseId: "" }]
    : getTomlArrayBlocks(value, "d1_databases")
        .map((block) => ({
          binding: getTomlString(block, "binding"),
          name: getTomlString(block, "database_name") || getTomlString(block, "binding"),
          databaseId: getTomlString(block, "database_id"),
        }))
        .filter((database) => Boolean(database.name));

  const r2Buckets = options.bucket
    ? [{ binding: "SITE_ASSETS", name: options.bucket, jurisdiction: options.r2Jurisdiction }]
    : getTomlArrayBlocks(value, "r2_buckets")
        .map((block) => ({
          binding: getTomlString(block, "binding"),
          name: getTomlString(block, "bucket_name"),
          jurisdiction: options.r2Jurisdiction || getTomlString(block, "jurisdiction"),
        }))
        .filter((bucket) => Boolean(bucket.name));

  const consumerQueueNames = new Set(
    getTomlArrayBlocks(value, "queues.consumers")
      .map((block) => getTomlString(block, "queue"))
      .filter(Boolean),
  );
  const queueNames = new Set(options.queues);
  const queuePattern = /^\s*(?:queue|dead_letter_queue)\s*=\s*"([^"]+)"\s*$/gm;
  let match = queuePattern.exec(value);
  while (match) {
    const queueName = match[1]?.trim();
    if (queueName) queueNames.add(queueName);
    match = queuePattern.exec(value);
  }

  return {
    workerName,
    d1Databases,
    r2Buckets,
    queueNames: [...queueNames].sort(),
    consumerQueueNames: [...consumerQueueNames].sort(),
  };
}

function getUninstallSteps(resources, options) {
  const steps = [];

  if (!options.keepQueues && resources.workerName) {
    for (const queueName of resources.consumerQueueNames) {
      steps.push({
        label: `Remove Worker consumer ${resources.workerName} from queue ${queueName}`,
        command: [
          "pnpm",
          "exec",
          "wrangler",
          "queues",
          "consumer",
          "remove",
          queueName,
          resources.workerName,
          "--config",
          configPath,
        ],
        nonFatal: true,
        advice:
          "This is usually harmless if the Worker consumer was already removed or the queue no longer exists.",
      });
    }
  }

  if (!options.keepWorker && resources.workerName) {
    steps.push({
      label: `Delete Worker ${resources.workerName}`,
      command: [
        "pnpm",
        "exec",
        "wrangler",
        "delete",
        resources.workerName,
        "--config",
        configPath,
        ...(options.forceWorker ? ["--force"] : []),
      ],
      advice:
        "If Cloudflare reports dependent Workers or routes, resolve those dependencies or rerun with --force-worker.",
    });
  }

  if (!options.keepQueues) {
    for (const queueName of resources.queueNames) {
      steps.push({
        label: `Delete queue ${queueName}`,
        command: ["pnpm", "exec", "wrangler", "queues", "delete", queueName, "--config", configPath],
        advice:
          "If the queue is still connected to a Worker consumer, delete the Worker or remove the queue consumer first.",
      });
    }
  }

  if (!options.keepD1) {
    for (const database of resources.d1Databases) {
      steps.push({
        label: `Delete D1 database ${database.name}`,
        command: [
          "pnpm",
          "exec",
          "wrangler",
          "d1",
          "delete",
          database.name,
          "--config",
          configPath,
          "--skip-confirmation",
        ],
        advice:
          "If this fails, check that Wrangler is logged into the account that owns this D1 database.",
      });
    }
  }

  if (!options.keepR2) {
    for (const bucket of resources.r2Buckets) {
      steps.push({
        label: `Delete R2 bucket ${bucket.name}`,
        command: [
          "pnpm",
          "exec",
          "wrangler",
          "r2",
          "bucket",
          "delete",
          bucket.name,
          "--config",
          configPath,
          ...(bucket.jurisdiction ? ["--jurisdiction", bucket.jurisdiction] : []),
        ],
        advice:
          "R2 bucket deletion only succeeds after the bucket is empty. Empty it in the Cloudflare dashboard or with S3/rclone, then rerun with keep flags for resources already deleted.",
      });
    }
  }

  return steps;
}

function printPlan(resources, steps, options) {
  console.log("ME3 Core Cloudflare uninstall");
  console.log(`Wrangler config: ${configPath}`);
  console.log(`Mode: ${options.execute ? "execute" : "dry run"}`);
  console.log("");
  console.log("Detected resources:");
  printResource("Worker", resources.workerName, options.keepWorker);
  printResourceList(
    "D1 database",
    resources.d1Databases.map((database) =>
      database.databaseId ? `${database.name} (${database.databaseId})` : database.name,
    ),
    options.keepD1,
  );
  printResourceList(
    "R2 bucket",
    resources.r2Buckets.map((bucket) =>
      bucket.jurisdiction ? `${bucket.name} (${bucket.jurisdiction})` : bucket.name,
    ),
    options.keepR2,
  );
  printResourceList("Queue", resources.queueNames, options.keepQueues);

  console.log("");
  if (steps.length === 0) {
    console.log("No delete commands after applying keep flags.");
    return;
  }

  console.log("Commands:");
  for (const step of steps) {
    console.log(`- ${step.label}`);
    console.log(`  ${formatCommand(step.command)}`);
  }
}

function printResource(label, value, kept) {
  const suffix = kept ? " (kept)" : "";
  console.log(`- ${label}: ${value || "not configured"}${suffix}`);
}

function printResourceList(label, values, kept) {
  const suffix = kept ? " (kept)" : "";
  if (values.length === 0) {
    console.log(`- ${label}: not configured${suffix}`);
    return;
  }

  for (const value of values) {
    console.log(`- ${label}: ${value}${suffix}`);
  }
}

function runStep(step, options) {
  console.log("");
  console.log(step.label);
  console.log(formatCommand(step.command));

  const result = spawnSync(step.command[0], step.command.slice(1), {
    encoding: "utf8",
    input: options.yes ? "yes\ny\n" : undefined,
    stdio: options.yes ? ["pipe", "inherit", "inherit"] : "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    return { status: 1 };
  }

  return { status: result.status ?? 1 };
}

function getConfirmationText(resources) {
  return `delete ${resources.workerName || "me3"}`;
}

async function confirmDestructiveAction(expected) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `This permanently deletes Cloudflare resources. Type "${expected}" to continue: `,
    );
    if (answer.trim() !== expected) {
      console.log("Cancelled.");
      process.exit(0);
    }
  } finally {
    rl.close();
  }
}

function getTomlArrayBlocks(value, blockName) {
  const blockPattern = new RegExp(
    `(?:^|\\n)\\[\\[${escapeRegExp(blockName)}\\]\\][\\s\\S]*?(?=\\n\\[|$)`,
    "g",
  );
  return value.match(blockPattern) || [];
}

function getTopLevelTomlString(value, key) {
  return value.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]+)"`, "m"))?.[1] || "";
}

function getTomlString(block, key) {
  if (!block) return "";
  return block.match(new RegExp(`${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`))?.[1] || "";
}

function formatCommand(command) {
  return command.map(formatShellArg).join(" ");
}

function formatShellArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
