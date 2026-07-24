import { spawnSync } from "node:child_process";

export const D1_MIGRATION_REPAIR_SQL = `
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0011_financial_entry_projects.sql'
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info('financial_entries') WHERE name = 'project_id'
);
INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0015_agent_runtime_idempotency.sql'
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info('mailbox_messages') WHERE name = 'agent_idempotency_key'
);
INSERT OR IGNORE INTO d1_migrations (name)
SELECT '0028_journal_entry_revision.sql'
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info('journal_entries') WHERE name = 'revision'
);
`;

export function runD1MigrationPreflight({ spawn = spawnSync } = {}) {
  const result = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--config",
      "wrangler.toml",
      "--command",
      D1_MIGRATION_REPAIR_SQL,
    ],
    { stdio: "inherit" },
  );
  return result.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runD1MigrationPreflight());
}
