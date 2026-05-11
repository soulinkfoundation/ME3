import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Me3UserAgent } from "./user-agent";
import {
  AiSettingsInputError,
  getAiRoutingSummary,
  getAiSettings,
  hasConfiguredAiProvider,
  updateAiSettings,
} from "./ai-providers";
import {
  CORE_PLUGIN_CATALOG_VERSION,
  PluginInstallInputError,
  activateCorePlugin,
  deactivateCorePlugin,
  listCorePluginRecords,
} from "./plugins";
import { getOrCreateInstallEncryptionKey } from "./install-secrets";
import {
  getLandingPageTemplate,
  type LandingPageDocument,
  type LandingPageSection,
  type LandingPageTemplateId,
} from "../../../shared/landing-pages";
import type {
  DbAgentChannelConnection,
  DbAgentChannelEvent,
  DbBooking,
  DbCalendarSource,
  DbCalendarSourceEvent,
  DbContact,
  DbMailboxAlias,
  DbMailboxMessage,
  DbSite,
  DbUserCalendarEvent,
  DbUserReminder,
  Env,
  OwnerProfile,
} from "./types";

export { Me3UserAgent };

type BootstrapBody = Partial<OwnerProfile> & { bootstrapCode?: string; password?: string };
type LoginBody = { email?: string; password?: string };
type BootstrapPasswordResetBody = {
  email?: string;
  bootstrapCode?: string;
  password?: string;
};
type ChatBody = { message?: string };
type AccountUpdateBody = { timezone?: unknown; locale?: unknown };
type MailboxUpdateBody = {
  aliasLocalPart?: unknown;
  forwardingEmail?: unknown;
  forwardingEnabled?: unknown;
};
type LandingPageGenerateBody = {
  username?: string;
  brief?: string;
  templateId?: string;
  heroImage?: string | null;
  sectionImage?: string | null;
  feedback?: string | null;
};
type SessionPayload = { sub: string; iat: number; exp: number };
type OwnerRecord = OwnerProfile & { password_hash: string | null };
type PublishManifest = {
  version: 1;
  sourceFiles: Record<string, string>;
  assetFiles: Record<string, string>;
  updatedAt: string;
};
type SiteFileRecord = {
  site_id: string;
  path: string;
  content: ArrayBuffer;
  content_type: string;
  size: number;
  sha256: string | null;
  updated_at: string;
};
type ContactInput = Partial<{
  name: string;
  email: string | null;
  phone: string | null;
  source: DbContact["source"];
  sourceRef: string | null;
  relationship: DbContact["relationship"];
  closeness: "very_close" | "close" | "acquaintance" | null;
  status: DbContact["status"];
  notes: string | null;
  tags: string[];
  lastInteractionAt: string | null;
  nextFollowupAt: string | null;
  outreachStatus: DbContact["outreach_status"];
  socialHandles: Record<string, string>;
  metadata: Record<string, unknown> | null;
}>;

const SESSION_COOKIE_NAME = "me3_core_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 210_000;
const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;
const MAILBOX_ALIAS_REGEX = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAILBOX_FOLDERS = new Set(["inbox", "drafts", "sent", "archive", "trash"]);
const CONTACT_SOURCES = new Set(["booking", "manual", "agent", "import", "outreach", "soulink"]);
const CONTACT_RELATIONSHIPS = new Set(["client", "prospect", "contact"]);
const CONTACT_STATUSES = new Set(["active", "archived", "dormant"]);
const D1_SITE_FILE_MAX_BYTES = 1_900_000;
const OUTREACH_STATUSES = new Set([
  "new",
  "drafted",
  "sent",
  "replied",
  "booked",
  "converted",
  "not_interested",
  "no_response",
]);
const LANDING_PAGE_TEMPLATES = new Set<LandingPageTemplateId>(["event", "service", "waitlist"]);

const app = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

app.use(
  "*",
  cors({
    origin: (origin, c) => origin || c.env.CORE_WEB_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  if (isPublicSiteHost(c.env, c.req.url)) {
    return servePublicSiteRequest(c.env, c.req.raw);
  }
  await next();
});

app.get("/health", async (c) => {
  return c.json({
    ok: true,
    service: "me3-core",
    environment: c.env.ENVIRONMENT,
    bindings: {
      db: Boolean(c.env.DB),
      userAgent: Boolean(c.env.ME3_USER_AGENT),
      workersAi: Boolean(c.env.AI),
    },
    hosts: {
      admin: c.env.ME3_ADMIN_HOST || new URL(c.env.CORE_WEB_ORIGIN).hostname,
      site: c.env.ME3_SITE_HOST || null,
    },
    setupRequired: await getSetupRequired(c.env),
  });
});

app.get("/api/config", async (c) => {
  const authConfigured = await getOwnerAuthConfigured(c.env);
  const aiRoutes = await getAiRoutingSummary(c.env, "owner");

  return c.json({
    apiOrigin: c.env.CORE_API_ORIGIN,
    webOrigin: c.env.CORE_WEB_ORIGIN,
    adminHost: c.env.ME3_ADMIN_HOST || null,
    siteHost: c.env.ME3_SITE_HOST || null,
    ai: {
      defaultProvider: aiRoutes.default.providerId,
      defaultModel: aiRoutes.default.model,
      chatProvider: aiRoutes.chat.providerId,
      chatModel: aiRoutes.chat.model,
      reasoningProvider: aiRoutes.reasoning.providerId,
      reasoningModel: aiRoutes.reasoning.model,
      extractionProvider: aiRoutes.extraction.providerId,
      extractionModel: aiRoutes.extraction.model,
    },
    setupRequired: await getSetupRequired(c.env),
    ownerAuthConfigured: authConfigured,
  });
});

app.post("/api/admin/bootstrap", async (c) => {
  const body = await c.req.json<BootstrapBody>().catch((): BootstrapBody => ({}));

  if (!c.env.JWT_SECRET || !c.env.ADMIN_BOOTSTRAP_CODE) {
    return c.json({ ok: false, error: "Owner auth is not configured" }, 503);
  }

  if (body.bootstrapCode !== c.env.ADMIN_BOOTSTRAP_CODE) {
    return c.json({ ok: false, error: "Invalid bootstrap code" }, 401);
  }

  const password = body.password?.trim();
  if (!password || password.length < 8) {
    return c.json({ ok: false, error: "Password must be at least 8 characters" }, 400);
  }

  const email = body.email?.trim() || null;
  if (!email) {
    return c.json({ ok: false, error: "Email is required" }, 400);
  }

  const passwordHash = await hashPassword(password);
  const owner: OwnerProfile = {
    id: "owner",
    email,
    name: body.name ?? "ME3 Core Owner",
    username: body.username ?? "owner",
    bio: body.bio ?? "Personal AI assistant powered by ME3 Core.",
    avatar_url: body.avatar_url ?? null,
    timezone: body.timezone ?? "UTC",
  };

  await c.env.DB.prepare(
    `INSERT INTO owner_profile (id, email, name, username, bio, avatar_url, timezone, password_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       username = excluded.username,
       bio = excluded.bio,
       avatar_url = excluded.avatar_url,
       timezone = excluded.timezone,
       password_hash = excluded.password_hash,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(owner.id, owner.email, owner.name, owner.username, owner.bio, owner.avatar_url, owner.timezone, passwordHash)
    .run();

  await getOrCreateInstallEncryptionKey(c.env);
  await setOwnerSession(c, owner.id);

  return c.json({ ok: true, owner });
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<LoginBody>().catch((): LoginBody => ({}));
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password) {
    return c.json({ ok: false, error: "Email and password are required" }, 400);
  }

  const owner = await getOwnerByEmail(c.env, email);
  if (!owner?.password_hash || !(await verifyPassword(password, owner.password_hash))) {
    return c.json({ ok: false, error: "Invalid email or password" }, 401);
  }

  await setOwnerSession(c, owner.id);

  return c.json({ ok: true, owner: toPublicOwner(owner) });
});

app.post("/api/auth/password-reset/bootstrap", async (c) => {
  const body = await c.req
    .json<BootstrapPasswordResetBody>()
    .catch((): BootstrapPasswordResetBody => ({}));
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!c.env.ADMIN_BOOTSTRAP_CODE) {
    return c.json({ ok: false, error: "Owner recovery is not configured" }, 503);
  }

  if (body.bootstrapCode !== c.env.ADMIN_BOOTSTRAP_CODE) {
    return c.json({ ok: false, error: "Invalid bootstrap code" }, 401);
  }

  if (!email) {
    return c.json({ ok: false, error: "Email is required" }, 400);
  }

  if (!password || password.length < 8) {
    return c.json({ ok: false, error: "Password must be at least 8 characters" }, 400);
  }

  const owner = await getOwnerByEmail(c.env, email);
  if (!owner) {
    return c.json({ ok: false, error: "Owner account not found" }, 404);
  }

  await c.env.DB.prepare(
    "UPDATE owner_profile SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  )
    .bind(await hashPassword(password), owner.id)
    .run();

  clearOwnerSession(c);

  return c.json({ ok: true, owner: toPublicOwner(owner) });
});

app.get("/api/auth/me", async (c) => {
  const ownerId = await getSessionOwnerId(c);
  if (!ownerId) {
    return c.json({ ok: false, user: null }, 401);
  }

  const owner = await getOwnerProfile(c.env, ownerId);
  if (!owner) {
    clearOwnerSession(c);
    return c.json({ ok: false, user: null }, 401);
  }

  return c.json({ ok: true, user: toPublicOwner(owner) });
});

app.post("/api/auth/logout", (c) => {
  clearOwnerSession(c);
  return c.json({ ok: true });
});

app.post("/api/assistant/chat", async (c) => {
  const ownerId = await getSessionOwnerId(c);
  if (!ownerId) {
    return c.json({ ok: false, error: "Authentication required" }, 401);
  }

  const body = await c.req.json<ChatBody>().catch((): ChatBody => ({}));
  const message = body.message?.trim();

  if (!message) {
    return c.json({ ok: false, error: "Message is required" }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO assistant_messages (id, owner_id, role, content) VALUES (?, ?, ?, ?)",
  )
    .bind(id, ownerId, "user", message)
    .run();

  return c.json({
    ok: true,
    reply: "ME3 Core assistant shell is booted. Model execution will be wired in the first bootable slice.",
    setupRequired: await getSetupRequired(c.env, ownerId),
  });
});

app.get("/api/account", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const owner = await getOwnerProfile(c.env, ownerId);
  if (!owner) return c.json({ error: "Account not found" }, 404);

  return c.json({ user: serializeAccountOwner(owner) });
});

app.get("/api/plugins", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json({
    catalogVersion: CORE_PLUGIN_CATALOG_VERSION,
    plugins: await listCorePluginRecords(c.env),
  });
});

app.post("/api/plugins/:pluginId/activate", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json({
      plugin: await activateCorePlugin(c.env, c.req.param("pluginId")),
    });
  } catch (error) {
    if (error instanceof PluginInstallInputError) {
      return c.json({ error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.post("/api/plugins/:pluginId/deactivate", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json({
      plugin: await deactivateCorePlugin(c.env, c.req.param("pluginId")),
    });
  } catch (error) {
    if (error instanceof PluginInstallInputError) {
      return c.json({ error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.get("/api/ai-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json(await getAiSettings(c.env, ownerId));
});

app.put("/api/ai-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    return c.json(await updateAiSettings(c.env, ownerId, body));
  } catch (error) {
    if (error instanceof AiSettingsInputError) {
      return c.json({ error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.put("/api/account", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<AccountUpdateBody>().catch((): AccountUpdateBody => ({}));
  if (body.timezone === undefined && body.locale === undefined) {
    return c.json({ error: "timezone or locale is required" }, 400);
  }

  const timezone = body.timezone === undefined ? undefined : normalizeTimeZone(body.timezone);
  if (body.timezone !== undefined && !timezone) {
    return c.json({ error: "Invalid timezone" }, 400);
  }

  const locale = body.locale === undefined ? undefined : normalizeLocale(body.locale);
  if (body.locale !== undefined && body.locale !== null && body.locale !== "" && !locale) {
    return c.json({ error: "Invalid locale" }, 400);
  }

  const updates = ["updated_at = CURRENT_TIMESTAMP"];
  const values: Array<string | null> = [];
  if (timezone !== undefined) {
    updates.push("timezone = ?");
    values.push(timezone);
  }
  if (locale !== undefined) {
    updates.push("locale = ?");
    values.push(locale);
  }

  await c.env.DB.prepare(
    `UPDATE owner_profile
     SET ${updates.join(", ")}
     WHERE id = ?`,
  )
    .bind(...values, ownerId)
    .run();

  const owner = await getOwnerProfile(c.env, ownerId);
  if (!owner) return c.json({ error: "Account not found" }, 404);

  return c.json({ user: serializeAccountOwner(owner) });
});

app.post("/api/account/delete", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  await c.env.DB.prepare("DELETE FROM assistant_messages WHERE owner_id = ?")
    .bind(ownerId)
    .run();
  await c.env.DB.prepare("DELETE FROM owner_profile WHERE id = ?")
    .bind(ownerId)
    .run();
  clearOwnerSession(c);

  return c.json({ ok: true });
});

app.get("/api/sites", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await c.env.DB.prepare(
    `SELECT id, user_id, username, site_type, template_id, custom_domain,
            custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
     FROM sites
     WHERE user_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(ownerId)
    .all<DbSite>();

  return c.json({ sites: result.results || [] });
});

app.get("/api/sites/quota", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const count = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM sites WHERE user_id = ?")
    .bind(ownerId)
    .first<{ count: number | string | null }>();

  return c.json({
    current: Number(count?.count || 0),
    limit: 4,
    tier: "core",
    capabilities: {
      maxSites: 4,
      mailboxAlias: true,
      approvalFirstOutbound: true,
      telegramAgentAccess: true,
    },
    can_create: Number(count?.count || 0) < 4,
  });
});

app.post("/api/sites", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req
    .json<{ username?: string; siteType?: string; templateId?: string | null }>()
    .catch((): { username?: string; siteType?: string; templateId?: string | null } => ({}));
  const username = normalizeUsername(body.username);
  if (!username || !USERNAME_REGEX.test(username)) {
    return c.json({ error: "Username must be 3-30 characters and use letters, numbers, underscores, or hyphens" }, 400);
  }

  const siteType = body.siteType === "landing_page" ? "landing_page" : "profile";
  const id = crypto.randomUUID();

  try {
    await c.env.DB.prepare(
      `INSERT INTO sites (id, user_id, username, site_type, template_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(id, ownerId, username, siteType, body.templateId || null)
      .run();

    const site = await c.env.DB.prepare(
      `SELECT id, user_id, username, site_type, template_id, custom_domain,
              custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
       FROM sites WHERE id = ?`,
    )
      .bind(id)
      .first<DbSite>();

    return c.json({ site }, 201);
  } catch (error) {
    console.error("Create site error:", error);
    return c.json({ error: "Username is already in use" }, 409);
  }
});

app.get("/api/sites/:username/publish-manifest", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  try {
    return c.json({
      manifest: (await loadPublishManifest(c.env, site.id)) || createEmptyPublishManifest(),
    });
  } catch (error) {
    if (isMissingSiteFilesTableError(error)) return siteStorageSetupRequired(c);
    throw error;
  }
});

app.get("/api/sites/:username/storage", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  return c.json(await getSiteStorageStatus(c.env, site));
});

app.post("/api/sites/:username/storage/migrate-media", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);
  if (!c.env.SITE_ASSETS) {
    return c.json({ error: "SITE_ASSETS R2 binding is not configured" }, 400);
  }

  const mediaFiles = await listSiteFiles(c.env, site.id, "public/files/");
  const favicon = await getSiteFile(c.env, site.id, "public/favicon.png");
  const files = favicon ? [favicon, ...mediaFiles] : mediaFiles;
  let migrated = 0;

  for (const file of files) {
    await putR2SiteFile(c.env, site, file.path, file.content, file.content_type);
    await deleteSiteFile(c.env, site.id, file.path);
    migrated += 1;
  }

  return c.json({
    ok: true,
    migrated,
    storage: await getSiteStorageStatus(c.env, site),
  });
});

app.get("/api/domains/:username", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  return c.json(buildCoreDomainStatus(c.env, site));
});

app.post("/api/domains/:username", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const body = await c.req.json<{ domain?: unknown }>().catch((): { domain?: unknown } => ({}));
  const domain = normalizeDomain(body.domain);
  if (!domain || !domain.startsWith("www.")) {
    return c.json({ error: "Use a www subdomain, for example www.yourdomain.com." }, 400);
  }

  const status = getCoreDomainState(c.env, site, domain);
  await c.env.DB.prepare(
    `UPDATE sites
     SET custom_domain = ?,
         custom_domain_status = ?,
         custom_domain_cf_id = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(domain, status, site.id)
    .run();

  return c.json({
    ok: true,
    domain,
    status,
    instructions: getCoreDomainInstructions(c.env, domain, site.username),
  });
});

app.post("/api/domains/:username/refresh", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);
  if (!site.custom_domain) return c.json(buildCoreDomainStatus(c.env, site));

  const status = getCoreDomainState(c.env, site, site.custom_domain);
  await c.env.DB.prepare(
    "UPDATE sites SET custom_domain_status = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(status, site.id)
    .run();

  return c.json(buildCoreDomainStatus(c.env, { ...site, custom_domain_status: status }));
});

app.delete("/api/domains/:username", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  await c.env.DB.prepare(
    `UPDATE sites
     SET custom_domain = NULL,
         custom_domain_status = NULL,
         custom_domain_cf_id = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(site.id)
    .run();

  return c.json({ ok: true });
});

app.post("/api/sites/:username/upload", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  try {
    const form = await c.req.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) return c.json({ error: "No files uploaded" }, 400);

    const manifest = (await loadPublishManifest(c.env, site.id)) || createEmptyPublishManifest();
    const textFiles = new Map<string, string>();

    for (const file of files) {
      if (isSiteMediaFile(file.name, file.type)) {
        const buffer = await file.arrayBuffer();
        const relativePath = normalizeSiteMediaPath(file.name);
        await putSiteMediaFile(c.env, site, `public/${relativePath}`, buffer, file.type || getContentType(file.name));
        manifest.assetFiles[relativePath] = await sha256Buffer(buffer);
        continue;
      }

      const content = await file.text();
      const contentType = file.type || getContentType(file.name);
      const sourcePath = `src/${normalizeSiteFileName(file.name)}`;
      await putSiteFile(c.env, site.id, sourcePath, content, contentType);
      manifest.sourceFiles[file.name] = await sha256Text(content);
      textFiles.set(file.name, content);
    }

    const meJson = textFiles.get("me.json") || (await getSiteFileText(c.env, site.id, "src/me.json"));
    if (meJson) {
      await putSiteFile(c.env, site.id, "public/me.json", meJson, "application/json");
      await putSiteFile(c.env, site.id, "public/index.html", renderProfileSiteHtml(meJson, site.username), "text/html");
    }

    for (const [name, content] of textFiles) {
      if (name === "me.json") continue;
      const publicName = name.replace(/\.md$/i, ".html");
      await putSiteFile(c.env, site.id, `public/${normalizeSiteFileName(publicName)}`, renderMarkdownPageHtml(name, content), "text/html");
    }

    manifest.updatedAt = new Date().toISOString();
    await savePublishManifest(c.env, site.id, manifest);
    await c.env.DB.prepare(
      "UPDATE sites SET published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    )
      .bind(site.id)
      .run();

    return c.json({ ok: true, publishedAt: new Date().toISOString() });
  } catch (error) {
    if (isMissingSiteFilesTableError(error)) return siteStorageSetupRequired(c);
    throw error;
  }
});

app.post("/api/sites/:username/upload-image", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  try {
    const form = await c.req.formData();
    const file = form.get("file");
    const type = String(form.get("type") || "image").replace(/[^a-z0-9_-]/gi, "");
    if (!(file instanceof File)) return c.json({ error: "Image file is required" }, 400);
    if (!file.type.startsWith("image/")) return c.json({ error: "Only image uploads are supported" }, 400);

    const ext = imageExtension(file);
    const testimonialIndex = String(form.get("index") || "").replace(/[^0-9]/g, "");
    const baseName = type === "testimonial" && testimonialIndex ? `testimonial-${testimonialIndex}` : type;
    const filename = `${baseName}.${ext}`;
    const relativePath = type === "favicon" ? "favicon.png" : `files/${filename}`;
    const path = `public/${relativePath}`;
    const buffer = await file.arrayBuffer();
    const storage = await putSiteMediaFile(c.env, site, path, buffer, file.type);

    const manifest = (await loadPublishManifest(c.env, site.id)) || createEmptyPublishManifest();
    manifest.assetFiles[relativePath] = await sha256Buffer(buffer);
    manifest.updatedAt = new Date().toISOString();
    await savePublishManifest(c.env, site.id, manifest);

    return c.json({
      ok: true,
      path: relativePath,
      url: relativePath,
      type,
      storage,
    });
  } catch (error) {
    if (isMissingSiteFilesTableError(error)) return siteStorageSetupRequired(c);
    throw error;
  }
});

app.post("/api/sites/:username/upload-page-image", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  try {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "Image file is required" }, 400);
    if (!file.type.startsWith("image/")) return c.json({ error: "Only image uploads are supported" }, 400);

    const pageSlug = String(form.get("pageSlug") || "page").replace(/[^a-z0-9_-]/gi, "");
    const imageIndex = String(form.get("imageIndex") || "1").replace(/[^0-9]/g, "") || "1";
    const ext = imageExtension(file);
    const filename = `${pageSlug}-${imageIndex}.${ext}`;
    const buffer = await file.arrayBuffer();
    const storage = await putSiteMediaFile(c.env, site, `public/files/${filename}`, buffer, file.type);

    const manifest = (await loadPublishManifest(c.env, site.id)) || createEmptyPublishManifest();
    manifest.assetFiles[`files/${filename}`] = await sha256Buffer(buffer);
    manifest.updatedAt = new Date().toISOString();
    await savePublishManifest(c.env, site.id, manifest);

    return c.json({
      ok: true,
      path: `files/${filename}`,
      url: `files/${filename}`,
      storage,
    });
  } catch (error) {
    if (isMissingSiteFilesTableError(error)) return siteStorageSetupRequired(c);
    throw error;
  }
});

app.get("/api/sites/:username/content", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const meJson = await getSiteFileText(c.env, site.id, "src/me.json");
  if (!meJson) {
    return c.json({
      ok: true,
      profile: null,
      pages: [],
      posts: [],
      products: [],
    });
  }

  const sourceFiles = await listSiteFiles(c.env, site.id, "src/");
  const pages: Array<{ slug: string; title: string; content: string }> = [];
  const posts: Array<{ slug: string; title: string; content: string }> = [];
  const products: Array<{ slug: string; title: string; content: string }> = [];

  for (const file of sourceFiles) {
    if (!file.path.endsWith(".md")) continue;
    const slug = file.path.slice("src/".length, -".md".length);
    const item = {
      slug: slug.split("/").pop() || slug,
      title: titleFromSlug(slug),
      content: await arrayBufferToText(file.content),
    };
    if (slug.startsWith("blog/")) posts.push(item);
    else if (slug.startsWith("shop/")) products.push(item);
    else pages.push(item);
  }

  return c.json({
    ok: true,
    profile: JSON.parse(meJson),
    pages,
    posts,
    products,
  });
});

app.get("/api/sites/:username/preview-html", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const html =
    (await getSiteFileText(c.env, site.id, "landing/index.html")) ||
    (await getSiteFileText(c.env, site.id, "public/index.html"));
  if (!html) return c.body(null, 204);

  return c.html(injectBaseHref(html, `/preview/${site.username}/`));
});

app.get("/api/sites/:username/landing-page", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const page = await loadLandingPage(c.env, site.id);
  const owner = await getOwnerProfile(c.env, ownerId);
  return c.json({
    site: {
      id: site.id,
      username: site.username,
      templateId: normalizeLandingTemplate(site.template_id),
      publishedAt: site.published_at,
    },
    profile: {
      name: owner?.name || site.username,
      bio: owner?.bio || null,
      avatar: owner?.avatar_url || null,
    },
    page,
  });
});

app.put("/api/sites/:username/landing-page", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const body = await c.req.json<{ page?: unknown }>().catch((): { page?: unknown } => ({}));
  const page = normalizeLandingPageDocument(body.page);
  if (!page) return c.json({ error: "Valid landing page is required" }, 400);

  await saveLandingPage(c.env, site, page);
  return c.json({ ok: true, page });
});

app.post("/api/agent/landing-pages/generate", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body: LandingPageGenerateBody = await c.req
    .json<LandingPageGenerateBody>()
    .catch((): LandingPageGenerateBody => ({}));
  const username = normalizeUsername(body.username);
  const site = await getSiteForOwner(c.env, ownerId, username);
  if (!site) return c.json({ error: "Site not found" }, 404);

  const brief = body.brief?.trim();
  if (!brief) return c.json({ error: "Brief is required" }, 400);

  const owner = await getOwnerProfile(c.env, ownerId);
  const page = buildLandingPageDocument({
    username: site.username,
    brief,
    template: normalizeLandingTemplate(body.templateId) || "service",
    heroImage: body.heroImage || null,
    sectionImage: body.sectionImage || null,
    feedback: body.feedback || null,
    profile: {
      name: owner?.name || site.username,
      bio: owner?.bio || null,
      avatar: owner?.avatar_url || null,
      profileUrl: `${c.env.CORE_WEB_ORIGIN}/sites/${site.username}`,
    },
  });

  await saveLandingPage(c.env, site, page);
  return c.json({
    ok: true,
    jobId: crypto.randomUUID(),
    jobType: "landing_page_builder",
    page,
  });
});

app.post("/api/sites/:username/publish", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);
  const html =
    (await getSiteFileText(c.env, site.id, "landing/index.html")) ||
    (await getSiteFileText(c.env, site.id, "public/index.html"));
  if (!html) return c.json({ error: "Generate or upload the site before publishing." }, 400);

  await c.env.DB.prepare(
    "UPDATE sites SET published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
  )
    .bind(site.id)
    .run();
  return c.json({ ok: true, publishedAt: new Date().toISOString() });
});

app.post("/api/sites/:username/unpublish", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);
  await c.env.DB.prepare(
    "UPDATE sites SET published_at = NULL, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(site.id)
    .run();
  return c.json({ ok: true });
});

app.delete("/api/sites/:username", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await c.env.DB.prepare(
    "DELETE FROM sites WHERE user_id = ? AND username = ?",
  )
    .bind(ownerId, c.req.param("username").toLowerCase())
    .run();

  if ((result.meta?.changes || 0) === 0) {
    return c.json({ error: "Site not found" }, 404);
  }

  return c.json({ ok: true });
});

app.get("/api/calendar/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  return c.json({ connected: false });
});

app.get("/api/calendar/feed", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const window = parseCalendarWindow(c.req.query("start"), c.req.query("end"));
  if ("error" in window) return c.json({ error: window.error }, 400);

  const [bookings, reminders, events, recurringEvents, sources, importedEvents] = await Promise.all([
    c.env.DB.prepare(
      `SELECT b.*, s.username
       FROM bookings b
       JOIN sites s ON b.site_id = s.id
       WHERE s.user_id = ? AND b.status = 'confirmed'
         AND b.ends_at > ? AND b.starts_at < ?
       ORDER BY b.starts_at ASC`,
    )
      .bind(ownerId, window.start, window.end)
      .all<DbBooking & { username: string }>(),
    c.env.DB.prepare(
      `SELECT id, user_id, title, notes, remind_at, timezone, recurrence_rule,
              context_type, context_id, context_label, status, delivered_at,
              dismissed_at, created_at
       FROM user_reminders
       WHERE user_id = ? AND status IN ('pending', 'failed')
         AND remind_at >= ? AND remind_at < ?
       ORDER BY remind_at ASC`,
    )
      .bind(ownerId, window.start, window.end)
      .all<DbUserReminder>(),
    c.env.DB.prepare(
      `SELECT id, user_id, title, notes, location, starts_at, ends_at, timezone,
              all_day, kind, recurrence_rule, created_at
       FROM user_calendar_events
       WHERE user_id = ? AND recurrence_rule IS NULL
         AND ends_at > ? AND starts_at < ?
       ORDER BY starts_at ASC`,
    )
      .bind(ownerId, window.start, window.end)
      .all<DbUserCalendarEvent>(),
    c.env.DB.prepare(
      `SELECT id, user_id, title, notes, location, starts_at, ends_at, timezone,
              all_day, kind, recurrence_rule, created_at
       FROM user_calendar_events
       WHERE user_id = ? AND recurrence_rule = 'yearly'
       ORDER BY starts_at ASC`,
    )
      .bind(ownerId)
      .all<DbUserCalendarEvent>(),
    c.env.DB.prepare(
      `SELECT id, user_id, kind, name, original_filename, imported_event_count, created_at
       FROM calendar_sources
       WHERE user_id = ? AND status = 'active'
       ORDER BY name ASC`,
    )
      .bind(ownerId)
      .all<DbCalendarSource>(),
    c.env.DB.prepare(
      `SELECT cse.id, cse.source_id, cse.external_key, cse.external_uid, cse.title,
              cse.notes, cse.location, cse.starts_at, cse.ends_at, cse.timezone,
              cse.all_day, cse.created_at, cs.name AS source_name
       FROM calendar_source_events cse
       JOIN calendar_sources cs ON cs.id = cse.source_id
       WHERE cs.user_id = ? AND cs.status = 'active'
         AND cse.ends_at > ? AND cse.starts_at < ?
       ORDER BY cse.starts_at ASC`,
    )
      .bind(ownerId, window.start, window.end)
      .all<DbCalendarSourceEvent & { source_name: string }>(),
  ]);

  return c.json({
    bookings: bookings.results || [],
    reminders: (reminders.results || []).map(serializeReminder),
    events: [
      ...(events.results || []),
      ...expandYearlyCalendarEvents(recurringEvents.results || [], window.start, window.end),
    ]
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .map(serializeCalendarEvent),
    sources: (sources.results || []).map(serializeCalendarSource),
    importedEvents: (importedEvents.results || []).map(serializeImportedCalendarEvent),
  });
});

app.get("/api/mailbox", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const owner = await getOwnerProfile(c.env, ownerId);
  const mailbox = await getMailboxRow(c.env, ownerId);
  const suggestedAliasLocalPart = mailbox?.alias_local_part || suggestMailboxAlias(owner?.username || owner?.email || "owner");

  return c.json({
    tier: "core",
    available: true,
    approvalRequired: true,
    cloudflareManaged: false,
    suggestedAliasLocalPart,
    mailbox: mailbox ? serializeMailbox(mailbox) : null,
    sources: mailbox ? [serializeMailboxDefaultSource(mailbox)] : [],
    recentActivity: mailbox ? await getMailboxActivity(c.env, mailbox.id, 25, 0) : [],
  });
});

app.put("/api/mailbox", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<MailboxUpdateBody>().catch((): MailboxUpdateBody => ({}));
  const owner = await getOwnerProfile(c.env, ownerId);
  const existing = await getMailboxRow(c.env, ownerId);
  const aliasLocalPart = normalizeMailboxAlias(
    typeof body.aliasLocalPart === "string" ? body.aliasLocalPart : "",
  );
  const forwardingEnabled = body.forwardingEnabled === true;
  const forwardingEmail =
    typeof body.forwardingEmail === "string" ? body.forwardingEmail.trim() : "";

  if (!aliasLocalPart || !MAILBOX_ALIAS_REGEX.test(aliasLocalPart)) {
    return c.json(
      {
        error:
          "Mailbox alias must start and end with a letter or number and may contain dots, underscores, or hyphens.",
      },
      400,
    );
  }

  if (forwardingEnabled && !isValidEmail(forwardingEmail)) {
    return c.json({ error: "Enter a valid forwarding email address." }, 400);
  }

  const savedForwardingEmail =
    forwardingEnabled ? forwardingEmail : existing?.forwarding_email || owner?.email || "";
  const forwardingStatus =
    forwardingEnabled && savedForwardingEmail !== existing?.forwarding_email
      ? "pending"
      : existing?.forwarding_status || "pending";
  const forwardingMode = forwardingEnabled ? "forward" : "me3_only";
  const now = new Date().toISOString();

  try {
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE mailbox_aliases
         SET alias_local_part = ?,
             forwarding_email = ?,
             forwarding_status = ?,
             forwarding_enabled = ?,
             forwarding_mode = ?,
             updated_at = ?
         WHERE user_id = ?`,
      )
        .bind(
          aliasLocalPart,
          savedForwardingEmail,
          forwardingStatus,
          forwardingEnabled ? 1 : 0,
          forwardingMode,
          now,
          ownerId,
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO mailbox_aliases (
           id, user_id, alias_local_part, forwarding_email, forwarding_status,
           forwarding_enabled, forwarding_mode, status, approval_policy,
           daily_inbound_limit, daily_outbound_limit, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_setup', 'all', 25, 25, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          ownerId,
          aliasLocalPart,
          savedForwardingEmail,
          forwardingStatus,
          forwardingEnabled ? 1 : 0,
          forwardingMode,
          now,
          now,
        )
        .run();
    }
  } catch {
    return c.json({ error: "Mailbox alias is already in use." }, 409);
  }

  const mailbox = await getMailboxRow(c.env, ownerId);
  return c.json({
    mailbox: mailbox ? serializeMailbox(mailbox) : null,
    sources: mailbox ? [serializeMailboxDefaultSource(mailbox)] : [],
  });
});

app.post("/api/mailbox/activate", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const mailbox = await getMailboxRow(c.env, ownerId);
  if (!mailbox) return c.json({ error: "Mailbox not found" }, 404);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE mailbox_aliases
     SET status = 'active',
         activated_at = COALESCE(activated_at, ?),
         updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(now, now, ownerId)
    .run();

  const updated = await getMailboxRow(c.env, ownerId);
  return c.json({ mailbox: updated ? serializeMailbox(updated) : null });
});

app.post("/api/mailbox/pause", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const mailbox = await getMailboxRow(c.env, ownerId);
  if (!mailbox) return c.json({ error: "Mailbox not found" }, 404);

  await c.env.DB.prepare(
    `UPDATE mailbox_aliases
     SET status = 'paused',
         updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(new Date().toISOString(), ownerId)
    .run();

  const updated = await getMailboxRow(c.env, ownerId);
  return c.json({ mailbox: updated ? serializeMailbox(updated) : null });
});

app.get("/api/mailbox/messages", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const mailbox = await getMailboxRow(c.env, ownerId);
  const limit = clampNumber(c.req.query("limit"), 50, 0, 100);
  const offset = clampNumber(c.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  if (!mailbox) return c.json({ messages: [], total: 0, limit, offset });

  const { where, bindings } = buildMailboxMessageFilters(mailbox.id, {
    status: c.req.query("status") || "",
    createdBy: c.req.query("created_by") || "",
    direction: c.req.query("direction") || "outbound",
    folder: c.req.query("folder") || "",
    query: c.req.query("q") || "",
    unread: c.req.query("unread") || "",
  });

  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM mailbox_messages WHERE ${where}`)
    .bind(...bindings)
    .first<{ count: number | string | null }>();
  const total = Number(count?.count || 0);

  if (limit === 0) return c.json({ messages: [], total, limit, offset });

  const rows = await c.env.DB.prepare(
    `${mailboxMessageSelectSql()} WHERE ${where}
     ORDER BY COALESCE(sent_at, received_at, approved_at, created_at) DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, limit, offset)
    .all<DbMailboxMessage>();

  return c.json({
    messages: (rows.results || []).map(serializeMailboxMessage),
    total,
    limit,
    offset,
  });
});

app.post("/api/mailbox/messages/:messageId/read", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const mailbox = await getMailboxRow(c.env, ownerId);
  if (!mailbox) return c.json({ error: "Mailbox not found" }, 404);

  const body = await c.req.json<{ read?: boolean }>().catch(() => ({ read: true }));
  const result = await c.env.DB.prepare(
    `UPDATE mailbox_messages
     SET read_at = CASE WHEN ? THEN COALESCE(read_at, CURRENT_TIMESTAMP) ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(body.read !== false, c.req.param("messageId"), mailbox.id)
    .run();

  if ((result.meta?.changes || 0) === 0) return c.json({ error: "Message not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/mailbox/messages/:messageId/move", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const mailbox = await getMailboxRow(c.env, ownerId);
  if (!mailbox) return c.json({ error: "Mailbox not found" }, 404);

  const body = await c.req.json<{ folder?: string }>().catch((): { folder?: string } => ({}));
  const folder = normalizeFolder(body.folder);
  if (!folder) return c.json({ error: "Invalid folder" }, 400);

  const result = await c.env.DB.prepare(
    `UPDATE mailbox_messages
     SET folder = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(folder, c.req.param("messageId"), mailbox.id)
    .run();

  if ((result.meta?.changes || 0) === 0) return c.json({ error: "Message not found" }, 404);
  return c.json({ ok: true, id: c.req.param("messageId"), folder });
});

app.delete("/api/mailbox/messages/:messageId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const mailbox = await getMailboxRow(c.env, ownerId);
  if (!mailbox) return c.json({ error: "Mailbox not found" }, 404);

  const result = await c.env.DB.prepare(
    `UPDATE mailbox_messages
     SET folder = 'trash', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(c.req.param("messageId"), mailbox.id)
    .run();

  if ((result.meta?.changes || 0) === 0) return c.json({ error: "Message not found" }, 404);
  return c.json({ ok: true });
});

app.get("/api/telegram/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const botUsername = c.env.TELEGRAM_BOT_USERNAME?.trim() || null;
  const connection = await getTelegramConnection(c.env, ownerId);
  const events = connection
    ? await c.env.DB.prepare(
        `SELECT id, connection_id, channel, direction, event_type, status,
                telegram_message_id, reply_to_message_id, telegram_user_id,
                telegram_chat_id, telegram_username, text_body, raw_json,
                error_message, created_at, updated_at
         FROM agent_channel_events
         WHERE connection_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
      )
        .bind(connection.id)
        .all<DbAgentChannelEvent>()
    : { results: [] };

  return c.json({
    available: true,
    configured: Boolean(botUsername),
    botUsername,
    startUrl:
      connection?.status === "pending" && botUsername
        ? `https://t.me/${botUsername.replace(/^@/, "")}?start=${encodeURIComponent(connection.setup_token)}`
        : null,
    connection: connection ? serializeTelegramConnection(connection, botUsername) : null,
    recentEvents: (events.results || []).map(serializeTelegramEvent),
  });
});

app.post("/api/telegram/setup", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const botUsername = c.env.TELEGRAM_BOT_USERNAME?.trim() || null;
  if (!botUsername) {
    return c.json({ error: "Telegram bot username is not configured" }, 503);
  }

  const connection = await upsertPendingTelegramConnection(c.env, ownerId);
  return c.json({
    ok: true,
    available: true,
    configured: true,
    botUsername,
    startUrl: `https://t.me/${botUsername.replace(/^@/, "")}?start=${encodeURIComponent(connection.setup_token)}`,
    connection: serializeTelegramConnection(connection, botUsername),
  });
});

app.post("/api/telegram/disconnect", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const existing = await getTelegramConnection(c.env, ownerId);
  if (!existing) {
    return c.json({ ok: true, disconnected: false });
  }

  await c.env.DB.prepare(
    `UPDATE agent_channel_connections
     SET status = 'disconnected',
         telegram_user_id = NULL,
         telegram_chat_id = NULL,
         telegram_username = NULL,
         telegram_first_name = NULL,
         telegram_last_name = NULL,
         disconnected_at = datetime('now'),
         updated_at = datetime('now')
     WHERE user_id = ? AND channel = 'telegram'`,
  )
    .bind(ownerId)
    .run();

  const botUsername = c.env.TELEGRAM_BOT_USERNAME?.trim() || null;
  const connection = await getTelegramConnection(c.env, ownerId);
  return c.json({
    ok: true,
    disconnected: true,
    available: true,
    configured: Boolean(botUsername),
    botUsername,
    startUrl: null,
    connection: connection ? serializeTelegramConnection(connection, botUsername) : null,
  });
});

app.get("/api/contacts", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  return c.json(await listContacts(c.env, ownerId));
});

app.post("/api/contacts", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const input = parseContactInput(await c.req.json().catch(() => null));
  if (!input.name?.trim()) return c.json({ error: "Contact name is required" }, 400);

  const contact = await insertContact(c.env, ownerId, input);
  return c.json({ ok: true, contact }, 201);
});

app.put("/api/contacts/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const input = parseContactInput(await c.req.json().catch(() => null));
  const contact = await updateContact(c.env, ownerId, c.req.param("id"), input);
  if (!contact) return c.json({ error: "Contact not found" }, 404);
  return c.json({ ok: true, contact });
});

app.delete("/api/contacts/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await c.env.DB.prepare("DELETE FROM contacts WHERE user_id = ? AND id = ?")
    .bind(ownerId, c.req.param("id"))
    .run();
  if ((result.meta?.changes || 0) === 0) return c.json({ error: "Contact not found" }, 404);
  return c.json({ ok: true });
});

app.put("/api/contacts/:id/outreach-status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req
    .json<{ outreachStatus?: string | null; nextFollowupAt?: string | null }>()
    .catch((): { outreachStatus?: string | null; nextFollowupAt?: string | null } => ({}));
  const outreachStatus = normalizeOutreachStatus(body.outreachStatus);
  const result = await c.env.DB.prepare(
    `UPDATE contacts
     SET outreach_status = ?, next_followup_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
  )
    .bind(outreachStatus, normalizeNullableText(body.nextFollowupAt), ownerId, c.req.param("id"))
    .run();
  if ((result.meta?.changes || 0) === 0) return c.json({ error: "Contact not found" }, 404);

  const contact = await getContact(c.env, ownerId, c.req.param("id"));
  return c.json({ ok: true, contact });
});

app.post("/api/contacts/:id/convert", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await c.env.DB.prepare(
    `UPDATE contacts
     SET relationship = 'client', outreach_status = 'converted', updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
  )
    .bind(ownerId, c.req.param("id"))
    .run();
  if ((result.meta?.changes || 0) === 0) return c.json({ error: "Contact not found" }, 404);

  const contact = await getContact(c.env, ownerId, c.req.param("id"));
  return c.json({ ok: true, contact });
});

app.get("/preview/:username/*", async (c) => {
  const username = normalizeUsername(c.req.param("username"));
  const site = await getSiteByUsername(c.env, username);
  if (!site) return c.html(renderNotFoundPage("Site not found"), 404);

  const requestedPath = c.req.path.replace(`/preview/${username}/`, "") || "index.html";
  return serveSiteFileResponse(c.env, site, requestedPath, false);
});

app.notFound((c) => {
  if (isPublicSiteHost(c.env, c.req.url)) {
    return servePublicSiteRequest(c.env, c.req.raw);
  }
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("Not found", 404);
});

app.get("/.well-known/me.json", async (c) => {
  const owner = await getOwnerProfile(c.env, "owner");

  return c.json({
    id: c.env.CORE_API_ORIGIN,
    type: "Person",
    name: owner?.name ?? "ME3 Core Owner",
    username: owner?.username ?? "owner",
    bio: owner?.bio ?? "Personal AI assistant powered by ME3 Core.",
    url: c.env.CORE_WEB_ORIGIN,
    intents: {
      chat: `${c.env.CORE_API_ORIGIN}/api/assistant/chat`,
    },
  });
});

function createEmptyPublishManifest(): PublishManifest {
  return {
    version: 1,
    sourceFiles: {},
    assetFiles: {},
    updatedAt: "",
  };
}

function normalizeHost(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/:\d+$/, "");
}

function normalizeDomain(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  return normalizeHost(withoutProtocol.split("/")[0]);
}

function hostnameFromUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return normalizeHost(value);
  }
}

function isPublicSiteHost(env: Env, requestUrl: string): boolean {
  const siteHost = normalizeHost(env.ME3_SITE_HOST);
  if (!siteHost) return false;
  const requestHost = hostnameFromUrl(requestUrl);
  const adminHost = normalizeHost(env.ME3_ADMIN_HOST) || hostnameFromUrl(env.CORE_WEB_ORIGIN);
  return requestHost === siteHost && requestHost !== adminHost;
}

function getCoreDomainState(
  env: Env,
  site: Pick<DbSite, "username">,
  domain: string | null,
): "pending" | "active" | "failed" {
  const normalizedDomain = normalizeHost(domain);
  const siteHost = normalizeHost(env.ME3_SITE_HOST);
  if (!normalizedDomain) return "pending";
  if (!siteHost) return "pending";
  if (normalizedDomain !== siteHost) return "pending";

  const configuredUsername = normalizeUsername(env.ME3_SITE_USERNAME);
  if (configuredUsername && configuredUsername !== site.username) return "pending";

  return "active";
}

function buildCoreDomainStatus(env: Env, site: DbSite) {
  const domain = normalizeHost(site.custom_domain) || normalizeHost(env.ME3_SITE_HOST);
  const status = domain
    ? getCoreDomainState(env, site, domain)
    : undefined;

  return {
    connected: Boolean(domain),
    domain: domain || undefined,
    status,
    ssl_status: status === "active" ? "active" : undefined,
    expected_host: env.ME3_SITE_HOST || null,
    admin_host: env.ME3_ADMIN_HOST || hostnameFromUrl(env.CORE_WEB_ORIGIN) || null,
    verification_records: getCoreDomainRecords(env, domain),
    registrar_guides: getRegistrarGuides(),
    url: status === "active" && domain ? `https://${domain}` : undefined,
    instructions: domain
      ? getCoreDomainInstructions(env, domain, site.username)
      : [
          "Enter the www domain visitors should use for this ME3 site.",
          "Set ME3_SITE_HOST to the same hostname in this Worker deployment.",
          "Attach that hostname to the Worker as a Cloudflare custom domain.",
        ],
  };
}

function getCoreDomainRecords(env: Env, domain: string | null | undefined) {
  const normalizedDomain = normalizeHost(domain);
  if (!normalizedDomain) return [];
  const adminHost = normalizeHost(env.ME3_ADMIN_HOST) || hostnameFromUrl(env.CORE_WEB_ORIGIN);
  if (!adminHost) return [];
  return [
    {
      type: "cname" as const,
      name: normalizedDomain,
      value: adminHost,
    },
  ];
}

function getCoreDomainInstructions(env: Env, domain: string, username: string): string[] {
  const siteHost = normalizeHost(env.ME3_SITE_HOST);
  const configuredUsername = normalizeUsername(env.ME3_SITE_USERNAME);
  const instructions = [
    `In Cloudflare, attach ${domain} to this same me3 Worker as a custom domain.`,
    `Set ME3_SITE_HOST=${domain} in the Worker variables, then redeploy.`,
  ];

  if (configuredUsername && configuredUsername !== username) {
    instructions.push(`Set ME3_SITE_USERNAME=${username}, or clear ME3_SITE_USERNAME so the first profile site is served.`);
  } else if (!configuredUsername) {
    instructions.push("Optional: set ME3_SITE_USERNAME if this Worker will host more than one site record.");
  }

  if (siteHost && siteHost !== domain) {
    instructions.unshift(`Current ME3_SITE_HOST is ${siteHost}, so this domain will stay pending until the variable matches.`);
  }

  instructions.push("If you want the apex domain too, redirect it to this www domain in Cloudflare.");
  return instructions;
}

function getRegistrarGuides() {
  return [
    {
      name: "Cloudflare custom domains",
      url: "https://developers.cloudflare.com/workers/configuration/routing/custom-domains/",
      icon: "cloudflare",
    },
    {
      name: "Cloudflare redirects",
      url: "https://developers.cloudflare.com/rules/url-forwarding/",
      icon: "cloudflare",
    },
  ];
}

async function servePublicSiteRequest(env: Env, request: Request): Promise<Response> {
  const site = await getPublicSiteForHost(env, new URL(request.url).hostname);
  if (!site) return new Response(renderNotFoundPage("Site not configured"), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

  const requestedPath = new URL(request.url).pathname.replace(/^\/+/, "") || "index.html";
  return serveSiteFileResponse(env, site, requestedPath, true);
}

async function getPublicSiteForHost(env: Env, rawHost: string): Promise<DbSite | null> {
  const configuredUsername = normalizeUsername(env.ME3_SITE_USERNAME);
  if (configuredUsername) {
    const site = await getSiteByUsername(env, configuredUsername);
    if (site) return site;
  }

  const host = normalizeHost(rawHost);
  const customDomainSite = await env.DB.prepare(
    `SELECT id, user_id, username, site_type, template_id, custom_domain,
            custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
     FROM sites
     WHERE lower(custom_domain) = ?
     ORDER BY created_at ASC
     LIMIT 1`,
  )
    .bind(host)
    .first<DbSite>();
  if (customDomainSite) return customDomainSite;

  return (
    (await env.DB.prepare(
      `SELECT id, user_id, username, site_type, template_id, custom_domain,
              custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
       FROM sites
       WHERE COALESCE(site_type, 'profile') = 'profile'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
      .first<DbSite>()) || null
  );
}

async function serveSiteFileResponse(
  env: Env,
  site: DbSite,
  rawPath: string,
  requirePublished: boolean,
): Promise<Response> {
  if (requirePublished && !site.published_at) {
    return new Response(renderNotFoundPage("Site not published"), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const requestedPath = normalizeSiteFileName(rawPath) || "index.html";
  const publicPath = `public/${requestedPath.endsWith("/") ? `${requestedPath}index.html` : requestedPath}`;
  const isMediaPath = publicPath.startsWith("public/files/") || publicPath === "public/favicon.png";
  const r2File = isMediaPath ? await getR2SiteFile(env, site, publicPath) : null;
  const file =
    r2File ||
    (await getSiteFile(env, site.id, publicPath)) ||
    (requestedPath === "index.html" ? await getSiteFile(env, site.id, "landing/index.html") : null);
  if (!file) {
    return new Response(renderNotFoundPage("Page not found"), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(file.content, {
    headers: {
      "Content-Type": file.content_type,
      "Cache-Control": file.content_type.startsWith("image/")
        ? "public, max-age=31536000, immutable"
        : "no-store",
    },
  });
}

async function getSiteForOwner(env: Env, ownerId: string, rawUsername: string): Promise<DbSite | null> {
  const username = normalizeUsername(rawUsername);
  if (!username) return null;
  return (
    (await env.DB.prepare(
      `SELECT id, user_id, username, site_type, template_id, custom_domain,
              custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
       FROM sites
       WHERE user_id = ? AND username = ?`,
    )
      .bind(ownerId, username)
      .first<DbSite>()) || null
  );
}

async function getSiteByUsername(env: Env, rawUsername: string): Promise<DbSite | null> {
  const username = normalizeUsername(rawUsername);
  if (!username) return null;
  return (
    (await env.DB.prepare(
      `SELECT id, user_id, username, site_type, template_id, custom_domain,
              custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
       FROM sites
       WHERE username = ?`,
    )
      .bind(username)
      .first<DbSite>()) || null
  );
}

function normalizeSiteFileName(name: string): string {
  return name
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

async function putSiteFile(
  env: Env,
  siteId: string,
  path: string,
  content: string | ArrayBuffer,
  contentType: string,
): Promise<void> {
  const buffer =
    typeof content === "string" ? new TextEncoder().encode(content).buffer : content;
  if (buffer.byteLength > D1_SITE_FILE_MAX_BYTES) {
    throw new Error("File is too large for Core D1 storage. Add the SITE_ASSETS R2 binding for larger media.");
  }
  await env.DB.prepare(
    `INSERT INTO site_files (site_id, path, content, content_type, size, sha256, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(site_id, path) DO UPDATE SET
       content = excluded.content,
       content_type = excluded.content_type,
       size = excluded.size,
       sha256 = excluded.sha256,
       updated_at = datetime('now')`,
  )
    .bind(siteId, path, buffer, contentType, buffer.byteLength, await sha256Buffer(buffer))
    .run();
}

async function putSiteMediaFile(
  env: Env,
  site: DbSite,
  path: string,
  content: ArrayBuffer,
  contentType: string,
): Promise<"d1" | "r2"> {
  if (env.SITE_ASSETS) {
    await putR2SiteFile(env, site, path, content, contentType);
    return "r2";
  }
  await putSiteFile(env, site.id, path, content, contentType);
  return "d1";
}

async function putR2SiteFile(
  env: Env,
  site: DbSite,
  path: string,
  content: ArrayBuffer,
  contentType: string,
): Promise<void> {
  if (!env.SITE_ASSETS) {
    throw new Error("SITE_ASSETS R2 binding is not configured");
  }
  await env.SITE_ASSETS.put(getR2SiteFileKey(site, path), content, {
    httpMetadata: { contentType },
  });
}

async function getSiteFile(env: Env, siteId: string, path: string): Promise<SiteFileRecord | null> {
  return (
    (await env.DB.prepare(
      `SELECT site_id, path, content, content_type, size, sha256, updated_at
       FROM site_files
       WHERE site_id = ? AND path = ?`,
    )
      .bind(siteId, path)
      .first<SiteFileRecord>()) || null
  );
}

async function deleteSiteFile(env: Env, siteId: string, path: string): Promise<void> {
  await env.DB.prepare("DELETE FROM site_files WHERE site_id = ? AND path = ?")
    .bind(siteId, path)
    .run();
}

async function getR2SiteFile(env: Env, site: DbSite, path: string): Promise<SiteFileRecord | null> {
  if (!env.SITE_ASSETS) return null;
  const object = await env.SITE_ASSETS.get(getR2SiteFileKey(site, path));
  if (!object) return null;
  const content = await object.arrayBuffer();
  return {
    site_id: site.id,
    path,
    content,
    content_type: object.httpMetadata?.contentType || getContentType(path),
    size: object.size,
    sha256: null,
    updated_at: object.uploaded.toISOString(),
  };
}

function getR2SiteFileKey(site: DbSite, path: string): string {
  return `sites/${site.username}/${normalizeSiteFileName(path)}`;
}

async function getSiteFileText(env: Env, siteId: string, path: string): Promise<string | null> {
  const file = await getSiteFile(env, siteId, path);
  return file ? arrayBufferToText(file.content) : null;
}

async function listSiteFiles(env: Env, siteId: string, prefix: string): Promise<SiteFileRecord[]> {
  const rows = await env.DB.prepare(
    `SELECT site_id, path, content, content_type, size, sha256, updated_at
     FROM site_files
     WHERE site_id = ? AND path LIKE ?
     ORDER BY path ASC`,
  )
    .bind(siteId, `${prefix}%`)
    .all<SiteFileRecord>();
  return rows.results || [];
}

async function getSiteStorageStatus(env: Env, site: DbSite) {
  const d1Stats = await env.DB.prepare(
    `SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes
     FROM site_files
     WHERE site_id = ?`,
  )
    .bind(site.id)
    .first<{ files: number | string | null; bytes: number | string | null }>();
  const d1MediaStats = await env.DB.prepare(
    `SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes
     FROM site_files
     WHERE site_id = ? AND (path LIKE 'public/files/%' OR path = 'public/favicon.png')`,
  )
    .bind(site.id)
    .first<{ files: number | string | null; bytes: number | string | null }>();

  const r2 = await getR2StorageStats(env, site);

  return {
    ok: true,
    activeMediaStorage: env.SITE_ASSETS ? "r2" : "d1",
    d1: {
      files: Number(d1Stats?.files || 0),
      bytes: Number(d1Stats?.bytes || 0),
      mediaFiles: Number(d1MediaStats?.files || 0),
      mediaBytes: Number(d1MediaStats?.bytes || 0),
      maxFileBytes: D1_SITE_FILE_MAX_BYTES,
    },
    r2: {
      available: Boolean(env.SITE_ASSETS),
      binding: "SITE_ASSETS",
      files: r2.files,
      bytes: r2.bytes,
    },
  };
}

async function getR2StorageStats(env: Env, site: DbSite): Promise<{ files: number; bytes: number }> {
  if (!env.SITE_ASSETS) return { files: 0, bytes: 0 };
  let cursor: string | undefined;
  let files = 0;
  let bytes = 0;
  const prefix = `sites/${site.username}/public/`;

  do {
    const listing = await env.SITE_ASSETS.list(cursor ? { prefix, cursor } : { prefix });
    for (const object of listing.objects) {
      files += 1;
      bytes += object.size;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return { files, bytes };
}

async function loadPublishManifest(env: Env, siteId: string): Promise<PublishManifest | null> {
  const text = await getSiteFileText(env, siteId, "publish-manifest.json");
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<PublishManifest>;
    return {
      version: 1,
      sourceFiles: parsed.sourceFiles || {},
      assetFiles: parsed.assetFiles || {},
      updatedAt: parsed.updatedAt || "",
    };
  } catch {
    return null;
  }
}

async function savePublishManifest(env: Env, siteId: string, manifest: PublishManifest): Promise<void> {
  await putSiteFile(env, siteId, "publish-manifest.json", JSON.stringify(manifest, null, 2), "application/json");
}

async function arrayBufferToText(buffer: ArrayBuffer): Promise<string> {
  return new TextDecoder().decode(buffer);
}

async function sha256Text(value: string): Promise<string> {
  return sha256Buffer(new TextEncoder().encode(value).buffer);
}

async function sha256Buffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function imageExtension(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.name.toLowerCase().endsWith(".png")) return "png";
  if (file.name.toLowerCase().endsWith(".webp")) return "webp";
  if (file.name.toLowerCase().endsWith(".gif")) return "gif";
  return "jpg";
}

function isSiteMediaFile(filename: string, contentType: string): boolean {
  const lower = filename.toLowerCase();
  return (
    contentType.startsWith("image/") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".svg")
  );
}

function normalizeSiteMediaPath(filename: string): string {
  const safe = normalizeSiteFileName(filename);
  if (safe === "favicon.png") return safe;
  if (safe.startsWith("files/")) return safe;
  return `files/${safe.split("/").pop() || "asset"}`;
}

function getContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html")) return "text/html";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleFromSlug(slug: string): string {
  const leaf = slug.split("/").pop() || slug;
  return leaf
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function renderProfileSiteHtml(meJsonText: string, username: string): string {
  let profile: Record<string, any> = {};
  try {
    profile = JSON.parse(meJsonText) as Record<string, any>;
  } catch {
    profile = {};
  }
  const name = String(profile.name || profile.profile?.name || username);
  const bio = String(profile.bio || profile.profile?.bio || "A ME3 Core site.");
  const links = profile.links && typeof profile.links === "object" ? profile.links : {};
  const linkHtml = Object.entries(links)
    .filter(([key, value]) => !key.startsWith("_") && typeof value === "string")
    .map(([key, value]) => `<a href="${escapeHtml(String(value))}" rel="noreferrer">${escapeHtml(titleFromSlug(key))}</a>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(name)}</title><meta name="description" content="${escapeHtml(bio)}"><style>${coreSiteCss()}</style></head><body><main class="shell"><section class="hero"><p class="badge">${escapeHtml(username)}.me3.core</p><h1>${escapeHtml(name)}</h1><p>${escapeHtml(bio)}</p><nav>${linkHtml}</nav></section></main></body></html>`;
}

function renderMarkdownPageHtml(filename: string, markdown: string): string {
  const title = titleFromSlug(filename.replace(/\.md$/i, ""));
  const body = markdown
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${coreSiteCss()}</style></head><body><main class="shell"><article class="page"><h1>${escapeHtml(title)}</h1>${body}</article></main></body></html>`;
}

function coreSiteCss(): string {
  return `:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17201d;background:#f7faf8}body{margin:0}.shell{width:min(920px,calc(100vw - 32px));margin:0 auto;padding:48px 0}.hero,.page{border:1px solid rgba(23,32,29,.12);border-radius:18px;background:rgba(255,255,255,.86);padding:32px;box-shadow:0 18px 48px rgba(16,24,20,.08)}.badge{display:inline-flex;margin:0 0 18px;padding:6px 10px;border-radius:999px;background:#d9fbe8;color:#14543a;font-size:13px}h1{font-size:clamp(2.25rem,6vw,4.75rem);line-height:1;margin:0 0 16px}p{color:#496057;font-size:1.05rem;line-height:1.65}nav{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}a{color:#14543a;font-weight:700}@media (prefers-color-scheme:dark){:root{color:#ecf5ef;background:#0f1713}.hero,.page{background:rgba(22,31,26,.9);border-color:rgba(236,245,239,.14)}p{color:#adbbb3}.badge{background:#183c2a;color:#a7f3c4}a{color:#86efac}}`;
}

function renderNotFoundPage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(message)}</title><style>${coreSiteCss()}</style></head><body><main class="shell"><section class="hero"><h1>${escapeHtml(message)}</h1><p>This ME3 Core preview does not have published content for that path yet.</p></section></main></body></html>`;
}

function injectBaseHref(html: string, baseHref: string): string {
  if (/<base\s/i.test(html)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, `<head$1><base href="${escapeHtml(baseHref)}">`);
}

function normalizeLandingTemplate(value: string | null | undefined): LandingPageTemplateId | null {
  return LANDING_PAGE_TEMPLATES.has(value as LandingPageTemplateId)
    ? (value as LandingPageTemplateId)
    : null;
}

function normalizeLandingPageDocument(value: unknown): LandingPageDocument | null {
  if (!value || typeof value !== "object") return null;
  const page = value as Partial<LandingPageDocument>;
  if (
    page.version !== 1 ||
    !normalizeLandingTemplate(page.template) ||
    typeof page.title !== "string" ||
    typeof page.brief !== "string" ||
    !page.hero ||
    !Array.isArray(page.sections)
  ) {
    return null;
  }
  return page as LandingPageDocument;
}

async function loadLandingPage(env: Env, siteId: string): Promise<LandingPageDocument | null> {
  const text = await getSiteFileText(env, siteId, "landing/page.json");
  if (!text) return null;
  try {
    return normalizeLandingPageDocument(JSON.parse(text));
  } catch {
    return null;
  }
}

async function saveLandingPage(env: Env, site: DbSite, page: LandingPageDocument): Promise<void> {
  await putSiteFile(env, site.id, "landing/page.json", JSON.stringify(page, null, 2), "application/json");
  await putSiteFile(env, site.id, "landing/index.html", renderLandingPageHtml(page, site.username), "text/html");
  await env.DB.prepare("UPDATE sites SET template_id = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(page.template, site.id)
    .run();
}

function buildLandingPageDocument(input: {
  username: string;
  brief: string;
  template: LandingPageTemplateId;
  heroImage?: string | null;
  sectionImage?: string | null;
  feedback?: string | null;
  profile: { name: string | null; bio: string | null; avatar: string | null; profileUrl: string | null };
}): LandingPageDocument {
  const template = getLandingPageTemplate(input.template);
  const combined = [input.brief, input.feedback || ""].filter(Boolean).join("\n\n");
  const title = extractLandingTitle(combined, input.template);
  const description = firstSentence(combined) || "A focused landing page built with ME3 Core.";
  const ctaLabel = extractCta(input.feedback) || template.defaultCta;
  const sections: LandingPageSection[] = [
    {
      type: "text",
      heading: input.template === "event" ? "Why This Matters" : input.template === "waitlist" ? "What's Coming" : "The Offer",
      body: description,
    },
    {
      type: "list",
      heading: input.template === "service" ? "What's Included" : "Highlights",
      items: deriveLandingItems(combined),
    },
    ...(input.sectionImage
      ? [
          {
            type: "image",
            heading: "Preview",
            image: input.sectionImage,
            caption: description,
          } satisfies LandingPageSection,
        ]
      : []),
    {
      type: input.template === "waitlist" ? "signup" : "profile",
      ...(input.template === "waitlist"
        ? {
            heading: "Join the List",
            body: "Leave your email and you'll hear first when there is news.",
            buttonLabel: ctaLabel,
            placeholder: "you@example.com",
          }
        : {
            heading: "About",
            body: input.profile.bio || `${input.profile.name || input.username} is the host behind this page.`,
            profileName: input.profile.name || input.username,
            profileImage: input.profile.avatar,
            profileLink: input.profile.profileUrl,
          }),
    } as LandingPageSection,
  ];

  return {
    version: 1,
    template: input.template,
    title,
    brief: input.brief.trim(),
    meta: { description, ogImage: input.heroImage || null },
    hero: {
      eyebrow: template.shortName,
      headline: title,
      subheadline: description,
      image: input.heroImage || null,
      cta: { label: ctaLabel, href: input.template === "waitlist" ? "#signup" : "#contact" },
    },
    sections,
    footer: {
      cta: { label: ctaLabel, href: input.template === "waitlist" ? "#signup" : "#contact" },
      note: "Built with ME3 Core.",
      profileLink: input.profile.profileUrl,
    },
    style: {
      vibe: input.template === "event" ? "warm" : input.template === "waitlist" ? "tech" : "minimal",
      accentColor: input.template === "waitlist" ? "#2d4cff" : "#0f766e",
    },
    updatedAt: new Date().toISOString(),
  };
}

function extractLandingTitle(text: string, template: LandingPageTemplateId): string {
  const firstLine = text.split(/\n+/).map((line) => line.trim()).find((line) => line.length > 8);
  if (firstLine) return firstLine.slice(0, 90);
  if (template === "event") return "A focused event page";
  if (template === "waitlist") return "A clear waitlist page";
  return "A focused offer page";
}

function firstSentence(text: string): string {
  return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0]?.slice(0, 180) || "";
}

function deriveLandingItems(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0 && line.length < 96)
    .slice(1, 4);
  return lines.length > 0
    ? lines
    : ["A clear promise", "A simple next step", "A page connected to your ME3 profile"];
}

function extractCta(feedback: string | null | undefined): string | null {
  const match = feedback?.match(/cta\s+(?:to|as)\s+["']?([^"'\n.]+)/i);
  return match?.[1]?.trim() || null;
}

function renderLandingPageHtml(page: LandingPageDocument, username: string): string {
  const accent = page.style.accentColor || "#0f766e";
  const sections = page.sections.map((section) => renderLandingSection(section, username)).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.meta.description)}"><style>:root{--accent:${escapeHtml(accent)};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#151c19;background:#fbfcfb}body{margin:0}.shell{width:min(1080px,calc(100vw - 32px));margin:0 auto}.top{border-bottom:1px solid rgba(21,28,25,.12);padding:16px 0}.hero{padding:56px 0;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.8fr);gap:24px;align-items:center}.hero-copy,.media,.card{border:1px solid rgba(21,28,25,.12);border-radius:22px;background:#fff;padding:28px;box-shadow:0 18px 48px rgba(16,24,20,.06)}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:1;margin:0 0 18px}.eyebrow{color:var(--accent);font-weight:800;text-transform:uppercase;font-size:12px;letter-spacing:.12em}p,li{color:#52615b;line-height:1.65}.button,button{display:inline-flex;border:0;border-radius:999px;background:var(--accent);color:white;padding:12px 18px;text-decoration:none;font-weight:800}.section{padding:28px 0}.media{min-height:280px;display:grid;place-items:center;overflow:hidden}.media img{width:100%;height:100%;object-fit:cover}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}input{padding:12px 14px;border:1px solid rgba(21,28,25,.18);border-radius:12px}@media(max-width:760px){.hero{grid-template-columns:1fr}}</style></head><body><header class="top"><div class="shell"><strong>${escapeHtml(username)}</strong></div></header><main><section class="shell hero"><div class="hero-copy"><p class="eyebrow">${escapeHtml(page.hero.eyebrow || "")}</p><h1>${escapeHtml(page.hero.headline)}</h1><p>${escapeHtml(page.hero.subheadline)}</p><a class="button" href="${escapeHtml(page.hero.cta.href)}">${escapeHtml(page.hero.cta.label)}</a></div><div class="media">${page.hero.image ? `<img src="${escapeHtml(page.hero.image)}" alt="">` : `<span class="eyebrow">ME3 Core</span>`}</div></section>${sections}</main></body></html>`;
}

function renderLandingSection(section: LandingPageSection, username: string): string {
  if (section.type === "text") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></div></section>`;
  }
  if (section.type === "list" || section.type === "steps") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></section>`;
  }
  if (section.type === "image") {
    return `<section class="shell section"><div class="media"><img src="${escapeHtml(section.image)}" alt="${escapeHtml(section.heading)}"></div></section>`;
  }
  if (section.type === "signup") {
    return `<section id="signup" class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p><form><input type="email" placeholder="${escapeHtml(section.placeholder || "Email")}"> <button type="button">${escapeHtml(section.buttonLabel)}</button></form></div></section>`;
  }
  if (section.type === "profile") {
    return `<section id="contact" class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p>${section.profileLink ? `<a href="${escapeHtml(section.profileLink)}">Visit profile</a>` : ""}</div></section>`;
  }
  if (section.type === "pricing") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><div class="grid">${section.tiers.map((tier) => `<article><strong>${escapeHtml(tier.name)}</strong><p>${escapeHtml(tier.price)}</p></article>`).join("")}</div></div></section>`;
  }
  if (section.type === "faq") {
    return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2><div class="grid">${section.items.map((item) => `<article><strong>${escapeHtml(item.question)}</strong><p>${escapeHtml(item.answer)}</p></article>`).join("")}</div></div></section>`;
  }
  return `<section class="shell section"><div class="card"><h2>${escapeHtml(section.heading)}</h2></div></section>`;
}

async function requireOwner(c: AppContext): Promise<string | null> {
  return getSessionOwnerId(c);
}

function unauthorized(c: AppContext) {
  return c.json({ ok: false, error: "Authentication required" }, 401);
}

function siteStorageSetupRequired(c: AppContext) {
  return c.json(
    {
      ok: false,
      error:
        "Site publishing storage is not initialized. Run `pnpm --filter @me3-core/worker db:migrate:local` and restart the Worker.",
      setupRequired: ["site_files"],
    },
    503,
  );
}

function isMissingSiteFilesTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("site_files") && /no such table|does not exist/i.test(message);
}

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeTimeZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timezone = value.trim();
  if (!timezone) return null;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return null;
  }
}

function normalizeLocale(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const locale = value.trim();
  if (!locale) return null;

  try {
    Intl.getCanonicalLocales(locale);
    return locale;
  } catch {
    return null;
  }
}

function serializeAccountOwner(owner: OwnerRecord) {
  const timezone = owner.timezone || "UTC";
  const explicitLocale = owner.locale?.trim() || null;

  return {
    id: owner.id,
    email: owner.email,
    name: owner.name || "ME3 Core Owner",
    username: owner.username || "owner",
    timezone,
    locale: explicitLocale || inferLocaleFromTimeZone(timezone),
    localeSource: explicitLocale ? "explicit" : "inferred",
  };
}

function inferLocaleFromTimeZone(timezone: string): string {
  if (timezone.startsWith("Europe/Dublin") || timezone.startsWith("Europe/London")) return "en-GB";
  if (timezone.startsWith("Europe/")) return "en-GB";
  if (timezone.startsWith("America/")) return "en-US";
  if (timezone.startsWith("Australia/")) return "en-AU";
  return "en-US";
}

function parseCalendarWindow(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return { error: "start and end are required" };
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { error: "Invalid start or end date" };
  if (endMs <= startMs) return { error: "end must be after start" };
  return { start, end };
}

function serializeReminder(reminder: DbUserReminder) {
  return {
    id: reminder.id,
    title: reminder.title,
    notes: reminder.notes,
    remindAt: reminder.remind_at,
    timezone: reminder.timezone,
    recurrenceRule: reminder.recurrence_rule,
    contextType: reminder.context_type,
    contextId: reminder.context_id,
    contextLabel: reminder.context_label,
    status: reminder.status,
    deliveredAt: reminder.delivered_at,
    dismissedAt: reminder.dismissed_at,
    createdAt: reminder.created_at,
  };
}

function serializeCalendarEvent(event: DbUserCalendarEvent) {
  const kind = event.kind === "birthday" ? "birthday" : "event";
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    location: event.location,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    timezone: event.timezone,
    allDay: event.all_day === 1,
    kind,
    recurrenceRule: event.recurrence_rule,
    sourceId: null,
    sourceName: kind === "birthday" ? "Birthdays" : "Personal events",
    sourceKind: "native",
    createdAt: event.created_at,
  };
}

function serializeCalendarSource(source: DbCalendarSource) {
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    originalFilename: source.original_filename,
    importedEventCount: source.imported_event_count,
    createdAt: source.created_at,
  };
}

function serializeImportedCalendarEvent(event: DbCalendarSourceEvent & { source_name: string }) {
  return {
    id: event.id,
    title: event.title,
    notes: event.notes,
    location: event.location,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    timezone: event.timezone,
    allDay: event.all_day === 1,
    kind: "event",
    recurrenceRule: null,
    sourceId: event.source_id,
    sourceName: event.source_name,
    sourceKind: "imported",
    createdAt: event.created_at,
  };
}

function expandYearlyCalendarEvents(
  events: DbUserCalendarEvent[],
  windowStart: string,
  windowEnd: string,
): DbUserCalendarEvent[] {
  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  const startYear = new Date(windowStart).getUTCFullYear() - 1;
  const endYear = new Date(windowEnd).getUTCFullYear() + 1;
  const expanded: DbUserCalendarEvent[] = [];

  for (const event of events) {
    if (event.recurrence_rule !== "yearly") continue;
    const originalStart = new Date(event.starts_at);
    const originalEnd = new Date(event.ends_at);
    const durationMs = Math.max(1, originalEnd.getTime() - originalStart.getTime());

    for (let year = startYear; year <= endYear; year += 1) {
      const startsAt = new Date(Date.UTC(
        year,
        originalStart.getUTCMonth(),
        originalStart.getUTCDate(),
        originalStart.getUTCHours(),
        originalStart.getUTCMinutes(),
        originalStart.getUTCSeconds(),
      ));
      const endsAt = new Date(startsAt.getTime() + durationMs);
      if (endsAt.getTime() <= startMs || startsAt.getTime() >= endMs) continue;
      expanded.push({ ...event, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() });
    }
  }

  return expanded;
}

async function getMailboxRow(env: Env, ownerId: string): Promise<DbMailboxAlias | null> {
  return env.DB.prepare(
    `SELECT id, user_id, alias_local_part, forwarding_email, forwarding_status,
            forwarding_enabled, forwarding_mode, status, approval_policy,
            daily_inbound_limit, daily_outbound_limit, activated_at,
            cf_destination_id, cf_destination_verified_at, cf_rule_id,
            cf_last_synced_at, cf_last_error, created_at, updated_at
     FROM mailbox_aliases
     WHERE user_id = ?`,
  )
    .bind(ownerId)
    .first<DbMailboxAlias>();
}

function suggestMailboxAlias(value: string): string {
  const base = value
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return base || "owner";
}

function normalizeMailboxAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getMailboxAddress(localPart: string): string {
  return `${localPart}@me3.local`;
}

function serializeMailbox(row: DbMailboxAlias) {
  return {
    id: row.id,
    aliasLocalPart: row.alias_local_part,
    aliasAddress: getMailboxAddress(row.alias_local_part),
    forwardingEmail: row.forwarding_email,
    forwardingStatus: row.forwarding_status,
    forwardingEnabled: Boolean(row.forwarding_enabled),
    forwardingMode: row.forwarding_mode,
    status: row.status,
    approvalPolicy: row.approval_policy,
    dailyInboundLimit: row.daily_inbound_limit,
    dailyOutboundLimit: row.daily_outbound_limit,
    activatedAt: row.activated_at,
    forwardingVerifiedAt: row.cf_destination_verified_at,
    cloudflareDestinationId: row.cf_destination_id,
    cloudflareRuleId: row.cf_rule_id,
    cloudflareLastSyncedAt: row.cf_last_synced_at,
    cloudflareLastError: row.cf_last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMailboxDefaultSource(row: DbMailboxAlias) {
  return {
    id: row.id,
    type: "me3_alias",
    address: getMailboxAddress(row.alias_local_part),
    status: row.status === "active" ? "active" : row.status === "paused" ? "paused" : "pending",
    inboundEnabled: row.status === "active",
    outboundEnabled: true,
  };
}

function mailboxMessageSelectSql(): string {
  return `SELECT id, direction, message_kind, status, thread_key, from_address,
                 to_address, subject, text_body, html_body, raw_headers_json,
                 raw_message, metadata_json, source_id, folder, read_at,
                 agent_summary, agent_labels_json, forwarded_to, error_message,
                 created_by, approved_by_user_id, received_at, approved_at,
                 sent_at, created_at
          FROM mailbox_messages`;
}

async function getMailboxActivity(env: Env, mailboxId: string, limit: number, offset: number) {
  const rows = await env.DB.prepare(
    `${mailboxMessageSelectSql()}
     WHERE mailbox_id = ?
     ORDER BY COALESCE(sent_at, received_at, approved_at, created_at) DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(mailboxId, limit, offset)
    .all<DbMailboxMessage>();

  return (rows.results || []).map(serializeMailboxMessage);
}

function buildMailboxMessageFilters(
  mailboxId: string,
  options: {
    status: string;
    createdBy: string;
    direction: string;
    folder: string;
    query: string;
    unread: string;
  },
) {
  const conditions = ["mailbox_id = ?"];
  const bindings: (string | number)[] = [mailboxId];
  const folder = normalizeFolder(options.folder);
  if (folder) {
    conditions.push("folder = ?");
    bindings.push(folder);
  }
  if (options.status) {
    const statuses = options.status.split(",").map((status) => status.trim()).filter(Boolean);
    if (statuses.length === 1) {
      conditions.push("status = ?");
      bindings.push(statuses[0]);
    } else if (statuses.length > 1) {
      conditions.push(`status IN (${statuses.map(() => "?").join(",")})`);
      bindings.push(...statuses);
    }
  }
  if (options.createdBy) {
    conditions.push("created_by = ?");
    bindings.push(options.createdBy);
  }
  if (options.direction && options.direction !== "all") {
    conditions.push("direction = ?");
    bindings.push(options.direction);
  }
  if (["1", "true", "yes"].includes(options.unread.toLowerCase())) {
    conditions.push("direction = 'inbound'");
    conditions.push("read_at IS NULL");
  }
  if (options.query.trim()) {
    conditions.push(
      `(LOWER(COALESCE(subject, '')) LIKE ? OR LOWER(COALESCE(text_body, '')) LIKE ? OR LOWER(COALESCE(from_address, '')) LIKE ? OR LOWER(COALESCE(to_address, '')) LIKE ?)`,
    );
    const like = `%${options.query.trim().toLowerCase()}%`;
    bindings.push(like, like, like, like);
  }

  return { where: conditions.join(" AND "), bindings };
}

function normalizeFolder(value: unknown): string | null {
  const folder = typeof value === "string" ? value.trim().toLowerCase() : "";
  return MAILBOX_FOLDERS.has(folder) ? folder : null;
}

function serializeMailboxMessage(row: DbMailboxMessage) {
  const metadata = parseJsonRecord(row.metadata_json);
  const agentLabels = parseJsonArray(row.agent_labels_json);
  return {
    id: row.id,
    direction: row.direction,
    kind: row.message_kind,
    status: row.status,
    threadKey: row.thread_key,
    fromAddress: row.from_address,
    fromName: null,
    toAddress: row.to_address,
    subject: row.subject || "(no subject)",
    body: row.text_body || "",
    htmlBody: row.html_body || null,
    preview: (row.text_body || "").slice(0, 280),
    metadata,
    sourceId: row.source_id,
    folder: row.folder,
    readAt: row.read_at,
    unread: row.direction === "inbound" && !row.read_at,
    agentSummary: row.agent_summary,
    agentLabels,
    forwardedTo: row.forwarded_to,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    approvedByUserId: row.approved_by_user_id,
    receivedAt: row.received_at,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

function serializeTelegramConnection(row: DbAgentChannelConnection, botUsername: string | null) {
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    botUsername,
    telegramUserId: row.telegram_user_id,
    telegramChatId: row.telegram_chat_id,
    telegramUsername: row.telegram_username,
    telegramFirstName: row.telegram_first_name,
    telegramLastName: row.telegram_last_name,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastInboundAt: row.last_inbound_at,
    lastOutboundAt: row.last_outbound_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeTelegramEvent(row: DbAgentChannelEvent) {
  return {
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    eventType: row.event_type,
    status: row.status,
    telegramMessageId: row.telegram_message_id,
    replyToMessageId: row.reply_to_message_id,
    telegramUserId: row.telegram_user_id,
    telegramChatId: row.telegram_chat_id,
    telegramUsername: row.telegram_username,
    textBody: row.text_body,
    rawJson: parseJsonRecord(row.raw_json),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clampNumber(value: string | null | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function parseContactInput(value: unknown): ContactInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    name: normalizeNullableText(input.name) || undefined,
    email: normalizeEmail(input.email),
    phone: normalizeNullableText(input.phone),
    source: CONTACT_SOURCES.has(String(input.source)) ? (input.source as DbContact["source"]) : "manual",
    sourceRef: normalizeNullableText(input.sourceRef),
    relationship: CONTACT_RELATIONSHIPS.has(String(input.relationship))
      ? (input.relationship as DbContact["relationship"])
      : "contact",
    closeness: normalizeNullableText(input.closeness) as ContactInput["closeness"],
    status: CONTACT_STATUSES.has(String(input.status)) ? (input.status as DbContact["status"]) : "active",
    notes: normalizeNullableText(input.notes),
    tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [],
    lastInteractionAt: normalizeNullableText(input.lastInteractionAt),
    nextFollowupAt: normalizeNullableText(input.nextFollowupAt),
    outreachStatus: normalizeOutreachStatus(input.outreachStatus),
    socialHandles: isPlainObject(input.socialHandles) ? stringRecord(input.socialHandles) : {},
    metadata: isPlainObject(input.metadata) ? { ...(input.metadata as Record<string, unknown>) } : null,
  };
}

async function listContacts(env: Env, ownerId: string) {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.user_id, c.name, c.email, c.phone, c.source, c.source_ref,
            c.relationship, c.status, c.notes, c.tags, c.last_interaction_at,
            c.next_followup_at, c.outreach_status, c.social_handles, c.metadata,
            c.created_at, c.updated_at,
            COUNT(b.id) AS booking_count,
            MAX(b.starts_at) AS last_booking_at
     FROM contacts c
     LEFT JOIN bookings b ON b.guest_email = c.email
     LEFT JOIN sites s ON s.id = b.site_id AND s.user_id = c.user_id
     WHERE c.user_id = ?
     GROUP BY c.id
     ORDER BY COALESCE(c.last_interaction_at, c.updated_at, c.created_at) DESC`,
  )
    .bind(ownerId)
    .all<DbContact>();

  const contacts = (rows.results || []).map(serializeContact);
  return { contacts, summary: summarizeContacts(contacts) };
}

async function getTelegramConnection(env: Env, ownerId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token, telegram_user_id, telegram_chat_id,
            telegram_username, telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at, updated_at
     FROM agent_channel_connections
     WHERE user_id = ? AND channel = 'telegram'`,
  )
    .bind(ownerId)
    .first<DbAgentChannelConnection>();
}

async function upsertPendingTelegramConnection(env: Env, ownerId: string) {
  const existing = await getTelegramConnection(env, ownerId);
  const connectionId = existing?.id || crypto.randomUUID();
  const setupToken = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO agent_channel_connections
     (id, user_id, channel, status, setup_token, telegram_user_id,
      telegram_chat_id, telegram_username, telegram_first_name,
      telegram_last_name, connected_at, disconnected_at, last_inbound_at,
      last_outbound_at)
     VALUES (?, ?, 'telegram', 'pending', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
     ON CONFLICT(user_id, channel) DO UPDATE SET
       status = 'pending',
       setup_token = excluded.setup_token,
       telegram_user_id = NULL,
       telegram_chat_id = NULL,
       telegram_username = NULL,
       telegram_first_name = NULL,
       telegram_last_name = NULL,
       connected_at = NULL,
       disconnected_at = NULL,
       last_inbound_at = NULL,
       last_outbound_at = NULL,
       updated_at = datetime('now')`,
  )
    .bind(connectionId, ownerId, setupToken)
    .run();

  const row = await getTelegramConnection(env, ownerId);
  if (!row) throw new Error("Failed to create Telegram connection");
  return row;
}

async function insertContact(env: Env, ownerId: string, input: ContactInput) {
  const id = crypto.randomUUID();
  const metadata = normalizeContactMetadata(input);
  await env.DB.prepare(
    `INSERT INTO contacts (
       id, user_id, name, email, phone, source, source_ref, relationship, status,
       notes, tags, last_interaction_at, next_followup_at, outreach_status,
       social_handles, metadata
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      input.name,
      input.email || null,
      input.phone || null,
      input.source || "manual",
      input.sourceRef || null,
      input.relationship || "contact",
      input.status || "active",
      input.notes || null,
      JSON.stringify(input.tags || []),
      input.lastInteractionAt || null,
      input.nextFollowupAt || null,
      input.outreachStatus || null,
      JSON.stringify(input.socialHandles || {}),
      metadata ? JSON.stringify(metadata) : null,
    )
    .run();

  return getContact(env, ownerId, id);
}

async function updateContact(env: Env, ownerId: string, id: string, input: ContactInput) {
  const existing = await getContactRow(env, ownerId, id);
  if (!existing) return null;

  const merged: ContactInput = {
    name: input.name ?? existing.name,
    email: input.email ?? existing.email,
    phone: input.phone ?? existing.phone,
    source: input.source ?? existing.source,
    sourceRef: input.sourceRef ?? existing.source_ref,
    relationship: input.relationship ?? existing.relationship,
    status: input.status ?? existing.status,
    notes: input.notes ?? existing.notes,
    tags: input.tags ?? parseJsonArray(existing.tags),
    lastInteractionAt: input.lastInteractionAt ?? existing.last_interaction_at,
    nextFollowupAt: input.nextFollowupAt ?? existing.next_followup_at,
    outreachStatus: input.outreachStatus ?? existing.outreach_status,
    socialHandles: input.socialHandles ?? stringRecord(parseJsonRecord(existing.social_handles)),
    metadata: input.metadata ?? parseJsonRecord(existing.metadata),
    closeness: input.closeness ?? (parseJsonRecord(existing.metadata)?.closeness as ContactInput["closeness"]),
  };
  const metadata = normalizeContactMetadata(merged);

  await env.DB.prepare(
    `UPDATE contacts
     SET name = ?, email = ?, phone = ?, source = ?, source_ref = ?,
         relationship = ?, status = ?, notes = ?, tags = ?,
         last_interaction_at = ?, next_followup_at = ?, outreach_status = ?,
         social_handles = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
  )
    .bind(
      merged.name,
      merged.email || null,
      merged.phone || null,
      merged.source || "manual",
      merged.sourceRef || null,
      merged.relationship || "contact",
      merged.status || "active",
      merged.notes || null,
      JSON.stringify(merged.tags || []),
      merged.lastInteractionAt || null,
      merged.nextFollowupAt || null,
      merged.outreachStatus || null,
      JSON.stringify(merged.socialHandles || {}),
      metadata ? JSON.stringify(metadata) : null,
      ownerId,
      id,
    )
    .run();

  return getContact(env, ownerId, id);
}

async function getContact(env: Env, ownerId: string, id: string) {
  const row = await getContactRow(env, ownerId, id);
  return row ? serializeContact(row) : null;
}

async function getContactRow(env: Env, ownerId: string, id: string) {
  return env.DB.prepare(
    `SELECT id, user_id, name, email, phone, source, source_ref,
            relationship, status, notes, tags, last_interaction_at,
            next_followup_at, outreach_status, social_handles, metadata,
            created_at, updated_at, 0 AS booking_count, NULL AS last_booking_at
     FROM contacts
     WHERE user_id = ? AND id = ?`,
  )
    .bind(ownerId, id)
    .first<DbContact>();
}

function serializeContact(row: DbContact) {
  const metadata = parseJsonRecord(row.metadata);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    sourceRef: row.source_ref,
    relationship: row.relationship,
    closeness: typeof metadata.closeness === "string" ? metadata.closeness : null,
    status: row.status,
    notes: row.notes,
    tags: parseJsonArray(row.tags),
    lastInteractionAt: row.last_interaction_at,
    nextFollowupAt: row.next_followup_at,
    outreachStatus: row.outreach_status,
    socialHandles: stringRecord(parseJsonRecord(row.social_handles)),
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bookingCount: Number(row.booking_count || 0),
    lastBookingAt: row.last_booking_at || null,
  };
}

function summarizeContacts(contacts: ReturnType<typeof serializeContact>[]) {
  const outreach = {
    new: 0,
    drafted: 0,
    sent: 0,
    replied: 0,
    booked: 0,
    converted: 0,
    not_interested: 0,
    no_response: 0,
  };
  for (const contact of contacts) {
    if (contact.outreachStatus && contact.outreachStatus in outreach) {
      outreach[contact.outreachStatus as keyof typeof outreach] += 1;
    }
  }
  return {
    total: contacts.length,
    clients: contacts.filter((contact) => contact.relationship === "client").length,
    prospects: contacts.filter((contact) => contact.relationship === "prospect").length,
    contacts: contacts.filter((contact) => contact.relationship === "contact").length,
    active: contacts.filter((contact) => contact.status === "active").length,
    dormant: contacts.filter((contact) => contact.status === "dormant").length,
    archived: contacts.filter((contact) => contact.status === "archived").length,
    needsFollowUp: contacts.filter((contact) => contact.nextFollowupAt && contact.status === "active").length,
    outreach,
  };
}

function normalizeContactMetadata(input: ContactInput): Record<string, unknown> | null {
  const metadata = { ...(input.metadata || {}) };
  if (input.closeness) metadata.closeness = input.closeness;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

function normalizeOutreachStatus(value: unknown): DbContact["outreach_status"] {
  const normalized = typeof value === "string" ? value.trim() : "";
  return OUTREACH_STATUSES.has(normalized) ? (normalized as DbContact["outreach_status"]) : null;
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") result[key] = entry;
  }
  return result;
}

async function getOwnerProfile(env: Env, ownerId: string): Promise<OwnerRecord | null> {
  const result = await env.DB.prepare(
    "SELECT id, email, name, username, bio, avatar_url, timezone, locale, password_hash FROM owner_profile WHERE id = ?",
  )
    .bind(ownerId)
    .first<OwnerRecord>();

  return result ?? null;
}

async function getOwnerByEmail(env: Env, email: string): Promise<OwnerRecord | null> {
  const result = await env.DB.prepare(
    "SELECT id, email, name, username, bio, avatar_url, timezone, locale, password_hash FROM owner_profile WHERE lower(email) = ?",
  )
    .bind(email)
    .first<OwnerRecord>();

  return result ?? null;
}

async function getOwnerAuthConfigured(env: Env): Promise<boolean> {
  const result = await env.DB.prepare(
    "SELECT password_hash FROM owner_profile WHERE id = ?",
  )
    .bind("owner")
    .first<{ password_hash: string | null }>();

  return Boolean(result?.password_hash);
}

function toPublicOwner(owner: OwnerRecord): OwnerProfile {
  return {
    id: owner.id,
    email: owner.email,
    name: owner.name,
    username: owner.username,
    bio: owner.bio,
    avatar_url: owner.avatar_url,
    timezone: owner.timezone,
  };
}

async function setOwnerSession(c: AppContext, ownerId: string) {
  if (!c.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required to issue owner sessions");
  }

  const token = await signSessionToken(
    {
      sub: ownerId,
      iat: currentUnixTime(),
      exp: currentUnixTime() + SESSION_TTL_SECONDS,
    },
    c.env.JWT_SECRET,
  );

  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

function clearOwnerSession(c: AppContext) {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
    secure: shouldUseSecureCookie(c.env),
    sameSite: "Lax",
  });
}

async function getSessionOwnerId(c: AppContext): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token || !c.env.JWT_SECRET) return null;

  const payload = await verifySessionToken(token, c.env.JWT_SECRET);
  if (!payload || payload.exp <= currentUnixTime()) return null;
  if (payload.sub !== "owner") return null;

  return payload.sub;
}

async function signSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = encodeBase64UrlJson(header);
  const encodedPayload = encodeBase64UrlJson(payload);
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256(data, secret);
  return `${data}.${encodeBase64Url(signature)}`;
}

async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const expectedSignature = encodeBase64Url(
    await hmacSha256(`${encodedHeader}.${encodedPayload}`, secret),
  );

  if (!constantTimeEqual(encodedSignature, expectedSignature)) return null;

  try {
    const header = JSON.parse(decodeBase64Url(encodedHeader)) as { alg?: string };
    if (header.alg !== "HS256") return null;

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmacSha256(data: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
}

async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);

  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    encodeBase64Url(salt),
    encodeBase64Url(hash),
  ].join("$");
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, rawIterations, rawSalt, expectedHash] = storedHash.split("$");
  const iterations = Number(rawIterations);

  if (algorithm !== PASSWORD_HASH_ALGORITHM || !Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  try {
    const salt = decodeBase64UrlBytes(rawSalt);
    const actualHash = encodeBase64Url(await derivePasswordHash(password, salt, iterations));
    return constantTimeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBuffer,
      iterations,
    },
    key,
    256,
  );
}

function encodeBase64UrlJson(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function currentUnixTime(): number {
  return Math.floor(Date.now() / 1000);
}

function shouldUseSecureCookie(env: Env): boolean {
  return env.ENVIRONMENT !== "local" && env.CORE_API_ORIGIN.startsWith("https://");
}

async function getSetupRequired(env: Env, ownerId = "owner"): Promise<string[]> {
  const missing: string[] = [];

  if (!env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!(await hasConfiguredAiProvider(env, ownerId))) {
    missing.push("AI_PROVIDER");
  }

  return missing;
}

export default app;
