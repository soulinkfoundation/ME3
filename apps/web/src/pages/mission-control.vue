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
  | "projects"
  | "approvals"
  | "runs"
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

const route = useRoute();
const router = useRouter();

const sectionIds: MissionSection[] = [
  "today",
  "projects",
  "approvals",
  "runs",
  "memory",
  "sources",
  "setup",
];
const sectionLabels: Record<MissionSection, string> = {
  today: "Today",
  projects: "Projects",
  approvals: "Approvals",
  runs: "Runs",
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
const selectedProjectName = computed(() => {
  const project = projects.value.find((item) => item.id === selectedProjectId.value);
  return project?.name || "Personal";
});
const journalStatusText = computed(() => {
  if (journalState.value === "saving") return "Saving";
  if (journalState.value === "saved") return "Saved";
  if (journalState.value === "error") return "Could not save";
  return "";
});

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
  return sectionIds.includes(raw as MissionSection) ? (raw as MissionSection) : "today";
}

watch(captureText, (text) => {
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
});

onBeforeUnmount(() => {
  if (journalSaveTimer) window.clearTimeout(journalSaveTimer);
});
</script>

<template>
  <main class="mission-control">
    <header class="mission-control__topbar">
      <nav class="mission-control__sections" aria-label="Mission Control sections">
        <button
          v-for="section in sectionIds"
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
    </header>

    <p v-if="error" class="mission-control__message is-error">{{ error }}</p>
    <p v-else-if="notice" class="mission-control__message">{{ notice }}</p>

    <section v-show="activeSection === 'today'" class="mission-control__today">
      <form class="capture-row" @submit.prevent="submitCapture">
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
        <input
          v-model="captureText"
          class="capture-row__input"
          type="text"
          :placeholder="`Capture for ${selectedProjectName}`"
          autocomplete="off"
        />
        <select v-model="selectedProjectId" class="capture-row__project" aria-label="Project">
          <option
            v-for="project in activeProjectOptions"
            :key="project.id"
            :value="project.id"
          >
            {{ project.name }}
          </option>
        </select>
        <button
          type="submit"
          class="capture-row__submit"
          :disabled="savingCapture || !captureText.trim()"
          aria-label="Add capture"
          title="Add capture"
        >
          <UiIcon name="Plus" :size="18" />
        </button>
      </form>

      <div class="mission-grid">
        <section class="mission-panel">
          <div class="mission-panel__header">
            <h1>Open</h1>
            <span>{{ openCaptures.length }}</span>
          </div>
          <div v-if="loading" class="empty-row">Loading...</div>
          <div v-else-if="openCaptures.length === 0" class="empty-row">
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
              <UiIcon name="Circle" :size="18" />
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
                  class="sync-pill"
                  :class="`sync-pill--${capture.syncStatus}`"
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
              <UiIcon name="Archive" :size="17" />
            </button>
          </article>
        </section>

        <section class="mission-panel">
          <div class="mission-panel__header">
            <h2>Done</h2>
            <span>{{ doneCaptures.length }}</span>
          </div>
          <div v-if="doneCaptures.length === 0" class="empty-row">Nothing completed yet.</div>
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
              <UiIcon name="CircleCheck" :size="18" />
            </button>
            <div class="capture-item__body">
              <p>{{ capture.text }}</p>
              <div class="capture-item__meta">
                <span>{{ captureTypeLabel(capture.type) }}</span>
                <span>{{ projectName(capture.projectId) }}</span>
              </div>
            </div>
          </article>
        </section>
      </div>

      <section class="journal-editor">
        <div class="mission-panel__header">
          <h2>Journal</h2>
          <span>{{ journalStatusText }}</span>
        </div>
        <textarea
          v-model="journalDraft"
          class="journal-editor__textarea"
          rows="12"
          :placeholder="`${selectedDateLabel} notes`"
        />
      </section>
    </section>

    <section v-show="activeSection === 'projects'" class="mission-panel">
      <div class="mission-panel__header">
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
    </section>

    <section v-show="activeSection === 'approvals'" class="mission-panel">
      <div class="mission-panel__header">
        <h1>Approvals</h1>
        <span>{{ pendingApprovals.length }}</span>
      </div>
      <div v-if="pendingApprovals.length === 0" class="empty-row">No pending approvals.</div>
      <article v-for="approval in pendingApprovals" :key="approval.id" class="detail-row">
        <div>
          <h2>{{ approval.title }}</h2>
          <p>{{ approval.summary || approval.actionId }}</p>
        </div>
        <span class="status-badge">{{ approval.riskLevel }}</span>
      </article>
    </section>

    <section v-show="activeSection === 'runs'" class="mission-panel">
      <div class="mission-panel__header">
        <h1>Runs</h1>
        <span>{{ recentRuns.length }}</span>
      </div>
      <div v-if="recentRuns.length === 0" class="empty-row">No agent runs yet.</div>
      <article v-for="run in recentRuns" :key="run.id" class="detail-row">
        <div>
          <h2>{{ run.title }}</h2>
          <p>{{ run.promptSummary || run.model || "Run summary pending" }}</p>
        </div>
        <span class="status-badge">{{ run.status }}</span>
      </article>
    </section>

    <section v-show="activeSection === 'memory'" class="mission-panel">
      <div class="mission-panel__header">
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
    </section>

    <section v-show="activeSection === 'sources'" class="mission-panel">
      <div class="mission-panel__header">
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
    </section>

    <section v-show="activeSection === 'setup'" class="mission-panel">
      <div class="mission-panel__header">
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
      <div class="daemon-summary">
        <h2>Local daemon</h2>
        <p>{{ daemon?.connected ? "Connected" : "Not paired" }}</p>
        <div class="daemon-summary__paths">
          <span v-for="entry in daemon?.allowlist || []" :key="entry.id">
            {{ entry.label }} · {{ entry.permissionTier }}
          </span>
        </div>
      </div>
    </section>

    <aside v-if="activeSection === 'today'" class="mission-rail" aria-label="Daily context">
      <section>
        <h2>Tasks</h2>
        <p v-if="tasksDueToday.length === 0">No dated tasks.</p>
        <div v-for="task in tasksDueToday" :key="task.id" class="rail-item">
          <strong>{{ task.title }}</strong>
          <span>{{ formatShortDate(task.dueAt || task.scheduledFor) }}</span>
        </div>
      </section>
      <section>
        <h2>Activity</h2>
        <p v-if="activity.length === 0">No activity yet.</p>
        <div v-for="item in activity" :key="item.id" class="rail-item">
          <strong>{{ item.title }}</strong>
          <span>{{ item.status || formatShortDate(item.createdAt) }}</span>
        </div>
      </section>
    </aside>
  </main>
</template>

<style scoped>
.mission-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  min-height: 100vh;
  padding: 24px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.mission-control__topbar,
.mission-control__today,
.mission-control__message {
  grid-column: 1 / -1;
}

.mission-control__topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.mission-control__sections {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
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
  min-height: 34px;
  padding: 6px 10px;
  border-radius: var(--ui-radius-md);
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 650;
}

.mission-control__section-tab:hover,
.mission-control__section-tab.is-active {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.mission-control__day-switcher {
  display: grid;
  grid-template-columns: 36px minmax(160px, 240px) 36px;
  align-items: center;
  justify-self: center;
  gap: 8px;
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
.rail-item span,
.daemon-summary p,
.mission-panel__header span {
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
  border-radius: var(--ui-radius-md);
}

.icon-button:hover,
.type-button:hover,
.capture-row__submit:hover,
.type-button.is-active {
  background: var(--ui-accent-soft);
  color: var(--ui-accent-contrast);
}

.icon-button.quiet:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.mission-control__message {
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
  font-size: 13px;
}

.mission-control__message.is-error {
  border-color: color-mix(in oklab, #dc2626, transparent 45%);
}

.mission-control__today {
  display: grid;
  gap: 18px;
}

.capture-row,
.inline-form {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(150px, 210px) 40px;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
}

.capture-row__type {
  display: flex;
  gap: 4px;
}

.capture-row__input,
.capture-row__project,
.journal-editor__textarea,
.inline-form input {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
}

.capture-row__input,
.capture-row__project,
.inline-form input {
  min-height: 40px;
  padding: 0 12px;
}

.capture-row__submit {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.capture-row__submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mission-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
  gap: 16px;
}

.mission-panel,
.journal-editor,
.mission-rail {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
}

.mission-panel,
.journal-editor {
  display: grid;
  gap: 10px;
  padding: 16px;
}

.mission-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.mission-panel__header h1,
.mission-panel__header h2,
.detail-row h2,
.daemon-summary h2,
.mission-rail h2 {
  margin: 0;
  font-size: 15px;
  line-height: 1.25;
}

.capture-item,
.detail-row,
.rail-item,
.daemon-summary {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg);
}

.capture-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 36px;
  gap: 8px;
  align-items: start;
  padding: 10px;
}

.capture-item__check {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-accent);
  cursor: pointer;
}

.capture-item__body {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.capture-item__body p,
.detail-row p,
.daemon-summary p,
.mission-rail p {
  margin: 0;
}

.capture-item__body p {
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.45;
}

.capture-item--done .capture-item__body p {
  color: var(--ui-text-muted);
  text-decoration: line-through;
}

.capture-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.sync-pill,
.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.2;
}

.sync-pill--synced,
.status-badge.ready {
  border-color: color-mix(in oklab, var(--ui-accent), transparent 55%);
  color: var(--ui-accent);
}

.sync-pill--setup_required,
.sync-pill--failed {
  border-color: color-mix(in oklab, #dc2626, transparent 55%);
}

.empty-row {
  padding: 14px;
  border: 1px dashed var(--ui-border);
  border-radius: var(--ui-radius-md);
  color: var(--ui-text-muted);
  font-size: 13px;
}

.journal-editor__textarea {
  min-height: 260px;
  resize: vertical;
  padding: 14px;
  line-height: 1.55;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
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

.inline-form {
  grid-template-columns: minmax(0, 1fr) 40px;
  padding: 6px;
}

.text-button {
  min-height: 34px;
  padding: 6px 10px;
  border-color: var(--ui-border);
  border-radius: var(--ui-radius-md);
}

.text-button:hover {
  background: var(--ui-surface-muted);
}

.mission-rail {
  display: grid;
  align-content: start;
  gap: 16px;
  grid-column: 2;
  grid-row: 3 / span 3;
  padding: 16px;
}

.mission-rail section {
  display: grid;
  gap: 8px;
}

.rail-item {
  display: grid;
  gap: 2px;
  padding: 10px;
}

.rail-item strong {
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.35;
}

.daemon-summary {
  display: grid;
  gap: 8px;
  padding: 12px;
}

.daemon-summary__paths {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.daemon-summary__paths span {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
}

@media (max-width: 1100px) {
  .mission-control {
    grid-template-columns: minmax(0, 1fr);
  }

  .mission-rail {
    grid-column: 1;
    grid-row: auto;
  }
}

@media (max-width: 760px) {
  .mission-control {
    padding: 16px;
  }

  .mission-control__topbar {
    grid-template-columns: 1fr;
  }

  .mission-control__day-switcher {
    justify-self: stretch;
  }

  .capture-row {
    grid-template-columns: minmax(0, 1fr) 40px;
  }

  .capture-row__type,
  .capture-row__project {
    grid-column: 1 / -1;
  }

  .mission-grid {
    grid-template-columns: 1fr;
  }
}
</style>
