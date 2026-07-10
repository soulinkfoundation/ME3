import type { ContentMediaAsset, SocialPlatform } from "./index";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

export type SocialContentPackageEnv = {
  DB: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown>;
  };
};

export const SOCIAL_CONTENT_SOURCE_TYPES = [
  "journal",
  "mission_task",
  "site",
  "pasted",
  "original",
] as const;

export type SocialContentSourceType = (typeof SOCIAL_CONTENT_SOURCE_TYPES)[number];
export type SocialContentVariantFormat = "post" | "carousel";
export type SocialContentApprovalStatus = "draft" | "approved" | "rejected";

export type SocialContentPackage = {
  id: string;
  siteId: string;
  sourceType: SocialContentSourceType;
  sourceRef: string | null;
  sourceSnapshot: string;
  ideaText: string;
  goal: string | null;
  status: "draft" | "ready" | "partially_published" | "published" | "failed" | "archived";
  createdBy: "user" | "agent";
  createdAt: string;
  updatedAt: string;
};

export type SocialAccountVariant = {
  id: string;
  packageId: string;
  platform: SocialPlatform;
  targetAccountId: string | null;
  format: SocialContentVariantFormat;
  bodyText: string;
  assetManifest: ContentMediaAsset[];
  sourceExcerpt: string | null;
  approvalStatus: SocialContentApprovalStatus;
  approvedAt: string | null;
  approvedByUserId: string | null;
  scheduledFor: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialContentPackageDetail = {
  package: SocialContentPackage;
  variants: SocialAccountVariant[];
};

export type CreateSocialContentPackageInput = {
  siteId: string;
  sourceType: SocialContentSourceType;
  sourceRef?: string | null;
  sourceSnapshot?: string;
  ideaText: string;
  goal?: string | null;
  createdBy?: "user" | "agent";
  variants: Array<{
    platform: SocialPlatform;
    targetAccountId?: string | null;
    format?: SocialContentVariantFormat;
    bodyText: string;
    assetManifest?: ContentMediaAsset[];
  }>;
};

export type UpdateSocialAccountVariantInput = {
  targetAccountId?: string | null;
  format?: SocialContentVariantFormat;
  bodyText?: string;
  assetManifest?: ContentMediaAsset[];
  approvalStatus?: SocialContentApprovalStatus;
};

type PackageRow = {
  id: string;
  site_id: string;
  source_type: SocialContentSourceType;
  source_ref: string | null;
  source_snapshot: string;
  idea_text: string;
  goal: string | null;
  status: SocialContentPackage["status"];
  created_by: SocialContentPackage["createdBy"];
  created_at: string;
  updated_at: string;
};

type VariantRow = {
  id: string;
  package_id: string;
  site_id?: string;
  platform: SocialPlatform;
  target_account_id: string | null;
  format: SocialContentVariantFormat;
  body_text: string;
  asset_manifest_json: string;
  source_excerpt: string | null;
  approval_status: SocialContentApprovalStatus;
  approved_at: string | null;
  approved_by_user_id: string | null;
  scheduled_for: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
};

export class SocialContentPackageInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 = 400,
  ) {
    super(message);
  }
}

export async function createSocialContentPackage(
  env: SocialContentPackageEnv,
  ownerId: string,
  input: CreateSocialContentPackageInput,
): Promise<SocialContentPackageDetail> {
  const siteId = requiredText(input.siteId, "siteId is required");
  const site = await env.DB.prepare("SELECT id FROM sites WHERE id = ? AND user_id = ?")
    .bind(siteId, ownerId)
    .first<{ id: string }>();
  if (!site) throw new SocialContentPackageInputError("Site not found", 404);

  if (!SOCIAL_CONTENT_SOURCE_TYPES.includes(input.sourceType)) {
    throw new SocialContentPackageInputError("Unsupported social content source");
  }
  const ideaText = requiredText(input.ideaText, "ideaText is required");
  const sourceRef = optionalText(input.sourceRef);
  const suppliedSnapshot = input.sourceSnapshot?.trim() || "";
  if (
    (input.sourceType === "journal" ||
      input.sourceType === "mission_task" ||
      input.sourceType === "site") &&
    (!sourceRef || !suppliedSnapshot)
  ) {
    throw new SocialContentPackageInputError(
      `${input.sourceType} sources require a reference and snapshot`,
    );
  }
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    throw new SocialContentPackageInputError("At least one social variant is required");
  }
  const platforms = input.variants.map((variant) => variant.platform);
  if (new Set(platforms).size !== platforms.length) {
    throw new SocialContentPackageInputError("Only one draft per platform is supported for now");
  }

  for (const variant of input.variants) {
    requiredText(variant.bodyText, `${variant.platform} bodyText is required`);
    if (variant.targetAccountId) {
      await requireActiveAccount(env, ownerId, siteId, variant.platform, variant.targetAccountId);
    }
  }

  const id = `social-package-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const sourceSnapshot = suppliedSnapshot || ideaText;
  const statements: Statement[] = [
    env.DB.prepare(
      `INSERT INTO social_packages (
         id, site_id, post_slug, post_title_snapshot, source_hash, goal, status,
         created_by, source_type, source_ref, source_snapshot, idea_text,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      siteId,
      `_social-${id}`,
      ideaText.slice(0, 120),
      await sha256(sourceSnapshot),
      optionalText(input.goal),
      input.createdBy === "agent" ? "agent" : "user",
      input.sourceType,
      sourceRef,
      sourceSnapshot,
      ideaText,
      now,
      now,
    ),
  ];

  for (const variant of input.variants) {
    const variantId = `social-variant-${crypto.randomUUID()}`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO social_variants (
           id, package_id, platform, target_account_id, format, body_text,
           asset_manifest_json, source_excerpt, approval_status,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      ).bind(
        variantId,
        id,
        variant.platform,
        optionalText(variant.targetAccountId),
        variant.format || "post",
        variant.bodyText.trim(),
        JSON.stringify(variant.assetManifest || []),
        sourceSnapshot.slice(0, 1_000),
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO social_publication_events (
           id, publication_id, variant_id, event_type, payload_json, created_at
         ) VALUES (?, NULL, ?, 'generated', ?, ?)`,
      ).bind(
        `social-event-${crypto.randomUUID()}`,
        variantId,
        JSON.stringify({
          platform: variant.platform,
          targetAccountId: optionalText(variant.targetAccountId),
          sourceType: input.sourceType,
          sourceRef,
        }),
        now,
      ),
    );
  }

  await env.DB.batch(statements);
  const created = await getSocialContentPackage(env, ownerId, id);
  if (!created) throw new SocialContentPackageInputError("Could not create social package");
  return created;
}

export async function getSocialContentPackage(
  env: SocialContentPackageEnv,
  ownerId: string,
  packageIdInput: string,
): Promise<SocialContentPackageDetail | null> {
  const packageId = requiredText(packageIdInput, "packageId is required");
  const row = await env.DB.prepare(
    `SELECT p.id, p.site_id, p.source_type, p.source_ref, p.source_snapshot,
            p.idea_text, p.goal, p.status, p.created_by, p.created_at, p.updated_at
     FROM social_packages p
     JOIN sites s ON s.id = p.site_id
     WHERE p.id = ? AND s.user_id = ?`,
  )
    .bind(packageId, ownerId)
    .first<PackageRow>();
  if (!row) return null;

  const variants = await env.DB.prepare(
    `SELECT id, package_id, platform, target_account_id, format, body_text,
            asset_manifest_json, source_excerpt, approval_status, approved_at,
            approved_by_user_id, scheduled_for, timezone, created_at, updated_at
     FROM social_variants
     WHERE package_id = ?
     ORDER BY created_at ASC`,
  )
    .bind(packageId)
    .all<VariantRow>();

  return {
    package: serializePackage(row),
    variants: (variants.results || []).map(serializeVariant),
  };
}

export async function updateSocialAccountVariant(
  env: SocialContentPackageEnv,
  ownerId: string,
  variantIdInput: string,
  input: UpdateSocialAccountVariantInput,
): Promise<SocialAccountVariant | null> {
  const variantId = requiredText(variantIdInput, "variantId is required");
  const existing = await env.DB.prepare(
    `SELECT v.id, v.package_id, p.site_id, v.platform, v.target_account_id,
            v.format, v.body_text, v.asset_manifest_json, v.source_excerpt,
            v.approval_status, v.approved_at, v.approved_by_user_id,
            v.scheduled_for, v.timezone, v.created_at, v.updated_at
     FROM social_variants v
     JOIN social_packages p ON p.id = v.package_id
     JOIN sites s ON s.id = p.site_id
     WHERE v.id = ? AND s.user_id = ?`,
  )
    .bind(variantId, ownerId)
    .first<VariantRow>();
  if (!existing) return null;

  const bodyText = input.bodyText === undefined
    ? existing.body_text
    : requiredText(input.bodyText, "bodyText is required");
  const targetAccountId = input.targetAccountId === undefined
    ? existing.target_account_id
    : optionalText(input.targetAccountId);
  const format = input.format || existing.format;
  const assetManifestJson = input.assetManifest === undefined
    ? existing.asset_manifest_json
    : JSON.stringify(input.assetManifest);
  const contentChanged =
    bodyText !== existing.body_text ||
    targetAccountId !== existing.target_account_id ||
    format !== existing.format ||
    assetManifestJson !== existing.asset_manifest_json;
  const approvalStatus = input.approvalStatus ||
    (contentChanged ? "draft" : existing.approval_status);

  if (approvalStatus === "approved") {
    if (!targetAccountId) {
      throw new SocialContentPackageInputError(
        "Choose a connected account before approving this variant",
      );
    }
    await requireActiveAccount(
      env,
      ownerId,
      existing.site_id || "",
      existing.platform,
      targetAccountId,
    );
  }

  const now = new Date().toISOString();
  const approvedAt = approvalStatus === "approved" ? now : null;
  const approvedByUserId = approvalStatus === "approved" ? ownerId : null;
  const statements: Statement[] = [
    env.DB.prepare(
      `UPDATE social_variants
       SET target_account_id = ?, format = ?, body_text = ?, asset_manifest_json = ?,
           approval_status = ?, approved_at = ?, approved_by_user_id = ?,
           updated_at = ?
       WHERE id = ?`,
    ).bind(
      targetAccountId,
      format,
      bodyText,
      assetManifestJson,
      approvalStatus,
      approvedAt,
      approvedByUserId,
      now,
      variantId,
    ),
  ];
  if (
    approvalStatus === "approved" &&
    (existing.approval_status !== "approved" || contentChanged)
  ) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO social_publication_events (
           id, publication_id, variant_id, event_type, payload_json, created_at
         ) VALUES (?, NULL, ?, 'approved', ?, ?)`,
      ).bind(
        `social-event-${crypto.randomUUID()}`,
        variantId,
        JSON.stringify({ platform: existing.platform, targetAccountId, ownerId }),
        now,
      ),
    );
  }
  await env.DB.batch(statements);

  const updated = await env.DB.prepare(
    `SELECT id, package_id, platform, target_account_id, format, body_text,
            asset_manifest_json, source_excerpt, approval_status, approved_at,
            approved_by_user_id, scheduled_for, timezone, created_at, updated_at
     FROM social_variants WHERE id = ?`,
  )
    .bind(variantId)
    .first<VariantRow>();
  return updated ? serializeVariant(updated) : null;
}

async function requireActiveAccount(
  env: SocialContentPackageEnv,
  ownerId: string,
  siteId: string,
  platform: SocialPlatform,
  accountId: string,
): Promise<void> {
  const account = await env.DB.prepare(
    `SELECT id FROM social_accounts
     WHERE id = ? AND user_id = ? AND site_id = ? AND platform = ? AND status = 'active'`,
  )
    .bind(accountId, ownerId, siteId, platform)
    .first<{ id: string }>();
  if (!account) {
    throw new SocialContentPackageInputError("Connected social account not found", 404);
  }
}

function serializePackage(row: PackageRow): SocialContentPackage {
  return {
    id: row.id,
    siteId: row.site_id,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceSnapshot: row.source_snapshot,
    ideaText: row.idea_text,
    goal: row.goal,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeVariant(row: VariantRow): SocialAccountVariant {
  return {
    id: row.id,
    packageId: row.package_id,
    platform: row.platform,
    targetAccountId: row.target_account_id,
    format: row.format,
    bodyText: row.body_text,
    assetManifest: parseAssets(row.asset_manifest_json),
    sourceExcerpt: row.source_excerpt,
    approvalStatus: row.approval_status,
    approvedAt: row.approved_at,
    approvedByUserId: row.approved_by_user_id,
    scheduledFor: row.scheduled_for,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseAssets(value: string): ContentMediaAsset[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function requiredText(value: unknown, message: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new SocialContentPackageInputError(message);
  return normalized;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
