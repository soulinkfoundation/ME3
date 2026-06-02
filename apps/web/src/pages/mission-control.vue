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
import {
  inferMissionCaptureType,
  type MissionCaptureType,
} from "@me3-core/plugin-mission-control";
import { API_BASE, ApiError, api } from "../api";
import DatePickerPopover from "../components/calendar/DatePickerPopover.vue";
import UiIcon from "../components/UiIcon.vue";
import { useAppToast } from "../composables/useAppToast";
import type { UiIconName } from "../utils/icons";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.mission-control",
    title: "Mission Control | ME3",
    description: "ME3 Core Mission Control workspace.",
    robots: "noindex,follow",
  },
});

type MissionSection =
  | "today"
  | "journalArchive"
  | "projects"
  | "accounts"
  | "activity"
  | "memory"
  | "sources";
type PrimaryMissionSection = "today" | "projects" | "accounts";
type SettingsMissionSection =
  | "journalArchive"
  | "activity"
  | "memory"
  | "sources";

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

type MissionCapture = {
  id: string;
  type: MissionCaptureType;
  text: string;
  projectId: string | null;
  status: "open" | "done" | "archived";
  syncStatus: "local" | "pending" | "synced" | "failed" | "setup_required";
  syncError: string | null;
  dueAt: string | null;
  eventStartAt: string | null;
  eventEndAt: string | null;
  createdAt: string;
};

type MissionDay = {
  id: string;
  date: string;
  title: string | null;
  journalText: string;
  updatedAt: string;
};

type MissionJournalArchiveEntry = {
  id: string;
  date: string;
  preview: string;
  journalText: string;
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
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  model: string | null;
  runnerId: string | null;
  promptSummary: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
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

type MissionDailyBriefing = {
  id: string;
  title: string;
  message: string;
  date: string;
  createdAt: string;
  showInJournal: boolean;
  deliveryHint: "soulink" | "mission_control";
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

type MissionOverviewResponse = {
  day: MissionDay;
  captures: MissionCapture[];
  projects: MissionProject[];
  tasksDueToday: MissionTask[];
  pendingApprovals: MissionApproval[];
  recentRuns: MissionRun[];
  activity: MissionActivity[];
  latestBriefing: MissionDailyBriefing | null;
};

type PluginsResponse = { plugins: CorePluginRecord[] };
type MissionMemoryResponse = { memory: MissionMemory[] };
type MissionSourcesResponse = { sources: MissionContextSource[] };
type MissionJournalArchiveResponse = { entries: MissionJournalArchiveEntry[] };
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

type ProjectBoardColumn = {
  id: MissionTask["status"];
  label: string;
  tasks: MissionTask[];
};
type ProjectBoardStatus = ProjectBoardColumn["id"];

const route = useRoute();
const router = useRouter();
const { toastFromUnknown, toastSuccess } = useAppToast();

const basePrimarySections: PrimaryMissionSection[] = ["today", "projects"];
const settingsSections: SettingsMissionSection[] = [
  "journalArchive",
  "activity",
  "memory",
  "sources",
];
const sectionIds: MissionSection[] = [
  ...basePrimarySections,
  "accounts",
  ...settingsSections,
];
const sectionLabels: Record<MissionSection, string> = {
  today: "Journal",
  journalArchive: "Archive",
  projects: "Projects",
  accounts: "Accounts",
  activity: "Activity",
  memory: "Memory",
  sources: "Sources",
};
const captureTypeOptions: Array<{
  id: MissionCaptureType;
  icon: "CircleCheck" | "Clock" | "CalendarDays";
  label: string;
}> = [
  { id: "task", icon: "CircleCheck", label: "Task" },
  { id: "reminder", icon: "Clock", label: "Reminder" },
  { id: "event", icon: "CalendarDays", label: "Event" },
];
const projectBoardStatuses: Array<{
  id: MissionTask["status"];
  label: string;
}> = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "Doing" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];
const PROJECT_TASK_PAGE_SIZE = 50;
const ACCOUNTS_PAGE_SIZE = 50;

const selectedDate = ref(todayKey());
const activeSection = ref<MissionSection>(
  normalizeSection(route.query.section),
);
const accountsEnabled = ref(false);
const day = ref<MissionDay | null>(null);
const captures = ref<MissionCapture[]>([]);
const projects = ref<MissionProject[]>([]);
const tasksDueToday = ref<MissionTask[]>([]);
const pendingApprovals = ref<MissionApproval[]>([]);
const recentRuns = ref<MissionRun[]>([]);
const memory = ref<MissionMemory[]>([]);
const sources = ref<MissionContextSource[]>([]);
const activity = ref<MissionActivity[]>([]);
const latestBriefing = ref<MissionDailyBriefing | null>(null);
const doneCapturesOpen = ref(false);
const loading = ref(false);
const error = ref("");
const clearingActivity = ref(false);
const localRunActionId = ref("");
const captureText = ref("");
const captureType = ref<MissionCaptureType>("task");
const manualCaptureType = ref(false);
const selectedProjectId = ref("");
const selectedProjectDetailId = ref("");
const savingCapture = ref(false);
const schedulePickerOpen = ref(false);
const scheduleDateTime = ref("");
const journalDraft = ref("");
const journalState = ref<"idle" | "saving" | "saved" | "error">("idle");
const datePickerOpen = ref(false);
const datePickerMonth = ref(monthKey(selectedDate.value));
const projectPickerOpen = ref(false);
const journalArchiveEntries = ref<MissionJournalArchiveEntry[]>([]);
const journalArchiveLoading = ref(false);
const journalArchiveError = ref("");
const selectedArchiveDate = ref("");
const archivePickerOpen = ref(false);
const selectedArchiveProjectId = ref("");
const projectArchiveTasks = ref<MissionTask[]>([]);
const projectArchiveLoading = ref(false);
const projectArchiveLoadingMore = ref(false);
const projectArchiveError = ref("");
const projectArchiveNextCursor = ref<string | null>(null);
const selectedProjectArchiveTaskId = ref("");
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
const projectTaskDraft = ref("");
const projectTaskSaving = ref(false);
const projectTaskActionId = ref("");
const projectTaskLocalRunId = ref("");
const projectTaskComposerStatus = ref<ProjectBoardStatus | "">("");
const draggedProjectTaskId = ref("");
const projectTaskDropStatus = ref<ProjectBoardStatus | "">("");
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
let journalSaveTimer: number | null = null;

const primarySections = computed<PrimaryMissionSection[]>(() =>
  accountsEnabled.value
    ? [...basePrimarySections, "accounts"]
    : basePrimarySections,
);
const currentDateIsToday = computed(() => selectedDate.value === todayKey());
const selectedDateLabel = computed(() =>
  currentDateIsToday.value
    ? "Today"
    : formatDaySwitcherDate(selectedDate.value),
);
const activeProjectOptions = computed(() =>
  projects.value.filter((project) => project.status === "active"),
);
const openCaptures = computed(() =>
  captures.value.filter((capture) => capture.status === "open"),
);
const doneCaptures = computed(() =>
  captures.value.filter((capture) => capture.status === "done"),
);
const visibleScheduledTasks = computed(() =>
  tasksDueToday.value.filter((task) => task.sourceKind !== "capture"),
);
const selectedDayIsLoaded = computed(
  () => day.value?.date === selectedDate.value && !loading.value,
);
const showCaptureList = computed(
  () =>
    selectedDayIsLoaded.value &&
    (openCaptures.value.length > 0 ||
      doneCaptures.value.length > 0 ||
      visibleScheduledTasks.value.length > 0),
);
const journalStatusText = computed(() => {
  if (journalState.value === "saving") return "Saving";
  if (journalState.value === "saved") return "Saved";
  if (journalState.value === "error") return "Could not save";
  return "";
});
const capturePlaceholder = computed(() => {
  if (captureType.value === "reminder")
    return "Remind me to take a break tomorrow at 3pm";
  if (captureType.value === "event") return "Coffee with Alex tomorrow at 10am";
  return "Fix login redirect";
});
const schedulePickerTitle = computed(() =>
  captureType.value === "event" ? "Schedule event" : "Schedule reminder",
);
const scheduledDate = computed(() => {
  const [date] = scheduleDateTime.value.split("T");
  return normalizeLocalDateInput(date);
});
const scheduledTime = computed(() => {
  const time = scheduleDateTime.value.split("T")[1] || "";
  return normalizeLocalTimeInput(time);
});
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
const visibleDailyBriefing = computed(() => {
  const briefing = latestBriefing.value;
  if (
    !briefing ||
    !briefing.showInJournal ||
    briefing.date !== selectedDate.value
  )
    return null;
  if (isDailyBriefingDismissed(briefing)) return null;
  return briefing;
});
const settingsSectionActive = computed(() =>
  settingsSections.includes(activeSection.value as SettingsMissionSection),
);
const mobilePrimarySectionCycleLabel = computed(() =>
  activeSection.value === "today" ? "Switch to projects" : "Switch to journal",
);
const mobilePrimarySectionIcon = computed<UiIconName>(() =>
  activeSection.value === "today" ? "LayoutGrid" : "CalendarDays",
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
const selectedProjectTasks = computed(() => {
  const projectId = selectedProjectDetail.value?.id;
  if (!projectId) {
    return projectTasks.value.filter((task) => task.status !== "cancelled");
  }
  return projectTasks.value.filter(
    (task) => task.projectId === projectId && task.status !== "cancelled",
  );
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
    !selectedProjectDetail.value,
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
const selectedArchiveEntry = computed(
  () =>
    journalArchiveEntries.value.find(
      (entry) => entry.date === selectedArchiveDate.value,
    ) ||
    journalArchiveEntries.value[0] ||
    null,
);
const selectedArchiveProject = computed(
  () =>
    projects.value.find(
      (project) => project.id === selectedArchiveProjectId.value,
    ) || null,
);
const selectedArchiveLabel = computed(() =>
  selectedArchiveProject.value
    ? `${selectedArchiveProject.value.name} archive`
    : "Journal archive",
);
const selectedProjectArchiveTask = computed(
  () =>
    projectArchiveTasks.value.find(
      (task) => task.id === selectedProjectArchiveTaskId.value,
    ) ||
    projectArchiveTasks.value[0] ||
    null,
);

async function loadOverview() {
  const requestDate = selectedDate.value;
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get<MissionOverviewResponse>(
      `/mission-control/overview?date=${encodeURIComponent(requestDate)}`,
    );
    if (selectedDate.value !== requestDate) return;
    applyOverview(response);
  } catch (e) {
    if (selectedDate.value !== requestDate) return;
    error.value =
      e instanceof ApiError ? e.message : "Mission Control could not load";
  } finally {
    if (selectedDate.value === requestDate) loading.value = false;
  }
}

function applyOverview(response: MissionOverviewResponse) {
  day.value = response.day;
  captures.value = response.captures || [];
  projects.value = response.projects || [];
  tasksDueToday.value = response.tasksDueToday || [];
  pendingApprovals.value = response.pendingApprovals || [];
  recentRuns.value = response.recentRuns || [];
  activity.value = response.activity || [];
  latestBriefing.value = response.latestBriefing || null;
  journalDraft.value = response.day?.journalText || "";
  journalState.value = "idle";
  if (!selectedProjectId.value && projects.value[0]) {
    selectedProjectId.value = projects.value[0].id;
  }
  if (
    selectedProjectDetailId.value &&
    !projects.value.some(
      (project) => project.id === selectedProjectDetailId.value,
    )
  ) {
    selectedProjectDetailId.value = "";
  }
  void loadMemoryAndSources();
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
    await loadOverview();
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
    await loadOverview();
  } catch (e) {
    toastFromUnknown(e, "Could not retry local run");
  } finally {
    localRunActionId.value = "";
  }
}

function dailyBriefingDismissKey(briefing: MissionDailyBriefing) {
  return `mission-daily-briefing-dismissed:${briefing.date}:${briefing.id}`;
}

function isDailyBriefingDismissed(briefing: MissionDailyBriefing) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(dailyBriefingDismissKey(briefing)) === "1";
}

function dismissDailyBriefing(briefing: MissionDailyBriefing) {
  window.localStorage.setItem(dailyBriefingDismissKey(briefing), "1");
  latestBriefing.value = { ...briefing, showInJournal: false };
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

async function loadJournalArchive() {
  journalArchiveLoading.value = true;
  journalArchiveError.value = "";
  try {
    const response = await api.get<MissionJournalArchiveResponse>(
      "/mission-control/journal-archive",
    );
    journalArchiveEntries.value = response.entries || [];
    if (
      selectedArchiveDate.value &&
      journalArchiveEntries.value.some(
        (entry) => entry.date === selectedArchiveDate.value,
      )
    ) {
      return;
    }
    selectedArchiveDate.value = journalArchiveEntries.value[0]?.date || "";
  } catch (e) {
    journalArchiveError.value =
      e instanceof ApiError ? e.message : "Journal archive could not load";
    journalArchiveEntries.value = [];
    selectedArchiveDate.value = "";
  } finally {
    journalArchiveLoading.value = false;
  }
}

async function loadProjectArchive(projectId = selectedArchiveProjectId.value) {
  if (!projectId) {
    projectArchiveTasks.value = [];
    projectArchiveNextCursor.value = null;
    selectedProjectArchiveTaskId.value = "";
    return;
  }
  projectArchiveLoading.value = true;
  projectArchiveError.value = "";
  try {
    const response = await api.get<MissionTasksResponse>(
      missionTasksUrl({ archived: true, projectId }),
    );
    if (selectedArchiveProjectId.value !== projectId) return;
    projectArchiveTasks.value = response.tasks || [];
    projectArchiveNextCursor.value = response.nextCursor || null;
    if (
      selectedProjectArchiveTaskId.value &&
      projectArchiveTasks.value.some(
        (task) => task.id === selectedProjectArchiveTaskId.value,
      )
    ) {
      return;
    }
    selectedProjectArchiveTaskId.value = projectArchiveTasks.value[0]?.id || "";
  } catch (e) {
    projectArchiveError.value =
      e instanceof ApiError ? e.message : "Project archive could not load";
    projectArchiveTasks.value = [];
    projectArchiveNextCursor.value = null;
    selectedProjectArchiveTaskId.value = "";
  } finally {
    projectArchiveLoading.value = false;
  }
}

async function loadMoreProjectArchive() {
  const projectId = selectedArchiveProjectId.value;
  const cursor = projectArchiveNextCursor.value;
  if (!projectId || !cursor || projectArchiveLoadingMore.value) return;
  projectArchiveLoadingMore.value = true;
  projectArchiveError.value = "";
  try {
    const response = await api.get<MissionTasksResponse>(
      missionTasksUrl({ archived: true, projectId, cursor }),
    );
    if (selectedArchiveProjectId.value !== projectId) return;
    projectArchiveTasks.value = appendUniqueTasks(
      projectArchiveTasks.value,
      response.tasks || [],
    );
    projectArchiveNextCursor.value = response.nextCursor || null;
  } catch (e) {
    projectArchiveError.value =
      e instanceof ApiError ? e.message : "Could not load more archived tasks";
  } finally {
    projectArchiveLoadingMore.value = false;
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

async function submitCapture() {
  const text = captureText.value.trim();
  if (!text || savingCapture.value) return;
  savingCapture.value = true;
  error.value = "";
  const hasPickedSchedule =
    captureType.value !== "task" && scheduledDate.value && scheduledTime.value;
  try {
    const response = await api.post<{ capture: MissionCapture }>(
      "/mission-control/capture",
      {
        date: selectedDate.value,
        text,
        type: captureType.value,
        projectId: selectedProjectId.value || undefined,
        scheduledDate: hasPickedSchedule ? scheduledDate.value : undefined,
        scheduledTime: hasPickedSchedule ? scheduledTime.value : undefined,
        timezone: hasPickedSchedule
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined,
      },
    );
    captureText.value = "";
    manualCaptureType.value = false;
    captureType.value = "task";
    schedulePickerOpen.value = false;
    scheduleDateTime.value = "";
    upsertCapture(response.capture);
    toastSuccess(`${captureTypeLabel(response.capture.type)} captured`);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Capture failed";
  } finally {
    savingCapture.value = false;
  }
}

async function setCaptureStatus(
  capture: MissionCapture,
  status: "open" | "done",
) {
  try {
    const response = await api.patch<{ capture: MissionCapture }>(
      `/mission-control/capture/${encodeURIComponent(capture.id)}`,
      { status },
    );
    replaceCapture(response.capture);
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : "Could not update capture";
  }
}

async function archiveCapture(capture: MissionCapture) {
  try {
    await api.delete<{ ok: true }>(
      `/mission-control/capture/${encodeURIComponent(capture.id)}`,
    );
    captures.value = captures.value.filter((item) => item.id !== capture.id);
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : "Could not archive capture";
  }
}

async function archiveTask(task: MissionTask) {
  try {
    await api.delete(`/mission-control/tasks/${encodeURIComponent(task.id)}`);
    tasksDueToday.value = tasksDueToday.value.filter(
      (item) => item.id !== task.id,
    );
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not remove task";
  }
}

function replaceCapture(next: MissionCapture) {
  upsertCapture(next);
}

function upsertCapture(next: MissionCapture) {
  const index = captures.value.findIndex((item) => item.id === next.id);
  if (index >= 0) captures.value.splice(index, 1, next);
  else captures.value.unshift(next);
}

async function saveJournalNow() {
  if (!day.value) return;
  journalState.value = "saving";
  try {
    const response = await api.patch<{ day: MissionDay }>(
      `/mission-control/days/${encodeURIComponent(selectedDate.value)}`,
      {
        journalText: journalDraft.value,
      },
    );
    day.value = response.day;
    journalState.value = "saved";
  } catch {
    journalState.value = "error";
  }
}

function scheduleJournalSave() {
  if (!day.value) return;
  if (journalSaveTimer) window.clearTimeout(journalSaveTimer);
  journalState.value = "saving";
  journalSaveTimer = window.setTimeout(() => {
    void saveJournalNow();
  }, 700);
}

async function flushPendingJournalSave() {
  if (journalSaveTimer) {
    window.clearTimeout(journalSaveTimer);
    journalSaveTimer = null;
  }
  if (day.value && journalDraft.value !== day.value.journalText) {
    await saveJournalNow();
  }
}

async function selectJournalDate(
  date: string,
  options: { openToday?: boolean } = {},
) {
  const normalizedDate = normalizeLocalDateInput(date);
  if (!normalizedDate) return;
  await flushPendingJournalSave();
  selectedDate.value = normalizedDate;
  datePickerOpen.value = false;
  if (options.openToday) setSection("today");
}

function toggleDatePicker() {
  if (!datePickerOpen.value) {
    datePickerMonth.value = monthKey(selectedDate.value);
  }
  settingsMenuOpen.value = false;
  projectPickerOpen.value = false;
  archivePickerOpen.value = false;
  datePickerOpen.value = !datePickerOpen.value;
}

function moveDatePickerMonth(delta: number) {
  datePickerMonth.value = addMonths(datePickerMonth.value, delta);
}

function chooseDatePickerDay(date: string) {
  void selectJournalDate(date);
}

function pickToday() {
  void selectJournalDate(todayKey());
}

function openJournalArchive() {
  selectedArchiveDate.value = selectedDate.value;
  selectedArchiveProjectId.value = "";
  archivePickerOpen.value = false;
  datePickerOpen.value = false;
  setSection("journalArchive");
}

function openSelectedArchiveEntry() {
  if (!selectedArchiveEntry.value) return;
  void selectJournalDate(selectedArchiveEntry.value.date, { openToday: true });
}

function toggleProjectPicker() {
  datePickerOpen.value = false;
  archivePickerOpen.value = false;
  settingsMenuOpen.value = false;
  projectPickerOpen.value = !projectPickerOpen.value;
}

function selectProjectDetail(projectId: string) {
  selectedProjectDetailId.value = projectId;
  projectPickerOpen.value = false;
  resetProjectTaskComposer();
}

function toggleArchivePicker() {
  datePickerOpen.value = false;
  projectPickerOpen.value = false;
  settingsMenuOpen.value = false;
  archivePickerOpen.value = !archivePickerOpen.value;
}

function selectJournalArchive() {
  selectedArchiveProjectId.value = "";
  archivePickerOpen.value = false;
  if (
    journalArchiveEntries.value.length === 0 &&
    !journalArchiveLoading.value
  ) {
    void loadJournalArchive();
  }
}

function selectProjectArchive(projectId: string) {
  selectedArchiveProjectId.value = projectId;
  selectedProjectArchiveTaskId.value = "";
  archivePickerOpen.value = false;
  void loadProjectArchive(projectId);
}

function setSection(section: MissionSection) {
  activeSection.value = section;
  settingsMenuOpen.value = false;
  datePickerOpen.value = false;
  projectPickerOpen.value = false;
  archivePickerOpen.value = false;
  if (section !== "projects") resetProjectTaskComposer();
  void router.replace({
    query: {
      ...route.query,
      section: section === "today" ? undefined : sectionQueryValue(section),
    },
  });
}

function cyclePrimarySection() {
  setSection(activeSection.value === "today" ? "projects" : "today");
}

function openProjectModal() {
  projectPickerOpen.value = false;
  archivePickerOpen.value = false;
  projectTitle.value = "";
  projectDescription.value = "";
  projectType.value = "standard";
  projectLocalPath.value = "";
  projectLogoData.value = "";
  projectLogoName.value = "";
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
    selectedProjectId.value ||= response.project.id;
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
}

function openProjectTaskComposer(status: ProjectBoardStatus) {
  if (projectTaskSaving.value) return;
  projectTaskComposerStatus.value = status;
  projectTaskDraft.value = "";
  void nextTick(() => {
    document
      .querySelector<HTMLInputElement>(".project-task-composer__input")
      ?.focus();
  });
}

function cancelProjectTaskComposer() {
  if (projectTaskSaving.value) return;
  resetProjectTaskComposer();
}

async function addProjectTask(status: ProjectBoardStatus) {
  const title = projectTaskDraft.value.trim();
  const project = selectedProjectDetail.value;
  if (!title || !project || projectTaskSaving.value) return;
  projectTaskSaving.value = true;
  projectTasksError.value = "";
  try {
    const response = await api.post<{ task: MissionTask }>(
      "/mission-control/tasks",
      {
        title,
        projectId: project.id,
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
    if (tasksDueToday.value.some((item) => item.id === response.task.id)) {
      tasksDueToday.value = tasksDueToday.value.map((item) =>
        item.id === response.task.id ? response.task : item,
      );
    }
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not update task";
  } finally {
    projectTaskActionId.value = "";
  }
}

function startProjectTaskDrag(event: DragEvent, task: MissionTask) {
  if (projectTaskActionId.value) {
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

async function archiveProjectTask(task: MissionTask) {
  if (projectTaskActionId.value) return;
  projectTaskActionId.value = task.id;
  projectTasksError.value = "";
  try {
    await api.delete(`/mission-control/tasks/${encodeURIComponent(task.id)}`);
    projectTasks.value = projectTasks.value.filter(
      (item) => item.id !== task.id,
    );
    tasksDueToday.value = tasksDueToday.value.filter(
      (item) => item.id !== task.id,
    );
  } catch (e) {
    projectTasksError.value =
      e instanceof ApiError ? e.message : "Could not archive task";
  } finally {
    projectTaskActionId.value = "";
  }
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

function moveDay(delta: number) {
  void selectJournalDate(addDays(selectedDate.value, delta));
}

function chooseType(type: MissionCaptureType) {
  captureType.value = type;
  manualCaptureType.value = true;
  if (type === "task") {
    schedulePickerOpen.value = false;
    return;
  }
  scheduleDateTime.value ||= defaultScheduleDateTime(selectedDate.value);
  schedulePickerOpen.value = true;
}

function closeSchedulePicker() {
  schedulePickerOpen.value = false;
}

function clearSchedulePicker() {
  scheduleDateTime.value = "";
  schedulePickerOpen.value = false;
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

function captureTypeLabel(type: MissionCaptureType): string {
  if (type === "reminder") return "Reminder";
  if (type === "event") return "Event";
  return "Task";
}

function syncLabel(capture: MissionCapture): string {
  if (capture.syncStatus === "synced") return "Synced";
  if (capture.syncStatus === "pending") return "Pending";
  if (capture.syncStatus === "setup_required") return "Setup";
  if (capture.syncStatus === "failed") return "Failed";
  return "Local";
}

function projectName(projectId: string | null): string {
  if (!projectId) return "Personal";
  return (
    projects.value.find((project) => project.id === projectId)?.name ||
    "Personal"
  );
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

function taskStatusLabel(status: MissionTask["status"]): string {
  if (status === "in_progress") return "Doing";
  if (status === "review") return "Review";
  if (status === "done") return "Done";
  if (status === "cancelled") return "Cancelled";
  return "Backlog";
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

function formatDaySwitcherDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatArchiveDate(value: string): string {
  if (value === todayKey()) return "Today";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
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

function formatProjectArchiveLine(task: MissionTask): string {
  const archived = task.archivedAt ? formatShortDate(task.archivedAt) : "";
  const status = taskStatusLabel(task.status);
  return archived ? `${status} - Archived ${archived}` : status;
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

function defaultScheduleDateTime(date: string): string {
  return `${date}T09:00`;
}

function normalizeLocalDateInput(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizeLocalTimeInput(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (!match) return "";
  return `${match[1]}:${match[2]}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, dayNumber] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, dayNumber + days);
  return dateToKey(date);
}

function addMonths(monthKeyValue: string, months: number): string {
  const [year, month] = monthKeyValue.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(dateKey: string): string {
  const normalized = normalizeLocalDateInput(dateKey);
  if (normalized) return normalized.slice(0, 7);
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function todayKey(): string {
  const date = new Date();
  return dateToKey(date);
}

function sectionQueryValue(section: MissionSection): string {
  if (section === "journalArchive") return "journal-archive";
  return section;
}

function normalizeSection(value: unknown): MissionSection {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "journal") return "today";
  if (raw === "archive" || raw === "journal-archive") return "journalArchive";
  if (raw === "approvals" || raw === "runs") return "activity";
  return sectionIds.includes(raw as MissionSection)
    ? (raw as MissionSection)
    : "today";
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && archivePickerOpen.value) {
    archivePickerOpen.value = false;
    return;
  }
  if (event.key === "Escape" && projectPickerOpen.value) {
    projectPickerOpen.value = false;
    return;
  }
  if (event.key === "Escape" && datePickerOpen.value) {
    datePickerOpen.value = false;
    return;
  }
  if (event.key === "Escape" && schedulePickerOpen.value) {
    closeSchedulePicker();
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
  datePickerOpen.value = false;
  projectPickerOpen.value = false;
  archivePickerOpen.value = false;
}

watch(captureText, (text) => {
  if (!text.trim()) {
    manualCaptureType.value = false;
    captureType.value = "task";
    schedulePickerOpen.value = false;
    scheduleDateTime.value = "";
    return;
  }
  if (!manualCaptureType.value) {
    captureType.value = inferMissionCaptureType(text);
  }
});

watch(selectedDate, (nextDate, previousDate) => {
  if (scheduleDateTime.value && scheduledDate.value === previousDate) {
    scheduleDateTime.value = `${nextDate}T${scheduledTime.value || "09:00"}`;
  }
  doneCapturesOpen.value = false;
  datePickerMonth.value = monthKey(nextDate);
  void loadOverview();
});

watch(journalDraft, (next, previous) => {
  if (!day.value || next === previous || next === day.value.journalText) return;
  scheduleJournalSave();
});

watch(
  () => route.query.section,
  (section) => {
    activeSection.value = normalizeSection(section);
  },
);

watch(activeSection, (section) => {
  if (section === "journalArchive") {
    if (selectedArchiveProjectId.value) void loadProjectArchive();
    else void loadJournalArchive();
  }
  if (section === "projects") void loadProjectTasks();
  if (section === "accounts") void loadAccounts();
});

watch(selectedProjectDetailId, (next, previous) => {
  if (next === previous) return;
  if (activeSection.value === "projects") void loadProjectTasks(next);
});

onMounted(() => {
  void loadOverview();
  void loadPluginCapabilities();
  if (activeSection.value === "journalArchive") {
    if (selectedArchiveProjectId.value) void loadProjectArchive();
    else void loadJournalArchive();
  }
  if (activeSection.value === "projects") void loadProjectTasks();
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("click", handleWindowClick);
});

onBeforeUnmount(() => {
  if (journalSaveTimer) window.clearTimeout(journalSaveTimer);
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener("click", handleWindowClick);
});
</script>

<template>
  <main class="mission-control">
    <header class="mission-control__topbar">
      <nav
        class="mission-control__sections"
        aria-label="Mission Control primary sections"
      >
        <button
          v-for="section in primarySections"
          :key="section"
          type="button"
          class="mission-control__section-tab"
          :class="{ 'is-active': activeSection === section }"
          @click="setSection(section)"
        >
          {{ sectionLabels[section] }}
        </button>
      </nav>

      <div
        v-if="activeSection === 'today'"
        class="mission-control__day-switcher"
        aria-label="Selected day"
        @click.stop
      >
        <button
          type="button"
          class="icon-button"
          aria-label="Previous day"
          @click="moveDay(-1)"
        >
          <UiIcon name="ChevronLeft" :size="18" />
        </button>
        <button
          type="button"
          class="mission-control__day-label"
          :aria-expanded="datePickerOpen"
          aria-haspopup="dialog"
          aria-label="Choose journal date"
          @click="toggleDatePicker"
        >
          <strong>{{ selectedDateLabel }}</strong>
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label="Next day"
          @click="moveDay(1)"
        >
          <UiIcon name="ChevronRight" :size="18" />
        </button>
        <DatePickerPopover
          v-if="datePickerOpen"
          :month-key="datePickerMonth"
          :selected-date="selectedDate"
          :today-date="todayKey()"
          aria-label="Choose journal date"
          secondary-action-label="View archive"
          @move-month="moveDatePickerMonth"
          @select-date="chooseDatePickerDay"
          @today="pickToday"
          @secondary-action="openJournalArchive"
        />
      </div>
      <div
        v-else-if="activeSection === 'projects'"
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
          <button
            type="button"
            class="text-button text-button--primary project-picker-popover__add"
            @click="openProjectModal"
          >
            <UiIcon name="Plus" :size="15" />
            Add project
          </button>
        </div>
      </div>
      <div
        v-else-if="activeSection === 'journalArchive'"
        class="mission-control__archive-switcher"
        aria-label="Selected archive"
        @click.stop
      >
        <button
          type="button"
          class="mission-control__archive-label"
          :aria-expanded="archivePickerOpen"
          aria-haspopup="dialog"
          aria-label="Choose archive"
          @click="toggleArchivePicker"
        >
          <strong>{{ selectedArchiveLabel }}</strong>
          <UiIcon
            name="ChevronDown"
            :size="15"
            class="mission-control__project-caret"
          />
        </button>
        <div
          v-if="archivePickerOpen"
          class="archive-picker-popover"
          role="dialog"
          aria-label="Choose archive"
        >
          <button
            type="button"
            class="archive-picker-popover__item"
            :class="{ 'is-active': !selectedArchiveProject }"
            @click="selectJournalArchive"
          >
            Journal archive
          </button>
          <button
            v-for="project in projects"
            :key="project.id"
            type="button"
            class="archive-picker-popover__item"
            :class="{ 'is-active': selectedArchiveProject?.id === project.id }"
            @click="selectProjectArchive(project.id)"
          >
            {{ project.name }} archive
          </button>
          <div
            v-if="projects.length === 0"
            class="archive-picker-popover__empty"
          >
            No projects yet.
          </div>
        </div>
      </div>
      <div v-else class="mission-control__section-title">
        {{ sectionLabels[activeSection] }}
      </div>

      <button
        type="button"
        class="icon-button mission-control__mobile-section-cycle"
        :aria-label="mobilePrimarySectionCycleLabel"
        :title="mobilePrimarySectionCycleLabel"
        @click="cyclePrimarySection"
      >
        <UiIcon :name="mobilePrimarySectionIcon" :size="18" />
      </button>

      <div class="settings-menu" @click.stop>
        <button
          type="button"
          class="icon-button"
          :class="{ 'is-active': settingsMenuOpen || settingsSectionActive }"
          aria-label="Mission Control settings"
          :aria-expanded="settingsMenuOpen"
          aria-haspopup="menu"
          @click="
            settingsMenuOpen = !settingsMenuOpen;
            datePickerOpen = false;
            projectPickerOpen = false;
            archivePickerOpen = false;
          "
        >
          <UiIcon name="Settings" :size="18" />
        </button>
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
    </header>

    <p v-if="error" class="mission-control__message is-error">{{ error }}</p>

    <section v-show="activeSection === 'today'" class="mission-page">
      <div class="daily-sheet">
        <section
          v-if="visibleDailyBriefing"
          class="daily-briefing-panel"
          aria-label="Daily briefing"
        >
          <div class="daily-briefing-panel__copy">
            <h2>{{ visibleDailyBriefing.title }}</h2>
            <p>{{ visibleDailyBriefing.message }}</p>
          </div>
          <button
            type="button"
            class="icon-button quiet"
            aria-label="Dismiss daily briefing"
            @click="dismissDailyBriefing(visibleDailyBriefing)"
          >
            <UiIcon name="X" :size="16" />
          </button>
        </section>

        <form class="capture-row" @submit.prevent="submitCapture">
          <input
            v-model="captureText"
            type="text"
            class="capture-row__input"
            :placeholder="capturePlaceholder"
            autocomplete="off"
          />
          <select
            v-model="selectedProjectId"
            class="capture-row__project"
            aria-label="Project"
          >
            <option
              v-for="project in activeProjectOptions"
              :key="project.id"
              :value="project.id"
            >
              {{ project.name }}
            </option>
          </select>
          <div class="capture-row__type" role="group" aria-label="Capture type">
            <button
              v-for="option in captureTypeOptions"
              :key="option.id"
              type="button"
              class="type-button"
              :class="{ 'is-active': captureType === option.id }"
              :aria-label="option.label"
              :title="option.label"
              @click="chooseType(option.id)"
            >
              <UiIcon :name="option.icon" :size="18" />
            </button>
          </div>
          <button
            type="submit"
            class="capture-row__submit"
            :disabled="savingCapture || !captureText.trim()"
            aria-label="Add capture"
          >
            <UiIcon name="Plus" :size="18" />
          </button>
        </form>

        <section
          v-if="showCaptureList"
          class="capture-list"
          aria-label="Today list"
        >
          <article
            v-for="capture in openCaptures"
            :key="capture.id"
            class="capture-item"
          >
            <button
              type="button"
              class="capture-item__check"
              aria-label="Mark done"
              @click="setCaptureStatus(capture, 'done')"
            >
              <UiIcon name="Square" :size="16" />
            </button>
            <div class="capture-item__body">
              <p>{{ capture.text }}</p>
              <div class="capture-item__meta">
                <span>{{ captureTypeLabel(capture.type) }}</span>
                <span>{{ projectName(capture.projectId) }}</span>
                <span v-if="capture.dueAt || capture.eventStartAt">
                  {{ formatDateTime(capture.eventStartAt || capture.dueAt) }}
                </span>
                <span
                  :class="`sync-pill sync-pill--${capture.syncStatus}`"
                  :title="capture.syncError || syncLabel(capture)"
                >
                  {{ syncLabel(capture) }}
                </span>
              </div>
            </div>
            <button
              type="button"
              class="icon-button quiet"
              aria-label="Archive capture"
              @click="archiveCapture(capture)"
            >
              <UiIcon name="X" :size="16" />
            </button>
          </article>

          <article
            v-for="task in visibleScheduledTasks"
            :key="task.id"
            class="capture-item capture-item--scheduled"
          >
            <span class="capture-item__check capture-item__check--static">
              <UiIcon name="CalendarDays" :size="16" />
            </span>
            <div class="capture-item__body">
              <p>{{ task.title }}</p>
              <div class="capture-item__meta">
                <span>Scheduled</span>
                <span>{{ projectName(task.projectId) }}</span>
                <span>{{
                  formatShortDate(task.dueAt || task.scheduledFor)
                }}</span>
              </div>
            </div>
            <button
              type="button"
              class="icon-button quiet"
              aria-label="Archive scheduled task"
              @click="archiveTask(task)"
            >
              <UiIcon name="X" :size="16" />
            </button>
          </article>

          <template v-if="doneCaptures.length">
            <button
              type="button"
              class="list-divider list-divider--toggle"
              :aria-expanded="doneCapturesOpen"
              @click="doneCapturesOpen = !doneCapturesOpen"
            >
              <UiIcon name="ChevronDown" :size="14" />
              Done ({{ doneCaptures.length }})
            </button>
            <template v-if="doneCapturesOpen">
              <article
                v-for="capture in doneCaptures"
                :key="capture.id"
                class="capture-item capture-item--done"
              >
                <button
                  type="button"
                  class="capture-item__check"
                  aria-label="Reopen"
                  @click="setCaptureStatus(capture, 'open')"
                >
                  <UiIcon name="SquareCheck" :size="16" />
                </button>
                <div class="capture-item__body">
                  <p>{{ capture.text }}</p>
                  <div class="capture-item__meta">
                    <span>{{ captureTypeLabel(capture.type) }}</span>
                    <span>{{ projectName(capture.projectId) }}</span>
                  </div>
                </div>
              </article>
            </template>
          </template>
        </section>

        <section class="journal-sheet" aria-label="Journal entry">
          <span v-if="journalStatusText" class="journal-editor__status">
            {{ journalStatusText }}
          </span>
          <textarea
            v-model="journalDraft"
            class="journal-editor__textarea"
            rows="12"
            placeholder="Journal entry field..."
          />
        </section>
      </div>
    </section>

    <section v-show="activeSection === 'journalArchive'" class="mission-page">
      <div class="archive-sheet">
        <template v-if="!selectedArchiveProject">
          <div v-if="journalArchiveLoading" class="empty-row">
            Loading archive...
          </div>
          <div v-else-if="journalArchiveError" class="empty-row is-error">
            {{ journalArchiveError }}
          </div>
          <div v-else-if="journalArchiveEntries.length === 0" class="empty-row">
            No journal entries yet.
          </div>
          <div v-else class="journal-archive">
            <div class="journal-archive__list" aria-label="Journal entries">
              <button
                v-for="entry in journalArchiveEntries"
                :key="entry.id"
                type="button"
                class="journal-archive__row"
                :class="{ 'is-active': selectedArchiveEntry?.id === entry.id }"
                @click="selectedArchiveDate = entry.date"
              >
                <strong>{{ formatArchiveDate(entry.date) }}</strong>
                <span>{{ entry.preview }}</span>
              </button>
            </div>

            <article
              v-if="selectedArchiveEntry"
              class="journal-archive__preview"
            >
              <div class="journal-archive__preview-header">
                <h2>{{ formatArchiveDate(selectedArchiveEntry.date) }}</h2>
                <button
                  type="button"
                  class="text-button"
                  @click="openSelectedArchiveEntry"
                >
                  Open entry
                </button>
              </div>
              <p>{{ selectedArchiveEntry.journalText }}</p>
            </article>
          </div>
        </template>

        <template v-else>
          <div v-if="projectArchiveLoading" class="empty-row">
            Loading archive...
          </div>
          <div v-else-if="projectArchiveError" class="empty-row is-error">
            {{ projectArchiveError }}
          </div>
          <div v-else-if="projectArchiveTasks.length === 0" class="empty-row">
            No archived tasks for {{ selectedArchiveProject.name }} yet.
          </div>
          <div v-else class="journal-archive">
            <div
              class="journal-archive__list"
              aria-label="Archived project tasks"
            >
              <button
                v-for="task in projectArchiveTasks"
                :key="task.id"
                type="button"
                class="journal-archive__row"
                :class="{
                  'is-active': selectedProjectArchiveTask?.id === task.id,
                }"
                @click="selectedProjectArchiveTaskId = task.id"
              >
                <strong>{{ task.title }}</strong>
                <span>{{ formatProjectArchiveLine(task) }}</span>
              </button>
              <button
                v-if="projectArchiveNextCursor"
                type="button"
                class="load-more-row"
                :disabled="projectArchiveLoadingMore"
                @click="loadMoreProjectArchive"
              >
                <UiIcon name="ChevronDown" :size="15" />
                {{ projectArchiveLoadingMore ? "Loading..." : "Load more" }}
              </button>
            </div>

            <article
              v-if="selectedProjectArchiveTask"
              class="journal-archive__preview"
            >
              <div class="journal-archive__preview-header">
                <h2>{{ selectedProjectArchiveTask.title }}</h2>
                <span class="status-badge">
                  {{ taskStatusLabel(selectedProjectArchiveTask.status) }}
                </span>
              </div>
              <p>
                {{
                  selectedProjectArchiveTask.description ||
                  "No notes for this task."
                }}
              </p>
            </article>
          </div>
        </template>
      </div>
    </section>

    <section v-show="activeSection === 'projects'" class="mission-page">
      <div class="projects-workspace">
          <div v-if="selectedProjectIsLocal" class="local-project-summary">
            <div>
              <strong>Local project</strong>
              <span>{{ localProjectPath(selectedProjectDetail) }}</span>
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

                <div
                  v-if="column.tasks.length === 0"
                  class="project-board__empty"
                >
                  No tasks
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
                  draggable="true"
                  @dragstart="startProjectTaskDrag($event, task)"
                  @dragend="endProjectTaskDrag"
                >
                  <p>{{ task.title }}</p>
                  <div class="project-task-card__meta">
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
                  <div class="project-task-card__actions">
                    <button
                      v-if="isLocalProject(projectForTask(task))"
                      type="button"
                      class="project-task-card__run"
                      :disabled="Boolean(projectTaskLocalRunId)"
                      @click="runProjectTaskLocally(task)"
                    >
                      <UiIcon name="Play" :size="14" />
                      {{
                        projectTaskLocalRunId === task.id
                          ? "Queuing..."
                          : "Run locally"
                      }}
                    </button>
                    <button
                      type="button"
                      class="icon-button quiet"
                      aria-label="Archive task"
                      :disabled="
                        projectTaskActionId === task.id ||
                        projectTaskLocalRunId === task.id
                      "
                      @click="archiveProjectTask(task)"
                    >
                      <UiIcon name="X" :size="15" />
                    </button>
                  </div>
                </article>
                <form
                  v-if="
                    selectedProjectDetail &&
                    projectTaskComposerStatus === column.id
                  "
                  class="project-task-composer"
                  @submit.prevent="addProjectTask(column.id)"
                >
                  <input
                    v-model="projectTaskDraft"
                    class="project-task-composer__input"
                    type="text"
                    placeholder="Task name"
                    autocomplete="off"
                    @keydown.esc.prevent="cancelProjectTaskComposer"
                  />
                  <div class="project-task-composer__actions">
                    <button
                      type="button"
                      class="icon-button quiet"
                      aria-label="Cancel task"
                      :disabled="projectTaskSaving"
                      @click="cancelProjectTaskComposer"
                    >
                      <UiIcon name="X" :size="15" />
                    </button>
                    <button
                      type="submit"
                      class="icon-button"
                      aria-label="Add task"
                      :disabled="projectTaskCreateDisabled"
                    >
                      <UiIcon name="Plus" :size="16" />
                    </button>
                  </div>
                </form>
                <button
                  v-else-if="selectedProjectDetail"
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
        <router-link
          class="text-button text-button--primary"
          to="/account?section=plugins&blocked=me3.accounts"
        >
          Open plugin settings
        </router-link>
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
            <button
              type="button"
              class="text-button"
              @click="chooseAccountsImportFile"
            >
              <UiIcon name="Upload" :size="15" />
              {{ accountsImporting ? "Importing..." : "Import CSV" }}
            </button>
            <button
              type="button"
              class="text-button"
              @click="exportAccountsCsv"
            >
              <UiIcon name="Download" :size="15" />
              Export CSV
            </button>
            <button
              type="button"
              class="text-button text-button--primary"
              :disabled="accountsSyncing || !accountsStripeConfigured"
              @click="syncAccountsStripe"
            >
              <UiIcon name="RefreshCw" :size="15" />
              {{ accountsSyncing ? "Syncing..." : "Sync Stripe" }}
            </button>
            <button
              type="button"
              class="text-button text-button--primary"
              @click="openAccountsModal"
            >
              <UiIcon name="Plus" :size="15" />
              Add entry
            </button>
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
          <button
            type="button"
            class="text-button"
            @click="applyAccountsFilters"
          >
            Search
          </button>
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
              <button
                type="button"
                class="icon-button quiet"
                aria-label="Delete entry"
                @click="deleteAccountEntry(entry)"
              >
                <UiIcon name="Trash2" :size="15" />
              </button>
            </article>
          </template>
        </div>

        <div class="accounts-pagination">
          <span>{{ accountsEntryCountLabel }} - page {{ accountsPage }}</span>
          <div>
            <button
              type="button"
              class="icon-button quiet"
              :disabled="!accountsHasPrevious"
              aria-label="Previous page"
              @click="pageAccounts(-1)"
            >
              <UiIcon name="ChevronLeft" :size="18" />
            </button>
            <button
              type="button"
              class="icon-button quiet"
              :disabled="!accountsHasNext"
              aria-label="Next page"
              @click="pageAccounts(1)"
            >
              <UiIcon name="ChevronRight" :size="18" />
            </button>
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
            <button
              type="button"
              class="text-button text-button--danger"
              :disabled="activityItems.length === 0 || clearingActivity"
              @click="clearActivity"
            >
              {{ clearingActivity ? "Clearing" : "Clear activity" }}
            </button>
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
              <button
                v-if="item.canRetryLocalRun"
                type="button"
                class="text-button"
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
              </button>
              <button
                v-if="item.canCancelLocalRun"
                type="button"
                class="text-button text-button--danger"
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
              </button>
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
          <button type="submit" class="icon-button" aria-label="Add memory">
            <UiIcon name="Plus" :size="18" />
          </button>
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
            <button
              v-if="item.reviewStatus === 'needs_review'"
              type="button"
              class="text-button text-button--primary"
              :disabled="memoryActionId === item.id"
              @click="approveMemory(item)"
            >
              <UiIcon name="Check" :size="14" />
              Approve
            </button>
            <button
              type="button"
              class="text-button text-button--danger"
              :disabled="memoryActionId === item.id"
              @click="forgetMemory(item)"
            >
              <UiIcon name="Trash2" :size="14" />
              Forget
            </button>
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
          <button type="submit" class="icon-button" aria-label="Add source">
            <UiIcon name="Plus" :size="18" />
          </button>
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
        v-if="schedulePickerOpen && captureType !== 'task'"
        class="mission-modal mission-modal--compact"
        role="presentation"
        @click.self="closeSchedulePicker"
      >
        <form
          class="mission-modal__dialog schedule-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-title"
          @submit.prevent="closeSchedulePicker"
        >
          <div class="mission-modal__header">
            <h2 id="schedule-modal-title">{{ schedulePickerTitle }}</h2>
            <button
              type="button"
              class="icon-button quiet"
              aria-label="Close"
              @click="closeSchedulePicker"
            >
              <UiIcon name="X" :size="18" />
            </button>
          </div>

          <label class="field">
            <span>Date and time</span>
            <input v-model="scheduleDateTime" type="datetime-local" autofocus />
          </label>

          <div class="mission-modal__actions">
            <button
              type="button"
              class="text-button"
              @click="clearSchedulePicker"
            >
              Clear
            </button>
            <button
              type="button"
              class="text-button text-button--primary"
              @click="closeSchedulePicker"
            >
              Done
            </button>
          </div>
        </form>
      </div>

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
            <button
              type="button"
              class="icon-button quiet"
              aria-label="Close"
              @click="closeProjectModal"
            >
              <UiIcon name="X" :size="18" />
            </button>
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
            <button
              type="button"
              class="text-button"
              @click="removeProjectLogo"
            >
              Remove
            </button>
          </div>

          <p v-if="projectError" class="mission-modal__error">
            {{ projectError }}
          </p>

          <div class="mission-modal__actions">
            <button
              type="button"
              class="text-button"
              @click="closeProjectModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="text-button text-button--primary"
              :disabled="projectCreateDisabled"
            >
              {{ projectSaving ? "Adding..." : "Add project" }}
            </button>
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
            <button
              type="button"
              class="icon-button quiet"
              aria-label="Close"
              @click="closeAccountsModal"
            >
              <UiIcon name="X" :size="18" />
            </button>
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
            <button
              type="button"
              class="text-button"
              @click="closeAccountsModal"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="text-button text-button--primary"
              :disabled="accountsFormDisabled"
            >
              {{ accountsSaving ? "Adding..." : "Add entry" }}
            </button>
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
  grid-template-columns: minmax(0, 1fr) auto minmax(44px, 1fr);
  align-items: center;
  gap: 16px;
  min-height: 64px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--ui-border);
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.mission-control__sections {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
}

.mission-control__section-tab,
.mission-control__day-label,
.mission-control__project-label,
.mission-control__archive-label,
.type-button,
.icon-button,
.text-button,
.capture-row__submit {
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.mission-control__section-tab {
  min-height: 36px;
  padding: 6px 12px;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.mission-control__section-tab:hover,
.mission-control__section-tab.is-active {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.mission-control__day-switcher {
  position: relative;
  display: grid;
  grid-template-columns: 34px minmax(112px, 176px) 34px;
  align-items: center;
  justify-self: center;
  gap: 4px;
}

.mission-control__section-title {
  justify-self: center;
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.mission-control__project-switcher,
.mission-control__archive-switcher {
  position: relative;
  display: grid;
  justify-self: center;
  min-width: 0;
}

.mission-control__day-label,
.mission-control__project-label,
.mission-control__archive-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: var(--ui-radius-sm);
  line-height: 1.2;
}

.mission-control__day-label:hover,
.mission-control__day-label[aria-expanded="true"],
.mission-control__project-label:hover,
.mission-control__project-label[aria-expanded="true"],
.mission-control__archive-label:hover,
.mission-control__archive-label[aria-expanded="true"] {
  background: var(--ui-surface-muted);
}

.mission-control__day-label strong,
.mission-control__project-label strong,
.mission-control__archive-label strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-control__project-label,
.mission-control__archive-label {
  max-width: min(260px, calc(100vw - 120px));
}

.mission-control__project-caret {
  flex: 0 0 auto;
  color: var(--ui-text-muted);
  transition: transform 0.16s ease;
}

.mission-control__project-label[aria-expanded="true"]
  .mission-control__project-caret,
.mission-control__archive-label[aria-expanded="true"]
  .mission-control__project-caret {
  transform: rotate(180deg);
}

.capture-item__meta,
.detail-row p,
.simple-sheet__header span,
.journal-editor__status,
.detail-row__aside {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.icon-button,
.type-button,
.capture-row__submit {
  display: inline-grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: var(--ui-radius-sm);
}

.icon-button:hover,
.type-button:hover,
.capture-row__submit:hover,
.type-button.is-active,
.icon-button.is-active {
  background: var(--ui-accent-soft);
  color: var(--ui-accent-contrast);
}

.icon-button.quiet:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.settings-menu {
  position: relative;
  justify-self: end;
}

.mission-control__mobile-section-cycle {
  display: none;
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

.project-picker-popover,
.archive-picker-popover {
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

.project-picker-popover__item,
.archive-picker-popover__item {
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

.project-picker-popover__item > span:first-child,
.archive-picker-popover__item > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-picker-popover__item:hover,
.project-picker-popover__item.is-active,
.archive-picker-popover__item:hover,
.archive-picker-popover__item.is-active {
  background: var(--ui-surface-muted);
}

.project-picker-popover__empty,
.archive-picker-popover__empty {
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
  padding-top: 16px;
}

.daily-sheet,
.journal-sheet,
.simple-sheet {
  display: grid;
  width: min(700px, 100%);
  gap: 20px;
}

.archive-sheet {
  display: grid;
  width: min(920px, 100%);
  gap: 0;
}

.projects-workspace {
  display: grid;
  width: min(1120px, 100%);
  gap: 18px;
}

.simple-sheet--wide {
  width: min(920px, 100%);
}

.daily-briefing-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid var(--ui-border);
  padding: 0 0 16px;
}

.daily-briefing-panel__copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.daily-briefing-panel h2 {
  margin: 0;
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1.25;
}

.daily-briefing-panel p {
  margin: 0;
  white-space: pre-line;
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1.5;
}

.capture-row,
.inline-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(130px, 170px) auto 40px;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.capture-row__type {
  display: flex;
  gap: 2px;
}

.capture-row__input,
.capture-row__project,
.journal-editor__textarea,
.inline-form input,
.project-task-composer__input {
  width: 100%;
  min-width: 0;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
}

.capture-row__input,
.capture-row__project,
.inline-form input,
.project-task-composer__input {
  min-height: 40px;
  padding: 0 12px;
}

.capture-row__input::placeholder,
.journal-editor__textarea::placeholder,
.project-task-composer__input::placeholder {
  color: var(--ui-text-muted);
}

.capture-row__input:focus,
.capture-row__project:focus,
.journal-editor__textarea:focus,
.inline-form input:focus,
.project-task-composer__input:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.capture-row__submit {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.capture-row__submit:disabled,
.project-task-composer .icon-button:disabled,
.project-column-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.capture-list,
.simple-sheet,
.journal-sheet {
  display: grid;
  gap: 0;
}

.capture-list__header,
.simple-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 4px 0 12px;
  border-bottom: 1px solid var(--ui-border);
}

.capture-list__header h1,
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

.capture-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 36px;
  gap: 8px;
  align-items: center;
  min-height: 56px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ui-border);
}

.capture-item__check {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.capture-item__check:hover {
  color: var(--ui-accent);
}

.capture-item__check--static {
  cursor: default;
}

.capture-item__body {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.capture-item__body p,
.detail-row p {
  margin: 0;
}

.capture-item__body p {
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.45;
}

.capture-item--done .capture-item__body p {
  color: var(--ui-text-muted);
  text-decoration: line-through;
}

.capture-item--scheduled .capture-item__body p {
  color: var(--ui-text-muted);
}

.capture-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.sync-pill,
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

.sync-pill--synced,
.status-badge.ready {
  color: var(--ui-accent);
}

.sync-pill--setup_required,
.sync-pill--failed {
  color: #b91c1c;
}

.status-badge--needs_review {
  color: #b45309;
}

.status-badge--active {
  color: var(--ui-accent);
}

.list-divider {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 18px 0 6px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  text-align: left;
  text-transform: uppercase;
  cursor: default;
}

.list-divider--toggle {
  cursor: pointer;
}

.list-divider--toggle svg {
  transition: transform 0.16s ease;
}

.list-divider--toggle[aria-expanded="false"] svg {
  transform: rotate(-90deg);
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

.journal-sheet {
  gap: 12px;
}

.journal-editor__status {
  justify-self: end;
  padding-top: 4px;
}

.journal-editor__textarea {
  min-height: 260px;
  resize: vertical;
  padding: 18px 0;
  font-size: 16px;
  line-height: 1.65;
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

.memory-row__actions .text-button {
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

.activity-row__actions .text-button {
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
.project-board__empty,
.project-task-card__meta {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.project-board__empty {
  padding: 10px 0;
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

.project-task-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  cursor: grab;
  transition:
    border-color 0.16s ease,
    opacity 0.16s ease,
    transform 0.16s ease;
}

.project-task-card:active {
  cursor: grabbing;
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

.project-task-card__actions .icon-button {
  width: 28px;
  height: 28px;
}

.project-task-card__actions .icon-button:disabled {
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

.project-task-composer__input {
  min-height: 36px;
  padding: 0 8px;
}

.project-task-composer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.project-task-composer__actions .icon-button {
  width: 30px;
  height: 30px;
}

.project-task-composer__actions .icon-button[type="submit"] {
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

.accounts-toolbar__actions .text-button,
.accounts-pagination .text-button {
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

.accounts-table__row .icon-button {
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

.journal-archive {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 28px;
  min-width: 0;
}

.journal-archive__list {
  display: grid;
  align-content: start;
  min-width: 0;
}

.journal-archive__row {
  display: grid;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid var(--ui-border);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.journal-archive__row:hover,
.journal-archive__row.is-active {
  color: var(--ui-accent);
}

.journal-archive__row strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal-archive__row span {
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal-archive__preview {
  display: grid;
  align-content: start;
  gap: 16px;
  min-width: 0;
  padding-left: 28px;
  border-left: 1px solid var(--ui-border);
}

.journal-archive__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.journal-archive__preview h2 {
  margin: 0;
  overflow: hidden;
  font-size: 16px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal-archive__preview p {
  margin: 0;
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.inline-form {
  grid-template-columns: minmax(0, 1fr) 40px;
  margin: 14px 0 4px;
}

.text-button {
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
}

.text-button:hover {
  background: var(--ui-surface-muted);
}

.text-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.text-button--primary {
  border-color: transparent;
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.text-button--primary:hover {
  background: var(--ui-accent-strong);
}

.text-button--danger {
  border-color: color-mix(in oklab, #b91c1c, var(--ui-border) 60%);
  color: #b91c1c;
}

.text-button--danger:hover {
  background: color-mix(in oklab, #b91c1c, transparent 92%);
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
    grid-template-columns: minmax(0, 1fr) 36px 36px;
    gap: 6px;
    padding-left: 48px;
  }

  .mission-control__sections {
    display: none;
  }

  .mission-control__day-switcher,
  .mission-control__project-switcher,
  .mission-control__archive-switcher,
  .mission-control__section-title {
    grid-column: 1;
    grid-row: 1;
    justify-self: stretch;
  }

  .mission-control__day-switcher {
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    gap: 2px;
  }

  .mission-control__day-switcher .icon-button {
    width: 32px;
    height: 32px;
  }

  .mission-control__project-label,
  .mission-control__archive-label {
    max-width: none;
  }

  .mission-control__mobile-section-cycle {
    display: inline-grid;
    grid-column: 2;
    grid-row: 1;
  }

  .settings-menu {
    grid-column: 3;
    grid-row: 1;
  }

  .capture-row {
    grid-template-columns: auto minmax(0, 1fr) 40px;
  }

  .capture-row__input {
    grid-column: 1 / -1;
  }

  .capture-row__project {
    grid-column: 2;
    grid-row: 2;
  }

  .capture-row__type {
    grid-column: 1;
    grid-row: 2;
  }

  .capture-row__submit {
    grid-column: 3;
    grid-row: 2;
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

  .journal-archive {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .journal-archive__preview {
    padding-left: 0;
    border-left: 0;
  }

  .memory-row__actions {
    flex-direction: row;
    width: 100%;
    min-width: 0;
  }

  .memory-row__actions .text-button {
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
