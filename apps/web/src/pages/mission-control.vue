<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { api } from "../api";
import Button from "../components/Button.vue";
import UiIcon from "../components/UiIcon.vue";
import { useAppToast } from "../composables/useAppToast";
import { resolveUiIconName, type UiIconName } from "../utils/icons";

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
  placeholder: string;
};

type WheelSnapshotCardData = {
  snapshot: null | {
    id: string;
    createdAt: string;
    segments?: Array<{ label: string; value: number }>;
  };
  source: string;
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
  "ProjectsSummaryCard",
  "AccountsSummaryCard",
  "CalendarTodayCard",
  "JournalLatestEntryCard",
  "SocialQueueSummaryCard",
  "SitesBlogSummaryCard",
]);

const { toastFromUnknown, toastSuccess } = useAppToast();
const dashboard = ref<MissionDashboardResponse | null>(null);
const loading = ref(true);
const error = ref("");
const missionStatementDraft = ref("");
const missionStatementSaving = ref(false);
const dashboardEditing = ref(false);
const cardDrafts = ref<DashboardCardInstance[]>([]);
const quickActionDrafts = ref<DashboardQuickLink[]>([]);
const dashboardSaving = ref(false);
const draggedCardId = ref("");
const draggedQuickActionId = ref("");

const cards = computed(() =>
  (dashboard.value?.cards || [])
    .filter((card) => card.enabled && card.available !== false && isRenderableDashboardCard(card))
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const quickLinks = computed(() =>
  (dashboard.value?.quickLinks || [])
    .filter((link) => link.enabled && link.available !== false && dashboard.value?.destinations[link.destinationId])
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const visibleCards = computed(() =>
  (dashboardEditing.value ? cardDrafts.value : cards.value)
    .filter((card) => card.enabled && card.available !== false && isRenderableDashboardCard(card))
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const visibleQuickLinks = computed(() =>
  (dashboardEditing.value ? quickActionDrafts.value : quickLinks.value)
    .filter((link) => link.enabled && link.available !== false && dashboard.value?.destinations[link.destinationId])
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const availableCardDrafts = computed(() =>
  cardDrafts.value
    .filter((card) => card.available !== false && isRenderableDashboardCard(card))
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const availableQuickActionDrafts = computed(() =>
  quickActionDrafts.value
    .filter((link) => link.available !== false && dashboard.value?.destinations[link.destinationId])
    .sort((a, b) => a.sortOrder - b.sortOrder),
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
const wheelSegments = computed(() => wheelSnapshot.value?.snapshot?.segments || []);

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
  return dashboard.value?.destinations[link.destinationId]?.path || "/mission-control";
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

function syncDashboardDrafts() {
  cardDrafts.value = [...(dashboard.value?.cards || [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((card, index) => ({ ...card, sortOrder: index }));
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
  syncDashboardDrafts();
}

function moveCard(index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= cardDrafts.value.length) return;
  const next = [...cardDrafts.value];
  const current = next[index];
  const target = next[nextIndex];
  if (!current || !target) return;
  next[index] = target;
  next[nextIndex] = current;
  cardDrafts.value = next.map((card, sortOrder) => ({ ...card, sortOrder }));
}

function moveCardById(cardId: string, direction: -1 | 1) {
  const ordered = [...cardDrafts.value].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((card) => card.cardId === cardId);
  if (index < 0) return;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= ordered.length) return;
  moveCard(index, direction);
}

function moveVisibleCard(index: number, direction: -1 | 1) {
  const source = availableCardDrafts.value[index];
  const target = availableCardDrafts.value[index + direction];
  if (!source || !target) return;
  reorderCards(source.cardId, target.cardId);
}

function updateCardDraft(
  cardId: string,
  patch: Partial<Pick<DashboardCardInstance, "enabled" | "size">>,
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

function moveVisibleQuickAction(index: number, direction: -1 | 1) {
  const source = availableQuickActionDrafts.value[index];
  const target = availableQuickActionDrafts.value[index + direction];
  if (!source || !target) return;
  reorderQuickActions(source.id, target.id);
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
  const next = [...quickActionDrafts.value].sort((a, b) => a.sortOrder - b.sortOrder);
  const sourceIndex = next.findIndex((link) => link.id === sourceLinkId);
  const targetIndex = next.findIndex((link) => link.id === targetLinkId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return;
  next.splice(targetIndex, 0, source);
  quickActionDrafts.value = next.map((link, sortOrder) => ({ ...link, sortOrder }));
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

async function loadDashboard() {
  loading.value = true;
  error.value = "";
  try {
    dashboard.value = await api.get<MissionDashboardResponse>(
      "/mission-control/dashboard",
    );
    missionStatementDraft.value = dashboard.value.missionStatement;
    syncDashboardDrafts();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Mission Control could not load.";
  } finally {
    loading.value = false;
  }
}

async function saveMissionStatement() {
  if (missionStatementSaving.value) return;
  missionStatementSaving.value = true;
  try {
    dashboard.value = await api.patch<MissionDashboardResponse>(
      "/mission-control/dashboard",
      {
        missionStatement: missionStatementDraft.value,
      },
    );
    missionStatementDraft.value = dashboard.value.missionStatement;
    toastSuccess("Mission statement saved");
  } catch (err) {
    toastFromUnknown(err, "Mission statement could not be saved");
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
    toastSuccess("Dashboard saved");
  } catch (err) {
    toastFromUnknown(err, "Dashboard could not be saved");
  } finally {
    dashboardSaving.value = false;
  }
}

onMounted(() => {
  void loadDashboard();
});
</script>

<template>
  <main class="mission-dashboard">
    <header class="mission-dashboard__topbar">
      <div class="mission-dashboard__topbar-spacer" aria-hidden="true" />
      <Button
        color="ghost"
        shape="soft"
        size="compact"
        icon-only
        :aria-label="dashboardEditing ? 'Close dashboard editing' : 'Edit dashboard'"
        :title="dashboardEditing ? 'Close dashboard editing' : 'Edit dashboard'"
        @click="dashboardEditing ? closeDashboardEditor() : openDashboardEditor()"
      >
        <UiIcon :name="dashboardEditing ? 'X' : 'SlidersHorizontal'" :size="18" />
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
    </header>

    <section
      class="mission-dashboard__workspace"
      aria-label="Mission Control dashboard"
    >
      <p v-if="error" class="mission-dashboard__message is-error">
        {{ error }}
      </p>
      <div v-if="loading" class="mission-dashboard__message">
        Loading Mission Control...
      </div>

      <div v-if="dashboardEditing" class="dashboard-edit-banner">
        <span>Edit mode</span>
        <div>
          <Button color="ghost" shape="soft" size="compact" @click="closeDashboardEditor">
            Cancel
          </Button>
          <Button
            color="accent"
            shape="soft"
            size="compact"
            :disabled="dashboardSaving"
            @click="saveDashboardLayout"
          >
            {{ dashboardSaving ? "Saving..." : "Save dashboard" }}
          </Button>
        </div>
      </div>

      <div v-if="!loading" class="mission-dashboard__grid">
        <article
          v-for="(card, index) in visibleCards"
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
            <button
              type="button"
              class="dashboard-drag-handle"
              aria-label="Drag card"
            >
              <UiIcon name="GripVertical" :size="15" />
            </button>
            <select
              :value="card.size"
              aria-label="Card size"
              @change="
                updateCardDraft(card.cardId, {
                  size: ($event.target as HTMLSelectElement).value as DashboardCardSize,
                })
              "
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="wide">Wide</option>
            </select>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              aria-label="Move card left"
              :disabled="index === 0"
              @click="moveCardById(card.cardId, -1)"
            >
              <UiIcon name="ChevronLeft" :size="15" />
            </Button>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              aria-label="Move card right"
              :disabled="index === visibleCards.length - 1"
              @click="moveCardById(card.cardId, 1)"
            >
              <UiIcon name="ChevronRight" :size="15" />
            </Button>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              aria-label="Remove card"
              @click="updateCardDraft(card.cardId, { enabled: false })"
            >
              <UiIcon name="EyeOff" :size="15" />
            </Button>
          </div>
          <template v-if="cardComponentKey(card) === 'DailyBriefingCard'">
            <header class="dashboard-card__header">
              <h2>Daily Briefing</h2>
              <span v-if="dailyBriefing?.createdAt">
                {{ formatDashboardDate(dailyBriefing.createdAt) }}
              </span>
            </header>
            <p v-if="dailyBriefing" class="dashboard-card__body">
              {{ dailyBriefing.message }}
            </p>
            <div v-else class="dashboard-empty">
              <p>No Daily Briefing has landed yet.</p>
              <Button color="outline" shape="soft" size="compact" to="/assistant">
                Configure Daily Briefing
              </Button>
            </div>
          </template>

          <template v-else-if="cardComponentKey(card) === 'MissionStatementCard'">
            <header class="dashboard-card__header">
              <h2>Mission Statement</h2>
            </header>
            <form class="mission-statement-form" @submit.prevent="saveMissionStatement">
              <textarea
                v-model="missionStatementDraft"
                :placeholder="missionStatement?.placeholder"
                rows="6"
              />
              <div class="mission-statement-form__footer">
                <span>Plain text, private to this Core.</span>
                <Button
                  color="accent"
                  shape="soft"
                  size="compact"
                  type="submit"
                  :disabled="missionStatementSaving"
                >
                  {{ missionStatementSaving ? "Saving..." : "Save" }}
                </Button>
              </div>
            </form>
          </template>

          <template v-else-if="cardComponentKey(card) === 'WheelSnapshotCard'">
            <header class="dashboard-card__header">
              <h2>Wheel of Life</h2>
              <span v-if="wheelSnapshot?.snapshot">
                {{ formatDashboardDate(wheelSnapshot.snapshot.createdAt) }}
              </span>
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
          <template v-else-if="cardComponentKey(card) === 'ProjectsSummaryCard'">
            <header class="dashboard-card__header">
              <h2>Projects</h2>
            </header>
            <div class="dashboard-empty">
              <p>Project summary data will appear here once the card data endpoint is wired.</p>
              <Button color="outline" shape="soft" size="compact" to="/mission-control/projects">
                Open Projects
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'AccountsSummaryCard'">
            <header class="dashboard-card__header">
              <h2>Accounts</h2>
            </header>
            <div class="dashboard-empty">
              <p>Accounts summary data will appear here once the ledger card endpoint is wired.</p>
              <Button color="outline" shape="soft" size="compact" to="/accounts">
                Open Accounts
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'CalendarTodayCard'">
            <header class="dashboard-card__header">
              <h2>Today</h2>
            </header>
            <div class="dashboard-empty">
              <p>Calendar summary data will appear here once the calendar card endpoint is wired.</p>
              <Button color="outline" shape="soft" size="compact" to="/calendar">
                Open Calendar
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'JournalLatestEntryCard'">
            <header class="dashboard-card__header">
              <h2>Journal</h2>
            </header>
            <div class="dashboard-empty">
              <p>Latest journal data will appear here once the journal card endpoint is wired.</p>
              <Button color="outline" shape="soft" size="compact" to="/journal">
                Open Journal
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'SocialQueueSummaryCard'">
            <header class="dashboard-card__header">
              <h2>Social Queue</h2>
            </header>
            <div class="dashboard-empty">
              <p>Queued social content will appear here once the social card endpoint is wired.</p>
              <Button color="outline" shape="soft" size="compact" to="/social">
                Open Social
              </Button>
            </div>
          </template>
          <template v-else-if="cardComponentKey(card) === 'SitesBlogSummaryCard'">
            <header class="dashboard-card__header">
              <h2>Blog</h2>
            </header>
            <div class="dashboard-empty">
              <p>Blog draft data will appear here once the site card endpoint is wired.</p>
              <Button color="outline" shape="soft" size="compact" to="/build">
                Open Builder
              </Button>
            </div>
          </template>
        </article>
      </div>

      <div
        v-if="!loading && visibleQuickLinks.length"
        class="mission-dashboard__quick-actions"
        aria-label="Quick actions"
        @dragover.prevent
      >
        <Button
          v-for="link in visibleQuickLinks"
          :key="link.id"
          color="outline"
          shape="pill"
          size="large"
          :to="dashboardEditing ? undefined : quickLinkPath(link)"
          :draggable="dashboardEditing"
          @dragstart="draggedQuickActionId = link.id"
          @dragend="draggedQuickActionId = ''"
          @dragover.prevent
          @drop.prevent="setQuickActionDropTarget(link.id)"
        >
          <template #icon>
            <UiIcon :name="quickLinkIcon(link)" :size="17" />
          </template>
          {{ link.label }}
        </Button>
      </div>

      <section
        v-if="dashboardEditing"
        class="quick-action-editor"
        aria-label="Card settings"
      >
        <header class="quick-action-editor__header">
          <h2>Cards</h2>
        </header>
        <div class="quick-action-editor__rows">
          <div
            v-for="(card, index) in availableCardDrafts"
            :key="card.cardId"
            class="quick-action-editor__row dashboard-card-editor__row"
            :class="{ 'is-disabled': !card.enabled }"
            draggable="true"
            @dragstart="draggedCardId = card.cardId"
            @dragend="draggedCardId = ''"
            @dragover.prevent
            @drop.prevent="setCardDropTarget(card.cardId)"
          >
            <label class="quick-action-editor__toggle">
              <input
                type="checkbox"
                :checked="card.enabled"
                @change="
                  updateCardDraft(card.cardId, {
                    enabled: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span>{{ card.enabled ? "Shown" : "Hidden" }}</span>
            </label>
            <span class="dashboard-card-editor__label">{{ cardLabel(card) }}</span>
            <select
              :value="card.size"
              aria-label="Card size"
              @change="
                updateCardDraft(card.cardId, {
                  size: ($event.target as HTMLSelectElement).value as DashboardCardSize,
                })
              "
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="wide">Wide</option>
            </select>
            <div class="quick-action-editor__order">
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                aria-label="Move card up"
                :disabled="index === 0"
                @click="moveVisibleCard(index, -1)"
              >
                <UiIcon name="ChevronUp" :size="15" />
              </Button>
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                aria-label="Move card down"
                :disabled="index === availableCardDrafts.length - 1"
                @click="moveVisibleCard(index, 1)"
              >
                <UiIcon name="ChevronDown" :size="15" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="dashboardEditing"
        class="quick-action-editor"
        aria-label="Quick action settings"
      >
        <header class="quick-action-editor__header">
          <h2>Quick actions</h2>
        </header>
        <div class="quick-action-editor__rows">
          <div
            v-for="(link, index) in availableQuickActionDrafts"
            :key="link.id"
            class="quick-action-editor__row"
            :class="{ 'is-disabled': !link.enabled }"
            draggable="true"
            @dragstart="draggedQuickActionId = link.id"
            @dragend="draggedQuickActionId = ''"
            @dragover.prevent
            @drop.prevent="setQuickActionDropTarget(link.id)"
          >
            <label class="quick-action-editor__toggle">
              <input
                type="checkbox"
                :checked="link.enabled"
                @change="
                  updateQuickActionDraft(link.id, {
                    enabled: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span>Show</span>
            </label>
            <div class="quick-action-editor__fields">
              <label>
                <span>Name</span>
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
                <input
                  :value="link.icon"
                  type="text"
                  @input="
                    updateQuickActionDraft(link.id, {
                      icon: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </label>
            </div>
            <span class="quick-action-editor__destination">
              {{ quickActionDestinationLabel(link) }}
            </span>
            <div class="quick-action-editor__order">
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                aria-label="Move quick action up"
                :disabled="index === 0"
                @click="moveVisibleQuickAction(index, -1)"
              >
                <UiIcon name="ChevronUp" :size="15" />
              </Button>
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                aria-label="Move quick action down"
                :disabled="index === availableQuickActionDrafts.length - 1"
                @click="moveVisibleQuickAction(index, 1)"
              >
                <UiIcon name="ChevronDown" :size="15" />
              </Button>
            </div>
          </div>
        </div>
        <div class="quick-action-editor__footer">
          <Button color="ghost" shape="soft" size="compact" @click="closeDashboardEditor">
            Cancel
          </Button>
          <Button
            color="accent"
            shape="soft"
            size="compact"
            :disabled="dashboardSaving"
            @click="saveDashboardLayout"
          >
            {{ dashboardSaving ? "Saving..." : "Save dashboard" }}
          </Button>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.mission-dashboard {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  gap: 18px;
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
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-height: var(--workspace-topbar-height);
  padding: var(--workspace-topbar-padding-block) 0;
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.mission-dashboard__topbar-spacer {
  min-width: 0;
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

.mission-dashboard__quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  width: min(640px, 100%);
  justify-self: center;
}

.dashboard-edit-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(760px, 100%);
  justify-self: center;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.dashboard-edit-banner > span {
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 750;
}

.dashboard-edit-banner > div {
  display: flex;
  gap: 6px;
}

.quick-action-editor {
  display: grid;
  width: min(760px, 100%);
  justify-self: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
}

.quick-action-editor__header,
.quick-action-editor__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.quick-action-editor__header h2 {
  margin: 0;
  color: var(--ui-text);
  font-size: 14px;
}

.quick-action-editor__rows {
  display: grid;
}

.quick-action-editor__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(120px, auto) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--ui-border);
}

.quick-action-editor__row.is-disabled {
  opacity: 0.62;
}

.quick-action-editor__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.quick-action-editor__fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 0.45fr);
  gap: 8px;
  min-width: 0;
}

.quick-action-editor__fields label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.quick-action-editor__fields span {
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.quick-action-editor__fields input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 32px;
  padding: 0 9px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}

.quick-action-editor__fields input:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 72%);
  outline-offset: 1px;
}

.quick-action-editor__destination {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.dashboard-card-editor__row {
  grid-template-columns: auto minmax(0, 1fr) 130px auto;
}

.dashboard-card-editor__label {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-card-editor__row select,
.dashboard-card__edit-controls select {
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
}

.quick-action-editor__order {
  display: flex;
  gap: 4px;
}

.mission-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.dashboard-card {
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
  outline: 1px dashed color-mix(in oklab, var(--ui-accent), var(--ui-border) 45%);
  outline-offset: -5px;
}

.dashboard-card.is-dragging {
  opacity: 0.58;
}

.dashboard-card__edit-controls {
  display: grid;
  grid-template-columns: auto minmax(86px, 1fr) auto auto auto;
  align-items: center;
  gap: 5px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ui-border);
}

.dashboard-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text-muted);
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

.dashboard-card__header span,
.dashboard-card p,
.dashboard-empty p {
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.dashboard-card__body {
  white-space: pre-wrap;
}

.dashboard-empty {
  display: grid;
  gap: 12px;
  justify-items: start;
}

.mission-statement-form {
  display: grid;
  gap: 10px;
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

.mission-statement-form__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mission-statement-form__footer span {
  color: var(--ui-text-muted);
  font-size: 12px;
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

@media (max-width: 959px) {
  .mission-dashboard {
    padding: 0 14px 32px;
  }

  .mission-dashboard__topbar {
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }

  .mission-dashboard__grid {
    grid-template-columns: 1fr;
  }

  .quick-action-editor__row,
  .dashboard-card-editor__row,
  .quick-action-editor__fields {
    grid-template-columns: 1fr;
  }

  .dashboard-edit-banner,
  .dashboard-card__edit-controls {
    grid-template-columns: 1fr;
  }

  .dashboard-edit-banner {
    display: grid;
  }

  .dashboard-edit-banner > div {
    justify-content: start;
  }

  .quick-action-editor__order {
    justify-content: start;
  }

  .dashboard-card--wide {
    grid-column: auto;
  }

  .mission-statement-form__footer,
  .wheel-summary__row {
    grid-template-columns: 1fr;
  }

  .mission-statement-form__footer {
    display: grid;
    justify-items: start;
  }
}
</style>
