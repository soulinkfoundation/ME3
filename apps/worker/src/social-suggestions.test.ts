import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SocialSuggestionInputError,
  chooseSocialSuggestion,
  createSocialPost,
  createSocialSuggestions,
  discardSocialSuggestion,
  listSocialSuggestions,
  updateSocialSuggestion,
  type CreateSocialSuggestionsInput,
} from "@me3-core/plugin-social-publishing";

const suggestionMigrationSql = readFileSync(
  new URL("../migrations/0024_social_suggestions.sql", import.meta.url),
  "utf8",
);

describe("grounded Social Suggestions", () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.close();
  });

  it("requires an explicit Source snapshot and visible Source excerpts", async () => {
    await expect(
      createSocialSuggestions(fixture.env as never, "owner", {
        ...groundedInput(),
        sourceSnapshot: "",
      }),
    ).rejects.toMatchObject({
      message: "A human-authored Source snapshot is required",
    });

    await expect(
      createSocialSuggestions(fixture.env as never, "owner", {
        ...groundedInput(),
        suggestions: groundedInput().suggestions.map((suggestion, index) =>
          index === 1 ? { ...suggestion, sourceExcerpt: "An invented Source excerpt." } : suggestion
        ),
      }),
    ).rejects.toMatchObject({
      message: "Suggestion Source text must be copied from the selected Source",
    });
    expect(await listSocialSuggestions(fixture.env as never, "owner", "site-1")).toEqual([]);
  });

  it("keeps Quotes verbatim unless trimming is disclosed and removal-only", async () => {
    const changedQuote = {
      ...groundedInput(),
      suggestions: groundedInput().suggestions.map((suggestion, index) =>
        index === 0 ? { ...suggestion, bodyText: "We shipped something amazing." } : suggestion
      ),
    };
    await expect(
      createSocialSuggestions(fixture.env as never, "owner", changedQuote),
    ).rejects.toMatchObject({
      message: "A Quote Suggestion must remain verbatim or disclose that it was trimmed",
    });

    changedQuote.suggestions[0] = {
      ...changedQuote.suggestions[0]!,
      bodyText: "We shipped… and learned from real feedback.",
      quoteTrimmed: true,
    };
    const created = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      changedQuote,
    );
    expect(created[0]).toMatchObject({
      kind: "quote",
      quoteTrimmed: true,
      bodyText: "We shipped… and learned from real feedback.",
    });
  });

  it("records pasted owner text as the exact Source snapshot", async () => {
    const sourceText = groundedInput().sourceText;
    const created = await createSocialSuggestions(fixture.env as never, "owner", {
      ...groundedInput(),
      sourceType: "pasted",
      sourceRef: null,
      sourceTitle: "Pasted Source",
      sourceSnapshot: sourceText,
      sourceText,
      createdBy: "user",
    });
    expect(created).toHaveLength(4);
    expect(created.every((suggestion) => suggestion.sourceSnapshot === sourceText)).toBe(true);
    expect(created.every((suggestion) => suggestion.sourceRef.startsWith("pasted:social-source-")))
      .toBe(true);

    await expect(
      createSocialSuggestions(fixture.env as never, "owner", {
        ...groundedInput(),
        sourceType: "pasted",
        sourceRef: null,
        sourceSnapshot: "A changed snapshot",
      }),
    ).rejects.toMatchObject({
      message: "Pasted Source text must be preserved as the exact Source snapshot",
    });
  });

  it("lets only the owner edit, discard, and choose Suggestions", async () => {
    const created = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      groundedInput(),
    );
    const shortPost = created.find((suggestion) => suggestion.kind === "short_post")!;
    const carousel = created.find((suggestion) => suggestion.kind === "carousel_outline")!;

    await expect(
      updateSocialSuggestion(fixture.env as never, "someone-else", shortPost.id, {
        expectedUpdatedAt: shortPost.updatedAt,
        bodyText: "Not yours to edit.",
      }),
    ).resolves.toBeNull();
    const updated = await updateSocialSuggestion(
      fixture.env as never,
      "owner",
      shortPost.id,
      {
        expectedUpdatedAt: shortPost.updatedAt,
        bodyText: "Ship a useful slice. Learn from real feedback.",
      },
    );
    expect(updated).toMatchObject({
      bodyText: "Ship a useful slice. Learn from real feedback.",
      status: "suggested",
    });
    await expect(
      discardSocialSuggestion(
        fixture.env as never,
        "owner",
        carousel.id,
        { expectedUpdatedAt: carousel.updatedAt },
      ),
    ).resolves.toMatchObject({ status: "discarded" });

    const chosen = await chooseSocialSuggestion(
      fixture.env as never,
      "owner",
      shortPost.id,
      { platforms: ["linkedin", "x"], expectedUpdatedAt: updated!.updatedAt },
    );
    expect(chosen).toMatchObject({
      suggestion: { status: "chosen", selectedPostId: expect.stringMatching(/^social-post-/) },
      post: {
        post: {
          sourceRef: "journal:journal-1",
          sourceSnapshot: groundedInput().sourceSnapshot,
          sourceText: groundedInput().sourceText,
          createdBy: "user",
        },
      },
    });
    expect(chosen?.post.versions.map((version) => version.platform)).toEqual([
      "linkedin",
      "x",
    ]);
  });

  it("saves chosen Suggestions as separate Posts grouped by one Source", async () => {
    const suggestions = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      groundedInput(),
    );
    const [first, second] = suggestions;
    const [firstChosen, secondChosen] = await Promise.all([
      chooseSocialSuggestion(fixture.env as never, "owner", first!.id, {
        platforms: ["linkedin"],
        expectedUpdatedAt: first!.updatedAt,
      }),
      chooseSocialSuggestion(fixture.env as never, "owner", second!.id, {
        platforms: ["x"],
        expectedUpdatedAt: second!.updatedAt,
      }),
    ]);

    expect(firstChosen?.post.post.id).not.toBe(secondChosen?.post.post.id);
    expect(firstChosen?.post.post.sourceRef).toBe("journal:journal-1");
    expect(secondChosen?.post.post.sourceRef).toBe("journal:journal-1");
    expect(
      fixture.db.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM social_packages WHERE source_ref = 'journal:journal-1'",
      ),
    ).toEqual({ count: 2 });
  });

  it("uses one deterministic Post and platform-set winner for concurrent choose calls", async () => {
    const [suggestion] = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      groundedInput(),
    );
    const results = await Promise.allSettled([
      chooseSocialSuggestion(fixture.env as never, "owner", suggestion!.id, {
        platforms: ["linkedin"],
        expectedUpdatedAt: suggestion!.updatedAt,
      }),
      chooseSocialSuggestion(fixture.env as never, "owner", suggestion!.id, {
        platforms: ["x"],
        expectedUpdatedAt: suggestion!.updatedAt,
      }),
    ]);
    const chosen = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    expect(chosen.length).toBeGreaterThanOrEqual(1);
    expect(new Set(chosen.map((result) => result?.post.post.id))).toHaveLength(1);
    expect(new Set(chosen.map((result) => result?.suggestion.selectedPostId))).toHaveLength(1);
    expect(
      fixture.db.first<{ count: number }>("SELECT COUNT(*) AS count FROM social_packages"),
    ).toEqual({ count: 1 });
    const versions = fixture.db.rows<{ platform: string }>(
      "SELECT platform FROM social_variants ORDER BY platform",
    );
    expect(versions).toHaveLength(1);
    expect(["linkedin", "x"]).toContain(versions[0]?.platform);
    expect(
      fixture.db.first<{ status: string; selected_post_id: string }>(
        "SELECT status, selected_post_id FROM social_suggestions WHERE id = ?",
        suggestion!.id,
      ),
    ).toEqual({
      status: "chosen",
      selected_post_id: chosen[0]!.post.post.id,
    });
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ status: 409 });
    }
  });

  it.each(["edit", "discard"] as const)(
    "does not create a stale Post when %s wins before the choose claim",
    async (action) => {
      const suggestions = await createSocialSuggestions(
        fixture.env as never,
        "owner",
        groundedInput(),
      );
      const suggestion = action === "edit"
        ? suggestions.find((item) => item.kind === "short_post")!
        : suggestions.find((item) => item.kind === "carousel_outline")!;
      const claimReached = deferred();
      const releaseClaim = deferred();
      fixture.db.beforeChoosingClaim = async () => {
        claimReached.resolve();
        await releaseClaim.promise;
      };

      const choosing = chooseSocialSuggestion(
        fixture.env as never,
        "owner",
        suggestion.id,
        { platforms: ["linkedin"], expectedUpdatedAt: suggestion.updatedAt },
      );
      await claimReached.promise;

      if (action === "edit") {
        await updateSocialSuggestion(fixture.env as never, "owner", suggestion.id, {
          expectedUpdatedAt: suggestion.updatedAt,
          bodyText: "Edited copy wins before the Post claim.",
        });
      } else {
        await discardSocialSuggestion(
          fixture.env as never,
          "owner",
          suggestion.id,
          { expectedUpdatedAt: suggestion.updatedAt },
        );
      }
      releaseClaim.resolve();

      await expect(choosing).rejects.toMatchObject({ status: 409 });
      expect(
        fixture.db.first<{ count: number }>("SELECT COUNT(*) AS count FROM social_packages"),
      ).toEqual({ count: 0 });
      expect(
        fixture.db.first<{ status: string; body_text: string }>(
          "SELECT status, body_text FROM social_suggestions WHERE id = ?",
          suggestion.id,
        ),
      ).toMatchObject(
        action === "edit"
          ? { status: "suggested", body_text: "Edited copy wins before the Post claim." }
          : { status: "discarded" },
      );
    },
  );

  it.each(["edit", "discard"] as const)(
    "rejects %s after the choose claim wins",
    async (action) => {
      const suggestions = await createSocialSuggestions(
        fixture.env as never,
        "owner",
        groundedInput(),
      );
      const suggestion = action === "edit"
        ? suggestions.find((item) => item.kind === "short_post")!
        : suggestions.find((item) => item.kind === "carousel_outline")!;
      const postBatchReached = deferred();
      const releasePostBatch = deferred();
      fixture.db.beforePostBatch = async () => {
        postBatchReached.resolve();
        await releasePostBatch.promise;
      };

      const choosing = chooseSocialSuggestion(
        fixture.env as never,
        "owner",
        suggestion.id,
        { platforms: ["linkedin"], expectedUpdatedAt: suggestion.updatedAt },
      );
      await postBatchReached.promise;

      const competing = action === "edit"
        ? updateSocialSuggestion(fixture.env as never, "owner", suggestion.id, {
            expectedUpdatedAt: suggestion.updatedAt,
            bodyText: "This edit must lose to the claimed Post.",
          })
        : discardSocialSuggestion(
            fixture.env as never,
            "owner",
            suggestion.id,
            { expectedUpdatedAt: suggestion.updatedAt },
          );
      await expect(competing).rejects.toMatchObject({ status: 409 });
      releasePostBatch.resolve();

      await expect(choosing).resolves.toMatchObject({
        suggestion: { status: "chosen" },
        post: { versions: [{ platform: "linkedin", bodyText: suggestion.bodyText }] },
      });
      expect(
        fixture.db.first<{ count: number }>("SELECT COUNT(*) AS count FROM social_packages"),
      ).toEqual({ count: 1 });
    },
  );

  it("takes over a stale choosing claim left before Post creation", async () => {
    const suggestions = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      groundedInput(),
    );
    const suggestion = suggestions.find((item) => item.kind === "short_post")!;
    const staleAt = "2000-01-01T00:00:00.000Z";
    fixture.db.run(
      `UPDATE social_suggestions
       SET status = 'choosing', choose_token = 'crashed-claim', choosing_at = ?,
           choose_platforms_json = '["linkedin"]', updated_at = ?
       WHERE id = ?`,
      staleAt,
      staleAt,
      suggestion.id,
    );

    const recovered = await chooseSocialSuggestion(
      fixture.env as never,
      "owner",
      suggestion.id,
      { platforms: ["x"], expectedUpdatedAt: staleAt },
    );

    expect(recovered).toMatchObject({
      suggestion: { status: "chosen" },
      post: { versions: [{ platform: "linkedin", bodyText: suggestion.bodyText }] },
    });
  });

  it("finalizes an exact deterministic Post left after a choosing crash", async () => {
    const suggestions = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      groundedInput(),
    );
    const suggestion = suggestions.find((item) => item.kind === "short_post")!;
    const postId = deterministicSuggestionPostId(suggestion.id);
    await createSocialPost(
      fixture.env as never,
      "owner",
      {
        siteId: suggestion.siteId,
        sourceType: suggestion.sourceType,
        sourceRef: suggestion.sourceRef,
        sourceSnapshot: suggestion.sourceSnapshot,
        sourceText: suggestion.sourceText,
        ideaText: suggestion.bodyText,
        createdBy: "user",
        versions: [{ platform: "linkedin", format: "post", bodyText: suggestion.bodyText }],
      },
      { postId },
    );
    const choosingAt = new Date().toISOString();
    fixture.db.run(
      `UPDATE social_suggestions
       SET status = 'choosing', choose_token = 'crashed-after-post', choosing_at = ?,
           choose_platforms_json = '["linkedin"]', updated_at = ?
       WHERE id = ?`,
      choosingAt,
      choosingAt,
      suggestion.id,
    );

    const recovered = await chooseSocialSuggestion(
      fixture.env as never,
      "owner",
      suggestion.id,
      { platforms: ["x"], expectedUpdatedAt: choosingAt },
    );

    expect(recovered).toMatchObject({
      suggestion: { status: "chosen", selectedPostId: postId },
      post: { post: { id: postId }, versions: [{ platform: "linkedin" }] },
    });
    expect(
      fixture.db.first<{ count: number }>("SELECT COUNT(*) AS count FROM social_packages"),
    ).toEqual({ count: 1 });
  });

  it("adopts a deterministic Post after portable reset clears its choosing claim", async () => {
    const suggestions = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      groundedInput(),
    );
    const suggestion = suggestions.find((item) => item.kind === "short_post")!;
    const postId = deterministicSuggestionPostId(suggestion.id);
    await createSocialPost(
      fixture.env as never,
      "owner",
      {
        siteId: suggestion.siteId,
        sourceType: suggestion.sourceType,
        sourceRef: suggestion.sourceRef,
        sourceSnapshot: suggestion.sourceSnapshot,
        sourceText: suggestion.sourceText,
        ideaText: suggestion.bodyText,
        createdBy: "user",
        versions: [{ platform: "x", format: "post", bodyText: suggestion.bodyText }],
      },
      { postId },
    );

    const recovered = await chooseSocialSuggestion(
      fixture.env as never,
      "owner",
      suggestion.id,
      {
        platforms: ["linkedin"],
        expectedUpdatedAt: suggestion.updatedAt,
      },
    );

    expect(recovered).toMatchObject({
      suggestion: { status: "chosen", selectedPostId: postId },
      post: { post: { id: postId }, versions: [{ platform: "x" }] },
    });
    expect(
      fixture.db.first<{ status: string; choose_platforms_json: string }>(
        `SELECT status, choose_platforms_json
         FROM social_suggestions WHERE id = ?`,
        suggestion.id,
      ),
    ).toEqual({ status: "chosen", choose_platforms_json: '["x"]' });
  });

  it("rolls a choosing claim back when Post creation fails before inserting", async () => {
    const suggestions = await createSocialSuggestions(
      fixture.env as never,
      "owner",
      groundedInput(),
    );
    const suggestion = suggestions.find((item) => item.kind === "short_post")!;
    fixture.db.beforePostBatch = async () => {
      throw new Error("Post batch unavailable");
    };

    await expect(
      chooseSocialSuggestion(fixture.env as never, "owner", suggestion.id, {
        platforms: ["linkedin"],
        expectedUpdatedAt: suggestion.updatedAt,
      }),
    ).rejects.toThrow("Post batch unavailable");
    expect(
      fixture.db.first<{
        status: string;
        choose_token: string | null;
        choosing_at: string | null;
        choose_platforms_json: string | null;
        updated_at: string;
      }>(
        `SELECT status, choose_token, choosing_at, choose_platforms_json, updated_at
         FROM social_suggestions WHERE id = ?`,
        suggestion.id,
      ),
    ).toEqual({
      status: "suggested",
      choose_token: null,
      choosing_at: null,
      choose_platforms_json: null,
      updated_at: suggestion.updatedAt,
    });
  });
});

function groundedInput(): CreateSocialSuggestionsInput {
  const sourceText = "We shipped the smallest useful slice and learned from real feedback.";
  return {
    siteId: "site-1",
    sourceType: "journal" as const,
    sourceRef: "journal:journal-1",
    sourceTitle: "Small useful slices",
    sourceSnapshot: JSON.stringify({
      id: "journal-1",
      title: "Small useful slices",
      body: sourceText,
    }),
    sourceText,
    createdBy: "agent" as const,
    suggestions: [
      {
        kind: "quote" as const,
        bodyText: sourceText,
        sourceExcerpt: sourceText,
      },
      {
        kind: "short_post" as const,
        bodyText: "Ship the smallest useful slice. Learn from real feedback.",
        sourceExcerpt: sourceText,
      },
      {
        kind: "thread" as const,
        bodyText: "1. Ship the smallest useful slice.\n2. Learn from real feedback.",
        sourceExcerpt: sourceText,
      },
      {
        kind: "carousel_outline" as const,
        bodyText: "Slide 1: The smallest useful slice\nSlide 2: Learn from real feedback",
        sourceExcerpt: sourceText,
      },
    ],
  };
}

function createFixture() {
  const db = new TestD1Database();
  db.exec(`${schemaSql}\n${suggestionMigrationSql}`);
  db.run("INSERT INTO sites (id, user_id) VALUES ('site-1', 'owner')");
  return { db, env: { DB: db }, close: () => db.close() };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { promise, resolve: release };
}

function deterministicSuggestionPostId(suggestionId: string): string {
  const suffix = suggestionId.startsWith("social-suggestion-")
    ? suggestionId.slice("social-suggestion-".length)
    : suggestionId;
  return `social-post-${suffix}`;
}

class TestD1Database {
  private readonly directory = mkdtempSync(join(tmpdir(), "me3-social-suggestions-"));
  private readonly database = join(this.directory, "fixture.sqlite");
  beforePostBatch: (() => Promise<void>) | undefined;
  beforeChoosingClaim: (() => Promise<void>) | undefined;

  exec(sql: string) {
    sqliteExec(this.database, sql);
  }

  prepare(sql: string) {
    return new TestD1Statement(this, this.database, sql);
  }

  async batch(statements: TestD1Statement[]) {
    if (
      this.beforePostBatch &&
      statements.some((statement) => statement.boundSql().includes("INSERT INTO social_packages"))
    ) {
      const beforePostBatch = this.beforePostBatch;
      this.beforePostBatch = undefined;
      await beforePostBatch();
    }
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

  rows<T>(sql: string, ...values: unknown[]): T[] {
    return sqliteRows<T>(this.database, bindSql(sql, values));
  }

  async beforeFirst(sql: string): Promise<void> {
    if (!sql.includes("SET status = 'choosing'") || !this.beforeChoosingClaim) return;
    const beforeChoosingClaim = this.beforeChoosingClaim;
    this.beforeChoosingClaim = undefined;
    await beforeChoosingClaim();
  }

  close() {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

class TestD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly owner: TestD1Database,
    private readonly database: string,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    await this.owner.beforeFirst(this.sql);
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
  const result = spawnSync("sqlite3", [database], { input: sql, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "SQLite command failed");
  }
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
  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL
  );

  CREATE TABLE social_packages (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    post_slug TEXT NOT NULL,
    post_title_snapshot TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    goal TEXT,
    status TEXT NOT NULL,
    created_by TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT,
    source_snapshot TEXT NOT NULL,
    source_text TEXT NOT NULL,
    idea_text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(site_id, post_slug)
  );

  CREATE TABLE social_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE social_variants (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    target_account_id TEXT,
    format TEXT NOT NULL,
    body_text TEXT NOT NULL,
    asset_manifest_json TEXT NOT NULL,
    source_excerpt TEXT,
    approval_status TEXT NOT NULL,
    approved_at TEXT,
    approved_by_user_id TEXT,
    scheduled_for TEXT,
    timezone TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(package_id, platform)
  );

  CREATE TABLE social_publications (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL,
    status TEXT NOT NULL,
    scheduled_for TEXT,
    timezone TEXT,
    platform_post_url TEXT,
    published_at TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE social_publication_events (
    id TEXT PRIMARY KEY,
    publication_id TEXT,
    variant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL
  );
`;
