<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import TelegramConnectPanel from "../components/TelegramConnectPanel.vue";
import { useAuthStore } from "../stores/auth";
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
    description: "Manage your local ME3 Core account settings.",
    robots: "noindex,follow",
  },
});

type AccountResponse = {
  user: {
    id: string;
    email: string | null;
    name: string;
    username: string;
    timezone: string | null;
    locale: string;
    localeSource: "explicit" | "inferred";
  };
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
  subject: string;
  preview: string;
  forwardedTo: string | null;
  errorMessage: string | null;
  receivedAt: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

type MailboxSource = {
  id: string;
  type: "me3_alias" | "custom_domain" | "external_forward";
  address: string;
  status: "pending" | "active" | "paused" | "failed";
  inboundEnabled: boolean;
  outboundEnabled: boolean;
};

type MailboxResponse = {
  tier: "core";
  available: boolean;
  approvalRequired: boolean;
  cloudflareManaged: boolean;
  suggestedAliasLocalPart: string;
  mailbox: MailboxRecord | null;
  sources: MailboxSource[];
  recentActivity: MailboxActivity[];
};

type PluginStatus = "available" | "installed" | "setup_required" | "disabled";

type PluginSetupRequirement = {
  id: string;
  label: string;
  kind: "package" | "secret" | "binding" | "migration" | "queue" | "cron";
  required: boolean;
  configured: boolean;
  note?: string;
};

type PluginRecord = {
  id: string;
  name: string;
  version: string;
  description: string;
  trustTier: "first_party" | "third_party";
  distribution: "workspace_package" | "npm_package" | "remote_bundle";
  implementationStatus: "catalog_only" | "bundled";
  status: PluginStatus;
  statusLabel: string;
  installed: boolean;
  enabled: boolean;
  capabilityIds: string[];
  permissions: { id: string; label: string }[];
  routes: { id: string; path: string; methods: string[]; auth: string }[];
  uiSlots: { id: string; slot: string; label: string }[];
  agentTools: {
    id: string;
    label: string;
    sideEffect: string;
    approvalMode: string;
  }[];
  secrets: { name: string; label: string; required: boolean }[];
  migrations: { id: string; path: string; destructive: false }[];
  queuesAndCrons: {
    id: string;
    kind: "queue" | "cron";
    binding?: string;
    schedule?: string;
  }[];
  setupRequirements: PluginSetupRequirement[];
  notes: string[];
};

type PluginsResponse = {
  catalogVersion: string;
  plugins: PluginRecord[];
};

type AiRouteId = "default" | "chat" | "reasoning" | "extraction";

type AiProviderRecord = {
  id: string;
  label: string;
  description: string;
  setupLabel: string;
  supportsApiKey: boolean;
  secretLabel: string | null;
  configured: boolean;
  setupRequired: boolean;
  statusLabel: string;
  source: "binding" | "environment" | "stored" | "not_configured";
  keyHint: string | null;
  keyUpdatedAt: string | null;
  recommendedModels: Record<AiRouteId, string>;
};

type AiRouteRecord = {
  id: AiRouteId;
  label: string;
  providerId: string;
  providerLabel: string;
  model: string;
  configured: boolean;
  setupRequired: boolean;
  source: "stored" | "environment" | "recommended";
};

type AiSettingsResponse = {
  encryptionConfigured: boolean;
  providers: AiProviderRecord[];
  routes: AiRouteRecord[];
  defaults: Record<AiRouteId, AiRouteRecord>;
};

type AiRouteInputs = Record<AiRouteId, { providerId: string; model: string }>;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const timezoneInput = ref("");
const savedTimezoneInput = ref("");
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const showDeleteModal = ref(false);
const deleteConfirmInput = ref("");
const deleteLoading = ref(false);
const deleteError = ref<string | null>(null);
const supportedTimeZones = listSupportedTimeZones();
const mailboxLoading = ref(false);
const mailboxSaving = ref(false);
const mailboxActivating = ref(false);
const mailboxPausing = ref(false);
const mailboxAvailable = ref(false);
const mailboxCloudflareManaged = ref(false);
const mailbox = ref<MailboxRecord | null>(null);
const mailboxAliasInput = ref("");
const mailboxForwardingEmail = ref("");
const mailboxForwardingEnabled = ref(false);
const mailboxSources = ref<MailboxSource[]>([]);
const mailboxRecentActivity = ref<MailboxActivity[]>([]);
const mailboxMessage = ref<string | null>(null);
const mailboxError = ref<string | null>(null);
const pluginsLoading = ref(false);
const plugins = ref<PluginRecord[]>([]);
const pluginCatalogVersion = ref("");
const pluginActionLoading = ref<string | null>(null);
const pluginMessage = ref<string | null>(null);
const pluginsError = ref<string | null>(null);
const aiSettingsLoading = ref(false);
const aiSettingsSaving = ref(false);
const aiProviders = ref<AiProviderRecord[]>([]);
const aiRoutes = ref<AiRouteRecord[]>([]);
const aiEncryptionConfigured = ref(false);
const aiProviderKeyInputs = ref<Record<string, string>>({});
const aiRouteInputs = ref<AiRouteInputs>(createEmptyAiRouteInputs());
const aiSettingsMessage = ref<string | null>(null);
const aiSettingsError = ref<string | null>(null);

const telegramPanelRef = ref<InstanceType<typeof TelegramConnectPanel> | null>(
  null,
);

const openSection = ref({
  email: true,
  regional: false,
  mailbox: false,
  telegram: false,
  ai: false,
  plugins: false,
});

const timezoneDisplay = computed(() => {
  const value = timezoneInput.value || auth.user?.timezone || "";
  if (!value || !isValidTimeZone(value)) return "UTC";
  return getTimeZoneDisplayLabel(value);
});

const saveDisabled = computed(
  () =>
    saving.value ||
    !timezoneInput.value ||
    !isValidTimeZone(timezoneInput.value) ||
    timezoneInput.value === savedTimezoneInput.value,
);

const mailboxConfigured = computed(() => mailbox.value !== null);

const mailboxAliasDomain = computed(() => {
  const address = mailbox.value?.aliasAddress || "";
  const atIndex = address.indexOf("@");
  return atIndex >= 0 ? address.slice(atIndex) : "@me3.local";
});

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
    return "Reserve a local Core alias for inbound capture and approval-first outbound drafts.";
  }

  if (mailbox.value.status === "active") {
    return mailbox.value.forwardingEnabled
      ? `Mail stays in ME3 Core and forwards a copy to ${mailbox.value.forwardingEmail}.`
      : "Mail is kept in ME3 Core without forwarding a copy.";
  }

  if (mailbox.value.status === "paused") {
    return "Mailbox capture is paused. Resume it when you want inbound mail handling again.";
  }

  return "Alias saved. Activate it when this Core install is ready to handle mailbox traffic.";
});

const mailboxSaveDisabled = computed(
  () =>
    mailboxSaving.value ||
    !mailboxAliasInput.value.trim() ||
    (mailboxForwardingEnabled.value && !mailboxForwardingEmail.value.trim()),
);

const telegramStatusLabel = computed(() => {
  const panel = telegramPanelRef.value;
  if (!panel) return "";
  return telegramAccordionStatusLabel(
    panel.available,
    panel.configured,
    panel.connection,
  );
});

const telegramStatusClass = computed(() => {
  const panel = telegramPanelRef.value;
  if (!panel) return "pending_setup";
  return telegramAccordionStatusClass(panel.available, panel.connection);
});

const pluginSummaryLabel = computed(() => {
  if (pluginsLoading.value) return "Loading";
  if (plugins.value.length === 0) return "No plugins";
  const setupRequired = plugins.value.filter(
    (plugin) => plugin.status === "setup_required",
  ).length;
  if (setupRequired > 0) {
    return `${setupRequired} setup required`;
  }
  const installed = plugins.value.filter((plugin) => plugin.installed).length;
  if (installed > 0) return `${installed} installed`;
  return `${plugins.value.length} available`;
});

const pluginSummaryStatusClass = computed(() => {
  if (plugins.value.some((plugin) => plugin.status === "setup_required")) {
    return "setup_required";
  }
  if (plugins.value.some((plugin) => plugin.status === "installed")) {
    return "active";
  }
  return "available";
});

const aiConfiguredProviderCount = computed(
  () => aiProviders.value.filter((provider) => provider.configured).length,
);

const aiSettingsSummaryLabel = computed(() => {
  if (aiSettingsLoading.value) return "Loading";
  if (aiConfiguredProviderCount.value > 0) {
    return `${aiConfiguredProviderCount.value} configured`;
  }
  return "Setup required";
});

const aiSettingsSummaryStatusClass = computed(() =>
  aiConfiguredProviderCount.value > 0 ? "active" : "setup_required",
);

const aiProviderKeyInputCount = computed(
  () =>
    Object.values(aiProviderKeyInputs.value).filter((value) => value.trim())
      .length,
);

const aiRoutesInvalid = computed(() =>
  aiRoutes.value.some((route) => {
    const input = aiRouteInputs.value[route.id];
    return !input?.providerId || !input.model.trim();
  }),
);

const aiSettingsSaveDisabled = computed(
  () =>
    aiSettingsSaving.value ||
    aiSettingsLoading.value ||
    aiRoutesInvalid.value ||
    (aiProviderKeyInputCount.value > 0 && !aiEncryptionConfigured.value),
);

function syncAccount(response: AccountResponse) {
  auth.setSession({
    ...response.user,
    name: response.user.name ?? auth.user?.name ?? "ME3 Core Owner",
    username: response.user.username ?? auth.user?.username ?? "owner",
  });
  timezoneInput.value = response.user.timezone || "";
  savedTimezoneInput.value = timezoneInput.value;
}

async function loadAccount() {
  loading.value = true;
  error.value = null;
  try {
    const response = await api.get<AccountResponse>("/account");
    syncAccount(response);
  } catch (e: any) {
    error.value = e.message || "Failed to load account settings";
  } finally {
    loading.value = false;
  }
}

function detectTimezoneValue() {
  const detected = detectBrowserTimeZone();
  if (!detected || !isValidTimeZone(detected)) {
    error.value = "Could not detect a valid browser timezone.";
    return;
  }
  timezoneInput.value = detected;
  message.value = null;
  error.value = null;
}

async function saveSettings() {
  if (saveDisabled.value) return;
  saving.value = true;
  message.value = null;
  error.value = null;
  try {
    const response = await api.put<AccountResponse>("/account", {
      timezone: timezoneInput.value,
      locale: null,
    });
    syncAccount(response);
    message.value = "Regional settings updated.";
  } catch (e: any) {
    error.value = e.message || "Failed to save regional settings";
  } finally {
    saving.value = false;
  }
}

function syncMailboxInputs(response: MailboxResponse) {
  mailboxAvailable.value = response.available;
  mailboxCloudflareManaged.value = response.cloudflareManaged;
  mailbox.value = response.mailbox;
  mailboxAliasInput.value =
    response.mailbox?.aliasLocalPart || response.suggestedAliasLocalPart || "";
  mailboxForwardingEnabled.value = Boolean(response.mailbox?.forwardingEnabled);
  mailboxForwardingEmail.value =
    response.mailbox?.forwardingEmail || auth.user?.email || "";
  mailboxSources.value = response.sources || [];
  mailboxRecentActivity.value = response.recentActivity || [];
}

async function loadMailbox() {
  mailboxLoading.value = true;
  mailboxError.value = null;

  try {
    const response = await api.get<MailboxResponse>("/mailbox");
    syncMailboxInputs(response);
  } catch (e: any) {
    mailboxError.value = e.message || "Failed to load mailbox";
  } finally {
    mailboxLoading.value = false;
  }
}

async function refreshMailbox() {
  const response = await api.get<MailboxResponse>("/mailbox");
  syncMailboxInputs(response);
}

async function saveMailbox() {
  if (mailboxSaveDisabled.value) return;

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
      ? "Mailbox settings saved. Core will keep mail and forward a copy."
      : "Mailbox settings saved. New mail will stay in ME3 Core.";
  } catch (e: any) {
    mailboxError.value = e.message || "Failed to save mailbox";
  } finally {
    mailboxSaving.value = false;
  }
}

async function activateMailbox() {
  if (mailboxActivating.value || !mailboxConfigured.value) return;

  mailboxActivating.value = true;
  mailboxMessage.value = null;
  mailboxError.value = null;

  try {
    await api.post("/mailbox/activate", {});
    await refreshMailbox();
    mailboxMessage.value = "Mailbox activated.";
  } catch (e: any) {
    mailboxError.value = e.message || "Failed to activate mailbox";
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
  } catch (e: any) {
    mailboxError.value = e.message || "Failed to pause mailbox";
  } finally {
    mailboxPausing.value = false;
  }
}

async function loadPlugins() {
  pluginsLoading.value = true;
  pluginsError.value = null;
  pluginMessage.value = null;

  try {
    const response = await api.get<PluginsResponse>("/plugins");
    plugins.value = response.plugins || [];
    pluginCatalogVersion.value = response.catalogVersion || "";
  } catch (e: any) {
    pluginsError.value = e.message || "Failed to load plugins";
  } finally {
    pluginsLoading.value = false;
  }
}

function syncPlugin(plugin: PluginRecord) {
  const index = plugins.value.findIndex((candidate) => candidate.id === plugin.id);
  if (index >= 0) {
    plugins.value.splice(index, 1, plugin);
  } else {
    plugins.value.push(plugin);
  }
}

function pluginActionKey(plugin: PluginRecord, action: "activate" | "deactivate") {
  return `${plugin.id}:${action}`;
}

function isPluginActionLoading(
  plugin: PluginRecord,
  action: "activate" | "deactivate",
) {
  return pluginActionLoading.value === pluginActionKey(plugin, action);
}

async function activatePlugin(plugin: PluginRecord) {
  const key = pluginActionKey(plugin, "activate");
  pluginActionLoading.value = key;
  pluginsError.value = null;
  pluginMessage.value = null;

  try {
    const response = await api.post<{ plugin: PluginRecord }>(
      `/plugins/${encodeURIComponent(plugin.id)}/activate`,
      {},
    );
    syncPlugin(response.plugin);
    pluginMessage.value =
      response.plugin.status === "setup_required"
        ? `${response.plugin.name} activated. Setup is still required.`
        : `${response.plugin.name} activated.`;
  } catch (e: any) {
    pluginsError.value = e.message || "Failed to activate plugin";
  } finally {
    pluginActionLoading.value = null;
  }
}

async function deactivatePlugin(plugin: PluginRecord) {
  const key = pluginActionKey(plugin, "deactivate");
  pluginActionLoading.value = key;
  pluginsError.value = null;
  pluginMessage.value = null;

  try {
    const response = await api.post<{ plugin: PluginRecord }>(
      `/plugins/${encodeURIComponent(plugin.id)}/deactivate`,
      {},
    );
    syncPlugin(response.plugin);
    pluginMessage.value = `${response.plugin.name} disabled.`;
  } catch (e: any) {
    pluginsError.value = e.message || "Failed to deactivate plugin";
  } finally {
    pluginActionLoading.value = null;
  }
}

function createEmptyAiRouteInputs(): AiRouteInputs {
  return {
    default: { providerId: "", model: "" },
    chat: { providerId: "", model: "" },
    reasoning: { providerId: "", model: "" },
    extraction: { providerId: "", model: "" },
  };
}

function syncAiSettings(response: AiSettingsResponse) {
  aiProviders.value = response.providers || [];
  aiRoutes.value = response.routes || [];
  aiEncryptionConfigured.value = response.encryptionConfigured;
  aiProviderKeyInputs.value = Object.fromEntries(
    aiProviders.value
      .filter((provider) => provider.supportsApiKey)
      .map((provider) => [provider.id, ""]),
  );

  const nextRouteInputs = createEmptyAiRouteInputs();
  for (const route of aiRoutes.value) {
    nextRouteInputs[route.id] = {
      providerId: route.providerId,
      model: route.model,
    };
  }
  aiRouteInputs.value = nextRouteInputs;
}

async function loadAiSettings() {
  aiSettingsLoading.value = true;
  aiSettingsError.value = null;

  try {
    const response = await api.get<AiSettingsResponse>("/ai-settings");
    syncAiSettings(response);
  } catch (e: any) {
    aiSettingsError.value = e.message || "Failed to load AI provider settings";
  } finally {
    aiSettingsLoading.value = false;
  }
}

async function saveAiSettings() {
  if (aiSettingsSaveDisabled.value) return;

  aiSettingsSaving.value = true;
  aiSettingsMessage.value = null;
  aiSettingsError.value = null;

  const providers = Object.entries(aiProviderKeyInputs.value)
    .map(([id, apiKey]) => ({ id, apiKey: apiKey.trim() }))
    .filter((provider) => provider.apiKey);
  const defaults = Object.fromEntries(
    aiRoutes.value.map((route) => [
      route.id,
      {
        providerId: aiRouteInputs.value[route.id].providerId,
        model: aiRouteInputs.value[route.id].model.trim(),
      },
    ]),
  );

  try {
    const response = await api.put<AiSettingsResponse>("/ai-settings", {
      providers,
      defaults,
    });
    syncAiSettings(response);
    aiSettingsMessage.value = "AI provider settings saved.";
  } catch (e: any) {
    aiSettingsError.value = e.message || "Failed to save AI provider settings";
  } finally {
    aiSettingsSaving.value = false;
  }
}

function aiProviderSourceLabel(provider: AiProviderRecord): string {
  switch (provider.source) {
    case "binding":
      return "Binding";
    case "environment":
      return "Environment";
    case "stored":
      return provider.keyHint ? `Stored ${provider.keyHint}` : "Stored";
    default:
      return provider.setupLabel;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function logout() {
  await auth.logout();
  router.push("/");
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
  if (deleteConfirmInput.value.trim() !== "DELETE") {
    deleteError.value = 'Type "DELETE" to confirm.';
    return;
  }
  deleteLoading.value = true;
  deleteError.value = null;
  try {
    await api.post("/account/delete", {});
    await auth.logout();
    router.push("/");
  } catch (e: any) {
    deleteError.value = e.message || "Failed to delete account.";
  } finally {
    deleteLoading.value = false;
  }
}

onMounted(async () => {
  await loadAccount();
  void loadMailbox();
  void loadAiSettings();
  void loadPlugins();
  if (route.query.section === "telegram") {
    openSection.value.telegram = true;
  }
  if (route.query.section === "mailbox") {
    openSection.value.mailbox = true;
  }
  if (route.query.section === "plugins") {
    openSection.value.plugins = true;
  }
  if (route.query.section === "ai" || route.query.section === "providers") {
    openSection.value.ai = true;
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

      <div v-if="loading" class="status-row">Loading account...</div>

      <template v-else>
        <section class="card accordion-card">
          <button
            id="account-trigger-email"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.email"
            aria-controls="account-panel-email"
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
              <button class="button secondary" type="button" @click="logout">
                Sign out
              </button>
            </div>
          </div>
        </section>

        <section class="card accordion-card">
          <button
            id="account-trigger-regional"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.regional"
            aria-controls="account-panel-regional"
            @click="openSection.regional = !openSection.regional"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Regional settings</h2>
              <span class="accordion-header-hint">
                {{ timezoneDisplay }}
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-regional"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-regional"
            :hidden="!openSection.regional"
          >
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
                    v-for="zone in supportedTimeZones"
                    :key="zone"
                    :value="zone"
                  >
                    {{ getTimeZoneDisplayLabel(zone) }}
                  </option>
                </datalist>
              </label>
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
                :disabled="saveDisabled"
                @click="saveSettings"
              >
                {{ saving ? "Saving..." : "Save regional settings" }}
              </button>
            </div>

            <p v-if="message" class="success">{{ message }}</p>
            <p v-if="error" class="error">{{ error }}</p>
          </div>
        </section>

        <section class="card accordion-card">
          <button
            id="account-trigger-mailbox"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.mailbox"
            aria-controls="account-panel-mailbox"
            @click="openSection.mailbox = !openSection.mailbox"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Mailbox settings</h2>
              <template v-if="mailboxAvailable">
                <span
                  class="status-badge"
                  :class="mailbox?.status || 'pending_setup'"
                >
                  {{ mailboxStatusLabel }}
                </span>
                <span v-if="mailbox" class="status-pill">
                  {{
                    mailbox.forwardingStatus === "verified"
                      ? "Verified"
                      : "Local"
                  }}
                </span>
                <span class="accordion-header-hint">
                  {{ mailboxStatusHint }}
                </span>
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
            <div v-if="mailboxLoading" class="status-row">Loading mailbox...</div>

            <template v-else-if="mailboxAvailable">
              <p class="hint">
                Configure the Core-owned mailbox alias and delivery behavior for
                this install. Hosted billing and production Cloudflare routing
                stay outside the scaffold.
              </p>

              <div class="mailbox-grid">
                <label class="field">
                  <span>Alias</span>
                  <div class="alias-field">
                    <input
                      v-model="mailboxAliasInput"
                      class="input"
                      type="text"
                      placeholder="owner"
                      autocapitalize="off"
                      spellcheck="false"
                    />
                    <span class="alias-suffix">{{ mailboxAliasDomain }}</span>
                  </div>
                </label>

                <label class="field">
                  <span>Delivery</span>
                  <label class="mailbox-toggle">
                    <input v-model="mailboxForwardingEnabled" type="checkbox" />
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
                    Keep incoming mail in ME3 Core only.
                  </p>
                </label>
              </div>

              <div class="button-row">
                <button
                  class="button secondary"
                  type="button"
                  :disabled="mailboxSaveDisabled"
                  @click="saveMailbox"
                >
                  {{ mailboxSaving ? "Saving..." : "Save mailbox settings" }}
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
                      ? "Activating..."
                      : mailbox?.status === "paused"
                        ? "Resume mailbox"
                        : "Activate mailbox"
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

              <div v-if="mailbox" class="mailbox-panel">
                <div class="mailbox-panel-head">
                  <h3>Mailbox health</h3>
                  <span class="provider-meta">
                    {{ mailboxCloudflareManaged ? "Cloudflare managed" : "Core local" }}
                  </span>
                </div>
                <dl class="mailbox-health-list">
                  <div>
                    <dt>Alias address</dt>
                    <dd>{{ mailbox.aliasAddress }}</dd>
                  </div>
                  <div>
                    <dt>Inbound limit</dt>
                    <dd>{{ mailbox.dailyInboundLimit }} per day</dd>
                  </div>
                  <div>
                    <dt>Outbound limit</dt>
                    <dd>{{ mailbox.dailyOutboundLimit }} per day</dd>
                  </div>
                  <div>
                    <dt>Activated</dt>
                    <dd>{{ formatDateTime(mailbox.activatedAt) }}</dd>
                  </div>
                </dl>
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
                <div v-if="mailboxSources.length" class="mailbox-source-list">
                  <div
                    v-for="source in mailboxSources"
                    :key="source.id"
                    class="mailbox-source-row"
                  >
                    <div class="mailbox-source-main">
                      <strong>{{ source.address }}</strong>
                      <span class="provider-meta">
                        {{ source.type === "me3_alias" ? "ME3 alias" : source.type }}
                        · {{ source.status }}
                      </span>
                    </div>
                    <span
                      class="status-badge compact"
                      :class="source.status"
                    >
                      {{ source.outboundEnabled ? "Send enabled" : "Inbound" }}
                    </span>
                  </div>
                </div>
                <p v-else class="field-hint">
                  Custom source addresses are not configured in this Core
                  install yet. The default alias is available after mailbox
                  settings are saved.
                </p>
              </div>

              <div v-if="mailboxRecentActivity.length" class="mailbox-panel">
                <div class="mailbox-panel-head">
                  <h3>Recent activity</h3>
                  <router-link class="provider-meta" to="/email">
                    Open mailbox
                  </router-link>
                </div>
                <div class="activity-list">
                  <article
                    v-for="activity in mailboxRecentActivity.slice(0, 3)"
                    :key="activity.id"
                    class="activity-row"
                  >
                    <div class="activity-copy">
                      <strong>{{ activity.subject || "(No subject)" }}</strong>
                      <p>{{ activity.preview || activity.status }}</p>
                    </div>
                    <span class="status-badge compact" :class="activity.status">
                      {{ activity.status.replace(/_/g, " ") }}
                    </span>
                  </article>
                </div>
              </div>

              <p v-if="mailboxMessage" class="success">{{ mailboxMessage }}</p>
              <p v-if="mailboxError" class="error">{{ mailboxError }}</p>
            </template>

            <p v-else class="error">
              Mailbox configuration is not available in this Core install.
            </p>
          </div>
        </section>

        <section class="card accordion-card">
          <button
            id="account-trigger-telegram"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.telegram"
            aria-controls="account-panel-telegram"
            @click="openSection.telegram = !openSection.telegram"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Telegram settings</h2>
              <span
                v-if="telegramPanelRef?.available"
                class="status-badge"
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

        <section class="card accordion-card">
          <button
            id="account-trigger-ai"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.ai"
            aria-controls="account-panel-ai"
            @click="openSection.ai = !openSection.ai"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>AI model providers</h2>
              <span class="status-badge" :class="aiSettingsSummaryStatusClass">
                {{ aiSettingsSummaryLabel }}
              </span>
              <span class="accordion-header-hint">
                Chat, extraction, and reasoning defaults
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-ai"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-ai"
            :hidden="!openSection.ai"
          >
            <div v-if="aiSettingsLoading" class="status-row">
              Loading AI provider settings...
            </div>

            <template v-else>
              <p v-if="aiSettingsError" class="error">
                {{ aiSettingsError }}
              </p>

              <p class="hint">
                Keep owner-supplied provider keys in encrypted Core storage and
                choose the default model route for each agent workload. Workers
                AI uses the local Cloudflare binding when it is available.
              </p>

              <p
                v-if="!aiEncryptionConfigured"
                class="error"
              >
                TOKEN_ENCRYPTION_KEY is required before API keys can be saved.
              </p>

              <div class="ai-provider-list">
                <article
                  v-for="provider in aiProviders"
                  :key="provider.id"
                  class="ai-provider-row"
                >
                  <div class="ai-provider-row__header">
                    <div class="ai-provider-copy">
                      <h3>{{ provider.label }}</h3>
                      <p>{{ provider.description }}</p>
                    </div>
                    <div class="plugin-row__badges">
                      <span
                        class="status-badge compact"
                        :class="provider.configured ? 'active' : 'setup_required'"
                      >
                        {{ provider.statusLabel }}
                      </span>
                      <span class="status-pill">
                        {{ aiProviderSourceLabel(provider) }}
                      </span>
                    </div>
                  </div>

                  <label v-if="provider.supportsApiKey" class="field">
                    <span>{{ provider.secretLabel || "API key" }}</span>
                    <input
                      v-model="aiProviderKeyInputs[provider.id]"
                      class="input"
                      type="password"
                      autocomplete="off"
                      spellcheck="false"
                      :placeholder="
                        provider.configured
                          ? 'Paste a new key to replace the stored value'
                          : 'Paste provider API key'
                      "
                    />
                    <p class="field-hint">
                      Existing keys are never returned to the browser.
                    </p>
                  </label>
                </article>
              </div>

              <div class="ai-routes-panel">
                <div class="mailbox-panel-head">
                  <h3>Model defaults</h3>
                  <span class="provider-meta">
                    {{ aiRoutes.length }} routes
                  </span>
                </div>

                <div class="ai-route-list">
                  <label
                    v-for="routeRecord in aiRoutes"
                    :key="routeRecord.id"
                    class="field ai-route-row"
                  >
                    <span>{{ routeRecord.label }}</span>
                    <div class="ai-route-fields">
                      <select
                        v-model="aiRouteInputs[routeRecord.id].providerId"
                        class="input"
                      >
                        <option
                          v-for="provider in aiProviders"
                          :key="provider.id"
                          :value="provider.id"
                        >
                          {{ provider.label }}
                        </option>
                      </select>
                      <input
                        v-model="aiRouteInputs[routeRecord.id].model"
                        class="input"
                        type="text"
                        placeholder="Model name"
                        spellcheck="false"
                      />
                    </div>
                  </label>
                </div>
              </div>

              <div class="button-row">
                <button
                  class="button primary"
                  type="button"
                  :disabled="aiSettingsSaveDisabled"
                  @click="saveAiSettings"
                >
                  {{ aiSettingsSaving ? "Saving..." : "Save AI settings" }}
                </button>
              </div>

              <p v-if="aiSettingsMessage" class="success">
                {{ aiSettingsMessage }}
              </p>
            </template>
          </div>
        </section>

        <section class="card accordion-card">
          <button
            id="account-trigger-plugins"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.plugins"
            aria-controls="account-panel-plugins"
            @click="openSection.plugins = !openSection.plugins"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Plugins</h2>
              <span class="status-badge" :class="pluginSummaryStatusClass">
                {{ pluginSummaryLabel }}
              </span>
              <span v-if="pluginCatalogVersion" class="accordion-header-hint">
                Catalog {{ pluginCatalogVersion }}
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-plugins"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-plugins"
            :hidden="!openSection.plugins"
          >
            <div v-if="pluginsLoading" class="status-row">Loading plugins...</div>
            <p v-else-if="pluginsError" class="error">{{ pluginsError }}</p>

            <template v-else>
              <p class="hint">
                Curated first-party packages can declare their routes, secrets,
                migrations, UI slots, and agent tools before they are bundled
                into Core.
              </p>
              <p v-if="pluginMessage" class="success">{{ pluginMessage }}</p>

              <div v-if="plugins.length" class="plugin-list">
                <article
                  v-for="plugin in plugins"
                  :key="plugin.id"
                  class="plugin-row"
                >
                  <div class="plugin-row__header">
                    <div class="plugin-row__title">
                      <h3>{{ plugin.name }}</h3>
                      <p>{{ plugin.description }}</p>
                    </div>
                    <div class="plugin-row__badges">
                      <span class="status-badge compact" :class="plugin.status">
                        {{ plugin.statusLabel }}
                      </span>
                      <span class="status-pill">
                        {{
                          plugin.implementationStatus === "bundled"
                            ? "Bundled"
                            : "Catalog only"
                        }}
                      </span>
                      <button
                        v-if="plugin.status === 'available' || plugin.status === 'disabled'"
                        type="button"
                        class="button primary plugin-action-button"
                        :disabled="pluginActionLoading !== null"
                        @click="activatePlugin(plugin)"
                      >
                        {{
                          isPluginActionLoading(plugin, "activate")
                            ? "Activating..."
                            : "Activate"
                        }}
                      </button>
                      <button
                        v-else
                        type="button"
                        class="button secondary plugin-action-button"
                        :disabled="pluginActionLoading !== null"
                        @click="deactivatePlugin(plugin)"
                      >
                        {{
                          isPluginActionLoading(plugin, "deactivate")
                            ? "Disabling..."
                            : "Deactivate"
                        }}
                      </button>
                    </div>
                  </div>

                  <dl class="plugin-meta-grid">
                    <div>
                      <dt>Trust</dt>
                      <dd>{{ plugin.trustTier.replace(/_/g, " ") }}</dd>
                    </div>
                    <div>
                      <dt>Routes</dt>
                      <dd>{{ plugin.routes.length }}</dd>
                    </div>
                    <div>
                      <dt>Tools</dt>
                      <dd>{{ plugin.agentTools.length }}</dd>
                    </div>
                    <div>
                      <dt>Migrations</dt>
                      <dd>{{ plugin.migrations.length }}</dd>
                    </div>
                  </dl>

                  <div class="plugin-detail-grid">
                    <section class="plugin-detail-block">
                      <h4>Setup</h4>
                      <ul class="plugin-setup-list">
                        <li
                          v-for="requirement in plugin.setupRequirements"
                          :key="requirement.id"
                        >
                          <span
                            class="setup-dot"
                            :class="{
                              configured: requirement.configured,
                              optional: !requirement.required,
                            }"
                            aria-hidden="true"
                          />
                          <span>
                            {{ requirement.label }}
                            <small v-if="requirement.note">
                              {{ requirement.note }}
                            </small>
                          </span>
                        </li>
                      </ul>
                    </section>

                    <section class="plugin-detail-block">
                      <h4>Agent tools</h4>
                      <div class="plugin-chip-list">
                        <span
                          v-for="tool in plugin.agentTools"
                          :key="tool.id"
                          class="plugin-chip"
                        >
                          {{ tool.id }}
                        </span>
                      </div>
                    </section>
                  </div>

                  <div class="plugin-chip-list plugin-chip-list--muted">
                    <span
                      v-for="permission in plugin.permissions"
                      :key="permission.id"
                      class="plugin-chip"
                    >
                      {{ permission.label }}
                    </span>
                  </div>

                  <p v-for="note in plugin.notes" :key="note" class="field-hint">
                    {{ note }}
                  </p>
                </article>
              </div>

              <p v-else class="field-hint">
                No curated plugins are registered in this Core build.
              </p>
            </template>
          </div>
        </section>

        <section class="danger-section">
          <h2>Danger zone</h2>
          <div class="danger-card">
            <div>
              <strong>Delete your account</strong>
              <p>
                This will permanently delete your ME3 Core account, all of your
                sites, and associated data. This action cannot be undone.
              </p>
            </div>
            <button class="button danger" type="button" @click="openDeleteModal">
              Delete
            </button>
          </div>
        </section>
      </template>
    </main>

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
          This will permanently delete your ME3 Core account, all of your sites,
          and associated data. This cannot be undone.
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
  margin: 0 0 24px;
  font-size: 28px;
  line-height: 1.1;
}

.account-mobile-title {
  display: none;
}

.card {
  margin-bottom: 20px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg);
}

.accordion-card {
  padding: 0;
  overflow: hidden;
}

.accordion-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.accordion-trigger:hover {
  background: var(--color-bg-subtle);
}

.accordion-title-wrap h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.accordion-title-flex {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-width: 0;
}

.accordion-header-hint {
  flex: 1 1 200px;
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.35;
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

.email-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.email-row .input {
  flex: 1;
}

.hint {
  margin: 0 0 16px;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.5;
}

.field {
  display: grid;
  gap: 8px;
  color: var(--color-text);
  font-size: 14px;
}

.timezone-grid {
  display: grid;
  gap: 16px;
}

.mailbox-grid {
  display: grid;
  gap: 16px;
}

.alias-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alias-field .input {
  flex: 1;
}

.alias-suffix {
  color: var(--color-text-muted);
  font-size: 14px;
  white-space: nowrap;
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

.mailbox-panel {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
}

.mailbox-panel h3 {
  margin: 0;
  font-size: 16px;
}

.mailbox-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.provider-meta {
  color: var(--color-text-muted);
  font-size: 13px;
}

.mailbox-health-list {
  display: grid;
  gap: 10px;
  margin: 14px 0 0;
}

.mailbox-health-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.mailbox-health-list dt,
.mailbox-health-list dd {
  margin: 0;
}

.mailbox-health-list dt {
  color: var(--color-text-muted);
  font-size: 13px;
}

.mailbox-health-list dd {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
}

.mailbox-source-list,
.activity-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.mailbox-source-row,
.activity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
}

.mailbox-source-main,
.activity-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.mailbox-source-main strong,
.activity-copy strong {
  overflow-wrap: anywhere;
}

.activity-copy p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
}

.plugin-list {
  display: grid;
  gap: 14px;
}

.plugin-row {
  display: grid;
  gap: 14px;
  padding: 16px 0;
  border-top: 1px solid var(--color-border);
}

.plugin-row:first-child {
  border-top: none;
}

.plugin-row__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.plugin-row__title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.plugin-row h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 16px;
}

.plugin-row p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.plugin-row__badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.plugin-action-button {
  min-height: 28px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.2;
}

.plugin-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.plugin-meta-grid div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-subtle);
}

.plugin-meta-grid dt,
.plugin-meta-grid dd {
  margin: 0;
}

.plugin-meta-grid dt {
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.plugin-meta-grid dd {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
  text-transform: capitalize;
}

.plugin-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 14px;
}

.plugin-detail-block {
  min-width: 0;
}

.plugin-detail-block h4 {
  margin: 0 0 8px;
  color: var(--color-text);
  font-size: 13px;
}

.plugin-setup-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plugin-setup-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--color-text);
  font-size: 13px;
}

.plugin-setup-list small {
  display: block;
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.setup-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  margin-top: 5px;
  border-radius: 999px;
  background: #c62828;
}

.setup-dot.configured {
  background: #2e7d32;
}

.setup-dot.optional:not(.configured) {
  background: var(--color-text-muted);
}

.plugin-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plugin-chip-list--muted {
  padding-top: 2px;
}

.plugin-chip {
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.ai-provider-list {
  display: grid;
  gap: 14px;
}

.ai-provider-row {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.ai-provider-row__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.ai-provider-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.ai-provider-copy h3,
.ai-routes-panel h3 {
  margin: 0;
  color: var(--ui-text, var(--color-text));
  font-size: 16px;
}

.ai-provider-copy p {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  line-height: 1.5;
}

.ai-routes-panel {
  display: grid;
  gap: 14px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
}

.ai-route-list {
  display: grid;
  gap: 12px;
}

.ai-route-row {
  padding-top: 12px;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.ai-route-row:first-child {
  padding-top: 0;
  border-top: none;
}

.ai-route-fields {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 10px;
}

.recommended-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 12px;
  background: rgba(76, 175, 80, 0.08);
}

.recommended-card h3 {
  margin: 0;
  font-size: 16px;
}

.recommended-card .hint {
  margin-bottom: 0;
}

.recommended-pill {
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(46, 125, 50, 0.16);
  color: #2e7d32;
  font-size: 12px;
  font-weight: 700;
}

.input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  box-sizing: border-box;
}

.input:disabled {
  color: var(--color-text-muted);
  opacity: 1;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 16px 0 0;
}

.button {
  padding: 12px 18px;
  border: none;
  border-radius: 10px;
  font: inherit;
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
  cursor: not-allowed;
  opacity: 0.6;
}

.link-button-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  text-decoration: none;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-border);
  color: var(--color-text-muted);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.14);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}

.status-badge.active {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.installed {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.forwarded,
.status-badge.sent,
.status-badge.approved,
.status-badge.received {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.pending_setup,
.status-badge.setup_required,
.status-badge.pending,
.status-badge.pending_approval {
  background: rgba(255, 179, 0, 0.16);
  color: #9a6700;
}

.status-badge.paused,
.status-badge.disconnected,
.status-badge.rejected,
.status-badge.failed,
.status-badge.dropped {
  background: rgba(229, 57, 53, 0.14);
  color: #c62828;
}

.status-badge.compact {
  padding: 4px 8px;
  font-size: 11px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--color-text);
  color: var(--color-bg);
  font-size: 12px;
  font-weight: 700;
}

.success {
  margin: 12px 0 0;
  color: #2e7d32;
  font-size: 14px;
  font-weight: 600;
}

.error {
  margin: 12px 0 0;
  color: #e53935;
  font-size: 14px;
  font-weight: 600;
}

.danger-section {
  margin-top: 32px;
}

.danger-section h2 {
  margin: 0 0 12px;
  color: #e53935;
  font-size: 18px;
}

.danger-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid
    color-mix(in oklab, #e53935 34%, var(--color-border));
  border-radius: 12px;
  background: color-mix(in oklab, #e53935 12%, var(--color-bg-subtle));
}

.danger-card strong {
  color: var(--color-text);
  font-size: 14px;
}

.danger-card p {
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.modal {
  width: min(560px, 100%);
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg);
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
  line-height: 1;
  cursor: pointer;
}

.delete-confirm {
  display: grid;
  gap: 8px;
  margin: 16px 0;
}

.confirm-text {
  margin: 0;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
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

  .danger-card,
  .email-row,
  .mailbox-source-row,
  .activity-row,
  .ai-provider-row__header,
  .plugin-row__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .plugin-row__badges {
    justify-content: flex-start;
  }

  .plugin-meta-grid,
  .plugin-detail-grid {
    grid-template-columns: 1fr;
  }

  .ai-route-fields {
    grid-template-columns: 1fr;
  }

  .alias-field {
    flex-wrap: wrap;
  }

  .mailbox-health-list div {
    flex-direction: column;
    gap: 4px;
  }

  .mailbox-health-list dd {
    text-align: left;
  }

  .email-row .button,
  .danger-card .button {
    width: 100%;
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
