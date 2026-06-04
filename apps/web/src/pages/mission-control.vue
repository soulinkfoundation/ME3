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
  size: DashboardCardSize;
  sortOrder: number;
};

type DashboardQuickLink = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  sortOrder: number;
  destinationId: string;
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
  quickLinks: DashboardQuickLink[];
  destinations: Record<string, DashboardDestination>;
  missionStatement: string;
  data: {
    "mission.daily-briefing": DailyBriefingCardData;
    "mission.mission-statement": MissionStatementCardData;
    "mission.wheel-latest-snapshot": WheelSnapshotCardData;
  };
};

const { toastFromUnknown, toastSuccess } = useAppToast();
const dashboard = ref<MissionDashboardResponse | null>(null);
const loading = ref(true);
const error = ref("");
const missionStatementDraft = ref("");
const missionStatementSaving = ref(false);

const cards = computed(() =>
  (dashboard.value?.cards || [])
    .filter((card) => card.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder),
);
const quickLinks = computed(() =>
  (dashboard.value?.quickLinks || [])
    .filter((link) => link.enabled && dashboard.value?.destinations[link.destinationId])
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

function quickLinkPath(link: DashboardQuickLink): string {
  return dashboard.value?.destinations[link.destinationId]?.path || "/mission-control";
}

function quickLinkIcon(link: DashboardQuickLink): UiIconName {
  return (resolveUiIconName(link.icon) || "Circle") as UiIconName;
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

      <div v-else class="mission-dashboard__grid">
        <article
          v-for="card in cards"
          :key="card.instanceId"
          class="dashboard-card"
          :class="`dashboard-card--${card.size}`"
        >
          <template v-if="card.cardId === 'mission.daily-briefing'">
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

          <template v-else-if="card.cardId === 'mission.mission-statement'">
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

          <template v-else-if="card.cardId === 'mission.wheel-latest-snapshot'">
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
        </article>
      </div>

      <div
        v-if="!loading && quickLinks.length"
        class="mission-dashboard__quick-actions"
        aria-label="Quick actions"
      >
        <Button
          v-for="link in quickLinks"
          :key="link.id"
          color="outline"
          shape="pill"
          size="large"
          :to="quickLinkPath(link)"
        >
          <template #icon>
            <UiIcon :name="quickLinkIcon(link)" :size="17" />
          </template>
          {{ link.label }}
        </Button>
      </div>
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
  grid-template-columns: minmax(0, 1fr) auto;
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
