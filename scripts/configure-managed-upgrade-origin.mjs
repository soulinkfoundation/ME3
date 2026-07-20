#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function configureManagedUpgradeOrigin({
  configPath,
  workerName,
  publicOrigin,
  canonicalHostname,
}) {
  const hostname = String(canonicalHostname || "").trim().toLowerCase();
  const origin = String(publicOrigin || "").trim();
  if (
    !/^me3-mi-[0-9a-f]{16}$/.test(workerName || "") ||
    !/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]\.me3\.app$/.test(hostname) ||
    origin !== `https://${hostname}`
  ) {
    throw new Error("managed upgrade origin contract is invalid");
  }
  let config = readFileSync(configPath, "utf8");
  if (
    !new RegExp(`^name\\s*=\\s*"${workerName}"$`, "m").test(config) ||
    !/^ME3_DEPLOYMENT_MODE\s*=\s*"managed"$/m.test(config)
  ) {
    throw new Error("managed upgrade origin config is invalid");
  }
  for (const key of ["CORE_WEB_ORIGIN", "CORE_API_ORIGIN"]) {
    const pattern = new RegExp(`^${key}\\s*=.*$`, "gm");
    const matches = [...config.matchAll(pattern)];
    if (matches.length > 1) {
      throw new Error("managed upgrade origin config is invalid");
    }
    if (matches.length === 1) {
      config = config.replace(pattern, `${key} = "${origin}"`);
    } else {
      config = config.replace(
        /^ME3_DEPLOYMENT_MODE\s*=.*$/m,
        (line) => `${line}\n${key} = "${origin}"`,
      );
    }
  }
  writeFileSync(configPath, config);
  return { workerName, publicOrigin: origin, canonicalHostname: hostname };
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--") || !values[index + 1]) {
      throw new Error("invalid argument");
    }
    parsed[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function required(args, key) {
  if (!args[key]) throw new Error(`--${key} is required`);
  return args[key];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    JSON.stringify(
      configureManagedUpgradeOrigin({
        configPath: required(args, "config"),
        workerName: required(args, "worker-name"),
        publicOrigin: required(args, "public-origin"),
        canonicalHostname: required(args, "canonical-hostname"),
      }),
    ),
  );
}
