import {
  buildLandingPageDocument,
  getDefaultLandingPageDesignPackId,
  getLandingPageDesignPack,
  getLandingPageDesignPackId,
  getLandingPageTemplateId,
  getLandingPageTitle,
  getSelectableLandingPageDesignPacks,
  landingPageDesignPackSupportsPurpose,
  normalizeLandingPageDesignPackId,
  normalizeLandingPageDocument,
  setLandingPageDesignPack,
  upgradeLandingPageDocument,
  type LandingPageDesignPackId,
  type LandingPageDocumentV3,
  type LandingPageTemplateId,
} from "@me3-core/plugin-landing-pages";

type LandingPageD1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
};

export type AgentLandingPageEnv = {
  DB: LandingPageD1Like;
};

type DbAgentLandingSite = {
  id: string;
  username: string;
  custom_domain: string | null;
  updated_at: string;
};

type DbAgentLandingPage = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  template_id: string;
  draft_json: string;
  published_revision_id: string | null;
  updated_at: string;
  published_at: string | null;
};

type DbAgentLandingOwner = {
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export type AgentLandingPageSummary = {
  id: string;
  siteId: string;
  siteUsername: string;
  slug: string;
  title: string;
  purpose: LandingPageTemplateId;
  designPackId: LandingPageDesignPackId;
  designName: string;
  published: boolean;
  updatedAt: string;
  editorPath: string;
  previewPath: string;
};

export type AgentLandingPageDraftInput = {
  site?: string;
  slug?: string;
  purpose: LandingPageTemplateId;
  designPackId?: string;
  brief: string;
  headline?: string;
  subheadline?: string;
  highlights?: string;
  ctaLabel?: string;
};

export type AgentLandingPageUpdateInput = {
  site?: string;
  pageId: string;
  designPackId?: string;
  headline?: string;
  subheadline?: string;
  highlights?: string;
  ctaLabel?: string;
};

export function listAgentLandingPageDesigns() {
  return getSelectableLandingPageDesignPacks().map((pack) => ({
    id: pack.id,
    version: pack.version,
    name: pack.name,
    description: pack.description,
    bestFor: pack.bestFor,
    purposes: [...pack.purposes],
    previewPath: pack.previewPath,
  }));
}

export async function listAgentLandingPages(
  env: AgentLandingPageEnv,
  userId: string,
  siteReference?: string,
): Promise<AgentLandingPageSummary[]> {
  await assertLandingPagesPluginEnabled(env);
  const site = await resolveAgentLandingPageSite(env, userId, siteReference);
  const result = await env.DB.prepare(
    `SELECT id, site_id, slug, title, template_id, draft_json,
            published_revision_id, updated_at, published_at
     FROM site_pages
     WHERE site_id = ? AND kind = 'landing_page'
     ORDER BY updated_at DESC
     LIMIT 50`,
  )
    .bind(site.id)
    .all<DbAgentLandingPage>();
  return (result.results || []).flatMap((row) => {
    const document = parseAgentLandingPageDocument(row.draft_json);
    return document ? [serializeAgentLandingPage(row, site, document)] : [];
  });
}

export async function createAgentLandingPageDraft(
  env: AgentLandingPageEnv,
  userId: string,
  input: AgentLandingPageDraftInput,
): Promise<AgentLandingPageSummary> {
  await assertLandingPagesPluginEnabled(env);
  const site = await resolveAgentLandingPageSite(env, userId, input.site);
  const owner = await env.DB.prepare(
    `SELECT name, bio, avatar_url FROM owner_profile WHERE id = ? LIMIT 1`,
  )
    .bind(userId)
    .first<DbAgentLandingOwner>();
  const designPackId = resolveAgentDesignPack(input.designPackId, input.purpose);
  const document = upgradeLandingPageDocument(
    buildLandingPageDocument({
      username: site.username,
      brief: input.brief,
      template: input.purpose,
      designPackId,
      profile: {
        name: owner?.name || site.username,
        bio: owner?.bio || null,
        avatar: owner?.avatar_url || null,
        profileUrl: `/sites/${encodeURIComponent(site.username)}`,
      },
    }),
  );
  applyAgentLandingPageCopy(document, input);
  const slug = await uniqueAgentLandingPageSlug(
    env,
    site.id,
    input.slug || input.headline || document.seo.title,
  );
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
      throw new Error(`The page path "${slug}" is already in use.`);
    }
    throw error;
  }
  const row = await loadAgentLandingPage(env, site.id, id);
  if (!row) throw new Error("The landing-page draft could not be loaded after creation.");
  return serializeAgentLandingPage(row, site, document);
}

export async function updateAgentLandingPageDraft(
  env: AgentLandingPageEnv,
  userId: string,
  input: AgentLandingPageUpdateInput,
): Promise<AgentLandingPageSummary> {
  await assertLandingPagesPluginEnabled(env);
  const site = await resolveAgentLandingPageSite(env, userId, input.site);
  const row = await loadAgentLandingPage(env, site.id, input.pageId);
  if (!row) {
    throw new Error("Landing page not found. List landing pages and use an exact page ID.");
  }
  const current = parseAgentLandingPageDocument(row.draft_json);
  if (!current) throw new Error("The landing-page draft is invalid and cannot be updated in chat.");
  let document = current;
  if (input.designPackId) {
    document = setLandingPageDesignPack(
      document,
      resolveAgentDesignPack(input.designPackId, document.intent.type),
    );
  }
  applyAgentLandingPageCopy(document, input);
  document.updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE site_pages
     SET title = ?, template_id = ?, draft_json = ?, updated_at = datetime('now')
     WHERE id = ? AND site_id = ?`,
  )
    .bind(
      getLandingPageTitle(document),
      getLandingPageTemplateId(document),
      JSON.stringify(document),
      row.id,
      site.id,
    )
    .run();
  const updated = await loadAgentLandingPage(env, site.id, row.id);
  if (!updated) throw new Error("The updated landing-page draft could not be loaded.");
  return serializeAgentLandingPage(updated, site, document);
}

function applyAgentLandingPageCopy(
  document: LandingPageDocumentV3,
  input: Pick<
    AgentLandingPageDraftInput,
    "headline" | "subheadline" | "highlights" | "ctaLabel"
  >,
): void {
  const headline = normalizeOptionalText(input.headline);
  const subheadline = normalizeOptionalText(input.subheadline);
  const ctaLabel = normalizeOptionalText(input.ctaLabel);
  if (headline) {
    document.hero.headline = headline;
    document.seo.title = headline;
    document.intent.offerName = headline;
  }
  if (subheadline) {
    document.hero.subheadline = subheadline;
    document.seo.description = subheadline;
  }
  if (ctaLabel) {
    const action = document.actions.find(
      (candidate) => candidate.id === document.hero.primaryActionId,
    );
    if (action) action.label = ctaLabel;
  }
  const highlights = parseAgentLandingPageHighlights(input.highlights);
  if (highlights.length) {
    const section = document.content.sections.find(
      (candidate) => candidate.type === "feature-list",
    );
    if (section?.type === "feature-list") section.items = highlights;
  }
  document.updatedAt = new Date().toISOString();
}

function parseAgentLandingPageHighlights(
  value: string | undefined,
): Array<{ title: string; body: string }> {
  if (!value?.trim()) return [];
  return value
    .split(/\n+|\s*\|\s*/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line, index) => {
      const separator = line.indexOf(":");
      return separator > 0
        ? {
            title: line.slice(0, separator).trim(),
            body: line.slice(separator + 1).trim(),
          }
        : { title: `Highlight ${index + 1}`, body: line };
    });
}

function resolveAgentDesignPack(
  value: string | undefined,
  purpose: LandingPageTemplateId,
): LandingPageDesignPackId {
  const designPackId = value
    ? normalizeLandingPageDesignPackId(value)
    : getDefaultLandingPageDesignPackId(purpose);
  if (!designPackId || designPackId === "legacy-standard") {
    throw new Error("Choose one of the available starter design-pack IDs.");
  }
  if (!landingPageDesignPackSupportsPurpose(designPackId, purpose)) {
    throw new Error(
      `${getLandingPageDesignPack(designPackId).name} does not support ${purpose} pages.`,
    );
  }
  return designPackId;
}

async function assertLandingPagesPluginEnabled(
  env: AgentLandingPageEnv,
): Promise<void> {
  const plugin = await env.DB.prepare(
    `SELECT enabled, status FROM plugin_installations WHERE plugin_id = ? LIMIT 1`,
  )
    .bind("me3.landing-pages")
    .first<{ enabled: number; status: string }>();
  if (!plugin || plugin.enabled === 0 || plugin.status !== "installed") {
    throw new Error("Activate ME3 Landing Pages before creating or editing a page in chat.");
  }
}

async function resolveAgentLandingPageSite(
  env: AgentLandingPageEnv,
  userId: string,
  siteReference?: string,
): Promise<DbAgentLandingSite> {
  const result = await env.DB.prepare(
    `SELECT id, username, custom_domain, updated_at
     FROM sites
     WHERE user_id = ? AND COALESCE(site_type, 'profile') = 'profile'
     ORDER BY updated_at DESC, username ASC
     LIMIT 20`,
  )
    .bind(userId)
    .all<DbAgentLandingSite>();
  const sites = result.results || [];
  if (!sites.length) throw new Error("Create your ME3 profile site before adding a landing page.");
  const reference = normalizeOptionalText(siteReference)?.replace(/^@/, "").toLowerCase();
  if (reference) {
    const matches = sites.filter(
      (site) =>
        site.username.toLowerCase() === reference ||
        site.custom_domain?.toLowerCase() === reference,
    );
    if (matches.length === 1) return matches[0];
    throw new Error(`I could not find a profile site matching "${siteReference}".`);
  }
  if (sites.length === 1) return sites[0];
  throw new Error(
    `I found multiple profile sites: ${sites.map((site) => `@${site.username}`).join(", ")}. Which should I use?`,
  );
}

async function uniqueAgentLandingPageSlug(
  env: AgentLandingPageEnv,
  siteId: string,
  value: string,
): Promise<string> {
  const base = slugifyAgentLandingPage(value) || "landing-page";
  const result = await env.DB.prepare(
    `SELECT slug FROM site_pages WHERE site_id = ? LIMIT 200`,
  )
    .bind(siteId)
    .all<{ slug: string }>();
  const existing = new Set((result.results || []).map((row) => row.slug));
  if (!existing.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const suffixText = `-${suffix}`;
    const candidate = `${base.slice(0, 60 - suffixText.length)}${suffixText}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("I could not find an unused landing-page path.");
}

function slugifyAgentLandingPage(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

async function loadAgentLandingPage(
  env: AgentLandingPageEnv,
  siteId: string,
  pageId: string,
): Promise<DbAgentLandingPage | null> {
  return env.DB.prepare(
    `SELECT id, site_id, slug, title, template_id, draft_json,
            published_revision_id, updated_at, published_at
     FROM site_pages
     WHERE site_id = ? AND id = ? AND kind = 'landing_page'
     LIMIT 1`,
  )
    .bind(siteId, pageId)
    .first<DbAgentLandingPage>();
}

function parseAgentLandingPageDocument(raw: string): LandingPageDocumentV3 | null {
  try {
    const normalized = normalizeLandingPageDocument(JSON.parse(raw));
    return normalized ? upgradeLandingPageDocument(normalized) : null;
  } catch {
    return null;
  }
}

function serializeAgentLandingPage(
  row: DbAgentLandingPage,
  site: DbAgentLandingSite,
  document: LandingPageDocumentV3,
): AgentLandingPageSummary {
  const designPackId = getLandingPageDesignPackId(document);
  return {
    id: row.id,
    siteId: row.site_id,
    siteUsername: site.username,
    slug: row.slug,
    title: getLandingPageTitle(document),
    purpose: getLandingPageTemplateId(document),
    designPackId,
    designName: getLandingPageDesignPack(designPackId).name,
    published: Boolean(row.published_revision_id || row.published_at),
    updatedAt: row.updated_at,
    editorPath: `/sites/${encodeURIComponent(site.username)}/pages/${encodeURIComponent(row.id)}`,
    previewPath: `/api/sites/${encodeURIComponent(site.username)}/pages/${encodeURIComponent(row.id)}/preview-html`,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
