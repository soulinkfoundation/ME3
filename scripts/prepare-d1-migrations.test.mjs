import assert from "node:assert/strict";
import test from "node:test";
import {
  D1_MIGRATION_REPAIR_SQL,
  runD1MigrationPreflight,
} from "./prepare-d1-migrations.mjs";

test("preflight repairs only schema-backed legacy migration records", () => {
  assert.match(D1_MIGRATION_REPAIR_SQL, /0011_financial_entry_projects\.sql/);
  assert.match(D1_MIGRATION_REPAIR_SQL, /0015_agent_runtime_idempotency\.sql/);
  assert.match(D1_MIGRATION_REPAIR_SQL, /0028_journal_entry_revision\.sql/);
  assert.match(D1_MIGRATION_REPAIR_SQL, /pragma_table_info\('mailbox_messages'\)/);
  assert.match(D1_MIGRATION_REPAIR_SQL, /pragma_table_info\('journal_entries'\)/);
  assert.match(D1_MIGRATION_REPAIR_SQL, /INSERT OR IGNORE INTO d1_migrations/);
});

test("preflight returns the Wrangler status", () => {
  const calls = [];
  const status = runD1MigrationPreflight({
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 23 };
    },
  });

  assert.equal(status, 23);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "pnpm");
  assert.deepEqual(calls[0].args.slice(0, 7), [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--remote",
    "--config",
  ]);
  assert.equal(calls[0].args.at(-1), D1_MIGRATION_REPAIR_SQL);
  assert.deepEqual(calls[0].options, { stdio: "inherit" });
});
