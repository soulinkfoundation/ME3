import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(path.join(rootDir, ".github/workflows/update-core.yml"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));

test("copied-repository updates migrate before push and deployment", () => {
  const update = getStep("Update ME3 Core");
  const migrations = getStep("Apply database migrations");
  const push = getStep("Commit and push Core update");
  const deploy = getStep("Deploy to Cloudflare");

  assert.match(update, /wrangler\.toml merge=me3-install-ours/);
  assert.match(migrations, /pnpm db:migrations:apply/);
  assert.match(deploy, /wrangler deploy --config wrangler\.toml/);
  assert.doesNotMatch(`${migrations}\n${deploy}`, /deploy:prepare/);
  assert.ok(workflow.indexOf(migrations) < workflow.indexOf(push));
  assert.ok(workflow.indexOf(push) < workflow.indexOf(deploy));
  assert.doesNotMatch(migrations, /continue-on-error:\s*true/);

  const workersBuildDeploy = packageJson.scripts.deploy;
  assert.ok(
    workersBuildDeploy.indexOf("db:migrations:apply") <
      workersBuildDeploy.indexOf("wrangler deploy"),
  );
});

test("a failed migration stops the deployment gate", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "me3-update-workflow-"));
  const pnpm = path.join(directory, "pnpm");
  writeFileSync(pnpm, "#!/bin/sh\nexit 23\n");
  chmodSync(pnpm, 0o755);

  try {
    const result = spawnSync("bash", ["-c", getRunScript("Apply database migrations")], {
      cwd: rootDir,
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      encoding: "utf8",
    });

    assert.equal(result.status, 23);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function getStep(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `Missing workflow step: ${name}`);
  const end = workflow.indexOf("\n      - name: ", start + 1);
  return workflow.slice(start, end === -1 ? undefined : end);
}

function getRunScript(name) {
  const marker = "        run: |\n";
  const block = getStep(name);
  const start = block.indexOf(marker);
  assert.notEqual(start, -1, `Missing run script: ${name}`);
  return block
    .slice(start + marker.length)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}
