#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function provisionManagedQueues({
  queueNames,
  workerName,
  configPath,
  run = runWrangler,
}) {
  const names = normalizeQueueNames(queueNames, workerName);
  for (const name of names) {
    const created = run(["queues", "create", name, "--config", configPath]);
    if (!created.ok && !/already exists/i.test(created.output)) {
      throw new Error(`managed queue provisioning failed: ${name}`);
    }
    const verified = run(["queues", "info", name, "--config", configPath]);
    if (!verified.ok) throw new Error(`managed queue verification failed: ${name}`);
  }
  return names;
}

function normalizeQueueNames(value, workerName) {
  let names;
  try {
    names = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("managed queue manifest is invalid");
  }
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(workerName || "") ||
    !Array.isArray(names) ||
    names.length === 0 ||
    names.some(
      (name) =>
        typeof name !== "string" ||
        !name.startsWith(`${workerName}-`) ||
        !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name),
    ) ||
    new Set(names).size !== names.length
  ) {
    throw new Error("managed queue manifest is invalid");
  }
  return [...names].sort();
}

function runWrangler(args) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], { encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}\n${result.stderr || ""}`,
  };
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--") || !values[index + 1]) throw new Error("invalid argument");
    parsed[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const queues = provisionManagedQueues({
    queueNames: args["queue-names"],
    workerName: args["worker-name"],
    configPath: args.config,
  });
  console.log(JSON.stringify({ ok: true, queueNames: queues }));
}
