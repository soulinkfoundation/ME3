<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import CustomDomain from "../components/CustomDomain.vue";
import Button from "../components/Button.vue";
import PluginList from "../components/PluginList.vue";
import SoulinkConnectPanel from "../components/SoulinkConnectPanel.vue";
import StatusBadge from "../components/StatusBadge.vue";
import UiIcon from "../components/UiIcon.vue";
import { useTheme, type ThemePreference } from "../composables/useTheme";
import { useAuthStore } from "../stores/auth";
import { useSitesStore } from "../stores/sites";
import {
  detectBrowserTimeZone,
  getTimeZoneDisplayLabel,
  isValidTimeZone,
  listSupportedTimeZones,
} from "../utils/timezone";
import {
  AI_AGENT_MODEL_OPTIONS,
  type AiAgentModelOption,
} from "../utils/aiModelCatalog";
import {
  canActivatePlugin,
  isPluginComingSoon,
  isPluginEnabled,
  type PluginRecord,
  type PluginsResponse,
} from "../utils/plugins";

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

type LocalExecutorPairingInstructions = {
  code: string;
  sourceCommand: string;
  runCommand: string;
  keepAwakeCommand: string;
  expiresAt: string | null;
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

type AiGatewaySettingsResponse = {
  encryptionConfigured: boolean;
  configured: boolean;
  accountId: string;
  gatewayId: string;
  apiTokenHint: string | null;
  apiTokenUpdatedAt: string | null;
  routeWorkersAi: boolean;
  routeExternalProviders: boolean;
  source: "environment" | "stored" | "not_configured";
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

type CommerceSettingsResponse = {
  encryptionConfigured: boolean;
  stripe: {
    configured: boolean;
    source: "environment" | "stored" | "not_configured";
    keyHint: string | null;
    keyUpdatedAt: string | null;
    mode: "direct";
  };
};

type AssistantSetupItem = {
  id: "profile" | "email" | "mission-control";
  title: string;
  description: string;
  statusLabel: string;
  statusClass: string;
  actionLabel: string;
  icon: "UserRound" | "Mail" | "ClipboardCheck";
  done: boolean;
  optional?: boolean;
};

type AccountSection = "advanced" | "mailbox" | "plugins";

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
const mailboxSaving = ref(false);
const mailboxActivating = ref(false);
const mailboxAvailable = ref(false);
const mailbox = ref<MailboxRecord | null>(null);
const mailboxAliasInput = ref("");
const emailAddressInput = ref("");
const mailboxForwardingEnabled = ref(false);
const mailboxForwardingEmail = ref("");
const mailboxMessage = ref<string | null>(null);
const mailboxError = ref<string | null>(null);
const pluginsLoading = ref(false);
const plugins = ref<PluginRecord[]>([]);
const pluginActionLoading = ref<string | null>(null);
const pluginsError = ref<string | null>(null);
const localExecutorSetupOpen = ref(false);
const localExecutorPairing = ref<LocalExecutorPairingInstructions | null>(null);
const localExecutorPairingBusy = ref(false);
const localExecutorPairingError = ref<string | null>(null);
const localExecutorCopiedCommand = ref<string | null>(null);
const aiSettingsLoading = ref(false);
const aiSettingsSaving = ref(false);
const aiProviders = ref<AiProviderRecord[]>([]);
const aiRoutes = ref<AiRouteRecord[]>([]);
const aiEncryptionConfigured = ref(false);
const aiProviderKeyInputs = ref<Record<string, string>>({});
const aiRouteInputs = ref<AiRouteInputs>(createEmptyAiRouteInputs());
const aiSettingsMessage = ref<string | null>(null);
const aiSettingsError = ref<string | null>(null);
const aiGatewayLoading = ref(false);
const aiGatewaySaving = ref(false);
const aiGatewaySettings = ref<AiGatewaySettingsResponse | null>(null);
const aiGatewayAccountIdInput = ref("");
const aiGatewayIdInput = ref("");
const aiGatewayTokenInput = ref("");
const aiGatewayRouteWorkersAiInput = ref(true);
const aiGatewayRouteExternalProvidersInput = ref(true);
const aiGatewayMessage = ref<string | null>(null);
const aiGatewayError = ref<string | null>(null);
const emailProviderLoading = ref(false);
const emailProviderSaving = ref(false);
const emailProviderTesting = ref(false);
const emailProviderEncryptionConfigured = ref(false);
const emailProviders = ref<EmailProviderRecord[]>([]);
const selectedEmailProviderId = ref<EmailProviderId>("cloudflare-email");
const emailProviderInputs = ref<Record<EmailProviderId, EmailProviderInputs>>(
  createEmptyEmailProviderInputs(),
);
const emailProviderTestTo = ref("");
const emailProviderMessage = ref<string | null>(null);
const emailProviderError = ref<string | null>(null);
const appConnectionsLoading = ref(false);
const appConnectionsSaving = ref(false);
const me3Connection = ref<AppConnectionsResponse["me3"] | null>(null);
const appConnectionsError = ref<string | null>(null);
const commerceLoading = ref(false);
const commerceSaving = ref(false);
const commerceSettings = ref<CommerceSettingsResponse | null>(null);
const stripeSecretInput = ref("");
const commerceMessage = ref<string | null>(null);
const commerceError = ref<string | null>(null);

const soulinkPanelRef = ref<InstanceType<typeof SoulinkConnectPanel> | null>(
  null,
);

const openSection = ref({
  advanced: false,
  mailbox: false,
  plugins: false,
  signin: false,
});
const showAiModelSection = true;

const customDomainSiteUsername = computed(() => {
  const accountUsername = auth.user?.username || "";
  const accountSite = sites.sites.find(
    (site) => site.username === accountUsername,
  );
  const profileSite = sites.sites.find(
    (site) => (site.site_type || "profile") === "profile",
  );
  return (
    accountSite?.username ||
    profileSite?.username ||
    sites.sites[0]?.username ||
    ""
  );
});

const customDomainSite = computed(() =>
  sites.sites.find((site) => site.username === customDomainSiteUsername.value),
);

const profileSite = computed(() =>
  sites.sites.find((site) => (site.site_type || "profile") === "profile"),
);

const profileSetupReady = computed(() =>
  Boolean(profileSite.value?.published_at || profileSite.value),
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

const mailboxAliasNormalized = computed(() =>
  normalizeMailboxAlias(mailboxAliasInput.value),
);

const emailAddressNormalized = computed(() =>
  emailAddressInput.value.trim().toLowerCase(),
);

const emailAddressLocalPart = computed(() => {
  const [localPart = ""] = emailAddressNormalized.value.split("@");
  return normalizeMailboxAlias(localPart);
});

const emailAddressDomain = computed(() => {
  const [, domain = ""] = emailAddressNormalized.value.split("@");
  return normalizeEmailDomain(domain);
});

const emailAddressIsValid = computed(
  () =>
    isValidMailboxEmail(emailAddressNormalized.value) &&
    emailAddressLocalPart.value ===
      emailAddressNormalized.value.split("@")[0] &&
    Boolean(emailAddressDomain.value),
);

const emailDisplayName = computed(() => {
  const name = auth.user?.name?.trim() || "";
  return name === "ME3 Core Owner" ? "" : name;
});

const installationEmailDomain = computed(() => {
  const configuredDomain = customDomainSite.value?.custom_domain || "";
  return (
    normalizeEmailDomain(configuredDomain) ||
    inferEmailDomainFromHost(window.location.hostname)
  );
});

const mailboxRoutedAddress = computed(() => {
  const localPart =
    mailboxAliasNormalized.value || mailbox.value?.aliasLocalPart || "";
  if (localPart && installationEmailDomain.value) {
    return `${localPart}@${installationEmailDomain.value}`;
  }
  return "";
});

const customDomainSuggestedDomain = computed(
  () => customDomainSite.value?.custom_domain || emailAddressDomain.value || "",
);

const selectedProviderNeedsSecret = computed(() => {
  const active = activeEmailProvider.value;
  if (
    !active?.secretLabel ||
    selectedEmailProviderId.value === "cloudflare-email"
  ) {
    return false;
  }
  return !active.keyHint && !activeEmailProviderInput.value.apiToken.trim();
});

const emailProviderSpecificSettingsValid = computed(() => {
  const input = activeEmailProviderInput.value;
  if (selectedEmailProviderId.value === "smtp") {
    return Boolean(
      input.smtpHost.trim() &&
      input.smtpUsername.trim() &&
      Number(input.smtpPort) > 0 &&
      !selectedProviderNeedsSecret.value,
    );
  }
  if (selectedEmailProviderId.value === "mailgun") {
    return Boolean(
      input.sendingDomain.trim() && !selectedProviderNeedsSecret.value,
    );
  }
  if (selectedEmailProviderId.value === "postmark") {
    return !selectedProviderNeedsSecret.value;
  }
  return true;
});

const unifiedEmailSaveDisabled = computed(
  () =>
    mailboxSaving.value ||
    mailboxActivating.value ||
    emailProviderSaving.value ||
    mailboxLoading.value ||
    emailProviderLoading.value ||
    !mailboxAvailable.value ||
    !activeEmailProvider.value ||
    !emailAddressIsValid.value ||
    !emailProviderSpecificSettingsValid.value ||
    (emailProviderApiTokenCount.value > 0 &&
      !emailProviderEncryptionConfigured.value),
);

const soulinkStatusLabel = computed(() => {
  const panel = soulinkPanelRef.value;
  if (!panel) return "";
  if (!panel.available) return "Not available";
  if (!panel.configured) return "Needs setup";
  if (!panel.connection) return "Not connected";
  if (panel.connection.status === "active") return "Connected";
  if (panel.connection.status === "disconnected") return "Disconnected";
  return "Pending setup";
});

const soulinkStatusClass = computed(() => {
  const panel = soulinkPanelRef.value;
  if (!panel) return "pending_setup";
  if (!panel.available || !panel.connection) return "pending_setup";
  if (panel.connection.status === "disconnected") return "paused";
  return panel.connection.status;
});

const pluginSummaryLabel = computed(() => {
  if (pluginsLoading.value) return "Loading";
  const activeCount = plugins.value.filter((plugin) => plugin.enabled).length;
  return `${activeCount} active`;
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

const visibleAccountPlugins = computed(() =>
  plugins.value.filter((plugin) => !isPluginComingSoon(plugin)),
);

const pluginBusyIds = computed(() =>
  pluginActionLoading.value ? [pluginActionLoading.value.split(":")[0]] : [],
);

const localExecutorPlugin = computed(
  () =>
    plugins.value.find((plugin) => plugin.id === "me3.local-executor") || null,
);

const localExecutorPluginEnabled = computed(() =>
  Boolean(
    localExecutorPlugin.value && isPluginEnabled(localExecutorPlugin.value),
  ),
);

const localExecutorPairingExpiryLabel = computed(() =>
  formatLocalExecutorExpiry(localExecutorPairing.value?.expiresAt),
);

const localExecutorPairingCommand = computed(
  () => localExecutorPairing.value?.sourceCommand || "",
);

const missionControlPlugin = computed(
  () =>
    plugins.value.find((plugin) => plugin.id === "me3.mission-control") || null,
);

const missionControlReady = computed(() =>
  Boolean(
    missionControlPlugin.value?.enabled &&
    missionControlPlugin.value.status === "installed",
  ),
);

const missionControlActionLabel = computed(() => {
  const plugin = missionControlPlugin.value;
  if (pluginsLoading.value) return "Loading";
  if (missionControlReady.value) return "Open";
  if (plugin && canActivatePlugin(plugin)) return "Turn on";
  return "Review";
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
    return (
      aiProviderKeyInputs.value[aiDefaultRouteInput.value.providerId] || ""
    );
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
  return Boolean(
    provider?.configured && aiDefaultRouteInput.value.model.trim(),
  );
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
    (selectedProviderNeedsKey.value &&
      !selectedProviderKeyInput.value.trim()) ||
    (aiProviderKeyInputCount.value > 0 && !aiEncryptionConfigured.value),
);

const aiGatewaySaveDisabled = computed(
  () =>
    aiGatewaySaving.value ||
    aiGatewayLoading.value ||
    !aiGatewayAccountIdInput.value.trim() ||
    !aiGatewayIdInput.value.trim() ||
    (!aiGatewayTokenInput.value.trim() &&
      !Boolean(aiGatewaySettings.value?.apiTokenHint)) ||
    (!aiGatewaySettings.value?.apiTokenHint &&
      Boolean(aiGatewayTokenInput.value.trim()) &&
      !aiGatewaySettings.value?.encryptionConfigured),
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

const emailProviderTestDisabled = computed(
  () =>
    emailProviderTesting.value ||
    emailProviderLoading.value ||
    !activeEmailProvider.value?.configured ||
    !emailProviderTestTo.value.trim(),
);

const emailSetupReady = computed(() =>
  Boolean(
    mailbox.value?.status === "active" || activeEmailProvider.value?.configured,
  ),
);

const paymentsStatusLabel = computed(() => {
  if (commerceLoading.value) return "Loading";
  if (commerceSettings.value?.stripe.configured) return "Ready";
  return "Setup required";
});

const paymentsStatusClass = computed(() =>
  commerceSettings.value?.stripe.configured ? "active" : "setup_required",
);

const stripeSecretPlaceholder = computed(() => {
  const hint = commerceSettings.value?.stripe.keyHint;
  return hint ? `Paste a new key to replace ${hint}` : "sk_test_...";
});

const commerceSaveDisabled = computed(
  () =>
    commerceSaving.value ||
    commerceLoading.value ||
    !stripeSecretInput.value.trim(),
);

const commerceClearDisabled = computed(
  () => commerceSaving.value || commerceLoading.value,
);

const assistantSetupItems = computed<AssistantSetupItem[]>(() => [
  {
    id: "profile",
    title: "Create your profile",
    description:
      "Give ME3 the public identity and baseline context it needs to represent you.",
    statusLabel: profileSetupReady.value ? "Ready" : "Start here",
    statusClass: profileSetupReady.value ? "active" : "setup_required",
    actionLabel: profileSetupReady.value ? "Edit profile" : "Create profile",
    icon: "UserRound",
    done: profileSetupReady.value,
  },
  {
    id: "email",
    title: "Connect email",
    description:
      "Let the assistant work around real messages, drafts, and approvals.",
    statusLabel: emailSetupReady.value ? "Ready" : "Needs setup",
    statusClass: emailSetupReady.value ? "active" : "setup_required",
    actionLabel: "Set up email",
    icon: "Mail",
    done: emailSetupReady.value,
  },
  {
    id: "mission-control",
    title: "Open Mission Control",
    description:
      "Use the workspace for capture, tasks, projects, approvals, and memory.",
    statusLabel: missionControlReady.value ? "Ready" : "Needs setup",
    statusClass: missionControlReady.value ? "active" : "setup_required",
    actionLabel: missionControlActionLabel.value,
    icon: "ClipboardCheck",
    done: missionControlReady.value,
  },
]);

const me3ConnectionStatusLabel = computed(() => {
  if (appConnectionsLoading.value) return "Loading";
  return me3Connection.value?.connected ? "Connected" : "Not connected";
});

const me3ConnectionStatusClass = computed(() =>
  me3Connection.value?.connected ? "active" : "pending_setup",
);

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

function normalizeMailboxAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function isValidMailboxEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function normalizeEmailDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^[.-]+|[.-]+$/g, "");
}

function inferEmailDomainFromHost(hostname: string) {
  const normalized = normalizeEmailDomain(hostname);
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".workers.dev")
  ) {
    return "";
  }
  const parts = normalized.split(".");
  if (parts.length > 2 && ["me3", "api", "www"].includes(parts[0])) {
    return parts.slice(1).join(".");
  }
  return normalized;
}

function inferMailboxAlias() {
  return normalizeMailboxAlias(auth.user?.username || auth.user?.email || "");
}

function inferEmailAddressFromState() {
  const activeFromAddress =
    emailProviderInputs.value[selectedEmailProviderId.value]?.fromAddress || "";
  if (isValidMailboxEmail(activeFromAddress))
    return activeFromAddress.trim().toLowerCase();

  const cloudflareFromAddress =
    emailProviderInputs.value["cloudflare-email"]?.fromAddress || "";
  if (isValidMailboxEmail(cloudflareFromAddress)) {
    return cloudflareFromAddress.trim().toLowerCase();
  }

  if (mailboxRoutedAddress.value) return mailboxRoutedAddress.value;

  const localPart =
    mailboxAliasNormalized.value || mailbox.value?.aliasLocalPart || "";
  if (localPart && installationEmailDomain.value) {
    return `${localPart}@${installationEmailDomain.value}`;
  }

  return "";
}

function syncEmailAddressInput(force = false) {
  const inferred = inferEmailAddressFromState();
  if (inferred && (force || !emailAddressInput.value.trim())) {
    emailAddressInput.value = inferred;
  }
}

function openAccountSection(section: AccountSection) {
  openSection.value[section] = true;
}

async function handleAssistantSetupAction(item: AssistantSetupItem) {
  if (item.id === "profile") {
    await router.push("/create");
    return;
  }

  if (item.id === "email") {
    openAccountSection("mailbox");
    return;
  }

  if (missionControlReady.value) {
    await router.push("/mission-control");
    return;
  }

  const plugin = missionControlPlugin.value;
  if (plugin && canActivatePlugin(plugin)) {
    await activatePlugin(plugin);
    return;
  }

  openAccountSection("plugins");
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

async function ensureBrowserTimezoneSaved(response: AccountResponse) {
  if (response.user.timezone) return;

  const detected = detectBrowserTimeZone();
  if (!detected) return;

  timezoneInput.value = detected;
  try {
    const saved = await api.put<AccountResponse>("/account", {
      timezone: detected,
      locale: null,
    });
    syncAccount(saved);
  } catch {
    timezoneInput.value = response.user.timezone || "";
    savedTimezoneInput.value = timezoneInput.value;
  }
}

async function loadAccount() {
  loading.value = true;
  error.value = null;
  try {
    const response = await api.get<AccountResponse>("/account");
    syncAccount(response);
    await ensureBrowserTimezoneSaved(response);
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
  mailboxAliasInput.value =
    response.mailbox?.aliasLocalPart ||
    mailboxAliasInput.value ||
    response.suggestedAliasLocalPart ||
    inferMailboxAlias();
  mailboxForwardingEnabled.value = Boolean(response.mailbox?.forwardingEnabled);
  mailboxForwardingEmail.value =
    response.mailbox?.forwardingEmail || auth.user?.email || "";
  syncEmailAddressInput();
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

function buildEmailProviderUpdate(emailAddress: string) {
  const input = activeEmailProviderInput.value;
  const domain = normalizeEmailDomain(emailAddress.split("@")[1] || "");
  return {
    id: selectedEmailProviderId.value,
    transport:
      selectedEmailProviderId.value === "cloudflare-email"
        ? "binding"
        : input.transport,
    fromAddress: emailAddress,
    fromName: emailDisplayName.value,
    replyToAddress: emailAddress,
    sendingDomain:
      selectedEmailProviderId.value === "cloudflare-email"
        ? domain
        : input.sendingDomain || "",
    accountId: input.accountId || "",
    messageStream:
      selectedEmailProviderId.value === "postmark"
        ? input.messageStream || "outbound"
        : input.messageStream || "",
    smtpHost: input.smtpHost || "",
    smtpPort: input.smtpPort || "",
    smtpSecurity: input.smtpSecurity || "starttls",
    smtpUsername: input.smtpUsername || "",
    mailgunRegion: input.mailgunRegion || "us",
    apiToken: input.apiToken.trim() || undefined,
  };
}

async function saveUnifiedEmailSettings() {
  if (unifiedEmailSaveDisabled.value) return;

  mailboxSaving.value = true;
  emailProviderSaving.value = true;
  mailboxMessage.value = null;
  mailboxError.value = null;
  emailProviderMessage.value = null;
  emailProviderError.value = null;

  const emailAddress = emailAddressNormalized.value;
  const localPart = emailAddressLocalPart.value;

  try {
    const mailboxResponse = await api.put<{
      mailbox: MailboxRecord | null;
      sources: MailboxSource[];
    }>("/mailbox", {
      aliasLocalPart: localPart,
      forwardingEnabled: mailboxForwardingEnabled.value,
      forwardingEmail: mailboxForwardingEnabled.value
        ? mailboxForwardingEmail.value.trim()
        : "",
    });
    mailbox.value = mailboxResponse.mailbox;
    mailboxAliasInput.value =
      mailboxResponse.mailbox?.aliasLocalPart || localPart;
    mailboxForwardingEnabled.value = Boolean(
      mailboxResponse.mailbox?.forwardingEnabled,
    );
    mailboxForwardingEmail.value =
      mailboxResponse.mailbox?.forwardingEmail || mailboxForwardingEmail.value;

    if (mailboxResponse.mailbox?.status !== "active") {
      mailboxActivating.value = true;
      const activated = await api.post<{ mailbox: MailboxRecord | null }>(
        "/mailbox/activate",
      );
      mailbox.value = activated.mailbox;
    }

    const providerResponse = await api.put<EmailProviderSettingsResponse>(
      "/email-provider-settings",
      {
        activeProviderId: selectedEmailProviderId.value,
        providers: [buildEmailProviderUpdate(emailAddress)],
      },
    );
    syncEmailProviderSettings(providerResponse);
    emailAddressInput.value = emailAddress;
    mailboxMessage.value = "Email settings saved.";
  } catch (e: any) {
    const message = e.message || "Failed to save email settings";
    mailboxError.value = message;
  } finally {
    mailboxSaving.value = false;
    mailboxActivating.value = false;
    emailProviderSaving.value = false;
  }
}

async function loadPlugins() {
  pluginsLoading.value = true;
  pluginsError.value = null;

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
  const index = plugins.value.findIndex(
    (candidate) => candidate.id === plugin.id,
  );
  if (index >= 0) {
    plugins.value.splice(index, 1, plugin);
  } else {
    plugins.value.push(plugin);
  }
  window.dispatchEvent(new CustomEvent("me3:plugins-changed"));
}

function pluginActionKey(
  plugin: PluginRecord,
  action: "activate" | "deactivate",
) {
  return `${plugin.id}:${action}`;
}

const LOCAL_EXECUTOR_SOURCE_BIN =
  "node packages/local-executor/bin/me3-local-executor.mjs";
const LOCAL_EXECUTOR_CD_COMMAND =
  "cd /Users/[USERNAME]/[PROJECTS_FOLDER]/[YOUR_ME3_REPO]";
const LOCAL_EXECUTOR_CONFIG_COMMAND = `${LOCAL_EXECUTOR_SOURCE_BIN} config init --provider opencode`;
const LOCAL_EXECUTOR_RUN_COMMAND = `${LOCAL_EXECUTOR_SOURCE_BIN} run --interval 20`;
const LOCAL_EXECUTOR_KEEP_AWAKE_COMMAND = `caffeinate -dimsu ${LOCAL_EXECUTOR_RUN_COMMAND}`;

function openLocalExecutorSetup() {
  localExecutorSetupOpen.value = true;
  localExecutorPairingError.value = null;
}

function closeLocalExecutorSetup() {
  if (localExecutorPairingBusy.value) return;
  localExecutorSetupOpen.value = false;
  localExecutorCopiedCommand.value = null;
}

async function startLocalExecutorPairing() {
  if (!localExecutorPluginEnabled.value) {
    localExecutorPairingError.value =
      "Turn on Local Executor in the plugin row first.";
    return;
  }

  localExecutorPairingBusy.value = true;
  localExecutorPairingError.value = null;
  localExecutorCopiedCommand.value = null;

  try {
    const response = await api.post<{
      code: string;
      installCommand: string;
      expiresAt?: string | null;
    }>("/local-executor/pairing/start", {
      displayName: "Local runner",
    });
    localExecutorPairing.value = {
      code: response.code,
      sourceCommand: sourceLocalExecutorCommand(response.installCommand),
      runCommand: LOCAL_EXECUTOR_RUN_COMMAND,
      keepAwakeCommand: LOCAL_EXECUTOR_KEEP_AWAKE_COMMAND,
      expiresAt: response.expiresAt || null,
    };
  } catch (e: any) {
    localExecutorPairingError.value =
      e.message || "Could not create a pairing command.";
  } finally {
    localExecutorPairingBusy.value = false;
  }
}

function sourceLocalExecutorCommand(command: string) {
  return command.replace(/^me3-local-executor\b/, LOCAL_EXECUTOR_SOURCE_BIN);
}

function formatLocalExecutorExpiry(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function copyLocalExecutorCommand(command: string, key: string) {
  localExecutorPairingError.value = null;
  try {
    await navigator.clipboard.writeText(command);
    localExecutorCopiedCommand.value = key;
  } catch {
    localExecutorPairingError.value =
      "Copy did not work. Select the command and copy it manually.";
  }
}

async function togglePlugin(plugin: PluginRecord, enabled: boolean) {
  if (enabled) {
    await activatePlugin(plugin);
    return;
  }
  await deactivatePlugin(plugin);
}

async function activatePlugin(plugin: PluginRecord) {
  const key = pluginActionKey(plugin, "activate");
  pluginActionLoading.value = key;
  pluginsError.value = null;

  try {
    const response = await api.post<{ plugin: PluginRecord }>(
      `/plugins/${encodeURIComponent(plugin.id)}/activate`,
      {},
    );
    syncPlugin(response.plugin);
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

  try {
    const response = await api.post<{ plugin: PluginRecord }>(
      `/plugins/${encodeURIComponent(plugin.id)}/deactivate`,
      {},
    );
    syncPlugin(response.plugin);
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

function syncAiGatewaySettings(response: AiGatewaySettingsResponse) {
  aiGatewaySettings.value = response;
  aiGatewayAccountIdInput.value = response.accountId || "";
  aiGatewayIdInput.value = response.gatewayId || "";
  aiGatewayTokenInput.value = "";
  aiGatewayRouteWorkersAiInput.value = response.routeWorkersAi;
  aiGatewayRouteExternalProvidersInput.value = response.routeExternalProviders;
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

async function loadAiGatewaySettings() {
  aiGatewayLoading.value = true;
  aiGatewayError.value = null;

  try {
    const response = await api.get<AiGatewaySettingsResponse>(
      "/ai-gateway-settings",
    );
    syncAiGatewaySettings(response);
  } catch (e: any) {
    aiGatewayError.value = e.message || "Failed to load AI Gateway settings";
  } finally {
    aiGatewayLoading.value = false;
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
    (["default", "chat", "reasoning", "extraction"] as AiRouteId[]).map(
      (routeId) => [routeId, agentModel],
    ),
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

async function saveAiGatewaySettings() {
  if (aiGatewaySaveDisabled.value) return;

  aiGatewaySaving.value = true;
  aiGatewayMessage.value = null;
  aiGatewayError.value = null;

  try {
    const response = await api.put<AiGatewaySettingsResponse>(
      "/ai-gateway-settings",
      {
        accountId: aiGatewayAccountIdInput.value,
        gatewayId: aiGatewayIdInput.value,
        apiToken: aiGatewayTokenInput.value,
        routeWorkersAi: aiGatewayRouteWorkersAiInput.value,
        routeExternalProviders: aiGatewayRouteExternalProvidersInput.value,
      },
    );
    syncAiGatewaySettings(response);
    aiGatewayMessage.value = "AI Gateway settings saved.";
  } catch (e: any) {
    aiGatewayError.value = e.message || "Failed to save AI Gateway settings";
  } finally {
    aiGatewaySaving.value = false;
  }
}

function createDefaultEmailProviderInput(
  id: EmailProviderId,
): EmailProviderInputs {
  return {
    transport:
      id === "cloudflare-email" ? "binding" : id === "smtp" ? "smtp" : "rest",
    fromAddress: "",
    fromName: "",
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
  const activeProvider = emailProviders.value.find(
    (provider) => provider.id === response.activeProviderId,
  );
  selectedEmailProviderId.value =
    activeProvider &&
    (activeProvider.configured || activeProvider.source !== "not_configured")
      ? response.activeProviderId
      : "cloudflare-email";
  emailProviderInputs.value = createEmptyEmailProviderInputs();

  for (const provider of emailProviders.value) {
    emailProviderInputs.value[provider.id] = {
      ...createDefaultEmailProviderInput(provider.id),
      ...provider.config,
      apiToken: "",
    };
  }

  emailProviderTestTo.value = auth.user?.email || "";
  syncEmailAddressInput(true);
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
    emailProviderError.value =
      e.message || "Failed to load email sender settings";
  } finally {
    emailProviderLoading.value = false;
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

function syncCommerceSettings(response: CommerceSettingsResponse) {
  commerceSettings.value = response;
  stripeSecretInput.value = "";
}

async function loadCommerceSettings() {
  commerceLoading.value = true;
  commerceError.value = null;

  try {
    const response =
      await api.get<CommerceSettingsResponse>("/commerce/status");
    syncCommerceSettings(response);
  } catch (e: any) {
    commerceError.value = e.message || "Failed to load payment settings";
  } finally {
    commerceLoading.value = false;
  }
}

async function saveCommerceSettings() {
  if (commerceSaveDisabled.value) return;

  commerceSaving.value = true;
  commerceMessage.value = null;
  commerceError.value = null;

  try {
    const response = await api.put<CommerceSettingsResponse>(
      "/commerce/settings",
      {
        stripeSecretKey: stripeSecretInput.value.trim(),
      },
    );
    syncCommerceSettings(response);
    commerceMessage.value = "Stripe key saved.";
  } catch (e: any) {
    commerceError.value = e.message || "Failed to save payment settings";
  } finally {
    commerceSaving.value = false;
  }
}

async function clearCommerceStripeKey() {
  commerceSaving.value = true;
  commerceMessage.value = null;
  commerceError.value = null;

  try {
    const response = await api.put<CommerceSettingsResponse>(
      "/commerce/settings",
      {
        clearStripeSecretKey: true,
      },
    );
    syncCommerceSettings(response);
    commerceMessage.value = "Stored Stripe key removed.";
  } catch (e: any) {
    commerceError.value = e.message || "Failed to remove Stripe key";
  } finally {
    commerceSaving.value = false;
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
    appConnectionsError.value =
      e.message || "Failed to start ME3.app connection";
  } finally {
    appConnectionsSaving.value = false;
  }
}

async function disconnectMe3App() {
  if (appConnectionsSaving.value) return;

  appConnectionsSaving.value = true;
  appConnectionsError.value = null;

  try {
    await api.delete("/account/app-connections/me3");
    await loadAppConnections();
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

async function scrollToRouteHash() {
  if (!route.hash) return;
  await nextTick();
  window.requestAnimationFrame(() => {
    document
      .getElementById(route.hash.slice(1))
      ?.scrollIntoView({ block: "start" });
  });
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
  void loadAiGatewaySettings();
  void loadEmailProviderSettings();
  void loadPlugins();
  void loadAppConnections();
  void loadCommerceSettings();
  if (route.query.section === "connections") {
    openSection.value.advanced = true;
  }
  if (typeof route.query.me3_claim_error === "string") {
    openSection.value.advanced = true;
    appConnectionsError.value = "ME3.app connection failed. Please try again.";
  }
  if (route.query.section === "soulink" || route.query.section === "telegram") {
    openSection.value.advanced = true;
  }
  if (route.query.section === "mailbox") {
    openSection.value.mailbox = true;
  }
  if (
    route.query.section === "domain" ||
    route.query.section === "custom-domain"
  ) {
    openSection.value.advanced = true;
  }
  if (route.query.section === "ai" || route.query.section === "providers") {
    openSection.value.advanced = true;
  }
  if (route.query.section === "plugins") {
    openSection.value.plugins = true;
  }
  if (
    route.query.section === "payments" ||
    route.query.section === "commerce"
  ) {
    openSection.value.advanced = true;
  }
  await scrollToRouteHash();
});
</script>

<template>
  <div class="account-page">
    <Teleport to="#app-side-nav-mobile-page-controls">
      <div class="account-mobile-nav">
        <h1 class="account-mobile-nav__title">Account</h1>
        <div
          class="theme-segmented account-theme-switch account-mobile-nav__actions"
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
    </Teleport>

    <main class="main">
      <header class="account-header">
        <div>
          <h1>Account</h1>
        </div>
        <div
          class="theme-segmented account-theme-switch"
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
      </header>

      <div v-if="loading" class="status-row">Loading account...</div>

      <template v-else>
        <section
          class="setup-checklist"
          aria-labelledby="assistant-setup-title"
        >
          <div class="setup-checklist__header">
            <h2 id="assistant-setup-title">Setup</h2>
          </div>

          <div class="setup-checklist__items">
            <button
              v-for="item in assistantSetupItems"
              :key="item.id"
              class="setup-item"
              :class="{ 'setup-item--done': item.done }"
              type="button"
              :disabled="item.id === 'mission-control' && pluginsLoading"
              :aria-pressed="item.done"
              @click="handleAssistantSetupAction(item)"
            >
              <span class="setup-item__check" aria-hidden="true">
                <UiIcon v-if="item.done" name="Check" :size="14" />
              </span>
              <span class="setup-item__title">{{ item.title }}</span>
            </button>
          </div>
        </section>

        <section class="card accordion-card signin-section primary-section">
          <button
            id="account-trigger-signin"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.signin"
            aria-controls="account-panel-signin"
            @click="openSection.signin = !openSection.signin"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Account email</h2>
              <span class="accordion-header-hint">
                {{
                  auth.user?.email ||
                  "Used for signing in to this ME3 Core account."
                }}
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-signin"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-signin"
            :hidden="!openSection.signin"
          >
            <p class="hint account-signin-hint">
              Used for signing in to this ME3 Core account.
            </p>
            <div class="email-row account-email-row">
              <label class="field account-email-field">
                <span>Email</span>
                <input
                  class="input"
                  type="email"
                  :value="auth.user?.email || ''"
                  disabled
                />
              </label>
              <Button color="secondary" shape="soft" size="compact" type="button" @click="logout">
                Sign out
              </Button>
            </div>
          </div>
        </section>

        <section class="card accordion-card primary-section">
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
                <span class="accordion-status-badges">
                  <StatusBadge :tone="mailbox?.status || 'pending_setup'">
                    {{ mailboxStatusLabel }}
                  </StatusBadge>
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
            <div
              v-if="mailboxLoading || emailProviderLoading"
              class="status-row"
            >
              Loading email settings...
            </div>

            <template v-else-if="mailboxAvailable">
              <div class="email-settings">
                <label class="field email-address-field">
                  <span>Email address</span>
                  <input
                    v-model="emailAddressInput"
                    class="input email-address-input"
                    type="email"
                    placeholder="name@your-domain.com"
                    autocomplete="email"
                    spellcheck="false"
                  />
                  <p
                    v-if="emailAddressInput.trim() && !emailAddressIsValid"
                    class="error compact-error"
                  >
                    Enter an address like name@your-domain.com. Use letters,
                    numbers, dots, underscores, or hyphens before @.
                  </p>
                </label>

                <details class="email-disclosure">
                  <summary>Forward a copy</summary>
                  <div class="email-disclosure-body email-forwarding-row">
                    <label class="checkbox-row email-forwarding-row__toggle">
                      <input
                        v-model="mailboxForwardingEnabled"
                        type="checkbox"
                      />
                      <span>Turn on forwarding</span>
                    </label>
                    <input
                      v-model="mailboxForwardingEmail"
                      class="input email-forwarding-row__input"
                      type="email"
                      :disabled="!mailboxForwardingEnabled"
                      placeholder="you@example.com"
                      aria-label="Forward copy to"
                    />
                  </div>
                </details>

                <details class="email-disclosure">
                  <summary>Advanced sending</summary>
                  <div class="email-disclosure-body">
                    <p v-if="!emailProviderEncryptionConfigured" class="error">
                      Install encryption is required before provider tokens can
                      be saved.
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

                    <div
                      v-if="activeEmailProvider"
                      class="email-provider-fields"
                    >
                      <template v-if="selectedEmailProviderId === 'smtp'">
                        <label class="field">
                          <span>SMTP host</span>
                          <input
                            v-model="
                              emailProviderInputs[selectedEmailProviderId]
                                .smtpHost
                            "
                            class="input"
                            type="text"
                            placeholder="smtp.example.com"
                            spellcheck="false"
                          />
                        </label>

                        <label class="field">
                          <span>Port</span>
                          <input
                            v-model.number="
                              emailProviderInputs[selectedEmailProviderId]
                                .smtpPort
                            "
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
                            v-model="
                              emailProviderInputs[selectedEmailProviderId]
                                .smtpSecurity
                            "
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
                            v-model="
                              emailProviderInputs[selectedEmailProviderId]
                                .smtpUsername
                            "
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
                            v-model="
                              emailProviderInputs[selectedEmailProviderId]
                                .sendingDomain
                            "
                            class="input"
                            type="text"
                            placeholder="mg.example.com"
                            spellcheck="false"
                          />
                        </label>

                        <label class="field">
                          <span>Region</span>
                          <select
                            v-model="
                              emailProviderInputs[selectedEmailProviderId]
                                .mailgunRegion
                            "
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
                          v-model="
                            emailProviderInputs[selectedEmailProviderId]
                              .apiToken
                          "
                          class="input"
                          type="password"
                          autocomplete="off"
                          spellcheck="false"
                          :placeholder="emailProviderSecretPlaceholder"
                        />
                      </label>
                    </div>
                  </div>
                </details>

                <div class="button-row email-settings__actions">
                  <Button
                    color="primary"
                    size="compact"
                    type="button"
                    :disabled="unifiedEmailSaveDisabled"
                    @click="saveUnifiedEmailSettings"
                  >
                    {{
                      mailboxSaving || emailProviderSaving || mailboxActivating
                        ? "Saving..."
                        : "Save email"
                    }}
                  </Button>
                  <Button
                    color="outline"
                    size="compact"
                    type="button"
                    :disabled="emailProviderTestDisabled"
                    @click="sendEmailProviderTestMessage"
                  >
                    {{
                      emailProviderTesting ? "Sending..." : "Send test email"
                    }}
                  </Button>
                </div>

                <p v-if="activeEmailProvider?.lastTestError" class="error">
                  Last test failed:
                  {{ activeEmailProvider.lastTestError }}
                </p>
                <p v-if="mailboxMessage" class="success">
                  {{ mailboxMessage }}
                </p>
                <p v-if="emailProviderMessage" class="success">
                  {{ emailProviderMessage }}
                </p>
                <p v-if="mailboxError" class="error">{{ mailboxError }}</p>
                <p v-if="emailProviderError" class="error">
                  {{ emailProviderError }}
                </p>
              </div>
            </template>

            <p v-else class="error">
              Mailbox configuration is not available in this Core install.
            </p>
          </div>
        </section>

        <section class="card accordion-card plugins-section">
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
              <StatusBadge :tone="pluginSummaryStatusClass">
                {{ pluginSummaryLabel }}
              </StatusBadge>
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
            <div v-if="pluginsLoading" class="status-row">
              Loading plugins...
            </div>
            <p v-else-if="pluginsError" class="error">{{ pluginsError }}</p>

            <template v-else>
              <PluginList
                v-if="visibleAccountPlugins.length"
                :plugins="visibleAccountPlugins"
                :busy-plugin-ids="pluginBusyIds"
                :show-local-executor-config="true"
                @toggle="togglePlugin"
                @configure-local-executor="openLocalExecutorSetup"
              />

              <p v-else-if="plugins.length === 0" class="field-hint">
                No curated plugins are registered in this Core build.
              </p>
            </template>
          </div>
        </section>

        <section class="card accordion-card advanced-section">
          <button
            id="account-trigger-advanced"
            class="accordion-trigger"
            type="button"
            :aria-expanded="openSection.advanced"
            aria-controls="account-panel-advanced"
            @click="openSection.advanced = !openSection.advanced"
          >
            <span class="accordion-title-wrap accordion-title-flex">
              <h2>Advanced</h2>
              <span class="accordion-header-hint">
                App connections, domain, payments, AI, and timezone
              </span>
            </span>
            <span class="accordion-chevron" aria-hidden="true">▼</span>
          </button>
          <div
            id="account-panel-advanced"
            class="accordion-panel"
            role="region"
            aria-labelledby="account-trigger-advanced"
            :hidden="!openSection.advanced"
          >
            <div class="advanced-settings">
              <section class="advanced-subsection">
                <div class="advanced-subsection__header">
                  <h3>App connections</h3>
                </div>

                <div class="connection-lines">
                  <div
                    v-if="appConnectionsLoading"
                    class="connection-line connection-line--loading"
                  >
                    <span class="connection-line__title">ME3.app</span>
                    <span class="connection-line__meta">Loading...</span>
                  </div>
                  <div
                    v-else
                    class="connection-line"
                    :class="{
                      'connection-line--connected': me3Connection?.connected,
                    }"
                  >
                    <span class="connection-line__title">ME3.app</span>
                    <div class="connection-line__end">
                      <StatusBadge :tone="me3ConnectionStatusClass">
                        {{ me3ConnectionStatusLabel }}
                      </StatusBadge>
                      <Button
                        v-if="me3Connection?.connected"
                        color="outline"
                        size="compact"
                        type="button"
                        :disabled="
                          appConnectionsSaving ||
                          !me3Connection.disconnectAvailable
                        "
                        @click="disconnectMe3App"
                      >
                        {{
                          appConnectionsSaving
                            ? "Disconnecting..."
                            : "Disconnect"
                        }}
                      </Button>
                      <Button
                        v-else
                        color="primary"
                        size="compact"
                        type="button"
                        :disabled="appConnectionsSaving"
                        @click="connectMe3App"
                      >
                        {{ appConnectionsSaving ? "Opening..." : "Connect" }}
                      </Button>
                    </div>
                  </div>

                  <div
                    class="connection-line"
                    :class="{
                      'connection-line--connected':
                        soulinkPanelRef?.connection?.status === 'active',
                    }"
                  >
                    <div class="connection-line__copy">
                      <span class="connection-line__title">Soulink</span>
                      <p class="connection-line__description">
                        Chat with your ME3 assistant on the go.
                      </p>
                    </div>
                    <div class="connection-line__end">
                      <StatusBadge
                        v-if="soulinkPanelRef?.available"
                        :tone="soulinkStatusClass"
                      >
                        {{ soulinkStatusLabel }}
                      </StatusBadge>
                      <SoulinkConnectPanel
                        ref="soulinkPanelRef"
                        variant="inline"
                        :auto-prepare-when-not-connected="
                          route.query.section === 'soulink' ||
                          route.query.section === 'telegram'
                        "
                      />
                    </div>
                  </div>
                </div>

                <template v-if="!appConnectionsLoading">
                  <p
                    v-if="
                      me3Connection?.connected &&
                      !me3Connection.disconnectAvailable
                    "
                    class="field-hint connection-lines__hint"
                  >
                    Add password authentication before disconnecting ME3.app.
                  </p>
                  <p v-if="appConnectionsError" class="error">
                    {{ appConnectionsError }}
                  </p>
                </template>
                <p v-if="soulinkPanelRef?.error" class="error">
                  {{ soulinkPanelRef.error }}
                </p>
              </section>

              <section class="advanced-subsection">
                <div class="advanced-subsection__header">
                  <h3>Custom domain</h3>
                  <StatusBadge :tone="customDomainStatusClass">
                    {{ customDomainStatusLabel }}
                  </StatusBadge>
                </div>

                <div v-if="sites.loading" class="status-row">
                  Loading site domain settings...
                </div>
                <template v-else-if="customDomainSite">
                  <CustomDomain
                    embedded
                    :username="customDomainSite.username"
                    :show-settings-link="false"
                    :profile-published="Boolean(customDomainSite.published_at)"
                    :initial-domain="customDomainSuggestedDomain"
                    @domain-status-changed="() => void sites.fetchSites()"
                  />
                </template>
                <p v-else class="error">
                  Create a ME3 site before connecting a custom domain.
                </p>
              </section>

              <section
                v-if="showAiModelSection"
                id="account-ai-model"
                class="advanced-subsection"
              >
                <div class="advanced-subsection__header">
                  <h3>AI model</h3>
                  <StatusBadge :tone="aiSettingsSummaryStatusClass">
                    {{ aiSettingsSummaryLabel }}
                  </StatusBadge>
                </div>

                <div v-if="aiSettingsLoading" class="status-row">
                  Loading AI provider settings...
                </div>

                <template v-else>
                  <p v-if="aiSettingsError" class="error">
                    {{ aiSettingsError }}
                  </p>

                  <p v-if="!aiEncryptionConfigured" class="error">
                    Install encryption is created automatically during owner
                    setup. If this remains visible, run the latest migrations
                    and sign in or bootstrap again.
                  </p>

                  <div class="ai-model-row">
                    <label class="field ai-model-row__field">
                      <span class="ai-model-row__label">Provider</span>
                      <select
                        class="input ai-model-row__input"
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

                    <label class="field ai-model-row__field">
                      <span class="ai-model-row__label">Model</span>
                      <select
                        class="input ai-model-row__input"
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

                    <Button
                      color="primary"
                      size="compact"
                      type="button"
                      :disabled="aiSettingsSaveDisabled"
                      @click="saveAiSettings"
                    >
                      {{ aiSettingsSaving ? "Saving..." : "Save" }}
                    </Button>
                  </div>

                  <p class="selected-model-note selected-model-note--compact">
                    <strong>{{ selectedAgentModelCostLabel }}</strong>
                    {{ selectedAgentModelDescription }}
                  </p>

                  <label
                    v-if="selectedAgentProvider?.supportsApiKey"
                    class="field ai-model-key-field"
                  >
                    <span>{{ selectedAgentProvider.label }} API key</span>
                    <input
                      v-model="selectedProviderKeyInput"
                      class="input ai-model-row__input"
                      type="password"
                      autocomplete="off"
                      spellcheck="false"
                      :placeholder="
                        selectedAgentProvider.configured
                          ? 'Paste a new key to replace stored key'
                          : 'Paste API key'
                      "
                    />
                  </label>

                  <details class="email-disclosure">
                    <summary>AI Gateway usage</summary>
                    <div class="email-disclosure-body">
                      <p class="hint">
                        Connect Cloudflare AI Gateway to show model token usage
                        and estimated spend in Mission Control.
                      </p>
                      <p v-if="aiGatewayLoading" class="status-row">
                        Loading AI Gateway settings...
                      </p>
                      <template v-else>
                        <p
                          v-if="
                            aiGatewaySettings &&
                            !aiGatewaySettings.encryptionConfigured
                          "
                          class="error"
                        >
                          Install encryption is required before Cloudflare API
                          tokens can be saved.
                        </p>
                        <div class="ai-gateway-grid">
                          <label class="field">
                            <span>Cloudflare account ID</span>
                            <input
                              v-model="aiGatewayAccountIdInput"
                              class="input"
                              type="text"
                              autocomplete="off"
                              spellcheck="false"
                            />
                          </label>
                          <label class="field">
                            <span>AI Gateway ID</span>
                            <input
                              v-model="aiGatewayIdInput"
                              class="input"
                              type="text"
                              autocomplete="off"
                              spellcheck="false"
                            />
                          </label>
                        </div>
                        <label class="field">
                          <span>Cloudflare API token</span>
                          <input
                            v-model="aiGatewayTokenInput"
                            class="input"
                            type="password"
                            autocomplete="off"
                            spellcheck="false"
                            :placeholder="
                              aiGatewaySettings?.apiTokenHint
                                ? `Stored token ${aiGatewaySettings.apiTokenHint}`
                                : 'Paste API token'
                            "
                          />
                        </label>
                        <label class="checkbox-row">
                          <input
                            v-model="aiGatewayRouteWorkersAiInput"
                            type="checkbox"
                          />
                          <span>Route Workers AI calls through this gateway</span>
                        </label>
                        <label class="checkbox-row">
                          <input
                            v-model="aiGatewayRouteExternalProvidersInput"
                            type="checkbox"
                          />
                          <span>Route OpenAI and Anthropic through this gateway</span>
                        </label>
                        <div class="account-inline-actions">
                          <Button
                            color="secondary"
                            size="compact"
                            type="button"
                            :disabled="aiGatewaySaveDisabled"
                            @click="saveAiGatewaySettings"
                          >
                            {{ aiGatewaySaving ? "Saving..." : "Save Gateway" }}
                          </Button>
                          <StatusBadge
                            v-if="aiGatewaySettings"
                            :tone="
                              aiGatewaySettings.configured
                                ? 'active'
                                : 'pending_setup'
                            "
                          >
                            {{
                              aiGatewaySettings.configured
                                ? 'Connected'
                                : 'Setup needed'
                            }}
                          </StatusBadge>
                        </div>
                        <p v-if="aiGatewayMessage" class="success">
                          {{ aiGatewayMessage }}
                        </p>
                      </template>
                    </div>
                  </details>

                  <p v-if="aiSettingsMessage" class="success">
                    {{ aiSettingsMessage }}
                  </p>
                  <p v-if="aiGatewayError" class="error">
                    {{ aiGatewayError }}
                  </p>
                </template>
              </section>

              <section id="account-payments" class="advanced-subsection">
                <div class="advanced-subsection__header">
                  <h3>Payments</h3>
                  <StatusBadge :tone="paymentsStatusClass">
                    {{ paymentsStatusLabel }}
                  </StatusBadge>
                </div>

                <div v-if="commerceLoading" class="status-row">
                  Loading payment settings...
                </div>

                <template v-else>
                  <p class="hint">
                    Add your Stripe secret key here to accept direct paid
                    bookings from your ME3 site.
                  </p>

                  <p
                    v-if="
                      commerceSettings?.stripe.source === 'environment' &&
                      commerceSettings?.stripe.keyHint
                    "
                    class="field-hint"
                  >
                    A configured Wrangler secret takes priority over any stored
                    account key.
                  </p>

                  <p
                    v-if="
                      commerceSettings && !commerceSettings.encryptionConfigured
                    "
                    class="field-hint"
                  >
                    A local encryption key will be initialized before this
                    Stripe key is stored.
                  </p>

                  <label class="field payment-key-field">
                    <span>Stripe secret key</span>
                    <div class="payment-key-row">
                      <input
                        v-model="stripeSecretInput"
                        class="input payment-key-row__input"
                        type="password"
                        autocomplete="off"
                        spellcheck="false"
                        :placeholder="stripeSecretPlaceholder"
                        @keydown.enter.prevent="saveCommerceSettings"
                      />
                      <Button
                        color="primary"
                        size="compact"
                        type="button"
                        :disabled="commerceSaveDisabled"
                        @click="saveCommerceSettings"
                      >
                        {{ commerceSaving ? "Saving..." : "Save" }}
                      </Button>
                    </div>
                    <p class="field-hint">
                      Use a Stripe key that starts with sk_test_ or sk_live_.
                    </p>
                  </label>

                  <Button
                    v-if="commerceSettings?.stripe.source === 'stored'"
                    color="outline"
                    size="compact"
                    type="button"
                    :disabled="commerceClearDisabled"
                    @click="clearCommerceStripeKey"
                  >
                    Remove stored key
                  </Button>

                  <p v-if="commerceMessage" class="success">
                    {{ commerceMessage }}
                  </p>
                  <p v-if="commerceError" class="error">{{ commerceError }}</p>
                </template>
              </section>

              <section class="advanced-subsection">
                <div class="advanced-subsection__header">
                  <h3>Set Timezone</h3>
                  <span class="accordion-header-hint">
                    {{ timezoneDisplay }}
                  </span>
                </div>

                <div class="timezone-row">
                  <label class="field timezone-row__field">
                    <input
                      v-model="timezoneInput"
                      class="input timezone-row__input"
                      type="text"
                      list="account-timezone-options"
                      aria-label="Timezone"
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
                  <div class="timezone-row__actions">
                    <Button
                      color="outline"
                      size="compact"
                      type="button"
                      @click="detectTimezoneValue"
                    >
                      Detect from browser
                    </Button>
                    <Button
                      color="primary"
                      size="compact"
                      type="button"
                      :disabled="saveDisabled"
                      @click="saveSettings"
                    >
                      {{ saving ? "Saving..." : "Save" }}
                    </Button>
                  </div>
                </div>

                <p v-if="message" class="success">{{ message }}</p>
                <p v-if="error" class="error">{{ error }}</p>
              </section>
            </div>
          </div>
        </section>

        <section class="danger-section advanced-section">
          <h2>Danger zone</h2>
          <div class="danger-card">
            <div>
              <strong>Delete your account</strong>
              <p>
                This will permanently delete your ME3 Core account, all of your
                sites, and associated data. This action cannot be undone.
              </p>
            </div>
            <Button color="danger" shape="soft" size="compact" type="button" @click="openDeleteModal">
              Delete
            </Button>
          </div>
        </section>
      </template>
    </main>

    <Teleport to="body">
      <div
        v-if="localExecutorSetupOpen"
        class="modal-overlay local-executor-modal-overlay"
        @click.self="closeLocalExecutorSetup"
      >
        <section
          class="modal local-executor-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="local-executor-modal-title"
        >
          <div class="modal-header local-executor-modal__header">
            <div>
              <h2 id="local-executor-modal-title">Connect to your local computer</h2>
            </div>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              class="modal-close"
              type="button"
              aria-label="Close Local Executor setup"
              title="Close"
              :disabled="localExecutorPairingBusy"
              @click="closeLocalExecutorSetup"
            >
              <UiIcon name="X" :size="18" aria-hidden="true" />
            </Button>
          </div>

          <p v-if="!localExecutorPluginEnabled" class="local-executor-note">
            First, turn on Local Executor in this plugin row. Then come back
            here and create the pairing command.
          </p>

          <ol class="local-executor-steps">
            <li>
              <strong>Clone your ME3 Core repo.</strong>
              <span>
                Put the ME3 Core repo on the computer that will run local
                tasks. This is the repo with
                <code>packages/local-executor</code> inside it.
              </span>
            </li>
            <li>
              <strong>Open Terminal and go to that repo.</strong>
              <span>
                Replace the placeholders with your real folders, or type
                <code>cd </code>, drag the ME3 folder into Terminal, and press
                Return.
              </span>
              <div class="local-executor-command">
                <pre><code>{{ LOCAL_EXECUTOR_CD_COMMAND }}</code></pre>
                <Button
                  color="outline"
                  size="small"
                  shape="soft"
                  type="button"
                  @click="
                    copyLocalExecutorCommand(
                      LOCAL_EXECUTOR_CD_COMMAND,
                      'cd',
                    )
                  "
                >
                  {{
                    localExecutorCopiedCommand === "cd" ? "Copied" : "Copy"
                  }}
                </Button>
              </div>
            </li>
            <li>
              <strong>Pair this computer with ME3.</strong>
              <span>
                Create a temporary pairing command, then paste it into Terminal.
                The code is already inside the command.
              </span>
              <Button
                color="primary"
                size="compact"
                shape="soft"
                type="button"
                :disabled="
                  localExecutorPairingBusy || !localExecutorPluginEnabled
                "
                @click="startLocalExecutorPairing"
              >
                {{
                  localExecutorPairingBusy
                    ? "Creating..."
                    : localExecutorPairing
                      ? "Create fresh command"
                      : "Create pairing command"
                }}
              </Button>
              <span v-if="localExecutorPairing">
                <template v-if="localExecutorPairingExpiryLabel">
                  It expires {{ localExecutorPairingExpiryLabel }}.
                </template>
                It saves a small runner token at
                <code>~/.me3/local-executor/token.json</code>.
              </span>
              <div
                v-if="localExecutorPairingCommand"
                class="local-executor-command"
              >
                <pre><code>{{ localExecutorPairingCommand }}</code></pre>
                <Button
                  color="outline"
                  size="small"
                  shape="soft"
                  type="button"
                  @click="
                    copyLocalExecutorCommand(
                      localExecutorPairingCommand,
                      'pair',
                    )
                  "
                >
                  {{
                    localExecutorCopiedCommand === "pair" ? "Copied" : "Copy"
                  }}
                </Button>
              </div>
            </li>
            <li>
              <strong>Configure your local AI agent.</strong>
              <span>
                OpenCode, Codex, and Claude are supported. Install and sign in
                to the tool locally first. Use <code>opencode</code>,
                <code>codex</code>, or <code>claude</code> in this command.
              </span>
              <div class="local-executor-command">
                <pre><code>{{ LOCAL_EXECUTOR_CONFIG_COMMAND }}</code></pre>
                <Button
                  color="outline"
                  size="small"
                  shape="soft"
                  type="button"
                  @click="
                    copyLocalExecutorCommand(
                      LOCAL_EXECUTOR_CONFIG_COMMAND,
                      'config',
                    )
                  "
                >
                  {{
                    localExecutorCopiedCommand === "config" ? "Copied" : "Copy"
                  }}
                </Button>
              </div>
            </li>
            <li>
              <strong>Start the local runner.</strong>
              <span>
                Leave this Terminal window open. This is the process that
                checks ME3 and picks up local tasks while your computer is
                awake.
              </span>
              <div class="local-executor-command">
                <pre><code>{{ LOCAL_EXECUTOR_RUN_COMMAND }}</code></pre>
                <Button
                  color="outline"
                  size="small"
                  shape="soft"
                  type="button"
                  @click="
                    copyLocalExecutorCommand(
                      LOCAL_EXECUTOR_RUN_COMMAND,
                      'run',
                    )
                  "
                >
                  {{
                    localExecutorCopiedCommand === "run" ? "Copied" : "Copy"
                  }}
                </Button>
              </div>
              <span>
                On macOS, use this version if you want Terminal to keep the
                computer awake while the runner is open.
              </span>
              <div class="local-executor-command">
                <pre><code>{{ LOCAL_EXECUTOR_KEEP_AWAKE_COMMAND }}</code></pre>
                <Button
                  color="outline"
                  size="small"
                  shape="soft"
                  type="button"
                  @click="
                    copyLocalExecutorCommand(
                      LOCAL_EXECUTOR_KEEP_AWAKE_COMMAND,
                      'awake',
                    )
                  "
                >
                  {{
                    localExecutorCopiedCommand === "awake" ? "Copied" : "Copy"
                  }}
                </Button>
              </div>
            </li>
            <li>
              <strong>Add a local project in Mission Control.</strong>
              <span>
                Visit your ME3 site, open Mission Control, go to Projects, and
                add a project with type <code>Local</code>. Use the local
                folder path for the project repo you want the runner to work
                in.
              </span>
              <router-link
                class="local-executor-project-link"
                to="/mission-control/projects"
                @click="closeLocalExecutorSetup"
              >
                Open Mission Control Projects
              </router-link>
            </li>
            <li>
              <strong>Add a task and move it to Doing.</strong>
              <span>
                Backlog is just a holding area. When a task in a local project
                moves to Doing, the local runner can claim it and run it inside
                that project repo.
              </span>
            </li>
            <li>
              <strong>Review the result.</strong>
              <span>
                The local runner follows the rules in that project repo,
                including its <code>AGENTS.md</code>. When the run succeeds,
                ME3 moves the task to Review.
              </span>
            </li>
          </ol>

          <p v-if="localExecutorPairingError" class="error">
            {{ localExecutorPairingError }}
          </p>
        </section>
      </div>
    </Teleport>

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
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            class="modal-close"
            type="button"
            aria-label="Close"
            title="Close"
            :disabled="deleteLoading"
            @click="closeDeleteModal"
          >
            <UiIcon name="X" :size="18" aria-hidden="true" />
          </Button>
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
          <Button
            color="secondary"
            shape="soft"
            size="compact"
            type="button"
            :disabled="deleteLoading"
            @click="closeDeleteModal"
          >
            Cancel
          </Button>
          <Button
            color="danger"
            shape="soft"
            size="compact"
            type="button"
            :disabled="deleteLoading || deleteConfirmInput.trim() !== 'DELETE'"
            @click="deleteAccount"
          >
            {{ deleteLoading ? "Deleting..." : "Delete account" }}
          </Button>
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
  display: flex;
  flex-direction: column;
  max-width: 700px;
  margin: 0 auto;
  padding: 20px 40px;
}

.account-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
}

.account-theme-switch {
  flex: 0 0 auto;
}

.account-mobile-nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  min-height: 36px;
}

.account-mobile-nav__actions {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}

.account-header {
  display: none;
}

.account-mobile-nav__title {
  margin: 0;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

.setup-checklist {
  display: grid;
  gap: 14px;
  margin-bottom: 28px;
  padding: 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.setup-checklist__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.setup-checklist__header h2,
.account-section-heading {
  margin: 0;
  color: var(--ui-text, var(--color-text));
  font-size: 18px;
  line-height: 1.2;
}

.setup-checklist__items {
  display: grid;
  gap: 4px;
}

.setup-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--ui-radius-sm, 8px);
  background: transparent;
  color: var(--ui-text, var(--color-text));
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.setup-item:hover,
.setup-item:focus-visible {
  background: var(--ui-surface, var(--color-bg));
}

.setup-item:focus-visible {
  outline: 2px solid var(--ui-focus, var(--color-primary));
  outline-offset: 2px;
}

.setup-item:disabled {
  cursor: wait;
  opacity: 0.7;
}

.setup-item__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--ui-border-strong, var(--color-border-strong));
  border-radius: 999px;
  color: var(--ui-on-accent, #fff);
}

.setup-item--done .setup-item__check {
  border-color: var(--ui-accent, #4caf50);
  background: var(--ui-accent, #4caf50);
}

.setup-item__title {
  min-width: 0;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
}

.primary-section {
  order: 2;
}

.plugins-section {
  order: 3;
}

.advanced-section {
  order: 4;
}

.danger-section.advanced-section {
  order: 5;
}

.card {
  margin-bottom: 20px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
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

.accordion-status-badges {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
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

.account-signin-hint {
  margin: 0 0 14px;
}

.email-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.email-row .input {
  flex: 1;
}

.account-email-row {
  align-items: end;
}

.account-email-field {
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

.timezone-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.timezone-row__field {
  flex: 1 1 220px;
  min-width: 0;
  margin: 0;
}

.timezone-row__input {
  min-height: 36px;
  padding: 8px 12px;
}

.timezone-row__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ai-model-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-model-row__field {
  flex: 1 1 180px;
  min-width: 0;
  gap: 4px;
  margin: 0;
}

.ai-model-row__label {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 600;
}

.ai-model-row__input {
  min-height: 36px;
  padding: 8px 12px;
}

.ai-model-key-field {
  gap: 6px;
}

.ai-gateway-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.account-inline-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.selected-model-note--compact {
  font-size: 12px;
  line-height: 1.4;
}

.advanced-settings {
  display: grid;
  gap: 20px;
}

.advanced-subsection {
  display: grid;
  gap: 12px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
}

.advanced-subsection:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.advanced-subsection__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.advanced-subsection__header h3 {
  margin: 0;
  color: var(--ui-text, var(--color-text));
  font-size: 15px;
  line-height: 1.25;
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

.email-settings {
  display: grid;
  gap: 16px;
}

.email-settings__actions {
  gap: 8px;
  margin-top: 4px;
}

.email-address-field {
  max-width: 680px;
}

.email-address-input {
  font-size: 18px;
}

.compact-error {
  margin: 0;
  font-size: 13px;
}

.email-disclosure {
  border-top: 1px solid var(--ui-border, var(--color-border));
  padding-top: 12px;
}

.email-disclosure summary {
  width: fit-content;
  color: var(--ui-text, var(--color-text));
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.email-disclosure-body {
  display: grid;
  gap: 14px;
  padding-top: 14px;
}

.email-forwarding-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.email-forwarding-row__toggle {
  flex-shrink: 0;
}

.email-forwarding-row__input {
  flex: 1 1 200px;
  min-width: 0;
  min-height: 36px;
  padding: 8px 12px;
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

.mailbox-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.mailbox-route-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 12px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.mailbox-route-summary span {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.mailbox-route-summary strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--ui-text, var(--color-text));
  font-size: 13px;
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-text, var(--color-text));
  font-size: 13px;
  font-weight: 700;
}

.mailbox-forwarding-toggle {
  margin-top: 10px;
}

.connection-lines {
  display: grid;
  gap: 8px;
}

.connection-line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.connection-line--connected {
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

.connection-line__copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.connection-line__title {
  min-width: 0;
  color: var(--ui-text, var(--color-text));
  font-size: 14px;
  font-weight: 650;
  line-height: 1.2;
}

.connection-line__description {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  line-height: 1.4;
}

.connection-line__meta {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
}

.connection-line__end {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  padding-top: 2px;
}

.connection-lines__hint {
  margin: 8px 0 0;
}

#account-payments .hint {
  margin-bottom: 8px;
}

.payment-key-field {
  margin-top: 0;
}

.payment-key-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.payment-key-row__input {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  padding: 8px 12px;
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
  border: 1px solid color-mix(in oklab, #e53935 34%, var(--color-border));
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

.local-executor-modal {
  display: grid;
  gap: 16px;
  width: min(680px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow-y: auto;
}

.local-executor-modal__header {
  margin-bottom: 0;
}

.local-executor-modal__intro,
.local-executor-note,
.local-executor-steps span {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 14px;
  line-height: 1.5;
}

.local-executor-modal__intro,
.local-executor-note {
  margin: 0;
}

.local-executor-project-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  min-height: 36px;
  padding: 0 12px;
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-accent-soft, var(--color-bg-subtle));
  color: var(--ui-accent, var(--color-primary));
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}

.local-executor-project-link:hover {
  background: color-mix(in oklab, var(--ui-accent, var(--color-primary)), transparent 88%);
}

.local-executor-note {
  padding: 10px 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.local-executor-steps {
  display: grid;
  gap: 14px;
  margin: 0;
  padding-left: 22px;
}

.local-executor-steps li {
  display: grid;
  gap: 7px;
  padding-left: 4px;
}

.local-executor-steps strong {
  color: var(--ui-text, var(--color-text));
  font-size: 15px;
}

.local-executor-steps code,
.local-executor-command code {
  color: var(--ui-text, var(--color-text));
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono",
    monospace;
}

.local-executor-command {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
  padding: 10px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.local-executor-command pre {
  margin: 0;
  max-width: 100%;
  overflow-x: auto;
  padding: 10px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 720px) {
  .main {
    padding: 16px;
  }

  .danger-card,
  .email-row,
  .connection-line {
    align-items: flex-start;
  }

  .connection-line__end {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .timezone-row,
  .payment-key-row {
    align-items: stretch;
  }

  .payment-key-row {
    flex-direction: column;
  }

  .timezone-row__actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .ai-model-row {
    align-items: stretch;
  }

  .ai-model-row__field {
    flex-basis: 100%;
  }

  .ai-gateway-grid {
    grid-template-columns: 1fr;
  }

  .plugin-meta-grid,
  .plugin-detail-grid,
  .mailbox-config-grid,
  .email-provider-fields {
    grid-template-columns: 1fr;
  }

  .local-executor-modal {
    max-height: calc(100vh - 32px);
  }

  .local-executor-command {
    grid-template-columns: 1fr;
  }

  .local-executor-command :deep(.me3-btn) {
    width: 100%;
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
