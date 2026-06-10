#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const databaseName = args.database || "me3-core-db";
const configPath = args.config || "apps/worker/wrangler.core.example.toml";

const baselineMigration = "0001_initial_public_schema.sql";
const baselineSignals = [
  "agent_channel_connections",
  "owner_profile",
  "plugin_installations",
  "sites",
  "assistant_jobs",
  "local_executor_runs",
  "journal_entries",
];

ensureLocalBaselineMigration();

function ensureLocalBaselineMigration() {
  const existing = query(
    "SELECT name FROM d1_migrations WHERE name = '0001_initial_public_schema.sql';",
  );
  if (existing.length > 0) return;

  const presentTables = query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${baselineSignals
      .map((name) => `'${name}'`)
      .join(", ")});`,
  ).map((row) => row.name);

  const missing = baselineSignals.filter((name) => !presentTables.includes(name));
  if (missing.length > 0) return;

  execute(
    "CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);",
  );
  execute(
    `INSERT OR IGNORE INTO d1_migrations(name) VALUES ('${baselineMigration}');`,
  );
  console.log(
    `Marked ${baselineMigration} as applied in the local D1 database because its baseline tables already exist.`,
  );
}

function query(sql) {
  const output = runWrangler(["execute", databaseName, "--command", sql, "--json"]);
  const parsed = JSON.parse(output);
  return parsed.flatMap((result) => result.results || []);
}

function execute(sql) {
  runWrangler(["execute", databaseName, "--command", sql]);
}

function runWrangler(commandArgs) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "d1", ...commandArgs, "--local", "--config", configPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  return result.stdout.trim();
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--database") parsed.database = argv[++i];
    if (arg === "--config") parsed.config = argv[++i];
  }
  return parsed;
}
