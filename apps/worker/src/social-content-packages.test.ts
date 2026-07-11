import { describe, expect, it } from "vitest";
import {
  SocialContentPackageInputError,
  createQueuedSocialVariantPublicationAndEnqueue,
  createSocialContentPackage,
  dispatchDueSocialPublications,
  listSocialContentPackages,
  updateSocialAccountVariant,
  type SocialContentPackageEnv,
} from "@me3-core/plugin-social-publishing";

type Row = Record<string, unknown>;

function createEnv() {
  const sites = [{ id: "site-1", user_id: "owner" }];
  const accounts = [
    {
      id: "linkedin-1",
      user_id: "owner",
      site_id: "site-1",
      platform: "linkedin",
      status: "active",
    },
    {
      id: "instagram-1",
      user_id: "owner",
      site_id: "site-1",
      platform: "instagram",
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
    prepare(sql: string) {
      return new Statement(sql, state);
    },
    async batch(statements: Statement[]) {
      for (const statement of statements) await statement.run();
      return [];
    },
  };

  return {
    env: { DB: db } as unknown as SocialContentPackageEnv,
    publishingEnv: {
      DB: db,
      SOCIAL_PUBLISH_QUEUE: {
        async send(message: { publicationId: string }) {
          queueMessages.push(message);
        },
      },
    },
    packages,
    variants,
    events,
    publications,
    queueMessages,
  };
}

describe("Social content packages", () => {
  it("creates source-backed platform variants and invalidates approval after edits", async () => {
    const { env, events } = createEnv();

    const created = await createSocialContentPackage(env, "owner", {
      siteId: "site-1",
      sourceType: "journal",
      sourceRef: "journal:2026-07-10",
      sourceSnapshot: "Today we shipped the first useful slice.",
      ideaText: "Shipping a small useful slice beats a giant roadmap.",
      createdBy: "agent",
      variants: [
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

    expect(created.package).toMatchObject({
      sourceType: "journal",
      sourceRef: "journal:2026-07-10",
      createdBy: "agent",
    });
    expect(created.variants).toHaveLength(2);
    expect(created.variants.every((variant) => variant.approvalStatus === "draft")).toBe(
      true,
    );
    expect(events).toHaveLength(2);

    const linkedin = created.variants.find((variant) => variant.platform === "linkedin");
    expect(linkedin).toBeTruthy();
    const approved = await updateSocialAccountVariant(env, "owner", linkedin!.id, {
      approvalStatus: "approved",
    });
    expect(approved).toMatchObject({
      approvalStatus: "approved",
      approvedByUserId: "owner",
    });
    expect(approved?.approvedAt).toBeTruthy();

    const scheduled = await updateSocialAccountVariant(env, "owner", linkedin!.id, {
      scheduledFor: "2099-07-11T08:30:00.000Z",
      timezone: "Europe/Dublin",
    });
    expect(scheduled).toMatchObject({
      approvalStatus: "approved",
      approvedAt: approved?.approvedAt,
      scheduledFor: "2099-07-11T08:30:00.000Z",
      timezone: "Europe/Dublin",
    });

    const packages = await listSocialContentPackages(env, "owner", "site-1");
    expect(packages).toHaveLength(1);
    expect(packages[0]?.variants).toHaveLength(2);

    const edited = await updateSocialAccountVariant(env, "owner", linkedin!.id, {
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

  it("requires an active target account before approval", async () => {
    const { env } = createEnv();
    const created = await createSocialContentPackage(env, "owner", {
      siteId: "site-1",
      sourceType: "original",
      ideaText: "An unscheduled idea",
      variants: [{ platform: "linkedin", bodyText: "Draft only." }],
    });

    await expect(
      updateSocialAccountVariant(env, "owner", created.variants[0]!.id, {
        approvalStatus: "approved",
      }),
    ).rejects.toBeInstanceOf(SocialContentPackageInputError);
  });

  it("queues an approved LinkedIn variant only once", async () => {
    const { env, publishingEnv, publications, queueMessages } = createEnv();
    const created = await createSocialContentPackage(env, "owner", {
      siteId: "site-1",
      sourceType: "original",
      ideaText: "One exact LinkedIn variant",
      variants: [{
        platform: "linkedin",
        targetAccountId: "linkedin-1",
        bodyText: "Publish this once.",
      }],
    });
    const variant = await updateSocialAccountVariant(env, "owner", created.variants[0]!.id, {
      approvalStatus: "approved",
    });

    const [first, replay] = await Promise.all([
      createQueuedSocialVariantPublicationAndEnqueue(
        publishingEnv as never,
        "owner",
        variant!.id,
      ),
      createQueuedSocialVariantPublicationAndEnqueue(
        publishingEnv as never,
        "owner",
        variant!.id,
      ),
    ]);

    expect(first).toMatchObject({ status: "queued", variantId: variant!.id });
    expect(replay?.id).toBe(first?.id);
    expect(publications).toHaveLength(1);
    expect(queueMessages).toEqual([{ publicationId: first?.id }]);
  });

  it("dispatches an approved LinkedIn variant once when its schedule becomes due", async () => {
    const { env, publishingEnv, variants, publications, queueMessages } = createEnv();
    const created = await createSocialContentPackage(env, "owner", {
      siteId: "site-1",
      sourceType: "mission_task",
      sourceRef: "mission-task:due-1",
      sourceSnapshot: "A completed task worth sharing.",
      ideaText: "Share the completed task",
      variants: [{
        platform: "linkedin",
        targetAccountId: "linkedin-1",
        bodyText: "A completed task worth sharing.",
      }],
    });
    await updateSocialAccountVariant(env, "owner", created.variants[0]!.id, {
      approvalStatus: "approved",
    });
    const stored = variants.find((row) => row.id === created.variants[0]!.id)!;
    stored.scheduled_for = "2020-01-01T00:00:00.000Z";
    stored.timezone = "Europe/Dublin";

    const result = await dispatchDueSocialPublications(publishingEnv as never);

    expect(result).toEqual({ queued: 1, skipped: 0 });
    expect(publications).toHaveLength(1);
    expect(queueMessages).toHaveLength(1);
    expect(stored).toMatchObject({ scheduled_for: null, timezone: null });
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
    if (this.sql.includes("FROM plugin_installations")) {
      return { enabled: 1, status: "installed" } as T;
    }
    if (this.sql.includes("FROM social_publications") && this.sql.includes("variant_id = ?")) {
      const [variantId, ...statuses] = this.values;
      const matches = this.state.publications.filter(
        (row) =>
          row.variant_id === variantId &&
          (statuses.length === 0 || statuses.includes(row.status)),
      );
      return (matches.at(-1) || null) as T | null;
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
      return (site && variant ? { ...variant, site_id: pkg?.site_id } : null) as T | null;
    }
    if (this.sql.includes("FROM social_variants WHERE id")) {
      const [variantId] = this.values;
      return (this.state.variants.find((row) => row.id === variantId) || null) as T | null;
    }
    return null as T | null;
  }

  async all<T>() {
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
      if (this.sql.includes("WHERE v.platform = 'linkedin'")) {
        return {
          results: this.state.variants
            .filter(
              (row) =>
                row.platform === "linkedin" &&
                row.approval_status === "approved" &&
                typeof row.scheduled_for === "string" &&
                Date.parse(row.scheduled_for) <= Date.now(),
            )
            .map((row) => ({ id: row.id, user_id: "owner" })) as T[],
        };
      }
      const [packageId] = this.values;
      return {
        results: this.state.variants.filter((row) => row.package_id === packageId) as T[],
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
      const [id, variantId, siteId, platform, queuedAt] = this.values;
      if (
        this.state.publications.some(
          (row) =>
            row.variant_id === variantId &&
            ["queued", "publishing", "published"].includes(String(row.status)),
        )
      ) {
        throw new Error("UNIQUE constraint failed: social_publications.variant_id");
      }
      this.state.publications.push({
        id,
        variant_id: variantId,
        site_id: siteId,
        platform,
        status: "queued",
        platform_post_id: null,
        platform_post_url: null,
        queued_at: queuedAt,
        published_at: null,
        created_at: queuedAt,
        updated_at: queuedAt,
      });
    } else if (this.sql.includes("INSERT INTO social_publication_events")) {
      const usesBoundEventType = this.values.length === 5;
      const [id] = this.values;
      const variantId = usesBoundEventType ? this.values[2] : this.values[1];
      const payload = usesBoundEventType ? this.values[4] : this.values[2];
      const createdAt = usesBoundEventType ? new Date().toISOString() : this.values[3];
      this.state.events.push({
        id,
        variant_id: variantId,
        event_type: usesBoundEventType
          ? this.values[3]
          : this.sql.includes("'approved'")
            ? "approved"
            : "generated",
        payload_json: payload,
        created_at: createdAt,
      });
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
