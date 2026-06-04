<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import { API_BASE, ApiError, api } from "../api";
import Button from "../components/Button.vue";
import UiIcon from "../components/UiIcon.vue";
import { useAppToast } from "../composables/useAppToast";
import type { UiIconName } from "../utils/icons";

definePage({
  path: "/mission-control/projects",
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.mission-control",
    title: "Mission Control Projects | ME3",
    description: "ME3 Core Mission Control projects workspace.",
    robots: "noindex,follow",
  },
});

type MissionSection =
  | "projects"
  | "accounts"
  | "activity"
  | "memory"
  | "sources";
type PrimaryMissionSection = "projects" | "accounts";
type SettingsMissionSection = "activity" | "memory" | "sources";

type MissionProject = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  description: string | null;
  color: string | null;
  icon: string | null;
  sourceKind: "manual" | "daemon_repo" | "beads" | "import";
  sourceRef: string | null;
  metadata: Record<string, unknown>;
};

type MissionTask = {
  id: string;
  title: string;
  description: string | null;
  status: "backlog" | "in_progress" | "review" | "done" | "cancelled";
  projectId: string | null;
  dueAt: string | null;
  scheduledFor: string | null;
  sourceKind: "manual" | "capture" | "agent" | "beads" | "daemon";
  sourceRef: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  metadata: Record<string, unknown>;
};

type WeeklyReviewTaskItem = {
  id: string;
  title: string;
  projectId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  status: string | null;
};

type WeeklyReviewTaskCleanupAction = "archive" | "done";

type WeeklyReviewMemorySuggestion = {
  id: string;
  title: string;
  body: string;
  memoryKind: string;
  duplicate: boolean;
  pattern: boolean;
  note: string;
  checked: boolean;
};

type WeeklyReviewReminderItem = {
  id: string;
  title: string;
  remindAt: string | null;
  status: string | null;
};

type WeeklyReviewView = {
  reviewDate: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  summary: string;
  openTasks: WeeklyReviewTaskItem[];
  completedTasks: WeeklyReviewTaskItem[];
  reminders: WeeklyReviewReminderItem[];
  memorySuggestions: WeeklyReviewMemorySuggestion[];
  submittedAt: string | null;
};

type MissionApproval = {
  id: string;
  pluginId: string;
  actionId: string;
  title: string;
  summary: string | null;
  riskLevel: "low" | "medium" | "high";
  status: string;
  requestedAt: string;
};

type MissionRun = {
  id: string;
  title: string;
  projectId: string | null;
  taskId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  model: string | null;
  runnerId: string | null;
  promptSummary: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type LocalExecutorStatusResponse = {
  setup: {
    ready: boolean;
    paired: boolean;
    hasProjectPolicy: boolean;
    nextAction: string;
  };
  pairings: Array<{
    displayName: string;
    status: string;
    lastSeenAt: string | null;
  }>;
};

type MissionMemory = {
  id: string;
  memoryKind: string;
  scopeKind: string;
  scopeId: string | null;
  title: string | null;
  body: string;
  confidence: number;
  sourceKind: string;
  sourceRef: string | null;
  reviewStatus: "active" | "needs_review" | "archived";
  createdAt: string;
  updatedAt: string;
};

type MissionContextSource = {
  id: string;
  sourceKind: string;
  label: string;
  description: string | null;
  visibility: "public" | "private";
  status: "active" | "setup_required" | "paused" | "failed" | "archived";
  sourceRef: string | null;
};

type MissionActivity = {
  id: string;
  title: string;
  summary: string | null;
  status: string | null;
  relatedId: string | null;
  createdAt: string;
};

type CorePluginRecord = {
  id: string;
  enabled: boolean;
  status: string;
};

type FinancialEntryType = "income" | "expense";
type FinancialEntryStatus =
  | "pending"
  | "paid"
  | "overdue"
  | "cancelled"
  | "needs_review";
type FinancialEntrySource = "manual" | "email_triage" | "stripe" | "csv_import";

type FinancialCategory = {
  id: string;
  name: string;
  entryType: FinancialEntryType;
};

type FinancialEntry = {
  id: string;
  entryType: FinancialEntryType;
  date: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  amountCents: number;
  currency: string;
  status: FinancialEntryStatus;
  source: FinancialEntrySource;
  notes: string | null;
};

type AccountsStats = {
  thisMonthCents: number;
  lastMonthCents: number;
  topCategoryName: string | null;
  topCategoryTotalCents: number;
  entriesCount: number;
};

type AccountsEntryForm = {
  date: string;
  description: string;
  categoryId: string;
  amount: string;
  currency: string;
  status: FinancialEntryStatus;
  notes: string;
};

type PluginsResponse = { plugins: CorePluginRecord[] };
type MissionMemoryResponse = { memory: MissionMemory[] };
type MissionSourcesResponse = { sources: MissionContextSource[] };
type MissionTasksResponse = {
  tasks: MissionTask[];
  nextCursor: string | null;
  limit: number;
};

type ActivityViewItem = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  status: string | null;
  createdAt: string;
  localExecutorRunId?: string | null;
  canCancelLocalRun?: boolean;
  canRetryLocalRun?: boolean;
};

type ProjectBoardStatus = Exclude<MissionTask["status"], "cancelled">;

type ProjectBoardColumn = {
  id: ProjectBoardStatus;
  label: string;
  tasks: MissionTask[];
};

type ProjectTaskDetailDraft = {
  title: string;
  description: string;
  status: ProjectBoardStatus;
};

const route = useRoute();
const router = useRouter();
const { toastFromUnknown, toastSuccess } = useAppToast();

const basePrimarySections: PrimaryMissionSection[] = ["projects"];
const settingsSections: SettingsMissionSection[] = ["activity", "memory", "sources"];
const sectionIds: MissionSection[] = [
  ...basePrimarySections,
  "accounts",
  ...settingsSections,
];
const sectionLabels: Record<MissionSection, string> = {
  projects: "Projects",
  accounts: "Accounts",
  activity: "Activity",
  memory: "Memory",
  sources: "Sources",
};
const projectBoardStatuses: Array<{
  id: ProjectBoardStatus;
  label: string;
}> = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "Doing" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];
const PROJECT_TASK_PAGE_SIZE = 50;
const ACCOUNTS_PAGE_SIZE = 50;

const activeSection = ref<MissionSection>(
  normalizeSection(route.query.section),
);
const accountsEnabled = ref(false);
const projects = ref<MissionProject[]>([]);
const pendingApprovals = ref<MissionApproval[]>([]);
const recentRuns = ref<MissionRun[]>([]);
const memory = ref<MissionMemory[]>([]);
const sources = ref<MissionContextSource[]>([]);
const activity = ref<MissionActivity[]>([]);
const loading = ref(false);
const error = ref("");
const clearingActivity = ref(false);
const localRunActionId = ref("");
const selectedProjectDetailId = ref("");
const projectPickerOpen = ref(false);
const memoryDraft = ref("");
const memoryActionId = ref("");
const sourceDraft = ref("");
const settingsMenuOpen = ref(false);
const projectModalOpen = ref(false);
const projectTitle = ref("");
const projectDescription = ref("");
const projectType = ref<"standard" | "local">("standard");
const projectLocalPath = ref("");
const projectLogoData = ref("");
const projectLogoName = ref("");
const projectSaving = ref(false);
const projectError = ref("");
const projectTasks = ref<MissionTask[]>([]);
const projectTasksLoading = ref(false);
const projectTasksLoadingMore = ref(false);
const projectTasksError = ref("");
const projectTasksNextCursor = ref<string | null>(null);
const localExecutorStatus = ref<LocalExecutorStatusResponse | null>(null);
const projectTaskDraft = ref("");
const projectTaskProjectId = ref("");
const projectTaskSaving = ref(false);
const projectTaskActionId = ref("");
const projectTaskLocalRunId = ref("");
const projectTaskComposerStatus = ref<ProjectBoardStatus | "">("");
const draggedProjectTaskId = ref("");
const projectTaskDropStatus = ref<ProjectBoardStatus | "">("");
const selectedProjectTaskDetailId = ref("");
const projectTaskDetailDraft = ref<ProjectTaskDetailDraft>({
  title: "",
  description: "",
  status: "backlog",
});
const projectTaskDetailSaving = ref(false);
const projectTaskDetailError = ref("");
const weeklyReviewTaskActions = ref<
  Record<string, WeeklyReviewTaskCleanupAction>
>({});
const weeklyReviewMemoryIds = ref<Set<string>>(new Set());
const weeklyReviewReminderIds = ref<Set<string>>(new Set());
const weeklyReviewCustomMemory = ref("");
const weeklyReviewCompletedOpen = ref(false);
const weeklyReviewSubmitting = ref(false);
const accountsType = ref<FinancialEntryType>("expense");
const accountsEntries = ref<FinancialEntry[]>([]);
const accountsCategories = ref<FinancialCategory[]>([]);
const accountsStats = ref<AccountsStats | null>(null);
const accountsLoading = ref(false);
const accountsSaving = ref(false);
const accountsImporting = ref(false);
const accountsSyncing = ref(false);
const accountsModalOpen = ref(false);
const accountsError = ref("");
const accountsMessage = ref("");
const accountsTotal = ref(0);
const accountsOffset = ref(0);
const accountsSearch = ref("");
const accountsStatusFilter = ref("");
const accountsSourceFilter = ref("");
const accountsStripeConfigured = ref(false);
const accountsStripeStatus = ref("");
const accountsStripeLastSyncedAt = ref<string | null>(null);
const accountsImportInput = ref<HTMLInputElement | null>(null);
const accountsForm = ref<AccountsEntryForm>(emptyAccountsForm("expense"));

const primarySections = computed<PrimaryMissionSection[]>(() =>
  accountsEnabled.value
    ? [...basePrimarySections, "accounts"]
    : basePrimarySections,
);
const activityItems = computed<ActivityViewItem[]>(() => {
  const visibleRunIds = new Set(
    recentRuns.value
      .flatMap((run) => [
        run.id,
        typeof run.result?.assistantJobRunId === "string"
          ? run.result.assistantJobRunId
          : null,
      ])
      .filter(Boolean),
  );
  return [
    ...pendingApprovals.value.map((approval) => ({
      id: `approval:${approval.id}`,
      kind: "Approval",
      title: approval.title,
      summary: approval.summary || approval.actionId,
      status: approval.riskLevel,
      createdAt: approval.requestedAt,
    })),
    ...recentRuns.value.map((run) => {
      const localExecutorRunId =
        typeof run.result?.localExecutorRunId === "string"
          ? run.result.localExecutorRunId
          : null;
      return {
        id: `run:${run.id}`,
        kind: "Run",
        title: run.title,
        summary: run.promptSummary || run.model || "Run summary pending",
        status: run.status,
        createdAt: run.finishedAt || run.startedAt || run.createdAt,
        localExecutorRunId,
        canCancelLocalRun:
          Boolean(localExecutorRunId) &&
          (run.status === "queued" || run.status === "running"),
        canRetryLocalRun:
          Boolean(localExecutorRunId) &&
          (run.status === "running" ||
            run.status === "failed" ||
            run.status === "cancelled"),
      };
    }),
    ...activity.value
      .filter((item) => !item.relatedId || !visibleRunIds.has(item.relatedId))
      .map((item) => ({
        id: `activity:${item.id}`,
        kind: "Activity",
        title: item.title,
        summary: item.summary,
        status: item.status,
        createdAt: item.createdAt,
      })),
  ];
});
const settingsSectionActive = computed(() =>
  settingsSections.includes(activeSection.value as SettingsMissionSection),
);
const mobilePrimarySectionCycleLabel = computed(() =>
  activeSection.value === "accounts" ? "Switch to projects" : "Switch to accounts",
);
const mobilePrimarySectionIcon = computed<UiIconName>(() =>
  activeSection.value === "accounts" ? "ListTodo" : "CircleDollarSign",
);
const projectCreateDisabled = computed(
  () =>
    projectSaving.value ||
    projectTitle.value.trim().length === 0 ||
    (projectType.value === "local" &&
      projectLocalPath.value.trim().length === 0),
);
const selectedProjectDetail = computed(
  () =>
    selectedProjectDetailId.value
      ? projects.value.find(
          (project) => project.id === selectedProjectDetailId.value,
        ) || null
      : null,
);
const selectedProjectTaskScopeId = computed(
  () => selectedProjectDetail.value?.id || "",
);
const selectedProjectIsLocal = computed(() =>
  isLocalProject(selectedProjectDetail.value),
);
const localExecutorRunnerLabel = computed(() => {
  const setup = localExecutorStatus.value?.setup;
  if (!setup) return "Runner status unknown";
  if (setup.ready) return "Runner ready";
  if (!setup.paired) return "Pair a runner";
  if (!setup.hasProjectPolicy) return "Add a local project";
  return "Runner not ready";
});
const localExecutorRunnerDetail = computed(() => {
  const latestPairing = localExecutorStatus.value?.pairings.find(
    (pairing) => pairing.status === "active",
  );
  if (latestPairing?.lastSeenAt) {
    return `${latestPairing.displayName} last seen ${formatDateTime(
      latestPairing.lastSeenAt,
    )}`;
  }
  if (localExecutorStatus.value?.setup.ready) {
    return "Keep the runner command open to claim Doing tasks.";
  }
  return "Use Account > Plugins > Local Executor to connect this computer.";
});
const selectedProjectTasks = computed(() => {
  const projectId = selectedProjectDetail.value?.id;
  if (!projectId) {
    return projectTasks.value.filter((task) => task.status !== "cancelled");
  }
  return projectTasks.value.filter(
    (task) => task.projectId === projectId && task.status !== "cancelled",
  );
});
const selectedProjectTaskDetail = computed(() =>
  selectedProjectTaskDetailId.value
    ? projectTasks.value.find(
        (task) => task.id === selectedProjectTaskDetailId.value,
      ) || null
    : null,
);
const selectedProjectTaskDetailProject = computed(() =>
  selectedProjectTaskDetail.value
    ? projectForTask(selectedProjectTaskDetail.value)
    : null,
);
const selectedProjectTaskWeeklyReview = computed(() =>
  weeklyReviewMetadata(selectedProjectTaskDetail.value),
);
const selectedProjectTaskIsWeeklyReview = computed(() =>
  Boolean(selectedProjectTaskWeeklyReview.value),
);
const selectedProjectTaskLatestRun = computed(() => {
  const taskId = selectedProjectTaskDetail.value?.id;
  if (!taskId) return null;
  return (
    recentRuns.value.find(
      (run) =>
        run.taskId === taskId || run.result?.localExecutorTaskId === taskId,
    ) || null
  );
});
const selectedProjectTaskLatestRunSummary = computed(() => {
  const run = selectedProjectTaskLatestRun.value;
  if (!run) return "";
  const summary = run.result?.summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  if (run.status === "queued") return "Queued for a local runner.";
  if (run.status === "running") return "Running on a local runner.";
  if (run.status === "succeeded") return "Local run completed.";
  if (run.status === "failed") return "Local run failed.";
  return "Local run cancelled.";
});
const projectBoardColumns = computed<ProjectBoardColumn[]>(() =>
  projectBoardStatuses.map((column) => ({
    ...column,
    tasks: selectedProjectTasks.value.filter(
      (task) => task.status === column.id,
    ),
  })),
);
const selectedProjectDetailLabel = computed(
  () => selectedProjectDetail.value?.name || "All",
);
const projectTaskCreateDisabled = computed(
  () =>
    projectTaskSaving.value ||
    !projectTaskComposerStatus.value ||
    !projectTaskDraft.value.trim() ||
    !projectTaskProjectId.value,
);
const projectTaskDetailSaveDisabled = computed(
  () =>
    projectTaskDetailSaving.value ||
    weeklyReviewSubmitting.value ||
    !selectedProjectTaskDetail.value ||
    !projectTaskDetailDraft.value.title.trim(),
);
const weeklyReviewSubmitDisabled = computed(
  () =>
    weeklyReviewSubmitting.value ||
    !selectedProjectTaskDetail.value ||
    !selectedProjectTaskWeeklyReview.value ||
    Boolean(selectedProjectTaskWeeklyReview.value.submittedAt),
);
const accountsPage = computed(
  () => Math.floor(accountsOffset.value / ACCOUNTS_PAGE_SIZE) + 1,
);
const accountsHasPrevious = computed(() => accountsOffset.value > 0);
const accountsHasNext = computed(
  () => accountsOffset.value + ACCOUNTS_PAGE_SIZE < accountsTotal.value,
);
const accountsEntryCountLabel = computed(() =>
  accountsTotal.value === 1 ? "1 entry" : `${accountsTotal.value} entries`,
);
const accountCategoryOptions = computed(() =>
  accountsCategories.value.filter(
    (category) => category.entryType === accountsType.value,
  ),
);
const accountsFormDisabled = computed(
  () =>
    accountsSaving.value ||
    !accountsForm.value.date ||
    !accountsForm.value.description.trim() ||
    !normalizeAccountsAmountInput(accountsForm.value.amount),
);
async function loadMissionControlWorkspace() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get<{ projects: MissionProject[] }>(
      "/mission-control/projects",
    );
    projects.value = response.projects || [];
    if (
      selectedProjectDetailId.value &&
      !projects.value.some(
        (project) => project.id === selectedProjectDetailId.value,
      )
    ) {
      selectedProjectDetailId.value = "";
    }
    await Promise.all([loadProjectTasks(), loadLocalExecutorStatus()]);
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : "Mission Control could not load";
  } finally {
    loading.value = false;
  }
}

async function loadActivityReview() {
  try {
    const [approvalsResponse, runsResponse, activityResponse] =
      await Promise.all([
        api.get<{ approvals: MissionApproval[] }>(
          "/mission-control/approvals?status=pending",
        ),
        api.get<{ runs: MissionRun[] }>(
          "/mission-control/agent-runs?limit=50",
        ),
        api.get<{ activity: MissionActivity[] }>(
          "/mission-control/plugin-activity?limit=50",
        ),
      ]);
    pendingApprovals.value = approvalsResponse.approvals || [];
    recentRuns.value = runsResponse.runs || [];
    activity.value = activityResponse.activity || [];
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : "Activity could not load";
  }
}

async function clearActivity() {
  if (activityItems.value.length === 0 || clearingActivity.value) return;
  const confirmed = window.confirm(
    "Clear Mission Control Activity? This removes run and plugin activity history from this view.",
  );
  if (!confirmed) return;

  clearingActivity.value = true;
  try {
    await api.delete<{
      cleared: { agentRuns: number; pluginActivity: number };
    }>("/mission-control/activity");
    recentRuns.value = [];
    activity.value = [];
    toastSuccess("Activity cleared");
  } catch (e) {
    toastFromUnknown(e, "Activity could not be cleared");
  } finally {
    clearingActivity.value = false;
  }
}

async function cancelLocalExecutorRun(item: ActivityViewItem) {
  const runId = item.localExecutorRunId;
  if (!runId || localRunActionId.value) return;
  const confirmed = window.confirm(
    "Cancel this local run? Use this when the local runner is stuck or you no longer want it to finish.",
  );
  if (!confirmed) return;

  localRunActionId.value = `cancel:${runId}`;
  try {
    await api.post(`/local-executor/runs/${encodeURIComponent(runId)}/cancel`, {});
    toastSuccess("Local run cancelled");
    await loadActivityReview();
  } catch (e) {
    toastFromUnknown(e, "Could not cancel local run");
  } finally {
    localRunActionId.value = "";
  }
}

async function retryLocalExecutorRun(item: ActivityViewItem) {
  const runId = item.localExecutorRunId;
  if (!runId || localRunActionId.value) return;
  if (item.status === "running") {
    const confirmed = window.confirm(
      "Requeue this running local run? Only do this if the old local runner is stuck or has been stopped.",
    );
    if (!confirmed) return;
  }

  localRunActionId.value = `retry:${runId}`;
  try {
    await api.post(`/local-executor/runs/${encodeURIComponent(runId)}/retry`, {});
    toastSuccess("Local run queued again");
    await loadActivityReview();
  } catch (e) {
    toastFromUnknown(e, "Could not retry local run");
  } finally {
    localRunActionId.value = "";
  }
}

async function loadMemoryAndSources() {
  try {
    const [memoryResponse, sourceResponse] = await Promise.all([
      api.get<MissionMemoryResponse>("/mission-control/memory"),
      api.get<MissionSourcesResponse>("/mission-control/context-sources"),
    ]);
    memory.value = memoryResponse.memory || [];
    sources.value = sourceResponse.sources || [];
  } catch {
    memory.value = [];
    sources.value = [];
  }
}

async function loadPluginCapabilities() {
  try {
    const response = await api.get<PluginsResponse>("/plugins");
    accountsEnabled.value =
      response.plugins?.some(
        (plugin) =>
          plugin.id === "me3.accounts" &&
          plugin.enabled &&
          plugin.status === "installed",
      ) || false;
    if (accountsEnabled.value && activeSection.value === "accounts") {
      await loadAccounts();
    }
  } catch {
    accountsEnabled.value = false;
  }
}

async function loadAccounts() {
  if (!accountsEnabled.value) return;
  accountsLoading.value = true;
  accountsError.value = "";
  try {
    const query = new URLSearchParams({
      entryType: accountsType.value,
      limit: String(ACCOUNTS_PAGE_SIZE),
      offset: String(accountsOffset.value),
    });
    if (accountsSearch.value.trim())
      query.set("search", accountsSearch.value.trim());
    if (accountsStatusFilter.value)
      query.set("status", accountsStatusFilter.value);
    if (accountsSourceFilter.value)
      query.set("source", accountsSourceFilter.value);

    const [entriesResponse, categoriesResponse, statsResponse, stripeResponse] =
      await Promise.all([
        api.get<{
          entries: FinancialEntry[];
          total: number;
        }>(`/accounts/entries?${query.toString()}`),
        api.get<{ categories: FinancialCategory[] }>(
          `/accounts/categories?entryType=${encodeURIComponent(accountsType.value)}`,
        ),
        api.get<{ stats: AccountsStats }>(
          `/accounts/stats?entryType=${encodeURIComponent(accountsType.value)}`,
        ),
        api.get<{
          connected: boolean;
          status: string;
          lastSyncedAt: string | null;
        }>("/accounts/stripe/status"),
      ]);

    accountsEntries.value = entriesResponse.entries || [];
    accountsTotal.value = entriesResponse.total || 0;
    accountsCategories.value = categoriesResponse.categories || [];
    accountsStats.value = statsResponse.stats || null;
    accountsStripeConfigured.value = stripeResponse.connected;
    accountsStripeStatus.value = stripeResponse.status;
    accountsStripeLastSyncedAt.value = stripeResponse.lastSyncedAt;
  } catch (e) {
    accountsError.value =
      e instanceof ApiError ? e.message : "Accounts could not load";
  } finally {
    accountsLoading.value = false;
  }
}

async function saveAccountEntry() {
  if (accountsFormDisabled.value) return;
  const amountValue = Number(
    normalizeAccountsAmountInput(accountsForm.value.amount),
  );
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    accountsError.value = "Amount must be greater than zero";
    return;
  }
  accountsSaving.value = true;
  accountsError.value = "";
  accountsMessage.value = "";
  try {
    await api.post("/accounts/entries", {
      entryType: accountsType.value,
      date: accountsForm.value.date,
      description: accountsForm.value.description.trim(),
      categoryId: accountsForm.value.categoryId || null,
      amountCents: Math.round(amountValue * 100),
      currency: accountsForm.value.currency.trim().toUpperCase() || "USD",
      status: accountsForm.value.status,
      notes: accountsForm.value.notes.trim() || null,
    });
    accountsForm.value = emptyAccountsForm(accountsType.value);
    accountsModalOpen.value = false;
    accountsOffset.value = 0;
    accountsMessage.value = "Entry added.";
    await loadAccounts();
  } catch (e) {
    accountsError.value =
      e instanceof ApiError ? e.message : "Could not add account entry";
  } finally {
    accountsSaving.value = false;
  }
}

function openAccountsModal() {
  accountsForm.value = emptyAccountsForm(accountsType.value);
  accountsError.value = "";
  accountsModalOpen.value = true;
}

function closeAccountsModal() {
  if (accountsSaving.value) return;
  accountsModalOpen.value = false;
}

async function deleteAccountEntry(entry: FinancialEntry) {
  accountsError.value = "";
  accountsMessage.value = "";
  try {
    await api.delete(`/accounts/entries/${encodeURIComponent(entry.id)}`);
    accountsMessage.value = "Entry deleted.";
    await loadAccounts();
  } catch (e) {
    accountsError.value =
      e instanceof ApiError ? e.message : "Could not delete account entry";
  }
}

function setAccountsType(type: FinancialEntryType) {
  if (accountsType.value === type) return;
  accountsType.value = type;
  accountsOffset.value = 0;
  accountsForm.value = emptyAccountsForm(type);
  void loadAccounts();
}

function applyAccountsFilters() {
  accountsOffset.value = 0;
  void loadAccounts();
}

function pageAccounts(delta: number) {
  accountsOffset.value = Math.max(
    0,
    accountsOffset.value + delta * ACCOUNTS_PAGE_SIZE,
  );
  void loadAccounts();
}

function chooseAccountsImportFile() {
  accountsImportInput.value?.click();
}

async function importAccountsCsv(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  accountsImporting.value = true;
  accountsError.value = "";
  accountsMessage.value = "";
  try {
    const form = new FormData();
    form.append("entryType", accountsType.value);
    form.append("file", file);
    const response = await api.upload<{
      imported: number;
      skipped: number;
      total: number;
    }>("/accounts/import", form);
    accountsMessage.value = `Imported ${response.imported} of ${response.total}; skipped ${response.skipped}.`;
    accountsOffset.value = 0;
    await loadAccounts();
  } catch (e) {
    accountsError.value =
      e instanceof ApiError ? e.message : "Could not import CSV";
  } finally {
    accountsImporting.value = false;
    input.value = "";
  }
}

function exportAccountsCsv() {
  const query = new URLSearchParams({ entryType: accountsType.value });
  if (accountsSearch.value.trim())
    query.set("search", accountsSearch.value.trim());
  if (accountsStatusFilter.value)
    query.set("status", accountsStatusFilter.value);
  if (accountsSourceFilter.value)
    query.set("source", accountsSourceFilter.value);
  window.location.href = `${API_BASE}/accounts/export?${query.toString()}`;
}

async function syncAccountsStripe() {
  accountsSyncing.value = true;
  accountsError.value = "";
  accountsMessage.value = "";
  try {
    const response = await api.post<{
      chargesImported: number;
      chargesUpdated: number;
      chargesProcessed: number;
    }>("/accounts/stripe/sync", {});
    accountsType.value = "income";
    accountsMessage.value = `Stripe sync processed ${response.chargesProcessed}; added ${response.chargesImported}, updated ${response.chargesUpdated}.`;
    accountsOffset.value = 0;
    await loadAccounts();
  } catch (e) {
    accountsError.value =
      e instanceof ApiError ? e.message : "Could not sync Stripe charges";
  } finally {
    accountsSyncing.value = false;
  }
}

async function loadProjectTasks(
  projectId = selectedProjectTaskScopeId.value,
) {
  const scopeId = projectId || "";
  projectTasksLoading.value = true;
  projectTasksError.value = "";
  try {
    const response = await api.get<MissionTasksResponse>(
      missionTasksUrl({ projectId: scopeId }),
    );
    if (selectedProjectTaskScopeId.value !== scopeId) return;
    projectTasks.value = response.tasks || [];
    projectTasksNextCursor.value = response.nextCursor || null;
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Project tasks could not load";
    projectTasks.value = [];
    projectTasksNextCursor.value = null;
  } finally {
    projectTasksLoading.value = false;
  }
}

async function loadLocalExecutorStatus() {
  try {
    localExecutorStatus.value = await api.get<LocalExecutorStatusResponse>(
      "/local-executor/status",
    );
  } catch {
    localExecutorStatus.value = null;
  }
}

async function loadMoreProjectTasks() {
  const projectId = selectedProjectTaskScopeId.value;
  const cursor = projectTasksNextCursor.value;
  if (!cursor || projectTasksLoadingMore.value) return;
  projectTasksLoadingMore.value = true;
  projectTasksError.value = "";
  try {
    const response = await api.get<MissionTasksResponse>(
      missionTasksUrl({ projectId, cursor }),
    );
    if (selectedProjectTaskScopeId.value !== projectId) return;
    projectTasks.value = appendUniqueTasks(
      projectTasks.value,
      response.tasks || [],
    );
    projectTasksNextCursor.value = response.nextCursor || null;
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not load more project tasks";
  } finally {
    projectTasksLoadingMore.value = false;
  }
}

function toggleProjectPicker() {
  settingsMenuOpen.value = false;
  projectPickerOpen.value = !projectPickerOpen.value;
}

function selectProjectDetail(projectId: string) {
  selectedProjectDetailId.value = projectId;
  projectPickerOpen.value = false;
  resetProjectTaskComposer();
  closeProjectTaskDetail();
}

function setSection(section: MissionSection) {
  activeSection.value = section;
  settingsMenuOpen.value = false;
  projectPickerOpen.value = false;
  if (section !== "projects") resetProjectTaskComposer();
  void router.replace({
    query: {
      ...route.query,
      section: section === "projects" ? undefined : sectionQueryValue(section),
    },
  });
}

function cyclePrimarySection() {
  setSection(activeSection.value === "accounts" ? "projects" : "accounts");
}

function openProjectModal() {
  projectPickerOpen.value = false;
  projectTitle.value = "";
  projectDescription.value = "";
  projectType.value = "standard";
  projectLocalPath.value = "";
  projectLogoData.value = "";
  projectLogoName.value = "";
  projectError.value = "";
  projectModalOpen.value = true;
}

function openAssistantForSelectedProject() {
  const project = selectedProjectDetail.value;
  if (!project) return;
  void router.push({
    path: "/assistant",
    query: { project: project.id },
  });
}

function closeProjectModal() {
  if (projectSaving.value) return;
  projectModalOpen.value = false;
}

function chooseProjectLogo(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  projectError.value = "";
  if (!file.type.startsWith("image/")) {
    projectError.value = "Choose an image file for the project logo";
    input.value = "";
    return;
  }
  if (file.size > 180_000) {
    projectError.value = "Choose a logo under 180 KB";
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    projectLogoData.value =
      typeof reader.result === "string" ? reader.result : "";
    projectLogoName.value = file.name;
  };
  reader.onerror = () => {
    projectError.value = "Could not read that image";
  };
  reader.readAsDataURL(file);
}

function removeProjectLogo() {
  projectLogoData.value = "";
  projectLogoName.value = "";
}

async function addProject() {
  const name = projectTitle.value.trim();
  if (!name || projectSaving.value) return;
  projectSaving.value = true;
  projectError.value = "";
  try {
    const response = await api.post<{ project: MissionProject }>(
      "/mission-control/projects",
      {
        name,
        description: projectDescription.value.trim() || undefined,
        projectType: projectType.value,
        localPath:
          projectType.value === "local"
            ? projectLocalPath.value.trim()
            : undefined,
        icon: projectLogoData.value || undefined,
      },
    );
    projects.value = [response.project, ...projects.value].sort((a, b) => {
      if (a.name === "Personal") return -1;
      if (b.name === "Personal") return 1;
      return a.name.localeCompare(b.name);
    });
    selectedProjectDetailId.value = response.project.id;
    toastSuccess("Project added");
    projectModalOpen.value = false;
  } catch (e) {
    projectError.value =
      e instanceof ApiError ? e.message : "Could not create project";
  } finally {
    projectSaving.value = false;
  }
}

function resetProjectTaskComposer() {
  projectTaskComposerStatus.value = "";
  projectTaskDraft.value = "";
  projectTaskProjectId.value = "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableTextValue(value: unknown): string | null {
  const text = textValue(value);
  return text || null;
}

function boolValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function weeklyReviewTaskItem(value: unknown): WeeklyReviewTaskItem | null {
  const record = recordValue(value);
  if (!record) return null;
  const id = textValue(record.id);
  const title = textValue(record.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    projectId: nullableTextValue(record.projectId),
    dueAt: nullableTextValue(record.dueAt),
    completedAt: nullableTextValue(record.completedAt),
    status: nullableTextValue(record.status),
  };
}

function weeklyReviewMemorySuggestion(
  value: unknown,
  index: number,
): WeeklyReviewMemorySuggestion | null {
  const record = recordValue(value);
  if (!record) return null;
  const title = textValue(record.title);
  const body = textValue(record.body);
  if (!title || !body) return null;
  return {
    id: textValue(record.id) || `suggestion-${index}`,
    title,
    body,
    memoryKind: textValue(record.memoryKind) || "preference",
    duplicate: boolValue(record.duplicate),
    pattern: boolValue(record.pattern),
    note: textValue(record.note),
    checked: boolValue(record.checked, true),
  };
}

function weeklyReviewReminderItem(value: unknown): WeeklyReviewReminderItem | null {
  const record = recordValue(value);
  if (!record) return null;
  const id = textValue(record.id);
  const title = textValue(record.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    remindAt: nullableTextValue(record.remindAt),
    status: nullableTextValue(record.status),
  };
}

function weeklyReviewMetadata(task: MissionTask | null | undefined): WeeklyReviewView | null {
  const metadata = recordValue(task?.metadata);
  const review = recordValue(metadata?.weeklyReview);
  if (!metadata || !review || metadata.kind !== "weekly_review") return null;
  const weekStart = textValue(review.weekStart);
  const weekEnd = textValue(review.weekEnd);
  const reviewDate = textValue(review.reviewDate) || weekEnd || weekStart;
  const weekLabel =
    textValue(review.weekLabel) ||
    [weekStart, weekEnd].filter(Boolean).join(" to ") ||
    "Weekly Review";
  const openTasks = Array.isArray(review.openTasks)
    ? review.openTasks
        .map((item) => weeklyReviewTaskItem(item))
        .filter((item): item is WeeklyReviewTaskItem => Boolean(item))
    : [];
  const completedTasks = Array.isArray(review.completedTasks)
    ? review.completedTasks
        .map((item) => weeklyReviewTaskItem(item))
        .filter((item): item is WeeklyReviewTaskItem => Boolean(item))
    : [];
  const reminders = Array.isArray(review.reminders)
    ? review.reminders
        .map((item) => weeklyReviewReminderItem(item))
        .filter((item): item is WeeklyReviewReminderItem => Boolean(item))
    : [];
  const memorySuggestions = Array.isArray(review.memorySuggestions)
    ? review.memorySuggestions
        .map((item, index) => weeklyReviewMemorySuggestion(item, index))
        .filter(
          (item): item is WeeklyReviewMemorySuggestion => Boolean(item),
        )
    : [];

  return {
    reviewDate,
    weekStart,
    weekEnd,
    weekLabel,
    summary:
      textValue(review.journalSummary) ||
      `Review ${weekLabel.toLowerCase()}.`,
    openTasks,
    completedTasks,
    reminders,
    memorySuggestions,
    submittedAt: nullableTextValue(review.submittedAt),
  };
}

function resetWeeklyReviewSelection(task: MissionTask | null) {
  const review = weeklyReviewMetadata(task);
  weeklyReviewTaskActions.value = {};
  weeklyReviewMemoryIds.value = new Set(
    review?.memorySuggestions
      .filter((item) => item.checked)
      .map((item) => item.id) || [],
  );
  weeklyReviewReminderIds.value = new Set();
  weeklyReviewCustomMemory.value = "";
  weeklyReviewCompletedOpen.value = false;
}

function setWeeklyReviewTaskAction(
  taskId: string,
  action: WeeklyReviewTaskCleanupAction,
) {
  const next = { ...weeklyReviewTaskActions.value };
  if (next[taskId] === action) delete next[taskId];
  else next[taskId] = action;
  weeklyReviewTaskActions.value = next;
}

function toggleWeeklyReviewMemory(suggestionId: string) {
  const next = new Set(weeklyReviewMemoryIds.value);
  if (next.has(suggestionId)) next.delete(suggestionId);
  else next.add(suggestionId);
  weeklyReviewMemoryIds.value = next;
}

function toggleWeeklyReviewReminder(reminderId: string) {
  const next = new Set(weeklyReviewReminderIds.value);
  if (next.has(reminderId)) next.delete(reminderId);
  else next.add(reminderId);
  weeklyReviewReminderIds.value = next;
}

function weeklyReviewCardLabel(task: MissionTask): string {
  const review = weeklyReviewMetadata(task);
  if (!review) return "";
  const parts = [
    `${review.openTasks.length} open`,
    `${review.completedTasks.length} done`,
  ];
  if (review.memorySuggestions.length)
    parts.push(`${review.memorySuggestions.length} memories`);
  return parts.join(" / ");
}

function ordinalDay(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const last = day % 10;
  if (last === 1) return `${day}st`;
  if (last === 2) return `${day}nd`;
  if (last === 3) return `${day}rd`;
  return `${day}th`;
}

function formatWeekdayDate(value: string, includeYear: boolean): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  const year = date.getUTCFullYear();
  return `${weekday} ${ordinalDay(date.getUTCDate())} ${month}${includeYear ? ` ${year}` : ""}`;
}

function formatWeeklyReviewRange(review: WeeklyReviewView): string {
  if (!review.weekStart || !review.weekEnd) return review.weekLabel;
  const start = new Date(`${review.weekStart}T12:00:00Z`);
  const end = new Date(`${review.weekEnd}T12:00:00Z`);
  const sameYear =
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getUTCFullYear() === end.getUTCFullYear();
  return `${formatWeekdayDate(review.weekStart, !sameYear)} - ${formatWeekdayDate(review.weekEnd, true)}`;
}

function syncProjectTaskDetailDraft(task: MissionTask) {
  projectTaskDetailDraft.value = {
    title: task.title,
    description: task.description || "",
    status:
      task.status === "cancelled"
        ? "backlog"
        : (task.status as ProjectBoardStatus),
  };
}

function openProjectTaskDetail(task: MissionTask) {
  if (draggedProjectTaskId.value || projectTaskDetailSaving.value) return;
  selectedProjectTaskDetailId.value = task.id;
  projectTaskDetailError.value = "";
  syncProjectTaskDetailDraft(task);
  resetWeeklyReviewSelection(task);
}

function closeProjectTaskDetail(options: { force?: boolean } = {}) {
  if (
    (projectTaskDetailSaving.value || weeklyReviewSubmitting.value) &&
    !options.force
  )
    return;
  selectedProjectTaskDetailId.value = "";
  projectTaskDetailError.value = "";
  resetWeeklyReviewSelection(null);
}

function openProjectTaskComposer(status: ProjectBoardStatus) {
  if (projectTaskSaving.value) return;
  projectTaskComposerStatus.value = status;
  projectTaskDraft.value = "";
  projectTaskProjectId.value = selectedProjectDetail.value?.id || "";
  void nextTick(() => {
    if (selectedProjectDetail.value) {
      document
        .querySelector<HTMLInputElement>(".project-task-composer__input")
        ?.focus();
      return;
    }
    document
      .querySelector<HTMLSelectElement>(".project-task-composer__project")
      ?.focus();
  });
}

function cancelProjectTaskComposer() {
  if (projectTaskSaving.value) return;
  resetProjectTaskComposer();
}

async function addProjectTask(status: ProjectBoardStatus) {
  const title = projectTaskDraft.value.trim();
  const projectId =
    selectedProjectDetail.value?.id || projectTaskProjectId.value;
  if (!title || !projectId || projectTaskSaving.value) return;
  projectTaskSaving.value = true;
  projectTasksError.value = "";
  try {
    const response = await api.post<{ task: MissionTask }>(
      "/mission-control/tasks",
      {
        title,
        projectId,
        status,
      },
    );
    projectTasks.value = [response.task, ...projectTasks.value];
    resetProjectTaskComposer();
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not add task";
  } finally {
    projectTaskSaving.value = false;
  }
}

async function runProjectTaskLocally(task: MissionTask) {
  if (!isLocalProject(projectForTask(task)) || projectTaskLocalRunId.value)
    return;
  projectTaskLocalRunId.value = task.id;
  projectTasksError.value = "";
  try {
    const response = await api.post<{
      run: { id: string; status: string; promptSummary: string | null };
    }>(`/mission-control/tasks/${encodeURIComponent(task.id)}/local-run`, {});
    toastSuccess(
      response.run.status === "queued"
        ? "Local run queued"
        : "Local run requested",
    );
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not queue local run";
  } finally {
    projectTaskLocalRunId.value = "";
  }
}

async function saveProjectTaskDetail() {
  const task = selectedProjectTaskDetail.value;
  const title = projectTaskDetailDraft.value.title.trim();
  if (
    !task ||
    !title ||
    projectTaskDetailSaving.value ||
    selectedProjectTaskIsWeeklyReview.value
  )
    return;
  projectTaskDetailSaving.value = true;
  projectTaskDetailError.value = "";
  try {
    const response = await api.patch<{ task: MissionTask }>(
      `/mission-control/tasks/${encodeURIComponent(task.id)}`,
      {
        title,
        description: projectTaskDetailDraft.value.description.trim() || null,
        status: projectTaskDetailDraft.value.status,
      },
    );
    replaceProjectTask(response.task);
    syncProjectTaskDetailDraft(response.task);
    closeProjectTaskDetail({ force: true });
    toastSuccess("Task updated");
  } catch (e) {
    projectTaskDetailError.value =
      e instanceof ApiError ? e.message : "Could not update task";
  } finally {
    projectTaskDetailSaving.value = false;
  }
}

async function submitSelectedWeeklyReview() {
  const task = selectedProjectTaskDetail.value;
  const review = selectedProjectTaskWeeklyReview.value;
  if (!task || !review || weeklyReviewSubmitDisabled.value) return;
  weeklyReviewSubmitting.value = true;
  projectTaskDetailError.value = "";
  try {
    await api.post(
      `/mission-control/tasks/${encodeURIComponent(task.id)}/weekly-review/submit`,
      {
        tasks: review.openTasks.map((item) => ({
          id: item.id,
          action: weeklyReviewTaskActions.value[item.id] || null,
        })),
        memorySuggestions: review.memorySuggestions.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          memoryKind: item.memoryKind,
          duplicate: item.duplicate,
          pattern: item.pattern,
          note: item.note,
          checked: weeklyReviewMemoryIds.value.has(item.id),
        })),
        customMemory: weeklyReviewCustomMemory.value.trim() || null,
        reminders: review.reminders.map((item) => ({
          id: item.id,
          checked: weeklyReviewReminderIds.value.has(item.id),
          reschedule: "tomorrow",
        })),
      },
    );
    await Promise.all([loadProjectTasks(), loadMemoryAndSources()]);
    closeProjectTaskDetail({ force: true });
    toastSuccess("Weekly Review submitted");
  } catch (e) {
    projectTaskDetailError.value =
      e instanceof ApiError ? e.message : "Could not submit Weekly Review";
  } finally {
    weeklyReviewSubmitting.value = false;
  }
}

async function setProjectTaskStatus(
  task: MissionTask,
  status: MissionTask["status"],
) {
  if (task.status === status || projectTaskActionId.value) return;
  projectTaskActionId.value = task.id;
  projectTasksError.value = "";
  try {
    const response = await api.patch<{ task: MissionTask }>(
      `/mission-control/tasks/${encodeURIComponent(task.id)}`,
      { status },
    );
    replaceProjectTask(response.task);
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not update task";
  } finally {
    projectTaskActionId.value = "";
  }
}

function startProjectTaskDrag(event: DragEvent, task: MissionTask) {
  if (projectTaskActionId.value || task.status === "cancelled") {
    event.preventDefault();
    return;
  }
  draggedProjectTaskId.value = task.id;
  projectTaskDropStatus.value = task.status;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }
}

function endProjectTaskDrag() {
  draggedProjectTaskId.value = "";
  projectTaskDropStatus.value = "";
}

function handleProjectColumnDragOver(
  event: DragEvent,
  status: ProjectBoardStatus,
) {
  if (!draggedProjectTaskId.value) return;
  event.preventDefault();
  projectTaskDropStatus.value = status;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleProjectColumnDragLeave(
  event: DragEvent,
  status: ProjectBoardStatus,
) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget))
    return;
  if (projectTaskDropStatus.value === status) projectTaskDropStatus.value = "";
}

async function dropProjectTask(event: DragEvent, status: ProjectBoardStatus) {
  event.preventDefault();
  const taskId =
    draggedProjectTaskId.value ||
    event.dataTransfer?.getData("text/plain") ||
    "";
  endProjectTaskDrag();
  const task = projectTasks.value.find((item) => item.id === taskId);
  if (!task) return;
  await setProjectTaskStatus(task, status);
}

async function archiveProjectTask(task: MissionTask): Promise<boolean> {
  if (projectTaskActionId.value) return false;
  projectTaskActionId.value = task.id;
  projectTasksError.value = "";
  try {
    await api.delete(`/mission-control/tasks/${encodeURIComponent(task.id)}`);
    projectTasks.value = projectTasks.value.filter(
      (item) => item.id !== task.id,
    );
    if (selectedProjectTaskDetailId.value === task.id) {
      selectedProjectTaskDetailId.value = "";
    }
    return true;
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not archive task";
    return false;
  } finally {
    projectTaskActionId.value = "";
  }
}

async function archiveSelectedProjectTask() {
  const task = selectedProjectTaskDetail.value;
  if (!task || projectTaskDetailSaving.value) return;
  const archived = await archiveProjectTask(task);
  if (archived) closeProjectTaskDetail();
}

function replaceProjectTask(next: MissionTask) {
  const index = projectTasks.value.findIndex((item) => item.id === next.id);
  if (index >= 0) projectTasks.value.splice(index, 1, next);
  else projectTasks.value.unshift(next);
}

function appendUniqueTasks(
  current: MissionTask[],
  next: MissionTask[],
): MissionTask[] {
  const seen = new Set(current.map((task) => task.id));
  return [
    ...current,
    ...next.filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    }),
  ];
}

function missionTasksUrl(options: {
  archived?: boolean;
  projectId?: string;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams({
    limit: String(PROJECT_TASK_PAGE_SIZE),
  });
  if (options.archived) params.set("archived", "1");
  if (options.projectId) params.set("projectId", options.projectId);
  if (options.cursor) params.set("cursor", options.cursor);
  return `/mission-control/tasks?${params.toString()}`;
}

async function addMemory() {
  const body = memoryDraft.value.trim();
  if (!body) return;
  try {
    await api.post("/mission-control/memory", {
      body,
      memoryKind: "owner_note",
    });
    memoryDraft.value = "";
    await loadMemoryAndSources();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not save memory";
  }
}

async function approveMemory(item: MissionMemory) {
  memoryActionId.value = item.id;
  error.value = "";
  try {
    const response = await api.post<{ memory: MissionMemory }>(
      `/mission-control/memory/${encodeURIComponent(item.id)}/approve`,
      {},
    );
    replaceMemory(response.memory);
    toastSuccess("Memory approved");
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : "Could not approve memory";
  } finally {
    memoryActionId.value = "";
  }
}

async function forgetMemory(item: MissionMemory) {
  memoryActionId.value = item.id;
  error.value = "";
  try {
    await api.delete<{ ok: true }>(
      `/mission-control/memory/${encodeURIComponent(item.id)}`,
    );
    memory.value = memory.value.filter((entry) => entry.id !== item.id);
    toastSuccess("Memory forgotten");
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not forget memory";
  } finally {
    memoryActionId.value = "";
  }
}

function replaceMemory(next: MissionMemory) {
  const index = memory.value.findIndex((item) => item.id === next.id);
  if (index >= 0) memory.value.splice(index, 1, next);
  else memory.value.unshift(next);
}

async function addSource() {
  const label = sourceDraft.value.trim();
  if (!label) return;
  try {
    await api.post("/mission-control/context-sources", {
      label,
      sourceKind: label.startsWith("http") ? "url" : "provider",
      sourceRef: label.startsWith("http") ? label : null,
    });
    sourceDraft.value = "";
    await loadMemoryAndSources();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not save source";
  }
}

function projectName(projectId: string | null): string {
  if (!projectId) return "Personal";
  return (
    projects.value.find((project) => project.id === projectId)?.name ||
    "Personal"
  );
}

function projectTaskComposerProjectLabel(project: MissionProject): string {
  return isLocalProject(project) ? `${project.name} (Local)` : project.name;
}

function projectForTask(task: MissionTask): MissionProject | null {
  if (!task.projectId) return null;
  return projects.value.find((project) => project.id === task.projectId) || null;
}

function isLocalProject(project: MissionProject | null | undefined): boolean {
  return project?.sourceKind === "daemon_repo";
}

function localProjectPath(project: MissionProject | null | undefined): string {
  const value = project?.metadata?.localPath;
  return typeof value === "string" ? value : "";
}

function emptyAccountsForm(type: FinancialEntryType): AccountsEntryForm {
  return {
    date: todayKey(),
    description: "",
    categoryId: "",
    amount: "",
    currency: "USD",
    status: type === "income" ? "paid" : "pending",
    notes: "",
  };
}

function normalizeAccountsAmountInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function accountStatusLabel(status: FinancialEntryStatus): string {
  if (status === "needs_review") return "Needs review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function accountSourceLabel(source: FinancialEntrySource): string {
  if (source === "email_triage") return "Email triage";
  if (source === "csv_import") return "CSV import";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format((cents || 0) / 100);
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function memoryKindLabel(kind: string): string {
  return kind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function memoryStatusLabel(status: MissionMemory["reviewStatus"]): string {
  if (status === "needs_review") return "Needs review";
  if (status === "archived") return "Archived";
  return "Active";
}

function memorySourceLabel(item: MissionMemory): string {
  if (item.sourceKind === "agent") {
    return item.sourceRef
      ? `Agent suggestion: ${item.sourceRef}`
      : "Agent suggestion";
  }
  if (item.sourceKind === "daemon")
    return item.sourceRef ? `Daemon: ${item.sourceRef}` : "Daemon";
  if (item.sourceKind === "import")
    return item.sourceRef ? `Import: ${item.sourceRef}` : "Import";
  return item.sourceRef ? `Manual: ${item.sourceRef}` : "Manual";
}

function memoryScopeLabel(item: MissionMemory): string {
  return item.scopeId
    ? `${memoryKindLabel(item.scopeKind)}: ${item.scopeId}`
    : memoryKindLabel(item.scopeKind);
}

function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayKey(): string {
  const date = new Date();
  return dateToKey(date);
}

function sectionQueryValue(section: MissionSection): string {
  return section;
}

function isRemovedJournalSection(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return (
    raw === "today" ||
    raw === "journal" ||
    raw === "archive" ||
    raw === "journal-archive"
  );
}

function normalizeSection(value: unknown): MissionSection {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "approvals" || raw === "runs") return "activity";
  return sectionIds.includes(raw as MissionSection)
    ? (raw as MissionSection)
    : "projects";
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && projectPickerOpen.value) {
    projectPickerOpen.value = false;
    return;
  }
  if (event.key === "Escape" && projectModalOpen.value) {
    closeProjectModal();
    return;
  }
  if (event.key === "Escape" && accountsModalOpen.value) {
    closeAccountsModal();
    return;
  }
  if (event.key === "Escape") settingsMenuOpen.value = false;
}

function handleWindowClick() {
  projectPickerOpen.value = false;
}

watch(
  () => route.query.section,
  (section) => {
    if (isRemovedJournalSection(section)) {
      void router.replace("/journal");
      return;
    }
    activeSection.value = normalizeSection(section);
  },
);

watch(activeSection, (section) => {
  if (section === "projects") {
    void loadProjectTasks();
    void loadLocalExecutorStatus();
  }
  if (section === "activity") void loadActivityReview();
  if (section === "memory" || section === "sources") void loadMemoryAndSources();
  if (section === "accounts") void loadAccounts();
});

watch(selectedProjectDetailId, (next, previous) => {
  if (next === previous) return;
  if (activeSection.value === "projects") void loadProjectTasks(next);
});

onMounted(() => {
  if (isRemovedJournalSection(route.query.section)) {
    void router.replace("/journal");
    return;
  }
  void loadMissionControlWorkspace();
  void loadPluginCapabilities();
  if (activeSection.value === "projects") {
    void loadProjectTasks();
    void loadLocalExecutorStatus();
  }
  if (activeSection.value === "activity") void loadActivityReview();
  if (activeSection.value === "memory" || activeSection.value === "sources")
    void loadMemoryAndSources();
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("click", handleWindowClick);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener("click", handleWindowClick);
});
</script>

<template>
  <main class="mission-control">
    <header class="mission-control__topbar">
      <div
        v-if="activeSection === 'projects'"
        class="mission-control__project-switcher"
        aria-label="Selected project"
        @click.stop
      >
        <button
          type="button"
          class="mission-control__project-label"
          :aria-expanded="projectPickerOpen"
          aria-haspopup="dialog"
          aria-label="Choose project"
          @click="toggleProjectPicker"
        >
          <strong>{{ selectedProjectDetailLabel }}</strong>
          <span v-if="selectedProjectIsLocal" class="local-project-badge"
            >Local</span
          >
          <UiIcon
            name="ChevronDown"
            :size="15"
            class="mission-control__project-caret"
          />
        </button>
        <div
          v-if="projectPickerOpen"
          class="project-picker-popover"
          role="dialog"
          aria-label="Choose project"
        >
          <button
            type="button"
            class="project-picker-popover__item"
            :class="{ 'is-active': !selectedProjectDetail }"
            @click="selectProjectDetail('')"
          >
            <span>All</span>
          </button>
          <button
            v-for="project in projects"
            :key="project.id"
            type="button"
            class="project-picker-popover__item"
            :class="{ 'is-active': selectedProjectDetail?.id === project.id }"
            @click="selectProjectDetail(project.id)"
          >
            <span>{{ project.name }}</span>
            <span v-if="isLocalProject(project)" class="local-project-badge"
              >Local</span
            >
          </button>
          <div
            v-if="projects.length === 0"
            class="project-picker-popover__empty"
          >
            No projects yet. Personal tasks will still appear in All.
          </div>
          <Button
            color="primary"
            shape="soft"
            size="compact"
            class="project-picker-popover__add"
            type="button"
            @click="openProjectModal"
          >
            <UiIcon name="Plus" :size="15" />
            Add project
          </Button>
        </div>
      </div>
      <div v-if="activeSection !== 'projects'" class="mission-control__section-title">
        {{ sectionLabels[activeSection] }}
      </div>

      <div class="mission-control__topbar-trailing">
        <button
          v-if="activeSection === 'projects' && selectedProjectDetail"
          type="button"
          class="mission-control__assistant-link"
          @click="openAssistantForSelectedProject"
        >
          <UiIcon name="MessagesSquare" :size="15" aria-hidden="true" />
          <span>Ask assistant</span>
        </button>
        <Button
          v-if="primarySections.length > 1"
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          :aria-label="mobilePrimarySectionCycleLabel"
          :title="mobilePrimarySectionCycleLabel"
          @click="cyclePrimarySection"
        >
          <UiIcon :name="mobilePrimarySectionIcon" :size="18" />
        </Button>
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          to="/mission-control/wheel-of-life"
          aria-label="Open Wheel of Life"
          title="Open Wheel of Life"
        >
          <UiIcon name="ShipWheel" :size="18" />
        </Button>

        <div class="settings-menu" @click.stop>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            :active="settingsMenuOpen || settingsSectionActive"
            aria-label="Mission Control settings"
            :aria-expanded="settingsMenuOpen"
            aria-haspopup="menu"
            @click="
              settingsMenuOpen = !settingsMenuOpen;
              projectPickerOpen = false;
            "
          >
            <UiIcon name="Settings" :size="18" />
          </Button>
          <div
            v-if="settingsMenuOpen"
            class="settings-menu__dropdown"
            role="menu"
          >
            <button
              v-for="section in settingsSections"
              :key="section"
              type="button"
              class="settings-menu__item"
              :class="{ 'is-active': activeSection === section }"
              role="menuitem"
              @click="setSection(section)"
            >
              <span>{{ sectionLabels[section] }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <p v-if="error" class="mission-control__message is-error">{{ error }}</p>

    <section v-show="activeSection === 'projects'" class="mission-page">
      <div class="projects-workspace">
          <div v-if="selectedProjectIsLocal" class="local-project-summary">
            <div>
              <strong>Local project</strong>
              <span>{{ localProjectPath(selectedProjectDetail) }}</span>
            </div>
            <div class="local-project-summary__runner">
              <strong>{{ localExecutorRunnerLabel }}</strong>
              <span>{{ localExecutorRunnerDetail }}</span>
            </div>
          </div>

          <p v-if="projectTasksError" class="mission-control__message is-error">
            {{ projectTasksError }}
          </p>

          <div v-if="projectTasksLoading" class="empty-row">
            Loading project tasks...
          </div>
          <template v-else>
            <div class="project-board" aria-label="Project board">
              <section
                v-for="column in projectBoardColumns"
                :key="column.id"
                class="project-board__column"
                :class="{
                  'is-drop-target': projectTaskDropStatus === column.id,
                }"
                :aria-label="column.label"
                @dragover="handleProjectColumnDragOver($event, column.id)"
                @dragleave="handleProjectColumnDragLeave($event, column.id)"
                @drop="dropProjectTask($event, column.id)"
              >
                <div class="project-board__column-header">
                  <h2>{{ column.label }}</h2>
                  <span>{{ column.tasks.length }}</span>
                </div>

                <article
                  v-for="task in column.tasks"
                  :key="task.id"
                  class="project-task-card"
                  :class="{
                    'is-dragging': draggedProjectTaskId === task.id,
                    'is-updating':
                      projectTaskActionId === task.id ||
                      projectTaskLocalRunId === task.id,
                  }"
                  role="button"
                  tabindex="0"
                  draggable="true"
                  :aria-label="`Open details for ${task.title}`"
                  @click="openProjectTaskDetail(task)"
                  @keydown.enter.prevent="openProjectTaskDetail(task)"
                  @keydown.space.prevent="openProjectTaskDetail(task)"
                  @dragstart="startProjectTaskDrag($event, task)"
                  @dragend="endProjectTaskDrag"
                >
                  <p>{{ task.title }}</p>
                  <div class="project-task-card__meta">
                    <span
                      v-if="weeklyReviewMetadata(task)"
                      class="weekly-review-badge"
                      >Weekly Review</span
                    >
                    <span class="project-task-card__project">
                      <img
                        v-if="projectForTask(task)?.icon"
                        :src="projectForTask(task)?.icon || ''"
                        alt=""
                      />
                      <span>{{ projectName(task.projectId) }}</span>
                    </span>
                    <span
                      v-if="isLocalProject(projectForTask(task))"
                      class="local-project-badge"
                      >Local</span
                    >
                    <span v-if="task.dueAt || task.scheduledFor">
                      {{ formatShortDate(task.dueAt || task.scheduledFor) }}
                    </span>
                  </div>
                  <span
                    v-if="weeklyReviewMetadata(task)"
                    class="project-task-card__review-counts"
                  >
                    {{ weeklyReviewCardLabel(task) }}
                  </span>
                  <div class="project-task-card__actions">
                    <button
                      v-if="isLocalProject(projectForTask(task))"
                      type="button"
                      class="project-task-card__run"
                      :disabled="Boolean(projectTaskLocalRunId)"
                      @click.stop="runProjectTaskLocally(task)"
                    >
                      <UiIcon name="Play" :size="14" />
                      {{
                        projectTaskLocalRunId === task.id
                          ? "Queuing..."
                          : "Run locally"
                      }}
                    </button>
                    <Button color="ghost" shape="soft" size="compact" icon-only
                      type="button"
                      aria-label="Archive task"
                      :disabled="
                        projectTaskActionId === task.id ||
                        projectTaskLocalRunId === task.id
                      "
                      @click.stop="archiveProjectTask(task)"
                    >
                      <UiIcon name="X" :size="15" />
                    </Button>
                  </div>
                </article>
                <form
                  v-if="projectTaskComposerStatus === column.id"
                  class="project-task-composer"
                  @submit.prevent="addProjectTask(column.id)"
                >
                  <select
                    v-if="!selectedProjectDetail"
                    v-model="projectTaskProjectId"
                    class="project-task-composer__project"
                    aria-label="Task project"
                    @keydown.esc.prevent="cancelProjectTaskComposer"
                  >
                    <option value="">Choose project</option>
                    <option
                      v-for="project in projects"
                      :key="project.id"
                      :value="project.id"
                    >
                      {{ projectTaskComposerProjectLabel(project) }}
                    </option>
                  </select>
                  <input
                    v-model="projectTaskDraft"
                    class="project-task-composer__input"
                    type="text"
                    placeholder="Task name"
                    autocomplete="off"
                    @keydown.esc.prevent="cancelProjectTaskComposer"
                  />
                  <div class="project-task-composer__actions">
                    <Button color="ghost" shape="soft" size="compact" icon-only
                      type="button"
                      aria-label="Cancel task"
                      :disabled="projectTaskSaving"
                      @click="cancelProjectTaskComposer"
                    >
                      <UiIcon name="X" :size="15" />
                    </Button>
                    <Button color="accent" shape="soft" size="compact" icon-only type="submit"
                      aria-label="Add task"
                      :disabled="projectTaskCreateDisabled"
                    >
                      <UiIcon name="Plus" :size="16" />
                    </Button>
                  </div>
                </form>
                <button
                  v-else
                  type="button"
                  class="project-column-add"
                  :disabled="projectTaskSaving"
                  @click="openProjectTaskComposer(column.id)"
                >
                  <UiIcon name="Plus" :size="15" />
                  Add task
                </button>
              </section>
            </div>

            <button
              v-if="projectTasksNextCursor"
              type="button"
              class="load-more-row load-more-row--center"
              :disabled="projectTasksLoadingMore"
              @click="loadMoreProjectTasks"
            >
              <UiIcon name="ChevronDown" :size="15" />
              {{
                projectTasksLoadingMore
                  ? "Loading more tasks..."
                  : "Load more tasks"
              }}
            </button>
          </template>
      </div>
    </section>

    <section v-show="activeSection === 'accounts'" class="mission-page">
      <div v-if="!accountsEnabled" class="simple-sheet">
        <div class="simple-sheet__header">
          <div>
            <h1>Accounts</h1>
            <p>
              Enable the Accounts plugin to add ledger context for invoice and
              receipt triage.
            </p>
          </div>
        </div>
        <Button color="primary" shape="soft" size="compact"
          to="/account?section=plugins&blocked=me3.accounts"
        >
          Open plugin settings
        </Button>
      </div>

      <div v-else class="accounts-workspace">
        <div class="accounts-toolbar">
          <div
            class="accounts-tabs"
            role="tablist"
            aria-label="Account entry type"
          >
            <button
              type="button"
              class="mission-control__section-tab"
              :class="{ 'is-active': accountsType === 'expense' }"
              @click="setAccountsType('expense')"
            >
              Expenses
            </button>
            <button
              type="button"
              class="mission-control__section-tab"
              :class="{ 'is-active': accountsType === 'income' }"
              @click="setAccountsType('income')"
            >
              Income
            </button>
          </div>
          <div class="accounts-toolbar__actions">
            <Button color="outline" shape="soft" size="compact"
              type="button"
              @click="chooseAccountsImportFile"
            >
              <UiIcon name="Upload" :size="13" />
              {{ accountsImporting ? "Importing..." : "Import CSV" }}
            </Button>
            <Button color="outline" shape="soft" size="compact"
              type="button"
              @click="exportAccountsCsv"
            >
              <UiIcon name="Download" :size="13" />
              Export CSV
            </Button>
            <Button color="primary" shape="soft" size="compact"
              type="button"
              :disabled="accountsSyncing || !accountsStripeConfigured"
              @click="syncAccountsStripe"
            >
              <UiIcon name="RefreshCw" :size="13" />
              {{ accountsSyncing ? "Syncing..." : "Sync Stripe" }}
            </Button>
            <Button color="primary" shape="soft" size="compact"
              type="button"
              @click="openAccountsModal"
            >
              <UiIcon name="Plus" :size="13" />
              Add entry
            </Button>
            <input
              ref="accountsImportInput"
              type="file"
              accept=".csv,text/csv"
              class="visually-hidden"
              @change="importAccountsCsv"
            />
          </div>
        </div>

        <div class="accounts-summary">
          <div>
            <span>This month</span>
            <strong>{{
              formatMoney(
                accountsStats?.thisMonthCents || 0,
                accountsForm.currency,
              )
            }}</strong>
          </div>
          <div>
            <span>Last month</span>
            <strong>{{
              formatMoney(
                accountsStats?.lastMonthCents || 0,
                accountsForm.currency,
              )
            }}</strong>
          </div>
          <div>
            <span>Stripe</span>
            <strong>{{
              accountsStripeConfigured
                ? accountsStripeStatus || "Configured"
                : "Not configured"
            }}</strong>
          </div>
        </div>

        <div class="accounts-filters">
          <input
            v-model="accountsSearch"
            type="search"
            placeholder="Search accounts"
            aria-label="Search accounts"
            @keydown.enter.prevent="applyAccountsFilters"
          />
          <select
            v-model="accountsStatusFilter"
            aria-label="Filter by status"
            @change="applyAccountsFilters"
          >
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="needs_review">Needs review</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            v-model="accountsSourceFilter"
            aria-label="Filter by source"
            @change="applyAccountsFilters"
          >
            <option value="">Any source</option>
            <option value="manual">Manual</option>
            <option value="csv_import">CSV import</option>
            <option value="stripe">Stripe</option>
            <option value="email_triage">Email triage</option>
          </select>
          <Button color="outline" shape="soft" size="compact"
            type="button"
            @click="applyAccountsFilters"
          >
            Search
          </Button>
        </div>

        <p v-if="accountsError" class="mission-control__message is-error">
          {{ accountsError }}
        </p>
        <p v-else-if="accountsMessage" class="mission-control__message">
          {{ accountsMessage }}
        </p>

        <div class="accounts-table" aria-label="Payment log">
          <div class="accounts-table__head">
            <span>Date</span>
            <span>Description</span>
            <span>Category</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Source</span>
            <span></span>
          </div>
          <div v-if="accountsLoading" class="empty-row">
            Loading accounts...
          </div>
          <div v-else-if="accountsEntries.length === 0" class="empty-row">
            No {{ accountsType }} entries yet.
          </div>
          <template v-else>
            <article
              v-for="entry in accountsEntries"
              :key="entry.id"
              class="accounts-table__row"
            >
              <span>{{ formatShortDate(entry.date) }}</span>
              <strong>{{ entry.description }}</strong>
              <span>{{ entry.categoryName || "Uncategorized" }}</span>
              <span>{{ formatMoney(entry.amountCents, entry.currency) }}</span>
              <span class="status-badge">{{
                accountStatusLabel(entry.status)
              }}</span>
              <span>{{ accountSourceLabel(entry.source) }}</span>
              <Button color="ghost" shape="soft" size="compact" icon-only
                type="button"
                aria-label="Delete entry"
                @click="deleteAccountEntry(entry)"
              >
                <UiIcon name="Trash2" :size="15" />
              </Button>
            </article>
          </template>
        </div>

        <div class="accounts-pagination">
          <span>{{ accountsEntryCountLabel }} - page {{ accountsPage }}</span>
          <div>
            <Button color="ghost" shape="soft" size="compact" icon-only
              type="button"
              :disabled="!accountsHasPrevious"
              aria-label="Previous page"
              @click="pageAccounts(-1)"
            >
              <UiIcon name="ChevronLeft" :size="18" />
            </Button>
            <Button color="ghost" shape="soft" size="compact" icon-only
              type="button"
              :disabled="!accountsHasNext"
              aria-label="Next page"
              @click="pageAccounts(1)"
            >
              <UiIcon name="ChevronRight" :size="18" />
            </Button>
          </div>
        </div>
      </div>
    </section>

    <section v-show="activeSection === 'activity'" class="mission-page">
      <div class="simple-sheet simple-sheet--wide">
        <div class="simple-sheet__header">
          <div>
            <h1>Activity</h1>
            <p>Approvals, runs, and Mission Control updates.</p>
          </div>
          <div class="activity-header__actions">
            <Button color="danger" shape="soft" size="compact"
              type="button"
              :disabled="activityItems.length === 0 || clearingActivity"
              @click="clearActivity"
            >
              {{ clearingActivity ? "Clearing" : "Clear activity" }}
            </Button>
            <span>{{ activityItems.length }}</span>
          </div>
        </div>
        <div v-if="activityItems.length === 0" class="empty-row">
          No activity yet.
        </div>
        <article
          v-for="item in activityItems"
          :key="item.id"
          class="detail-row activity-row"
        >
          <div>
            <span class="activity-row__kind">{{ item.kind }}</span>
            <h2>{{ item.title }}</h2>
            <p>{{ item.summary || "No summary yet" }}</p>
          </div>
          <div class="detail-row__aside">
            <span v-if="item.status" class="status-badge">{{
              item.status
            }}</span>
            <span>{{ formatDateTime(item.createdAt) }}</span>
            <div
              v-if="item.canCancelLocalRun || item.canRetryLocalRun"
              class="activity-row__actions"
            >
              <Button color="outline" shape="soft" size="compact"
                v-if="item.canRetryLocalRun"
                type="button"
                :disabled="
                  Boolean(
                    item.localExecutorRunId &&
                      localRunActionId === `retry:${item.localExecutorRunId}`,
                  ) || Boolean(localRunActionId)
                "
                @click="retryLocalExecutorRun(item)"
              >
                <UiIcon name="RefreshCw" :size="14" />
                {{
                  item.localExecutorRunId &&
                  localRunActionId === `retry:${item.localExecutorRunId}`
                    ? "Queuing"
                    : "Retry"
                }}
              </Button>
              <Button color="danger" shape="soft" size="compact"
                v-if="item.canCancelLocalRun"
                type="button"
                :disabled="
                  Boolean(
                    item.localExecutorRunId &&
                      localRunActionId === `cancel:${item.localExecutorRunId}`,
                  ) || Boolean(localRunActionId)
                "
                @click="cancelLocalExecutorRun(item)"
              >
                <UiIcon name="X" :size="14" />
                {{
                  item.localExecutorRunId &&
                  localRunActionId === `cancel:${item.localExecutorRunId}`
                    ? "Cancelling"
                    : "Cancel"
                }}
              </Button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-show="activeSection === 'memory'" class="mission-page">
      <div class="simple-sheet">
        <div class="simple-sheet__header">
          <h1>Memory</h1>
          <span>{{ memory.length }}</span>
        </div>
        <form class="inline-form" @submit.prevent="addMemory">
          <input
            v-model="memoryDraft"
            type="text"
            placeholder="Private memory"
          />
          <Button color="accent" shape="soft" size="compact" icon-only type="submit" aria-label="Add memory">
            <UiIcon name="Plus" :size="18" />
          </Button>
        </form>
        <div v-if="memory.length === 0" class="empty-row">
          No private memory yet.
        </div>
        <article
          v-for="item in memory"
          :key="item.id"
          class="detail-row memory-row"
          :class="{
            'memory-row--pending': item.reviewStatus === 'needs_review',
          }"
        >
          <div>
            <div class="memory-row__heading">
              <h2>{{ item.title || memoryKindLabel(item.memoryKind) }}</h2>
              <span
                class="status-badge"
                :class="`status-badge--${item.reviewStatus}`"
              >
                {{ memoryStatusLabel(item.reviewStatus) }}
              </span>
            </div>
            <p>{{ item.body }}</p>
            <div class="capture-item__meta">
              <span>{{ memorySourceLabel(item) }}</span>
              <span>{{ memoryScopeLabel(item) }}</span>
              <span>{{ formatDateTime(item.updatedAt) }}</span>
            </div>
          </div>
          <div class="detail-row__aside memory-row__actions">
            <Button color="primary" shape="soft" size="compact"
              v-if="item.reviewStatus === 'needs_review'"
              type="button"
              :disabled="memoryActionId === item.id"
              @click="approveMemory(item)"
            >
              <UiIcon name="Check" :size="14" />
              Approve
            </Button>
            <Button color="danger" shape="soft" size="compact"
              type="button"
              :disabled="memoryActionId === item.id"
              @click="forgetMemory(item)"
            >
              <UiIcon name="Trash2" :size="14" />
              Forget
            </Button>
          </div>
        </article>
      </div>
    </section>

    <section v-show="activeSection === 'sources'" class="mission-page">
      <div class="simple-sheet">
        <div class="simple-sheet__header">
          <h1>Sources</h1>
          <span>{{ sources.length }}</span>
        </div>
        <form class="inline-form" @submit.prevent="addSource">
          <input
            v-model="sourceDraft"
            type="text"
            placeholder="Source name or URL"
          />
          <Button color="accent" shape="soft" size="compact" icon-only type="submit" aria-label="Add source">
            <UiIcon name="Plus" :size="18" />
          </Button>
        </form>
        <article v-for="source in sources" :key="source.id" class="detail-row">
          <div>
            <h2>{{ source.label }}</h2>
            <p>
              {{ source.description || source.sourceRef || source.sourceKind }}
            </p>
          </div>
          <span class="status-badge">{{ source.status }}</span>
        </article>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="projectModalOpen"
        class="mission-modal"
        role="presentation"
        @click.self="closeProjectModal"
      >
        <form
          class="mission-modal__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-modal-title"
          @submit.prevent="addProject"
        >
          <div class="mission-modal__header">
            <h2 id="project-modal-title">Add project</h2>
            <Button color="ghost" shape="soft" size="compact" icon-only
              type="button"
              aria-label="Close"
              @click="closeProjectModal"
            >
              <UiIcon name="X" :size="18" />
            </Button>
          </div>

          <label class="field">
            <span>Title</span>
            <input
              v-model="projectTitle"
              type="text"
              autocomplete="off"
              autofocus
            />
          </label>

          <label class="field">
            <span>Description</span>
            <textarea v-model="projectDescription" rows="4" />
          </label>

          <label class="field">
            <span>Type</span>
            <select v-model="projectType">
              <option value="standard">Standard</option>
              <option value="local">Local</option>
            </select>
          </label>

          <template v-if="projectType === 'local'">
            <label class="field">
              <span>Local folder path</span>
              <input
                v-model="projectLocalPath"
                type="text"
                autocomplete="off"
                placeholder="e.g. /Users/yourusername/Projects/projectName"
              />
            </label>

            <p class="project-modal__hint">
              Provider setup lives on the local computer. Use the Local
              Executor plugin Configure button to create or edit
              <code>~/.me3/local-executor/config.json</code>.
            </p>
          </template>

          <label class="field">
            <span>Logo</span>
            <input type="file" accept="image/*" @change="chooseProjectLogo" />
          </label>

          <div v-if="projectLogoData" class="project-logo-preview">
            <img :src="projectLogoData" alt="" />
            <span>{{ projectLogoName }}</span>
            <Button color="outline" shape="soft" size="compact"
              type="button"
              @click="removeProjectLogo"
            >
              Remove
            </Button>
          </div>

          <p v-if="projectError" class="mission-modal__error">
            {{ projectError }}
          </p>

          <div class="mission-modal__actions">
            <Button color="outline" shape="soft" size="compact"
              type="button"
              @click="closeProjectModal"
            >
              Cancel
            </Button>
            <Button color="primary" shape="soft" size="compact"
              type="submit"
              :disabled="projectCreateDisabled"
            >
              {{ projectSaving ? "Adding..." : "Add project" }}
            </Button>
          </div>
        </form>
      </div>

      <div
        v-if="selectedProjectTaskDetail"
        class="mission-modal"
        role="presentation"
        @click.self="closeProjectTaskDetail()"
      >
        <form
          class="mission-modal__dialog task-detail-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-detail-modal-title"
          @submit.prevent="
            selectedProjectTaskIsWeeklyReview
              ? submitSelectedWeeklyReview()
              : saveProjectTaskDetail()
          "
        >
          <div class="mission-modal__header">
            <h2 id="task-detail-modal-title">
              {{
                selectedProjectTaskIsWeeklyReview
                  ? "Weekly Review"
                  : "Task details"
              }}
            </h2>
            <Button color="ghost" shape="soft" size="compact" icon-only
              type="button"
              aria-label="Close"
              @click="closeProjectTaskDetail()"
            >
              <UiIcon name="X" :size="18" />
            </Button>
          </div>

          <div class="task-detail-modal__context">
            <span>{{ projectName(selectedProjectTaskDetail.projectId) }}</span>
            <span
              v-if="selectedProjectTaskWeeklyReview"
              class="weekly-review-badge"
              >{{ formatWeeklyReviewRange(selectedProjectTaskWeeklyReview) }}</span
            >
            <span
              v-if="isLocalProject(selectedProjectTaskDetailProject)"
              class="local-project-badge"
              >Local</span
            >
            <span v-if="selectedProjectTaskDetail.dueAt">
              {{ formatShortDate(selectedProjectTaskDetail.dueAt) }}
            </span>
          </div>

          <div
            v-if="selectedProjectTaskLatestRun"
            class="task-detail-modal__run"
          >
            <div>
              <strong>Local run</strong>
              <span class="status-badge">{{
                selectedProjectTaskLatestRun.status
              }}</span>
            </div>
            <p>{{ selectedProjectTaskLatestRunSummary }}</p>
          </div>

          <template v-if="selectedProjectTaskWeeklyReview">
            <div class="weekly-review-panel">
              <p class="weekly-review-panel__summary">
                {{ selectedProjectTaskWeeklyReview.summary }}
              </p>

              <section class="weekly-review-panel__section">
                <div class="weekly-review-panel__section-header">
                  <h3>Open task cleanup</h3>
                  <span>{{ selectedProjectTaskWeeklyReview.openTasks.length }}</span>
                </div>
                <p class="weekly-review-panel__hint">
                  Archive stale tasks or mark finished work done. Anything untouched stays on the board.
                </p>
                <div
                  v-if="selectedProjectTaskWeeklyReview.openTasks.length"
                  class="weekly-review-task-list"
                >
                  <div
                    v-for="item in selectedProjectTaskWeeklyReview.openTasks"
                    :key="item.id"
                    class="weekly-review-task-row"
                  >
                    <div class="weekly-review-task-row__body">
                      <strong>{{ item.title }}</strong>
                      <small>
                        {{ projectName(item.projectId) }}
                        <template v-if="item.dueAt">
                          / due {{ formatShortDate(item.dueAt) }}
                        </template>
                      </small>
                    </div>
                    <div
                      class="weekly-review-task-row__actions"
                      aria-label="Task cleanup action"
                    >
                      <Button
                        color="outline"
                        shape="soft"
                        size="compact"
                        type="button"
                        :active="weeklyReviewTaskActions[item.id] === 'archive'"
                        :disabled="
                          weeklyReviewSubmitting ||
                          Boolean(selectedProjectTaskWeeklyReview.submittedAt)
                        "
                        @click="setWeeklyReviewTaskAction(item.id, 'archive')"
                      >
                        Archive
                      </Button>
                      <Button
                        color="outline"
                        shape="soft"
                        size="compact"
                        type="button"
                        :active="weeklyReviewTaskActions[item.id] === 'done'"
                        :disabled="
                          weeklyReviewSubmitting ||
                          Boolean(selectedProjectTaskWeeklyReview.submittedAt)
                        "
                        @click="setWeeklyReviewTaskAction(item.id, 'done')"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
                <p v-else class="weekly-review-panel__empty">
                  No open tasks to clean up.
                </p>
              </section>

              <section class="weekly-review-panel__section">
                <div class="weekly-review-panel__section-header">
                  <h3>Important memory</h3>
                  <span v-if="selectedProjectTaskWeeklyReview.memorySuggestions.length">
                    {{ weeklyReviewMemoryIds.size }} /
                    {{
                      selectedProjectTaskWeeklyReview.memorySuggestions.length
                    }}
                  </span>
                </div>
                <label class="weekly-review-memory-field">
                  <span>Add one important fact or data point from this week</span>
                  <textarea
                    v-model="weeklyReviewCustomMemory"
                    rows="3"
                    placeholder="e.g. A decision, preference, recurring pattern, or important context worth remembering"
                    :disabled="
                      weeklyReviewSubmitting ||
                      Boolean(selectedProjectTaskWeeklyReview.submittedAt)
                    "
                  />
                </label>
                <div
                  v-if="selectedProjectTaskWeeklyReview.memorySuggestions.length"
                  class="weekly-review-checklist"
                >
                  <label
                    v-for="item in selectedProjectTaskWeeklyReview.memorySuggestions"
                    :key="item.id"
                    class="weekly-review-check weekly-review-check--memory"
                  >
                    <input
                      type="checkbox"
                      :checked="weeklyReviewMemoryIds.has(item.id)"
                      :disabled="
                        weeklyReviewSubmitting ||
                        Boolean(selectedProjectTaskWeeklyReview.submittedAt)
                      "
                      @change="toggleWeeklyReviewMemory(item.id)"
                    />
                    <span>
                      <strong>{{ item.title }}</strong>
                      <small>{{ item.body }}</small>
                    </span>
                  </label>
                </div>
                <p v-else class="weekly-review-panel__empty">
                  No automatic memory suggestions met the stricter bar this week.
                </p>
              </section>

              <section
                v-if="selectedProjectTaskWeeklyReview.reminders.length"
                class="weekly-review-panel__section"
              >
                <div class="weekly-review-panel__section-header">
                  <h3>Reminders</h3>
                  <span>
                    {{ weeklyReviewReminderIds.size }} /
                    {{ selectedProjectTaskWeeklyReview.reminders.length }}
                    reschedule
                  </span>
                </div>
                <div class="weekly-review-checklist">
                  <label
                    v-for="item in selectedProjectTaskWeeklyReview.reminders"
                    :key="item.id"
                    class="weekly-review-check"
                  >
                    <input
                      type="checkbox"
                      :checked="weeklyReviewReminderIds.has(item.id)"
                      :disabled="
                        weeklyReviewSubmitting ||
                        Boolean(selectedProjectTaskWeeklyReview.submittedAt)
                      "
                      @change="toggleWeeklyReviewReminder(item.id)"
                    />
                    <span>
                      <strong>{{ item.title }}</strong>
                      <small>
                        {{ item.remindAt ? formatShortDate(item.remindAt) : "Pending" }}
                        / reschedule for tomorrow
                      </small>
                    </span>
                  </label>
                </div>
              </section>

              <section
                v-if="selectedProjectTaskWeeklyReview.completedTasks.length"
                class="weekly-review-panel__section"
              >
                <button
                  type="button"
                  class="weekly-review-collapse"
                  @click="
                    weeklyReviewCompletedOpen = !weeklyReviewCompletedOpen
                  "
                >
                  <span>
                    Completed this week
                    ({{ selectedProjectTaskWeeklyReview.completedTasks.length }})
                  </span>
                  <UiIcon
                    :name="
                      weeklyReviewCompletedOpen
                        ? 'ChevronUp'
                        : 'ChevronDown'
                    "
                    :size="15"
                  />
                </button>
                <ul
                  v-if="weeklyReviewCompletedOpen"
                  class="weekly-review-list"
                >
                  <li
                    v-for="item in selectedProjectTaskWeeklyReview.completedTasks"
                    :key="item.id"
                  >
                    <strong>{{ item.title }}</strong>
                    <span>{{ projectName(item.projectId) }}</span>
                  </li>
                </ul>
              </section>

              <p
                v-if="selectedProjectTaskWeeklyReview.submittedAt"
                class="weekly-review-panel__done"
              >
                Submitted {{ formatDateTime(selectedProjectTaskWeeklyReview.submittedAt) }}
              </p>
            </div>
          </template>

          <template v-else>
            <label class="field">
              <span>Title</span>
              <input
                v-model="projectTaskDetailDraft.title"
                type="text"
                autocomplete="off"
                autofocus
              />
            </label>

            <label class="field">
              <span>Status</span>
              <select v-model="projectTaskDetailDraft.status">
                <option
                  v-for="status in projectBoardStatuses"
                  :key="status.id"
                  :value="status.id"
                >
                  {{ status.label }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>Notes</span>
              <textarea
                v-model="projectTaskDetailDraft.description"
                rows="5"
                placeholder="Add detail for the runner or reviewer"
              />
            </label>
          </template>

          <p v-if="projectTaskDetailError" class="mission-modal__error">
            {{ projectTaskDetailError }}
          </p>

          <div class="mission-modal__actions task-detail-modal__actions">
            <Button color="danger" shape="soft" size="compact"
              type="button"
              :disabled="
                projectTaskDetailSaving ||
                projectTaskActionId === selectedProjectTaskDetail.id
              "
              @click="archiveSelectedProjectTask"
            >
              Archive
            </Button>
            <div class="task-detail-modal__primary-actions">
              <Button color="outline" shape="soft" size="compact"
                type="button"
                :disabled="projectTaskDetailSaving || weeklyReviewSubmitting"
                @click="closeProjectTaskDetail()"
              >
                Cancel
              </Button>
              <Button color="primary" shape="soft" size="compact"
                v-if="selectedProjectTaskIsWeeklyReview"
                type="submit"
                :disabled="weeklyReviewSubmitDisabled"
              >
                {{
                  weeklyReviewSubmitting
                    ? "Submitting..."
                    : "Submit review"
                }}
              </Button>
              <Button color="primary" shape="soft" size="compact"
                v-else
                type="submit"
                :disabled="projectTaskDetailSaveDisabled"
              >
                {{ projectTaskDetailSaving ? "Saving..." : "Save" }}
              </Button>
            </div>
          </div>
        </form>
      </div>

      <div
        v-if="accountsModalOpen"
        class="mission-modal"
        role="presentation"
        @click.self="closeAccountsModal"
      >
        <form
          class="mission-modal__dialog accounts-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accounts-modal-title"
          @submit.prevent="saveAccountEntry"
        >
          <div class="mission-modal__header">
            <h2 id="accounts-modal-title">Add account entry</h2>
            <Button color="ghost" shape="soft" size="compact" icon-only
              type="button"
              aria-label="Close"
              @click="closeAccountsModal"
            >
              <UiIcon name="X" :size="18" />
            </Button>
          </div>

          <div class="accounts-modal__grid">
            <label class="field">
              <span>Date</span>
              <input v-model="accountsForm.date" type="date" autofocus />
            </label>

            <label class="field">
              <span>Amount</span>
              <input
                v-model="accountsForm.amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </label>
          </div>

          <label class="field">
            <span>Description</span>
            <input
              v-model="accountsForm.description"
              type="text"
              placeholder="Vendor, client, or description"
              autocomplete="off"
            />
          </label>

          <div class="accounts-modal__grid">
            <label class="field">
              <span>Category</span>
              <select v-model="accountsForm.categoryId">
                <option value="">Uncategorized</option>
                <option
                  v-for="category in accountCategoryOptions"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>Status</span>
              <select v-model="accountsForm.status">
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="needs_review">Needs review</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label class="field">
            <span>Currency</span>
            <input
              v-model="accountsForm.currency"
              type="text"
              maxlength="3"
              autocomplete="off"
            />
          </label>

          <label class="field">
            <span>Notes</span>
            <textarea v-model="accountsForm.notes" rows="3" />
          </label>

          <p v-if="accountsError" class="mission-modal__error">
            {{ accountsError }}
          </p>

          <div class="mission-modal__actions">
            <Button color="outline" shape="soft" size="compact"
              type="button"
              @click="closeAccountsModal"
            >
              Cancel
            </Button>
            <Button color="primary" shape="soft" size="compact"
              type="submit"
              :disabled="accountsFormDisabled"
            >
              {{ accountsSaving ? "Adding..." : "Add entry" }}
            </Button>
          </div>
        </form>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.mission-control {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100vh;
  padding: 0 24px 40px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.mission-control__topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-height: var(--workspace-topbar-height);
  min-width: 0;
  padding: var(--workspace-topbar-padding-block) 0;
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.mission-control__topbar-trailing {
  display: flex;
  align-items: center;
  gap: 8px;
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  flex-shrink: 0;
}

.mission-control__project-switcher,
.mission-control__section-title {
  grid-column: 1;
  grid-row: 1;
  justify-self: center;
  min-width: 0;
}

.mission-control__assistant-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  padding: 0 9px;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.mission-control__assistant-link:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.mission-control__section-tab {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  cursor: pointer;
  min-height: 36px;
  padding: 6px 12px;
  border-radius: var(--ui-radius-sm);
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.mission-control__section-tab:hover,
.mission-control__section-tab.is-active {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.mission-control__section-title {
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.mission-control__project-switcher {
  position: relative;
  display: grid;
  min-width: 0;
}

.mission-control__project-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.2;
  cursor: pointer;
}

.mission-control__project-label:hover,
.mission-control__project-label[aria-expanded="true"] {
  background: var(--ui-surface-muted);
}

.mission-control__project-label strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-control__project-label {
  max-width: min(260px, calc(100vw - 120px));
}

.mission-control__project-caret {
  flex: 0 0 auto;
  color: var(--ui-text-muted);
  transition: transform 0.16s ease;
}

.mission-control__project-label[aria-expanded="true"]
  .mission-control__project-caret {
  transform: rotate(180deg);
}

.detail-row p,
.simple-sheet__header span,
.detail-row__aside {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.mission-control__section-cycle {
  display: inline-grid;
}

.settings-menu {
  position: relative;
}

.settings-menu__dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  width: 230px;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: 0 18px 50px color-mix(in oklab, #000, transparent 86%);
}

.settings-menu__item {
  display: grid;
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-menu__item span {
  font-size: 13px;
  font-weight: 650;
}

.settings-menu__item:hover,
.settings-menu__item.is-active {
  background: var(--ui-surface-muted);
}

.project-picker-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 30;
  display: grid;
  width: 50vw;
  min-width: min(320px, calc(100vw - 28px));
  max-width: calc(100vw - 28px);
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: 0 18px 50px color-mix(in oklab, #000, transparent 86%);
  transform: translateX(-50%);
}

.project-picker-popover {
  width: min(300px, calc(100vw - 28px));
  min-width: min(240px, calc(100vw - 28px));
}

.project-picker-popover__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.project-picker-popover__item > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-picker-popover__item:hover,
.project-picker-popover__item.is-active {
  background: var(--ui-surface-muted);
}

.project-picker-popover__empty {
  padding: 10px;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.project-picker-popover__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
}

.mission-control__message {
  width: min(700px, 100%);
  padding: 8px 12px;
  align-self: center;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  font-size: 13px;
}

.mission-control__message.is-error {
  color: #b91c1c;
}

.mission-page {
  display: flex;
  justify-content: center;
  width: 100%;
}

.simple-sheet {
  display: grid;
  width: min(700px, 100%);
  gap: 20px;
}

.projects-workspace {
  display: grid;
  width: min(1120px, 100%);
  gap: 18px;
}

.simple-sheet--wide {
  width: min(920px, 100%);
}

.inline-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 6px;
  align-items: center;
  margin: 14px 0 4px;
  padding: 6px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.inline-form input,
.project-task-composer__input,
.project-task-composer__project {
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
}

.inline-form input,
.project-task-composer__input,
.project-task-composer__project {
  min-height: 40px;
  padding: 0 12px;
}

.project-task-composer__input::placeholder {
  color: var(--ui-text-muted);
}

.inline-form input:focus,
.project-task-composer__input:focus,
.project-task-composer__project:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.project-task-composer .me3-btn:disabled,
.project-column-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.simple-sheet {
  display: grid;
  gap: 0;
}

.simple-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 4px 0 12px;
  border-bottom: 1px solid var(--ui-border);
}

.simple-sheet__header h1,
.detail-row h2 {
  margin: 0;
  font-size: 15px;
  line-height: 1.25;
}

.simple-sheet__header p {
  margin: 3px 0 0;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.activity-header__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.detail-row p {
  margin: 0;
}

.capture-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 6px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.2;
}

.local-project-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 20px;
  padding: 2px 6px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.status-badge.ready {
  color: var(--ui-accent);
}

.status-badge--needs_review {
  color: #b45309;
}

.status-badge--active {
  color: var(--ui-accent);
}

.empty-row {
  padding: 18px 0;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 13px;
}

.empty-row.is-error {
  color: #b91c1c;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--ui-border);
}

.detail-row div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.detail-row p {
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.detail-row__aside {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  text-align: right;
}

.memory-row {
  align-items: flex-start;
}

.memory-row--pending {
  border-color: color-mix(in oklab, #b45309, var(--ui-border) 72%);
}

.memory-row__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.memory-row__actions {
  min-width: 116px;
}

.memory-row__actions .me3-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  white-space: nowrap;
}

.memory-row .capture-item__meta span {
  overflow-wrap: anywhere;
}

.activity-row__kind {
  color: var(--ui-accent);
  font-size: 12px;
  font-weight: 700;
}

.activity-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.activity-row__actions .me3-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 5px 8px;
  font-size: 13px;
  white-space: nowrap;
}

.project-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
  min-width: 0;
  overflow-x: auto;
}

.project-board__column {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 180px;
  border-radius: var(--ui-radius-md);
  transition:
    background-color 0.16s ease,
    outline-color 0.16s ease;
}

.project-board__column.is-drop-target {
  background: color-mix(in oklab, var(--ui-accent-soft), transparent 30%);
  outline: 1px solid color-mix(in oklab, var(--ui-accent), transparent 55%);
  outline-offset: 6px;
}

.project-board__column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ui-border);
}

.project-board__column-header h2 {
  margin: 0;
  font-size: 13px;
  line-height: 1.25;
}

.project-board__column-header span,
.project-task-card__meta {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.local-project-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.local-project-summary div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.local-project-summary strong {
  color: var(--ui-text);
  font-size: 13px;
}

.local-project-summary span:not(.status-badge) {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-project-summary__runner {
  justify-items: end;
  text-align: right;
}

.project-task-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    opacity 0.16s ease,
    transform 0.16s ease;
}

.project-task-card:active {
  cursor: grabbing;
}

.project-task-card:focus-visible {
  border-color: var(--ui-accent);
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 2px;
}

.project-task-card.is-dragging {
  border-color: var(--ui-accent);
  opacity: 0.48;
  transform: scale(0.98);
}

.project-task-card.is-updating {
  opacity: 0.6;
}

.project-task-card p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.4;
}

.project-task-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.project-task-card__project {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  font-weight: 650;
}

.project-task-card__project img {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 4px;
  object-fit: cover;
}

.project-task-card__project span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-task-card .local-project-badge {
  color: var(--ui-accent);
}

.weekly-review-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid color-mix(in oklab, var(--ui-accent), var(--ui-border) 60%);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-accent);
  font-size: 11px;
  font-weight: 750;
}

.project-task-card__review-counts {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.project-task-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.project-task-card__run {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.project-task-card__run:hover {
  border-color: color-mix(in oklab, var(--ui-accent), var(--ui-border) 40%);
  color: var(--ui-accent);
}

.project-task-card__run:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.project-task-card__actions .me3-btn {
  width: 28px;
  height: 28px;
}

.project-task-card__actions .me3-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-task-composer {
  display: grid;
  gap: 6px;
  padding: 6px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.project-task-composer__input,
.project-task-composer__project {
  min-height: 36px;
  padding: 0 8px;
}

.project-task-composer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.project-task-composer__actions .me3-btn {
  width: 30px;
  height: 30px;
}

.project-task-composer__actions .me3-btn[type="submit"] {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.project-column-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 36px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.project-column-add:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.accounts-workspace {
  display: grid;
  width: min(1120px, 100%);
  gap: 14px;
}

.accounts-toolbar,
.accounts-toolbar__actions,
.accounts-filters,
.accounts-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.accounts-toolbar,
.accounts-pagination {
  justify-content: space-between;
}

.accounts-tabs {
  display: flex;
  gap: 6px;
}

.accounts-toolbar__actions {
  gap: 6px;
}

.accounts-toolbar__actions .me3-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.accounts-pagination .me3-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.accounts-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-border);
}

.accounts-summary div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px;
  background: var(--ui-surface);
}

.accounts-summary span,
.accounts-pagination span {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.accounts-summary strong {
  overflow: hidden;
  font-size: 15px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accounts-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(136px, 0.45fr) minmax(
      136px,
      0.45fr
    ) auto;
  gap: 8px;
  min-width: 0;
}

.accounts-filters input,
.accounts-filters select {
  min-width: 0;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}

.accounts-filters input:focus,
.accounts-filters select:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.accounts-table {
  display: grid;
  min-width: 0;
  overflow-x: auto;
  border-top: 1px solid var(--ui-border);
}

.accounts-table__head,
.accounts-table__row {
  display: grid;
  grid-template-columns: 96px minmax(180px, 1.7fr) minmax(
      128px,
      1fr
    ) 112px 118px 118px 40px;
  align-items: center;
  gap: 10px;
  min-width: 820px;
  padding: 10px 0;
  border-bottom: 1px solid var(--ui-border);
}

.accounts-table__head {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.accounts-table__row {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.accounts-table__row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accounts-table__row .me3-btn {
  width: 30px;
  height: 30px;
}

.accounts-modal {
  width: min(520px, 100%);
}

.accounts-modal__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.load-more-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.load-more-row:hover:not(:disabled) {
  border-color: var(--ui-border-strong);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.load-more-row:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.load-more-row--center {
  justify-self: center;
  width: auto;
  min-width: 180px;
}

.mission-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in oklab, #000, transparent 64%);
}

.mission-modal__dialog {
  display: grid;
  width: min(460px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  gap: 14px;
  overflow: auto;
  padding: 18px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: 0 24px 80px color-mix(in oklab, #000, transparent 78%);
}

.mission-modal--compact .mission-modal__dialog {
  width: min(360px, 100%);
}

.mission-modal__header,
.mission-modal__actions,
.project-logo-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mission-modal__header h2 {
  margin: 0;
  font-size: 16px;
}

.mission-modal__actions {
  justify-content: flex-end;
  padding-top: 4px;
}

.task-detail-modal__context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: -4px;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.task-detail-modal__run {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.task-detail-modal__run div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.task-detail-modal__run strong {
  font-size: 13px;
}

.task-detail-modal__run p {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.task-detail-modal__actions {
  justify-content: space-between;
}

.task-detail-modal__primary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.weekly-review-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.weekly-review-panel__summary,
.weekly-review-panel__empty,
.weekly-review-panel__done,
.weekly-review-panel__hint {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.weekly-review-panel__hint {
  font-size: 12px;
}

.weekly-review-panel__done {
  color: var(--ui-accent);
  font-weight: 700;
}

.weekly-review-panel__section {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.weekly-review-panel__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.weekly-review-panel__section-header h3 {
  margin: 0;
  font-size: 13px;
}

.weekly-review-panel__section-header span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.weekly-review-checklist {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.weekly-review-check {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.weekly-review-check input {
  margin-top: 2px;
}

.weekly-review-check span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.weekly-review-check strong,
.weekly-review-list strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.35;
}

.weekly-review-check small,
.weekly-review-list span {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.weekly-review-check--memory small {
  overflow-wrap: anywhere;
}

.weekly-review-task-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.weekly-review-task-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.weekly-review-task-row__body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.weekly-review-task-row__body strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.35;
}

.weekly-review-task-row__body small {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.weekly-review-task-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.weekly-review-task-row__actions .me3-btn {
  min-height: 30px;
  padding: 4px 8px;
}

.weekly-review-task-row__actions .me3-btn.me3-btn--active {
  border-color: transparent;
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.weekly-review-memory-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 650;
}

.weekly-review-memory-field span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.weekly-review-memory-field textarea {
  min-width: 0;
  width: 100%;
  resize: vertical;
}

.weekly-review-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.weekly-review-list li {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.weekly-review-collapse {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.field {
  display: grid;
  gap: 6px;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 650;
}

.field input,
.field select,
.field textarea,
.weekly-review-memory-field textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
}

.field input,
.field select {
  min-height: 38px;
  padding: 0 10px;
}

.field input[type="file"] {
  display: grid;
  min-height: auto;
  padding: 8px;
  color: var(--ui-text-muted);
  font-weight: 500;
}

.field textarea,
.weekly-review-memory-field textarea {
  resize: vertical;
  padding: 10px;
  line-height: 1.5;
}

.field input:focus,
.field select:focus,
.field textarea:focus,
.weekly-review-memory-field textarea:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.project-modal__hint {
  margin: -6px 0 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.project-modal__hint code {
  color: var(--ui-text);
  font-family:
    ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.95em;
}

.project-logo-preview {
  justify-content: flex-start;
  padding: 8px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
}

.project-logo-preview img {
  width: 36px;
  height: 36px;
  border-radius: var(--ui-radius-sm);
  object-fit: cover;
}

.project-logo-preview span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-modal__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

@media (max-width: 959px) {
  .mission-control {
    padding: 0 14px 32px;
  }

  .mission-control__topbar {
    gap: 6px;
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }

  .mission-control__project-switcher,
  .mission-control__section-title {
    justify-self: stretch;
  }

  .mission-control__project-label {
    max-width: none;
  }

  .detail-row {
    flex-direction: column;
  }

  .detail-row__aside {
    align-items: flex-start;
    text-align: left;
  }

  .project-board {
    grid-template-columns: 1fr;
    overflow-x: visible;
  }

  .project-board__column {
    min-width: 0;
  }

  .accounts-summary {
    grid-template-columns: 1fr;
  }

  .accounts-filters {
    grid-template-columns: 1fr;
  }

  .accounts-modal__grid {
    grid-template-columns: 1fr;
  }

  .memory-row__actions {
    flex-direction: row;
    width: 100%;
    min-width: 0;
  }

  .memory-row__actions .me3-btn {
    width: auto;
  }

  .settings-menu__dropdown {
    right: 0;
    width: min(230px, calc(100vw - 28px));
  }

  .mission-modal {
    padding: 14px;
  }
}
</style>
