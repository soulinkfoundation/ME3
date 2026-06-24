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
import PageLoading from "../components/PageLoading.vue";
import MissionProjectModal from "../components/mission-control/MissionProjectModal.vue";
import MissionProjectPicker from "../components/mission-control/MissionProjectPicker.vue";
import MissionProjectTaskBoard from "../components/mission-control/MissionProjectTaskBoard.vue";
import MissionProjectTaskDetailModal from "../components/mission-control/MissionProjectTaskDetailModal.vue";
import MissionProjectTaskList from "../components/mission-control/MissionProjectTaskList.vue";
import {
  activeProjectTasks,
  appendUniqueTasks,
  formatDateTime,
  groupProjectTasks,
  formatShortDate,
  isLocalProject,
  missionTasksUrl,
  projectBoardColumnsForProject,
  projectBoardStatusesForProject,
  projectForTask,
  projectName,
  sortProjectTasks,
  taskDescriptionText,
  weeklyReviewMetadata,
} from "../components/mission-control/projectWorkspace";
import UiIcon from "../components/UiIcon.vue";
import { useAppToast } from "../composables/useAppToast";
import type {
  LocalExecutorStatusResponse,
  MissionProject,
  MissionRun,
  MissionTask,
  ProjectBoardColumn,
  ProjectBoardStatus,
  ProjectTaskDetailDraft,
  ProjectTaskListGroup,
  WeeklyReviewTaskCleanupAction,
} from "../components/mission-control/projectWorkspace";
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
  projectId: string | null;
  projectName: string | null;
  amountCents: number;
  currency: string;
  status: FinancialEntryStatus;
  source: FinancialEntrySource;
  notes: string | null;
};

type AccountsMoneyTotal = {
  currency: string;
  amountCents: number;
};

type AccountsStats = {
  thisMonthCents: number;
  lastMonthCents: number;
  thisMonthTotals?: AccountsMoneyTotal[];
  lastMonthTotals?: AccountsMoneyTotal[];
  defaultCurrency?: string;
  topCategoryName: string | null;
  topCategoryTotalCents: number;
  entriesCount: number;
};

type AccountsEntryForm = {
  date: string;
  description: string;
  categoryId: string;
  projectId: string;
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
type MissionTaskResponse = { task: MissionTask };

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

type JournalProjectLink = {
  id: string;
  journalEntryId: string;
  projectId: string;
  sourceText: string | null;
  createdTaskId: string | null;
  createdReminderId: string | null;
  createdAt: string;
  entryDate: string;
  entryTitle: string | null;
  taskTitle: string | null;
};

const route = useRoute();
const router = useRouter();
const { toastFromUnknown, toastSuccess } = useAppToast();
const isAccountsRoute = computed(() => route.path === "/accounts");

const basePrimarySections: PrimaryMissionSection[] = ["projects"];
const sectionIds: MissionSection[] = [
  "projects",
  "accounts",
  "activity",
  "memory",
  "sources",
];
const sectionLabels: Record<MissionSection, string> = {
  projects: "Projects",
  accounts: "Accounts",
  activity: "Activity",
  memory: "Memory",
  sources: "Sources",
};
const ACCOUNTS_PAGE_SIZE = 50;
const PROJECTS_KANBAN_ENABLED_STORAGE_KEY = "me3:mission-control:kanban-enabled";

const activeSection = ref<MissionSection>(
  isAccountsRoute.value ? "accounts" : normalizeSection(route.query.section),
);
const accountsEnabled = ref<boolean | null>(null);
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
const selectedProjectDetailId = ref(rawProjectQuery(route.query.project));
const projectPickerOpen = ref(false);
const memoryDraft = ref("");
const memoryActionId = ref("");
const sourceDraft = ref("");
const projectModalOpen = ref(false);
const projectModalMode = ref<"add" | "edit">("add");
const editingProjectId = ref("");
const projectTitle = ref("");
const projectDescription = ref("");
const projectType = ref<"standard" | "local">("standard");
const projectLocalPath = ref("");
const projectLogoData = ref("");
const projectLogoName = ref("");
const projectIconName = ref("");
const projectSaving = ref(false);
const projectError = ref("");
const projectTasks = ref<MissionTask[]>([]);
const projectJournalLinks = ref<JournalProjectLink[]>([]);
const projectJournalLinksLoading = ref(false);
const projectJournalLinksError = ref("");
const projectJournalLinkActionId = ref("");
const projectLogOpen = ref(false);
const projectActionsMenuOpen = ref(false);
const projectTasksLoading = ref(false);
const projectTasksLoadingMore = ref(false);
const projectTasksError = ref("");
const projectTasksNextCursor = ref<string | null>(null);
const completedProjectTasks = ref<MissionTask[]>([]);
const completedProjectTasksLoading = ref(false);
const completedProjectTasksLoadingMore = ref(false);
const completedProjectTasksError = ref("");
const completedProjectTasksNextCursor = ref<string | null>(null);
const localExecutorStatus = ref<LocalExecutorStatusResponse | null>(null);
const kanbanEnabled = ref(false);
const projectTaskViewMode = ref<"list" | "kanban">("list");
const projectCompletedOpen = ref(false);
const projectTaskDraft = ref("");
const projectTaskProjectId = ref("");
const projectTaskSaving = ref(false);
const projectTaskActionId = ref("");
const projectTaskLocalRunId = ref("");
const projectTaskComposerStatus = ref("");
const projectTaskComposerProjectId = ref<string | null>(null);
const projectColumnActionId = ref("");
const projectColumnModalOpen = ref(false);
const projectColumnDraft = ref("");
const projectColumnError = ref("");
const projectColumnInput = ref<HTMLInputElement | null>(null);
const draggedProjectTaskId = ref("");
const projectTaskDropStatus = ref("");
const selectedProjectTaskDetailId = ref("");
const projectTaskDetailDraft = ref<ProjectTaskDetailDraft>({
  title: "",
  description: "",
  status: "backlog",
  projectId: "",
  scheduledFor: "",
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
const accountsActionsOpen = ref(false);
const accountsFiltersOpen = ref(false);
const accountsEditingEntryId = ref<string | null>(null);
const accountsError = ref("");
const accountsTotal = ref(0);
const accountsOffset = ref(0);
const accountsSearch = ref("");
const accountsStatusFilter = ref("");
const accountsSourceFilter = ref("");
const accountsStripeConfigured = ref(false);
const accountsStripeStatus = ref("");
const accountsStripeLastSyncedAt = ref<string | null>(null);
const accountsDefaultCurrency = ref("USD");
const accountsImportInput = ref<HTMLInputElement | null>(null);
const accountsForm = ref<AccountsEntryForm>(emptyAccountsForm("expense"));

const primarySections = computed<PrimaryMissionSection[]>(() =>
  isAccountsRoute.value ? ["accounts"] : basePrimarySections,
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
  () => selectedProjectDetail.value?.id || selectedProjectDetailId.value,
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
const activeSelectedProjectTasks = computed(() =>
  activeProjectTasks(selectedProjectTasks.value),
);
const pinnedProjectTasks = computed(() =>
  activeSelectedProjectTasks.value.filter((task) => task.pinnedAt),
);
const regularProjectTasks = computed(() =>
  activeSelectedProjectTasks.value.filter((task) => !task.pinnedAt),
);
const regularProjectBoardTasks = computed(() =>
  selectedProjectTasks.value.filter((task) => !task.pinnedAt),
);
const selectedProjectTaskDetail = computed(() =>
  selectedProjectTaskDetailId.value
    ? projectTasks.value.find(
        (task) => task.id === selectedProjectTaskDetailId.value,
      ) ||
      completedProjectTasks.value.find(
        (task) => task.id === selectedProjectTaskDetailId.value,
      ) ||
      null
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
  projectBoardColumnsForProject(selectedProjectDetail.value).map((column) => ({
    ...column,
    tasks: regularProjectBoardTasks.value.filter(
      (task) =>
        selectedProjectDetail.value
          ? task.columnId === column.columnId ||
            (!task.columnId && task.status === column.status)
          : task.status === column.status,
    ),
  })),
);
const selectedProjectBoardStatuses = computed(() =>
  projectBoardStatusesForProject(selectedProjectDetail.value),
);
const projectTaskListGroups = computed<ProjectTaskListGroup[]>(() => {
  if (
    !selectedProjectDetail.value &&
    regularProjectTasks.value.length === 0 &&
    pinnedProjectTasks.value.length > 0
  ) {
    return [];
  }
  return groupProjectTasks(
    projects.value,
    regularProjectTasks.value,
    selectedProjectDetail.value,
  );
});
const projectJournalLogGroups = computed(() => {
  const journalOnlyLinks = projectJournalLinks.value.filter(
    (link) => !link.createdTaskId,
  );
  if (selectedProjectDetail.value) {
    return [
      {
        id: selectedProjectDetail.value.id,
        label: selectedProjectDetail.value.name,
        links: journalOnlyLinks,
      },
    ];
  }

  return projects.value
    .map((project) => ({
      id: project.id,
      label: project.name,
      links: journalOnlyLinks.filter(
        (link) => link.projectId === project.id,
      ),
    }))
    .filter((group) => group.links.length > 0);
});
const visibleProjectJournalLinksCount = computed(() =>
  projectJournalLogGroups.value.reduce(
    (total, group) => total + group.links.length,
    0,
  ),
);
const selectedProjectDetailLabel = computed(
  () =>
    selectedProjectDetail.value
      ? selectedProjectDetail.value.name
      : selectedProjectDetailId.value
        ? "Loading..."
        : "All",
);
const projectTaskCreateDisabled = computed(
  () =>
    projectTaskSaving.value ||
    !projectTaskComposerStatus.value ||
    !projectTaskDraft.value.trim() ||
    Boolean(!selectedProjectDetail.value && !projectTaskProjectId.value),
);
const projectViewToggleLabel = computed(() =>
  projectTaskViewMode.value === "kanban" ? "List view" : "Board view",
);
const projectViewToggleIcon = computed<UiIconName>(() =>
  projectTaskViewMode.value === "kanban" ? "List" : "SquareKanban",
);
const projectLogToggleLabel = computed(() => "Project journal");
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
const accountsActiveFilterCount = computed(
  () =>
    [
      accountsSearch.value.trim(),
      accountsStatusFilter.value,
      accountsSourceFilter.value,
    ].filter(Boolean).length,
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
    syncSelectedProjectFromRoute();
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
    if (accountsEnabled.value && (activeSection.value === "accounts" || isAccountsRoute.value)) {
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
    accountsDefaultCurrency.value =
      normalizeAccountsCurrency(statsResponse.stats?.defaultCurrency) || "USD";
    if (!accountsForm.value.currency.trim()) {
      accountsForm.value.currency = accountsDefaultCurrency.value;
    }
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
  const editingEntryId = accountsEditingEntryId.value;
  const payload = {
    entryType: accountsType.value,
    date: accountsForm.value.date,
    description: accountsForm.value.description.trim(),
    categoryId: accountsForm.value.categoryId || null,
    projectId: accountsForm.value.projectId || null,
    amountCents: Math.round(amountValue * 100),
    currency: accountsForm.value.currency.trim().toUpperCase() || "USD",
    status: accountsForm.value.status,
    notes: accountsForm.value.notes.trim() || null,
  };
  try {
    if (editingEntryId) {
      await api.put(
        `/accounts/entries/${encodeURIComponent(editingEntryId)}`,
        payload,
      );
    } else {
      await api.post("/accounts/entries", payload);
      accountsOffset.value = 0;
    }
    accountsForm.value = emptyAccountsForm(accountsType.value);
    accountsEditingEntryId.value = null;
    accountsModalOpen.value = false;
    await loadAccounts();
    toastSuccess(editingEntryId ? "Entry updated." : "Entry added.");
  } catch (e) {
    accountsError.value =
      e instanceof ApiError
        ? e.message
        : editingEntryId
          ? "Could not update account entry"
          : "Could not add account entry";
  } finally {
    accountsSaving.value = false;
  }
}

function openAccountsModal() {
  accountsActionsOpen.value = false;
  accountsEditingEntryId.value = null;
  accountsForm.value = emptyAccountsForm(accountsType.value);
  accountsError.value = "";
  accountsModalOpen.value = true;
}

function openEditAccountEntry(entry: FinancialEntry) {
  accountsActionsOpen.value = false;
  accountsEditingEntryId.value = entry.id;
  accountsForm.value = {
    date: entry.date,
    description: entry.description,
    categoryId: entry.categoryId || "",
    projectId: entry.projectId || "",
    amount: formatAccountsAmountInput(entry.amountCents),
    currency: entry.currency,
    status: entry.status,
    notes: entry.notes || "",
  };
  accountsError.value = "";
  accountsModalOpen.value = true;
}

function closeAccountsModal() {
  if (accountsSaving.value) return;
  accountsModalOpen.value = false;
  accountsEditingEntryId.value = null;
}

function openAccountsFilters() {
  accountsActionsOpen.value = false;
  accountsFiltersOpen.value = true;
}

async function deleteAccountEntry(entry: FinancialEntry) {
  accountsError.value = "";
  try {
    await api.delete(`/accounts/entries/${encodeURIComponent(entry.id)}`);
    await loadAccounts();
    toastSuccess("Entry deleted.");
  } catch (e) {
    accountsError.value =
      e instanceof ApiError ? e.message : "Could not delete account entry";
  }
}

function setAccountsType(type: FinancialEntryType) {
  if (accountsType.value === type) return;
  accountsType.value = type;
  accountsOffset.value = 0;
  accountsEditingEntryId.value = null;
  accountsForm.value = emptyAccountsForm(type);
  void loadAccounts();
}

function applyAccountsFilters() {
  accountsOffset.value = 0;
  accountsFiltersOpen.value = false;
  void loadAccounts();
}

function clearAccountsFilters() {
  accountsSearch.value = "";
  accountsStatusFilter.value = "";
  accountsSourceFilter.value = "";
  applyAccountsFilters();
}

function pageAccounts(delta: number) {
  accountsOffset.value = Math.max(
    0,
    accountsOffset.value + delta * ACCOUNTS_PAGE_SIZE,
  );
  void loadAccounts();
}

function chooseAccountsImportFile() {
  accountsActionsOpen.value = false;
  accountsImportInput.value?.click();
}

async function importAccountsCsv(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  accountsImporting.value = true;
  accountsError.value = "";
  try {
    const form = new FormData();
    form.append("entryType", accountsType.value);
    form.append("file", file);
    const response = await api.upload<{
      imported: number;
      skipped: number;
      total: number;
    }>("/accounts/import", form);
    accountsOffset.value = 0;
    await loadAccounts();
    toastSuccess(
      `Imported ${response.imported} of ${response.total}; skipped ${response.skipped}.`,
    );
  } catch (e) {
    accountsError.value =
      e instanceof ApiError ? e.message : "Could not import CSV";
  } finally {
    accountsImporting.value = false;
    input.value = "";
  }
}

function exportAccountsCsv() {
  accountsActionsOpen.value = false;
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
  accountsActionsOpen.value = false;
  accountsSyncing.value = true;
  accountsError.value = "";
  try {
    const response = await api.post<{
      chargesImported: number;
      chargesUpdated: number;
      chargesProcessed: number;
    }>("/accounts/stripe/sync", {});
    accountsType.value = "income";
    accountsOffset.value = 0;
    await loadAccounts();
    toastSuccess(
      `Stripe sync processed ${response.chargesProcessed}; added ${response.chargesImported}, updated ${response.chargesUpdated}.`,
    );
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
      missionTasksUrl({
        active: projectTaskViewMode.value !== "kanban",
        projectId: scopeId,
      }),
    );
    if (selectedProjectTaskScopeId.value !== scopeId) return;
    projectTasks.value = response.tasks || [];
    projectTasksNextCursor.value = response.nextCursor || null;
    await openTaskFromRouteQuery();
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Project tasks could not load";
    projectTasks.value = [];
    projectTasksNextCursor.value = null;
  } finally {
    projectTasksLoading.value = false;
  }
}

async function loadProjectJournalLinks(projectId = selectedProjectTaskScopeId.value) {
  const scopeId = projectId || "";
  projectJournalLinksLoading.value = true;
  projectJournalLinksError.value = "";
  try {
    if (scopeId) {
      const response = await api.get<{ links: JournalProjectLink[] }>(
        `/mission-control/projects/${encodeURIComponent(scopeId)}/journal-links`,
      );
      if (selectedProjectTaskScopeId.value !== scopeId) return;
      projectJournalLinks.value = response.links || [];
      return;
    }

    const responses = await Promise.allSettled(
      projects.value.map((project) =>
        api.get<{ links: JournalProjectLink[] }>(
          `/mission-control/projects/${encodeURIComponent(project.id)}/journal-links`,
        ),
      ),
    );
    if (selectedProjectTaskScopeId.value !== scopeId) return;
    projectJournalLinks.value = responses
      .flatMap((response) =>
        response.status === "fulfilled" ? response.value.links || [] : [],
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (e) {
    projectJournalLinksError.value =
      e instanceof ApiError && e.status === 404
        ? ""
        : e instanceof ApiError
          ? e.message
          : "Project journal could not load";
    projectJournalLinks.value = [];
  } finally {
    projectJournalLinksLoading.value = false;
  }
}

async function loadCompletedProjectTasks(
  projectId = selectedProjectTaskScopeId.value,
) {
  const scopeId = projectId || "";
  completedProjectTasksLoading.value = true;
  completedProjectTasksError.value = "";
  try {
    const response = await api.get<MissionTasksResponse>(
      missionTasksUrl({ status: "done", projectId: scopeId }),
    );
    if (selectedProjectTaskScopeId.value !== scopeId) return;
    completedProjectTasks.value = response.tasks || [];
    completedProjectTasksNextCursor.value = response.nextCursor || null;
  } catch (e) {
    completedProjectTasksError.value =
      e instanceof ApiError ? e.message : "Completed items could not load";
    completedProjectTasks.value = [];
    completedProjectTasksNextCursor.value = null;
  } finally {
    completedProjectTasksLoading.value = false;
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
      missionTasksUrl({
        active: projectTaskViewMode.value !== "kanban",
        projectId,
        cursor,
      }),
    );
    if (selectedProjectTaskScopeId.value !== projectId) return;
    projectTasks.value = appendUniqueTasks(
      projectTasks.value,
      response.tasks || [],
    );
    projectTasksNextCursor.value = response.nextCursor || null;
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not load more project items";
  } finally {
    projectTasksLoadingMore.value = false;
  }
}

async function loadMoreCompletedProjectTasks() {
  const projectId = selectedProjectTaskScopeId.value;
  const cursor = completedProjectTasksNextCursor.value;
  if (!cursor || completedProjectTasksLoadingMore.value) return;
  completedProjectTasksLoadingMore.value = true;
  completedProjectTasksError.value = "";
  try {
    const response = await api.get<MissionTasksResponse>(
      missionTasksUrl({ status: "done", projectId, cursor }),
    );
    if (selectedProjectTaskScopeId.value !== projectId) return;
    completedProjectTasks.value = appendUniqueTasks(
      completedProjectTasks.value,
      response.tasks || [],
    );
    completedProjectTasksNextCursor.value = response.nextCursor || null;
  } catch (e) {
    completedProjectTasksError.value =
      e instanceof ApiError ? e.message : "Could not load more completed items";
  } finally {
    completedProjectTasksLoadingMore.value = false;
  }
}

function toggleProjectPicker() {
  projectPickerOpen.value = !projectPickerOpen.value;
}

function selectProjectDetail(projectId: string) {
  selectedProjectDetailId.value = projectId;
  projectPickerOpen.value = false;
  resetProjectTaskComposer();
  closeProjectTaskDetail();
  const { project: _project, ...query } = route.query;
  void router.replace({
    query: projectId ? { ...query, project: projectId } : query,
  });
}

function setSection(section: MissionSection) {
  activeSection.value = section;
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
  if (isAccountsRoute.value) return;
  setSection(activeSection.value === "accounts" ? "projects" : "accounts");
}

function openProjectModal() {
  projectPickerOpen.value = false;
  projectModalMode.value = "add";
  editingProjectId.value = "";
  projectTitle.value = "";
  projectDescription.value = "";
  projectType.value = "standard";
  projectLocalPath.value = "";
  projectLogoData.value = "";
  projectLogoName.value = "";
  projectIconName.value = "";
  projectError.value = "";
  projectModalOpen.value = true;
}

function projectIconIsLogo(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith("data:image/"));
}

function openEditProjectModal(project: MissionProject) {
  projectPickerOpen.value = false;
  projectModalMode.value = "edit";
  editingProjectId.value = project.id;
  projectTitle.value = project.name;
  projectDescription.value = project.description || "";
  projectType.value = isLocalProject(project) ? "local" : "standard";
  projectLocalPath.value =
    typeof project.metadata.localPath === "string"
      ? project.metadata.localPath
      : "";
  projectLogoData.value = projectIconIsLogo(project.icon) ? project.icon || "" : "";
  projectLogoName.value = projectLogoData.value ? "Uploaded logo" : "";
  projectIconName.value = projectIconIsLogo(project.icon) ? "" : project.icon || "";
  projectError.value = "";
  projectModalOpen.value = true;
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
    projectIconName.value = "";
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

function setProjectIconName(value: string) {
  projectIconName.value = value;
  if (value) removeProjectLogo();
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
        icon: projectLogoData.value || projectIconName.value || undefined,
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

async function saveProject() {
  const projectId = editingProjectId.value;
  const name = projectTitle.value.trim();
  if (!projectId || !name || projectSaving.value) return;
  projectSaving.value = true;
  projectError.value = "";
  try {
    const response = await api.patch<{ project: MissionProject }>(
      `/mission-control/projects/${encodeURIComponent(projectId)}`,
      {
        name,
        description: projectDescription.value.trim() || null,
        icon: projectLogoData.value || projectIconName.value || null,
      },
    );
    projects.value = projects.value
      .map((project) =>
        project.id === response.project.id ? response.project : project,
      )
      .sort((a, b) => {
        if (a.name === "Personal") return -1;
        if (b.name === "Personal") return 1;
        return a.name.localeCompare(b.name);
      });
    toastSuccess("Project saved");
    projectModalOpen.value = false;
  } catch (e) {
    projectError.value =
      e instanceof ApiError ? e.message : "Could not save project";
  } finally {
    projectSaving.value = false;
  }
}

function resetProjectTaskComposer() {
  projectTaskComposerStatus.value = "";
  projectTaskDraft.value = "";
  projectTaskProjectId.value = "";
  projectTaskComposerProjectId.value = null;
}

function toggleKanbanView() {
  projectCompletedOpen.value = false;
  projectLogOpen.value = false;
  const enabled = projectTaskViewMode.value !== "kanban";
  kanbanEnabled.value = enabled;
  window.localStorage.setItem(
    PROJECTS_KANBAN_ENABLED_STORAGE_KEY,
    enabled ? "1" : "0",
  );
  setProjectTaskViewMode(enabled ? "kanban" : "list");
}

function toggleCompletedProjectTasks() {
  projectCompletedOpen.value = !projectCompletedOpen.value;
  if (projectCompletedOpen.value) projectLogOpen.value = false;
  projectPickerOpen.value = false;
  projectActionsMenuOpen.value = false;
  resetProjectTaskComposer();
  closeProjectTaskDetail();
  if (projectCompletedOpen.value) void loadCompletedProjectTasks();
}

function toggleProjectLog() {
  projectLogOpen.value = !projectLogOpen.value;
  if (projectLogOpen.value) {
    projectCompletedOpen.value = false;
    resetProjectTaskComposer();
    closeProjectTaskDetail();
  }
  projectPickerOpen.value = false;
  projectActionsMenuOpen.value = false;
  if (projectLogOpen.value) void loadProjectJournalLinks();
}

function setProjectTaskViewMode(mode: "list" | "kanban") {
  const nextMode = mode === "kanban" && kanbanEnabled.value ? "kanban" : "list";
  if (projectTaskViewMode.value === nextMode) return;
  projectTaskViewMode.value = nextMode;
  projectCompletedOpen.value = false;
  projectLogOpen.value = false;
  projectActionsMenuOpen.value = false;
  resetProjectTaskComposer();
  closeProjectTaskDetail();
  void loadProjectTasks();
}

function toggleProjectActionsMenu() {
  projectActionsMenuOpen.value = !projectActionsMenuOpen.value;
  projectPickerOpen.value = false;
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

function syncProjectTaskDetailDraft(task: MissionTask) {
  projectTaskDetailDraft.value = {
    title: task.title,
    description: task.description || "",
    status:
      task.status === "cancelled"
        ? "backlog"
        : (task.status as ProjectBoardStatus),
    projectId: task.projectId || projects.value[0]?.id || "",
    scheduledFor: task.scheduledFor?.slice(0, 10) || "",
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
  clearTaskRouteQuery();
}

async function openTaskFromRouteQuery() {
  const taskId = rawTaskQuery(route.query.task);
  if (!taskId || selectedProjectTaskDetailId.value === taskId) return;
  let task =
    projectTasks.value.find((item) => item.id === taskId) ||
    completedProjectTasks.value.find((item) => item.id === taskId) ||
    null;
  if (!task) {
    try {
      const response = await api.get<MissionTaskResponse>(
        `/mission-control/tasks/${encodeURIComponent(taskId)}`,
      );
      task = response.task;
      stageProjectTaskForDetail(task);
    } catch {
      return;
    }
  }
  if (task) openProjectTaskDetail(task);
}

function stageProjectTaskForDetail(task: MissionTask) {
  if (task.status === "done") {
    completedProjectTasks.value = appendUniqueTasks([task], completedProjectTasks.value);
    projectTasks.value = projectTasks.value.filter((item) => item.id !== task.id);
    return;
  }
  replaceProjectTask(task);
}

function clearTaskRouteQuery() {
  if (!rawTaskQuery(route.query.task)) return;
  const { task: _task, ...query } = route.query;
  void router.replace({ query });
}

function openProjectTaskComposer(column: ProjectBoardColumn) {
  if (projectTaskSaving.value) return;
  projectTaskComposerStatus.value = column.id;
  projectTaskComposerProjectId.value = null;
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

function openProjectTaskListComposer(projectId: string) {
  if (projectTaskSaving.value) return;
  projectTaskComposerStatus.value = "backlog";
  projectTaskComposerProjectId.value = projectId;
  projectTaskDraft.value = "";
  projectTaskProjectId.value = selectedProjectDetail.value?.id || projectId;
  void nextTick(() => {
    if (selectedProjectDetail.value || projectId) {
      document
        .querySelector<HTMLInputElement>(".project-task-list-composer__input")
        ?.focus();
      return;
    }
    document
      .querySelector<HTMLSelectElement>(".project-task-list-composer__project")
      ?.focus();
  });
}

function cancelProjectTaskComposer() {
  if (projectTaskSaving.value) return;
  resetProjectTaskComposer();
}

async function addProjectTask(target: ProjectBoardStatus | ProjectBoardColumn) {
  const title = projectTaskDraft.value.trim();
  const projectId =
    selectedProjectDetail.value?.id || projectTaskProjectId.value;
  if (!title || !projectId || projectTaskSaving.value) return;
  const column =
    typeof target === "string"
      ? selectedProjectBoardStatuses.value.find((item) => item.id === target)
      : target;
  const status = typeof target === "string" ? target : target.status;
  projectTaskSaving.value = true;
  projectTasksError.value = "";
  try {
    const response = await api.post<{ task: MissionTask }>(
      "/mission-control/tasks",
      {
        title,
        projectId,
        status,
        columnId: column?.columnId || undefined,
      },
    );
    projectTasks.value = sortProjectTasks([response.task, ...projectTasks.value]);
    resetProjectTaskComposer();
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not add item";
  } finally {
    projectTaskSaving.value = false;
  }
}

async function runProjectTaskLocally(task: MissionTask) {
  if (
    !isLocalProject(projectForTask(projects.value, task)) ||
    projectTaskLocalRunId.value
  )
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
        projectId: projectTaskDetailDraft.value.projectId,
        scheduledFor: projectTaskDetailDraft.value.scheduledFor || null,
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

async function toggleProjectTaskPin(task: MissionTask) {
  if (projectTaskActionId.value) return;
  projectTaskActionId.value = task.id;
  projectTasksError.value = "";
  try {
    const response = await api.patch<{ task: MissionTask }>(
      `/mission-control/tasks/${encodeURIComponent(task.id)}`,
      { pinned: !task.pinnedAt },
    );
    replaceProjectTask(response.task);
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not update task";
  } finally {
    projectTaskActionId.value = "";
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
  columnId?: string,
) {
  if (
    (task.status === status && (!columnId || task.columnId === columnId)) ||
    projectTaskActionId.value
  )
    return;
  projectTaskActionId.value = task.id;
  projectTasksError.value = "";
  try {
    const response = await api.patch<{ task: MissionTask }>(
      `/mission-control/tasks/${encodeURIComponent(task.id)}`,
      { status, columnId },
    );
    replaceProjectTask(response.task);
    if (response.task.status === "done") {
      completedProjectTasks.value = [
        response.task,
        ...completedProjectTasks.value.filter(
          (item) => item.id !== response.task.id,
        ),
      ];
    } else {
      completedProjectTasks.value = completedProjectTasks.value.filter(
        (item) => item.id !== response.task.id,
      );
    }
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not update task";
  } finally {
    projectTaskActionId.value = "";
  }
}

async function renameProjectColumn(column: ProjectBoardColumn, name: string) {
  const project = selectedProjectDetail.value;
  if (
    !project ||
    !column.columnId ||
    !name ||
    name === column.label ||
    projectColumnActionId.value
  )
    return;
  projectColumnActionId.value = column.columnId;
  projectTasksError.value = "";
  try {
    const response = await api.patch<{
      column: NonNullable<MissionProject["columns"]>[number];
    }>(
      `/mission-control/projects/${encodeURIComponent(project.id)}/columns/${encodeURIComponent(column.columnId)}`,
      { name },
    );
    projects.value = projects.value.map((item) =>
      item.id === project.id
        ? {
            ...item,
            columns: (item.columns || []).map((existing) =>
              existing.id === response.column.id ? response.column : existing,
            ),
          }
        : item,
    );
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not rename column";
  } finally {
    projectColumnActionId.value = "";
  }
}

function addProjectColumn() {
  const project = selectedProjectDetail.value;
  if (!project || projectColumnActionId.value) return;
  projectColumnDraft.value = "";
  projectColumnError.value = "";
  projectColumnModalOpen.value = true;
  void nextTick(() => projectColumnInput.value?.focus());
}

function closeProjectColumnModal() {
  if (projectColumnActionId.value === "new") return;
  projectColumnModalOpen.value = false;
  projectColumnError.value = "";
}

async function submitProjectColumn() {
  const project = selectedProjectDetail.value;
  if (!project || projectColumnActionId.value) return;
  const name = projectColumnDraft.value.trim();
  if (!name) {
    projectColumnError.value = "Column name is required";
    return;
  }
  projectColumnActionId.value = "new";
  projectColumnError.value = "";
  try {
    const response = await api.post<{
      column: NonNullable<MissionProject["columns"]>[number];
    }>(`/mission-control/projects/${encodeURIComponent(project.id)}/columns`, {
      name,
    });
    projects.value = projects.value.map((item) =>
      item.id === project.id
        ? { ...item, columns: [...(item.columns || []), response.column] }
        : item,
    );
    projectColumnModalOpen.value = false;
    projectColumnDraft.value = "";
  } catch (e) {
    projectColumnError.value =
      e instanceof ApiError ? e.message : "Could not add column";
  } finally {
    projectColumnActionId.value = "";
  }
}

async function removeProjectColumn(column: ProjectBoardColumn) {
  const project = selectedProjectDetail.value;
  if (!project || projectColumnActionId.value || projectBoardColumns.value.length < 2)
    return;
  const target = projectBoardColumns.value.find((item) => item.id !== column.id);
  if (!target) return;
  const confirmed = window.confirm(
    `Remove "${column.label}"? Items in it will move to "${target.label}".`,
  );
  if (!confirmed) return;
  projectColumnActionId.value = column.id;
  projectTasksError.value = "";
  try {
    const response = await api.delete<{
      columns: NonNullable<MissionProject["columns"]>;
    }>(
      `/mission-control/projects/${encodeURIComponent(project.id)}/columns/${encodeURIComponent(column.id)}`,
    );
    projects.value = projects.value.map((item) =>
      item.id === project.id ? { ...item, columns: response.columns } : item,
    );
    await loadProjectTasks();
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not remove column";
  } finally {
    projectColumnActionId.value = "";
  }
}

function startProjectTaskDrag(event: DragEvent, task: MissionTask) {
  if (projectTaskActionId.value || task.status === "cancelled") {
    event.preventDefault();
    return;
  }
  draggedProjectTaskId.value = task.id;
  projectTaskDropStatus.value = task.columnId || task.status;
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
  columnId: string,
) {
  if (!draggedProjectTaskId.value) return;
  event.preventDefault();
  projectTaskDropStatus.value = columnId;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleProjectColumnDragLeave(
  event: DragEvent,
  columnId: string,
) {
  const currentTarget = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as Node | null;
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget))
    return;
  if (projectTaskDropStatus.value === columnId) projectTaskDropStatus.value = "";
}

async function dropProjectTask(event: DragEvent, column: ProjectBoardColumn) {
  event.preventDefault();
  const taskId =
    draggedProjectTaskId.value ||
    event.dataTransfer?.getData("text/plain") ||
    "";
  endProjectTaskDrag();
  const task = projectTasks.value.find((item) => item.id === taskId);
  if (!task) return;
  await setProjectTaskStatus(task, column.status, column.columnId || undefined);
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
      e instanceof ApiError ? e.message : "Could not archive item";
    return false;
  } finally {
    projectTaskActionId.value = "";
  }
}

async function deleteProjectJournalLink(link: JournalProjectLink) {
  if (projectJournalLinkActionId.value) return;
  projectJournalLinkActionId.value = link.id;
  projectJournalLinksError.value = "";
  try {
    await api.delete(`/mission-control/journal/links/${encodeURIComponent(link.id)}`);
    projectJournalLinks.value = projectJournalLinks.value.filter(
      (item) => item.id !== link.id,
    );
  } catch (e) {
    projectJournalLinksError.value =
      e instanceof ApiError ? e.message : "Could not remove journal link";
  } finally {
    projectJournalLinkActionId.value = "";
  }
}

async function archiveSelectedProjectTask() {
  const task = selectedProjectTaskDetail.value;
  if (!task || projectTaskDetailSaving.value) return;
  const archived = await archiveProjectTask(task);
  if (archived) closeProjectTaskDetail();
}

function replaceProjectTask(next: MissionTask) {
  if (
    next.archivedAt ||
    next.status === "cancelled" ||
    (next.status === "done" && projectTaskViewMode.value !== "kanban")
  ) {
    projectTasks.value = projectTasks.value.filter((item) => item.id !== next.id);
    if (selectedProjectTaskDetailId.value === next.id && next.status === "done") {
      selectedProjectTaskDetailId.value = "";
    }
    return;
  }
  const index = projectTasks.value.findIndex((item) => item.id === next.id);
  if (index >= 0) projectTasks.value.splice(index, 1, next);
  else projectTasks.value.unshift(next);
  projectTasks.value = sortProjectTasks(projectTasks.value);
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

function emptyAccountsForm(type: FinancialEntryType): AccountsEntryForm {
  return {
    date: todayKey(),
    description: "",
    categoryId: "",
    projectId: "",
    amount: "",
    currency: accountsDefaultCurrency.value,
    status: type === "income" ? "paid" : "pending",
    notes: "",
  };
}

function normalizeAccountsCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeAccountsAmountInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatAccountsAmountInput(cents: number): string {
  return ((cents || 0) / 100).toFixed(2);
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

function journalLinkTitle(link: JournalProjectLink): string {
  return link.entryTitle || "Journal entry";
}

function journalLinkSnippet(link: JournalProjectLink): string {
  return link.sourceText || "";
}

function journalLinkHref(link: JournalProjectLink): string {
  return `/journal?date=${encodeURIComponent(link.entryDate)}`;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format((cents || 0) / 100);
}

function formatMoneyTotals(
  totals: AccountsMoneyTotal[] | undefined,
  fallbackCents: number,
  fallbackCurrency: string,
): string {
  const visibleTotals = (totals || []).filter((item) => item.amountCents > 0);
  if (visibleTotals.length === 0) return formatMoney(fallbackCents, fallbackCurrency);
  return visibleTotals
    .map((item) => formatMoney(item.amountCents, item.currency))
    .join(" + ");
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
  const raw = normalizeRawSection(value);
  if (raw === "approvals" || raw === "runs") return "activity";
  return sectionIds.includes(raw as MissionSection)
    ? (raw as MissionSection)
    : "projects";
}

function normalizeRawSection(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : undefined;
}

function rawProjectQuery(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : "";
}

function rawTaskQuery(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : "";
}

function syncSelectedProjectFromRoute() {
  const projectId = rawProjectQuery(route.query.project);
  if (!projectId) {
    selectedProjectDetailId.value = "";
    return;
  }
  selectedProjectDetailId.value =
    projects.value.length === 0 ||
    projects.value.some((project) => project.id === projectId)
      ? projectId
      : "";
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && projectActionsMenuOpen.value) {
    projectActionsMenuOpen.value = false;
    return;
  }
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
}

function handleWindowClick() {
  projectPickerOpen.value = false;
  projectActionsMenuOpen.value = false;
}

watch(
  () => route.query.section,
  (section) => {
    if (!isAccountsRoute.value && normalizeRawSection(section) === "accounts") {
      void router.replace("/accounts");
      return;
    }
    if (isRemovedJournalSection(section)) {
      void router.replace("/journal");
      return;
    }
    activeSection.value = isAccountsRoute.value
      ? "accounts"
      : normalizeSection(section);
  },
);

watch(
  () => route.query.project,
  () => {
    syncSelectedProjectFromRoute();
  },
);

watch(
  () => route.query.task,
  () => {
    if (activeSection.value === "projects") void openTaskFromRouteQuery();
  },
);

watch(activeSection, (section) => {
  if (section === "projects") {
    void loadProjectTasks();
    if (projectLogOpen.value) void loadProjectJournalLinks();
    void loadLocalExecutorStatus();
  }
  if (section === "activity") void loadActivityReview();
  if (section === "memory" || section === "sources") void loadMemoryAndSources();
  if (section === "accounts") void loadAccounts();
});

watch(selectedProjectDetailId, (next, previous) => {
  if (next === previous) return;
  if (activeSection.value === "projects") {
    void loadProjectTasks(next);
    if (projectLogOpen.value) void loadProjectJournalLinks(next);
    if (projectCompletedOpen.value) void loadCompletedProjectTasks(next);
  }
});

onMounted(() => {
  if (!isAccountsRoute.value && normalizeRawSection(route.query.section) === "accounts") {
    void router.replace("/accounts");
    return;
  }
  if (isRemovedJournalSection(route.query.section)) {
    void router.replace("/journal");
    return;
  }
  kanbanEnabled.value =
    window.localStorage.getItem(PROJECTS_KANBAN_ENABLED_STORAGE_KEY) === "1";
  projectTaskViewMode.value = kanbanEnabled.value ? "kanban" : "list";
  void loadMissionControlWorkspace();
  void loadPluginCapabilities();
  if (activeSection.value === "projects") {
    void loadProjectTasks();
    void loadProjectJournalLinks();
    void loadLocalExecutorStatus();
  }
  if (activeSection.value === "activity") void loadActivityReview();
  if (activeSection.value === "memory" || activeSection.value === "sources")
    void loadMemoryAndSources();
  if (activeSection.value === "accounts") void loadAccounts();
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("click", handleWindowClick);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener("click", handleWindowClick);
});
</script>

<template>
  <main
    class="mission-control"
    :class="{ 'mission-control--accounts-route': isAccountsRoute }"
  >
    <header v-if="!isAccountsRoute" class="mission-control__topbar">
      <MissionProjectPicker
        v-if="activeSection === 'projects'"
        :open="projectPickerOpen"
        :projects="projects"
        :selected-project="selectedProjectDetail"
        :selected-project-label="selectedProjectDetailLabel"
        :selected-project-is-local="selectedProjectIsLocal"
        @toggle="toggleProjectPicker"
        @select="selectProjectDetail"
        @add-project="openProjectModal"
      />
      <div v-if="activeSection !== 'projects'" class="mission-control__section-title">
        {{ sectionLabels[activeSection] }}
      </div>

      <div class="mission-control__topbar-trailing">
        <Button
          v-if="primarySections.length > 1 && !isAccountsRoute"
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
        <div
          v-if="activeSection === 'projects' && !isAccountsRoute"
          class="mission-control__actions-menu"
          @click.stop
        >
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Project view options"
            aria-haspopup="menu"
            :aria-expanded="projectActionsMenuOpen ? 'true' : 'false'"
            title="Project view options"
            @click="toggleProjectActionsMenu"
          >
            <UiIcon name="Ellipsis" :size="18" />
          </Button>
          <div
            v-if="projectActionsMenuOpen"
            class="mission-control__actions-popover"
            role="menu"
          >
            <button
              v-if="projectTaskViewMode === 'list'"
              type="button"
              class="mission-control__actions-item"
              :class="{ 'is-active': projectCompletedOpen }"
              role="menuitem"
              @click="toggleCompletedProjectTasks"
            >
              <UiIcon name="Archive" :size="15" />
              Completed
            </button>
            <button
              type="button"
              class="mission-control__actions-item"
              role="menuitem"
              @click="toggleKanbanView"
            >
              <UiIcon :name="projectViewToggleIcon" :size="15" />
              {{ projectViewToggleLabel }}
            </button>
            <button
              type="button"
              class="mission-control__actions-item"
              :class="{ 'is-active': projectLogOpen }"
              role="menuitem"
              @click="toggleProjectLog"
            >
              <UiIcon name="BookOpen" :size="15" />
              {{ projectLogToggleLabel }}
            </button>
          </div>
        </div>
        <Button
          v-if="!isAccountsRoute"
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          to="/mission-control"
          aria-label="Close projects"
          title="Close projects"
        >
          <UiIcon name="X" :size="18" />
        </Button>
      </div>
    </header>

    <p v-if="error" class="mission-control__message is-error">{{ error }}</p>

    <section v-show="activeSection === 'projects'" class="mission-page">
      <div class="mission-projects-shell">
        <section
          v-if="projectLogOpen"
          class="project-journal-log"
          aria-label="Project journal"
        >
          <header class="project-journal-log__header">
            <div>
              <h2>Project journal</h2>
            </div>
          </header>
          <p
            v-if="projectJournalLinksError"
            class="mission-control__message is-error"
          >
            {{ projectJournalLinksError }}
          </p>
          <div v-if="projectJournalLinksLoading" class="empty-row">
            Loading project journal...
          </div>
          <div v-else-if="visibleProjectJournalLinksCount === 0" class="empty-row">
            No project journal entries yet. Link text from notes in your daily
            journal to a project, and it will appear here.
          </div>
          <template v-else>
            <section
              v-for="group in projectJournalLogGroups"
              :key="group.id"
              class="project-journal-log__group"
            >
              <h3 v-if="!selectedProjectDetail">{{ group.label }}</h3>
              <article
                v-for="link in group.links"
                :key="link.id"
                class="project-journal-log__row"
              >
                <a
                  class="project-journal-log__row-main"
                  :href="journalLinkHref(link)"
                >
                  <span>{{ formatShortDate(link.entryDate) }}</span>
                  <strong>{{ journalLinkTitle(link) }}</strong>
                  <p v-if="journalLinkSnippet(link)">
                    {{ journalLinkSnippet(link) }}
                  </p>
                </a>
                <button
                  type="button"
                  class="project-journal-log__remove"
                  :disabled="projectJournalLinkActionId === link.id"
                  @click.stop="deleteProjectJournalLink(link)"
                >
                  <UiIcon name="Trash2" :size="14" aria-hidden="true" />
                  Remove
                </button>
              </article>
            </section>
          </template>
        </section>
        <section v-else-if="projectCompletedOpen" class="completed-tasks-view">
          <header class="completed-tasks-view__header">
            <div>
              <h2>Completed items</h2>
              <p>
                Done items
                <template v-if="selectedProjectDetail">
                  for {{ selectedProjectDetail.name }}
                </template>
              </p>
            </div>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              type="button"
              aria-label="Refresh completed items"
              title="Refresh completed items"
              :disabled="completedProjectTasksLoading"
              @click="loadCompletedProjectTasks"
            >
              <UiIcon name="RefreshCw" :size="16" />
            </Button>
          </header>
          <p
            v-if="completedProjectTasksError"
            class="mission-control__message is-error"
          >
            {{ completedProjectTasksError }}
          </p>
          <div v-if="completedProjectTasksLoading" class="empty-row">
            Loading completed items...
          </div>
          <div v-else-if="completedProjectTasks.length === 0" class="empty-row">
            No completed items yet.
          </div>
          <div v-else class="completed-tasks-table-wrap">
            <table class="completed-tasks-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Project</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="task in completedProjectTasks"
                  :key="task.id"
                  tabindex="0"
                  @click="openProjectTaskDetail(task)"
                  @keydown.enter.prevent="openProjectTaskDetail(task)"
                  @keydown.space.prevent="openProjectTaskDetail(task)"
                >
                  <td>
                    <strong>{{ task.title }}</strong>
                    <span v-if="taskDescriptionText(task)">
                      {{ taskDescriptionText(task) }}
                    </span>
                  </td>
                  <td>{{ projectName(projects, task.projectId) }}</td>
                  <td>{{ formatShortDate(task.updatedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Button
            v-if="completedProjectTasksNextCursor"
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            :disabled="completedProjectTasksLoadingMore"
            @click="loadMoreCompletedProjectTasks"
          >
            {{ completedProjectTasksLoadingMore ? "Loading..." : "Load more" }}
          </Button>
        </section>
        <MissionProjectTaskList
          v-else-if="projectTaskViewMode === 'list'"
          v-model:task-draft="projectTaskDraft"
          v-model:task-project-id="projectTaskProjectId"
          :projects="projects"
          :selected-project="selectedProjectDetail"
          :selected-project-is-local="selectedProjectIsLocal"
          :local-executor-runner-label="localExecutorRunnerLabel"
          :local-executor-runner-detail="localExecutorRunnerDetail"
          :error="projectTasksError"
          :loading="projectTasksLoading"
          :pinned-tasks="pinnedProjectTasks"
          :groups="projectTaskListGroups"
          :statuses="selectedProjectBoardStatuses"
          :action-id="projectTaskActionId"
          :local-run-id="projectTaskLocalRunId"
          :saving="projectTaskSaving"
          :composer-project-id="projectTaskComposerProjectId"
          :create-disabled="projectTaskCreateDisabled"
          :next-cursor="projectTasksNextCursor"
          :loading-more="projectTasksLoadingMore"
          @open-detail="openProjectTaskDetail"
          @archive-task="archiveProjectTask"
          @run-task-locally="runProjectTaskLocally"
          @set-status="setProjectTaskStatus"
          @toggle-pin="toggleProjectTaskPin"
          @edit-project="openEditProjectModal"
          @add-task="addProjectTask"
          @open-composer="openProjectTaskListComposer"
          @cancel-composer="cancelProjectTaskComposer"
          @load-more="loadMoreProjectTasks"
        />
        <MissionProjectTaskBoard
          v-else
          v-model:task-draft="projectTaskDraft"
          v-model:task-project-id="projectTaskProjectId"
          :projects="projects"
          :selected-project="selectedProjectDetail"
          :selected-project-is-local="selectedProjectIsLocal"
          :local-executor-runner-label="localExecutorRunnerLabel"
          :local-executor-runner-detail="localExecutorRunnerDetail"
          :error="projectTasksError"
          :loading="projectTasksLoading"
          :pinned-tasks="pinnedProjectTasks"
          :columns="projectBoardColumns"
          :drop-status="projectTaskDropStatus"
          :dragged-task-id="draggedProjectTaskId"
          :action-id="projectTaskActionId"
          :column-action-id="projectColumnActionId"
          :local-run-id="projectTaskLocalRunId"
          :saving="projectTaskSaving"
          :composer-status="projectTaskComposerStatus"
          :create-disabled="projectTaskCreateDisabled"
          :next-cursor="projectTasksNextCursor"
          :loading-more="projectTasksLoadingMore"
          @column-drag-over="handleProjectColumnDragOver"
          @column-drag-leave="handleProjectColumnDragLeave"
          @drop-task="dropProjectTask"
          @open-detail="openProjectTaskDetail"
          @task-drag-start="startProjectTaskDrag"
          @task-drag-end="endProjectTaskDrag"
          @archive-task="archiveProjectTask"
          @run-task-locally="runProjectTaskLocally"
          @toggle-pin="toggleProjectTaskPin"
          @rename-column="renameProjectColumn"
          @add-column="addProjectColumn"
          @remove-column="removeProjectColumn"
          @add-task="addProjectTask"
          @open-composer="openProjectTaskComposer"
          @cancel-composer="cancelProjectTaskComposer"
          @load-more="loadMoreProjectTasks"
        />
      </div>
    </section>

    <section v-show="activeSection === 'accounts'" class="mission-page">
      <PageLoading v-if="accountsEnabled === null" label="Loading accounts..." />

      <div v-else-if="!accountsEnabled" class="simple-sheet">
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
              class="accounts-mode-tab"
              :class="{ 'is-active': accountsType === 'expense' }"
              role="tab"
              aria-label="Expenses"
              title="Expenses"
              :aria-selected="accountsType === 'expense' ? 'true' : 'false'"
              @click="setAccountsType('expense')"
            >
              <UiIcon name="HandCoins" :size="15" />
              <span>Expenses</span>
            </button>
            <button
              type="button"
              class="accounts-mode-tab"
              :class="{ 'is-active': accountsType === 'income' }"
              role="tab"
              aria-label="Income"
              title="Income"
              :aria-selected="accountsType === 'income' ? 'true' : 'false'"
              @click="setAccountsType('income')"
            >
              <UiIcon name="Landmark" :size="15" />
              <span>Income</span>
            </button>
          </div>
          <div class="accounts-toolbar__actions">
            <Button
              class="accounts-icon-button"
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              type="button"
              title="Search accounts"
              aria-label="Search accounts"
              @click="openAccountsFilters"
            >
              <UiIcon name="Search" :size="18" />
              <span
                v-if="accountsActiveFilterCount"
                class="accounts-filter-count"
              >
                {{ accountsActiveFilterCount }}
              </span>
            </Button>
            <Button
              class="accounts-icon-button"
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              type="button"
              title="Add entry"
              aria-label="Add entry"
              @click="openAccountsModal"
            >
              <UiIcon name="Plus" :size="18" />
            </Button>
            <div
              class="accounts-actions-menu"
              @click.stop
            >
              <Button
                class="accounts-icon-button"
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                type="button"
                title="Account actions"
                aria-label="Account actions"
                aria-haspopup="menu"
                :aria-expanded="accountsActionsOpen ? 'true' : 'false'"
                @click="accountsActionsOpen = !accountsActionsOpen"
              >
                <UiIcon name="Ellipsis" :size="18" />
              </Button>
              <div
                v-if="accountsActionsOpen"
                class="accounts-actions-menu__popover"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  :disabled="accountsSyncing || !accountsStripeConfigured"
                  @click="syncAccountsStripe"
                >
                  <UiIcon name="RefreshCw" :size="15" />
                  <span>{{
                    accountsSyncing ? "Syncing Stripe" : "Sync Stripe"
                  }}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  :disabled="accountsImporting"
                  @click="chooseAccountsImportFile"
                >
                  <UiIcon name="Upload" :size="15" />
                  <span>{{
                    accountsImporting ? "Importing CSV" : "Import CSV"
                  }}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  @click="exportAccountsCsv"
                >
                  <UiIcon name="Download" :size="15" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
            <input
              ref="accountsImportInput"
              type="file"
              accept=".csv,text/csv"
              class="visually-hidden"
              @change="importAccountsCsv"
            />
          </div>
        </div>

        <PageLoading
          v-if="accountsLoading && !accountsStats"
          compact
          label="Loading accounts..."
        />

        <div v-else class="accounts-summary">
          <div>
            <span>This month</span>
            <strong>{{
              formatMoneyTotals(
                accountsStats?.thisMonthTotals,
                accountsStats?.thisMonthCents || 0,
                accountsForm.currency,
              )
            }}</strong>
          </div>
          <div>
            <span>Last month</span>
            <strong>{{
              formatMoneyTotals(
                accountsStats?.lastMonthTotals,
                accountsStats?.lastMonthCents || 0,
                accountsForm.currency,
              )
            }}</strong>
          </div>
        </div>

        <p v-if="accountsError" class="mission-control__message is-error">
          {{ accountsError }}
        </p>

        <div class="accounts-table" aria-label="Payment log">
          <div class="accounts-table__head">
            <span>Date</span>
            <span>Description</span>
            <span>Category</span>
            <span>Project</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Source</span>
            <span></span>
          </div>
          <div v-if="accountsLoading" class="accounts-table__loading">
            <PageLoading compact label="Loading accounts..." />
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
              <span>{{ entry.projectName || "No project" }}</span>
              <span>{{ formatMoney(entry.amountCents, entry.currency) }}</span>
              <span class="status-badge">{{
                accountStatusLabel(entry.status)
              }}</span>
              <span>{{ accountSourceLabel(entry.source) }}</span>
              <div class="accounts-table__row-actions">
                <Button color="ghost" shape="soft" size="compact" icon-only
                  type="button"
                  aria-label="Edit entry"
                  @click="openEditAccountEntry(entry)"
                >
                  <UiIcon name="Pencil" :size="15" />
                </Button>
                <Button color="ghost" shape="soft" size="compact" icon-only
                  type="button"
                  aria-label="Delete entry"
                  @click="deleteAccountEntry(entry)"
                >
                  <UiIcon name="Trash2" :size="15" />
                </Button>
              </div>
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

    <MissionProjectModal
      v-model:project-title="projectTitle"
      v-model:project-description="projectDescription"
      v-model:project-type="projectType"
      v-model:project-local-path="projectLocalPath"
      :project-icon-name="projectIconName"
      :open="projectModalOpen"
      :mode="projectModalMode"
      :project-logo-data="projectLogoData"
      :project-logo-name="projectLogoName"
      :saving="projectSaving"
      :error="projectError"
      :create-disabled="projectCreateDisabled"
      @update:project-icon-name="setProjectIconName"
      @choose-logo="chooseProjectLogo"
      @remove-logo="removeProjectLogo"
      @close="closeProjectModal"
      @submit="projectModalMode === 'edit' ? saveProject() : addProject()"
    />

    <Teleport to="body">
      <div
        v-if="projectColumnModalOpen"
        class="mission-modal mission-modal--compact"
        role="presentation"
        @click.self="closeProjectColumnModal"
      >
        <form
          class="mission-modal__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-column-modal-title"
          @submit.prevent="submitProjectColumn"
          @keydown.esc.prevent="closeProjectColumnModal"
        >
          <div class="mission-modal__header">
            <h2 id="project-column-modal-title">Add column</h2>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              type="button"
              aria-label="Close"
              :disabled="projectColumnActionId === 'new'"
              @click="closeProjectColumnModal"
            >
              <UiIcon name="X" :size="18" />
            </Button>
          </div>

          <label class="field">
            <span>Name</span>
            <input
              ref="projectColumnInput"
              v-model="projectColumnDraft"
              type="text"
              maxlength="80"
              autocomplete="off"
              required
            />
          </label>

          <p v-if="projectColumnError" class="mission-modal__error">
            {{ projectColumnError }}
          </p>

          <div class="mission-modal__actions">
            <Button
              color="outline"
              shape="soft"
              size="compact"
              type="button"
              :disabled="projectColumnActionId === 'new'"
              @click="closeProjectColumnModal"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              shape="soft"
              size="compact"
              type="submit"
              :disabled="
                projectColumnActionId === 'new' ||
                !projectColumnDraft.trim()
              "
            >
              {{ projectColumnActionId === "new" ? "Adding..." : "Add" }}
            </Button>
          </div>
        </form>
      </div>
    </Teleport>

    <MissionProjectTaskDetailModal
      v-model:detail-draft="projectTaskDetailDraft"
      v-model:weekly-review-custom-memory="weeklyReviewCustomMemory"
      v-model:weekly-review-completed-open="weeklyReviewCompletedOpen"
      :projects="projects"
      :task="selectedProjectTaskDetail"
      :latest-run="selectedProjectTaskLatestRun"
      :latest-run-summary="selectedProjectTaskLatestRunSummary"
      :weekly-review="selectedProjectTaskWeeklyReview"
      :board-statuses="selectedProjectBoardStatuses"
      :weekly-review-task-actions="weeklyReviewTaskActions"
      :weekly-review-memory-ids="weeklyReviewMemoryIds"
      :weekly-review-reminder-ids="weeklyReviewReminderIds"
      :detail-error="projectTaskDetailError"
      :detail-saving="projectTaskDetailSaving"
      :weekly-review-submitting="weeklyReviewSubmitting"
      :task-action-id="projectTaskActionId"
      :save-disabled="projectTaskDetailSaveDisabled"
      :submit-disabled="weeklyReviewSubmitDisabled"
      @close="closeProjectTaskDetail()"
      @save="saveProjectTaskDetail"
      @submit="submitSelectedWeeklyReview"
      @archive="archiveSelectedProjectTask"
      @set-weekly-review-task-action="setWeeklyReviewTaskAction"
      @toggle-weekly-review-memory="toggleWeeklyReviewMemory"
      @toggle-weekly-review-reminder="toggleWeeklyReviewReminder"
    />

    <Teleport to="body">
      <div
        v-if="accountsFiltersOpen"
        class="mission-modal"
        role="presentation"
        @click.self="accountsFiltersOpen = false"
      >
        <form
          class="mission-modal__dialog accounts-filter-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accounts-filter-title"
          @submit.prevent="applyAccountsFilters"
        >
          <div class="mission-modal__header">
            <h2 id="accounts-filter-title">Search accounts</h2>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              type="button"
              aria-label="Close filters"
              @click="accountsFiltersOpen = false"
            >
              <UiIcon name="X" :size="18" />
            </Button>
          </div>

          <div class="accounts-filters accounts-filters--modal">
            <label class="field">
              <span>Search</span>
              <input
                v-model="accountsSearch"
                type="search"
                placeholder="Search accounts"
                aria-label="Search accounts"
              />
            </label>
            <label class="field">
              <span>Status</span>
              <select
                v-model="accountsStatusFilter"
                aria-label="Filter by status"
              >
                <option value="">Any status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="needs_review">Needs review</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label class="field">
              <span>Source</span>
              <select
                v-model="accountsSourceFilter"
                aria-label="Filter by source"
              >
                <option value="">Any source</option>
                <option value="manual">Manual</option>
                <option value="csv_import">CSV import</option>
                <option value="stripe">Stripe</option>
                <option value="email_triage">Email triage</option>
              </select>
            </label>
          </div>

          <div class="mission-modal__actions">
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              type="button"
              :disabled="!accountsActiveFilterCount"
              @click="clearAccountsFilters"
            >
              Clear
            </Button>
            <Button color="primary" shape="soft" size="compact" type="submit">
              <template #icon>
                <UiIcon name="Search" :size="15" />
              </template>
              Search
            </Button>
          </div>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
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
            <h2 id="accounts-modal-title">
              {{
                accountsEditingEntryId ? "Edit account entry" : "Add account entry"
              }}
            </h2>
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

          <div class="accounts-modal__grid">
            <label class="field">
              <span>Project</span>
              <select v-model="accountsForm.projectId">
                <option value="">No project</option>
                <option
                  v-for="project in projects"
                  :key="project.id"
                  :value="project.id"
                >
                  {{ project.name }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>Currency</span>
              <input
                v-model="accountsForm.currency"
                type="text"
                maxlength="3"
                autocomplete="off"
              />
            </label>
          </div>

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
              {{
                accountsSaving
                  ? accountsEditingEntryId
                    ? "Saving..."
                    : "Adding..."
                  : accountsEditingEntryId
                    ? "Save changes"
                    : "Add entry"
              }}
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

.mission-control--accounts-route {
  --accounts-route-inline-padding: 24px;

  padding: var(--workspace-topbar-padding-block)
    var(--accounts-route-inline-padding) 40px;
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

.mission-control__actions-menu {
  position: relative;
}

.mission-control__actions-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: grid;
  min-width: 190px;
  gap: 2px;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-md);
}

.mission-control__actions-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  padding: 7px 9px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.mission-control__actions-item:hover,
.mission-control__actions-item:focus-visible,
.mission-control__actions-item.is-active {
  background: var(--ui-surface-muted);
  outline: none;
}

.mission-control__actions-item.is-active {
  color: var(--ui-accent);
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

.detail-row p,
.simple-sheet__header span,
.detail-row__aside {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.mission-control__section-cycle {
  display: inline-grid;
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

.mission-projects-shell {
  display: grid;
  justify-items: center;
  width: 100%;
  gap: 12px;
}

.simple-sheet {
  display: grid;
  width: min(700px, 100%);
  gap: 20px;
}

.completed-tasks-view {
  display: grid;
  width: min(760px, 100%);
  gap: 14px;
}

.project-journal-log {
  display: grid;
  width: min(760px, 100%);
  gap: 8px;
  padding-top: 4px;
}

.project-journal-log__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--ui-border);
}

.project-journal-log__header h2,
.project-journal-log__row-main p {
  margin: 0;
}

.project-journal-log__header h2 {
  color: var(--ui-text);
  font-size: 15px;
}

.project-journal-log__group {
  display: grid;
  gap: 2px;
}

.project-journal-log__group h3 {
  margin: 8px 0 2px;
  color: var(--ui-text);
  font-size: 13px;
  line-height: 1.25;
}

.project-journal-log__row-main span,
.project-journal-log__row-main p {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.project-journal-log__row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text);
}

.project-journal-log__row-main {
  display: grid;
  gap: 3px;
  min-width: 0;
  border-radius: var(--ui-radius-sm);
  padding: 9px 8px;
  color: inherit;
  text-decoration: none;
}

.project-journal-log__row:hover,
.project-journal-log__row:focus-within {
  background: var(--ui-surface-muted);
}

.project-journal-log__row-main:focus-visible {
  outline: none;
}

.project-journal-log__row-main strong,
.project-journal-log__row-main p {
  min-width: 0;
  overflow-wrap: anywhere;
}

.project-journal-log__remove {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  padding: 7px 9px;
  background: transparent;
  color: #b91c1c;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.project-journal-log__remove:hover,
.project-journal-log__remove:focus-visible {
  background: var(--ui-surface-muted);
  outline: none;
}

.project-journal-log__remove:disabled {
  cursor: default;
  opacity: 0.55;
}

.completed-tasks-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ui-border);
}

.completed-tasks-view__header h2,
.completed-tasks-view__header p {
  margin: 0;
}

.completed-tasks-view__header h2 {
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1.25;
}

.completed-tasks-view__header p {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.completed-tasks-table-wrap {
  overflow-x: auto;
  border-top: 1px solid var(--ui-border);
}

.completed-tasks-table {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
  color: var(--ui-text);
  font-size: 13px;
}

.completed-tasks-table th,
.completed-tasks-table td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--ui-border);
  text-align: left;
  vertical-align: top;
}

.completed-tasks-table th {
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
}

.completed-tasks-table tbody tr {
  cursor: pointer;
}

.completed-tasks-table tbody tr:hover,
.completed-tasks-table tbody tr:focus-visible {
  background: var(--ui-surface-muted);
  outline: none;
}

.completed-tasks-table td:first-child {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.completed-tasks-table strong,
.completed-tasks-table span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.completed-tasks-table span {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.4;
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

.inline-form input {
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
}

.inline-form input {
  min-height: 40px;
  padding: 0 12px;
}

.inline-form input:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
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

.accounts-workspace {
  display: grid;
  width: min(1120px, 100%);
  gap: 14px;
}

.accounts-toolbar,
.accounts-toolbar__actions,
.accounts-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.accounts-toolbar {
  display: grid;
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  justify-content: normal;
  padding-left: max(
    0px,
    calc(
      var(--app-shell-mobile-nav-leading-padding) + 12px -
        var(--accounts-route-inline-padding)
    )
  );
}

.accounts-tabs {
  display: flex;
  grid-column: 2;
  min-width: 0;
  flex-wrap: nowrap;
  justify-self: center;
  gap: 8px;
}

.accounts-toolbar__actions {
  position: relative;
  grid-column: 3;
  justify-self: end;
  gap: 6px;
  flex-wrap: nowrap;
}

.accounts-pagination {
  justify-content: space-between;
}

.accounts-mode-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 1px 2px color-mix(in oklab, #000, transparent 92%);
}

.accounts-mode-tab:hover,
.accounts-mode-tab.is-active {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.accounts-mode-tab:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 65%);
  outline-offset: 2px;
}

.accounts-icon-button {
  position: relative;
}

.accounts-toolbar__actions :deep(.accounts-icon-button.me3-btn) {
  background: var(--ui-surface);
  border-color: transparent;
  color: var(--ui-text-muted);
}

.accounts-toolbar__actions :deep(.accounts-icon-button.me3-btn:hover),
.accounts-toolbar__actions :deep(.accounts-icon-button.me3-btn:focus-visible),
.accounts-toolbar__actions :deep(.accounts-icon-button.me3-btn--active) {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.accounts-filter-count {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  min-width: 14px;
  height: 14px;
  place-items: center;
  border-radius: 999px;
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}

.accounts-actions-menu {
  position: relative;
}

.accounts-actions-menu__popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: grid;
  min-width: 176px;
  gap: 3px;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: 0 16px 36px color-mix(in oklab, #000, transparent 84%);
}

.accounts-actions-menu__popover button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 9px;
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

.accounts-actions-menu__popover button:hover:not(:disabled),
.accounts-actions-menu__popover button:focus-visible {
  background: var(--ui-surface-muted);
  outline: none;
}

.accounts-actions-menu__popover button:disabled {
  color: var(--ui-text-muted);
  cursor: not-allowed;
  opacity: 0.58;
}

.accounts-pagination .me3-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.accounts-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 18px;
  overflow: hidden;
}

.accounts-summary div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 2px 0 8px;
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

.accounts-filter-modal {
  width: min(520px, 100%);
}

.accounts-filters--modal {
  display: grid;
  gap: 12px;
}

.accounts-table__loading {
  min-width: 980px;
  border-bottom: 1px solid var(--ui-border);
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
    ) minmax(128px, 1fr) 112px 118px 118px 72px;
  align-items: center;
  gap: 10px;
  min-width: 980px;
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

.accounts-table__row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
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
.mission-modal__actions {
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

.field {
  display: grid;
  gap: 6px;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 650;
}

.field input,
.field select,
.field textarea {
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

.field textarea {
  resize: vertical;
  padding: 10px;
  line-height: 1.5;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
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

  .mission-control--accounts-route {
    --accounts-route-inline-padding: 16px;

    padding: var(--workspace-topbar-padding-block)
      var(--accounts-route-inline-padding) 32px;
  }

  .mission-control__topbar {
    gap: 6px;
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }

  .mission-control__project-switcher,
  .mission-control__section-title {
    justify-self: stretch;
  }

  .detail-row {
    flex-direction: column;
  }

  .detail-row__aside {
    align-items: flex-start;
    text-align: left;
  }

  .accounts-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .accounts-summary div {
    padding: 0 0 8px;
  }

  .accounts-summary strong {
    overflow-wrap: anywhere;
    white-space: normal;
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

  .mission-modal {
    padding: 14px;
  }
}

@media (max-width: 640px) {
  .accounts-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .accounts-tabs {
    grid-column: 1;
    justify-self: start;
  }

  .accounts-toolbar__actions {
    grid-column: 2;
  }

  .accounts-mode-tab {
    width: 34px;
    min-height: 34px;
    padding: 0;
    font-size: 13px;
  }

  .accounts-mode-tab > span {
    display: none;
  }
}

@media (max-width: 480px) {
  .accounts-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .accounts-tabs {
    grid-column: 1;
    justify-self: start;
  }

  .accounts-toolbar__actions {
    grid-column: 2;
    justify-self: end;
  }

  .accounts-actions-menu__popover {
    right: 50%;
    transform: translateX(50%);
  }
}
</style>
