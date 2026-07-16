#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const [configPath, workerName, workersDevText] = process.argv.slice(2);
if (!configPath || !workerName || !/^(true|false)$/.test(workersDevText || "")) {
  throw new Error(
    "usage: configure-managed-install.mjs <wrangler.toml> <worker-name> <true|false>",
  );
}
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(workerName)) {
  throw new Error("managed Worker name is invalid");
}

const routes = {
  ME3_AI_CHAT_PROVIDER: "workers-ai",
  ME3_AI_CHAT_MODEL: "@cf/google/gemma-4-26b-a4b-it",
  ME3_AI_CHAT_BACKUP_MODEL: "@cf/zai-org/glm-4.7-flash",
  ME3_AI_REASONING_PROVIDER: "workers-ai",
  ME3_AI_REASONING_MODEL: "@cf/zai-org/glm-5.2",
};

let config = readFileSync(configPath, "utf8");
if (!/^name\s*=\s*"[^"]+"/m.test(config)) throw new Error("top-level Worker name missing");
if (!/^ME3_DEPLOYMENT_MODE\s*=.*$/m.test(config)) {
  throw new Error("ME3_DEPLOYMENT_MODE assignment missing");
}
if (/^\s*ME3_AI_RAW_MODEL_SELECTION_ENABLED\s*=/m.test(config)) {
  throw new Error("raw model selection must be absent in a managed install");
}

config = config.replace(/^name\s*=\s*"[^"]+"/m, `name = "${workerName}"`);
config = config.replace(/^ME3_DEPLOYMENT_MODE\s*=.*$/m, 'ME3_DEPLOYMENT_MODE = "managed"');

for (const [key, value] of Object.entries(routes).reverse()) {
  const pattern = new RegExp(`^${key}\\s*=.*$`, "gm");
  const matches = [...config.matchAll(pattern)];
  if (matches.length > 1) throw new Error(`duplicate ${key} assignment`);
  if (matches.length === 1) {
    config = config.replace(pattern, `${key} = "${value}"`);
  } else {
    config = config.replace(
      /^ME3_DEPLOYMENT_MODE\s*=.*$/m,
      (line) => `${line}\n${key} = "${value}"`,
    );
  }
}

if (/^workers_dev\s*=/m.test(config)) {
  config = config.replace(/^workers_dev\s*=.*$/m, `workers_dev = ${workersDevText}`);
} else {
  config = config.replace(/^(name\s*=.*)$/m, `$1\nworkers_dev = ${workersDevText}`);
}

writeFileSync(configPath, config);
