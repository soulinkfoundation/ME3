import { getR2SiteFileKey, sha256Buffer } from "./sites";
import type { DbSite, Env } from "./types";

export const MAX_CAMPAIGN_IMAGE_BYTES = 5 * 1024 * 1024;
export const CAMPAIGN_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"] as const;

export type CampaignImageType = (typeof CAMPAIGN_IMAGE_TYPES)[number];

export type CampaignAssetRecord = {
  id: string;
  campaign_id: string;
  site_id: string;
  content_hash: string;
  storage_path: string;
  filename: string;
  content_type: CampaignImageType;
  size: number;
  created_at: string;
};

type CampaignAssetWithSite = CampaignAssetRecord & { site_username: string };

export class CampaignAssetInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "CampaignAssetInputError";
  }
}

export async function storeCampaignAsset(input: {
  env: Env;
  site: Pick<DbSite, "id" | "username">;
  campaignId: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
}): Promise<CampaignAssetRecord> {
  if (!input.env.SITE_ASSETS) {
    throw new CampaignAssetInputError("Campaign image storage is not available", 503);
  }
  const contentType = validateCampaignImage(input.bytes, input.contentType);
  const contentHash = await sha256Buffer(input.bytes);
  const extension = extensionForCampaignImage(contentType);
  const storagePath = campaignAssetStoragePath(input.campaignId, contentHash, extension);
  const filename = normalizeCampaignAssetFilename(input.filename, extension);

  const existing = await input.env.DB.prepare(
    `SELECT id, campaign_id, site_id, content_hash, storage_path, filename, content_type, size,
            created_at
     FROM email_campaign_assets
     WHERE campaign_id = ? AND content_hash = ?`,
  )
    .bind(input.campaignId, contentHash)
    .first<CampaignAssetRecord>();
  if (existing) {
    await input.env.SITE_ASSETS.put(
      getR2SiteFileKey(input.site as DbSite, existing.storage_path),
      input.bytes,
      {
        httpMetadata: {
          contentType: existing.content_type,
          cacheControl: "public, max-age=31536000, immutable",
        },
        customMetadata: { sha256: existing.content_hash },
      },
    );
    return existing;
  }

  const asset: CampaignAssetRecord = {
    id: crypto.randomUUID(),
    campaign_id: input.campaignId,
    site_id: input.site.id,
    content_hash: contentHash,
    storage_path: storagePath,
    filename,
    content_type: contentType,
    size: input.bytes.byteLength,
    created_at: new Date().toISOString(),
  };
  await input.env.SITE_ASSETS.put(
    getR2SiteFileKey(input.site as DbSite, storagePath),
    input.bytes,
    {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: { sha256: contentHash },
    },
  );
  try {
    await input.env.DB.prepare(
      `INSERT INTO email_campaign_assets
       (id, campaign_id, site_id, content_hash, storage_path, filename, content_type, size,
        created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        asset.id,
        asset.campaign_id,
        asset.site_id,
        asset.content_hash,
        asset.storage_path,
        asset.filename,
        asset.content_type,
        asset.size,
        asset.created_at,
      )
      .run();
  } catch (error) {
    const raced = await input.env.DB.prepare(
      `SELECT id, campaign_id, site_id, content_hash, storage_path, filename, content_type, size,
              created_at
       FROM email_campaign_assets
       WHERE campaign_id = ? AND content_hash = ?`,
    )
      .bind(input.campaignId, contentHash)
      .first<CampaignAssetRecord>();
    if (raced) return raced;
    throw error;
  }
  return asset;
}

export async function loadPublicCampaignAsset(
  env: Env,
  assetId: string,
): Promise<{ asset: CampaignAssetRecord; object: R2ObjectBody } | null> {
  if (!env.SITE_ASSETS) return null;
  const asset = await env.DB.prepare(
    `SELECT a.id, a.campaign_id, a.site_id, a.content_hash, a.storage_path, a.filename,
            a.content_type, a.size, a.created_at, s.username AS site_username
     FROM email_campaign_assets a
     JOIN sites s ON s.id = a.site_id
     WHERE a.id = ?`,
  )
    .bind(assetId)
    .first<CampaignAssetWithSite>();
  if (!asset) return null;
  const object = await env.SITE_ASSETS.get(
    getR2SiteFileKey({ username: asset.site_username } as DbSite, asset.storage_path),
  );
  return object ? { asset, object } : null;
}

export async function linkCampaignRevisionAssets(
  db: D1Database,
  revisionId: string,
  assetIds: readonly string[],
): Promise<void> {
  const revision = await db
    .prepare("SELECT campaign_id FROM email_campaign_revisions WHERE id = ?")
    .bind(revisionId)
    .first<{ campaign_id: string }>();
  if (!revision) throw new CampaignAssetInputError("Campaign revision not found", 404);

  const uniqueAssetIds = [...new Set(assetIds)];
  const statements = [];
  for (const assetId of uniqueAssetIds) {
    const asset = await db
      .prepare("SELECT campaign_id FROM email_campaign_assets WHERE id = ?")
      .bind(assetId)
      .first<{ campaign_id: string }>();
    if (!asset || asset.campaign_id !== revision.campaign_id) {
      throw new CampaignAssetInputError("Campaign content references an unavailable image");
    }
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO email_campaign_revision_assets (revision_id, asset_id)
           VALUES (?, ?)`,
        )
        .bind(revisionId, assetId),
    );
  }
  if (typeof db.batch === "function") {
    await db.batch(statements);
  } else {
    for (const statement of statements) await statement.run();
  }
}

export async function pruneUnreferencedCampaignAssets(input: {
  env: Env;
  site: Pick<DbSite, "id" | "username">;
  campaignId: string;
  olderThan: string;
}): Promise<number> {
  if (!input.env.SITE_ASSETS) return 0;
  const result = await input.env.DB.prepare(
    `SELECT a.id, a.campaign_id, a.site_id, a.content_hash, a.storage_path, a.filename,
            a.content_type, a.size, a.created_at
     FROM email_campaign_assets a
     JOIN email_campaigns c ON c.id = a.campaign_id
     LEFT JOIN email_campaign_revision_assets link ON link.asset_id = a.id
     WHERE a.campaign_id = ?
       AND a.site_id = ?
       AND c.status = 'draft'
       AND a.created_at < ?
       AND link.asset_id IS NULL`,
  )
    .bind(input.campaignId, input.site.id, input.olderThan)
    .all<CampaignAssetRecord>();

  let removed = 0;
  for (const asset of result.results || []) {
    await input.env.SITE_ASSETS.delete(
      getR2SiteFileKey(input.site as DbSite, asset.storage_path),
    );
    const deleted = await input.env.DB.prepare(
      "DELETE FROM email_campaign_assets WHERE id = ? AND campaign_id = ?",
    )
      .bind(asset.id, input.campaignId)
      .run();
    removed += Number(deleted.meta.changes || 0);
  }
  return removed;
}

export function validateCampaignImage(bytes: ArrayBuffer, contentType: string): CampaignImageType {
  if (bytes.byteLength === 0) throw new CampaignAssetInputError("Campaign image is empty");
  if (bytes.byteLength > MAX_CAMPAIGN_IMAGE_BYTES) {
    throw new CampaignAssetInputError("Campaign images must be 5 MB or smaller");
  }
  const normalizedType = contentType.toLowerCase().split(";", 1)[0]?.trim();
  if (!isCampaignImageType(normalizedType)) {
    throw new CampaignAssetInputError("Campaign images must be JPEG, PNG, or GIF");
  }
  const signature = new Uint8Array(bytes);
  const valid =
    (normalizedType === "image/jpeg" && isJpeg(signature)) ||
    (normalizedType === "image/png" && isPng(signature)) ||
    (normalizedType === "image/gif" && isGif(signature));
  if (!valid) throw new CampaignAssetInputError("Campaign image contents do not match its type");
  return normalizedType;
}

export function campaignAssetStoragePath(
  campaignId: string,
  contentHash: string,
  extension: string,
): string {
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) {
    throw new CampaignAssetInputError("Campaign image hash is invalid");
  }
  const safeCampaignId = campaignId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 128);
  if (!safeCampaignId) throw new CampaignAssetInputError("Campaign id is invalid");
  return `campaigns/${safeCampaignId}/${contentHash.toLowerCase()}.${extension}`;
}

function normalizeCampaignAssetFilename(filename: string, extension: string): string {
  const base = filename
    .normalize("NFKC")
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100) || "campaign-image";
  return `${base}.${extension}`;
}

function extensionForCampaignImage(contentType: CampaignImageType): "jpg" | "png" | "gif" {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "gif";
}

function isCampaignImageType(value: string | undefined): value is CampaignImageType {
  return CAMPAIGN_IMAGE_TYPES.some((type) => type === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((value, index) => bytes[index] === value);
}

function isGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const header = String.fromCharCode(...bytes.slice(0, 6));
  return header === "GIF87a" || header === "GIF89a";
}
