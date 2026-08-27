import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSiteBranding, updateSiteBranding } from "./site-branding";
import type { DbSite, Env } from "./types";

type SqliteValue = null | number | string | Uint8Array;

class SqliteD1Statement {
  private values: SqliteValue[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values as SqliteValue[];
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) || null;
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { results: [], success: true as const, meta: { changes: Number(result.changes) } };
  }
}

describe("Site branding", () => {
  let database: DatabaseSync;
  let env: Env;
  let site: DbSite;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE sites (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        custom_domain TEXT,
        custom_domain_status TEXT
      );
      CREATE TABLE site_files (
        site_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content BLOB NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        sha256 TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (site_id, path)
      );
      CREATE TABLE site_branding (
        site_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        logo_ref TEXT,
        accent_color TEXT NOT NULL,
        background_color TEXT NOT NULL,
        surface_color TEXT NOT NULL,
        text_color TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO sites (id, username) VALUES ('site-1', 'kieran');
    `);
    database.prepare(
      `INSERT INTO site_files (site_id, path, content, content_type, size)
       VALUES ('site-1', 'src/me.json', ?, 'application/json', ?)`,
    ).run(
      new TextEncoder().encode(JSON.stringify({
        name: "Kieran Butler",
        logo: "./media/logo.png",
        links: { _accent: "#225544" },
      })),
      100,
    );
    env = {
      DB: { prepare: (sql: string) => new SqliteD1Statement(database, sql) } as unknown as D1Database,
      ME3_SITE_HOST: "sites.example.com",
    } as Env;
    site = {
      id: "site-1",
      username: "kieran",
      custom_domain: null,
      custom_domain_status: null,
    } as DbSite;
  });

  afterEach(() => database.close());

  it("derives defaults from the Site and can persist them", async () => {
    const derived = await getSiteBranding(env, site);
    expect(derived).toMatchObject({
      displayName: "Kieran Butler",
      logoRef: "./media/logo.png",
      logoUrl: "https://sites.example.com/media/logo.png",
      accentColor: "#225544",
      persisted: false,
    });

    const persisted = await getSiteBranding(env, site, true);
    expect(persisted.persisted).toBe(true);
    expect(database.prepare("SELECT COUNT(*) AS count FROM site_branding").get()).toEqual({
      count: 1,
    });
  });

  it("updates the full reusable branding record", async () => {
    const updated = await updateSiteBranding(env, site, {
      displayName: "Kieran Studio",
      logoRef: "/brand/logo.webp",
      accentColor: "#112233",
      backgroundColor: "#f0f0f0",
      surfaceColor: "#ffffff",
      textColor: "#101010",
    });

    expect(updated).toMatchObject({
      displayName: "Kieran Studio",
      logoUrl: "https://sites.example.com/brand/logo.webp",
      accentColor: "#112233",
      persisted: true,
    });
  });
});
