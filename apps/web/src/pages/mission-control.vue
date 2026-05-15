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
  | "journal"
  | "projects"
  | "activity"
  | "memory"
  | "sources"
  | "setup";
type PrimaryMissionSection = "today" | "journal" | "projects";
type SettingsMissionSection = "activity" | "memory" | "sources" | "setup";

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

type MissionTask = {
  id: string;
  title: string;
  status: "backlog" | "in_progress" | "review" | "done" | "cancelled";
  projectId: string | null;
  dueAt: string | null;
  scheduledFor: string | null;
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
  title: string | null;
  body: string;
  reviewStatus: "active" | "needs_review" | "archived";
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

type ActivityViewItem = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  status: string | null;
  createdAt: string;
};

const route = useRoute();
const router = useRouter();

const primarySections: PrimaryMissionSection[] = ["today", "journal", "projects"];
const settingsSections: SettingsMissionSection[] = ["activity", "memory", "sources", "setup"];
const sectionIds: MissionSection[] = [...primarySections, ...settingsSections];
const sectionLabels: Record<MissionSection, string> = {
  today: "Today",
  journal: "Journal",
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
const journalDraft = ref("");
const journalState = ref<"idle" | "saving" | "saved" | "error">("idle");
const memoryDraft = ref("");
const sourceDraft = ref("");
const settingsMenuOpen = ref(false);
let journalSaveTimer: number | null = null;

const currentDateIsToday = computed(() => selectedDate.value === todayKey());
const selectedDateLabel = computed(() =>
  currentDateIsToday.value ? "Today" : formatDaySwitcherDate(selectedDate.value),
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
  activity: "Approvals and runs",
  memory: "Private context",
  sources: "Connected context",
  setup: "Daemon and integrations",
};

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

async function submitCapture() {
  const text = captureText.value.trim();
  if (!text || savingCapture.value) return;
  savingCapture.value = true;
  error.value = "";
  try {
    const response = await api.post<{ capture: MissionCapture }>(
      "/mission-control/capture",
      {
        date: selectedDate.value,
        text,
        type: captureType.value,
        projectId: selectedProjectId.value || undefined,
      },
    );
    captures.value = [response.capture, ...captures.value];
    captureText.value = "";
    manualCaptureType.value = false;
    captureType.value = "task";
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

function setSection(section: MissionSection) {
  activeSection.value = section;
  settingsMenuOpen.value = false;
  void router.replace({
    query: {
      ...route.query,
      section: section === "today" ? undefined : section,
    },
  });
}

function moveDay(delta: number) {
  selectedDate.value = addDays(selectedDate.value, delta);
}

function chooseType(type: MissionCaptureType) {
  captureType.value = type;
  manualCaptureType.value = true;
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

function formatShortDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function addDays(dateKey: string, days: number): string {
  const [year, month, dayNumber] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, dayNumber + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeSection(value: unknown): MissionSection {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "approvals" || raw === "runs") return "activity";
  return sectionIds.includes(raw as MissionSection) ? (raw as MissionSection) : "today";
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") settingsMenuOpen.value = false;
}

watch(captureText, (text) => {
  if (!text.trim()) {
    manualCaptureType.value = false;
    captureType.value = "task";
    return;
  }
  if (!manualCaptureType.value) {
    captureType.value = inferMissionCaptureType(text);
  }
});

watch(selectedDate, () => {
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

onMounted(() => {
  void loadOverview();
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

      <div class="mission-control__day-switcher" aria-label="Selected day">
        <button type="button" class="icon-button" aria-label="Previous day" @click="moveDay(-1)">
          <UiIcon name="ChevronLeft" :size="18" />
        </button>
        <div class="mission-control__day-label">
          <strong>{{ selectedDateLabel }}</strong>
          <span>{{ selectedDate }}</span>
        </div>
        <button type="button" class="icon-button" aria-label="Next day" @click="moveDay(1)">
          <UiIcon name="ChevronRight" :size="18" />
        </button>
      </div>

      <div class="settings-menu" @click.stop>
        <button
          type="button"
          class="icon-button"
          :class="{ 'is-active': settingsMenuOpen || settingsSectionActive }"
          aria-label="Mission Control settings"
          :aria-expanded="settingsMenuOpen"
          aria-haspopup="menu"
          @click="settingsMenuOpen = !settingsMenuOpen"
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
            <option value="">Personal</option>
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

        <section class="capture-list" aria-label="Today list">
          <div class="capture-list__header">
            <div>
              <h1>{{ selectedDateLabel }}</h1>
              <span>{{ selectedDate }}</span>
            </div>
            <span>{{ openCaptures.length }} open</span>
          </div>

          <div v-if="loading" class="empty-row">Loading...</div>
          <div v-else-if="openCaptures.length === 0 && tasksDueToday.length === 0" class="empty-row">
            Clear for {{ selectedDateLabel.toLowerCase() }}.
          </div>

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
            v-for="task in tasksDueToday"
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
      </div>
    </section>

    <section v-show="activeSection === 'journal'" class="mission-page">
      <div class="journal-sheet">
        <div class="journal-editor__header">
          <div>
            <h1>{{ selectedDateLabel }}</h1>
            <span>{{ selectedDate }}</span>
          </div>
          <span v-if="journalStatusText">{{ journalStatusText }}</span>
        </div>
        <textarea
          v-model="journalDraft"
          class="journal-editor__textarea"
          rows="16"
          placeholder="Journal entry field..."
        />
      </div>
    </section>

    <section v-show="activeSection === 'projects'" class="mission-page">
      <div class="simple-sheet">
        <div class="simple-sheet__header">
          <h1>Projects</h1>
          <span>{{ projects.length }}</span>
        </div>
        <article v-for="project in projects" :key="project.id" class="detail-row">
          <div>
            <h2>{{ project.name }}</h2>
            <p>{{ project.description || "No description" }}</p>
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
        <article v-for="item in memory" :key="item.id" class="detail-row">
          <div>
            <h2>{{ item.title || item.memoryKind }}</h2>
            <p>{{ item.body }}</p>
          </div>
          <span class="status-badge">{{ item.reviewStatus }}</span>
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
  display: grid;
  grid-template-columns: 34px minmax(128px, 190px) 34px;
  align-items: center;
  justify-self: center;
  gap: 4px;
}

.mission-control__day-label {
  display: grid;
  justify-items: center;
  min-width: 0;
  line-height: 1.2;
}

.mission-control__day-label strong {
  font-size: 15px;
}

.mission-control__day-label span,
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

.journal-sheet {
  gap: 12px;
}

.journal-editor__textarea {
  min-height: 58vh;
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

.activity-row__kind {
  color: var(--ui-accent);
  font-size: 12px;
  font-weight: 700;
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

@media (max-width: 760px) {
  .mission-control {
    padding: 0 14px 32px;
  }

  .mission-control__topbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  .mission-control__day-switcher {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: center;
  }

  .capture-row {
    grid-template-columns: minmax(0, 1fr) 40px;
  }

  .capture-row__type,
  .capture-row__project {
    grid-column: 1 / -1;
  }

  .detail-row,
  .daemon-summary {
    flex-direction: column;
  }

  .detail-row__aside {
    align-items: flex-start;
    text-align: left;
  }

  .settings-menu__dropdown {
    right: 0;
    width: min(230px, calc(100vw - 28px));
  }
}
</style>
