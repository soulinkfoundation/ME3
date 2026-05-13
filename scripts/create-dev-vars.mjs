import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "apps/worker/.dev.vars");
const example = resolve(root, "apps/worker/.dev.vars.example");
const force = process.argv.includes("--force");

if (existsSync(target) && !force) {
  console.log("apps/worker/.dev.vars already exists. Use --force to regenerate local values.");
  process.exit(0);
}

const keys = readFileSync(example, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split("=")[0]);

const generated = new Map([
  ["JWT_SECRET", randomBytes(32).toString("base64url")],
  ["TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64")],
  ["SETUP_PASSWORD", randomBytes(16).toString("hex")],
]);

const body = [
  "# Generated local development values. Do not commit this file.",
  ...keys.map((key) => `${key}=${generated.get(key) ?? ""}`),
  "",
].join("\n");

writeFileSync(target, body, { mode: 0o600 });
console.log("Created apps/worker/.dev.vars with local generated setup password values.");
