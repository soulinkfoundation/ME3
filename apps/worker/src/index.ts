import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Me3UserAgent } from "./user-agent";
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
type ChatBody = { message?: string };
type AccountUpdateBody = { timezone?: unknown; locale?: unknown };
type SessionPayload = { sub: string; iat: number; exp: number };
type OwnerRecord = OwnerProfile & { password_hash: string | null };
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
const MAILBOX_FOLDERS = new Set(["inbox", "drafts", "sent", "archive", "trash"]);
const CONTACT_SOURCES = new Set(["booking", "manual", "agent", "import", "outreach", "soulink"]);
const CONTACT_RELATIONSHIPS = new Set(["client", "prospect", "contact"]);
const CONTACT_STATUSES = new Set(["active", "archived", "dormant"]);
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

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "me3-core",
    environment: c.env.ENVIRONMENT,
    bindings: {
      db: Boolean(c.env.DB),
      userAgent: Boolean(c.env.ME3_USER_AGENT),
      workersAi: Boolean(c.env.AI),
    },
    setupRequired: getSetupRequired(c.env),
  });
});

app.get("/api/config", async (c) => {
  const authConfigured = await getOwnerAuthConfigured(c.env);

  return c.json({
    apiOrigin: c.env.CORE_API_ORIGIN,
    webOrigin: c.env.CORE_WEB_ORIGIN,
    ai: {
      defaultProvider: c.env.ME3_AI_DEFAULT_PROVIDER ?? "not-configured",
      defaultModel: c.env.ME3_AI_DEFAULT_MODEL ?? "not-configured",
      chatProvider: c.env.ME3_AI_CHAT_PROVIDER ?? "not-configured",
      chatModel: c.env.ME3_AI_CHAT_MODEL ?? "not-configured",
    },
    setupRequired: getSetupRequired(c.env),
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
    setupRequired: getSetupRequired(c.env),
  });
});

app.get("/api/account", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const owner = await getOwnerProfile(c.env, ownerId);
  if (!owner) return c.json({ error: "Account not found" }, 404);

  return c.json({ user: serializeAccountOwner(owner) });
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
    sources: [],
    recentActivity: mailbox ? await getMailboxActivity(c.env, mailbox.id, 25, 0) : [],
  });
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
  const connection = await c.env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token, telegram_user_id, telegram_chat_id,
            telegram_username, telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at, updated_at
     FROM agent_channel_connections
     WHERE user_id = ? AND channel = 'telegram'`,
  )
    .bind(ownerId)
    .first<DbAgentChannelConnection>();
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

async function requireOwner(c: AppContext): Promise<string | null> {
  return getSessionOwnerId(c);
}

function unauthorized(c: AppContext) {
  return c.json({ ok: false, error: "Authentication required" }, 401);
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

function getSetupRequired(env: Env): string[] {
  const missing: string[] = [];

  if (!env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!env.TOKEN_ENCRYPTION_KEY) missing.push("TOKEN_ENCRYPTION_KEY");
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY && !env.AI) {
    missing.push("AI_PROVIDER");
  }

  return missing;
}

export default app;
