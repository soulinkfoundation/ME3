<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { definePage } from "unplugin-vue-router/runtime";
import { api, type ApiStreamEvent } from "../../api";
import Button from "../../components/Button.vue";
import LandingGrids from "../../components/LandingGrids.vue";
import UiIcon from "../../components/UiIcon.vue";
import { useAgentChat } from "../../composables/useAgentChat";
import { useAppToast } from "../../composables/useAppToast";
import {
  formatAgentRuntimeDetail,
  formatAgentRuntimeMetadata,
  resolveAgentReplyText,
} from "../../utils/agentChat";
import {
  AI_AGENT_MODEL_OPTIONS,
  type AiAgentModelCapability,
  type AiAgentModelOption,
  type AiAgentModelProviderId,
} from "../../utils/aiModelCatalog";

definePage({
  meta: {
    requiresAuth: true,
    hideAgentLauncher: true,
    title: "Assistant | ME3",
    description: "Chat with ME3 and manage assistant jobs.",
    robots: "noindex,follow",
  },
});

type AssistantJobStatus =
  | "draft"
  | "active"
  | "paused"
  | "needs_setup"
  | "failing"
  | "archived";

type AssistantJobRunStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

type AssistantRecipeState =
  | "ready"
  | "needs_setup"
  | "manual_only"
  | "coming_later";

type AssistantScheduleCadence = "daily" | "weekly" | "monthly" | "custom";

type AssistantJobTrigger =
  | { kind: "manual" }
  | {
      kind: "schedule";
      timezone: string;
      cadence: AssistantScheduleCadence;
      rrule: string | null;
      localTime: string | null;
      dayOfWeek: number | null;
      nextRunAt: string | null;
    }
  | {
      kind: "event";
      source: string;
      sourceId: string;
      eventType: string;
      filters?: unknown[];
    };

type PermissionSummary = {
  reads?: string[];
  writes?: string[];
  approvalRequired?: string[];
  forbidden?: string[];
  setupRequirements?: string[];
  skills?: string[];
};

type AssistantJob = {
  id: string;
  recipeId: string | null;
  name: string;
  purpose: string;
  status: AssistantJobStatus;
  currentVersionId: string | null;
  projectId: string | null;
  destination: Record<string, unknown>;
  triggerSummary: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: AssistantJobRunStatus | null;
  failureCount: number;
  setupState: {
    validationStatus?: string;
    errors?: Array<{ message?: string; code?: string; blocking?: boolean }>;
  };
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type AssistantJobRecipe = {
  id: string;
  name: string;
  outcome: string;
  state: AssistantRecipeState;
  requiredCapabilityIds: string[];
  optionalCapabilityIds: string[];
  defaultDraft: {
    name: string;
    purpose: string;
    destination?: {
      landing?: string;
    };
  };
};

type AiRouteId = "default" | "chat" | "reasoning" | "extraction";

type AiProviderRecord = {
  id: AiAgentModelProviderId | string;
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

type AssistantJobVersion = {
  id: string;
  versionNumber: number;
  trigger: AssistantJobTrigger;
  rules: AssistantJobRule[];
  actions: Array<{
    id: string;
    capabilityId: string;
    label: string;
    approvalMode: string;
    inputs?: Record<string, unknown>;
  }>;
  permissionSummary: PermissionSummary;
  validationStatus: "valid" | "invalid" | "needs_setup";
  validationErrors: Array<{
    message?: string;
    code?: string;
    blocking?: boolean;
  }>;
  createdAt: string;
};

type AssistantJobRule = {
  id: string;
  label: string;
  field: string;
  operator: string;
  value: unknown;
};

type AssistantJobScope = {
  projectId: string | null;
  sourceIds: string[];
  providerAccountIds: string[];
  filters: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
};

type AssistantJobDraft = {
  name: string;
  purpose: string;
  recipeId: string | null;
  trigger: AssistantJobTrigger;
  scope: AssistantJobScope;
  rules: AssistantJobRule[];
  actions: Array<{
    id: string;
    capabilityId: string;
    label: string;
    inputs: Record<string, unknown>;
    approvalMode: string;
    onFailure: string;
    idempotencyScope: string;
  }>;
  approvalPolicy: {
    defaultMode: string;
    overrides: Array<{
      capabilityId: string;
      mode: string;
      reason: string;
    }>;
    ownerCanApproveFrom: string;
    approvalExpiresAfterHours: number | null;
  };
  destination: {
    kind: "mission_control";
    projectId: string | null;
    landing:
      | "review_packet"
      | "task"
      | "capture"
      | "approval"
      | "memory_review"
      | "activity"
      | "accounts";
    quietIfNoChanges: boolean;
  };
  projectId: string | null;
  recommendedSkillIds: string[];
  requiredSkillIds: string[];
};

type AssistantJobDraftValidation = {
  status: "valid" | "needs_setup" | "invalid";
  errors: Array<{
    code?: string;
    message?: string;
    blocking?: boolean;
    actionId?: string;
    capabilityId?: string;
  }>;
  permissionSummary: {
    reads: string[];
    writes: string[];
    approvalRequired: string[];
    forbidden: string[];
    setupRequirements: string[];
    skills: string[];
  };
};

type AssistantJobBuilderAction =
  | {
      kind: "job_draft";
      draftId: string;
      draft: AssistantJobDraft;
      explanation: {
        summary: string;
        reads: string[];
        writes: string[];
        approvalRequired: string[];
        setupWarnings: string[];
      };
      validation: AssistantJobDraftValidation;
      availableActions: Array<"save" | "save_and_activate">;
    }
  | {
      kind: "job_saved";
      jobId: string;
      summary: string;
      status: AssistantJobStatus;
      availableActions: Array<"activate" | "run_now" | "open_job">;
    };
type AssistantJobSavedBuilderAction = Extract<
  AssistantJobBuilderAction,
  { kind: "job_saved" }
>;
type AssistantJobBuilderSentenceSegment = {
  text: string;
  strong?: boolean;
};

type InboxWatchTiming = "immediate" | "daily_digest" | "weekly_digest" | "manual";
type InboxWatchInferredLabel =
  | "needs_reply"
  | "important"
  | "finance"
  | "scheduling"
  | "review";

type InboxWatchRuleForm = {
  id: string;
  label: string;
  enabled: boolean;
  timing: InboxWatchTiming;
  from: string;
  contains: string;
  inferredLabels: InboxWatchInferredLabel[];
  notifyOwner: boolean;
  summarizeAndLabel: boolean;
  draftReply: boolean;
  createTask: boolean;
};

type AssistantJobActionResult = {
  id: string;
  actionId: string;
  capabilityId: string;
  status: "skipped" | "blocked" | "pending_approval" | "succeeded" | "failed";
  approvalId: string | null;
  externalRef: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type AssistantJobRun = {
  id: string;
  triggerKind: "manual" | "schedule" | "event" | "heartbeat_retry";
  status: AssistantJobRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  outputPreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  actionResults: AssistantJobActionResult[];
};

type AssistantJobDetail = {
  job: AssistantJob;
  version: AssistantJobVersion | null;
  runs: AssistantJobRun[];
};

type AgentSandboxResponse = {
  ok: boolean;
  turnId: string | null;
  threadId?: string | null;
  specialist: string | null;
  replyText: string | null;
  model: string | null;
  source:
    | "openai"
    | "anthropic"
    | "workers-ai"
    | "workers-ai-gateway"
    | "fallback"
    | "tool"
    | null;
  fallbackReason?: string | null;
  debugError?: string | null;
  contextPacketId?: string | null;
  contextSummary?: string | null;
  contextManifest?: unknown;
  emailAction?: {
    kind: "drafted" | "sent";
    messageId: string;
    to: string;
    subject: string;
  } | null;
  reminderAction?: {
    kind: "created" | "updated" | "cancelled" | "dismissed" | "listed";
    reminderId?: string;
    title?: string;
    remindAt?: string;
  } | null;
  contentAction?: {
    kind: "previewed" | "saved";
    itemId?: string;
    platforms?: Array<"x" | "linkedin" | "instagram" | "instagram_business">;
  } | null;
  jobBuilderAction?: AssistantJobBuilderAction | null;
  contactsChanged?: boolean;
  error?: string;
};
type AssistantThreadMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};
type AssistantThread = {
  id: string;
  title: string;
  originSurface: "assistant" | "launcher" | "soulink" | "job" | "system";
  projectId: string | null;
  status: "active" | "archived" | "deleted";
  pinnedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type AssistantThreadsResponse = {
  threads: AssistantThread[];
};
type MissionProject = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  color: string | null;
  icon: string | null;
};
type MissionProjectsResponse = {
  projects: MissionProject[];
};
type AssistantThreadExportResponse = {
  thread: AssistantThread;
  messages: AssistantThreadMessage[];
  exportedAt: string;
};
type AssistantAttachmentKind = "text" | "image" | "unsupported";
type AssistantAttachmentDraft = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AssistantAttachmentKind;
  previewUrl: string | null;
  text: string | null;
  status: "ready" | "uploading" | "error";
  error: string | null;
  storageKey: string | null;
  textTruncated: boolean;
};
type AssistantAttachmentUploadResponse = {
  ok: boolean;
  attachments: Array<{
    id: string;
    name: string;
    filename: string;
    mimeType: string;
    size: number;
    kind: "text" | "image";
    status: "ready";
    storageKey: string | null;
    hasText: boolean;
    text: string | null;
    textTruncated: boolean;
    createdAt: string;
  }>;
};
type AssistantThreadMessagesResponse = {
  thread: AssistantThread;
  messages: AssistantThreadMessage[];
};

type JobsResponse = { jobs: AssistantJob[] };
type RecipesResponse = { recipes: AssistantJobRecipe[] };
type VoiceTranscriptionResponse = {
  ok: boolean;
  providerId: string;
  model: string;
  text: string;
  wordCount: number | null;
  language: string | null;
};

const { toastSuccess, toastFromUnknown } = useAppToast();
const agentChat = useAgentChat();
const route = useRoute();
const router = useRouter();

const jobs = ref<AssistantJob[]>([]);
const recipes = ref<AssistantJobRecipe[]>([]);
const chatMessages = agentChat.messages;
const selectedJobId = ref<string | null>(null);
const selectedDetail = ref<AssistantJobDetail | null>(null);
const loadingJobs = ref(false);
const loadingRecipes = ref(false);
const loadingDetail = ref(false);
const pageError = ref("");
const configureJobsModalOpen = ref(false);
const recipeIngredientsModalOpen = ref(false);
const detailModalOpen = ref(false);
const busyKeys = ref(new Set<string>());
const dailyBriefingTemplateDraft = ref("");
const dailyBriefingTemplateNotice = ref("");
const scheduleCadenceDraft = ref<AssistantScheduleCadence>("daily");
const scheduleTimeDraft = ref("08:00");
const scheduleDayOfWeekDraft = ref(1);
const scheduleDayOfMonthDraft = ref(1);
const scheduleNotice = ref("");
const scheduleInlineEditing = ref(false);
const inboxWatchRulesDraft = ref<InboxWatchRuleForm[]>([]);
const inboxWatchRulesNotice = ref("");
const assistantDraft = ref("");
const assistantSending = ref(false);
const assistantAwaitingResponse = ref(false);
const assistantError = ref<string | null>(null);
const assistantThreadId = ref<string | null>(null);
const assistantThreadLoading = ref(false);
const assistantThreads = ref<AssistantThread[]>([]);
const assistantThreadsLoading = ref(false);
const assistantThreadsError = ref("");
const archivedThreadsModalOpen = ref(false);
const archivedAssistantThreads = ref<AssistantThread[]>([]);
const archivedAssistantThreadsLoading = ref(false);
const archivedAssistantThreadsError = ref("");
const assistantProjects = ref<MissionProject[]>([]);
const assistantProjectsLoading = ref(false);
const assistantProjectsError = ref("");
const assistantThreadSearchDraft = ref("");
const assistantThreadSearch = ref("");
const assistantThreadActionId = ref<string | null>(null);
const assistantHistoryCollapsed = ref(false);
const assistantHistoryDrawerOpen = ref(false);
const copiedMessageKey = ref<string | null>(null);
const assistantComposerRef = ref<HTMLTextAreaElement | null>(null);
const assistantScrollerRef = ref<HTMLDivElement | null>(null);
const assistantAttachmentInputRef = ref<HTMLInputElement | null>(null);
const assistantAttachments = ref<AssistantAttachmentDraft[]>([]);
const assistantAttachmentNotice = ref("");
const assistantComposerDragDepth = ref(0);
const assistantModelStorageKey = "me3.assistant.selectedModelId";
const storedAssistantModelId = getStoredAssistantModelId();
const initialAssistantModelId = storedAssistantModelId || "workers-qwen3-30b";
const selectedModelId = ref(initialAssistantModelId);
const selectedModelTouched = ref(Boolean(storedAssistantModelId));
const aiSettingsLoading = ref(false);
const aiSettingsError = ref("");
const aiProviders = ref<AiProviderRecord[]>([]);
const voiceDictationState = ref<"idle" | "listening" | "processing" | "unsupported">("idle");
const voiceDictationError = ref<string | null>(null);
const voiceMediaRecorder = ref<MediaRecorder | null>(null);
const voiceMediaStream = ref<MediaStream | null>(null);
const voiceAudioChunks: Blob[] = [];
let voiceStopTimeout: number | null = null;
let voiceDiscardRecording = false;
let assistantAbortController: AbortController | null = null;

const defaultDailyBriefingTemplate =
  "☀️ Good morning, {{owner.name}}. {{calendar.summary}}\n\n{{calendar.events}}\n{{calendar.reminders}}\n{{mission.tasks}}\n\nI'll keep an eye on the day from here.";

const dailyBriefingVariables = [
  { label: "Name", value: "{{owner.name}}" },
  { label: "Date", value: "{{today.date}}" },
  { label: "Calendar summary", value: "{{calendar.summary}}" },
  { label: "Events", value: "{{calendar.events}}" },
  { label: "Reminders", value: "{{calendar.reminders}}" },
  { label: "Tasks", value: "{{mission.tasks}}" },
];

const suggestedRecipeOrder = [
  "daily-briefing",
  "weekly-review",
  "email-triage",
  "invoice-receipt-triage",
];

const suggestedRecipeIds = new Set(suggestedRecipeOrder);
const scheduleCadenceOptions: Array<{
  label: string;
  value: AssistantScheduleCadence;
}> = [
  { label: "Every day", value: "daily" },
  { label: "Every week", value: "weekly" },
  { label: "Every month", value: "monthly" },
];
const weekdayOptions = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];
const monthDayOptions = Array.from({ length: 28 }, (_, index) => index + 1);
const jobBuilderStarterPrompt =
  "/job Every friday, review my projects and outstanding tasks";
const starterPrompts = [
  {
    label: "Set up a job",
    icon: "💼",
    prompt: jobBuilderStarterPrompt,
  },
  { label: "Draft an email", icon: "✉️", prompt: "Draft an email" },
  { label: "Add a reminder", icon: "⏰", prompt: "Add a reminder" },
  { label: "Review my week", icon: "📅", prompt: "Review my week" },
  { label: "Update my site", icon: "🌐", prompt: "Update my site" },
];
const assistantAttachmentLimit = 4;
const assistantAttachmentMaxBytes = 10_000_000;
const assistantTextAttachmentMaxBytes = 1_000_000;
const assistantAttachmentTextBudget = 48_000;

const sortedJobs = computed(() =>
  [...jobs.value].sort((a, b) => {
    const statusRank = statusSortRank(a.status) - statusSortRank(b.status);
    if (statusRank !== 0) return statusRank;
    return a.name.localeCompare(b.name);
  }),
);

type ConfigureJobRow =
  | { kind: "job"; job: AssistantJob }
  | { kind: "recipe"; recipe: AssistantJobRecipe };

const configureJobRows = computed((): ConfigureJobRow[] => {
  const rows: ConfigureJobRow[] = [];
  const usedJobIds = new Set<string>();

  for (const recipeId of suggestedRecipeOrder) {
    const job = jobs.value.find((item) => item.recipeId === recipeId);
    if (job) {
      rows.push({ kind: "job", job });
      usedJobIds.add(job.id);
      continue;
    }
    const recipe = recipes.value.find((item) => item.id === recipeId);
    if (recipe && suggestedRecipeIds.has(recipe.id)) {
      rows.push({ kind: "recipe", recipe });
    }
  }

  for (const job of sortedJobs.value) {
    if (!usedJobIds.has(job.id)) {
      rows.push({ kind: "job", job });
    }
  }

  return rows;
});

const selectedJob = computed(
  () =>
    jobs.value.find((job) => job.id === selectedJobId.value) ||
    selectedDetail.value?.job ||
    null,
);

const selectedJobIsDailyBriefing = computed(
  () => selectedDetail.value?.job.recipeId === "daily-briefing",
);

const selectedJobIsInboxWatch = computed(
  () => selectedDetail.value?.job.recipeId === "email-triage",
);

const selectedScheduleTrigger = computed(() => {
  const trigger = selectedDetail.value?.version?.trigger;
  return isScheduleTrigger(trigger) ? trigger : null;
});

const savedDailyBriefingTemplate = computed(() => {
  const notifyAction = selectedDetail.value?.version?.actions.find(
    (action) => action.capabilityId === "message.owner.notify",
  );
  const template = notifyAction?.inputs?.messageTemplate;
  return typeof template === "string" && template.trim()
    ? template
    : defaultDailyBriefingTemplate;
});

const dailyBriefingTemplateChanged = computed(
  () =>
    dailyBriefingTemplateDraft.value.trim() !==
    savedDailyBriefingTemplate.value.trim(),
);

const dailyBriefingPreview = computed(() =>
  renderDailyBriefingPreview(
    dailyBriefingTemplateDraft.value || defaultDailyBriefingTemplate,
  ),
);

const scheduleDraftChanged = computed(() => {
  const trigger = selectedScheduleTrigger.value;
  if (!trigger) return false;
  const savedDayOfMonth = parseMonthlyDayOfMonth(trigger.rrule) || 1;
  return (
    scheduleCadenceDraft.value !== trigger.cadence ||
    scheduleTimeDraft.value !== (trigger.localTime || "08:00") ||
    (scheduleCadenceDraft.value === "weekly" &&
      scheduleDayOfWeekDraft.value !== (trigger.dayOfWeek ?? 1)) ||
    (scheduleCadenceDraft.value === "monthly" &&
      scheduleDayOfMonthDraft.value !== savedDayOfMonth)
  );
});

const scheduleTimeValid = computed(() =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTimeDraft.value),
);

const inboxWatchRulesChanged = computed(() => {
  if (!selectedJobIsInboxWatch.value) return false;
  return (
    JSON.stringify(buildInboxWatchRulePayload(inboxWatchRulesDraft.value)) !==
    JSON.stringify(
      buildInboxWatchRulePayload(
        inboxWatchRuleFormsFromRules(selectedDetail.value?.version?.rules || []),
      ),
    )
  );
});

const selectedModel = computed(
  () =>
    AI_AGENT_MODEL_OPTIONS.find((model) => model.id === selectedModelId.value) ||
    AI_AGENT_MODEL_OPTIONS[0],
);

const aiProviderById = computed(() => {
  const providers = new Map<string, AiProviderRecord>();
  for (const provider of aiProviders.value) {
    providers.set(provider.id, provider);
  }
  return providers;
});

const assistantModelOptions = computed(() =>
  AI_AGENT_MODEL_OPTIONS.map((option) => {
    const setup = setupStateForModel(option);
    const optionTitle = [
      option.label,
      option.runtimeLabel,
      setup.statusLabel,
      capabilitySummary(option.capabilities),
      option.description,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      option,
      optionLabel: option.label,
      optionTitle,
    };
  }),
);

const selectedModelSetup = computed(() => setupStateForModel(selectedModel.value));

const selectedModelTitle = computed(() => {
  const model = selectedModel.value;
  if (!model) return "Model";
  const setup = selectedModelSetup.value;
  return [
    model.label,
    model.runtimeLabel,
    setup.statusLabel,
    capabilitySummary(model.capabilities),
    model.description,
  ]
    .filter(Boolean)
    .join(" · ");
});

const assistantConsoleMessages = computed(() =>
  chatMessages.value.filter((message) => message.id !== "assistant-ready"),
);
const assistantAttachmentsReady = computed(() =>
  assistantAttachments.value.every((attachment) => attachment.status !== "uploading"),
);
const assistantTextAttachments = computed(() =>
  assistantAttachments.value.filter(
    (attachment) => attachment.kind === "text" && attachment.status === "ready",
  ),
);
const assistantReadyAttachments = computed(() =>
  assistantAttachments.value.filter((attachment) => attachment.status === "ready"),
);
const assistantAttachmentIssue = computed(() => {
  const errored = assistantAttachments.value.find((attachment) => attachment.status === "error");
  if (errored?.error) return errored.error;
  if (!assistantAttachmentsReady.value) return "Uploading attachments...";

  const unsupported = assistantAttachments.value.find(
    (attachment) => attachment.kind === "unsupported",
  );
  if (unsupported) {
    return `${unsupported.name} is not a supported assistant attachment yet. Use text, markdown, JSON, CSV, or images.`;
  }

  const hasImage = assistantAttachments.value.some((attachment) => attachment.kind === "image");
  if (hasImage && !selectedModel.value.capabilities.includes("vision")) {
    return "Switch to a vision-capable model before sending images.";
  }

  return "";
});
const assistantComposerDragActive = computed(() => assistantComposerDragDepth.value > 0);
const assistantProjectThreadGroups = computed(() =>
  assistantProjects.value.map((project) => ({
    project,
    threads: assistantThreads.value.filter((thread) => thread.projectId === project.id),
  })),
);
const assistantUngroupedThreads = computed(() =>
  assistantThreads.value.filter((thread) => !thread.projectId),
);
const assistantThreadSearchActive = computed(() => assistantThreadSearch.value.trim().length > 0);
const assistantThreadListEmpty = computed(
  () =>
    !assistantThreadsLoading.value &&
    assistantThreads.value.length === 0 &&
    !assistantThreadsError.value,
);

const canSendAssistantMessage = computed(
  () =>
    (assistantDraft.value.trim().length > 0 || assistantReadyAttachments.value.length > 0) &&
    !assistantSending.value &&
    !assistantThreadLoading.value &&
    !assistantAttachmentIssue.value,
);
const canUseVoiceDictation = computed(
  () => !assistantSending.value && voiceDictationState.value !== "processing",
);
const voiceDictationStatusText = computed(() => {
  if (voiceDictationState.value === "listening") return "Listening";
  if (voiceDictationState.value === "processing") return "Transcribing";
  if (voiceDictationError.value) return voiceDictationError.value;
  return "";
});

onMounted(() => {
  if (!supportsMediaRecording()) {
    voiceDictationState.value = "unsupported";
  }
  void loadPage();
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  stopVoiceDictation({ discard: true });
  clearAssistantAttachments();
  window.removeEventListener("keydown", handleWindowKeydown);
});

watch(
  chatMessages,
  () => {
    void scrollAssistantToBottom();
  },
  { deep: true },
);
watch(
  () => route.query.thread,
  () => {
    if (assistantThreadId.value === routeThreadId()) return;
    void loadAssistantThreadFromRoute();
  },
);

async function loadPage() {
  pageError.value = "";
  await Promise.all([
    loadJobs(),
    loadRecipes(),
    loadAiSettings(),
    loadAssistantProjects(),
    loadAssistantThreads(),
    loadAssistantThreadFromRoute(),
  ]);
}

async function loadAssistantThreads() {
  assistantThreadsLoading.value = true;
  assistantThreadsError.value = "";
  try {
    const params = new URLSearchParams({
      status: "active",
      limit: "80",
    });
    const search = assistantThreadSearch.value.trim();
    if (search) params.set("q", search);
    const response = await api.get<AssistantThreadsResponse>(
      `/assistant/threads?${params.toString()}`,
    );
    assistantThreads.value = response.threads || [];
  } catch (err) {
    assistantThreadsError.value = messageFromUnknown(err, "Chats could not load.");
  } finally {
    assistantThreadsLoading.value = false;
  }
}

async function loadAssistantProjects() {
  assistantProjectsLoading.value = true;
  assistantProjectsError.value = "";
  try {
    const response = await api.get<MissionProjectsResponse>("/mission-control/projects");
    assistantProjects.value = response.projects || [];
  } catch (err) {
    assistantProjectsError.value = messageFromUnknown(err, "Projects could not load.");
  } finally {
    assistantProjectsLoading.value = false;
  }
}

function routeThreadId() {
  const value = route.query.thread;
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routeProjectId() {
  const value = route.query.project;
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function setRouteThreadId(threadId: string) {
  if (routeThreadId() === threadId) return;
  const thread = assistantThreads.value.find((item) => item.id === threadId);
  await router.replace({
    query: {
      ...route.query,
      thread: threadId,
      project: thread?.projectId || undefined,
    },
  });
}

async function startNewAssistantChat(
  projectId: string | null = null,
  options: { closeHistory?: boolean } = {},
) {
  assistantThreadId.value = null;
  assistantError.value = null;
  if (options.closeHistory !== false) {
    assistantHistoryDrawerOpen.value = false;
  }
  agentChat.resetMessages();
  await router.replace({
    query: {
      ...route.query,
      thread: undefined,
      project: projectId || undefined,
    },
  });
  await nextTick();
  assistantComposerRef.value?.focus();
}

async function selectAssistantThread(threadId: string) {
  if (!threadId || assistantThreadId.value === threadId) {
    return;
  }
  await setRouteThreadId(threadId);
}

function toggleAssistantHistoryCollapsed() {
  assistantHistoryCollapsed.value = !assistantHistoryCollapsed.value;
}

async function applyAssistantThreadSearch() {
  assistantThreadSearch.value = assistantThreadSearchDraft.value.trim();
  await loadAssistantThreads();
}

async function clearAssistantThreadSearch() {
  assistantThreadSearchDraft.value = "";
  assistantThreadSearch.value = "";
  await loadAssistantThreads();
}

async function archiveAssistantThread(thread: AssistantThread) {
  if (assistantThreadActionId.value) return;
  assistantThreadActionId.value = thread.id;
  const nextStatus = thread.status === "archived" ? "active" : "archived";
  try {
    const response = await api.patch<{ thread: AssistantThread }>(
      `/assistant/threads/${encodeURIComponent(thread.id)}`,
      { status: nextStatus },
    );
    assistantThreads.value = assistantThreads.value.filter((item) => item.id !== thread.id);
    if (assistantThreadId.value === thread.id && nextStatus === "archived") {
      await startNewAssistantChat(null, { closeHistory: false });
    }
    if (nextStatus === "active") {
      upsertAssistantThread(response.thread);
      archivedAssistantThreads.value = archivedAssistantThreads.value.filter(
        (item) => item.id !== response.thread.id,
      );
    } else {
      archivedAssistantThreads.value = [
        response.thread,
        ...archivedAssistantThreads.value.filter((item) => item.id !== response.thread.id),
      ];
    }
  } catch (err) {
    assistantThreadsError.value = messageFromUnknown(err, "Chat could not update.");
  } finally {
    assistantThreadActionId.value = null;
  }
}

async function deleteAssistantThread(thread: AssistantThread) {
  if (assistantThreadActionId.value) return false;
  const confirmed = window.confirm(`Delete "${threadTitle(thread)}"? This removes transcript text.`);
  if (!confirmed) return false;
  assistantThreadActionId.value = thread.id;
  try {
    await api.delete(`/assistant/threads/${encodeURIComponent(thread.id)}`);
    assistantThreads.value = assistantThreads.value.filter((item) => item.id !== thread.id);
    if (assistantThreadId.value === thread.id) {
      await startNewAssistantChat(null, { closeHistory: false });
    }
    return true;
  } catch (err) {
    assistantThreadsError.value = messageFromUnknown(err, "Chat could not be deleted.");
    return false;
  } finally {
    assistantThreadActionId.value = null;
  }
}

async function loadArchivedAssistantThreads() {
  archivedAssistantThreadsLoading.value = true;
  archivedAssistantThreadsError.value = "";
  try {
    const response = await api.get<AssistantThreadsResponse>(
      "/assistant/threads?status=archived&limit=80",
    );
    archivedAssistantThreads.value = response.threads || [];
  } catch (err) {
    archivedAssistantThreadsError.value = messageFromUnknown(
      err,
      "Archived chats could not load.",
    );
  } finally {
    archivedAssistantThreadsLoading.value = false;
  }
}

async function openArchivedThreadsModal() {
  archivedThreadsModalOpen.value = true;
  await loadArchivedAssistantThreads();
}

function closeArchivedThreadsModal() {
  archivedThreadsModalOpen.value = false;
}

async function restoreArchivedAssistantThread(thread: AssistantThread) {
  await archiveAssistantThread(thread);
}

async function deleteArchivedAssistantThread(thread: AssistantThread) {
  const deleted = await deleteAssistantThread(thread);
  if (!deleted) return;
  archivedAssistantThreads.value = archivedAssistantThreads.value.filter(
    (item) => item.id !== thread.id,
  );
}

async function exportAssistantThread(thread: AssistantThread) {
  if (assistantThreadActionId.value) return;
  assistantThreadActionId.value = thread.id;
  try {
    const response = await api.get<AssistantThreadExportResponse>(
      `/assistant/threads/${encodeURIComponent(thread.id)}/export`,
    );
    const transcript = [
      `# ${threadTitle(response.thread)}`,
      "",
      `Exported: ${response.exportedAt}`,
      response.thread.projectId ? `Project: ${projectName(response.thread.projectId)}` : "Project: None",
      "",
      ...response.messages.flatMap((message) => [
        `## ${message.role === "user" ? "You" : "ME3"} - ${message.createdAt}`,
        "",
        message.text || "",
        "",
      ]),
    ].join("\n");
    const blob = new Blob([transcript], { type: "text/markdown;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugifyFilename(threadTitle(response.thread)) || "assistant-chat"}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    assistantThreadsError.value = messageFromUnknown(err, "Chat could not export.");
  } finally {
    assistantThreadActionId.value = null;
  }
}

function upsertAssistantThread(thread: AssistantThread) {
  assistantThreads.value = [
    thread,
    ...assistantThreads.value.filter((item) => item.id !== thread.id),
  ];
}

function projectName(projectId: string | null) {
  if (!projectId) return "Chats";
  return assistantProjects.value.find((project) => project.id === projectId)?.name || "Project";
}

function slugifyFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatAssistantThreadTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - thatDay.getTime()) / 86_400_000);
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatAssistantMessageTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function threadTitle(thread: AssistantThread) {
  return thread.title?.trim() || "New chat";
}

async function loadAssistantThreadFromRoute() {
  const threadId = routeThreadId();
  assistantThreadId.value = threadId;
  assistantError.value = null;

  if (!threadId) {
    agentChat.resetMessages();
    return;
  }

  assistantThreadLoading.value = true;
  try {
    const response = await api.get<AssistantThreadMessagesResponse>(
      `/assistant/threads/${encodeURIComponent(threadId)}/messages`,
    );
    if (assistantThreadId.value !== threadId) return;
    if (response.thread) {
      if (response.thread.status === "active") {
        upsertAssistantThread(response.thread);
      } else {
        archivedAssistantThreads.value = [
          response.thread,
          ...archivedAssistantThreads.value.filter((item) => item.id !== response.thread.id),
        ];
      }
    }
    agentChat.replaceMessages(
      response.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
      })),
    );
  } catch (err) {
    if (assistantThreadId.value !== threadId) return;
    assistantError.value = messageFromUnknown(err, "Assistant thread could not load.");
    agentChat.resetMessages();
  } finally {
    if (assistantThreadId.value === threadId) {
      assistantThreadLoading.value = false;
    }
  }
}

const COMPOSER_MAX_HEIGHT_PX = 160;

async function scrollAssistantToBottom() {
  await nextTick();
  const node = assistantScrollerRef.value;
  if (!node) return;
  node.scrollTop = node.scrollHeight;
}

function autosizeAssistantComposer() {
  const el = assistantComposerRef.value;
  if (!el) return;
  el.style.height = "auto";
  const scroll = el.scrollHeight;
  const next = Math.min(scroll, COMPOSER_MAX_HEIGHT_PX);
  el.style.height = `${next}px`;
  el.style.overflowY = scroll > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
}

function useStarterPrompt(prompt: string) {
  assistantDraft.value = prompt;
  assistantError.value = null;
  void nextTick(() => {
    autosizeAssistantComposer();
    assistantComposerRef.value?.focus();
  });
}

function startAssistantJobBuilder() {
  closeConfigureJobsModal();
  useStarterPrompt(jobBuilderStarterPrompt);
}

function openAssistantAttachmentPicker() {
  if (assistantSending.value) return;
  assistantAttachmentInputRef.value?.click();
}

async function onAssistantAttachmentChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (files.length === 0) return;
  await addAssistantAttachments(files);
}

function assistantDragHasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function onAssistantComposerDragEnter(event: DragEvent) {
  if (assistantSending.value || !assistantDragHasFiles(event)) return;
  event.preventDefault();
  assistantComposerDragDepth.value += 1;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function onAssistantComposerDragOver(event: DragEvent) {
  if (assistantSending.value || !assistantDragHasFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function onAssistantComposerDragLeave(event: DragEvent) {
  if (!assistantDragHasFiles(event)) return;
  event.preventDefault();
  assistantComposerDragDepth.value = Math.max(0, assistantComposerDragDepth.value - 1);
}

async function onAssistantComposerDrop(event: DragEvent) {
  if (assistantSending.value || !assistantDragHasFiles(event)) return;
  event.preventDefault();
  assistantComposerDragDepth.value = 0;
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length === 0) return;
  await addAssistantAttachments(files);
}

async function addAssistantAttachments(files: File[]) {
  assistantAttachmentNotice.value = "";
  const slots = assistantAttachmentLimit - assistantAttachments.value.length;
  if (slots <= 0) {
    assistantAttachmentNotice.value = `Attach up to ${assistantAttachmentLimit} files.`;
    return;
  }

  const accepted = files.slice(0, slots);
  if (files.length > slots) {
    assistantAttachmentNotice.value = `Only ${slots} more file${slots === 1 ? "" : "s"} can be attached.`;
  }

  for (const file of accepted) {
    const draft: AssistantAttachmentDraft = {
      id: crypto.randomUUID(),
      name: file.name || "Attachment",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind: classifyAssistantAttachment(file),
      previewUrl: file.type.toLowerCase().startsWith("image/")
        ? window.URL.createObjectURL(file)
        : null,
      text: null,
      status: "uploading",
      error: null,
      storageKey: null,
      textTruncated: false,
    };
    assistantAttachments.value.push(draft);

    if (file.size > assistantAttachmentMaxBytes) {
      draft.status = "error";
      draft.error = `${draft.name} is too large. Use files under ${formatFileSize(assistantAttachmentMaxBytes)} for now.`;
      continue;
    }

    if (draft.kind === "text" && file.size > assistantTextAttachmentMaxBytes) {
      draft.status = "error";
      draft.error = `${draft.name} is too large to read as text. Use files under ${formatFileSize(assistantTextAttachmentMaxBytes)} for now.`;
      continue;
    }

    if (draft.kind === "unsupported") {
      draft.status = "error";
      draft.error = `${draft.name} is not supported yet. Use text, markdown, JSON, CSV, XML, or images.`;
      continue;
    }

    try {
      const formData = new FormData();
      formData.append("attachments", file);
      const threadId = routeThreadId();
      if (threadId) formData.append("threadId", threadId);
      const response = await api.upload<AssistantAttachmentUploadResponse>(
        "/assistant/attachments",
        formData,
      );
      const uploaded = response.attachments[0];
      if (!uploaded) throw new Error("Attachment upload did not return a record.");
      draft.id = uploaded.id;
      draft.name = uploaded.name || uploaded.filename || draft.name;
      draft.mimeType = uploaded.mimeType || draft.mimeType;
      draft.size = uploaded.size;
      draft.kind = uploaded.kind;
      draft.text = uploaded.text ? uploaded.text.slice(0, assistantAttachmentTextBudget) : null;
      draft.storageKey = uploaded.storageKey;
      draft.textTruncated = Boolean(uploaded.textTruncated);
      draft.status = "ready";
    } catch (err) {
      draft.status = "error";
      draft.error = messageFromUnknown(err, `Could not upload ${draft.name}.`);
    }
  }
}

function removeAssistantAttachment(id: string) {
  const attachment = assistantAttachments.value.find((item) => item.id === id);
  revokeAssistantAttachmentPreview(attachment);
  assistantAttachments.value = assistantAttachments.value.filter((item) => item.id !== id);
}

function clearAssistantAttachments() {
  assistantAttachments.value.forEach((attachment) => {
    revokeAssistantAttachmentPreview(attachment);
  });
  assistantAttachments.value = [];
}

function revokeAssistantAttachmentPreview(attachment: AssistantAttachmentDraft | undefined) {
  if (!attachment?.previewUrl) return;
  window.URL.revokeObjectURL(attachment.previewUrl);
}

function classifyAssistantAttachment(file: File): AssistantAttachmentKind {
  const mimeType = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".json") ||
    name.endsWith(".txt") ||
    name.endsWith(".xml")
  ) {
    return "text";
  }
  return "unsupported";
}

function buildAssistantMessageWithAttachments(text: string) {
  const normalized = text.trim();
  const attachments = assistantTextAttachments.value;
  if (attachments.length === 0) return normalized || "Review the attached files.";

  const base = normalized || "Review the attached files.";
  const renderedAttachments = attachments
    .map((attachment) => {
      const content = attachment.text?.trim() || "(No readable text.)";
      return [
        `File: ${attachment.name}`,
        `Type: ${attachment.mimeType || "unknown"}`,
        "Content:",
        content,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return `${base}\n\nAttached file context:\n\n${renderedAttachments}`;
}

function serializeAssistantAttachmentsForTurn() {
  return assistantAttachments.value.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind: attachment.kind,
    status: attachment.status,
    storageKey: attachment.storageKey,
    hasText: Boolean(attachment.text),
    textTruncated: attachment.textTruncated,
  }));
}

function formatFileSize(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 100) / 10} KB`;
  return `${Math.round(bytes / 100_000) / 10} MB`;
}

async function loadAiSettings() {
  aiSettingsLoading.value = true;
  aiSettingsError.value = "";

  try {
    const response = await api.get<AiSettingsResponse>("/ai-settings");
    aiProviders.value = response.providers || [];
    applyDefaultChatModel(response);
  } catch (err) {
    aiSettingsError.value = messageFromUnknown(
      err,
      "Could not check model setup.",
    );
  } finally {
    aiSettingsLoading.value = false;
  }
}

function applyDefaultChatModel(settings: AiSettingsResponse) {
  if (selectedModelTouched.value) return;

  const route = settings.defaults?.chat || settings.defaults?.default;
  if (!route) return;

  const matchedOption = AI_AGENT_MODEL_OPTIONS.find(
    (option) =>
      option.providerId === route.providerId && option.model === route.model,
  );

  if (matchedOption) {
    selectedModelId.value = matchedOption.id;
  }
}

function handleAssistantModelChange() {
  selectedModelTouched.value = true;
  persistAssistantModelId(selectedModelId.value);
}

function getStoredAssistantModelId() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(assistantModelStorageKey);
    return AI_AGENT_MODEL_OPTIONS.some((option) => option.id === value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function persistAssistantModelId(modelId: string) {
  if (typeof window === "undefined") return;
  if (!AI_AGENT_MODEL_OPTIONS.some((option) => option.id === modelId)) return;
  try {
    window.localStorage.setItem(assistantModelStorageKey, modelId);
  } catch {
    // Losing local preference persistence should not block chat.
  }
}

function setupStateForModel(option: AiAgentModelOption | undefined) {
  if (!option) {
    return {
      configured: false,
      setupRequired: false,
      statusLabel: "Unknown",
      className: "model-picker__status--unknown",
    };
  }

  if (aiSettingsLoading.value) {
    return {
      configured: false,
      setupRequired: false,
      statusLabel: "Checking",
      className: "model-picker__status--unknown",
    };
  }

  if (aiSettingsError.value) {
    return {
      configured: false,
      setupRequired: false,
      statusLabel: "Unknown",
      className: "model-picker__status--unknown",
    };
  }

  const provider = aiProviderById.value.get(option.providerId);
  if (!provider) {
    return {
      configured: false,
      setupRequired: false,
      statusLabel: "Unknown",
      className: "model-picker__status--unknown",
    };
  }

  return {
    configured: provider.configured,
    setupRequired: provider.setupRequired,
    statusLabel: provider.configured ? "Ready" : "Setup needed",
    className: provider.configured
      ? "model-picker__status--ready"
      : "model-picker__status--setup",
  };
}

function capabilitySummary(capabilities: AiAgentModelCapability[]) {
  const labels: Record<AiAgentModelCapability, string> = {
    text: "Text",
    vision: "Vision",
    "long-context": "Long",
    reasoning: "Reasoning",
    "tool-use": "Tools",
  };
  return capabilities.map((capability) => labels[capability]).join(", ");
}

function assistantMessageKey(message: { id?: string; role: string; text: string }, index?: number) {
  return message.id || `${message.role}:${index ?? 0}:${message.text.slice(0, 32)}`;
}

function newAssistantMessageId(role: "user" | "assistant") {
  return `${role}:${crypto.randomUUID()}`;
}

function assistantMessageIndex(message: (typeof chatMessages.value)[number]) {
  return chatMessages.value.indexOf(message);
}

async function submitAssistantText(
  text: string,
  attachments = serializeAssistantAttachmentsForTurn(),
) {
  const normalized = text.trim();
  if (!normalized || assistantSending.value) return;

  assistantError.value = null;
  const abortController = new AbortController();
  assistantAbortController = abortController;
  agentChat.appendMessage({
    id: newAssistantMessageId("user"),
    role: "user",
    text: normalized,
    createdAt: new Date().toISOString(),
  });
  assistantSending.value = true;
  assistantAwaitingResponse.value = true;
  await scrollAssistantToBottom();
  const assistantMessageId = newAssistantMessageId("assistant");
  let assistantMessageStarted = false;

  try {
    let result: AgentSandboxResponse | null = null;

    const ensureAssistantMessage = () => {
      if (assistantMessageStarted) return;
      assistantMessageStarted = true;
      assistantAwaitingResponse.value = false;
      agentChat.appendMessage({
        id: assistantMessageId,
        role: "assistant",
        text: "",
        createdAt: new Date().toISOString(),
      });
    };

    await api.streamEvents(
      "/assistant/chat/turn/stream",
      {
        messageText: normalized,
        threadId: assistantThreadId.value,
        projectId: assistantThreadId.value ? undefined : routeProjectId(),
        attachments,
        model: selectedModel.value
          ? {
              providerId: selectedModel.value.providerId,
              model: selectedModel.value.model,
              optionId: selectedModel.value.id,
            }
          : null,
      },
      (event) => {
        const data = streamEventRecord(event);

        if (event.event === "thread") {
          const threadId = typeof data.threadId === "string" ? data.threadId : "";
          if (threadId) {
            assistantThreadId.value = threadId;
          }
          return;
        }

        if (event.event === "delta") {
          ensureAssistantMessage();
          const message = chatMessages.value.find((item) => item.id === assistantMessageId);
          if (message && typeof data.text === "string") {
            message.text += data.text;
          }
          void scrollAssistantToBottom();
          return;
        }

        if (event.event === "done") {
          ensureAssistantMessage();
          result = data as unknown as AgentSandboxResponse;
          applyAssistantResultToMessage(assistantMessageId, result);
          return;
        }

        if (event.event === "error") {
          throw new Error(
            typeof data.error === "string" ? data.error : "Assistant stream failed",
          );
        }
      },
      {
        signal: abortController.signal,
      },
    );

    assistantAwaitingResponse.value = false;
    const completedResult = result as AgentSandboxResponse | null;
    if (!completedResult) {
      throw new Error("Assistant stream ended before the turn completed.");
    }
    if (completedResult.threadId) {
      assistantThreadId.value = completedResult.threadId;
      await setRouteThreadId(completedResult.threadId);
      void loadAssistantThreads();
    }
  } catch (err) {
    assistantAwaitingResponse.value = false;
    if (isAbortError(err)) {
      setAssistantStoppedMessage(assistantMessageId, assistantMessageStarted);
      return;
    }
    const message = messageFromUnknown(err, "Failed to reach ME3 right now.");
    assistantError.value = message;
    agentChat.appendMessage({
      id: newAssistantMessageId("assistant"),
      role: "assistant",
      text: "I couldn't complete that turn just yet.",
      createdAt: new Date().toISOString(),
      detail: message,
    });
  } finally {
    if (assistantAbortController === abortController) {
      assistantAbortController = null;
    }
    assistantAwaitingResponse.value = false;
    assistantSending.value = false;
    await scrollAssistantToBottom();
    await nextTick();
    autosizeAssistantComposer();
    assistantComposerRef.value?.focus();
  }
}

async function sendAssistantMessage() {
  if (!canSendAssistantMessage.value) return;

  const attachments = serializeAssistantAttachmentsForTurn();
  const text = buildAssistantMessageWithAttachments(assistantDraft.value);
  assistantDraft.value = "";
  clearAssistantAttachments();
  assistantAttachmentNotice.value = "";
  autosizeAssistantComposer();
  await submitAssistantText(text, attachments);
}

function streamEventRecord(event: ApiStreamEvent): Record<string, unknown> {
  return event.data && typeof event.data === "object" && !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : {};
}

function applyAssistantResultToMessage(messageId: string, result: AgentSandboxResponse) {
  const message = chatMessages.value.find((item) => item.id === messageId);
  if (!message) return;
  if (!message.text.trim()) {
    message.text = resolveAgentReplyText(result.replyText);
  }
  message.meta = formatAgentRuntimeMetadata(result, {
    showRuntimeMetadata: import.meta.env.DEV,
  });
  message.detail = formatAgentRuntimeDetail(result);
  message.inboxLink = result.emailAction?.kind === "drafted";
  message.rolodexLink = result.contactsChanged === true;
  message.reminderLink =
    result.reminderAction?.kind === "created" ||
    result.reminderAction?.kind === "updated";
  message.actionHref = result.contentAction?.kind === "saved" ? "/assistant" : null;
  message.actionLabel =
    result.contentAction?.kind === "saved" ? "Open content bank" : null;
  message.jobBuilderAction = result.jobBuilderAction || null;
}

type AssistantJobSaveResponse = {
  job: AssistantJob;
  version: AssistantJobVersion | null;
  validation: AssistantJobDraftValidation;
};

function jobBuilderBusyKey(action: AssistantJobBuilderAction, intent: string) {
  return action.kind === "job_draft"
    ? `job-builder:${intent}:${action.draftId}`
    : `job-builder:${intent}:${action.jobId}`;
}

function jobBuilderActionBusy(action: AssistantJobBuilderAction, intent: string) {
  return busyKeys.value.has(jobBuilderBusyKey(action, intent));
}

async function saveAssistantJobBuilderDraft(
  message: (typeof chatMessages.value)[number],
  action: AssistantJobBuilderAction,
  activate: boolean,
) {
  if (action.kind !== "job_draft") return;
  const intent = activate ? "save_and_activate" : "save";
  const key = jobBuilderBusyKey(action, intent);
  if (busyKeys.value.has(key)) return;
  busyKeys.value.add(key);
  try {
    const response = await api.post<AssistantJobSaveResponse>("/assistant/jobs", {
      draft: action.draft,
      status: activate ? "active" : "draft",
    });
    await loadJobs();
    const savedAction = assistantJobSavedAction(response.job);
    message.jobBuilderAction = savedAction;
    message.text = savedAction.summary;
    toastSuccess(activate && response.job.status === "active" ? "Job saved and activated." : "Job saved.");
  } catch (err) {
    assistantError.value = messageFromUnknown(err, "Job could not be saved.");
    toastFromUnknown(err, "Job could not be saved.");
  } finally {
    busyKeys.value.delete(key);
  }
}

async function runAssistantJobBuilderSaved(action: AssistantJobBuilderAction) {
  if (action.kind !== "job_saved") return;
  const job = jobs.value.find((item) => item.id === action.jobId);
  if (!job) return;
  await runJob(job);
}

async function activateAssistantJobBuilderSaved(
  message: (typeof chatMessages.value)[number],
  action: AssistantJobBuilderAction,
) {
  if (action.kind !== "job_saved") return;
  const job = jobs.value.find((item) => item.id === action.jobId);
  if (!job) return;
  const key = jobBuilderBusyKey(action, "activate");
  if (busyKeys.value.has(key)) return;
  busyKeys.value.add(key);
  try {
    const response = await api.post<{ job: AssistantJob }>(
      `/assistant/jobs/${encodeURIComponent(job.id)}/resume`,
    );
    await loadJobs();
    const savedAction = assistantJobSavedAction(response.job);
    message.jobBuilderAction = savedAction;
    message.text = savedAction.summary;
    toastSuccess("Job activated.");
  } catch (err) {
    assistantError.value = messageFromUnknown(err, "Job could not activate.");
    toastFromUnknown(err, "Job could not activate.");
  } finally {
    busyKeys.value.delete(key);
  }
}

function assistantJobSavedAction(job: AssistantJob): AssistantJobSavedBuilderAction {
  const availableActions: Array<"activate" | "run_now" | "open_job"> = ["open_job"];
  if (job.status === "draft" || job.status === "paused") {
    availableActions.unshift("activate");
  }
  if (job.status === "active") {
    availableActions.unshift("run_now");
  }
  return {
    kind: "job_saved",
    jobId: job.id,
    status: job.status,
    summary: `${job.name} was saved as ${assistantJobStatusLabel(job.status)}.`,
    availableActions,
  };
}

function assistantJobStatusLabel(
  status: AssistantJobStatus | AssistantJobDraftValidation["status"],
) {
  const labels: Record<AssistantJobStatus | AssistantJobDraftValidation["status"], string> = {
    draft: "Draft",
    active: "Active",
    paused: "Paused",
    needs_setup: "Needs setup",
    failing: "Failing",
    archived: "Archived",
    valid: "Ready",
    invalid: "Needs changes",
  };
  return labels[status] || status;
}

function assistantJobBuilderDestinationLabel(draft: AssistantJobDraft) {
  const labels: Record<AssistantJobDraft["destination"]["landing"], string> = {
    review_packet: "Mission Control review",
    task: "Mission Control task",
    capture: "Mission Control capture",
    approval: "Mission Control approval",
    memory_review: "Memory review",
    activity: "Mission Control activity",
    accounts: "Accounts",
  };
  return labels[draft.destination.landing] || "Mission Control";
}

function assistantJobBuilderWhenPhrase(draft: AssistantJobDraft) {
  const trigger = draft.trigger;
  if (trigger.kind === "manual") return "when you run it";
  if (trigger.kind === "event") return "when a matching event happens";
  if (trigger.cadence === "daily") {
    return trigger.localTime ? `daily at ${trigger.localTime}` : "daily";
  }
  if (trigger.cadence === "weekly") {
    const day = weekdayOptions.find((option) => option.value === trigger.dayOfWeek)?.label;
    const parts = ["weekly", day ? `on ${day}` : "", trigger.localTime ? `at ${trigger.localTime}` : ""]
      .filter(Boolean)
      .join(" ");
    return parts || "weekly";
  }
  if (trigger.cadence === "monthly") {
    return trigger.localTime ? `monthly at ${trigger.localTime}` : "monthly";
  }
  return "on its custom schedule";
}

function assistantJobBuilderToolNames(draft: AssistantJobDraft) {
  const recipeTools: Record<string, string[]> = {
    "weekly-review": [
      "Mission Control Projects",
      "Mission Control Tasks",
      "Mission Control Approvals",
      "Mission Control Reviews",
    ],
    "daily-briefing": [
      "Mission Control Tasks",
      "Mission Control Approvals",
      "Mission Control Reviews",
      "Owner Notifications",
    ],
    "email-triage": [
      "Email",
      "Mission Control Reviews",
      "Mission Control Tasks",
    ],
    "invoice-receipt-triage": [
      "Email",
      "Accounts",
      "Mission Control Reviews",
    ],
  };
  const fromRecipe = draft.recipeId ? recipeTools[draft.recipeId] : null;
  if (fromRecipe) return fromRecipe;

  const names = new Set<string>();
  for (const action of draft.actions) {
    const [namespace] = action.capabilityId.split(".");
    if (namespace === "mission") names.add("Mission Control");
    if (namespace === "message") names.add("Owner Notifications");
    if (namespace === "email") names.add("Email");
    if (namespace === "accounts") names.add("Accounts");
    if (namespace === "calendar") names.add("Calendar");
  }
  return names.size ? Array.from(names) : ["ME3"];
}

function assistantJobBuilderToolPhrase(draft: AssistantJobDraft) {
  return formatHumanList(assistantJobBuilderToolNames(draft));
}

function recipeIngredientNames(recipe: AssistantJobRecipe) {
  const required = recipe.requiredCapabilityIds.map((capabilityId) =>
    assistantRecipeIngredientName(capabilityId),
  );
  const optional = recipe.optionalCapabilityIds.map((capabilityId) =>
    assistantRecipeIngredientName(capabilityId),
  );
  return { required, optional };
}

function assistantRecipeIngredientName(capabilityId: string) {
  const labels: Record<string, string> = {
    "mission.project.read": "Mission Control Projects",
    "mission.task.read": "Mission Control Tasks",
    "mission.approval.read": "Mission Control Approvals",
    "mission.review_packet.create": "Mission Control Reviews",
    "mission.activity.create": "Mission Control Activity",
    "mission.task.create": "Mission Control Task Creation",
    "message.owner.notify": "Owner Notifications",
    "email.message.read": "Email Messages",
    "email.thread.summarize": "Email Thread Summaries",
    "email.reply.draft": "Email Reply Drafts",
    "accounts.entry.create": "Accounts Entries",
    "calendar.event.read": "Calendar Events",
  };
  if (labels[capabilityId]) return labels[capabilityId];
  return capabilityId
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/_/g, " "))
    .join(" ");
}

function openRecipeIngredientsModal() {
  recipeIngredientsModalOpen.value = true;
}

function closeRecipeIngredientsModal() {
  recipeIngredientsModalOpen.value = false;
}

function assistantJobBuilderSentenceSegments(
  action: Extract<AssistantJobBuilderAction, { kind: "job_draft" }>,
): AssistantJobBuilderSentenceSegment[] {
  const draft = action.draft;
  const when = assistantJobBuilderWhenPhrase(draft);
  const fallbackDestination = assistantJobBuilderDestinationLabel(draft);
  const byRecipe: Record<string, AssistantJobBuilderSentenceSegment[]> = {
    "weekly-review": [
      { text: "This job will review " },
      { text: "your projects, tasks, and pending approvals for the week", strong: true },
      { text: " " },
      { text: when, strong: true },
      { text: " and create " },
      { text: "a weekly review in Mission Control", strong: true },
      { text: " for you to review." },
    ],
    "daily-briefing": [
      { text: "This job will review " },
      { text: "today's tasks and approvals", strong: true },
      { text: " " },
      { text: when, strong: true },
      { text: " and create " },
      { text: "a daily briefing in Mission Control", strong: true },
      { text: " for you to start the day." },
    ],
    "email-triage": [
      { text: "This job will check " },
      { text: "your connected email for messages that match your rules", strong: true },
      { text: " " },
      { text: when, strong: true },
      { text: " and create " },
      { text: "an inbox review in Mission Control", strong: true },
      { text: " for you to act on." },
    ],
    "invoice-receipt-triage": [
      { text: "This job will find " },
      { text: "receipts and invoices in your connected email", strong: true },
      { text: " " },
      { text: when, strong: true },
      { text: " and create " },
      { text: "Accounts entries with a Mission Control review", strong: true },
      { text: " for anything that needs checking." },
    ],
  };

  const sentence = draft.recipeId ? byRecipe[draft.recipeId] : null;
  if (sentence) return sentence;

  return [
    { text: "This job will run " },
    { text: draft.purpose, strong: true },
    { text: " " },
    { text: when, strong: true },
    { text: " and create " },
    { text: fallbackDestination, strong: true },
    { text: " for you to review." },
  ];
}

function formatHumanList(values: string[]) {
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0] || "";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique[unique.length - 1]}`;
}

function setAssistantStoppedMessage(messageId: string, messageStarted: boolean) {
  const stoppedDetail = "ME3 stopped before the assistant finished replying.";
  if (!messageStarted) {
    agentChat.appendMessage({
      id: messageId,
      role: "assistant",
      text: "Stopped.",
      createdAt: new Date().toISOString(),
      detail: stoppedDetail,
    });
    return;
  }

  const message = chatMessages.value.find((item) => item.id === messageId);
  if (!message) return;
  if (!message.text.trim()) {
    message.text = "Stopped.";
  }
  message.detail = message.detail?.trim()
    ? `${message.detail}\n${stoppedDetail}`
    : stoppedDetail;
}

function stopAssistantTurn() {
  if (!assistantSending.value) return;
  assistantAbortController?.abort();
}

function isAbortError(err: unknown) {
  return (
    err instanceof DOMException && err.name === "AbortError"
  ) || (
    err instanceof Error && err.name === "AbortError"
  );
}

async function copyAssistantMessage(
  message: (typeof chatMessages.value)[number],
  index: number,
) {
  const text = message.text.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  copiedMessageKey.value = assistantMessageKey(message, index);
  window.setTimeout(() => {
    if (copiedMessageKey.value === assistantMessageKey(message, index)) {
      copiedMessageKey.value = null;
    }
  }, 1500);
}

async function retryAssistantTurn(message: (typeof chatMessages.value)[number]) {
  if (assistantSending.value) return;

  const startIndex =
    message.role === "user"
      ? assistantMessageIndex(message)
      : findPreviousUserMessageIndex(message);
  if (startIndex < 0) return;

  const text = chatMessages.value[startIndex]?.text.trim();
  if (!text) return;

  chatMessages.value.splice(startIndex);
  await submitAssistantText(text);
}

function editAndResendAssistantTurn(message: (typeof chatMessages.value)[number]) {
  if (assistantSending.value || message.role !== "user") return;

  const index = assistantMessageIndex(message);
  if (index < 0) return;

  assistantDraft.value = message.text;
  assistantError.value = null;
  chatMessages.value.splice(index);
  void nextTick(() => {
    autosizeAssistantComposer();
    assistantComposerRef.value?.focus();
  });
}

function findPreviousUserMessageIndex(message: (typeof chatMessages.value)[number]) {
  const index = assistantMessageIndex(message);
  if (index < 0) return -1;

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (chatMessages.value[cursor]?.role === "user") {
      return cursor;
    }
  }

  return -1;
}

async function toggleVoiceDictation() {
  if (!canUseVoiceDictation.value) return;
  if (voiceDictationState.value === "listening") {
    stopVoiceDictation();
    return;
  }
  await startVoiceDictation();
}

async function startVoiceDictation() {
  if (!supportsMediaRecording()) {
    voiceDictationState.value = "unsupported";
    voiceDictationError.value = "Voice dictation is not available in this browser.";
    return;
  }

  voiceDictationError.value = null;
  assistantError.value = null;
  voiceAudioChunks.splice(0);
  voiceDiscardRecording = false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getPreferredVoiceMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    voiceMediaStream.value = stream;
    voiceMediaRecorder.value = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) voiceAudioChunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      void transcribeRecordedVoice(recorder.mimeType || mimeType || "audio/webm");
    });

    recorder.start();
    voiceDictationState.value = "listening";
    voiceStopTimeout = window.setTimeout(() => {
      stopVoiceDictation();
    }, 120_000);
  } catch (err) {
    cleanupVoiceRecorder();
    voiceDictationState.value = "idle";
    voiceDictationError.value = messageFromUnknown(
      err,
      "Could not start voice dictation.",
    );
  }
}

function stopVoiceDictation(options: { discard?: boolean } = {}) {
  if (voiceStopTimeout !== null) {
    window.clearTimeout(voiceStopTimeout);
    voiceStopTimeout = null;
  }

  const recorder = voiceMediaRecorder.value;
  if (options.discard) {
    voiceDiscardRecording = true;
    voiceAudioChunks.splice(0);
  }
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  } else {
    cleanupVoiceRecorder();
  }
}

async function transcribeRecordedVoice(mimeType: string) {
  if (voiceDiscardRecording) {
    voiceDiscardRecording = false;
    voiceAudioChunks.splice(0);
    cleanupVoiceRecorder();
    voiceDictationState.value = "idle";
    return;
  }

  const chunks = voiceAudioChunks.splice(0);
  cleanupVoiceRecorder();
  if (chunks.length === 0) {
    voiceDictationState.value = "idle";
    return;
  }

  voiceDictationState.value = "processing";
  voiceDictationError.value = null;

  try {
    const formData = new FormData();
    const audio = new Blob(chunks, { type: mimeType });
    formData.append("audio", audio, `assistant-dictation.${extensionForMimeType(mimeType)}`);
    const result = await api.upload<VoiceTranscriptionResponse>(
      "/assistant/voice/transcribe",
      formData,
    );
    insertVoiceTranscript(result.text);
    voiceDictationState.value = "idle";
  } catch (err) {
    voiceDictationState.value = "idle";
    voiceDictationError.value = messageFromUnknown(err, "Voice transcription failed.");
  }
}

function insertVoiceTranscript(text: string) {
  const transcript = text.trim();
  if (!transcript) return;

  const textarea = assistantComposerRef.value;
  const current = assistantDraft.value;
  const selectionStart = textarea?.selectionStart ?? current.length;
  const selectionEnd = textarea?.selectionEnd ?? selectionStart;
  const before = current.slice(0, selectionStart);
  const after = current.slice(selectionEnd);
  const prefix = before && !/\s$/.test(before) ? " " : "";
  const suffix = after && !/^\s/.test(after) ? " " : "";

  assistantDraft.value = `${before}${prefix}${transcript}${suffix}${after}`;
  void nextTick(() => {
    const cursor = selectionStart + prefix.length + transcript.length;
    autosizeAssistantComposer();
    assistantComposerRef.value?.focus();
    assistantComposerRef.value?.setSelectionRange(cursor, cursor);
  });
}

function cleanupVoiceRecorder() {
  voiceMediaRecorder.value = null;
  voiceMediaStream.value?.getTracks().forEach((track) => track.stop());
  voiceMediaStream.value = null;
}

function supportsMediaRecording() {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function getPreferredVoiceMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function onAssistantComposerKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void sendAssistantMessage();
}

async function loadJobs() {
  loadingJobs.value = true;
  try {
    const data = await api.get<JobsResponse>("/assistant/jobs");
    jobs.value = data.jobs || [];
    if (
      selectedJobId.value &&
      !jobs.value.some((job) => job.id === selectedJobId.value)
    ) {
      closeDetailModal();
    }
  } catch (err) {
    pageError.value = messageFromUnknown(err, "Could not load jobs.");
  } finally {
    loadingJobs.value = false;
  }
}

async function loadRecipes() {
  loadingRecipes.value = true;
  try {
    const data = await api.get<RecipesResponse>("/assistant/jobs/recipes");
    recipes.value = data.recipes || [];
  } catch (err) {
    pageError.value = messageFromUnknown(err, "Could not load starter jobs.");
  } finally {
    loadingRecipes.value = false;
  }
}

async function openJob(jobId: string) {
  selectedJobId.value = jobId;
  detailModalOpen.value = true;
  loadingDetail.value = true;
  try {
    selectedDetail.value = await api.get<AssistantJobDetail>(
      `/assistant/jobs/${encodeURIComponent(jobId)}`,
    );
    dailyBriefingTemplateDraft.value = savedDailyBriefingTemplate.value;
    dailyBriefingTemplateNotice.value = "";
    loadScheduleDraftFromDetail();
    scheduleNotice.value = "";
    scheduleInlineEditing.value = false;
    loadInboxWatchRulesDraftFromDetail();
  } catch (err) {
    closeDetailModal();
    toastFromUnknown(err, "Could not load job details.");
  } finally {
    loadingDetail.value = false;
  }
}

async function createStarterJob(recipe: AssistantJobRecipe) {
  await withBusy(`recipe:${recipe.id}`, async () => {
    const data = await api.post<{
      job: AssistantJob;
      version: AssistantJobVersion;
    }>("/assistant/jobs", {
      recipeId: recipe.id,
      status: recipe.state === "ready" ? "active" : undefined,
    });

    selectedJobId.value = null;
    selectedDetail.value = null;
    detailModalOpen.value = false;
    await loadJobs();
    toastSuccess(
      data.job.status === "needs_setup"
        ? "Saved. It needs setup before it can run."
        : "Job added.",
    );
  });
}

async function runJob(job: AssistantJob) {
  await withBusy(`run:${job.id}`, async () => {
    await api.post(`/assistant/jobs/${encodeURIComponent(job.id)}/run`);
    await loadJobs();
    if (detailModalOpen.value && selectedJobId.value === job.id) {
      await openJob(job.id);
    }
    toastSuccess("Run started.");
  });
}

async function toggleJob(job: AssistantJob) {
  const endpoint = job.status === "active" ? "pause" : "resume";
  await withBusy(`${endpoint}:${job.id}`, async () => {
    const data = await api.post<{ job: AssistantJob }>(
      `/assistant/jobs/${encodeURIComponent(job.id)}/${endpoint}`,
    );
    jobs.value = jobs.value.map((item) =>
      item.id === job.id ? data.job : item,
    );
    if (detailModalOpen.value && selectedJobId.value === job.id) {
      await openJob(job.id);
    }
    toastSuccess(endpoint === "pause" ? "Job paused." : "Job resumed.");
  });
}

async function duplicateJob(job: AssistantJob) {
  await withBusy(`duplicate:${job.id}`, async () => {
    const data = await api.post<{ job: AssistantJob }>(
      `/assistant/jobs/${encodeURIComponent(job.id)}/duplicate`,
    );
    selectedJobId.value = data.job.id;
    await loadJobs();
    await openJob(data.job.id);
    toastSuccess("Draft copy created.");
  });
}

async function archiveJob(job: AssistantJob) {
  const confirmed = window.confirm(
    `Remove "${job.name}"? Results and run history stay in Mission Control.`,
  );
  if (!confirmed) return;

  await withBusy(`archive:${job.id}`, async () => {
    await api.delete(`/assistant/jobs/${encodeURIComponent(job.id)}`);
    jobs.value = jobs.value.filter((item) => item.id !== job.id);
    if (selectedJobId.value === job.id) {
      closeDetailModal();
    }
    toastSuccess("Job removed.");
  });
}

async function saveDailyBriefingTemplate() {
  const job = selectedDetail.value?.job;
  if (
    !job ||
    !selectedJobIsDailyBriefing.value ||
    !dailyBriefingTemplateChanged.value
  )
    return;

  await withBusy(`briefing-template:${job.id}`, async () => {
    const response = await api.patch<{ job: AssistantJob }>(
      `/assistant/jobs/${encodeURIComponent(job.id)}`,
      {
        dailyBriefingMessageTemplate:
          dailyBriefingTemplateDraft.value.trim() ||
          defaultDailyBriefingTemplate,
      },
    );
    jobs.value = jobs.value.map((item) =>
      item.id === job.id ? response.job : item,
    );
    await openJob(job.id);
    dailyBriefingTemplateNotice.value = "Message saved.";
  });
}

async function saveJobSchedule() {
  const job = selectedDetail.value?.job;
  const trigger = selectedScheduleTrigger.value;
  if (
    !job ||
    !trigger ||
    !scheduleDraftChanged.value ||
    !scheduleTimeValid.value
  )
    return;

  await withBusy(`schedule:${job.id}`, async () => {
    const response = await api.patch<{ job: AssistantJob }>(
      `/assistant/jobs/${encodeURIComponent(job.id)}`,
      {
        schedule: {
          cadence: scheduleCadenceDraft.value,
          localTime: scheduleTimeDraft.value,
          timezone: trigger.timezone || "owner",
          dayOfWeek:
            scheduleCadenceDraft.value === "weekly"
              ? scheduleDayOfWeekDraft.value
              : null,
          dayOfMonth:
            scheduleCadenceDraft.value === "monthly"
              ? scheduleDayOfMonthDraft.value
              : null,
        },
      },
    );
    jobs.value = jobs.value.map((item) =>
      item.id === job.id ? response.job : item,
    );
    await openJob(job.id);
    scheduleNotice.value = "Schedule saved.";
    scheduleInlineEditing.value = false;
  });
}

function openScheduleInlineEdit() {
  if (!selectedScheduleTrigger.value) return;
  loadScheduleDraftFromDetail();
  scheduleNotice.value = "";
  scheduleInlineEditing.value = true;
}

function cancelScheduleInlineEdit() {
  loadScheduleDraftFromDetail();
  scheduleNotice.value = "";
  scheduleInlineEditing.value = false;
}

async function saveInboxWatchRules() {
  const job = selectedDetail.value?.job;
  if (!job || !selectedJobIsInboxWatch.value || !inboxWatchRulesChanged.value)
    return;

  await withBusy(`inbox-watch-rules:${job.id}`, async () => {
    const response = await api.patch<{ job: AssistantJob }>(
      `/assistant/jobs/${encodeURIComponent(job.id)}`,
      {
        inboxWatchRules: buildInboxWatchRulePayload(inboxWatchRulesDraft.value),
      },
    );
    jobs.value = jobs.value.map((item) =>
      item.id === job.id ? response.job : item,
    );
    await openJob(job.id);
    inboxWatchRulesNotice.value = "Rules saved.";
  });
}

function addInboxWatchRule() {
  inboxWatchRulesDraft.value = [
    ...inboxWatchRulesDraft.value,
    defaultInboxWatchRuleForm(),
  ];
  inboxWatchRulesNotice.value = "";
}

function removeInboxWatchRule(ruleId: string) {
  if (inboxWatchRulesDraft.value.length <= 1) return;
  inboxWatchRulesDraft.value = inboxWatchRulesDraft.value.filter(
    (rule) => rule.id !== ruleId,
  );
  inboxWatchRulesNotice.value = "";
}

function resetDailyBriefingTemplate() {
  dailyBriefingTemplateDraft.value = defaultDailyBriefingTemplate;
  dailyBriefingTemplateNotice.value = "";
}

function insertDailyBriefingVariable(value: string) {
  const separator =
    dailyBriefingTemplateDraft.value &&
    !dailyBriefingTemplateDraft.value.endsWith(" ")
      ? " "
      : "";
  dailyBriefingTemplateDraft.value = `${dailyBriefingTemplateDraft.value}${separator}${value}`;
  dailyBriefingTemplateNotice.value = "";
}

function openConfigureJobsModal() {
  configureJobsModalOpen.value = true;
}

function closeConfigureJobsModal() {
  if (detailModalOpen.value) {
    closeDetailModal();
  }
  closeRecipeIngredientsModal();
  configureJobsModalOpen.value = false;
}

function closeDetailModal() {
  detailModalOpen.value = false;
  selectedJobId.value = null;
  selectedDetail.value = null;
  dailyBriefingTemplateNotice.value = "";
  scheduleNotice.value = "";
  scheduleInlineEditing.value = false;
  inboxWatchRulesNotice.value = "";
  inboxWatchRulesDraft.value = [];
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (detailModalOpen.value) {
    if (scheduleInlineEditing.value) {
      cancelScheduleInlineEdit();
      return;
    }
    closeDetailModal();
    return;
  }
  if (configureJobsModalOpen.value) {
    closeConfigureJobsModal();
  }
}

async function withBusy(key: string, action: () => Promise<void>) {
  setBusy(key, true);
  try {
    await action();
  } catch (err) {
    toastFromUnknown(err, "That did not work.");
  } finally {
    setBusy(key, false);
  }
}

function setBusy(key: string, busy: boolean) {
  const next = new Set(busyKeys.value);
  if (busy) {
    next.add(key);
  } else {
    next.delete(key);
  }
  busyKeys.value = next;
}

function isBusy(key: string) {
  return busyKeys.value.has(key);
}

function statusSortRank(status: AssistantJobStatus) {
  const rank: Record<AssistantJobStatus, number> = {
    needs_setup: 0,
    failing: 1,
    draft: 2,
    active: 3,
    paused: 4,
    archived: 5,
  };
  return rank[status] ?? 99;
}

function statusLabel(status: AssistantJobStatus) {
  const labels: Record<AssistantJobStatus, string> = {
    active: "Active",
    paused: "Paused",
    draft: "Draft",
    needs_setup: "Needs setup",
    failing: "Needs attention",
    archived: "Archived",
  };
  return labels[status] || status;
}

function runStatusLabel(status: AssistantJobRunStatus | null) {
  if (!status) return "No runs yet";
  const labels: Record<AssistantJobRunStatus, string> = {
    queued: "Queued",
    running: "Running",
    waiting_for_approval: "Needs you",
    succeeded: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
    blocked: "Blocked",
  };
  return labels[status] || status;
}

function canCreateRecipe(recipe: AssistantJobRecipe) {
  return recipe.state !== "coming_later";
}

function canRun(job: AssistantJob) {
  return job.status === "active";
}

function canToggle(job: AssistantJob) {
  return (
    job.status === "active" || job.status === "paused" || job.status === "draft"
  );
}

function toggleLabel(job: AssistantJob) {
  if (job.status === "active") return "Pause";
  if (job.status === "draft") return "Start";
  return "Resume";
}

function toggleIcon(job: AssistantJob) {
  if (job.status === "active") return "Pause";
  if (job.status === "draft") return "Power";
  return "Play";
}

function toggleBusyKey(job: AssistantJob) {
  return `${job.status === "active" ? "pause" : "resume"}:${job.id}`;
}

const jobNavEmojis: Record<string, string> = {
  "daily-briefing": "☀️",
  "weekly-review": "📊",
  "booking-reminder": "⏰",
  "email-triage": "📧",
  "invoice-receipt-triage": "🧾",
};

function recipeNavEmoji(recipeId: string) {
  return jobNavEmojis[recipeId] || "⚡";
}

function jobNavEmoji(job: AssistantJob) {
  return recipeNavEmoji(job.recipeId || "");
}

function isJobEnabled(job: AssistantJob) {
  return job.status === "active";
}

function isJobToggleBusy(job: AssistantJob) {
  return isBusy(toggleBusyKey(job));
}

async function handleJobToggle(job: AssistantJob, enabled: boolean) {
  if (
    enabled === isJobEnabled(job) ||
    !canToggle(job) ||
    isJobToggleBusy(job)
  ) {
    return;
  }
  await toggleJob(job);
}

async function handleRecipeToggle(
  recipe: AssistantJobRecipe,
  enabled: boolean,
) {
  if (!enabled || !canCreateRecipe(recipe) || isBusy(`recipe:${recipe.id}`)) {
    return;
  }
  await createStarterJob(recipe);
}

function isRecipeToggleBusy(recipe: AssistantJobRecipe) {
  return isBusy(`recipe:${recipe.id}`);
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function loadInboxWatchRulesDraftFromDetail() {
  inboxWatchRulesNotice.value = "";
  inboxWatchRulesDraft.value = inboxWatchRuleFormsFromRules(
    selectedDetail.value?.version?.rules || [],
  );
}

function inboxWatchRuleFormsFromRules(
  rules: AssistantJobRule[],
): InboxWatchRuleForm[] {
  const forms = rules
    .map((rule) => inboxWatchRuleFormFromRule(rule))
    .filter((rule): rule is InboxWatchRuleForm => Boolean(rule));
  return forms.length ? forms : [defaultInboxWatchRuleForm("any-inbox-message")];
}

function inboxWatchRuleFormFromRule(
  rule: AssistantJobRule,
): InboxWatchRuleForm | null {
  const value = isRecord(rule.value) ? rule.value : {};
  const match = isRecord(value.match) ? value.match : {};
  const actions = isRecord(value.actions) ? value.actions : {};
  return {
    id: rule.id || crypto.randomUUID(),
    label: rule.label || "Inbox Watch rule",
    enabled: value.enabled !== false,
    timing: normalizeInboxWatchTiming(value.timing),
    from: listToLines(match.from) || listToLines([
      ...listFromUnknown(match.fromAddresses),
      ...listFromUnknown(match.fromDomains),
    ]),
    contains: listToLines(match.textContains) || listToLines([
      ...listFromUnknown(match.subjectContains),
      ...listFromUnknown(match.bodyContains),
    ]),
    inferredLabels: normalizeInboxWatchLabels(match.inferredLabels),
    notifyOwner: actions.notifyOwner === true,
    summarizeAndLabel: actions.summarizeAndLabel !== false,
    draftReply: actions.draftReply === true,
    createTask: actions.createTask === true,
  };
}

function defaultInboxWatchRuleForm(id: string = crypto.randomUUID()): InboxWatchRuleForm {
  return {
    id,
    label: "Any inbox email",
    enabled: true,
    timing: "daily_digest",
    from: "",
    contains: "",
    inferredLabels: [],
    notifyOwner: false,
    summarizeAndLabel: true,
    draftReply: false,
    createTask: false,
  };
}

function buildInboxWatchRulePayload(
  rules: InboxWatchRuleForm[],
): AssistantJobRule[] {
  return rules.map((rule) => ({
    id: rule.id,
    label: rule.label.trim() || "Inbox Watch rule",
    field: "inbox_watch.rule",
    operator: "matches",
    value: {
      enabled: rule.enabled,
      timing: rule.timing,
      match: {
        from: linesToList(rule.from),
        textContains: linesToList(rule.contains),
        inferredLabels: rule.inferredLabels,
      },
      actions: {
        notifyOwner: rule.notifyOwner,
        summarizeAndLabel: rule.summarizeAndLabel,
        draftReply: rule.draftReply,
        createTask: rule.createTask,
      },
    },
  }));
}

function listToLines(value: unknown) {
  return listFromUnknown(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

function listFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function linesToList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeInboxWatchTiming(value: unknown): InboxWatchTiming {
  return value === "immediate" ||
    value === "daily_digest" ||
    value === "weekly_digest" ||
    value === "manual"
    ? value
    : "daily_digest";
}

function normalizeInboxWatchLabels(value: unknown): InboxWatchInferredLabel[] {
  const allowed = new Set<InboxWatchInferredLabel>([
    "needs_reply",
    "important",
    "finance",
    "scheduling",
    "review",
  ]);
  return Array.isArray(value)
    ? value.filter((item): item is InboxWatchInferredLabel => allowed.has(item))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadScheduleDraftFromDetail() {
  const trigger = selectedScheduleTrigger.value;
  if (!trigger) return;
  scheduleCadenceDraft.value =
    trigger.cadence === "custom" ? "daily" : trigger.cadence;
  scheduleTimeDraft.value = trigger.localTime || "08:00";
  scheduleDayOfWeekDraft.value = trigger.dayOfWeek ?? 1;
  scheduleDayOfMonthDraft.value = parseMonthlyDayOfMonth(trigger.rrule) || 1;
}

function isScheduleTrigger(
  value: unknown,
): value is Extract<AssistantJobTrigger, { kind: "schedule" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "schedule"
  );
}

function parseMonthlyDayOfMonth(rrule: string | null | undefined) {
  const match = rrule?.match(/(?:^|;)BYMONTHDAY=(\d{1,2})(?:;|$)/i);
  if (!match?.[1]) return null;
  const day = Number.parseInt(match[1], 10);
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : null;
}

function formatNextRun(job: AssistantJob) {
  if (job.status !== "active") return "-";
  if (job.nextRunAt) return formatDate(job.nextRunAt);
  if (/^when/i.test(job.triggerSummary)) return "When it happens";
  if (/daily|weekly|monthly/i.test(job.triggerSummary)) return "Scheduled";
  return "-";
}

function formatTrigger(summary: string) {
  const value = String(summary || "").trim();
  if (!value || value === "Manual") return "When you run it";
  if (/^Daily at /i.test(value)) return value.replace(/^Daily/i, "Every day");
  if (/^Weekly on .+ at /i.test(value))
    return value.replace(/^Weekly/i, "Every week");
  if (/^Weekly at /i.test(value))
    return value.replace(/^Weekly/i, "Every week");
  if (/^Monthly on day /i.test(value))
    return value.replace(/^Monthly/i, "Every month");
  if (value.includes("email.message.received"))
    return "When matching email arrives";
  if (value.includes("calendar.event.upcoming"))
    return "Before matching calendar events";
  if (value.includes("review_packet.created"))
    return "When Mission Control changes";
  if (/^When .+ happens$/i.test(value)) return "When something matches";
  return value;
}

function formatDestination(detail: AssistantJobDetail | null) {
  const landing = detail?.job.destination?.landing;
  if (landing === "task") return "Mission Control tasks";
  if (landing === "approval") return "Mission Control approvals";
  if (landing === "memory_review") return "Mission Control memory review";
  if (landing === "activity") return "Mission Control activity";
  if (landing === "accounts") return "Mission Control → Accounts tab";
  return "Mission Control results";
}

function setupMessageForJob(job: AssistantJob) {
  const error = job.setupState?.errors?.find((entry) => entry.message)?.message;
  if (!error) return "Setup is needed before this job can run.";
  return cleanPlainText(error)
    .replace(
      /^Missing setup requirement:\s*email\.?$/i,
      "Email setup is needed.",
    )
    .replace(
      /^Missing setup requirement:\s*calendar\.?$/i,
      "Calendar setup is needed.",
    )
    .replace(
      /^Missing setup requirement:\s*owner_notifications\.?$/i,
      "Notifications setup is needed.",
    )
    .replace(
      /^Missing setup requirement:\s*local_executor\.?$/i,
      "Local Executor setup is needed.",
    );
}

function cleanPlainText(value: string) {
  return String(value || "")
    .replace(/Mission Control review packets?/gi, "Mission Control results")
    .replace(/review packets?/gi, "results")
    .replace(/durable private memory/gi, "saved memory")
    .replace(/\s+/g, " ")
    .trim();
}

function jobDetailPurpose(job: AssistantJob) {
  if (job.recipeId === "daily-briefing") {
    return "Sends a customised message to your mission control dashboard or Soulink when connected.";
  }
  return cleanPlainText(job.purpose);
}

function renderDailyBriefingPreview(template: string) {
  const values: Record<string, string> = {
    "owner.name": "Kieran Butler",
    "today.date": "Monday 1 June",
    "calendar.summary": "Your calendar is clear for Monday 1 June.",
    "calendar.events": "",
    "calendar.reminders":
      "Reminders: 1 due today.\n- 10:00 Follow up with Bilbo Baggins",
    "mission.tasks":
      "Mission Control: 1 task due today.\n- Review launch notes",
  };
  return template
    .replace(
      /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
      (_match, key: string) => values[key] ?? "",
    )
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function messageFromUnknown(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}
</script>

<template>
  <div
    class="assistant-page"
    :class="{
      'assistant-page--history-collapsed': assistantHistoryCollapsed,
      'assistant-page--history-open': assistantHistoryDrawerOpen,
    }"
  >
    <LandingGrids />
    <button
      v-if="assistantHistoryDrawerOpen"
      type="button"
      class="assistant-history-backdrop"
      aria-label="Close chat history"
      @click="assistantHistoryDrawerOpen = false"
    />
    <Teleport v-if="!assistantHistoryDrawerOpen" to="#app-side-nav-mobile-page-controls">
      <div class="assistant-mobile-nav">
        <button
          type="button"
          class="assistant-mobile-nav__button"
          aria-label="Open chat history"
          @click="assistantHistoryDrawerOpen = true"
        >
          <UiIcon name="MessagesSquare" :size="18" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="assistant-mobile-nav__button"
          aria-label="New chat"
          @click="startNewAssistantChat(null)"
        >
          <UiIcon name="Plus" :size="18" aria-hidden="true" />
        </button>
      </div>
    </Teleport>
    <aside
      class="assistant-history"
      :class="{
        'assistant-history--collapsed': assistantHistoryCollapsed,
        'assistant-history--open': assistantHistoryDrawerOpen,
      }"
      aria-label="Assistant chat history"
    >
      <header class="assistant-history__header">
        <button
          type="button"
          class="assistant-history__icon-button assistant-history__collapse"
          :aria-label="
            assistantHistoryCollapsed
              ? 'Expand chat history'
              : 'Collapse chat history'
          "
          :title="
            assistantHistoryCollapsed
              ? 'Expand chat history'
              : 'Collapse chat history'
          "
          @click="toggleAssistantHistoryCollapsed"
        >
          <UiIcon
            :name="assistantHistoryCollapsed ? 'ChevronRight' : 'ChevronLeft'"
            :size="16"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="assistant-history__new-chat"
          @click="startNewAssistantChat(null)"
        >
          <UiIcon name="SquarePen" :size="16" aria-hidden="true" />
          <span>New chat</span>
        </button>
        <button
          type="button"
          class="assistant-history__icon-button assistant-history__close"
          aria-label="Close chat history"
          title="Close"
          @click="assistantHistoryDrawerOpen = false"
        >
          <UiIcon name="X" :size="16" aria-hidden="true" />
        </button>
      </header>

      <div v-if="!assistantHistoryCollapsed" class="assistant-history__body">
        <nav class="assistant-history__topnav" aria-label="Assistant tools">
          <form class="assistant-history__search" @submit.prevent="applyAssistantThreadSearch">
            <UiIcon name="Search" :size="16" aria-hidden="true" />
            <input
              v-model="assistantThreadSearchDraft"
              type="search"
              placeholder="Search"
              aria-label="Search chats"
            />
            <button
              v-if="assistantThreadSearchActive"
              type="button"
              aria-label="Clear chat search"
              @click="clearAssistantThreadSearch"
            >
              <UiIcon name="X" :size="14" aria-hidden="true" />
            </button>
          </form>
        </nav>

        <p v-if="assistantThreadsError" class="assistant-history__message">
          {{ assistantThreadsError }}
        </p>
        <p v-else-if="assistantProjectsError" class="assistant-history__message">
          {{ assistantProjectsError }}
        </p>
        <p
          v-else-if="assistantThreadsLoading && assistantThreads.length === 0"
          class="assistant-history__message"
        >
          Loading chats...
        </p>

        <section class="assistant-history__section">
          <h2>Projects</h2>
          <div
            v-if="assistantProjectsLoading && assistantProjects.length === 0"
            class="assistant-history__message"
          >
            Loading projects...
          </div>
          <div
            v-for="group in assistantProjectThreadGroups"
            :key="group.project.id"
            class="assistant-history__project-group"
          >
            <button
              type="button"
              class="assistant-history__project-row"
              :class="{ 'is-active': routeProjectId() === group.project.id && !assistantThreadId }"
              :aria-label="`Start a new chat in ${group.project.name}`"
              @click="startNewAssistantChat(group.project.id)"
            >
              <UiIcon name="Folder" :size="15" aria-hidden="true" />
              <span>{{ group.project.name }}</span>
              <span v-if="group.threads.length" class="assistant-history__count">
                {{ group.threads.length }}
              </span>
              <span class="assistant-history__project-add" aria-hidden="true">
                <UiIcon name="Plus" :size="14" />
              </span>
            </button>
            <nav
              v-if="group.threads.length"
              class="assistant-history__list assistant-history__list--nested"
              :aria-label="`${group.project.name} chats`"
            >
              <div
                v-for="thread in group.threads"
                :key="thread.id"
                class="assistant-history__thread-row"
                :class="{ 'is-active': assistantThreadId === thread.id }"
              >
                <button
                  type="button"
                  class="assistant-history__thread"
                  :aria-current="assistantThreadId === thread.id ? 'page' : undefined"
                  @click="selectAssistantThread(thread.id)"
                >
                  <UiIcon name="MessageSquare" :size="15" aria-hidden="true" />
                  <span class="assistant-history__thread-main">
                    <span class="assistant-history__thread-title">
                      {{ threadTitle(thread) }}
                    </span>
                    <span class="assistant-history__thread-meta">
                      {{ formatAssistantThreadTime(thread.lastMessageAt || thread.updatedAt) }}
                    </span>
                  </span>
                </button>
                <div
                  v-if="assistantThreadId === thread.id"
                  class="assistant-history__thread-actions"
                  aria-label="Selected chat controls"
                >
                  <button
                    type="button"
                    title="Export transcript"
                    aria-label="Export transcript"
                    :disabled="assistantThreadActionId === thread.id"
                    @click="exportAssistantThread(thread)"
                  >
                    <UiIcon name="Download" :size="14" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Archive chat"
                    aria-label="Archive chat"
                    :disabled="assistantThreadActionId === thread.id"
                    @click="archiveAssistantThread(thread)"
                  >
                    <UiIcon name="Archive" :size="14" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Delete chat"
                    aria-label="Delete chat"
                    :disabled="assistantThreadActionId === thread.id"
                    @click="deleteAssistantThread(thread)"
                  >
                    <UiIcon name="Trash2" :size="14" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </nav>
          </div>
        </section>

        <section class="assistant-history__section">
          <h2>Chats</h2>
          <nav
            class="assistant-history__list"
            aria-label="Chats outside projects"
          >
            <div
              v-for="thread in assistantUngroupedThreads"
              :key="thread.id"
              class="assistant-history__thread-row"
              :class="{ 'is-active': assistantThreadId === thread.id }"
            >
              <button
                type="button"
                class="assistant-history__thread"
                :aria-current="assistantThreadId === thread.id ? 'page' : undefined"
                @click="selectAssistantThread(thread.id)"
              >
                <UiIcon name="MessageSquare" :size="16" aria-hidden="true" />
                <span class="assistant-history__thread-main">
                  <span class="assistant-history__thread-title">
                    {{ threadTitle(thread) }}
                  </span>
                  <span class="assistant-history__thread-meta">
                    {{ formatAssistantThreadTime(thread.lastMessageAt || thread.updatedAt) }}
                  </span>
                </span>
              </button>
              <div
                v-if="assistantThreadId === thread.id"
                class="assistant-history__thread-actions"
                aria-label="Selected chat controls"
              >
                <button
                  type="button"
                  title="Export transcript"
                  aria-label="Export transcript"
                  :disabled="assistantThreadActionId === thread.id"
                  @click="exportAssistantThread(thread)"
                >
                  <UiIcon name="Download" :size="14" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Archive chat"
                  aria-label="Archive chat"
                  :disabled="assistantThreadActionId === thread.id"
                  @click="archiveAssistantThread(thread)"
                >
                  <UiIcon name="Archive" :size="14" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Delete chat"
                  aria-label="Delete chat"
                  :disabled="assistantThreadActionId === thread.id"
                  @click="deleteAssistantThread(thread)"
                >
                  <UiIcon name="Trash2" :size="14" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p
              v-if="assistantThreadListEmpty"
              class="assistant-history__message"
            >
              {{ assistantThreadSearchActive ? "No matching chats." : "No saved chats yet." }}
            </p>
            <p
              v-else-if="!assistantThreadsLoading && assistantUngroupedThreads.length === 0"
              class="assistant-history__message"
            >
              No chats outside projects.
            </p>
          </nav>
        </section>

        <div class="assistant-history__footer">
          <button
            type="button"
            class="assistant-history__archive-button"
            @click="openArchivedThreadsModal"
          >
            <UiIcon name="Archive" :size="15" aria-hidden="true" />
            <span>Archived</span>
          </button>
        </div>
      </div>
    </aside>

    <main
      class="assistant-main"
      aria-label="Assistant console"
    >
      <section v-if="pageError" class="notice notice--error" role="alert">
        {{ pageError }}
      </section>

      <section class="assistant-console" aria-label="Assistant conversation">
        <div
          ref="assistantScrollerRef"
          class="assistant-timeline"
          aria-live="polite"
        >
          <div
            v-if="assistantConsoleMessages.length === 0"
            class="assistant-empty-state"
          >
            <h2>Message ME3</h2>
            <div class="starter-prompt-list" aria-label="Starter prompts">
              <button
                v-for="prompt in starterPrompts"
                :key="prompt.label"
                type="button"
                class="starter-prompt"
                @click="useStarterPrompt(prompt.prompt)"
              >
                <span class="starter-prompt__icon" aria-hidden="true">
                  {{ prompt.icon }}
                </span>
                <span>{{ prompt.label }}</span>
              </button>
            </div>
          </div>

          <article
            v-for="(message, index) in assistantConsoleMessages"
            :key="
              message.id ||
              `${message.role}-${index}-${message.text.slice(0, 24)}`
            "
            class="assistant-message"
            :class="`assistant-message--${message.role}`"
          >
            <div class="assistant-message__bubble">
              <p>{{ message.text }}</p>
              <p v-if="message.meta" class="assistant-message__meta">
                {{ message.meta }}
              </p>
              <p v-if="message.detail" class="assistant-message__detail">
                {{ message.detail }}
              </p>
              <div
                v-if="message.jobBuilderAction?.kind === 'job_draft'"
                class="job-builder-card"
              >
                <div class="job-builder-card__header">
                  <div>
                    <h3>{{ message.jobBuilderAction.draft.name }}</h3>
                  </div>
                  <span
                    class="job-builder-card__status"
                    :class="`job-builder-card__status--${message.jobBuilderAction.validation.status}`"
                  >
                    {{ assistantJobStatusLabel(message.jobBuilderAction.validation.status) }}
                  </span>
                </div>
                <p class="job-builder-card__sentence">
                  <template
                    v-for="(segment, segmentIndex) in assistantJobBuilderSentenceSegments(message.jobBuilderAction)"
                    :key="`${segment.text}-${segmentIndex}`"
                  >
                    <strong v-if="segment.strong">{{ segment.text }}</strong>
                    <span v-else>{{ segment.text }}</span>
                  </template>
                </p>
                <p class="job-builder-card__tools">
                  Uses {{ assistantJobBuilderToolPhrase(message.jobBuilderAction.draft) }}.
                </p>
                <ul
                  v-if="message.jobBuilderAction.explanation.setupWarnings.length"
                  class="job-builder-card__warnings"
                >
                  <li
                    v-for="warning in message.jobBuilderAction.explanation.setupWarnings"
                    :key="warning"
                  >
                    {{ warning }}
                  </li>
                </ul>
                <div class="job-builder-card__actions">
                  <button
                    v-if="message.jobBuilderAction.availableActions.includes('save')"
                    type="button"
                    class="job-builder-card__button"
                    :disabled="jobBuilderActionBusy(message.jobBuilderAction, 'save')"
                    @click="saveAssistantJobBuilderDraft(message, message.jobBuilderAction, false)"
                  >
                    <UiIcon name="Save" :size="15" aria-hidden="true" />
                    <span>Save job</span>
                  </button>
                  <button
                    v-if="message.jobBuilderAction.availableActions.includes('save_and_activate')"
                    type="button"
                    class="job-builder-card__button job-builder-card__button--primary"
                    :disabled="jobBuilderActionBusy(message.jobBuilderAction, 'save_and_activate')"
                    @click="saveAssistantJobBuilderDraft(message, message.jobBuilderAction, true)"
                  >
                    <UiIcon name="Play" :size="15" aria-hidden="true" />
                    <span>Save and activate</span>
                  </button>
                </div>
              </div>
              <div
                v-else-if="message.jobBuilderAction?.kind === 'job_saved'"
                class="job-builder-card job-builder-card--saved"
              >
                <div class="job-builder-card__header">
                  <div>
                    <h3>{{ message.text }}</h3>
                    <p>Review settings, run a test, or activate it from here.</p>
                  </div>
                  <span
                    class="job-builder-card__status"
                    :class="`job-builder-card__status--${message.jobBuilderAction.status}`"
                  >
                    {{ assistantJobStatusLabel(message.jobBuilderAction.status) }}
                  </span>
                </div>
                <div class="job-builder-card__actions">
                  <button
                    v-if="message.jobBuilderAction.availableActions.includes('activate')"
                    type="button"
                    class="job-builder-card__button job-builder-card__button--primary"
                    :disabled="jobBuilderActionBusy(message.jobBuilderAction, 'activate')"
                    @click="activateAssistantJobBuilderSaved(message, message.jobBuilderAction)"
                  >
                    <UiIcon name="Play" :size="15" aria-hidden="true" />
                    <span>Activate job</span>
                  </button>
                  <button
                    v-if="message.jobBuilderAction.availableActions.includes('run_now')"
                    type="button"
                    class="job-builder-card__button"
                    @click="runAssistantJobBuilderSaved(message.jobBuilderAction)"
                  >
                    <UiIcon name="RefreshCw" :size="15" aria-hidden="true" />
                    <span>Run now</span>
                  </button>
                  <button
                    v-if="message.jobBuilderAction.availableActions.includes('open_job')"
                    type="button"
                    class="job-builder-card__button"
                    @click="openJob(message.jobBuilderAction.jobId)"
                  >
                    <UiIcon name="Settings" :size="15" aria-hidden="true" />
                    <span>Open job</span>
                  </button>
                </div>
              </div>
              <div
                v-if="
                  message.inboxLink ||
                  message.reminderLink ||
                  (message.actionHref && message.actionLabel)
                "
                class="assistant-message__actions"
              >
                <a v-if="message.inboxLink" href="/email">Open messages</a>
                <a v-if="message.reminderLink" href="/calendar">
                  Open calendar
                </a>
                <a
                  v-if="message.actionHref && message.actionLabel"
                  :href="message.actionHref"
                >
                  {{ message.actionLabel }}
                </a>
              </div>
            </div>
            <div class="assistant-message__tools" aria-label="Message actions">
              <span
                v-if="formatAssistantMessageTime(message.createdAt)"
                class="assistant-message__time"
              >
                {{ formatAssistantMessageTime(message.createdAt) }}
              </span>
              <button
                v-if="message.role === 'assistant'"
                type="button"
                class="assistant-message-tool"
                :aria-label="
                  copiedMessageKey === assistantMessageKey(message, index)
                    ? 'Copied'
                    : 'Copy message'
                "
                :title="
                  copiedMessageKey === assistantMessageKey(message, index)
                    ? 'Copied'
                    : 'Copy'
                "
                @click="copyAssistantMessage(message, index)"
              >
                <UiIcon
                  :name="
                    copiedMessageKey === assistantMessageKey(message, index)
                      ? 'Check'
                      : 'Copy'
                  "
                  :size="14"
                />
              </button>
              <button
                v-if="message.role === 'user'"
                type="button"
                class="assistant-message-tool"
                aria-label="Edit and resend"
                title="Edit"
                :disabled="assistantSending"
                @click="editAndResendAssistantTurn(message)"
              >
                <UiIcon name="Pencil" :size="14" />
              </button>
              <button
                v-if="message.role === 'user'"
                type="button"
                class="assistant-message-tool"
                aria-label="Retry from here"
                title="Retry"
                :disabled="assistantSending"
                @click="retryAssistantTurn(message)"
              >
                <UiIcon name="RefreshCw" :size="14" />
              </button>
            </div>
          </article>

          <article
            v-if="assistantSending && assistantAwaitingResponse"
            class="assistant-message assistant-message--assistant"
          >
            <div class="assistant-message__bubble assistant-message__bubble--pending">
              <span>ME3 is thinking</span>
              <span class="assistant-typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          </article>
        </div>

        <footer
          class="assistant-composer"
          :class="{ 'assistant-composer--drag-active': assistantComposerDragActive }"
          aria-label="Message composer"
          @dragenter="onAssistantComposerDragEnter"
          @dragover="onAssistantComposerDragOver"
          @dragleave="onAssistantComposerDragLeave"
          @drop="onAssistantComposerDrop"
        >
          <label class="sr-only" for="assistant-console-input">
            Message ME3
          </label>
          <div
            v-if="assistantAttachments.length > 0"
            class="assistant-attachments"
            aria-label="Attached files"
          >
            <span
              v-for="attachment in assistantAttachments"
              :key="attachment.id"
              class="assistant-attachment"
              :class="{
                'assistant-attachment--error': attachment.status === 'error',
              }"
              :title="
                attachment.error ||
                `${attachment.name} · ${formatFileSize(attachment.size)}`
              "
            >
              <img
                v-if="attachment.kind === 'image' && attachment.previewUrl"
                class="assistant-attachment__thumb"
                :src="attachment.previewUrl"
                alt=""
              />
              <UiIcon
                v-else
                :name="attachment.kind === 'image' ? 'Image' : 'FileText'"
                :size="14"
                aria-hidden="true"
              />
              <span class="assistant-attachment__name">{{ attachment.name }}</span>
              <span
                v-if="attachment.status !== 'uploading'"
                class="assistant-attachment__meta"
              >
                {{
                  attachment.status === 'error'
                    ? 'Failed'
                    : formatFileSize(attachment.size)
                }}
              </span>
              <button
                type="button"
                class="assistant-attachment__remove"
                :aria-label="`Remove ${attachment.name}`"
                @click="removeAssistantAttachment(attachment.id)"
              >
                <UiIcon name="X" :size="12" aria-hidden="true" />
              </button>
            </span>
          </div>
          <textarea
            id="assistant-console-input"
            ref="assistantComposerRef"
            v-model="assistantDraft"
            class="assistant-input"
            rows="1"
            placeholder="Do anything..."
            :disabled="assistantSending"
            @keydown="onAssistantComposerKeydown"
            @input="autosizeAssistantComposer"
          />
          <div class="assistant-composer__bottom">
            <div class="assistant-composer__left">
              <input
                ref="assistantAttachmentInputRef"
                class="sr-only"
                type="file"
                multiple
                accept=".txt,.md,.markdown,.csv,.tsv,.json,.xml,text/*,application/json,application/xml,image/*"
                @change="onAssistantAttachmentChange"
              />
              <button
                type="button"
                class="composer-icon-button"
                title="Add attachment"
                aria-label="Add attachment"
                :disabled="assistantSending"
                @click="openAssistantAttachmentPicker"
              >
                <UiIcon name="Paperclip" :size="18" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="composer-icon-button"
                title="Jobs"
                aria-label="Jobs"
                @click="openConfigureJobsModal"
              >
                <UiIcon name="BriefcaseBusiness" :size="18" aria-hidden="true" />
              </button>
            </div>

            <div class="assistant-composer__right">
              <div class="model-picker">
                <span class="sr-only">Model</span>
                <span class="model-picker__select-wrap">
                  <span class="model-picker__select-sizer" aria-hidden="true">
                    {{ selectedModel.label }}
                  </span>
                  <select
                    v-model="selectedModelId"
                    class="model-picker__select"
                    aria-label="Model"
                    :title="selectedModelTitle"
                    @change="handleAssistantModelChange"
                  >
                    <option
                      v-for="model in assistantModelOptions"
                      :key="model.option.id"
                      :value="model.option.id"
                      :title="model.optionTitle"
                    >
                      {{ model.optionLabel }}
                    </option>
                  </select>
                </span>
                <RouterLink
                  v-if="selectedModelSetup.statusLabel === 'Setup needed'"
                  class="model-picker__status model-picker__status--link"
                  :class="selectedModelSetup.className"
                  to="/account?section=ai#account-ai-model"
                  title="Configure AI models"
                >
                  {{ selectedModelSetup.statusLabel }}
                </RouterLink>
                <span
                  v-else-if="selectedModelSetup.statusLabel !== 'Ready'"
                  class="model-picker__status"
                  :class="selectedModelSetup.className"
                >
                  {{ selectedModelSetup.statusLabel }}
                </span>
              </div>
              <button
                type="button"
                class="composer-icon-button"
                :class="{ 'composer-icon-button--listening': voiceDictationState === 'listening' }"
                :title="
                  voiceDictationState === 'listening'
                    ? 'Stop dictation'
                    : 'Voice dictation'
                "
                :aria-label="
                  voiceDictationState === 'listening'
                    ? 'Stop voice dictation'
                    : 'Start voice dictation'
                "
                :aria-pressed="voiceDictationState === 'listening'"
                :disabled="!canUseVoiceDictation || voiceDictationState === 'unsupported'"
                @click="toggleVoiceDictation"
              >
                <UiIcon
                  :name="voiceDictationState === 'listening' ? 'MicOff' : 'Mic'"
                  :size="17"
                />
              </button>
              <button
                type="button"
                class="assistant-send"
                :class="{ 'assistant-send--stop': assistantSending }"
                :disabled="assistantSending ? false : !canSendAssistantMessage"
                :aria-label="assistantSending ? 'Stop response' : 'Send message'"
                @click="assistantSending ? stopAssistantTurn() : sendAssistantMessage()"
              >
                <UiIcon :name="assistantSending ? 'Square' : 'ArrowUp'" :size="18" />
              </button>
            </div>
          </div>
          <div
            v-if="voiceDictationStatusText"
            class="assistant-composer__meta"
          >
            <span
              v-if="voiceDictationStatusText"
              class="assistant-composer__voice-status"
            >
              {{ voiceDictationStatusText }}
            </span>
          </div>
          <p v-if="assistantError" class="assistant-error">
            {{ assistantError }}
          </p>
        </footer>
      </section>
    </main>

    <Teleport to="body">
      <div
        v-if="archivedThreadsModalOpen"
        class="assistant-modal"
        @click.self="closeArchivedThreadsModal"
      >
        <section
          class="assistant-modal__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archived-chats-title"
        >
          <header class="assistant-modal__header">
            <div class="assistant-modal__header-copy">
              <h2 id="archived-chats-title">Archived Chats</h2>
              <p>Restore a chat to bring it back into the side nav.</p>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Close"
              @click="closeArchivedThreadsModal"
            >
              <UiIcon name="X" :size="20" />
            </button>
          </header>

          <p v-if="archivedAssistantThreadsError" class="assistant-history__message">
            {{ archivedAssistantThreadsError }}
          </p>
          <p
            v-else-if="archivedAssistantThreadsLoading"
            class="assistant-history__message"
          >
            Loading archived chats...
          </p>
          <div v-else class="assistant-archived-list" role="list">
            <article
              v-for="thread in archivedAssistantThreads"
              :key="thread.id"
              class="assistant-archived-thread"
              role="listitem"
            >
              <button
                type="button"
                class="assistant-archived-thread__main"
                @click="selectAssistantThread(thread.id); closeArchivedThreadsModal()"
              >
                <UiIcon name="MessageSquare" :size="16" aria-hidden="true" />
                <span>
                  <strong>{{ threadTitle(thread) }}</strong>
                  <small>{{ formatAssistantThreadTime(thread.lastMessageAt || thread.updatedAt) }}</small>
                </span>
              </button>
              <div class="assistant-archived-thread__actions">
                <button
                  type="button"
                  title="Restore chat"
                  aria-label="Restore chat"
                  :disabled="assistantThreadActionId === thread.id"
                  @click="restoreArchivedAssistantThread(thread)"
                >
                  <UiIcon name="ArchiveRestore" :size="15" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Delete chat"
                  aria-label="Delete chat"
                  :disabled="assistantThreadActionId === thread.id"
                  @click="deleteArchivedAssistantThread(thread)"
                >
                  <UiIcon name="Trash2" :size="15" aria-hidden="true" />
                </button>
              </div>
            </article>
            <p
              v-if="archivedAssistantThreads.length === 0"
              class="assistant-history__message"
            >
              No archived chats.
            </p>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="configureJobsModalOpen"
        class="assistant-modal"
        @click.self="closeConfigureJobsModal"
      >
        <section
          class="assistant-modal__dialog assistant-modal__dialog--wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="configure-jobs-title"
        >
          <header class="assistant-modal__header">
            <h2 id="configure-jobs-title">Jobs</h2>
            <div class="assistant-modal__header-actions">
              <button
                type="button"
                class="assistant-modal-icon-action"
                title="Recipe ingredients"
                aria-label="Recipe ingredients"
                @click="openRecipeIngredientsModal"
              >
                <UiIcon name="Info" :size="16" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="assistant-modal-action"
                @click="startAssistantJobBuilder"
              >
                <UiIcon name="Plus" :size="15" aria-hidden="true" />
                <span>Set up a job</span>
              </button>
              <button
                type="button"
                class="modal-close"
                aria-label="Close"
                @click="closeConfigureJobsModal"
              >
                <UiIcon name="X" :size="20" />
              </button>
            </div>
          </header>

          <div v-if="loadingJobs || loadingRecipes" class="empty-row">
            Loading jobs...
          </div>
          <div v-else class="job-list" role="list">
            <template v-for="row in configureJobRows" :key="row.kind === 'job' ? row.job.id : row.recipe.id">
              <article
                v-if="row.kind === 'job'"
                role="listitem"
                class="job-row"
                :class="{
                  'job-row--selected':
                    detailModalOpen && selectedJobId === row.job.id,
                  'job-row--muted':
                    row.job.status === 'paused' || row.job.status === 'draft',
                }"
              >
                <span class="job-row__emoji" aria-hidden="true">
                  {{ jobNavEmoji(row.job) }}
                </span>
                <div class="job-row__main">
                  <span class="job-row__copy">
                    <span class="job-row__title-line">
                      <strong>{{ row.job.name }}</strong>
                      <span
                        class="status-badge"
                        :class="`status-badge--${row.job.status}`"
                      >
                        {{ statusLabel(row.job.status) }}
                      </span>
                    </span>
                    <span class="job-row__meta">
                      Runs: {{ formatTrigger(row.job.triggerSummary) }} · Last
                      run: {{ formatDate(row.job.lastRunAt) }}
                    </span>
                  </span>
                </div>

                <div class="job-row__actions">
                  <span
                    v-if="row.job.lastRunStatus === 'waiting_for_approval'"
                    class="needs-you"
                  >
                    Needs you
                  </span>
                  <label
                    class="job-toggle"
                    :class="{ 'is-busy': isJobToggleBusy(row.job) }"
                    @click.stop
                  >
                    <input
                      type="checkbox"
                      class="job-toggle__input"
                      :checked="isJobEnabled(row.job)"
                      :disabled="!canToggle(row.job) || isJobToggleBusy(row.job)"
                      :aria-label="
                        isJobEnabled(row.job)
                          ? `Pause ${row.job.name}`
                          : `Enable ${row.job.name}`
                      "
                      @change="
                        handleJobToggle(
                          row.job,
                          ($event.target as HTMLInputElement).checked,
                        )
                      "
                    />
                    <span class="job-toggle__track" aria-hidden="true" />
                  </label>
                  <button
                    type="button"
                    class="icon-button"
                    title="Job detail"
                    aria-label="Open job detail"
                    @click.stop="openJob(row.job.id)"
                  >
                    <UiIcon name="Pencil" :size="16" />
                  </button>
                </div>
              </article>

              <article
                v-else
                role="listitem"
                class="job-row job-row--inactive"
              >
                <span class="job-row__emoji" aria-hidden="true">
                  {{ recipeNavEmoji(row.recipe.id) }}
                </span>
                <div class="job-row__main">
                  <span class="job-row__copy">
                    <span class="job-row__title-line">
                      <strong>{{ row.recipe.name }}</strong>
                      <span
                        v-if="row.recipe.state === 'needs_setup'"
                        class="status-badge status-badge--needs_setup"
                      >
                        Needs setup
                      </span>
                      <span
                        v-else-if="row.recipe.state === 'coming_later'"
                        class="status-badge status-badge--coming_later"
                      >
                        Later
                      </span>
                      <span v-else class="status-badge status-badge--draft">
                        Not added
                      </span>
                    </span>
                    <span class="job-row__meta">
                      {{ cleanPlainText(row.recipe.outcome) }}
                    </span>
                  </span>
                </div>

                <div class="job-row__actions">
                  <label
                    class="job-toggle"
                    :class="{ 'is-busy': isRecipeToggleBusy(row.recipe) }"
                    @click.stop
                  >
                    <input
                      type="checkbox"
                      class="job-toggle__input"
                      :checked="false"
                      :disabled="
                        !canCreateRecipe(row.recipe) ||
                        isRecipeToggleBusy(row.recipe)
                      "
                      :aria-label="`Add ${row.recipe.name}`"
                      @change="
                        handleRecipeToggle(
                          row.recipe,
                          ($event.target as HTMLInputElement).checked,
                        )
                      "
                    />
                    <span class="job-toggle__track" aria-hidden="true" />
                  </label>
                </div>
              </article>
            </template>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="recipeIngredientsModalOpen"
        class="assistant-modal assistant-modal--stacked"
        @click.self="closeRecipeIngredientsModal"
      >
        <section
          class="assistant-modal__dialog assistant-modal__dialog--wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-ingredients-title"
        >
          <header class="assistant-modal__header">
            <div class="assistant-modal__header-copy">
              <h2 id="recipe-ingredients-title">Recipe ingredients</h2>
              <p>ME3 features currently available to starter recipes.</p>
            </div>
            <button
              type="button"
              class="modal-close"
              aria-label="Close"
              @click="closeRecipeIngredientsModal"
            >
              <UiIcon name="X" :size="20" />
            </button>
          </header>

          <div v-if="loadingRecipes" class="empty-row">
            Loading recipes...
          </div>
          <div v-else class="recipe-ingredient-list" role="list">
            <article
              v-for="recipe in recipes"
              :key="recipe.id"
              class="recipe-ingredient-row"
              role="listitem"
            >
              <div class="recipe-ingredient-row__header">
                <span class="job-row__emoji" aria-hidden="true">
                  {{ recipeNavEmoji(recipe.id) }}
                </span>
                <div>
                  <h3>{{ recipe.name }}</h3>
                  <p>{{ cleanPlainText(recipe.outcome) }}</p>
                </div>
                <span
                  class="status-badge"
                  :class="`status-badge--${recipe.state}`"
                >
                  {{ recipe.state === 'needs_setup' ? 'Needs setup' : recipe.state === 'coming_later' ? 'Later' : 'Ready' }}
                </span>
              </div>
              <div class="recipe-ingredient-row__groups">
                <div>
                  <strong>Required</strong>
                  <div class="recipe-ingredient-row__chips">
                    <span
                      v-for="ingredient in recipeIngredientNames(recipe).required"
                      :key="`${recipe.id}:required:${ingredient}`"
                      class="recipe-ingredient-chip"
                    >
                      {{ ingredient }}
                    </span>
                  </div>
                </div>
                <div v-if="recipeIngredientNames(recipe).optional.length">
                  <strong>Optional</strong>
                  <div class="recipe-ingredient-row__chips">
                    <span
                      v-for="ingredient in recipeIngredientNames(recipe).optional"
                      :key="`${recipe.id}:optional:${ingredient}`"
                      class="recipe-ingredient-chip recipe-ingredient-chip--optional"
                    >
                      {{ ingredient }}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="detailModalOpen"
        class="assistant-modal assistant-modal--stacked"
        @click.self="closeDetailModal"
      >
        <section
          class="assistant-modal__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-detail-title"
        >
          <div v-if="loadingDetail" class="empty-row">Loading details...</div>
          <template v-else-if="selectedJob">
            <header class="assistant-modal__header">
              <div class="assistant-modal__header-copy">
                <div class="assistant-modal__title-row">
                  <h2 id="job-detail-title">Job: {{ selectedJob.name }}</h2>
                  <span
                    class="status-badge"
                    :class="`status-badge--${selectedJob.status}`"
                  >
                    {{ statusLabel(selectedJob.status) }}
                  </span>
                  <span
                    v-if="selectedJob.lastRunStatus === 'waiting_for_approval'"
                    class="needs-you"
                  >
                    Needs you
                  </span>
                </div>
                <p>{{ jobDetailPurpose(selectedJob) }}</p>
              </div>
              <button
                type="button"
                class="modal-close"
                aria-label="Close"
                @click="closeDetailModal"
              >
                <UiIcon name="X" :size="20" />
              </button>
            </header>

            <div v-if="selectedJob.status === 'needs_setup'" class="notice">
              {{ setupMessageForJob(selectedJob) }}
            </div>

            <dl class="detail-facts">
              <div class="detail-facts__runs">
                <dt>Runs</dt>
                <dd
                  v-if="selectedScheduleTrigger && scheduleInlineEditing"
                  class="detail-facts__schedule detail-facts__schedule--editing"
                >
                  <div
                    class="schedule-inline"
                    role="group"
                    aria-label="Edit schedule"
                  >
                    <select
                      v-model="scheduleCadenceDraft"
                      class="schedule-inline__input"
                      aria-label="Cadence"
                    >
                      <option
                        v-for="option in scheduleCadenceOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                    <select
                      v-if="scheduleCadenceDraft === 'weekly'"
                      v-model.number="scheduleDayOfWeekDraft"
                      class="schedule-inline__input"
                      aria-label="Day of week"
                    >
                      <option
                        v-for="day in weekdayOptions"
                        :key="day.value"
                        :value="day.value"
                      >
                        {{ day.label }}
                      </option>
                    </select>
                    <select
                      v-if="scheduleCadenceDraft === 'monthly'"
                      v-model.number="scheduleDayOfMonthDraft"
                      class="schedule-inline__input schedule-inline__input--day"
                      aria-label="Day of month"
                    >
                      <option
                        v-for="day in monthDayOptions"
                        :key="day"
                        :value="day"
                      >
                        {{ day }}
                      </option>
                    </select>
                    <input
                      v-model="scheduleTimeDraft"
                      class="schedule-inline__input schedule-inline__input--time"
                      type="time"
                      required
                      aria-label="Time"
                    />
                    <div class="schedule-inline__actions">
                      <span v-if="scheduleNotice" class="inline-notice">
                        {{ scheduleNotice }}
                      </span>
                      <Button
                        v-if="scheduleDraftChanged"
                        color="primary"
                        shape="soft"
                        size="compact"
                        type="button"
                        :disabled="
                          !scheduleTimeValid ||
                          isBusy(`schedule:${selectedJob.id}`)
                        "
                        @click="saveJobSchedule"
                      >
                        Save
                      </Button>
                      <button
                        type="button"
                        class="icon-button"
                        aria-label="Cancel schedule edit"
                        @click="cancelScheduleInlineEdit"
                      >
                        <UiIcon name="X" :size="14" />
                      </button>
                    </div>
                  </div>
                </dd>
                <dd
                  v-else-if="selectedScheduleTrigger"
                  class="detail-facts__schedule"
                >
                  <span>{{
                    formatTrigger(selectedJob.triggerSummary)
                  }}</span>
                  <button
                    type="button"
                    class="icon-button"
                    title="Edit schedule"
                    aria-label="Edit schedule"
                    @click="openScheduleInlineEdit"
                  >
                    <UiIcon name="Pencil" :size="14" />
                  </button>
                </dd>
                <dd v-else>
                  {{ formatTrigger(selectedJob.triggerSummary) }}
                </dd>
              </div>
              <div class="detail-facts__meta">
                <div>
                  <dt>Last run</dt>
                  <dd>
                    {{ runStatusLabel(selectedJob.lastRunStatus) }} ·
                    {{ formatDate(selectedJob.lastRunAt) }}
                  </dd>
                </div>
                <div>
                  <dt>Next run</dt>
                  <dd>{{ formatNextRun(selectedJob) }}</dd>
                </div>
                <div>
                  <dt>Sends results to</dt>
                  <dd>{{ formatDestination(selectedDetail) }}</dd>
                </div>
              </div>
            </dl>

            <section
              v-if="selectedJobIsInboxWatch"
              class="detail-section inbox-watch-settings"
              aria-labelledby="inbox-watch-rules-title"
            >
              <div class="inbox-watch-settings__header">
                <div>
                  <h3 id="inbox-watch-rules-title">Watch Rules</h3>
                  <p>
                    Match new inbox mail by sender, subject, body text, or
                    internal labels.
                  </p>
                </div>
                <Button
                  color="outline"
                  shape="soft"
                  size="compact"
                  type="button"
                  @click="addInboxWatchRule"
                >
                  <template #icon>
                    <UiIcon name="Plus" :size="16" />
                  </template>
                  Add rule
                </Button>
              </div>

              <div class="inbox-watch-rule-list">
                <article
                  v-for="(rule, index) in inboxWatchRulesDraft"
                  :key="rule.id"
                  class="inbox-watch-rule"
                >
                  <div class="inbox-watch-rule__top">
                    <label class="inbox-watch-field inbox-watch-field--name">
                      <span>Rule name</span>
                      <input v-model="rule.label" type="text" />
                    </label>
                    <label class="inbox-watch-field">
                      <span>Timing</span>
                      <select v-model="rule.timing">
                        <option value="immediate">Immediate</option>
                        <option value="daily_digest">Daily digest</option>
                        <option value="weekly_digest">Weekly digest</option>
                        <option value="manual">Manual</option>
                      </select>
                    </label>
                    <label class="job-toggle inbox-watch-rule__toggle">
                      <input
                        v-model="rule.enabled"
                        type="checkbox"
                        class="job-toggle__input"
                        :aria-label="
                          rule.enabled
                            ? `Disable ${rule.label || `rule ${index + 1}`}`
                            : `Enable ${rule.label || `rule ${index + 1}`}`
                        "
                      />
                      <span class="job-toggle__track" aria-hidden="true" />
                    </label>
                    <button
                      type="button"
                      class="icon-button"
                      title="Remove rule"
                      aria-label="Remove rule"
                      :disabled="inboxWatchRulesDraft.length <= 1"
                      @click="removeInboxWatchRule(rule.id)"
                    >
                      <UiIcon name="Trash2" :size="16" />
                    </button>
                  </div>

                  <div class="inbox-watch-grid">
                    <label class="inbox-watch-field">
                      <span>From</span>
                      <textarea
                        v-model="rule.from"
                        rows="3"
                        placeholder="ada@example.com, client.com"
                      />
                    </label>
                    <label class="inbox-watch-field">
                      <span>Contains</span>
                      <textarea
                        v-model="rule.contains"
                        rows="3"
                        placeholder="contract, please reply"
                      />
                    </label>
                  </div>

                  <div class="inbox-watch-labels">
                    <span class="inbox-watch-labels__title">Looks like</span>
                  <div class="inbox-watch-checks">
                    <label class="checkbox-pill">
                      <input
                        v-model="rule.inferredLabels"
                        type="checkbox"
                        value="needs_reply"
                      />
                      <span>Needs reply</span>
                    </label>
                    <label class="checkbox-pill">
                      <input
                        v-model="rule.inferredLabels"
                        type="checkbox"
                        value="important"
                      />
                      <span>Important</span>
                    </label>
                    <label class="checkbox-pill">
                      <input
                        v-model="rule.inferredLabels"
                        type="checkbox"
                        value="finance"
                      />
                      <span>Finance</span>
                    </label>
                    <label class="checkbox-pill">
                      <input
                        v-model="rule.inferredLabels"
                        type="checkbox"
                        value="scheduling"
                      />
                      <span>Scheduling</span>
                    </label>
                    <label class="checkbox-pill">
                      <input
                        v-model="rule.inferredLabels"
                        type="checkbox"
                        value="review"
                      />
                      <span>Review</span>
                    </label>
                  </div>
                  </div>

                  <div class="inbox-watch-actions">
                    <label class="checkbox-row">
                      <input v-model="rule.notifyOwner" type="checkbox" />
                      <span>Notify me if connected</span>
                    </label>
                    <label class="checkbox-row">
                      <input v-model="rule.summarizeAndLabel" type="checkbox" />
                      <span>Summarize and label</span>
                    </label>
                    <label class="checkbox-row">
                      <input v-model="rule.draftReply" type="checkbox" />
                      <span>Draft reply for review</span>
                    </label>
                    <label class="checkbox-row">
                      <input v-model="rule.createTask" type="checkbox" />
                      <span>Create task</span>
                    </label>
                  </div>
                </article>
              </div>

              <div class="inbox-watch-settings__actions">
                <span v-if="inboxWatchRulesNotice" class="inline-notice">
                  {{ inboxWatchRulesNotice }}
                </span>
                <Button
                  color="primary"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="
                    !inboxWatchRulesChanged ||
                    isBusy(`inbox-watch-rules:${selectedJob.id}`)
                  "
                  @click="saveInboxWatchRules"
                >
                  Save rules
                </Button>
              </div>
            </section>

            <section
              v-if="selectedJobIsDailyBriefing"
              class="detail-section briefing-settings"
              aria-labelledby="briefing-customise-title"
            >
              <div class="briefing-settings__header">
                <h3 id="briefing-customise-title">Customise message</h3>
                <button
                  type="button"
                  class="icon-button"
                  title="Restore default"
                  aria-label="Restore default message"
                  @click="resetDailyBriefingTemplate"
                >
                  <UiIcon name="RefreshCw" :size="16" />
                </button>
              </div>

              <div class="briefing-settings__columns">
                <div class="briefing-settings__editor">
                  <label class="briefing-template-field">
                    <textarea
                      v-model="dailyBriefingTemplateDraft"
                      rows="9"
                      class="briefing-template-field__textarea"
                      aria-label="Message template"
                    />
                  </label>

                  <div
                    class="briefing-variable-list"
                    aria-label="Template variables"
                  >
                    <button
                      v-for="variable in dailyBriefingVariables"
                      :key="variable.value"
                      type="button"
                      class="briefing-variable-chip"
                      @click="insertDailyBriefingVariable(variable.value)"
                    >
                      {{ variable.label }}
                    </button>
                  </div>
                </div>

                <div class="briefing-preview" aria-label="Message preview">
                  <span class="briefing-preview__label">Preview</span>
                  <p>{{ dailyBriefingPreview }}</p>
                </div>
              </div>
            </section>

            <footer class="assistant-modal__footer">
              <span
                v-if="selectedJobIsDailyBriefing && dailyBriefingTemplateNotice"
                class="inline-notice"
              >
                {{ dailyBriefingTemplateNotice }}
              </span>
              <Button
                v-if="selectedJobIsDailyBriefing"
                color="primary"
                shape="soft"
                size="compact"
                type="button"
                :disabled="
                  !dailyBriefingTemplateChanged ||
                  isBusy(`briefing-template:${selectedJob.id}`)
                "
                @click="saveDailyBriefingTemplate"
              >
                Save message
              </Button>
              <Button
                v-if="canRun(selectedJob)"
                color="primary"
                shape="soft"
                size="compact"
                type="button"
                :disabled="isBusy(`run:${selectedJob.id}`)"
                @click="runJob(selectedJob)"
              >
                <template #icon>
                  <UiIcon name="Play" :size="17" />
                </template>
                Run now
              </Button>
              <Button
                v-if="canToggle(selectedJob)"
                color="outline"
                shape="soft"
                size="compact"
                type="button"
                :disabled="isBusy(toggleBusyKey(selectedJob))"
                @click="toggleJob(selectedJob)"
              >
                <template #icon>
                  <UiIcon :name="toggleIcon(selectedJob)" :size="17" />
                </template>
                {{ toggleLabel(selectedJob) }}
              </Button>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                type="button"
                :disabled="isBusy(`duplicate:${selectedJob.id}`)"
                @click="duplicateJob(selectedJob)"
              >
                <template #icon>
                  <UiIcon name="Copy" :size="17" />
                </template>
                Duplicate
              </Button>
              <Button
                color="danger"
                shape="soft"
                size="compact"
                icon-only
                aria-label="Remove job"
                title="Remove job"
                type="button"
                :disabled="isBusy(`archive:${selectedJob.id}`)"
                @click="archiveJob(selectedJob)"
              >
                <template #icon>
                  <UiIcon name="Trash2" :size="17" />
                </template>
              </Button>
            </footer>
          </template>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.assistant-page {
  --assistant-composer-clearance: clamp(230px, 28vh, 320px);
  --assistant-header-clearance: calc(var(--app-shell-mobile-nav-height) + 18px);

  position: relative;
  isolation: isolate;
  display: block;
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 0 14px 18px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.assistant-page--history-collapsed {
  display: block;
}

.assistant-history {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  width: min(300px, calc(100vw - var(--app-shell-mobile-nav-leading-padding)));
  max-width: min(300px, calc(100vw - var(--app-shell-mobile-nav-leading-padding)));
  min-width: 0;
  height: 100dvh;
  max-height: 100dvh;
  border-right: 1px solid var(--ui-border);
  padding: 14px 10px;
  background: var(--ui-surface-muted);
  overflow: hidden;
  transform: translateX(-102%);
  transition: transform 0.18s ease;
  box-shadow: var(--ui-shadow-md);
}

.assistant-history--open {
  transform: translateX(0);
}

.assistant-history--collapsed {
  width: min(300px, calc(100vw - var(--app-shell-mobile-nav-leading-padding)));
}

.assistant-history--collapsed .assistant-history__body {
  display: flex;
}

.assistant-history__header {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.assistant-history__new-chat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 0 0 auto;
  height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 520;
  white-space: nowrap;
  cursor: pointer;
}

.assistant-history__nav-row:hover,
.assistant-history__project-row:hover,
.assistant-history__thread:hover,
.assistant-history__new-chat:hover,
.assistant-history__icon-button:hover {
  background: color-mix(in oklab, var(--ui-surface) 64%, transparent);
  color: var(--ui-text);
}

.assistant-history__icon-button,
.assistant-mobile-nav__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.assistant-mobile-nav__button {
  pointer-events: auto;
}

.assistant-history__collapse {
  display: none;
}

.assistant-history__close {
  display: inline-flex;
  margin-left: auto;
}

.assistant-history__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding-top: 10px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.assistant-history__topnav,
.assistant-history__section {
  display: grid;
  gap: 4px;
}

.assistant-history__nav-row,
.assistant-history__project-row,
.assistant-history__thread {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  min-height: 32px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  padding: 4px 6px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 520;
  text-align: left;
  cursor: pointer;
}

.assistant-history__search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  padding: 0 6px;
  background: transparent;
  color: var(--ui-text-muted);
}

.assistant-history__search:focus-within {
  border-color: color-mix(in oklab, var(--ui-accent) 34%, var(--ui-border));
  background: var(--ui-surface);
}

.assistant-history__search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}

.assistant-history__search button,
.assistant-history__thread-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.assistant-history__section h2 {
  margin: 0;
  color: color-mix(in oklab, var(--ui-text-muted) 76%, transparent);
  font-size: 12px;
  font-weight: 500;
}

.assistant-history__thread-actions button:hover:not(:disabled),
.assistant-history__search button:hover {
  background: var(--ui-surface);
  color: var(--ui-text);
}

.assistant-history__list {
  display: grid;
  gap: 2px;
}

.assistant-history__list--nested {
  margin-left: 14px;
  padding-left: 6px;
  border-left: 1px solid var(--ui-border);
}

.assistant-history__project-group {
  display: grid;
  gap: 2px;
}

.assistant-history__project-row {
  color: var(--ui-text-muted);
}

.assistant-history__project-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.14s ease;
}

.assistant-history__count + .assistant-history__project-add {
  margin-left: 0;
}

.assistant-history__project-row:hover .assistant-history__project-add,
.assistant-history__project-row:focus-visible .assistant-history__project-add {
  opacity: 1;
}

.assistant-history__project-row.is-active,
.assistant-history__thread-row.is-active {
  background: var(--ui-surface);
  color: var(--ui-text);
}

.assistant-history__count {
  margin-left: auto;
  color: var(--ui-text-muted);
  font-size: 11px;
}

.assistant-history__thread-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.assistant-history__thread-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  border-radius: var(--ui-radius-sm);
}

.assistant-history__thread-row .assistant-history__thread {
  flex: 1 1 auto;
}

.assistant-history__thread-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  padding-right: 2px;
}

.assistant-history__thread-title,
.assistant-history__thread-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-history__thread-title {
  color: inherit;
  font-size: 12px;
  font-weight: 540;
  line-height: 1.25;
}

.assistant-history__thread-meta,
.assistant-history__message {
  color: var(--ui-text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.assistant-history__message {
  margin: 0;
  padding: 8px;
}

.assistant-history__footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--ui-border);
}

.assistant-history__archive-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  padding: 0 8px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.assistant-history__archive-button:hover {
  background: var(--ui-surface);
  color: var(--ui-text);
}

.assistant-history-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  border: 0;
  background: color-mix(in oklab, var(--ui-bg) 42%, transparent);
}

.assistant-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: min(820px, 100%);
  margin: 0 auto;
  padding: 0;
}

.assistant-topbar {
  display: none;
}

.assistant-mobile-nav {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0;
}

:global(#app-side-nav-mobile-page-controls:has(.assistant-mobile-nav)) {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 45;
  min-height: var(--app-shell-mobile-nav-height);
  height: var(--app-shell-mobile-nav-height);
  padding: var(--workspace-topbar-padding-block) 8px
    var(--workspace-topbar-padding-block)
    var(--app-shell-mobile-nav-leading-padding);
  align-items: center;
  pointer-events: none;
}

:global(.app-root:has(.assistant-page--history-open) .app-side-nav-mobile-bar) {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}

.assistant-mobile-nav__actions {
  display: flex;
  justify-content: flex-end;
}

.assistant-topbar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.model-picker {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}

.model-picker__select-wrap {
  position: relative;
  display: inline-block;
  max-width: min(48vw, 220px);
  min-width: 0;
  vertical-align: middle;
}

.model-picker__select,
.model-picker__select-sizer {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
}

.model-picker__select-sizer {
  display: block;
  min-height: 32px;
  overflow: hidden;
  padding: 0 22px 0 6px;
  visibility: hidden;
  white-space: nowrap;
}

.model-picker__select {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 32px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px 0 6px;
  background: transparent;
  color: var(--ui-text-muted);
}

.model-picker__status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  max-width: 88px;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-picker__status--ready {
  color: var(--ui-success, #1f8f55);
}

.model-picker__status--setup {
  color: var(--ui-warning, #b26a00);
}

.model-picker__status--link {
  text-decoration: none;
}

.model-picker__status--link:hover,
.model-picker__status--link:focus-visible {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.model-picker__status--unknown {
  color: var(--ui-text-muted);
}

.model-picker__select:focus,
.model-picker__select:focus-visible,
.assistant-input:focus,
.assistant-input:focus-visible {
  outline: none;
}

.assistant-console {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: min(600px, 100%);
  max-width: 600px;
  min-height: 0;
  margin: 0 auto;
}

.assistant-timeline {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: var(--assistant-header-clearance) 0 var(--assistant-composer-clearance);
}

.assistant-empty-state {
  display: grid;
  gap: 20px;
  justify-items: center;
  margin: 0 0 18px;
  padding: clamp(90px, 28vh, 250px) 0 10px;
  text-align: center;
}

.assistant-empty-state h2 {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: clamp(24px, 4vw, 30px);
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: 0;
}

.starter-prompt-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 520px;
}

.starter-prompt {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  padding: 0 10px;
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.starter-prompt__icon {
  font-family:
    "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  font-size: 14px;
  line-height: 1;
}

.starter-prompt:hover {
  border-color: color-mix(in oklab, var(--ui-accent) 40%, var(--ui-border));
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.assistant-message {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.assistant-message--assistant {
  align-items: flex-start;
}

.assistant-message--user {
  align-items: flex-end;
}

.assistant-message__bubble {
  display: grid;
  gap: 6px;
  max-width: 88%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 12px 14px;
  background: var(--ui-surface);
  color: var(--ui-text);
}

.assistant-message--assistant .assistant-message__bubble {
  width: 100%;
  max-width: 100%;
  border: 0;
  border-radius: 0;
  padding: 12px 0;
  background: transparent;
}

.assistant-message--user .assistant-message__bubble {
  border-color: color-mix(in oklab, var(--ui-accent) 36%, var(--ui-border));
  background: var(--ui-accent-soft);
}

.assistant-message__bubble--pending {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-text-muted);
}

.assistant-message__bubble p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.5;
}

.assistant-message__meta,
.assistant-message__detail {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.assistant-message__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.assistant-message__actions a {
  color: var(--ui-accent);
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.job-builder-card {
  display: grid;
  gap: 12px;
  margin-top: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 14px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm);
}

.job-builder-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.job-builder-card__header h3,
.job-builder-card__header p {
  margin: 0;
}

.job-builder-card__header h3 {
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1.25;
}

.job-builder-card__header p {
  margin-top: 3px;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.4;
}

.job-builder-card__status {
  flex: 0 0 auto;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.job-builder-card__status--valid,
.job-builder-card__status--active {
  border-color: color-mix(in oklab, var(--ui-accent) 36%, var(--ui-border));
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}

.job-builder-card__status--needs_setup,
.job-builder-card__status--draft,
.job-builder-card__status--paused {
  border-color: color-mix(in oklab, #c08a18 44%, var(--ui-border));
  background: color-mix(in oklab, #c08a18 12%, var(--ui-surface));
  color: color-mix(in oklab, #9a6400 78%, var(--ui-text));
}

.job-builder-card__status--invalid,
.job-builder-card__status--failing {
  border-color: color-mix(in oklab, #c73939 42%, var(--ui-border));
  background: color-mix(in oklab, #c73939 12%, var(--ui-surface));
  color: color-mix(in oklab, #a32323 80%, var(--ui-text));
}

.job-builder-card__sentence {
  margin: 0;
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1.5;
}

.job-builder-card__sentence strong {
  font-weight: 800;
}

.job-builder-card__tools {
  margin: -4px 0 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.35;
}

.job-builder-card__warnings {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 9px 10px 9px 26px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.job-builder-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.job-builder-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 0 11px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease, color 0.14s ease;
}

.job-builder-card__button:hover:not(:disabled) {
  border-color: color-mix(in oklab, var(--ui-accent) 42%, var(--ui-border));
  background: var(--ui-surface-muted);
}

.job-builder-card__button--primary {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.job-builder-card__button--primary:hover:not(:disabled) {
  background: color-mix(in oklab, var(--ui-accent) 88%, var(--ui-text));
  color: var(--ui-accent-contrast);
}

.job-builder-card__button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.assistant-message__tools {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 4px;
  color: var(--ui-text-muted);
}

.assistant-message__time {
  font-size: 11px;
  line-height: 1;
}

.assistant-message-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease;
}

.assistant-message:hover .assistant-message-tool,
.assistant-message:focus-within .assistant-message-tool {
  opacity: 1;
  pointer-events: auto;
}

.assistant-message-tool:hover:not(:disabled) {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.assistant-message-tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.assistant-typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.assistant-typing span {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  animation: assistant-typing-bounce 1.1s infinite ease-in-out;
}

.assistant-typing span:nth-child(2) {
  animation-delay: 0.12s;
}

.assistant-typing span:nth-child(3) {
  animation-delay: 0.24s;
}

.assistant-composer {
  position: fixed;
  right: auto;
  bottom: max(14px, env(safe-area-inset-bottom, 0px));
  left: 50%;
  z-index: 40;
  display: grid;
  gap: 8px;
  width: min(600px, calc(100vw - 28px));
  max-width: 600px;
  margin-inline: auto;
  border: 1px solid var(--ui-border);
  border-radius: 24px;
  padding: 10px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-sm, 0 8px 24px rgba(15, 23, 42, 0.08));
  transform: translateX(-50%);
}

.assistant-composer--drag-active {
  border-color: color-mix(in oklab, var(--ui-accent) 65%, var(--ui-border));
  background:
    linear-gradient(
      color-mix(in oklab, var(--ui-accent) 7%, transparent),
      color-mix(in oklab, var(--ui-accent) 7%, transparent)
    ),
    var(--ui-surface);
  box-shadow:
    0 0 0 3px color-mix(in oklab, var(--ui-accent) 14%, transparent),
    var(--ui-shadow-sm, 0 8px 24px rgba(15, 23, 42, 0.08));
}

.assistant-composer__bottom,
.assistant-composer__left,
.assistant-composer__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.assistant-composer__bottom {
  justify-content: space-between;
  min-width: 0;
}

.assistant-composer__left,
.assistant-composer__right {
  flex-shrink: 0;
}

.assistant-composer__right {
  min-width: 0;
  flex: 1 1 auto;
  justify-content: flex-end;
}

.assistant-input {
  display: block;
  width: 100%;
  min-height: 44px;
  max-height: 160px;
  resize: none;
  border: 0;
  border-radius: 12px;
  padding: 6px 2px 2px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 15px;
  line-height: 1.45;
}

.assistant-input::placeholder {
  color: color-mix(in oklab, var(--ui-text-muted) 70%, transparent);
}

.assistant-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.assistant-attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  padding: 2px 4px 2px 9px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1;
}

.assistant-attachment--error {
  border-color: color-mix(in oklab, var(--ui-warning, #b26a00) 45%, var(--ui-border));
  color: var(--ui-warning, #b26a00);
}

.assistant-attachment__thumb {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 999px;
  object-fit: cover;
}

.assistant-attachment__name {
  min-width: 0;
  max-width: 170px;
  overflow: hidden;
  color: var(--ui-text);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-attachment__meta {
  flex: 0 0 auto;
  color: inherit;
}

.assistant-attachment__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.assistant-attachment__remove:hover {
  background: var(--ui-surface);
  color: var(--ui-text);
}

.composer-icon-button,
.assistant-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.composer-icon-button:hover:not(:disabled) {
  background: transparent;
  color: var(--ui-text);
}

.composer-icon-button--listening,
.composer-icon-button--listening:hover:not(:disabled) {
  background: var(--ui-accent-soft);
  color: var(--ui-accent-strong);
}

.composer-icon-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.composer-icon-button:disabled:hover {
  background: transparent;
  color: var(--ui-text-muted);
}

.assistant-send {
  background: color-mix(in oklab, var(--ui-text-muted) 80%, var(--ui-surface));
  color: var(--ui-surface);
}

.assistant-send--stop {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.assistant-send:not(:disabled):hover {
  background: var(--ui-text);
}

.assistant-send--stop:not(:disabled):hover {
  background: var(--ui-border);
}

.assistant-send:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ui-accent) 35%, transparent);
  outline-offset: 2px;
}

.assistant-composer__meta {
  display: flex;
  align-items: center;
  min-height: 16px;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.assistant-composer__voice-status {
  color: var(--ui-accent-strong);
  font-weight: 700;
}

.assistant-composer__attachment-status {
  color: var(--ui-text-muted);
  font-weight: 650;
}

.assistant-archived-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.assistant-archived-thread {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 8px;
  background: var(--ui-surface-muted);
}

.assistant-archived-thread__main {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.assistant-archived-thread__main span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.assistant-archived-thread__main strong,
.assistant-archived-thread__main small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-archived-thread__main strong {
  font-size: 13px;
  font-weight: 650;
}

.assistant-archived-thread__main small {
  color: var(--ui-text-muted);
  font-size: 11px;
}

.assistant-archived-thread__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.assistant-archived-thread__actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.assistant-archived-thread__actions button:hover:not(:disabled) {
  background: var(--ui-surface);
  color: var(--ui-text);
}

.assistant-error {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.assistant-modal__header p {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: 14px;
  line-height: 1.5;
}

.needs-you {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 4px 8px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.needs-you {
  border-color: color-mix(in oklab, var(--ui-accent) 50%, var(--ui-border));
  background: var(--ui-accent-soft);
  color: var(--ui-text);
}

.panel {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  overflow: hidden;
}

.detail-section h3,
.assistant-placeholder p {
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
  letter-spacing: 0;
}

.detail-section h3 {
  font-size: 15px;
}

.assistant-placeholder {
  display: grid;
  justify-items: center;
  gap: 18px;
  width: min(550px, 100%);
  align-content: center;
  padding: 28px 18px;
  text-align: center;
}

.assistant-placeholder p {
  max-width: 430px;
  color: var(--ui-text);
  font-size: clamp(28px, 5vw, 38px);
  font-weight: 800;
  line-height: 1.08;
}

.assistant-placeholder__image {
  display: block;
  width: min(68vw, 240px);
  height: min(68vw, 240px);
  object-fit: cover;
  border-radius: 50%;
  box-shadow: var(--ui-shadow-md, 0 22px 70px rgba(15, 23, 42, 0.14));
}

.assistant-placeholder :deep(.me3-btn--compact) {
  min-height: 44px;
  padding: 0 18px;
  font-size: 14px;
}

.job-list {
  display: grid;
  gap: 8px;
}

.job-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface);
}

.job-row--selected {
  border-color: color-mix(in oklab, var(--ui-accent) 34%, var(--ui-border));
  background: color-mix(in oklab, var(--ui-accent-soft) 42%, var(--ui-surface));
}

.job-row--muted,
.job-row--inactive {
  opacity: 0.76;
}

.job-row__emoji {
  flex-shrink: 0;
  font-size: 21px;
  line-height: 1;
  font-family:
    "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
}

.job-row__main {
  flex: 1;
  min-width: 0;
  padding: 0;
}

.job-row__main:focus-visible,
button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.job-row__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.job-row__title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.job-row__title-line strong {
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.3;
}

.job-row__meta {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.job-row__actions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.job-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.job-toggle.is-busy {
  cursor: wait;
  opacity: 0.72;
}

.job-toggle__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.job-toggle__track {
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--ui-border);
  position: relative;
  transition: background 0.2s ease;
}

.job-toggle__track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--ui-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.2s ease;
}

.job-toggle__input:checked + .job-toggle__track {
  background: var(--ui-accent);
}

.job-toggle__input:checked + .job-toggle__track::after {
  transform: translateX(18px);
}

.job-toggle__input:focus-visible + .job-toggle__track {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.job-toggle__input:disabled + .job-toggle__track {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
}

.icon-button:hover {
  background: var(--ui-surface-muted);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: var(--ui-radius-sm);
  padding: 3px 7px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
}

.status-badge--active,
.status-badge--ready {
  background: var(--ui-accent-soft);
  color: var(--ui-text);
}

.status-badge--needs_setup,
.status-badge--failing {
  border: 1px solid color-mix(in oklab, #d97706 45%, var(--ui-border));
  background: color-mix(in oklab, #d97706 12%, var(--ui-surface));
  color: var(--ui-text);
}

.status-badge--paused,
.status-badge--draft,
.status-badge--manual_only,
.status-badge--coming_later {
  border: 1px solid var(--ui-border);
}

.notice {
  border: 1px solid color-mix(in oklab, var(--ui-accent) 40%, var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: 12px;
  background: var(--ui-accent-soft);
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.45;
}

.notice--error {
  border-color: color-mix(in oklab, #e53935 42%, var(--ui-border));
  background: color-mix(in oklab, #e53935 10%, var(--ui-surface));
}

.empty-row {
  padding: 24px 16px;
  color: var(--ui-text-muted);
  font-size: 14px;
  text-align: center;
}

.detail-facts {
  display: grid;
  grid-template-columns: 1fr;
  row-gap: 10px;
  margin: 0;
}

.detail-facts__runs,
.detail-facts__meta > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.detail-facts__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 20px;
  align-items: start;
}

.detail-facts dt {
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 800;
}

.detail-facts dd {
  margin: 0;
  color: var(--ui-text);
  font-size: 12px;
  line-height: 1.35;
}

.detail-facts__schedule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.detail-facts__schedule--editing {
  display: block;
}

.schedule-inline {
  display: inline-flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  vertical-align: top;
}

.schedule-inline__input {
  display: inline-block;
  flex: 0 0 auto;
  width: auto;
  min-height: 30px;
  max-width: 9.5rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 0 8px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
}

.schedule-inline__input--time {
  width: 7.25rem;
  max-width: none;
}

.schedule-inline__input--day {
  width: 4.25rem;
  max-width: none;
}

.schedule-inline__input:focus-visible {
  border-color: var(--ui-accent);
  outline: 2px solid color-mix(in oklab, var(--ui-accent) 35%, transparent);
  outline-offset: 1px;
}

.schedule-inline__actions {
  display: inline-flex;
  flex-shrink: 0;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
}

.detail-section {
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--ui-border);
  padding-top: 16px;
}

.inbox-watch-settings__header,
.inbox-watch-settings__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.inbox-watch-settings__header p {
  margin: 4px 0 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.4;
}

.inbox-watch-rule-list {
  display: grid;
  gap: 12px;
}

.inbox-watch-rule {
  display: grid;
  gap: 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 12px;
  background: var(--ui-surface-muted);
}

.inbox-watch-rule__top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(132px, 160px) auto auto;
  align-items: end;
  gap: 10px;
}

.inbox-watch-rule__toggle {
  min-height: 40px;
  align-items: center;
}

.inbox-watch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.inbox-watch-field {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 800;
}

.inbox-watch-field input,
.inbox-watch-field select,
.inbox-watch-field textarea {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}

.inbox-watch-field input,
.inbox-watch-field select {
  min-height: 40px;
  padding: 0 10px;
}

.inbox-watch-field textarea {
  min-height: 78px;
  resize: vertical;
  padding: 9px 10px;
  line-height: 1.4;
}

.inbox-watch-field input:focus-visible,
.inbox-watch-field select:focus-visible,
.inbox-watch-field textarea:focus-visible {
  border-color: var(--ui-accent);
  outline: 2px solid color-mix(in oklab, var(--ui-accent) 35%, transparent);
  outline-offset: 1px;
}

.inbox-watch-checks,
.inbox-watch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.inbox-watch-labels {
  display: grid;
  gap: 8px;
}

.inbox-watch-labels__title {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.checkbox-pill,
.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.2;
  cursor: pointer;
}

.checkbox-pill {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 5px 8px;
  background: var(--ui-surface);
}

.checkbox-pill input,
.checkbox-row input {
  margin: 0;
}

.briefing-settings__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.briefing-settings__header h3 {
  margin: 0;
}

.briefing-settings__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.briefing-settings__editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.briefing-template-field {
  display: block;
  min-width: 0;
}

.briefing-template-field__textarea {
  display: block;
  width: 100%;
  min-height: 11rem;
  resize: vertical;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 10px 12px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
}

.briefing-variable-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.briefing-variable-chip {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 2px 6px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
}

.briefing-preview {
  display: grid;
  gap: 8px;
  min-width: 0;
  min-height: 100%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 12px;
  background: var(--ui-surface-muted);
}

.briefing-preview__label {
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
}

.briefing-preview p {
  margin: 0;
  white-space: pre-line;
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.45;
}

.inline-notice {
  align-self: center;
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.assistant-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in oklab, #000, transparent 62%);
}

.assistant-modal--stacked {
  z-index: 110;
}

.assistant-modal__dialog {
  display: grid;
  gap: 16px;
  width: min(600px, 100%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 18px;
  box-shadow: 0 24px 80px color-mix(in oklab, #000, transparent 78%);
}

.assistant-modal__dialog--wide {
  width: min(600px, 100%);
}

.assistant-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.assistant-modal__header-copy {
  min-width: 0;
}

.assistant-modal__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.assistant-modal__header h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
  letter-spacing: 0;
}

.assistant-modal__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.assistant-modal-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 0 10px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.assistant-modal-action:hover {
  border-color: color-mix(in oklab, var(--ui-accent) 42%, var(--ui-border));
  background: var(--ui-surface-muted);
}

.assistant-modal-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  cursor: pointer;
}

.assistant-modal-icon-action:hover {
  border-color: color-mix(in oklab, var(--ui-accent) 42%, var(--ui-border));
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.recipe-ingredient-list {
  display: grid;
  gap: 10px;
}

.recipe-ingredient-row {
  display: grid;
  gap: 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 12px;
  background: var(--ui-surface);
}

.recipe-ingredient-row__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.recipe-ingredient-row__header h3,
.recipe-ingredient-row__header p {
  margin: 0;
}

.recipe-ingredient-row__header h3 {
  font-size: 14px;
  line-height: 1.25;
}

.recipe-ingredient-row__header p {
  margin-top: 2px;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.recipe-ingredient-row__groups {
  display: grid;
  gap: 10px;
}

.recipe-ingredient-row__groups strong {
  display: block;
  margin-bottom: 6px;
  color: var(--ui-text-muted);
  font-size: 11px;
  line-height: 1;
  text-transform: uppercase;
}

.recipe-ingredient-row__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.recipe-ingredient-chip {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  border: 1px solid color-mix(in oklab, var(--ui-accent) 34%, var(--ui-border));
  border-radius: 999px;
  padding: 0 9px;
  background: var(--ui-accent-soft);
  color: var(--ui-accent-strong);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.recipe-ingredient-chip--optional {
  border-color: var(--ui-border);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
}

.modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
}

.assistant-modal__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--ui-border);
}

@media (max-width: 760px) {
  .assistant-page {
    --assistant-composer-clearance: clamp(250px, 32vh, 360px);
    --assistant-header-clearance: calc(var(--app-shell-mobile-nav-height) + 14px);
  }

  .assistant-timeline {
    padding-top: var(--assistant-header-clearance);
  }

  .assistant-empty-state {
    gap: 12px;
    margin-bottom: 10px;
  }

  .assistant-message__bubble {
    max-width: 94%;
  }

  .assistant-composer {
    border-radius: 20px;
  }

  .job-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .job-row__main {
    flex-basis: calc(100% - 33px);
  }

  .job-row__actions {
    width: 100%;
    justify-content: flex-end;
    padding-top: 2px;
  }

  .detail-facts__meta {
    grid-template-columns: 1fr;
    row-gap: 8px;
  }

  .briefing-settings__columns {
    grid-template-columns: 1fr;
  }

  .inbox-watch-settings__header,
  .inbox-watch-settings__actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .inbox-watch-rule__top,
  .inbox-watch-grid {
    grid-template-columns: 1fr;
  }

  .inbox-watch-rule__top {
    align-items: stretch;
  }

  .inbox-watch-rule__toggle {
    min-height: 28px;
  }

  .assistant-modal {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0;
  }

  .assistant-modal__dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-height: min(92dvh, 100%);
    align-self: stretch;
    padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    border-radius: var(--ui-radius-lg) var(--ui-radius-lg) 0 0;
  }

  .assistant-modal__header {
    flex-shrink: 0;
    align-items: center;
  }

  .assistant-modal__header h2 {
    font-size: 16px;
  }
}

@keyframes assistant-typing-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }

  40% {
    transform: translateY(-3px);
    opacity: 1;
  }
}
</style>
