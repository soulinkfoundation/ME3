<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import {
  inferMissionCaptureType,
  type MissionCaptureType,
} from "@me3-core/plugin-mission-control";
import { ApiError, api } from "../api";
import UiIcon from "../components/UiIcon.vue";

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
  | "activity"
  | "memory"
  | "sources"
  | "setup";
type PrimaryMissionSection = "today" | "projects";
type SettingsMissionSection =
  | "journalArchive"
  | "activity"
  | "memory"
  | "sources"
  | "setup";

type MissionProject = {
  id: string;
  name: string;
  status: "active" | "paused" | "archived";
  description: string | null;
  color: string | null;
  icon: string | null;
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
  status: "backlog" | "in_progress" | "review" | "done" | "cancelled";
  projectId: string | null;
  dueAt: string | null;
  scheduledFor: string | null;
  sourceKind: "manual" | "capture" | "agent" | "beads" | "daemon";
  sourceRef: string | null;
  priority: number;
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

type MissionSetupItem = {
  id: string;
  label: string;
  status: "ready" | "setup_required" | "optional" | "disabled";
  detail: string;
  actionPath: string | null;
};

type MissionActivity = {
  id: string;
  title: string;
  summary: string | null;
  status: string | null;
  createdAt: string;
};

type MissionDaemonStatus = {
  enabled: boolean;
  connected: boolean;
  pairings: Array<{
    id: string;
    displayName: string;
    status: string;
    lastSeenAt: string | null;
  }>;
  allowlist: Array<{
    id: string;
    label: string;
    pathHint: string;
    permissionTier: string;
    status: string;
  }>;
};

type MissionOverviewResponse = {
  day: MissionDay;
  captures: MissionCapture[];
  projects: MissionProject[];
  tasksDueToday: MissionTask[];
  pendingApprovals: MissionApproval[];
  recentRuns: MissionRun[];
  setup: {
    calendarEnabled: boolean;
    aiConfigured: boolean;
    daemonConnected: boolean;
    items: MissionSetupItem[];
  };
  daemon: MissionDaemonStatus;
  activity: MissionActivity[];
};

type MissionMemoryResponse = { memory: MissionMemory[] };
type MissionSourcesResponse = { sources: MissionContextSource[] };
type MissionJournalArchiveResponse = { entries: MissionJournalArchiveEntry[] };

type ActivityViewItem = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  status: string | null;
  createdAt: string;
};

type DatePickerCell = {
  date: string;
  day: number;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
};

const route = useRoute();
const router = useRouter();

const primarySections: PrimaryMissionSection[] = ["today", "projects"];
const settingsSections: SettingsMissionSection[] = [
  "journalArchive",
  "activity",
  "memory",
  "sources",
  "setup",
];
const sectionIds: MissionSection[] = [...primarySections, ...settingsSections];
const sectionLabels: Record<MissionSection, string> = {
  today: "Journal",
  journalArchive: "Journal archive",
  projects: "Projects",
  activity: "Activity",
  memory: "Memory",
  sources: "Sources",
  setup: "Setup",
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

const selectedDate = ref(todayKey());
const activeSection = ref<MissionSection>(normalizeSection(route.query.section));
const day = ref<MissionDay | null>(null);
const captures = ref<MissionCapture[]>([]);
const projects = ref<MissionProject[]>([]);
const tasksDueToday = ref<MissionTask[]>([]);
const pendingApprovals = ref<MissionApproval[]>([]);
const recentRuns = ref<MissionRun[]>([]);
const memory = ref<MissionMemory[]>([]);
const sources = ref<MissionContextSource[]>([]);
const setupItems = ref<MissionSetupItem[]>([]);
const daemon = ref<MissionDaemonStatus | null>(null);
const activity = ref<MissionActivity[]>([]);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const captureText = ref("");
const captureType = ref<MissionCaptureType>("task");
const manualCaptureType = ref(false);
const selectedProjectId = ref("");
const savingCapture = ref(false);
const schedulePickerOpen = ref(false);
const scheduleDateTime = ref("");
const journalDraft = ref("");
const journalState = ref<"idle" | "saving" | "saved" | "error">("idle");
const datePickerOpen = ref(false);
const datePickerMonth = ref(monthKey(selectedDate.value));
const journalArchiveEntries = ref<MissionJournalArchiveEntry[]>([]);
const journalArchiveLoading = ref(false);
const journalArchiveError = ref("");
const selectedArchiveDate = ref("");
const memoryDraft = ref("");
const memoryActionId = ref("");
const sourceDraft = ref("");
const settingsMenuOpen = ref(false);
const projectModalOpen = ref(false);
const projectTitle = ref("");
const projectDescription = ref("");
const projectLogoData = ref("");
const projectLogoName = ref("");
const projectSaving = ref(false);
const projectError = ref("");
let journalSaveTimer: number | null = null;

const currentDateIsToday = computed(() => selectedDate.value === todayKey());
const selectedDateLabel = computed(() =>
  currentDateIsToday.value ? "Today" : formatDaySwitcherDate(selectedDate.value),
);
const datePickerMonthLabel = computed(() => formatDatePickerMonth(datePickerMonth.value));
const datePickerCells = computed(() =>
  buildDatePickerCells(datePickerMonth.value, selectedDate.value, todayKey()),
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
const openItemCount = computed(() => openCaptures.value.length + visibleScheduledTasks.value.length);
const showCaptureList = computed(
  () =>
    loading.value ||
    openCaptures.value.length > 0 ||
    doneCaptures.value.length > 0 ||
    visibleScheduledTasks.value.length > 0,
);
const journalStatusText = computed(() => {
  if (journalState.value === "saving") return "Saving";
  if (journalState.value === "saved") return "Saved";
  if (journalState.value === "error") return "Could not save";
  return "";
});
const capturePlaceholder = computed(() => {
  if (captureType.value === "reminder") return "Remind me to take a break tomorrow at 3pm";
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
const activityItems = computed<ActivityViewItem[]>(() => [
  ...pendingApprovals.value.map((approval) => ({
    id: `approval:${approval.id}`,
    kind: "Approval",
    title: approval.title,
    summary: approval.summary || approval.actionId,
    status: approval.riskLevel,
    createdAt: approval.requestedAt,
  })),
  ...recentRuns.value.map((run) => ({
    id: `run:${run.id}`,
    kind: "Run",
    title: run.title,
    summary: run.promptSummary || run.model || "Run summary pending",
    status: run.status,
    createdAt: run.finishedAt || run.startedAt || run.createdAt,
  })),
  ...activity.value.map((item) => ({
    id: `activity:${item.id}`,
    kind: "Activity",
    title: item.title,
    summary: item.summary,
    status: item.status,
    createdAt: item.createdAt,
  })),
]);
const settingsSectionActive = computed(() =>
  settingsSections.includes(activeSection.value as SettingsMissionSection),
);
const settingsSectionDescriptions: Record<SettingsMissionSection, string> = {
  journalArchive: "Past entries",
  activity: "Approvals and runs",
  memory: "Private context",
  sources: "Connected context",
  setup: "Daemon and integrations",
};
const projectCreateDisabled = computed(
  () => projectSaving.value || projectTitle.value.trim().length === 0,
);
const selectedArchiveEntry = computed(
  () =>
    journalArchiveEntries.value.find((entry) => entry.date === selectedArchiveDate.value) ||
    journalArchiveEntries.value[0] ||
    null,
);
const datePickerWeekdays = ["M", "T", "W", "T", "F", "S", "S"];

async function loadOverview() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get<MissionOverviewResponse>(
      `/mission-control/overview?date=${encodeURIComponent(selectedDate.value)}`,
    );
    applyOverview(response);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Mission Control could not load";
  } finally {
    loading.value = false;
  }
}

function applyOverview(response: MissionOverviewResponse) {
  day.value = response.day;
  captures.value = response.captures || [];
  projects.value = response.projects || [];
  tasksDueToday.value = response.tasksDueToday || [];
  pendingApprovals.value = response.pendingApprovals || [];
  recentRuns.value = response.recentRuns || [];
  setupItems.value = response.setup?.items || [];
  daemon.value = response.daemon;
  activity.value = response.activity || [];
  journalDraft.value = response.day?.journalText || "";
  journalState.value = "idle";
  if (!selectedProjectId.value && projects.value[0]) {
    selectedProjectId.value = projects.value[0].id;
  }
  void loadMemoryAndSources();
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
      journalArchiveEntries.value.some((entry) => entry.date === selectedArchiveDate.value)
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

async function submitCapture() {
  const text = captureText.value.trim();
  if (!text || savingCapture.value) return;
  savingCapture.value = true;
  error.value = "";
  const hasPickedSchedule = captureType.value !== "task" && scheduledDate.value && scheduledTime.value;
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
        timezone: hasPickedSchedule ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
      },
    );
    captureText.value = "";
    manualCaptureType.value = false;
    captureType.value = "task";
    schedulePickerOpen.value = false;
    scheduleDateTime.value = "";
    notice.value = `${captureTypeLabel(response.capture.type)} captured`;
    await loadOverview();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Capture failed";
  } finally {
    savingCapture.value = false;
  }
}

async function setCaptureStatus(capture: MissionCapture, status: "open" | "done") {
  try {
    const response = await api.patch<{ capture: MissionCapture }>(
      `/mission-control/capture/${encodeURIComponent(capture.id)}`,
      { status },
    );
    replaceCapture(response.capture);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not update capture";
  }
}

async function archiveCapture(capture: MissionCapture) {
  try {
    await api.delete<{ ok: true }>(
      `/mission-control/capture/${encodeURIComponent(capture.id)}`,
    );
    captures.value = captures.value.filter((item) => item.id !== capture.id);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not archive capture";
  }
}

async function archiveTask(task: MissionTask) {
  try {
    await api.delete(`/mission-control/tasks/${encodeURIComponent(task.id)}`);
    tasksDueToday.value = tasksDueToday.value.filter((item) => item.id !== task.id);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not remove task";
  }
}

function replaceCapture(next: MissionCapture) {
  const index = captures.value.findIndex((item) => item.id === next.id);
  if (index >= 0) captures.value.splice(index, 1, next);
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

async function selectJournalDate(date: string, options: { openToday?: boolean } = {}) {
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
  datePickerOpen.value = false;
  setSection("journalArchive");
}

function openSelectedArchiveEntry() {
  if (!selectedArchiveEntry.value) return;
  void selectJournalDate(selectedArchiveEntry.value.date, { openToday: true });
}

function setSection(section: MissionSection) {
  activeSection.value = section;
  settingsMenuOpen.value = false;
  void router.replace({
    query: {
      ...route.query,
      section: section === "today" ? undefined : sectionQueryValue(section),
    },
  });
}

function openProjectModal() {
  projectTitle.value = "";
  projectDescription.value = "";
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
    projectLogoData.value = typeof reader.result === "string" ? reader.result : "";
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
        icon: projectLogoData.value || undefined,
      },
    );
    projects.value = [response.project, ...projects.value].sort((a, b) => {
      if (a.name === "Personal") return -1;
      if (b.name === "Personal") return 1;
      return a.name.localeCompare(b.name);
    });
    selectedProjectId.value ||= response.project.id;
    notice.value = "Project added";
    projectModalOpen.value = false;
  } catch (e) {
    projectError.value = e instanceof ApiError ? e.message : "Could not create project";
  } finally {
    projectSaving.value = false;
  }
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
    await api.post("/mission-control/memory", { body, memoryKind: "owner_note" });
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
    notice.value = "Memory approved";
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not approve memory";
  } finally {
    memoryActionId.value = "";
  }
}

async function forgetMemory(item: MissionMemory) {
  memoryActionId.value = item.id;
  error.value = "";
  try {
    await api.delete<{ ok: true }>(`/mission-control/memory/${encodeURIComponent(item.id)}`);
    memory.value = memory.value.filter((entry) => entry.id !== item.id);
    notice.value = "Memory forgotten";
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

async function startDaemonPairing() {
  try {
    const response = await api.post<{
      code: string;
      installCommand: string;
    }>("/mission-control/daemon/pairing/start", {
      displayName: "Local daemon",
    });
    notice.value = `Pairing code ${response.code}`;
    await loadOverview();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : "Could not start pairing";
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
  return projects.value.find((project) => project.id === projectId)?.name || "Personal";
}

function projectInitial(project: MissionProject): string {
  return project.name.trim().charAt(0).toUpperCase() || "P";
}

function isProjectLogo(value: string | null): boolean {
  if (!value) return false;
  return /^data:image\//.test(value) || /^https?:\/\//.test(value);
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

function formatDatePickerMonth(value: string): string {
  const date = new Date(`${value}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
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
    return item.sourceRef ? `Agent suggestion: ${item.sourceRef}` : "Agent suggestion";
  }
  if (item.sourceKind === "daemon") return item.sourceRef ? `Daemon: ${item.sourceRef}` : "Daemon";
  if (item.sourceKind === "import") return item.sourceRef ? `Import: ${item.sourceRef}` : "Import";
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

function buildDatePickerCells(
  monthKeyValue: string,
  selectedDateKey: string,
  todayDateKey: string,
): DatePickerCell[] {
  const [year, month] = monthKeyValue.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const leadDays = (first.getDay() + 6) % 7;
  let cursor = new Date(year, month - 1, 1 - leadDays);
  const cells: DatePickerCell[] = [];

  for (let i = 0; i < 42; i += 1) {
    const date = dateToKey(cursor);
    cells.push({
      date,
      day: cursor.getDate(),
      inMonth: cursor.getMonth() === month - 1,
      isSelected: date === selectedDateKey,
      isToday: date === todayDateKey,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return cells;
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
  return sectionIds.includes(raw as MissionSection) ? (raw as MissionSection) : "today";
}

function handleWindowKeydown(event: KeyboardEvent) {
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
  if (event.key === "Escape") settingsMenuOpen.value = false;
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
  if (section === "journalArchive") void loadJournalArchive();
});

onMounted(() => {
  void loadOverview();
  if (activeSection.value === "journalArchive") void loadJournalArchive();
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  if (journalSaveTimer) window.clearTimeout(journalSaveTimer);
  window.removeEventListener("keydown", handleWindowKeydown);
});
</script>

<template>
  <main class="mission-control">
    <header class="mission-control__topbar">
      <nav class="mission-control__sections" aria-label="Mission Control primary sections">
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
        <button type="button" class="icon-button" aria-label="Previous day" @click="moveDay(-1)">
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
          <UiIcon name="CalendarDays" :size="14" aria-hidden="true" />
        </button>
        <button type="button" class="icon-button" aria-label="Next day" @click="moveDay(1)">
          <UiIcon name="ChevronRight" :size="18" />
        </button>
        <div v-if="datePickerOpen" class="date-picker-popover" role="dialog" aria-label="Choose journal date">
          <div class="date-picker-popover__header">
            <button
              type="button"
              class="icon-button quiet"
              aria-label="Previous month"
              @click="moveDatePickerMonth(-1)"
            >
              <UiIcon name="ChevronLeft" :size="16" />
            </button>
            <strong>{{ datePickerMonthLabel }}</strong>
            <button
              type="button"
              class="icon-button quiet"
              aria-label="Next month"
              @click="moveDatePickerMonth(1)"
            >
              <UiIcon name="ChevronRight" :size="16" />
            </button>
          </div>
          <div class="date-picker-popover__weekdays" aria-hidden="true">
            <span v-for="(weekday, index) in datePickerWeekdays" :key="`${weekday}-${index}`">
              {{ weekday }}
            </span>
          </div>
          <div class="date-picker-popover__grid" role="grid">
            <button
              v-for="cell in datePickerCells"
              :key="cell.date"
              type="button"
              class="date-picker-popover__day"
              :class="{
                'is-off-month': !cell.inMonth,
                'is-today': cell.isToday,
                'is-selected': cell.isSelected,
              }"
              :aria-label="formatArchiveDate(cell.date)"
              :aria-pressed="cell.isSelected"
              @click="chooseDatePickerDay(cell.date)"
            >
              {{ cell.day }}
            </button>
          </div>
          <div class="date-picker-popover__actions">
            <button type="button" class="text-button" @click="pickToday">
              Today
            </button>
            <button type="button" class="text-button text-button--primary" @click="openJournalArchive">
              View archive
            </button>
          </div>
        </div>
      </div>
      <div v-else class="mission-control__section-title">
        {{ sectionLabels[activeSection] }}
      </div>

      <div class="settings-menu" @click.stop>
        <button
          type="button"
          class="icon-button"
          :class="{ 'is-active': settingsMenuOpen || settingsSectionActive }"
          aria-label="Mission Control settings"
          :aria-expanded="settingsMenuOpen"
          aria-haspopup="menu"
          @click="settingsMenuOpen = !settingsMenuOpen; datePickerOpen = false"
        >
          <UiIcon name="Settings" :size="18" />
        </button>
        <div v-if="settingsMenuOpen" class="settings-menu__dropdown" role="menu">
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
            <small>{{ settingsSectionDescriptions[section] }}</small>
          </button>
        </div>
      </div>
    </header>

    <p v-if="error" class="mission-control__message is-error">{{ error }}</p>
    <p v-else-if="notice" class="mission-control__message">{{ notice }}</p>

    <section v-show="activeSection === 'today'" class="mission-page">
      <div class="daily-sheet">
        <form class="capture-row" @submit.prevent="submitCapture">
          <input
            v-model="captureText"
            type="text"
            class="capture-row__input"
            :placeholder="capturePlaceholder"
            autocomplete="off"
          />
          <select v-model="selectedProjectId" class="capture-row__project" aria-label="Project">
            <option v-for="project in activeProjectOptions" :key="project.id" :value="project.id">
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

        <section v-if="showCaptureList" class="capture-list" aria-label="Today list">
          <div class="capture-list__header">
            <div>
              <h1>{{ selectedDateLabel }}</h1>
            </div>
            <span>{{ openItemCount }} open</span>
          </div>

          <div v-if="loading" class="empty-row">Loading...</div>

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
                <span>{{ formatShortDate(task.dueAt || task.scheduledFor) }}</span>
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
            <div class="list-divider">Done</div>
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
        </section>

        <section class="journal-sheet" aria-label="Journal entry">
          <div class="journal-editor__header">
            <h2>Journal</h2>
            <span v-if="journalStatusText">{{ journalStatusText }}</span>
          </div>
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
        <div class="simple-sheet__header">
          <h1>Journal archive</h1>
        </div>

        <div v-if="journalArchiveLoading" class="empty-row">Loading archive...</div>
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

          <article v-if="selectedArchiveEntry" class="journal-archive__preview">
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
      </div>
    </section>

    <section v-show="activeSection === 'projects'" class="mission-page">
      <div class="simple-sheet">
        <div class="simple-sheet__header">
          <div>
            <h1>Projects</h1>
            <span>{{ projects.length }}</span>
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label="Add project"
            title="Add project"
            @click="openProjectModal"
          >
            <UiIcon name="Plus" :size="18" />
          </button>
        </div>
        <article v-for="project in projects" :key="project.id" class="detail-row project-row">
          <div class="project-row__main">
            <div class="project-row__logo" aria-hidden="true">
              <img
                v-if="isProjectLogo(project.icon)"
                :src="project.icon || ''"
                :alt="`${project.name} logo`"
              />
              <span v-else>{{ projectInitial(project) }}</span>
            </div>
            <div>
              <h2>{{ project.name }}</h2>
              <p>{{ project.description || "No description" }}</p>
            </div>
          </div>
          <span class="status-badge">{{ project.status }}</span>
        </article>
      </div>
    </section>

    <section v-show="activeSection === 'activity'" class="mission-page">
      <div class="simple-sheet simple-sheet--wide">
        <div class="simple-sheet__header">
          <div>
            <h1>Activity</h1>
            <p>Approvals, runs, and Mission Control updates.</p>
          </div>
          <span>{{ activityItems.length }}</span>
        </div>
        <div v-if="activityItems.length === 0" class="empty-row">No activity yet.</div>
        <article v-for="item in activityItems" :key="item.id" class="detail-row activity-row">
          <div>
            <span class="activity-row__kind">{{ item.kind }}</span>
            <h2>{{ item.title }}</h2>
            <p>{{ item.summary || "No summary yet" }}</p>
          </div>
          <div class="detail-row__aside">
            <span v-if="item.status" class="status-badge">{{ item.status }}</span>
            <span>{{ formatDateTime(item.createdAt) }}</span>
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
          <input v-model="memoryDraft" type="text" placeholder="Private memory" />
          <button type="submit" class="icon-button" aria-label="Add memory">
            <UiIcon name="Plus" :size="18" />
          </button>
        </form>
        <div v-if="memory.length === 0" class="empty-row">No private memory yet.</div>
        <article
          v-for="item in memory"
          :key="item.id"
          class="detail-row memory-row"
          :class="{ 'memory-row--pending': item.reviewStatus === 'needs_review' }"
        >
          <div>
            <div class="memory-row__heading">
              <h2>{{ item.title || memoryKindLabel(item.memoryKind) }}</h2>
              <span class="status-badge" :class="`status-badge--${item.reviewStatus}`">
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
          <input v-model="sourceDraft" type="text" placeholder="Source name or URL" />
          <button type="submit" class="icon-button" aria-label="Add source">
            <UiIcon name="Plus" :size="18" />
          </button>
        </form>
        <article v-for="source in sources" :key="source.id" class="detail-row">
          <div>
            <h2>{{ source.label }}</h2>
            <p>{{ source.description || source.sourceRef || source.sourceKind }}</p>
          </div>
          <span class="status-badge">{{ source.status }}</span>
        </article>
      </div>
    </section>

    <section v-show="activeSection === 'setup'" class="mission-page">
      <div class="simple-sheet">
        <div class="simple-sheet__header">
          <h1>Setup</h1>
          <button type="button" class="text-button" @click="startDaemonPairing">
            Pair daemon
          </button>
        </div>
        <article v-for="item in setupItems" :key="item.id" class="detail-row">
          <div>
            <h2>{{ item.label }}</h2>
            <p>{{ item.detail }}</p>
          </div>
          <span class="status-badge">{{ item.status }}</span>
        </article>
        <section class="daemon-summary">
          <div>
            <h2>Local daemon</h2>
            <p>{{ daemon?.connected ? "Connected" : "Not paired" }}</p>
          </div>
          <div class="daemon-summary__paths">
            <span v-for="entry in daemon?.allowlist || []" :key="entry.id">
              {{ entry.label }} - {{ entry.permissionTier }}
            </span>
          </div>
        </section>
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
            <button type="button" class="text-button" @click="clearSchedulePicker">
              Clear
            </button>
            <button type="button" class="text-button text-button--primary" @click="closeSchedulePicker">
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
            <input v-model="projectTitle" type="text" autocomplete="off" autofocus />
          </label>

          <label class="field">
            <span>Description</span>
            <textarea v-model="projectDescription" rows="4" />
          </label>

          <label class="field">
            <span>Logo</span>
            <input type="file" accept="image/*" @change="chooseProjectLogo" />
          </label>

          <div v-if="projectLogoData" class="project-logo-preview">
            <img :src="projectLogoData" alt="" />
            <span>{{ projectLogoName }}</span>
            <button type="button" class="text-button" @click="removeProjectLogo">
              Remove
            </button>
          </div>

          <p v-if="projectError" class="mission-modal__error">{{ projectError }}</p>

          <div class="mission-modal__actions">
            <button type="button" class="text-button" @click="closeProjectModal">
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

.mission-control__day-label {
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
.mission-control__day-label[aria-expanded="true"] {
  background: var(--ui-surface-muted);
}

.mission-control__day-label strong {
  font-size: 15px;
}

.capture-item__meta,
.detail-row p,
.daemon-summary p,
.simple-sheet__header span,
.journal-editor__header span,
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
  gap: 2px;
  width: 100%;
  min-height: 48px;
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

.settings-menu__item small {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.settings-menu__item:hover,
.settings-menu__item.is-active {
  background: var(--ui-surface-muted);
}

.date-picker-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 30;
  display: grid;
  width: min(292px, calc(100vw - 28px));
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: 0 18px 50px color-mix(in oklab, #000, transparent 86%);
  transform: translateX(-50%);
}

.date-picker-popover__header {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
}

.date-picker-popover__header .icon-button {
  width: 32px;
  height: 32px;
}

.date-picker-popover__header strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-picker-popover__weekdays,
.date-picker-popover__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.date-picker-popover__weekdays span {
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

.date-picker-popover__day {
  display: inline-grid;
  width: 100%;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.date-picker-popover__day:hover {
  background: var(--ui-surface-muted);
}

.date-picker-popover__day.is-off-month {
  color: color-mix(in oklab, var(--ui-text-muted), transparent 35%);
}

.date-picker-popover__day.is-today:not(.is-selected) {
  border-color: color-mix(in oklab, var(--ui-accent), transparent 30%);
  color: var(--ui-accent);
}

.date-picker-popover__day.is-selected {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.date-picker-popover__actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
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

.simple-sheet--wide {
  width: min(920px, 100%);
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
.inline-form input {
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
.inline-form input {
  min-height: 40px;
  padding: 0 12px;
}

.capture-row__input::placeholder,
.journal-editor__textarea::placeholder {
  color: var(--ui-text-muted);
}

.capture-row__input:focus,
.capture-row__project:focus,
.journal-editor__textarea:focus,
.inline-form input:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.capture-row__submit {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.capture-row__submit:disabled {
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
.simple-sheet__header,
.journal-editor__header {
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
.journal-editor__header h1,
.journal-editor__header h2,
.detail-row h2,
.daemon-summary h2 {
  margin: 0;
  font-size: 15px;
  line-height: 1.25;
}

.simple-sheet__header p {
  margin: 3px 0 0;
  color: var(--ui-text-muted);
  font-size: 13px;
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
.detail-row p,
.daemon-summary p {
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
  padding: 18px 0 6px;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: uppercase;
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

.project-row {
  align-items: center;
}

.detail-row .project-row__main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.project-row__logo {
  display: inline-grid;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  place-items: center;
  overflow: hidden;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
  color: var(--ui-accent);
  font-size: 14px;
  font-weight: 750;
}

.project-row__logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.daemon-summary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--ui-border);
}

.daemon-summary__paths {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.daemon-summary__paths span {
  padding: 4px 7px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
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
.field textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
}

.field input {
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
.field textarea:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
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

@media (max-width: 760px) {
  .mission-control {
    padding: 0 14px 32px;
  }

  .mission-control__topbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .mission-control__sections {
    padding-left: 48px;
  }

  .mission-control__day-switcher,
  .mission-control__section-title {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: center;
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

  .detail-row,
  .daemon-summary {
    flex-direction: column;
  }

  .project-row__main {
    width: 100%;
  }

  .detail-row__aside {
    align-items: flex-start;
    text-align: left;
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
