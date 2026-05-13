import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerOrigin = "http://127.0.0.1:8797";
const webOrigin = "http://127.0.0.1:5184";
const children = [];
const childFailures = [];
let shuttingDown = false;

async function main() {
  await run("pnpm", ["setup:dev-vars"]);
  await run("pnpm", ["--filter", "@me3-core/worker", "db:migrate:local"]);

  const worker = start(
    "pnpm",
    [
      "--filter",
      "@me3-core/worker",
      "exec",
      "wrangler",
      "dev",
      "--config",
      "wrangler.core.example.toml",
      "--port",
      "8797",
    ],
    "worker",
  );
  const web = start(
    "pnpm",
    [
      "--filter",
      "@me3/web",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      "5184",
      "--strictPort",
    ],
    "web",
  );
  children.push(worker, web);

  await waitForJson(`${workerOrigin}/health`);
  await waitForText(webOrigin);

  const health = await fetchJson(`${workerOrigin}/health`);
  assert(health.ok === true, "Worker health did not return ok=true");
  assert(health.bindings?.db === true, "Worker health did not report DB binding");

  const config = await fetchJson(`${workerOrigin}/api/config`);
  assert(typeof config.apiOrigin === "string", "Core API origin missing");

  const bootstrapCode = readDevVar("SETUP_PASSWORD");
  const ownerPassword = "local-boot-password";
  const bootstrapResponse = await postJson(`${workerOrigin}/api/admin/bootstrap`, {
    bootstrapCode,
    email: "owner@example.test",
    name: "ME3 Core Owner",
    username: "owner",
    bio: "Local boot verification owner.",
    password: ownerPassword,
  });
  const bootstrap = bootstrapResponse.body;
  assert(bootstrap.ok === true, "Admin bootstrap failed");
  const sessionCookie = bootstrapResponse.cookie;
  assert(sessionCookie, "Admin bootstrap did not set a session cookie");

  const me = await fetchJson(`${workerOrigin}/api/auth/me`, sessionCookie);
  assert(me.ok === true && me.user?.id === "owner", "Auth session hydration failed");

  const loginResponse = await postJson(`${workerOrigin}/api/auth/login`, {
    email: "owner@example.test",
    password: ownerPassword,
  });
  assert(loginResponse.body.ok === true, "Password login failed");
  assert(loginResponse.cookie, "Password login did not set a session cookie");

  const chat = (
    await postJson(
      `${workerOrigin}/api/assistant/chat`,
      {
        message: "Boot check",
      },
      sessionCookie,
    )
  ).body;
  assert(chat.ok === true, "Assistant chat smoke check failed");
  assert(typeof chat.reply === "string" && chat.reply.length > 0, "Assistant reply was empty");

  const profile = await fetchJson(`${workerOrigin}/.well-known/me.json`);
  assert(profile.username === "owner", "me.json did not return bootstrapped owner");
  assert(profile.intents?.chat, "me.json did not expose chat intent");

  console.log("ME3 Core local boot verification passed.");
}

function run(command, args) {
  const result = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

  return waitForExit(result, `${command} ${args.join(" ")}`);
}

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code !== null && code !== 0) {
      childFailures.push(new Error(`${label} exited with code ${code}`));
    }
    if (signal) {
      childFailures.push(new Error(`${label} exited with signal ${signal}`));
    }
  });

  return child;
}

function waitForExit(child, label) {
  return new Promise((resolvePromise, reject) => {
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function waitForJson(url) {
  return waitFor(async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    await response.json();
  }, url);
}

async function waitForText(url) {
  return waitFor(async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const body = await response.text();
    if (!body.includes("ME3")) throw new Error(`${url} did not return web shell`);
  }, url);
}

async function waitFor(fn, label) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 30000) {
    if (childFailures.length > 0) throw childFailures[0];
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }

  throw new Error(`Timed out waiting for ${label}: ${lastError?.message ?? "unknown error"}`);
}

async function fetchJson(url, cookie) {
  const response = await fetch(url, {
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  assert(response.ok, `${url} returned ${response.status}`);
  return response.json();
}

async function postJson(url, body, cookie) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${await response.text()}`);
  }
  const setCookie = response.headers.get("set-cookie");
  return {
    body: await response.json(),
    cookie: setCookie?.split(";")[0] ?? "",
  };
}

function readDevVar(name) {
  const file = resolve(root, "apps/worker/.dev.vars");
  if (!existsSync(file)) return "";

  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("#") && entry.startsWith(`${name}=`));

  const line = lines.at(-1);
  if (!line) return "";

  const raw = line.slice(name.length + 1).trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  return raw;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

process.on("exit", () => {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
});

process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill("SIGTERM");
    }
    setTimeout(() => process.exit(process.exitCode ?? 0), 100);
  });
