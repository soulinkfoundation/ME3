import {
  buildLandingPageDocument,
  getLandingPageTemplateId,
  getLandingPageTitle,
  getLandingPageValidationErrors,
  normalizeLandingPageDocument,
  renderLandingPageHtml,
  upgradeLandingPageDocument,
  type LandingPageBuildInput,
  type LandingPageDocumentV3,
} from "@me3-core/plugin-landing-pages";
import type { DbSite, DbSitePage, DbSitePageRevision, Env } from "./types";
import { getStripeSecretKey } from "./commerce-settings";
import { hasManagedCommerceBridge } from "./commerce-bridge";
import {
  deleteSiteFile,
  getR2SiteFile,
  getSiteFile,
  getSiteFileText,
  parseSiteProfile,
  putSiteMediaFile,
  putSiteFile,
  siteFileContentToArrayBuffer,
} from "./sites";

const PAGE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const PAGE_SELECT = `SELECT id, site_id, slug, kind, title, template_id, draft_json,
  published_revision_id, created_at, updated_at, published_at FROM site_pages`;

export class SitePageInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SitePageInputError";
  }
}

export function normalizePageSlug(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
    : "";
}

export function parsePageDocument(raw: string): LandingPageDocumentV3 | null {
  try {
    const page = normalizeLandingPageDocument(JSON.parse(raw));
    return page ? upgradeLandingPageDocument(page) : null;
  } catch {
    return null;
  }
}

export async function listSitePages(env: Env, siteId: string): Promise<DbSitePage[]> {
  const result = await env.DB.prepare(
    `${PAGE_SELECT} WHERE site_id = ? ORDER BY updated_at DESC`,
  )
    .bind(siteId)
    .all<DbSitePage>();
  return result.results || [];
}

export async function getSitePage(
  env: Env,
  siteId: string,
  pageId: string,
): Promise<DbSitePage | null> {
  return (
    (await env.DB.prepare(`${PAGE_SELECT} WHERE site_id = ? AND id = ?`)
      .bind(siteId, pageId)
      .first<DbSitePage>()) || null
  );
}

export async function createSitePage(
  env: Env,
  site: DbSite,
  input: LandingPageBuildInput & { slug: string },
): Promise<DbSitePage> {
  const slug = normalizePageSlug(input.slug);
  if (!PAGE_SLUG_REGEX.test(slug)) {
    throw new SitePageInputError(
      "Page path must use 1-60 lowercase letters, numbers, or hyphens.",
    );
  }
  const document = upgradeLandingPageDocument(buildLandingPageDocument(input));
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO site_pages
       (id, site_id, slug, kind, title, template_id, draft_json)
       VALUES (?, ?, ?, 'landing_page', ?, ?, ?)`,
    )
      .bind(
        id,
        site.id,
        slug,
        getLandingPageTitle(document),
        getLandingPageTemplateId(document),
        JSON.stringify(document),
      )
      .run();
  } catch (error) {
    if (/unique|constraint/i.test(String(error))) {
      throw new SitePageInputError("That page path is already in use.", 409);
    }
    throw error;
  }
  const page = await getSitePage(env, site.id, id);
  if (!page) throw new Error("Created page could not be loaded");
  return page;
}

export async function migrateLegacyLandingPages(
  env: Env,
  ownerId: string,
  targetSite: DbSite,
): Promise<DbSitePage[]> {
  const legacy = await env.DB.prepare(
    `SELECT id, user_id, username, site_type, template_id, custom_domain,
            custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
     FROM sites WHERE user_id = ? AND site_type = 'landing_page' ORDER BY created_at`,
  )
    .bind(ownerId)
    .all<DbSite>();
  const existingSlugs = new Set((await listSitePages(env, targetSite.id)).map((page) => page.slug));
  const migrated: DbSitePage[] = [];
  for (const legacySite of legacy.results || []) {
    const slug = normalizePageSlug(legacySite.username);
    if (!slug || existingSlugs.has(slug)) continue;
    const raw = await getSiteFileText(env, legacySite.id, "landing/page.json");
    const normalized = raw ? parsePageDocument(raw) : null;
    if (!normalized) continue;
    const document = structuredClone(normalized);
    document.hero.image = await copyLegacyAsset(
      env,
      legacySite,
      targetSite,
      document.hero.image,
    );
    document.assets.heroImage = document.hero.image || null;
    document.assets.sectionImage = await copyLegacyAsset(
      env,
      legacySite,
      targetSite,
      document.assets.sectionImage,
    );
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO site_pages
       (id, site_id, slug, kind, title, template_id, draft_json)
       VALUES (?, ?, ?, 'landing_page', ?, ?, ?)`,
    )
      .bind(
        id,
        targetSite.id,
        slug,
        getLandingPageTitle(document),
        getLandingPageTemplateId(document),
        JSON.stringify(document),
      )
      .run();
    const page = await getSitePage(env, targetSite.id, id);
    if (page) {
      migrated.push(page);
      existingSlugs.add(slug);
    }
  }
  return migrated;
}

export async function saveSitePageDraft(
  env: Env,
  site: DbSite,
  pageId: string,
  value: unknown,
): Promise<DbSitePage> {
  const normalized = normalizeLandingPageDocument(value);
  if (!normalized) throw new SitePageInputError("Valid page document is required.");
  const document = upgradeLandingPageDocument(normalized);
  const result = await env.DB.prepare(
    `UPDATE site_pages
     SET title = ?, template_id = ?, draft_json = ?, updated_at = datetime('now')
     WHERE id = ? AND site_id = ?`,
  )
    .bind(
      getLandingPageTitle(document),
      getLandingPageTemplateId(document),
      JSON.stringify(document),
      pageId,
      site.id,
    )
    .run();
  if (Number(result.meta.changes || 0) === 0) {
    throw new SitePageInputError("Page not found.", 404);
  }
  const page = await getSitePage(env, site.id, pageId);
  if (!page) throw new Error("Saved page could not be loaded");
  return page;
}

export async function publishSitePage(
  env: Env,
  site: DbSite,
  pageId: string,
): Promise<{ page: DbSitePage; revision: DbSitePageRevision }> {
  const page = await getSitePage(env, site.id, pageId);
  if (!page) throw new SitePageInputError("Page not found.", 404);
  const document = parsePageDocument(page.draft_json);
  if (!document) throw new SitePageInputError("The page draft is invalid.");
  const errors = [
    ...getLandingPageValidationErrors(document),
    ...(await validatePageResources(env, site, document)),
  ];
  if (errors.length > 0) {
    throw new SitePageInputError(errors.join(" "), 409);
  }
  const revisionId = crypto.randomUUID();
  const renderedHtml = renderLandingPageHtml(document, site.username, {
    pageId: page.id,
    slug: page.slug,
    campaign: page.slug,
    actionUsername: site.username,
  });
  await env.DB.prepare(
    `INSERT INTO site_page_revisions (id, page_id, document_json, rendered_html)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(revisionId, page.id, JSON.stringify(document), renderedHtml)
    .run();
  await putSiteFile(
    env,
    site.id,
    `public/${page.slug}/index.html`,
    renderedHtml,
    "text/html",
  );
  await env.DB.prepare(
    `UPDATE site_pages
     SET published_revision_id = ?, published_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ? AND site_id = ?`,
  )
    .bind(revisionId, page.id, site.id)
    .run();
  const [updatedPage, revision] = await Promise.all([
    getSitePage(env, site.id, page.id),
    env.DB.prepare(
      `SELECT id, page_id, document_json, rendered_html, created_at
       FROM site_page_revisions WHERE id = ?`,
    )
      .bind(revisionId)
      .first<DbSitePageRevision>(),
  ]);
  if (!updatedPage || !revision) throw new Error("Published revision could not be loaded");
  return { page: updatedPage, revision };
}

export async function unpublishSitePage(
  env: Env,
  site: DbSite,
  pageId: string,
): Promise<DbSitePage> {
  const page = await getSitePage(env, site.id, pageId);
  if (!page) throw new SitePageInputError("Page not found.", 404);
  await Promise.all([
    env.DB.prepare(
      `UPDATE site_pages
       SET published_revision_id = NULL, published_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND site_id = ?`,
    )
      .bind(page.id, site.id)
      .run(),
    deleteSiteFile(env, site.id, `public/${page.slug}/index.html`),
  ]);
  const updated = await getSitePage(env, site.id, page.id);
  if (!updated) throw new Error("Unpublished page could not be loaded");
  return updated;
}

export async function deleteSitePage(
  env: Env,
  site: DbSite,
  pageId: string,
): Promise<void> {
  const page = await getSitePage(env, site.id, pageId);
  if (!page) throw new SitePageInputError("Page not found.", 404);
  await deleteSiteFile(env, site.id, `public/${page.slug}/index.html`);
  await env.DB.prepare("DELETE FROM site_pages WHERE id = ? AND site_id = ?")
    .bind(page.id, site.id)
    .run();
}

export async function listSitePageRevisions(
  env: Env,
  pageId: string,
): Promise<DbSitePageRevision[]> {
  const result = await env.DB.prepare(
    `SELECT id, page_id, document_json, rendered_html, created_at
     FROM site_page_revisions WHERE page_id = ? ORDER BY created_at DESC LIMIT 10`,
  )
    .bind(pageId)
    .all<DbSitePageRevision>();
  return result.results || [];
}

export async function restoreSitePageRevision(
  env: Env,
  site: DbSite,
  pageId: string,
  revisionId: string,
): Promise<DbSitePage> {
  const page = await getSitePage(env, site.id, pageId);
  if (!page) throw new SitePageInputError("Page not found.", 404);
  const revision = await env.DB.prepare(
    `SELECT id, page_id, document_json, rendered_html, created_at
     FROM site_page_revisions WHERE id = ? AND page_id = ?`,
  )
    .bind(revisionId, page.id)
    .first<DbSitePageRevision>();
  if (!revision) throw new SitePageInputError("Revision not found.", 404);
  const document = parsePageDocument(revision.document_json);
  if (!document) throw new SitePageInputError("Revision document is invalid.", 409);
  await env.DB.prepare(
    `UPDATE site_pages
     SET title = ?, template_id = ?, draft_json = ?, updated_at = datetime('now')
     WHERE id = ? AND site_id = ?`,
  )
    .bind(
      getLandingPageTitle(document),
      getLandingPageTemplateId(document),
      JSON.stringify(document),
      page.id,
      site.id,
    )
    .run();
  const updated = await getSitePage(env, site.id, page.id);
  if (!updated) throw new Error("Restored page could not be loaded");
  return updated;
}

export function serializeSitePage(page: DbSitePage) {
  return {
    id: page.id,
    siteId: page.site_id,
    slug: page.slug,
    kind: page.kind,
    title: page.title,
    templateId: page.template_id,
    document: parsePageDocument(page.draft_json),
    publishedRevisionId: page.published_revision_id,
    createdAt: page.created_at,
    updatedAt: page.updated_at,
    publishedAt: page.published_at,
  };
}

async function validatePageResources(
  env: Env,
  site: DbSite,
  page: LandingPageDocumentV3,
): Promise<string[]> {
  if (!page.actions.some((action) => action.kind === "booking" || action.kind === "product")) {
    return [];
  }
  const raw =
    (await getSiteFileText(env, site.id, "src/me.json")) ||
    (await getSiteFileText(env, site.id, "public/me.json"));
  if (!raw) return ["Publish the main site before using booking or product actions."];
  const profile = parseSiteProfile(raw, site.username);
  const bookingIds = new Map<string, boolean>();
  const book = profile.intents?.book as
    | {
        offers?: Array<{ id?: string; pricing?: { enabled?: boolean } }>;
        bookingTypes?: Array<{
          offers?: Array<{ id?: string; pricing?: { enabled?: boolean } }>;
        }>;
      }
    | undefined;
  for (const offer of book?.offers || []) {
    if (offer.id) bookingIds.set(offer.id, offer.pricing?.enabled === true);
  }
  for (const type of book?.bookingTypes || []) {
    for (const offer of type.offers || []) {
      if (offer.id) bookingIds.set(offer.id, offer.pricing?.enabled === true);
    }
  }
  const productIds = new Set((profile.products || []).map((product) => product.slug));
  const paymentsReady = Boolean(
    (await getStripeSecretKey(env, site.user_id)) ||
      (await hasManagedCommerceBridge(env)),
  );
  const errors: string[] = [];
  for (const action of page.actions) {
    if (action.kind === "booking" && !bookingIds.has(action.resourceId || "")) {
      errors.push(`Booking ${action.resourceId || action.label} is not available on this site.`);
    }
    if (
      action.kind === "booking" &&
      bookingIds.get(action.resourceId || "") === true &&
      !paymentsReady
    ) {
      errors.push("Connect Stripe before publishing a paid booking action.");
    }
    if (action.kind === "product" && !productIds.has(action.resourceId || "")) {
      errors.push(`Product ${action.resourceId || action.label} is not available on this site.`);
    }
    if (action.kind === "product" && !paymentsReady) {
      errors.push("Connect Stripe before publishing a product payment action.");
    }
  }
  return errors;
}

async function copyLegacyAsset(
  env: Env,
  sourceSite: DbSite,
  targetSite: DbSite,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value || !/(?:^|\/)files\//.test(value)) return value || null;
  const filename = value.split("/").pop();
  if (!filename) return value;
  const sourcePath = `public/files/${filename}`;
  const source =
    (await getR2SiteFile(env, sourceSite, sourcePath)) ||
    (await getSiteFile(env, sourceSite.id, sourcePath));
  if (!source) return value;
  const targetName = `${sourceSite.username}-${filename}`;
  await putSiteMediaFile(
    env,
    targetSite,
    `public/files/${targetName}`,
    siteFileContentToArrayBuffer(source.content),
    source.content_type,
  );
  return `/files/${targetName}`;
}
