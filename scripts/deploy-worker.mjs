#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { prepareDeployConfig } from "./lib/deploy-config.mjs";

try {
  const result = await prepareDeployConfig();
  if (result.generated) {
    console.log(`Using generated Wrangler config: ${result.configPathRelative}`);
  }

  run("pnpm", ["exec", "wrangler", "deploy", "--config", result.configPath]);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status === 0) return;
  process.exit(result.status || 1);
}
