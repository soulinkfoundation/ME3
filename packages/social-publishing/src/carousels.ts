import {
  CAROUSEL_CANVAS,
  CAROUSEL_RENDER_MODEL_VERSION,
  CAROUSEL_RASTER_MIME_TYPES,
  createCarouselRenderModel,
  type CarouselMediaReference,
  type CarouselRasterMimeType,
  type CarouselRenderModel,
  type CarouselSlide,
} from "./carousel-render-model";
import {
  CAROUSEL_RENDERER_VERSION,
  CarouselRenderValidationError,
  renderCarouselSvgSet,
  sniffCarouselRasterMimeType,
  type CarouselRenderedAsset,
} from "./carousel-renderer";
import {
  SOCIAL_POST_SOURCE_TYPES,
  type SocialPostSourceType,
} from "./content-packages";

type StatementResult = {
  success?: boolean;
  meta?: { changes?: number };
};

type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run(): Promise<StatementResult | unknown>;
};

export type SocialCarouselEnv = {
  DB: {
    prepare(sql: string): Statement;
    batch(statements: Statement[]): Promise<unknown>;
  };
};

// Each slide can embed its image plus one owner logo as base64. Keeping each
// raster at 640 KB guarantees that both fit below the portable SVG row cap.
export const SOCIAL_CAROUSEL_MEDIA_MAX_BYTES = 640_000;
export const SOCIAL_CAROUSEL_MEDIA_MAX_DIMENSION = 12_000;
export const SOCIAL_CAROUSEL_MEDIA_MAX_PIXELS = 40_000_000;
export const SOCIAL_CAROUSEL_D1_ROW_PAYLOAD_MAX_BYTES = 1_850_000;

export type UploadSocialCarouselMediaInput = {
  siteId: unknown;
  bytes: ArrayBuffer | Uint8Array;
  claimedMimeType?: unknown;
};

export type SocialCarouselMedia = {
  id: string;
  siteId: string;
  contentHash: `sha256:${string}`;
  storageKey: string;
  immutableUrl: string;
  mimeType: CarouselRasterMimeType;
  pixelWidth: number;
  pixelHeight: number;
  byteLength: number;
  createdAt: string;
};

export type RenderAndAttachSocialCarouselInput = {
  siteId: unknown;
  postId: unknown;
  versionId: unknown;
  expectedVersionUpdatedAt: unknown;
  /**
   * This is an untrusted editor draft. Source identity, owner identity, canvas,
   * and every stored-media locator are deliberately ignored and rebuilt from
   * owner-scoped database rows.
   */
  model: CarouselRenderModel;
};

export type SocialCarouselRenderAsset = {
  id: string;
  renderSetId: string;
  slideId: string;
  position: number;
  contentHash: `sha256:${string}`;
  storageKey: string;
  immutableUrl: string;
  fileName: string;
  mimeType: "image/svg+xml";
  pixelWidth: number;
  pixelHeight: number;
  byteLength: number;
  altText: string;
  sourceEvidence: CarouselRenderedAsset["sourceEvidence"];
  mediaRefIds: readonly string[];
  svg: string;
};

export type SocialCarouselRenderSet = {
  id: string;
  siteId: string;
  postId: string;
  createdFromVersionId: string | null;
  inputFingerprint: `sha256:${string}`;
  modelVersion: string;
  rendererVersion: string;
  template: { id: string; version: number };
  canvas: { width: number; height: number };
  model: CarouselRenderModel;
  canonicalInput: string;
  assetManifest: SocialCarouselAssetManifestItem[];
  assets: SocialCarouselRenderAsset[];
  createdAt: string;
};

export type SocialCarouselAssetManifestItem = {
  url: string;
  path: string;
  filename: string;
  mimeType: "image/svg+xml";
  kind: "image";
  altText?: string;
  assetIndex: number;
};

export type RenderAndAttachSocialCarouselResult = {
  renderSet: SocialCarouselRenderSet;
  version: {
    id: string;
    postId: string;
    approvalStatus: "draft" | "approved" | "rejected";
    updatedAt: string;
    carouselRenderSetId: string;
  };
  approvalPreserved: boolean;
};

export class SocialCarouselInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 413 = 400,
    public readonly issues: CarouselRenderValidationError["issues"] = [],
  ) {
    super(message);
    this.name = "SocialCarouselInputError";
  }
}

type MediaRow = {
  id: string;
  site_id: string;
  content_hash: `sha256:${string}`;
  storage_key: string;
  immutable_url: string;
  mime_type: CarouselRasterMimeType;
  pixel_width: number;
  pixel_height: number;
  byte_length: number;
  bytes?: unknown;
  created_at: string;
};

type OwnedVersionRow = {
  id: string;
  package_id: string;
  site_id: string;
  format: string;
  asset_manifest_json: string;
  approval_status: "draft" | "approved" | "rejected";
  updated_at: string;
  carousel_render_set_id: string | null;
  post_title_snapshot: string;
  source_type: string;
  source_ref: string | null;
  source_hash: string;
  source_snapshot: string;
  source_text: string;
  owner_name: string | null;
  owner_username: string | null;
  site_username: string;
};

type RenderSetRow = {
  id: string;
  site_id: string;
  post_id: string;
  created_from_version_id: string | null;
  input_fingerprint: `sha256:${string}`;
  model_version: string;
  renderer_version: string;
  template_id: string;
  template_version: number;
  canvas_width: number;
  canvas_height: number;
  model_json: string;
  canonical_input: string;
  asset_manifest_json: string;
  created_at: string;
};

type RenderAssetRow = {
  id: string;
  render_set_id: string;
  slide_id: string;
  position: number;
  content_hash: `sha256:${string}`;
  storage_key: string;
  immutable_url: string;
  file_name: string;
  mime_type: "image/svg+xml";
  pixel_width: number;
  pixel_height: number;
  byte_length: number;
  alt_text: string;
  source_evidence_json: string;
  media_ref_ids_json: string;
  svg_text: string;
};

export async function uploadSocialCarouselMedia(
  env: SocialCarouselEnv,
  ownerIdInput: unknown,
  input: UploadSocialCarouselMediaInput,
): Promise<SocialCarouselMedia> {
  const ownerId = requiredText(ownerIdInput, "Owner id is required");
  const siteId = requiredText(input.siteId, "Site id is required");
  const ownedSite = await env.DB.prepare(
    "SELECT id FROM sites WHERE id = ? AND user_id = ?",
  )
    .bind(siteId, ownerId)
    .first<{ id: string }>();
  if (!ownedSite) throw new SocialCarouselInputError("Site not found", 404);

  const bytes = copyBytes(input.bytes);
  if (bytes.byteLength === 0) {
    throw new SocialCarouselInputError("Choose a PNG, JPEG, or WebP image");
  }
  if (bytes.byteLength > SOCIAL_CAROUSEL_MEDIA_MAX_BYTES) {
    throw new SocialCarouselInputError(
      "Carousel media must be 640 KB or smaller",
      413,
    );
  }
  const mimeType = sniffCarouselRasterMimeType(bytes);
  if (!mimeType || !CAROUSEL_RASTER_MIME_TYPES.includes(mimeType)) {
    throw new SocialCarouselInputError("Choose a PNG, JPEG, or WebP image");
  }
  const claimedMimeType = optionalText(input.claimedMimeType);
  if (claimedMimeType && claimedMimeType !== mimeType) {
    throw new SocialCarouselInputError("The uploaded image does not match its declared type");
  }
  const dimensions = readRasterDimensions(bytes, mimeType);
  if (!dimensions) {
    throw new SocialCarouselInputError("The uploaded image dimensions could not be verified");
  }
  if (
    dimensions.width > SOCIAL_CAROUSEL_MEDIA_MAX_DIMENSION ||
    dimensions.height > SOCIAL_CAROUSEL_MEDIA_MAX_DIMENSION ||
    dimensions.width * dimensions.height > SOCIAL_CAROUSEL_MEDIA_MAX_PIXELS
  ) {
    throw new SocialCarouselInputError(
      "Carousel media dimensions are too large",
      413,
    );
  }

  const contentHash = await sha256Bytes(bytes);
  const extension = rasterExtension(mimeType);
  const hashHex = contentHash.slice("sha256:".length);
  const storageKey = `social-media/sha256/${hashHex}.${extension}`;
  const immutableUrl =
    `/api/social/media/sha256/${hashHex}.${extension}?siteId=${encodeURIComponent(siteId)}`;
  const id = `social-carousel-media-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO social_carousel_media (
       id, user_id, site_id, content_hash, storage_key, immutable_url,
       mime_type, pixel_width, pixel_height, byte_length, bytes, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      siteId,
      contentHash,
      storageKey,
      immutableUrl,
      mimeType,
      dimensions.width,
      dimensions.height,
      bytes.byteLength,
      exactArrayBuffer(bytes),
      new Date().toISOString(),
    )
    .run();

  const stored = await findOwnedMediaByHash(env, ownerId, siteId, contentHash);
  if (!stored) {
    throw new SocialCarouselInputError("Carousel media could not be saved", 409);
  }
  return serializeMedia(stored);
}

export async function getSocialCarouselMediaBytes(
  env: SocialCarouselEnv,
  ownerIdInput: unknown,
  siteIdInput: unknown,
  mediaIdInput: unknown,
): Promise<{ media: SocialCarouselMedia; bytes: Uint8Array } | null> {
  const ownerId = requiredText(ownerIdInput, "Owner id is required");
  const siteId = requiredText(siteIdInput, "Site id is required");
  const mediaId = requiredText(mediaIdInput, "Carousel media id is required");
  const row = await findOwnedMediaById(env, ownerId, siteId, mediaId, true);
  if (!row) return null;
  return { media: serializeMedia(row), bytes: storedBlobBytes(row.bytes) };
}

export async function listSocialCarouselMedia(
  env: SocialCarouselEnv,
  ownerIdInput: unknown,
  siteIdInput: unknown,
  limitInput: unknown = 50,
): Promise<SocialCarouselMedia[]> {
  const ownerId = requiredText(ownerIdInput, "Owner id is required");
  const siteId = requiredText(siteIdInput, "Site id is required");
  const limit = limitInput === undefined ? 50 : Number(limitInput);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new SocialCarouselInputError("Carousel media limit must be between 1 and 100");
  }
  const rows = await env.DB.prepare(
    `SELECT id, site_id, content_hash, storage_key, immutable_url, mime_type,
            pixel_width, pixel_height, byte_length, created_at
     FROM social_carousel_media
     WHERE user_id = ? AND site_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  )
    .bind(ownerId, siteId, limit)
    .all<MediaRow>();
  return (rows.results || []).map(serializeMedia);
}

export async function getSocialCarouselMediaBytesByHash(
  env: SocialCarouselEnv,
  ownerIdInput: unknown,
  siteIdInput: unknown,
  contentHashInput: unknown,
): Promise<{ media: SocialCarouselMedia; bytes: Uint8Array } | null> {
  const ownerId = requiredText(ownerIdInput, "Owner id is required");
  const siteId = requiredText(siteIdInput, "Site id is required");
  const suppliedHash = requiredText(contentHashInput, "Carousel media hash is required");
  const hashHex = suppliedHash.startsWith("sha256:")
    ? suppliedHash.slice("sha256:".length)
    : suppliedHash;
  if (!/^[a-f0-9]{64}$/.test(hashHex)) {
    throw new SocialCarouselInputError("Carousel media hash is invalid");
  }
  const row = await findOwnedMediaByHash(
    env,
    ownerId,
    siteId,
    `sha256:${hashHex}`,
    true,
  );
  if (!row) return null;
  return { media: serializeMedia(row), bytes: storedBlobBytes(row.bytes) };
}

export async function renderAndAttachSocialCarousel(
  env: SocialCarouselEnv,
  ownerIdInput: unknown,
  input: RenderAndAttachSocialCarouselInput,
): Promise<RenderAndAttachSocialCarouselResult> {
  const ownerId = requiredText(ownerIdInput, "Owner id is required");
  const siteId = requiredText(input.siteId, "Site id is required");
  const postId = requiredText(input.postId, "Post id is required");
  const versionId = requiredText(input.versionId, "Post Version id is required");
  const expectedVersionUpdatedAt = requiredText(
    input.expectedVersionUpdatedAt,
    "Refresh this Post Version before attaching a Carousel",
  );
  const ownedVersion = await getOwnedCarouselVersion(
    env,
    ownerId,
    siteId,
    postId,
    versionId,
  );
  if (!ownedVersion) throw new SocialCarouselInputError("Carousel Post Version not found", 404);
  if (ownedVersion.format !== "carousel") {
    throw new SocialCarouselInputError("Choose a Carousel Post Version");
  }
  if (ownedVersion.updated_at !== expectedVersionUpdatedAt) {
    throw staleVersionError();
  }
  if (!SOCIAL_POST_SOURCE_TYPES.includes(ownedVersion.source_type as SocialPostSourceType)) {
    throw new SocialCarouselInputError(
      "Create a source-backed Post before rendering a Carousel",
      403,
    );
  }
  if (!ownedVersion.source_ref || !ownedVersion.source_text.trim()) {
    throw new SocialCarouselInputError("This Post does not have a complete saved Source", 409);
  }
  const sourceHash = await sha256Text(ownedVersion.source_snapshot);
  const storedSourceHash = ownedVersion.source_hash.replace(/^sha256:/, "").toLowerCase();
  if (storedSourceHash !== sourceHash.slice("sha256:".length)) {
    throw new SocialCarouselInputError(
      "The saved Source changed without a matching content hash",
      409,
    );
  }

  const trustedMedia = await rebuildTrustedMedia(
    env,
    ownerId,
    siteId,
    input.model,
  );
  let model: CarouselRenderModel;
  try {
    const ownerStyle = input.model?.ownerStyle;
    model = createCarouselRenderModel({
      revision: input.model?.revision,
      template: { ...input.model?.template },
      canvas: { ...CAROUSEL_CANVAS },
      source: {
        sourceType: ownedVersion.source_type as SocialPostSourceType,
        sourceRef: ownedVersion.source_ref,
        sourceTitle: ownedVersion.post_title_snapshot,
        snapshotHash: sourceHash,
        sourceText: ownedVersion.source_text,
      },
      ownerStyle: {
        ...ownerStyle,
        ownerName:
          optionalText(ownedVersion.owner_name) ||
          optionalText(ownedVersion.owner_username) ||
          ownedVersion.site_username,
        handle: ownerHandle(
          optionalText(ownedVersion.owner_username) || ownedVersion.site_username,
        ),
        colors: { ...ownerStyle?.colors },
        typography: { ...ownerStyle?.typography },
      },
      media: trustedMedia.references,
      slides: cloneSlides(input.model?.slides),
    });
  } catch (error) {
    throw normalizeRenderError(error);
  }

  let rendered;
  try {
    rendered = await renderCarouselSvgSet(model, {
      resolveMediaBytes: (media) => trustedMedia.bytesById.get(media.id) || null,
    });
  } catch (error) {
    throw normalizeRenderError(error);
  }

  const renderSetId = await deterministicRenderSetId(
    ownerId,
    siteId,
    postId,
    rendered.inputFingerprint,
  );
  const storedAssets = await Promise.all(
    rendered.assets.map(async (asset) => buildStoredAsset(asset, renderSetId, siteId)),
  );
  const assetManifest = storedAssets.map((asset): SocialCarouselAssetManifestItem => ({
    url: asset.immutableUrl,
    path: asset.storageKey,
    filename: asset.fileName,
    mimeType: "image/svg+xml",
    kind: "image",
    altText: asset.altText,
    assetIndex: asset.position,
  }));
  await persistImmutableRenderSet(env, {
    id: renderSetId,
    ownerId,
    siteId,
    postId,
    createdFromVersionId: versionId,
    model,
    inputFingerprint: rendered.inputFingerprint,
    canonicalInput: rendered.canonicalInput,
    template: rendered.template,
    assetManifest,
    assets: storedAssets,
  });

  // Persistence is intentionally separate from attachment: a Version may be
  // changed while SVG rendering is in flight. The immutable set remains safe
  // and reusable, while the stale attach is rejected by the exact CAS below.
  const latest = await getOwnedCarouselVersion(env, ownerId, siteId, postId, versionId);
  if (!latest || latest.updated_at !== expectedVersionUpdatedAt) throw staleVersionError();
  const assetManifestJson = JSON.stringify(assetManifest);
  if (
    latest.carousel_render_set_id === renderSetId &&
    latest.asset_manifest_json === assetManifestJson
  ) {
    const renderSet = await getSocialCarouselRenderSet(
      env,
      ownerId,
      siteId,
      renderSetId,
    );
    if (!renderSet) throw new SocialCarouselInputError("Carousel render set not found", 404);
    return {
      renderSet,
      version: serializeAttachedVersion(latest, renderSetId),
      approvalPreserved: true,
    };
  }

  const now = monotonicUpdatedAt(expectedVersionUpdatedAt);
  const eventPayload = JSON.stringify({
    reason: "carousel_render_changed",
    renderSetId,
    inputFingerprint: rendered.inputFingerprint,
  });
  const batchResult = await env.DB.batch([
    env.DB.prepare(
      `UPDATE social_variants
       SET asset_manifest_json = ?, carousel_render_set_id = ?,
           approval_status = 'draft', approved_at = NULL,
           approved_by_user_id = NULL, scheduled_for = NULL, timezone = NULL,
           updated_at = ?
       WHERE id = ? AND package_id = ? AND format = 'carousel' AND updated_at = ?
         AND EXISTS (
           SELECT 1
           FROM social_packages post
           JOIN sites site ON site.id = post.site_id
           WHERE post.id = social_variants.package_id
             AND post.site_id = ? AND site.user_id = ?
         )`,
    ).bind(
      assetManifestJson,
      renderSetId,
      now,
      versionId,
      postId,
      expectedVersionUpdatedAt,
      siteId,
      ownerId,
    ),
    env.DB.prepare(
      `INSERT INTO social_publication_events (
         id, publication_id, variant_id, event_type, payload_json, created_at
       )
       SELECT 'social-event-' || lower(hex(randomblob(16))), publication.id,
              publication.variant_id, 'cancelled', ?, ?
       FROM social_publications publication
       WHERE publication.variant_id = ? AND publication.status = 'scheduled'
         AND changes() > 0`,
    ).bind(eventPayload, now, versionId),
    env.DB.prepare(
      `UPDATE social_publications
       SET status = 'cancelled', error_code = 'cancelled:carousel_render_changed',
           error_message = 'Cancelled because the approved Carousel changed.',
           updated_at = ?
       WHERE variant_id = ? AND status = 'scheduled' AND changes() > 0`,
    ).bind(now, versionId),
  ]);
  const updateChanges = firstBatchChanges(batchResult);
  if (updateChanges === 0) throw staleVersionError();

  const attached = await getOwnedCarouselVersion(env, ownerId, siteId, postId, versionId);
  if (!attached) throw new SocialCarouselInputError("Carousel Post Version not found", 404);
  if (updateChanges === null && attached.carousel_render_set_id !== renderSetId) {
    throw staleVersionError();
  }
  const renderSet = await getSocialCarouselRenderSet(env, ownerId, siteId, renderSetId);
  if (!renderSet) throw new SocialCarouselInputError("Carousel render set not found", 404);
  return {
    renderSet,
    version: serializeAttachedVersion(attached, renderSetId),
    approvalPreserved: false,
  };
}

export async function getSocialCarouselRenderSet(
  env: SocialCarouselEnv,
  ownerIdInput: unknown,
  siteIdInput: unknown,
  renderSetIdInput: unknown,
): Promise<SocialCarouselRenderSet | null> {
  const ownerId = requiredText(ownerIdInput, "Owner id is required");
  const siteId = requiredText(siteIdInput, "Site id is required");
  const renderSetId = requiredText(renderSetIdInput, "Carousel render set id is required");
  const row = await env.DB.prepare(
    `SELECT id, site_id, post_id, created_from_version_id, input_fingerprint,
            model_version, renderer_version, template_id, template_version,
            canvas_width, canvas_height, model_json, canonical_input,
            asset_manifest_json, created_at
     FROM social_carousel_render_sets
     WHERE id = ? AND user_id = ? AND site_id = ?`,
  )
    .bind(renderSetId, ownerId, siteId)
    .first<RenderSetRow>();
  if (!row) return null;
  const assetRows = await env.DB.prepare(
    `SELECT id, render_set_id, slide_id, position, content_hash, storage_key,
            immutable_url, file_name, mime_type, pixel_width, pixel_height,
            byte_length, alt_text, source_evidence_json, media_ref_ids_json, svg_text
     FROM social_carousel_render_assets
     WHERE render_set_id = ?
     ORDER BY position ASC`,
  )
    .bind(renderSetId)
    .all<RenderAssetRow>();
  return serializeRenderSet(row, assetRows.results || []);
}

export async function getSocialCarouselRenderedAsset(
  env: SocialCarouselEnv,
  ownerIdInput: unknown,
  siteIdInput: unknown,
  assetIdInput: unknown,
): Promise<SocialCarouselRenderAsset | null> {
  const ownerId = requiredText(ownerIdInput, "Owner id is required");
  const siteId = requiredText(siteIdInput, "Site id is required");
  const assetId = requiredText(assetIdInput, "Carousel asset id is required");
  const row = await env.DB.prepare(
    `SELECT asset.id, asset.render_set_id, asset.slide_id, asset.position,
            asset.content_hash, asset.storage_key, asset.immutable_url,
            asset.file_name, asset.mime_type, asset.pixel_width,
            asset.pixel_height, asset.byte_length, asset.alt_text,
            asset.source_evidence_json, asset.media_ref_ids_json, asset.svg_text
     FROM social_carousel_render_assets asset
     JOIN social_carousel_render_sets render_set ON render_set.id = asset.render_set_id
     WHERE asset.id = ? AND render_set.user_id = ? AND render_set.site_id = ?`,
  )
    .bind(assetId, ownerId, siteId)
    .first<RenderAssetRow>();
  return row ? serializeRenderAsset(row) : null;
}

async function rebuildTrustedMedia(
  env: SocialCarouselEnv,
  ownerId: string,
  siteId: string,
  draft: CarouselRenderModel,
): Promise<{
  references: CarouselMediaReference[];
  bytesById: Map<string, Uint8Array>;
}> {
  if (!draft || !Array.isArray(draft.media)) {
    throw new SocialCarouselInputError("Carousel media must be a list");
  }
  if (draft.media.length > 12) {
    throw new SocialCarouselInputError("A Carousel can use at most 12 saved images");
  }
  const references: CarouselMediaReference[] = [];
  const bytesById = new Map<string, Uint8Array>();
  for (const supplied of draft.media) {
    const mediaId = requiredText(supplied?.id, "Every Carousel image needs a saved media id");
    const stored = await findOwnedMediaById(env, ownerId, siteId, mediaId, true);
    if (!stored) {
      // A generic owner-scoped 404 avoids confirming another owner's media ID.
      throw new SocialCarouselInputError("Carousel media not found", 404);
    }
    const bytes = storedBlobBytes(stored.bytes);
    if (bytes.byteLength !== stored.byte_length) {
      throw new SocialCarouselInputError("Saved Carousel media is incomplete", 409);
    }
    references.push({
      id: stored.id,
      storageKey: stored.storage_key,
      immutableUrl: stored.immutable_url,
      contentHash: stored.content_hash,
      mimeType: stored.mime_type,
      pixelWidth: stored.pixel_width,
      pixelHeight: stored.pixel_height,
      altText: supplied.altText,
      decorative: supplied.decorative === true,
      focalPoint: { ...supplied.focalPoint },
    });
    bytesById.set(stored.id, bytes);
  }
  return { references, bytesById };
}

async function persistImmutableRenderSet(
  env: SocialCarouselEnv,
  input: {
    id: string;
    ownerId: string;
    siteId: string;
    postId: string;
    createdFromVersionId: string;
    model: CarouselRenderModel;
    inputFingerprint: `sha256:${string}`;
    canonicalInput: string;
    template: { id: string; version: number };
    assetManifest: SocialCarouselAssetManifestItem[];
    assets: StoredAsset[];
  },
): Promise<void> {
  const createdAt = new Date().toISOString();
  const modelJson = JSON.stringify(input.model);
  const assetManifestJson = JSON.stringify(input.assetManifest);
  if (
    utf8Length(modelJson) +
      utf8Length(input.canonicalInput) +
      utf8Length(assetManifestJson) > SOCIAL_CAROUSEL_D1_ROW_PAYLOAD_MAX_BYTES
  ) {
    throw new SocialCarouselInputError(
      "This Carousel render model is too large for portable storage",
      413,
    );
  }
  const statements: Statement[] = [
    env.DB.prepare(
      `INSERT OR IGNORE INTO social_carousel_render_sets (
         id, user_id, site_id, post_id, created_from_version_id,
         input_fingerprint, model_version, renderer_version, template_id,
         template_version, canvas_width, canvas_height, model_json,
         canonical_input, asset_manifest_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.id,
      input.ownerId,
      input.siteId,
      input.postId,
      input.createdFromVersionId,
      input.inputFingerprint,
      CAROUSEL_RENDER_MODEL_VERSION,
      CAROUSEL_RENDERER_VERSION,
      input.template.id,
      input.template.version,
      input.model.canvas.width,
      input.model.canvas.height,
      modelJson,
      input.canonicalInput,
      assetManifestJson,
      createdAt,
    ),
  ];
  for (const asset of input.assets) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO social_carousel_render_assets (
           id, render_set_id, slide_id, position, content_hash, storage_key,
           immutable_url, file_name, mime_type, pixel_width, pixel_height,
           byte_length, alt_text, source_evidence_json, media_ref_ids_json,
           svg_text, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'image/svg+xml', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        asset.id,
        input.id,
        asset.slideId,
        asset.position,
        asset.contentHash,
        asset.storageKey,
        asset.immutableUrl,
        asset.fileName,
        asset.width,
        asset.height,
        asset.byteLength,
        asset.altText,
        JSON.stringify(asset.sourceEvidence),
        JSON.stringify(asset.mediaRefIds),
        asset.svg,
        createdAt,
      ),
    );
  }
  for (const media of input.model.media) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO social_carousel_render_set_media (
           render_set_id, media_id, content_hash
         ) VALUES (?, ?, ?)`,
      ).bind(input.id, media.id, media.contentHash),
    );
  }
  await env.DB.batch(statements);

  const stored = await env.DB.prepare(
    `SELECT id FROM social_carousel_render_sets
     WHERE id = ? AND user_id = ? AND site_id = ? AND post_id = ?
       AND input_fingerprint = ? AND canonical_input = ?`,
  )
    .bind(
      input.id,
      input.ownerId,
      input.siteId,
      input.postId,
      input.inputFingerprint,
      input.canonicalInput,
    )
    .first<{ id: string }>();
  if (!stored) {
    throw new SocialCarouselInputError("Carousel output could not be saved", 409);
  }
}

type StoredAsset = {
  id: string;
  slideId: string;
  position: number;
  contentHash: `sha256:${string}`;
  storageKey: string;
  immutableUrl: string;
  fileName: string;
  width: number;
  height: number;
  byteLength: number;
  altText: string;
  sourceEvidence: CarouselRenderedAsset["sourceEvidence"];
  mediaRefIds: readonly string[];
  svg: string;
};

async function buildStoredAsset(
  asset: CarouselRenderedAsset,
  renderSetId: string,
  siteId: string,
): Promise<StoredAsset> {
  const contentHash = await sha256Text(asset.svg);
  const hashHex = contentHash.slice("sha256:".length);
  const id = `${renderSetId}-asset-${asset.position}`;
  const byteLength = utf8Length(asset.svg);
  if (byteLength > SOCIAL_CAROUSEL_D1_ROW_PAYLOAD_MAX_BYTES) {
    throw new SocialCarouselInputError(
      `Rendered slide ${asset.position + 1} is too large for portable storage`,
      413,
    );
  }
  return {
    id,
    slideId: asset.slideId,
    position: asset.position,
    contentHash,
    storageKey: `social-carousels/sha256/${hashHex}.svg`,
    immutableUrl:
      `/api/social/carousels/assets/${id}?siteId=${encodeURIComponent(siteId)}`,
    fileName: asset.fileName,
    width: asset.width,
    height: asset.height,
    byteLength,
    altText: asset.altText,
    sourceEvidence: asset.sourceEvidence,
    mediaRefIds: asset.mediaRefIds,
    svg: asset.svg,
  };
}

async function deterministicRenderSetId(
  ownerId: string,
  siteId: string,
  postId: string,
  fingerprint: string,
): Promise<string> {
  const hash = await sha256Text(`${ownerId}\n${siteId}\n${postId}\n${fingerprint}`);
  return `social-carousel-render-${hash.slice("sha256:".length)}`;
}

async function getOwnedCarouselVersion(
  env: SocialCarouselEnv,
  ownerId: string,
  siteId: string,
  postId: string,
  versionId: string,
): Promise<OwnedVersionRow | null> {
  return env.DB.prepare(
    `SELECT version.id, version.package_id, post.site_id, version.format,
            version.asset_manifest_json, version.approval_status, version.updated_at,
            version.carousel_render_set_id, post.post_title_snapshot,
            post.source_type, post.source_ref, post.source_hash,
            post.source_snapshot, post.source_text,
            owner.name AS owner_name, owner.username AS owner_username,
            site.username AS site_username
     FROM social_variants version
     JOIN social_packages post ON post.id = version.package_id
     JOIN sites site ON site.id = post.site_id
     LEFT JOIN owner_profile owner ON owner.id = site.user_id
     WHERE version.id = ? AND post.id = ? AND post.site_id = ? AND site.user_id = ?`,
  )
    .bind(versionId, postId, siteId, ownerId)
    .first<OwnedVersionRow>();
}

async function findOwnedMediaByHash(
  env: SocialCarouselEnv,
  ownerId: string,
  siteId: string,
  contentHash: string,
  includeBytes = false,
): Promise<MediaRow | null> {
  return env.DB.prepare(
    `SELECT id, site_id, content_hash, storage_key, immutable_url, mime_type,
            pixel_width, pixel_height, byte_length, created_at
            ${includeBytes ? ", bytes" : ""}
     FROM social_carousel_media
     WHERE user_id = ? AND site_id = ? AND content_hash = ?`,
  )
    .bind(ownerId, siteId, contentHash)
    .first<MediaRow>();
}

async function findOwnedMediaById(
  env: SocialCarouselEnv,
  ownerId: string,
  siteId: string,
  mediaId: string,
  includeBytes: boolean,
): Promise<MediaRow | null> {
  return env.DB.prepare(
    `SELECT id, site_id, content_hash, storage_key, immutable_url, mime_type,
            pixel_width, pixel_height, byte_length, created_at
            ${includeBytes ? ", bytes" : ""}
     FROM social_carousel_media
     WHERE id = ? AND user_id = ? AND site_id = ?`,
  )
    .bind(mediaId, ownerId, siteId)
    .first<MediaRow>();
}

function serializeMedia(row: MediaRow): SocialCarouselMedia {
  return {
    id: row.id,
    siteId: row.site_id,
    contentHash: row.content_hash,
    storageKey: row.storage_key,
    immutableUrl: row.immutable_url,
    mimeType: row.mime_type,
    pixelWidth: row.pixel_width,
    pixelHeight: row.pixel_height,
    byteLength: row.byte_length,
    createdAt: row.created_at,
  };
}

function serializeRenderSet(
  row: RenderSetRow,
  assets: RenderAssetRow[],
): SocialCarouselRenderSet {
  return {
    id: row.id,
    siteId: row.site_id,
    postId: row.post_id,
    createdFromVersionId: row.created_from_version_id,
    inputFingerprint: row.input_fingerprint,
    modelVersion: row.model_version,
    rendererVersion: row.renderer_version,
    template: { id: row.template_id, version: row.template_version },
    canvas: { width: row.canvas_width, height: row.canvas_height },
    model: parseJson<CarouselRenderModel>(row.model_json, "saved Carousel model"),
    canonicalInput: row.canonical_input,
    assetManifest: parseJson<SocialCarouselAssetManifestItem[]>(
      row.asset_manifest_json,
      "saved Carousel asset list",
    ),
    assets: assets.map(serializeRenderAsset),
    createdAt: row.created_at,
  };
}

function serializeRenderAsset(row: RenderAssetRow): SocialCarouselRenderAsset {
  return {
    id: row.id,
    renderSetId: row.render_set_id,
    slideId: row.slide_id,
    position: row.position,
    contentHash: row.content_hash,
    storageKey: row.storage_key,
    immutableUrl: row.immutable_url,
    fileName: row.file_name,
    mimeType: row.mime_type,
    pixelWidth: row.pixel_width,
    pixelHeight: row.pixel_height,
    byteLength: row.byte_length,
    altText: row.alt_text,
    sourceEvidence: parseJson<CarouselRenderedAsset["sourceEvidence"]>(
      row.source_evidence_json,
      "saved Source evidence",
    ),
    mediaRefIds: parseJson<string[]>(row.media_ref_ids_json, "saved media references"),
    svg: row.svg_text,
  };
}

function serializeAttachedVersion(
  row: OwnedVersionRow,
  renderSetId: string,
): RenderAndAttachSocialCarouselResult["version"] {
  return {
    id: row.id,
    postId: row.package_id,
    approvalStatus: row.approval_status,
    updatedAt: row.updated_at,
    carouselRenderSetId: renderSetId,
  };
}

function cloneSlides(value: unknown): CarouselSlide[] {
  if (!Array.isArray(value)) throw new SocialCarouselInputError("Carousel slides must be a list");
  return value.map((slide) => {
    if (!slide || typeof slide !== "object") {
      throw new SocialCarouselInputError("Every Carousel slide must be an object");
    }
    const record = slide as CarouselSlide;
    if (!Array.isArray(record.sourceEvidence)) {
      throw new SocialCarouselInputError("Every Carousel slide needs Source evidence");
    }
    return {
      ...record,
      sourceEvidence: record.sourceEvidence.map((evidence) => ({ ...evidence })),
    } as CarouselSlide;
  });
}

function readRasterDimensions(
  bytes: Uint8Array,
  mimeType: CarouselRasterMimeType,
): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    if (
      bytes.length < 24 ||
      ascii(bytes, 12, 16) !== "IHDR"
    ) return null;
    return validDimensions(readUint32Be(bytes, 16), readUint32Be(bytes, 20));
  }
  if (mimeType === "image/jpeg") return readJpegDimensions(bytes);
  return readWebpDimensions(bytes);
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) return null;
    if (offset + 1 >= bytes.length) return null;
    const length = readUint16Be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      marker !== undefined &&
      ((marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf))
    ) {
      if (length < 7) return null;
      return validDimensions(
        readUint16Be(bytes, offset + 5),
        readUint16Be(bytes, offset + 3),
      );
    }
    offset += length;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) return null;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    return validDimensions(
      1 + readUint24Le(bytes, 24),
      1 + readUint24Le(bytes, 27),
    );
  }
  if (chunk === "VP8 ") {
    if (
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) return null;
    return validDimensions(
      readUint16Le(bytes, 26) & 0x3fff,
      readUint16Le(bytes, 28) & 0x3fff,
    );
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f || bytes.length < 25) return null;
    const first = bytes[21] || 0;
    const second = bytes[22] || 0;
    const third = bytes[23] || 0;
    const fourth = bytes[24] || 0;
    return validDimensions(
      1 + first + ((second & 0x3f) << 8),
      1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
    );
  }
  return null;
}

function validDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] || 0) * 0x1000000) +
    ((bytes[offset + 1] || 0) << 16) +
    ((bytes[offset + 2] || 0) << 8) +
    (bytes[offset + 3] || 0)
  ) >>> 0;
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] || 0) +
    ((bytes[offset + 1] || 0) << 8) +
    ((bytes[offset + 2] || 0) << 16);
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] || 0) << 8) + (bytes[offset + 1] || 0);
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] || 0) + ((bytes[offset + 1] || 0) << 8);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function rasterExtension(mimeType: CarouselRasterMimeType): "png" | "jpg" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "webp";
}

function copyBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  throw new SocialCarouselInputError("Carousel media bytes are required");
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function storedBlobBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (
    Array.isArray(value) &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return Uint8Array.from(value as number[]);
  }
  throw new SocialCarouselInputError("Saved Carousel media is incomplete", 409);
}

async function sha256Text(value: string): Promise<`sha256:${string}`> {
  return sha256Bytes(new TextEncoder().encode(value));
}

async function sha256Bytes(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    exactArrayBuffer(bytes),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function firstBatchChanges(value: unknown): number | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0] as StatementResult | undefined;
  return typeof first?.meta?.changes === "number" ? first.meta.changes : null;
}

function monotonicUpdatedAt(previous: string): string {
  const previousMs = Date.parse(previous);
  return new Date(
    Math.max(Date.now(), Number.isFinite(previousMs) ? previousMs + 1 : 0),
  ).toISOString();
}

function ownerHandle(value: string): string {
  const normalized = value.trim().replace(/^@+/, "");
  return normalized ? `@${normalized}` : "";
}

function normalizeRenderError(error: unknown): SocialCarouselInputError {
  if (error instanceof SocialCarouselInputError) return error;
  if (error instanceof CarouselRenderValidationError) {
    return new SocialCarouselInputError(error.message, 400, error.issues);
  }
  return new SocialCarouselInputError(
    error instanceof Error && error.message
      ? `Carousel input is invalid: ${error.message}`
      : "Carousel input is invalid",
  );
}

function staleVersionError(): SocialCarouselInputError {
  return new SocialCarouselInputError(
    "This Post Version changed after it was loaded. Refresh and try again.",
    409,
  );
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new SocialCarouselInputError(`The ${label} is invalid`, 409);
  }
}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SocialCarouselInputError(message);
  }
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}
