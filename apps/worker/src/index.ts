import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import Stripe from "stripe";
import { Me3UserAgent } from "./user-agent";
import {
  ACCOUNTS_PLUGIN_ID,
  AccountsInputError,
  createFinancialCategory,
  createFinancialEntry,
  deleteFinancialCategory,
  deleteFinancialEntry,
  exportFinancialEntriesCsv,
  getAccountsStripeStatus,
  getFinancialStats,
  importFinancialEntriesCsv,
  listFinancialCategories,
  listFinancialEntries,
  syncAccountsStripe,
  updateFinancialEntry,
} from "./accounts";
import {
  AiSettingsInputError,
  getAiRoutingSummary,
  getAiSettings,
  hasConfiguredAiProvider,
  updateAiSettings,
} from "./ai-providers";
import {
  AssistantJobsInputError,
  archiveAssistantJob,
  createAssistantJobBuilderAction,
  createAssistantJob,
  dispatchDueScheduledAssistantJobs,
  duplicateAssistantJob,
  getAssistantJob,
  listAssistantJobRecipes,
  listAssistantJobIngressEvents,
  listAssistantJobs,
  markAssistantJobQueueMessageFailed,
  processAssistantJobQueueMessage,
  recordAssistantJobIngressEvent,
  runAssistantJobNow,
  setAssistantJobPaused,
  updateAssistantJobIngressEvent,
  updateAssistantJob,
  type AssistantJobBuilderAction,
} from "./assistant-jobs";
import {
  AssistantSkillsInputError,
  createAssistantSkill,
  deleteAssistantSkill,
  listAssistantSkills,
  updateAssistantSkill,
} from "./assistant-skills";
import {
  BOOKING_REMINDER_QUEUE_NAME,
  dispatchDueBookingReminders,
  processBookingReminderBatch,
  scheduleBookingRemindersForBooking,
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
import { JOURNAL_PLUGIN_ID } from "@me3-core/plugin-journal";
import {
  JournalInputError,
  getJournalDay,
  listJournalArchive,
  updateJournalDay,
} from "./journal";
import { getCoreVersionInfo } from "./core-version";
import {
  MissionControlInputError,
  approveMissionMemory,
  archiveMissionTask,
  clearMissionActivity,
  createMissionContextSource,
  createMissionMemory,
  createMissionProject,
  createMissionTask,
  createMissionTaskLocalExecutorRun,
  createMissionWheelSnapshot,
  deleteMissionContextSource,
  deleteMissionMemory,
  getMissionDaemonStatus,
  getMissionDashboard,
  getMissionSetup,
  getMissionWheel,
  listMissionAgentRuns,
  listMissionApprovals,
  listMissionContextSources,
  listMissionMemory,
  listMissionTaskPage,
  listMissionPluginActivity,
  listMissionWheelSnapshots,
  listMissionProjects,
  listMissionDaemonAudit,
  resolveMissionApproval,
  startMissionDaemonPairing,
  submitMissionWeeklyReview,
  submitMissionWeeklyReviewTask,
  suggestMissionMemory,
  updateMissionContextSource,
  updateMissionDashboard,
  updateMissionMemory,
  updateMissionProject,
  updateMissionTask,
  updateMissionWheelSettings,
} from "./mission-control";
import {
  LocalExecutorInputError,
  appendLocalExecutorRunProgress,
  authenticateLocalExecutorDaemon,
  cancelLocalExecutorRun,
  claimLocalExecutorRun,
  completeLocalExecutorPairing,
  completeLocalExecutorRun,
  createLocalExecutorPolicy,
  createLocalExecutorRun,
  deleteLocalExecutorPolicy,
  getLocalExecutorRun,
  getLocalExecutorStatus,
  listLocalExecutorAudit,
  listLocalExecutorPolicies,
  recordLocalExecutorHeartbeat,
  retryLocalExecutorRun,
  startLocalExecutorPairing,
  updateLocalExecutorPolicy,
} from "./local-executor";
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
  getStripeSecretKey,
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
import {
  buildLandingPageDocument,
  LANDING_PAGES_PLUGIN_ID,
  getLandingPageTemplateId,
  normalizeLandingPageDocument,
  normalizeLandingTemplate,
  renderLandingPageHtml,
  type LandingPageDocument,
} from "@me3-core/plugin-landing-pages";
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
import { searchLocationQuery } from "./location-search";
import { generateSiteHtml, markdownToHtml, type Me3SiteProfile } from "./site-generator";
import type {
  AssistantJobEventQueueMessage,
  BookingReminderQueueMessage,
  DbAgentChannelConnection,
  DbAgentChannelEvent,
  DbBooking,
  DbCalendarSource,
  DbCalendarSourceEvent,
  DbMailboxAlias,
  DbSite,
  DbSubscriber,
  DbUserCalendarEvent,
  DbUserReminder,
  Env,
  OwnerProfile,
  SocialPublishQueueMessage,
} from "./types";

export { Me3UserAgent };

const DEFAULT_SOULINK_API_ORIGIN = "https://soulinkfoundation.org";

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
  handle?: unknown;
  install_id?: unknown;
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
type ChatBody = { message?: string };
type AssistantChatTurnBody = {
  messageText?: unknown;
  threadId?: unknown;
  projectId?: unknown;
  replyToMessageId?: unknown;
  model?: unknown;
  attachments?: unknown;
};
type AssistantChatTurnModelSelection = {
  providerId: "workers-ai" | "openai" | "anthropic";
  model: string;
  optionId: string | null;
};
type AssistantChatTurnStreamEvent =
  | "status"
  | "thread"
  | "delta"
  | "done"
  | "error";
type AssistantThreadRow = {
  id: string;
  owner_id: string;
  title: string;
  origin_surface: "assistant" | "launcher" | "soulink" | "job" | "system";
  project_id: string | null;
  status: "active" | "archived" | "deleted";
  pinned_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};
type AssistantMessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};
type SoulinkDispatchBody = {
  ownerSubject?: unknown;
  ownerNodeId?: unknown;
  assistantNodeId?: unknown;
  connectionId?: unknown;
  sourceEventId?: unknown;
  streamChannelType?: unknown;
  streamChannelId?: unknown;
  messageText?: unknown;
  replyToMessageId?: unknown;
  createdAt?: unknown;
};
type SoulinkProvisionResponse = {
  ok?: boolean;
  ownerNodeId?: string;
  assistantNodeId?: string;
  streamChannelType?: string;
  streamChannelId?: string;
  soulinkChatUrl?: string;
  error?: string;
};
type SoulinkLinksResponse = {
  links?: SoulinkLinkRecord[];
  error?: string;
};
type SoulinkLinkRecord = {
  id?: unknown;
  fromNodeId?: unknown;
  toNodeId?: unknown;
  sourceChatId?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  otherNode?: SoulinkLinkNodeRecord | null;
  context?: SoulinkLinkContextRecord | null;
};
type SoulinkLinkNodeRecord = {
  id?: unknown;
  displayName?: unknown;
  handle?: unknown;
  me3Url?: unknown;
  kind?: unknown;
  avatarUrl?: unknown;
  email?: unknown;
  contactEmail?: unknown;
};
type SoulinkLinkContextRecord = {
  sourceChatId?: unknown;
  sourceChatTitle?: unknown;
  sourceChatKind?: unknown;
  streamChannelId?: unknown;
  soulinkChatUrl?: unknown;
  chatUrl?: unknown;
  lastActiveAt?: unknown;
  label?: unknown;
};
type TelegramUser = {
  id?: unknown;
  is_bot?: unknown;
  username?: unknown;
  first_name?: unknown;
  last_name?: unknown;
};
type TelegramChat = {
  id?: unknown;
  type?: unknown;
};
type TelegramMessage = {
  message_id?: unknown;
  text?: unknown;
  chat?: TelegramChat;
  from?: TelegramUser;
  reply_to_message?: { message_id?: unknown };
};
type TelegramWebhookUpdate = {
  update_id?: unknown;
  message?: TelegramMessage;
};
type AccountUpdateBody = { timezone?: unknown; locale?: unknown };
type ForwardableEmailMessageLike = {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  readonly canBeForwarded: boolean;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
};
type LandingPageGenerateBody = {
  username?: string;
  brief?: string;
  templateId?: string;
  heroImage?: string | null;
  sectionImage?: string | null;
  feedback?: string | null;
};
type PaidBookingCheckoutBody = {
  offerId?: unknown;
  localDate?: unknown;
  localTime?: unknown;
  guestName?: unknown;
  guestEmail?: unknown;
  notes?: unknown;
  amount?: unknown;
  returnUrl?: unknown;
};
type FreeBookingBody = Omit<PaidBookingCheckoutBody, "amount" | "returnUrl">;
type PublicBookingConfirmBody = {
  offerId?: unknown;
  slotStart?: unknown;
  slotEnd?: unknown;
  guestName?: unknown;
  guestEmail?: unknown;
  notes?: unknown;
  paymentIntentId?: unknown;
};
type PaidBookingCompletionBody = {
  sessionId?: unknown;
};
type SessionPayload = { sub: string; iat: number; exp: number };
type OwnerRecord = OwnerProfile & { password_hash: string | null };
type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type PublishManifest = {
  version: 1;
  sourceFiles: Record<string, string>;
  assetFiles: Record<string, string>;
  updatedAt: string;
};
type SiteFileRecord = {
  site_id: string;
  path: string;
  content: ArrayBuffer | Uint8Array | number[] | Record<string, number>;
  content_type: string;
  size: number;
  sha256: string | null;
  updated_at: string;
};
type CoreBookingPricing = {
  enabled?: boolean;
  suggestedAmount?: number;
  currency?: string;
  allowFree?: boolean;
  allowFlexiblePricing?: boolean;
  minimumAmount?: number;
};
type CoreBookingOffer = {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  pricing?: CoreBookingPricing;
};
type CoreBookingAvailability = {
  timezone?: string;
  windows?: Record<string, string[]>;
};
type CoreBookIntent = NonNullable<Me3SiteProfile["intents"]>["book"] & {
  bufferTime?: number;
  offers?: CoreBookingOffer[];
  availability?: CoreBookingAvailability;
  reminders?: {
    enabled?: boolean;
    reminder24h?: boolean;
    reminder2h?: boolean;
  };
  bookingTypes?: Array<{
    type?: string;
    offers?: CoreBookingOffer[];
    availability?: CoreBookingAvailability;
  }>;
};
type ResolvedOneToOneBookingOffer = {
  id: string;
  title: string;
  duration: number;
  pricing?: CoreBookingPricing;
  availability: CoreBookingAvailability;
};
type ResolvedPaidBookingOffer = ResolvedOneToOneBookingOffer & {
  pricing: CoreBookingPricing;
};
type BookingHoldRecord = {
  id: string;
  site_id: string;
  booking_id: string | null;
  offer_id: string | null;
  booking_type: "one_to_one" | "class" | "retreat";
  hold_token: string;
  slot_start: string;
  slot_end: string;
  status: "active" | "confirmed" | "released" | "expired";
  expires_at: string;
  created_at: string;
  updated_at: string;
};
const SESSION_COOKIE_NAME = "me3_core_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 100_000;
const ME3_CLOUD_OWNER_SECRET_NAME = "ME3_CLOUD_OWNER_ID";
const ME3_CORE_INSTALL_ID_SECRET_NAME = "ME3_CORE_INSTALL_ID";
const ME3_CLOUD_USERNAME_CONFLICT_MESSAGE =
  "This username is already taken on ME3 Cloud. Choose another handle before publishing.";
const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;
const ME3_CORE_INSTALL_ID_REGEX =
  /^core_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const D1_SITE_FILE_MAX_BYTES = 1_900_000;
const INBOUND_EMAIL_PROVIDER_ID = "cloudflare-email-routing";
const MAX_INBOUND_EMAIL_BYTES = 1024 * 1024;
const MAX_MAILBOX_ATTACHMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_MAILBOX_ATTACHMENT_UPLOAD_COUNT = 10;
const MAX_ASSISTANT_ATTACHMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ASSISTANT_TEXT_ATTACHMENT_BYTES = 1 * 1024 * 1024;
const MAX_ASSISTANT_ATTACHMENT_UPLOAD_COUNT = 4;
const MAX_ASSISTANT_EXTRACTED_TEXT_CHARS = 48_000;

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
  const pathname = new URL(c.req.url).pathname;
  const isMeJsonDiscoveryPath =
    pathname === "/me.json" || pathname === "/.well-known/me.json";
  if (
    !isMeJsonDiscoveryPath &&
    pathname.startsWith("/api/auth/") &&
    await isPublicSiteHost(c.env, c.req.url)
  ) {
    return c.json({ error: "Not found" }, 404);
  }
  if (
    !isMeJsonDiscoveryPath &&
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

app.get("/api/book/:username/slots", async (c) => {
  const site = await getSiteByUsername(c.env, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const localDate = normalizeShortText(c.req.query("date"), 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return c.json({ error: "date is required in YYYY-MM-DD format" }, 400);
  }

  const profile = await loadSiteProfileForCommerce(c.env, site);
  const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
  if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

  const resolved = resolvePublicOneToOneBookingOffer(
    bookIntent,
    normalizeShortText(c.req.query("offerId"), 100),
  );
  if ("error" in resolved) return c.json({ error: resolved.error }, resolved.status);

  const timezone = resolveTimeZone(resolved.offer.availability.timezone);
  const slots = await generateAvailableBookingSlots(c.env, {
    siteId: site.id,
    offer: resolved.offer,
    localDate,
    timezone,
  });

  return c.json({
    ok: true,
    date: localDate,
    timezone,
    offer: serializePublicBookingOffer(resolved.offer),
    slots,
  });
});

app.post("/api/book/:username/confirm", async (c) => {
  const username = c.req.param("username");
  const site = await getSiteByUsername(c.env, username);
  if (!site) return c.json({ error: "Site not found" }, 404);

  const body = await c.req.json<PublicBookingConfirmBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);

  const guestName = normalizeShortText(body.guestName, 120);
  const guestEmail = normalizeEmail(body.guestEmail);
  const notes = normalizeLongText(body.notes, 2000);
  const slotStart = normalizeShortText(body.slotStart, 80);
  const slotEnd = normalizeShortText(body.slotEnd, 80);

  if (!slotStart || !slotEnd || !guestName) {
    return c.json({ error: "slotStart, slotEnd, and guestName are required" }, 400);
  }
  if (!guestEmail) {
    return c.json({ error: "Enter a valid email address" }, 400);
  }

  const profile = await loadSiteProfileForCommerce(c.env, site);
  const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
  if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

  const resolved = resolvePublicOneToOneBookingOffer(
    bookIntent,
    normalizeShortText(body.offerId, 100),
  );
  if ("error" in resolved) return c.json({ error: resolved.error }, resolved.status);

  const offer = resolved.offer;
  if (offer.pricing?.enabled) {
    return c.json(
      {
        error: "Use checkout for paid booking offers",
        action: "createBookingCheckout",
        checkoutUrl: `/api/book/${encodeURIComponent(username)}/checkout-session`,
      },
      402,
    );
  }

  const timezone = resolveTimeZone(offer.availability.timezone);
  const slot = resolvePublicBookingSlot({
    slotStart,
    slotEnd,
    durationMinutes: offer.duration,
    timezone,
  });
  if ("error" in slot) return c.json({ error: slot.error }, 400);
  if (slot.startsAtMs <= Date.now() + 5 * 60_000) {
    return c.json({ error: "Choose a future booking time" }, 400);
  }

  const availabilityError = validateBookingAvailability(
    offer.availability,
    slot.localDate,
    slot.localTime,
    offer.duration,
  );
  if (availabilityError) return c.json({ error: availabilityError }, 400);

  const overlap = await findConfirmedBookingOverlap(c.env, {
    siteId: site.id,
    offerId: offer.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  if (overlap) return c.json({ error: "That time has already been booked" }, 409);

  const activeHold = await findActiveBookingHoldOverlap(c.env, {
    siteId: site.id,
    offerId: offer.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  if (activeHold) {
    return c.json({ error: "That time is being held for another checkout. Try another slot or check back shortly." }, 409);
  }

  const booking = await createConfirmedFreeOneToOneBooking(c.env, {
    site,
    bookIntent,
    offer,
    guestName,
    guestEmail,
    notes,
    slot,
  });

  return c.json({ ok: true, booking: booking ? serializeBooking(booking) : null });
});

app.post("/api/book/:username/free", async (c) => {
  const site = await getSiteByUsername(c.env, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const body = await c.req.json<FreeBookingBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);

  const guestName = normalizeShortText(body.guestName, 120);
  const guestEmail = normalizeEmail(body.guestEmail);
  const notes = normalizeLongText(body.notes, 2000);
  const localDate = normalizeShortText(body.localDate, 20);
  const localTime = normalizeShortText(body.localTime, 20);

  if (!guestName || !localDate || !localTime) {
    return c.json({ error: "Name, date, and time are required" }, 400);
  }
  if (!guestEmail) {
    return c.json({ error: "Enter a valid email address" }, 400);
  }

  const profile = await loadSiteProfileForCommerce(c.env, site);
  const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
  if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

  const offer = resolveOneToOneBookingOffer(bookIntent, normalizeShortText(body.offerId, 100));
  if (!offer) return c.json({ error: "Booking offer not found" }, 404);
  if (offer.pricing?.enabled) {
    return c.json({ error: "Use checkout for paid booking offers" }, 400);
  }

  const slot = resolveBookingSlot({
    localDate,
    localTime,
    durationMinutes: offer.duration,
    timezone: resolveTimeZone(offer.availability.timezone),
  });
  if (!slot) return c.json({ error: "Invalid booking date or time" }, 400);
  if (slot.startsAtMs <= Date.now() + 5 * 60_000) {
    return c.json({ error: "Choose a future booking time" }, 400);
  }

  const availabilityError = validateBookingAvailability(
    offer.availability,
    localDate,
    localTime,
    offer.duration,
  );
  if (availabilityError) return c.json({ error: availabilityError }, 400);

  const overlap = await findConfirmedBookingOverlap(c.env, {
    siteId: site.id,
    offerId: offer.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  if (overlap) return c.json({ error: "That time has already been booked" }, 409);

  const activeHold = await findActiveBookingHoldOverlap(c.env, {
    siteId: site.id,
    offerId: offer.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  if (activeHold) {
    return c.json({ error: "That time is being held for another checkout. Try another slot or check back shortly." }, 409);
  }

  const bookingId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO bookings
     (id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
      duration_minutes, status, notes, created_at, payment_intent_id, amount_paid,
      suggested_amount, currency, payment_status, is_free_booking, paid_at)
     VALUES (?, ?, ?, 'one_to_one', ?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'),
             NULL, NULL, NULL, NULL, 'not_required', 1, NULL)`,
  )
    .bind(
      bookingId,
      site.id,
      offer.id,
      guestName,
      guestEmail,
      slot.startsAt,
      slot.endsAt,
      offer.duration,
      notes || null,
    )
    .run();

  const booking = await c.env.DB.prepare(
    `SELECT id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
            duration_minutes, calendar_event_id, status, notes, created_at, cancelled_at,
            payment_intent_id, amount_paid, suggested_amount, currency, payment_status,
            is_free_booking, paid_at
     FROM bookings
     WHERE id = ?`,
  )
    .bind(bookingId)
    .first<DbBooking>();

  if (booking) {
    scheduleBookingRemindersForBooking(c.env, {
      booking,
      bookingTitle: offer.title,
      timezone: resolveTimeZone(offer.availability.timezone),
      reminders: bookIntent.reminders,
    }).catch((error) => {
      console.error("Failed to schedule booking reminders:", error);
    });
  }

  return c.json({ ok: true, booking: booking ? serializeBooking(booking) : { id: bookingId } });
});

app.post("/api/book/:username/checkout-session", async (c) => {
  const site = await getSiteByUsername(c.env, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const stripe = await getStripe(c.env, site.user_id);
  if (!stripe) return c.json({ error: "Stripe is not configured for this ME3 Core install" }, 503);

  const body = await c.req.json<PaidBookingCheckoutBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);

  const guestName = normalizeShortText(body.guestName, 120);
  const guestEmail = normalizeEmail(body.guestEmail);
  const notes = normalizeLongText(body.notes, 2000);
  const localDate = normalizeShortText(body.localDate, 20);
  const localTime = normalizeShortText(body.localTime, 20);

  if (!guestName || !localDate || !localTime) {
    return c.json({ error: "Name, date, and time are required" }, 400);
  }
  if (!guestEmail) {
    return c.json({ error: "Enter a valid email address" }, 400);
  }

  const profile = await loadSiteProfileForCommerce(c.env, site);
  const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
  if (!bookIntent?.enabled) return c.json({ error: "Booking is not enabled for this site" }, 404);

  const offer = resolvePaidOneToOneOffer(bookIntent, normalizeShortText(body.offerId, 100));
  if (!offer) return c.json({ error: "Paid booking offer not found" }, 404);

  const pricing = offer.pricing;
  const amount = normalizeBookingAmount(body.amount, pricing);
  if (!amount.ok) return c.json({ error: amount.error }, 400);

  const slot = resolveBookingSlot({
    localDate,
    localTime,
    durationMinutes: offer.duration,
    timezone: resolveTimeZone(offer.availability.timezone),
  });
  if (!slot) return c.json({ error: "Invalid booking date or time" }, 400);
  if (slot.startsAtMs <= Date.now() + 5 * 60_000) {
    return c.json({ error: "Choose a future booking time" }, 400);
  }

  const availabilityError = validateBookingAvailability(
    offer.availability,
    localDate,
    localTime,
    offer.duration,
  );
  if (availabilityError) return c.json({ error: availabilityError }, 400);

  const overlap = await findConfirmedBookingOverlap(c.env, {
    siteId: site.id,
    offerId: offer.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  if (overlap) return c.json({ error: "That time has already been booked" }, 409);

  const activeHold = await findActiveBookingHoldOverlap(c.env, {
    siteId: site.id,
    offerId: offer.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  if (activeHold) {
    return c.json({ error: "That time is being held for another checkout. Try another slot or check back shortly." }, 409);
  }

  const holdToken = crypto.randomUUID();
  const holdExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  await createBookingHold(c.env, {
    siteId: site.id,
    offerId: offer.id,
    holdToken,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    expiresAt: holdExpiresAt,
  });

  const requestOrigin = new URL(c.req.url).origin;
  const returnUrl = normalizeSameOriginReturnUrl(body.returnUrl, requestOrigin);
  const successUrl = appendQueryParams(returnUrl, {
    booking: "success",
    session_id: "{CHECKOUT_SESSION_ID}",
  });
  const cancelUrl = appendQueryParams(returnUrl, { booking: "cancelled" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: guestEmail,
      line_items: [
        {
          price_data: {
            currency: amount.currency,
            product_data: {
              name: offer.title,
              description: `${localDate} ${localTime} (${offer.duration} minutes)`,
            },
            unit_amount: amount.amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          purchase_kind: "booking",
          site_id: site.id,
          offer_id: offer.id,
          booking_type: "one_to_one",
          hold_token: holdToken,
          guest_name: guestName,
          guest_email: guestEmail,
          notes,
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
          duration_minutes: String(offer.duration),
        },
      },
      metadata: {
        purchase_kind: "booking",
        site_id: site.id,
        offer_id: offer.id,
        booking_type: "one_to_one",
        hold_token: holdToken,
        guest_name: guestName,
        guest_email: guestEmail,
        notes,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        duration_minutes: String(offer.duration),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    return c.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    await releaseBookingHold(c.env, holdToken);
    throw error;
  }
});

app.post("/api/book/:username/complete-checkout", async (c) => {
  const site = await getSiteByUsername(c.env, c.req.param("username"));
  if (!site) return c.json({ error: "Site not found" }, 404);

  const stripe = await getStripe(c.env, site.user_id);
  if (!stripe) return c.json({ error: "Stripe is not configured for this ME3 Core install" }, 503);

  const body = await c.req.json<PaidBookingCompletionBody>().catch(() => null);
  const sessionId = normalizeShortText(body?.sessionId, 200);
  if (!sessionId) return c.json({ error: "Missing Stripe Checkout session ID" }, 400);

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") {
    return c.json({ error: "Payment has not completed yet" }, 400);
  }

  const metadata = session.metadata || {};
  if (metadata.purchase_kind !== "booking" || metadata.site_id !== site.id) {
    return c.json({ error: "Checkout session does not match this site" }, 400);
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  if (!paymentIntentId) return c.json({ error: "Stripe payment intent missing from session" }, 400);

  const existing = await c.env.DB.prepare(
    `SELECT id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
            duration_minutes, calendar_event_id, status, notes, created_at, cancelled_at,
            payment_intent_id, amount_paid, suggested_amount, currency, payment_status,
            is_free_booking, paid_at
     FROM bookings
     WHERE payment_intent_id = ?`,
  )
    .bind(paymentIntentId)
    .first<DbBooking>();
  if (existing) return c.json({ ok: true, booking: serializeBooking(existing), alreadyCompleted: true });

  const offerId = metadata.offer_id || null;
  const startsAt = metadata.starts_at || "";
  const endsAt = metadata.ends_at || "";
  const durationMinutes = Number(metadata.duration_minutes || 0);
  const guestName = metadata.guest_name || "";
  const guestEmail = metadata.guest_email || "";
  const notes = metadata.notes || "";
  const holdToken = metadata.hold_token || "";

  if (!offerId || !startsAt || !endsAt || !durationMinutes || !guestName || !guestEmail || !holdToken) {
    return c.json({ error: "Checkout session is missing booking details" }, 400);
  }

  const hold = await findActiveBookingHoldByToken(c.env, holdToken);
  if (!hold || hold.site_id !== site.id || hold.offer_id !== offerId || hold.slot_start !== startsAt || hold.slot_end !== endsAt) {
    return c.json({ error: "Booking hold expired. Payment succeeded, but the booking was not confirmed automatically." }, 409);
  }

  const overlap = await findConfirmedBookingOverlap(c.env, {
    siteId: site.id,
    offerId,
    startsAt,
    endsAt,
  });
  if (overlap) {
    await releaseBookingHold(c.env, holdToken);
    return c.json({ error: "That time has already been booked. Payment succeeded, but the booking was not confirmed automatically." }, 409);
  }

  const bookingId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO bookings
     (id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
      duration_minutes, status, notes, created_at, payment_intent_id, amount_paid,
      suggested_amount, currency, payment_status, is_free_booking, paid_at)
     VALUES (?, ?, ?, 'one_to_one', ?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'),
             ?, ?, ?, ?, 'succeeded', 0, datetime('now'))`,
  )
    .bind(
      bookingId,
      site.id,
      offerId,
      guestName,
      guestEmail,
      startsAt,
      endsAt,
      durationMinutes,
      notes || null,
      paymentIntentId,
      session.amount_total || null,
      session.amount_subtotal || session.amount_total || null,
      session.currency || null,
    )
    .run();

  await confirmBookingHold(c.env, holdToken, bookingId);

  const booking = await c.env.DB.prepare(
    `SELECT id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
            duration_minutes, calendar_event_id, status, notes, created_at, cancelled_at,
            payment_intent_id, amount_paid, suggested_amount, currency, payment_status,
            is_free_booking, paid_at
     FROM bookings
     WHERE id = ?`,
  )
    .bind(bookingId)
    .first<DbBooking>();

  if (booking) {
    const profile = await loadSiteProfileForCommerce(c.env, site);
    const bookIntent = profile?.intents?.book as CoreBookIntent | undefined;
    const offer = bookIntent ? resolveOneToOneBookingOffer(bookIntent, offerId) : null;
    scheduleBookingRemindersForBooking(c.env, {
      booking,
      bookingTitle: offer?.title || "Book a session",
      timezone: resolveTimeZone(offer?.availability.timezone),
      reminders: bookIntent?.reminders,
    }).catch((error) => {
      console.error("Failed to schedule booking reminders:", error);
    });
  }

  return c.json({ ok: true, booking: booking ? serializeBooking(booking) : { id: bookingId } });
});

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

  if (!setupPassword) {
    return c.json({ ok: false, error: "Owner auth is not configured" }, 503);
  }

  if (body.bootstrapCode !== setupPassword) {
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
  const setupPassword = getSetupPassword(c.env);

  if (!setupPassword) {
    return c.json({ ok: false, error: "Owner recovery is not configured" }, 503);
  }

  if (body.bootstrapCode !== setupPassword) {
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

app.post("/api/assistant/voice/transcribe", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const formData = await c.req.formData().catch((): FormData | null => null);
  const audio = formData?.get("audio");
  const language = formData?.get("language");

  if (!(audio instanceof Blob)) {
    return c.json({ ok: false, error: "Audio file is required" }, 400);
  }

  try {
    const result = await transcribeVoiceDictation(c.env, audio, {
      language: typeof language === "string" && language.trim() ? language.trim() : null,
    });
    return c.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof VoiceDictationInputError) {
      return c.json({ ok: false, error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.post("/api/assistant/attachments", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const form = await c.req.formData().catch((): FormData | null => null);
  if (!form) return c.json({ ok: false, error: "Attachment upload is invalid" }, 400);

  const files = form
    .getAll("attachments")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return c.json({ ok: false, error: "Choose at least one attachment" }, 400);
  if (files.length > MAX_ASSISTANT_ATTACHMENT_UPLOAD_COUNT) {
    return c.json(
      {
        ok: false,
        error: `Upload up to ${MAX_ASSISTANT_ATTACHMENT_UPLOAD_COUNT} attachments at a time`,
      },
      400,
    );
  }

  const threadIdInput = form.get("threadId");
  const threadId =
    typeof threadIdInput === "string" && threadIdInput.trim()
      ? threadIdInput.trim()
      : null;
  if (threadId) {
    const thread = await getAssistantThread(c.env, ownerId, threadId);
    if (!thread) return c.json({ ok: false, error: "Assistant thread not found" }, 404);
  }

  const uploaded = [];
  for (const [index, file] of files.entries()) {
    const filename = sanitizeAttachmentFilename(file.name, `attachment-${index + 1}`);
    const mimeType = normalizeAssistantAttachmentMimeType(file, filename);
    const kind = classifyAssistantUploadKind(filename, mimeType);
    if (!kind) {
      return c.json(
        {
          ok: false,
          error: `${filename} is not supported yet. Use text, markdown, JSON, CSV, XML, or images.`,
        },
        400,
      );
    }
    if (file.size > MAX_ASSISTANT_ATTACHMENT_UPLOAD_BYTES) {
      return c.json(
        {
          ok: false,
          error: `${filename} is larger than ${formatByteLimit(MAX_ASSISTANT_ATTACHMENT_UPLOAD_BYTES)}`,
        },
        400,
      );
    }
    if (kind === "text" && file.size > MAX_ASSISTANT_TEXT_ATTACHMENT_BYTES) {
      return c.json(
        {
          ok: false,
          error: `${filename} is too large to read as text. Use files under ${formatByteLimit(MAX_ASSISTANT_TEXT_ATTACHMENT_BYTES)} for now.`,
        },
        400,
      );
    }
    if (kind === "image" && !c.env.SITE_ASSETS) {
      return c.json(
        { ok: false, error: "Assistant image attachment storage is not configured" },
        503,
      );
    }

    const id = crypto.randomUUID();
    let storageKey: string | null = null;
    let extractedText: string | null = null;
    let textTruncated = 0;

    if (kind === "text") {
      const text = await file.text();
      extractedText = text.slice(0, MAX_ASSISTANT_EXTRACTED_TEXT_CHARS);
      textTruncated = text.length > MAX_ASSISTANT_EXTRACTED_TEXT_CHARS ? 1 : 0;
    } else if (c.env.SITE_ASSETS) {
      storageKey = [
        "assistant",
        ownerId,
        "attachments",
        new Date().toISOString().slice(0, 10),
        `${id}-${filename}`,
      ].join("/");
      await c.env.SITE_ASSETS.put(storageKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: mimeType },
        customMetadata: {
          ownerId,
          threadId: threadId || "",
          filename,
          kind,
        },
      });
    }

    try {
      await c.env.DB.prepare(
        `INSERT INTO assistant_attachments
           (id, owner_id, thread_id, filename, mime_type, size, kind, status,
            storage_key, extracted_text, text_truncated, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`,
      )
        .bind(
          id,
          ownerId,
          threadId,
          filename,
          mimeType,
          file.size,
          kind,
          storageKey,
          extractedText,
          textTruncated,
          JSON.stringify({ source: "assistant-composer" }),
        )
        .run();
    } catch (error) {
      if (isMissingAssistantAttachmentsTableError(error)) {
        return c.json(
          {
            ok: false,
            error:
              "Assistant attachment storage is not migrated yet. Restart the local Worker or run pnpm --filter @me3-core/worker db:migrate:local.",
          },
          503,
        );
      }
      throw error;
    }

    uploaded.push({
      id,
      name: filename,
      filename,
      mimeType,
      size: file.size,
      kind,
      status: "ready",
      storageKey,
      hasText: Boolean(extractedText),
      text: extractedText,
      textTruncated: Boolean(textTruncated),
      createdAt: new Date().toISOString(),
    });
  }

  return c.json({ ok: true, attachments: uploaded }, 201);
});

app.get("/api/assistant/skills", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json({ skills: await listAssistantSkills(c.env, ownerId) });
  } catch (error) {
    return assistantSkillsErrorResponse(c, error);
  }
});

app.post("/api/assistant/skills", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(
      await createAssistantSkill(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      ),
      201,
    );
  } catch (error) {
    return assistantSkillsErrorResponse(c, error);
  }
});

app.patch("/api/assistant/skills/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(
      await updateAssistantSkill(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return assistantSkillsErrorResponse(c, error);
  }
});

app.delete("/api/assistant/skills/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await deleteAssistantSkill(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return assistantSkillsErrorResponse(c, error);
  }
});

app.get("/api/assistant/jobs/recipes", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  return c.json(await listAssistantJobRecipes(c.env, ownerId));
});

app.get("/api/assistant/jobs/events", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await listAssistantJobIngressEvents(c.env, ownerId, c.req.query("status")));
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.post("/api/assistant/jobs/events/internal", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(
      await recordAssistantJobIngressEvent(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      ),
      201,
    );
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.post("/api/assistant/jobs/events/webhook", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    const body = await c.req.json().catch(() => ({}));
    return c.json(
      await recordAssistantJobIngressEvent(c.env, ownerId, {
        ...(typeof body === "object" && body !== null ? body : {}),
        sourceKind: "webhook",
      }),
      201,
    );
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.patch("/api/assistant/jobs/events/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(
      await updateAssistantJobIngressEvent(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.get("/api/assistant/jobs", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await listAssistantJobs(c.env, ownerId, c.req.query("status")));
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.get("/api/assistant/jobs/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await getAssistantJob(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.post("/api/assistant/jobs", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(
      await createAssistantJob(c.env, ownerId, await c.req.json().catch(() => ({}))),
      201,
    );
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.patch("/api/assistant/jobs/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(
      await updateAssistantJob(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.post("/api/assistant/jobs/:id/pause", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await setAssistantJobPaused(c.env, ownerId, c.req.param("id"), true));
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.post("/api/assistant/jobs/:id/resume", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await setAssistantJobPaused(c.env, ownerId, c.req.param("id"), false));
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.post("/api/assistant/jobs/:id/duplicate", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await duplicateAssistantJob(c.env, ownerId, c.req.param("id")), 201);
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.post("/api/assistant/jobs/:id/run", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await runAssistantJobNow(c.env, ownerId, c.req.param("id")), 201);
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

app.delete("/api/assistant/jobs/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    return c.json(await archiveAssistantJob(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return assistantJobsErrorResponse(c, error);
  }
});

function parseAssistantChatTurnModelSelection(
  value: unknown,
): AssistantChatTurnModelSelection | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "model must be an object" };
  }

  const input = value as Record<string, unknown>;
  const providerId = input.providerId;
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const optionId =
    typeof input.optionId === "string" && input.optionId.trim()
      ? input.optionId.trim()
      : null;

  if (
    providerId !== "workers-ai" &&
    providerId !== "openai" &&
    providerId !== "anthropic"
  ) {
    return { error: "model.providerId is not supported" };
  }

  if (!model || model.length > 160) {
    return { error: "model.model is required" };
  }

  return { providerId, model, optionId };
}

function serializeAssistantThread(row: AssistantThreadRow) {
  return {
    id: row.id,
    title: row.title,
    originSurface: row.origin_surface,
    projectId: row.project_id,
    status: row.status,
    pinnedAt: row.pinned_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAssistantMessage(row: AssistantMessageRow) {
  return {
    id: row.id,
    role: row.role,
    text: row.content,
    createdAt: row.created_at,
  };
}

function assistantJobBuilderReplyText(action: AssistantJobBuilderAction) {
  if (action.kind === "job_saved") {
    return action.summary;
  }

  const setupText = action.explanation.setupWarnings.length
    ? " It needs setup before it can activate."
    : action.validation.status === "valid"
      ? " You can save and activate it when ready."
      : "";
  return `Here is a draft job.${setupText}`;
}

async function persistAssistantTurnMessages(
  env: Env,
  ownerId: string,
  threadId: string,
  userText: string,
  assistantText: string,
) {
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO assistant_messages (id, owner_id, role, content, thread_id) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(crypto.randomUUID(), ownerId, "user", userText, threadId),
      env.DB.prepare(
        "INSERT INTO assistant_messages (id, owner_id, role, content, thread_id) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(crypto.randomUUID(), ownerId, "assistant", assistantText, threadId),
    ]);
  } catch {
    // Conversation persistence is useful context, but chat turns should not fail on audit writes.
  }
}

function normalizeAssistantThreadId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) return null;
  return trimmed;
}

function assistantThreadTitleFromMessage(messageText: string) {
  const title = messageText.replace(/\s+/g, " ").trim();
  if (!title) return "New chat";
  return title.length > 80 ? `${title.slice(0, 77).trimEnd()}...` : title;
}

async function getAssistantThread(
  env: Env,
  ownerId: string,
  threadId: string,
): Promise<AssistantThreadRow | null> {
  return env.DB.prepare(
    `SELECT id, owner_id, title, origin_surface, project_id, status, pinned_at,
            archived_at, deleted_at, last_message_at, created_at, updated_at
     FROM assistant_threads
     WHERE id = ? AND owner_id = ? AND status != 'deleted'
     LIMIT 1`,
  )
    .bind(threadId, ownerId)
    .first<AssistantThreadRow>();
}

async function createAssistantThread(
  env: Env,
  ownerId: string,
  messageText: string,
  projectId: string | null,
): Promise<AssistantThreadRow> {
  const id = crypto.randomUUID();
  const title = assistantThreadTitleFromMessage(messageText);
  await env.DB.prepare(
    `INSERT INTO assistant_threads
       (id, owner_id, title, origin_surface, project_id, status, last_message_at)
     VALUES (?, ?, ?, 'assistant', ?, 'active', CURRENT_TIMESTAMP)`,
  )
    .bind(id, ownerId, title, projectId)
    .run();

  const thread = await getAssistantThread(env, ownerId, id);
  return (
    thread || {
      id,
      owner_id: ownerId,
      title,
      origin_surface: "assistant",
      project_id: projectId,
      status: "active",
      pinned_at: null,
      archived_at: null,
      deleted_at: null,
      last_message_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  );
}

async function resolveAssistantThreadForTurn(
  env: Env,
  ownerId: string,
  threadId: string | null,
  messageText: string,
  projectId: string | null,
): Promise<AssistantThreadRow | null | { error: string; status: 400 | 404 }> {
  if (!threadId) {
    if (projectId && !(await assistantProjectExists(env, ownerId, projectId))) {
      return { error: "Mission Control project not found", status: 404 };
    }
    return createAssistantThread(env, ownerId, messageText, projectId);
  }
  const thread = await getAssistantThread(env, ownerId, threadId);
  if (!thread) return { error: "Assistant thread not found", status: 404 };
  if (thread.status !== "active") {
    return { error: "Assistant thread is not active", status: 400 };
  }
  return thread;
}

async function assistantProjectExists(env: Env, ownerId: string, projectId: string) {
  const row = await env.DB.prepare(
    `SELECT id
     FROM mission_projects
     WHERE id = ? AND user_id = ? AND status != 'archived'
     LIMIT 1`,
  )
    .bind(projectId, ownerId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function touchAssistantThread(env: Env, ownerId: string, threadId: string) {
  try {
    await env.DB.prepare(
      `UPDATE assistant_threads
       SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND owner_id = ?`,
    )
      .bind(threadId, ownerId)
      .run();
  } catch {
    // Thread timestamps should not break the chat turn if persistence is degraded.
  }
}

type AssistantSiteThreadMessage = {
  role: string;
  content: string;
  created_at: string;
};

type ParsedAssistantSiteDraftContent = {
  aboutParagraph?: string;
  postTitle?: string;
  postBody?: string;
  postTopic?: string;
};

type AssistantSiteUpdateDraft = {
  version: 1;
  kind: "profile_site_update";
  siteId: string;
  siteUsername: string;
  threadId: string;
  requestText: string;
  createdAt: string;
  updatedAt: string;
  sourceFiles: Record<string, string>;
  changes: {
    aboutFile?: string;
    aboutParagraph?: string;
    postTitle?: string;
    postSlug?: string;
    postFile?: string;
    postMarkdown?: string;
    refinementText?: string | null;
  };
};

type AssistantSiteToolAction = {
  specialist:
    | "core.sites.update_draft"
    | "core.sites.refine_draft"
    | "core.sites.publish"
    | "core.sites.approval_status";
  replyText: string;
  siteAction: {
    kind: "draft_created" | "draft_refined" | "published" | "approval_status" | "missing_site";
    siteId: string | null;
    username: string | null;
    pending: boolean;
    published: boolean;
    files: string[];
    postTitle?: string | null;
    url?: string | null;
    message?: string | null;
  };
};

async function maybeHandleAssistantSiteToolAction(
  env: Env,
  ownerId: string,
  threadId: string,
  messageText: string,
  requestUrl: string,
): Promise<AssistantSiteToolAction | null> {
  const approvalIntent = isAssistantSiteApprovalIntent(messageText);
  const statusIntent = isAssistantSiteStatusIntent(messageText);
  const updateIntent = isAssistantSiteUpdateIntent(messageText);
  const refinementIntent = isAssistantSiteRefinementIntent(messageText);

  if (approvalIntent) {
    const action = await maybePublishAssistantSiteDraft(
      env,
      ownerId,
      threadId,
      messageText,
      requestUrl,
    );
    if (action) return action;
  }

  if (statusIntent) {
    const action = await maybeReportAssistantSiteApprovalStatus(
      env,
      ownerId,
      threadId,
      messageText,
      requestUrl,
    );
    if (action) return action;
  }

  if (refinementIntent) {
    const pending = await findPendingAssistantSiteDraft(env, ownerId, threadId, messageText);
    if (pending) {
      return refineAssistantSiteDraft(
        env,
        pending.site,
        pending.draft,
        messageText,
        requestUrl,
      );
    }
  }

  if (!updateIntent) return null;

  const site = await chooseAssistantSiteForMessage(env, ownerId, messageText);
  if (!site) {
    return {
      specialist: "core.sites.update_draft",
      replyText:
        "I can draft and publish site updates once there is a profile site to update. Create a site first, then ask me again.",
      siteAction: {
        kind: "missing_site",
        siteId: null,
        username: null,
        pending: false,
        published: false,
        files: [],
        message: "No profile site was found for this owner.",
      },
    };
  }

  const draft = await createAssistantSiteUpdateDraft(env, ownerId, site, threadId, messageText);
  await saveAssistantSiteUpdateDraft(env, draft);
  return {
    specialist: "core.sites.update_draft",
    replyText: formatAssistantSiteDraftReply(draft),
    siteAction: {
      kind: "draft_created",
      siteId: site.id,
      username: site.username,
      pending: true,
      published: false,
      files: assistantSiteDraftChangedFiles(draft),
      postTitle: draft.changes.postTitle || null,
      url: getAssistantSiteAdminUrl(env, site, requestUrl),
    },
  };
}

function buildAssistantSiteToolPayload(threadId: string, action: AssistantSiteToolAction) {
  return {
    ok: true,
    auditId: null,
    turnId: null,
    threadId,
    specialist: action.specialist,
    replyText: action.replyText,
    model: null,
    source: "tool",
    siteAction: action.siteAction,
    jobBuilderAction: null,
    emailAction: null,
    reminderAction: null,
    contentAction: null,
    contactsChanged: false,
  };
}

function isAssistantSiteUpdateIntent(messageText: string): boolean {
  const text = normalizeAssistantIntentText(messageText);
  if (!text) return false;
  if (isAssistantSiteApprovalIntent(text) || isAssistantSiteStatusIntent(text)) return false;
  const siteish = /\b(site|website|homepage|about page|about section|bio|blog|post|article|page)\b/.test(text);
  const actionish = /\b(update|add|create|write|draft|make|publish|change|edit|put|append)\b/.test(text);
  const contentTarget =
    /\b(about page|about section|bio|blog post|post about|article about|blog|page)\b/.test(text);
  return siteish && actionish && contentTarget;
}

function isAssistantSiteApprovalIntent(messageText: string): boolean {
  const text = normalizeAssistantIntentText(messageText);
  if (!text) return false;
  if (isAssistantSiteStatusIntent(text)) return false;
  return (
    /^(yes|yep|yeah|ok|okay|sure|approved?|publish|ship|send|do it|just do it|go ahead)\b/.test(text) ||
    /\b(publish (it|them|this|the draft)|approve (it|them|this|the draft)|ship it|make it live|looks good|just do it|go ahead)\b/.test(text)
  );
}

function isAssistantSiteStatusIntent(messageText: string): boolean {
  const text = normalizeAssistantIntentText(messageText);
  if (!text) return false;
  return (
    /\b(has|have|was|is|did|can you check|check)\b.*\b(approved|published|live|done|status)\b/.test(text) ||
    /\b(approval status|publish status|site status)\b/.test(text)
  );
}

function isAssistantSiteRefinementIntent(messageText: string): boolean {
  const text = normalizeAssistantIntentText(messageText);
  if (!text) return false;
  if (isAssistantSiteApprovalIntent(text) || isAssistantSiteStatusIntent(text)) return false;
  return /\b(change|revise|refine|rewrite|edit|make|more|less|shorter|longer|instead|remove|add|use|tone|title)\b/.test(text);
}

function normalizeAssistantIntentText(messageText: string): string {
  return messageText.toLowerCase().replace(/\s+/g, " ").trim();
}

async function maybePublishAssistantSiteDraft(
  env: Env,
  ownerId: string,
  threadId: string,
  messageText: string,
  requestUrl: string,
): Promise<AssistantSiteToolAction | null> {
  const pending = await findPendingAssistantSiteDraft(env, ownerId, threadId, messageText);
  let site = pending?.site || (await chooseAssistantSiteForMessage(env, ownerId, messageText));
  let draft = pending?.draft || null;

  if (!site) return null;
  if (!draft) {
    draft = await createAssistantSiteDraftFromRecentThread(
      env,
      ownerId,
      site,
      threadId,
      messageText,
    );
  }
  if (!draft) return null;

  const cloudUsernameError = await getMe3CloudUsernamePublishBlockReason(env, site.username);
  if (cloudUsernameError) {
    return {
      specialist: "core.sites.publish",
      replyText: `I have the draft, but I cannot publish it yet: ${cloudUsernameError}`,
      siteAction: {
        kind: "approval_status",
        siteId: site.id,
        username: site.username,
        pending: true,
        published: false,
        files: assistantSiteDraftChangedFiles(draft),
        postTitle: draft.changes.postTitle || null,
        url: getAssistantSiteAdminUrl(env, site, requestUrl),
        message: cloudUsernameError,
      },
    };
  }

  site = await publishAssistantSiteDraft(env, site, draft);
  return {
    specialist: "core.sites.publish",
    replyText: formatAssistantSitePublishedReply(env, site, draft, requestUrl),
    siteAction: {
      kind: "published",
      siteId: site.id,
      username: site.username,
      pending: false,
      published: true,
      files: assistantSiteDraftChangedFiles(draft),
      postTitle: draft.changes.postTitle || null,
      url: getAssistantSiteAdminUrl(env, site, requestUrl),
    },
  };
}

async function maybeReportAssistantSiteApprovalStatus(
  env: Env,
  ownerId: string,
  threadId: string,
  messageText: string,
  requestUrl: string,
): Promise<AssistantSiteToolAction | null> {
  const pending = await findPendingAssistantSiteDraft(env, ownerId, threadId, messageText);
  if (pending) {
    return {
      specialist: "core.sites.approval_status",
      replyText:
        "Not yet. There is a site draft waiting in this thread. Reply `publish` or `approve` and I will publish it immediately.",
      siteAction: {
        kind: "approval_status",
        siteId: pending.site.id,
        username: pending.site.username,
        pending: true,
        published: false,
        files: assistantSiteDraftChangedFiles(pending.draft),
        postTitle: pending.draft.changes.postTitle || null,
        url: getAssistantSiteAdminUrl(env, pending.site, requestUrl),
      },
    };
  }

  const site = await chooseAssistantSiteForMessage(env, ownerId, messageText);
  if (!site) return null;
  const recentContext = await hasRecentAssistantSiteDraftContext(env, ownerId, threadId);
  if (recentContext) {
    return {
      specialist: "core.sites.approval_status",
      replyText:
        "I can see the site-update draft context, but it has not been published yet. Reply `publish` or `approve` and I will publish it immediately.",
      siteAction: {
        kind: "approval_status",
        siteId: site.id,
        username: site.username,
        pending: true,
        published: false,
        files: [],
        url: getAssistantSiteAdminUrl(env, site, requestUrl),
      },
    };
  }

  return {
    specialist: "core.sites.approval_status",
    replyText: site.published_at
      ? `Your @${site.username} site is currently published. I do not see a pending draft in this thread.`
      : `Your @${site.username} site is not published yet, and I do not see a pending draft in this thread.`,
    siteAction: {
      kind: "approval_status",
      siteId: site.id,
      username: site.username,
      pending: false,
      published: Boolean(site.published_at),
      files: [],
      url: getAssistantSiteAdminUrl(env, site, requestUrl),
    },
  };
}

async function refineAssistantSiteDraft(
  env: Env,
  site: DbSite,
  draft: AssistantSiteUpdateDraft,
  refinementText: string,
  requestUrl: string,
): Promise<AssistantSiteToolAction> {
  const nextDraft = applyAssistantSiteDraftRefinement(draft, refinementText);
  await saveAssistantSiteUpdateDraft(env, nextDraft);
  return {
    specialist: "core.sites.refine_draft",
    replyText: formatAssistantSiteRefinedReply(nextDraft),
    siteAction: {
      kind: "draft_refined",
      siteId: site.id,
      username: site.username,
      pending: true,
      published: false,
      files: assistantSiteDraftChangedFiles(nextDraft),
      postTitle: nextDraft.changes.postTitle || null,
      url: getAssistantSiteAdminUrl(env, site, requestUrl),
    },
  };
}

async function chooseAssistantSiteForMessage(
  env: Env,
  ownerId: string,
  messageText: string,
): Promise<DbSite | null> {
  const sites = await listAssistantOwnerProfileSites(env, ownerId);
  if (!sites.length) return null;

  const explicitUsername = extractAssistantSiteUsername(messageText);
  if (explicitUsername) {
    const explicitSite = sites.find((site) => site.username === explicitUsername);
    if (explicitSite) return explicitSite;
  }

  const configuredUsername = normalizeUsername(env.ME3_SITE_USERNAME);
  if (configuredUsername) {
    const configuredSite = sites.find((site) => site.username === configuredUsername);
    if (configuredSite) return configuredSite;
  }

  const ownerProfile = await getOwnerProfile(env, ownerId);
  const ownerUsername = normalizeUsername(ownerProfile?.username);
  if (ownerUsername) {
    const ownerSite = sites.find((site) => site.username === ownerUsername);
    if (ownerSite) return ownerSite;
  }

  return sites[0] || null;
}

async function listAssistantOwnerProfileSites(env: Env, ownerId: string): Promise<DbSite[]> {
  const rows = await env.DB.prepare(
    `SELECT id, user_id, username, site_type, template_id, custom_domain,
            custom_domain_status, custom_domain_cf_id, created_at, updated_at, published_at
     FROM sites
     WHERE user_id = ? AND COALESCE(site_type, 'profile') = 'profile'
     ORDER BY published_at IS NULL, published_at DESC, updated_at DESC, created_at ASC`,
  )
    .bind(ownerId)
    .all<DbSite>();
  return rows.results || [];
}

function extractAssistantSiteUsername(messageText: string): string {
  const atMatch = messageText.match(/@([a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?)/i);
  return normalizeUsername(atMatch?.[1]);
}

async function findPendingAssistantSiteDraft(
  env: Env,
  ownerId: string,
  threadId: string,
  messageText: string,
): Promise<{ site: DbSite; draft: AssistantSiteUpdateDraft } | null> {
  const sites = await listAssistantOwnerProfileSites(env, ownerId);
  const explicitUsername = extractAssistantSiteUsername(messageText);
  const orderedSites = [...sites].sort((first, second) => {
    if (explicitUsername) {
      if (first.username === explicitUsername) return -1;
      if (second.username === explicitUsername) return 1;
    }
    return 0;
  });

  for (const site of orderedSites) {
    const draft = await loadAssistantSiteUpdateDraft(env, site.id, threadId);
    if (draft) return { site, draft };
  }
  return null;
}

async function createAssistantSiteDraftFromRecentThread(
  env: Env,
  ownerId: string,
  site: DbSite,
  threadId: string,
  fallbackRequestText: string,
): Promise<AssistantSiteUpdateDraft | null> {
  const messages = await loadAssistantThreadRecentMessages(env, ownerId, threadId);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const parsed = parseAssistantSiteDraftFromAssistantText(message.content);
    if (!parsed) continue;
    const priorUserMessage = findPriorSiteUpdateUserMessage(messages, index);
    return createAssistantSiteUpdateDraft(
      env,
      ownerId,
      site,
      threadId,
      priorUserMessage || fallbackRequestText,
      parsed,
    );
  }

  const priorUserMessage = findPriorSiteUpdateUserMessage(messages, messages.length);
  if (!priorUserMessage) return null;
  return createAssistantSiteUpdateDraft(env, ownerId, site, threadId, priorUserMessage);
}

async function hasRecentAssistantSiteDraftContext(
  env: Env,
  ownerId: string,
  threadId: string,
): Promise<boolean> {
  const messages = await loadAssistantThreadRecentMessages(env, ownerId, threadId);
  return messages.some((message) =>
    message.role === "assistant"
      ? Boolean(parseAssistantSiteDraftFromAssistantText(message.content))
      : message.role === "user" && isAssistantSiteUpdateIntent(message.content),
  );
}

async function loadAssistantThreadRecentMessages(
  env: Env,
  ownerId: string,
  threadId: string,
): Promise<AssistantSiteThreadMessage[]> {
  const rows = await env.DB.prepare(
    `SELECT role, content, created_at
     FROM assistant_messages
     WHERE owner_id = ? AND thread_id = ? AND role IN ('user', 'assistant')
     ORDER BY created_at ASC
     LIMIT 24`,
  )
    .bind(ownerId, threadId)
    .all<AssistantSiteThreadMessage>();
  return rows.results || [];
}

function findPriorSiteUpdateUserMessage(
  messages: AssistantSiteThreadMessage[],
  beforeIndex: number,
): string | null {
  for (let index = Math.min(beforeIndex - 1, messages.length - 1); index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && isAssistantSiteUpdateIntent(message.content)) {
      return message.content;
    }
  }
  return null;
}

async function createAssistantSiteUpdateDraft(
  env: Env,
  ownerId: string,
  site: DbSite,
  threadId: string,
  requestText: string,
  parsedContent: ParsedAssistantSiteDraftContent | null = null,
): Promise<AssistantSiteUpdateDraft> {
  const sourceFiles = await loadSiteSourceFiles(env, site.id);
  const profile = await loadAssistantSiteProfile(env, ownerId, site, sourceFiles);
  const changes: AssistantSiteUpdateDraft["changes"] = { refinementText: null };

  const aboutParagraph =
    parsedContent?.aboutParagraph ||
    (assistantRequestMentionsAbout(requestText)
      ? generateAssistantAboutParagraph(requestText)
      : "");
  if (aboutParagraph) {
    const aboutPage = upsertAssistantAboutPage(profile);
    const aboutFile = normalizeSiteFileName(aboutPage.file || "about.md") || "about.md";
    const existingAbout = sourceFiles.get(aboutFile) || `# ${aboutPage.title || "About"}\n`;
    sourceFiles.set(aboutFile, appendAssistantParagraph(existingAbout, aboutParagraph));
    changes.aboutFile = aboutFile;
    changes.aboutParagraph = aboutParagraph;
  }

  const shouldCreatePost = Boolean(parsedContent?.postBody || assistantRequestMentionsBlogPost(requestText));
  if (shouldCreatePost) {
    const topic = parsedContent?.postTopic || extractAssistantBlogTopic(requestText);
    const postTitle = parsedContent?.postTitle || assistantBlogTitleFromTopic(topic);
    const postSlug = slugifyAssistantSitePath(postTitle || topic || "personal-ai-assistants");
    const postFile = `blog/${postSlug}.md`;
    const postMarkdown = parsedContent?.postBody
      ? normalizeAssistantPostMarkdown(postTitle, parsedContent.postBody)
      : generateAssistantBlogPostMarkdown(topic, postTitle, requestText);
    upsertAssistantBlogPost(profile, {
      slug: postSlug,
      title: postTitle,
      file: postFile,
      excerpt: markdownExcerpt(postMarkdown),
    });
    sourceFiles.set(postFile, postMarkdown);
    changes.postTitle = postTitle;
    changes.postSlug = postSlug;
    changes.postFile = postFile;
    changes.postMarkdown = postMarkdown;
  }

  if (!changes.aboutParagraph && !changes.postMarkdown) {
    const aboutPage = upsertAssistantAboutPage(profile);
    const aboutFile = normalizeSiteFileName(aboutPage.file || "about.md") || "about.md";
    const fallbackParagraph = generateAssistantAboutParagraph(requestText);
    const existingAbout = sourceFiles.get(aboutFile) || `# ${aboutPage.title || "About"}\n`;
    sourceFiles.set(aboutFile, appendAssistantParagraph(existingAbout, fallbackParagraph));
    changes.aboutFile = aboutFile;
    changes.aboutParagraph = fallbackParagraph;
  }

  sourceFiles.set("me.json", JSON.stringify(profile, null, 2));

  const now = new Date().toISOString();
  return {
    version: 1,
    kind: "profile_site_update",
    siteId: site.id,
    siteUsername: site.username,
    threadId,
    requestText,
    createdAt: now,
    updatedAt: now,
    sourceFiles: Object.fromEntries(sourceFiles.entries()),
    changes,
  };
}

async function loadAssistantSiteProfile(
  env: Env,
  ownerId: string,
  site: DbSite,
  sourceFiles: Map<string, string>,
): Promise<Me3SiteProfile> {
  const owner = await getOwnerProfile(env, ownerId);
  const fallbackProfile: Me3SiteProfile = {
    version: "0.1",
    handle: site.username,
    name: owner?.name || owner?.username || site.username,
    bio: owner?.bio || "Personal AI assistant powered by ME3 Core.",
  };
  if (owner?.avatar_url) fallbackProfile.avatar = owner.avatar_url;

  const profile = parseSiteProfile(
    sourceFiles.get("me.json") || JSON.stringify(fallbackProfile),
    site.username,
  );
  profile.version ||= "0.1";
  profile.handle ||= site.username;
  profile.name ||= owner?.name || owner?.username || site.username;
  profile.bio ||= owner?.bio || fallbackProfile.bio;
  if (!profile.avatar && owner?.avatar_url) profile.avatar = owner.avatar_url;
  return profile;
}

function upsertAssistantAboutPage(profile: Me3SiteProfile) {
  const pages = Array.isArray(profile.pages) ? [...profile.pages] : [];
  const existingIndex = pages.findIndex((page) => {
    const slug = normalizeSiteFileName(page.slug || "").toLowerCase();
    const file = normalizeSiteFileName(page.file || "").toLowerCase();
    const title = (page.title || "").toLowerCase();
    return slug === "about" || file === "about.md" || title === "about";
  });
  const existing = existingIndex >= 0 ? pages[existingIndex] : {};
  const page = {
    ...existing,
    slug: existing.slug || "about",
    title: existing.title || "About",
    file: existing.file || "about.md",
    visible: existing.visible === false ? false : true,
  };
  if (existingIndex >= 0) {
    pages[existingIndex] = page;
  } else {
    pages.push(page);
  }
  profile.pages = pages;
  return page;
}

function upsertAssistantBlogPost(
  profile: Me3SiteProfile,
  input: { slug: string; title: string; file: string; excerpt: string },
) {
  const posts = Array.isArray(profile.posts) ? [...profile.posts] : [];
  const existingIndex = posts.findIndex(
    (post) => post.slug === input.slug || normalizeSiteFileName(post.file || "") === input.file,
  );
  const post = {
    ...(existingIndex >= 0 ? posts[existingIndex] : {}),
    slug: input.slug,
    title: input.title,
    file: input.file,
    publishedAt: new Date().toISOString().slice(0, 10),
    excerpt: input.excerpt,
    draft: false,
    type: "article",
  };
  if (existingIndex >= 0) {
    posts[existingIndex] = post;
  } else {
    posts.unshift(post);
  }
  profile.posts = posts;
  profile.blogTitle ||= "Blog";
}

function removeAssistantBlogPost(
  profile: Me3SiteProfile,
  slug: string | undefined,
  file: string | undefined,
) {
  if (!Array.isArray(profile.posts)) return;
  const normalizedFile = normalizeSiteFileName(file || "");
  profile.posts = profile.posts.filter(
    (post) =>
      !(
        (slug && post.slug === slug) ||
        (normalizedFile && normalizeSiteFileName(post.file || "") === normalizedFile)
      ),
  );
}

function applyAssistantSiteDraftRefinement(
  draft: AssistantSiteUpdateDraft,
  refinementText: string,
): AssistantSiteUpdateDraft {
  const sourceFiles = new Map(Object.entries(draft.sourceFiles));
  const changes = { ...draft.changes, refinementText };
  const combinedRequest = `${draft.requestText}\n\nRefinement: ${refinementText}`;

  if (changes.aboutFile && changes.aboutParagraph && assistantRefinementTargetsAbout(refinementText)) {
    const nextParagraph = generateAssistantAboutParagraph(combinedRequest);
    const currentAbout = sourceFiles.get(changes.aboutFile) || "";
    sourceFiles.set(
      changes.aboutFile,
      replaceAssistantParagraph(currentAbout, changes.aboutParagraph, nextParagraph),
    );
    changes.aboutParagraph = nextParagraph;
  }

  if (changes.postFile && changes.postTitle && assistantRefinementTargetsPost(refinementText)) {
    const nextTitle = extractAssistantRequestedTitle(refinementText) || changes.postTitle;
    const topic = extractAssistantBlogTopic(draft.requestText);
    const nextMarkdown = generateAssistantBlogPostMarkdown(topic, nextTitle, combinedRequest);
    sourceFiles.delete(changes.postFile);
    const nextSlug = slugifyAssistantSitePath(nextTitle);
    const nextFile = `blog/${nextSlug}.md`;
    sourceFiles.set(nextFile, nextMarkdown);
    changes.postTitle = nextTitle;
    changes.postSlug = nextSlug;
    changes.postFile = nextFile;
    changes.postMarkdown = nextMarkdown;

    const meJson = sourceFiles.get("me.json");
    if (meJson) {
      const profile = parseSiteProfile(meJson, draft.siteUsername);
      removeAssistantBlogPost(profile, changes.postSlug, changes.postFile);
      upsertAssistantBlogPost(profile, {
        slug: nextSlug,
        title: nextTitle,
        file: nextFile,
        excerpt: markdownExcerpt(nextMarkdown),
      });
      sourceFiles.set("me.json", JSON.stringify(profile, null, 2));
    }
  }

  return {
    ...draft,
    requestText: combinedRequest,
    updatedAt: new Date().toISOString(),
    sourceFiles: Object.fromEntries(sourceFiles.entries()),
    changes,
  };
}

function assistantRefinementTargetsAbout(refinementText: string): boolean {
  const text = normalizeAssistantIntentText(refinementText);
  if (/\b(about|bio|paragraph|page)\b/.test(text)) return true;
  return !/\b(blog|post|article|title)\b/.test(text);
}

function assistantRefinementTargetsPost(refinementText: string): boolean {
  const text = normalizeAssistantIntentText(refinementText);
  if (/\b(blog|post|article|title)\b/.test(text)) return true;
  return !/\b(about|bio)\b/.test(text);
}

function extractAssistantRequestedTitle(refinementText: string): string {
  const match =
    refinementText.match(/\btitle (?:to|as)\s+["“]([^"”]+)["”]/i) ||
    refinementText.match(/\bcalled\s+["“]([^"”]+)["”]/i);
  return match?.[1]?.trim() || "";
}

async function publishAssistantSiteDraft(
  env: Env,
  site: DbSite,
  draft: AssistantSiteUpdateDraft,
): Promise<DbSite> {
  const manifest = (await loadPublishManifest(env, site.id)) || createEmptyPublishManifest();
  for (const [name, content] of Object.entries(draft.sourceFiles)) {
    const sourceName = normalizeSiteFileName(name);
    if (!sourceName || shouldIgnoreSiteSourceFile(sourceName)) continue;
    await putSiteFile(env, site.id, `src/${sourceName}`, content, getContentType(sourceName));
    manifest.sourceFiles[sourceName] = await sha256Text(content);
  }

  const profile = parseSiteProfile(draft.sourceFiles["me.json"] || "{}", site.username);
  await pruneUnreferencedSiteSourceFiles(env, site.id, profile, manifest);
  const sourceFiles = await loadSiteSourceFiles(env, site.id);
  const generatedFiles = await generateSiteHtml(
    profile,
    Array.from(sourceFiles.entries()).map(([name, content]) => ({ name, content })),
  );
  for (const [name, content] of Object.entries(generatedFiles)) {
    await putSiteFile(
      env,
      site.id,
      `public/${normalizeSiteFileName(name)}`,
      content,
      getGeneratedSiteContentType(name),
    );
  }
  await pruneGeneratedPublicFiles(env, site.id, generatedFiles);
  manifest.updatedAt = new Date().toISOString();
  await savePublishManifest(env, site.id, manifest);
  await env.DB.prepare(
    "UPDATE sites SET published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
  )
    .bind(site.id)
    .run();
  await deleteSiteFile(env, site.id, assistantSiteDraftPath(draft.threadId));

  return {
    ...site,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function saveAssistantSiteUpdateDraft(
  env: Env,
  draft: AssistantSiteUpdateDraft,
): Promise<void> {
  await putSiteFile(
    env,
    draft.siteId,
    assistantSiteDraftPath(draft.threadId),
    JSON.stringify(draft, null, 2),
    "application/json",
  );
}

async function loadAssistantSiteUpdateDraft(
  env: Env,
  siteId: string,
  threadId: string,
): Promise<AssistantSiteUpdateDraft | null> {
  const content = await getSiteFileText(env, siteId, assistantSiteDraftPath(threadId));
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    return isAssistantSiteUpdateDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isAssistantSiteUpdateDraft(value: unknown): value is AssistantSiteUpdateDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as AssistantSiteUpdateDraft;
  return (
    draft.version === 1 &&
    draft.kind === "profile_site_update" &&
    typeof draft.siteId === "string" &&
    typeof draft.siteUsername === "string" &&
    typeof draft.threadId === "string" &&
    Boolean(draft.sourceFiles) &&
    typeof draft.sourceFiles === "object" &&
    !Array.isArray(draft.sourceFiles)
  );
}

function assistantSiteDraftPath(threadId: string): string {
  const safeThreadId = threadId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 180);
  return `assistant/site-update-drafts/${safeThreadId || "thread"}.json`;
}

function assistantSiteDraftChangedFiles(draft: AssistantSiteUpdateDraft): string[] {
  const files = new Set<string>();
  if (draft.changes.aboutFile) files.add(draft.changes.aboutFile);
  if (draft.changes.postFile) files.add(draft.changes.postFile);
  files.add("me.json");
  return Array.from(files);
}

function formatAssistantSiteDraftReply(draft: AssistantSiteUpdateDraft): string {
  const parts = [`I drafted the site update for @${draft.siteUsername}.`];
  if (draft.changes.aboutFile) {
    parts.push(`About page: added a new paragraph to ${draft.changes.aboutFile}.`);
  }
  if (draft.changes.postTitle && draft.changes.postFile) {
    parts.push(`Blog: added "${draft.changes.postTitle}" at ${draft.changes.postFile}.`);
  }
  parts.push("Reply `publish` to publish it now, or tell me what to change.");
  return parts.join("\n\n");
}

function formatAssistantSiteRefinedReply(draft: AssistantSiteUpdateDraft): string {
  const parts = [`I updated the pending draft for @${draft.siteUsername}.`];
  if (draft.changes.aboutFile) parts.push(`About page: revised ${draft.changes.aboutFile}.`);
  if (draft.changes.postTitle && draft.changes.postFile) {
    parts.push(`Blog: revised "${draft.changes.postTitle}" at ${draft.changes.postFile}.`);
  }
  parts.push("Reply `publish` when it looks right, or send another change.");
  return parts.join("\n\n");
}

function formatAssistantSitePublishedReply(
  env: Env,
  site: DbSite,
  draft: AssistantSiteUpdateDraft,
  requestUrl: string,
): string {
  const parts = [`Published. I updated @${site.username}.`];
  if (draft.changes.aboutFile) parts.push(`About page: ${draft.changes.aboutFile}.`);
  if (draft.changes.postTitle) parts.push(`Blog: "${draft.changes.postTitle}".`);
  const url = getAssistantSiteAdminUrl(env, site, requestUrl);
  if (url) parts.push(`View it at ${url}`);
  return parts.join("\n\n");
}

function getAssistantSiteAdminUrl(env: Env, site: DbSite, requestUrl: string): string | null {
  const origin = getCoreWebOrigin(env, requestUrl);
  if (!origin) return null;
  return new URL(`/sites/${encodeURIComponent(site.username)}`, origin).toString();
}

function appendAssistantParagraph(markdown: string, paragraph: string): string {
  const base = markdown.trimEnd();
  return `${base}\n\n${paragraph.trim()}\n`;
}

function replaceAssistantParagraph(markdown: string, previous: string, next: string): string {
  if (markdown.includes(previous)) return markdown.replace(previous, next);
  return appendAssistantParagraph(markdown, next);
}

function parseAssistantSiteDraftFromAssistantText(
  text: string,
): ParsedAssistantSiteDraftContent | null {
  const normalized = text.replace(/\r\n/g, "\n");
  const parsed: ParsedAssistantSiteDraftContent = {};
  const aboutMatch = normalized.match(
    /About Page(?:\s+(?:Paragraph|Update))?:\s*([\s\S]*?)(?=\n{0,2}\s*(?:Blog Post|Post|Article):|$)/i,
  );
  if (aboutMatch?.[1]) {
    parsed.aboutParagraph = cleanAssistantGeneratedSnippet(aboutMatch[1]);
  }

  const blogMatch = normalized.match(/(?:Blog Post|Post|Article):\s*([\s\S]*)/i);
  if (blogMatch?.[1]) {
    const blogSection = cleanAssistantGeneratedSnippet(blogMatch[1]);
    const titleBodyMatch = blogSection.match(/^["'“”]?([^"'“”:\n]{3,140})["'“”]?\s*:\s*([\s\S]+)$/);
    if (titleBodyMatch) {
      parsed.postTitle = cleanAssistantGeneratedSnippet(titleBodyMatch[1]);
      parsed.postBody = cleanAssistantGeneratedSnippet(titleBodyMatch[2]);
    } else {
      parsed.postBody = blogSection;
    }
  }

  if (!parsed.aboutParagraph && !parsed.postBody) return null;
  return parsed;
}

function cleanAssistantGeneratedSnippet(value: string): string {
  return value
    .replace(/^```(?:markdown|md)?/i, "")
    .replace(/```$/i, "")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function assistantRequestMentionsAbout(requestText: string): boolean {
  return /\b(about page|about section|about me|bio)\b/i.test(requestText);
}

function assistantRequestMentionsBlogPost(requestText: string): boolean {
  return /\b(blog post|post about|article about|blog|article)\b/i.test(requestText);
}

function extractAssistantBlogTopic(requestText: string): string {
  const quoted =
    requestText.match(/\b(?:blog post|post|article)\s+(?:about|on)\s+["'“]([^"'”]+)["'”]/i) ||
    requestText.match(/\b(?:about|on)\s+["'“]([^"'”]+)["'”]/i);
  if (quoted?.[1]) return quoted[1].trim();

  const unquoted = requestText.match(/\b(?:blog post|post|article)\s+(?:about|on)\s+([^.!?\n]+)(?:[.!?\n]|$)/i);
  if (unquoted?.[1]) {
    return unquoted[1].replace(/\b(and|then|also)\b.*$/i, "").trim();
  }
  return "personal AI assistants";
}

function assistantBlogTitleFromTopic(topic: string): string {
  const normalizedTopic = topic.trim() || "personal AI assistants";
  return `The Rise of ${titleCaseAssistantSiteText(normalizedTopic)}`;
}

function titleCaseAssistantSiteText(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ai") return "AI";
      if (lower === "me3") return "ME3";
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function slugifyAssistantSitePath(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "personal-ai-assistants";
}

function generateAssistantAboutParagraph(requestText: string): string {
  const text = normalizeAssistantIntentText(requestText);
  if (/\b(short|shorter|concise|tight)\b/.test(text)) {
    return "This space collects experiments in creative work, useful systems, and personal AI assistants, turning scattered ideas into practical momentum.";
  }
  if (/\b(playful|fun|weird|lighter)\b/.test(text)) {
    return "This site is my little workshop for curious experiments: part notebook, part launchpad, and part invitation to see what happens when personal AI assistants help ideas find their next shape.";
  }
  if (/\b(professional|serious|polished|clear)\b/.test(text)) {
    return "This site brings together my work on practical systems, creative exploration, and personal AI assistants, with a focus on turning emerging ideas into clear, useful outcomes.";
  }
  return "This site is a living notebook for experiments in creative systems, personal AI assistants, and the small practical rituals that turn scattered ideas into momentum.";
}

function generateAssistantBlogPostMarkdown(
  topic: string,
  title: string,
  requestText: string,
): string {
  const text = normalizeAssistantIntentText(requestText);
  if (/\b(short|shorter|concise|tight)\b/.test(text)) {
    return normalizeAssistantPostMarkdown(
      title,
      `Personal AI assistants are becoming less like flashy software and more like everyday infrastructure. The best ones remember context, reduce coordination drag, and help people move from intention to action without turning the day into another dashboard.\n\nThe interesting shift is not that assistants can answer questions. It is that they can quietly hold the thread: the note you meant to write, the follow-up you almost forgot, the idea that needs one more pass before it becomes useful.`,
    );
  }
  if (/\b(playful|fun|weird|lighter)\b/.test(text)) {
    return normalizeAssistantPostMarkdown(
      title,
      `Personal AI assistants are starting to feel less like tools and more like tiny studios that fit in the corner of your day. They can catch loose thoughts, sort half-formed plans, and nudge ideas from "someday" into "let's try this now."\n\nThe magic is not that they do everything for us. It is that they make it easier to stay in motion. A good assistant keeps the boring bits from swallowing the bright bits, which leaves more room for curiosity, taste, and actual follow-through.`,
    );
  }
  return normalizeAssistantPostMarkdown(
    title,
    `Personal AI assistants are moving from novelty to quiet infrastructure. Instead of asking people to manage another tool, the most useful assistants sit close to the work: they remember context, surface next steps, and help turn loose intentions into visible progress.\n\nThe real promise is not automation for its own sake. It is continuity. A personal assistant can hold the thread between a note, a conversation, a calendar commitment, and a half-finished idea, making it easier to return to the work with less friction.\n\nAs these systems mature, the best ones will feel less like command centers and more like trusted companions for attention. They will help people notice what matters, protect time for deeper work, and move steadily from possibility to practice.`,
  );
}

function normalizeAssistantPostMarkdown(title: string, body: string): string {
  const cleanBody = cleanAssistantGeneratedSnippet(body);
  if (/^#\s+/m.test(cleanBody)) return `${cleanBody.trim()}\n`;
  return `# ${title.trim()}\n\n${cleanBody.trim()}\n`;
}

function markdownExcerpt(markdown: string): string {
  return markdown
    .replace(/^#.+$/gm, "")
    .replace(/[#*_>`[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

app.get("/api/assistant/threads", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const statusParam = c.req.query("status");
  const status =
    statusParam === "archived" || statusParam === "deleted" ? statusParam : "active";
  const projectIdParam = c.req.query("projectId");
  const normalizedProjectId = normalizeNullableText(projectIdParam);
  const projectFilter =
    projectIdParam === "none" || projectIdParam === "ungrouped"
      ? "none"
      : normalizedProjectId;
  const search = normalizeNullableText(c.req.query("q"));
  const limit = Math.min(
    Math.max(Number.parseInt(c.req.query("limit") || "40", 10) || 40, 1),
    100,
  );
  const where = ["owner_id = ?", "status = ?"];
  const bindings: unknown[] = [ownerId, status];
  if (projectFilter === "none") {
    where.push("project_id IS NULL");
  } else if (projectFilter) {
    where.push("project_id = ?");
    bindings.push(projectFilter);
  }
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
    where.push(
      `(title LIKE ? ESCAPE '\\' OR EXISTS (
        SELECT 1
        FROM assistant_messages
        WHERE assistant_messages.thread_id = assistant_threads.id
          AND assistant_messages.owner_id = assistant_threads.owner_id
          AND assistant_messages.role IN ('user', 'assistant')
          AND assistant_messages.content LIKE ? ESCAPE '\\'
      ))`,
    );
    bindings.push(pattern, pattern);
  }
  bindings.push(limit);

  const rows = await c.env.DB.prepare(
    `SELECT id, owner_id, title, origin_surface, project_id, status, pinned_at,
            archived_at, deleted_at, last_message_at, created_at, updated_at
     FROM assistant_threads
     WHERE ${where.join(" AND ")}
     ORDER BY pinned_at IS NULL, pinned_at DESC,
              last_message_at IS NULL, last_message_at DESC,
              updated_at DESC
     LIMIT ?`,
  )
    .bind(...bindings)
    .all<AssistantThreadRow>();

  return c.json({ threads: (rows.results || []).map(serializeAssistantThread) });
});

app.patch("/api/assistant/threads/:threadId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const threadId = normalizeAssistantThreadId(c.req.param("threadId"));
  if (!threadId) return c.json({ ok: false, error: "Thread id is required" }, 400);

  const thread = await getAssistantThread(c.env, ownerId, threadId);
  if (!thread) return c.json({ ok: false, error: "Assistant thread not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId =
    Object.prototype.hasOwnProperty.call(body, "projectId")
      ? normalizeNullableText(body.projectId)
      : thread.project_id;
  if (projectId && !(await assistantProjectExists(c.env, ownerId, projectId))) {
    return c.json({ ok: false, error: "Mission Control project not found" }, 404);
  }

  let nextStatus = thread.status;
  if (body.status === "active" || body.status === "archived") {
    nextStatus = body.status;
  }
  const pinned =
    Object.prototype.hasOwnProperty.call(body, "pinned") && typeof body.pinned === "boolean"
      ? body.pinned
      : Boolean(thread.pinned_at);
  const title = normalizeNullableText(body.title) || thread.title;

  await c.env.DB.prepare(
    `UPDATE assistant_threads
     SET title = ?, project_id = ?, status = ?,
         pinned_at = CASE WHEN ? THEN COALESCE(pinned_at, CURRENT_TIMESTAMP) ELSE NULL END,
         archived_at = CASE WHEN ? = 'archived' THEN COALESCE(archived_at, CURRENT_TIMESTAMP) ELSE NULL END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(title, projectId, nextStatus, pinned ? 1 : 0, nextStatus, threadId, ownerId)
    .run();

  const updated = await getAssistantThread(c.env, ownerId, threadId);
  return c.json({ thread: updated ? serializeAssistantThread(updated) : serializeAssistantThread(thread) });
});

app.delete("/api/assistant/threads/:threadId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const threadId = normalizeAssistantThreadId(c.req.param("threadId"));
  if (!threadId) return c.json({ ok: false, error: "Thread id is required" }, 400);

  const thread = await getAssistantThread(c.env, ownerId, threadId);
  if (!thread) return c.json({ ok: false, error: "Assistant thread not found" }, 404);

  await c.env.DB.prepare(
    `UPDATE assistant_threads
     SET status = 'deleted', deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
         archived_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(threadId, ownerId)
    .run();
  await c.env.DB.prepare(
    `UPDATE assistant_messages
     SET content = ''
     WHERE owner_id = ? AND thread_id = ?`,
  )
    .bind(ownerId, threadId)
    .run();

  return c.json({ ok: true });
});

app.get("/api/assistant/threads/:threadId/export", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const threadId = normalizeAssistantThreadId(c.req.param("threadId"));
  if (!threadId) return c.json({ ok: false, error: "Thread id is required" }, 400);

  const thread = await getAssistantThread(c.env, ownerId, threadId);
  if (!thread || thread.status === "deleted") {
    return c.json({ ok: false, error: "Assistant thread not found" }, 404);
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, role, content, created_at
     FROM assistant_messages
     WHERE owner_id = ? AND thread_id = ? AND role IN ('user', 'assistant')
     ORDER BY created_at ASC`,
  )
    .bind(ownerId, threadId)
    .all<AssistantMessageRow>();

  return c.json({
    thread: serializeAssistantThread(thread),
    messages: (rows.results || []).map(serializeAssistantMessage),
    exportedAt: new Date().toISOString(),
  });
});

app.get("/api/assistant/threads/:threadId/messages", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const threadId = normalizeAssistantThreadId(c.req.param("threadId"));
  if (!threadId) return c.json({ ok: false, error: "Thread id is required" }, 400);

  const thread = await getAssistantThread(c.env, ownerId, threadId);
  if (!thread) return c.json({ ok: false, error: "Assistant thread not found" }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT id, role, content, created_at
     FROM assistant_messages
     WHERE owner_id = ? AND thread_id = ? AND role IN ('user', 'assistant')
     ORDER BY created_at ASC`,
  )
    .bind(ownerId, threadId)
    .all<AssistantMessageRow>();

  return c.json({
    thread: serializeAssistantThread(thread),
    messages: (rows.results || []).map(serializeAssistantMessage),
  });
});

async function handleAssistantChatTurn(c: Context<{ Bindings: Env }>) {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  if (!(await isCorePluginEnabled(c.env, "me3.agent-chat"))) {
    return c.json(
      { ok: false, error: "Agent Chat plugin is disabled" },
      403,
    );
  }

  const body = await c.req
    .json<AssistantChatTurnBody>()
    .catch((): AssistantChatTurnBody => ({}));
  const messageText =
    typeof body.messageText === "string" ? body.messageText.trim() : "";
  if (!messageText) {
    return c.json({ ok: false, error: "Message text is required" }, 400);
  }
  const selectedModel = parseAssistantChatTurnModelSelection(body.model);
  if (selectedModel && "error" in selectedModel) {
    return c.json({ ok: false, error: selectedModel.error }, 400);
  }
  const requestedThreadId = normalizeAssistantThreadId(body.threadId);
  const requestedProjectId = normalizeNullableText(body.projectId);
  const attachmentManifest = createAssistantAttachmentAuditManifest(body.attachments);

  const replyToMessageId =
    typeof body.replyToMessageId === "string" ||
    typeof body.replyToMessageId === "number"
      ? body.replyToMessageId
      : null;
  const thread = await resolveAssistantThreadForTurn(
    c.env,
    ownerId,
    requestedThreadId,
    messageText,
    requestedProjectId,
  );
  if (!thread) {
    return c.json({ ok: false, error: "Assistant thread is required" }, 500);
  }
  if ("error" in thread) {
    return c.json({ ok: false, error: thread.error }, thread.status);
  }

  const builderAction = await createAssistantJobBuilderAction(c.env, ownerId, messageText);
  if (builderAction) {
    const replyText = assistantJobBuilderReplyText(builderAction);
    await persistAssistantTurnMessages(c.env, ownerId, thread.id, messageText, replyText);
    await touchAssistantThread(c.env, ownerId, thread.id);
    return c.json({
      ok: true,
      auditId: null,
      turnId: null,
      threadId: thread.id,
      specialist: "core.job-builder",
      replyText,
      model: null,
      source: "tool",
      jobBuilderAction: builderAction,
      emailAction: null,
      reminderAction: null,
      contentAction: null,
      contactsChanged: false,
    });
  }

  const siteAction = await maybeHandleAssistantSiteToolAction(
    c.env,
    ownerId,
    thread.id,
    messageText,
    c.req.url,
  );
  if (siteAction) {
    await persistAssistantTurnMessages(c.env, ownerId, thread.id, messageText, siteAction.replyText);
    await touchAssistantThread(c.env, ownerId, thread.id);
    return c.json(buildAssistantSiteToolPayload(thread.id, siteAction));
  }

  const runtime = c.env.ME3_USER_AGENT;
  if (!runtime) {
    return c.json(
      { ok: false, error: "Agent chat runtime is not configured" },
      503,
    );
  }

  const turn = await createAgentSandboxTurnRecord(c.env, {
    userId: ownerId,
    messageText,
    replyToMessageId,
    metadata: {
      surface: "assistant",
      route: c.req.path,
      threadId: thread.id,
      requestedThreadId,
      requestedProjectId,
      selectedModel: selectedModel || null,
      attachmentCount: Array.isArray(body.attachments) ? body.attachments.length : 0,
      attachmentManifest,
    },
  });

  const id = runtime.idFromName(ownerId);
  const stub = runtime.get(id);
  const response = await stub.fetch(
    "https://me3-core-user-agent.internal/dispatch/sandbox",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: ownerId,
        connectionId: turn.connection.id,
        sourceEventId: turn.sourceEvent.id,
        turnId: turn.turnId,
        threadId: thread.id,
        messageText: turn.messageText,
        replyToMessageId: turn.replyToMessageId,
        selectedModel,
        attachments: attachmentManifest,
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok || payload?.ok !== true) {
    return c.json(
      {
        ok: false,
        error:
          typeof payload?.error === "string"
            ? payload.error
            : `Agent chat runtime request failed (${response.status})`,
      },
      503,
    );
  }

  await touchAssistantThread(c.env, ownerId, thread.id);
  return c.json({ ...payload, threadId: thread.id });
}

async function handleAssistantChatTurnStream(c: Context<{ Bindings: Env }>) {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  if (!(await isCorePluginEnabled(c.env, "me3.agent-chat"))) {
    return c.json(
      { ok: false, error: "Agent Chat plugin is disabled" },
      403,
    );
  }

  const body = await c.req
    .json<AssistantChatTurnBody>()
    .catch((): AssistantChatTurnBody => ({}));
  const messageText =
    typeof body.messageText === "string" ? body.messageText.trim() : "";
  if (!messageText) {
    return c.json({ ok: false, error: "Message text is required" }, 400);
  }
  const selectedModel = parseAssistantChatTurnModelSelection(body.model);
  if (selectedModel && "error" in selectedModel) {
    return c.json({ ok: false, error: selectedModel.error }, 400);
  }

  const requestedThreadId = normalizeAssistantThreadId(body.threadId);
  const requestedProjectId = normalizeNullableText(body.projectId);
  const replyToMessageId =
    typeof body.replyToMessageId === "string" ||
    typeof body.replyToMessageId === "number"
      ? body.replyToMessageId
      : null;
  const attachmentCount = Array.isArray(body.attachments) ? body.attachments.length : 0;
  const attachmentManifest = createAssistantAttachmentAuditManifest(body.attachments);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AssistantChatTurnStreamEvent, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      let auditContext:
        | {
            connectionId: string;
            sourceEventId: string;
            turnId: string;
            threadId: string;
          }
        | null = null;

      try {
        send("status", { state: "started" });
        const thread = await resolveAssistantThreadForTurn(
          c.env,
          ownerId,
          requestedThreadId,
          messageText,
          requestedProjectId,
        );
        if (!thread) {
          send("error", { ok: false, error: "Assistant thread is required" });
          return;
        }
        if ("error" in thread) {
          send("error", { ok: false, error: thread.error, status: thread.status });
          return;
        }

        send("thread", { threadId: thread.id });

        const builderAction = await createAssistantJobBuilderAction(c.env, ownerId, messageText);
        if (builderAction) {
          const replyText = assistantJobBuilderReplyText(builderAction);
          await persistAssistantTurnMessages(c.env, ownerId, thread.id, messageText, replyText);
          await touchAssistantThread(c.env, ownerId, thread.id);
          for (const chunk of splitAssistantStreamText(replyText)) {
            send("delta", { text: chunk });
          }
          send("done", {
            ok: true,
            auditId: null,
            turnId: null,
            threadId: thread.id,
            specialist: "core.job-builder",
            replyText,
            model: null,
            source: "tool",
            jobBuilderAction: builderAction,
            emailAction: null,
            reminderAction: null,
            contentAction: null,
            contactsChanged: false,
          });
          return;
        }

        const siteAction = await maybeHandleAssistantSiteToolAction(
          c.env,
          ownerId,
          thread.id,
          messageText,
          c.req.url,
        );
        if (siteAction) {
          await persistAssistantTurnMessages(
            c.env,
            ownerId,
            thread.id,
            messageText,
            siteAction.replyText,
          );
          await touchAssistantThread(c.env, ownerId, thread.id);
          for (const chunk of splitAssistantStreamText(siteAction.replyText)) {
            send("delta", { text: chunk });
          }
          send("done", buildAssistantSiteToolPayload(thread.id, siteAction));
          return;
        }

        const runtime = c.env.ME3_USER_AGENT;
        if (!runtime) {
          send("error", { ok: false, error: "Agent chat runtime is not configured" });
          return;
        }

        const turn = await createAgentSandboxTurnRecord(c.env, {
          userId: ownerId,
          messageText,
          replyToMessageId,
          metadata: {
            surface: "assistant",
            route: c.req.path,
            stream: true,
            threadId: thread.id,
            requestedThreadId,
            requestedProjectId,
            selectedModel: selectedModel || null,
            attachmentCount,
            attachmentManifest,
          },
        });
        auditContext = {
          connectionId: turn.connection.id,
          sourceEventId: turn.sourceEvent.id,
          turnId: turn.turnId,
          threadId: thread.id,
        };

        const id = runtime.idFromName(ownerId);
        const stub = runtime.get(id);
        const response = await stub.fetch(
          "https://me3-core-user-agent.internal/dispatch/sandbox",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: c.req.raw.signal,
            body: JSON.stringify({
              userId: ownerId,
              connectionId: turn.connection.id,
              sourceEventId: turn.sourceEvent.id,
              turnId: turn.turnId,
              threadId: thread.id,
              messageText: turn.messageText,
              replyToMessageId: turn.replyToMessageId,
              selectedModel,
              attachments: attachmentManifest,
            }),
          },
        );

        const payload = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;

        if (!response.ok || payload?.ok !== true) {
          await insertAssistantChatStreamAuditEvent(c.env, {
            ownerId,
            connectionId: turn.connection.id,
            sourceEventId: turn.sourceEvent.id,
            turnId: turn.turnId,
            threadId: thread.id,
            route: c.req.path,
            outcome: "failed",
            selectedModel: selectedModel || null,
            attachmentCount,
            attachmentManifest,
            error:
              typeof payload?.error === "string"
                ? payload.error
                : `Agent chat runtime request failed (${response.status})`,
          });
          send("error", {
            ok: false,
            error:
              typeof payload?.error === "string"
                ? payload.error
                : `Agent chat runtime request failed (${response.status})`,
          });
          return;
        }

        await touchAssistantThread(c.env, ownerId, thread.id);
        const replyText = typeof payload.replyText === "string" ? payload.replyText : "";
        for (const chunk of splitAssistantStreamText(replyText)) {
          send("delta", { text: chunk });
        }
        await insertAssistantChatStreamAuditEvent(c.env, {
          ownerId,
          connectionId: turn.connection.id,
          sourceEventId: turn.sourceEvent.id,
          turnId: turn.turnId,
          threadId: thread.id,
          route: c.req.path,
          outcome: "completed",
          selectedModel: selectedModel || null,
          attachmentCount,
          attachmentManifest,
          error: null,
        });
        send("done", { ...payload, threadId: thread.id });
      } catch (error) {
        if (c.req.raw.signal.aborted) {
          if (auditContext) {
            await insertAssistantChatStreamAuditEvent(c.env, {
              ownerId,
              connectionId: auditContext.connectionId,
              sourceEventId: auditContext.sourceEventId,
              turnId: auditContext.turnId,
              threadId: auditContext.threadId,
              route: c.req.path,
              outcome: "stopped",
              selectedModel: selectedModel || null,
              attachmentCount,
              attachmentManifest,
              error: null,
            });
          }
          return;
        }
        if (auditContext) {
          await insertAssistantChatStreamAuditEvent(c.env, {
            ownerId,
            connectionId: auditContext.connectionId,
            sourceEventId: auditContext.sourceEventId,
            turnId: auditContext.turnId,
            threadId: auditContext.threadId,
            route: c.req.path,
            outcome: "failed",
            selectedModel: selectedModel || null,
            attachmentCount,
            attachmentManifest,
            error: error instanceof Error ? error.message : "Assistant stream failed",
          });
        }
        send("error", {
          ok: false,
          error: error instanceof Error ? error.message : "Assistant stream failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

type AssistantAttachmentAuditManifestItem = {
  id: string | null;
  name: string | null;
  mimeType: string | null;
  size: number | null;
  kind: string | null;
  status: string | null;
  storageKey: string | null;
  hasText: boolean;
  textTruncated: boolean;
};

function createAssistantAttachmentAuditManifest(
  attachments: unknown,
): AssistantAttachmentAuditManifestItem[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((attachment): attachment is Record<string, unknown> =>
      Boolean(attachment && typeof attachment === "object" && !Array.isArray(attachment)),
    )
    .map((attachment) => ({
      id: normalizeAssistantAuditText(attachment.id),
      name: normalizeAssistantAuditText(attachment.name),
      mimeType: normalizeAssistantAuditText(attachment.mimeType),
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size)
          ? Math.max(0, Math.round(attachment.size))
          : null,
      kind: normalizeAssistantAuditText(attachment.kind),
      status: normalizeAssistantAuditText(attachment.status),
      storageKey: normalizeAssistantAuditText(attachment.storageKey),
      hasText: Boolean(attachment.hasText),
      textTruncated: Boolean(attachment.textTruncated),
    }));
}

function classifyAssistantUploadKind(
  filename: string,
  mimeType: string,
): "text" | "image" | null {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedName = filename.toLowerCase();
  if (normalizedMime.startsWith("image/")) return "image";
  if (
    normalizedMime.startsWith("text/") ||
    normalizedMime === "application/json" ||
    normalizedMime === "application/xml" ||
    normalizedMime === "application/csv" ||
    normalizedName.endsWith(".md") ||
    normalizedName.endsWith(".markdown") ||
    normalizedName.endsWith(".csv") ||
    normalizedName.endsWith(".tsv") ||
    normalizedName.endsWith(".json") ||
    normalizedName.endsWith(".txt") ||
    normalizedName.endsWith(".xml")
  ) {
    return "text";
  }
  return null;
}

function normalizeAssistantAttachmentMimeType(file: File, filename: string) {
  const explicit = file.type.trim();
  if (explicit) return explicit;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".tsv")) return "text/tab-separated-values";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function formatByteLimit(bytes: number) {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${Math.round(bytes / 100_000) / 10} MB`;
}

function isMissingAssistantAttachmentsTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    /assistant_attachments/i.test(message) &&
    /no such table|not found|no such object/i.test(message)
  );
}

function normalizeAssistantAuditText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

async function insertAssistantChatStreamAuditEvent(
  env: Env,
  input: {
    ownerId: string;
    connectionId: string;
    sourceEventId: string;
    turnId: string;
    threadId: string;
    route: string;
    outcome: "completed" | "failed" | "stopped";
    selectedModel: ReturnType<typeof parseAssistantChatTurnModelSelection> | null;
    attachmentCount: number;
    attachmentManifest: AssistantAttachmentAuditManifestItem[];
    error: string | null;
  },
) {
  try {
    await insertProviderChannelEvent(env, {
      channel: "sandbox",
      connectionId: input.connectionId,
      direction: "system",
      eventType: "message",
      status:
        input.outcome === "completed"
          ? "sent"
          : input.outcome === "stopped"
            ? "skipped"
            : "failed",
      providerEventId: `${input.sourceEventId}:stream:${input.outcome}`,
      providerMessageId: null,
      replyToMessageId: null,
      textBody: null,
      rawJson: {
        runtime: "sandbox",
        surface: "assistant",
        route: input.route,
        stream: true,
        streamOutcome: input.outcome,
        turnId: input.turnId,
        threadId: input.threadId,
        ownerId: input.ownerId,
        sourceEventId: input.sourceEventId,
        selectedModel: input.selectedModel,
        attachmentCount: input.attachmentCount,
        attachmentManifest: input.attachmentManifest,
      },
      errorMessage: input.error,
    });
  } catch {
    // Stream outcome audit should not break the user-visible chat response.
  }
}

function splitAssistantStreamText(text: string) {
  const normalized = text || "";
  if (!normalized) return [""];
  const chunks: string[] = [];
  for (let cursor = 0; cursor < normalized.length; cursor += 80) {
    chunks.push(normalized.slice(cursor, cursor + 80));
  }
  return chunks;
}

app.post("/api/assistant/chat/turn", handleAssistantChatTurn);
app.post("/api/assistant/chat/turn/stream", handleAssistantChatTurnStream);
app.post("/api/agent/sandbox", handleAssistantChatTurn);

app.post("/api/agent/channels/soulink/dispatch", async (c) => {
  if (!(await isCorePluginEnabled(c.env, "me3.agent-chat"))) {
    return c.json({ ok: false, error: "Agent Chat plugin is disabled" }, 403);
  }

  const body = await c.req.json<SoulinkDispatchBody>().catch((): SoulinkDispatchBody => ({}));
  const messageText = typeof body.messageText === "string" ? body.messageText.trim() : "";
  const sourceEventId = typeof body.sourceEventId === "string" ? body.sourceEventId.trim() : "";
  const streamChannelId = typeof body.streamChannelId === "string" ? body.streamChannelId.trim() : "";
  const replyToMessageId =
    typeof body.replyToMessageId === "string" || typeof body.replyToMessageId === "number"
      ? body.replyToMessageId
      : null;

  if (!messageText) return c.json({ ok: false, error: "Message text is required" }, 400);
  if (!sourceEventId) return c.json({ ok: false, error: "sourceEventId is required" }, 400);
  if (!streamChannelId) return c.json({ ok: false, error: "streamChannelId is required" }, 400);

  const connection = await getActiveSoulinkConnectionForThread(c.env, streamChannelId);
  if (!connection) {
    return c.json({ ok: false, error: "Soulink channel is not connected to this ME3 Core install" }, 404);
  }

  const authResult = verifySoulinkDispatchAuth(connection, c.req.header("authorization"));
  if (!authResult.ok) {
    return c.json({ ok: false, error: authResult.error }, authResult.status as any);
  }

  const duplicate = await getAgentChannelEventByProviderEventId(c.env, connection.id, sourceEventId);
  if (duplicate) {
    return c.json({
      ok: true,
      deduped: true,
      auditId: null,
      turnId: null,
      specialist: "core.agent-chat",
      replyText: null,
      model: null,
      source: null,
    });
  }

  const eventId = await insertProviderChannelEvent(c.env, {
    channel: "soulink",
    connectionId: connection.id,
    direction: "inbound",
    eventType: "message",
    status: "received",
    providerEventId: sourceEventId,
    providerMessageId: sourceEventId,
    replyToMessageId,
    textBody: messageText,
    rawJson: body,
    errorMessage: null,
  });

  await c.env.DB.prepare(
    `UPDATE agent_channel_connections
     SET last_inbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(connection.id)
    .run();

  const turnId = crypto.randomUUID();
  const response = await dispatchAgentChannelTurn(c.env, {
    userId: connection.user_id,
    connectionId: connection.id,
    sourceEventId: eventId,
    turnId,
    messageText,
    replyToMessageId,
  });

  if (!response.ok) {
    await insertProviderChannelEvent(c.env, {
      channel: "soulink",
      connectionId: connection.id,
      direction: "system",
      eventType: "error",
      status: "failed",
      providerEventId: `${sourceEventId}:dispatch-error`,
      providerMessageId: null,
      replyToMessageId,
      textBody: messageText,
      rawJson: response,
      errorMessage: response.error || "Agent dispatch failed",
    });
    return c.json(response, 503 as any);
  }

  if (response.replyText) {
    await insertProviderChannelEvent(c.env, {
      channel: "soulink",
      connectionId: connection.id,
      direction: "outbound",
      eventType: "send",
      status: "pending",
      providerEventId: `${sourceEventId}:reply`,
      providerMessageId: null,
      replyToMessageId,
      textBody: response.replyText,
      rawJson: response,
      errorMessage: null,
    });
    await c.env.DB.prepare(
      `UPDATE agent_channel_connections
       SET last_outbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(connection.id)
      .run();
  }

  return c.json({
    ...response,
    streamChannelType: connection.provider_connection_id || "messaging",
    streamChannelId,
  });
});

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

  const authState = await getOwnerAuthState(c.env);
  return c.json({
    me3: {
      connected: authState.me3Configured,
      origin: getMe3CloudOrigin(c.env),
      disconnectAvailable: authState.passwordConfigured,
    },
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

app.get("/api/accounts/entries", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await listFinancialEntries(c.env, ownerId, new URL(c.req.url).searchParams));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.post("/api/accounts/entries", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    const body = await c.req.json<unknown>().catch((): unknown => ({}));
    return c.json(await createFinancialEntry(c.env, ownerId, body), 201);
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.put("/api/accounts/entries/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    const body = await c.req.json<unknown>().catch((): unknown => ({}));
    return c.json(await updateFinancialEntry(c.env, ownerId, c.req.param("id"), body));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.delete("/api/accounts/entries/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await deleteFinancialEntry(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.get("/api/accounts/categories", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await listFinancialCategories(c.env, ownerId, c.req.query("entryType")));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.post("/api/accounts/categories", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    const body = await c.req.json<unknown>().catch((): unknown => ({}));
    return c.json(await createFinancialCategory(c.env, ownerId, body), 201);
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.delete("/api/accounts/categories/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await deleteFinancialCategory(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.get("/api/accounts/export", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return exportFinancialEntriesCsv(c.env, ownerId, new URL(c.req.url).searchParams);
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.post("/api/accounts/import", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await importFinancialEntriesCsv(c.env, ownerId, await c.req.formData()));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.get("/api/accounts/stats", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await getFinancialStats(c.env, ownerId, c.req.query("entryType") || null));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.get("/api/accounts/stripe/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await getAccountsStripeStatus(c.env, ownerId));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.post("/api/accounts/stripe/sync", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireAccountsPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await syncAccountsStripe(c.env, ownerId));
  } catch (error) {
    return accountsErrorResponse(c, error);
  }
});

app.get("/api/journal/days/:date", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireJournalPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await getJournalDay(c.env, ownerId, c.req.param("date")));
  } catch (error) {
    return journalErrorResponse(c, error);
  }
});

app.patch("/api/journal/days/:date", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireJournalPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateJournalDay(
        c.env,
        ownerId,
        c.req.param("date"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return journalErrorResponse(c, error);
  }
});

app.get("/api/journal/archive", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireJournalPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await listJournalArchive(c.env, ownerId, {
        limit: c.req.query("limit"),
      }),
    );
  } catch (error) {
    return journalErrorResponse(c, error);
  }
});

app.get("/api/mission-control/projects", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({ projects: await listMissionProjects(c.env, ownerId) });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/dashboard", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await getMissionDashboard(c.env, ownerId));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.patch("/api/mission-control/dashboard", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateMissionDashboard(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/wheel", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await getMissionWheel(c.env, ownerId));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.patch("/api/mission-control/wheel/settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateMissionWheelSettings(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/wheel/snapshots", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await listMissionWheelSnapshots(c.env, ownerId, c.req.query("limit")),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/wheel/snapshots", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await createMissionWheelSnapshot(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      ),
      201,
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/projects", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await createMissionProject(c.env, ownerId, await c.req.json().catch(() => ({}))),
      201,
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.patch("/api/mission-control/projects/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateMissionProject(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/tasks", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await listMissionTaskPage(c.env, ownerId, {
        status: c.req.query("status"),
        dueDate: c.req.query("date"),
        activeOnly: c.req.query("active") === "1",
        archived: c.req.query("archived") === "1",
        projectId: c.req.query("projectId"),
        limit: c.req.query("limit"),
        cursor: c.req.query("cursor"),
      }),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/tasks", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await createMissionTask(c.env, ownerId, await c.req.json().catch(() => ({}))),
      201,
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/tasks/:id/local-run", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const missionBlocked = await requireMissionControlPlugin(c);
  if (missionBlocked) return missionBlocked;
  const localExecutorBlocked = await requireLocalExecutorPlugin(c);
  if (localExecutorBlocked) return localExecutorBlocked;

  try {
    return c.json(
      await createMissionTaskLocalExecutorRun(c.env, ownerId, c.req.param("id")),
      201,
    );
  } catch (error) {
    if (error instanceof MissionControlInputError) {
      return missionControlErrorResponse(c, error);
    }
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/mission-control/tasks/:id/weekly-review/submit", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await submitMissionWeeklyReviewTask(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.patch("/api/mission-control/tasks/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateMissionTask(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.delete("/api/mission-control/tasks/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await archiveMissionTask(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/weekly-review/:runId/submit", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await submitMissionWeeklyReview(
        c.env,
        ownerId,
        c.req.param("runId"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/approvals", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({
      approvals: await listMissionApprovals(c.env, ownerId, c.req.query("status")),
    });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/approvals/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await resolveMissionApproval(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/agent-runs", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({ runs: await listMissionAgentRuns(c.env, ownerId) });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/plugin-activity", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({ activity: await listMissionPluginActivity(c.env, ownerId) });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.delete("/api/mission-control/activity", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await clearMissionActivity(c.env, ownerId));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/memory", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({ memory: await listMissionMemory(c.env, ownerId) });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/memory", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await createMissionMemory(c.env, ownerId, await c.req.json().catch(() => ({}))),
      201,
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/memory/suggestions", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await suggestMissionMemory(c.env, ownerId, await c.req.json().catch(() => ({}))),
      201,
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/memory/:id/approve", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await approveMissionMemory(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.patch("/api/mission-control/memory/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateMissionMemory(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.delete("/api/mission-control/memory/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await deleteMissionMemory(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/context-sources", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({ sources: await listMissionContextSources(c.env, ownerId) });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/context-sources", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await createMissionContextSource(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      ),
      201,
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.patch("/api/mission-control/context-sources/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateMissionContextSource(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.delete("/api/mission-control/context-sources/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await deleteMissionContextSource(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/setup", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({ setup: await getMissionSetup(c.env, ownerId) });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/daemon/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json({ daemon: await getMissionDaemonStatus(c.env, ownerId) });
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.post("/api/mission-control/daemon/pairing/start", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await startMissionDaemonPairing(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
      ),
      201,
    );
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/mission-control/daemon/audit", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireMissionControlPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await listMissionDaemonAudit(c.env, ownerId));
  } catch (error) {
    return missionControlErrorResponse(c, error);
  }
});

app.get("/api/local-executor/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await getLocalExecutorStatus(c.env, ownerId));
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/pairing/start", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await startLocalExecutorPairing(
        c.env,
        ownerId,
        await c.req.json().catch(() => ({})),
        { apiBase: `${getCoreApiOrigin(c.env, c.req.url)}/api/local-executor` },
      ),
      201,
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.get("/api/local-executor/policies", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await listLocalExecutorPolicies(c.env, ownerId));
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/policies", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await createLocalExecutorPolicy(c.env, ownerId, await c.req.json().catch(() => ({}))),
      201,
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.patch("/api/local-executor/policies/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await updateLocalExecutorPolicy(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.delete("/api/local-executor/policies/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await deleteLocalExecutorPolicy(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/runs", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await createLocalExecutorRun(c.env, ownerId, await c.req.json().catch(() => ({}))),
      201,
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.get("/api/local-executor/runs/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await getLocalExecutorRun(c.env, ownerId, c.req.param("id")));
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/runs/:id/cancel", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await cancelLocalExecutorRun(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/runs/:id/retry", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(
      await retryLocalExecutorRun(
        c.env,
        ownerId,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.get("/api/local-executor/audit", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  const blocked = await requireLocalExecutorPlugin(c);
  if (blocked) return blocked;

  try {
    return c.json(await listLocalExecutorAudit(c.env, ownerId));
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/daemon/pairing/complete", async (c) => {
  try {
    return c.json(await completeLocalExecutorPairing(c.env, await c.req.json().catch(() => ({}))));
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/daemon/heartbeat", async (c) => {
  try {
    const auth = await authenticateLocalExecutorDaemon(
      c.env,
      c.req.header("Authorization") || null,
    );
    return c.json(
      await recordLocalExecutorHeartbeat(c.env, auth, await c.req.json().catch(() => ({}))),
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/daemon/runs/claim", async (c) => {
  try {
    const auth = await authenticateLocalExecutorDaemon(
      c.env,
      c.req.header("Authorization") || null,
    );
    return c.json(await claimLocalExecutorRun(c.env, auth, await c.req.json().catch(() => ({}))));
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/daemon/runs/:id/events", async (c) => {
  try {
    const auth = await authenticateLocalExecutorDaemon(
      c.env,
      c.req.header("Authorization") || null,
    );
    return c.json(
      await appendLocalExecutorRunProgress(
        c.env,
        auth,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

app.post("/api/local-executor/daemon/runs/:id/complete", async (c) => {
  try {
    const auth = await authenticateLocalExecutorDaemon(
      c.env,
      c.req.header("Authorization") || null,
    );
    return c.json(
      await completeLocalExecutorRun(
        c.env,
        auth,
        c.req.param("id"),
        await c.req.json().catch(() => ({})),
      ),
    );
  } catch (error) {
    return localExecutorErrorResponse(c, error);
  }
});

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
      soulinkAgentAccess: true,
      telegramAgentAccess: true,
    },
    can_create: Number(count?.count || 0) < 4,
  });
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
  const expectedToken = await generateUnsubscribeToken(normalizedEmail, username);
  if (token !== expectedToken) return unsubscribeHtml("Invalid unsubscribe link", "This link appears to be invalid or expired.");

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
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
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

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
       WHERE user_id = ? AND recurrence_rule IS NOT NULL
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

app.get("/api/mailbox", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const owner = await getOwnerProfile(c.env, ownerId);
  return c.json(await getAgentMailboxOverview(c.env, ownerId, owner || undefined));
});

app.put("/api/mailbox", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<AgentMailboxUpdateInput>().catch((): AgentMailboxUpdateInput => ({}));
  const owner = await getOwnerProfile(c.env, ownerId);
  const result = await upsertAgentMailbox(c.env, ownerId, body, owner || undefined);
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.post("/api/mailbox/activate", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await activateAgentMailbox(c.env, ownerId);
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.post("/api/mailbox/pause", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await pauseAgentMailbox(c.env, ownerId);
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.get("/api/mailbox/messages", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json(await listAgentMailboxMessages(c.env, ownerId, {
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    status: c.req.query("status") || "",
    createdBy: c.req.query("created_by") || "",
    direction: c.req.query("direction") || "outbound",
    folder: c.req.query("folder") || "",
    query: c.req.query("q") || "",
    unread: c.req.query("unread") || "",
  }));
});

app.get("/api/mailbox/messages/:messageId/attachments/:attachmentIndex", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  if (!c.env.SITE_ASSETS) {
    return c.json({ error: "Mailbox attachment storage is not configured" }, 503);
  }

  const row = await c.env.DB.prepare(
    `SELECT m.metadata_json
     FROM mailbox_messages m
     JOIN mailbox_aliases a ON a.id = m.mailbox_id
     WHERE a.user_id = ? AND m.id = ?`,
  )
    .bind(ownerId, c.req.param("messageId"))
    .first<{ metadata_json: string | null }>();
  if (!row) return c.json({ error: "Message not found" }, 404);

  const attachments = getStoredMailboxAttachments(row.metadata_json);
  const index = Number.parseInt(c.req.param("attachmentIndex"), 10);
  const attachment = Number.isInteger(index) ? attachments[index] : null;
  if (!attachment?.storageKey) return c.json({ error: "Attachment not found" }, 404);

  const object = await c.env.SITE_ASSETS.get(attachment.storageKey);
  if (!object) return c.json({ error: "Attachment not found" }, 404);

  const filename = sanitizeAttachmentFilename(
    attachment.filename || "",
    `attachment-${index + 1}`,
  );
  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "'")}"`,
    },
  });
});

app.post("/api/mailbox/messages/:messageId/unsubscribe", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const row = await c.env.DB.prepare(
    `SELECT m.id, m.direction, m.message_kind, m.raw_headers_json
     FROM mailbox_messages m
     JOIN mailbox_aliases a ON a.id = m.mailbox_id
     WHERE a.user_id = ? AND m.id = ?`,
  )
    .bind(ownerId, c.req.param("messageId"))
    .first<{
      id: string;
      direction: string;
      message_kind: string;
      raw_headers_json: string | null;
    }>();
  if (!row) return c.json({ error: "Message not found" }, 404);
  if (row.direction !== "inbound" || row.message_kind !== "email") {
    return c.json({ error: "Unsubscribe is only available for inbound email" }, 400);
  }

  const action = resolveMailboxUnsubscribeAction(row.raw_headers_json);
  if (!action) return c.json({ error: "This message does not include an unsubscribe action" }, 404);

  if (action.mode === "one_click") {
    try {
      const response = await fetch(action.url, {
        method: "POST",
        headers: {
          Accept: "text/plain, */*",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "List-Unsubscribe=One-Click",
        redirect: "follow",
      });
      if (!response.ok) {
        return c.json(
          { error: `Unsubscribe request failed with status ${response.status}` },
          502,
        );
      }
      return c.json({ ok: true, mode: "one_click", status: response.status });
    } catch (error) {
      console.error("Mailbox one-click unsubscribe error:", error);
      return c.json({ error: "Failed to send unsubscribe request" }, 502);
    }
  }

  return c.json({ ok: true, mode: "open", url: action.url });
});

app.post("/api/mailbox/attachments", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  if (!c.env.SITE_ASSETS) {
    return c.json({ error: "Mailbox attachment storage is not configured" }, 503);
  }

  const mailbox = await c.env.DB.prepare(
    `SELECT id
     FROM mailbox_aliases
     WHERE user_id = ?
     ORDER BY created_at ASC
     LIMIT 1`,
  )
    .bind(ownerId)
    .first<{ id: string }>();
  if (!mailbox) return c.json({ error: "Mailbox not found" }, 404);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "Attachment upload is invalid" }, 400);
  const files = form
    .getAll("attachments")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return c.json({ error: "Choose at least one attachment" }, 400);
  if (files.length > MAX_MAILBOX_ATTACHMENT_UPLOAD_COUNT) {
    return c.json(
      { error: `Upload up to ${MAX_MAILBOX_ATTACHMENT_UPLOAD_COUNT} attachments at a time` },
      400,
    );
  }

  const uploaded: StoredMailboxAttachment[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_MAILBOX_ATTACHMENT_UPLOAD_BYTES) {
      return c.json(
        { error: `${file.name || `Attachment ${index + 1}`} is larger than 25 MB` },
        400,
      );
    }
    const filename = sanitizeAttachmentFilename(file.name, `attachment-${index + 1}`);
    const mimeType = file.type || "application/octet-stream";
    const storageKey = [
      "mailbox",
      mailbox.id,
      "uploads",
      `${new Date().toISOString().slice(0, 10)}`,
      `${crypto.randomUUID()}-${filename}`,
    ].join("/");
    const content = await file.arrayBuffer();
    await c.env.SITE_ASSETS.put(storageKey, content, {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        mailboxId: mailbox.id,
        filename,
        disposition: "attachment",
      },
    });
    uploaded.push({
      filename,
      mimeType,
      disposition: "attachment",
      size: file.size,
      storageKey,
      sourceMessageId: "",
    });
  }

  return c.json({ attachments: uploaded }, 201);
});

app.post("/api/mailbox/drafts", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<AgentMailboxDraftInput>().catch((): AgentMailboxDraftInput => ({}));
  const result = await createAgentMailboxDraft(c.env, ownerId, body);
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result, 201);
});

app.put("/api/mailbox/drafts/:draftId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<AgentMailboxDraftInput>().catch((): AgentMailboxDraftInput => ({}));
  const result = await updateAgentMailboxDraft(c.env, ownerId, c.req.param("draftId"), body);
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.post("/api/mailbox/drafts/:draftId/reject", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await rejectAgentMailboxDraft(c.env, ownerId, c.req.param("draftId"));
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.post("/api/mailbox/drafts/:draftId/approve", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const draftId = c.req.param("draftId");
  const approval = await getAgentMailboxDraftForApproval(c.env, ownerId, draftId);
  if ("error" in approval) return c.json({ error: approval.error }, approval.status as any);

  try {
    const { mailbox, draft } = approval;
    const outboundHeaders = getAgentMailboxOutboundHeaders(draft);
    const attachments = await loadDraftProviderAttachments(c.env, draft);
    const draftFromAddress =
      draft.fromAddress && !draft.fromAddress.toLowerCase().endsWith("@me3.local")
        ? draft.fromAddress
        : null;
    const result = await sendEmailWithProvider(c.env, ownerId, {
      purpose: draft.sourceId ? "reply" : "draft",
      mailboxId: mailbox.id,
      mailboxMessageId: draft.id,
      fromAddress: draftFromAddress,
      toAddress: draft.toAddress || "",
      subject: draft.subject || "(no subject)",
      textBody: draft.body || "",
      htmlBody: draft.htmlBody,
      attachments,
      threadKey: draft.threadKey,
      messageIdHeader: outboundHeaders.messageIdHeader,
      inReplyTo: outboundHeaders.inReplyTo,
      referencesHeader: outboundHeaders.referencesHeader,
      metadata: {
        mailbox_message_id: draft.id,
        source_id: draft.sourceId,
      },
      createdBy: draft.createdBy,
      approvedByUserId: ownerId,
    });
    const sent = await markAgentMailboxDraftSent(c.env, ownerId, draft.id, {
      providerId: result.providerId,
      providerMessageId: result.providerMessageId,
      sentAt: result.sentAt,
      approvedByUserId: ownerId,
    });
    if ("error" in sent) return c.json({ error: sent.error }, sent.status as any);
    return c.json(sent);
  } catch (error) {
    if (error instanceof EmailProviderInputError) {
      await markAgentMailboxDraftFailed(c.env, ownerId, draftId, { errorMessage: error.message });
      return c.json({ error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.post("/api/mailbox/messages/:messageId/read", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<{ read?: boolean }>().catch(() => ({ read: true }));
  const result = await setAgentMailboxMessageReadState(
    c.env,
    ownerId,
    c.req.param("messageId"),
    body.read !== false,
  );
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.post("/api/mailbox/messages/:messageId/move", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req.json<{ folder?: string }>().catch((): { folder?: string } => ({}));
  const result = await moveAgentMailboxMessage(c.env, ownerId, c.req.param("messageId"), body.folder);
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.delete("/api/mailbox/messages/:messageId", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await trashAgentMailboxMessage(c.env, ownerId, c.req.param("messageId"));
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.get("/api/telegram/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json(await buildTelegramStatusPayload(c.env, ownerId, c.req.url));
});

app.put("/api/telegram/settings", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  try {
    await updateTelegramSettings(
      c.env,
      ownerId,
      await c.req.json().catch(() => ({})),
    );
    return c.json({
      ok: true,
      ...(await buildTelegramStatusPayload(c.env, ownerId, c.req.url)),
    });
  } catch (error) {
    if (error instanceof TelegramSettingsInputError) {
      return c.json({ ok: false, error: error.message }, error.status as any);
    }
    throw error;
  }
});

app.post("/api/telegram/webhook/sync", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const settings = await getTelegramSettings(c.env, ownerId);
  const botToken = await resolveTelegramBotToken(c.env, ownerId);
  const webhookSecret = await resolveTelegramWebhookSecret(c.env, ownerId);
  const webhookUrl = `${getCoreApiOrigin(c.env, c.req.url)}/api/telegram/webhook`;

  if (!settings.botUsername) {
    return c.json({ ok: false, error: "Telegram bot username is not configured" }, 503);
  }
  if (!botToken) {
    return c.json({ ok: false, error: "Telegram bot token is not configured" }, 503);
  }
  if (!webhookSecret) {
    return c.json({ ok: false, error: "Telegram webhook secret is not configured" }, 503);
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  if (!response.ok || payload?.ok !== true) {
    return c.json(
      {
        ok: false,
        error:
          payload?.description || `Telegram setWebhook failed (${response.status})`,
      },
      502,
    );
  }

  return c.json({
    ok: true,
    ...(await buildTelegramStatusPayload(c.env, ownerId, c.req.url)),
  });
});

app.post("/api/telegram/setup", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const settings = await getTelegramSettings(c.env, ownerId);
  if (!settings.botUsername) {
    return c.json({ error: "Telegram bot username is not configured" }, 503);
  }
  if (!settings.botTokenConfigured) {
    return c.json({ error: "Telegram bot token is not configured" }, 503);
  }
  if (!settings.webhookSecretConfigured) {
    return c.json({ error: "Telegram webhook secret is not configured" }, 503);
  }

  const connection = await upsertPendingTelegramConnection(c.env, ownerId);
  return c.json({
    ok: true,
    ...(await buildTelegramStatusPayload(c.env, ownerId, c.req.url, connection)),
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

  const connection = await getTelegramConnection(c.env, ownerId);
  return c.json({
    ok: true,
    disconnected: true,
    ...(await buildTelegramStatusPayload(c.env, ownerId, c.req.url, connection)),
  });
});

app.post("/api/telegram/webhook", async (c) => {
  const configuredSecret = await resolveTelegramWebhookSecretForInstall(c.env);
  if (!configuredSecret) {
    return c.json({ ok: false, error: "Telegram webhook secret is not configured" }, 503);
  }

  const receivedSecret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (receivedSecret !== configuredSecret) {
    return c.json({ ok: false, error: "Invalid Telegram webhook secret" }, 401);
  }

  const update = await c.req.json<TelegramWebhookUpdate>().catch(() => null);
  if (!update || typeof update !== "object") {
    return c.json({ ok: false, error: "Invalid Telegram update" }, 400);
  }

  const result = await handleTelegramWebhookUpdate(c.env, update);
  return c.json(result, (result.ok ? 200 : result.status) as any);
});

app.get("/api/soulink/status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  return c.json(await buildSoulinkStatusPayload(c.env, ownerId, c.req.url));
});

app.post("/api/soulink/setup", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const config = getSoulinkConnectorConfig(c.env);
  if (!config.configured) {
    return c.json(
      {
        ok: false,
        error: "Soulink connector is not configured for this Core install",
        ...(await buildSoulinkStatusPayload(c.env, ownerId, c.req.url)),
      },
      503,
    );
  }

  const owner = await getOwnerProfile(c.env, ownerId);
  if (!owner) return c.json({ ok: false, error: "Account not found" }, 404);

  const existingConnection = await getSoulinkConnection(c.env, ownerId);
  const dispatchToken = existingConnection?.setup_token || crypto.randomUUID();
  const callbackUrl = `${getCoreApiOrigin(c.env, c.req.url)}/api/agent/channels/soulink/dispatch`;
  const response = await fetch(`${config.apiOrigin}/api/me3/assistant-channel/provision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      issuer: getCoreApiOrigin(c.env, c.req.url),
      subject: owner.id,
      owner: {
        displayName: owner.name || owner.username || "ME3 Core Owner",
        handle: owner.username || "owner",
        me3Url: await getOwnerMe3Url(c.env, ownerId, c.req.url),
        avatarUrl: owner.avatar_url || null,
      },
      assistant: {
        displayName: "ME3 Assistant",
        avatarUrl: null,
      },
      runtime: {
        kind: "standalone-me3-core",
        callbackUrl,
        dispatchToken,
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as SoulinkProvisionResponse | null;
  if (!response.ok || payload?.ok !== true || !payload.streamChannelId) {
    return c.json(
      {
        ok: false,
        error: payload?.error || `Soulink provisioning failed (${response.status})`,
        ...(await buildSoulinkStatusPayload(c.env, ownerId, c.req.url)),
      },
      502,
    );
  }

  const connection = await upsertActiveSoulinkConnection(c.env, ownerId, {
    ownerNodeId: payload.ownerNodeId || null,
    assistantNodeId: payload.assistantNodeId || null,
    streamChannelType: payload.streamChannelType || "messaging",
    streamChannelId: payload.streamChannelId,
    soulinkChatUrl: payload.soulinkChatUrl || null,
    runtimeCallbackUrl: callbackUrl,
    dispatchToken,
  });

  await insertProviderChannelEventOnce(c.env, {
    channel: "soulink",
    connectionId: connection.id,
    direction: "system",
    eventType: "link",
    status: "linked",
    providerEventId: `setup:${payload.streamChannelId}`,
    providerMessageId: null,
    replyToMessageId: null,
    textBody: "Soulink assistant chat connected.",
    rawJson: payload,
    errorMessage: null,
  });

  return c.json({
    ok: true,
    ...(await buildSoulinkStatusPayload(c.env, ownerId, c.req.url, connection)),
  });
});

app.post("/api/soulink/disconnect", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const existing = await getSoulinkConnection(c.env, ownerId);
  if (!existing) {
    return c.json({ ok: true, disconnected: false, ...(await buildSoulinkStatusPayload(c.env, ownerId, c.req.url)) });
  }

  await c.env.DB.prepare(
    `UPDATE agent_channel_connections
     SET status = 'disconnected',
         disconnected_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND channel = 'soulink'`,
  )
    .bind(ownerId)
    .run();

  const connection = await getSoulinkConnection(c.env, ownerId);
  return c.json({
    ok: true,
    disconnected: true,
    ...(await buildSoulinkStatusPayload(c.env, ownerId, c.req.url, connection)),
  });
});

app.post("/api/soulink/contacts/sync", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await syncSoulinkContacts(c.env, ownerId);
  if (!result.ok) {
    return c.json(result, result.status as any);
  }
  return c.json(result);
});

app.get("/api/contacts", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);
  return c.json(await listAgentContacts(c.env, ownerId));
});

app.post("/api/contacts", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const contact = await createAgentContact(c.env, ownerId, await c.req.json().catch(() => null));
  if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
  return c.json({ ok: true, contact }, 201);
});

app.put("/api/contacts/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const contact = await updateAgentContact(
    c.env,
    ownerId,
    c.req.param("id"),
    await c.req.json().catch(() => null),
  );
  if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
  return c.json({ ok: true, contact });
});

app.delete("/api/contacts/:id", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await deleteAgentContact(c.env, ownerId, c.req.param("id"));
  if ("error" in result) return c.json({ error: result.error }, result.status as any);
  return c.json(result);
});

app.get("/api/locations/search", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const result = await searchLocationQuery(
    c.env,
    c.req.query("q"),
    c.req.query("limit"),
  );
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, result.status as any);
  }
  return c.json(result);
});

app.put("/api/contacts/:id/outreach-status", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const body = await c.req
    .json<{ outreachStatus?: string | null; nextFollowupAt?: string | null }>()
    .catch((): { outreachStatus?: string | null; nextFollowupAt?: string | null } => ({}));
  const contact = await updateAgentContactOutreachStatus(
    c.env,
    ownerId,
    c.req.param("id"),
    body,
  );
  if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
  return c.json({ ok: true, contact });
});

app.post("/api/contacts/:id/convert", async (c) => {
  const ownerId = await requireOwner(c);
  if (!ownerId) return unauthorized(c);

  const contact = await convertAgentContactToClient(c.env, ownerId, c.req.param("id"));
  if ("error" in contact) return c.json({ error: contact.error }, contact.status as any);
  return c.json({ ok: true, contact });
});

app.get("/preview/:username/*", async (c) => {
  const username = normalizeUsername(c.req.param("username"));
  const site = await getSiteByUsername(c.env, username);
  if (!site) return c.html(renderNotFoundPage("Site not found"), 404);

  const requestedPath = c.req.path.replace(`/preview/${username}/`, "") || "index.html";
  return serveSiteFileResponse(c.env, site, requestedPath, false);
});

app.get("/me", async (c) => {
  return serveDefaultPublicSitePath(c.env, c.req.raw, "index.html");
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

app.notFound(async (c) => {
  if (await isPublicSiteHost(c.env, c.req.url)) {
    return servePublicSiteRequest(c.env, c.req.raw);
  }
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("Not found", 404);
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

function isLoopbackHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]"
  );
}

function hostsMatch(first: string, second: string): boolean {
  if (!first || !second) return false;
  if (first === second) return true;
  return isLoopbackHost(first) && isLoopbackHost(second);
}

function normalizeDomain(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  return normalizeHost(withoutProtocol.split("/")[0]);
}

function isValidPublicSiteDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  if (domain.includes("*") || domain.includes("_")) return false;
  if (!domain.includes(".")) return false;
  return domain
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function hostnameFromUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return normalizeHost(value);
  }
}

function originFromUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getRootCustomDomain(env: Env, publicDomain?: string | null): string {
  const configured = normalizeDomain(env.ME3_CUSTOM_DOMAIN);
  if (configured) return configured;

  const normalizedPublicDomain = normalizeDomain(publicDomain);
  if (!normalizedPublicDomain) return "";
  return normalizedPublicDomain.startsWith("www.")
    ? normalizedPublicDomain.slice(4)
    : normalizedPublicDomain;
}

function prefixedHost(prefix: string, domain: string): string {
  if (!domain) return "";
  if (domain.startsWith(`${prefix}.`)) return domain;
  return `${prefix}.${domain}`;
}

function getAdminHost(env: Env, requestUrl?: string, publicDomain?: string | null): string {
  return (
    normalizeHost(env.ME3_ADMIN_HOST) ||
    hostnameFromUrl(env.CORE_WEB_ORIGIN) ||
    prefixedHost("me3", getRootCustomDomain(env, publicDomain)) ||
    hostnameFromUrl(requestUrl)
  );
}

function getApiHost(env: Env, requestUrl?: string): string {
  const explicitAdminHost =
    normalizeHost(env.ME3_ADMIN_HOST) || hostnameFromUrl(env.CORE_WEB_ORIGIN);
  return (
    normalizeHost(env.ME3_API_HOST) ||
    hostnameFromUrl(env.CORE_API_ORIGIN) ||
    explicitAdminHost ||
    getAdminHost(env, requestUrl)
  );
}

function getSiteHost(env: Env, publicDomain?: string | null): string {
  return normalizeHost(env.ME3_SITE_HOST) || normalizeHost(publicDomain) || prefixedHost("www", getRootCustomDomain(env));
}

function getCoreWebOrigin(env: Env, requestUrl?: string): string {
  const configured = originFromUrl(env.CORE_WEB_ORIGIN);
  if (configured) return configured;

  const adminHost = getAdminHost(env, requestUrl);
  if (adminHost) {
    return adminHost === hostnameFromUrl(requestUrl) ? originFromUrl(requestUrl) : `https://${adminHost}`;
  }

  return originFromUrl(requestUrl);
}

function getCoreApiOrigin(env: Env, requestUrl?: string): string {
  const configured = originFromUrl(env.CORE_API_ORIGIN);
  if (configured) return configured;

  const apiHost = getApiHost(env, requestUrl);
  if (apiHost) {
    return apiHost === hostnameFromUrl(requestUrl) ? originFromUrl(requestUrl) : `https://${apiHost}`;
  }

  return getCoreWebOrigin(env, requestUrl);
}

function getCorsOrigin(env: Env, requestUrl: string, origin: string | undefined): string {
  if (!origin) return getCoreWebOrigin(env, requestUrl);

  const allowedOrigins = new Set([
    getCoreWebOrigin(env, requestUrl),
    getCoreApiOrigin(env, requestUrl),
    originFromUrl(requestUrl),
  ]);

  return allowedOrigins.has(origin) ? origin : getCoreWebOrigin(env, requestUrl);
}

function getMe3CloudOrigin(env: Env): string {
  return originFromUrl(env.ME3_CLOUD_ORIGIN) || "https://me3.app";
}

function getMe3CloudApiOrigin(env: Env): string {
  const configured = originFromUrl(env.ME3_CLOUD_API_ORIGIN);
  if (configured) return configured;

  const cloudOrigin = getMe3CloudOrigin(env);
  const cloudUrl = new URL(cloudOrigin);
  if (cloudUrl.hostname === "me3.app" || cloudUrl.hostname === "www.me3.app") {
    return "https://api.me3.app";
  }

  return cloudOrigin;
}

function buildApiUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function readResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function getMe3CloudUsernamePublishBlockReason(
  env: Env,
  usernameInput: unknown,
): Promise<string | null> {
  const cloudOwnerId = await getStoredMe3CloudOwnerId(env);
  if (!cloudOwnerId) return null;

  const username = normalizeUsername(usernameInput);
  if (!username || !USERNAME_REGEX.test(username)) return null;

  const url = buildApiUrl(
    getMe3CloudApiOrigin(env),
    `/api/usernames/${encodeURIComponent(username)}/available`,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-ME3-Core-Owner-ID": cloudOwnerId,
      },
    });
    const body = await readResponseJson(response);

    if (!response.ok) {
      console.warn(
        `ME3 Cloud username availability check failed (${response.status}) for ${username}`,
      );
      return null;
    }

    return body.available === false ? ME3_CLOUD_USERNAME_CONFLICT_MESSAGE : null;
  } catch (error) {
    console.warn("ME3 Cloud username availability check failed:", error);
    return null;
  }
}

function normalizeClaimRedirect(value: unknown): string {
  if (typeof value !== "string") return "";
  const redirect = value.trim();
  if (!redirect || redirect.length > 500) return "";
  if (redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
  return "";
}

async function isPublicSiteHost(env: Env, requestUrl: string): Promise<boolean> {
  const requestHost = hostnameFromUrl(requestUrl);
  if (!requestHost) return false;
  const configuredAdminHost = normalizeHost(env.ME3_ADMIN_HOST) || hostnameFromUrl(env.CORE_WEB_ORIGIN);
  const configuredApiHost = normalizeHost(env.ME3_API_HOST) || hostnameFromUrl(env.CORE_API_ORIGIN);
  if (hostsMatch(requestHost, configuredAdminHost) || hostsMatch(requestHost, configuredApiHost)) {
    return false;
  }

  const siteHost = getSiteHost(env);
  if (siteHost && requestHost === siteHost) return true;

  const inferredRootPublicHost = getInferredRootPublicSiteHost(env);
  if (inferredRootPublicHost && requestHost === inferredRootPublicHost) return true;

  if (isLikelyRootPublicSiteHost(requestHost)) {
    try {
      const site = await getPublicSiteForHost(env, requestHost);
      if (site?.published_at) return true;
    } catch {
      return false;
    }
  }

  const site = await env.DB.prepare(
    `SELECT custom_domain FROM sites
     WHERE lower(custom_domain) = ?
     LIMIT 1`,
  )
    .bind(requestHost)
    .first<{ custom_domain: string | null }>();

  if (!site) return false;

  const inferredAdminHost = getAdminHost(env, undefined, site.custom_domain);
  const inferredApiHost = getApiHost(env);
  return !hostsMatch(requestHost, inferredAdminHost) && !hostsMatch(requestHost, inferredApiHost);
}

function getInferredRootPublicSiteHost(env: Env): string {
  const adminHost =
    normalizeHost(env.ME3_ADMIN_HOST) || hostnameFromUrl(env.CORE_WEB_ORIGIN);
  if (!adminHost.startsWith("me3.")) return "";
  const rootHost = adminHost.slice("me3.".length);
  return isValidPublicSiteDomain(rootHost) ? rootHost : "";
}

function isLikelyRootPublicSiteHost(host: string): boolean {
  if (!isValidPublicSiteDomain(host)) return false;
  if (host.endsWith(".workers.dev")) return false;
  if (host.startsWith("me3.") || host.startsWith("api.")) return false;
  return true;
}

function getCoreDomainState(
  env: Env,
  site: Pick<DbSite, "username">,
  domain: string | null,
): "pending" | "active" | "failed" {
  const normalizedDomain = normalizeHost(domain);
  const siteHost = getSiteHost(env, normalizedDomain);
  if (!normalizedDomain) return "pending";
  if (!siteHost) return "pending";
  if (normalizedDomain !== siteHost) return "pending";

  const configuredUsername = normalizeUsername(env.ME3_SITE_USERNAME);
  if (configuredUsername && configuredUsername !== site.username) return "pending";

  return "active";
}

function buildCoreDomainStatus(env: Env, site: DbSite) {
  const domain = normalizeHost(site.custom_domain) || getSiteHost(env);
  const status = domain
    ? getCoreDomainState(env, site, domain)
    : undefined;

  return {
    connected: Boolean(domain),
    domain: domain || undefined,
    status,
    ssl_status: status === "active" ? "active" : undefined,
    expected_host: getSiteHost(env, domain) || null,
    admin_host: getAdminHost(env, undefined, domain) || null,
    verification_records: getCoreDomainRecords(env, domain),
    registrar_guides: getRegistrarGuides(),
    url: status === "active" && domain ? `https://${domain}` : undefined,
    instructions: domain
      ? getCoreDomainInstructions(env, domain, site.username)
      : [
          "Publish your profile first so the custom domain has a live page to serve.",
          "Enter the root domain visitors should use for this ME3 site.",
          "Attach the public and me3 login hostnames to the Worker as Cloudflare custom domains.",
        ],
  };
}

function getCoreDomainRecords(env: Env, domain: string | null | undefined) {
  const normalizedDomain = normalizeHost(domain);
  if (!normalizedDomain) return [];
  const adminHost = getAdminHost(env, undefined, normalizedDomain);
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
  const siteHost = getSiteHost(env, domain);
  const configuredUsername = normalizeUsername(env.ME3_SITE_USERNAME);
  const adminHost = getAdminHost(env, undefined, domain);
  const instructions = [
    `In Cloudflare, attach ${domain} to this same me3 Worker as a custom domain.`,
    adminHost
      ? `Attach ${adminHost} to the same Worker for ME3 login and account settings.`
      : `Attach me3.${domain} to the same Worker for ME3 login and account settings.`,
  ];

  if (configuredUsername && configuredUsername !== username) {
    instructions.push(`Set ME3_SITE_USERNAME=${username}, or clear ME3_SITE_USERNAME so the first profile site is served.`);
  } else if (!configuredUsername) {
    instructions.push("Optional: set ME3_SITE_USERNAME if this Worker will host more than one site record.");
  }

  if (normalizeHost(env.ME3_SITE_HOST) && siteHost !== domain) {
    instructions.unshift(`Current ME3_SITE_HOST is ${siteHost}, so this domain will stay pending until the variable matches.`);
  }

  instructions.push("If you also use www, redirect it to this public domain in Cloudflare.");
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

async function serveDefaultPublicSitePath(
  env: Env,
  request: Request,
  requestedPath: string,
): Promise<Response> {
  const site = await getPublicSiteForHost(env, new URL(request.url).hostname);
  if (!site) return new Response(renderNotFoundPage("Site not configured"), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

  return serveSiteFileResponse(env, site, requestedPath, true);
}

async function serveMeJsonResponse(env: Env, request: Request): Promise<Response> {
  const site = await getPublicSiteForHost(env, new URL(request.url).hostname);
  if (site?.published_at) {
    const siteResponse = await serveSiteFileResponse(env, site, "me.json", true);
    if (siteResponse.ok) return siteResponse;
  }

  const owner = await getOwnerProfile(env, "owner");
  const apiOrigin = getCoreApiOrigin(env, request.url);
  const webOrigin = getCoreWebOrigin(env, request.url);

  return new Response(
    JSON.stringify({
      id: apiOrigin,
      type: "Person",
      name: owner?.name ?? "ME3 Core Owner",
      username: owner?.username ?? "owner",
      bio: owner?.bio ?? "Personal AI assistant powered by ME3 Core.",
      url: webOrigin,
      intents: {
        chat: `${apiOrigin}/api/assistant/chat`,
      },
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
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
  const publicPath = `public/${requestedPath}`;
  const indexPath =
    requestedPath && !requestedPath.split("/").pop()?.includes(".")
      ? `public/${requestedPath}/index.html`
      : null;
  const htmlPath =
    requestedPath && !requestedPath.split("/").pop()?.includes(".")
      ? `public/${requestedPath}.html`
      : null;
  const isMediaPath = publicPath.startsWith("public/files/") || publicPath === "public/favicon.png";
  const r2File = isMediaPath ? await getR2SiteFile(env, site, publicPath) : null;
  const file =
    r2File ||
    (await getSiteFile(env, site.id, publicPath)) ||
    (indexPath ? await getSiteFile(env, site.id, indexPath) : null) ||
    (htmlPath ? await getSiteFile(env, site.id, htmlPath) : null) ||
    (requestedPath === "index.html" ? await getSiteFile(env, site.id, "landing/index.html") : null);
  if (!file) {
    return new Response(renderNotFoundPage("Page not found"), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(siteFileContentToArrayBuffer(file.content), {
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
  content: ArrayBuffer | Uint8Array,
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

async function loadSiteSourceFiles(env: Env, siteId: string): Promise<Map<string, string>> {
  const files = await listSiteFiles(env, siteId, "src/");
  const sourceFiles = new Map<string, string>();
  for (const file of files) {
    sourceFiles.set(file.path.replace(/^src\//, ""), await arrayBufferToText(file.content));
  }
  return sourceFiles;
}

function parseSiteProfile(meJson: string, username: string): Me3SiteProfile {
  try {
    const parsed = JSON.parse(meJson) as Me3SiteProfile;
    return {
      ...parsed,
      handle: parsed.handle || username,
      name: parsed.name || username,
    };
  } catch {
    return { version: "0.1", handle: username, name: username };
  }
}

function shouldIgnoreSiteSourceFile(path: string): boolean {
  const normalized = normalizeSiteFileName(path).toLowerCase();
  const filename = normalized.split("/").pop() || normalized;
  return filename === "readme.md" || filename === ".ds_store";
}

function buildContentMetaMap(
  entries: Array<Record<string, unknown>>,
  defaultPrefix: "blog" | "shop" | "",
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const slug = typeof entry.slug === "string" ? normalizeSiteFileName(entry.slug) : "";
    const fallbackFile = defaultPrefix && slug
      ? `${defaultPrefix}/${slug}.md`
      : slug
        ? `${slug}.md`
        : "";
    const file = typeof entry.file === "string" && entry.file.trim()
      ? normalizeSiteFileName(entry.file)
      : fallbackFile;
    if (file) map.set(file, entry);
  }
  return map;
}

function getReferencedSourceFiles(profile: Me3SiteProfile): Set<string> {
  const keep = new Set<string>(["me.json"]);
  const addEntry = (
    entry: { slug?: string; file?: string },
    defaultPrefix: "blog" | "shop" | "",
  ) => {
    const slug = entry.slug ? normalizeSiteFileName(entry.slug) : "";
    const fallbackFile = defaultPrefix && slug
      ? `${defaultPrefix}/${slug}.md`
      : slug
        ? `${slug}.md`
        : "";
    const file = entry.file ? normalizeSiteFileName(entry.file) : fallbackFile;
    if (file && !shouldIgnoreSiteSourceFile(file)) keep.add(file);
  };

  for (const page of profile.pages || []) addEntry(page, "");
  for (const post of profile.posts || []) addEntry(post, "blog");
  for (const product of profile.products || []) addEntry(product, "shop");
  return keep;
}

async function pruneUnreferencedSiteSourceFiles(
  env: Env,
  siteId: string,
  profile: Me3SiteProfile,
  manifest: PublishManifest,
): Promise<void> {
  const keep = getReferencedSourceFiles(profile);
  const files = await listSiteFiles(env, siteId, "src/");
  for (const file of files) {
    const sourceName = file.path.replace(/^src\//, "");
    if (keep.has(sourceName) && !shouldIgnoreSiteSourceFile(sourceName)) continue;
    await deleteSiteFile(env, siteId, file.path);
    delete manifest.sourceFiles[sourceName];
  }
}

async function pruneGeneratedPublicFiles(
  env: Env,
  siteId: string,
  generatedFiles: Record<string, string>,
): Promise<void> {
  const keep = new Set(Object.keys(generatedFiles).map(normalizeSiteFileName));
  const files = await listSiteFiles(env, siteId, "public/");
  for (const file of files) {
    if (file.path.startsWith("public/files/") || file.path === "public/favicon.png") {
      continue;
    }
    const publicName = file.path.replace(/^public\//, "");
    if (keep.has(publicName)) continue;
    if (!/\.(?:html|json)$/i.test(publicName)) continue;
    await deleteSiteFile(env, siteId, file.path);
  }
}

function normalizeProductPriceCents(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}

function normalizeProductCurrency(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "USD";
}

function getGeneratedSiteContentType(path: string): string {
  return path.endsWith(".json") ? "application/json" : "text/html; charset=utf-8";
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

async function arrayBufferToText(content: SiteFileRecord["content"]): Promise<string> {
  return new TextDecoder().decode(siteFileContentToBytes(content));
}

function siteFileContentToBytes(content: SiteFileRecord["content"]): Uint8Array {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (Array.isArray(content)) return new Uint8Array(content);

  const values = Object.values(content);
  if (values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return new Uint8Array(values);
  }

  throw new TypeError("Unsupported site file content format");
}

function siteFileContentToArrayBuffer(content: SiteFileRecord["content"]): ArrayBuffer {
  const bytes = siteFileContentToBytes(content);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
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

function coreSiteCss(): string {
  return `:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17201d;background:#f7faf8}body{margin:0}.shell{width:min(920px,calc(100vw - 32px));margin:0 auto;padding:48px 0}.hero,.page{border:1px solid rgba(23,32,29,.12);border-radius:18px;background:rgba(255,255,255,.86);padding:32px;box-shadow:0 18px 48px rgba(16,24,20,.08)}.badge{display:inline-flex;margin:0 0 18px;padding:6px 10px;border-radius:999px;background:#d9fbe8;color:#14543a;font-size:13px}h1{font-size:clamp(2.25rem,6vw,4.75rem);line-height:1;margin:0 0 16px}p{color:#496057;font-size:1.05rem;line-height:1.65}nav{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}a{color:#14543a;font-weight:700}.home-link{display:inline-flex;align-items:center;min-height:44px}@media (prefers-color-scheme:dark){:root{color:#ecf5ef;background:#0f1713}.hero,.page{background:rgba(22,31,26,.9);border-color:rgba(236,245,239,.14)}p{color:#adbbb3}.badge{background:#183c2a;color:#a7f3c4}a{color:#86efac}}`;
}

function renderNotFoundPage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(message)}</title><style>${coreSiteCss()}</style></head><body><main class="shell"><section class="hero"><h1>${escapeHtml(message)}</h1><nav aria-label="Page"><a class="home-link" href="/">Return home</a></nav></section></main></body></html>`;
}

function injectBaseHref(html: string, baseHref: string): string {
  if (/<base\s/i.test(html)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, `<head$1><base href="${escapeHtml(baseHref)}">`);
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
    .bind(getLandingPageTemplateId(page), site.id)
    .run();
}

async function parseSubscriberBody(c: AppContext): Promise<{
  email?: string;
  firstName?: string;
  lastName?: string;
  honeypot?: string;
}> {
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await c.req
      .json<{ email?: unknown; firstName?: unknown; lastName?: unknown }>()
      .catch((): { email?: unknown; firstName?: unknown; lastName?: unknown } => ({}));
    return {
      email: typeof body.email === "string" ? body.email : undefined,
      firstName: typeof body.firstName === "string" ? body.firstName : undefined,
      lastName: typeof body.lastName === "string" ? body.lastName : undefined,
    };
  }

  if (contentType.includes("form")) {
    const form = await c.req.formData();
    return {
      email: form.get("email")?.toString(),
      firstName: form.get("firstName")?.toString(),
      lastName: form.get("lastName")?.toString(),
      honeypot: form.get("website")?.toString(),
    };
  }

  return {};
}

function escapeCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function findHeaderIndex(header: string[], aliases: string[]): number {
  return header.findIndex((value) => aliases.includes(value));
}

function splitImportedName(value: string | undefined): { firstName: string | null; lastName: string | null } {
  const normalized = value?.trim().replace(/\s+/g, " ") || "";
  if (!normalized) return { firstName: null, lastName: null };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizeImportedTimestamp(value: string | undefined): string | null {
  const normalized = value?.trim() || "";
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function generateUnsubscribeToken(email: string, username: string): Promise<string> {
  const hash = await hashSubscriberIdentifier(`${email.toLowerCase()}${username.toLowerCase()}`);
  return hash.slice(0, 32);
}

async function hashSubscriberIdentifier(value: string): Promise<string> {
  return sha256Text(`me3:${value.toLowerCase()}`);
}

function unsubscribeHtml(title: string, body?: string, note?: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family: system-ui; padding: 40px; text-align: center;"><h1>${escapeHtml(title)}</h1>${body ? `<p>${escapeHtml(body)}</p>` : ""}${note ? `<p style="color: #666; margin-top: 20px;">${escapeHtml(note)}</p>` : ""}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function requireOwner(c: AppContext): Promise<string | null> {
  return getSessionOwnerId(c);
}

function unauthorized(c: AppContext) {
  return c.json({ ok: false, error: "Authentication required" }, 401);
}

function assistantJobsErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof AssistantJobsInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}

function assistantSkillsErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof AssistantSkillsInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
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

async function requireAccountsPlugin(c: AppContext) {
  if (await isCorePluginEnabled(c.env, ACCOUNTS_PLUGIN_ID)) return null;
  return c.json({ ok: false, error: "ME3 Accounts is disabled" }, 403);
}

function accountsErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof AccountsInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}

async function requireMissionControlPlugin(c: AppContext) {
  if (await isCorePluginEnabled(c.env, "me3.mission-control")) return null;
  return c.json({ ok: false, error: "ME3 Mission Control is disabled" }, 403);
}

function missionControlErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof MissionControlInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}

async function requireJournalPlugin(c: AppContext) {
  if (await isCorePluginEnabled(c.env, JOURNAL_PLUGIN_ID)) return null;
  return c.json({ ok: false, error: "ME3 Journal is disabled" }, 403);
}

function journalErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof JournalInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}

async function requireLocalExecutorPlugin(c: AppContext) {
  if (await isCorePluginEnabled(c.env, "me3.local-executor")) return null;
  return c.json({ ok: false, error: "Local Executor is disabled" }, 403);
}

function localExecutorErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof LocalExecutorInputError) {
    return c.json({ ok: false, error: error.message }, error.status as any);
  }
  throw error;
}

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

function subscribersSetupRequired(c: AppContext) {
  return c.json(
    {
      ok: false,
      error:
        "Subscriber storage is not initialized. Run `pnpm --filter @me3-core/worker db:migrate:local` and restart the Worker.",
      setupRequired: ["subscribers"],
    },
    503,
  );
}

function isMissingSiteFilesTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("site_files") && /no such table|does not exist/i.test(message);
}

function isMissingSubscribersTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("subscribers") && /no such table|does not exist/i.test(message);
}

async function getStripe(env: Env, ownerId: string): Promise<Stripe | null> {
  const secretKey = await getStripeSecretKey(env, ownerId);
  if (!secretKey) return null;
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
  });
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

async function loadSiteProfileForCommerce(
  env: Env,
  site: DbSite,
): Promise<Me3SiteProfile | null> {
  const meJson =
    (await getSiteFileText(env, site.id, "public/me.json")) ||
    (await getSiteFileText(env, site.id, "src/me.json"));
  return meJson ? parseSiteProfile(meJson, site.username) : null;
}

function resolveOneToOneBookingOffer(
  book: CoreBookIntent,
  offerId: string,
): ResolvedOneToOneBookingOffer | null {
  const offers = listOneToOneBookingOffers(book);
  const selected = offerId
    ? offers.find((offer) => offer.id === offerId)
    : offers[0];
  return selected || null;
}

function listOneToOneBookingOffers(
  book: CoreBookIntent,
): ResolvedOneToOneBookingOffer[] {
  const oneToOneType = Array.isArray(book.bookingTypes)
    ? book.bookingTypes.find((type) => type?.type === "one_to_one")
    : null;
  const availability = oneToOneType?.availability || book.availability || {};
  const rawOffers =
    Array.isArray(oneToOneType?.offers) && oneToOneType.offers.length > 0
      ? oneToOneType.offers
      : Array.isArray(book.offers) && book.offers.length > 0
        ? book.offers
        : [
            {
              id: "book-session",
              title: book.title || "Book a session",
              duration: book.duration || 30,
              pricing: book.pricing as CoreBookingPricing | undefined,
            },
          ];

  return rawOffers.map((offer) => {
    const duration =
      typeof offer.duration === "number" && Number.isFinite(offer.duration)
        ? Math.max(15, Math.min(24 * 60, Math.round(offer.duration)))
        : typeof book.duration === "number" && Number.isFinite(book.duration)
        ? Math.max(15, Math.min(24 * 60, Math.round(book.duration)))
        : 30;

    return {
      id: offer.id || slugifyBookingOfferId(offer.title || "book-session") || "book-session",
      title: offer.title || book.title || "Book a session",
      duration,
      pricing: offer.pricing,
      availability,
    };
  });
}

function resolvePublicOneToOneBookingOffer(
  book: CoreBookIntent,
  offerId: string,
):
  | { offer: ResolvedOneToOneBookingOffer }
  | { error: string; status: 400 | 404 } {
  const offers = listOneToOneBookingOffers(book);
  if (offers.length === 0) return { error: "Booking offer not found", status: 404 };
  if (offers.length > 1 && !offerId) {
    return { error: "offerId is required when multiple booking offers exist", status: 400 };
  }

  const selected = offerId
    ? offers.find((offer) => offer.id === offerId)
    : offers[0];
  if (!selected) return { error: "Booking offer not found", status: 404 };
  return { offer: selected };
}

function resolvePaidOneToOneOffer(
  book: CoreBookIntent,
  offerId: string,
): ResolvedPaidBookingOffer | null {
  const selected = resolveOneToOneBookingOffer(book, offerId);
  if (!selected?.pricing?.enabled) return null;
  if (
    typeof selected.pricing.suggestedAmount !== "number" ||
    !Number.isFinite(selected.pricing.suggestedAmount) ||
    selected.pricing.suggestedAmount <= 0 ||
    !selected.pricing.currency
  ) {
    return null;
  }
  return selected as ResolvedPaidBookingOffer;
}

function slugifyBookingOfferId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeBookingAmount(
  value: unknown,
  pricing: CoreBookingPricing,
): { ok: true; amountCents: number; currency: string } | { ok: false; error: string } {
  const suggestedAmount = Number(pricing.suggestedAmount);
  const requestedAmount =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : suggestedAmount;

  if (!Number.isFinite(requestedAmount)) {
    return { ok: false, error: "Amount must be a valid number" };
  }

  if (pricing.allowFlexiblePricing === false && requestedAmount !== suggestedAmount) {
    return { ok: false, error: `Amount must be ${suggestedAmount} ${pricing.currency}` };
  }

  const minimumAmount =
    typeof pricing.minimumAmount === "number" && Number.isFinite(pricing.minimumAmount)
      ? pricing.minimumAmount
      : 5;
  if (requestedAmount < minimumAmount) {
    return { ok: false, error: `Minimum amount is ${minimumAmount} ${pricing.currency || "USD"}` };
  }

  return {
    ok: true,
    amountCents: Math.round(requestedAmount * 100),
    currency: String(pricing.currency || "USD").toLowerCase(),
  };
}

function resolveBookingSlot(input: {
  localDate: string;
  localTime: string;
  durationMinutes: number;
  timezone: string;
}): { startsAt: string; endsAt: string; startsAtMs: number } | null {
  const dateMatch = input.localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = input.localTime.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  const startsAtMs = getUtcMsForLocalTime(
    { year, month, day, hour, minute },
    input.timezone,
  );
  const endsAtMs = startsAtMs + input.durationMinutes * 60_000;
  return {
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    startsAtMs,
  };
}

function resolvePublicBookingSlot(input: {
  slotStart: string;
  slotEnd: string;
  durationMinutes: number;
  timezone: string;
}):
  | {
      startsAt: string;
      endsAt: string;
      startsAtMs: number;
      localDate: string;
      localTime: string;
    }
  | { error: string } {
  const startsAtMs = Date.parse(input.slotStart);
  const endsAtMs = Date.parse(input.slotEnd);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
    return { error: "Invalid booking slot" };
  }
  if (endsAtMs <= startsAtMs) return { error: "slotEnd must be after slotStart" };
  if (endsAtMs - startsAtMs !== input.durationMinutes * 60_000) {
    return { error: "Booking slot duration does not match the selected offer" };
  }

  const local = formatUtcInstantInTimeZone(startsAtMs, input.timezone);
  if (!local) return { error: "Invalid booking slot timezone" };
  const resolved = resolveBookingSlot({
    localDate: local.localDate,
    localTime: local.localTime,
    durationMinutes: input.durationMinutes,
    timezone: input.timezone,
  });
  if (!resolved || resolved.startsAt !== new Date(startsAtMs).toISOString()) {
    return { error: "Booking slot does not match the selected timezone" };
  }

  return {
    startsAt: resolved.startsAt,
    endsAt: resolved.endsAt,
    startsAtMs: resolved.startsAtMs,
    localDate: local.localDate,
    localTime: local.localTime,
  };
}

function formatUtcInstantInTimeZone(
  utcMs: number,
  timezone: string,
): { localDate: string; localTime: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utcMs));
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
    const year = part("year");
    const month = part("month");
    const day = part("day");
    const hour = part("hour");
    const minute = part("minute");
    if (!year || !month || !day || !hour || !minute) return null;
    return { localDate: `${year}-${month}-${day}`, localTime: `${hour}:${minute}` };
  } catch {
    return null;
  }
}

async function generateAvailableBookingSlots(
  env: Env,
  input: {
    siteId: string;
    offer: ResolvedOneToOneBookingOffer;
    localDate: string;
    timezone: string;
  },
): Promise<
  Array<{
    slotStart: string;
    slotEnd: string;
    startsAt: string;
    endsAt: string;
    localDate: string;
    localTime: string;
  }>
> {
  const windows = input.offer.availability.windows || {};
  const weekday = weekdayForDate(input.localDate);
  if (!weekday) return [];
  const dayWindows = Array.isArray(windows[weekday]) ? windows[weekday] : [];
  const slots: Array<{
    slotStart: string;
    slotEnd: string;
    startsAt: string;
    endsAt: string;
    localDate: string;
    localTime: string;
  }> = [];

  for (const window of dayWindows) {
    const [windowStart, windowEnd] = String(window).split("-").map((part) => part.trim());
    const windowStartMinutes = timeToMinutes(windowStart);
    const windowEndMinutes = timeToMinutes(windowEnd);
    if (windowStartMinutes === null || windowEndMinutes === null) continue;

    for (
      let startMinutes = windowStartMinutes;
      startMinutes + input.offer.duration <= windowEndMinutes;
      startMinutes += 15
    ) {
      const localTime = minutesToTime(startMinutes);
      const slot = resolveBookingSlot({
        localDate: input.localDate,
        localTime,
        durationMinutes: input.offer.duration,
        timezone: input.timezone,
      });
      if (!slot || slot.startsAtMs <= Date.now() + 5 * 60_000) continue;

      const overlap = await findConfirmedBookingOverlap(env, {
        siteId: input.siteId,
        offerId: input.offer.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      if (overlap) continue;

      const activeHold = await findActiveBookingHoldOverlap(env, {
        siteId: input.siteId,
        offerId: input.offer.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      if (activeHold) continue;

      slots.push({
        slotStart: slot.startsAt,
        slotEnd: slot.endsAt,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        localDate: input.localDate,
        localTime,
      });
    }
  }

  return slots;
}

function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function serializePublicBookingOffer(offer: ResolvedOneToOneBookingOffer) {
  return {
    id: offer.id,
    title: offer.title,
    duration: offer.duration,
    pricing: offer.pricing?.enabled
      ? {
          enabled: true,
          suggestedAmount: offer.pricing.suggestedAmount,
          currency: offer.pricing.currency,
        }
      : { enabled: false },
  };
}

async function createConfirmedFreeOneToOneBooking(
  env: Env,
  input: {
    site: DbSite;
    bookIntent: CoreBookIntent;
    offer: ResolvedOneToOneBookingOffer;
    guestName: string;
    guestEmail: string;
    notes: string;
    slot: { startsAt: string; endsAt: string };
  },
): Promise<DbBooking | null> {
  const bookingId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO bookings
     (id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
      duration_minutes, status, notes, created_at, payment_intent_id, amount_paid,
      suggested_amount, currency, payment_status, is_free_booking, paid_at)
     VALUES (?, ?, ?, 'one_to_one', ?, ?, ?, ?, ?, 'confirmed', ?, datetime('now'),
             NULL, NULL, NULL, NULL, 'not_required', 1, NULL)`,
  )
    .bind(
      bookingId,
      input.site.id,
      input.offer.id,
      input.guestName,
      input.guestEmail,
      input.slot.startsAt,
      input.slot.endsAt,
      input.offer.duration,
      input.notes || null,
    )
    .run();

  const booking = await env.DB.prepare(
    `SELECT id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
            duration_minutes, calendar_event_id, status, notes, created_at, cancelled_at,
            payment_intent_id, amount_paid, suggested_amount, currency, payment_status,
            is_free_booking, paid_at
     FROM bookings
     WHERE id = ?`,
  )
    .bind(bookingId)
    .first<DbBooking>();

  if (booking) {
    scheduleBookingRemindersForBooking(env, {
      booking,
      bookingTitle: input.offer.title,
      timezone: resolveTimeZone(input.offer.availability.timezone),
      reminders: input.bookIntent.reminders,
    }).catch((error) => {
      console.error("Failed to schedule booking reminders:", error);
    });
  }

  return booking || null;
}

function validateBookingAvailability(
  availability: CoreBookingAvailability,
  localDate: string,
  localTime: string,
  durationMinutes: number,
): string | null {
  const windows = availability.windows || {};
  const weekday = weekdayForDate(localDate);
  if (!weekday) return "Invalid booking date";
  const dayWindows = Array.isArray(windows[weekday]) ? windows[weekday] : [];
  if (dayWindows.length === 0) return "This date is not available for bookings";

  const startMinutes = timeToMinutes(localTime);
  if (startMinutes === null) return "Invalid booking time";
  const endMinutes = startMinutes + durationMinutes;

  for (const window of dayWindows) {
    const [windowStart, windowEnd] = String(window).split("-").map((part) => part.trim());
    const windowStartMinutes = timeToMinutes(windowStart);
    const windowEndMinutes = timeToMinutes(windowEnd);
    if (windowStartMinutes === null || windowEndMinutes === null) continue;
    if (startMinutes >= windowStartMinutes && endMinutes <= windowEndMinutes) {
      return null;
    }
  }

  return "That time is outside the published booking availability";
}

function weekdayForDate(localDate: string): string | null {
  const match = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][weekdayIndex];
}

function timeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

async function findConfirmedBookingOverlap(
  env: Env,
  input: { siteId: string; offerId: string; startsAt: string; endsAt: string },
): Promise<DbBooking | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, site_id, offer_id, booking_type, guest_name, guest_email, starts_at, ends_at,
              duration_minutes, calendar_event_id, status, notes, created_at, cancelled_at,
              payment_intent_id, amount_paid, suggested_amount, currency, payment_status,
              is_free_booking, paid_at
       FROM bookings
       WHERE site_id = ?
         AND status = 'confirmed'
         AND (? IS NULL OR offer_id = ?)
         AND starts_at < ?
         AND ends_at > ?
       LIMIT 1`,
    )
      .bind(input.siteId, input.offerId, input.offerId, input.endsAt, input.startsAt)
      .first<DbBooking>()) || null
  );
}

async function findActiveBookingHoldOverlap(
  env: Env,
  input: { siteId: string; offerId: string; startsAt: string; endsAt: string },
): Promise<BookingHoldRecord | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, site_id, booking_id, offer_id, booking_type, hold_token, slot_start, slot_end,
              status, expires_at, created_at, updated_at
       FROM booking_holds
       WHERE site_id = ?
         AND status = 'active'
         AND expires_at > datetime('now')
         AND (? IS NULL OR offer_id = ?)
         AND slot_start < ?
         AND slot_end > ?
       LIMIT 1`,
    )
      .bind(input.siteId, input.offerId, input.offerId, input.endsAt, input.startsAt)
      .first<BookingHoldRecord>()) || null
  );
}

async function findActiveBookingHoldByToken(
  env: Env,
  holdToken: string,
): Promise<BookingHoldRecord | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, site_id, booking_id, offer_id, booking_type, hold_token, slot_start, slot_end,
              status, expires_at, created_at, updated_at
       FROM booking_holds
       WHERE hold_token = ?
         AND status = 'active'
         AND expires_at > datetime('now')`,
    )
      .bind(holdToken)
      .first<BookingHoldRecord>()) || null
  );
}

async function createBookingHold(
  env: Env,
  input: {
    siteId: string;
    offerId: string;
    holdToken: string;
    startsAt: string;
    endsAt: string;
    expiresAt: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO booking_holds
     (id, site_id, booking_id, offer_id, booking_type, hold_token, slot_start, slot_end,
      status, expires_at, created_at, updated_at)
     VALUES (?, ?, NULL, ?, 'one_to_one', ?, ?, ?, 'active', ?, datetime('now'), datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      input.siteId,
      input.offerId,
      input.holdToken,
      input.startsAt,
      input.endsAt,
      input.expiresAt,
    )
    .run();
}

async function releaseBookingHold(env: Env, holdToken: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE booking_holds
     SET status = 'released', updated_at = datetime('now')
     WHERE hold_token = ? AND status = 'active'`,
  )
    .bind(holdToken)
    .run();
}

async function confirmBookingHold(
  env: Env,
  holdToken: string,
  bookingId: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE booking_holds
     SET status = 'confirmed', booking_id = ?, updated_at = datetime('now')
     WHERE hold_token = ? AND status = 'active'`,
  )
    .bind(bookingId, holdToken)
    .run();
}

function normalizeSameOriginReturnUrl(value: unknown, fallbackOrigin: string): string {
  if (typeof value !== "string") return fallbackOrigin;
  try {
    const parsed = new URL(value);
    if (parsed.origin !== fallbackOrigin) return fallbackOrigin;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return fallbackOrigin;
  }
}

function appendQueryParams(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

function serializeBooking(booking: DbBooking) {
  return {
    id: booking.id,
    offerId: booking.offer_id,
    bookingType: booking.booking_type || "one_to_one",
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    durationMinutes: booking.duration_minutes,
    status: booking.status,
    notes: booking.notes,
    paymentStatus: booking.payment_status || "not_required",
    amountPaid: booking.amount_paid,
    currency: booking.currency,
    paidAt: booking.paid_at,
  };
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
  const recurrenceRule = normalizeEventRecurrenceRule(
    body?.recurrenceRule,
    kind,
    startDate,
  );
  if (body?.recurrenceRule && !recurrenceRule) {
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

function getSoulinkConnectorConfig(env: Env) {
  const apiOrigin =
    originFromUrl(env.SOULINK_API_ORIGIN) || DEFAULT_SOULINK_API_ORIGIN;
  return {
    apiOrigin,
    configured: Boolean(apiOrigin),
  };
}

function verifySoulinkDispatchAuth(
  connection: DbAgentChannelConnection,
  authorization: string | undefined,
) {
  const dispatchToken = connection.setup_token;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (!token || !constantTimeEqual(token, dispatchToken)) {
    return { ok: false, status: 401, error: "Invalid Soulink dispatch token" };
  }
  return { ok: true as const };
}

function serializeSoulinkConnection(row: DbAgentChannelConnection | null) {
  if (!row) return null;
  const metadata = parseJsonRecord(row.provider_metadata_json);
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    ownerNodeId:
      typeof metadata.ownerNodeId === "string" ? metadata.ownerNodeId : row.provider_user_id,
    assistantNodeId:
      typeof metadata.assistantNodeId === "string" ? metadata.assistantNodeId : null,
    streamChannelType: row.provider_connection_id || "messaging",
    streamChannelId: row.provider_thread_id,
    soulinkChatUrl:
      typeof metadata.soulinkChatUrl === "string" ? metadata.soulinkChatUrl : null,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastInboundAt: row.last_inbound_at,
    lastOutboundAt: row.last_outbound_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function buildSoulinkStatusPayload(
  env: Env,
  ownerId: string,
  requestUrl: string,
  currentConnection?: DbAgentChannelConnection | null,
) {
  const config = getSoulinkConnectorConfig(env);
  const connection =
    currentConnection === undefined
      ? await getSoulinkConnection(env, ownerId)
      : currentConnection;
  const events = connection
    ? await env.DB.prepare(
        `SELECT id, connection_id, channel, direction, event_type, status,
                provider_event_id, provider_message_id,
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

  return {
    available: true,
    configured: config.configured,
    apiOrigin: config.apiOrigin,
    runtimeCallbackUrl: `${getCoreApiOrigin(env, requestUrl)}/api/agent/channels/soulink/dispatch`,
    connection: serializeSoulinkConnection(connection),
    recentEvents: (events.results || []).map(serializeProviderChannelEvent),
  };
}

async function syncSoulinkContacts(env: Env, ownerId: string) {
  const config = getSoulinkConnectorConfig(env);
  if (!config.configured) {
    return { ok: false, status: 503, error: "Soulink connector is not configured" };
  }

  const connection = await getSoulinkConnection(env, ownerId);
  if (!connection || connection.status !== "active") {
    return { ok: false, status: 409, error: "Connect Soulink before syncing contacts" };
  }

  const linksResult = await fetchSoulinkLinks(config.apiOrigin, connection);
  if (!linksResult.ok) {
    return {
      ok: false,
      status: linksResult.status,
      error: linksResult.error,
    };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const link of linksResult.links) {
    const input = await soulinkLinkToContactInput(
      link,
      config.apiOrigin,
    );
    if (!input) {
      skipped += 1;
      continue;
    }

    const result = await upsertAgentContact(env, ownerId, input);
    if ("error" in result) {
      skipped += 1;
      continue;
    }
    if (result.created) created += 1;
    else updated += 1;
  }

  const contacts = await listAgentContacts(env, ownerId);
  return {
    ok: true,
    synced: created + updated,
    created,
    updated,
    skipped,
    contacts: contacts.contacts,
    summary: contacts.summary,
  };
}

async function fetchSoulinkLinks(
  apiOrigin: string,
  connection: DbAgentChannelConnection,
): Promise<
  | { ok: true; links: SoulinkLinkRecord[] }
  | { ok: false; status: number; error: string }
> {
  const metadata = parseJsonRecord(connection.provider_metadata_json);
  const ownerNodeId =
    typeof metadata.ownerNodeId === "string"
      ? metadata.ownerNodeId
      : connection.provider_user_id;
  const url = new URL("/api/me3/links", apiOrigin);
  if (ownerNodeId) url.searchParams.set("ownerNodeId", ownerNodeId);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${connection.setup_token}`,
    },
  });
  const payload = (await response.json().catch(() => null)) as SoulinkLinksResponse | null;
  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 404 ? 501 : 502,
      error:
        payload?.error ||
        "Soulink Links sync is not available from this Soulink connector yet",
    };
  }

  return {
    ok: true,
    links: Array.isArray(payload?.links) ? payload.links : [],
  };
}

async function soulinkLinkToContactInput(
  link: SoulinkLinkRecord,
  soulinkOrigin: string,
) {
  const node = link.otherNode && typeof link.otherNode === "object" ? link.otherNode : null;
  const linkId = stringValue(link.id);
  const nodeId = stringValue(node?.id);
  const sourceRef = nodeId || linkId;
  if (!sourceRef) return null;

  const me3Url = stringValue(node?.me3Url);
  const meProfile = await resolveLinkedMeProfile(me3Url);
  const name =
    stringValue(node?.displayName) ||
    stringValue(meProfile?.name) ||
    stringValue(node?.handle) ||
    "Soulink contact";
  const email =
    normalizeEmail(node?.email) ||
    normalizeEmail(node?.contactEmail) ||
    normalizeEmail(meProfile?.email) ||
    null;
  const avatarUrl =
    stringValue(node?.avatarUrl) ||
    stringValue(meProfile?.avatarUrl) ||
    null;
  const context = link.context && typeof link.context === "object" ? link.context : null;
  const soulinkChatUrl = buildSoulinkContactChatUrl(soulinkOrigin, link, context);
  const lastActiveAt =
    stringValue(context?.lastActiveAt) ||
    stringValue(link.updatedAt) ||
    stringValue(link.createdAt);
  const socialHandles: Record<string, string> = {};
  const handle = stringValue(node?.handle);
  if (handle) socialHandles.soulink = handle;
  if (me3Url) socialHandles.me3 = me3Url;

  return {
    name,
    email,
    source: "soulink" as const,
    sourceRef,
    relationship: "contact" as const,
    status: "active" as const,
    lastInteractionAt: lastActiveAt,
    socialHandles,
    metadata: {
      avatarUrl,
      me3Url,
      soulinkLinkId: linkId,
      soulinkNodeId: nodeId,
      soulinkChatUrl,
      soulinkOrigin,
      soulinkSourceChatId:
        stringValue(context?.sourceChatId) || stringValue(link.sourceChatId),
      soulinkContextLabel: stringValue(context?.label),
      soulinkSourceChatTitle: stringValue(context?.sourceChatTitle),
      soulinkSourceChatKind: stringValue(context?.sourceChatKind),
      soulinkStatus: stringValue(link.status),
      soulinkLastActiveAt: lastActiveAt,
      resolvedFromMeJsonAt: meProfile?.resolvedAt || null,
      coreResolvedAt: new Date().toISOString(),
    },
  };
}

async function resolveLinkedMeProfile(me3Url: string | null): Promise<{
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  resolvedAt: string;
} | null> {
  const candidates = candidateMeJsonUrls(me3Url);
  for (const candidate of candidates) {
    const response = await fetch(candidate, {
      headers: { Accept: "application/json" },
    }).catch(() => null);
    if (!response?.ok) continue;
    const data = (await response.json().catch(() => null)) as unknown;
    if (!isPlainObject(data)) continue;
    const links = isPlainObject(data.links) ? data.links : {};
    return {
      name: stringValue(data.name),
      email: normalizeEmail(links.email),
      avatarUrl: resolveProfileAssetUrl(candidate, stringValue(data.avatar)),
      resolvedAt: new Date().toISOString(),
    };
  }
  return null;
}

function candidateMeJsonUrls(me3Url: string | null): string[] {
  if (!me3Url) return [];
  try {
    const base = new URL(me3Url);
    if (!/^https?:$/.test(base.protocol)) return [];
    if (base.pathname.endsWith(".json")) return [base.toString()];
    const root = new URL(base.toString());
    root.pathname = root.pathname.replace(/\/+$/, "");
    root.search = "";
    root.hash = "";
    return [
      new URL(`${root.pathname}/me.json`.replace(/\/+/g, "/"), root.origin).toString(),
      new URL("/.well-known/me.json", root.origin).toString(),
    ];
  } catch {
    return [];
  }
}

function resolveProfileAssetUrl(profileUrl: string, assetUrl: string | null): string | null {
  if (!assetUrl) return null;
  try {
    return new URL(assetUrl, profileUrl).toString();
  } catch {
    return assetUrl;
  }
}

function buildSoulinkContactChatUrl(
  soulinkOrigin: string,
  link: SoulinkLinkRecord,
  context: SoulinkLinkContextRecord | null,
): string | null {
  const explicitUrl = stringValue(context?.soulinkChatUrl) || stringValue(context?.chatUrl);
  if (explicitUrl) return explicitUrl;
  const streamChannelId = stringValue(context?.streamChannelId);
  if (streamChannelId) {
    return `${soulinkOrigin}/?chat=${encodeURIComponent(
      streamChannelId.includes(":") ? streamChannelId : `messaging:${streamChannelId}`,
    )}`;
  }
  const sourceChatId = stringValue(context?.sourceChatId) || stringValue(link.sourceChatId);
  return sourceChatId ? `${soulinkOrigin}/?chat=${encodeURIComponent(sourceChatId)}` : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function serializeProviderChannelEvent(row: DbAgentChannelEvent) {
  return {
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    eventType: row.event_type,
    status: row.status,
    providerEventId: row.provider_event_id,
    providerMessageId: row.provider_message_id,
    replyToMessageId: row.reply_to_message_id,
    textBody: row.text_body,
    rawJson: parseJsonRecord(row.raw_json),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSoulinkConnection(env: Env, ownerId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token,
            provider_connection_id, provider_user_id, provider_thread_id,
            provider_username, provider_metadata_json,
            telegram_user_id, telegram_chat_id, telegram_username,
            telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at,
            updated_at
     FROM agent_channel_connections
     WHERE user_id = ? AND channel = 'soulink'`,
  )
    .bind(ownerId)
    .first<DbAgentChannelConnection>();
}

async function getActiveSoulinkConnectionForThread(env: Env, streamChannelId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token,
            provider_connection_id, provider_user_id, provider_thread_id,
            provider_username, provider_metadata_json,
            telegram_user_id, telegram_chat_id, telegram_username,
            telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at,
            updated_at
     FROM agent_channel_connections
     WHERE provider_thread_id = ? AND channel = 'soulink' AND status = 'active'`,
  )
    .bind(streamChannelId)
    .first<DbAgentChannelConnection>();
}

async function upsertActiveSoulinkConnection(
  env: Env,
  ownerId: string,
  input: {
    ownerNodeId: string | null;
    assistantNodeId: string | null;
    streamChannelType: string;
    streamChannelId: string;
    soulinkChatUrl: string | null;
    runtimeCallbackUrl: string;
    dispatchToken: string;
  },
) {
  const existing = await getSoulinkConnection(env, ownerId);
  const connectionId = existing?.id || crypto.randomUUID();
  const setupToken = input.dispatchToken;
  const metadata = JSON.stringify({
    ownerNodeId: input.ownerNodeId,
    assistantNodeId: input.assistantNodeId,
    soulinkChatUrl: input.soulinkChatUrl,
    runtimeCallbackUrl: input.runtimeCallbackUrl,
  });

  await env.DB.prepare(
    `INSERT INTO agent_channel_connections
       (id, user_id, channel, status, setup_token,
        provider_connection_id, provider_user_id, provider_thread_id,
        provider_username, provider_metadata_json,
        connected_at, disconnected_at, last_inbound_at, last_outbound_at)
     VALUES (?, ?, 'soulink', 'active', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL, NULL, NULL)
     ON CONFLICT(user_id, channel) DO UPDATE SET
       status = 'active',
       provider_connection_id = excluded.provider_connection_id,
       provider_user_id = excluded.provider_user_id,
       provider_thread_id = excluded.provider_thread_id,
       provider_username = excluded.provider_username,
       provider_metadata_json = excluded.provider_metadata_json,
       connected_at = COALESCE(agent_channel_connections.connected_at, CURRENT_TIMESTAMP),
       disconnected_at = NULL,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      connectionId,
      ownerId,
      setupToken,
      input.streamChannelType,
      input.ownerNodeId,
      input.streamChannelId,
      input.assistantNodeId,
      metadata,
    )
    .run();

  const row = await getSoulinkConnection(env, ownerId);
  if (!row) throw new Error("Failed to create Soulink connection");
  return row;
}

async function getAgentChannelEventByProviderEventId(
  env: Env,
  connectionId: string,
  providerEventId: string,
) {
  return env.DB.prepare(
    `SELECT id, connection_id, channel, direction, event_type, status,
            provider_event_id, provider_message_id,
            telegram_message_id, reply_to_message_id, telegram_user_id,
            telegram_chat_id, telegram_username, text_body, raw_json,
            error_message, created_at, updated_at
     FROM agent_channel_events
     WHERE connection_id = ? AND provider_event_id = ?`,
  )
    .bind(connectionId, providerEventId)
    .first<DbAgentChannelEvent>();
}

type ProviderChannelEventInput = {
  channel: "sandbox" | "soulink";
  connectionId: string;
  direction: "inbound" | "outbound" | "system";
  eventType: "start" | "message" | "link" | "send" | "error";
  status: "received" | "pending" | "sent" | "failed" | "linked" | "skipped";
  providerEventId: string | null;
  providerMessageId: string | null;
  replyToMessageId: string | number | null;
  textBody: string | null;
  rawJson: unknown;
  errorMessage: string | null;
};

async function insertProviderChannelEventOnce(env: Env, input: ProviderChannelEventInput) {
  if (input.providerEventId) {
    const existing = await getAgentChannelEventByProviderEventId(
      env,
      input.connectionId,
      input.providerEventId,
    );
    if (existing) return existing.id;
  }

  return insertProviderChannelEvent(env, input);
}

async function insertProviderChannelEvent(
  env: Env,
  input: ProviderChannelEventInput,
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO agent_channel_events
       (id, connection_id, channel, direction, event_type, status,
        provider_event_id, provider_message_id, reply_to_message_id,
        text_body, raw_json, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      input.connectionId,
      input.channel,
      input.direction,
      input.eventType,
      input.status,
      input.providerEventId,
      input.providerMessageId,
      input.replyToMessageId === null ? null : String(input.replyToMessageId),
      input.textBody,
      JSON.stringify(input.rawJson),
      input.errorMessage,
    )
    .run();
  return id;
}

async function dispatchAgentChannelTurn(
  env: Env,
  input: {
    userId: string;
    connectionId: string;
    sourceEventId: string;
    turnId: string;
    messageText: string;
    replyToMessageId: unknown;
  },
): Promise<AgentSandboxDispatchResponse> {
  const runtime = env.ME3_USER_AGENT;
  if (!runtime) {
    return {
      ok: false,
      auditId: null,
      turnId: input.turnId,
      specialist: "core.agent-chat",
      replyText: null,
      model: null,
      source: null,
      error: "Agent chat runtime is not configured",
    };
  }

  const id = runtime.idFromName(input.userId);
  const stub = runtime.get(id);
  const response = await stub.fetch("https://me3-core-user-agent.internal/dispatch/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: input.userId,
      connectionId: input.connectionId,
      sourceEventId: input.sourceEventId,
      turnId: input.turnId,
      messageText: input.messageText,
      replyToMessageId:
        typeof input.replyToMessageId === "string" ||
        typeof input.replyToMessageId === "number"
          ? input.replyToMessageId
          : null,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | AgentSandboxDispatchResponse
    | null;

  if (!response.ok || payload?.ok !== true) {
    return {
      ok: false,
      auditId: null,
      turnId: input.turnId,
      specialist: "core.agent-chat",
      replyText: null,
      model: null,
      source: null,
      error:
        typeof payload?.error === "string"
          ? payload.error
          : `Agent chat runtime request failed (${response.status})`,
    };
  }

  return payload;
}

async function getOwnerMe3Url(env: Env, ownerId: string, requestUrl: string): Promise<string | null> {
  const site = await env.DB.prepare(
    `SELECT username, custom_domain
     FROM sites
     WHERE user_id = ? AND (site_type = 'profile' OR site_type IS NULL)
     ORDER BY published_at DESC, created_at DESC
     LIMIT 1`,
  )
    .bind(ownerId)
    .first<{ username: string; custom_domain: string | null }>();
  if (site?.custom_domain) return `https://${site.custom_domain}`;
  if (site?.username) return `${getCoreWebOrigin(env, requestUrl)}/${site.username}`;
  return getCoreWebOrigin(env, requestUrl);
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

async function buildTelegramStatusPayload(
  env: Env,
  ownerId: string,
  requestUrl: string,
  currentConnection?: DbAgentChannelConnection | null,
) {
  const settings = await getTelegramSettings(env, ownerId);
  const botUsername = settings.botUsername;
  const connection =
    currentConnection === undefined
      ? await getTelegramConnection(env, ownerId)
      : currentConnection;
  const events = connection
    ? await env.DB.prepare(
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

  return {
    available: true,
    configured: Boolean(
      botUsername &&
        settings.botTokenConfigured &&
        settings.webhookSecretConfigured,
    ),
    encryptionConfigured: settings.encryptionConfigured,
    botUsername,
    botUsernameSource: settings.botUsernameSource,
    tokenConfigured: settings.botTokenConfigured,
    botTokenSource: settings.botTokenSource,
    botTokenHint: settings.botTokenHint,
    botTokenUpdatedAt: settings.botTokenUpdatedAt,
    webhookSecretConfigured: settings.webhookSecretConfigured,
    webhookSecretSource: settings.webhookSecretSource,
    webhookSecretHint: settings.webhookSecretHint,
    webhookSecretUpdatedAt: settings.webhookSecretUpdatedAt,
    webhookUrl: `${getCoreApiOrigin(env, requestUrl)}/api/telegram/webhook`,
    startUrl:
      connection?.status === "pending" && botUsername
        ? `https://t.me/${botUsername.replace(/^@/, "")}?start=${encodeURIComponent(connection.setup_token)}`
        : null,
    connection: connection ? serializeTelegramConnection(connection, botUsername) : null,
    recentEvents: (events.results || []).map(serializeTelegramEvent),
  };
}

function clampNumber(value: string | null | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
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

async function handleTelegramWebhookUpdate(
  env: Env,
  update: TelegramWebhookUpdate,
): Promise<{ ok: boolean; status: number; action: string; error?: string }> {
  const message = update.message;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const chatId = telegramIdToString(message?.chat?.id);
  const telegramUserId = telegramIdToString(message?.from?.id);

  if (!message || !chatId || !telegramUserId || !text) {
    return { ok: true, status: 200, action: "skipped" };
  }

  const startToken = parseTelegramStartToken(text);
  if (startToken) {
    const linked = await activateTelegramConnectionFromStartToken(env, update, startToken);
    const botToken = linked
      ? await resolveTelegramBotToken(env, linked.user_id)
      : await resolveTelegramBotTokenForInstall(env);
    if (!botToken) {
      return {
        ok: false,
        status: 503,
        action: "missing_bot_token",
        error: "Telegram bot token is not configured",
      };
    }
    const replyText = linked
      ? "Telegram is connected to your ME3 agent. Send a message here whenever you want to talk to it."
      : "I couldn't link this chat. Open Account -> Telegram in ME3 and generate a fresh setup link.";
    await sendTelegramMessage(botToken, chatId, replyText, message.message_id);
    return { ok: true, status: 200, action: linked ? "linked" : "link_failed" };
  }

  const connection = await getActiveTelegramConnectionForChat(env, chatId);
  const botToken = connection
    ? await resolveTelegramBotToken(env, connection.user_id)
    : await resolveTelegramBotTokenForInstall(env);
  if (!botToken) {
    return {
      ok: false,
      status: 503,
      action: "missing_bot_token",
      error: "Telegram bot token is not configured",
    };
  }
  if (!connection) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Open Account -> Telegram in ME3 and use the setup link before chatting with this bot.",
      message.message_id,
    );
    return { ok: true, status: 200, action: "unlinked_chat" };
  }

  const turnId = crypto.randomUUID();
  const sourceEventId = await insertTelegramChannelEvent(env, {
    connectionId: connection.id,
    direction: "inbound",
    eventType: "message",
    status: "received",
    message,
    textBody: text,
    rawJson: update,
    errorMessage: null,
  });

  await env.DB.prepare(
    `UPDATE agent_channel_connections
     SET last_inbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  )
    .bind(connection.id)
    .run();

  const response = await dispatchTelegramAgentTurn(env, {
    userId: connection.user_id,
    connectionId: connection.id,
    sourceEventId,
    turnId,
    messageText: text,
    replyToMessageId: message.message_id,
  });

  if (!response.ok) {
    const fallback = response.error || "ME3 agent runtime is not available right now.";
    await sendTelegramMessage(botToken, chatId, fallback, message.message_id);
    await insertTelegramChannelEvent(env, {
      connectionId: connection.id,
      direction: "outbound",
      eventType: "error",
      status: "failed",
      message,
      textBody: fallback,
      rawJson: response,
      errorMessage: response.error || "Agent dispatch failed",
    });
    return { ok: true, status: 200, action: "agent_failed" };
  }

  if (response.replyText) {
    await sendTelegramMessage(botToken, chatId, response.replyText, message.message_id);
    await insertTelegramChannelEvent(env, {
      connectionId: connection.id,
      direction: "outbound",
      eventType: "send",
      status: "sent",
      message,
      textBody: response.replyText,
      rawJson: response,
      errorMessage: null,
    });
    await env.DB.prepare(
      `UPDATE agent_channel_connections
       SET last_outbound_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(connection.id)
      .run();
  }

  return { ok: true, status: 200, action: "agent_reply" };
}

async function dispatchTelegramAgentTurn(
  env: Env,
  input: {
    userId: string;
    connectionId: string;
    sourceEventId: string;
    turnId: string;
    messageText: string;
    replyToMessageId: unknown;
  },
): Promise<AgentSandboxDispatchResponse> {
  return dispatchAgentChannelTurn(env, input);
}

async function activateTelegramConnectionFromStartToken(
  env: Env,
  update: TelegramWebhookUpdate,
  setupToken: string,
) {
  const message = update.message;
  const connection = await getTelegramConnectionBySetupToken(env, setupToken);
  if (!connection || connection.status !== "pending") return null;

  await env.DB.prepare(
    `UPDATE agent_channel_connections
     SET status = 'active',
         telegram_user_id = ?,
         telegram_chat_id = ?,
         telegram_username = ?,
         telegram_first_name = ?,
         telegram_last_name = ?,
         connected_at = CURRENT_TIMESTAMP,
         disconnected_at = NULL,
         last_inbound_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND channel = 'telegram'`,
  )
    .bind(
      telegramIdToString(message?.from?.id),
      telegramIdToString(message?.chat?.id),
      stringOrNull(message?.from?.username),
      stringOrNull(message?.from?.first_name),
      stringOrNull(message?.from?.last_name),
      connection.id,
    )
    .run();

  await insertTelegramChannelEvent(env, {
    connectionId: connection.id,
    direction: "inbound",
    eventType: "start",
    status: "linked",
    message,
    textBody: typeof message?.text === "string" ? message.text : null,
    rawJson: update,
    errorMessage: null,
  });

  return connection;
}

async function getTelegramConnectionBySetupToken(env: Env, setupToken: string) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token, telegram_user_id, telegram_chat_id,
            telegram_username, telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at, updated_at
     FROM agent_channel_connections
     WHERE setup_token = ? AND channel = 'telegram'`,
  )
    .bind(setupToken)
    .first<DbAgentChannelConnection>();
}

async function getActiveTelegramConnectionForChat(env: Env, chatId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token, telegram_user_id, telegram_chat_id,
            telegram_username, telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at, updated_at
     FROM agent_channel_connections
     WHERE telegram_chat_id = ? AND channel = 'telegram' AND status = 'active'`,
  )
    .bind(chatId)
    .first<DbAgentChannelConnection>();
}

async function insertTelegramChannelEvent(
  env: Env,
  input: {
    connectionId: string;
    direction: "inbound" | "outbound" | "system";
    eventType: "start" | "message" | "link" | "send" | "error";
    status: "received" | "pending" | "sent" | "failed" | "linked" | "skipped";
    message: TelegramMessage | undefined;
    textBody: string | null;
    rawJson: unknown;
    errorMessage: string | null;
  },
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO agent_channel_events
       (id, connection_id, channel, direction, event_type, status,
        telegram_message_id, reply_to_message_id, telegram_user_id,
        telegram_chat_id, telegram_username, text_body, raw_json,
        error_message, created_at, updated_at)
     VALUES (?, ?, 'telegram', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      id,
      input.connectionId,
      input.direction,
      input.eventType,
      input.status,
      telegramIdToString(input.message?.message_id),
      telegramIdToString(input.message?.reply_to_message?.message_id),
      telegramIdToString(input.message?.from?.id),
      telegramIdToString(input.message?.chat?.id),
      stringOrNull(input.message?.from?.username),
      input.textBody,
      JSON.stringify(input.rawJson),
      input.errorMessage,
    )
    .run();
  return id;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  replyToMessageId?: unknown,
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: truncateTelegramMessage(text),
  };
  if (typeof replyToMessageId === "string" || typeof replyToMessageId === "number") {
    body.reply_to_message_id = replyToMessageId;
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { description?: string }
      | null;
    throw new Error(payload?.description || `Telegram sendMessage failed (${response.status})`);
  }
}

function parseTelegramStartToken(text: string) {
  const match = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
  return match?.[1]?.trim() || null;
}

function telegramIdToString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncateTelegramMessage(value: string) {
  return value.length > 4000 ? `${value.slice(0, 3997)}...` : value;
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

async function createMe3ClaimStartResponse(c: AppContext, rawRedirect?: unknown): Promise<Response> {
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
  const stored = await env.DB.prepare("SELECT value FROM install_secrets WHERE name = ?")
    .bind(ME3_CORE_INSTALL_ID_SECRET_NAME)
    .first<{ value: string }>();
  const existing = normalizeMe3CoreInstallId(stored?.value);
  if (existing) return existing;

  const installId = `core_${crypto.randomUUID()}`;
  await setStoredInstallSecret(env, ME3_CORE_INSTALL_ID_SECRET_NAME, installId);
  return installId;
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
  const name = email ? email.split("@")[0] || "ME3 Core Owner" : "ME3 Core Owner";

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

async function handleAssistantJobQueueBatch(
  batch: MessageBatch<AssistantJobEventQueueMessage>,
  env: Env,
) {
  const isDeadLetterBatch = batch.queue.includes("dlq");

  for (const message of batch.messages) {
    try {
      if (isDeadLetterBatch) {
        await markAssistantJobQueueMessageFailed(
          env,
          message.body,
          new Error("Assistant Job queue message reached the dead-letter queue"),
        );
      } else {
        await processAssistantJobQueueMessage(env, message.body);
      }
      message.ack();
    } catch (error) {
      if (isDeadLetterBatch) {
        message.ack();
      } else {
        message.retry();
      }
    }
  }
}

async function handleInboundEmail(
  message: ForwardableEmailMessageLike,
  env: Env,
): Promise<void> {
  try {
    const mailbox = await getActiveMailboxForInbound(env);
    if (!mailbox) {
      message.setReject("ME3 Core mailbox is not active for this installation.");
      return;
    }

    if (message.rawSize > MAX_INBOUND_EMAIL_BYTES) {
      message.setReject("Message is too large for this ME3 Core mailbox.");
      return;
    }

    const rawMessage = await readEmailRawText(message.raw, MAX_INBOUND_EMAIL_BYTES);
    const parsed = parseInboundEmail(rawMessage, message.headers);
    const now = new Date().toISOString();
    const providerMessageId =
      normalizeEmailHeaderValue(parsed.headers["message-id"]) || crypto.randomUUID();
    const threadKey =
      normalizeEmailHeaderValue(parsed.headers.references) ||
      normalizeEmailHeaderValue(parsed.headers["in-reply-to"]) ||
      providerMessageId;
    const rowId = crypto.randomUUID();
    const storedAttachments = await storeInboundEmailAttachments(
      env,
      mailbox.id,
      rowId,
      parsed.attachments,
    );

    await env.DB.prepare(
      `INSERT INTO mailbox_messages (
         id, mailbox_id, direction, message_kind, status, thread_key,
         provider_id, provider_message_id, from_address, to_address, subject,
         text_body, html_body, raw_headers_json, raw_message, metadata_json,
         folder, created_by, received_at, created_at, updated_at
       )
       VALUES (
         ?, ?, 'inbound', 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         'inbox', 'cloudflare-email-routing', ?, ?, ?
       )`,
    )
      .bind(
        rowId,
        mailbox.id,
        "received",
        threadKey,
        INBOUND_EMAIL_PROVIDER_ID,
        providerMessageId,
        normalizeEmail(message.from) || normalizeEmailHeaderValue(parsed.headers.from),
        normalizeEmail(message.to) || normalizeEmailHeaderValue(parsed.headers.to),
        parsed.subject || "(no subject)",
        parsed.textBody || parsed.htmlBody || "",
        parsed.htmlBody,
        JSON.stringify(parsed.headers),
        rawMessage,
        JSON.stringify({
          rawSize: message.rawSize,
          envelopeFrom: message.from,
          envelopeTo: message.to,
          attachmentCount: storedAttachments.length,
          attachments: storedAttachments,
        }),
        now,
        now,
        now,
      )
      .run();

    if (mailbox.forwarding_enabled && mailbox.forwarding_email && message.canBeForwarded) {
      await message.forward(mailbox.forwarding_email);
      await markInboundEmailForwarded(env, mailbox.id, rowId, mailbox.forwarding_email);
    }
  } catch (error) {
    console.error("Inbound email processing failed", error);
    message.setReject("ME3 Core could not process this email.");
  }
}

async function getActiveMailboxForInbound(env: Env): Promise<DbMailboxAlias | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, user_id, alias_local_part, forwarding_email, forwarding_status,
              forwarding_enabled, forwarding_mode, status, approval_policy,
              daily_inbound_limit, daily_outbound_limit, activated_at,
              cf_destination_id, cf_destination_verified_at, cf_rule_id,
              cf_last_synced_at, cf_last_error, created_at, updated_at
       FROM mailbox_aliases
       WHERE status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
      .bind()
      .first<DbMailboxAlias>()) || null
  );
}

async function markInboundEmailForwarded(
  env: Env,
  mailboxId: string,
  messageId: string,
  forwardedTo: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE mailbox_messages
     SET status = 'forwarded',
         forwarded_to = ?,
         updated_at = ?
     WHERE id = ? AND mailbox_id = ?`,
  )
    .bind(forwardedTo, new Date().toISOString(), messageId, mailboxId)
    .run();
}

async function readEmailRawText(
  raw: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const reader = raw.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      throw new Error("Inbound email exceeded ME3 Core raw message limit.");
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseInboundEmail(
  rawMessage: string,
  envelopeHeaders: Headers,
): {
  headers: Record<string, string>;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachments: ParsedInboundEmailAttachment[];
} {
  const [rawHeaderText, ...bodyParts] = rawMessage.split(/\r?\n\r?\n/);
  const headers = {
    ...headersToRecord(envelopeHeaders),
    ...parseRawEmailHeaders(rawHeaderText || ""),
  };
  const body = bodyParts.join("\n\n");
  const contentType = headers["content-type"] || "";
  const parsedBody = parseEmailBody(body, contentType, headers["content-transfer-encoding"]);

  return {
    headers,
    subject: normalizeEmailHeaderValue(headers.subject) || "",
    textBody: parsedBody.textBody,
    htmlBody: parsedBody.htmlBody,
    attachments: parsedBody.attachments,
  };
}

type ParsedInboundEmailAttachment = {
  filename: string;
  mimeType: string;
  disposition: "attachment" | "inline";
  contentId: string | null;
  content: Uint8Array;
};

type StoredMailboxAttachment = {
  filename: string;
  mimeType: string;
  disposition: "attachment" | "inline";
  size: number;
  storageKey: string;
  contentId?: string | null;
  sourceMessageId: string;
};

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function parseRawEmailHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let currentHeader = "";

  for (const line of rawHeaders.split(/\r?\n/)) {
    if (/^\s/.test(line) && currentHeader) {
      headers[currentHeader] = `${headers[currentHeader]} ${line.trim()}`;
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    currentHeader = line.slice(0, separatorIndex).trim().toLowerCase();
    headers[currentHeader] = line.slice(separatorIndex + 1).trim();
  }

  return headers;
}

type MailboxUnsubscribeAction =
  | { mode: "one_click"; url: string }
  | { mode: "link"; url: string }
  | { mode: "mailto"; url: string };

function resolveMailboxUnsubscribeAction(
  rawHeadersJson: string | null,
): MailboxUnsubscribeAction | null {
  const headers = parseJsonRecord(rawHeadersJson);
  const listUnsubscribe = getHeaderValue(headers, "list-unsubscribe");
  if (!listUnsubscribe) return null;

  const urls = parseListUnsubscribeUrls(listUnsubscribe);
  const httpsUrl = urls.find(isHttpsUrl);
  const mailtoUrl = urls.find((url) => url.trim().toLowerCase().startsWith("mailto:"));
  const oneClick =
    getHeaderValue(headers, "list-unsubscribe-post")?.trim().toLowerCase() ===
    "list-unsubscribe=one-click";

  if (oneClick && httpsUrl) return { mode: "one_click", url: httpsUrl };
  if (httpsUrl) return { mode: "link", url: httpsUrl };
  if (mailtoUrl) return { mode: "mailto", url: mailtoUrl };
  return null;
}

function getHeaderValue(headers: Record<string, unknown>, name: string): string | null {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && typeof value === "string") {
      return value;
    }
  }
  return null;
}

function parseListUnsubscribeUrls(value: string): string[] {
  const bracketed = [...value.matchAll(/<([^>]+)>/g)]
    .map((match) => match[1]?.trim() || "")
    .filter(Boolean);
  if (bracketed.length > 0) return bracketed;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseEmailBody(
  body: string,
  contentType: string,
  transferEncoding: string | undefined,
): { textBody: string; htmlBody: string | null; attachments: ParsedInboundEmailAttachment[] } {
  const boundary = extractMimeBoundary(contentType);
  if (!boundary) {
    const decoded = decodeEmailBody(body, transferEncoding);
    if (/text\/html/i.test(contentType)) {
      return { textBody: stripHtml(decoded), htmlBody: decoded.trim() || null, attachments: [] };
    }
    return { textBody: decoded.trim(), htmlBody: null, attachments: [] };
  }

  let textBody = "";
  let htmlBody: string | null = null;
  const attachments: ParsedInboundEmailAttachment[] = [];
  for (const part of body.split(`--${boundary}`)) {
    if (!part.trim() || part.trim() === "--") continue;
    const [partHeadersText, ...partBodyParts] = part
      .replace(/^(\r?\n)/, "")
      .split(/\r?\n\r?\n/);
    const partHeaders = parseRawEmailHeaders(partHeadersText || "");
    const partContentType = partHeaders["content-type"] || "";
    const partBody = partBodyParts.join("\n\n").replace(/\r?\n--$/, "");
    const partDisposition = partHeaders["content-disposition"] || "";
    const filename = extractMimeFilename(partContentType, partDisposition);
    const isAttachment =
      /^attachment\b/i.test(partDisposition) ||
      (Boolean(filename) && !/^text\/(?:plain|html)\b/i.test(partContentType));

    if (isAttachment && filename) {
      const content = decodeEmailBodyBytes(
        partBody,
        partHeaders["content-transfer-encoding"],
      );
      attachments.push({
        filename,
        mimeType: normalizeMimeType(partContentType),
        disposition: /^inline\b/i.test(partDisposition) ? "inline" : "attachment",
        contentId: normalizeEmailHeaderValue(partHeaders["content-id"]) || null,
        content,
      });
      continue;
    }

    const decoded = decodeEmailBody(partBody, partHeaders["content-transfer-encoding"]).trim();
    if (!textBody && /^text\/plain\b/i.test(partContentType)) {
      textBody = decoded;
    } else if (!htmlBody && /^text\/html\b/i.test(partContentType)) {
      htmlBody = decoded;
    }
  }

  return {
    textBody: textBody || (htmlBody ? stripHtml(htmlBody) : ""),
    htmlBody,
    attachments,
  };
}

function extractMimeBoundary(contentType: string): string | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return (match?.[1] || match?.[2] || "").trim() || null;
}

function decodeEmailBody(body: string, transferEncoding: string | undefined): string {
  return new TextDecoder().decode(decodeEmailBodyBytes(body, transferEncoding));
}

function decodeEmailBodyBytes(body: string, transferEncoding: string | undefined): Uint8Array {
  const encoding = (transferEncoding || "").trim().toLowerCase();
  if (encoding === "base64") {
    try {
      const binary = atob(body.replace(/\s/g, ""));
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    } catch {
      return new TextEncoder().encode(body);
    }
  }
  if (encoding === "quoted-printable") {
    const decoded = body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9a-f]{2})/gi, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0) & 0xff);
  }
  return new TextEncoder().encode(body);
}

function extractMimeFilename(contentType: string, contentDisposition: string): string | null {
  return (
    extractMimeParameter(contentDisposition, "filename*") ||
    extractMimeParameter(contentDisposition, "filename") ||
    extractMimeParameter(contentType, "name*") ||
    extractMimeParameter(contentType, "name")
  );
}

function extractMimeParameter(header: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedName}=("[^"]*"|[^;]+)`, "i").exec(header);
  const raw = (match?.[1] || "").trim();
  if (!raw) return null;
  const value = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  const rfc5987 = /^utf-8''(.+)$/i.exec(value);
  try {
    return decodeURIComponent(rfc5987?.[1] || value).trim() || null;
  } catch {
    return value.trim() || null;
  }
}

function normalizeMimeType(contentType: string): string {
  return (contentType.split(";")[0] || "application/octet-stream").trim().toLowerCase();
}

function sanitizeAttachmentFilename(value: string, fallback: string): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return sanitized || fallback;
}

async function storeInboundEmailAttachments(
  env: Env,
  mailboxId: string,
  messageId: string,
  attachments: ParsedInboundEmailAttachment[],
): Promise<StoredMailboxAttachment[]> {
  if (!env.SITE_ASSETS || attachments.length === 0) return [];

  const stored: StoredMailboxAttachment[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const filename = sanitizeAttachmentFilename(
      attachment.filename,
      `attachment-${index + 1}`,
    );
    const storageKey = [
      "mailbox",
      mailboxId,
      "messages",
      messageId,
      "attachments",
      `${index}-${crypto.randomUUID()}-${filename}`,
    ].join("/");
    await env.SITE_ASSETS.put(storageKey, attachment.content, {
      httpMetadata: {
        contentType: attachment.mimeType,
      },
      customMetadata: {
        mailboxId,
        messageId,
        filename,
        disposition: attachment.disposition,
      },
    });
    stored.push({
      filename,
      mimeType: attachment.mimeType,
      disposition: attachment.disposition,
      size: attachment.content.byteLength,
      storageKey,
      contentId: attachment.contentId,
      sourceMessageId: messageId,
    });
  }
  return stored;
}

function getStoredMailboxAttachments(metadataJson: string | null): StoredMailboxAttachment[] {
  const metadata = parseJsonRecord(metadataJson);
  const rawAttachments = Array.isArray(metadata.attachments)
    ? metadata.attachments
    : [];
  return rawAttachments
    .filter((attachment): attachment is Record<string, unknown> =>
      Boolean(attachment && typeof attachment === "object" && !Array.isArray(attachment)),
    )
    .map((attachment) => ({
      filename: typeof attachment.filename === "string" ? attachment.filename : "",
      mimeType:
        typeof attachment.mimeType === "string" && attachment.mimeType.trim()
          ? attachment.mimeType
          : "application/octet-stream",
      disposition:
        attachment.disposition === "inline" ? ("inline" as const) : ("attachment" as const),
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size)
          ? attachment.size
          : 0,
      storageKey:
        typeof attachment.storageKey === "string" ? attachment.storageKey : "",
      contentId:
        typeof attachment.contentId === "string" ? attachment.contentId : null,
      sourceMessageId:
        typeof attachment.sourceMessageId === "string"
          ? attachment.sourceMessageId
          : "",
    }))
    .filter((attachment) => attachment.storageKey.startsWith("mailbox/"));
}

async function loadDraftProviderAttachments(
  env: Env,
  draft: AgentMailboxMessage,
): Promise<EmailProviderAttachment[]> {
  if (!env.SITE_ASSETS) return [];
  const rawAttachments = Array.isArray(draft.metadata.attachments)
    ? draft.metadata.attachments
    : [];
  const attachments = getStoredMailboxAttachments(
    JSON.stringify({ attachments: rawAttachments }),
  );
  const loaded: EmailProviderAttachment[] = [];
  for (const attachment of attachments) {
    const object = await env.SITE_ASSETS.get(attachment.storageKey);
    if (!object) continue;
    loaded.push({
      filename: sanitizeAttachmentFilename(
        attachment.filename,
        `attachment-${loaded.length + 1}`,
      ),
      mimeType: attachment.mimeType || "application/octet-stream",
      content: new Uint8Array(await object.arrayBuffer()),
    });
  }
  return loaded;
}

function stripHtml(value: string): string {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmailHeaderValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const worker = {
  fetch(request: Request, env: Env, ctx?: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  email(message: ForwardableEmailMessageLike, env: Env, _ctx?: ExecutionContext) {
    return handleInboundEmail(message, env);
  },
  async scheduled(_event: ScheduledEvent, env: Env, _ctx?: ExecutionContext) {
    await dispatchDueScheduledAssistantJobs(env);
    await dispatchDueBookingReminders(env);
    await dispatchDueSocialPublications(env);
  },
  queue(
    batch: MessageBatch<
      AssistantJobEventQueueMessage | BookingReminderQueueMessage | SocialPublishQueueMessage
    >,
    env: Env,
  ) {
    if (batch.queue === BOOKING_REMINDER_QUEUE_NAME || batch.queue.includes("booking-reminders")) {
      return processBookingReminderBatch(
        batch as MessageBatch<BookingReminderQueueMessage>,
        env,
      );
    }
    if (batch.queue === SOCIAL_PUBLISH_QUEUE_NAME || batch.queue.includes("social-publish")) {
      return processSocialPublishBatch(batch as MessageBatch<SocialPublishQueueMessage>, env);
    }
    return handleAssistantJobQueueBatch(batch as MessageBatch<AssistantJobEventQueueMessage>, env);
  },
};

export { handleAssistantJobQueueBatch };
export default worker;
