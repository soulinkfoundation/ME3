import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./configure-managed-install.mjs", import.meta.url);

test("configures a private managed Worker without raw model selection", () => {
  const directory = mkdtempSync(join(tmpdir(), "me3-managed-config-"));
  const configPath = join(directory, "wrangler.toml");
  writeFileSync(
    configPath,
    [
      'name = "my-me3"',
      "",
      "[vars]",
      'ME3_DEPLOYMENT_MODE = "self_hosted"',
      "",
    ].join("\n"),
  );

  try {
    execFileSync(process.execPath, [script.pathname, configPath, "me3-mi-1234567890abcdef", "false"]);
    const output = readFileSync(configPath, "utf8");
    assert.match(output, /^name = "me3-mi-1234567890abcdef"$/m);
    assert.match(output, /^workers_dev = false$/m);
    assert.match(output, /^ME3_DEPLOYMENT_MODE = "managed"$/m);
    assert.match(output, /^ME3_AI_CHAT_PROVIDER = "workers-ai"$/m);
    assert.match(output, /^ME3_AI_CHAT_MODEL = "@cf\/google\/gemma-4-26b-a4b-it"$/m);
    assert.doesNotMatch(output, /ME3_AI_RAW_MODEL_SELECTION_ENABLED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("refuses raw model selection in a managed config", () => {
  const directory = mkdtempSync(join(tmpdir(), "me3-managed-config-"));
  const configPath = join(directory, "wrangler.toml");
  writeFileSync(
    configPath,
    'name = "my-me3"\n[vars]\nME3_DEPLOYMENT_MODE = "self_hosted"\nME3_AI_RAW_MODEL_SELECTION_ENABLED = "true"\n',
  );

  try {
    const result = spawnSync(
      process.execPath,
      [script.pathname, configPath, "me3-mi-1234567890abcdef", "true"],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /raw model selection must be absent/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
