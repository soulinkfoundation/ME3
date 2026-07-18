import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SocialPublishingInputError,
  cancelPublication,
  createPostVersionPublication,
  dispatchDueSocialPublications,
  listPostVersionPublications,
  resolvePublicationOutcome,
  updatePostVersion,
  type Publication,
} from "@me3-core/plugin-social-publishing";

describe("reusable social Publications", () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.close();
  });

  it("creates multiple schedules for one approved Version and rejects an exact duplicate", async () => {
    const firstTime = "2099-08-01T09:00:00.000Z";
    const secondTime = "2099-08-02T09:00:00.000Z";

    const first = await createPublication(fixture, "version-1", {
      scheduledFor: firstTime,
      timezone: "Europe/Dublin",
      requestContext: { plan: "launch" },
    });
    const second = await createPublication(fixture, "version-1", {
      scheduledFor: secondTime,
      timezone: "Europe/Dublin",
      requestContext: { plan: "follow-up" },
    });

    expect(first).toMatchObject({
      versionId: "version-1",
      status: "scheduled",
      scheduledFor: firstTime,
      timezone: "Europe/Dublin",
      requestedByType: "owner",
      requestedByUserId: "owner",
      requestContext: { plan: "launch" },
    });
    expect(second.id).not.toBe(first.id);
    expect(fixture.queueMessages).toEqual([]);

    const duplicateError = await createPostVersionPublication(
      fixture.env as never,
      "owner",
      "version-1",
      { scheduledFor: firstTime, timezone: "Europe/Dublin" },
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(duplicateError).toBeInstanceOf(SocialPublishingInputError);
    expect(duplicateError).toMatchObject({
      status: 409,
      message: "This Version already has a Publication at that time",
    });

    const listed = await listPostVersionPublications(
      fixture.env as never,
      "owner",
      "version-1",
    );
    expect(listed).toHaveLength(2);
    expect(listed.map((publication) => publication.id)).toEqual([second.id, first.id]);

    await expect(
      cancelPublication(fixture.env as never, "owner", first.id),
    ).resolves.toMatchObject({ id: first.id, status: "cancelled" });
  });

  it("allows another immediate Publication after a completed Publication", async () => {
    const first = await createPublication(fixture, "version-1");
    expect(first.status).toBe("queued");

    fixture.db.run(
      `UPDATE social_publications
       SET status = 'published', platform_post_id = 'linkedin-first',
           platform_post_url = 'https://linkedin.example/posts/first',
           published_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      first.id,
    );

    const second = await createPublication(fixture, "version-1");
    expect(second).toMatchObject({ versionId: "version-1", status: "queued" });
    expect(second.id).not.toBe(first.id);
    expect(fixture.queueMessages).toEqual([
      { publicationId: first.id },
      { publicationId: second.id },
    ]);

    const history = await listPostVersionPublications(
      fixture.env as never,
      "owner",
      "version-1",
    );
    expect(history.map(({ id, status }) => ({ id, status }))).toEqual(
      expect.arrayContaining([
        { id: first.id, status: "published" },
        { id: second.id, status: "queued" },
      ]),
    );
  });

  it("retries the queue handoff for an existing queued Publication", async () => {
    fixture.send.mockRejectedValueOnce(new Error("queue unavailable"));

    await expect(createPublication(fixture, "version-1")).rejects.toThrow(
      "queue unavailable",
    );
    const stranded = fixture.db.first<{ id: string; status: string }>(
      "SELECT id, status FROM social_publications WHERE variant_id = 'version-1'",
    );
    expect(stranded?.status).toBe("queued");
    expect(fixture.queueMessages).toEqual([]);

    const resumed = await createPublication(fixture, "version-1");
    expect(resumed).toMatchObject({ id: stranded?.id, status: "queued" });
    expect(fixture.queueMessages).toEqual([{ publicationId: stranded?.id }]);
  });

  it.each(["queued", "publishing"] as const)(
    "cancels scheduled work after a Version edit without mutating a %s snapshot",
    async (inFlightStatus) => {
      const scheduled = await createPublication(fixture, "version-1", {
        scheduledFor: "2099-09-01T10:30:00.000Z",
        timezone: "Europe/Dublin",
      });
      const inFlight = await createPublication(fixture, "version-1");
      if (inFlightStatus === "publishing") {
        fixture.db.run(
          `UPDATE social_publications
           SET status = 'publishing', updated_at = datetime('now')
           WHERE id = ?`,
          inFlight.id,
        );
      }

      const snapshotBefore = fixture.db.first<PublicationSnapshot>(
        `${publicationSnapshotSql()} WHERE id = ?`,
        inFlight.id,
      );
      expect(snapshotBefore).toMatchObject({
        target_account_id_snapshot: "account-1",
        format_snapshot: "post",
        body_text_snapshot: "Original approved copy",
        asset_manifest_json_snapshot: '[{"url":"/original.png"}]',
        approval_status_snapshot: "approved",
      });

      const updated = await updatePostVersion(
        fixture.env as never,
        "owner",
        "version-1",
        {
          targetAccountId: "account-2",
          bodyText: "Edited copy that requires fresh approval",
          assetManifest: [{ url: "/edited.png" }],
        },
      );
      expect(updated).toMatchObject({
        approvalStatus: "draft",
        targetAccountId: "account-2",
        bodyText: "Edited copy that requires fresh approval",
      });

      expect(
        fixture.db.first<{ status: string; error_code: string | null }>(
          "SELECT status, error_code FROM social_publications WHERE id = ?",
          scheduled.id,
        ),
      ).toEqual({ status: "cancelled", error_code: "cancelled:version_changed" });
      expect(
        fixture.db.first<PublicationSnapshot>(
          `${publicationSnapshotSql()} WHERE id = ?`,
          inFlight.id,
        ),
      ).toEqual(snapshotBefore);
      expect(
        fixture.db.first<{ status: string }>(
          "SELECT status FROM social_publications WHERE id = ?",
          inFlight.id,
        ),
      ).toEqual({ status: inFlightStatus });
    },
  );

  it("resolves only the Publication named by Publication id", async () => {
    seedApprovedVersion(fixture.db, {
      postId: "post-2",
      versionId: "version-2",
      bodyText: "A second approved Version",
    });
    const chosen = await createPublication(fixture, "version-1");
    const untouched = await createPublication(fixture, "version-2");
    fixture.db.run(
      `UPDATE social_publications
       SET status = 'publishing', error_code = 'outcome_unknown:delivery_interrupted',
           error_message = 'Provider outcome is unknown.', updated_at = datetime('now')
       WHERE id IN (?, ?)`,
      chosen.id,
      untouched.id,
    );

    const resolved = await resolvePublicationOutcome(
      fixture.env as never,
      "owner",
      chosen.id,
      {
        outcome: "published",
        platformPostUrl: "https://linkedin.example/posts/recovered",
      },
    );

    expect(resolved).toMatchObject({
      id: chosen.id,
      status: "published",
      platformPostUrl: "https://linkedin.example/posts/recovered",
      errorCode: null,
    });
    expect(
      fixture.db.first<{
        status: string;
        error_code: string | null;
        platform_post_url: string | null;
      }>(
        `SELECT status, error_code, platform_post_url
         FROM social_publications WHERE id = ?`,
        untouched.id,
      ),
    ).toEqual({
      status: "publishing",
      error_code: "outcome_unknown:delivery_interrupted",
      platform_post_url: null,
    });

    await expect(
      resolvePublicationOutcome(
        fixture.env as never,
        "owner",
        chosen.id,
        { outcome: "not_published" },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "This Publication does not need outcome resolution",
    });
    expect(
      fixture.db.first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM social_publication_events
         WHERE publication_id = ? AND event_type IN ('published', 'failed')`,
        chosen.id,
      ),
    ).toEqual({ count: 1 });
  });

  it("allows only one owner outcome to win concurrent recovery", async () => {
    const publication = await createPublication(fixture, "version-1");
    fixture.db.run(
      `UPDATE social_publications
       SET status = 'publishing', error_code = 'outcome_unknown:delivery_interrupted',
           error_message = 'Provider outcome is unknown.', updated_at = datetime('now')
       WHERE id = ?`,
      publication.id,
    );

    const results = await Promise.allSettled([
      resolvePublicationOutcome(
        fixture.env as never,
        "owner",
        publication.id,
        {
          outcome: "published",
          platformPostUrl: "https://linkedin.example/posts/concurrent-recovery",
        },
      ),
      resolvePublicationOutcome(
        fixture.env as never,
        "owner",
        publication.id,
        { outcome: "not_published" },
      ),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected && rejected.status === "rejected" ? rejected.reason : null).toMatchObject({
      status: 409,
    });
    expect(
      fixture.db.first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM social_publication_events
         WHERE publication_id = ? AND event_type IN ('published', 'failed')`,
        publication.id,
      ),
    ).toEqual({ count: 1 });
  });

  it("does not record cancellation when due dispatch wins before the edit batch", async () => {
    const publication = await createPublication(fixture, "version-1", {
      scheduledFor: "2099-09-15T09:00:00.000Z",
      timezone: "Europe/Dublin",
    });
    fixture.db.run(
      `UPDATE social_publications
       SET scheduled_for = '2000-01-01T00:00:00.000Z'
       WHERE id = ?`,
      publication.id,
    );
    fixture.db.beforeNextBatch = async () => {
      await dispatchDueSocialPublications(fixture.env as never);
    };

    await updatePostVersion(
      fixture.env as never,
      "owner",
      "version-1",
      { bodyText: "The edit loses the race to dispatch" },
    );

    expect(
      fixture.db.first<{ status: string; body_text_snapshot: string }>(
        `SELECT status, body_text_snapshot FROM social_publications WHERE id = ?`,
        publication.id,
      ),
    ).toEqual({ status: "queued", body_text_snapshot: "Original approved copy" });
    expect(fixture.queueMessages).toEqual([{ publicationId: publication.id }]);
    expect(
      fixture.db.first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM social_publication_events
         WHERE publication_id = ? AND event_type = 'cancelled'`,
        publication.id,
      ),
    ).toEqual({ count: 0 });
  });

  it("claims one due Publication atomically across concurrent dispatchers", async () => {
    const publication = await createPublication(fixture, "version-1", {
      scheduledFor: "2099-10-01T09:00:00.000Z",
      timezone: "Europe/Dublin",
    });
    fixture.db.run(
      `UPDATE social_publications
       SET scheduled_for = '2000-01-01T00:00:00.000Z'
       WHERE id = ?`,
      publication.id,
    );

    const results = await Promise.all([
      dispatchDueSocialPublications(fixture.env as never),
      dispatchDueSocialPublications(fixture.env as never),
    ]);

    expect(results.reduce((total, result) => total + result.queued, 0)).toBe(1);
    expect(results.reduce((total, result) => total + result.skipped, 0)).toBe(1);
    expect(fixture.queueMessages).toEqual([{ publicationId: publication.id }]);
    expect(
      fixture.db.first<{ status: string }>(
        "SELECT status FROM social_publications WHERE id = ?",
        publication.id,
      ),
    ).toEqual({ status: "queued" });
    expect(
      fixture.db.first<{ count: number }>(
        `SELECT COUNT(*) AS count FROM social_publication_events
         WHERE publication_id = ? AND event_type = 'queued'`,
        publication.id,
      ),
    ).toEqual({ count: 1 });
  });

  it("records a scheduled rollback when a due queue handoff fails", async () => {
    const publication = await createPublication(fixture, "version-1", {
      scheduledFor: "2099-10-02T09:00:00.000Z",
      timezone: "Europe/Dublin",
    });
    fixture.db.run(
      `UPDATE social_publications
       SET scheduled_for = '2000-01-01T00:00:00.000Z'
       WHERE id = ?`,
      publication.id,
    );
    fixture.send.mockRejectedValueOnce(new Error("queue unavailable"));

    await expect(dispatchDueSocialPublications(fixture.env as never)).resolves.toEqual({
      queued: 0,
      skipped: 1,
    });
    expect(
      fixture.db.first<{ status: string }>(
        "SELECT status FROM social_publications WHERE id = ?",
        publication.id,
      ),
    ).toEqual({ status: "scheduled" });
    expect(
      fixture.db.first<{ event_type: string; payload_json: string }>(
        `SELECT event_type, payload_json FROM social_publication_events
         WHERE publication_id = ? ORDER BY rowid DESC LIMIT 1`,
        publication.id,
      ),
    ).toEqual({
      event_type: "scheduled",
      payload_json: JSON.stringify({
        dispatch: "rollback",
        reason: "queue_handoff_failed",
      }),
    });
  });
});

async function createPublication(
  fixture: ReturnType<typeof createFixture>,
  versionId: string,
  input: {
    scheduledFor?: string;
    timezone?: string;
    requestContext?: Record<string, unknown>;
  } = {},
): Promise<Publication> {
  const publication = await createPostVersionPublication(
    fixture.env as never,
    "owner",
    versionId,
    { ...input, requestedByType: "owner" },
  );
  if (!publication) throw new Error(`Missing fixture Version ${versionId}`);
  return publication;
}

function createFixture() {
  const db = new TestD1Database();
  db.exec(schemaSql);
  db.run(
    `INSERT INTO plugin_installations (plugin_id, enabled, status)
     VALUES ('me3.social-publishing', 1, 'installed')`,
  );
  db.run("INSERT INTO sites (id, user_id) VALUES ('site-1', 'owner')");
  db.run(
    `INSERT INTO social_accounts (
       id, user_id, site_id, platform, platform_account_id, status,
       scopes_json, metadata_json, created_at, updated_at
     ) VALUES
       ('account-1', 'owner', 'site-1', 'linkedin', 'linkedin-account-1', 'active',
        '[]', '{}', datetime('now'), datetime('now')),
       ('account-2', 'owner', 'site-1', 'linkedin', 'linkedin-account-2', 'active',
        '[]', '{}', datetime('now'), datetime('now'))`,
  );
  seedApprovedVersion(db, {
    postId: "post-1",
    versionId: "version-1",
    bodyText: "Original approved copy",
  });

  const queueMessages: Array<{ publicationId: string }> = [];
  const send = vi.fn(async (message: { publicationId: string }) => {
    queueMessages.push(message);
  });
  return {
    db,
    env: { DB: db, SOCIAL_PUBLISH_QUEUE: { send } },
    send,
    queueMessages,
    close: () => db.close(),
  };
}

function seedApprovedVersion(
  db: TestD1Database,
  input: { postId: string; versionId: string; bodyText: string },
) {
  db.run(
    `INSERT INTO social_packages (
       id, site_id, source_type, status, created_at, updated_at
     ) VALUES (?, 'site-1', 'journal', 'ready', datetime('now'), datetime('now'))`,
    input.postId,
  );
  db.run(
    `INSERT INTO social_variants (
       id, package_id, platform, target_account_id, format, body_text,
       asset_manifest_json, source_excerpt, approval_status, approved_at,
       approved_by_user_id, created_at, updated_at
     ) VALUES (?, ?, 'linkedin', 'account-1', 'post', ?,
               '[{"url":"/original.png"}]', 'Original source', 'approved',
               '2026-07-18T09:00:00.000Z', 'owner', datetime('now'), datetime('now'))`,
    input.versionId,
    input.postId,
    input.bodyText,
  );
}

type PublicationSnapshot = {
  target_account_id_snapshot: string | null;
  format_snapshot: string | null;
  body_text_snapshot: string | null;
  asset_manifest_json_snapshot: string | null;
  approval_status_snapshot: string | null;
  approved_at_snapshot: string | null;
  approved_by_user_id_snapshot: string | null;
};

function publicationSnapshotSql() {
  return `SELECT target_account_id_snapshot, format_snapshot, body_text_snapshot,
                 asset_manifest_json_snapshot, approval_status_snapshot,
                 approved_at_snapshot, approved_by_user_id_snapshot
          FROM social_publications`;
}

class TestD1Database {
  private readonly directory = mkdtempSync(join(tmpdir(), "me3-social-publications-"));
  private readonly database = join(this.directory, "fixture.sqlite");
  beforeNextBatch: (() => Promise<void>) | undefined;

  exec(sql: string) {
    sqliteExec(this.database, sql);
  }

  prepare(sql: string) {
    return new TestD1Statement(this.database, sql);
  }

  async batch(statements: TestD1Statement[]) {
    const beforeBatch = this.beforeNextBatch;
    this.beforeNextBatch = undefined;
    if (beforeBatch) await beforeBatch();
    sqliteExec(
      this.database,
      `BEGIN IMMEDIATE;\n${statements.map((statement) => `${statement.boundSql()};`).join("\n")}\nCOMMIT;`,
    );
    return [];
  }

  run(sql: string, ...values: unknown[]) {
    return this.prepare(sql).bind(...values).runSync();
  }

  first<T>(sql: string, ...values: unknown[]): T | null {
    return this.prepare(sql).bind(...values).firstSync<T>();
  }

  close() {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

class TestD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly database: string,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return this.firstSync<T>();
  }

  firstSync<T = unknown>(): T | null {
    return sqliteRows<T>(this.database, this.boundSql())[0] || null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: sqliteRows<T>(this.database, this.boundSql()) };
  }

  async run(): Promise<unknown> {
    return this.runSync();
  }

  runSync() {
    sqliteExec(this.database, this.boundSql());
    return { success: true };
  }

  boundSql() {
    return bindSql(this.sql, this.values);
  }
}

function sqliteExec(database: string, sql: string): void {
  execFileSync("sqlite3", [database], { input: sql, encoding: "utf8" });
}

function sqliteRows<T>(database: string, sql: string): T[] {
  const output = execFileSync("sqlite3", ["-json", database], {
    input: sql,
    encoding: "utf8",
  }).trim();
  return output ? JSON.parse(output) as T[] : [];
}

function bindSql(sql: string, values: unknown[]): string {
  let index = 0;
  let quote = "";
  let output = "";
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position] || "";
    if (quote) {
      output += character;
      if (character === quote) {
        if (sql[position + 1] === quote) {
          output += quote;
          position += 1;
        } else {
          quote = "";
        }
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === "?") {
      output += sqliteLiteral(values[index]);
      index += 1;
    } else {
      output += character;
    }
  }
  if (index !== values.length) throw new Error("SQLite test binding count mismatch");
  return output;
}

function sqliteLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const schemaSql = `
  CREATE TABLE plugin_installations (
    plugin_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL
  );

  CREATE TABLE social_packages (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE social_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    platform_account_id TEXT NOT NULL,
    status TEXT NOT NULL,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    access_token_ciphertext TEXT,
    refresh_token_ciphertext TEXT,
    token_expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE social_variants (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    target_account_id TEXT,
    format TEXT NOT NULL,
    body_text TEXT NOT NULL,
    asset_manifest_json TEXT NOT NULL DEFAULT '[]',
    source_excerpt TEXT,
    approval_status TEXT NOT NULL,
    approved_at TEXT,
    approved_by_user_id TEXT,
    scheduled_for TEXT,
    timezone TEXT,
    published_variant_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(package_id, platform)
  );

  CREATE TABLE social_publications (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled')
    ),
    scheduled_for TEXT,
    timezone TEXT,
    target_account_id_snapshot TEXT,
    format_snapshot TEXT,
    body_text_snapshot TEXT,
    asset_manifest_json_snapshot TEXT,
    approval_status_snapshot TEXT,
    approved_at_snapshot TEXT,
    approved_by_user_id_snapshot TEXT,
    requested_by_type TEXT,
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE social_publication_events (
    id TEXT PRIMARY KEY,
    publication_id TEXT,
    variant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX idx_social_publications_same_time_scheduled
    ON social_publications(variant_id, scheduled_for)
    WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;

  CREATE UNIQUE INDEX idx_social_publications_one_in_flight_variant
    ON social_publications(variant_id)
    WHERE status IN ('queued', 'publishing');
`;
