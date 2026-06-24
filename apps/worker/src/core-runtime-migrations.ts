import type { Env } from "./types";

type RuntimeMigration = {
  id: string;
  checksum: string;
  apply(db: D1Database): Promise<void>;
};

type MigrationRow = {
  checksum: string;
};

type SqliteNameRow = {
  name: string;
};

const MIGRATION_TABLE = "core_runtime_migrations";

const runtimeMigrations: RuntimeMigration[] = [
  {
    id: "0002_mission_task_pins",
    checksum: "2026-06-24-mission-task-pins-v1",
    apply: applyMissionTaskPinsMigration,
  },
  {
    id: "0009_commerce_default_currency",
    checksum: "2026-06-24-commerce-default-currency-v1",
    apply: applyCommerceDefaultCurrencyMigration,
  },
  {
    id: "0010_ai_usage_events",
    checksum: "2026-06-24-ai-usage-events-v1",
    apply: applyAiUsageEventsMigration,
  },
  {
    id: "0011_financial_entry_projects",
    checksum: "2026-06-24-financial-entry-projects-v1",
    apply: applyFinancialEntryProjectsMigration,
  },
];

let migrationPromise: Promise<void> | null = null;

export async function ensureCoreRuntimeMigrations(env: Env): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = runCoreRuntimeMigrations(env).catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

export async function ensureCoreRuntimeMigrationsForRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  try {
    await ensureCoreRuntimeMigrations(env);
    return null;
  } catch (error) {
    console.error("ME3 Core runtime migration failed", error);
    const isApiRequest =
      new URL(request.url).pathname.startsWith("/api/") ||
      request.headers.get("accept")?.includes("application/json");
    if (isApiRequest) {
      return Response.json(
        {
          ok: false,
          error: "ME3 is finishing a database update. Refresh in a moment to retry.",
        },
        { status: 503 },
      );
    }
    return new Response("ME3 is finishing a database update. Refresh in a moment to retry.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

export function resetCoreRuntimeMigrationsForTest() {
  migrationPromise = null;
}

async function runCoreRuntimeMigrations(env: Env): Promise<void> {
  await ensureMigrationTable(env.DB);
  for (const migration of runtimeMigrations) {
    await runMigration(env.DB, migration);
  }
}

async function ensureMigrationTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();
}

async function runMigration(db: D1Database, migration: RuntimeMigration): Promise<void> {
  const row = await db
    .prepare(`SELECT checksum FROM ${MIGRATION_TABLE} WHERE id = ?`)
    .bind(migration.id)
    .first<MigrationRow>();
  if (row?.checksum === migration.checksum) return;

  await migration.apply(db);
  await db
    .prepare(
      `INSERT INTO ${MIGRATION_TABLE} (id, checksum, applied_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         checksum = excluded.checksum,
         applied_at = CURRENT_TIMESTAMP`,
    )
    .bind(migration.id, migration.checksum)
    .run();
}

async function applyMissionTaskPinsMigration(db: D1Database): Promise<void> {
  if (!(await tableExists(db, "mission_tasks"))) {
    throw new Error("Cannot apply 0002_mission_task_pins: mission_tasks is missing");
  }

  if (!(await columnExists(db, "mission_tasks", "pinned_at"))) {
    try {
      await db.prepare("ALTER TABLE mission_tasks ADD COLUMN pinned_at TEXT").run();
    } catch (error) {
      if (!(await columnExists(db, "mission_tasks", "pinned_at"))) throw error;
    }
  }
}

async function applyCommerceDefaultCurrencyMigration(db: D1Database): Promise<void> {
  if (!(await tableExists(db, "commerce_settings"))) {
    throw new Error("Cannot apply 0009_commerce_default_currency: commerce_settings is missing");
  }

  if (!(await columnExists(db, "commerce_settings", "default_currency"))) {
    try {
      await db
        .prepare("ALTER TABLE commerce_settings ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'USD'")
        .run();
    } catch (error) {
      if (!(await columnExists(db, "commerce_settings", "default_currency"))) throw error;
    }
  }
}

async function applyAiUsageEventsMigration(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ai_usage_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'owner',
        source TEXT NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'gateway')),
        kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 1,
        successful_request_count INTEGER NOT NULL DEFAULT 1,
        failed_request_count INTEGER NOT NULL DEFAULT 0,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
      )`,
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_created
       ON ai_usage_events(user_id, created_at DESC)`,
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_kind_created
       ON ai_usage_events(user_id, kind, created_at DESC)`,
    )
    .run();
}

async function applyFinancialEntryProjectsMigration(db: D1Database): Promise<void> {
  if (!(await tableExists(db, "financial_entries"))) {
    throw new Error("Cannot apply 0011_financial_entry_projects: financial_entries is missing");
  }

  if (!(await columnExists(db, "financial_entries", "project_id"))) {
    try {
      await db
        .prepare(
          "ALTER TABLE financial_entries ADD COLUMN project_id TEXT REFERENCES mission_projects(id) ON DELETE SET NULL",
        )
        .run();
    } catch (error) {
      if (!(await columnExists(db, "financial_entries", "project_id"))) throw error;
    }
  }

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_financial_entries_project
       ON financial_entries(user_id, project_id)`,
    )
    .run();
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first<SqliteNameRow>();
  return Boolean(row?.name);
}

async function columnExists(
  db: D1Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all<SqliteNameRow>();
  return (result.results || []).some((row) => row.name === columnName);
}
