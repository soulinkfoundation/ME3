<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { api } from "../api";
import Button from "../components/Button.vue";
import IconPicker from "../components/IconPicker.vue";
import PageLoading from "../components/PageLoading.vue";
import {
  activeProjectTaskStatuses,
  missionTasksUrl,
  projectBoardStatusesForProject,
  projectBoardStatuses,
} from "../components/mission-control/projectWorkspace";
import UiIcon from "../components/UiIcon.vue";
import { useAppToast } from "../composables/useAppToast";
import { useSitesStore } from "../stores/sites";
import { resolveUiIconName, type UiIconName } from "../utils/icons";
import type {
  MissionProject,
  MissionTask,
  ProjectBoardStatus,
} from "../components/mission-control/projectWorkspace";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.mission-control",
    title: "Mission Control | ME3",
    description: "ME3 Core Mission Control dashboard.",
    robots: "noindex,follow",
  },
});

type DashboardCardSize = "small" | "medium" | "wide";

type DashboardCardInstance = {
  instanceId: string;
  cardId: string;
  pluginId: string;
  enabled: boolean;
  available?: boolean;
  size: DashboardCardSize;
  sortOrder: number;
};

type DashboardCardContribution = {
  id: string;
  pluginId: string;
  label: string;
  componentKey: string;
  defaultSize: DashboardCardSize;
};

type DashboardQuickLink = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  sortOrder: number;
  destinationId: string;
  available?: boolean;
};

type DashboardDestination = {
  path: string;
};

type DailyBriefingCardData = {
  id: string;
  title: string;
  message: string;
  date: string;
  createdAt: string | null;
  status: string | null;
  relatedId: string | null;
} | null;

type MissionStatementCardData = {
  missionStatement: string;
  mainGoal: string;
  placeholder: string;
  mainGoalPlaceholder: string;
};

type WheelSnapshotCardData = {
  snapshot: null | {
    id: string;
    createdAt: string;
    segments?: Array<{ label: string; value: number }>;
  };
  source: string;
};

type AiUsageCardData = {
  configured: boolean;
  setupRequired: boolean;
  period: {
    id: "current_month";
    startsAt: string;
    endsAt: string;
  };
  currency: "usd";
  totalCost: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  models: Array<{
    provider: string;
    model: string;
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    cost: number;
  }>;
  recent: Array<{
    id: string;
    createdAt: string;
    provider: string;
    model: string;
    success: boolean;
    totalTokens: number;
    cost: number;
  }>;
  fetchedAt: string | null;
  estimated: boolean;
  truncated: boolean;
  error: string | null;
};

type MissionTasksResponse = {
  tasks: MissionTask[];
  nextCursor: string | null;
  limit: number;
};

type ProjectDashboardSummary = {
  id: string;
  label: string;
  project: MissionProject | null;
  total: number;
  counts: Record<ProjectBoardStatus, number>;
};

type MissionDashboardResponse = {
  cards: DashboardCardInstance[];
  availableCards: DashboardCardContribution[];
  quickLinks: DashboardQuickLink[];
  availableQuickActions: Array<{
    id: string;
    label: string;
    icon: string;
    destinationId: string;
  }>;
  destinations: Record<string, DashboardDestination>;
  missionStatement: string;
  mainGoal: string;
  settings: {
    kanbanEnabled: boolean;
    mainGoal: string;
    setupChecklistDismissed: boolean;
  };
  data: {
    "mission.daily-briefing": DailyBriefingCardData;
    "mission.mission-statement": MissionStatementCardData;
    "mission.wheel-latest-snapshot": WheelSnapshotCardData;
    [cardId: string]: unknown;
  };
};

const dashboardCardRegistry = new Set([
  "DailyBriefingCard",
  "MissionStatementCard",
  "WheelSnapshotCard",
  "AiUsageCard",
  "ProjectsSummaryCard",
  "AccountsSummaryCard",
  "CalendarTodayCard",
  "JournalLatestEntryCard",
  "SocialQueueSummaryCard",
  "SitesBlogSummaryCard",
]);

const { toastFromUnknown, toastSuccess } = useAppToast();
const sites = useSitesStore();
const dashboard = ref<MissionDashboardResponse | null>(null);
const loading = ref(true);
const error = ref("");
const missionStatementDraft = ref("");
const mainGoalDraft = ref("");
const missionStatementEditing = ref(false);
const missionStatementSaving = ref(false);
const dashboardEditing = ref(false);
const cardDrafts = ref<DashboardCardInstance[]>([]);
const quickActionDrafts = ref<DashboardQuickLink[]>([]);
const dashboardSaving = ref(false);
const draggedCardId = ref("");
const draggedQuickActionId = ref("");
const cardPickerOpen = ref(false);
const quickActionPickerOpen = ref(false);
const dashboardProjects = ref<MissionProject[]>([]);
const dashboardProjectTasks = ref<MissionTask[]>([]);
const projectsSummaryLoading = ref(false);
const projectsSummaryError = ref("");
const aiUsage = ref<AiUsageCardData | null>(null);
const aiUsageLoading = ref(false);
const aiUsageError = ref("");
const aiUsageModalOpen = ref(false);
const aiUsageConfigureOpen = ref(false);
const setupChecklistDismissed = ref(false);
const phoneInstallModalOpen = ref(false);

const cards = computed(() =>
  (dashboard.value?.cards || [])
    .filter(
      (card) =>
        card.enabled &&
        card.available !== false &&
        isRenderableDashboardCard(card),
    )
    .map((card) => ({ ...card, size: "medium" as const }))
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const quickLinks = computed(() =>
  (dashboard.value?.quickLinks || [])
    .filter(
      (link) =>
        link.enabled &&
        link.available !== false &&
        dashboard.value?.destinations[link.destinationId],
    )
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const visibleCards = computed(() =>
  (dashboardEditing.value ? cardDrafts.value : cards.value)
    .filter(
      (card) =>
        card.enabled &&
        card.available !== false &&
        isRenderableDashboardCard(card),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const visibleQuickLinks = computed(() =>
  (dashboardEditing.value ? quickActionDrafts.value : quickLinks.value)
    .filter(
      (link) =>
        link.enabled &&
        link.available !== false &&
        dashboard.value?.destinations[link.destinationId],
    )
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const availableCardDrafts = computed(() =>
  cardDrafts.value
    .filter(
      (card) => card.available !== false && isRenderableDashboardCard(card),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const availableQuickActionDrafts = computed(() =>
  quickActionDrafts.value
    .filter(
      (link) =>
        link.available !== false &&
        dashboard.value?.destinations[link.destinationId],
    )
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const addableCardDrafts = computed(() =>
  availableCardDrafts.value.filter((card) => !card.enabled),
);
const addableQuickActionDrafts = computed(() =>
  availableQuickActionDrafts.value.filter((link) => !link.enabled),
);
const dashboardReady = computed(
  () => !loading.value && Boolean(dashboard.value),
);
const dailyBriefing = computed(
  () => dashboard.value?.data["mission.daily-briefing"] || null,
);
const missionStatement = computed(
  () => dashboard.value?.data["mission.mission-statement"] || null,
);
const wheelSnapshot = computed(
  () => dashboard.value?.data["mission.wheel-latest-snapshot"] || null,
);
const wheelSegments = computed(
  () => wheelSnapshot.value?.snapshot?.segments || [],
);
const activeDashboardProjectTasks = computed(() =>
  dashboardProjectTasks.value.filter((task) =>
    activeProjectTaskStatuses.includes(task.status as ProjectBoardStatus),
  ),
);
const setupProfilePath = computed(() => {
  const profileSite = sites.sites.find(
    (site) => (site.site_type || "profile") === "profile",
  );
  return profileSite?.username
    ? `/sites/${encodeURIComponent(profileSite.username)}`
    : "/create";
});
const projectSummaries = computed<ProjectDashboardSummary[]>(() => {
  const activeProjects = dashboardProjects.value.filter(
    (project) => project.status === "active",
  );
  const projectIds = new Set(activeProjects.map((project) => project.id));
  const createCounts = (): Record<ProjectBoardStatus, number> =>
    Object.fromEntries(
      projectBoardStatuses.map((status) => [status.id, 0]),
    ) as Record<ProjectBoardStatus, number>;
  const summaries = activeProjects.map((project) => ({
    id: project.id,
    label: project.name,
    project,
    total: 0,
    counts: createCounts(),
  })) satisfies ProjectDashboardSummary[];
  const summaryById = new Map(
    summaries.map((summary) => [summary.id, summary]),
  );
  const personalSummary: ProjectDashboardSummary = {
    id: "personal",
    label: "Personal",
    project: null,
    total: 0,
    counts: createCounts(),
  };

  for (const task of activeDashboardProjectTasks.value) {
    const summary =
      task.projectId && projectIds.has(task.projectId)
        ? summaryById.get(task.projectId)
        : personalSummary;
    if (!summary) continue;
    const status = task.status as ProjectBoardStatus;
    summary.total += 1;
    summary.counts[status] += 1;
  }

  const next: ProjectDashboardSummary[] = summaries.filter(
    (summary) => summary.total > 0,
  );
  if (personalSummary.total > 0) next.push(personalSummary);
  return next
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, 4);
});
const visibleProjectStatuses = computed(() =>
  projectBoardStatuses.filter((status) => status.id !== "done"),
);
const aiUsageTopModels = computed(() =>
  (aiUsage.value?.models || []).slice(0, 3),
);
const aiUsageMoreModelsCount = computed(() =>
  Math.max(
    0,
    (aiUsage.value?.models.length || 0) - aiUsageTopModels.value.length,
  ),
);
const aiUsageDetailsAvailable = computed(
  () =>
    Boolean(aiUsage.value) &&
    !aiUsage.value?.setupRequired &&
    !aiUsage.value?.error,
);
const aiUsagePeriodLabel = computed(() =>
  aiUsageDetailsAvailable.value && aiUsage.value
    ? formatAiUsagePeriod(aiUsage.value.period)
    : "",
);

function cardLabel(card: DashboardCardInstance): string {
  const contribution = dashboard.value?.availableCards.find(
    (item) => item.id === card.cardId,
  );
  return contribution?.label || card.cardId;
}

function cardComponentKey(card: DashboardCardInstance): string {
  const contribution = dashboard.value?.availableCards.find(
    (item) => item.id === card.cardId,
  );
  return contribution?.componentKey || "";
}

function isRenderableDashboardCard(card: DashboardCardInstance): boolean {
  const key = cardComponentKey(card);
  return Boolean(key && dashboardCardRegistry.has(key));
}

function quickLinkPath(link: DashboardQuickLink): string {
  return (
    dashboard.value?.destinations[link.destinationId]?.path ||
    "/mission-control"
  );
}

function quickLinkIcon(link: DashboardQuickLink): UiIconName {
  return (resolveUiIconName(link.icon) || "Circle") as UiIconName;
}

function quickActionDestinationLabel(link: DashboardQuickLink): string {
  const contribution = dashboard.value?.availableQuickActions.find(
    (action) => action.id === link.id,
  );
  return contribution?.label || link.destinationId;
}

function missionStatementDisplayText(): string {
  return (
    missionStatementDraft.value.trim() ||
    missionStatement.value?.missionStatement.trim() ||
    missionStatement.value?.placeholder ||
    ""
  );
}

const mainGoalHasValue = computed(() => Boolean(mainGoalDisplayText().trim()));

function mainGoalDisplayText(): string {
  return (
    mainGoalDraft.value.trim() ||
    dashboard.value?.mainGoal?.trim() ||
    missionStatement.value?.mainGoal?.trim() ||
    ""
  );
}

function projectStatusCountLabel(
  summary: ProjectDashboardSummary,
  status: ProjectBoardStatus,
): string {
  const count = summary.counts[status];
  const label =
    projectBoardStatusesForProject(summary.project).find(
      (item) => item.id === status,
    )?.label || status;
  return `${label} ${count}`;
}

function projectSummaryPath(summary: ProjectDashboardSummary): string {
  return summary.id === "personal"
    ? "/mission-control/projects"
    : `/mission-control/projects?project=${encodeURIComponent(summary.id)}`;
}

function visibleCardEnabled(cardId: string): boolean {
  return visibleCards.value.some((card) => card.cardId === cardId);
}

async function dismissSetupChecklist() {
  setupChecklistDismissed.value = true;
  localStorage.setItem("me3:mission-control:setup-checklist-dismissed", "true");
  try {
    dashboard.value = await api.patch<MissionDashboardResponse>(
      "/mission-control/dashboard",
      {
        settings: { setupChecklistDismissed: true },
      },
    );
    syncDashboardDrafts();
  } catch (err) {
    toastFromUnknown(err, "Setup checklist dismissal could not be saved");
  }
}

function syncDashboardDrafts() {
  cardDrafts.value = [...(dashboard.value?.cards || [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((card, index) => ({ ...card, size: "medium", sortOrder: index }));
  quickActionDrafts.value = [...(dashboard.value?.quickLinks || [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((link, index) => ({ ...link, sortOrder: index }));
}

function openDashboardEditor() {
  syncDashboardDrafts();
  dashboardEditing.value = true;
}

function closeDashboardEditor() {
  dashboardEditing.value = false;
  draggedCardId.value = "";
  draggedQuickActionId.value = "";
  cardPickerOpen.value = false;
  quickActionPickerOpen.value = false;
  syncDashboardDrafts();
}

function startMissionStatementEdit() {
  missionStatementDraft.value = dashboard.value?.missionStatement || "";
  mainGoalDraft.value = dashboard.value?.mainGoal || "";
  missionStatementEditing.value = true;
}

function updateCardDraft(
  cardId: string,
  patch: Partial<Pick<DashboardCardInstance, "enabled">>,
) {
  cardDrafts.value = cardDrafts.value.map((card) =>
    card.cardId === cardId ? { ...card, ...patch } : card,
  );
}

function updateQuickActionDraft(
  linkId: string,
  patch: Partial<Pick<DashboardQuickLink, "label" | "icon" | "enabled">>,
) {
  const index = quickActionDrafts.value.findIndex((link) => link.id === linkId);
  const current = quickActionDrafts.value[index];
  if (!current) return;
  quickActionDrafts.value[index] = { ...current, ...patch };
}

function nextEnabledCardSortOrder(): number {
  return Math.max(-1, ...visibleCards.value.map((card) => card.sortOrder)) + 1;
}

function nextEnabledQuickActionSortOrder(): number {
  return (
    Math.max(-1, ...visibleQuickLinks.value.map((link) => link.sortOrder)) + 1
  );
}

function addCardDraft(cardId: string) {
  cardDrafts.value = cardDrafts.value.map((card) =>
    card.cardId === cardId
      ? {
          ...card,
          enabled: true,
          size: "medium",
          sortOrder: nextEnabledCardSortOrder(),
        }
      : card,
  );
  cardPickerOpen.value = false;
}

function removeCardDraft(cardId: string) {
  updateCardDraft(cardId, { enabled: false });
}

function addQuickActionDraft(linkId: string) {
  quickActionDrafts.value = quickActionDrafts.value.map((link) =>
    link.id === linkId
      ? { ...link, enabled: true, sortOrder: nextEnabledQuickActionSortOrder() }
      : link,
  );
  quickActionPickerOpen.value = false;
}

function removeQuickActionDraft(linkId: string) {
  updateQuickActionDraft(linkId, { enabled: false });
}

function setCardDropTarget(targetCardId: string) {
  const sourceCardId = draggedCardId.value;
  if (!sourceCardId || sourceCardId === targetCardId) return;
  reorderCards(sourceCardId, targetCardId);
}

function setQuickActionDropTarget(targetLinkId: string) {
  const sourceLinkId = draggedQuickActionId.value;
  if (!sourceLinkId || sourceLinkId === targetLinkId) return;
  reorderQuickActions(sourceLinkId, targetLinkId);
}

function reorderCards(sourceCardId: string, targetCardId: string) {
  const next = [...cardDrafts.value].sort((a, b) => a.sortOrder - b.sortOrder);
  const sourceIndex = next.findIndex((card) => card.cardId === sourceCardId);
  const targetIndex = next.findIndex((card) => card.cardId === targetCardId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return;
  next.splice(targetIndex, 0, source);
  cardDrafts.value = next.map((card, sortOrder) => ({ ...card, sortOrder }));
}

function reorderQuickActions(sourceLinkId: string, targetLinkId: string) {
  const next = [...quickActionDrafts.value].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const sourceIndex = next.findIndex((link) => link.id === sourceLinkId);
  const targetIndex = next.findIndex((link) => link.id === targetLinkId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return;
  next.splice(targetIndex, 0, source);
  quickActionDrafts.value = next.map((link, sortOrder) => ({
    ...link,
    sortOrder,
  }));
}

function formatDashboardDate(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatAiUsagePeriod(period: AiUsageCardData["period"]): string {
  const startsAt = new Date(period.startsAt);
  const endsAt = new Date(period.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return "";
  }
  const includeYear = startsAt.getFullYear() !== new Date().getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
  };
  if (includeYear) options.year = "numeric";
  const formatter = new Intl.DateTimeFormat(undefined, options);
  return `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
}

function formatCurrency(value: number | null | undefined): string {
  const amount =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 2,
    maximumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 2,
  }).format(amount);
}

function formatCompactNumber(value: number | null | undefined): string {
  const amount =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

function formatTokenCount(value: number | null | undefined): string {
  return `${formatCompactNumber(value)} tokens`;
}

async function loadDashboard() {
  loading.value = true;
  error.value = "";
  try {
    dashboard.value = await api.get<MissionDashboardResponse>(
      "/mission-control/dashboard",
    );
    setupChecklistDismissed.value =
      dashboard.value.settings.setupChecklistDismissed ||
      localStorage.getItem("me3:mission-control:setup-checklist-dismissed") ===
        "true";
    missionStatementDraft.value = dashboard.value.missionStatement;
    mainGoalDraft.value = dashboard.value.mainGoal;
    syncDashboardDrafts();
    if (visibleCardEnabled("mission.ai-usage")) {
      void loadAiUsage();
    }
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Mission Control could not load.";
  } finally {
    loading.value = false;
  }
}

async function loadAiUsage() {
  if (aiUsageLoading.value) return;
  aiUsageLoading.value = true;
  aiUsageError.value = "";
  try {
    aiUsage.value = await api.get<AiUsageCardData>(
      "/mission-control/dashboard/cards/mission.ai-usage",
    );
    if (aiUsage.value.setupRequired || aiUsage.value.error) {
      aiUsageModalOpen.value = false;
    }
  } catch (err) {
    aiUsageError.value =
      err instanceof Error ? err.message : "AI usage could not load.";
    aiUsage.value = null;
  } finally {
    aiUsageLoading.value = false;
  }
}

async function loadProjectsSummary() {
  projectsSummaryLoading.value = true;
  projectsSummaryError.value = "";
  try {
    const projectsResponse = await api.get<{ projects: MissionProject[] }>(
      "/mission-control/projects",
    );
    const tasks: MissionTask[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      const tasksResponse: MissionTasksResponse = await api.get(
        missionTasksUrl({ active: true, cursor }),
      );
      tasks.push(...(tasksResponse.tasks || []));
      cursor = tasksResponse.nextCursor || null;
      if (!cursor) break;
    }
    dashboardProjects.value = projectsResponse.projects || [];
    dashboardProjectTasks.value = tasks;
  } catch (err) {
    projectsSummaryError.value =
      err instanceof Error ? err.message : "Project stats could not load.";
    dashboardProjects.value = [];
    dashboardProjectTasks.value = [];
  } finally {
    projectsSummaryLoading.value = false;
  }
}

function closeOpenDashboardModals() {
  aiUsageModalOpen.value = false;
  aiUsageConfigureOpen.value = false;
  cardPickerOpen.value = false;
  quickActionPickerOpen.value = false;
}

async function saveMissionStatement() {
  if (missionStatementSaving.value) return;
  missionStatementSaving.value = true;
  try {
    dashboard.value = await api.patch<MissionDashboardResponse>(
      "/mission-control/dashboard",
      {
        missionStatement: missionStatementDraft.value,
        mainGoal: mainGoalDraft.value,
      },
    );
    missionStatementDraft.value = dashboard.value.missionStatement;
    mainGoalDraft.value = dashboard.value.mainGoal;
    missionStatementEditing.value = false;
    toastSuccess("Mission context saved");
  } catch (err) {
    toastFromUnknown(err, "Mission context could not be saved");
  } finally {
    missionStatementSaving.value = false;
  }
}

async function saveDashboardLayout() {
  if (dashboardSaving.value) return;
  dashboardSaving.value = true;
  try {
    dashboard.value = await api.patch<MissionDashboardResponse>(
      "/mission-control/dashboard",
      {
        cards: cardDrafts.value.map((card, sortOrder) => ({
          ...card,
          size: "medium",
          sortOrder,
        })),
        quickLinks: quickActionDrafts.value.map((link, sortOrder) => ({
          ...link,
          label: link.label.trim() || quickActionDestinationLabel(link),
          icon: resolveUiIconName(link.icon) ? link.icon : "Circle",
          sortOrder,
        })),
      },
    );
    syncDashboardDrafts();
    dashboardEditing.value = false;
    if (visibleCardEnabled("mission.ai-usage")) {
      void loadAiUsage();
    }
    toastSuccess("Dashboard saved");
  } catch (err) {
    toastFromUnknown(err, "Dashboard could not be saved");
  } finally {
    dashboardSaving.value = false;
  }
}

onMounted(() => {
  void sites.fetchSites();
  void loadDashboard();
  void loadProjectsSummary();
});
</script>

<template>
  <main class="mission-dashboard" @keydown.esc="closeOpenDashboardModals">
    <header class="mission-dashboard__topbar">
      <div class="mission-dashboard__topbar-spacer" aria-hidden="true" />
      <div
        v-if="dashboardReady && (visibleQuickLinks.length || dashboardEditing)"
        class="mission-dashboard__topbar-quicklinks"
        aria-label="Quick actions"
        @dragover.prevent
      >
        <button
          v-if="dashboardEditing"
          type="button"
          class="dashboard-add-action"
          aria-label="Add quick action"
          title="Add quick action"
          @click="quickActionPickerOpen = true"
        >
          <UiIcon name="Plus" :size="18" />
        </button>
        <div
          v-for="link in visibleQuickLinks"
          :key="link.id"
          class="dashboard-quick-action-wrap"
          :draggable="dashboardEditing"
          @dragstart="draggedQuickActionId = link.id"
          @dragend="draggedQuickActionId = ''"
          @dragover.prevent
          @drop.prevent="setQuickActionDropTarget(link.id)"
        >
          <Button
            class="dashboard-quick-action"
            color="outline"
            shape="pill"
            size="compact"
            :aria-label="link.label"
            :title="link.label"
            :to="dashboardEditing ? undefined : quickLinkPath(link)"
          >
            <template #icon>
              <UiIcon :name="quickLinkIcon(link)" :size="17" />
            </template>
            {{ link.label }}
          </Button>
          <Button
            v-if="dashboardEditing"
            class="dashboard-quick-action-remove"
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            aria-label="Remove quick action"
            title="Remove quick action"
            @click="removeQuickActionDraft(link.id)"
          >
            <UiIcon name="X" :size="14" />
          </Button>
        </div>
      </div>
      <div v-if="dashboardReady" class="mission-dashboard__topbar-actions">
        <Button
          v-if="dashboardEditing"
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          aria-label="Save dashboard"
          title="Save dashboard"
          :disabled="dashboardSaving"
          @click="saveDashboardLayout"
        >
          <UiIcon name="Save" :size="18" />
        </Button>
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          :aria-label="
            dashboardEditing ? 'Close dashboard editing' : 'Edit dashboard'
          "
          :title="
            dashboardEditing ? 'Close dashboard editing' : 'Edit dashboard'
          "
          @click="
            dashboardEditing ? closeDashboardEditor() : openDashboardEditor()
          "
        >
          <UiIcon
            :name="dashboardEditing ? 'X' : 'SlidersHorizontal'"
            :size="18"
          />
        </Button>
      </div>
    </header>

    <section
      class="mission-dashboard__workspace"
      aria-label="Mission Control dashboard"
    >
      <p v-if="error" class="mission-dashboard__message is-error">
        {{ error }}
      </p>
      <PageLoading v-else-if="loading" label="Loading mission control..." />

      <div v-if="dashboardReady" class="mission-dashboard__grid">
        <article
          v-if="!setupChecklistDismissed"
          class="dashboard-card dashboard-card--small setup-checklist-card"
        >
          <header class="dashboard-card__header">
            <h2 class="dashboard-card__title">
              <UiIcon name="ClipboardCheck" :size="16" />
              <span>Setup checklist</span>
            </h2>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              aria-label="Dismiss setup checklist"
              title="Dismiss setup checklist"
              @click="dismissSetupChecklist"
            >
              <UiIcon name="X" :size="15" />
            </Button>
          </header>
          <p class="dashboard-card__body">
            To make the most of ME3 do the following.
          </p>
          <ul class="setup-checklist-card__list">
            <li>
              <UiIcon name="CircleCheck" :size="15" aria-hidden="true" />
              <RouterLink :to="setupProfilePath">
                Complete your profile
              </RouterLink>
            </li>
            <li>
              <UiIcon name="CircleCheck" :size="15" aria-hidden="true" />
              <RouterLink to="/account?section=mailbox">
                Configure email
              </RouterLink>
            </li>
            <li>
              <UiIcon name="CircleCheck" :size="15" aria-hidden="true" />
              <RouterLink to="/account?section=app-connections">
                Connect a messaging app
              </RouterLink>
            </li>
            <li>
              <UiIcon name="CircleCheck" :size="15" aria-hidden="true" />
              <button
                class="setup-checklist-card__link"
                type="button"
                @click="phoneInstallModalOpen = true"
              >
                Add ME3 to your phone
              </button>
            </li>
            <li>
              <UiIcon name="CircleCheck" :size="15" aria-hidden="true" />
              <RouterLink to="/assistant">
                Activate a job for your assistant
              </RouterLink>
            </li>
          </ul>
        </article>

        <article
          v-for="card in visibleCards"
          :key="card.instanceId"
          class="dashboard-card"
          :class="[
            `dashboard-card--${card.size}`,
            {
              'is-editing': dashboardEditing,
              'is-dragging': draggedCardId === card.cardId,
            },
          ]"
          :draggable="dashboardEditing"
          @dragstart="draggedCardId = card.cardId"
          @dragend="draggedCardId = ''"
          @dragover.prevent
          @drop.prevent="setCardDropTarget(card.cardId)"
        >
          <div v-if="dashboardEditing" class="dashboard-card__edit-controls">
            <Button
              class="dashboard-drag-handle"
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              aria-label="Drag card"
              title="Drag card"
            >
              <UiIcon name="GripVertical" :size="15" />
            </Button>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              aria-label="Remove card"
              title="Remove card"
              @click="removeCardDraft(card.cardId)"
            >
              <UiIcon name="EyeOff" :size="15" />
            </Button>
          </div>
          <template v-if="cardComponentKey(card) === 'DailyBriefingCard'">
            <header class="dashboard-card__header">
              <h2 class="dashboard-card__title">
                <UiIcon name="Sun" :size="16" />
                <span>Daily Briefing</span>
              </h2>
              <span v-if="dailyBriefing?.createdAt">
                {{ formatDashboardDate(dailyBriefing.createdAt) }}
              </span>
            </header>
            <p v-if="dailyBriefing" class="dashboard-card__body">
              {{ dailyBriefing.message }}
            </p>
            <div v-else class="dashboard-empty">
              <p>No Daily Briefing has landed yet.</p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                to="/assistant"
              >
                Configure Daily Briefing
              </Button>
            </div>
          </template>

          <template
            v-else-if="cardComponentKey(card) === 'MissionStatementCard'"
          >
            <header class="dashboard-card__header">
              <h2 class="dashboard-card__title">
                <UiIcon name="Rocket" :size="16" />
                <span>Mission Statement</span>
              </h2>
              <div
                v-if="!dashboardEditing"
                class="dashboard-card__actions dashboard-card__actions--inline"
                :class="{ 'is-active': missionStatementEditing }"
              >
                <Button
                  v-if="!missionStatementEditing"
                  class="dashboard-card__action-button"
                  color="ghost"
                  shape="soft"
                  size="compact"
                  icon-only
                  aria-label="Edit mission context"
                  title="Edit mission context"
                  @click="startMissionStatementEdit"
                >
                  <UiIcon name="Pencil" :size="16" />
                </Button>
                <Button
                  v-else
                  class="dashboard-card__action-button is-saving"
                  color="ghost"
                  shape="soft"
                  size="compact"
                  icon-only
                  aria-label="Save mission context"
                  title="Save mission context"
                  :disabled="missionStatementSaving"
                  @click="saveMissionStatement"
                >
                  <UiIcon name="Save" :size="16" />
                </Button>
              </div>
            </header>
            <form
              v-if="missionStatementEditing"
              class="mission-statement-form"
              @submit.prevent="saveMissionStatement"
            >
              <label class="mission-statement-form__field">
                <span>Mission statement</span>
                <textarea
                  v-model="missionStatementDraft"
                  :placeholder="missionStatement?.placeholder"
                  rows="5"
                />
              </label>
              <label class="mission-statement-form__field">
                <span>Goals</span>
                <textarea
                  v-model="mainGoalDraft"
                  :placeholder="missionStatement?.mainGoalPlaceholder"
                  rows="3"
                  maxlength="600"
                />
              </label>
            </form>
            <div v-else class="mission-context-display">
              <p class="mission-statement-display">
                {{ missionStatementDisplayText() }}
              </p>
              <div
                class="mission-goal-display"
                :class="{ 'is-empty': !mainGoalHasValue }"
              >
                <h3 class="dashboard-card__title mission-goal-display__title">
                  <UiIcon name="Target" :size="16" />
                  <span>Goals</span>
                </h3>
                <p>
                  {{
                    mainGoalHasValue
                      ? mainGoalDisplayText()
                      : "No current goals set yet."
                  }}
                </p>
              </div>
            </div>
          </template>

          <template v-else-if="cardComponentKey(card) === 'WheelSnapshotCard'">
            <header class="dashboard-card__header">
              <RouterLink
                class="dashboard-card__title dashboard-card__title-link"
                to="/mission-control/wheel-of-life"
              >
                <UiIcon name="ShipWheel" :size="16" />
                <span>Wheel of Life</span>
              </RouterLink>
              <div class="dashboard-card__header-actions">
                <span v-if="wheelSnapshot?.snapshot">
                  Saved
                  {{ formatDashboardDate(wheelSnapshot.snapshot.createdAt) }}
                </span>
                <div
                  v-if="!dashboardEditing"
                  class="dashboard-card__actions dashboard-card__actions--inline"
                >
                  <Button
                    class="dashboard-card__action-button"
                    color="ghost"
                    shape="soft"
                    size="compact"
                    icon-only
                    to="/mission-control/wheel-of-life"
                    aria-label="Open Wheel of Life"
                    title="Open Wheel of Life"
                  >
                    <UiIcon name="Eye" :size="16" />
                  </Button>
                </div>
              </div>
            </header>
            <div v-if="wheelSnapshot?.snapshot" class="wheel-summary">
              <div
                v-for="segment in wheelSegments"
                :key="segment.label"
                class="wheel-summary__row"
              >
                <span>{{ segment.label }}</span>
                <meter min="0" max="10" :value="segment.value" />
              </div>
            </div>
            <div v-else class="dashboard-empty">
              <p>Save a Wheel of Life snapshot to see it here.</p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                to="/mission-control/wheel-of-life"
              >
                Open Wheel
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'AiUsageCard'">
            <header class="dashboard-card__header">
              <h2 class="dashboard-card__title">
                <UiIcon name="Gauge" :size="16" />
                <span>AI Usage</span>
              </h2>
              <div class="dashboard-card__header-actions">
                <span v-if="aiUsagePeriodLabel">
                  {{ aiUsagePeriodLabel }}
                </span>
                <div
                  v-if="!dashboardEditing && aiUsageDetailsAvailable"
                  class="dashboard-card__actions dashboard-card__actions--inline"
                >
                  <Button
                    class="dashboard-card__action-button"
                    color="ghost"
                    shape="soft"
                    size="compact"
                    icon-only
                    aria-label="Open AI usage details"
                    title="Open AI usage details"
                    @click="aiUsageModalOpen = true"
                  >
                    <UiIcon name="Eye" :size="16" />
                  </Button>
                </div>
              </div>
            </header>
            <div v-if="aiUsageLoading" class="dashboard-empty">
              <p>Loading AI usage...</p>
            </div>
            <div v-else-if="aiUsageError" class="dashboard-empty">
              <p>{{ aiUsageError }}</p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                @click="loadAiUsage"
              >
                Retry
              </Button>
            </div>
            <div v-else-if="aiUsage?.setupRequired" class="dashboard-empty">
              <Button
                color="outline"
                shape="soft"
                size="compact"
                @click="aiUsageConfigureOpen = true"
              >
                Configure
              </Button>
            </div>
            <div v-else-if="aiUsage?.error" class="dashboard-empty">
              <p>{{ aiUsage.error }}</p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                @click="loadAiUsage"
              >
                Retry
              </Button>
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                @click="aiUsageConfigureOpen = true"
              >
                Configure
              </Button>
            </div>
            <div v-else-if="aiUsage" class="ai-usage-summary">
              <div class="ai-usage-summary__total">
                <strong>{{ formatCurrency(aiUsage.totalCost) }}</strong>
                <span>
                  {{ formatCompactNumber(aiUsage.totalRequests) }} requests ·
                  {{ formatTokenCount(aiUsage.totalTokens) }}
                </span>
              </div>
              <div v-if="aiUsageTopModels.length" class="ai-usage-models">
                <div
                  v-for="model in aiUsageTopModels"
                  :key="`${model.provider}:${model.model}`"
                  class="ai-usage-models__row"
                >
                  <div>
                    <strong :title="model.model">{{ model.model }}</strong>
                    <span :title="model.provider">{{ model.provider }}</span>
                  </div>
                  <span>{{ formatCurrency(model.cost) }}</span>
                </div>
                <button
                  v-if="!dashboardEditing && aiUsageMoreModelsCount"
                  type="button"
                  class="ai-usage-models__more"
                  :aria-label="`Show ${aiUsageMoreModelsCount} more AI usage items`"
                  @click="aiUsageModalOpen = true"
                >
                  {{ aiUsageMoreModelsCount }} more
                </button>
              </div>
            </div>
            <div v-else class="dashboard-empty">
              <p>AI usage is ready to load.</p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                @click="loadAiUsage"
              >
                Load Usage
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'ProjectsSummaryCard'">
            <header class="dashboard-card__header">
              <RouterLink
                class="dashboard-card__title dashboard-card__title-link"
                to="/mission-control/projects"
              >
                <UiIcon name="FolderDot" :size="16" />
                <span>Projects</span>
              </RouterLink>
              <div
                v-if="!dashboardEditing"
                class="dashboard-card__actions dashboard-card__actions--inline"
              >
                <Button
                  class="dashboard-card__action-button"
                  color="ghost"
                  shape="soft"
                  size="compact"
                  icon-only
                  to="/mission-control/projects"
                  aria-label="Open Projects"
                  title="Open Projects"
                >
                  <UiIcon name="Eye" :size="16" />
                </Button>
              </div>
            </header>
            <div v-if="projectsSummaryLoading" class="dashboard-empty">
              <p>Loading project stats...</p>
            </div>
            <div v-else-if="projectsSummaryError" class="dashboard-empty">
              <p>{{ projectsSummaryError }}</p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                to="/mission-control/projects"
              >
                Open Projects
              </Button>
            </div>
            <div v-else-if="projectSummaries.length" class="project-summary">
              <div
                v-for="summary in projectSummaries"
                :key="summary.id"
                class="project-summary__row"
              >
                <div class="project-summary__main">
                  <RouterLink :to="projectSummaryPath(summary)">
                    {{ summary.label }}:
                  </RouterLink>
                  <div class="project-summary__stats">
                    <RouterLink
                      v-for="status in visibleProjectStatuses"
                      :key="status.id"
                      :to="projectSummaryPath(summary)"
                      :class="{ 'is-empty': summary.counts[status.id] === 0 }"
                    >
                      {{ projectStatusCountLabel(summary, status.id) }}
                    </RouterLink>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="dashboard-empty">
              <p>No open project tasks yet.</p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                to="/mission-control/projects"
              >
                Open Projects
              </Button>
            </div>
          </template>
          <template
            v-else-if="cardComponentKey(card) === 'AccountsSummaryCard'"
          >
            <header class="dashboard-card__header">
              <h2>Accounts</h2>
            </header>
            <div class="dashboard-empty">
              <p>
                Accounts summary data will appear here once the ledger card
                endpoint is wired.
              </p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                to="/accounts"
              >
                Open Accounts
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'CalendarTodayCard'">
            <header class="dashboard-card__header">
              <h2>Today</h2>
            </header>
            <div class="dashboard-empty">
              <p>
                Calendar summary data will appear here once the calendar card
                endpoint is wired.
              </p>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                to="/calendar"
              >
                Open Calendar
              </Button>
            </div>
          </template>
          <template
            v-else-if="cardComponentKey(card) === 'JournalLatestEntryCard'"
          >
            <header class="dashboard-card__header">
              <h2>Journal</h2>
            </header>
            <div class="dashboard-empty">
              <p>
                Latest journal data will appear here once the journal card
                endpoint is wired.
              </p>
              <Button color="outline" shape="soft" size="compact" to="/journal">
                Open Journal
              </Button>
            </div>
          </template>
          <template
            v-else-if="cardComponentKey(card) === 'SocialQueueSummaryCard'"
          >
            <header class="dashboard-card__header">
              <h2>Social Queue</h2>
            </header>
            <div class="dashboard-empty">
              <p>
                Queued social content will appear here once the social card
                endpoint is wired.
              </p>
              <Button color="outline" shape="soft" size="compact" to="/social">
                Open Social
              </Button>
            </div>
          </template>
          <template
            v-else-if="cardComponentKey(card) === 'SitesBlogSummaryCard'"
          >
            <header class="dashboard-card__header">
              <h2>Blog</h2>
            </header>
            <div class="dashboard-empty">
              <p>
                Blog draft data will appear here once the site card endpoint is
                wired.
              </p>
              <Button color="outline" shape="soft" size="compact" to="/build">
                Open Builder
              </Button>
            </div>
          </template>
        </article>
        <button
          v-if="dashboardEditing"
          type="button"
          class="dashboard-add-card"
          aria-label="Add dashboard card"
          @click="cardPickerOpen = true"
        >
          <UiIcon name="Plus" :size="34" />
        </button>
      </div>
    </section>

    <div
      v-if="phoneInstallModalOpen"
      class="dashboard-modal-backdrop"
      @click.self="phoneInstallModalOpen = false"
    >
      <section
        class="dashboard-modal dashboard-modal--phone"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-install-title"
        tabindex="-1"
        @keydown.esc="phoneInstallModalOpen = false"
      >
        <header class="dashboard-modal__header">
          <h2 id="phone-install-title">Add ME3 to your phone</h2>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            aria-label="Close phone install guide"
            @click="phoneInstallModalOpen = false"
          >
            <UiIcon name="X" :size="18" />
          </Button>
        </header>
        <div class="dashboard-modal__body phone-install-modal__body">
          <p class="dashboard-modal__empty">
            Add your ME3 install as an app icon on your phone.
          </p>
          <video
            class="phone-install-video"
            src="https://me3.app/me3_shortcut.mp4"
            autoplay
            muted
            playsinline
            controls
          />
        </div>
      </section>
    </div>

    <div
      v-if="aiUsageConfigureOpen"
      class="dashboard-modal-backdrop"
      @click.self="aiUsageConfigureOpen = false"
    >
      <section
        class="dashboard-modal dashboard-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-usage-configure-title"
        tabindex="-1"
        @keydown.esc="aiUsageConfigureOpen = false"
      >
        <header class="dashboard-modal__header">
          <h2 id="ai-usage-configure-title">Configure AI Usage</h2>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            aria-label="Close AI usage setup"
            @click="aiUsageConfigureOpen = false"
          >
            <UiIcon name="X" :size="18" />
          </Button>
        </header>
        <div class="dashboard-modal__body">
          <ol class="ai-usage-config">
            <li>
              <span>1</span>
              <p>
                Open the
                <a
                  href="https://dash.cloudflare.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >Cloudflare dashboard</a>, search
                <strong>account id</strong>, and copy the value.
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                Search <strong>API tokens</strong>, create a token, and give it
                Account permissions for <strong>AI Gateway</strong>:
                <strong>Edit</strong>, <strong>Read</strong>, and
                <strong>Run</strong>.
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                Visit
                <a
                  href="https://dash.cloudflare.com/?to=/:account/workers-and-pages"
                  target="_blank"
                  rel="noopener noreferrer"
                >Workers &amp; Pages</a>, open your ME3 Worker, then go to Settings -> Variables and
                secrets -> Add.
              </p>
            </li>
            <li>
              <span>4</span>
              <p>
                Add <code>CLOUDFLARE_ACCOUNT_ID</code> with the account ID, and
                add <code>CLOUDFLARE_API_TOKEN</code> with the new token.
              </p>
            </li>
            <li>
              <span>5</span>
              <p>
                You may need to redeploy your Worker before ME3 can read them.
              </p>
            </li>
          </ol>
        </div>
      </section>
    </div>

    <div
      v-if="aiUsageModalOpen"
      class="dashboard-modal-backdrop"
      @click.self="aiUsageModalOpen = false"
    >
      <section
        class="dashboard-modal dashboard-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-usage-title"
      >
        <header class="dashboard-modal__header">
          <h2 id="ai-usage-title">AI Usage</h2>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            aria-label="Close AI usage details"
            @click="aiUsageModalOpen = false"
          >
            <UiIcon name="X" :size="18" />
          </Button>
        </header>
        <div class="dashboard-modal__body">
          <div v-if="aiUsageDetailsAvailable && aiUsage" class="ai-usage-detail">
            <div class="ai-usage-detail__metrics">
              <div>
                <span>Spend</span>
                <strong>{{ formatCurrency(aiUsage.totalCost) }}</strong>
              </div>
              <div>
                <span>Requests</span>
                <strong>{{
                  formatCompactNumber(aiUsage.totalRequests)
                }}</strong>
              </div>
              <div>
                <span>Input</span>
                <strong>{{ formatTokenCount(aiUsage.tokensIn) }}</strong>
              </div>
              <div>
                <span>Output</span>
                <strong>{{ formatTokenCount(aiUsage.tokensOut) }}</strong>
              </div>
            </div>
            <p v-if="aiUsage.truncated" class="dashboard-modal__empty">
              Showing the most recent gateway logs available to this install.
            </p>
            <div v-if="aiUsage.models.length" class="ai-usage-detail__table">
              <div class="ai-usage-detail__table-head">
                <span>Model</span>
                <span>Requests</span>
                <span>Tokens</span>
                <span>Cost</span>
              </div>
              <div
                v-for="model in aiUsage.models"
                :key="`${model.provider}:${model.model}`"
                class="ai-usage-detail__table-row"
              >
                <div>
                  <strong>{{ model.model }}</strong>
                  <span>{{ model.provider }}</span>
                </div>
                <span>{{ formatCompactNumber(model.requests) }}</span>
                <span>{{ formatCompactNumber(model.totalTokens) }}</span>
                <span>{{ formatCurrency(model.cost) }}</span>
              </div>
            </div>
          </div>
          <p v-else class="dashboard-modal__empty">
            AI usage has not loaded yet.
          </p>
        </div>
      </section>
    </div>

    <div
      v-if="cardPickerOpen"
      class="dashboard-modal-backdrop"
      @click.self="cardPickerOpen = false"
    >
      <section
        class="dashboard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-card-title"
      >
        <header class="dashboard-modal__header">
          <h2 id="add-card-title">Add card</h2>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            aria-label="Close add card"
            @click="cardPickerOpen = false"
          >
            <UiIcon name="X" :size="18" />
          </Button>
        </header>
        <div class="dashboard-modal__body">
          <p v-if="!addableCardDrafts.length" class="dashboard-modal__empty">
            Every available card is already on the dashboard.
          </p>
          <div
            v-for="card in addableCardDrafts"
            :key="card.cardId"
            class="dashboard-modal__row"
          >
            <div>
              <strong>{{ cardLabel(card) }}</strong>
            </div>
            <Button
              color="accent"
              shape="soft"
              size="compact"
              @click="addCardDraft(card.cardId)"
            >
              Add
            </Button>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="quickActionPickerOpen"
      class="dashboard-modal-backdrop"
      @click.self="quickActionPickerOpen = false"
    >
      <section
        class="dashboard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-action-title"
      >
        <header class="dashboard-modal__header">
          <h2 id="add-action-title">Add quick action</h2>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            aria-label="Close add quick action"
            @click="quickActionPickerOpen = false"
          >
            <UiIcon name="X" :size="18" />
          </Button>
        </header>
        <div class="dashboard-modal__body">
          <p
            v-if="!addableQuickActionDrafts.length"
            class="dashboard-modal__empty"
          >
            Every available quick action is already on the dashboard.
          </p>
          <div
            v-for="link in addableQuickActionDrafts"
            :key="link.id"
            class="dashboard-modal__row dashboard-modal__row--action"
          >
            <label>
              <span>Button label</span>
              <input
                :value="link.label"
                type="text"
                @input="
                  updateQuickActionDraft(link.id, {
                    label: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
            <label>
              <span>Icon</span>
              <IconPicker
                :model-value="link.icon"
                :aria-label="`${link.label} icon`"
                @update:model-value="
                  updateQuickActionDraft(link.id, {
                    icon: $event,
                  })
                "
              />
            </label>
            <div class="dashboard-modal__action">
              <span>Action</span>
              <strong>{{ quickActionDestinationLabel(link) }}</strong>
            </div>
            <Button
              color="accent"
              shape="soft"
              size="compact"
              @click="addQuickActionDraft(link.id)"
            >
              Add
            </Button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.mission-dashboard {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  box-sizing: border-box;
  padding: 0 24px 40px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.mission-dashboard__topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: var(--workspace-topbar-height);
  padding: var(--workspace-topbar-padding-block) 0 20px;
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.mission-dashboard__topbar-spacer {
  grid-column: 1;
  min-width: 0;
}

.mission-dashboard__topbar-actions {
  display: inline-flex;
  grid-column: 3;
  justify-self: end;
  align-items: center;
  gap: 6px;
}

.mission-dashboard__topbar-quicklinks {
  display: flex;
  grid-column: 2;
  min-width: 0;
  max-width: min(640px, 100%);
  flex-wrap: nowrap;
  justify-self: center;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.mission-dashboard__workspace {
  display: grid;
  width: min(1040px, 100%);
  align-self: center;
  gap: 18px;
}

.mission-dashboard__message {
  width: min(700px, 100%);
  justify-self: center;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 13px;
}

.mission-dashboard__message.is-error {
  color: #b91c1c;
}

.mission-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.dashboard-card {
  position: relative;
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
}

.dashboard-card.is-editing {
  outline: 1px dashed
    color-mix(in oklab, var(--ui-accent), var(--ui-border) 45%);
  outline-offset: -5px;
}

.dashboard-card.is-dragging {
  opacity: 0.58;
}

.dashboard-card__edit-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ui-border);
}

.dashboard-drag-handle {
  cursor: grab;
}

.dashboard-drag-handle:active {
  cursor: grabbing;
}

.dashboard-card--wide {
  grid-column: span 2;
}

.dashboard-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 30px;
}

.dashboard-card h2,
.dashboard-card p {
  margin: 0;
}

.dashboard-card h2 {
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.25;
}

.dashboard-card__title {
  display: inline-flex;
  margin: 0;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
}

.dashboard-card__title svg {
  flex: 0 0 auto;
  color: currentColor;
}

.dashboard-card__title span {
  overflow-wrap: anywhere;
}

.dashboard-card__title-link {
  color: var(--ui-text);
  text-decoration: none;
}

.dashboard-card__title-link:hover {
  color: var(--ui-accent);
}

.dashboard-card__title-link:focus-visible {
  border-radius: var(--ui-radius-sm);
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 2px;
}

.dashboard-card__header > span,
.dashboard-card__header-actions span,
.dashboard-card p,
.dashboard-empty p {
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.dashboard-card__header-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.dashboard-card__actions {
  display: inline-flex;
  gap: 4px;
}

.dashboard-card__actions--inline {
  flex: 0 0 auto;
}

.dashboard-card__action-button {
  width: 30px;
  min-width: 30px;
  min-height: 30px;
  background: color-mix(in oklab, var(--ui-surface), transparent 6%);
}

.dashboard-card__body {
  white-space: pre-wrap;
}

.dashboard-empty {
  display: grid;
  gap: 12px;
  justify-items: start;
}

.setup-checklist-card__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.setup-checklist-card__list li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.setup-checklist-card__list svg {
  margin-top: 2px;
  color: var(--ui-accent);
}

.setup-checklist-card__list a,
.setup-checklist-card__link {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  text-align: left;
}

.setup-checklist-card__list a:hover,
.setup-checklist-card__list a:focus-visible,
.setup-checklist-card__link:hover,
.setup-checklist-card__link:focus-visible {
  color: var(--ui-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.mission-statement-form {
  display: grid;
  gap: 12px;
  margin-top: 8px;
}

.mission-statement-form__field {
  display: grid;
  gap: 7px;
}

.mission-statement-form__field span,
.mission-statement-form__field span {
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
  text-transform: uppercase;
}

.mission-statement-form textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  resize: vertical;
  padding: 10px 11px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.mission-statement-form textarea:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 72%);
  outline-offset: 1px;
}

.mission-context-display {
  display: grid;
  gap: 12px;
}

.mission-statement-display {
  color: var(--ui-text) !important;
  font-size: 14px;
  line-height: 1.6 !important;
  text-align: center !important;
  font-weight: 500 !important;
  text-wrap: balance !important;
  white-space: pre-wrap !important;
  padding: 10px;
  background: var(--ui-surface-muted);
  border-radius: 15px;
}

.mission-goal-display {
  display: grid;
  gap: 8px;
  padding: 10px 0 0;
  border-top: 1px solid var(--ui-border);
}

.mission-goal-display__title {
  margin: 0;
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.25;
}

.mission-goal-display p {
  padding: 10px;
  border-radius: 15px;
  background: var(--ui-surface-muted);
  margin: 0;
  color: var(--ui-text) !important;
  font-size: 14px;
  font-weight: 500 !important;
  line-height: 1.6 !important;
  text-align: center !important;
  text-wrap: balance !important;
  white-space: pre-wrap !important;
}

.mission-goal-display.is-empty p {
  color: var(--ui-text-muted) !important;
  font-weight: 500;
}

.wheel-summary {
  display: grid;
  gap: 8px;
}

.wheel-summary__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  align-items: center;
  gap: 10px;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.wheel-summary__row meter {
  width: 100%;
}

.ai-usage-summary {
  display: grid;
  gap: 12px;
}

.ai-usage-summary__total {
  display: grid;
  gap: 3px;
  padding: 12px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.ai-usage-summary__total strong {
  color: var(--ui-text);
  font-size: 24px;
  line-height: 1.05;
}

.ai-usage-summary__total span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.ai-usage-models {
  display: grid;
  gap: 8px;
}

.ai-usage-models__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 28px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ui-border);
}

.ai-usage-models__row:last-child,
.ai-usage-models__row:has(+ .ai-usage-models__more) {
  padding-bottom: 0;
  border-bottom: 0;
}

.ai-usage-models__row div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 7px;
}

.ai-usage-models__row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text);
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-usage-models__row span {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-usage-models__row > span {
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.ai-usage-models__more {
  justify-self: start;
  min-height: 34px;
  margin: 0;
  padding: 0 2px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-accent);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
}

.ai-usage-models__more:hover,
.ai-usage-models__more:focus-visible {
  color: var(--ui-accent-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ai-usage-models__more:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ai-usage-config {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ai-usage-config li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.ai-usage-config li > span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 999px;
  background: var(--ui-accent-soft);
  color: var(--ui-accent-strong);
  font-size: 12px;
  font-weight: 800;
}

.ai-usage-config p {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.ai-usage-config strong,
.ai-usage-config code {
  color: var(--ui-text);
}

.ai-usage-config a {
  color: var(--ui-accent-strong);
  font-weight: 700;
  text-decoration: none;
}

.ai-usage-config a:hover,
.ai-usage-config a:focus-visible {
  text-decoration: underline;
}

.project-summary {
  display: grid;
  gap: 11px;
  justify-items: start;
  max-height: 244px;
  overflow: auto;
  padding-right: 4px;
}

.project-summary__row {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ui-border);
}

.project-summary__row:last-of-type {
  padding-bottom: 0;
  border-bottom: 0;
}

.project-summary__main {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.project-summary__main a {
  flex: 0 0 auto;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-summary__main a:hover {
  color: var(--ui-accent);
}

.project-summary__stats {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.project-summary__stats a {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  padding: 0 8px;
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 650;
  text-decoration: none;
}

.project-summary__stats a:not(.is-empty) {
  border-color: color-mix(in oklab, var(--ui-accent), transparent 70%);
  color: var(--ui-text);
}

.project-summary__stats a:hover,
.project-summary__stats a:focus-visible {
  border-color: var(--ui-accent);
  color: var(--ui-accent);
}

.project-summary__stats a:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 2px;
}

.project-summary__stats a.is-empty {
  opacity: 0.56;
}

.dashboard-add-card {
  display: grid;
  min-height: 188px;
  place-items: center;
  border: 1px dashed var(--ui-border-strong);
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.dashboard-add-card:hover,
.dashboard-add-card:focus-visible,
.dashboard-add-action:hover,
.dashboard-add-action:focus-visible {
  border-color: var(--ui-accent);
  color: var(--ui-text);
  outline: none;
}

.dashboard-quick-action-wrap {
  position: relative;
  display: inline-flex;
  min-width: 0;
  align-items: center;
}

.dashboard-quick-action {
  min-width: 0;
}

.dashboard-quick-action :deep(.me3-btn__label) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.dashboard-quick-action-remove {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 1;
  width: 24px !important;
  min-width: 24px !important;
  height: 24px;
  min-height: 24px !important;
  padding: 0 !important;
  border-style: dashed;
  background: var(--ui-surface);
}

.dashboard-add-action {
  display: inline-grid;
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  place-items: center;
  border: 1px dashed var(--ui-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.dashboard-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in oklab, var(--ui-bg), transparent 18%);
  backdrop-filter: blur(14px);
}

.dashboard-modal {
  display: grid;
  width: min(640px, 100%);
  max-height: min(720px, calc(100vh - 40px));
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-md);
}

.dashboard-modal--wide {
  width: min(760px, 100%);
}

.dashboard-modal--phone {
  width: min(430px, 100%);
}

.dashboard-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
}

.dashboard-modal__header h2 {
  margin: 0;
  color: var(--ui-text);
  font-size: 15px;
}

.dashboard-modal__body {
  display: grid;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px 16px;
}

.phone-install-modal__body {
  justify-items: center;
}

.phone-install-video {
  width: min(100%, 360px);
  max-height: 70vh;
  border: 0;
  background: transparent;
}

.dashboard-modal__empty {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.dashboard-modal__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--ui-border);
}

.dashboard-modal__row:last-child {
  border-bottom: 0;
}

.dashboard-modal__row > div,
.dashboard-modal__row label {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.dashboard-modal__row strong,
.dashboard-modal__action strong {
  color: var(--ui-text);
  font-size: 13px;
}

.dashboard-modal__row span,
.dashboard-modal__destination,
.dashboard-modal__action span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.dashboard-modal__action {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.dashboard-modal__action strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-modal__row input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}

.dashboard-modal__row input {
  padding: 0 10px;
}

.dashboard-modal__row--action {
  grid-template-columns: minmax(0, 1fr) auto minmax(110px, 0.5fr) auto;
}

.ai-usage-detail {
  display: grid;
  gap: 14px;
}

.ai-usage-detail__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.ai-usage-detail__metrics div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.ai-usage-detail__metrics span,
.ai-usage-detail__table-head,
.ai-usage-detail__table-row > span,
.ai-usage-detail__table-row div span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.ai-usage-detail__metrics strong {
  color: var(--ui-text);
  font-size: 14px;
}

.ai-usage-detail__table {
  display: grid;
  min-width: 0;
}

.ai-usage-detail__table-head,
.ai-usage-detail__table-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(72px, 0.55fr));
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--ui-border);
}

.ai-usage-detail__table-head {
  padding-top: 0;
}

.ai-usage-detail__table-row:last-child {
  border-bottom: 0;
}

.ai-usage-detail__table-row div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.ai-usage-detail__table-row div strong {
  overflow: hidden;
  color: var(--ui-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 959px) {
  .mission-dashboard {
    padding: 0 14px 32px;
  }

  .mission-dashboard__topbar {
    grid-template-columns: minmax(0, 1fr) auto auto;
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }

  .mission-dashboard__topbar-quicklinks {
    max-width: none;
    justify-self: end;
    gap: 6px;
  }

  .dashboard-quick-action {
    width: 34px;
    min-width: 34px;
    min-height: 34px;
    padding-right: 0;
    padding-left: 0;
    border-color: transparent;
    border-radius: var(--ui-radius-sm);
    background: transparent;
  }

  .dashboard-quick-action:hover,
  .dashboard-quick-action:focus-visible,
  .dashboard-quick-action.me3-btn--active {
    border-color: var(--ui-border);
    background: var(--ui-surface-muted);
  }

  .dashboard-quick-action :deep(.me3-btn__label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .mission-dashboard__grid {
    grid-template-columns: 1fr;
  }

  .dashboard-card__edit-controls {
    justify-content: space-between;
  }

  .dashboard-card--wide {
    grid-column: auto;
  }

  .wheel-summary__row {
    grid-template-columns: 1fr;
  }

  .dashboard-modal__row,
  .dashboard-modal__row--action,
  .ai-usage-detail__metrics,
  .ai-usage-detail__table-head,
  .ai-usage-detail__table-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .mission-dashboard__topbar {
    gap: 4px;
  }

  .mission-dashboard__topbar-quicklinks {
    max-width: calc(100vw - 156px);
    overflow-x: auto;
    justify-content: flex-start;
    scrollbar-width: none;
  }

  .mission-dashboard__topbar-quicklinks::-webkit-scrollbar {
    display: none;
  }

  .dashboard-add-action {
    width: 34px;
    min-width: 34px;
    height: 34px;
    min-height: 34px;
  }
}
</style>
