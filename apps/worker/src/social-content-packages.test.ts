import { describe, expect, it } from "vitest";
import {
  SocialContentPackageInputError,
  createSocialContentPackage,
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

  const db = {
    prepare(sql: string) {
      return new Statement(sql, { sites, accounts, packages, variants, events });
    },
    async batch(statements: Statement[]) {
      for (const statement of statements) await statement.run();
      return [];
    },
  };

  return {
    env: { DB: db } as unknown as SocialContentPackageEnv,
    packages,
    variants,
    events,
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

    const edited = await updateSocialAccountVariant(env, "owner", linkedin!.id, {
      bodyText: "A smaller, sharper version.",
    });
    expect(edited).toMatchObject({
      bodyText: "A smaller, sharper version.",
      approvalStatus: "draft",
      approvedAt: null,
      approvedByUserId: null,
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
    },
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
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
    if (this.sql.includes("FROM social_variants")) {
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
    } else if (this.sql.includes("INSERT INTO social_publication_events")) {
      const [id, variantId, payload, createdAt] = this.values;
      this.state.events.push({ id, variant_id: variantId, payload_json: payload, created_at: createdAt });
    } else if (this.sql.includes("UPDATE social_variants")) {
      const [
        targetAccountId,
        format,
        bodyText,
        assets,
        approvalStatus,
        approvedAt,
        approvedByUserId,
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
          updated_at: updatedAt,
        });
      }
    }
    return {};
  }
}
