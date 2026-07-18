import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCalendarSocialPublications } from "@me3-core/plugin-social-publishing";

describe("Social Publication Calendar projection", () => {
  let fixture: CalendarFixture;

  beforeEach(() => {
    fixture = new CalendarFixture();
    fixture.seed();
  });

  afterEach(() => fixture.close());

  it("projects planned, publishing, published, failed, and attention-required Publications", async () => {
    const before = fixture.scalar(
      "SELECT COUNT(*) AS count FROM user_calendar_events",
    );
    const publications = await listCalendarSocialPublications(
      fixture.env as never,
      "owner",
      {
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-08-01T00:00:00.000Z",
      },
    );

    expect(publications.map(({ id, calendarState, displayAt }) => ({
      id,
      calendarState,
      displayAt,
    }))).toEqual([
      {
        id: "publication-published",
        calendarState: "published",
        displayAt: "2026-07-10T09:04:00.000Z",
      },
      {
        id: "publication-failed",
        calendarState: "failed",
        displayAt: "2026-07-11T09:06:00.000Z",
      },
      {
        id: "publication-attention",
        calendarState: "needs_attention",
        displayAt: "2026-07-12T09:09:00.000Z",
      },
      {
        id: "publication-scheduled",
        calendarState: "planned",
        displayAt: "2026-07-20T09:30:00.000Z",
      },
      {
        id: "publication-queued",
        calendarState: "publishing",
        displayAt: "2026-07-21T09:00:00.000Z",
      },
    ]);
    expect(publications[3]).toMatchObject({
      siteId: "site-1",
      postId: "post-1",
      postTitle: "A source-backed launch Post",
      versionId: "version-1",
      versionLabel: "Launch announcement",
      platform: "linkedin",
      accountId: "account-1",
      accountLabel: "Kieran Butler",
      publicationStatus: "scheduled",
      sourceType: "journal",
      sourceRef: "journal:entry-1",
      sourceLabel: "Journal",
      scheduledFor: "2026-07-20T09:30:00.000Z",
      timezone: "Europe/Dublin",
    });
    expect(publications.some((entry) => entry.id === "publication-cancelled")).toBe(false);
    expect(publications.some((entry) => entry.id === "publication-other-owner")).toBe(false);
    expect(fixture.scalar("SELECT COUNT(*) AS count FROM user_calendar_events")).toBe(before);
  });

  it("uses a half-open instant window while retaining the Publication timezone", async () => {
    const publications = await listCalendarSocialPublications(
      fixture.env as never,
      "owner",
      {
        start: "2026-07-20T10:30:00+01:00",
        end: "2026-07-21T10:00:00+01:00",
      },
    );

    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      id: "publication-scheduled",
      displayAt: "2026-07-20T09:30:00.000Z",
      timezone: "Europe/Dublin",
    });
  });
});

class CalendarFixture {
  private readonly directory = mkdtempSync(join(tmpdir(), "me3-social-calendar-"));
  private readonly database = join(this.directory, "fixture.sqlite");

  readonly env = {
    DB: {
      prepare: (sql: string) => new CalendarStatement(this.database, sql),
    },
  };

  seed() {
    sqliteExec(this.database, schemaSql);
    sqliteExec(
      this.database,
      `INSERT INTO sites (id, user_id) VALUES
         ('site-1', 'owner'),
         ('site-2', 'another-owner');

       INSERT INTO social_accounts (
         id, site_id, platform, platform_account_id, platform_handle, display_name
       ) VALUES
         ('account-1', 'site-1', 'linkedin', 'linkedin-1', '@kieran', 'Kieran Butler');

       INSERT INTO social_packages (
         id, site_id, post_title_snapshot, idea_text, source_type, source_ref
       ) VALUES
         ('post-1', 'site-1', 'Launch Post', 'A source-backed launch Post',
          'journal', 'journal:entry-1'),
         ('post-2', 'site-2', 'Private Post', 'Another owner Post',
          'journal', 'journal:entry-private');

       INSERT INTO social_variants (id, package_id, platform, title) VALUES
         ('version-1', 'post-1', 'linkedin', 'Launch announcement'),
         ('version-2', 'post-2', 'linkedin', 'Private announcement');

       INSERT INTO user_calendar_events (id, user_id, title) VALUES
         ('calendar-event-1', 'owner', 'Existing personal event');

       ${publicationSql({
         id: "publication-published",
         status: "published",
         scheduledFor: "2026-07-10T09:00:00.000Z",
         queuedAt: "2026-07-10T09:00:00.000Z",
        publishedAt: "2026-07-10 09:04:00",
       })}
       ${publicationSql({
         id: "publication-failed",
         status: "failed",
         scheduledFor: "2026-07-11T09:00:00.000Z",
         queuedAt: "2026-07-11T09:00:00.000Z",
         errorCode: "rejected:provider_response",
         errorMessage: "LinkedIn rejected this Publication.",
       })}
       ${publicationSql({
         id: "publication-attention",
         status: "publishing",
         queuedAt: "2026-07-12T09:00:00.000Z",
         errorCode: "outcome_unknown:delivery_interrupted",
         errorMessage: "Check LinkedIn before retrying.",
         updatedAt: "2026-07-12T09:10:00.000Z",
       })}
       ${publicationSql({
         id: "publication-scheduled",
         status: "scheduled",
         scheduledFor: "2026-07-20T09:30:00.000Z",
       })}
       ${publicationSql({
         id: "publication-queued",
         status: "queued",
         queuedAt: "2026-07-21T09:00:00.000Z",
       })}
       ${publicationSql({
         id: "publication-cancelled",
         status: "cancelled",
         scheduledFor: "2026-07-22T09:00:00.000Z",
       })}
       ${publicationSql({
         id: "publication-other-owner",
         status: "scheduled",
         scheduledFor: "2026-07-20T09:30:00.000Z",
         siteId: "site-2",
         versionId: "version-2",
         accountId: null,
       })}

       INSERT INTO social_publication_events (
         id, publication_id, event_type, created_at
       ) VALUES
         ('event-failed', 'publication-failed', 'failed', '2026-07-11 09:06:00'),
         ('event-attention', 'publication-attention', 'failed', '2026-07-12T09:09:00.000Z');`,
    );
  }

  scalar(sql: string): number {
    return sqliteRows<{ count: number }>(this.database, sql)[0]?.count || 0;
  }

  close() {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

class CalendarStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: string,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: sqliteRows<T>(this.database, bindSql(this.sql, this.values)) };
  }
}

function publicationSql(input: {
  id: string;
  status: string;
  scheduledFor?: string | null;
  queuedAt?: string | null;
  publishedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: string;
  siteId?: string;
  versionId?: string;
  accountId?: string | null;
}): string {
  return `INSERT INTO social_publications (
      id, variant_id, site_id, platform, status, scheduled_for, timezone,
      target_account_id_snapshot, body_text_snapshot, queued_at, published_at,
      error_code, error_message, created_at, updated_at
    ) VALUES (
      ${literal(input.id)}, ${literal(input.versionId || "version-1")},
      ${literal(input.siteId || "site-1")}, 'linkedin', ${literal(input.status)},
      ${literal(input.scheduledFor ?? null)}, 'Europe/Dublin',
      ${literal(input.accountId === undefined ? "account-1" : input.accountId)},
      'Approved Publication snapshot', ${literal(input.queuedAt ?? null)},
      ${literal(input.publishedAt ?? null)}, ${literal(input.errorCode ?? null)},
      ${literal(input.errorMessage ?? null)}, '2026-07-01T08:00:00.000Z',
      ${literal(input.updatedAt || "2026-07-01T08:00:00.000Z")}
    );`;
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
  const bound = sql.replaceAll("?", () => literal(values[index++]));
  if (index !== values.length) throw new Error("SQLite test binding count mismatch");
  return bound;
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const schemaSql = `
  CREATE TABLE sites (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
  CREATE TABLE social_accounts (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    platform_account_id TEXT,
    platform_handle TEXT,
    display_name TEXT
  );
  CREATE TABLE social_packages (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    post_title_snapshot TEXT NOT NULL,
    idea_text TEXT,
    source_type TEXT NOT NULL,
    source_ref TEXT
  );
  CREATE TABLE social_variants (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    title TEXT
  );
  CREATE TABLE social_publications (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    scheduled_for TEXT,
    timezone TEXT,
    target_account_id_snapshot TEXT,
    body_text_snapshot TEXT,
    queued_at TEXT,
    published_at TEXT,
    platform_post_url TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE social_publication_events (
    id TEXT PRIMARY KEY,
    publication_id TEXT,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE user_calendar_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL
  );
`;
