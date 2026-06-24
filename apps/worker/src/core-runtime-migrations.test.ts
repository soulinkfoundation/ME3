import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureCoreRuntimeMigrations,
  resetCoreRuntimeMigrationsForTest,
} from "./core-runtime-migrations";
import type { Env } from "./types";

describe("Core runtime migrations", () => {
  beforeEach(() => {
    resetCoreRuntimeMigrationsForTest();
  });

  it("creates missing update-era tables and columns", async () => {
    const db = new RuntimeMigrationDb();

    await ensureCoreRuntimeMigrations({ DB: db as unknown as D1Database } as Env);

    expect(db.tables.has("core_runtime_migrations")).toBe(true);
    expect(db.tables.has("ai_usage_events")).toBe(true);
    expect(db.columns.get("financial_entries")?.has("project_id")).toBe(true);
    expect(db.migrations.get("0010_ai_usage_events")).toBe(
      "2026-06-24-ai-usage-events-v1",
    );
    expect(db.migrations.get("0011_financial_entry_projects")).toBe(
      "2026-06-24-financial-entry-projects-v1",
    );
  });

  it("records already-applied schema without repeating destructive operations", async () => {
    const db = new RuntimeMigrationDb({
      hasAiUsageEvents: true,
      hasFinancialEntryProjectId: true,
    });

    await ensureCoreRuntimeMigrations({ DB: db as unknown as D1Database } as Env);

    expect(db.statements.some((sql) => sql.includes("ALTER TABLE financial_entries"))).toBe(
      false,
    );
    expect(db.migrations.has("0010_ai_usage_events")).toBe(true);
    expect(db.migrations.has("0011_financial_entry_projects")).toBe(true);
  });

  it("retries after a failed migration attempt", async () => {
    const db = new RuntimeMigrationDb({ failFinancialProjectAlterOnce: true });

    await expect(
      ensureCoreRuntimeMigrations({ DB: db as unknown as D1Database } as Env),
    ).rejects.toThrow("simulated alter failure");
    expect(db.migrations.has("0011_financial_entry_projects")).toBe(false);

    await ensureCoreRuntimeMigrations({ DB: db as unknown as D1Database } as Env);

    expect(db.columns.get("financial_entries")?.has("project_id")).toBe(true);
    expect(db.migrations.has("0011_financial_entry_projects")).toBe(true);
  });

  it("keeps going when another request already added the project column", async () => {
    const db = new RuntimeMigrationDb({ addFinancialProjectColumnBeforeAlterError: true });

    await ensureCoreRuntimeMigrations({ DB: db as unknown as D1Database } as Env);

    expect(db.statements.some((sql) => sql.includes("idx_financial_entries_project"))).toBe(
      true,
    );
    expect(db.migrations.has("0011_financial_entry_projects")).toBe(true);
  });
});

type RuntimeMigrationDbOptions = {
  hasAiUsageEvents?: boolean;
  hasFinancialEntryProjectId?: boolean;
  addFinancialProjectColumnBeforeAlterError?: boolean;
  failFinancialProjectAlterOnce?: boolean;
};

class RuntimeMigrationDb {
  readonly tables = new Set(["financial_entries", "owner_profile", "mission_projects"]);
  readonly columns = new Map<string, Set<string>>([
    [
      "financial_entries",
      new Set([
        "id",
        "user_id",
        "entry_type",
        "date",
        "description",
        "category_id",
        "amount_cents",
      ]),
    ],
  ]);
  readonly migrations = new Map<string, string>();
  readonly statements: string[] = [];
  addFinancialProjectColumnBeforeAlterError: boolean;
  failFinancialProjectAlterOnce: boolean;

  constructor(options: RuntimeMigrationDbOptions = {}) {
    if (options.hasAiUsageEvents) this.tables.add("ai_usage_events");
    if (options.hasFinancialEntryProjectId) {
      this.columns.get("financial_entries")?.add("project_id");
    }
    this.addFinancialProjectColumnBeforeAlterError = Boolean(
      options.addFinancialProjectColumnBeforeAlterError,
    );
    this.failFinancialProjectAlterOnce = Boolean(options.failFinancialProjectAlterOnce);
  }

  prepare(sql: string) {
    return new RuntimeMigrationStatement(this, sql);
  }
}

class RuntimeMigrationStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: RuntimeMigrationDb,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    if (this.sql.includes("FROM sqlite_master")) {
      const tableName = this.values[0] as string;
      return (this.db.tables.has(tableName) ? { name: tableName } : null) as T | null;
    }
    if (this.sql.includes("FROM core_runtime_migrations")) {
      const id = this.values[0] as string;
      const checksum = this.db.migrations.get(id);
      return (checksum ? { checksum } : null) as T | null;
    }
    return null as T | null;
  }

  async all<T>() {
    if (this.sql.includes("PRAGMA table_info(financial_entries)")) {
      const columns = [...(this.db.columns.get("financial_entries") || [])].map((name) => ({
        name,
      }));
      return { results: columns as T[] };
    }
    return { results: [] as T[] };
  }

  async run() {
    this.db.statements.push(this.sql);
    if (this.sql.includes("CREATE TABLE IF NOT EXISTS core_runtime_migrations")) {
      this.db.tables.add("core_runtime_migrations");
      return { success: true };
    }
    if (this.sql.includes("CREATE TABLE IF NOT EXISTS ai_usage_events")) {
      this.db.tables.add("ai_usage_events");
      return { success: true };
    }
    if (this.sql.includes("ALTER TABLE financial_entries")) {
      if (this.db.failFinancialProjectAlterOnce) {
        this.db.failFinancialProjectAlterOnce = false;
        throw new Error("simulated alter failure");
      }
      if (this.db.addFinancialProjectColumnBeforeAlterError) {
        this.db.addFinancialProjectColumnBeforeAlterError = false;
        this.db.columns.get("financial_entries")?.add("project_id");
        throw new Error("duplicate column name: project_id");
      }
      const columns = this.db.columns.get("financial_entries");
      if (columns?.has("project_id")) throw new Error("duplicate column name: project_id");
      columns?.add("project_id");
      return { success: true };
    }
    if (this.sql.includes("INSERT INTO core_runtime_migrations")) {
      this.db.migrations.set(this.values[0] as string, this.values[1] as string);
      return { success: true };
    }
    return { success: true };
  }
}
