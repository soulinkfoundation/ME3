<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { ref, onMounted, onBeforeUnmount, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import {
  useAgentChat,
  type AgentChatMessage,
} from "../composables/useAgentChat";
import { useAuthStore } from "../stores/auth";
import {
  useSitesStore,
  billingUnlocksWorkspaceSurfaces,
  type BillingStatus,
  type OnboardingRequest,
  type OnboardingJobStatus,
  type SiteQuota,
  type WebsiteImportDraft,
} from "../stores/sites";
import { useWizardStore } from "../stores/wizard";
import OnboardingModal from "../components/OnboardingModal.vue";
import OnboardingRobot from "../components/OnboardingRobot.vue";
import AgentMissionControlCard from "../components/dashboard/AgentMissionControlCard.vue";
import HumanCard from "../components/dashboard/HumanCard.vue";
import { useAgentActiveJobsCount } from "../composables/useAgentActiveJobsCount";
import { useUpcomingBookingsThisWeekCount } from "../composables/useUpcomingBookingsThisWeekCount";
import { useInboxDraftCount } from "../composables/useInboxDraftCount";
import Button from "../components/Button.vue";
import Card from "../components/Card.vue";
import TelegramConnectPanel from "../components/TelegramConnectPanel.vue";
import UiIcon from "../components/UiIcon.vue";
import { detectBrowserTimeZone } from "../utils/timezone";
import { HUMAN_LINKS } from "../utils/human-tabs";
import type { BusinessPulseStats } from "../types/analytics";

definePage({
  meta: {
    requiresAuth: true,
    title: "Home | ME3",
    description: "Review your ME3 workspace summary and next actions.",
    robots: "noindex,follow",
  },
});

const ONBOARDING_ROBOT_KEY = "me3_onboarding_robot";
/**
 * Wizard URL after onboarding. Must stay on the same origin as the app:
 * wizard draft state is in localStorage (key me3_wizard_state), which is not
 * shared across example.com vs www.example.com vs other hosts.
 */
function onboardingReviewSiteUrl(): string {
  if (typeof window === "undefined") {
    return "/create";
  }
  return `${window.location.origin}/create`;
}
const COOLDOWNS = [3, 7, 30]; // days

type OnboardingRobotDismissal = { dismissedAt: number; count: number };

function getOnboardingDismissal(): OnboardingRobotDismissal | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_ROBOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as OnboardingRobotDismissal).dismissedAt !== "number" ||
      typeof (parsed as OnboardingRobotDismissal).count !== "number"
    ) {
      return null;
    }
    return parsed as OnboardingRobotDismissal;
  } catch {
    return null;
  }
}

function isOnboardingCoolingDown(): boolean {
  const data = getOnboardingDismissal();
  if (!data) return false;
  const idx = Math.min(data.count - 1, COOLDOWNS.length - 1);
  const cooldownMs = COOLDOWNS[idx] * 86_400_000;
  return Date.now() - data.dismissedAt < cooldownMs;
}

function persistOnboardingDismissal() {
  const prev = getOnboardingDismissal();
  const count = prev ? prev.count + 1 : 1;
  try {
    localStorage.setItem(
      ONBOARDING_ROBOT_KEY,
      JSON.stringify({ dismissedAt: Date.now(), count }),
    );
  } catch {
    /* private mode / quota */
  }
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const agentChat = useAgentChat();
const sites = useSitesStore();
const wizard = useWizardStore();

const billingStatus = ref<BillingStatus | null>(null);
const siteQuota = ref<SiteQuota | null>(null);
const showUpgradeSuccess = ref(false);
const trialActionLoading = ref(false);
const showOnboardingModal = ref(false);
const onboardingError = ref("");
const onboardingSubmitting = ref(false);
const onboardingJobStatus = ref<OnboardingJobStatus | null>(null);
const lastOnboardingChatSnapshot = ref("");
const robotDismissed = ref(isOnboardingCoolingDown());
const onboardingLaunchActive = ref(false);
let onboardingPollTimer: number | null = null;
const atSiteLimit = computed(
  () => !!(siteQuota.value && !siteQuota.value.can_create),
);
const isFreeTier = computed(() => siteQuota.value?.tier === "free");
const isTrialing = computed(
  () =>
    billingStatus.value?.status === "trialing" ||
    billingStatus.value?.trial_active === true,
);
const isPaidTier = computed(() =>
  billingStatus.value?.tier ? billingStatus.value.tier !== "free" : false,
);
const isStarterTier = computed(() => billingStatus.value?.tier === "starter");
const isProTier = computed(() => billingStatus.value?.tier === "pro");
const canImportFromUrl = computed(
  () =>
    billingStatus.value?.capabilities.importFromUrl ??
    siteQuota.value?.capabilities.importFromUrl ??
    false,
);
const tierLabels: Record<BillingStatus["tier"], string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
};
const billingTierLabel = computed(() => {
  const tier = billingStatus.value?.tier ?? "free";
  return tierLabels[tier];
});
const quotaTierLabel = computed(() => {
  const tier = siteQuota.value?.tier ?? "free";
  return tierLabels[tier];
});
const siteLimitLabel = computed(() =>
  siteQuota.value?.limit === 1 ? "site" : "sites",
);
const hasUsedTrial = computed(
  () =>
    !!billingStatus.value?.trial_started_at ||
    !!billingStatus.value?.trial_ends_at,
);
/** Starter+ plus active Pro trial unlock the workspace dashboard (not after trial expiry). */
const showTrialWorkspaceNav = computed(() =>
  billingUnlocksWorkspaceSurfaces(billingStatus.value),
);
const trialExpired = computed(() => {
  const trialEndsAt =
    billingStatus.value?.trial_ends_at ??
    billingStatus.value?.trial_end ??
    null;
  if (!trialEndsAt || isTrialing.value || isPaidTier.value) return false;
  return Date.parse(trialEndsAt) <= Date.now();
});
const onboardingRobotVisible = computed(
  () =>
    !sites.loading &&
    sites.sites.length === 0 &&
    !showOnboardingModal.value &&
    !showClaimModal.value &&
    !trialExpired.value &&
    (!robotDismissed.value || onboardingLaunchActive.value),
);
const onboardingRobotCtaLabel = computed(() =>
  !isTrialing.value && !isPaidTier.value
    ? "Start 7-day free trial"
    : "Create your ME3 site",
);

const showLoadingVeil = computed(
  () => sites.loading && !robotDismissed.value && !onboardingLaunchActive.value,
);

const telegramConnectionStatus = ref<"unknown" | "none" | "pending" | "active">(
  "unknown",
);
const timezoneSyncAttempted = ref(false);

const showSetupChecklist = computed(() => {
  if (!showTrialWorkspaceNav.value) return false;
  return true;
});
const humanLinks = computed(() => {
  const links = [
    HUMAN_LINKS.home,
    HUMAN_LINKS.contacts,
    HUMAN_LINKS.calendar,
    HUMAN_LINKS.content,
    HUMAN_LINKS.email,
    HUMAN_LINKS.accounts,
  ];

  if (billingStatus.value?.tier === "starter") {
    return links.filter(
      (link) =>
        link.to === "/home" ||
        link.to === "/contacts" ||
        link.to === "/calendar",
    );
  }

  return links;
});
const sitesEmptyStateCopy = computed(() => {
  if (trialExpired.value) {
    return "Your trial has ended. Choose a plan to keep bookings, custom domain, and more.";
  }

  if (!isTrialing.value && !isPaidTier.value) {
    return "Turn on your ME3 assistant to schedule jobs that run while you sleep.";
  }

  return "";
});
const sitesEmptyStateActionLabel = computed(() => {
  if (trialExpired.value) return "Choose a plan";

  if (!isTrialing.value && !isPaidTier.value) {
    return trialActionLoading.value
      ? "Starting trial..."
      : "Start 7-day free trial";
  }

  return "Create your ME3 site";
});
const sitesEmptyStateActionDisabled = computed(
  () => !isTrialing.value && !isPaidTier.value && trialActionLoading.value,
);
const showSitesEmptyStateCreateLink = computed(
  () =>
    sites.sites.length === 0 &&
    !isTrialing.value &&
    !isPaidTier.value &&
    !trialActionLoading.value,
);

/** Checklist already lists "Create your ME3 site" with the same action — hide duplicate primary CTA. */
const showSitesEmptyPrimaryButton = computed(
  () =>
    !(
      showSetupChecklist.value &&
      sitesEmptyStateActionLabel.value === "Create your ME3 site"
    ),
);

const profileSite = computed(() =>
  sites.sites.find((site) => (site.site_type || "profile") === "profile"),
);
const hasProfileSite = computed(() => !!profileSite.value);

const sitesBesidesProfile = computed(() => {
  const primary = profileSite.value;
  if (!primary) return [];
  return sites.sites.filter((s) => s.id !== primary.id);
});

function pluralizeSitePulse(
  count: number,
  singular: string,
  plural: string,
): string {
  return count === 1 ? singular : plural;
}

function formatPulseMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

const openingProfileWizard = ref(false);

async function openProfileSiteInWizard() {
  const siteRow = profileSite.value;
  if (!siteRow || openingProfileWizard.value) return;
  openingProfileWizard.value = true;
  try {
    const content = await sites.getSiteContent(siteRow.username);
    if (content?.ok && content.profile) {
      wizard.loadFromSiteContent(
        content.profile,
        content.pages,
        content.posts,
        content.products || [],
        siteRow.username,
        siteRow.published_at || null,
      );
    } else {
      wizard.reset();
      wizard.username = siteRow.username;
      wizard.updateProfile({ handle: siteRow.username });
      wizard.isUsernameAvailable = true;
    }
  } catch {
    wizard.reset();
    wizard.username = siteRow.username;
    wizard.updateProfile({ handle: siteRow.username });
    wizard.isUsernameAvailable = true;
  }
  try {
    await router.push("/create");
  } finally {
    openingProfileWizard.value = false;
  }
}

type SetupTask = {
  key: string;
  label: string;
  done: boolean;
  href?: string;
  action?: () => void;
};

function openTelegramModal() {
  telegramModalKey.value += 1;
  showTelegramModal.value = true;
}

function closeTelegramModal() {
  showTelegramModal.value = false;
  void loadTelegramStatus();
}

const setupTasks = computed<SetupTask[]>(() => [
  profileSite.value
    ? {
        key: "publish",
        label: "Publish your ME3 site",
        done: !!profileSite.value.published_at,
        href: `/sites/${profileSite.value.username}`,
      }
    : {
        key: "start",
        label: "Create your ME3 site",
        done: false,
        action: startTrialAndOpenOnboardingModal,
      },
  {
    key: "telegram",
    label: "Connect Telegram",
    done: telegramConnectionStatus.value === "active",
    action: openTelegramModal,
  },
]);

async function loadTelegramStatus() {
  try {
    const res = await api.get<{ connection: { status: string } | null }>(
      "/telegram/status",
    );
    if (res.connection?.status === "active") {
      telegramConnectionStatus.value = "active";
    } else if (res.connection) {
      telegramConnectionStatus.value = "pending";
    } else {
      telegramConnectionStatus.value = "none";
    }
  } catch {
    telegramConnectionStatus.value = "none";
  }
}

async function syncMissingTimezone() {
  if (timezoneSyncAttempted.value || auth.user?.timezone) return;
  timezoneSyncAttempted.value = true;

  const detected = detectBrowserTimeZone();
  if (!detected || !auth.user) return;

  try {
    const response = await api.put<{
      user: {
        id: string;
        email: string;
        timezone: string | null;
        locale: string;
        localeSource: "explicit" | "inferred";
      };
    }>("/account", {
      timezone: detected,
    });
    auth.setSession(response.user);
  } catch {
    // Best-effort only. The account page still lets the user set it manually.
  }
}

const showClaimModal = ref(false);
const showTelegramModal = ref(false);
const telegramModalKey = ref(0);
const newUsername = ref("");
const claimError = ref("");
const claimLoading = ref(false);
const claimedUsername = ref<string | null>(null);
const claimStage = ref<"claim" | "import" | "done">("claim");
const websiteUrl = ref("");
const websiteImportError = ref("");
const websiteImportLoading = ref(false);
const backFromImportLoading = ref(false);

async function loadBillingStatus() {
  billingStatus.value = await sites.getBillingStatus();
}

async function loadSiteQuota() {
  siteQuota.value = await sites.getSiteQuota();
}

type DashboardReminder = {
  id: string;
  title: string;
  remindAt: string;
  recurrenceRule: string | null;
  contextLabel: string | null;
  status: "pending" | "delivered" | "dismissed" | "cancelled" | "failed";
};

const dashboardReminders = ref<DashboardReminder[]>([]);
const remindersLoading = ref(false);
const agentSitePulse = ref<BusinessPulseStats | null>(null);
const agentSitePulseLoading = ref(false);
const agentSitePulseError = ref("");

const {
  draftCount: inboxDraftCount,
  loadingDraftCount: inboxDraftLoading,
  loadInboxDraftCount,
} = useInboxDraftCount();
const { activeJobsCount, loadingActiveJobsCount, loadAgentActiveJobsCount } =
  useAgentActiveJobsCount();
const {
  upcomingBookingsCount,
  loadingUpcomingBookings,
  upcomingBookingsError,
  loadUpcomingBookingsThisWeekCount,
} = useUpcomingBookingsThisWeekCount();

const showWorkspaceDashboard = computed(() => showTrialWorkspaceNav.value);
const homeIncomeLabel = computed(() => {
  if (
    !agentSitePulse.value ||
    agentSitePulse.value.incomeCents == null ||
    !agentSitePulse.value.incomeCurrency
  ) {
    return "no income";
  }

  return `${formatPulseMoney(
    agentSitePulse.value.incomeCents,
    agentSitePulse.value.incomeCurrency,
  )} in income`;
});
const homeNeedsAttentionCount = computed(() => {
  const reminders = remindersLoading.value
    ? 0
    : dashboardReminders.value.length;
  const drafts =
    inboxDraftLoading.value || inboxDraftCount.value === null
      ? 0
      : inboxDraftCount.value;
  return reminders + drafts;
});

async function loadRemindersSummary() {
  remindersLoading.value = true;
  try {
    const response = await api.get<{ reminders: DashboardReminder[] }>(
      "/agent/reminders?status=pending&limit=5",
    );
    dashboardReminders.value = response.reminders || [];
  } catch {
    dashboardReminders.value = [];
  } finally {
    remindersLoading.value = false;
  }
}

async function loadAgentSitePulse(username: string | null) {
  if (!username) {
    agentSitePulse.value = null;
    agentSitePulseError.value = "";
    return;
  }

  agentSitePulseLoading.value = true;
  agentSitePulseError.value = "";

  try {
    const response = await api.get<{
      ok: boolean;
      pulse: BusinessPulseStats | null;
    }>(`/sites/${username}/analytics/pulse?period=7d`);
    agentSitePulse.value = response.pulse;
  } catch (err) {
    agentSitePulse.value = null;
    agentSitePulseError.value =
      err instanceof Error ? err.message : "Failed to load ME3 site pulse";
  } finally {
    agentSitePulseLoading.value = false;
  }
}

function startUpgrade() {
  router.push("/pricing");
}

function suggestUsernameFromEmail(): string {
  const emailLocal =
    auth.user?.email?.split("@")[0]?.trim().toLowerCase() || "";
  const normalized = emailLocal
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .slice(0, 30);

  if (normalized.length >= 3) return normalized;
  return "";
}

function stopOnboardingPolling() {
  if (onboardingPollTimer !== null) {
    window.clearTimeout(onboardingPollTimer);
    onboardingPollTimer = null;
  }
}

function resetOnboardingState() {
  onboardingError.value = "";
  onboardingSubmitting.value = false;
  onboardingJobStatus.value = null;
  lastOnboardingChatSnapshot.value = "";
}

function openOnboardingModal() {
  resetOnboardingState();
  showOnboardingModal.value = true;
}

function closeOnboardingModal() {
  showOnboardingModal.value = false;
}

async function pollOnboardingStatus(jobId: string) {
  const status = await sites.getOnboardingStatus(jobId);
  if (!status) {
    onboardingError.value =
      sites.error || "Failed to refresh onboarding status";
    onboardingPollTimer = window.setTimeout(
      () => void pollOnboardingStatus(jobId),
      1500,
    );
    return;
  }

  const previousStatus = onboardingJobStatus.value;
  onboardingJobStatus.value = status;
  syncOnboardingChat(status, previousStatus);

  if (status.status === "completed") {
    stopOnboardingPolling();
    await Promise.all([
      sites.fetchSites(),
      loadBillingStatus(),
      loadSiteQuota(),
      loadRemindersSummary(),
    ]);
    const onboarded = status.siteUsername?.trim();
    if (onboarded) {
      try {
        const content = await sites.getSiteContent(onboarded);
        const siteRow = sites.sites.find((s) => s.username === onboarded);
        if (content?.ok && content.profile) {
          wizard.loadFromSiteContent(
            content.profile,
            content.pages,
            content.posts,
            content.products || [],
            onboarded,
            siteRow?.published_at || null,
            null,
          );
        } else {
          wizard.reset();
          wizard.username = onboarded;
          wizard.updateProfile({ handle: onboarded });
          wizard.isUsernameAvailable = true;
        }
      } catch (err) {
        console.warn("Could not hydrate wizard after onboarding:", err);
        wizard.reset();
        wizard.username = onboarded;
        wizard.updateProfile({ handle: onboarded });
        wizard.isUsernameAvailable = true;
      }
    }
    return;
  }

  if (status.status === "failed") {
    stopOnboardingPolling();
    onboardingError.value = status.errorMessage || "Onboarding failed";
    return;
  }

  onboardingPollTimer = window.setTimeout(
    () => void pollOnboardingStatus(jobId),
    1200,
  );
}

function openOnboardingChat(job: OnboardingJobStatus) {
  const username = job.siteUsername || "your site";
  agentChat.replaceMessages([
    {
      id: "onboarding-intro",
      role: "assistant",
      text: `I’m setting up ${username}.example.com now. I’ll keep you posted here while I publish the site, mailbox, and default jobs.`,
      meta: "assistant onboarding",
    },
  ]);
  agentChat.openChat();
  syncOnboardingChat(job, null, 520);
}

function syncOnboardingChat(
  status: OnboardingJobStatus,
  previousStatus: OnboardingJobStatus | null = onboardingJobStatus.value,
  initialStaggerMs = 0,
) {
  const snapshot = JSON.stringify({
    status: status.status,
    errorMessage: status.errorMessage,
    steps: status.steps.map((step) => ({
      name: step.name,
      status: step.status,
      message: step.message,
    })),
  });
  if (snapshot === lastOnboardingChatSnapshot.value) return;

  const previousMap = new Map(
    (previousStatus?.steps || []).map((step) => [
      step.name,
      { status: step.status, message: step.message },
    ]),
  );

  let delay = initialStaggerMs;
  const STEP_DELAY = 580;

  const queue = (msg: AgentChatMessage) => {
    if (delay > 0) {
      window.setTimeout(() => agentChat.appendMessage(msg), delay);
    } else {
      agentChat.appendMessage(msg);
    }
    delay += STEP_DELAY;
  };

  for (const step of status.steps) {
    const prior = previousMap.get(step.name);
    if (
      prior &&
      prior.status === step.status &&
      prior.message === step.message
    ) {
      continue;
    }

    if (step.status === "running") {
      queue({
        id: `onboarding-${step.name}-running`,
        role: "assistant",
        text: `${step.name}...`,
        detail: step.message,
        meta: "in progress",
      });
    } else if (step.status === "completed") {
      queue({
        id: `onboarding-${step.name}-completed`,
        role: "assistant",
        text: `${step.name} complete.`,
        detail: step.message,
        meta: "done",
      });
    } else if (step.status === "failed") {
      queue({
        id: `onboarding-${step.name}-failed`,
        role: "assistant",
        text: `I hit a problem during ${step.name.toLowerCase()}.`,
        detail: step.message,
        meta: "action needed",
      });
    }
  }

  if (status.status === "completed") {
    queue({
      id: "onboarding-finished",
      role: "assistant",
      text: "Your first ME3 site is live.",
      detail: status.result?.url || null,
      meta: "ready",
      actionHref: status.result?.url ? onboardingReviewSiteUrl() : null,
      actionLabel: status.result?.url ? "Review your site" : null,
    });
    window.setTimeout(() => agentChat.openChat(), delay);
  } else if (status.status === "failed" && status.errorMessage) {
    queue({
      id: "onboarding-error",
      role: "assistant",
      text: "I couldn’t finish the setup.",
      detail: status.errorMessage,
      meta: "setup failed",
    });
    window.setTimeout(() => agentChat.openChat(), delay);
  }

  lastOnboardingChatSnapshot.value = snapshot;
}

async function submitOnboarding(payload: OnboardingRequest) {
  onboardingSubmitting.value = true;
  onboardingError.value = "";
  const job = await sites.startOnboarding({
    ...payload,
    timezone: detectBrowserTimeZone(),
  });

  onboardingSubmitting.value = false;

  if (!job) {
    onboardingError.value = sites.error || "Failed to start onboarding";
    return;
  }

  onboardingJobStatus.value = job;
  showOnboardingModal.value = false;
  robotDismissed.value = true;
  persistOnboardingDismissal();
  openOnboardingChat(job);
  await pollOnboardingStatus(job.jobId);
}

function dismissOnboardingRobot() {
  robotDismissed.value = true;
  persistOnboardingDismissal();
}

async function handleOnboardingLaunchComplete() {
  onboardingLaunchActive.value = false;
  agentChat.showLauncher();
  const job = onboardingJobStatus.value;
  if (!job) return;
  openOnboardingChat(job);
  await pollOnboardingStatus(job.jobId);
}

watch(
  () => profileSite.value?.username || null,
  (username) => {
    void loadAgentSitePulse(username);
  },
  { immediate: true },
);

onMounted(async () => {
  if (route.query.upgraded === "true") {
    showUpgradeSuccess.value = true;
    router.replace("/home");
  }

  await Promise.all([
    sites.fetchSites(),
    loadBillingStatus(),
    loadSiteQuota(),
    loadTelegramStatus(),
    loadRemindersSummary(),
    loadInboxDraftCount(),
    loadAgentActiveJobsCount(),
    loadUpcomingBookingsThisWeekCount(),
  ]);
  await syncMissingTimezone();
});

onBeforeUnmount(() => {
  stopOnboardingPolling();
  agentChat.showLauncher();
});

async function claimUsername() {
  if (!newUsername.value || claimLoading.value) return;

  claimLoading.value = true;
  claimError.value = "";

  const site = await sites.claimUsername(newUsername.value);

  if (site) {
    claimedUsername.value = site.username;
    claimStage.value = canImportFromUrl.value ? "import" : "done";
    websiteUrl.value = "";
    websiteImportError.value = "";
    // Reload quota after creating a site
    await loadSiteQuota();
  } else {
    claimError.value = sites.error || "Failed to claim username";
  }

  claimLoading.value = false;
}

function goToWizard() {
  if (!claimedUsername.value) return;
  wizard.reset();
  wizard.username = claimedUsername.value;
  wizard.updateProfile({ handle: claimedUsername.value });
  wizard.isUsernameAvailable = true;
  closeClaimModal();
  router.push("/create");
}

async function importWebsite() {
  if (!claimedUsername.value || websiteImportLoading.value) return;

  const trimmedUrl = websiteUrl.value.trim();
  if (!trimmedUrl) {
    websiteImportError.value = "Website URL is required";
    return;
  }

  websiteImportLoading.value = true;
  websiteImportError.value = "";

  const imported: WebsiteImportDraft | null = await sites.importWebsite(
    claimedUsername.value,
    trimmedUrl,
  );

  if (imported) {
    wizard.loadFromSiteContent(
      imported.profile,
      imported.pages,
      imported.posts,
      imported.products,
      claimedUsername.value,
      null,
      imported.sourceUrl,
    );
    wizard.updateProfile({ handle: claimedUsername.value });
    wizard.goToStep(wizard.totalSteps);
    closeClaimModal();
    router.push("/create");
  } else {
    websiteImportError.value = sites.error || "Failed to import website";
  }

  websiteImportLoading.value = false;
}

async function backFromImportStep() {
  if (
    !claimedUsername.value ||
    backFromImportLoading.value ||
    websiteImportLoading.value
  ) {
    return;
  }

  websiteImportError.value = "";
  backFromImportLoading.value = true;

  const username = claimedUsername.value;
  const ok = await sites.deleteSite(username);

  if (ok) {
    newUsername.value = username;
    claimedUsername.value = null;
    claimStage.value = "claim";
    websiteUrl.value = "";
    await loadSiteQuota();
  } else {
    websiteImportError.value = sites.error || "Could not go back. Try again.";
  }

  backFromImportLoading.value = false;
}

function closeClaimModal() {
  showClaimModal.value = false;
  claimedUsername.value = null;
  newUsername.value = "";
  claimError.value = "";
  claimStage.value = "claim";
  websiteUrl.value = "";
  websiteImportError.value = "";
  websiteImportLoading.value = false;
  backFromImportLoading.value = false;
}

function openClaimModal() {
  // If at limit and on free tier, start upgrade instead
  if (atSiteLimit.value && isFreeTier.value) {
    startUpgrade();
    return;
  }

  showClaimModal.value = true;
  newUsername.value = suggestUsernameFromEmail();
  claimError.value = "";
  claimedUsername.value = null;
  claimStage.value = "claim";
  websiteUrl.value = "";
  websiteImportError.value = "";
  websiteImportLoading.value = false;
  backFromImportLoading.value = false;
}

function createLandingPage() {
  if (!isProTier.value) {
    startUpgrade();
    return;
  }

  if (atSiteLimit.value && isFreeTier.value) {
    startUpgrade();
    return;
  }

  if (atSiteLimit.value && !isFreeTier.value) {
    return;
  }

  router.push("/pages/new");
}

async function startTrialAndOpenOnboardingModal() {
  if (trialActionLoading.value) return;

  if (isTrialing.value || isPaidTier.value) {
    openOnboardingModal();
    return;
  }

  if (trialExpired.value || hasUsedTrial.value) {
    startUpgrade();
    return;
  }

  trialActionLoading.value = true;
  try {
    const updated = await sites.startTrial();
    if (updated) {
      billingStatus.value = updated;
      openOnboardingModal();
    }
  } finally {
    trialActionLoading.value = false;
  }
}
</script>

<template>
  <div class="dashboard">
    <Transition name="load-veil">
      <div v-if="showLoadingVeil" class="dashboard-load-veil" />
    </Transition>

    <OnboardingRobot
      :visible="onboardingRobotVisible"
      :launching="onboardingLaunchActive"
      :loading="trialActionLoading"
      :trial-expired="trialExpired"
      :cta-label="onboardingRobotCtaLabel"
      @start="startTrialAndOpenOnboardingModal"
      @skip="dismissOnboardingRobot"
      @launch-complete="handleOnboardingLaunchComplete"
      @upgrade="startUpgrade"
    />

    <main class="main">
      <div v-if="showUpgradeSuccess" class="banner success">
        <span>You're now on {{ billingTierLabel }}.</span>
        <button
          class="banner-close"
          type="button"
          @click="showUpgradeSuccess = false"
        >
          ×
        </button>
      </div>

      <div v-if="atSiteLimit && isFreeTier" class="banner info">
        <span>
          You've reached the free limit of {{ siteQuota?.limit }}
          {{ siteLimitLabel }}.
          <button class="banner-link" @click="startUpgrade">View plans</button>
          for 1 ME3 site plus up to 3 landing pages.
        </span>
      </div>

      <div v-if="atSiteLimit && !isFreeTier" class="banner warning">
        <span>
          You've reached your limit of {{ siteQuota?.limit }} sites on
          {{ quotaTierLabel }}. Delete a site to create a new one.
        </span>
      </div>

      <div v-if="trialExpired" class="banner warning">
        <span>
          Your 7-day trial has ended.
          <button class="banner-link" @click="startUpgrade">
            Choose a plan
          </button>
          to keep your site running.
        </span>
      </div>

      <div
        v-if="showWorkspaceDashboard && hasProfileSite"
        class="home-workspace"
      >
        <div class="home-panel">
          <Card>
            <div class="card__head home-card-head">
              <h1 class="card__title home-title">Here's your daily summary:</h1>
            </div>

            <div class="card__body home-summary">
              <ul class="setup-checklist-list">
                <li
                  v-for="task in setupTasks"
                  :key="task.key"
                  class="setup-checklist-item"
                  :class="{ done: task.done }"
                >
                  <span class="setup-check" aria-hidden="true">{{
                    task.done ? "✓" : ""
                  }}</span>
                  <router-link
                    v-if="task.href && !task.done"
                    :to="task.href"
                    class="setup-checklist-link"
                  >
                    {{ task.label }}
                  </router-link>
                  <button
                    v-else-if="task.action && !task.done"
                    type="button"
                    class="setup-checklist-action"
                    @click="task.action()"
                  >
                    {{ task.label }}
                  </button>
                  <span v-else>{{ task.label }}</span>
                </li>
              </ul>

              <ul class="home-bullets">
                <li>
                  <template v-if="loadingUpcomingBookings">
                    Checking this week's bookings...
                  </template>
                  <template
                    v-else-if="
                      upcomingBookingsError || upcomingBookingsCount === null
                    "
                  >
                    Bookings summary is unavailable right now.
                  </template>
                  <template v-else-if="upcomingBookingsCount === 0">
                    You have <strong>no upcoming bookings</strong> this week.
                  </template>
                  <template v-else>
                    You have
                    <router-link
                      to="/calendar"
                      class="setup-checklist-link home-summary-inline-link"
                    >
                      {{ upcomingBookingsCount }} upcoming
                      {{
                        pluralizeSitePulse(
                          upcomingBookingsCount,
                          "booking",
                          "bookings",
                        )
                      }}
                    </router-link>
                    this week.
                  </template>
                </li>

                <li>
                  <template v-if="agentSitePulseLoading">
                    Loading your subscriber and income summary...
                  </template>
                  <template v-else-if="agentSitePulseError">
                    Subscriber and income summary is unavailable right now.
                  </template>
                  <template v-else-if="agentSitePulse && profileSite">
                    You received
                    <router-link
                      :to="`/sites/${profileSite.username}`"
                      class="setup-checklist-link home-summary-inline-link"
                    >
                      {{ agentSitePulse.newSubscribers }} newsletter
                      {{
                        pluralizeSitePulse(
                          agentSitePulse.newSubscribers,
                          "subscriber",
                          "subscribers",
                        )
                      }}
                    </router-link>
                    and recorded
                    <router-link
                      to="/accounts"
                      class="setup-checklist-link home-summary-inline-link"
                    >
                      {{ homeIncomeLabel }}
                    </router-link>
                    in the last 7 days.
                  </template>
                  <template v-else>
                    Subscriber and income summary will appear once your site has
                    activity.
                  </template>
                </li>

                <li>
                  <template v-if="loadingActiveJobsCount">
                    Checking active ME3 jobs...
                  </template>
                  <template v-else-if="activeJobsCount === null">
                    Active ME3 jobs are unavailable right now.
                  </template>
                  <template v-else>
                    ME3 has
                    <router-link
                      to="/assistant"
                      class="setup-checklist-link home-summary-inline-link"
                    >
                      {{ activeJobsCount }} active
                      {{ pluralizeSitePulse(activeJobsCount, "job", "jobs") }}
                    </router-link>
                    running.
                  </template>
                </li>

                <li>
                  <template v-if="remindersLoading || inboxDraftLoading">
                    Checking reminders and inbox drafts...
                  </template>
                  <template v-else-if="homeNeedsAttentionCount > 0">
                    <strong>
                      {{ homeNeedsAttentionCount }}
                      {{
                        pluralizeSitePulse(
                          homeNeedsAttentionCount,
                          "item",
                          "items",
                        )
                      }}
                    </strong>
                    need attention across reminders and inbox drafts.
                  </template>
                  <template v-else>
                    No reminders or inbox drafts need attention.
                  </template>
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>

      <div v-else class="dashboard-content-grid">
        <div
          class="dashboard-row dashboard-row--primary"
          :class="{
            'dashboard-row--sites-only':
              !showWorkspaceDashboard || !hasProfileSite,
          }"
        >
          <div class="dashboard-panel">
            <Card>
              <div class="card__head">
                <h3 class="card__title">Sites</h3>
              </div>

              <div class="card__body sites-card-body">
                <div
                  v-if="showSetupChecklist"
                  class="sites-card-checklist"
                  aria-labelledby="sites-checklist-heading"
                >
                  <!-- <h4
                    id="sites-checklist-heading"
                    class="sites-card-checklist-title"
                  >
                    Checklist
                  </h4> -->
                  <ul class="setup-checklist-list">
                    <li
                      v-for="task in setupTasks"
                      :key="task.key"
                      class="setup-checklist-item"
                      :class="{ done: task.done }"
                    >
                      <span class="setup-check" aria-hidden="true">{{
                        task.done ? "✓" : ""
                      }}</span>
                      <router-link
                        v-if="task.href && !task.done"
                        :to="task.href"
                        class="setup-checklist-link"
                      >
                        {{ task.label }}
                      </router-link>
                      <button
                        v-else-if="task.action && !task.done"
                        type="button"
                        class="setup-checklist-action"
                        @click="task.action()"
                      >
                        {{ task.label }}
                      </button>
                      <span v-else>{{ task.label }}</span>
                    </li>
                  </ul>
                </div>
                <div class="sites-card-content">
                  <div
                    v-if="sites.loading && sites.sites.length === 0"
                    class="loading"
                  >
                    Loading...
                  </div>

                  <div
                    v-else-if="
                      sites.sites.length === 0 &&
                      (sitesEmptyStateCopy ||
                        showSitesEmptyPrimaryButton ||
                        showSitesEmptyStateCreateLink)
                    "
                    class="empty"
                  >
                    <p v-if="sitesEmptyStateCopy" class="empty-trial-copy">
                      {{ sitesEmptyStateCopy }}
                    </p>
                    <button
                      v-if="showSitesEmptyPrimaryButton"
                      class="button"
                      type="button"
                      :disabled="sitesEmptyStateActionDisabled"
                      @click="
                        trialExpired
                          ? startUpgrade()
                          : startTrialAndOpenOnboardingModal()
                      "
                    >
                      {{ sitesEmptyStateActionLabel }}
                    </button>
                    <div
                      v-if="showSitesEmptyStateCreateLink"
                      class="sites-empty-secondary"
                    >
                      <div class="sites-empty-divider" aria-hidden="true">
                        <span>or</span>
                      </div>
                      <button
                        class="button-link sites-empty-create-link"
                        type="button"
                        @click="openClaimModal()"
                      >
                        Create ME3 site
                      </button>
                    </div>
                  </div>

                  <div v-else-if="profileSite" class="sites-pulse-block">
                    <p v-if="agentSitePulseLoading" class="sites-pulse-summary">
                      Loading your site summary…
                    </p>
                    <p
                      v-else-if="agentSitePulseError"
                      class="sites-pulse-summary sites-pulse-summary--muted"
                    >
                      Couldn’t load stats for
                      {{ profileSite.username }}.example.com.
                      <button
                        type="button"
                        class="site-inline-link"
                        :disabled="openingProfileWizard"
                        @click="openProfileSiteInWizard"
                      >
                        {{
                          openingProfileWizard ? "Opening…" : "Edit here"
                        }}</button
                      >.
                    </p>
                    <p v-else class="sites-pulse-summary">
                      Your site:
                      <strong
                        ><router-link
                          :to="`/sites/${profileSite.username}`"
                          class="site-inline-link"
                          >{{ profileSite.username }}.example.com</router-link
                        ></strong
                      >
                      is
                      {{
                        profileSite.published_at
                          ? "published"
                          : "not published"
                      }}. It received ✉️
                      <strong v-if="agentSitePulse">
                        {{ agentSitePulse.newSubscribers }}
                        newsletter
                        {{
                          pluralizeSitePulse(
                            agentSitePulse.newSubscribers,
                            "subscriber",
                            "subscribers",
                          )
                        }}
                      </strong>
                      <strong v-else>— newsletter subscribers</strong>
                      and recorded 💰
                      <strong>
                        <template
                          v-if="
                            agentSitePulse &&
                            agentSitePulse.incomeCents != null &&
                            agentSitePulse.incomeCurrency
                          "
                        >
                          {{
                            formatPulseMoney(
                              agentSitePulse.incomeCents,
                              agentSitePulse.incomeCurrency,
                            )
                          }}
                          in income
                        </template>
                        <template v-else>no income</template>
                      </strong>
                      in the last 7 days. <br />
                      <strong
                        ><button
                          type="button"
                          class="site-inline-link"
                          :disabled="openingProfileWizard"
                          @click="openProfileSiteInWizard"
                        >
                          {{ openingProfileWizard ? "Opening…" : "Edit here" }}
                        </button></strong
                      >.
                    </p>
                    <div
                      v-if="sitesBesidesProfile.length"
                      class="sites-grid sites-grid--extra"
                    >
                      <router-link
                        v-for="site in sitesBesidesProfile"
                        :key="site.id"
                        :to="`/sites/${site.username}`"
                        class="site-card"
                      >
                        <span class="site-name"
                          >{{ site.username }}.example.com</span
                        >
                        <span class="site-meta">
                          <span class="site-tag site-tag--type">
                            {{
                              (site.site_type || "profile") === "landing_page"
                                ? "Landing page"
                                : "ME3 site"
                            }}
                          </span>
                          <span
                            v-if="site.published_at"
                            class="site-tag site-tag--published"
                            >Published</span
                          >
                          <span v-else class="site-tag site-tag--draft"
                            >Not published</span
                          >
                        </span>
                      </router-link>
                    </div>
                  </div>
                  <div v-else class="sites-grid">
                    <router-link
                      v-for="site in sites.sites"
                      :key="site.id"
                      :to="`/sites/${site.username}`"
                      class="site-card"
                    >
                      <span class="site-name">{{ site.username }}.example.com</span>
                      <span class="site-meta">
                        <span class="site-tag site-tag--type">
                          {{
                            (site.site_type || "profile") === "landing_page"
                              ? "Landing page"
                              : "ME3 site"
                          }}
                        </span>
                        <span
                          v-if="site.published_at"
                          class="site-tag site-tag--published"
                          >Published</span
                        >
                        <span v-else class="site-tag site-tag--draft"
                          >Not published</span
                        >
                      </span>
                    </router-link>
                  </div>
                </div>
              </div>

              <div
                v-if="sites.sites.length > 0"
                class="card__foot sites-card-foot"
              >
                <button
                  class="button sites-new-site-btn"
                  type="button"
                  @click="
                    hasProfileSite && isProTier
                      ? createLandingPage()
                      : hasProfileSite && isStarterTier
                        ? startUpgrade()
                        : openClaimModal()
                  "
                  :disabled="atSiteLimit && !isFreeTier && !isStarterTier"
                  :title="
                    atSiteLimit && !isFreeTier && !isStarterTier
                      ? 'Site limit reached. Delete a site to create a new one.'
                      : ''
                  "
                >
                  {{
                    atSiteLimit && isFreeTier
                      ? "+ Upgrade for landing pages"
                      : hasProfileSite && isStarterTier
                        ? "+ Upgrade to Pro for landing pages"
                        : hasProfileSite && isProTier
                          ? "+ New landing page"
                          : "+ Create ME3 site"
                  }}
                </button>
              </div>
            </Card>
          </div>
          <div
            v-if="showWorkspaceDashboard && hasProfileSite"
            class="dashboard-panel"
          >
            <HumanCard
              :links="humanLinks"
              :calendar-reminder-count="dashboardReminders.length"
              :reminders-loading="remindersLoading"
              :inbox-draft-count="inboxDraftCount"
              :inbox-draft-loading="inboxDraftLoading"
            />
          </div>

          <div
            v-if="showWorkspaceDashboard && isProTier && hasProfileSite"
            class="dashboard-panel"
          >
            <AgentMissionControlCard
              :pulse="agentSitePulse"
              :pulse-loading="agentSitePulseLoading"
              :pulse-error="agentSitePulseError"
            />
          </div>
        </div>
      </div>
    </main>

    <OnboardingModal
      :open="showOnboardingModal"
      :default-username="suggestUsernameFromEmail()"
      :can-import-from-url="canImportFromUrl"
      :submitting="onboardingSubmitting"
      :error="onboardingError"
      @close="closeOnboardingModal"
      @submit="submitOnboarding"
    />

    <div
      v-if="showTelegramModal"
      class="modal-overlay"
      @click.self="closeTelegramModal"
    >
      <div class="modal modal--telegram-connect">
        <div class="modal-header modal-header--telegram">
          <h2>Connect Telegram</h2>
          <Button
            variant="secondary"
            size="small"
            type="button"
            class="modal-telegram-close"
            title="Close"
            aria-label="Close"
            @click="closeTelegramModal"
          >
            <template #icon>
              <UiIcon name="X" :size="18" aria-hidden="true" />
            </template>
          </Button>
        </div>
        <TelegramConnectPanel
          :key="telegramModalKey"
          variant="compact"
          :auto-prepare-when-not-connected="true"
        />
      </div>
    </div>

    <!-- Claim Username Modal -->
    <div
      v-if="showClaimModal"
      class="modal-overlay"
      @click.self="closeClaimModal"
    >
      <div class="modal">
        <!-- Success state: show choice -->
        <template v-if="claimedUsername && claimStage === 'done'">
          <div class="success-icon">✓</div>
          <h2>{{ claimedUsername }}.example.com is yours!</h2>

          <div class="choice-actions">
            <button class="button choice-primary" @click="goToWizard">
              Create with wizard →
            </button>
          </div>
        </template>

        <!-- Claim step -->
        <template v-else-if="claimStage === 'claim'">
          <h2>Claim a username</h2>
          <p class="modal-subtitle">
            This will be your site's URL:
            <strong>{{ newUsername || "username" }}.example.com</strong>
          </p>

          <form @submit.prevent="claimUsername" class="modal-form">
            <input
              v-model="newUsername"
              type="text"
              placeholder="username"
              class="input"
              pattern="[a-z0-9][a-z0-9_-]*[a-z0-9]"
              minlength="3"
              maxlength="30"
              required
              autofocus
            />
            <p class="input-hint">
              3-30 characters. Letters, numbers, underscores, and hyphens only.
            </p>

            <p v-if="claimError" class="error">{{ claimError }}</p>

            <div class="modal-actions">
              <button
                type="button"
                class="button secondary"
                @click="closeClaimModal"
              >
                Cancel
              </button>
              <button type="submit" class="button" :disabled="claimLoading">
                {{ claimLoading ? "Next..." : "Next" }}
              </button>
            </div>
          </form>
        </template>

        <!-- Import step -->
        <template v-else-if="claimedUsername && claimStage === 'import'">
          <div class="modal-step">
            <h2>Import your website</h2>
            <p class="modal-subtitle">Kickstart ME3 with an existing site.</p>

            <p v-if="!canImportFromUrl" class="input-hint">
              Website URL import is not available on your current plan yet. You
              can still continue without importing.
            </p>

            <form @submit.prevent="importWebsite" class="modal-form">
              <input
                v-model="websiteUrl"
                type="url"
                placeholder="https://yourwebsite.com"
                class="input"
                autocomplete="url"
                required
                autofocus
              />

              <p v-if="websiteImportError" class="error">
                {{ websiteImportError }}
              </p>

              <div class="modal-actions modal-actions--import-row">
                <button
                  type="button"
                  class="button secondary"
                  @click="backFromImportStep"
                  :disabled="websiteImportLoading || backFromImportLoading"
                >
                  {{ backFromImportLoading ? "Back..." : "Back" }}
                </button>
                <button
                  type="submit"
                  class="button"
                  :disabled="
                    websiteImportLoading ||
                    backFromImportLoading ||
                    !canImportFromUrl
                  "
                >
                  {{ websiteImportLoading ? "Importing..." : "Import" }}
                </button>
                <button
                  type="button"
                  class="modal-skip-plain"
                  @click="goToWizard"
                  :disabled="websiteImportLoading || backFromImportLoading"
                >
                  Skip
                </button>
              </div>
            </form>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  min-height: 100vh;
}

.main {
  margin: 0 auto;
  padding: 20px 40px;
}

.home-workspace {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.home-panel {
  width: min(100%, 680px);
}

.home-panel :deep(.card) {
  gap: 18px;
}

.home-title {
  font-size: 1.35rem;
}

.home-summary {
  gap: 14px;
}

.home-bullets {
  margin: 0;
  padding-left: 1.25em;
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.65;
}

.home-bullets li {
  margin: 0.35em 0;
}

.home-bullets li::marker {
  color: var(--color-text-muted);
}

.home-summary-inline-link {
  font-weight: 700;
}

.dashboard-content-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr;
  align-items: stretch;
}

.dashboard-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  align-items: stretch;
}

.dashboard-panel {
  min-width: 0;
}

@media (min-width: 960px) {
  .dashboard-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dashboard-row--sites-only {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
  }

  .dashboard-row--sites-only .dashboard-panel {
    width: 30%;
  }
}

@media (max-width: 640px) {
  .main {
    padding: 16px;
  }

  .home-workspace {
    padding-top: 24px;
  }
}

.dashboard-panel :deep(.card) {
  height: 100%;
}

.banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  margin-bottom: 18px;
  font-size: 14px;
  font-weight: 600;
}

.banner.success {
  background: rgba(76, 175, 80, 0.12);
  border: 1px solid rgba(76, 175, 80, 0.25);
  color: #2e7d32;
}

.banner.info {
  background: rgba(33, 150, 243, 0.12);
  border: 1px solid rgba(33, 150, 243, 0.25);
  color: #1565c0;
}

.banner.warning {
  background: rgba(255, 152, 0, 0.12);
  border: 1px solid rgba(255, 152, 0, 0.25);
  color: #e65100;
}

.banner-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
  padding: 0 6px;
  line-height: 1;
  opacity: 0.85;
}

.banner-close:hover {
  opacity: 1;
}

.banner-link {
  background: none;
  border: none;
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.banner-link:hover {
  opacity: 0.85;
}

.sites-card-checklist {
  padding-bottom: 14px;
  flex-shrink: 0;
}

.sites-card-checklist-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

.setup-checklist-list {
  list-style: none;
  margin: 0;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setup-checklist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
}

.setup-checklist-item.done {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.setup-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.setup-checklist-item.done .setup-check {
  border-color: #4caf50;
  color: #4caf50;
}

.setup-checklist-link {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.setup-checklist-action {
  border: none;
  background: none;
  padding: 0;
  color: var(--color-text);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.setup-checklist-action:hover,
.setup-checklist-link:hover {
  opacity: 0.8;
}

.sites-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sites-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.sites-card-foot {
  width: 100%;
  margin-top: auto;
}

.sites-new-site-btn {
  width: 100%;
  box-sizing: border-box;
}

.button {
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.button:hover:not(:disabled) {
  opacity: 0.9;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button.secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.loading,
.empty {
  text-align: center;
  color: var(--color-text-muted);
}

.empty .button {
  margin-top: 16px;
}

.empty-trial-copy {
  max-width: 520px;
  margin: 12px auto 0;
}

.sites-empty-secondary {
  margin-top: 16px;
}

.sites-empty-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 auto 8px;
  width: min(320px, 100%);
  color: var(--color-text-muted);
  font-size: 12px;
  text-transform: lowercase;
}

.sites-empty-divider::before,
.sites-empty-divider::after {
  content: "";
  flex: 1;
  border-top: 1px solid var(--color-border);
}

.sites-empty-create-link {
  color: var(--color-text);
}

.sites-pulse-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sites-pulse-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
}

.sites-pulse-summary--muted {
  color: var(--color-text-muted);
}

.site-inline-link {
  color: inherit;
  font-weight: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

button.site-inline-link {
  display: inline;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  text-align: inherit;
}

button.site-inline-link:disabled {
  cursor: wait;
  opacity: 0.7;
}

.site-inline-link:hover:not(:disabled) {
  opacity: 0.75;
}

.sites-grid--extra {
  margin-top: 4px;
}

.sites-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr;
}

.site-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.site-card:hover {
  background: var(--color-bg-subtle);
  border-color: var(--color-text);
}

.site-name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.site-meta {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.site-tag {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.site-tag--published {
  color: #0d5c27;
}

.site-tag--draft {
  color: var(--color-text-muted);
}

.site-tag--type {
  color: var(--color-text);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}

.modal {
  background: var(--color-bg);
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 460px;
  border: 1px solid var(--color-border);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.16);
}

.onboarding-modal {
  max-width: 560px;
}

.modal--telegram-connect {
  max-width: 420px;
  padding: 24px;
}

.modal-header--telegram {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.modal-header--telegram h2 {
  margin: 0;
  font-size: 20px;
}

.modal-telegram-close.me3-btn {
  flex-shrink: 0;
  min-width: 40px;
  padding: 8px;
}

.modal-telegram-close :deep(.me3-btn__icon) {
  margin: 0;
}

.modal h2 {
  font-size: 24px;
  margin-bottom: 8px;
}

.modal-subtitle {
  color: var(--color-text-muted);
  margin-bottom: 24px;
}

.modal-subtitle strong {
  color: var(--color-text);
}

.modal-step {
  display: flex;
  flex-direction: column;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-form input,
.modal-form textarea {
  width: 100%;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.modal-form input:focus,
.modal-form textarea:focus {
  outline: none;
  border-color: var(--color-text);
}

.modal-form textarea {
  resize: vertical;
  min-height: 112px;
}

.hint {
  margin-top: -8px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.input {
  padding: 16px;
  font-size: 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--color-text);
}

.input-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: -8px;
}

.error {
  color: #e53935;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.modal-actions .button {
  flex: 1;
}

.onboarding-radio-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.radio-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
}

.radio-card input {
  width: auto;
  margin-top: 2px;
}

.onboarding-steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
}

.onboarding-step {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.onboarding-step[data-status="running"] {
  border-color: var(--color-text);
}

.onboarding-step[data-status="completed"] {
  border-color: rgba(76, 175, 80, 0.35);
}

.onboarding-step[data-status="failed"] {
  border-color: rgba(229, 57, 53, 0.35);
}

.step-name {
  font-weight: 600;
}

.step-message {
  margin-top: 6px;
  font-size: 14px;
  color: var(--color-text-muted);
}

.modal-actions--import-row {
  align-items: center;
  flex-wrap: nowrap;
}

.modal-actions--import-row .button {
  min-width: 0;
}

.modal-skip-plain {
  flex: 0 0 auto;
  padding: 8px 4px;
  border: none;
  background: none;
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-muted);
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}

.modal-skip-plain:hover:not(:disabled) {
  color: var(--color-text);
}

.modal-skip-plain:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Success state */
.success-icon {
  width: 48px;
  height: 48px;
  background: #4caf50;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-bottom: 16px;
}

.choice-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.choice-primary {
  width: 100%;
  padding: 16px 24px;
  font-size: 16px;
}

.button-link {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  text-decoration: underline;
  padding: 8px;
}

.button-link:hover {
  color: var(--color-text);
}

@media (max-width: 959px) {
  .onboarding-radio-group {
    grid-template-columns: 1fr;
  }
}

.dashboard-load-veil {
  position: fixed;
  inset: 0;
  z-index: 99;
  background: var(--color-bg, #fff);
  pointer-events: none;
}

.load-veil-leave-active {
  transition: opacity 280ms ease;
}

.load-veil-leave-to {
  opacity: 0;
}
</style>
