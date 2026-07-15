#!/usr/bin/env node
import { spawn } from "node:child_process";

const confirmation = "I_UNDERSTAND_LIVE_PROVIDER_COSTS";

if (process.env.ME3_MODEL_EVAL_CONFIRM !== confirmation) {
  console.error(
    `Live model evaluation is disabled. Set ME3_MODEL_EVAL_CONFIRM=${confirmation} to acknowledge real provider calls and costs.`,
  );
  process.exit(1);
}

const child = spawn(
  "pnpm",
  [
    "--filter",
    "@me3-core/worker",
    "exec",
    "vitest",
    "run",
    "src/model-evaluation.live.test.ts",
    "--reporter=verbose",
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ME3_MODEL_EVAL_RUN: "1" },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(`Could not start live model evaluation: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
