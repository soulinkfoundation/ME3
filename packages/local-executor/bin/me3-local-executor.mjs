#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

const providerPresets = {
  opencode: {
    command: "opencode",
    args: ["run", "--dir", "{repo}", "--format", "json", "{prompt}"],
  },
  codex: {
    command: "codex",
    args: ["exec", "--json", "--sandbox", "workspace-write", "--cd", "{repo}", "{prompt}"],
  },
  claude: {
    command: "claude",
    args: ["-p", "--output-format", "stream-json", "{prompt}"],
    cwd: "{repo}",
  },
};

const defaultConfig = {
  runnerId: "my-desktop",
  apiBase: "https://example.com/api/local-executor",
  tokenStore: "~/.me3/local-executor/token.json",
  logDir: "~/.me3/local-executor/runs",
  pollIntervalSeconds: 20,
  maxConcurrentRuns: 1,
  providers: providerPresets,
};

const args = process.argv.slice(2);
const command = args[0] || "help";

try {
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else if (command === "config") {
    await handleConfig(args.slice(1));
  } else if (command === "providers") {
    console.log(JSON.stringify(providerPresets, null, 2));
  } else if (command === "render") {
    handleRender(args.slice(1));
  } else if (command === "pair") {
    await handlePair(args.slice(1));
  } else if (command === "once") {
    await handleOnce(args.slice(1));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function printHelp() {
  console.log(`me3-local-executor

Commands:
  config show|init       Print or create the local runner config
  providers              Print OpenCode, Codex, and Claude presets
  render                 Render a provider command for inspection
  pair                   Complete pairing with ME3 Core and store the daemon token
  once                   Heartbeat, claim one approved run, execute it, and report completion
`);
}

async function handleConfig(argv) {
  const action = argv[0] || "show";
  const configPath = expandPath(readFlag(argv, "--path") || "~/.me3/local-executor/config.json");
  if (action === "show") {
    console.log(JSON.stringify(defaultConfig, null, 2));
    return;
  }
  if (action !== "init") throw new Error("Usage: me3-local-executor config show|init");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote ${configPath}`);
}

function handleRender(argv) {
  const provider = readFlag(argv, "--provider") || "opencode";
  const repo = readFlag(argv, "--repo") || process.cwd();
  const prompt = readFlag(argv, "--prompt") || "Summarize the project.";
  console.log(JSON.stringify(renderProviderCommand(provider, repo, prompt), null, 2));
}

async function handlePair(argv) {
  const apiBase = requiredFlag(argv, "--api");
  const code = requiredFlag(argv, "--code");
  const runnerId = readFlag(argv, "--runner-id") || defaultConfig.runnerId;
  const displayName = readFlag(argv, "--name") || runnerId;
  const tokenStore = expandPath(readFlag(argv, "--token-store") || defaultConfig.tokenStore);
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/daemon/pairing/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      runnerId,
      displayName,
      version: "0.1.0",
      platform: platform(),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Pairing failed with ${response.status}`);
  await mkdir(dirname(tokenStore), { recursive: true });
  await writeFile(tokenStore, `${JSON.stringify(payload.token, null, 2)}\n`, { mode: 0o600 });
  console.log(`Paired ${payload.runner?.displayName || displayName}`);
}

async function handleOnce(argv) {
  const configPath = expandPath(readFlag(argv, "--config") || "~/.me3/local-executor/config.json");
  const config = await readJson(configPath).catch(() => defaultConfig);
  const tokenStore = expandPath(config.tokenStore || defaultConfig.tokenStore);
  const tokenRecord = await readJson(tokenStore);
  const apiBase = String(config.apiBase || defaultConfig.apiBase).replace(/\/$/, "");
  const authHeaders = {
    Authorization: `Bearer ${tokenRecord.token}`,
    "Content-Type": "application/json",
  };

  await fetch(`${apiBase}/daemon/heartbeat`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      version: "0.1.0",
      platform: platform(),
      health: { pid: process.pid },
      activePolicies: [],
    }),
  });

  const claimResponse = await fetch(`${apiBase}/daemon/runs/claim`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ maxRuns: 1 }),
  });
  const claim = await claimResponse.json().catch(() => ({}));
  if (!claimResponse.ok) throw new Error(claim.error || `Claim failed with ${claimResponse.status}`);
  if (!claim.run) {
    console.log("No approved Local Executor runs to claim.");
    return;
  }

  const run = claim.run;
  const provider = config.providers?.[run.provider] || providerPresets[run.provider] || providerPresets.opencode;
  const rendered = renderProviderCommand(provider, run.policy.pathHint, run.prompt);
  const logDir = expandPath(config.logDir || defaultConfig.logDir);
  await mkdir(logDir, { recursive: true });
  const startedAt = Date.now();
  const output = await executeBounded(rendered, run.policy.caps?.maxRuntimeSeconds || 1800);
  const boundedOutput = output.stdout.slice(0, run.policy.caps?.maxOutputChars || 24000);
  const status = output.code === 0 ? "succeeded" : "failed";

  await writeFile(
    join(logDir, `${run.id}.log`),
    boundedOutput + (output.stderr ? `\n\nSTDERR\n${output.stderr}` : ""),
    { mode: 0o600 },
  );

  const completeResponse = await fetch(`${apiBase}/daemon/runs/${encodeURIComponent(run.id)}/complete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      status,
      summary: status === "succeeded" ? "Local run completed." : "Local run failed.",
      outputPreview: boundedOutput,
      errorCode: status === "failed" ? "process_failed" : null,
      errorMessage: status === "failed" ? output.stderr.slice(0, 2000) : null,
      runtimeSeconds: Math.ceil((Date.now() - startedAt) / 1000),
      changedFiles: [],
      qualityGates: [],
      artifacts: [{ kind: "local_log", path: `${run.id}.log`, bytes: boundedOutput.length }],
    }),
  });
  const complete = await completeResponse.json().catch(() => ({}));
  if (!completeResponse.ok) throw new Error(complete.error || `Complete failed with ${completeResponse.status}`);
  console.log(JSON.stringify(complete.run, null, 2));
}

function renderProviderCommand(provider, repo, prompt) {
  const preset = typeof provider === "string" ? providerPresets[provider] : provider;
  if (!preset) throw new Error("Unknown provider preset");
  const input = { repo, prompt };
  return {
    command: preset.command,
    args: preset.args.map((arg) => renderTemplate(arg, input)),
    cwd: renderTemplate(preset.cwd || repo, input),
  };
}

function executeBounded(command, timeoutSeconds) {
  return new Promise((resolvePromise) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: false,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutSeconds * 1000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolvePromise({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ code: 1, stdout, stderr: error.message });
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function renderTemplate(template, input) {
  return template.replaceAll("{repo}", input.repo).replaceAll("{prompt}", input.prompt);
}

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function requiredFlag(argv, flag) {
  const value = readFlag(argv, flag);
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

function expandPath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}
