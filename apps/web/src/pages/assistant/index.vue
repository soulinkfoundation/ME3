<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { api } from "../../api";
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

type AssistantRecipeState = "ready" | "needs_setup" | "manual_only" | "coming_later";

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
  trigger: Record<string, unknown>;
  actions: Array<{
    id: string;
    capabilityId: string;
    label: string;
    approvalMode: string;
  }>;
  permissionSummary: PermissionSummary;
  validationStatus: "valid" | "invalid" | "needs_setup";
  validationErrors: Array<{ message?: string; code?: string; blocking?: boolean }>;
  createdAt: string;
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
const addPanelOpen = ref(false);
const busyKeys = ref(new Set<string>());

const suggestedRecipeOrder = [
  "daily-briefing",
  "weekly-review",
  "task-carry-over",
  "project-digest",
  "approval-sweep",
  "memory-review",
  "setup-health-check",
  "email-watch",
  "email-triage",
  "invoice-receipt-triage",
  "booking-reminder",
  "relationship-follow-up",
];

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
    .filter((recipe) => recipe.id !== "source-monitor")
    .sort(
      (a, b) =>
        (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) ||
        a.name.localeCompare(b.name),
    );
});

const activeCount = computed(
  () => jobs.value.filter((job) => job.status === "active").length,
);
const needsAttentionCount = computed(
  () =>
    jobs.value.filter(
      (job) =>
        job.status === "needs_setup" ||
        job.status === "failing" ||
        job.lastRunStatus === "waiting_for_approval",
    ).length,
);

const selectedJob = computed(() =>
  jobs.value.find((job) => job.id === selectedJobId.value) || selectedDetail.value?.job || null,
);

onMounted(() => {
  void loadPage();
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
    if (!selectedJobId.value && jobs.value.length > 0) {
      selectedJobId.value = jobs.value[0].id;
      void openJob(jobs.value[0].id);
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
  loadingDetail.value = true;
  try {
    selectedDetail.value = await api.get<AssistantJobDetail>(
      `/assistant/jobs/${encodeURIComponent(jobId)}`,
    );
  } catch (err) {
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

    addPanelOpen.value = false;
    selectedJobId.value = data.job.id;
    await loadJobs();
    await openJob(data.job.id);
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
    await openJob(job.id);
    toastSuccess("Run started.");
  });
}

async function toggleJob(job: AssistantJob) {
  const endpoint = job.status === "active" ? "pause" : "resume";
  await withBusy(`${endpoint}:${job.id}`, async () => {
    const data = await api.post<{ job: AssistantJob }>(
      `/assistant/jobs/${encodeURIComponent(job.id)}/${endpoint}`,
    );
    jobs.value = jobs.value.map((item) => (item.id === job.id ? data.job : item));
    if (selectedJobId.value === job.id) {
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
  const confirmed = window.confirm(`Archive "${job.name}"? Results and run history stay in Mission Control.`);
  if (!confirmed) return;

  await withBusy(`archive:${job.id}`, async () => {
    await api.delete(`/assistant/jobs/${encodeURIComponent(job.id)}`);
    jobs.value = jobs.value.filter((item) => item.id !== job.id);
    if (selectedJobId.value === job.id) {
      selectedJobId.value = jobs.value[0]?.id || null;
      selectedDetail.value = null;
      if (selectedJobId.value) {
        await openJob(selectedJobId.value);
      }
    }
    toastSuccess("Job archived.");
  });
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

function actionStatusLabel(status: AssistantJobActionResult["status"]) {
  const labels: Record<AssistantJobActionResult["status"], string> = {
    skipped: "Skipped",
    blocked: "Blocked",
    pending_approval: "Needs you",
    succeeded: "Done",
    failed: "Failed",
  };
  return labels[status] || status;
}

function recipeStateLabel(state: AssistantRecipeState) {
  const labels: Record<AssistantRecipeState, string> = {
    ready: "Ready",
    needs_setup: "Needs setup",
    manual_only: "Manual",
    coming_later: "Later",
  };
  return labels[state] || state;
}

function recipeActionLabel(recipe: AssistantJobRecipe) {
  if (recipe.state === "coming_later") return "Later";
  if (recipe.state === "needs_setup") return "Save";
  return "Add";
}

function canCreateRecipe(recipe: AssistantJobRecipe) {
  return recipe.state !== "coming_later";
}

function canRun(job: AssistantJob) {
  return job.status === "active";
}

function canToggle(job: AssistantJob) {
  return job.status === "active" || job.status === "paused" || job.status === "draft";
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

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
  if (/^Weekly at /i.test(value)) return value.replace(/^Weekly/i, "Every week");
  if (value.includes("email.message.received")) return "When matching email arrives";
  if (value.includes("calendar.event.upcoming")) return "Before matching calendar events";
  if (value.includes("review_packet.created")) return "When Mission Control changes";
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
  return "Mission Control results";
}

function setupLabelForRecipe(recipe: AssistantJobRecipe) {
  if (recipe.state === "ready") return "Ready to add";
  const ids = [...recipe.requiredCapabilityIds, ...recipe.optionalCapabilityIds].join(" ");
  if (ids.includes("email.")) return "Email setup needed";
  if (ids.includes("calendar.")) return "Calendar setup needed";
  if (ids.includes("source.")) return "Source setup needed";
  if (ids.includes("message.owner.notify")) return "Notifications setup needed";
  if (ids.includes("daemon.")) return "Local app setup needed";
  return recipeStateLabel(recipe.state);
}

function setupMessageForJob(job: AssistantJob) {
  const error = job.setupState?.errors?.find((entry) => entry.message)?.message;
  if (!error) return "Setup is needed before this job can run.";
  return cleanPlainText(error)
    .replace(/^Missing setup requirement:\s*email\.?$/i, "Email setup is needed.")
    .replace(/^Missing setup requirement:\s*calendar\.?$/i, "Calendar setup is needed.")
    .replace(/^Missing setup requirement:\s*owner_notifications\.?$/i, "Notifications setup is needed.");
}

function capabilityLabel(capabilityId: string) {
  const labels: Record<string, string> = {
    "assistant.job.validate": "Check jobs",
    "mission.project.read": "Read projects",
    "mission.task.read": "Read tasks",
    "mission.approval.read": "Read approvals",
    "mission.review_packet.create": "Create result",
    "mission.activity.create": "Record activity",
    "mission.task.create": "Create task",
    "mission.capture.create": "Create capture",
    "mission.memory.suggest": "Suggest memory",
    "message.owner.notify": "Notify you",
    "email.message.read": "Read email",
    "email.thread.summarize": "Summarize email",
    "email.reply.draft": "Draft email",
    "calendar.event.read": "Read calendar",
  };
  return labels[capabilityId] || cleanPlainText(capabilityId.replace(/\./g, " "));
}

function cleanPlainText(value: string) {
  return String(value || "")
    .replace(/Mission Control review packets?/gi, "Mission Control results")
    .replace(/review packets?/gi, "results")
    .replace(/durable private memory/gi, "saved memory")
    .replace(/\s+/g, " ")
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
      <div class="assistant-mobile-title">Assistant Jobs</div>
    </Teleport>

    <main class="assistant-main">
      <header class="assistant-header">
        <div>
          <h1>Assistant Jobs</h1>
          <p>Create small repeatable jobs. Results land in Mission Control, and ME3 asks before risky actions.</p>
        </div>
        <button
          type="button"
          class="primary-button"
          :aria-expanded="addPanelOpen ? 'true' : 'false'"
          @click="addPanelOpen = !addPanelOpen"
        >
          <UiIcon :name="addPanelOpen ? 'X' : 'Plus'" :size="18" />
          {{ addPanelOpen ? "Close" : "Add job" }}
        </button>
      </header>

      <section v-if="pageError" class="notice notice--error" role="alert">
        {{ pageError }}
      </section>

      <section class="summary-strip" aria-label="Job summary">
        <span>{{ activeCount }} active</span>
        <span>{{ jobs.length }} total</span>
        <span v-if="needsAttentionCount > 0">{{ needsAttentionCount }} need you</span>
      </section>

      <section v-if="addPanelOpen" class="panel starters-panel" aria-labelledby="starter-jobs-title">
        <div class="panel-heading">
          <div>
            <h2 id="starter-jobs-title">Suggested Jobs</h2>
            <p>Pick a starter, then tune it later.</p>
          </div>
        </div>

        <div v-if="loadingRecipes" class="empty-row">Loading suggested jobs...</div>
        <div v-else class="starter-list">
          <article
            v-for="recipe in suggestedRecipes"
            :key="recipe.id"
            class="starter-row"
          >
            <div class="starter-main">
              <div class="starter-title-line">
                <h3>{{ recipe.name }}</h3>
                <span
                  class="status-badge"
                  :class="`status-badge--${recipe.state}`"
                >
                  {{ recipeStateLabel(recipe.state) }}
                </span>
              </div>
              <p>{{ cleanPlainText(recipe.outcome) }}</p>
              <span class="setup-note">{{ setupLabelForRecipe(recipe) }}</span>
            </div>
            <button
              type="button"
              class="secondary-button"
              :disabled="!canCreateRecipe(recipe) || isBusy(`recipe:${recipe.id}`)"
              @click="createStarterJob(recipe)"
            >
              <UiIcon name="Plus" :size="16" />
              {{ recipeActionLabel(recipe) }}
            </button>
          </article>
        </div>
      </section>

      <div class="assistant-workspace">
        <section class="panel jobs-panel" aria-labelledby="jobs-title">
          <div class="panel-heading">
            <div>
              <h2 id="jobs-title">Jobs</h2>
              <p>Active, paused, and draft jobs.</p>
            </div>
            <button
              type="button"
              class="icon-button"
              title="Refresh jobs"
              aria-label="Refresh jobs"
              :disabled="loadingJobs"
              @click="loadJobs"
            >
              <UiIcon name="RefreshCw" :size="17" />
            </button>
          </div>

          <div v-if="loadingJobs" class="empty-row">Loading jobs...</div>
          <div v-else-if="sortedJobs.length === 0" class="empty-state">
            <h3>No jobs yet.</h3>
            <p>Add a Daily Briefing or Weekly Review to get started.</p>
            <button type="button" class="primary-button" @click="addPanelOpen = true">
              <UiIcon name="Plus" :size="18" />
              Add job
            </button>
          </div>
          <div v-else class="job-list">
            <article
              v-for="job in sortedJobs"
              :key="job.id"
              class="job-row"
              :class="{
                'job-row--selected': selectedJobId === job.id,
                'job-row--muted': job.status === 'paused' || job.status === 'draft',
              }"
            >
              <button
                type="button"
                class="job-row-main"
                @click="openJob(job.id)"
              >
                <span class="job-title-block">
                  <strong>{{ job.name }}</strong>
                  <span>{{ cleanPlainText(job.purpose) }}</span>
                </span>
                <span class="job-meta">
                  <span>{{ formatTrigger(job.triggerSummary) }}</span>
                  <span>{{ formatDate(job.lastRunAt) }}</span>
                  <span>{{ formatNextRun(job) }}</span>
                </span>
              </button>

              <div class="job-row-side">
                <span
                  class="status-badge"
                  :class="`status-badge--${job.status}`"
                >
                  {{ statusLabel(job.status) }}
                </span>
                <span
                  v-if="job.lastRunStatus === 'waiting_for_approval'"
                  class="needs-you"
                >
                  Needs you
                </span>
                <div class="row-actions">
                  <button
                    v-if="canRun(job)"
                    type="button"
                    class="icon-button"
                    title="Run now"
                    aria-label="Run now"
                    :disabled="isBusy(`run:${job.id}`)"
                    @click="runJob(job)"
                  >
                    <UiIcon name="Play" :size="16" />
                  </button>
                  <button
                    v-if="canToggle(job)"
                    type="button"
                    class="icon-button"
                    :title="toggleLabel(job)"
                    :aria-label="toggleLabel(job)"
                    :disabled="isBusy(toggleBusyKey(job))"
                    @click="toggleJob(job)"
                  >
                    <UiIcon :name="toggleIcon(job)" :size="16" />
                  </button>
                  <button
                    type="button"
                    class="text-button"
                    @click="openJob(job.id)"
                  >
                    Details
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <aside class="panel detail-panel" aria-label="Job detail">
          <div v-if="loadingDetail" class="empty-row">Loading details...</div>
          <div v-else-if="!selectedJob" class="empty-state detail-empty">
            <h3>Select a job.</h3>
            <p>Details, runs, and recent results appear here.</p>
          </div>
          <template v-else>
            <div class="detail-header">
              <div>
                <h2>{{ selectedJob.name }}</h2>
                <p>{{ cleanPlainText(selectedJob.purpose) }}</p>
              </div>
              <span
                class="status-badge"
                :class="`status-badge--${selectedJob.status}`"
              >
                {{ statusLabel(selectedJob.status) }}
              </span>
            </div>

            <div
              v-if="selectedJob.status === 'needs_setup'"
              class="notice"
            >
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
                <dd>{{ runStatusLabel(selectedJob.lastRunStatus) }} · {{ formatDate(selectedJob.lastRunAt) }}</dd>
              </div>
              <div>
                <dt>Next run</dt>
                <dd>{{ formatNextRun(selectedJob) }}</dd>
              </div>
            </dl>

            <div class="detail-actions">
              <button
                v-if="canRun(selectedJob)"
                type="button"
                class="primary-button"
                :disabled="isBusy(`run:${selectedJob.id}`)"
                @click="runJob(selectedJob)"
              >
                <UiIcon name="Play" :size="17" />
                Run now
              </button>
              <button
                v-if="canToggle(selectedJob)"
                type="button"
                class="secondary-button"
                :disabled="isBusy(toggleBusyKey(selectedJob))"
                @click="toggleJob(selectedJob)"
              >
                <UiIcon :name="toggleIcon(selectedJob)" :size="17" />
                {{ toggleLabel(selectedJob) }}
              </button>
              <button
                type="button"
                class="secondary-button"
                :disabled="isBusy(`duplicate:${selectedJob.id}`)"
                @click="duplicateJob(selectedJob)"
              >
                <UiIcon name="Copy" :size="17" />
                Duplicate
              </button>
            </div>

            <section class="detail-section" aria-labelledby="job-permissions-title">
              <h3 id="job-permissions-title">What This Job Can Do</h3>
              <div class="permission-grid">
                <div>
                  <h4>Reads</h4>
                  <ul>
                    <li
                      v-for="item in selectedDetail?.version?.permissionSummary.reads || []"
                      :key="item"
                    >
                      {{ cleanPlainText(item) }}
                    </li>
                    <li v-if="!(selectedDetail?.version?.permissionSummary.reads || []).length">
                      Nothing listed yet.
                    </li>
                  </ul>
                </div>
                <div>
                  <h4>Creates</h4>
                  <ul>
                    <li
                      v-for="item in selectedDetail?.version?.permissionSummary.writes || []"
                      :key="item"
                    >
                      {{ cleanPlainText(item) }}
                    </li>
                    <li v-if="!(selectedDetail?.version?.permissionSummary.writes || []).length">
                      Nothing listed yet.
                    </li>
                  </ul>
                </div>
                <div>
                  <h4>Needs You For</h4>
                  <ul>
                    <li
                      v-for="item in selectedDetail?.version?.permissionSummary.approvalRequired || []"
                      :key="item"
                    >
                      {{ cleanPlainText(item) }}
                    </li>
                    <li v-if="!(selectedDetail?.version?.permissionSummary.approvalRequired || []).length">
                      Nothing right now.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section class="detail-section" aria-labelledby="job-runs-title">
              <h3 id="job-runs-title">Recent Runs</h3>
              <div v-if="!(selectedDetail?.runs || []).length" class="empty-row">
                No runs yet.
              </div>
              <div v-else class="run-list">
                <article
                  v-for="run in selectedDetail?.runs || []"
                  :key="run.id"
                  class="run-row"
                >
                  <div class="run-row-top">
                    <strong>{{ runStatusLabel(run.status) }}</strong>
                    <span>{{ formatDate(run.startedAt || run.createdAt) }}</span>
                  </div>
                  <p v-if="run.outputPreview">{{ cleanPlainText(run.outputPreview) }}</p>
                  <p v-else-if="run.errorMessage">{{ cleanPlainText(run.errorMessage) }}</p>
                  <div v-if="run.actionResults.length" class="action-result-list">
                    <span
                      v-for="action in run.actionResults"
                      :key="action.id"
                      class="action-result"
                    >
                      {{ capabilityLabel(action.capabilityId) }}: {{ actionStatusLabel(action.status) }}
                    </span>
                  </div>
                </article>
              </div>
            </section>

            <button
              type="button"
              class="danger-button"
              :disabled="isBusy(`archive:${selectedJob.id}`)"
              @click="archiveJob(selectedJob)"
            >
              <UiIcon name="Archive" :size="17" />
              Archive job
            </button>
          </template>
        </aside>
      </div>
    </main>
  </div>
</template>

<style scoped>
.assistant-page {
  min-height: 100vh;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.assistant-main {
  display: grid;
  gap: 16px;
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 32px 40px 44px;
}

.assistant-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.assistant-header h1 {
  margin: 0;
  font-size: clamp(28px, 3vw, 40px);
  line-height: 1.05;
  letter-spacing: 0;
}

.assistant-header p,
.panel-heading p,
.detail-header p,
.starter-main p,
.empty-state p,
.run-row p {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: 14px;
  line-height: 1.5;
}

.assistant-mobile-title {
  display: none;
}

.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-strip span,
.setup-note,
.needs-you,
.action-result {
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

.assistant-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(360px, 0.7fr);
  gap: 16px;
  align-items: start;
}

.panel {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  overflow: hidden;
}

.panel-heading,
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--ui-border);
}

.panel-heading h2,
.detail-header h2,
.detail-section h3,
.empty-state h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.25;
  letter-spacing: 0;
}

.detail-section h3 {
  font-size: 15px;
}

.starter-list,
.job-list,
.run-list {
  display: grid;
}

.starter-row,
.job-row,
.run-row {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
}

.starter-row:last-child,
.job-row:last-child,
.run-row:last-child {
  border-bottom: 0;
}

.starter-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
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

.job-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.job-row--selected {
  background: color-mix(in oklab, var(--ui-accent-soft) 42%, var(--ui-surface));
}

.job-row--muted {
  opacity: 0.76;
}

.job-row-main {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.job-row-main:focus-visible,
button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.job-title-block {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.job-title-block strong {
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.35;
}

.job-title-block span,
.job-meta span {
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.35;
}

.job-meta {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) minmax(120px, 1fr) minmax(120px, 1fr);
  gap: 10px;
}

.job-row-side {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.row-actions,
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.detail-actions {
  justify-content: flex-start;
  padding: 0 16px 16px;
}

.primary-button,
.secondary-button,
.danger-button,
.text-button,
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  border-radius: var(--ui-radius-md);
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.primary-button,
.secondary-button,
.danger-button {
  padding: 0 12px;
}

.primary-button {
  border: 1px solid var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.secondary-button {
  border: 1px solid var(--ui-border);
  background: var(--ui-surface);
  color: var(--ui-text);
}

.danger-button {
  width: fit-content;
  margin: 0 16px 16px;
  border: 1px solid color-mix(in oklab, #e53935 45%, var(--ui-border));
  background: transparent;
  color: var(--ui-text);
}

.text-button,
.icon-button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text);
}

.text-button {
  padding: 0 6px;
}

.icon-button {
  width: 36px;
  padding: 0;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: var(--ui-radius-sm);
  padding: 4px 8px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 800;
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
  margin: 16px;
  border: 1px solid color-mix(in oklab, var(--ui-accent) 40%, var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: 12px;
  background: var(--ui-accent-soft);
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.45;
}

.notice--error {
  margin: 0;
  border-color: color-mix(in oklab, #e53935 42%, var(--ui-border));
  background: color-mix(in oklab, #e53935 10%, var(--ui-surface));
}

.empty-row,
.empty-state {
  padding: 24px 16px;
  color: var(--ui-text-muted);
  font-size: 14px;
  text-align: center;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  min-height: 180px;
  align-content: center;
}

.detail-empty {
  min-height: 360px;
}

.detail-facts {
  display: grid;
  gap: 0;
  margin: 0;
  border-bottom: 1px solid var(--ui-border);
}

.detail-facts div {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ui-border);
}

.detail-facts div:last-child {
  border-bottom: 0;
}

.detail-facts dt {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.detail-facts dd {
  margin: 0;
  color: var(--ui-text);
  font-size: 13px;
  line-height: 1.4;
}

.detail-section {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--ui-border);
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

.run-row {
  padding-inline: 0;
}

.run-row-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--ui-text);
  font-size: 13px;
}

.run-row-top span {
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.action-result-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

@media (max-width: 1080px) {
  .assistant-workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .assistant-main {
    padding: 18px 14px 28px;
  }

  .assistant-mobile-title {
    display: block;
    color: var(--ui-text);
    font-size: 14px;
    font-weight: 800;
  }

  .assistant-header {
    display: grid;
  }

  .assistant-header h1 {
    font-size: 30px;
  }

  .starter-row,
  .job-row {
    grid-template-columns: 1fr;
  }

  .job-row-side {
    justify-items: start;
  }

  .job-meta {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .row-actions,
  .detail-actions {
    justify-content: flex-start;
  }

  .detail-facts div {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
