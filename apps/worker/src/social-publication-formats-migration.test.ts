import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL("../migrations/0031_social_publication_formats.sql", import.meta.url),
  "utf8",
);

describe("social Publication format migration", () => {
  it("accepts every compose format and preserves dependent rows", () => {
    const directory = mkdtempSync(join(tmpdir(), "me3-social-format-migration-"));
    const database = join(directory, "fixture.sqlite");
    try {
      sqliteExec(database, INITIAL_SCHEMA);
      sqliteExec(database, `PRAGMA foreign_keys = ON;\n${migrationSql}`);
      sqliteExec(
        database,
        `INSERT INTO social_publications (
           id, variant_id, site_id, platform, status, format_snapshot
         ) VALUES
           ('publication-image', 'version-image', 'site-1', 'x', 'queued', 'image'),
           ('publication-video', 'version-video', 'site-1', 'youtube', 'queued', 'short_video');`,
      );

      expect(
        sqliteRows<{ id: string; format_snapshot: string }>(
          database,
          `SELECT id, format_snapshot
           FROM social_publications
           ORDER BY id`,
        ),
      ).toEqual([
        { id: "publication-image", format_snapshot: "image" },
        { id: "publication-original", format_snapshot: "post" },
        { id: "publication-video", format_snapshot: "short_video" },
      ]);
      expect(
        sqliteRows<{ publication_id: string }>(
          database,
          "SELECT publication_id FROM social_posting_plan_items",
        ),
      ).toEqual([{ publication_id: "publication-original" }]);
      expect(
        sqliteRows<{ publication_id: string }>(
          database,
          "SELECT publication_id FROM social_media_delivery_grants",
        ),
      ).toEqual([{ publication_id: "publication-original" }]);
      expect(
        sqliteExitCode(
          database,
          `INSERT INTO social_publications (
             id, variant_id, site_id, platform, status, format_snapshot
           ) VALUES ('publication-invalid', 'version-invalid', 'site-1', 'x', 'queued', 'story');`,
        ),
      ).not.toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function sqliteExec(database: string, sql: string): void {
  execFileSync("sqlite3", [database], { input: sql, encoding: "utf8" });
}

function sqliteExitCode(database: string, sql: string): number | null {
  return spawnSync("sqlite3", [database], { input: sql, encoding: "utf8" }).status;
}

function sqliteRows<T>(database: string, sql: string): T[] {
  const output = execFileSync("sqlite3", ["-json", database], {
    input: sql,
    encoding: "utf8",
  }).trim();
  return output ? (JSON.parse(output) as T[]) : [];
}

const INITIAL_SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE social_publications (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    platform TEXT NOT NULL
      CHECK (platform IN ('x', 'linkedin', 'instagram', 'instagram_business', 'youtube', 'tiktok')),
    status TEXT NOT NULL
      CHECK (status IN ('scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled')),
    scheduled_for TEXT,
    timezone TEXT,
    target_account_id_snapshot TEXT,
    format_snapshot TEXT
      CHECK (format_snapshot IS NULL OR format_snapshot IN ('post', 'carousel')),
    body_text_snapshot TEXT,
    asset_manifest_json_snapshot TEXT,
    approval_status_snapshot TEXT
      CHECK (
        approval_status_snapshot IS NULL
        OR approval_status_snapshot IN ('draft', 'approved', 'rejected')
      ),
    approved_at_snapshot TEXT,
    approved_by_user_id_snapshot TEXT,
    requested_by_type TEXT
      CHECK (requested_by_type IS NULL OR requested_by_type IN ('owner', 'agent', 'migration')),
    requested_by_user_id TEXT,
    request_context_json TEXT NOT NULL DEFAULT '{}',
    platform_post_id TEXT,
    platform_post_url TEXT,
    error_code TEXT,
    error_message TEXT,
    provider_response_json TEXT,
    queued_at TEXT,
    published_at TEXT,
    last_polled_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_social_publications_status
    ON social_publications(status, scheduled_for, created_at DESC);
  CREATE INDEX idx_social_publications_variant
    ON social_publications(variant_id, created_at DESC);
  CREATE UNIQUE INDEX idx_social_publications_same_time_scheduled
    ON social_publications(variant_id, scheduled_for)
    WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;
  CREATE UNIQUE INDEX idx_social_publications_one_in_flight_variant
    ON social_publications(variant_id)
    WHERE status IN ('queued', 'publishing');

  CREATE TABLE social_posting_plan_items (
    id TEXT PRIMARY KEY,
    publication_id TEXT,
    label TEXT NOT NULL,
    FOREIGN KEY (publication_id) REFERENCES social_publications(id) ON DELETE SET NULL
  );
  CREATE TABLE social_media_delivery_grants (
    id TEXT PRIMARY KEY,
    publication_id TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    FOREIGN KEY (publication_id) REFERENCES social_publications(id) ON DELETE SET NULL
  );

  INSERT INTO social_publications (
    id, variant_id, site_id, platform, status, format_snapshot
  ) VALUES (
    'publication-original', 'version-original', 'site-1', 'linkedin', 'published', 'post'
  );
  INSERT INTO social_posting_plan_items (id, publication_id, label)
  VALUES ('plan-item-1', 'publication-original', 'Original plan item');
  INSERT INTO social_media_delivery_grants (id, publication_id, token_hash)
  VALUES ('grant-1', 'publication-original', 'token-hash');
`;
