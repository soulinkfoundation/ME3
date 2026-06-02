<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { api } from "../../api";
import Button from "../../components/Button.vue";
import UiIcon from "../../components/UiIcon.vue";
import { useAppToast } from "../../composables/useAppToast";

definePage({
  meta: {
    requiresAuth: true,
    title: "Assistant Jobs | ME3",
    description: "Create and manage ME3 assistant jobs.",
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

type JobsResponse = { jobs: AssistantJob[] };
type RecipesResponse = { recipes: AssistantJobRecipe[] };

const { toastSuccess, toastFromUnknown } = useAppToast();

const jobs = ref<AssistantJob[]>([]);
const recipes = ref<AssistantJobRecipe[]>([]);
const selectedJobId = ref<string | null>(null);
const selectedDetail = ref<AssistantJobDetail | null>(null);
const loadingJobs = ref(false);
const loadingRecipes = ref(false);
const loadingDetail = ref(false);
const pageError = ref("");
const addModalOpen = ref(false);
const detailModalOpen = ref(false);
const busyKeys = ref(new Set<string>());
const dailyBriefingTemplateDraft = ref("");
const dailyBriefingTemplateNotice = ref("");
const scheduleCadenceDraft = ref<AssistantScheduleCadence>("daily");
const scheduleTimeDraft = ref("08:00");
const scheduleDayOfWeekDraft = ref(1);
const scheduleDayOfMonthDraft = ref(1);
const scheduleNotice = ref("");
const inboxWatchRulesDraft = ref<InboxWatchRuleForm[]>([]);
const inboxWatchRulesNotice = ref("");

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
const addedRecipeIds = computed(
  () =>
    new Set(
      jobs.value
        .map((job) => job.recipeId)
        .filter((recipeId): recipeId is string => Boolean(recipeId)),
    ),
);

const sortedJobs = computed(() =>
  [...jobs.value].sort((a, b) => {
    const statusRank = statusSortRank(a.status) - statusSortRank(b.status);
    if (statusRank !== 0) return statusRank;
    return a.name.localeCompare(b.name);
  }),
);

const suggestedRecipes = computed(() => {
  const order = new Map(suggestedRecipeOrder.map((id, index) => [id, index]));
  return recipes.value
    .filter(
      (recipe) =>
        suggestedRecipeIds.has(recipe.id) &&
        !addedRecipeIds.value.has(recipe.id),
    )
    .sort(
      (a, b) =>
        (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) ||
        a.name.localeCompare(b.name),
    );
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

onMounted(() => {
  void loadPage();
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWindowKeydown);
});

async function loadPage() {
  pageError.value = "";
  await Promise.all([loadJobs(), loadRecipes()]);
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

    addModalOpen.value = false;
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
  });
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

function openAddModal() {
  addModalOpen.value = true;
}

function closeAddModal() {
  addModalOpen.value = false;
}

function closeDetailModal() {
  detailModalOpen.value = false;
  selectedJobId.value = null;
  selectedDetail.value = null;
  dailyBriefingTemplateNotice.value = "";
  scheduleNotice.value = "";
  inboxWatchRulesNotice.value = "";
  inboxWatchRulesDraft.value = [];
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (addModalOpen.value) {
    closeAddModal();
    return;
  }
  if (detailModalOpen.value) {
    closeDetailModal();
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

function recipeActionLabel(recipe: AssistantJobRecipe) {
  if (recipe.state === "coming_later") return "Later";
  return "Add";
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

function formatScheduleTimezone(
  trigger: Extract<AssistantJobTrigger, { kind: "schedule" }>,
) {
  return trigger.timezone === "owner" ? "Account timezone" : trigger.timezone;
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
  if (landing === "capture") return "Mission Control captures";
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

function renderDailyBriefingPreview(template: string) {
  const values: Record<string, string> = {
    "owner.name": "Kieran Butler",
    "today.date": "Monday 1 June",
    "calendar.summary": "Your calendar is clear for Monday 1 June.",
    "calendar.events": "",
    "calendar.reminders":
      "Reminders: 1 due today.\n- 10:00 Follow up with Ben Hyneck",
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
  <div class="assistant-page">
    <Teleport to="#app-side-nav-mobile-page-controls">
      <div v-if="!loadingJobs" class="assistant-mobile-nav">
        <h1 class="assistant-mobile-nav__title">Assistant jobs</h1>
        <div v-if="sortedJobs.length > 0" class="assistant-mobile-nav__actions">
          <Button
            tone="green"
            shape="soft"
            size="compact"
            icon-only
            aria-label="Add job"
            type="button"
            @click="openAddModal"
          >
            <template #icon>
              <UiIcon name="Plus" :size="18" />
            </template>
          </Button>
        </div>
      </div>
    </Teleport>

    <header
      v-if="!loadingJobs && sortedJobs.length > 0"
      class="assistant-topbar"
    >
      <div aria-hidden="true"></div>
      <h1>Assistant jobs</h1>
      <div class="assistant-topbar__actions">
        <Button
          tone="green"
          shape="soft"
          size="compact"
          type="button"
          @click="openAddModal"
        >
          <template #icon>
            <UiIcon name="Plus" :size="18" />
          </template>
          Add job
        </Button>
      </div>
    </header>

    <main
      class="assistant-main"
      :class="{
        'assistant-main--empty': !loadingJobs && sortedJobs.length === 0,
      }"
    >
      <section v-if="pageError" class="notice notice--error" role="alert">
        {{ pageError }}
      </section>

      <section v-if="loadingJobs" class="panel assistant-placeholder">
        Loading jobs...
      </section>

      <section
        v-else-if="sortedJobs.length === 0"
        class="assistant-placeholder"
        aria-label="No assistant jobs"
      >
        <img
          class="assistant-placeholder__image"
          src="/assistant-jobs.png"
          alt=""
          aria-hidden="true"
        />
        <p>Create jobs for your assistant</p>
        <Button
          tone="green"
          shape="soft"
          size="compact"
          type="button"
          @click="openAddModal"
        >
          <template #icon>
            <UiIcon name="Plus" :size="18" />
          </template>
          Add Job
        </Button>
      </section>

      <template v-else>
        <section class="jobs-panel" aria-label="Assistant jobs">
          <div class="job-list">
            <article
              v-for="job in sortedJobs"
              :key="job.id"
              class="job-row"
              :class="{
                'job-row--selected':
                  detailModalOpen && selectedJobId === job.id,
                'job-row--muted':
                  job.status === 'paused' || job.status === 'draft',
              }"
            >
              <span class="job-row__emoji" aria-hidden="true">
                {{ jobNavEmoji(job) }}
              </span>
              <button
                type="button"
                class="job-row__main"
                @click="openJob(job.id)"
              >
                <span class="job-row__copy">
                  <span class="job-row__title-line">
                    <strong>{{ job.name }}</strong>
                    <span
                      class="status-badge"
                      :class="`status-badge--${job.status}`"
                    >
                      {{ statusLabel(job.status) }}
                    </span>
                  </span>
                  <span class="job-row__meta">
                    Runs: {{ formatTrigger(job.triggerSummary) }} · Last run:
                    {{ formatDate(job.lastRunAt) }}
                  </span>
                </span>
              </button>

              <div class="job-row__actions">
                <span
                  v-if="job.lastRunStatus === 'waiting_for_approval'"
                  class="needs-you"
                >
                  Needs you
                </span>
                <label
                  class="job-toggle"
                  :class="{ 'is-busy': isJobToggleBusy(job) }"
                  @click.stop
                >
                  <input
                    type="checkbox"
                    class="job-toggle__input"
                    :checked="isJobEnabled(job)"
                    :disabled="!canToggle(job) || isJobToggleBusy(job)"
                    :aria-label="
                      isJobEnabled(job)
                        ? `Pause ${job.name}`
                        : `Enable ${job.name}`
                    "
                    @change="
                      handleJobToggle(
                        job,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  <span class="job-toggle__track" aria-hidden="true" />
                </label>
                <button
                  type="button"
                  class="icon-button"
                  title="Edit job"
                  aria-label="Edit job"
                  @click.stop="openJob(job.id)"
                >
                  <UiIcon name="Pencil" :size="16" />
                </button>
              </div>
            </article>
          </div>
        </section>
      </template>
    </main>

    <Teleport to="body">
      <div
        v-if="addModalOpen"
        class="assistant-modal"
        @click.self="closeAddModal"
      >
        <section
          class="assistant-modal__dialog assistant-modal__dialog--wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-job-title"
        >
          <header class="assistant-modal__header">
            <h2 id="add-job-title">Add Job</h2>
            <button
              type="button"
              class="modal-close"
              aria-label="Close"
              @click="closeAddModal"
            >
              <UiIcon name="X" :size="20" />
            </button>
          </header>

          <div v-if="loadingRecipes" class="empty-row">
            Loading suggested jobs...
          </div>
          <div v-else-if="!suggestedRecipes.length" class="empty-row">
            All suggested jobs have been added. Open an active job to duplicate
            it.
          </div>
          <div v-else class="starter-list">
            <article
              v-for="recipe in suggestedRecipes"
              :key="recipe.id"
              class="starter-row"
            >
              <span class="job-row__emoji" aria-hidden="true">
                {{ recipeNavEmoji(recipe.id) }}
              </span>
              <div class="starter-main">
                <div class="starter-title-line">
                  <h3>{{ recipe.name }}</h3>
                  <span
                    v-if="recipe.state === 'needs_setup'"
                    class="status-badge status-badge--needs_setup"
                  >
                    Needs setup
                  </span>
                </div>
                <p>{{ cleanPlainText(recipe.outcome) }}</p>
              </div>
              <Button
                tone="outline"
                shape="soft"
                size="compact"
                type="button"
                :disabled="
                  !canCreateRecipe(recipe) || isBusy(`recipe:${recipe.id}`)
                "
                @click="createStarterJob(recipe)"
              >
                <template #icon>
                  <UiIcon name="Plus" :size="16" />
                </template>
                {{ recipeActionLabel(recipe) }}
              </Button>
            </article>
          </div>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="detailModalOpen"
        class="assistant-modal"
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
                  <h2 id="job-detail-title">{{ selectedJob.name }}</h2>
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
                <p>{{ cleanPlainText(selectedJob.purpose) }}</p>
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
              <div>
                <dt>Runs</dt>
                <dd>{{ formatTrigger(selectedJob.triggerSummary) }}</dd>
              </div>
              <div>
                <dt>Sends results to</dt>
                <dd>{{ formatDestination(selectedDetail) }}</dd>
              </div>
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
            </dl>

            <section
              v-if="selectedScheduleTrigger"
              class="detail-section schedule-settings"
              aria-labelledby="job-schedule-title"
            >
              <div class="schedule-settings__header">
                <h3 id="job-schedule-title">Schedule</h3>
                <span>{{
                  formatScheduleTimezone(selectedScheduleTrigger)
                }}</span>
              </div>

              <div class="schedule-form">
                <label class="schedule-field">
                  <span>Cadence</span>
                  <select v-model="scheduleCadenceDraft" class="schedule-input">
                    <option
                      v-for="option in scheduleCadenceOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="schedule-field">
                  <span>Time</span>
                  <input
                    v-model="scheduleTimeDraft"
                    class="schedule-input"
                    type="time"
                    required
                  />
                </label>

                <label
                  v-if="scheduleCadenceDraft === 'weekly'"
                  class="schedule-field"
                >
                  <span>Day</span>
                  <select
                    v-model.number="scheduleDayOfWeekDraft"
                    class="schedule-input"
                  >
                    <option
                      v-for="day in weekdayOptions"
                      :key="day.value"
                      :value="day.value"
                    >
                      {{ day.label }}
                    </option>
                  </select>
                </label>

                <label
                  v-if="scheduleCadenceDraft === 'monthly'"
                  class="schedule-field"
                >
                  <span>Day</span>
                  <select
                    v-model.number="scheduleDayOfMonthDraft"
                    class="schedule-input"
                  >
                    <option
                      v-for="day in monthDayOptions"
                      :key="day"
                      :value="day"
                    >
                      {{ day }}
                    </option>
                  </select>
                </label>
              </div>

              <div class="schedule-settings__actions">
                <span v-if="scheduleNotice" class="inline-notice">
                  {{ scheduleNotice }}
                </span>
                <Button
                  tone="green"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="
                    !scheduleDraftChanged ||
                    !scheduleTimeValid ||
                    isBusy(`schedule:${selectedJob.id}`)
                  "
                  @click="saveJobSchedule"
                >
                  Save schedule
                </Button>
              </div>
            </section>

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
                  tone="outline"
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
                  tone="green"
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
              aria-labelledby="daily-briefing-message-title"
            >
              <div class="briefing-settings__header">
                <div>
                  <h3 id="daily-briefing-message-title">Daily message</h3>
                  <p>
                    Soulink gets this message when connected. Mission Control
                    keeps it in history.
                  </p>
                </div>
                <button
                  type="button"
                  class="text-button"
                  @click="resetDailyBriefingTemplate"
                >
                  Restore default
                </button>
              </div>

              <label class="briefing-template-field">
                <span>Template</span>
                <textarea
                  v-model="dailyBriefingTemplateDraft"
                  rows="7"
                  class="briefing-template-field__textarea"
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

              <div class="briefing-preview" aria-label="Message preview">
                <h4>Preview</h4>
                <p>{{ dailyBriefingPreview }}</p>
              </div>

              <div class="briefing-settings__actions">
                <span v-if="dailyBriefingTemplateNotice" class="inline-notice">
                  {{ dailyBriefingTemplateNotice }}
                </span>
                <Button
                  tone="green"
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
              </div>
            </section>

            <section
              class="detail-section"
              aria-labelledby="job-permissions-title"
            >
              <h3 id="job-permissions-title">What This Job Can Do</h3>
              <div class="permission-grid">
                <div>
                  <h4>Reads</h4>
                  <ul>
                    <li
                      v-for="item in selectedDetail?.version?.permissionSummary
                        .reads || []"
                      :key="item"
                    >
                      {{ cleanPlainText(item) }}
                    </li>
                    <li
                      v-if="
                        !(
                          selectedDetail?.version?.permissionSummary.reads || []
                        ).length
                      "
                    >
                      Nothing listed yet.
                    </li>
                  </ul>
                </div>
                <div>
                  <h4>Creates</h4>
                  <ul>
                    <li
                      v-for="item in selectedDetail?.version?.permissionSummary
                        .writes || []"
                      :key="item"
                    >
                      {{ cleanPlainText(item) }}
                    </li>
                    <li
                      v-if="
                        !(
                          selectedDetail?.version?.permissionSummary.writes ||
                          []
                        ).length
                      "
                    >
                      Nothing listed yet.
                    </li>
                  </ul>
                </div>
                <div>
                  <h4>Needs You For</h4>
                  <ul>
                    <li
                      v-for="item in selectedDetail?.version?.permissionSummary
                        .approvalRequired || []"
                      :key="item"
                    >
                      {{ cleanPlainText(item) }}
                    </li>
                    <li
                      v-if="
                        !(
                          selectedDetail?.version?.permissionSummary
                            .approvalRequired || []
                        ).length
                      "
                    >
                      Nothing right now.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <footer class="assistant-modal__footer">
              <Button
                v-if="canRun(selectedJob)"
                tone="green"
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
                tone="outline"
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
                tone="outline"
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
                tone="red"
                shape="soft"
                size="compact"
                type="button"
                :disabled="isBusy(`archive:${selectedJob.id}`)"
                @click="archiveJob(selectedJob)"
              >
                <template #icon>
                  <UiIcon name="Trash2" :size="17" />
                </template>
                Remove job
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
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100vh;
  padding: 0 24px 40px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.assistant-main {
  display: grid;
  gap: 16px;
  justify-items: stretch;
  align-content: start;
  flex: 1;
  min-height: 0;
  width: min(760px, 100%);
  margin: 0 auto;
  padding: 0 0 4px;
}

.assistant-main--empty {
  place-items: center;
  align-content: center;
}

.assistant-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(44px, 1fr);
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 64px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--ui-border);
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.assistant-mobile-nav {
  display: none;
}

.assistant-mobile-nav__title {
  margin: 0;
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  text-align: center;
}

.assistant-mobile-nav__actions {
  display: flex;
  justify-content: flex-end;
}

.assistant-topbar h1 {
  justify-self: center;
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0;
}

.assistant-topbar__actions {
  display: flex;
  justify-content: flex-end;
}

.assistant-modal__header p,
.starter-main p {
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

.starter-list,
.job-list {
  display: grid;
}

.jobs-panel {
  min-width: 0;
}

.job-list {
  gap: 8px;
}

.starter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--ui-border);
}

.starter-row:last-child {
  border-bottom: 0;
}

.starter-main {
  flex: 1;
  min-width: 0;
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

.starter-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.starter-title-line h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.3;
}

.job-row--selected {
  border-color: color-mix(in oklab, var(--ui-accent) 34%, var(--ui-border));
  background: color-mix(in oklab, var(--ui-accent-soft) 42%, var(--ui-surface));
}

.job-row--muted {
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
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
  row-gap: 10px;
  margin: 0;
}

.detail-facts div {
  display: grid;
  gap: 2px;
  min-width: 0;
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

.detail-section {
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--ui-border);
  padding-top: 16px;
}

.schedule-settings__header,
.schedule-settings__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.schedule-settings__header span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
}

.schedule-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.schedule-field {
  display: grid;
  gap: 7px;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 800;
}

.schedule-input {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 0 10px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}

.schedule-input:focus-visible {
  border-color: var(--ui-accent);
  outline: 2px solid color-mix(in oklab, var(--ui-accent) 35%, transparent);
  outline-offset: 1px;
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

.briefing-settings__header,
.briefing-settings__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.briefing-settings__header p {
  margin: 4px 0 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.4;
}

.text-button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--ui-accent);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.briefing-template-field {
  display: grid;
  gap: 7px;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 800;
}

.briefing-template-field__textarea {
  width: 100%;
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
  gap: 8px;
}

.briefing-variable-chip {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 6px 9px;
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.briefing-preview {
  display: grid;
  gap: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 12px;
  background: var(--ui-surface-muted);
}

.briefing-preview h4 {
  margin: 0;
  font-size: 13px;
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

.permission-grid {
  display: grid;
  gap: 12px;
}

.permission-grid > div {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  padding: 12px;
  background: var(--ui-surface-muted);
}

.permission-grid h4 {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.2;
}

.permission-grid ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.4;
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

@media (max-width: 959px) {
  .assistant-page {
    gap: 0;
    padding: 0 14px 32px;
  }

  .assistant-main:not(.assistant-main--empty) {
    padding-top: 16px;
  }

  .assistant-topbar {
    display: none;
  }

  .assistant-mobile-nav {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    min-height: 36px;
  }

  .assistant-mobile-nav__actions {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
  }

  .assistant-mobile-nav :deep(.me3-btn--icon-only.me3-btn--compact) {
    width: 36px;
    min-width: 36px;
    padding: 0;
  }
}

@media (max-width: 760px) {
  .assistant-main {
    padding-bottom: 24px;
  }

  .starter-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 0;
  }

  .starter-main {
    flex-basis: calc(100% - 33px);
  }

  .starter-main p {
    margin-top: 4px;
    font-size: 13px;
    line-height: 1.4;
  }

  .starter-row :deep(.me3-btn) {
    flex-shrink: 0;
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

  .detail-facts {
    grid-template-columns: 1fr;
    row-gap: 8px;
  }

  .schedule-form {
    grid-template-columns: 1fr;
  }

  .schedule-settings__header,
  .schedule-settings__actions,
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

  .starter-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }
}
</style>
