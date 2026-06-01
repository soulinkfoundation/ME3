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
  validationErrors: Array<{
    message?: string;
    code?: string;
    blocking?: boolean;
  }>;
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
const addModalOpen = ref(false);
const detailModalOpen = ref(false);
const busyKeys = ref(new Set<string>());

const suggestedRecipeOrder = [
  "daily-briefing",
  "weekly-review",
  "email-triage",
  "invoice-receipt-triage",
];

const suggestedRecipeIds = new Set(suggestedRecipeOrder);
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
  if (/^Weekly at /i.test(value))
    return value.replace(/^Weekly/i, "Every week");
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
        <div
          v-if="sortedJobs.length > 0"
          class="assistant-mobile-nav__actions"
        >
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
      :class="{ 'assistant-main--empty': !loadingJobs && sortedJobs.length === 0 }"
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
        <section class="panel jobs-panel" aria-label="Assistant jobs">
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
              <button
                type="button"
                class="job-row-main"
                @click="openJob(job.id)"
              >
                <span class="job-title-block">
                  <strong>{{ job.name }}</strong>
                  <span
                    class="status-badge"
                    :class="`status-badge--${job.status}`"
                  >
                    {{ statusLabel(job.status) }}
                  </span>
                </span>
                <span class="job-meta">
                  <span>Runs: {{ formatTrigger(job.triggerSummary) }}</span>
                  <span>Last run: {{ formatDate(job.lastRunAt) }}</span>
                </span>
              </button>

              <div class="job-row-side">
                <span
                  v-if="job.lastRunStatus === 'waiting_for_approval'"
                  class="needs-you"
                >
                  Needs you
                </span>
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
            All suggested jobs have been added.
          </div>
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

.starter-row,
.job-row {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
}

.starter-row:last-child,
.job-row:last-child {
  border-bottom: 0;
}

.starter-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  padding: 12px 0;
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.job-title-block strong {
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.35;
}

.job-meta span {
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.35;
}

.job-meta {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) minmax(120px, 1fr);
  gap: 10px;
}

.job-row-side {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
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
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 0;
  }

  .starter-main {
    width: 100%;
    min-width: 0;
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
    grid-template-columns: minmax(0, 1fr);
    position: relative;
    padding-right: 56px;
  }

  .job-row-side {
    position: absolute;
    top: 14px;
    right: 16px;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-start;
    gap: 6px;
  }

  .job-meta {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .detail-facts {
    grid-template-columns: 1fr;
    row-gap: 8px;
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
