#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants, createWriteStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";

const defaultConfigPath = "~/.me3/local-executor/config.json";
const defaultRunnerId = "my-desktop";

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
  defaultProviderPreset: "opencode",
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
  } else if (command === "run" || command === "daemon") {
    await handleRun(args.slice(1));
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
  run                    Keep polling for approved runs until stopped

Options:
  config init --provider <opencode|codex|claude>
                          Create local config with a default provider
  pair --api <url>       ME3 Core Local Executor API URL
  pair --token-store <path>
                          Override where the pairing token is saved
  once --api <url>       Override the saved API URL
  once --config <path>   Override the local runner config path
  once --provider <id>   Override the local default provider for this run
  run --interval <sec>   Poll interval for long-running mode
`);
}

async function handleConfig(argv) {
  const action = argv[0] || "show";
  const configPath = expandPath(readFlag(argv, "--path") || defaultConfigPath);
  if (action === "show") {
    console.log(JSON.stringify(defaultConfig, null, 2));
    return;
  }
  if (action !== "init") throw new Error("Usage: me3-local-executor config show|init");
  const provider = normalizeProviderId(readFlag(argv, "--provider") || defaultConfig.defaultProviderPreset);
  if (!provider) throw new Error("Unknown provider preset. Use opencode, codex, or claude.");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify({ defaultProviderPreset: provider }, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(`Wrote ${configPath}`);
  console.log(`Pairing tokens and run logs will live next to it by default.`);
}

function handleRender(argv) {
  const provider = readFlag(argv, "--provider") || "opencode";
  const repo = readFlag(argv, "--repo") || process.cwd();
  const prompt = readFlag(argv, "--prompt") || "Summarize the project.";
  console.log(JSON.stringify(renderProviderCommand(provider, repo, prompt), null, 2));
}

async function handlePair(argv) {
  const apiBase = requiredFlag(argv, "--api").replace(/\/$/, "");
  const code = requiredFlag(argv, "--code");
  const runnerId = readFlag(argv, "--runner-id") || defaultRunnerId;
  const displayName = readFlag(argv, "--name") || runnerId;
  const tokenStore = readFlag(argv, "--token-store")
    ? expandPath(readFlag(argv, "--token-store"))
    : defaultTokenStorePath();
  const response = await fetch(`${apiBase}/daemon/pairing/complete`, {
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
  const savedToken = {
    ...payload.token,
    apiBase,
    pairedAt: new Date().toISOString(),
  };
  await writeFile(
    tokenStore,
    `${JSON.stringify(savedToken, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(`Paired ${payload.runner?.displayName || displayName}`);
  console.log(`Saved runner token to ${tokenStore}`);
  console.log(`Run one approved job with: ${selfCommand("once")}`);
}

async function handleOnce(argv) {
  const runtime = await loadRuntime(argv);
  const providerOverride = readFlag(argv, "--provider");
  await preflightRuntime(runtime, providerOverride);
  const result = await claimAndExecuteOne(runtime, {
    providerOverride,
    noRunMessage: "No approved Local Executor runs to claim.",
  });
  if (result.cancelled) process.exitCode = 130;
}

async function handleRun(argv) {
  const runtime = await loadRuntime(argv);
  const providerOverride = readFlag(argv, "--provider");
  await preflightRuntime(runtime, providerOverride);
  const intervalSeconds = readPositiveInt(
    readFlag(argv, "--interval") || runtime.config.pollIntervalSeconds,
    20,
  );
  const stop = createStopController();
  console.log(`Local Executor runner started. Polling every ${intervalSeconds}s. Press Ctrl-C to stop.`);
  try {
    while (!stop.requested()) {
      const result = await claimAndExecuteOne(runtime, {
        providerOverride,
        quietWhenEmpty: true,
      });
      if (result.cancelled) {
        stop.request("SIGINT");
        break;
      }
      if (!result.claimed && !stop.requested()) {
        console.log(`No approved runs. Checking again in ${intervalSeconds}s.`);
        await stop.wait(intervalSeconds * 1000);
      }
    }
  } finally {
    stop.cleanup();
  }
  console.log("Local Executor runner stopped.");
  if (stop.signal()) process.exitCode = 130;
}

async function loadRuntime(argv) {
  const configPath = expandPath(readFlag(argv, "--config") || defaultConfigPath);
  const config = await readJson(configPath).catch(() => defaultConfig);
  const tokenStore = resolveLocalConfigPath(config.tokenStore, configPath, "token.json");
  const tokenRecord = await readJson(tokenStore).catch((error) => {
    throw new Error(
      `No runner token found at ${tokenStore}. Pair this computer first, then run once again. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  const configuredApiBase = readFlag(argv, "--api") || tokenRecord.apiBase || config.apiBase;
  if (!configuredApiBase || String(configuredApiBase).includes("example.com")) {
    throw new Error(
      "No ME3 Core API URL is configured. Pair again from Account > Plugins > Local Executor, " +
        "or run once with --api http://localhost:8787/api/local-executor.",
    );
  }
  const apiBase = String(configuredApiBase).replace(/\/$/, "");
  const authHeaders = {
    Authorization: `Bearer ${tokenRecord.token}`,
    "Content-Type": "application/json",
  };
  return { configPath, config, tokenStore, tokenRecord, apiBase, authHeaders };
}

async function preflightRuntime(runtime, providerOverride) {
  const providerId = resolveProviderId(runtime, providerOverride);
  const provider = resolveProvider(runtime, providerId);
  const command = String(provider.command || "").trim();
  if (!command) {
    throw new Error(`Provider ${providerId} does not define a command.`);
  }
  const executable = await findExecutable(command);
  if (!executable) {
    throw new Error(
      `Provider command "${command}" was not found on PATH. Install ${providerId}, ` +
        `or run config init --provider opencode|codex|claude and choose an installed tool.`,
    );
  }
  console.log(`Provider ready: ${providerId}`);
}

async function claimAndExecuteOne(runtime, options = {}) {
  console.log("Checking in with ME3...");
  const heartbeatResponse = await fetch(`${runtime.apiBase}/daemon/heartbeat`, {
    method: "POST",
    headers: runtime.authHeaders,
    body: JSON.stringify({
      version: "0.1.0",
      platform: platform(),
      health: { pid: process.pid },
      activePolicies: [],
    }),
  });
  const heartbeat = await heartbeatResponse.json().catch(() => ({}));
  if (!heartbeatResponse.ok) {
    throw new Error(
      heartbeat.error || `Heartbeat failed with ${heartbeatResponse.status}`,
    );
  }

  console.log("Looking for one approved Local Executor run...");
  const claimResponse = await fetch(`${runtime.apiBase}/daemon/runs/claim`, {
    method: "POST",
    headers: runtime.authHeaders,
    body: JSON.stringify({ maxRuns: 1 }),
  });
  const claim = await claimResponse.json().catch(() => ({}));
  if (!claimResponse.ok) {
    throw new Error(claim.error || `Claim failed with ${claimResponse.status}`);
  }
  if (!claim.run) {
    if (!options.quietWhenEmpty) {
      console.log(options.noRunMessage || "No approved Local Executor runs to claim.");
    }
    return { claimed: false, cancelled: false };
  }

  const run = claim.run;
  const runLabel = run.promptSummary || summarizePrompt(run.prompt) || run.id;
  console.log(`Claimed run ${run.id}: ${runLabel}`);
  return executeClaimedRun(runtime, run, options.providerOverride);
}

async function executeClaimedRun(runtime, run, providerOverride) {
  const providerId = resolveProviderId(runtime, providerOverride, run.provider);
  const provider = resolveProvider(runtime, providerId);
  const rendered = renderProviderCommand(provider, run.policy.pathHint, run.prompt);
  const logDir = resolveLocalConfigPath(runtime.config.logDir, runtime.configPath, "runs");
  await mkdir(logDir, { recursive: true });
  const logPath = join(logDir, `${run.id}.log`);
  console.log(`Running ${providerId} in ${rendered.cwd}`);
  console.log(`Local log: ${logPath}`);
  await appendRunEvent(runtime.apiBase, runtime.authHeaders, run.id, {
    eventType: "provider_started",
    message: `Started ${providerId} locally.`,
    payload: { providerId, cwd: rendered.cwd },
  });
  const startedAt = Date.now();
  const log = createRunLog(logPath);
  const output = await executeBounded(rendered, run.policy.caps?.maxRuntimeSeconds || 1800, { log });
  await log.close();
  const combinedOutput = output.stdout + (output.stderr ? `\n\nSTDERR\n${output.stderr}` : "");
  const boundedOutput = combinedOutput.slice(0, run.policy.caps?.maxOutputChars || 24000);
  const status = output.cancelled ? "cancelled" : output.code === 0 ? "succeeded" : "failed";

  if (output.cancelled) {
    console.log("Run cancelled locally. Reporting cancellation to ME3...");
  } else if (output.timedOut) {
    console.log("Run timed out locally. Reporting failure to ME3...");
  } else {
    console.log(`Provider exited with code ${output.code ?? "unknown"}. Reporting ${status} to ME3...`);
  }

  const completeResponse = await fetch(
    `${runtime.apiBase}/daemon/runs/${encodeURIComponent(run.id)}/complete`,
    {
      method: "POST",
      headers: runtime.authHeaders,
      body: JSON.stringify({
        status,
        summary:
          status === "succeeded"
            ? "Local run completed."
            : status === "cancelled"
              ? "Local run cancelled on the runner."
              : "Local run failed.",
        outputPreview: boundedOutput,
        errorCode:
          status === "cancelled"
            ? "runner_cancelled"
            : output.timedOut
              ? "timeout"
              : status === "failed"
                ? "process_failed"
                : null,
        errorMessage:
          status === "cancelled"
            ? "The local runner was interrupted before completion."
            : status === "failed"
              ? (output.stderr || output.stdout).slice(0, 2000)
              : null,
        runtimeSeconds: Math.ceil((Date.now() - startedAt) / 1000),
        changedFiles: [],
        qualityGates: [],
        artifacts: [
          { kind: "local_log", path: `${run.id}.log`, bytes: boundedOutput.length },
        ],
      }),
    },
  );
  const complete = await completeResponse.json().catch(() => ({}));
  if (!completeResponse.ok) {
    throw new Error(
      complete.error || `Complete failed with ${completeResponse.status}`,
    );
  }
  console.log(`Reported ${complete.run?.status || status} to ME3.`);
  console.log(JSON.stringify(complete.run, null, 2));
  return { claimed: true, cancelled: Boolean(output.cancelled), status };
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

function normalizeProviderId(value) {
  return value === "opencode" || value === "codex" || value === "claude" ? value : null;
}

function resolveProviderId(runtime, providerOverride, runProvider) {
  if (providerOverride && !normalizeProviderId(providerOverride)) {
    throw new Error("Unknown provider preset. Use opencode, codex, or claude.");
  }
  if (
    runtime.config.defaultProviderPreset !== undefined &&
    runtime.config.defaultProviderPreset !== null &&
    !normalizeProviderId(runtime.config.defaultProviderPreset)
  ) {
    throw new Error("Unknown default provider preset. Use opencode, codex, or claude.");
  }
  return (
    normalizeProviderId(providerOverride) ||
    normalizeProviderId(runtime.config.defaultProviderPreset) ||
    normalizeProviderId(runProvider) ||
    defaultConfig.defaultProviderPreset
  );
}

function resolveProvider(runtime, providerId) {
  return runtime.config.providers?.[providerId] || providerPresets[providerId] || providerPresets.opencode;
}

async function findExecutable(command) {
  if (command.includes("/") || command.includes("\\")) {
    const candidate = isAbsolute(command) ? command : resolve(process.cwd(), command);
    return (await isExecutable(candidate)) ? candidate : null;
  }

  const pathEntries = String(process.env.PATH || "").split(delimiter).filter(Boolean);
  const extensions =
    platform() === "win32"
      ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(entry, `${command}${extension}`);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

async function isExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executeBounded(command, timeoutSeconds, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: false,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let cancelledSignal = null;
    let killTimer = null;
    const onSigint = () => onSignal("SIGINT");
    const onSigterm = () => onSignal("SIGTERM");
    const cleanup = () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };
    const resolveOnce = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(result);
    };
    const terminateChild = () => {
      if (child.exitCode !== null || child.killed) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 2000);
      killTimer.unref?.();
    };
    const onSignal = (signal) => {
      if (!cancelledSignal) {
        cancelledSignal = signal;
        console.log(`Received ${signal}. Stopping provider so ME3 can be updated...`);
      }
      terminateChild();
    };
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateChild();
    }, timeoutSeconds * 1000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.log?.writeStdout(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.log?.writeStderr(text);
    });
    child.on("close", (code, signal) => {
      resolveOnce({
        code,
        signal,
        stdout,
        stderr,
        cancelled: Boolean(cancelledSignal),
        timedOut,
      });
    });
    child.on("error", (error) => {
      resolveOnce({
        code: 1,
        signal: null,
        stdout,
        stderr: error.message,
        cancelled: Boolean(cancelledSignal),
        timedOut,
      });
    });
  });
}

function createRunLog(logPath) {
  const stream = createWriteStream(logPath, { flags: "w", mode: 0o600 });
  let stderrStarted = false;
  return {
    writeStdout(text) {
      stream.write(text);
    },
    writeStderr(text) {
      if (!stderrStarted) {
        stream.write("\n\nSTDERR\n");
        stderrStarted = true;
      }
      stream.write(text);
    },
    close() {
      return new Promise((resolveClose) => stream.end(resolveClose));
    },
  };
}

async function appendRunEvent(apiBase, authHeaders, runId, body) {
  await fetch(`${apiBase}/daemon/runs/${encodeURIComponent(runId)}/events`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
  }).catch(() => null);
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

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createStopController() {
  let requested = false;
  let stopSignal = null;
  const waiters = new Set();
  const request = (signal) => {
    if (!requested) {
      stopSignal = signal;
      console.log(`Received ${signal}. Stopping runner loop...`);
    }
    requested = true;
    for (const resolveWaiter of waiters) resolveWaiter();
    waiters.clear();
  };
  const onSigint = () => request("SIGINT");
  const onSigterm = () => request("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return {
    requested: () => requested,
    signal: () => stopSignal,
    request,
    wait(ms) {
      if (requested) return Promise.resolve();
      return new Promise((resolveWait) => {
        const done = () => {
          clearTimeout(timer);
          waiters.delete(done);
          resolveWait();
        };
        const timer = setTimeout(done, ms);
        waiters.add(done);
      });
    },
    cleanup() {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      for (const resolveWaiter of waiters) resolveWaiter();
      waiters.clear();
    },
  };
}

function selfCommand(subcommand) {
  const nodePath = process.argv[0] || "node";
  const scriptPath =
    process.argv[1] || "packages/local-executor/bin/me3-local-executor.mjs";
  return `${nodePath} ${scriptPath} ${subcommand}`;
}

function defaultTokenStorePath() {
  return join(dirname(expandPath(defaultConfigPath)), "token.json");
}

function resolveLocalConfigPath(value, configPath, fallbackName) {
  if (!value) return join(dirname(configPath), fallbackName);
  if (value === "~" || value.startsWith("~/") || isAbsolute(value)) return expandPath(value);
  return resolve(dirname(configPath), value);
}

function summarizePrompt(prompt) {
  if (!prompt) return "";
  return String(prompt).replace(/\s+/g, " ").trim().slice(0, 120);
}

function expandPath(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return resolve(path);
}
