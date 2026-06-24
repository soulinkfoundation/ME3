import {
  LANDING_PAGES_PLUGIN_ID,
  buildLandingPageDocument,
  normalizeLandingPageDocument,
  normalizeLandingTemplate,
} from "@me3-core/plugin-landing-pages";
import { isCorePluginEnabled } from "../plugins";
import { generateSiteHtml, markdownToHtml, type Me3SiteProfile } from "../site-generator";
import {
  bookingDetailsFromBooking,
  getOwnerContact,
  sendGuestBookingConfirmationEmail,
  sendProductPurchaseConfirmationEmail,
} from "../transactional-emails";
import type { AppHono, OwnerRouteDeps } from "../http/types";
import type { DbBooking, DbSite, DbSubscriber } from "../types";
import {
  applyPurchaseEmailTokens,
  productSendsPurchaseConfirmation,
} from "../../../../shared/product-purchase-confirmation";
import {
  EMAIL_REGEX,
  USERNAME_REGEX,
  arrayBufferToText,
  buildContentMetaMap,
  buildCoreDomainStatus,
  createEmptyPublishManifest,
  deleteSiteFile,
  escapeCsv,
  findHeaderIndex,
  getContentType,
  getCoreDomainInstructions,
  getCoreDomainState,
  getCoreWebOrigin,
  getGeneratedSiteContentType,
  getMe3CloudUsernamePublishBlockReason,
  getSiteByUsername,
  getSiteFile,
  getSiteFileText,
  getSiteForOwner,
  getSiteStorageStatus,
  getOwnerProfile,
  hashSubscriberIdentifier,
  imageExtension,
  injectBaseHref,
  isMissingSiteFilesTableError,
  isMissingSubscribersTableError,
  isSiteMediaFile,
  isValidPublicSiteDomain,
  listSiteFiles,
  loadLandingPage,
  loadPublishManifest,
  loadSiteSourceFiles,
  normalizeDomain,
  normalizeImportedTimestamp,
  normalizeNullableText,
  normalizeProductCurrency,
  normalizeProductPriceCents,
  normalizeSiteFileName,
  normalizeSiteMediaPath,
  normalizeUsername,
  parseCsvLine,
  parseSiteProfile,
  parseSubscriberBody,
  pruneGeneratedPublicFiles,
  pruneUnreferencedSiteSourceFiles,
  putR2SiteFile,
  putSiteFile,
  putSiteMediaFile,
  renderNotFoundPage,
  saveLandingPage,
  savePublishManifest,
  serveDefaultPublicSitePath,
  serveMeJsonResponse,
  serveSiteFileResponse,
  sha256Buffer,
  sha256Text,
  shouldIgnoreSiteSourceFile,
  siteFileContentToBytes,
  siteStorageSetupRequired,
  splitImportedName,
  subscribersSetupRequired,
  titleFromSlug,
  unsubscribeHtml,
  verifyUnsubscribeToken,
} from "../sites";

type LandingPageGenerateBody = {
  username?: string;
  brief?: string;
  templateId?: string;
  heroImage?: string | null;
  sectionImage?: string | null;
  feedback?: string | null;
};

export function registerSiteRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/sites", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
        soulinkAgentAccess: true,
        telegramAgentAccess: true,
      },
      can_create: Number(count?.count || 0) < 4,
    });
  });

  app.post("/api/sites/:username/products/confirmation-email/test", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const body = await c.req
      .json<{
        productSlug?: unknown;
        productTitle?: unknown;
        siteName?: unknown;
        subject?: unknown;
        message?: unknown;
      }>()
      .catch(() => null);
    if (!body) return c.json({ error: "Invalid request body" }, 400);

    const productSlug = normalizeShortEmailText(body.productSlug, 120) || null;
    const productTitle = normalizeShortEmailText(body.productTitle, 120);
    const siteName = normalizeShortEmailText(body.siteName, 120) || site.username;
    const subject = normalizeShortEmailText(body.subject, 200);
    const message = normalizeLongEmailText(body.message, 8000);
    if (!productTitle) return c.json({ error: "Product title is required" }, 400);
    if (!productSendsPurchaseConfirmation({ enabled: true, subject, message })) {
      return c.json({ error: "Add both a subject and message before sending a test email" }, 400);
    }

    const owner = await getOwnerContact(c.env, ownerId);
    if (!owner.email) return c.json({ error: "Owner email is required for test sends" }, 400);

    const tokenCtx = {
      buyerName: "Test Buyer",
      buyerNote: "Looking forward to this.",
      productTitle,
      siteName,
      supportEmail: owner.email,
    };
    const result = await sendProductPurchaseConfirmationEmail(c.env, {
      ownerId,
      hostName: siteName,
      hostEmail: owner.email,
      buyerName: tokenCtx.buyerName,
      buyerEmail: owner.email,
      productTitle,
      subject: applyPurchaseEmailTokens(subject, tokenCtx),
      messageText: applyPurchaseEmailTokens(message, tokenCtx),
      test: true,
    });
    if (result.status !== "sent") {
      return c.json({ error: result.error || "Failed to send test email" }, 502);
    }

    return c.json({
      ok: true,
      sentTo: owner.email,
      providerMessageId: result.providerMessageId,
      subject: `[Test] ${applyPurchaseEmailTokens(subject, tokenCtx)}`,
      productSlug,
      preview: tokenCtx,
    });
  });

  app.post("/api/sites/:username/bookings/confirmation-email/test", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const body = await c.req
      .json<{
        bookingTitle?: unknown;
        siteName?: unknown;
        message?: unknown;
        durationMinutes?: unknown;
        timezone?: unknown;
      }>()
      .catch(() => null);
    if (!body) return c.json({ error: "Invalid request body" }, 400);

    const owner = await getOwnerContact(c.env, ownerId);
    if (!owner.email) return c.json({ error: "Owner email is required for test sends" }, 400);

    const startsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const booking: DbBooking = {
      id: "test-booking",
      site_id: site.id,
      offer_id: "test-offer",
      booking_type: "one_to_one",
      guest_name: "Test Guest",
      guest_email: owner.email,
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(),
      duration_minutes: normalizePositiveInteger(body.durationMinutes, 60),
      calendar_event_id: null,
      status: "confirmed",
      notes: "Looking forward to this.",
      created_at: startsAt,
      cancelled_at: null,
      payment_intent_id: null,
      amount_paid: null,
      suggested_amount: null,
      currency: null,
      payment_status: "not_required",
      is_free_booking: 1,
      paid_at: null,
    };
    const result = await sendGuestBookingConfirmationEmail(
      c.env,
      bookingDetailsFromBooking({
        booking,
        ownerId,
        hostName:
          normalizeShortEmailText(body.siteName, 120) ||
          owner.name ||
          site.username,
        hostEmail: owner.email,
        bookingTitle:
          normalizeShortEmailText(body.bookingTitle, 120) ||
          "Book a session",
        timezone: normalizeShortEmailText(body.timezone, 80) || "UTC",
        guestMessageText: normalizeLongEmailText(body.message, 8000),
        test: true,
      }),
    );
    if (result.status !== "sent") {
      return c.json({ error: result.error || "Failed to send test email" }, 502);
    }

    return c.json({ ok: true, sentTo: owner.email, providerMessageId: result.providerMessageId });
  });

  app.post("/api/sites/:username/subscribe", async (c) => {
    const site = await getSiteByUsername(c.env, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    try {
      const { email, firstName, lastName, honeypot } = await parseSubscriberBody(c);
      if (honeypot) return c.json({ ok: true, message: "Subscribed successfully" });
      if (!email) return c.json({ error: "Email is required" }, 400);

      const normalizedEmail = email.toLowerCase().trim();
      if (!EMAIL_REGEX.test(normalizedEmail)) return c.json({ error: "Invalid email address" }, 400);

      const clientIp = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for");
      const ipHash = clientIp ? await hashSubscriberIdentifier(clientIp) : null;
      const existing = await c.env.DB.prepare(
        "SELECT id, unsubscribed_at FROM subscribers WHERE site_id = ? AND email = ?",
      )
        .bind(site.id, normalizedEmail)
        .first<{ id: number; unsubscribed_at: string | null }>();

      if (existing) {
        if (existing.unsubscribed_at) {
          await c.env.DB.prepare(
            "UPDATE subscribers SET unsubscribed_at = NULL, subscribed_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
            .bind(existing.id)
            .run();
          return c.json({ ok: true, message: "Welcome back! You've been re-subscribed." });
        }
        return c.json({ ok: true, message: "You're already subscribed!" });
      }

      await c.env.DB.prepare(
        `INSERT INTO subscribers (site_id, email, first_name, last_name, source, ip_hash)
         VALUES (?, ?, ?, ?, 'me3', ?)`,
      )
        .bind(site.id, normalizedEmail, normalizeNullableText(firstName), normalizeNullableText(lastName), ipHash)
        .run();

      return c.json({ ok: true, message: "Subscribed successfully!" });
    } catch (error) {
      if (isMissingSubscribersTableError(error)) return subscribersSetupRequired(c);
      console.error("Subscribe error:", error);
      return c.json({ error: "Failed to subscribe" }, 500);
    }
  });

  app.get("/api/sites/:username/unsubscribe", async (c) => {
    const email = c.req.query("email");
    const token = c.req.query("token");
    const username = normalizeUsername(c.req.param("username"));
    if (!email || !token || !username) return unsubscribeHtml("Invalid unsubscribe link", "This link appears to be invalid or expired.");

    const normalizedEmail = email.toLowerCase().trim();
    if (!(await verifyUnsubscribeToken(c.env, normalizedEmail, username, token))) {
      return unsubscribeHtml("Invalid unsubscribe link", "This link appears to be invalid or expired.");
    }

    const site = await getSiteByUsername(c.env, username);
    if (!site) return unsubscribeHtml("Site not found");

    try {
      await c.env.DB.prepare(
        "UPDATE subscribers SET unsubscribed_at = CURRENT_TIMESTAMP WHERE site_id = ? AND email = ?",
      )
        .bind(site.id, normalizedEmail)
        .run();

      return unsubscribeHtml(
        "You've been unsubscribed",
        "You will no longer receive emails from this newsletter.",
        "Changed your mind? Visit the site to subscribe again.",
      );
    } catch (error) {
      console.error("Unsubscribe error:", error);
      return unsubscribeHtml("Something went wrong", "Please try again later.");
    }
  });

  app.get("/api/sites/:username/subscribers/count", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found or unauthorized" }, 404);

    try {
      const result = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM subscribers WHERE site_id = ? AND unsubscribed_at IS NULL",
      )
        .bind(site.id)
        .first<{ count: number | string | null }>();
      return c.json({ count: Number(result?.count || 0) });
    } catch (error) {
      if (isMissingSubscribersTableError(error)) return subscribersSetupRequired(c);
      console.error("Get subscriber count error:", error);
      return c.json({ error: "Failed to get subscriber count" }, 500);
    }
  });

  app.get("/api/sites/:username/subscribers/export", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found or unauthorized" }, 404);

    try {
      const result = await c.env.DB.prepare(
        `SELECT email, first_name, last_name, source, subscribed_at
         FROM subscribers
         WHERE site_id = ? AND unsubscribed_at IS NULL
         ORDER BY subscribed_at DESC`,
      )
        .bind(site.id)
        .all<DbSubscriber>();
      const rows = [["email", "first_name", "last_name", "source", "subscribed_at"].join(",")];
      for (const subscriber of result.results || []) {
        rows.push(
          [
            escapeCsv(subscriber.email),
            escapeCsv(subscriber.first_name || ""),
            escapeCsv(subscriber.last_name || ""),
            escapeCsv(subscriber.source),
            escapeCsv(subscriber.subscribed_at),
          ].join(","),
        );
      }

      const filename = `${site.username}-audience-${new Date().toISOString().split("T")[0]}.csv`;
      return new Response(rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch (error) {
      if (isMissingSubscribersTableError(error)) return subscribersSetupRequired(c);
      console.error("Export subscribers error:", error);
      return c.json({ error: "Failed to export subscribers" }, 500);
    }
  });

  app.get("/api/sites/:username/subscribers", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found or unauthorized" }, 404);

    try {
      const page = Math.max(1, Number.parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") || "50", 10)));
      const offset = (page - 1) * limit;
      const countResult = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM subscribers WHERE site_id = ? AND unsubscribed_at IS NULL",
      )
        .bind(site.id)
        .first<{ count: number | string | null }>();
      const total = Number(countResult?.count || 0);
      const result = await c.env.DB.prepare(
        `SELECT id, email, first_name, last_name, source, subscribed_at
         FROM subscribers
         WHERE site_id = ? AND unsubscribed_at IS NULL
         ORDER BY subscribed_at DESC
         LIMIT ? OFFSET ?`,
      )
        .bind(site.id, limit, offset)
        .all<DbSubscriber>();

      return c.json({
        subscribers: result.results || [],
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      if (isMissingSubscribersTableError(error)) return subscribersSetupRequired(c);
      console.error("List subscribers error:", error);
      return c.json({ error: "Failed to list subscribers" }, 500);
    }
  });

  app.post("/api/sites/:username/subscribers", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found or unauthorized" }, 404);

    try {
      const body = await c.req
        .json<{ email?: unknown; firstName?: unknown; lastName?: unknown }>()
        .catch((): { email?: unknown; firstName?: unknown; lastName?: unknown } => ({}));
      if (typeof body.email !== "string") return c.json({ error: "Email is required" }, 400);
      const email = body.email.toLowerCase().trim();
      if (!EMAIL_REGEX.test(email)) return c.json({ error: "Invalid email address" }, 400);

      const existing = await c.env.DB.prepare(
        "SELECT id, unsubscribed_at FROM subscribers WHERE site_id = ? AND email = ?",
      )
        .bind(site.id, email)
        .first<{ id: number; unsubscribed_at: string | null }>();

      if (existing) {
        if (existing.unsubscribed_at) {
          await c.env.DB.prepare(
            "UPDATE subscribers SET unsubscribed_at = NULL, subscribed_at = CURRENT_TIMESTAMP, source = 'manual' WHERE id = ?",
          )
            .bind(existing.id)
            .run();
          return c.json({ ok: true, resubscribed: true });
        }
        return c.json({ error: "Email is already subscribed" }, 409);
      }

      await c.env.DB.prepare(
        `INSERT INTO subscribers (site_id, email, first_name, last_name, source)
         VALUES (?, ?, ?, ?, 'manual')`,
      )
        .bind(site.id, email, normalizeNullableText(body.firstName), normalizeNullableText(body.lastName))
        .run();

      return c.json({ ok: true, resubscribed: false });
    } catch (error) {
      if (isMissingSubscribersTableError(error)) return subscribersSetupRequired(c);
      console.error("Add subscriber error:", error);
      return c.json({ error: "Failed to add subscriber" }, 500);
    }
  });

  app.delete("/api/sites/:username/subscribers/:id", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found or unauthorized" }, 404);

    try {
      const result = await c.env.DB.prepare("DELETE FROM subscribers WHERE id = ? AND site_id = ?")
        .bind(c.req.param("id"), site.id)
        .run();
      const changes = Number(result.meta.changes || 0);
      if (changes === 0) return c.json({ error: "Subscriber not found" }, 404);
      return c.json({ ok: true });
    } catch (error) {
      if (isMissingSubscribersTableError(error)) return subscribersSetupRequired(c);
      console.error("Delete subscriber error:", error);
      return c.json({ error: "Failed to delete subscriber" }, 500);
    }
  });

  app.post("/api/sites/:username/subscribers/import", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found or unauthorized" }, 404);

    try {
      const formData = await c.req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) return c.json({ error: "CSV file is required" }, 400);

      const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) {
        return c.json({ error: "CSV must have a header row and at least one data row" }, 400);
      }

      const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase().trim());
      const emailIndex = findHeaderIndex(header, ["email", "email address", "email_address", "emailaddress"]);
      if (emailIndex === -1) return c.json({ error: "CSV must have an 'email' column" }, 400);

      const firstNameIndex = findHeaderIndex(header, ["first_name", "firstname", "first name", "fname"]);
      const lastNameIndex = findHeaderIndex(header, ["last_name", "lastname", "last name", "lname"]);
      const fullNameIndex = findHeaderIndex(header, ["name", "full_name", "full name"]);
      const subscribedAtIndex = findHeaderIndex(header, [
        "subscribed_at",
        "subscribed at",
        "start date",
        "start_date",
        "created_at",
        "created at",
      ]);
      const source = header.includes("start date") && header.includes("revenue") ? "substack_import" : "import";
      const seen = new Set<string>();
      let imported = 0;
      let skipped = 0;

      for (const line of lines.slice(1)) {
        const values = parseCsvLine(line);
        const email = values[emailIndex]?.toLowerCase().trim();
        if (!email || !EMAIL_REGEX.test(email) || seen.has(email)) {
          skipped++;
          continue;
        }
        seen.add(email);

        const name = fullNameIndex >= 0 ? splitImportedName(values[fullNameIndex]) : { firstName: null, lastName: null };
        const subscribedAt = subscribedAtIndex >= 0 ? normalizeImportedTimestamp(values[subscribedAtIndex]) : null;
        const result = await c.env.DB.prepare(
          `INSERT OR IGNORE INTO subscribers (site_id, email, first_name, last_name, source, subscribed_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        )
          .bind(
            site.id,
            email,
            firstNameIndex >= 0 ? normalizeNullableText(values[firstNameIndex]) : name.firstName,
            lastNameIndex >= 0 ? normalizeNullableText(values[lastNameIndex]) : name.lastName,
            source,
            subscribedAt,
          )
          .run();
        if (Number(result.meta.changes || 0) > 0) imported++;
        else skipped++;
      }

      return c.json({ ok: true, imported, skipped, total: lines.length - 1 });
    } catch (error) {
      if (isMissingSubscribersTableError(error)) return subscribersSetupRequired(c);
      console.error("Import subscribers error:", error);
      return c.json({ error: "Failed to import subscribers" }, 500);
    }
  });

  app.post("/api/sites", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const body = await c.req
      .json<{ username?: string; siteType?: string; templateId?: string | null }>()
      .catch((): { username?: string; siteType?: string; templateId?: string | null } => ({}));
    const username = normalizeUsername(body.username);
    if (!username || !USERNAME_REGEX.test(username)) {
      return c.json({ error: "Username must be 3-30 characters and use letters, numbers, underscores, or hyphens" }, 400);
    }

    const cloudUsernameError = await getMe3CloudUsernamePublishBlockReason(c.env, username);
    if (cloudUsernameError) return c.json({ error: cloudUsernameError }, 409);

    const siteType = body.siteType === "landing_page" ? "landing_page" : "profile";
    if (
      siteType === "landing_page" &&
      !(await isCorePluginEnabled(c.env, LANDING_PAGES_PLUGIN_ID))
    ) {
      return c.json({ error: "ME3 Landing Pages is coming soon" }, 403);
    }
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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    return c.json(await getSiteStorageStatus(c.env, site));
  });

  app.post("/api/sites/:username/storage/migrate-media", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
      await putR2SiteFile(c.env, site, file.path, siteFileContentToBytes(file.content), file.content_type);
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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    return c.json(buildCoreDomainStatus(c.env, site));
  });

  app.post("/api/domains/:username", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);
    if (!site.published_at) {
      return c.json(
        {
          error:
            "Publish your profile before connecting a custom domain. This prevents an empty domain from going live.",
        },
        409,
      );
    }

    const body = await c.req.json<{ domain?: unknown }>().catch((): { domain?: unknown } => ({}));
    const domain = normalizeDomain(body.domain);
    if (!isValidPublicSiteDomain(domain)) {
      return c.json({ error: "Use a domain you control, for example kieranbutler.com." }, 400);
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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const cloudUsernameError = await getMe3CloudUsernamePublishBlockReason(c.env, site.username);
    if (cloudUsernameError) return c.json({ error: cloudUsernameError }, 409);

    try {
      const form = await c.req.formData();
      const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
      if (files.length === 0) return c.json({ error: "No files uploaded" }, 400);

      const manifest = (await loadPublishManifest(c.env, site.id)) || createEmptyPublishManifest();

      for (const file of files) {
        if (isSiteMediaFile(file.name, file.type)) {
          const buffer = await file.arrayBuffer();
          const relativePath = normalizeSiteMediaPath(file.name);
          await putSiteMediaFile(c.env, site, `public/${relativePath}`, buffer, file.type || getContentType(file.name));
          manifest.assetFiles[relativePath] = await sha256Buffer(buffer);
          continue;
        }

        const sourceName = normalizeSiteFileName(file.name);
        if (shouldIgnoreSiteSourceFile(sourceName)) continue;
        const content = await file.text();
        const contentType = file.type || getContentType(file.name);
        const sourcePath = `src/${sourceName}`;
        await putSiteFile(c.env, site.id, sourcePath, content, contentType);
        manifest.sourceFiles[sourceName] = await sha256Text(content);
      }

      let sourceFiles = await loadSiteSourceFiles(c.env, site.id);
      const meJson = sourceFiles.get("me.json");
      if (meJson) {
        const profile = parseSiteProfile(meJson, site.username);
        await pruneUnreferencedSiteSourceFiles(c.env, site.id, profile, manifest);
        sourceFiles = await loadSiteSourceFiles(c.env, site.id);
        const generatedFiles = await generateSiteHtml(
          profile,
          Array.from(sourceFiles.entries()).map(([name, content]) => ({ name, content })),
        );
        for (const [name, content] of Object.entries(generatedFiles)) {
          await putSiteFile(
            c.env,
            site.id,
            `public/${normalizeSiteFileName(name)}`,
            content,
            getGeneratedSiteContentType(name),
          );
        }
        await pruneGeneratedPublicFiles(c.env, site.id, generatedFiles);
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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const profile = JSON.parse(meJson) as Me3SiteProfile;
    const pageMetaBySource = buildContentMetaMap(profile.pages || [], "");
    const postMetaBySource = buildContentMetaMap(profile.posts || [], "blog");
    const productMetaBySource = buildContentMetaMap(profile.products || [], "shop");
    const pages: Array<{ slug: string; title: string; content: string }> = [];
    const posts: Array<Record<string, unknown>> = [];
    const products: Array<Record<string, unknown>> = [];

    for (const file of sourceFiles) {
      if (!file.path.endsWith(".md")) continue;
      const sourceName = file.path.slice("src/".length);
      if (shouldIgnoreSiteSourceFile(sourceName)) continue;
      const slug = sourceName.slice(0, -".md".length);
      const leafSlug = slug.split("/").pop() || slug;
      const meta = slug.startsWith("blog/")
        ? postMetaBySource.get(sourceName)
        : slug.startsWith("shop/")
          ? productMetaBySource.get(sourceName)
          : pageMetaBySource.get(sourceName);
      if (!meta) continue;
      const item = {
        slug: leafSlug,
        title: typeof meta?.title === "string" && meta.title.trim()
          ? meta.title
          : titleFromSlug(slug),
        content: markdownToHtml(await arrayBufferToText(file.content)),
      };
      if (slug.startsWith("blog/")) {
        posts.push({
          ...item,
          type: meta?.type,
          media: meta?.media,
          publishedAt: meta?.publishedAt,
          excerpt: meta?.excerpt,
          draft: meta?.draft,
        });
      } else if (slug.startsWith("shop/")) {
        products.push({
          ...item,
          price: normalizeProductPriceCents(meta?.price),
          currency: normalizeProductCurrency(meta?.currency),
          available: typeof meta?.available === "boolean" ? meta.available : true,
          publishedAt: meta?.publishedAt,
          excerpt: meta?.excerpt,
          confirmationEmail: meta?.confirmationEmail,
        });
      }
      else pages.push(item);
    }

    return c.json({
      ok: true,
      profile,
      pages,
      posts,
      products,
    });
  });

  app.get("/api/sites/:username/preview-html", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const html =
      (await getSiteFileText(c.env, site.id, "landing/index.html")) ||
      (await getSiteFileText(c.env, site.id, "public/index.html"));
    if (!html) return c.body(null, 204);

    return c.html(injectBaseHref(html, `/preview/${site.username}/`));
  });

  app.get("/api/sites/:username/landing-page", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    if (!(await isCorePluginEnabled(c.env, LANDING_PAGES_PLUGIN_ID))) {
      return c.json({ error: "ME3 Landing Pages is coming soon" }, 403);
    }

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    if (!(await isCorePluginEnabled(c.env, LANDING_PAGES_PLUGIN_ID))) {
      return c.json({ error: "ME3 Landing Pages is coming soon" }, 403);
    }

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);

    const body = await c.req.json<{ page?: unknown }>().catch((): { page?: unknown } => ({}));
    const page = normalizeLandingPageDocument(body.page);
    if (!page) return c.json({ error: "Valid landing page is required" }, 400);

    await saveLandingPage(c.env, site, page);
    return c.json({ ok: true, page });
  });

  app.post("/api/agent/landing-pages/generate", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    if (!(await isCorePluginEnabled(c.env, LANDING_PAGES_PLUGIN_ID))) {
      return c.json({ error: "ME3 Landing Pages is coming soon" }, 403);
    }

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
        profileUrl: `${getCoreWebOrigin(c.env, c.req.url)}/sites/${site.username}`,
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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    const site = await getSiteForOwner(c.env, ownerId, c.req.param("username"));
    if (!site) return c.json({ error: "Site not found" }, 404);
    const cloudUsernameError = await getMe3CloudUsernamePublishBlockReason(c.env, site.username);
    if (cloudUsernameError) return c.json({ error: cloudUsernameError }, 409);
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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

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
}

export function registerPublicSiteRoutes(app: AppHono) {
  app.get("/preview/:username/*", async (c) => {
    const username = normalizeUsername(c.req.param("username"));
    const site = await getSiteByUsername(c.env, username);
    if (!site) return c.html(renderNotFoundPage("Site not found"), 404);

    const requestedPath = c.req.path.replace(`/preview/${username}/`, "") || "index.html";
    return serveSiteFileResponse(c.env, site, requestedPath, false);
  });

  app.get("/me", async (c) => {
    const canonicalUrl = new URL(c.req.url);
    canonicalUrl.pathname = `${canonicalUrl.pathname}/`;
    return c.redirect(canonicalUrl.toString(), 308);
  });

  app.get("/me/*", async (c) => {
    const requestedPath = c.req.path.replace(/^\/me\/?/, "") || "index.html";
    return serveDefaultPublicSitePath(c.env, c.req.raw, requestedPath);
  });

  app.get("/me.json", async (c) => {
    return serveMeJsonResponse(c.env, c.req.raw);
  });

  app.get("/.well-known/me.json", async (c) => {
    return serveMeJsonResponse(c.env, c.req.raw);
  });

  app.get("/.well-known/security.txt", (c) => {
    return c.text(buildSecurityTxt(c.req.url), 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  });

  app.get("/security.txt", (c) => {
    const canonicalUrl = new URL("/.well-known/security.txt", c.req.url);
    return c.redirect(canonicalUrl.toString(), 301);
  });
}

function normalizeShortEmailText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeLongEmailText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.round(numberValue);
}

function buildSecurityTxt(requestUrl: string): string {
  const url = new URL(requestUrl);
  const canonical = new URL("/.well-known/security.txt", url);
  canonical.protocol = "https:";
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const contact = new URL("/account", canonical).toString();

  return [
    `Contact: ${contact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${canonical.toString()}`,
    "",
  ].join("\n");
}
