<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  AGENT_LOCALE_OPTIONS,
  getAgentLocaleDisplayLabel,
  inferLocaleFromTimeZone,
} from "../../../../shared/agent-locales";
import { api } from "../api";
import TelegramConnectPanel from "../components/TelegramConnectPanel.vue";
import { useAuthStore } from "../stores/auth";
import { useSitesStore } from "../stores/sites";
import {
  detectBrowserTimeZone,
  getTimeZoneDisplayLabel,
  isValidTimeZone,
  listSupportedTimeZones,
} from "../utils/timezone";
import {
  telegramAccordionStatusClass,
  telegramAccordionStatusLabel,
} from "../utils/telegram-connection-ui";

definePage({
  meta: {
    requiresAuth: true,
    title: "Account | ME3",
    description: "Manage your me3 account settings.",
    robots: "noindex,follow",
  },
});

type OAuthProvider = {
  provider: "github" | "google" | "linkedin" | "apple";
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type ConnectedAgent = {
  clientId: string;
  name: string;
  audience: string;
  scope: string[];
  grantedAt: string;
  lastUsedAt: string;
};

type MailboxRecord = {
  id: string;
  aliasLocalPart: string;
  aliasAddress: string;
  forwardingEmail: string;
  forwardingStatus: "pending" | "verified";
  forwardingEnabled: boolean;
  forwardingMode: "me3_only" | "forward";
  status: "pending_setup" | "active" | "paused";
  approvalPolicy: "all";
  dailyInboundLimit: number;
  dailyOutboundLimit: number;
  activatedAt: string | null;
  forwardingVerifiedAt: string | null;
  cloudflareDestinationId: string | null;
  cloudflareRuleId: string | null;
  cloudflareLastSyncedAt: string | null;
  cloudflareLastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type MailboxActivity = {
  id: string;
  direction: "inbound" | "outbound";
  kind: "email" | "draft" | "system";
  status:
    | "received"
    | "forwarded"
    | "pending_approval"
    | "approved"
    | "rejected"
    | "sent"
    | "failed"
    | "dropped";
  threadKey: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  subject: string;
  preview: string;
  forwardedTo: string | null;
  errorMessage: string | null;
  createdBy: string;
  receivedAt: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

type MailboxSource = {
  id: string;
  type: "me3_alias" | "custom_domain" | "external_forward";
  address: string;
  localPart: string;
  domain: string;
  provider: string;
  status: "pending" | "active" | "paused" | "failed";
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  forwardingTarget: string | null;
  cloudflareRuleId: string | null;
  cloudflareLastSyncedAt: string | null;
  cloudflareLastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type MailboxResponse = {
  tier: "free" | "starter" | "pro";
  available: boolean;
  approvalRequired: boolean;
  cloudflareManaged: boolean;
  suggestedAliasLocalPart: string;
  mailbox: MailboxRecord | null;
  sources: MailboxSource[];
  recentActivity: MailboxActivity[];
};

type AccountResponse = {
  user: {
    id: string;
    email: string;
    timezone: string | null;
    locale: string;
    localeSource: "explicit" | "inferred";
  };
};

const auth = useAuthStore();
const sites = useSitesStore();
const route = useRoute();
const router = useRouter();

const billingStatus =
  ref<Awaited<ReturnType<typeof sites.getBillingStatus>>>(null);
const billingLoading = ref(false);
const billingPortalLoading = ref(false);

const tierLabels = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
} as const;

const isPaidTier = computed(() =>
  billingStatus.value?.tier ? billingStatus.value.tier !== "free" : false,
);

const billingTierLabel = computed(() => {
  const tier = billingStatus.value?.tier ?? "free";
  return tierLabels[tier];
});

const oauthProviders = ref<OAuthProvider[]>([]);
const oauthLoading = ref(false);
const oauthError = ref<string | null>(null);
const connectedAgents = ref<ConnectedAgent[]>([]);
const connectedAgentsLoading = ref(false);
const connectedAgentsError = ref<string | null>(null);
const connectedAgentsMessage = ref<string | null>(null);
const revokingAgentKey = ref<string | null>(null);
const showEmailModal = ref(false);
const newEmail = ref("");
const currentEmailCode = ref("");
const newEmailCode = ref("");
const emailChangeLoading = ref(false);
const emailConfirming = ref(false);
const emailChangeMessage = ref<string | null>(null);
const emailChangeError = ref<string | null>(null);
const mailboxLoading = ref(false);
const mailboxSaving = ref(false);
const mailboxActivating = ref(false);
const mailboxPausing = ref(false);
const mailboxAvailable = ref(false);
const mailboxApprovalRequired = ref(true);
const mailboxCloudflareManaged = ref(false);
const mailbox = ref<MailboxRecord | null>(null);
const mailboxAliasInput = ref("");
const mailboxForwardingEmail = ref("");
const mailboxForwardingEnabled = ref(false);
const mailboxSources = ref<MailboxSource[]>([]);
const mailboxSourceAddress = ref("");
const mailboxSourceSaving = ref(false);
const mailboxSourceUpdating = ref<string | null>(null);
const mailboxMessage = ref<string | null>(null);
const mailboxError = ref<string | null>(null);
const timezoneLoading = ref(false);
const timezoneSaving = ref(false);
const timezoneInput = ref("");
const savedTimezoneInput = ref("");
const localeInput = ref("");
const savedLocaleInput = ref("");
const timezoneMessage = ref<string | null>(null);
const timezoneError = ref<string | null>(null);
const supportedTimeZones = listSupportedTimeZones();

const telegramPanelRef = ref<InstanceType<typeof TelegramConnectPanel> | null>(
  null,
);

const showDeleteModal = ref(false);
const deleteConfirmInput = ref("");
const deleteLoading = ref(false);
const deleteError = ref<string | null>(null);

const openSection = ref({
  email: true,
  timezone: false,
  billing: false,
  mailbox: false,
  telegram: false,
  linked: false,
  agents: false,
});

const providerLabels: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  linkedin: "LinkedIn",
  apple: "Apple",
};

const soupConnectUrl = computed(() => {
  const configured = import.meta.env.VITE_SOUP_CONNECT_URL?.trim();
  if (configured) return configured;
  return "https://thehumansoup.ai/login";
});

const soupConnectedAgent = computed(() =>
  connectedAgents.value.find((agent) => agent.clientId === "thehumansoup"),
);
const nonSoupConnectedAgents = computed(() =>
  connectedAgents.value.filter((agent) => agent.clientId !== "thehumansoup"),
);
const mailboxConfigured = computed(() => mailbox.value !== null);
const effectiveLocaleValue = computed(
  () => localeInput.value || inferLocaleFromTimeZone(timezoneInput.value),
);
const effectiveLocaleLabel = computed(() =>
  getAgentLocaleDisplayLabel(effectiveLocaleValue.value),
);
const localeOptions = computed(() => {
  const currentValue = localeInput.value || auth.user?.locale || "";
  if (
    !currentValue ||
    AGENT_LOCALE_OPTIONS.some((option) => option.value === currentValue)
  ) {
    return AGENT_LOCALE_OPTIONS;
  }

  return [
    {
      value: currentValue,
      label: getAgentLocaleDisplayLabel(currentValue),
    },
    ...AGENT_LOCALE_OPTIONS,
  ];
});
const timezoneDisplay = computed(() => {
  if (!timezoneInput.value || !isValidTimeZone(timezoneInput.value)) return "";
  return getTimeZoneDisplayLabel(timezoneInput.value);
});
const timezoneSaveDisabled = computed(
  () =>
    timezoneSaving.value ||
    !timezoneInput.value ||
    !isValidTimeZone(timezoneInput.value) ||
    (timezoneInput.value === savedTimezoneInput.value &&
      localeInput.value === savedLocaleInput.value),
);
const mailboxStatusLabel = computed(() => {
  if (!mailbox.value) return "Not configured";

  switch (mailbox.value.status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    default:
      return "Needs activation";
  }
});
const mailboxStatusHint = computed(() => {
  if (!mailbox.value) {
    return "Reserve your alias, point it at a verified inbox, then activate it after Cloudflare destination verification.";
  }

  if (mailbox.value.status === "active") {
    return mailbox.value.forwardingEnabled
      ? `Mail kept in ME3 and forwarded to ${mailbox.value.forwardingEmail}.`
      : "Mail is kept in ME3 without forwarding a copy.";
  }

  if (mailbox.value.status === "paused") {
    return "Mailbox forwarding is paused. Reactivate it when you want inbound capture and forwarding to resume.";
  }

  return mailbox.value.forwardingVerifiedAt
    ? "Cloudflare has verified the forwarding destination. ME3 will activate the alias as soon as the routing rule sync completes."
    : "Cloudflare still needs the forwarding destination verified before the alias can go active.";
});

const telegramStatusLabel = computed(() => {
  const p = telegramPanelRef.value;
  if (!p) return "";
  return telegramAccordionStatusLabel(p.available, p.configured, p.connection);
});

const telegramStatusClass = computed(() => {
  const p = telegramPanelRef.value;
  if (!p) return "pending_setup";
  return telegramAccordionStatusClass(p.available, p.connection);
});

function connectedAgentKey(agent: ConnectedAgent): string {
  return `${agent.clientId}:${agent.audience}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function syncMailboxInputs(response: MailboxResponse) {
  mailboxAvailable.value = response.available;
  mailboxApprovalRequired.value = response.approvalRequired;
  mailboxCloudflareManaged.value = response.cloudflareManaged;
  mailbox.value = response.mailbox;
  mailboxAliasInput.value =
    response.mailbox?.aliasLocalPart || response.suggestedAliasLocalPart || "";
  mailboxForwardingEnabled.value = Boolean(response.mailbox?.forwardingEnabled);
  mailboxForwardingEmail.value =
    response.mailbox?.forwardingEmail || auth.user?.email || "";
  mailboxSources.value = response.sources || [];
}

async function loadMailbox() {
  mailboxLoading.value = true;
  mailboxError.value = null;

  try {
    const response = await api.get<MailboxResponse>("/mailbox");
    syncMailboxInputs(response);
  } catch (error: any) {
    mailboxError.value = error.message || "Failed to load mailbox";
  } finally {
    mailboxLoading.value = false;
  }
}

function syncAccount(response: AccountResponse) {
  auth.setSession(response.user);
  timezoneInput.value = response.user.timezone || "";
  savedTimezoneInput.value = timezoneInput.value;
  localeInput.value =
    response.user.localeSource === "explicit" ? response.user.locale : "";
  savedLocaleInput.value = localeInput.value;
}

async function loadAccount() {
  timezoneLoading.value = true;
  timezoneError.value = null;

  try {
    const response = await api.get<AccountResponse>("/account");
    syncAccount(response);
  } catch (error: any) {
    timezoneError.value = error.message || "Failed to load account settings";
  } finally {
    timezoneLoading.value = false;
  }
}

function detectTimezoneValue() {
  const detected = detectBrowserTimeZone();
  if (!detected) {
    timezoneError.value = "Could not detect a valid browser timezone";
    return;
  }

  timezoneInput.value = detected;
  timezoneError.value = null;
  timezoneMessage.value = null;
}

async function saveTimezone() {
  if (timezoneSaveDisabled.value) return;

  timezoneSaving.value = true;
  timezoneMessage.value = null;
  timezoneError.value = null;

  try {
    const response = await api.put<AccountResponse>("/account", {
      timezone: timezoneInput.value,
      locale: localeInput.value || null,
    });
    syncAccount(response);
    timezoneMessage.value = "Regional settings updated.";
  } catch (error: any) {
    timezoneError.value = error.message || "Failed to update regional settings";
  } finally {
    timezoneSaving.value = false;
  }
}

async function refreshMailbox() {
  const response = await api.get<MailboxResponse>("/mailbox");
  syncMailboxInputs(response);
}

async function saveMailbox() {
  if (mailboxSaving.value) return;

  mailboxSaving.value = true;
  mailboxMessage.value = null;
  mailboxError.value = null;

  try {
    await api.put("/mailbox", {
      aliasLocalPart: mailboxAliasInput.value,
      forwardingEmail: mailboxForwardingEnabled.value
        ? mailboxForwardingEmail.value
        : null,
      forwardingEnabled: mailboxForwardingEnabled.value,
    });
    await refreshMailbox();
    mailboxMessage.value = mailboxForwardingEnabled.value
      ? mailbox.value?.forwardingVerifiedAt
        ? "Mailbox saved and synced with Cloudflare."
        : "Mailbox saved. Cloudflare should send a verification email to the forwarding inbox."
      : "Mailbox saved. New mail will stay in ME3.";
  } catch (error: any) {
    mailboxError.value = error.message || "Failed to save mailbox";
  } finally {
    mailboxSaving.value = false;
  }
}

async function activateMailbox() {
  if (mailboxActivating.value) return;

  mailboxActivating.value = true;
  mailboxMessage.value = null;
  mailboxError.value = null;

  try {
    await api.post("/mailbox/activate", {});
    await refreshMailbox();
    mailboxMessage.value = "Mailbox status refreshed from Cloudflare.";
  } catch (error: any) {
    mailboxError.value = error.message || "Failed to activate mailbox";
  } finally {
    mailboxActivating.value = false;
  }
}

async function pauseMailbox() {
  if (mailboxPausing.value) return;

  mailboxPausing.value = true;
  mailboxMessage.value = null;
  mailboxError.value = null;

  try {
    await api.post("/mailbox/pause", {});
    await refreshMailbox();
    mailboxMessage.value = "Mailbox paused.";
  } catch (error: any) {
    mailboxError.value = error.message || "Failed to pause mailbox";
  } finally {
    mailboxPausing.value = false;
  }
}

async function addMailboxSource() {
  if (mailboxSourceSaving.value) return;

  mailboxSourceSaving.value = true;
  mailboxMessage.value = null;
  mailboxError.value = null;

  try {
    await api.post("/mailbox/sources", {
      address: mailboxSourceAddress.value,
      type: "custom_domain",
      inboundEnabled: true,
      outboundEnabled: false,
    });
    mailboxSourceAddress.value = "";
    await refreshMailbox();
    mailboxMessage.value = "Address added. Point its Cloudflare Email Routing rule at the ME3 worker.";
  } catch (error: any) {
    mailboxError.value = error.message || "Failed to add mailbox address";
  } finally {
    mailboxSourceSaving.value = false;
  }
}

async function updateMailboxSourceOutbound(source: MailboxSource) {
  if (mailboxSourceUpdating.value) return;

  mailboxSourceUpdating.value = source.id;
  mailboxMessage.value = null;
  mailboxError.value = null;

  try {
    await api.put(`/mailbox/sources/${source.id}`, {
      inboundEnabled: source.inboundEnabled,
      outboundEnabled: !source.outboundEnabled,
    });
    await refreshMailbox();
    mailboxMessage.value = source.outboundEnabled
      ? "Send-from disabled for that address."
      : "Send-from enabled for that address.";
  } catch (error: any) {
    mailboxError.value = error.message || "Failed to update mailbox address";
  } finally {
    mailboxSourceUpdating.value = null;
  }
}

async function loadConnectedAgents() {
  connectedAgentsLoading.value = true;
  connectedAgentsError.value = null;

  try {
    const response = await api.get<{ agents: ConnectedAgent[] }>(
      "/account/connected-agents",
    );
    connectedAgents.value = response.agents || [];
  } catch (error: any) {
    connectedAgentsError.value =
      error.message || "Failed to load connected agents";
  } finally {
    connectedAgentsLoading.value = false;
  }
}

async function revokeConnectedAgent(agent: ConnectedAgent) {
  const key = connectedAgentKey(agent);
  if (revokingAgentKey.value) return;

  revokingAgentKey.value = key;
  connectedAgentsMessage.value = null;
  connectedAgentsError.value = null;

  try {
    const response = await api.post<{ revoked: boolean; revokedCount: number }>(
      `/account/connected-agents/${encodeURIComponent(agent.clientId)}/revoke`,
      { audience: agent.audience },
    );
    if (response.revoked) {
      connectedAgentsMessage.value =
        agent.clientId === "thehumansoup"
          ? "Disconnected TheHumanSoup."
          : `Disconnected ${agent.name}.`;
    } else {
      connectedAgentsMessage.value = "No active connection found to revoke.";
    }
    await loadConnectedAgents();
  } catch (error: any) {
    connectedAgentsError.value =
      error.message || "Failed to revoke connected agent";
  } finally {
    revokingAgentKey.value = null;
  }
}

async function loadOAuthProviders() {
  oauthLoading.value = true;
  oauthError.value = null;
  try {
    const response = await api.get<{ providers: OAuthProvider[] }>(
      "/account/oauth-providers",
    );
    oauthProviders.value = response.providers || [];
  } catch (error: any) {
    oauthError.value = error.message || "Failed to load providers";
  } finally {
    oauthLoading.value = false;
  }
}

async function requestEmailChange() {
  if (emailChangeLoading.value) return;
  emailChangeLoading.value = true;
  emailChangeMessage.value = null;
  emailChangeError.value = null;

  try {
    await api.post("/account/email-change/request", {
      newEmail: newEmail.value,
    });
    emailChangeMessage.value =
      "We sent verification codes to your current and new email addresses.";
  } catch (error: any) {
    emailChangeError.value =
      error.message || "Failed to send email change codes";
  } finally {
    emailChangeLoading.value = false;
  }
}

async function confirmEmailChange() {
  if (emailConfirming.value) return;
  emailConfirming.value = true;
  emailChangeMessage.value = null;
  emailChangeError.value = null;

  try {
    const response = await api.post<{
      user: {
        id: string;
        email: string;
        timezone: string | null;
        locale: string;
        localeSource: "explicit" | "inferred";
      };
    }>("/account/email-change/confirm", {
      oldCode: currentEmailCode.value,
      newCode: newEmailCode.value,
    });
    auth.setSession(response.user);
    emailChangeMessage.value = "Email updated. You're all set.";
    newEmail.value = "";
    currentEmailCode.value = "";
    newEmailCode.value = "";
  } catch (error: any) {
    emailChangeError.value = error.message || "Failed to confirm email change";
  } finally {
    emailConfirming.value = false;
  }
}

function formatProvider(provider: string) {
  return providerLabels[provider] || provider;
}

function openEmailModal() {
  showEmailModal.value = true;
  emailChangeMessage.value = null;
  emailChangeError.value = null;
}

function closeEmailModal() {
  showEmailModal.value = false;
}

function openDeleteModal() {
  deleteConfirmInput.value = "";
  deleteError.value = null;
  showDeleteModal.value = true;
}

function closeDeleteModal() {
  if (deleteLoading.value) return;
  showDeleteModal.value = false;
}

async function deleteAccount() {
  if (deleteLoading.value) return;

  const requiredPhrase = "DELETE";
  if (deleteConfirmInput.value.trim() !== requiredPhrase) {
    deleteError.value = `Type "${requiredPhrase}" to confirm.`;
    return;
  }

  deleteLoading.value = true;
  deleteError.value = null;

  try {
    await api.post("/account/delete", {});
    await auth.logout();
    router.push("/");
  } catch (error: any) {
    deleteError.value =
      error.message || "Failed to delete account. Please try again.";
  } finally {
    deleteLoading.value = false;
  }
}

function goToPricing() {
  router.push("/pricing");
}

async function loadBillingStatus() {
  billingLoading.value = true;
  try {
    billingStatus.value = await sites.getBillingStatus();
  } finally {
    billingLoading.value = false;
  }
}

async function openBillingPortal() {
  if (billingPortalLoading.value) return;
  billingPortalLoading.value = true;
  try {
    const url = await sites.openBillingPortal();
    if (url) window.location.assign(url);
  } finally {
    billingPortalLoading.value = false;
  }
}

function openSoupConnect() {
  try {
    const target = new URL(soupConnectUrl.value);
    if (target.pathname !== "/login") {
      target.pathname = "/login";
    }
    target.searchParams.set("oauth", "me3");
    target.searchParams.set("source", "me3-account");
    window.location.href = target.toString();
  } catch {
    window.location.href = soupConnectUrl.value;
  }
}

onMounted(async () => {
  await loadAccount();
  void loadBillingStatus();
  loadOAuthProviders();
  loadConnectedAgents();
  loadMailbox();

  const section = route.query.section;
  if (section === "telegram") {
    openSection.value.telegram = true;
  }
  if (section === "billing") {
    openSection.value.billing = true;
  }
});
</script>

<template>
  <div class="account-page">
    <Teleport to="#app-side-nav-mobile-page-controls">
      <div class="account-mobile-title">Account</div>
    </Teleport>

    <main class="main">
      <h1>Account</h1>

      <section class="card accordion-card">
        <button
          class="accordion-trigger"
          type="button"
          :aria-expanded="openSection.email"
          aria-controls="account-panel-email"
          id="account-trigger-email"
          @click="openSection.email = !openSection.email"
        >
          <span class="accordion-title-wrap">
            <h2>Account email</h2>
          </span>
          <span class="accordion-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="account-panel-email"
          class="accordion-panel"
          role="region"
          aria-labelledby="account-trigger-email"
          :hidden="!openSection.email"
        >
          <div class="email-row">
            <input
              class="input"
              type="email"
              :value="auth.user?.email || ''"
              disabled
            />
            <button
              class="button secondary email-edit-btn"
              type="button"
              @click="openEmailModal"
            >
              Change email
            </button>
          </div>
        </div>
      </section>

      <section class="card accordion-card">
        <button
          class="accordion-trigger"
          type="button"
          :aria-expanded="openSection.timezone"
          aria-controls="account-panel-timezone"
          id="account-trigger-timezone"
          @click="openSection.timezone = !openSection.timezone"
        >
          <span class="accordion-title-wrap accordion-title-flex">
            <h2>Regional settings</h2>
            <span v-if="auth.user" class="mailbox-header-status-hint">
              {{ getAgentLocaleDisplayLabel(auth.user.locale) }}
            </span>
          </span>
          <span class="accordion-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="account-panel-timezone"
          class="accordion-panel"
          role="region"
          aria-labelledby="account-trigger-timezone"
          :hidden="!openSection.timezone"
        >
          <div v-if="timezoneLoading" class="status-row">Loading timezone…</div>
          <template v-else>
            <p class="hint">
              Agent replies follow your locale preference, and scheduled jobs,
              briefings, and account-level dates use your timezone.
            </p>
            <div class="timezone-grid">
              <label class="field">
                <span>Timezone</span>
                <input
                  v-model="timezoneInput"
                  class="input"
                  type="text"
                  list="account-timezone-options"
                  placeholder="Start typing a timezone"
                  spellcheck="false"
                />
                <datalist id="account-timezone-options">
                  <option
                    v-for="timeZone in supportedTimeZones"
                    :key="timeZone"
                    :value="timeZone"
                  >
                    {{ getTimeZoneDisplayLabel(timeZone) }}
                  </option>
                </datalist>
              </label>
              <label class="field">
                <span>Agent locale</span>
                <select v-model="localeInput" class="input">
                  <option value="">
                    Use timezone default ({{ effectiveLocaleLabel }})
                  </option>
                  <option
                    v-for="localeOption in localeOptions"
                    :key="localeOption.value"
                    :value="localeOption.value"
                  >
                    {{ localeOption.label }}
                  </option>
                </select>
              </label>
              <div class="timezone-summary">
                <span class="timezone-summary-label">Current timezone</span>
                <strong>{{
                  timezoneDisplay ||
                  (auth.user?.timezone
                    ? getTimeZoneDisplayLabel(auth.user.timezone)
                    : "UTC")
                }}</strong>
                <span class="timezone-summary-label">Agent locale</span>
                <strong>{{ effectiveLocaleLabel }}</strong>
                <span class="timezone-summary-label">
                  {{
                    localeInput
                      ? "Saved explicitly."
                      : `Defaulting from ${timezoneInput || "UTC"}.`
                  }}
                </span>
              </div>
            </div>

            <div class="button-row">
              <button
                class="button secondary"
                type="button"
                @click="detectTimezoneValue"
              >
                Detect from browser
              </button>
              <button
                class="button primary"
                type="button"
                :disabled="timezoneSaveDisabled"
                @click="saveTimezone"
              >
                {{ timezoneSaving ? "Saving..." : "Save regional settings" }}
              </button>
            </div>

            <p v-if="timezoneMessage" class="success">{{ timezoneMessage }}</p>
            <p v-if="timezoneError" class="error">{{ timezoneError }}</p>
          </template>
        </div>
      </section>

      <section class="card accordion-card">
        <button
          class="accordion-trigger"
          type="button"
          :aria-expanded="openSection.billing"
          aria-controls="account-panel-billing"
          id="account-trigger-billing"
          @click="openSection.billing = !openSection.billing"
        >
          <span class="accordion-title-wrap accordion-title-flex">
            <h2>Billing</h2>
            <span
              v-if="!billingLoading && billingStatus"
              class="mailbox-header-status-hint"
            >
              {{ billingTierLabel }}
            </span>
          </span>
          <span class="accordion-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="account-panel-billing"
          class="accordion-panel"
          role="region"
          aria-labelledby="account-trigger-billing"
          :hidden="!openSection.billing"
        >
          <div v-if="billingLoading" class="status-row">Loading billing…</div>
          <template v-else>
            <p class="hint">
              {{
                isPaidTier
                  ? "Update your payment method, download invoices, and manage your subscription in Stripe."
                  : "Upgrade for more sites, a custom domain, bookings, and agent features."
              }}
            </p>
            <div class="button-row">
              <button
                v-if="isPaidTier"
                class="button primary"
                type="button"
                :disabled="billingPortalLoading"
                @click="openBillingPortal"
              >
                {{ billingPortalLoading ? "Opening…" : "Manage billing" }}
              </button>
              <button
                v-else
                class="button primary"
                type="button"
                @click="goToPricing"
              >
                View plans
              </button>
            </div>
          </template>
        </div>
      </section>

      <section class="card accordion-card">
        <button
          class="accordion-trigger"
          type="button"
          :aria-expanded="openSection.mailbox"
          aria-controls="account-panel-mailbox"
          id="account-trigger-mailbox"
          @click="openSection.mailbox = !openSection.mailbox"
        >
          <span class="accordion-title-wrap accordion-title-flex">
            <h2>Mailbox settings</h2>
            <template v-if="mailboxAvailable && mailbox">
              <span
                class="status-badge accordion-inline-badge"
                :class="mailbox.status || 'pending_setup'"
              >
                {{ mailboxStatusLabel }}
              </span>
              <span class="status-pill">
                {{
                  mailbox.forwardingStatus === "verified"
                    ? "Verified"
                    : "Waiting"
                }}
              </span>
              <span class="mailbox-header-status-hint">{{
                mailboxStatusHint
              }}</span>
            </template>
          </span>
          <span class="accordion-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="account-panel-mailbox"
          class="accordion-panel"
          role="region"
          aria-labelledby="account-trigger-mailbox"
          :hidden="!openSection.mailbox"
        >
          <div v-if="mailboxLoading" class="status-row">Loading mailbox…</div>

          <template v-else-if="mailboxAvailable">
            <div class="mailbox-grid">
              <label class="field">
                <span>Alias</span>
                <div class="alias-field">
                  <input
                    v-model="mailboxAliasInput"
                    class="input"
                    type="text"
                    placeholder="your-name"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                  <span class="alias-suffix">@example.com</span>
                </div>
              </label>
              <label class="field">
                <span>Delivery</span>
                <label class="mailbox-toggle">
                  <input
                    v-model="mailboxForwardingEnabled"
                    type="checkbox"
                  />
                  <span>Forward a copy to another inbox</span>
                </label>
                <input
                  v-if="mailboxForwardingEnabled"
                  v-model="mailboxForwardingEmail"
                  class="input"
                  type="email"
                  placeholder="you@example.com"
                />
                <p v-else class="field-hint">
                  Keep incoming mail in ME3 only.
                </p>
              </label>
            </div>

            <div class="button-row">
              <button
                class="button secondary"
                type="button"
                :disabled="mailboxSaving"
                @click="saveMailbox"
              >
                {{ mailboxSaving ? "Saving..." : "Save alias settings" }}
              </button>
              <button
                v-if="mailbox?.status !== 'active'"
                class="button primary"
                type="button"
                :disabled="mailboxActivating || !mailboxConfigured"
                @click="activateMailbox"
              >
                {{
                  mailboxActivating
                    ? "Checking..."
                    : mailbox?.status === "paused"
                      ? "Resume mailbox"
                      : "Check Cloudflare status"
                }}
              </button>
              <button
                v-else
                class="button secondary"
                type="button"
                :disabled="mailboxPausing"
                @click="pauseMailbox"
              >
                {{ mailboxPausing ? "Pausing..." : "Pause mailbox" }}
              </button>
            </div>

            <div
              v-if="mailboxCloudflareManaged && mailbox?.cloudflareLastSyncedAt"
              class="provider-meta mailbox-meta"
            >
              Last Cloudflare sync
              {{ formatDateTime(mailbox.cloudflareLastSyncedAt) }}
            </div>
            <div
              v-if="mailboxCloudflareManaged && mailbox?.cloudflareLastError"
              class="provider-meta error-copy mailbox-meta"
            >
              {{ mailbox.cloudflareLastError }}
            </div>

            <div v-if="mailbox" class="mailbox-panel">
              <div class="mailbox-panel-head">
                <h3>Connected addresses</h3>
                <span class="provider-meta">
                  {{ mailboxSources.length }} address{{
                    mailboxSources.length === 1 ? "" : "es"
                  }}
                </span>
              </div>

              <form class="mailbox-source-form" @submit.prevent="addMailboxSource">
                <input
                  v-model="mailboxSourceAddress"
                  class="input"
                  type="email"
                  placeholder="hello@example.com"
                  autocomplete="email"
                />
                <button
                  class="button secondary"
                  type="submit"
                  :disabled="mailboxSourceSaving || !mailboxSourceAddress.trim()"
                >
                  {{ mailboxSourceSaving ? "Adding..." : "Add address" }}
                </button>
              </form>

              <div v-if="mailboxSources.length" class="mailbox-source-list">
                <div
                  v-for="source in mailboxSources"
                  :key="source.id"
                  class="mailbox-source-row"
                >
                  <div class="mailbox-source-main">
                    <strong>{{ source.address }}</strong>
                    <span class="provider-meta">
                      {{ source.type === "me3_alias" ? "ME3 alias" : source.provider }}
                      · {{ source.status }}
                    </span>
                  </div>
                  <label
                    v-if="source.type !== 'me3_alias'"
                    class="mailbox-toggle compact"
                  >
                    <input
                      :checked="source.outboundEnabled"
                      type="checkbox"
                      :disabled="mailboxSourceUpdating === source.id"
                      @change="updateMailboxSourceOutbound(source)"
                    />
                    <span>Can send from this address</span>
                  </label>
                  <span v-else class="status-badge compact active">
                    Default sender
                  </span>
                </div>
              </div>
              <p v-else class="field-hint">
                Add custom-domain addresses after routing them through Cloudflare.
              </p>
            </div>

            <p v-if="mailboxMessage" class="success">{{ mailboxMessage }}</p>
            <p v-if="mailboxError" class="error">{{ mailboxError }}</p>
          </template>

          <div v-else class="recommended-card">
            <span class="recommended-pill">Pro</span>
            <h3>Reserve your example.com mailbox alias</h3>
            <p class="hint">
              Pro includes an agent-only inbox, inbound forwarding, a trust log,
              and approval-first outbound mail.
            </p>
            <router-link
              class="button primary link-button-inline"
              to="/pricing"
            >
              View Pro
            </router-link>
          </div>
        </div>
      </section>

      <section class="card accordion-card">
        <button
          class="accordion-trigger"
          type="button"
          :aria-expanded="openSection.telegram"
          aria-controls="account-panel-telegram"
          id="account-trigger-telegram"
          @click="openSection.telegram = !openSection.telegram"
        >
          <span class="accordion-title-wrap accordion-title-flex">
            <h2>Telegram settings</h2>
            <span
              v-if="telegramPanelRef?.available"
              class="status-badge accordion-inline-badge"
              :class="telegramStatusClass"
            >
              {{ telegramStatusLabel }}
            </span>
          </span>
          <span class="accordion-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="account-panel-telegram"
          class="accordion-panel"
          role="region"
          aria-labelledby="account-trigger-telegram"
          :hidden="!openSection.telegram"
        >
          <TelegramConnectPanel
            ref="telegramPanelRef"
            variant="default"
            :auto-prepare-when-not-connected="
              route.query.section === 'telegram'
            "
          />
        </div>
      </section>

      <section v-if="oauthProviders.length > 0" class="card accordion-card">
        <button
          class="accordion-trigger"
          type="button"
          :aria-expanded="openSection.linked"
          aria-controls="account-panel-linked"
          id="account-trigger-linked"
          @click="openSection.linked = !openSection.linked"
        >
          <span class="accordion-title-wrap">
            <h2>Linked Accounts</h2>
          </span>
          <span class="accordion-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="account-panel-linked"
          class="accordion-panel"
          role="region"
          aria-labelledby="account-trigger-linked"
          :hidden="!openSection.linked"
        >
          <p class="hint">Accounts you've connected for sign-in.</p>

          <div v-if="oauthLoading" class="status-row">Loading providers…</div>

          <div v-else class="provider-list">
            <div
              v-for="provider in oauthProviders"
              :key="`${provider.provider}-${provider.created_at}`"
              class="provider-row"
            >
              <div>
                <strong>{{ formatProvider(provider.provider) }}</strong>
                <div class="provider-meta">
                  {{ provider.email || "No email shared" }}
                </div>
              </div>
            </div>
          </div>

          <p v-if="oauthError" class="error">{{ oauthError }}</p>
        </div>
      </section>

      <section class="card accordion-card">
        <button
          class="accordion-trigger"
          type="button"
          :aria-expanded="openSection.agents"
          aria-controls="account-panel-agents"
          id="account-trigger-agents"
          @click="openSection.agents = !openSection.agents"
        >
          <span class="accordion-title-wrap">
            <h2>App Connections</h2>
          </span>
          <span class="accordion-chevron" aria-hidden="true">▼</span>
        </button>
        <div
          id="account-panel-agents"
          class="accordion-panel"
          role="region"
          aria-labelledby="account-trigger-agents"
          :hidden="!openSection.agents"
        >
          <div v-if="!soupConnectedAgent" class="recommended-card">
            <span class="recommended-pill">Recommended</span>
            <h3>Connect to TheHumanSoup</h3>
            <p class="hint">
              Connect your ME3 account to TheHumanSoup.ai. This will allow your
              site to be indexed and easily discovered by AI.
            </p>
            <button
              class="button primary"
              type="button"
              @click="openSoupConnect"
            >
              Connect to TheHumanSoup.ai
            </button>
          </div>
          <div v-else class="recommended-card connected-card">
            <span class="recommended-pill">Connected</span>
            <div class="agent-copy">
              <strong>TheHumanSoup is connected</strong>
              <div class="provider-meta">
                Authorized {{ formatDateTime(soupConnectedAgent.grantedAt) }}
              </div>
              <div class="provider-meta">
                Last used {{ formatDateTime(soupConnectedAgent.lastUsedAt) }}
              </div>
            </div>
            <button
              class="button secondary"
              type="button"
              :disabled="
                revokingAgentKey === connectedAgentKey(soupConnectedAgent) ||
                connectedAgentsLoading
              "
              @click="revokeConnectedAgent(soupConnectedAgent)"
            >
              {{
                revokingAgentKey === connectedAgentKey(soupConnectedAgent)
                  ? "Disconnecting..."
                  : "Disconnect"
              }}
            </button>
          </div>

          <div
            v-if="nonSoupConnectedAgents.length > 0"
            class="connected-agents"
          >
            <h3>Other connected agents</h3>
            <p class="hint">
              Apps with active access to your ME3 OAuth data and scopes.
            </p>
            <div class="agent-list">
              <article
                v-for="agent in nonSoupConnectedAgents"
                :key="connectedAgentKey(agent)"
                class="agent-row"
              >
                <div class="agent-copy">
                  <strong>{{ agent.name }}</strong>
                  <div class="provider-meta">
                    Client ID: {{ agent.clientId }}
                  </div>
                  <div class="provider-meta">
                    Audience: {{ agent.audience }}
                  </div>
                  <div class="provider-meta">
                    Scope: {{ agent.scope.join(", ") }}
                  </div>
                  <div class="provider-meta">
                    Authorized {{ formatDateTime(agent.grantedAt) }}
                  </div>
                  <div class="provider-meta">
                    Last used {{ formatDateTime(agent.lastUsedAt) }}
                  </div>
                </div>
                <button
                  class="button secondary"
                  type="button"
                  :disabled="
                    revokingAgentKey === connectedAgentKey(agent) ||
                    connectedAgentsLoading
                  "
                  @click="revokeConnectedAgent(agent)"
                >
                  {{
                    revokingAgentKey === connectedAgentKey(agent)
                      ? "Disconnecting..."
                      : "Disconnect"
                  }}
                </button>
              </article>
            </div>
            <p
              v-if="
                connectedAgentsMessage &&
                !connectedAgentsMessage.includes('TheHumanSoup')
              "
              class="success"
            >
              {{ connectedAgentsMessage }}
            </p>
          </div>
          <p
            v-if="
              connectedAgentsMessage &&
              connectedAgentsMessage.includes('TheHumanSoup')
            "
            class="success"
          >
            {{ connectedAgentsMessage }}
          </p>
          <p v-if="connectedAgentsError" class="error">
            {{ connectedAgentsError }}
          </p>
        </div>
      </section>

      <!-- Danger Zone -->
      <section class="danger-section">
        <h2>Danger zone</h2>
        <div class="danger-card">
          <div>
            <strong>Delete your account</strong>
            <p>
              This will permanently delete your me3 account, all of your sites,
              and associated data. This action cannot be undone.
            </p>
          </div>
          <button class="button danger" type="button" @click="openDeleteModal">
            Delete
          </button>
        </div>
      </section>
    </main>

    <div
      v-if="showEmailModal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Change email"
      @click.self="closeEmailModal"
    >
      <div class="modal">
        <div class="modal-header">
          <h2>Change email</h2>
          <button class="modal-close" type="button" @click="closeEmailModal">
            ×
          </button>
        </div>
        <p class="hint">
          We'll send a code to your current email and the new email you want to
          use. Enter both codes to confirm the change.
        </p>

        <div class="email-change-form">
          <label class="field">
            <span>New email address</span>
            <input
              v-model="newEmail"
              class="input"
              type="email"
              placeholder="you@newdomain.com"
            />
          </label>

          <button
            class="button secondary"
            type="button"
            :disabled="emailChangeLoading || !newEmail"
            @click="requestEmailChange"
          >
            {{ emailChangeLoading ? "Sending..." : "Send verification codes" }}
          </button>

          <div class="code-grid">
            <label class="field">
              <span
                >Code sent to {{ auth.user?.email || "current email" }}</span
              >
              <input
                v-model="currentEmailCode"
                class="input"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
              />
            </label>
            <label class="field">
              <span>Code sent to new email</span>
              <input
                v-model="newEmailCode"
                class="input"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="123456"
              />
            </label>
          </div>

          <button
            class="button primary"
            type="button"
            :disabled="emailConfirming || !currentEmailCode || !newEmailCode"
            @click="confirmEmailChange"
          >
            {{ emailConfirming ? "Confirming..." : "Confirm email change" }}
          </button>
        </div>

        <p v-if="emailChangeMessage" class="success">
          {{ emailChangeMessage }}
        </p>
        <p v-if="emailChangeError" class="error">{{ emailChangeError }}</p>
      </div>
    </div>

    <!-- Delete Account Confirmation Modal -->
    <div
      v-if="showDeleteModal"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Delete account"
      @click.self="closeDeleteModal"
    >
      <div class="modal">
        <div class="modal-header">
          <h2>Delete account</h2>
          <button
            class="modal-close"
            type="button"
            :disabled="deleteLoading"
            @click="closeDeleteModal"
          >
            ×
          </button>
        </div>

        <p class="hint">
          This will permanently delete your me3 account, all of your sites, and
          associated data. This cannot be undone.
        </p>

        <div class="delete-confirm">
          <p class="confirm-text">
            To confirm, type
            <code>DELETE</code>
            below.
          </p>
          <input
            v-model="deleteConfirmInput"
            class="input"
            type="text"
            placeholder="DELETE"
            :disabled="deleteLoading"
          />
        </div>

        <div class="modal-actions">
          <button
            class="button secondary"
            type="button"
            :disabled="deleteLoading"
            @click="closeDeleteModal"
          >
            Cancel
          </button>
          <button
            class="button danger"
            type="button"
            :disabled="deleteLoading || deleteConfirmInput.trim() !== 'DELETE'"
            @click="deleteAccount"
          >
            {{ deleteLoading ? "Deleting..." : "Delete account" }}
          </button>
        </div>

        <p v-if="deleteError" class="error">{{ deleteError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-page {
  min-height: 100vh;
}

.main {
  max-width: 700px;
  margin: 0 auto;
  padding: 20px 40px;
}

h1 {
  font-size: 28px;
  margin-bottom: 6px;
}

.account-mobile-title {
  display: none;
}

.card {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
  background: var(--color-bg);
}

.card h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.card.accordion-card {
  padding: 0;
  overflow: hidden;
}

.accordion-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--color-text);
  transition: background 0.15s ease;
}

.accordion-trigger:hover {
  background: var(--color-bg-subtle);
}

.accordion-title-wrap h2 {
  margin: 0;
  font-size: 18px;
}

.accordion-title-flex {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.accordion-inline-badge {
  flex-shrink: 0;
}

.mailbox-header-status-hint {
  flex: 1 1 200px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--color-text-muted);
}

.accordion-chevron {
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.65;
  transition: transform 0.2s ease;
}

.accordion-trigger[aria-expanded="true"] .accordion-chevron {
  transform: rotate(180deg);
}

.accordion-panel {
  padding: 10px 16px 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.recommended-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 12px;
  background: rgba(76, 175, 80, 0.08);
  margin-bottom: 16px;
}

.connected-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.recommended-card h3 {
  margin: 0;
  font-size: 16px;
}

.recommended-pill {
  width: fit-content;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(46, 125, 50, 0.16);
  color: #2e7d32;
}

.connected-agents {
  margin-bottom: 16px;
}

.connected-agents h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.agent-list {
  display: grid;
  gap: 12px;
}

.agent-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
  background: var(--color-bg);
}

.agent-copy {
  min-width: 0;
}

.hint {
  color: var(--color-text-muted);
  font-size: 14px;
  margin-bottom: 16px;
}

.email-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.email-row .input {
  flex: 1;
}

.email-edit-btn {
  white-space: nowrap;
}

.provider-list {
  display: grid;
  gap: 12px;
}

.provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-border);
}

.provider-meta {
  color: var(--color-text-muted);
  font-size: 13px;
  margin-top: 4px;
}

.input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-border);
  margin-bottom: 16px;
}

.status-row.verified {
  background: rgba(76, 175, 80, 0.15);
  border: 1px solid rgba(76, 175, 80, 0.2);
}

.status-pill {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-bg);
  text-align: center;
}

.email-change-form {
  display: grid;
  gap: 12px;
}

.code-grid {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 8px;
  font-size: 14px;
}

.textarea {
  resize: vertical;
  min-height: 120px;
  font: inherit;
}

.alias-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alias-suffix {
  white-space: nowrap;
  font-size: 14px;
  color: var(--color-text-muted);
}

.button-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0;
}

.button-row.compact {
  margin-top: 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(128, 128, 128, 0.14);
  color: var(--color-text);
  text-transform: capitalize;
}

.status-badge.active,
.status-badge.forwarded,
.status-badge.sent {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.pending_setup,
.status-badge.pending_approval,
.status-badge.received {
  background: rgba(255, 179, 0, 0.16);
  color: #9a6700;
}

.status-badge.paused,
.status-badge.rejected,
.status-badge.failed,
.status-badge.dropped {
  background: rgba(229, 57, 53, 0.14);
  color: #c62828;
}

.status-badge.compact {
  padding: 4px 8px;
}

.mailbox-grid {
  display: grid;
  gap: 16px;
}

.mailbox-toggle {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.mailbox-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-text);
}

.field-hint {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.timezone-grid {
  display: grid;
  gap: 16px;
}

.timezone-summary {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-subtle);
}

.timezone-summary-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.mailbox-note {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--color-border);
}

.mailbox-note p {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--color-text-muted);
}

.mailbox-reply-state {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-top: 12px;
}

.mailbox-reply-state .provider-meta {
  margin-top: 4px;
}

.mailbox-meta {
  margin-top: 8px;
}

.mailbox-panel {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
}

.mailbox-panel h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.mailbox-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.mailbox-source-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 12px;
}

.mailbox-source-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.mailbox-source-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
}

.mailbox-source-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.mailbox-source-main strong {
  overflow-wrap: anywhere;
}

.mailbox-toggle.compact {
  min-height: 32px;
  font-size: 13px;
}

.activity-heading-split {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.activity-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.activity-meta-trailing {
  flex-shrink: 0;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.35;
  color: var(--color-text-muted);
  text-align: right;
  white-space: nowrap;
}

.activity-error-line {
  margin-top: 6px;
}

.activity-list {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.activity-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: var(--color-border);
}

.activity-copy {
  min-width: 0;
}

.activity-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.activity-preview {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--color-text);
  white-space: pre-wrap;
}

.error-copy {
  color: #c62828;
}

.link-button-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.button {
  padding: 12px 18px;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
}

.button.primary {
  background: var(--color-text);
  color: var(--color-bg);
}

.button.secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.button.danger {
  background: #e53935;
  color: #ffffff;
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 24px;
  z-index: 50;
}

.modal {
  width: min(560px, 100%);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.modal-header h2 {
  margin: 0;
}

.modal-close {
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}

.empty-state {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-border);
}

.success {
  margin-top: 12px;
  color: #2e7d32;
  font-weight: 600;
}

.error {
  margin-top: 12px;
  color: #e53935;
  font-weight: 600;
  font-size: 14px;
}

.danger-section {
  margin-top: 32px;
}

.danger-section h2 {
  font-size: 18px;
  color: #e53935;
  margin-bottom: 12px;
}

.danger-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid
    color-mix(in oklab, #e53935 34%, var(--color-border));
  border-radius: 12px;
  background: color-mix(in oklab, #e53935 12%, var(--color-bg-subtle));
}

.danger-card strong {
  font-size: 14px;
  color: var(--color-text);
}

.danger-card p {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.delete-confirm {
  margin: 16px 0;
  display: grid;
  gap: 8px;
}
.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: space-between;
}

.confirm-text {
  font-size: 14px;
}

@media (max-width: 720px) {
  .main {
    padding: 16px;
  }

  .main > h1 {
    display: none;
  }

  .account-mobile-title {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--color-text);
    font-size: 15px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agent-row,
  .connected-card,
  .danger-card,
  .email-row,
  .section-header,
  .activity-row,
  .mailbox-source-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .alias-field {
    flex-wrap: wrap;
  }

  .mailbox-source-form {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .recommended-card {
    background: rgba(46, 125, 50, 0.14);
    border-color: rgba(129, 199, 132, 0.32);
  }

  .recommended-pill {
    color: #c8e6c9;
  }
}
</style>
