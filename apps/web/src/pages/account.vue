<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import CustomDomain from "../components/CustomDomain.vue";
import TelegramConnectPanel from "../components/TelegramConnectPanel.vue";
import UiIcon from "../components/UiIcon.vue";
import {
  useTheme,
  type ThemePreference,
} from "../composables/useTheme";
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
import {
  AI_AGENT_MODEL_OPTIONS,
  type AiAgentModelOption,
} from "../utils/aiModelCatalog";

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

type PluginStatus =
  | "available"
  | "installed"
  | "setup_required"
  | "disabled"
  | "coming_soon";

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
  releaseStage: "available" | "coming_soon";
  activationAllowed: boolean;
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

type EmailProviderId = "cloudflare-email" | "smtp" | "mailgun" | "postmark";

type EmailProviderSetupRequirement = {
  id: string;
  label: string;
  required: boolean;
  configured: boolean;
  note?: string;
};

type EmailProviderInputs = {
  transport: "binding" | "rest" | "smtp";
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  sendingDomain: string;
  accountId: string;
  messageStream: string;
  smtpHost: string;
  smtpPort: number | string;
  smtpSecurity: "starttls" | "tls" | "none";
  smtpUsername: string;
  mailgunRegion: "us" | "eu";
  apiToken: string;
};

type EmailProviderRecord = {
  id: EmailProviderId;
  label: string;
  description: string;
  recommended: boolean;
  stable: boolean;
  configured: boolean;
  setupRequired: boolean;
  statusLabel: string;
  source: "binding" | "stored" | "manual" | "not_configured";
  secretLabel: string | null;
  keyHint: string | null;
  keyUpdatedAt: string | null;
  lastStatus: "not_configured" | "ready" | "failed" | null;
  lastStatusCheckedAt: string | null;
  lastTestSentAt: string | null;
  lastTestError: string | null;
  setupRequirements: EmailProviderSetupRequirement[];
  config: EmailProviderInputs;
};

type FutureEmailProviderRecord = {
  id: "ses" | "resend" | "sendgrid";
  label: string;
  description: string;
};

type EmailProviderSettingsResponse = {
  encryptionConfigured: boolean;
  activeProviderId: EmailProviderId;
  providers: EmailProviderRecord[];
  futureProviders: FutureEmailProviderRecord[];
};

type EmailProviderTestResponse = {
  ok: true;
  auditId: string;
  providerId: EmailProviderId;
  providerLabel: string;
  providerMessageId: string | null;
  providerStatus: string | null;
  sentTo: string;
  sentAt: string;
};

type AppConnectionsResponse = {
  me3: {
    connected: boolean;
    origin: string;
    disconnectAvailable: boolean;
  };
};

const auth = useAuthStore();
const sites = useSitesStore();
const { themePreference, setThemePreference } = useTheme();
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
const mailboxAvailable = ref(false);
const mailbox = ref<MailboxRecord | null>(null);
const mailboxMessage = ref<string | null>(null);
const mailboxError = ref<string | null>(null);
const pluginsLoading = ref(false);
const plugins = ref<PluginRecord[]>([]);
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
const emailProviderLoading = ref(false);
const emailProviderSaving = ref(false);
const emailProviderTesting = ref(false);
const emailProviderEncryptionConfigured = ref(false);
const emailProviders = ref<EmailProviderRecord[]>([]);
const selectedEmailProviderId = ref<EmailProviderId>("smtp");
const emailProviderInputs = ref<Record<EmailProviderId, EmailProviderInputs>>(
  createEmptyEmailProviderInputs(),
);
const emailProviderTestTo = ref("");
const emailProviderMessage = ref<string | null>(null);
const emailProviderError = ref<string | null>(null);
const appConnectionsLoading = ref(false);
const appConnectionsSaving = ref(false);
const me3Connection = ref<AppConnectionsResponse["me3"] | null>(null);
const appConnectionsMessage = ref<string | null>(null);
const appConnectionsError = ref<string | null>(null);

const telegramPanelRef = ref<InstanceType<typeof TelegramConnectPanel> | null>(
  null,
);

const openSection = ref({
  email: true,
  appearance: false,
  connections: false,
  regional: false,
  domain: false,
  mailbox: false,
  telegram: false,
  ai: false,
  plugins: false,
});

const customDomainSiteUsername = computed(() => {
  const accountUsername = auth.user?.username || "";
  const accountSite = sites.sites.find((site) => site.username === accountUsername);
  const profileSite = sites.sites.find((site) => (site.site_type || "profile") === "profile");
  return accountSite?.username || profileSite?.username || sites.sites[0]?.username || "";
});

const customDomainSite = computed(() =>
  sites.sites.find((site) => site.username === customDomainSiteUsername.value),
);

const customDomainStatusLabel = computed(() => {
  const status = customDomainSite.value?.custom_domain_status;
  if (status === "active") return "Active";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  return "Not configured";
});

const customDomainStatusClass = computed(() => {
  const status = customDomainSite.value?.custom_domain_status;
  if (status === "active") return "active";
  if (status === "failed") return "failed";
  return "pending_setup";
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
    return "Set up domain routing for inbound mail.";
  }

  if (mailbox.value.status === "active") {
    return "Domain routing handles inbound mail.";
  }

  if (mailbox.value.status === "paused") {
    return "Mailbox paused.";
  }

  return "Domain routing setup required.";
});

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
    return `${setupRequired} needs setup`;
  }
  const enabled = plugins.value.filter((plugin) => plugin.enabled).length;
  const comingSoon = plugins.value.filter(isPluginComingSoon).length;
  if (enabled > 0 && comingSoon > 0) return `${enabled} on, ${comingSoon} soon`;
  if (enabled > 0) return `${enabled} on`;
  if (comingSoon > 0) return `${comingSoon} soon`;
  return `${plugins.value.length} off`;
});

const pluginSummaryStatusClass = computed(() => {
  if (plugins.value.some((plugin) => plugin.status === "setup_required")) {
    return "setup_required";
  }
  if (plugins.value.some((plugin) => plugin.status === "installed")) {
    return "active";
  }
  if (plugins.value.some(isPluginComingSoon)) {
    return "coming_soon";
  }
  return "available";
});

const aiDefaultRouteInput = computed(
  () => aiRouteInputs.value.default || { providerId: "", model: "" },
);

const selectedAgentModelOption = computed(
  () =>
    AI_AGENT_MODEL_OPTIONS.find(
      (option) =>
        option.providerId === aiDefaultRouteInput.value.providerId &&
        option.model === aiDefaultRouteInput.value.model,
    ) || null,
);

const selectedAgentProvider = computed(() =>
  aiProviders.value.find(
    (provider) => provider.id === aiDefaultRouteInput.value.providerId,
  ),
);

const visibleAiProviders = computed(() =>
  aiProviders.value.filter((provider) =>
    AI_AGENT_MODEL_OPTIONS.some((option) => option.providerId === provider.id),
  ),
);

const visibleAgentModelOptions = computed(() =>
  AI_AGENT_MODEL_OPTIONS.filter(
    (option) => option.providerId === aiDefaultRouteInput.value.providerId,
  ),
);

const selectedAgentModelDescription = computed(
  () =>
    selectedAgentModelOption.value?.description ||
    "Use this model for the ME3 agent.",
);

const selectedAgentModelCostLabel = computed(
  () => selectedAgentModelOption.value?.costLabel || "Paid",
);

const selectedProviderKeyInput = computed({
  get() {
    return aiProviderKeyInputs.value[aiDefaultRouteInput.value.providerId] || "";
  },
  set(value: string) {
    aiProviderKeyInputs.value = {
      ...aiProviderKeyInputs.value,
      [aiDefaultRouteInput.value.providerId]: value,
    };
  },
});

const selectedProviderNeedsKey = computed(
  () =>
    Boolean(selectedAgentProvider.value?.supportsApiKey) &&
    !selectedAgentProvider.value?.configured,
);

const aiAgentModelConfigured = computed(() => {
  const provider = selectedAgentProvider.value;
  return Boolean(provider?.configured && aiDefaultRouteInput.value.model.trim());
});

const aiSettingsSummaryLabel = computed(() => {
  if (aiSettingsLoading.value) return "Loading";
  if (aiAgentModelConfigured.value) {
    return "Agent model ready";
  }
  return "Setup required";
});

const aiSettingsSummaryStatusClass = computed(() =>
  aiAgentModelConfigured.value ? "active" : "setup_required",
);

const aiProviderKeyInputCount = computed(
  () =>
    Object.values(aiProviderKeyInputs.value).filter((value) => value.trim())
      .length,
);

const aiAgentModelInvalid = computed(
  () =>
    !aiDefaultRouteInput.value.providerId ||
    !aiDefaultRouteInput.value.model.trim(),
);

const aiSettingsSaveDisabled = computed(
  () =>
    aiSettingsSaving.value ||
    aiSettingsLoading.value ||
    aiAgentModelInvalid.value ||
    (selectedProviderNeedsKey.value && !selectedProviderKeyInput.value.trim()) ||
    (aiProviderKeyInputCount.value > 0 && !aiEncryptionConfigured.value),
);

const activeEmailProvider = computed(
  () =>
    emailProviders.value.find(
      (provider) => provider.id === selectedEmailProviderId.value,
    ) || null,
);

const activeEmailProviderInput = computed(
  () => emailProviderInputs.value[selectedEmailProviderId.value],
);

const emailProviderSummaryLabel = computed(() => {
  if (emailProviderLoading.value) return "Loading";
  const active = activeEmailProvider.value;
  if (active?.configured) return active.label;
  return "Setup required";
});

const emailProviderSummaryStatusClass = computed(() =>
  activeEmailProvider.value?.configured ? "active" : "setup_required",
);

const emailProviderHelpText = computed(() => {
  if (selectedEmailProviderId.value === "smtp") {
    return "Send through an authenticated SMTP relay on port 587, 465, or 2525. Port 25 is blocked in the Worker runtime.";
  }
  if (selectedEmailProviderId.value === "mailgun") {
    return "Send through Mailgun's HTTP API with a verified sending domain and owner-supplied API key.";
  }
  if (selectedEmailProviderId.value === "postmark") {
    return "Send through Postmark with a Server API token and a confirmed sender signature or verified domain.";
  }
  return "Send with Cloudflare Email Service using a verified sending address or domain.";
});

const emailProviderSecretPlaceholder = computed(() => {
  const hasStoredSecret = Boolean(activeEmailProvider.value?.keyHint);
  if (selectedEmailProviderId.value === "smtp") {
    return hasStoredSecret
      ? "Paste a new password to replace stored value"
      : "Paste SMTP password";
  }
  if (selectedEmailProviderId.value === "mailgun") {
    return hasStoredSecret
      ? "Paste a new API key to replace stored value"
      : "Paste Mailgun API key";
  }
  return hasStoredSecret
    ? "Paste a new token to replace stored value"
    : "Paste provider token";
});

const emailProviderApiTokenCount = computed(
  () =>
    Object.values(emailProviderInputs.value).filter((value) =>
      value.apiToken.trim(),
    ).length,
);

const emailProviderSaveDisabled = computed(() => {
  const input = activeEmailProviderInput.value;
  return (
    emailProviderSaving.value ||
    emailProviderLoading.value ||
    !input.fromAddress.trim() ||
    (emailProviderApiTokenCount.value > 0 &&
      !emailProviderEncryptionConfigured.value)
  );
});

const emailProviderTestDisabled = computed(
  () =>
    emailProviderTesting.value ||
    emailProviderLoading.value ||
    !activeEmailProvider.value?.configured ||
    !emailProviderTestTo.value.trim(),
);

const me3ConnectionStatusLabel = computed(() => {
  if (appConnectionsLoading.value) return "Loading";
  return me3Connection.value?.connected ? "Connected" : "Not connected";
});

const me3ConnectionStatusClass = computed(() =>
  me3Connection.value?.connected ? "active" : "pending_setup",
);

const themePreferenceLabel = computed(() => {
  if (themePreference.value === "light") return "Light";
  if (themePreference.value === "dark") return "Dark";
  return "System";
});

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  icon: "Sun" | "Monitor" | "Moon";
}> = [
  {
    value: "light",
    label: "Light",
    icon: "Sun",
  },
  {
    value: "system",
    label: "System",
    icon: "Monitor",
  },
  {
    value: "dark",
    label: "Dark",
    icon: "Moon",
  },
];

function chooseThemePreference(nextTheme: ThemePreference) {
  setThemePreference(nextTheme);
}

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
  mailbox.value = response.mailbox;
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

async function loadPlugins() {
  pluginsLoading.value = true;
  pluginsError.value = null;
  pluginMessage.value = null;

  try {
    const response = await api.get<PluginsResponse>("/plugins");
    plugins.value = response.plugins || [];
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
  window.dispatchEvent(new CustomEvent("me3:plugins-changed"));
}

function pluginActionKey(plugin: PluginRecord, action: "activate" | "deactivate") {
  return `${plugin.id}:${action}`;
}

function pluginInfoText(plugin: PluginRecord) {
  if (isPluginComingSoon(plugin)) {
    return `${plugin.description} This plugin is hidden for launch and will be available in a later release.`;
  }
  if (plugin.id === "me3.social-publishing") {
    return "Adds social account connection and approval-first publishing.";
  }
  return plugin.description;
}

function pluginStatusLabel(plugin: PluginRecord) {
  if (isPluginComingSoon(plugin)) return "Coming soon";
  if (plugin.status === "installed") return "On";
  if (plugin.status === "setup_required") return "Needs setup";
  if (plugin.status === "disabled") return "Off";
  return "Off";
}

function isPluginComingSoon(plugin: PluginRecord) {
  return (
    plugin.status === "coming_soon" ||
    plugin.releaseStage === "coming_soon" ||
    plugin.activationAllowed === false
  );
}

function canActivatePlugin(plugin: PluginRecord) {
  return (
    !isPluginComingSoon(plugin) &&
    (plugin.status === "available" || plugin.status === "disabled")
  );
}

function canDeactivatePlugin(plugin: PluginRecord) {
  return !isPluginComingSoon(plugin) && !canActivatePlugin(plugin);
}

function visiblePluginSetupRequirements(plugin: PluginRecord) {
  return plugin.setupRequirements.filter(
    (requirement) => requirement.required || !requirement.configured,
  );
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

function applyAgentModelOption(option: AiAgentModelOption) {
  aiRouteInputs.value.default = {
    providerId: option.providerId,
    model: option.model,
  };
}

function handleAgentProviderChange(providerId: string) {
  const firstModel =
    AI_AGENT_MODEL_OPTIONS.find((option) => option.providerId === providerId) ||
    AI_AGENT_MODEL_OPTIONS[0];
  applyAgentModelOption(firstModel);
}

function handleAgentModelChange(model: string) {
  const option = visibleAgentModelOptions.value.find(
    (candidate) => candidate.model === model,
  );
  if (option) {
    applyAgentModelOption(option);
    return;
  }
  aiRouteInputs.value.default.model = model;
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
  const agentModel = {
    providerId: aiDefaultRouteInput.value.providerId,
    model: aiDefaultRouteInput.value.model.trim(),
  };
  const defaults = Object.fromEntries(
    (["default", "chat", "reasoning", "extraction"] as AiRouteId[]).map((routeId) => [
      routeId,
      agentModel,
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

function createDefaultEmailProviderInput(
  id: EmailProviderId,
): EmailProviderInputs {
  return {
    transport:
      id === "cloudflare-email" ? "binding" : id === "smtp" ? "smtp" : "rest",
    fromAddress: "",
    fromName: "ME3 Core",
    replyToAddress: "",
    sendingDomain: "",
    accountId: "",
    messageStream: id === "postmark" ? "outbound" : "",
    smtpHost: "",
    smtpPort: id === "smtp" ? 587 : "",
    smtpSecurity: id === "smtp" ? "starttls" : "none",
    smtpUsername: "",
    mailgunRegion: "us",
    apiToken: "",
  };
}

function createEmptyEmailProviderInputs(): Record<
  EmailProviderId,
  EmailProviderInputs
> {
  return {
    "cloudflare-email": createDefaultEmailProviderInput("cloudflare-email"),
    smtp: createDefaultEmailProviderInput("smtp"),
    mailgun: createDefaultEmailProviderInput("mailgun"),
    postmark: createDefaultEmailProviderInput("postmark"),
  };
}

function syncEmailProviderSettings(response: EmailProviderSettingsResponse) {
  emailProviderEncryptionConfigured.value = response.encryptionConfigured;
  emailProviders.value = response.providers || [];
  selectedEmailProviderId.value = response.activeProviderId || "smtp";
  emailProviderInputs.value = createEmptyEmailProviderInputs();

  for (const provider of emailProviders.value) {
    emailProviderInputs.value[provider.id] = {
      ...createDefaultEmailProviderInput(provider.id),
      ...provider.config,
      apiToken: "",
    };
  }

  emailProviderTestTo.value = auth.user?.email || "";
}

async function loadEmailProviderSettings() {
  emailProviderLoading.value = true;
  emailProviderError.value = null;

  try {
    const response = await api.get<EmailProviderSettingsResponse>(
      "/email-provider-settings",
    );
    syncEmailProviderSettings(response);
  } catch (e: any) {
    emailProviderError.value = e.message || "Failed to load email sender settings";
  } finally {
    emailProviderLoading.value = false;
  }
}

async function saveEmailProviderSettings() {
  if (emailProviderSaveDisabled.value) return;

  emailProviderSaving.value = true;
  emailProviderMessage.value = null;
  emailProviderError.value = null;

  const input = activeEmailProviderInput.value;
  try {
    const response = await api.put<EmailProviderSettingsResponse>(
      "/email-provider-settings",
      {
        activeProviderId: selectedEmailProviderId.value,
        providers: [
          {
            id: selectedEmailProviderId.value,
            transport: input.transport,
            fromAddress: input.fromAddress,
            fromName: input.fromName,
            replyToAddress: input.replyToAddress || "",
            sendingDomain: input.sendingDomain || "",
            accountId: input.accountId || "",
            messageStream: input.messageStream || "outbound",
            smtpHost: input.smtpHost || "",
            smtpPort: input.smtpPort || "",
            smtpSecurity: input.smtpSecurity || "starttls",
            smtpUsername: input.smtpUsername || "",
            mailgunRegion: input.mailgunRegion || "us",
            apiToken: input.apiToken.trim() || undefined,
          },
        ],
      },
    );
    syncEmailProviderSettings(response);
    emailProviderMessage.value = "Email sender settings saved.";
  } catch (e: any) {
    emailProviderError.value = e.message || "Failed to save email sender settings";
  } finally {
    emailProviderSaving.value = false;
  }
}

async function sendEmailProviderTestMessage() {
  if (emailProviderTestDisabled.value) return;

  emailProviderTesting.value = true;
  emailProviderMessage.value = null;
  emailProviderError.value = null;

  try {
    const response = await api.post<EmailProviderTestResponse>(
      "/email-provider-settings/test",
      {
        providerId: selectedEmailProviderId.value,
        to: emailProviderTestTo.value,
      },
    );
    await loadEmailProviderSettings();
    emailProviderMessage.value = response.providerMessageId
      ? `Test email sent to ${response.sentTo}. Provider message ${response.providerMessageId}.`
      : `Test email accepted for ${response.sentTo}.`;
  } catch (e: any) {
    emailProviderError.value = e.message || "Failed to send test email";
  } finally {
    emailProviderTesting.value = false;
  }
}

async function loadAppConnections() {
  appConnectionsLoading.value = true;
  appConnectionsError.value = null;

  try {
    const response = await api.get<AppConnectionsResponse>(
      "/account/app-connections",
    );
    me3Connection.value = response.me3;
  } catch (e: any) {
    appConnectionsError.value = e.message || "Failed to load app connections";
  } finally {
    appConnectionsLoading.value = false;
  }
}

async function connectMe3App() {
  if (appConnectionsSaving.value) return;

  appConnectionsSaving.value = true;
  appConnectionsMessage.value = null;
  appConnectionsError.value = null;

  try {
    const response = await api.post<{ ok: boolean; url?: string }>(
      "/account/app-connections/me3/start",
      { redirect: "/account?section=connections" },
    );
    if (response.ok && response.url) {
      window.location.href = response.url;
      return;
    }
    appConnectionsError.value = "ME3.app connection is not ready yet.";
  } catch (e: any) {
    appConnectionsError.value = e.message || "Failed to start ME3.app connection";
  } finally {
    appConnectionsSaving.value = false;
  }
}

async function disconnectMe3App() {
  if (appConnectionsSaving.value) return;

  appConnectionsSaving.value = true;
  appConnectionsMessage.value = null;
  appConnectionsError.value = null;

  try {
    await api.delete("/account/app-connections/me3");
    await loadAppConnections();
    appConnectionsMessage.value = "ME3.app disconnected.";
  } catch (e: any) {
    appConnectionsError.value = e.message || "Failed to disconnect ME3.app";
  } finally {
    appConnectionsSaving.value = false;
  }
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
  void sites.fetchSites();
  void loadMailbox();
  void loadAiSettings();
  void loadEmailProviderSettings();
  void loadPlugins();
  void loadAppConnections();
  if (route.query.section === "connections") {
    openSection.value.connections = true;
  }
  if (typeof route.query.me3_claim_error === "string") {
    openSection.value.connections = true;
    appConnectionsError.value = "ME3.app connection failed. Please try again.";
  }
  if (route.query.section === "telegram") {
    openSection.value.telegram = true;
  }
  if (route.query.section === "mailbox") {
    openSection.value.mailbox = true;
  }
  if (route.query.section === "domain" || route.query.section === "custom-domain") {
    openSection.value.domain = true;
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
            id="account-trigger-appearance"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.appearance"
            aria-controls="account-panel-appearance"
            @click="openSection.appearance = !openSection.appearance"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Appearance</h2>
              <span class="accordion-header-hint">
                {{ themePreferenceLabel }}
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-appearance"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-appearance"
            :hidden="!openSection.appearance"
          >
            <div
              class="theme-segmented"
              role="radiogroup"
              aria-label="Interface theme"
            >
              <button
                v-for="option in themeOptions"
                :key="option.value"
                type="button"
                class="theme-segmented__option"
                :class="{
                  'theme-segmented__option--active':
                    themePreference === option.value,
                }"
                role="radio"
                :aria-checked="themePreference === option.value"
                :aria-label="`${option.label} theme`"
                :title="`${option.label} theme`"
                @click="chooseThemePreference(option.value)"
              >
                <UiIcon :name="option.icon" :size="16" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <section class="card accordion-card">
          <button
            id="account-trigger-connections"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.connections"
            aria-controls="account-panel-connections"
            @click="openSection.connections = !openSection.connections"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>App connections</h2>
              <span class="status-badge" :class="me3ConnectionStatusClass">
                {{ me3ConnectionStatusLabel }}
              </span>
              <span class="accordion-header-hint">
                Connect this Core install to ME3.app sign-in
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-connections"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-connections"
            :hidden="!openSection.connections"
          >
            <div v-if="appConnectionsLoading" class="status-row">
              Loading app connections...
            </div>

            <template v-else>
              <div
                class="connection-row"
                :class="{ 'connection-row--connected': me3Connection?.connected }"
              >
                <div class="connection-row__body">
                  <span
                    class="status-badge compact"
                    :class="me3ConnectionStatusClass"
                  >
                    {{ me3ConnectionStatusLabel }}
                  </span>
                  <div>
                    <h3>ME3.app</h3>
                    <p>
                      {{
                        me3Connection?.connected
                          ? "ME3.app can be used to sign in to this Core install."
                          : "Link your ME3 account before ME3.app appears on the sign-in screen."
                      }}
                    </p>
                    <p v-if="me3Connection?.origin" class="field-hint">
                      Identity provider: {{ me3Connection.origin }}
                    </p>
                  </div>
                </div>

                <button
                  v-if="me3Connection?.connected"
                  class="button secondary connection-row__action"
                  type="button"
                  :disabled="
                    appConnectionsSaving || !me3Connection.disconnectAvailable
                  "
                  @click="disconnectMe3App"
                >
                  {{ appConnectionsSaving ? "Disconnecting..." : "Disconnect" }}
                </button>
                <button
                  v-else
                  class="button primary connection-row__action"
                  type="button"
                  :disabled="appConnectionsSaving"
                  @click="connectMe3App"
                >
                  {{ appConnectionsSaving ? "Opening..." : "Connect" }}
                </button>
              </div>

              <p
                v-if="
                  me3Connection?.connected && !me3Connection.disconnectAvailable
                "
                class="field-hint"
              >
                Add password authentication before disconnecting ME3.app.
              </p>
              <p v-if="appConnectionsMessage" class="success">
                {{ appConnectionsMessage }}
              </p>
              <p v-if="appConnectionsError" class="error">
                {{ appConnectionsError }}
              </p>
            </template>
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
            id="account-trigger-domain"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.domain"
            aria-controls="account-panel-domain"
            @click="openSection.domain = !openSection.domain"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Custom domain</h2>
              <span class="status-badge" :class="customDomainStatusClass">
                {{ customDomainStatusLabel }}
              </span>
              <span class="accordion-header-hint">
                Site and mailbox domain setup
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-domain"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-domain"
            :hidden="!openSection.domain"
          >
            <p class="hint">
              Connect the Cloudflare-managed domain people should use for your
              public ME3 site. The same domain can also be used for mailbox
              addresses after Email Routing is enabled.
            </p>

            <div v-if="sites.loading" class="status-row">
              Loading site domain settings...
            </div>
            <template v-else-if="customDomainSite">
              <CustomDomain
                :username="customDomainSite.username"
                :show-settings-link="false"
                @domain-status-changed="() => void sites.fetchSites()"
              />
            </template>
            <p v-else class="error">
              Create a ME3 site before connecting a custom domain.
            </p>
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
                <span
                  class="status-badge compact"
                  :class="emailProviderSummaryStatusClass"
                >
                  Sender: {{ emailProviderSummaryLabel }}
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
                Use the custom domain section to connect your domain, then
                enable Cloudflare Email Routing for the mailbox addresses you
                want ME3 to receive.
              </p>

              <div class="mailbox-panel compact-mailbox-panel">
                <div class="mailbox-panel-head">
                  <h3>Mailbox address</h3>
                  <span class="status-badge compact setup_required">
                    Domain routing required
                  </span>
                </div>
                <p class="field-hint">
                  Inbound mail uses Cloudflare Email Routing for an address on
                  your domain, routed to this Worker. The domain itself is
                  managed from Account.
                </p>
              </div>

              <div class="mailbox-panel outbound-sender-panel">
                <div class="mailbox-panel-head">
                  <h3>Send email with</h3>
                  <span
                    class="status-badge compact"
                    :class="emailProviderSummaryStatusClass"
                  >
                    {{ emailProviderSummaryLabel }}
                  </span>
                </div>

                <div v-if="emailProviderLoading" class="status-row">
                  Loading email sender settings...
                </div>

                <template v-else>
                  <p class="hint">
                    {{ emailProviderHelpText }}
                    <a
                      v-if="selectedEmailProviderId === 'cloudflare-email'"
                      href="https://developers.cloudflare.com/email-service/api/send-emails/workers-api/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Setup instructions
                    </a>
                  </p>

                  <p v-if="!emailProviderEncryptionConfigured" class="error">
                    Install encryption is required before provider tokens can be
                    saved.
                  </p>

                  <label class="field">
                    <span>Provider</span>
                    <select v-model="selectedEmailProviderId" class="input">
                      <option
                        v-for="provider in emailProviders"
                        :key="provider.id"
                        :value="provider.id"
                      >
                        {{ provider.label }}
                      </option>
                    </select>
                  </label>

                  <div v-if="activeEmailProvider" class="email-provider-config">
                    <div class="email-provider-fields">
                      <label class="field">
                        <span>From address</span>
                        <input
                          v-model="emailProviderInputs[selectedEmailProviderId].fromAddress"
                          class="input"
                          type="email"
                          placeholder="hello@example.com"
                        />
                      </label>

                      <label class="field">
                        <span>Display name</span>
                        <input
                          v-model="emailProviderInputs[selectedEmailProviderId].fromName"
                          class="input"
                          type="text"
                          placeholder="ME3 Core"
                        />
                      </label>

                      <label class="field">
                        <span>Reply-to address</span>
                        <input
                          v-model="emailProviderInputs[selectedEmailProviderId].replyToAddress"
                          class="input"
                          type="email"
                          placeholder="reply@example.com"
                        />
                      </label>

                      <template v-if="selectedEmailProviderId === 'smtp'">
                        <label class="field">
                          <span>SMTP host</span>
                          <input
                            v-model="emailProviderInputs[selectedEmailProviderId].smtpHost"
                            class="input"
                            type="text"
                            placeholder="smtp.example.com"
                            spellcheck="false"
                          />
                        </label>

                        <label class="field">
                          <span>Port</span>
                          <input
                            v-model.number="emailProviderInputs[selectedEmailProviderId].smtpPort"
                            class="input"
                            type="number"
                            inputmode="numeric"
                            min="1"
                            max="65535"
                            placeholder="587"
                          />
                        </label>

                        <label class="field">
                          <span>Security</span>
                          <select
                            v-model="emailProviderInputs[selectedEmailProviderId].smtpSecurity"
                            class="input"
                          >
                            <option value="starttls">STARTTLS</option>
                            <option value="tls">TLS</option>
                            <option value="none">None</option>
                          </select>
                        </label>

                        <label class="field">
                          <span>Username</span>
                          <input
                            v-model="emailProviderInputs[selectedEmailProviderId].smtpUsername"
                            class="input"
                            type="text"
                            autocomplete="username"
                            placeholder="smtp-user"
                            spellcheck="false"
                          />
                        </label>
                      </template>

                      <template v-if="selectedEmailProviderId === 'mailgun'">
                        <label class="field">
                          <span>Mailgun domain</span>
                          <input
                            v-model="emailProviderInputs[selectedEmailProviderId].sendingDomain"
                            class="input"
                            type="text"
                            placeholder="mg.example.com"
                            spellcheck="false"
                          />
                        </label>

                        <label class="field">
                          <span>Region</span>
                          <select
                            v-model="emailProviderInputs[selectedEmailProviderId].mailgunRegion"
                            class="input"
                          >
                            <option value="us">US</option>
                            <option value="eu">EU</option>
                          </select>
                        </label>
                      </template>

                      <label
                        v-if="
                          activeEmailProvider.secretLabel &&
                          selectedEmailProviderId !== 'cloudflare-email'
                        "
                        class="field"
                      >
                        <span>{{ activeEmailProvider.secretLabel }}</span>
                        <input
                          v-model="emailProviderInputs[selectedEmailProviderId].apiToken"
                          class="input"
                          type="password"
                          autocomplete="off"
                          spellcheck="false"
                          :placeholder="emailProviderSecretPlaceholder"
                        />
                        <p class="field-hint">
                          Existing secrets are encrypted at rest and never
                          returned to the browser.
                        </p>
                      </label>
                    </div>

                    <div class="button-row">
                      <button
                        class="button primary"
                        type="button"
                        :disabled="emailProviderSaveDisabled"
                        @click="saveEmailProviderSettings"
                      >
                        {{
                          emailProviderSaving
                            ? "Saving..."
                            : "Save sender settings"
                        }}
                      </button>
                      <button
                        class="button secondary"
                        type="button"
                        :disabled="emailProviderTestDisabled"
                        @click="sendEmailProviderTestMessage"
                      >
                        {{
                          emailProviderTesting
                            ? "Sending..."
                            : "Send test email"
                        }}
                      </button>
                    </div>

                    <p v-if="activeEmailProvider.lastTestError" class="error">
                      Last test failed:
                      {{ activeEmailProvider.lastTestError }}
                    </p>
                  </div>

                  <p v-if="emailProviderMessage" class="success">
                    {{ emailProviderMessage }}
                  </p>
                  <p v-if="emailProviderError" class="error">
                    {{ emailProviderError }}
                  </p>
                </template>
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
              <h2>ME3 agent model</h2>
              <span class="status-badge" :class="aiSettingsSummaryStatusClass">
                {{ aiSettingsSummaryLabel }}
              </span>
              <span class="accordion-header-hint">
                One model for the agent
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
                Choose how smart the ME3 agent should be. The default is free
                to run with Cloudflare Workers AI; paid models need your own API key.
              </p>

              <p
                v-if="!aiEncryptionConfigured"
                class="error"
              >
                Install encryption is created automatically during owner setup.
                If this remains visible, run the latest migrations and sign in
                or bootstrap again.
              </p>

              <div class="ai-routes-panel compact-ai-model-panel">
                <div class="ai-route-fields">
                  <label class="field">
                    <span>Provider</span>
                    <select
                      class="input"
                      :value="aiDefaultRouteInput.providerId"
                      @change="
                        handleAgentProviderChange(
                          ($event.target as HTMLSelectElement).value,
                        )
                      "
                    >
                      <option
                        v-for="provider in visibleAiProviders"
                        :key="provider.id"
                        :value="provider.id"
                      >
                        {{ provider.label }}
                      </option>
                    </select>
                  </label>

                  <label class="field">
                    <span>Model</span>
                    <select
                      class="input"
                      :value="aiDefaultRouteInput.model"
                      @change="
                        handleAgentModelChange(
                          ($event.target as HTMLSelectElement).value,
                        )
                      "
                    >
                      <option
                        v-for="option in visibleAgentModelOptions"
                        :key="option.id"
                        :value="option.model"
                      >
                        {{ option.label }} · {{ option.costLabel }}
                      </option>
                    </select>
                  </label>
                </div>

                <p class="selected-model-note">
                  <strong>{{ selectedAgentModelCostLabel }}</strong>
                  {{ selectedAgentModelDescription }}
                </p>

                <label
                  v-if="selectedAgentProvider?.supportsApiKey"
                  class="field"
                >
                  <span>{{ selectedAgentProvider.label }} API key</span>
                  <input
                    v-model="selectedProviderKeyInput"
                    class="input"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="
                      selectedAgentProvider.configured
                        ? 'Stored key available. Paste a new key to replace it.'
                        : 'Paste API key'
                    "
                  />
                  <p class="field-hint">
                    Required for paid models. Existing keys are never shown again.
                  </p>
                </label>
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
                      <p>{{ pluginInfoText(plugin) }}</p>
                    </div>
                    <div class="plugin-row__actions">
                      <span class="status-badge compact" :class="plugin.status">
                        {{ pluginStatusLabel(plugin) }}
                      </span>
                      <button
                        v-if="isPluginComingSoon(plugin)"
                        type="button"
                        class="button secondary plugin-action-button"
                        disabled
                      >
                        Coming soon
                      </button>
                      <button
                        v-else-if="canActivatePlugin(plugin)"
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
                        v-else-if="canDeactivatePlugin(plugin)"
                        type="button"
                        class="button secondary plugin-action-button"
                        :disabled="pluginActionLoading !== null"
                        @click="deactivatePlugin(plugin)"
                      >
                        {{
                          isPluginActionLoading(plugin, "deactivate")
                            ? "Deactivating..."
                            : "Deactivate"
                        }}
                      </button>
                    </div>
                  </div>

                  <details
                    v-if="visiblePluginSetupRequirements(plugin).length"
                    class="plugin-setup-details"
                  >
                    <summary>Setup</summary>
                    <ul class="plugin-setup-list">
                      <li
                        v-for="requirement in visiblePluginSetupRequirements(plugin)"
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
                  </details>
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

.theme-segmented {
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: fit-content;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.theme-segmented__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.theme-segmented__option:hover,
.theme-segmented__option:focus-visible {
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.theme-segmented__option:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-accent));
  outline-offset: 2px;
}

.theme-segmented__option--active {
  border-color: color-mix(
    in oklab,
    var(--ui-accent, var(--color-accent)) 38%,
    var(--ui-border, var(--color-border))
  );
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  box-shadow: var(--ui-shadow-sm, var(--shadow-soft));
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

.mailbox-panel h4 {
  margin: 0;
  font-size: 14px;
}

.mailbox-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.connection-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.connection-row--connected {
  border-color: color-mix(
    in oklab,
    var(--ui-accent, #4caf50) 34%,
    var(--ui-border, var(--color-border))
  );
  background: color-mix(
    in oklab,
    var(--ui-accent, #4caf50) 12%,
    var(--ui-surface, var(--color-bg))
  );
}

.connection-row__body {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.connection-row h3 {
  margin: 0;
  color: var(--ui-text, var(--color-text));
  font-size: 16px;
}

.connection-row p {
  margin: 4px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  line-height: 1.45;
}

.connection-row__action {
  flex: 0 0 auto;
}

.outbound-sender-panel {
  display: grid;
  gap: 14px;
}

.email-provider-config {
  display: grid;
  gap: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.email-provider-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.plugin-list {
  display: grid;
  gap: 10px;
}

.plugin-row {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface, var(--color-bg));
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

.plugin-row__badges,
.plugin-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.plugin-action-button {
  min-height: 30px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.2;
}

.plugin-setup-details {
  width: fit-content;
}

.plugin-setup-details summary {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 10px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 8px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}

.plugin-setup-details summary::-webkit-details-marker {
  display: none;
}

.plugin-setup-details[open] {
  width: 100%;
}

.plugin-setup-details[open] summary {
  margin-bottom: 10px;
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

.ai-routes-panel h3 {
  margin: 0;
  color: var(--ui-text, var(--color-text));
  font-size: 16px;
}

.ai-routes-panel {
  display: grid;
  gap: 14px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
}

.ai-route-fields {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 10px;
}

.selected-model-note {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  line-height: 1.5;
}

.selected-model-note strong {
  display: inline-flex;
  margin-right: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--ui-accent-soft, rgba(76, 175, 80, 0.1));
  color: var(--ui-accent-strong, #2e7d32);
  font-size: 12px;
}

.compact-ai-model-panel {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
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

.status-badge.coming_soon {
  background: rgba(90, 101, 116, 0.14);
  color: var(--color-text-muted);
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
  .connection-row,
  .connection-row__body,
  .plugin-row__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .plugin-row__badges {
    justify-content: flex-start;
  }

  .plugin-meta-grid,
  .plugin-detail-grid,
  .email-provider-fields {
    grid-template-columns: 1fr;
  }

  .ai-route-fields {
    grid-template-columns: 1fr;
  }

  .email-row .button,
  .connection-row__action,
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
