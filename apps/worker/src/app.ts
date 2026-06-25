import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Me3UserAgent } from "./user-agent";
import {
  AiSettingsInputError,
  generateAiText,
  getAiRoutingSummary,
  getAiSettings,
  hasConfiguredAiProvider,
  type AiTextGenerationResult,
  type AiTextMessage,
  updateAiSettings,
} from "./ai-providers";
import {
  AiGatewayInputError,
  getAiGatewaySettings,
  updateAiGatewaySettings,
} from "./ai-gateway";
import {
  createAssistantJobBuilderAction,
  dispatchDueScheduledAssistantJobs,
  ensureDefaultAssistantJobs,
  markAssistantJobQueueMessageFailed,
  processAssistantJobQueueMessage,
  type AssistantJobBuilderAction,
} from "./assistant-jobs";
import {
  BOOKING_REMINDER_QUEUE_NAME,
  dispatchDueBookingReminders,
  processBookingReminderBatch,
} from "./booking-reminders";
import {
  EmailProviderInputError,
  getEmailProviderSettings,
  sendEmailProviderTest,
  sendEmailWithProvider,
  updateEmailProviderSettings,
  type EmailProviderAttachment,
} from "./email-providers";
import {
  addDaysToDateString,
  expandRecurringCalendarEvents,
  getUtcMsForLocalTime,
  normalizeEventRecurrenceRule,
  normalizeTimeZone as normalizeCalendarTimeZone,
  resolveTimeZone,
} from "./calendar";
import {
  CORE_PLUGIN_CATALOG_VERSION,
  PluginInstallInputError,
  activateCorePlugin,
  deactivateCorePlugin,
  isCorePluginEnabled,
  listCorePluginRecords,
  type CorePluginRecord,
} from "./plugins";
import { getCoreVersionInfo } from "./core-version";
import {
  SocialPublishingGateError,
  SocialPublishingInputError,
  appendContentItemMedia,
  completeSocialOAuth,
  createQueuedContentPublicationAndEnqueue,
  dispatchDueSocialPublications,
  getSocialPublishingRuntimeStatus,
  listSocialProviderSettings,
  listSocialPublishingAccounts,
  processSocialPublishBatch,
  SOCIAL_PUBLISH_QUEUE_NAME,
  startSocialOAuth,
  updateSocialProviderSettings,
} from "./social-publishing";
import {
  getOrCreateInstallEncryptionKey,
  getOrCreateInstallSessionSecret,
} from "./install-secrets";
import {
  CommerceSettingsInputError,
  getCommerceSettings,
  updateCommerceSettings,
} from "./commerce-settings";
import {
  TelegramSettingsInputError,
  getTelegramSettings,
  resolveTelegramBotToken,
  resolveTelegramBotTokenForInstall,
  resolveTelegramWebhookSecret,
  resolveTelegramWebhookSecretForInstall,
  updateTelegramSettings,
} from "./telegram-settings";
import {
  VoiceDictationInputError,
  transcribeVoiceDictation,
} from "./voice-dictation";
import { registerAccountsRoutes } from "./routes/accounts";
import { registerAssistantRoutes } from "./routes/assistant";
import { registerBookingRoutes } from "./routes/booking";
import { registerCalendarSourceRoutes } from "./routes/calendar-sources";
import { registerChannelRoutes } from "./routes/channels";
import { registerAssistantJobsRoutes } from "./routes/assistant-jobs";
import { registerAssistantSkillsRoutes } from "./routes/assistant-skills";
import { registerContactsRoutes } from "./routes/contacts";
import { registerCoreGithubUpdaterRoutes } from "./routes/core-github-updater";
import { registerJournalRoutes } from "./routes/journal";
import { registerLocalExecutorRoutes } from "./routes/local-executor";
import {
  handleInboundEmail,
  registerMailboxRoutes,
  type ForwardableEmailMessageLike,
} from "./routes/mailbox";
import { registerMissionControlRoutes } from "./routes/mission-control";
import { registerSchedulingRoutes } from "./routes/scheduling";
import { registerPublicSiteRoutes, registerSiteRoutes } from "./routes/sites";
import { registerUsernameRoutes } from "./routes/usernames";
import {
  getMe3KnowledgeSnapshot,
  type Me3KnowledgeRuntimeContext,
} from "@me3/knowledge";
import {
  activateAgentMailbox,
  cancelAgentReminder,
  convertAgentContactToClient,
  createAgentContentItem,
  createAgentMailboxDraft,
  createAgentSandboxTurnRecord,
  createAgentContact,
  createAgentReminder,
  deleteAgentContentItem,
  deleteAgentContact,
  getAgentContentStats,
  getAgentMailboxDraftForApproval,
  getAgentMailboxOutboundHeaders,
  getAgentMailboxOverview,
  listAgentContentItems,
  listAgentMailboxMessages,
  listAgentContacts,
  markAgentMailboxDraftFailed,
  markAgentMailboxDraftSent,
  moveAgentMailboxMessage,
  pauseAgentMailbox,
  queueAgentContentItem,
  rejectAgentMailboxDraft,
  reorderAgentContentQueue,
  serializeAgentReminder,
  setAgentMailboxMessageReadState,
  trashAgentMailboxMessage,
  unqueueAgentContentItem,
  updateAgentMailboxDraft,
  updateAgentContentItem,
  updateAgentContact,
  updateAgentContactOutreachStatus,
  updateAgentReminder,
  upsertAgentContact,
  upsertAgentMailbox,
  type AgentMailboxMessage,
  type AgentSandboxDispatchResponse,
  type AgentMailboxDraftInput,
  type AgentMailboxUpdateInput,
  type AgentReminderInput,
} from "./agent-chat";
import {
  dispatchAgentChannelTurn,
  getAgentChannelEventByProviderEventId,
  insertProviderChannelEvent,
  insertProviderChannelEventOnce,
} from "./agent-channels";
import { searchLocationQuery } from "./location-search";
import {
  createEmptyPublishManifest,
  deleteSiteFile,
  getAdminHost,
  getApiHost,
  getContentType,
  getCoreApiOrigin,
  getCoreWebOrigin,
  getCorsOrigin,
  getGeneratedSiteContentType,
  getMe3CloudApiOrigin,
  getMe3CloudOrigin,
  getMe3CloudUsernamePublishBlockReason,
  getSiteFileText,
  getSiteHost,
  hostnameFromUrl,
  hostsMatch,
  imageExtension,
  isMissingSiteFilesTableError,
  isPublicSiteHost,
  loadPublishManifest,
  loadSiteSourceFiles,
  normalizeSiteFileName,
  originFromUrl,
  parseSiteProfile,
  pruneGeneratedPublicFiles,
  pruneUnreferencedSiteSourceFiles,
  putSiteFile,
  putSiteMediaFile,
  savePublishManifest,
  servePublicSiteRequest,
  sha256Text,
  shouldIgnoreSiteSourceFile,
  siteStorageSetupRequired,
  titleFromSlug,
  type PublishManifest,
} from "./sites";
import { generateSiteHtml, type Me3SiteProfile } from "./site-generator";
import type {
  AssistantJobEventQueueMessage,
  BookingReminderQueueMessage,
  DbAgentChannelConnection,
  DbAgentChannelEvent,
  DbBooking,
  DbCalendarSource,
  DbCalendarSourceEvent,
  DbContact,
  DbMailboxAlias,
  DbSite,
  DbUserCalendarEvent,
  DbUserReminder,
  Env,
  OwnerProfile,
  SocialPublishQueueMessage,
} from "./types";

export { Me3UserAgent };
export { getMe3CloudUsernamePublishBlockReason };


type BootstrapBody = Partial<OwnerProfile> & { bootstrapCode?: string; password?: string };
type LoginBody = { email?: string; password?: string };
type BootstrapPasswordResetBody = {
  email?: string;
  bootstrapCode?: string;
  password?: string;
};
type Me3ClaimStartBody = {
  redirect?: string;
};
type Me3ClaimTokenPayload = {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  email?: unknown;
  name?: unknown;
  display_name?: unknown;
  handle?: unknown;
  install_id?: unknown;
  core_update_token?: unknown;
  core_origin?: unknown;
  callback_url?: unknown;
  state?: unknown;
  redirect_path?: unknown;
  claim_id?: unknown;
  iat?: unknown;
  exp?: unknown;
};
type Me3ClaimStateRecord = {
  state: string;
  redirect_path: string | null;
  install_id: string | null;
  expires_at: string;
};
type OwnerAuthState = {
  configured: boolean;
  passwordConfigured: boolean;
  me3Configured: boolean;
};
type Me3AppConnectionDetails = {
  connected: boolean;
  origin: string;
  disconnectAvailable: boolean;
  installId: string | null;
  coreOrigin: string;
  coreApiOrigin: string;
  meJsonUrl: string;
  meJsonSource: "core_install" | "hosted_profile";
};
type AccountUpdateBody = { timezone?: unknown; locale?: unknown };
type SessionPayload = { sub: string; iat: number; exp: number };
type OwnerRecord = OwnerProfile & { password_hash: string | null };
type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type AuthRateLimitPolicy = {
  route: string;
  maxAttempts: number;
  windowSeconds: number;
  lockoutSeconds: number;
};
type AuthRateLimitScope = {
  key: string;
  route: string;
  subjectHash: string;
};
type AuthRateLimitRecord = {
  attempt_count: number | string;
  window_started_at: string;
  locked_until: string | null;
};
const SESSION_COOKIE_NAME = "me3_core_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 100_000;
const ME3_CLOUD_OWNER_SECRET_NAME = "ME3_CLOUD_OWNER_ID";
const ME3_CLOUD_CORE_TOKEN_SECRET_NAME = "ME3_CLOUD_CORE_TOKEN";
const ME3_CORE_INSTALL_ID_SECRET_NAME = "ME3_CORE_INSTALL_ID";
const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;
const ME3_CORE_INSTALL_ID_REGEX =
  /^core_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ASSISTANT_ATTACHMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ASSISTANT_TEXT_ATTACHMENT_BYTES = 1 * 1024 * 1024;
const MAX_ASSISTANT_ATTACHMENT_UPLOAD_COUNT = 4;
const MAX_ASSISTANT_EXTRACTED_TEXT_CHARS = 48_000;
const AUTH_RATE_LIMITS = {
  claimStart: {
    route: "auth.me3_claim_start",
    maxAttempts: 20,
    windowSeconds: 10 * 60,
    lockoutSeconds: 10 * 60,
  },
  bootstrap: {
    route: "auth.bootstrap",
    maxAttempts: 5,
    windowSeconds: 15 * 60,
    lockoutSeconds: 30 * 60,
  },
  login: {
    route: "auth.login",
    maxAttempts: 10,
    windowSeconds: 15 * 60,
    lockoutSeconds: 15 * 60,
  },
  passwordReset: {
    route: "auth.password_reset_bootstrap",
    maxAttempts: 5,
    windowSeconds: 15 * 60,
    lockoutSeconds: 30 * 60,
  },
} satisfies Record<string, AuthRateLimitPolicy>;
const OWNER_APP_ROUTE_PREFIXES = [
  "/account",
  "/accounts",
  "/assistant",
  "/calendar",
  "/contacts",
  "/create",
  "/email",
  "/journal",
  "/login",
  "/mission-control",
  "/mission-control-projects",
  "/mission-control-wheel-of-life",
  "/sites",
  "/social",
  "/start",
];
const STRICT_TRANSPORT_SECURITY_HEADER = "max-age=31536000";

const app = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

app.onError((error, c) => {
  console.error(error);

  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json(
      {
        ok: false,
        error:
          c.env.ENVIRONMENT === "production"
            ? "Internal server error"
            : error instanceof Error
              ? error.message
              : "Internal server error",
      },
      500,
    );
  }

  return c.text("Internal Server Error", 500);
});

app.use("*", async (c, next) => {
  const requestUrl = new URL(c.req.url);
  if (shouldRedirectToHttps(requestUrl)) {
    requestUrl.protocol = "https:";
    return c.redirect(requestUrl.toString(), 301);
  }

  await next();
});

app.use(
  "*",
  cors({
    origin: (origin, c) => getCorsOrigin(c.env, c.req.url, origin),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  await next();
  applyResponseSecurityHeaders(c);
});

app.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (
    !isPublicDiscoveryPath(pathname) &&
    pathname.startsWith("/api/auth/") &&
    await isPublicSiteHost(c.env, c.req.url)
  ) {
    return c.json({ error: "Not found" }, 404);
  }
  if (
    !isPublicDiscoveryPath(pathname) &&
    !pathname.startsWith("/api/") &&
    await isPublicSiteHost(c.env, c.req.url)
  ) {
    return servePublicSiteRequest(c.env, c.req.raw);
  }
  await next();
});

app.get("/health", async (c) => {
  return c.json({
    ok: true,
    service: "me3-core",
    core: getCoreVersionInfo(),
    environment: getEnvironment(c.env),
    bindings: {
      db: Boolean(c.env.DB),
      userAgent: Boolean(c.env.ME3_USER_AGENT),
      workersAi: Boolean(c.env.AI),
    },
    hosts: {
      admin: getAdminHost(c.env, c.req.url),
      api: getApiHost(c.env, c.req.url),
      site: getSiteHost(c.env) || null,
    },
    setupRequired: await getSetupRequired(c.env),
  });
});

app.get("/api/config", async (c) => {
  const authState = await getOwnerAuthState(c.env);
  const aiRoutes = await getAiRoutingSummary(c.env, "owner");
  const cloudOrigin = getMe3CloudOrigin(c.env);

  return c.json({
    core: getCoreVersionInfo(),
    apiOrigin: getCoreApiOrigin(c.env, c.req.url),
    webOrigin: getCoreWebOrigin(c.env, c.req.url),
    adminHost: getAdminHost(c.env, c.req.url) || null,
    siteHost: getSiteHost(c.env) || null,
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
    me3Cloud: {
      origin: cloudOrigin,
      claimUrl: `${cloudOrigin}/core/claim`,
    },
    setupRequired: await getSetupRequired(c.env),
    ownerAuthConfigured: authState.configured,
    ownerPasswordAuthConfigured: authState.passwordConfigured,
    ownerMe3AuthConfigured: authState.me3Configured,
  });
});

app.get("/api/core/version", (c) => {
  return c.json(getCoreVersionInfo());
});

app.get("/api/commerce/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json({
    ok: true,
    ...(await getCommerceSettings(c.env, ownerId)),
  });
});

app.put("/api/commerce/settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json().catch(() => ({}));
  try {
    return c.json(await updateCommerceSettings(c.env, ownerId, body));
  } catch (error) {
    return commerceSettingsErrorResponse(c, error);
  }
});

registerBookingRoutes(app);
registerUsernameRoutes(app);

app.post("/api/auth/me3/start", async (c) => {
  const authState = await getOwnerAuthState(c.env);
  if (authState.passwordConfigured && !authState.me3Configured) {
    return c.json({ ok: false, error: "Connect a ME3 account from Account settings first" }, 409);
  }

  const body = await c.req.json<Me3ClaimStartBody>().catch((): Me3ClaimStartBody => ({}));
  return createMe3ClaimStartResponse(c, body.redirect);
});

app.get("/api/auth/me3/callback", async (c) => {
  const state = c.req.query("state")?.trim() || "";
  const claimToken = c.req.query("claim_token")?.trim() || "";

  if (!state || !claimToken) {
    return redirectMe3ClaimError(c, "missing_claim");
  }

  const pending = await getMe3ClaimState(c.env, state);
  if (!pending || new Date(pending.expires_at).getTime() <= Date.now()) {
    return redirectMe3ClaimError(c, "claim_expired");
  }

  let payload: Me3ClaimTokenPayload;
  try {
    payload = await verifyMe3ClaimToken(c.env, claimToken);
  } catch (error) {
    console.error("ME3 Cloud claim verification failed:", error);
    return redirectMe3ClaimError(c, "invalid_claim", pending.redirect_path);
  }

  const webOrigin = getCoreWebOrigin(c.env, c.req.url);
  const apiOrigin = getCoreApiOrigin(c.env, c.req.url);
  const callbackUrl = `${apiOrigin}/api/auth/me3/callback`;
  const claimedHandle = normalizeUsername(payload.handle);
  const claimedInstallId = normalizeMe3CoreInstallId(payload.install_id);

  if (
    payload.state !== state ||
    payload.aud !== "me3-core-install-claim" ||
    !pending.install_id ||
    claimedInstallId !== pending.install_id ||
    payload.core_origin !== webOrigin ||
    payload.callback_url !== callbackUrl ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    !payload.email.trim() ||
    !claimedHandle ||
    !USERNAME_REGEX.test(claimedHandle)
  ) {
    return redirectMe3ClaimError(c, "claim_mismatch", pending.redirect_path);
  }

  await upsertMe3ClaimedOwner(c.env, payload, claimedHandle);
  await getOrCreateInstallEncryptionKey(c.env);
  await deleteMe3ClaimState(c.env, state);
  await setOwnerSession(c, "owner");

  return c.redirect(
    normalizeClaimRedirect(c.req.query("redirect")) || pending.redirect_path || "/account",
  );
});

app.post("/api/admin/bootstrap", async (c) => {
  const body = await c.req.json<BootstrapBody>().catch((): BootstrapBody => ({}));
  const setupPassword = getSetupPassword(c.env);
  const rateLimitScope = await createAuthRateLimitScope(c, AUTH_RATE_LIMITS.bootstrap);
  const rateLimitBlock = await checkAuthRateLimit(c, rateLimitScope);
  if (rateLimitBlock) return rateLimitBlock;

  if (!setupPassword) {
    return c.json({ ok: false, error: "Owner auth is not configured" }, 503);
  }

  if (body.bootstrapCode !== setupPassword) {
    await recordAuthRateLimitAttempt(c.env, AUTH_RATE_LIMITS.bootstrap, rateLimitScope);
    return c.json({ ok: false, error: "Invalid setup password" }, 401);
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
    timezone:
      body.timezone !== undefined ? normalizeTimeZone(body.timezone) : null,
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
  await ensureDefaultAssistantJobs(c.env, owner.id);
  await clearAuthRateLimit(c.env, rateLimitScope);
  await setOwnerSession(c, owner.id);

  return c.json({ ok: true, owner });
});

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<LoginBody>().catch((): LoginBody => ({}));
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const rateLimitScope = await createAuthRateLimitScope(
    c,
    AUTH_RATE_LIMITS.login,
    email || "unknown-email",
  );
  const rateLimitBlock = await checkAuthRateLimit(c, rateLimitScope);
  if (rateLimitBlock) return rateLimitBlock;

  if (!email || !password) {
    return c.json({ ok: false, error: "Email and password are required" }, 400);
  }

  const owner = await getOwnerByEmail(c.env, email);
  if (!owner?.password_hash || !(await verifyPassword(password, owner.password_hash))) {
    await recordAuthRateLimitAttempt(c.env, AUTH_RATE_LIMITS.login, rateLimitScope);
    return c.json({ ok: false, error: "Invalid email or password" }, 401);
  }

  await clearAuthRateLimit(c.env, rateLimitScope);
  await setOwnerSession(c, owner.id);

  return c.json({ ok: true, owner: toPublicOwner(owner) });
});

app.post("/api/auth/password-reset/bootstrap", async (c) => {
  const body = await c.req
    .json<BootstrapPasswordResetBody>()
    .catch((): BootstrapPasswordResetBody => ({}));
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const setupPassword = getSetupPassword(c.env);
  const rateLimitScope = await createAuthRateLimitScope(c, AUTH_RATE_LIMITS.passwordReset);
  const rateLimitBlock = await checkAuthRateLimit(c, rateLimitScope);
  if (rateLimitBlock) return rateLimitBlock;

  if (!setupPassword) {
    return c.json({ ok: false, error: "Owner recovery is not configured" }, 503);
  }

  if (body.bootstrapCode !== setupPassword) {
    await recordAuthRateLimitAttempt(c.env, AUTH_RATE_LIMITS.passwordReset, rateLimitScope);
    return c.json({ ok: false, error: "Invalid setup password" }, 401);
  }

  if (!email) {
    return c.json({ ok: false, error: "Email is required" }, 400);
  }

  if (!password || password.length < 8) {
    return c.json({ ok: false, error: "Password must be at least 8 characters" }, 400);
  }

  const owner = await getOwnerByEmail(c.env, email);
  if (!owner) {
    await recordAuthRateLimitAttempt(c.env, AUTH_RATE_LIMITS.passwordReset, rateLimitScope);
    return c.json({ ok: false, error: "Owner account not found" }, 404);
  }

  await c.env.DB.prepare(
    "UPDATE owner_profile SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  )
    .bind(await hashPassword(password), owner.id)
    .run();

  await clearAuthRateLimit(c.env, rateLimitScope);
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

registerAssistantRoutes(app, { requireOwner, unauthorized, getSessionOwnerId, getSetupRequired });

app.get("/api/account", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const owner = await getOwnerProfile(c.env, ownerId);
  if (!owner) return c.json({ error: "Account not found" }, 404);

  return c.json({ user: serializeAccountOwner(owner) });
});

app.get("/api/account/app-connections", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json({
    me3: await getMe3AppConnectionDetails(c),
  });
});

app.post("/api/account/app-connections/me3/start", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<Me3ClaimStartBody>().catch((): Me3ClaimStartBody => ({}));
  return createMe3ClaimStartResponse(c, body.redirect || "/account?section=connections");
});

app.delete("/api/account/app-connections/me3", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const authState = await getOwnerAuthState(c.env);
  if (!authState.passwordConfigured) {
    return c.json(
      { ok: false, error: "Add password authentication before disconnecting ME3.app" },
      409,
    );
  }

  await deleteStoredMe3CloudOwnerId(c.env);
  return c.json({ ok: true });
});

app.get("/api/plugins", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json({
    catalogVersion: CORE_PLUGIN_CATALOG_VERSION,
    plugins: await listCorePluginRecords(c.env),
  });
});

app.get("/api/knowledge", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const [plugins, aiConfigured] = await Promise.all([
    listCorePluginRecords(c.env),
    hasConfiguredAiProvider(c.env, ownerId),
  ]);
  const snapshot = getMe3KnowledgeSnapshot(
    buildKnowledgeRuntimeContext(plugins, aiConfigured),
    plugins,
  );

  return c.json({
    ...snapshot,
    catalogVersion: CORE_PLUGIN_CATALOG_VERSION,
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

registerAccountsRoutes(app, { requireOwner, unauthorized });
registerJournalRoutes(app, { requireOwner, unauthorized });
registerMissionControlRoutes(app, { requireOwner, unauthorized });
registerLocalExecutorRoutes(app, { requireOwner, unauthorized, getCoreApiOrigin });
app.get("/api/social/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json({
    plugin: await getSocialPublishingRuntimeStatus(c.env),
    hostedOAuth: {
      configured: Boolean(c.env.ME3_SOCIAL_OAUTH_ORIGIN),
      platforms: c.env.ME3_SOCIAL_OAUTH_ORIGIN ? ["linkedin", "instagram"] : [],
    },
  });
});

app.get("/api/social/accounts", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json({
      plugin: await getSocialPublishingRuntimeStatus(c.env),
      accounts: await listSocialPublishingAccounts(c.env, ownerId),
    });
  } catch (error) {
    if (error instanceof SocialPublishingGateError) {
      return c.json(
        {
          ok: false,
          error: error.message,
          plugin: error.gate,
        },
        error.status as any,
      );
    }
    throw error;
  }
});

app.get("/api/social/provider-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json({
      providers: await listSocialProviderSettings(c.env, ownerId),
    });
  } catch (error) {
    if (error instanceof SocialPublishingGateError) {
      return c.json({ ok: false, error: error.message, plugin: error.gate }, error.status as any);
    }
    throw error;
  }
});

app.put("/api/social/provider-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    return c.json({
      providers: await updateSocialProviderSettings(
        c.env,
        ownerId,
        body as any,
        await getOrCreateInstallEncryptionKey(c.env),
      ),
    });
  } catch (error) {
    if (error instanceof SocialPublishingGateError) {
      return c.json({ ok: false, error: error.message, plugin: error.gate }, error.status as any);
    }
    if (error instanceof SocialPublishingInputError) {
      return c.json({ ok: false, error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.post("/api/social/:platform/authorize", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    return c.json(
      await startSocialOAuth(
        c.env,
        ownerId,
        { ...(body && typeof body === "object" ? body : {}), platform: c.req.param("platform") },
        {
          apiOrigin: getCoreApiOrigin(c.env, c.req.url),
          hostedOAuthOrigin: c.env.ME3_SOCIAL_OAUTH_ORIGIN || null,
        },
      ),
    );
  } catch (error) {
    if (error instanceof SocialPublishingGateError) {
      return c.json({ ok: false, error: error.message, plugin: error.gate }, error.status as any);
    }
    if (error instanceof SocialPublishingInputError) {
      return c.json({ ok: false, error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.get("/api/social/:platform/callback", async (c) => {
  try {
    const redirect = await completeSocialOAuth(
      c.env,
      c.req.param("platform"),
      {
        code: c.req.query("code"),
        state: c.req.query("state"),
        error: c.req.query("error"),
        handoff: c.req.query("handoff"),
      },
      {
        apiOrigin: getCoreApiOrigin(c.env, c.req.url),
        webOrigin: getCoreWebOrigin(c.env, c.req.url),
        fetch,
        installKey: await getOrCreateInstallEncryptionKey(c.env),
        hostedOAuthOrigin: c.env.ME3_SOCIAL_OAUTH_ORIGIN || null,
      },
    );
    return c.redirect(redirect);
  } catch (error) {
    if (error instanceof SocialPublishingInputError) {
      const url = new URL("/social", getCoreWebOrigin(c.env, c.req.url));
      url.searchParams.set("social_error", error.message);
      return c.redirect(url.toString());
    }
    throw error;
  }
});

app.get("/api/content/items", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json({
      items: await listAgentContentItems(
        c.env,
        ownerId,
        c.req.query("siteId"),
        c.req.query("status"),
      ),
    });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.get("/api/content/stats", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    const stats = await getAgentContentStats(c.env, ownerId, c.req.query("siteId"));
    if (!stats) return c.json({ error: "Site not found" }, 404);
    return c.json({ stats });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.post("/api/content/items", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    return c.json({ ok: true, item: await createAgentContentItem(c.env, ownerId, body as any) }, 201);
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.put("/api/content/items/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    const item = await updateAgentContentItem(c.env, ownerId, c.req.param("id"), body as any);
    if (!item) return c.json({ error: "Content item not found" }, 404);
    return c.json({ ok: true, item });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.delete("/api/content/items/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    const ok = await deleteAgentContentItem(c.env, ownerId, c.req.param("id"));
    if (!ok) return c.json({ error: "Content item not found" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.post("/api/content/items/:id/queue", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    const item = await queueAgentContentItem(c.env, ownerId, c.req.param("id"));
    if (!item) return c.json({ error: "Content item not found" }, 404);
    return c.json({ ok: true, item });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.post("/api/content/items/:id/unqueue", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    const item = await unqueueAgentContentItem(c.env, ownerId, c.req.param("id"));
    if (!item) return c.json({ error: "Content item not found" }, 404);
    return c.json({ ok: true, item });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.put("/api/content/queue/reorder", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = (await c.req.json<unknown>().catch((): unknown => ({}))) as {
    siteId?: unknown;
    itemIds?: unknown;
  };
  try {
    return c.json({
      ok: true,
      items: await reorderAgentContentQueue(c.env, ownerId, body.siteId, body.itemIds),
    });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
  }
});

app.post("/api/content/items/:id/media", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return c.json({ error: "Image file is required" }, 400);
    if (!file.type.startsWith("image/")) return c.json({ error: "Only image uploads are supported" }, 400);
    if (file.size > 5 * 1024 * 1024) return c.json({ error: "File must be less than 5MB" }, 400);

    const itemId = c.req.param("id");
    const itemRows = await c.env.DB.prepare(
      `SELECT c.site_id, s.username, s.user_id, s.site_type, s.template_id,
              s.custom_domain, s.custom_domain_status, s.custom_domain_cf_id,
              s.created_at, s.updated_at, s.published_at
       FROM content_bank_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = ? AND c.user_id = ?`,
    )
      .bind(itemId, ownerId)
      .first<DbSite & { site_id: string }>();
    if (!itemRows) return c.json({ error: "Content item not found" }, 404);

    const ext = imageExtension(file);
    const rawIndex = Number(formData.get("assetIndex"));
    const assetIndex = Number.isFinite(rawIndex) && rawIndex > 0 ? Math.round(rawIndex) : 1;
    const filename = `content-${itemId}-${assetIndex}.${ext}`;
    const buffer = await file.arrayBuffer();
    await putSiteMediaFile(c.env, itemRows, `public/files/${filename}`, buffer, file.type);
    const publicPath = `files/${filename}`;
    const asset = {
      url: `/preview/${itemRows.username}/${publicPath}`,
      filename,
      mimeType: file.type,
      kind: "image" as const,
      path: publicPath,
      assetIndex,
    };
    const item = await appendContentItemMedia(c.env, ownerId, itemId, asset);
    if (!item) return c.json({ error: "Content item not found" }, 404);
    return c.json({ ok: true, asset, item });
  } catch (error) {
    if (isMissingSiteFilesTableError(error)) return siteStorageSetupRequired(c);
    return socialPublishingErrorResponse(c, error);
  }
});

app.post("/api/content/items/:id/publish", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    const result = await createQueuedContentPublicationAndEnqueue(
      c.env,
      ownerId,
      c.req.param("id"),
    );
    if (!result) return c.json({ error: "Content item not found" }, 404);
    return c.json({ ok: true, item: result.item, publicationIds: result.publicationIds });
  } catch (error) {
    return socialPublishingErrorResponse(c, error);
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

app.get("/api/ai-gateway-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json(await getAiGatewaySettings(c.env, ownerId));
});

app.put("/api/ai-gateway-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    return c.json(await updateAiGatewaySettings(c.env, ownerId, body));
  } catch (error) {
    if (error instanceof AiGatewayInputError) {
      return c.json({ error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.get("/api/email-provider-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json(await getEmailProviderSettings(c.env, ownerId));
});

app.put("/api/email-provider-settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    return c.json(await updateEmailProviderSettings(c.env, ownerId, body));
  } catch (error) {
    if (error instanceof EmailProviderInputError) {
      return c.json({ error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.post("/api/email-provider-settings/test", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const owner = await getOwnerProfile(c.env, ownerId);
  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  try {
    return c.json(await sendEmailProviderTest(c.env, ownerId, owner?.email, body));
  } catch (error) {
    if (error instanceof EmailProviderInputError) {
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

registerSiteRoutes(app, { requireOwner, unauthorized });

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
       WHERE user_id = ? AND recurrence_rule IS NOT NULL
       ORDER BY starts_at ASC`,
    )
      .bind(ownerId)
      .all<DbUserCalendarEvent>(),
    c.env.DB.prepare(
      `SELECT id, user_id, kind, name, original_filename, encrypted_source_url,
              source_url_hint, imported_event_count, last_synced_at,
              last_sync_error, created_at
       FROM calendar_sources
       WHERE user_id = ? AND status = 'active'
       ORDER BY name ASC`,
    )
      .bind(ownerId)
      .all<DbCalendarSource>(),
    c.env.DB.prepare(
      `SELECT cse.id, cse.source_id, cse.external_key, cse.external_uid, cse.title,
              cse.notes, cse.location, cse.starts_at, cse.ends_at, cse.timezone,
              cse.all_day, cse.is_busy, cse.created_at, cs.name AS source_name
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
    reminders: (reminders.results || []).map(serializeAgentReminder),
    events: [
      ...(events.results || []),
      ...expandRecurringCalendarEvents(recurringEvents.results || [], window.start, window.end),
    ]
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .map(serializeCalendarEvent),
    sources: (sources.results || []).map(serializeCalendarSource),
    importedEvents: (importedEvents.results || []).map(serializeImportedCalendarEvent),
  });
});

app.post("/api/calendar/events", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const parsed = await parseCalendarEventBody(c);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO user_calendar_events
       (id, user_id, title, notes, location, starts_at, ends_at, timezone, all_day, kind, recurrence_rule)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      parsed.title,
      parsed.notes,
      parsed.location,
      parsed.startsAt,
      parsed.endsAt,
      parsed.timezone,
      parsed.allDay ? 1 : 0,
      parsed.kind,
      parsed.recurrenceRule,
    )
    .run();

  return c.json({
    ok: true,
    event: {
      id,
      title: parsed.title,
      notes: parsed.notes,
      location: parsed.location,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      timezone: parsed.timezone,
      allDay: parsed.allDay,
      kind: parsed.kind,
      recurrenceRule: parsed.recurrenceRule,
      sourceId: null,
      sourceName: parsed.kind === "birthday" ? "Birthdays" : "Personal events",
      sourceKind: "native",
    },
  });
});

app.put("/api/calendar/events/:eventId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const eventId = c.req.param("eventId");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM user_calendar_events WHERE id = ? AND user_id = ?",
  )
    .bind(eventId, ownerId)
    .first<{ id: string }>();
  if (!existing) return c.json({ error: "Event not found" }, 404);

  const parsed = await parseCalendarEventBody(c);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  await c.env.DB.prepare(
    `UPDATE user_calendar_events
     SET title = ?, notes = ?, location = ?, starts_at = ?, ends_at = ?,
         timezone = ?, all_day = ?, kind = ?, recurrence_rule = ?,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      parsed.title,
      parsed.notes,
      parsed.location,
      parsed.startsAt,
      parsed.endsAt,
      parsed.timezone,
      parsed.allDay ? 1 : 0,
      parsed.kind,
      parsed.recurrenceRule,
      eventId,
      ownerId,
    )
    .run();

  return c.json({
    ok: true,
    event: {
      id: eventId,
      title: parsed.title,
      notes: parsed.notes,
      location: parsed.location,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      timezone: parsed.timezone,
      allDay: parsed.allDay,
      kind: parsed.kind,
      recurrenceRule: parsed.recurrenceRule,
      sourceId: null,
      sourceName: parsed.kind === "birthday" ? "Birthdays" : "Personal events",
      sourceKind: "native",
    },
  });
});

app.delete("/api/calendar/events/:eventId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await c.env.DB.prepare(
    "DELETE FROM user_calendar_events WHERE id = ? AND user_id = ?",
  )
    .bind(c.req.param("eventId"), ownerId)
    .run();
  if ((result.meta?.changes || 0) === 0) return c.json({ error: "Event not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/agent/reminders", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<AgentReminderInput>().catch((): AgentReminderInput => ({}));
  const reminder = await createAgentReminder(c.env, ownerId, body);
  if ("error" in reminder) return c.json({ error: reminder.error }, 400);

  return c.json({ ok: true, reminder });
});

app.put("/api/agent/reminders/:reminderId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<AgentReminderInput>().catch((): AgentReminderInput => ({}));
  const reminder = await updateAgentReminder(
    c.env,
    ownerId,
    c.req.param("reminderId"),
    body,
  );
  if ("error" in reminder) {
    return c.json({ error: reminder.error }, (reminder.status || 400) as any);
  }

  return c.json({ ok: true, reminder });
});

app.put("/api/agent/reminders/:reminderId/cancel", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await cancelAgentReminder(c.env, ownerId, c.req.param("reminderId"));
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

registerMailboxRoutes(app, { requireOwner, unauthorized });

registerChannelRoutes(app, { requireOwner, unauthorized });

registerSchedulingRoutes(app, { requireOwner, unauthorized });

registerCalendarSourceRoutes(app, { requireOwner, unauthorized });

registerContactsRoutes(app, { requireOwner, unauthorized });

registerCoreGithubUpdaterRoutes(app, { requireOwner, unauthorized });

registerPublicSiteRoutes(app);

app.notFound(async (c) => {
  if (await isPublicSiteHost(c.env, c.req.url)) {
    return servePublicSiteRequest(c.env, c.req.raw);
  }
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("Not found", 404);
});

function normalizeClaimRedirect(value: unknown): string {
  if (typeof value !== "string") return "";
  const redirect = value.trim();
  if (!redirect || redirect.length > 500) return "";
  if (redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
  return "";
}

async function requireOwner(c: AppContext): Promise<string | null> {
  return getSessionOwnerId(c);
}

function unauthorized(c: AppContext) {
  return c.json({ ok: false, error: "Authentication required" }, 401);
}

async function createAuthRateLimitScope(
  c: AppContext,
  policy: AuthRateLimitPolicy,
  discriminator = "",
): Promise<AuthRateLimitScope> {
  const clientKey = getRateLimitClientKey(c);
  const subject = discriminator ? `${clientKey}|${discriminator}` : clientKey;
  const subjectHash = await sha256Text(subject);
  return {
    key: `${policy.route}:${subjectHash}`,
    route: policy.route,
    subjectHash,
  };
}

async function checkAuthRateLimit(
  c: AppContext,
  scope: AuthRateLimitScope,
): Promise<Response | null> {
  const row = await getAuthRateLimitRecord(c.env, scope.key);
  const lockedUntilMs = row?.locked_until ? new Date(row.locked_until).getTime() : 0;
  if (!Number.isFinite(lockedUntilMs) || lockedUntilMs <= Date.now()) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1000));
  c.header("Retry-After", String(retryAfterSeconds));
  return c.json(
    {
      ok: false,
      error: "Too many attempts. Try again later.",
      retryAfterSeconds,
    },
    429,
  );
}

async function recordAuthRateLimitAttempt(
  env: Env,
  policy: AuthRateLimitPolicy,
  scope: AuthRateLimitScope,
): Promise<void> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const existing = await getAuthRateLimitRecord(env, scope.key);
  const windowStartedMs = existing?.window_started_at
    ? new Date(existing.window_started_at).getTime()
    : 0;
  const windowActive =
    Number.isFinite(windowStartedMs) &&
    windowStartedMs > 0 &&
    windowStartedMs + policy.windowSeconds * 1000 > nowMs;
  const attemptCount = windowActive ? Number(existing?.attempt_count || 0) + 1 : 1;
  const windowStartedAt = windowActive ? existing!.window_started_at : nowIso;
  const lockedUntil =
    attemptCount >= policy.maxAttempts
      ? new Date(nowMs + policy.lockoutSeconds * 1000).toISOString()
      : null;

  await env.DB.prepare(
    `INSERT INTO auth_rate_limits
       (key, route, subject_hash, attempt_count, window_started_at, locked_until, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempt_count = excluded.attempt_count,
       window_started_at = excluded.window_started_at,
       locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`,
  )
    .bind(
      scope.key,
      scope.route,
      scope.subjectHash,
      attemptCount,
      windowStartedAt,
      lockedUntil,
      nowIso,
      nowIso,
    )
    .run();
}

async function clearAuthRateLimit(env: Env, scope: AuthRateLimitScope): Promise<void> {
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE key = ?")
    .bind(scope.key)
    .run();
}

async function getAuthRateLimitRecord(
  env: Env,
  key: string,
): Promise<AuthRateLimitRecord | null> {
  const result = await env.DB.prepare(
    `SELECT attempt_count, window_started_at, locked_until
     FROM auth_rate_limits
     WHERE key = ?`,
  )
    .bind(key)
    .first<AuthRateLimitRecord>();

  return result ?? null;
}

function getRateLimitClientKey(c: AppContext): string {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp =
    c.req.header("cf-connecting-ip")?.trim() ||
    forwardedFor ||
    c.req.header("x-real-ip")?.trim();
  if (clientIp) return `ip:${clientIp}`;

  return `host:${hostnameFromUrl(c.req.url) || "unknown"}`;
}

function applyResponseSecurityHeaders(c: AppContext) {
  const requestUrl = new URL(c.req.url);
  const pathname = requestUrl.pathname;

  setDefaultHeader(c, "X-Content-Type-Options", "nosniff");
  setDefaultHeader(c, "Referrer-Policy", "strict-origin-when-cross-origin");
  if (requestUrl.protocol === "https:") {
    setDefaultHeader(c, "Strict-Transport-Security", STRICT_TRANSPORT_SECURITY_HEADER);
  }

  if (pathname.startsWith("/api/")) {
    setDefaultHeader(c, "Cache-Control", "no-store");
  }

  if (isOwnerSurfaceRequest(c, pathname)) {
    setDefaultHeader(c, "X-Frame-Options", "DENY");
    setDefaultHeader(c, "Content-Security-Policy", "frame-ancestors 'none'");
  }
}

function setDefaultHeader(c: AppContext, name: string, value: string) {
  if (!c.res.headers.has(name)) c.header(name, value);
}

function shouldRedirectToHttps(requestUrl: URL): boolean {
  return requestUrl.protocol === "http:" && !isLocalDevelopmentHost(requestUrl.hostname);
}

function isLocalDevelopmentHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  );
}

function isPublicDiscoveryPath(pathname: string): boolean {
  return (
    pathname === "/me.json" ||
    pathname === "/.well-known/me.json" ||
    pathname === "/security.txt" ||
    pathname === "/.well-known/security.txt"
  );
}

function isOwnerSurfaceRequest(c: AppContext, pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;

  if (
    OWNER_APP_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  const hasExplicitOwnerHost = Boolean(
    c.env.ME3_ADMIN_HOST ||
      c.env.ME3_API_HOST ||
      c.env.CORE_WEB_ORIGIN ||
      c.env.CORE_API_ORIGIN,
  );
  if (!hasExplicitOwnerHost) return false;

  const requestHost = hostnameFromUrl(c.req.url);
  return (
    hostsMatch(requestHost, getAdminHost(c.env, c.req.url)) ||
    hostsMatch(requestHost, getApiHost(c.env, c.req.url))
  );
}

function socialPublishingErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof SocialPublishingGateError) {
    return c.json({ ok: false, error: error.message, plugin: error.gate }, error.status as any);
  }
  if (error instanceof SocialPublishingInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}

function commerceSettingsErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof CommerceSettingsInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeShortText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeLongText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeEmail(value: unknown): string {
  const email = normalizeShortText(value, 254).toLowerCase();
  return EMAIL_REGEX.test(email) ? email : "";
}

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOwnerDisplayName(value: unknown): string | null {
  const normalized = normalizeNullableText(value)?.replace(/\s+/g, " ");
  if (!normalized || normalized.length > 120) return null;
  if (EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

function humanizeEmailLocalPart(email: string): string | null {
  const localPart = email.split("@")[0]?.split("+")[0] || "";
  const withoutTrailingDigits = localPart.replace(/\d+$/g, "");
  const source = withoutTrailingDigits || localPart;
  const words = source
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]+/g, ""))
    .filter((word) => word.length > 0);

  if (words.length === 0) return null;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
  const storedTimezone = normalizeTimeZone(owner.timezone);
  const effectiveTimezone = storedTimezone || "UTC";
  const explicitLocale = owner.locale?.trim() || null;

  return {
    id: owner.id,
    email: owner.email,
    name: owner.name || "ME3 Core Owner",
    username: owner.username || "owner",
    timezone: storedTimezone,
    locale: explicitLocale || inferLocaleFromTimeZone(effectiveTimezone),
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

async function parseCalendarEventBody(c: AppContext): Promise<
  | {
      title: string;
      notes: string | null;
      location: string | null;
      startsAt: string;
      endsAt: string;
      timezone: string;
      allDay: boolean;
      kind: "event" | "birthday";
      recurrenceRule: string | null;
    }
  | { error: string }
> {
  const body = (await c.req.json().catch(() => null)) as {
    title?: unknown;
    notes?: unknown;
    location?: unknown;
    startDate?: unknown;
    startTime?: unknown;
    endDate?: unknown;
    endTime?: unknown;
    timezone?: unknown;
    allDay?: unknown;
    kind?: unknown;
    recurrenceRule?: unknown;
  } | null;

  const title = normalizeNullableText(body?.title);
  const notes = normalizeNullableText(body?.notes);
  const location = normalizeNullableText(body?.location);
  const startDate = typeof body?.startDate === "string" ? body.startDate.trim() : "";
  const endDate = typeof body?.endDate === "string" ? body.endDate.trim() : "";
  const startTime = typeof body?.startTime === "string" ? body.startTime.trim() : "";
  const endTime = typeof body?.endTime === "string" ? body.endTime.trim() : "";
  const kind = body?.kind === "birthday" ? "birthday" : "event";
  const allDay = kind === "birthday" ? true : body?.allDay === true;

  if (!title) return { error: "Title is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "Start and end dates must be in YYYY-MM-DD format" };
  }
  if (!allDay && (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime))) {
    return { error: "Start and end times must be in HH:MM format" };
  }

  const timezone = normalizeCalendarTimeZone(body?.timezone) || "UTC";
  const recurrenceRuleInput =
    typeof body?.recurrenceRule === "string"
      ? body.recurrenceRule.trim().toLowerCase()
      : body?.recurrenceRule;
  const recurrenceRule = normalizeEventRecurrenceRule(
    body?.recurrenceRule,
    kind,
    startDate,
  );
  if (recurrenceRuleInput && recurrenceRuleInput !== "none" && !recurrenceRule) {
    return { error: "Invalid recurrence value" };
  }

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [startHour, startMinute] = allDay ? [0, 0] : startTime.split(":").map(Number);
  const [endHour, endMinute] = allDay ? [0, 0] : endTime.split(":").map(Number);
  const normalizedEndDate = allDay ? addDaysToDateString(endDate, 1) : endDate;
  const [endYear, endMonth, endDay] = normalizedEndDate.split("-").map(Number);

  const startsAt = new Date(
    getUtcMsForLocalTime(
      { year: startYear, month: startMonth, day: startDay, hour: startHour, minute: startMinute },
      timezone,
    ),
  ).toISOString();
  const endsAt = new Date(
    getUtcMsForLocalTime(
      { year: endYear, month: endMonth, day: endDay, hour: endHour, minute: endMinute },
      timezone,
    ),
  ).toISOString();

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return { error: "End must be after start" };
  }

  return {
    title,
    notes,
    location,
    startsAt,
    endsAt,
    timezone,
    allDay,
    kind,
    recurrenceRule,
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
    sourceUrlHint: source.source_url_hint ?? null,
    importedEventCount: source.imported_event_count,
    lastSyncedAt: source.last_synced_at ?? null,
    lastSyncError: source.last_sync_error ?? null,
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

async function getOwnerProfile(env: Env, ownerId: string): Promise<OwnerRecord | null> {
  const result = await env.DB.prepare(
    "SELECT id, email, name, username, bio, avatar_url, timezone, locale, assistant_name, password_hash FROM owner_profile WHERE id = ?",
  )
    .bind(ownerId)
    .first<OwnerRecord>();

  return result ?? null;
}

async function getOwnerByEmail(env: Env, email: string): Promise<OwnerRecord | null> {
  const result = await env.DB.prepare(
    "SELECT id, email, name, username, bio, avatar_url, timezone, locale, assistant_name, password_hash FROM owner_profile WHERE lower(email) = ?",
  )
    .bind(email)
    .first<OwnerRecord>();

  return result ?? null;
}

async function createMe3ClaimStartResponse(c: AppContext, rawRedirect?: unknown): Promise<Response> {
  const rateLimitScope = await createAuthRateLimitScope(c, AUTH_RATE_LIMITS.claimStart);
  const rateLimitBlock = await checkAuthRateLimit(c, rateLimitScope);
  if (rateLimitBlock) return rateLimitBlock;
  await recordAuthRateLimitAttempt(c.env, AUTH_RATE_LIMITS.claimStart, rateLimitScope);

  const webOrigin = getCoreWebOrigin(c.env, c.req.url);
  const apiOrigin = getCoreApiOrigin(c.env, c.req.url);
  const installId = await getOrCreateMe3CoreInstallId(c.env);
  const state = crypto.randomUUID();
  const claimUrl = new URL("/core/claim", getMe3CloudOrigin(c.env));
  const redirect = normalizeClaimRedirect(rawRedirect);

  await storeMe3ClaimState(c.env, state, redirect, installId);

  claimUrl.searchParams.set("install_id", installId);
  claimUrl.searchParams.set("core_origin", webOrigin);
  claimUrl.searchParams.set("callback_url", `${apiOrigin}/api/auth/me3/callback`);
  claimUrl.searchParams.set("state", state);

  if (redirect) {
    claimUrl.searchParams.set("redirect", redirect);
  }

  return c.json({
    ok: true,
    url: claimUrl.toString(),
    state,
  });
}

async function getOwnerAuthState(env: Env): Promise<OwnerAuthState> {
  const result = await env.DB.prepare(
    "SELECT id, password_hash FROM owner_profile WHERE id = ?",
  )
    .bind("owner")
    .first<{ id: string; password_hash: string | null }>();
  const passwordConfigured = Boolean(result?.password_hash);
  const me3Configured = Boolean(await getStoredMe3CloudOwnerId(env));
  const configured = passwordConfigured || me3Configured;

  return {
    configured,
    passwordConfigured,
    me3Configured,
  };
}

async function getMe3AppConnectionDetails(c: AppContext): Promise<Me3AppConnectionDetails> {
  const authState = await getOwnerAuthState(c.env);
  const coreOrigin = getCoreWebOrigin(c.env, c.req.url);
  const storedInstallId = await getStoredMe3CoreInstallId(c.env);

  return {
    connected: authState.me3Configured,
    origin: getMe3CloudOrigin(c.env),
    disconnectAvailable: authState.passwordConfigured,
    installId:
      storedInstallId ||
      (authState.me3Configured ? await getOrCreateMe3CoreInstallId(c.env) : null),
    coreOrigin,
    coreApiOrigin: getCoreApiOrigin(c.env, c.req.url),
    meJsonUrl: `${coreOrigin}/.well-known/me.json`,
    meJsonSource: authState.me3Configured ? "core_install" : "hosted_profile",
  };
}

async function getOwnerAuthConfigured(env: Env): Promise<boolean> {
  return (await getOwnerAuthState(env)).configured;
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
    assistant_name: owner.assistant_name ?? null,
  };
}

async function storeMe3ClaimState(
  env: Env,
  state: string,
  redirectPath: string,
  installId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO me3_install_claim_states (state, redirect_path, install_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(state) DO UPDATE SET
       redirect_path = excluded.redirect_path,
       install_id = excluded.install_id,
       expires_at = excluded.expires_at`,
  )
    .bind(state, redirectPath || null, installId, expiresAt)
    .run();
}

async function getMe3ClaimState(
  env: Env,
  state: string,
): Promise<Me3ClaimStateRecord | null> {
  const result = await env.DB.prepare(
    "SELECT state, redirect_path, install_id, expires_at FROM me3_install_claim_states WHERE state = ?",
  )
    .bind(state)
    .first<Me3ClaimStateRecord>();

  return result ?? null;
}

function normalizeMe3CoreInstallId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ME3_CORE_INSTALL_ID_REGEX.test(normalized) ? normalized : null;
}

async function getOrCreateMe3CoreInstallId(env: Env): Promise<string> {
  const existing = await getStoredMe3CoreInstallId(env);
  if (existing) return existing;

  const installId = `core_${crypto.randomUUID()}`;
  await setStoredInstallSecret(env, ME3_CORE_INSTALL_ID_SECRET_NAME, installId);
  return installId;
}

async function getStoredMe3CoreInstallId(env: Env): Promise<string | null> {
  const stored = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
    .bind(ME3_CORE_INSTALL_ID_SECRET_NAME)
    .first<{ value: string }>();
  return normalizeMe3CoreInstallId(stored?.value);
}

async function deleteMe3ClaimState(env: Env, state: string): Promise<void> {
  await env.DB.prepare("DELETE FROM me3_install_claim_states WHERE state = ?")
    .bind(state)
    .run();
}

function redirectMe3ClaimError(
  c: AppContext,
  code: string,
  redirectPath?: string | null,
): Response {
  const target = new URL(normalizeClaimRedirect(redirectPath) || "/", getCoreWebOrigin(c.env, c.req.url));
  target.searchParams.set("me3_claim_error", code);
  return c.redirect(target.toString());
}

async function upsertMe3ClaimedOwner(
  env: Env,
  payload: Me3ClaimTokenPayload,
  handle: string,
): Promise<void> {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const name =
    normalizeOwnerDisplayName(payload.name) ||
    normalizeOwnerDisplayName(payload.display_name) ||
    (email ? humanizeEmailLocalPart(email) : null) ||
    "ME3 Core Owner";

  await env.DB.prepare(
    `INSERT INTO owner_profile (id, email, name, username, bio, avatar_url, timezone, password_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       username = COALESCE(owner_profile.username, excluded.username),
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind("owner", email, name, handle, null, null, null, null)
    .run();

  await setStoredMe3CloudOwnerId(env, String(payload.sub));
  await ensureDefaultAssistantJobs(env, "owner");
  if (typeof payload.core_update_token === "string" && payload.core_update_token.trim()) {
    await setStoredInstallSecret(
      env,
      ME3_CLOUD_CORE_TOKEN_SECRET_NAME,
      payload.core_update_token.trim(),
    );
  }
}

async function getStoredMe3CloudOwnerId(env: Env): Promise<string | null> {
  const result = await env.DB.prepare(
    "SELECT value FROM install_secrets WHERE name = ?",
  )
    .bind(ME3_CLOUD_OWNER_SECRET_NAME)
    .first<{ value: string }>();

  return result?.value || null;
}

async function setStoredMe3CloudOwnerId(env: Env, ownerId: string): Promise<void> {
  await setStoredInstallSecret(env, ME3_CLOUD_OWNER_SECRET_NAME, ownerId);
}

async function setStoredInstallSecret(
  env: Env,
  name: string,
  value: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO install_secrets (name, value, created_at, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(name) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(name, value)
    .run();
}

async function deleteStoredMe3CloudOwnerId(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM install_secrets WHERE name = ?")
    .bind(ME3_CLOUD_OWNER_SECRET_NAME)
    .run();
  await env.DB.prepare("DELETE FROM install_secrets WHERE name = ?")
    .bind(ME3_CLOUD_CORE_TOKEN_SECRET_NAME)
    .run();
}

async function setOwnerSession(c: AppContext, ownerId: string) {
  const sessionSecret = await getOrCreateInstallSessionSecret(c.env);

  const token = await signSessionToken(
    {
      sub: ownerId,
      iat: currentUnixTime(),
      exp: currentUnixTime() + SESSION_TTL_SECONDS,
    },
    sessionSecret,
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
  if (!token) return null;

  const payload = await verifySessionToken(
    token,
    await getOrCreateInstallSessionSecret(c.env),
  );
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

async function verifyMe3ClaimToken(env: Env, token: string): Promise<Me3ClaimTokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Claim token must be a JWT");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodeBase64Url(encodedHeader)) as JwtHeader;
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Claim token uses an unsupported signature");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Me3ClaimTokenPayload;
  const issuer = getMe3CloudApiOrigin(env);
  if (payload.iss !== issuer) throw new Error("Claim token issuer is invalid");
  if (typeof payload.exp !== "number" || payload.exp <= currentUnixTime()) {
    throw new Error("Claim token is expired");
  }

  const jwksResponse = await fetch(new URL("/.well-known/jwks.json", issuer).toString());
  if (!jwksResponse.ok) throw new Error("Could not fetch ME3 Cloud signing keys");

  const jwks = (await jwksResponse.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Claim token signing key was not found");

  const key = await crypto.subtle.importKey(
    "jwk",
    { ...jwk, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = decodeBase64UrlBytes(encodedSignature);
  const signature = new ArrayBuffer(signatureBytes.byteLength);
  new Uint8Array(signature).set(signatureBytes);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("Claim token signature is invalid");

  return payload;
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
  return getEnvironment(env) !== "local";
}

async function getSetupRequired(env: Env, ownerId = "owner"): Promise<string[]> {
  const missing: string[] = [];

  if (!getSetupPassword(env)) missing.push("SETUP_PASSWORD");
  if (!(await hasConfiguredAiProvider(env, ownerId))) {
    missing.push("AI_PROVIDER");
  }

  return missing;
}

function buildKnowledgeRuntimeContext(
  plugins: CorePluginRecord[],
  aiConfigured: boolean,
): Me3KnowledgeRuntimeContext {
  return {
    surface: "core",
    chatRuntime: "conversation_only",
    installedPluginIds: plugins
      .filter((plugin) => plugin.installed)
      .map((plugin) => plugin.id),
    enabledPluginIds: plugins
      .filter((plugin) => plugin.enabled && plugin.status === "installed")
      .map((plugin) => plugin.id),
    setupRequiredPluginIds: plugins
      .filter((plugin) => plugin.status === "setup_required")
      .map((plugin) => plugin.id),
    disabledPluginIds: plugins
      .filter((plugin) => plugin.status === "disabled")
      .map((plugin) => plugin.id),
    configuredFeatureIds: aiConfigured ? ["ai.chat_provider"] : [],
    missingFeatureIds: aiConfigured ? [] : ["ai.chat_provider"],
  };
}

function getEnvironment(env: Env): string {
  return env.ENVIRONMENT || "production";
}

function getSetupPassword(env: Env): string | undefined {
  return env.SETUP_PASSWORD;
}

export default app;
