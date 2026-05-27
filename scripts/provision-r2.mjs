#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_BUCKET = "me3-site-assets";
const DEFAULT_CONFIG = "wrangler.toml";
const BINDING = "SITE_ASSETS";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || DEFAULT_CONFIG;

if (!existsSync(configPath)) {
  fail(`Could not find ${configPath}. Run this from the ME3 Core repo root.`);
}

const before = readFileSync(configPath, "utf8");
const existingBucketName = getExistingR2BucketName(before);
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

const after = ensureR2Binding(before, bucketName);

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

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) return;

  const outputText = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (/already exists|bucket.*exists/i.test(outputText)) {
    console.log(`R2 bucket ${bucketName} already exists; continuing.`);
    return;
  }

  fail(
    "Could not create the R2 bucket. Make sure Wrangler is logged in, or rerun with --skip-create if the bucket already exists.",
  );
}

function ensureR2Binding(config, bucketName) {
  const activeBlockPattern =
    /\n\[\[r2_buckets\]\]\n(?:[^\n]*\n)*?binding\s*=\s*"SITE_ASSETS"(?:\n[^\[]*)?/;

  if (activeBlockPattern.test(config)) {
    return config.replace(activeBlockPattern, (block) => {
      if (/bucket_name\s*=/.test(block)) {
        return block.replace(
          /bucket_name\s*=\s*"[^"]*"/,
          `bucket_name = "${bucketName}"`,
        );
      }
      return `${block.trimEnd()}\nbucket_name = "${bucketName}"\n`;
    });
  }

  const commentedExamplePattern =
    /# Optional large-site media storage\.[\s\S]*?# bucket_name = "me3-site-assets"\n?/;
  const activeBlock = [
    "# Optional large-site media storage.",
    "[[r2_buckets]]",
    `binding = "${BINDING}"`,
    `bucket_name = "${bucketName}"`,
    "",
  ].join("\n");

  if (commentedExamplePattern.test(config)) {
    return config.replace(commentedExamplePattern, activeBlock);
  }

  const assetsIndex = config.indexOf("\n[assets]");
  if (assetsIndex !== -1) {
    return `${config.slice(0, assetsIndex)}\n${activeBlock}${config.slice(assetsIndex)}`;
  }

  return `${config.trimEnd()}\n\n${activeBlock}`;
}

function getExistingR2BucketName(config) {
  const blockMatch = config.match(
    /\n\[\[r2_buckets\]\]\n(?:(?!\n\[)[\s\S])*?binding\s*=\s*"SITE_ASSETS"(?:(?!\n\[)[\s\S])*/,
  );
  if (!blockMatch) return "";
  return blockMatch[0].match(/bucket_name\s*=\s*"([^"]+)"/)?.[1] || "";
}

function isValidBucketName(value) {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
