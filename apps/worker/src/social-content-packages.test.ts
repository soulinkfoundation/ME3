import { describe, expect, it } from "vitest";
import * as socialPublishingPackage from "@me3-core/plugin-social-publishing";
import {
  SocialPostInputError,
  SocialPublishingInputError,
  createPostVersionPublication,
  createSocialPost,
  dispatchDueSocialPublications,
  listSocialPosts,
  publishQueuedPublication,
  updatePostVersion,
  type SocialPostEnv,
} from "@me3-core/plugin-social-publishing";
import * as workerSocialPublishing from "./social-publishing";

type Row = Record<string, unknown>;

async function encryptTestSecret(secret: string, installKey: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(installKey),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret),
  );
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createEnv() {
  const sites = [{ id: "site-1", user_id: "owner" }];
  const accounts: Row[] = [
    {
      id: "linkedin-1",
      user_id: "owner",
      site_id: "site-1",
      platform: "linkedin",
      platform_account_id: "urn:li:person:owner",
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      token_expires_at: "2099-01-01T00:00:00.000Z",
      metadata_json: "{}",
      status: "active",
    },
    {
      id: "instagram-1",
      user_id: "owner",
      site_id: "site-1",
      platform: "instagram",
      status: "active",
    },
    {
      id: "x-1",
      user_id: "owner",
      site_id: "site-1",
      platform: "x",
      status: "active",
    },
  ];
  const packages: Row[] = [];
  const variants: Row[] = [];
  const events: Row[] = [];
  const publications: Row[] = [];
  const queueMessages: Array<{ publicationId: string }> = [];
  const state = { sites, accounts, packages, variants, events, publications };

  const db = {
    beforeNextBatch: undefined as (() => Promise<void>) | undefined,
    prepare(sql: string) {
      return new Statement(sql, state);
    },
    async batch(statements: Statement[]) {
      const beforeBatch = this.beforeNextBatch;
      this.beforeNextBatch = undefined;
      await beforeBatch?.();
      for (const statement of statements) await statement.run();
      return [];
    },
  };

  return {
    env: { DB: db } as unknown as SocialPostEnv,
    publishingEnv: {
      DB: db,
      TOKEN_ENCRYPTION_KEY: "social-test-token-key",
      SOCIAL_PUBLISH_QUEUE: {
        async send(message: { publicationId: string }) {
          queueMessages.push(message);
        },
      },
    },
    db,
    accounts,
    packages,
    variants,
    events,
    publications,
    queueMessages,
  };
}

describe("Social Posts", () => {
  it("exposes only canonical Post and Publication entrypoints", () => {
    const publicSurfaces: object[] = [
      socialPublishingPackage,
      workerSocialPublishing,
    ];
    const legacyExports = [
      "appendContentItemMedia",
      "createContentItem",
      "createQueuedContentPublicationAndEnqueue",
      "createQueuedPostVersionPublicationAndEnqueue",
      "createQueuedSocialVariantPublicationAndEnqueue",
      "createSocialContentPackage",
      "deleteContentItem",
      "getContentStats",
      "getSocialContentPackage",
      "listContentItems",
      "listSocialContentPackages",
      "markContentItemPublishing",
      "publishQueuedContentPublication",
      "queueContentItem",
      "reorderContentQueue",
      "resolveSocialVariantPublicationOutcome",
      "SocialContentPackageInputError",
      "unqueueContentItem",
      "updateContentItem",
      "updateSocialAccountVariant",
    ];

    for (const publicSurface of publicSurfaces) {
      expect(publicSurface).toMatchObject({
        createSocialPost: expect.any(Function),
        deleteSocialPost: expect.any(Function),
        updatePostVersion: expect.any(Function),
        createPostVersionPublication: expect.any(Function),
        listPostVersionPublications: expect.any(Function),
        cancelPublication: expect.any(Function),
        resolvePublicationOutcome: expect.any(Function),
        publishQueuedPublication: expect.any(Function),
      });
      for (const legacyExport of legacyExports) {
        expect(publicSurface).not.toHaveProperty(legacyExport);
      }
    }
  });

  it("creates source-backed platform Versions and invalidates approval after edits", async () => {
    const { env, publishingEnv, events } = createEnv();

    const created = await createSocialPost(env, "owner", {
      siteId: "site-1",
      sourceType: "journal",
      sourceRef: "journal:2026-07-10",
      sourceSnapshot: "Today we shipped the first useful slice.",
      sourceText: "Today we shipped the first useful slice.",
      ideaText: "Shipping a small useful slice beats a giant roadmap.",
      createdBy: "agent",
      versions: [
        {
          platform: "linkedin",
          targetAccountId: "linkedin-1",
          bodyText: "A small useful slice beats a giant roadmap.",
        },
        {
          platform: "instagram",
          targetAccountId: "instagram-1",
          bodyText: "Ship the useful slice first.",
        },
      ],
    });

    expect(created.post).toMatchObject({
      sourceType: "journal",
      sourceRef: "journal:2026-07-10",
      createdBy: "agent",
    });
    expect(created.versions).toHaveLength(2);
    expect(created.versions.every((version) => version.approvalStatus === "draft")).toBe(
      true,
    );
    expect(events).toHaveLength(2);

    const linkedin = created.versions.find((version) => version.platform === "linkedin");
    expect(linkedin).toBeTruthy();
    const approved = await updatePostVersion(env, "owner", linkedin!.id, {
      approvalStatus: "approved",
    });
    expect(approved).toMatchObject({
      approvalStatus: "approved",
      approvedByUserId: "owner",
    });
    expect(approved?.approvedAt).toBeTruthy();

    const scheduled = await createPostVersionPublication(
      publishingEnv as never,
      "owner",
      linkedin!.id,
      {
        scheduledFor: "2099-07-11T08:30:00.000Z",
        timezone: "Europe/Dublin",
      },
    );
    expect(scheduled).toMatchObject({
      status: "scheduled",
      versionId: linkedin!.id,
      scheduledFor: "2099-07-11T08:30:00.000Z",
      timezone: "Europe/Dublin",
    });

    const posts = await listSocialPosts(env, "owner", "site-1");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.versions).toHaveLength(2);

    const edited = await updatePostVersion(env, "owner", linkedin!.id, {
      bodyText: "A smaller, sharper version.",
    });
    expect(edited).toMatchObject({
      bodyText: "A smaller, sharper version.",
      approvalStatus: "draft",
      approvedAt: null,
      approvedByUserId: null,
      scheduledFor: null,
      timezone: null,
    });
  });

  it("atomically cancels a schedule committed immediately before a Version edit batch", async () => {
    const { db, env, publishingEnv, publications, events } = createEnv();
    const created = await createSocialPost(env, "owner", {
      siteId: "site-1",
      sourceType: "pasted",
      sourceSnapshot: "An exact approved Post",
      sourceText: "An exact approved Post",
      ideaText: "Edit and schedule race",
      versions: [{
        platform: "linkedin",
        targetAccountId: "linkedin-1",
        bodyText: "The reviewed Version.",
      }],
    });
    const approved = await updatePostVersion(env, "owner", created.versions[0]!.id, {
      approvalStatus: "approved",
    });
    events.length = 0;
    db.beforeNextBatch = async () => {
      await createPostVersionPublication(
        publishingEnv as never,
        "owner",
        approved!.id,
        {
          scheduledFor: "2099-07-11T08:30:00.000Z",
          timezone: "Europe/Dublin",
        },
      );
    };

    const edited = await updatePostVersion(env, "owner", approved!.id, {
      bodyText: "The Version changed before delivery.",
    });

    expect(edited).toMatchObject({
      approvalStatus: "draft",
      scheduledFor: null,
    });
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      status: "cancelled",
      error_code: "cancelled:version_changed",
    });
    expect(publications.filter((publication) => publication.status === "scheduled"))
      .toHaveLength(0);
    expect(events.filter((event) => event.event_type === "cancelled")).toEqual([
      expect.objectContaining({
        publication_id: publications[0]!.id,
        payload_json: JSON.stringify({ reason: "version_changed" }),
      }),
    ]);
  });

  it("requires an active target account before approval", async () => {
    const { env } = createEnv();
    const created = await createSocialPost(env, "owner", {
      siteId: "site-1",
      sourceType: "pasted",
      sourceSnapshot: "An unscheduled idea",
      sourceText: "An unscheduled idea",
      ideaText: "An unscheduled idea",
      versions: [{ platform: "linkedin", bodyText: "Draft only." }],
    });

    await expect(
      updatePostVersion(env, "owner", created.versions[0]!.id, {
        approvalStatus: "approved",
      }),
    ).rejects.toBeInstanceOf(SocialPostInputError);
  });

  it("keeps imported legacy Posts read-only without disturbing queued Publications", async () => {
    const { env, publishingEnv, accounts, packages, publications, queueMessages } = createEnv();
    const created = await createSocialPost(env, "owner", {
      siteId: "site-1",
      sourceType: "pasted",
      sourceSnapshot: "Owner-authored source",
      sourceText: "Owner-authored source",
      ideaText: "Legacy read-only boundary",
      versions: [{
        platform: "linkedin",
        targetAccountId: "linkedin-1",
        bodyText: "Do not mutate this after import.",
      }],
    });
    const version = await updatePostVersion(env, "owner", created.versions[0]!.id, {
      approvalStatus: "approved",
    });
    const storedPost = packages.find((row) => row.id === created.post.id)!;
    storedPost.source_type = "legacy_content_bank_read_only";

    await expect(
      updatePostVersion(env, "owner", version!.id, { bodyText: "A rewritten legacy Post." }),
    ).rejects.toMatchObject({
      status: 403,
      message: "This imported Post is read-only. Create a source-backed Post to make changes.",
    });
    await expect(
      createPostVersionPublication(
        publishingEnv as never,
        "owner",
        version!.id,
        {},
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "This imported Post is read-only. Create a source-backed Post before publishing.",
    });
    expect(publications).toHaveLength(0);
    expect(queueMessages).toHaveLength(0);

    storedPost.source_type = "pasted";
    const queued = await createPostVersionPublication(
      publishingEnv as never,
      "owner",
      version!.id,
      {},
    );
    storedPost.source_type = "legacy_content_bank_read_only";
    accounts[0]!.access_token_ciphertext = await encryptTestSecret(
      "linkedin-access-token",
      "social-test-token-key",
    );
    await publishQueuedPublication(
      publishingEnv as never,
      queued!.id,
      async (input) => {
        const url = String(input);
        return new Response(
          JSON.stringify(
            url.endsWith("/userinfo")
              ? { sub: "urn:li:person:owner" }
              : { id: "urn:li:share:legacy-delivery" },
          ),
          { status: url.endsWith("/userinfo") ? 200 : 201 },
        );
      },
    );

    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      id: queued?.id,
      status: "published",
      platform_post_id: "urn:li:share:legacy-delivery",
    });
    expect(storedPost.source_type).toBe("legacy_content_bank_read_only");
    expect(queueMessages).toEqual([{ publicationId: queued?.id }]);
  });

  it("rejects a Post without a human-authored Source snapshot", async () => {
    const { env, packages, variants } = createEnv();

    await expect(
      createSocialPost(env, "owner", {
        siteId: "site-1",
        sourceType: "journal",
        sourceRef: "journal:missing-source",
        sourceText: "Visible Source text alone is not enough.",
        ideaText: "Missing immutable Source snapshot",
        createdBy: "agent",
        versions: [{ platform: "linkedin", bodyText: "Do not save this." }],
      }),
    ).rejects.toBeInstanceOf(SocialPostInputError);
    expect(packages).toHaveLength(0);
    expect(variants).toHaveLength(0);
  });

  it("assigns pasted Source text a stable reference", async () => {
    const { env } = createEnv();
    const sourceText = "A human-authored note pasted into Social Publishing.";

    const created = await createSocialPost(env, "owner", {
      siteId: "site-1",
      sourceType: "pasted",
      sourceSnapshot: sourceText,
      sourceText,
      ideaText: "Reuse this pasted note",
      versions: [{ platform: "linkedin", bodyText: sourceText }],
    });

    expect(created.post).toMatchObject({
      sourceType: "pasted",
      sourceSnapshot: sourceText,
      sourceText,
    });
    expect(created.post.sourceRef).toMatch(/^pasted:social-post-/);
    expect(created.versions[0]).toMatchObject({
      postId: created.post.id,
      sourceExcerpt: sourceText,
    });
  });

  it("rejects scheduling and publishing draft-only X Versions", async () => {
    for (const platform of ["x"] as const) {
      const { env, publishingEnv, publications, queueMessages } = createEnv();
      const platformLabel = platform === "x" ? "X" : "Instagram";
      const sourceText = `A human-authored Source for ${platformLabel}.`;
      const created = await createSocialPost(env, "owner", {
        siteId: "site-1",
        sourceType: "pasted",
        sourceSnapshot: sourceText,
        sourceText,
        ideaText: `${platformLabel} draft-only capability`,
        versions: [{
          platform,
          targetAccountId: `${platform}-1`,
          bodyText: sourceText,
        }],
      });
      const version = await updatePostVersion(env, "owner", created.versions[0]!.id, {
        approvalStatus: "approved",
      });

      await expect(
        createPostVersionPublication(
          publishingEnv as never,
          "owner",
          version!.id,
          {
            scheduledFor: "2099-07-11T08:30:00.000Z",
            timezone: "Europe/Dublin",
          },
        ),
      ).rejects.toThrow(
        `${platformLabel} Versions are draft-only and cannot be scheduled yet`,
      );
      await expect(
        createPostVersionPublication(
          publishingEnv as never,
          "owner",
          version!.id,
          {},
        ),
      ).rejects.toBeInstanceOf(SocialPublishingInputError);
      expect(publications).toHaveLength(0);
      expect(queueMessages).toHaveLength(0);
    }
  });

  it("queues an approved LinkedIn Version only once", async () => {
    const { env, publishingEnv, publications, queueMessages } = createEnv();
    const created = await createSocialPost(env, "owner", {
      siteId: "site-1",
      sourceType: "pasted",
      sourceSnapshot: "One exact LinkedIn Version",
      sourceText: "One exact LinkedIn Version",
      ideaText: "One exact LinkedIn Version",
      versions: [{
        platform: "linkedin",
        targetAccountId: "linkedin-1",
        bodyText: "Publish this once.",
      }],
    });
    const version = await updatePostVersion(env, "owner", created.versions[0]!.id, {
      approvalStatus: "approved",
    });

    const [first, replay] = await Promise.all([
      createPostVersionPublication(
        publishingEnv as never,
        "owner",
        version!.id,
        {},
      ),
      createPostVersionPublication(
        publishingEnv as never,
        "owner",
        version!.id,
        {},
      ),
    ]);

    expect(first).toMatchObject({ status: "queued", versionId: version!.id });
    expect(replay?.id).toBe(first?.id);
    expect(publications).toHaveLength(1);
    expect(queueMessages).toEqual([{ publicationId: first?.id }]);
  });

  it("dispatches an approved LinkedIn Version once when its schedule becomes due", async () => {
    const { env, publishingEnv, publications, queueMessages } = createEnv();
    const created = await createSocialPost(env, "owner", {
      siteId: "site-1",
      sourceType: "mission_task",
      sourceRef: "mission-task:due-1",
      sourceSnapshot: "A completed task worth sharing.",
      sourceText: "A completed task worth sharing.",
      ideaText: "Share the completed task",
      versions: [{
        platform: "linkedin",
        targetAccountId: "linkedin-1",
        bodyText: "A completed task worth sharing.",
      }],
    });
    const version = await updatePostVersion(env, "owner", created.versions[0]!.id, {
      approvalStatus: "approved",
    });
    const scheduled = await createPostVersionPublication(
      publishingEnv as never,
      "owner",
      version!.id,
      {
        scheduledFor: "2099-07-11T08:30:00.000Z",
        timezone: "Europe/Dublin",
      },
    );
    const stored = publications.find((row) => row.id === scheduled?.id)!;
    stored.scheduled_for = "2020-01-01T00:00:00.000Z";

    const result = await dispatchDueSocialPublications(publishingEnv as never);

    expect(result).toEqual({ queued: 1, skipped: 0 });
    expect(publications).toHaveLength(1);
    expect(queueMessages).toHaveLength(1);
    expect(stored).toMatchObject({ status: "queued", queued_at: expect.any(String) });
  });
});

class Statement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly state: {
      sites: Row[];
      accounts: Row[];
      packages: Row[];
      variants: Row[];
      events: Row[];
      publications: Row[];
    },
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    if (
      this.sql.includes("INSERT INTO social_publication_events") &&
      this.sql.includes("RETURNING id")
    ) {
      const [id, publicationId, variantId, payload, createdAt] = this.values;
      const publication = this.state.publications.find((row) => row.id === publicationId);
      const eventType = this.sql.includes("'publishing'") ? "publishing" : "generated";
      if (!publication || (eventType === "publishing" && publication.status !== "publishing")) {
        return null as T | null;
      }
      this.state.events.push({
        id,
        publication_id: publicationId,
        variant_id: variantId,
        event_type: eventType,
        payload_json: payload,
        created_at: createdAt,
      });
      return { id } as T;
    }
    if (
      this.sql.includes("FROM social_publications publication") &&
      this.sql.includes("JOIN social_publication_events event")
    ) {
      const [eventId, publicationId] = this.values;
      const publication = this.state.publications.find((row) => row.id === publicationId);
      const event = this.state.events.find(
        (row) =>
          row.id === eventId &&
          row.publication_id === publicationId &&
          row.event_type === "scheduled",
      );
      return (publication && event
        ? {
            id: publication.id,
            platform: publication.platform,
            target_account_id_snapshot: publication.target_account_id_snapshot,
          }
        : null) as T | null;
    }
    if (this.sql.includes("FROM plugin_installations")) {
      return { enabled: 1, status: "installed" } as T;
    }
    if (
      this.sql.includes("INSERT INTO social_publications") &&
      this.sql.includes("RETURNING id, platform, target_account_id_snapshot")
    ) {
      const [
        id,
        scheduledFor,
        timezone,
        requestedByType,
        ownerId,
        requestContextJson,
        createdAt,
        updatedAt,
        versionId,
        guardedOwnerId,
        guardedPlatform,
        duplicateScheduledFor,
      ] = this.values;
      const variant = this.state.variants.find((row) => row.id === versionId);
      const pkg = this.state.packages.find((row) => row.id === variant?.package_id);
      const site = this.state.sites.find(
        (row) => row.id === pkg?.site_id && row.user_id === guardedOwnerId,
      );
      const account = this.state.accounts.find(
        (row) =>
          row.id === variant?.target_account_id &&
          row.user_id === site?.user_id &&
          row.site_id === pkg?.site_id &&
          row.platform === variant?.platform &&
          row.status === "active",
      );
      const duplicate = this.state.publications.some(
        (row) =>
          row.variant_id === versionId &&
          row.scheduled_for === duplicateScheduledFor &&
          row.status === "scheduled",
      );
      if (
        !variant ||
        !pkg ||
        !site ||
        !account ||
        site.user_id !== ownerId ||
        pkg.source_type === "legacy_content_bank_read_only" ||
        variant.approval_status !== "approved" ||
        variant.platform !== guardedPlatform ||
        duplicate
      ) {
        return null as T | null;
      }
      this.state.publications.push({
        id,
        variant_id: variant.id,
        site_id: pkg.site_id,
        platform: variant.platform,
        status: "scheduled",
        scheduled_for: scheduledFor,
        timezone,
        target_account_id_snapshot: variant.target_account_id,
        format_snapshot: variant.format,
        body_text_snapshot: variant.body_text,
        asset_manifest_json_snapshot: variant.asset_manifest_json,
        approval_status_snapshot: variant.approval_status,
        approved_at_snapshot: variant.approved_at,
        approved_by_user_id_snapshot: variant.approved_by_user_id,
        requested_by_type: requestedByType,
        requested_by_user_id: ownerId,
        request_context_json: requestContextJson,
        platform_post_id: null,
        platform_post_url: null,
        queued_at: null,
        published_at: null,
        error_code: null,
        error_message: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return {
        id,
        platform: variant.platform,
        target_account_id_snapshot: variant.target_account_id,
      } as T;
    }
    if (
      this.sql.includes("UPDATE social_publications") &&
      this.sql.includes("RETURNING id")
    ) {
      const providerWriteStarted = this.sql.includes(
        "outcome_unknown:provider_write_started",
      );
      const publishingClaim = this.sql.includes("SET status = 'publishing'");
      const publicationId = providerWriteStarted || publishingClaim
        ? this.values[1]
        : this.values[0];
      const publication = this.state.publications.find((row) => row.id === publicationId);
      if (!publication) return null as T | null;
      if (providerWriteStarted) {
        if (
          publication.status !== "publishing" ||
          publication.updated_at !== this.values[2] ||
          String(publication.error_code || "").startsWith("outcome_unknown")
        ) return null as T | null;
        publication.error_code = "outcome_unknown:provider_write_started";
        publication.error_message = this.values[0];
      } else if (this.sql.includes("SET queued_at = datetime('now')")) {
        if (publication.status !== "queued" || publication.queued_at) return null as T | null;
        publication.queued_at = new Date().toISOString();
      } else if (this.sql.includes("SET status = 'queued'")) {
        if (publication.status !== "scheduled") return null as T | null;
        publication.status = "queued";
        publication.queued_at = null;
      } else if (this.sql.includes("SET status = 'publishing'")) {
        if (publication.status !== "queued") return null as T | null;
        publication.status = "publishing";
        publication.error_code = null;
        publication.error_message = null;
        publication.provider_response_json = null;
      } else if (this.sql.includes("SET status = 'cancelled'")) {
        if (publication.status !== "scheduled") return null as T | null;
        publication.status = "cancelled";
        publication.error_code = "cancelled:owner_request";
        publication.error_message = "Cancelled by the owner.";
      }
      publication.updated_at = publishingClaim
        ? this.values[0]
        : new Date().toISOString();
      return {
        id: publication.id,
        variant_id: publication.variant_id,
        updated_at: publication.updated_at,
      } as T;
    }
    if (this.sql.includes("COUNT(*) AS count") && this.sql.includes("social_publication_events")) {
      const [publicationId] = this.values;
      const eventType = this.sql.includes("event_type = 'retried'")
        ? "retried"
        : "publishing";
      return {
        count: this.state.events.filter(
          (event) => event.publication_id === publicationId && event.event_type === eventType,
        ).length,
      } as T;
    }
    if (
      this.sql.includes("SELECT id FROM social_publications") &&
      this.sql.includes("scheduled_for = ?")
    ) {
      const [variantId, scheduledFor] = this.values;
      const publication = this.state.publications.find(
        (row) =>
          row.variant_id === variantId &&
          row.scheduled_for === scheduledFor &&
          row.status === "scheduled",
      );
      return (publication ? { id: publication.id } : null) as T | null;
    }
    if (this.sql.includes("pub.status AS pub_status")) {
      const [publicationId] = this.values;
      const publication = this.state.publications.find((row) => row.id === publicationId);
      const variant = this.state.variants.find((row) => row.id === publication?.variant_id);
      const pkg = this.state.packages.find((row) => row.id === variant?.package_id);
      const site = this.state.sites.find((row) => row.id === pkg?.site_id);
      const account = this.state.accounts.find(
        (row) =>
          row.id === publication?.target_account_id_snapshot &&
          row.site_id === publication?.site_id &&
          row.platform === publication?.platform,
      );
      return (publication && variant && pkg && site
        ? {
            publication_id: publication.id,
            variant_id: publication.variant_id,
            site_id: publication.site_id,
            platform: publication.platform,
            pub_status: publication.status,
            pub_updated_at: publication.updated_at,
            pub_error_code: publication.error_code || null,
            body: publication.body_text_snapshot,
            media_manifest_json: publication.asset_manifest_json_snapshot,
            platforms_json: "[]",
            approved_by_human: publication.approval_status_snapshot === "approved" ? 1 : 0,
            user_id: site.user_id,
            account_id: account?.id || null,
            platform_account_id: account?.platform_account_id || null,
            access_token_ciphertext: account?.access_token_ciphertext || null,
            refresh_token_ciphertext: account?.refresh_token_ciphertext || null,
            token_expires_at: account?.token_expires_at || null,
            account_status: account?.status || null,
            account_metadata_json: account?.metadata_json || null,
          }
        : null) as T | null;
    }
    if (this.sql.includes("FROM social_publications pub") && this.sql.includes("pub.variant_id = ?")) {
      const [variantId, ...statuses] = this.values;
      const matches = this.state.publications.filter(
        (row) =>
          row.variant_id === variantId &&
          (statuses.length === 0 || statuses.includes(row.status)),
      );
      return (matches.at(-1) || null) as T | null;
    }
    if (this.sql.includes("FROM social_publications pub") && this.sql.includes("pub.id = ?")) {
      const [publicationId, userId] = this.values;
      const publication = this.state.publications.find((row) => row.id === publicationId);
      const variant = this.state.variants.find((row) => row.id === publication?.variant_id);
      const pkg = this.state.packages.find((row) => row.id === variant?.package_id);
      const site = this.state.sites.find(
        (row) => row.id === pkg?.site_id && row.user_id === userId,
      );
      return (site ? publication || null : null) as T | null;
    }
    if (this.sql.includes("SELECT id FROM sites")) {
      const [id, userId] = this.values;
      return (this.state.sites.find(
        (row) => row.id === id && row.user_id === userId,
      ) || null) as T | null;
    }
    if (this.sql.includes("SELECT id FROM social_accounts")) {
      const [id, userId, siteId, platform] = this.values;
      return (this.state.accounts.find(
        (row) =>
          row.id === id &&
          row.user_id === userId &&
          row.site_id === siteId &&
          row.platform === platform &&
          row.status === "active",
      ) || null) as T | null;
    }
    if (this.sql.includes("SELECT package_id FROM social_variants")) {
      const [variantId] = this.values;
      const variant = this.state.variants.find((row) => row.id === variantId);
      return (variant ? { package_id: variant.package_id } : null) as T | null;
    }
    if (this.sql.includes("SELECT COUNT(*) AS total")) {
      const [packageId] = this.values;
      const versions = this.state.variants.filter((row) => row.package_id === packageId);
      const publishedCount = versions.filter((version) =>
        this.state.publications.some(
          (publication) =>
            publication.variant_id === version.id && publication.status === "published",
        )
      ).length;
      return { total: versions.length, published_count: publishedCount } as T;
    }
    if (this.sql.includes("FROM social_packages p") && !this.sql.includes("social_variants")) {
      const [packageId, userId] = this.values;
      const pkg = this.state.packages.find((row) => row.id === packageId);
      const site = this.state.sites.find(
        (row) => row.id === pkg?.site_id && row.user_id === userId,
      );
      return (site ? pkg : null) as T | null;
    }
    if (this.sql.includes("FROM social_variants v")) {
      const [variantId, userId] = this.values;
      const variant = this.state.variants.find((row) => row.id === variantId);
      const pkg = this.state.packages.find((row) => row.id === variant?.package_id);
      const site = this.state.sites.find(
        (row) => row.id === pkg?.site_id && row.user_id === userId,
      );
      return (site && variant
        ? { ...variant, site_id: pkg?.site_id, post_source_type: pkg?.source_type }
        : null) as T | null;
    }
    if (this.sql.includes("FROM social_variants WHERE id")) {
      const [variantId] = this.values;
      return (this.state.variants.find((row) => row.id === variantId) || null) as T | null;
    }
    return null as T | null;
  }

  async all<T>() {
    if (
      this.sql.includes("FROM social_publications") &&
      this.sql.includes("status = 'scheduled'") &&
      this.sql.includes("datetime(scheduled_for)")
    ) {
      return {
        results: this.state.publications
          .filter(
            (row) =>
              row.status === "scheduled" &&
              typeof row.scheduled_for === "string" &&
              Date.parse(row.scheduled_for) <= Date.now(),
          )
          .slice(0, 20)
          .map((row) => ({ id: row.id, variant_id: row.variant_id })) as T[],
      };
    }
    if (
      this.sql.includes("SELECT id FROM social_publications") &&
      this.sql.includes("variant_id = ?") &&
      this.sql.includes("status = 'scheduled'")
    ) {
      const [variantId] = this.values;
      return {
        results: this.state.publications
          .filter((row) => row.variant_id === variantId && row.status === "scheduled")
          .map((row) => ({ id: row.id })) as T[],
      };
    }
    if (this.sql.includes("FROM social_publications") && this.sql.includes("variant_id = ?")) {
      const [variantId] = this.values;
      return {
        results: this.state.publications
          .filter((row) => row.variant_id === variantId)
          .slice()
          .reverse() as T[],
      };
    }
    if (this.sql.includes("FROM social_packages p")) {
      const [userId, siteId] = this.values;
      return {
        results: this.state.packages.filter((pkg) => {
          const site = this.state.sites.find(
            (row) => row.id === pkg.site_id && row.user_id === userId,
          );
          return site && (!siteId || pkg.site_id === siteId) && pkg.status !== "archived";
        }) as T[],
      };
    }
    if (this.sql.includes("FROM social_variants")) {
      const [packageId] = this.values;
      return {
        results: this.state.variants
          .filter((row) => row.package_id === packageId)
          .map((row) => {
            const publications = this.state.publications.filter(
              (publication) => publication.variant_id === row.id,
            );
            const scheduled = publications
              .filter((publication) => publication.status === "scheduled")
              .sort((left, right) =>
                String(left.scheduled_for).localeCompare(String(right.scheduled_for))
              )[0];
            const latest = publications.at(-1);
            return {
              ...row,
              scheduled_for: scheduled?.scheduled_for || null,
              timezone: scheduled?.timezone || null,
              publication_status: latest?.status || null,
              platform_post_url: latest?.platform_post_url || null,
              published_at: latest?.published_at || null,
              publication_error_code: latest?.error_code || null,
              publication_error_message: latest?.error_message || null,
            };
          }) as T[],
      };
    }
    return { results: [] as T[] };
  }

  async run() {
    if (this.sql.includes("INSERT INTO social_packages")) {
      const [
        id,
        siteId,
        postSlug,
        title,
        sourceHash,
        goal,
        createdBy,
        sourceType,
        sourceRef,
        sourceSnapshot,
        sourceText,
        ideaText,
        createdAt,
        updatedAt,
      ] = this.values;
      this.state.packages.push({
        id,
        site_id: siteId,
        post_slug: postSlug,
        post_title_snapshot: title,
        source_hash: sourceHash,
        goal,
        status: "ready",
        created_by: createdBy,
        source_type: sourceType,
        source_ref: sourceRef,
        source_snapshot: sourceSnapshot,
        source_text: sourceText,
        idea_text: ideaText,
        created_at: createdAt,
        updated_at: updatedAt,
      });
    } else if (this.sql.includes("INSERT INTO social_variants")) {
      const [
        id,
        packageId,
        platform,
        targetAccountId,
        format,
        bodyText,
        assets,
        sourceExcerpt,
        createdAt,
        updatedAt,
      ] = this.values;
      this.state.variants.push({
        id,
        package_id: packageId,
        platform,
        target_account_id: targetAccountId,
        format,
        body_text: bodyText,
        asset_manifest_json: assets,
        carousel_render_set_id: null,
        source_excerpt: sourceExcerpt,
        approval_status: "draft",
        approved_at: null,
        approved_by_user_id: null,
        scheduled_for: null,
        timezone: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
    } else if (this.sql.includes("INSERT INTO social_publications")) {
      if (this.sql.includes("SELECT ?, v.id")) {
        const [
          id,
          scheduledFor,
          timezone,
          requestedByType,
          ownerId,
          requestContextJson,
          createdAt,
          updatedAt,
          versionId,
        ] = this.values;
        const variant = this.state.variants.find((row) => row.id === versionId);
        const pkg = this.state.packages.find((row) => row.id === variant?.package_id);
        const site = this.state.sites.find(
          (row) => row.id === pkg?.site_id && row.user_id === ownerId,
        );
        const account = this.state.accounts.find(
          (row) =>
            row.id === variant?.target_account_id &&
            row.user_id === ownerId &&
            row.site_id === pkg?.site_id &&
            row.platform === variant?.platform &&
            row.status === "active",
        );
        const duplicate = this.state.publications.some(
          (row) =>
            row.variant_id === versionId &&
            row.scheduled_for === scheduledFor &&
            row.status === "scheduled",
        );
        if (
          !variant ||
          !pkg ||
          !site ||
          !account ||
          pkg.source_type === "legacy_content_bank_read_only" ||
          variant.approval_status !== "approved" ||
          duplicate
        ) {
          return {};
        }
        this.state.publications.push({
          id,
          variant_id: variant.id,
          site_id: pkg.site_id,
          platform: variant.platform,
          status: "scheduled",
          scheduled_for: scheduledFor,
          timezone,
          target_account_id_snapshot: variant.target_account_id,
          format_snapshot: variant.format,
          body_text_snapshot: variant.body_text,
          asset_manifest_json_snapshot: variant.asset_manifest_json,
          approval_status_snapshot: variant.approval_status,
          approved_at_snapshot: variant.approved_at,
          approved_by_user_id_snapshot: variant.approved_by_user_id,
          requested_by_type: requestedByType,
          requested_by_user_id: ownerId,
          request_context_json: requestContextJson,
          platform_post_id: null,
          platform_post_url: null,
          queued_at: null,
          published_at: null,
          error_code: null,
          error_message: null,
          created_at: createdAt,
          updated_at: updatedAt,
        });
        return {};
      }
      const [
        id,
        variantId,
        siteId,
        platform,
        status,
        scheduledFor,
        timezone,
        targetAccountIdSnapshot,
        formatSnapshot,
        bodyTextSnapshot,
        assetManifestJsonSnapshot,
        approvalStatusSnapshot,
        approvedAtSnapshot,
        approvedByUserIdSnapshot,
        requestedByType,
        requestedByUserId,
        requestContextJson,
        queuedAt,
        createdAt,
        updatedAt,
      ] = this.values;
      if (
        this.state.publications.some(
          (row) =>
            row.variant_id === variantId &&
            ["queued", "publishing"].includes(String(row.status)) &&
            ["queued", "publishing"].includes(String(status)),
        )
      ) {
        throw new Error("UNIQUE constraint failed: social_publications.variant_id");
      }
      this.state.publications.push({
        id,
        variant_id: variantId,
        site_id: siteId,
        platform,
        status,
        scheduled_for: scheduledFor,
        timezone,
        target_account_id_snapshot: targetAccountIdSnapshot,
        format_snapshot: formatSnapshot,
        body_text_snapshot: bodyTextSnapshot,
        asset_manifest_json_snapshot: assetManifestJsonSnapshot,
        approval_status_snapshot: approvalStatusSnapshot,
        approved_at_snapshot: approvedAtSnapshot,
        approved_by_user_id_snapshot: approvedByUserIdSnapshot,
        requested_by_type: requestedByType,
        requested_by_user_id: requestedByUserId,
        request_context_json: requestContextJson,
        platform_post_id: null,
        platform_post_url: null,
        queued_at: queuedAt,
        published_at: null,
        error_code: null,
        error_message: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
    } else if (this.sql.includes("INSERT INTO social_publication_events")) {
      if (this.sql.includes("FROM social_publications publication")) {
        if (!this.sql.includes("'cancelled'")) {
          const [id, createdAt, publicationId] = this.values;
          const publication = this.state.publications.find((row) => row.id === publicationId);
          if (publication) {
            this.state.events.push({
              id,
              publication_id: publication.id,
              variant_id: publication.variant_id,
              event_type: "scheduled",
              payload_json: JSON.stringify({
                action: "scheduled",
                scheduledFor: publication.scheduled_for,
                timezone: publication.timezone,
              }),
              created_at: createdAt,
            });
          }
          return {};
        }
        const [payload, createdAt, variantId] = this.values;
        for (const publication of this.state.publications.filter(
          (row) => row.variant_id === variantId && row.status === "scheduled",
        )) {
          this.state.events.push({
            id: `social-event-set-${publication.id}`,
            publication_id: publication.id,
            variant_id: publication.variant_id,
            event_type: "cancelled",
            payload_json: payload,
            created_at: createdAt,
          });
        }
        return {};
      }
      const usesBoundEventType = this.sql.includes(
        "VALUES (?, ?, ?, ?, ?, datetime('now'))",
      );
      const hasBoundPublicationId = usesBoundEventType || this.values.length === 5;
      const [id] = this.values;
      const publicationId = hasBoundPublicationId ? this.values[1] : null;
      const variantId = hasBoundPublicationId ? this.values[2] : this.values[1];
      const payload = usesBoundEventType
        ? this.values[4]
        : hasBoundPublicationId
          ? this.values[3]
          : this.values[2];
      const createdAt = usesBoundEventType
        ? new Date().toISOString()
        : this.values.at(-1);
      this.state.events.push({
        id,
        publication_id: publicationId,
        variant_id: variantId,
        event_type: usesBoundEventType
          ? this.values[3]
          : this.sql.includes("'cancelled'")
            ? "cancelled"
          : this.sql.includes("'approved'")
            ? "approved"
            : "generated",
        payload_json: payload,
        created_at: createdAt,
      });
    } else if (this.sql.includes("UPDATE social_publications")) {
      if (this.sql.includes("WHERE variant_id = ?")) {
        const [errorCode, errorMessage, updatedAt, variantId] = this.values;
        for (const publication of this.state.publications.filter(
          (row) => row.variant_id === variantId && row.status === "scheduled",
        )) {
          Object.assign(publication, {
            status: "cancelled",
            error_code: errorCode,
            error_message: errorMessage,
            updated_at: updatedAt,
          });
        }
        return {};
      }
      const usesStatusCas = this.sql.includes("AND status = ?");
      const publicationId = this.values.at(usesStatusCas ? -2 : -1);
      const expectedStatus = usesStatusCas ? this.values.at(-1) : null;
      const publication = this.state.publications.find((row) => row.id === publicationId);
      if (!publication) return {};
      if (expectedStatus && publication.status !== expectedStatus) return {};
      if (this.sql.includes("SET queued_at = NULL")) {
        publication.queued_at = null;
        publication.updated_at = new Date().toISOString();
      } else if (this.sql.includes("SET status = 'published'")) {
        const [platformPostId, platformPostUrl, providerResponseJson] = this.values;
        Object.assign(publication, {
          status: "published",
          platform_post_id: platformPostId,
          platform_post_url: platformPostUrl,
          provider_response_json: providerResponseJson,
          published_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        });
      } else if (this.sql.includes("SET status = 'cancelled'")) {
        const [errorCode, errorMessage, updatedAt] = this.values;
        Object.assign(publication, {
          status: "cancelled",
          error_code: this.sql.includes("error_code = ?")
            ? errorCode
            : "cancelled:approval_revoked",
          error_message: this.sql.includes("error_message = ?")
            ? errorMessage
            : "Cancelled because Version approval was removed.",
          updated_at: updatedAt || new Date().toISOString(),
        });
      } else if (this.sql.includes("SET status = 'scheduled'")) {
        Object.assign(publication, {
          status: "scheduled",
          queued_at: null,
          updated_at: new Date().toISOString(),
        });
      } else if (this.sql.includes("SET status = 'queued'")) {
        const [errorCode, errorMessage, providerResponseJson] = this.values;
        Object.assign(publication, {
          status: "queued",
          error_code: errorCode,
          error_message: errorMessage,
          provider_response_json: providerResponseJson,
          updated_at: new Date().toISOString(),
        });
      } else if (this.sql.includes("SET status = ?")) {
        const [nextStatus, errorCode, errorMessage, providerResponseJson] = this.values;
        Object.assign(publication, {
          status: nextStatus,
          error_code: errorCode,
          error_message: errorMessage,
          provider_response_json: providerResponseJson,
          updated_at: new Date().toISOString(),
        });
      }
    } else if (
      this.sql.includes("UPDATE social_variants") &&
      this.sql.includes("scheduled_for = NULL")
    ) {
      const variantId = this.values.at(-1);
      const variant = this.state.variants.find((row) => row.id === variantId);
      if (variant) {
        variant.scheduled_for = null;
        variant.timezone = null;
      }
    } else if (this.sql.includes("UPDATE social_variants")) {
      const [
        targetAccountId,
        format,
        bodyText,
        assets,
        carouselRenderSetId,
        approvalStatus,
        approvedAt,
        approvedByUserId,
        scheduledFor,
        timezone,
        updatedAt,
        variantId,
      ] = this.values;
      const variant = this.state.variants.find((row) => row.id === variantId);
      if (variant) {
        Object.assign(variant, {
          target_account_id: targetAccountId,
          format,
          body_text: bodyText,
          asset_manifest_json: assets,
          carousel_render_set_id: carouselRenderSetId,
          approval_status: approvalStatus,
          approved_at: approvedAt,
          approved_by_user_id: approvedByUserId,
          scheduled_for: scheduledFor,
          timezone,
          updated_at: updatedAt,
        });
      }
    }
    return {};
  }
}
