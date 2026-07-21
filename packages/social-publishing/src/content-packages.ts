import type { SocialMediaAsset, SocialPlatform } from "./index";

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

export type SocialPostEnv = {
  DB: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown>;
  };
};

export const SOCIAL_POST_SOURCE_TYPES = [
  "journal",
  "mission_task",
  "site",
  "file",
  "script",
  "pasted",
] as const;

export type SocialPostSourceType = (typeof SOCIAL_POST_SOURCE_TYPES)[number];
export type SocialPostFormat = "post" | "carousel";
export type SocialPostApprovalStatus = "draft" | "approved" | "rejected";

export type SocialPost = {
  id: string;
  siteId: string;
  sourceTitle: string;
  sourceType: SocialPostSourceType | "legacy_content_bank_read_only";
  sourceRef: string | null;
  sourceSnapshot: string;
  sourceText: string;
  ideaText: string;
  goal: string | null;
  tags: string[];
  status: "draft" | "ready" | "partially_published" | "published" | "failed" | "archived";
  createdBy: "user" | "agent";
  createdAt: string;
  updatedAt: string;
};

export type PostVersion = {
  id: string;
  postId: string;
  platform: SocialPlatform;
  targetAccountId: string | null;
  format: SocialPostFormat;
  bodyText: string;
  assetManifest: SocialMediaAsset[];
  carouselRenderSetId: string | null;
  sourceExcerpt: string | null;
  approvalStatus: SocialPostApprovalStatus;
  approvedAt: string | null;
  approvedByUserId: string | null;
  scheduledFor: string | null;
  timezone: string | null;
  publicationStatus:
    | "scheduled"
    | "queued"
    | "publishing"
    | "published"
    | "failed"
    | "cancelled"
    | null;
  platformPostUrl: string | null;
  publishedAt: string | null;
  failureClass: import("./adapters").SocialPublishFailureClass | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialPostDetail = {
  post: SocialPost;
  versions: PostVersion[];
};

export type CreateSocialPostInput = {
  siteId: string;
  sourceTitle?: string;
  sourceType: SocialPostSourceType;
  sourceRef?: string | null;
  sourceSnapshot?: string;
  sourceText?: string;
  ideaText: string;
  goal?: string | null;
  tags?: string[];
  createdBy?: "user" | "agent";
  versions: Array<{
    platform: SocialPlatform;
    targetAccountId?: string | null;
    format?: SocialPostFormat;
    bodyText: string;
    assetManifest?: SocialMediaAsset[];
  }>;
};

export type UpdatePostVersionInput = {
  targetAccountId?: string | null;
  format?: SocialPostFormat;
  bodyText?: string;
  assetManifest?: SocialMediaAsset[];
  approvalStatus?: SocialPostApprovalStatus;
};

export type UpdateSocialPostInput = {
  tags?: unknown;
  title?: unknown;
  expectedUpdatedAt: unknown;
};

/* Legacy storage vocabulary stays private while the D1 schema is migrated in place. */
type SocialContentPackageEnv = SocialPostEnv;
const SOCIAL_CONTENT_SOURCE_TYPES = SOCIAL_POST_SOURCE_TYPES;
type SocialContentSourceType = SocialPostSourceType;
type LegacySocialPostSourceType = "legacy_content_bank_read_only";
type SocialContentVariantFormat = SocialPostFormat;
type SocialContentApprovalStatus = SocialPostApprovalStatus;
type SocialContentPackage = SocialPost;
type SocialAccountVariant = Omit<PostVersion, "postId"> & { packageId: string };
type SocialContentPackageDetail = {
  package: SocialContentPackage;
  variants: SocialAccountVariant[];
};
type CreateSocialContentPackageInput = Omit<CreateSocialPostInput, "versions"> & {
  variants: CreateSocialPostInput["versions"];
};
type UpdateSocialAccountVariantInput = UpdatePostVersionInput;

type PackageRow = {
  id: string;
  site_id: string;
  post_title_snapshot: string;
  source_type: SocialContentSourceType | LegacySocialPostSourceType;
  source_ref: string | null;
  source_snapshot: string;
  source_text: string;
  idea_text: string;
  goal: string | null;
  tags_json: string;
  status: SocialContentPackage["status"];
  created_by: SocialContentPackage["createdBy"];
  created_at: string;
  updated_at: string;
};

type VariantRow = {
  id: string;
  package_id: string;
  site_id?: string;
  post_source_type?: PackageRow["source_type"];
  platform: SocialPlatform;
  target_account_id: string | null;
  format: SocialContentVariantFormat;
  body_text: string;
  asset_manifest_json: string;
  carousel_render_set_id: string | null;
  source_excerpt: string | null;
  approval_status: SocialContentApprovalStatus;
  approved_at: string | null;
  approved_by_user_id: string | null;
  scheduled_for: string | null;
  timezone: string | null;
  publication_status?: SocialAccountVariant["publicationStatus"];
  platform_post_url?: string | null;
  published_at?: string | null;
  publication_error_code?: string | null;
  publication_error_message?: string | null;
  created_at: string;
  updated_at: string;
};

export class SocialPostInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

const SocialContentPackageInputError = SocialPostInputError;

async function createSocialContentPackage(
  env: SocialContentPackageEnv,
  ownerId: string,
  input: CreateSocialContentPackageInput,
  options: { postId?: string } = {},
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
  const suppliedSnapshot = requiredText(
    input.sourceSnapshot,
    "A human-authored Source snapshot is required",
  );
  const sourceText = requiredText(
    input.sourceText,
    "Visible human-authored Source text is required",
  );
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    throw new SocialContentPackageInputError("At least one Post Version is required");
  }
  const platforms = input.variants.map((variant) => variant.platform);
  if (new Set(platforms).size !== platforms.length) {
    throw new SocialContentPackageInputError("Only one Version per platform is supported for now");
  }

  for (const variant of input.variants) {
    requiredText(variant.bodyText, `${variant.platform} bodyText is required`);
    if (variant.targetAccountId) {
      await requireActiveAccount(env, ownerId, siteId, variant.platform, variant.targetAccountId);
    }
  }

  const id = options.postId || `social-post-${crypto.randomUUID()}`;
  const sourceRef = optionalText(input.sourceRef) ||
    (input.sourceType === "pasted" ? `pasted:${id}` : null);
  if (!sourceRef) {
    throw new SocialContentPackageInputError(
      `${input.sourceType} Sources require a stable reference`,
    );
  }
  const now = new Date().toISOString();
  const sourceSnapshot = suppliedSnapshot;
  const sourceTitle = optionalText(input.sourceTitle) || ideaText.slice(0, 120);
  const tags = normalizeTags(input.tags || []);
  const statements: Statement[] = [
    env.DB.prepare(
      `INSERT INTO social_packages (
         id, site_id, post_slug, post_title_snapshot, source_hash, goal, status,
         created_by, source_type, source_ref, source_snapshot, source_text, idea_text,
         tags_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      siteId,
      `_social-${id}`,
      sourceTitle,
      await sha256(sourceSnapshot),
      optionalText(input.goal),
      input.createdBy === "agent" ? "agent" : "user",
      input.sourceType,
      sourceRef,
      sourceSnapshot,
      sourceText,
      ideaText,
      JSON.stringify(tags),
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
  if (!created) throw new SocialContentPackageInputError("Could not create Social Post");
  return created;
}

async function getSocialContentPackage(
  env: SocialContentPackageEnv,
  ownerId: string,
  packageIdInput: string,
): Promise<SocialContentPackageDetail | null> {
  const packageId = requiredText(packageIdInput, "packageId is required");
  const row = await env.DB.prepare(
    `SELECT p.id, p.site_id, p.post_title_snapshot, p.source_type, p.source_ref,
            p.source_snapshot, p.source_text, p.idea_text, p.goal, p.tags_json,
            p.status, p.created_by, p.created_at, p.updated_at
     FROM social_packages p
     JOIN sites s ON s.id = p.site_id
     WHERE p.id = ? AND s.user_id = ?`,
  )
    .bind(packageId, ownerId)
    .first<PackageRow>();
  if (!row) return null;

  const variants = await listPackageVariants(env, packageId);

  return {
    package: serializePackage(row),
    variants,
  };
}

async function listSocialContentPackages(
  env: SocialContentPackageEnv,
  ownerId: string,
  siteIdInput?: string | null,
): Promise<SocialContentPackageDetail[]> {
  const siteId = optionalText(siteIdInput);
  const rows = await env.DB.prepare(
    `SELECT p.id, p.site_id, p.post_title_snapshot, p.source_type, p.source_ref,
            p.source_snapshot, p.source_text, p.idea_text, p.goal, p.tags_json,
            p.status, p.created_by, p.created_at, p.updated_at
     FROM social_packages p
     JOIN sites s ON s.id = p.site_id
     WHERE s.user_id = ? AND (? IS NULL OR p.site_id = ?)
       AND p.status != 'archived'
     ORDER BY p.updated_at DESC
     LIMIT 100`,
  )
    .bind(ownerId, siteId, siteId)
    .all<PackageRow>();

  return Promise.all((rows.results || []).map(async (row) => ({
    package: serializePackage(row),
    variants: await listPackageVariants(env, row.id),
  })));
}

async function listPackageVariants(
  env: SocialContentPackageEnv,
  packageId: string,
): Promise<SocialAccountVariant[]> {
  const variants = await env.DB.prepare(
    `SELECT v.id, v.package_id, v.platform, v.target_account_id, v.format, v.body_text,
            v.asset_manifest_json, v.carousel_render_set_id, v.source_excerpt,
            v.approval_status, v.approved_at,
            v.approved_by_user_id,
            (SELECT pub.scheduled_for FROM social_publications pub
             WHERE pub.variant_id = v.id AND pub.status = 'scheduled'
             ORDER BY pub.scheduled_for ASC LIMIT 1) AS scheduled_for,
            (SELECT pub.timezone FROM social_publications pub
             WHERE pub.variant_id = v.id AND pub.status = 'scheduled'
             ORDER BY pub.scheduled_for ASC LIMIT 1) AS timezone,
            v.created_at, v.updated_at,
            (SELECT pub.status FROM social_publications pub
             WHERE pub.variant_id = v.id
             ORDER BY CASE pub.status
               WHEN 'publishing' THEN 0 WHEN 'queued' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
               pub.created_at DESC LIMIT 1) AS publication_status,
            (SELECT pub.platform_post_url FROM social_publications pub
             WHERE pub.variant_id = v.id
             ORDER BY CASE pub.status
               WHEN 'publishing' THEN 0 WHEN 'queued' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
               pub.created_at DESC LIMIT 1) AS platform_post_url,
            (SELECT pub.published_at FROM social_publications pub
             WHERE pub.variant_id = v.id
             ORDER BY CASE pub.status
               WHEN 'publishing' THEN 0 WHEN 'queued' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
               pub.created_at DESC LIMIT 1) AS published_at,
            (SELECT pub.error_code FROM social_publications pub
             WHERE pub.variant_id = v.id
             ORDER BY CASE pub.status
               WHEN 'publishing' THEN 0 WHEN 'queued' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
               pub.created_at DESC LIMIT 1) AS publication_error_code,
            (SELECT pub.error_message FROM social_publications pub
             WHERE pub.variant_id = v.id
             ORDER BY CASE pub.status
               WHEN 'publishing' THEN 0 WHEN 'queued' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
               pub.created_at DESC LIMIT 1) AS publication_error_message
     FROM social_variants v
     WHERE v.package_id = ?
     ORDER BY v.created_at ASC`,
  )
    .bind(packageId)
    .all<VariantRow>();
  return (variants.results || []).map(serializeVariant);
}

async function updateSocialAccountVariant(
  env: SocialContentPackageEnv,
  ownerId: string,
  variantIdInput: string,
  input: UpdateSocialAccountVariantInput,
): Promise<SocialAccountVariant | null> {
  if (
    Object.prototype.hasOwnProperty.call(input, "scheduledFor") ||
    Object.prototype.hasOwnProperty.call(input, "timezone")
  ) {
    throw new SocialContentPackageInputError(
      "Schedule this Version by creating a Publication",
    );
  }
  const variantId = requiredText(variantIdInput, "Post Version id is required");
  const existing = await env.DB.prepare(
    `SELECT v.id, v.package_id, p.site_id, p.source_type AS post_source_type,
            v.platform, v.target_account_id,
            v.format, v.body_text, v.asset_manifest_json, v.carousel_render_set_id,
            v.source_excerpt,
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
  if (existing.post_source_type === "legacy_content_bank_read_only") {
    throw new SocialContentPackageInputError(
      "This imported Post is read-only. Create a source-backed Post to make changes.",
      403,
    );
  }

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
        "Choose a connected account before approving this Version",
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

  const now = monotonicUpdatedAt(existing.updated_at);
  const newlyApproved = approvalStatus === "approved" &&
    (existing.approval_status !== "approved" || contentChanged);
  const approvedAt = approvalStatus === "approved"
    ? newlyApproved ? now : existing.approved_at
    : null;
  const approvedByUserId = approvalStatus === "approved"
    ? newlyApproved ? ownerId : existing.approved_by_user_id
    : null;
  const statements: Statement[] = [
    env.DB.prepare(
      `UPDATE social_variants
       SET target_account_id = ?, format = ?, body_text = ?, asset_manifest_json = ?,
           carousel_render_set_id = ?, approval_status = ?, approved_at = ?,
           approved_by_user_id = ?,
           scheduled_for = ?, timezone = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      targetAccountId,
      format,
      bodyText,
      assetManifestJson,
      contentChanged ? null : existing.carousel_render_set_id,
      approvalStatus,
      approvedAt,
      approvedByUserId,
      null,
      null,
      now,
      variantId,
    ),
  ];
  if (contentChanged || approvalStatus !== "approved") {
    const reason = contentChanged ? "version_changed" : "approval_revoked";
    // Audit every scheduled row first, then cancel that exact set in the same
    // serialized D1 batch. A schedule committed before this batch is included;
    // one attempted after the Version update observes draft approval and fails.
    statements.push(
      env.DB.prepare(
        `INSERT INTO social_publication_events (
           id, publication_id, variant_id, event_type, payload_json, created_at
         )
         SELECT 'social-event-' || lower(hex(randomblob(16))), publication.id,
                publication.variant_id, 'cancelled', ?, ?
         FROM social_publications publication
         WHERE publication.variant_id = ? AND publication.status = 'scheduled'`,
      ).bind(
        JSON.stringify({ reason }),
        now,
        variantId,
      ),
      env.DB.prepare(
        `UPDATE social_publications
         SET status = 'cancelled', error_code = ?, error_message = ?, updated_at = ?
         WHERE variant_id = ? AND status = 'scheduled'`,
      ).bind(
        `cancelled:${reason}`,
        contentChanged
          ? "Cancelled because the approved Version changed."
          : "Cancelled because Version approval was removed.",
        now,
        variantId,
      ),
    );
  }
  if (
    approvalStatus === "approved" &&
    newlyApproved
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
            asset_manifest_json, carousel_render_set_id, source_excerpt,
            approval_status, approved_at,
            approved_by_user_id,
            (SELECT scheduled_for FROM social_publications
             WHERE variant_id = ? AND status = 'scheduled'
             ORDER BY scheduled_for ASC LIMIT 1) AS scheduled_for,
            (SELECT timezone FROM social_publications
             WHERE variant_id = ? AND status = 'scheduled'
             ORDER BY scheduled_for ASC LIMIT 1) AS timezone,
            created_at, updated_at
     FROM social_variants WHERE id = ?`,
  )
    .bind(variantId, variantId, variantId)
    .first<VariantRow>();
  return updated ? serializeVariant(updated) : null;
}

export async function createSocialPost(
  env: SocialPostEnv,
  ownerId: string,
  input: CreateSocialPostInput,
  options: { postId?: string } = {},
): Promise<SocialPostDetail> {
  return canonicalDetail(await createSocialContentPackage(env, ownerId, {
    ...input,
    variants: input.versions,
  }, options));
}

export async function ensureLocalSocialDemo(
  env: SocialPostEnv,
  ownerId: string,
  siteIdInput: string,
): Promise<SocialPostDetail> {
  const siteId = requiredText(siteIdInput, "siteId is required");
  const site = await env.DB.prepare("SELECT id FROM sites WHERE id = ? AND user_id = ?")
    .bind(siteId, ownerId)
    .first<{ id: string }>();
  if (!site) throw new SocialPostInputError("Site not found", 404);

  const now = new Date().toISOString();
  const accounts = [
    { id: `local-demo-${siteId}-linkedin`, platform: "linkedin" as const, name: "Kieran Butler", handle: "kieranbutler" },
    { id: `local-demo-${siteId}-x`, platform: "x" as const, name: "Kieran Butler", handle: "kieranbutler" },
    { id: `local-demo-${siteId}-instagram`, platform: "instagram" as const, name: "Kieran Butler", handle: "kieranbutler" },
  ];
  await env.DB.batch(accounts.map((account) => env.DB.prepare(
    `INSERT INTO social_accounts (
       id, user_id, site_id, platform, platform_account_id, platform_handle, display_name,
       access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes_json,
       status, metadata_json, last_verified_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, '[]', 'active', ?, ?, ?, ?)
     ON CONFLICT(site_id, platform, platform_account_id) DO NOTHING`,
  ).bind(
    account.id,
    ownerId,
    siteId,
    account.platform,
    `local-demo-${account.platform}`,
    account.handle,
    account.name,
    JSON.stringify({ provider: account.platform, localDemo: true }),
    now,
    now,
    now,
  )));

  const existing = await env.DB.prepare(
    `SELECT p.id
     FROM social_packages p
     JOIN sites s ON s.id = p.site_id
     WHERE p.site_id = ? AND p.source_ref = ? AND s.user_id = ?`,
  )
    .bind(siteId, "local-demo:social-workspace", ownerId)
    .first<{ id: string }>();
  if (existing) {
    const detail = await getSocialPost(env, ownerId, existing.id);
    if (detail) return detail;
  }

  const demoImages = ["teal", "blue", "coral"].map((color, index) => ({
    url: `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="${color === "teal" ? "#0f766e" : color === "blue" ? "#1d4ed8" : "#e11d48"}"/><text x="100" y="160" fill="white" font-family="Arial, sans-serif" font-size="72" font-weight="700">ME3</text><text x="100" y="1040" fill="white" font-family="Arial, sans-serif" font-size="54">Local preview ${index + 1}</text></svg>`,
    )}`,
    filename: `local-preview-${index + 1}.svg`,
    mimeType: "image/svg+xml",
    kind: "image" as const,
    altText: `Local preview image ${index + 1}`,
  }));

  return createSocialPost(env, ownerId, {
    siteId,
    sourceType: "pasted",
    sourceRef: "local-demo:social-workspace",
    sourceTitle: "Local Social preview",
    sourceSnapshot: "A local-only sample used to verify the Social Publishing workspace.",
    sourceText: "A local-only sample used to verify the Social Publishing workspace.",
    ideaText: "Build trust one useful detail at a time",
    tags: ["local-demo"],
    versions: [
      {
        platform: "linkedin",
        targetAccountId: accounts[0].id,
        bodyText: "The best systems make the next useful action obvious.\n\nA small, clear improvement compounds into trust. https://me3.app",
        assetManifest: [demoImages[0]!],
      },
      {
        platform: "x",
        targetAccountId: accounts[1].id,
        bodyText: "The best systems make the next useful action obvious.\n\nSmall clarity compounds into trust. https://me3.app",
      },
      {
        platform: "instagram",
        targetAccountId: accounts[2].id,
        format: "carousel",
        bodyText: "Build trust one useful detail at a time.\n\nSwipe through the local carousel preview. #ME3 #BuildInPublic",
        assetManifest: demoImages,
      },
    ],
  }, { postId: `local-demo-post-${siteId}` });
}

export async function getSocialPost(
  env: SocialPostEnv,
  ownerId: string,
  postId: string,
): Promise<SocialPostDetail | null> {
  const detail = await getSocialContentPackage(env, ownerId, postId);
  return detail ? canonicalDetail(detail) : null;
}

export async function listSocialPosts(
  env: SocialPostEnv,
  ownerId: string,
  siteId?: string | null,
): Promise<SocialPostDetail[]> {
  return (await listSocialContentPackages(env, ownerId, siteId)).map(canonicalDetail);
}

export async function updateSocialPost(
  env: SocialPostEnv,
  ownerId: string,
  postIdInput: string,
  input: UpdateSocialPostInput,
): Promise<SocialPostDetail | null> {
  const postId = requiredText(postIdInput, "Post id is required");
  const existing = await getSocialContentPackage(env, ownerId, postId);
  if (!existing) return null;
  if (existing.package.sourceType === "legacy_content_bank_read_only") {
    throw new SocialPostInputError(
      "This imported Post is read-only. Create a source-backed Post to make changes.",
      403,
    );
  }
  const expectedUpdatedAt = requiredText(input.expectedUpdatedAt, "Refresh this Post before saving");
  if (existing.package.updatedAt !== expectedUpdatedAt) {
    throw new SocialPostInputError(
      "This Post changed after it was loaded. Refresh and try again.",
      409,
    );
  }
  const title = input.title === undefined
    ? existing.package.ideaText
    : requiredText(input.title, "Post title is required");
  const tags = input.tags === undefined ? existing.package.tags : normalizeTags(input.tags);
  const now = monotonicUpdatedAt(existing.package.updatedAt);
  const updated = await env.DB.prepare(
    `UPDATE social_packages
     SET post_title_snapshot = ?, idea_text = ?, tags_json = ?, updated_at = ?
     WHERE id = ? AND updated_at = ?
       AND EXISTS (SELECT 1 FROM sites WHERE sites.id = social_packages.site_id AND sites.user_id = ?)
     RETURNING id`,
  )
    .bind(title, title, JSON.stringify(tags), now, postId, expectedUpdatedAt, ownerId)
    .first<{ id: string }>();
  if (!updated) {
    throw new SocialPostInputError(
      "This Post changed while its tags were being saved. Refresh and try again.",
      409,
    );
  }
  return getSocialPost(env, ownerId, postId);
}

export async function deleteSocialPost(
  env: SocialPostEnv,
  ownerId: string,
  postIdInput: string,
  expectedUpdatedAtInput: unknown,
): Promise<boolean> {
  const postId = requiredText(postIdInput, "Post id is required");
  const expectedUpdatedAt = requiredText(
    expectedUpdatedAtInput,
    "Refresh this Post before deleting it",
  );
  const existing = await getSocialContentPackage(env, ownerId, postId);
  if (!existing) return false;
  if (existing.package.sourceType === "legacy_content_bank_read_only") {
    throw new SocialPostInputError("This imported Post is read-only.", 403);
  }
  if (existing.package.updatedAt !== expectedUpdatedAt) {
    throw new SocialPostInputError(
      "This Post changed after it was loaded. Refresh and try again.",
      409,
    );
  }
  if (existing.variants.some((version) =>
    version.approvalStatus !== "draft" || version.scheduledFor || version.publicationStatus,
  )) {
    throw new SocialPostInputError(
      "Only unscheduled draft Posts can be deleted.",
      409,
    );
  }

  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM social_publication_events
       WHERE variant_id IN (SELECT id FROM social_variants WHERE package_id = ?)`,
    ).bind(postId),
    env.DB.prepare(
      `DELETE FROM social_publications
       WHERE variant_id IN (SELECT id FROM social_variants WHERE package_id = ?)`,
    ).bind(postId),
    env.DB.prepare("DELETE FROM social_variants WHERE package_id = ?").bind(postId),
    env.DB.prepare(
      `DELETE FROM social_packages
       WHERE id = ? AND updated_at = ?
         AND EXISTS (SELECT 1 FROM sites WHERE sites.id = social_packages.site_id AND sites.user_id = ?)`,
    ).bind(postId, expectedUpdatedAt, ownerId),
  ]);
  return true;
}

export async function updatePostVersion(
  env: SocialPostEnv,
  ownerId: string,
  versionId: string,
  input: UpdatePostVersionInput,
): Promise<PostVersion | null> {
  const version = await updateSocialAccountVariant(env, ownerId, versionId, input);
  return version ? canonicalVersion(version) : null;
}

function canonicalDetail(detail: SocialContentPackageDetail): SocialPostDetail {
  return {
    post: detail.package,
    versions: detail.variants.map(canonicalVersion),
  };
}

function canonicalVersion(version: SocialAccountVariant): PostVersion {
  const { packageId, ...rest } = version;
  return { ...rest, postId: packageId };
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
    sourceTitle: row.post_title_snapshot,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceSnapshot: row.source_snapshot,
    sourceText: row.source_text,
    ideaText: row.idea_text,
    goal: row.goal,
    tags: normalizeStoredTags(row.tags_json),
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
    carouselRenderSetId: row.carousel_render_set_id || null,
    sourceExcerpt: row.source_excerpt,
    approvalStatus: row.approval_status,
    approvedAt: row.approved_at,
    approvedByUserId: row.approved_by_user_id,
    scheduledFor: row.scheduled_for,
    timezone: row.timezone,
    publicationStatus: row.publication_status || null,
    platformPostUrl: row.platform_post_url || null,
    publishedAt: row.published_at || null,
    failureClass: parseFailureClass(row.publication_error_code),
    errorMessage: row.publication_error_message || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseFailureClass(
  code: string | null | undefined,
): SocialAccountVariant["failureClass"] {
  const value = code?.split(":", 1)[0];
  return value === "retryable" ||
      value === "reconnect_required" ||
      value === "rejected" ||
      value === "unsupported" ||
      value === "outcome_unknown"
    ? value
    : null;
}

function parseAssets(value: string): SocialMediaAsset[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw new SocialPostInputError("Post tags must be a list");
  if (value.length > 20) throw new SocialPostInputError("No more than 20 Post tags are supported");
  const tags = value.map((tag) => requiredText(tag, "Post tags cannot be blank").toLowerCase());
  if (tags.some((tag) => tag.length > 40)) {
    throw new SocialPostInputError("Post tags must be 40 characters or fewer");
  }
  return [...new Set(tags)];
}

function normalizeStoredTags(value: string): string[] {
  try {
    return normalizeTags(JSON.parse(value));
  } catch {
    return [];
  }
}

function monotonicUpdatedAt(previous: string): string {
  const previousMs = Date.parse(previous);
  return new Date(Math.max(Date.now(), Number.isFinite(previousMs) ? previousMs + 1 : 0)).toISOString();
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
