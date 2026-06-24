#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_CONFIG = "wrangler.toml";
const D1_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || DEFAULT_CONFIG;
const checks = [];

if (!existsSync(configPath)) {
  fail(`Could not find ${configPath}. Run this from the ME3 Core repo root.`);
}

const config = readFileSync(configPath, "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const coreMetadata = existsSync("me3-core.json")
  ? JSON.parse(readFileSync("me3-core.json", "utf8"))
  : {};
const deployButtonScript = packageJson.scripts?.deploy || "";
const deployScript = packageJson.scripts?.["deploy:cloudflare"] || "";
const deployPreparesResources = /deploy:prepare/.test(deployScript);
const deployButtonPreparesResources = /deploy:prepare/.test(deployButtonScript);

check(
  "Core version metadata exists",
  Boolean(coreMetadata.version),
  'Expected me3-core.json with a "version" field.',
);
check(
  "Core update manifest URL is set",
  Boolean(coreMetadata.updateManifestUrl),
  'Expected me3-core.json with an "updateManifestUrl" field.',
);

check("wrangler.toml exists", true, configPath);
check(
  "Worker entrypoint is Core",
  /main\s*=\s*"apps\/worker\/src\/index\.ts"/.test(config),
  'Expected main = "apps/worker/src/index.ts".',
);
check(
  "Static web assets binding is configured",
  /\[assets\][\s\S]*directory\s*=\s*"apps\/web\/dist"[\s\S]*binding\s*=\s*"ASSETS"/.test(config),
  'Expected [assets] with directory = "apps/web/dist" and binding = "ASSETS".',
);

const d1Block = getTomlArrayBlock(config, "d1_databases", "DB");
const d1DatabaseName = getTomlString(d1Block, "database_name");
const d1DatabaseId = getTomlString(d1Block, "database_id");
check(
  "D1 DB binding exists or deploy script prepares it",
  Boolean(d1Block) || deployPreparesResources,
  'Expected [[d1_databases]] with binding = "DB", or pnpm deploy:cloudflare to run deploy:prepare.',
);
if (d1Block) {
  check("D1 database name is set", Boolean(d1DatabaseName), "Expected D1 database_name.");
  check(
    "D1 database id is provisioned",
    Boolean(d1DatabaseId) && (args.allowTemplate || d1DatabaseId !== D1_PLACEHOLDER),
    args.allowTemplate
      ? "Template placeholder allowed."
      : "Expected a real D1 database_id. The deploy prepare script should provision this before migrations.",
  );
  check(
    "D1 migrations directory is set",
    getTomlString(d1Block, "migrations_dir") === "apps/worker/migrations",
    'Expected migrations_dir = "apps/worker/migrations".',
  );
}

const r2Block = getTomlArrayBlock(config, "r2_buckets", "SITE_ASSETS");
check(
  "R2 SITE_ASSETS binding exists or deploy script prepares it",
  Boolean(r2Block) || deployPreparesResources,
  'Expected [[r2_buckets]] with binding = "SITE_ASSETS", or pnpm deploy:cloudflare to run deploy:prepare.',
);
if (r2Block) {
  check("R2 bucket name is set", Boolean(getTomlString(r2Block, "bucket_name")), "Expected R2 bucket_name.");
}

const emailSendBlock = getTomlNamedBlock(config, "send_email", "EMAIL");
if (emailSendBlock) {
  check("Optional Cloudflare Email Service send binding is valid", true);
}

const durableObjectBlock = getTomlArrayBlock(config, "durable_objects.bindings", "ME3_USER_AGENT");
check(
  "ME3_USER_AGENT Durable Object binding exists",
  Boolean(durableObjectBlock),
  'Expected [[durable_objects.bindings]] with name = "ME3_USER_AGENT".',
);
check(
  "ME3_USER_AGENT Durable Object class is set",
  getTomlString(durableObjectBlock, "class_name") === "Me3UserAgent",
  'Expected class_name = "Me3UserAgent".',
);
check(
  "Durable Object migration is present",
  /\[\[migrations\]\][\s\S]*new_sqlite_classes\s*=\s*\[[^\]]*"Me3UserAgent"[^\]]*\]/.test(config),
  'Expected [[migrations]] new_sqlite_classes = ["Me3UserAgent"].',
);

check(
  "Deploy button script relies on Cloudflare resource provisioning",
  !deployButtonPreparesResources &&
    /db:migrations:apply/.test(deployButtonScript) &&
    /wrangler deploy/.test(deployButtonScript),
  "Expected package.json scripts.deploy for the Cloudflare deploy form to apply migrations and deploy without running deploy:prepare. Manual use should still prefer pnpm deploy:cloudflare.",
);
check(
  "Cloudflare deploy script is available",
  Boolean(deployScript),
  "Expected package.json scripts.deploy:cloudflare.",
);
check(
  "Deploy script prepares Cloudflare resources before migrations",
  /deploy:prepare/.test(deployScript) &&
    deployScript.indexOf("deploy:prepare") < deployScript.indexOf("db:migrations:apply"),
  "Expected pnpm deploy:cloudflare to run deploy:prepare before db:migrations:apply.",
);
check(
  "Deploy script applies migrations before deploy",
  /db:migrations:apply/.test(deployScript),
  "Expected pnpm deploy:cloudflare to run db:migrations:apply.",
);
check(
  "Update checker script is available",
  Boolean(packageJson.scripts?.["update:check"]),
  "Expected package.json scripts.update:check.",
);
check(
  "Core update script is available",
  Boolean(packageJson.scripts?.["update:core"]),
  "Expected package.json scripts.update:core.",
);

if (args.json) {
  console.log(JSON.stringify({ ok: checks.every((item) => item.ok), checks }, null, 2));
} else {
  for (const item of checks) {
    console.log(`${item.ok ? "ok" : "fail"} - ${item.label}${item.detail ? `: ${item.detail}` : ""}`);
  }
}

if (checks.some((item) => !item.ok)) {
  process.exitCode = 1;
} else if (!args.json) {
  console.log("");
  console.log("ME3 Core update doctor passed.");
}

function parseArgs(values) {
  const parsed = {
    allowTemplate: false,
    config: "",
    json: false,
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") {
      continue;
    } else if (value === "--allow-template") {
      parsed.allowTemplate = true;
    } else if (value === "--json") {
      parsed.json = true;
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

function check(label, ok, detail = "") {
  checks.push({ label, ok, detail: ok ? "" : detail });
}

function getTomlArrayBlock(value, blockName, bindingValue) {
  const blockPattern = new RegExp(`\\n\\[\\[${escapeRegExp(blockName)}\\]\\][\\s\\S]*?(?=\\n\\[|$)`, "g");
  const key = blockName === "durable_objects.bindings" ? "name" : "binding";
  const blocks = value.match(blockPattern) || [];
  return blocks.find((block) => getTomlString(block, key) === bindingValue) || "";
}

function getTomlNamedBlock(value, blockName, nameValue) {
  const blockPattern = new RegExp(`\\n\\[\\[${escapeRegExp(blockName)}\\]\\][\\s\\S]*?(?=\\n\\[|$)`, "g");
  const blocks = value.match(blockPattern) || [];
  return blocks.find((block) => getTomlString(block, "name") === nameValue) || "";
}

function getTomlString(block, key) {
  if (!block) return "";
  return block.match(new RegExp(`${escapeRegExp(key)}\\s*=\\s*"([^"]+)"`))?.[1] || "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
