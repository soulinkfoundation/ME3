<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { RouterLink, useRouter } from "vue-router";
import { api, getUsernameAvailability } from "../api";
import PluginList from "../components/PluginList.vue";
import LifeWheelChart from "../components/mission-control/LifeWheelChart.vue";
import { usePublish } from "../composables/usePublish";
import { useAuthStore } from "../stores/auth";
import { useSitesStore } from "../stores/sites";
import { useWizardStore } from "../stores/wizard";
import {
  RECOMMENDED_START_PLUGIN_ID_SET,
  RECOMMENDED_START_PLUGIN_IDS,
  isFixedCorePlugin,
  isPluginComingSoon,
  isPluginHiddenFromList,
  isPluginEnabled,
  type PluginRecord,
  type PluginsResponse,
} from "../utils/plugins";

definePage({
  meta: {
    requiresAuth: true,
    hideAppShell: true,
    title: "Start | ME3",
    description: "Set up the essentials for your ME3 profile.",
    robots: "noindex,follow",
  },
});

type StartWheelSegment = {
  id: string;
  label: string;
  helper: string;
  color: string;
  emoji: string;
  value: number;
};

type WheelSnapshotResponse = {
  snapshot: unknown;
};

const STEPS = ["Profile", "Wheel", "Plugins"] as const;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;
const DEFAULT_START_WHEEL_SEGMENTS: StartWheelSegment[] = [
  {
    id: "health",
    label: "Health",
    helper: "Physical, mental and emotional wellbeing",
    color: "#26806f",
    emoji: "❤️",
    value: 5,
  },
  {
    id: "spirituality",
    label: "Spirituality",
    helper: "Meaning, purpose and connection",
    color: "#7c3aed",
    emoji: "🌿",
    value: 5,
  },
  {
    id: "work",
    label: "Work",
    helper: "What you do and how you serve",
    color: "#2563eb",
    emoji: "💼",
    value: 5,
  },
  {
    id: "finances",
    label: "Finances",
    helper: "Money, resources and security",
    color: "#ca8a04",
    emoji: "💰",
    value: 5,
  },
  {
    id: "home",
    label: "Home",
    helper: "Environment, routines and living space",
    color: "#c2410c",
    emoji: "🏡",
    value: 5,
  },
  {
    id: "joy",
    label: "Joy",
    helper: "Fun, play and aliveness",
    color: "#be123c",
    emoji: "🤗",
    value: 5,
  },
];

const router = useRouter();
const auth = useAuthStore();
const sites = useSitesStore();
const wizard = useWizardStore();
const { isPublishing, publishProgress, publishError, publish } = usePublish();

const currentStep = ref(1);
const furthestStep = ref(1);
const name = ref(wizard.profile.name || auth.user?.name || "");
const handle = ref(
  wizard.profile.handle || wizard.username || auth.user?.username || "",
);
const isCheckingUsername = ref(false);
const isUsernameAvailable = ref<boolean | null>(null);
const usernameMessage = ref("");
const profileError = ref("");
const pluginsLoading = ref(false);
const pluginsSaving = ref(false);
const plugins = ref<PluginRecord[]>([]);
const pluginsError = ref("");
const selectedPluginIds = ref<Set<string>>(
  new Set(RECOMMENDED_START_PLUGIN_IDS),
);
const wheelSegments = ref<StartWheelSegment[]>(cloneStartWheelSegments());
const wheelFocusNote = ref("");
const wheelSaving = ref(false);
const wheelError = ref("");

let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

const progress = computed(
  () => ((currentStep.value - 1) / (STEPS.length - 1)) * 100,
);
const normalizedHandle = computed(() => normalizeUsername(handle.value));
const profileSite = computed(() =>
  sites.sites.find((site) => (site.site_type || "profile") === "profile"),
);
const profileLink = computed(() =>
  profileSite.value?.username
    ? `/sites/${encodeURIComponent(profileSite.value.username)}`
    : "/create",
);
const selectedPluginIdList = computed(() =>
  Array.from(selectedPluginIds.value),
);
const startPlugins = computed(() =>
  plugins.value.filter((plugin) => !isPluginHiddenFromList(plugin)),
);
const pluginBusyIds = computed(() =>
  pluginsSaving.value ? startPlugins.value.map((plugin) => plugin.id) : [],
);
const pluginsCanContinue = computed(
  () => !pluginsLoading.value && !pluginsSaving.value,
);
const wheelPrioritySegment = computed(() => {
  const [firstSegment] = wheelSegments.value;
  if (!firstSegment) return null;
  return wheelSegments.value.reduce((lowest, segment) =>
    segment.value < lowest.value ? segment : lowest,
  );
});

const profileCanContinue = computed(
  () =>
    name.value.trim().length >= 2 &&
    normalizedHandle.value.length >= 3 &&
    USERNAME_PATTERN.test(normalizedHandle.value) &&
    isUsernameAvailable.value === true &&
    !isCheckingUsername.value &&
    !isPublishing.value,
);

const progressSteps = computed(() =>
  STEPS.map((stepName, index) => {
    const number = index + 1;
    const isCurrent = currentStep.value === number;
    const isVisited = number <= furthestStep.value;
    return {
      name: stepName,
      number,
      isCurrent,
      isVisited,
      isJumpable: isVisited && !isCurrent,
      ariaLabel: isCurrent
        ? `Current step: ${stepName}`
        : isVisited
          ? `Go to ${stepName}`
          : `${stepName} is locked until you complete the earlier steps`,
    };
  }),
);

function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .slice(0, 30);
}

function cloneStartWheelSegments() {
  return DEFAULT_START_WHEEL_SEGMENTS.map((segment) => ({ ...segment }));
}

function createStartId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function messageFromUnknown(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function clearUsernameCheck() {
  if (usernameCheckTimeout) {
    clearTimeout(usernameCheckTimeout);
    usernameCheckTimeout = null;
  }
}

function queueUsernameAvailabilityCheck(value: string) {
  const cleaned = normalizeUsername(value);
  if (cleaned !== value) {
    handle.value = cleaned;
    return;
  }

  usernameMessage.value = "";
  isUsernameAvailable.value = null;
  isCheckingUsername.value = false;
  clearUsernameCheck();

  if (cleaned.length === 0) return;
  if (cleaned.length < 3 || !USERNAME_PATTERN.test(cleaned)) {
    usernameMessage.value =
      cleaned.length < 3
        ? "Handle must be at least 3 characters."
        : "Use letters, numbers, underscores, or hyphens.";
    return;
  }

  isCheckingUsername.value = true;
  usernameCheckTimeout = setTimeout(async () => {
    try {
      const available = await getUsernameAvailability(cleaned);
      if (normalizedHandle.value === cleaned) {
        isUsernameAvailable.value = available;
      }
    } catch {
      if (normalizedHandle.value === cleaned) {
        isUsernameAvailable.value = true;
      }
    } finally {
      if (normalizedHandle.value === cleaned) {
        isCheckingUsername.value = false;
      }
    }
  }, 400);
}

function goToStep(step: number) {
  if (step < 1 || step > STEPS.length || step > furthestStep.value) return;
  currentStep.value = step;
}

function advanceTo(step: number) {
  currentStep.value = step;
  furthestStep.value = Math.max(furthestStep.value, step);
}

async function publishProfile() {
  if (!profileCanContinue.value) return;

  profileError.value = "";
  const nextName = name.value.trim();
  const nextHandle = normalizedHandle.value;

  wizard.reset();
  wizard.username = nextHandle;
  wizard.isUsernameAvailable = true;
  wizard.updateProfile({ name: nextName, handle: nextHandle });

  const success = await publish({ celebrate: false, openSite: false });
  if (!success) {
    profileError.value =
      publishError.value || "Could not publish your initial profile.";
    return;
  }

  await sites.fetchSites();
  advanceTo(2);
}

function applyDefaultPluginSelection(nextPlugins: PluginRecord[]) {
  const nextSelection = new Set<string>();
  for (const plugin of nextPlugins) {
    if (
      !isPluginComingSoon(plugin) &&
      RECOMMENDED_START_PLUGIN_ID_SET.has(plugin.id)
    ) {
      nextSelection.add(plugin.id);
    }
  }
  selectedPluginIds.value = nextSelection;
}

async function loadPlugins() {
  pluginsLoading.value = true;
  pluginsError.value = "";

  try {
    const response = await api.get<PluginsResponse>("/plugins");
    const nextPlugins = response.plugins || [];
    plugins.value = nextPlugins;
    applyDefaultPluginSelection(nextPlugins);
  } catch (error) {
    pluginsError.value =
      error instanceof Error ? error.message : "Could not load plugins.";
  } finally {
    pluginsLoading.value = false;
  }
}

function updatePluginSelection(plugin: PluginRecord, enabled: boolean) {
  const nextSelection = new Set(selectedPluginIds.value);
  if (enabled) {
    nextSelection.add(plugin.id);
  } else {
    nextSelection.delete(plugin.id);
  }
  selectedPluginIds.value = nextSelection;
}

function syncPlugin(plugin: PluginRecord) {
  const index = plugins.value.findIndex(
    (candidate) => candidate.id === plugin.id,
  );
  if (index >= 0) {
    plugins.value.splice(index, 1, plugin);
  } else {
    plugins.value.push(plugin);
  }
  window.dispatchEvent(new CustomEvent("me3:plugins-changed"));
}

async function savePlugins() {
  if (!pluginsCanContinue.value) return;
  if (plugins.value.length === 0) {
    await loadPlugins();
  }
  if (pluginsError.value) return;

  pluginsSaving.value = true;
  pluginsError.value = "";

  try {
    const requestedPluginIds = selectedPluginIds.value;
    const pluginsToUpdate = startPlugins.value.filter((plugin) => {
      if (isPluginComingSoon(plugin) || isFixedCorePlugin(plugin)) return false;
      return isPluginEnabled(plugin) !== requestedPluginIds.has(plugin.id);
    });

    for (const plugin of pluginsToUpdate) {
      const shouldEnable = requestedPluginIds.has(plugin.id);
      const response = await api.post<{ plugin: PluginRecord }>(
        `/plugins/${encodeURIComponent(plugin.id)}/${
          shouldEnable ? "activate" : "deactivate"
        }`,
        {},
      );
      syncPlugin(response.plugin);
    }

    await finish();
  } catch (error) {
    pluginsError.value =
      error instanceof Error ? error.message : "Could not save plugins.";
  } finally {
    pluginsSaving.value = false;
  }
}

function skipPlugins() {
  pluginsError.value = "";
  void finish();
}

function setStartWheelSegmentValue(segmentId: string, value: number) {
  const segment = wheelSegments.value.find((item) => item.id === segmentId);
  if (!segment) return;
  segment.value = Math.min(10, Math.max(1, Math.round(value)));
}

async function saveWheelSnapshotAndFinish() {
  if (wheelSaving.value) return;
  wheelSaving.value = true;
  wheelError.value = "";

  const createdAt = new Date().toISOString();
  const focusNote = wheelFocusNote.value.trim();
  const segments = wheelSegments.value.map((segment) => ({
    id: segment.id,
    label: segment.label,
    helper: segment.helper,
    color: segment.color,
    emoji: segment.emoji,
    value: Math.min(10, Math.max(1, Math.round(segment.value))),
  }));
  const prioritySegmentId =
    wheelPrioritySegment.value?.id || segments[0]?.id || "";
  const notes = Object.fromEntries(
    segments.map((segment) => [
      segment.id,
      segment.id === prioritySegmentId ? focusNote : "",
    ]),
  );

  try {
    await api.post<WheelSnapshotResponse>("/mission-control/wheel/snapshots", {
      id: createStartId("snapshot"),
      createdAt,
      segments,
      notes,
    });
    advanceTo(3);
  } catch (error) {
    wheelError.value = messageFromUnknown(
      error,
      "Could not save this Wheel snapshot.",
    );
  } finally {
    wheelSaving.value = false;
  }
}

async function skipWheel() {
  wheelError.value = "";
  advanceTo(3);
}

async function finish() {
  await router.push("/assistant");
}

watch(handle, queueUsernameAvailabilityCheck, { immediate: true });

watch(currentStep, (step) => {
  if (step === 3 && !pluginsLoading.value && plugins.value.length === 0) {
    void loadPlugins();
  }
});

onMounted(() => {
  void sites.fetchSites();
});

onBeforeUnmount(clearUsernameCheck);
</script>

<template>
  <div class="start-page">
    <div class="progress-bar" role="navigation" aria-label="Setup progress">
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="{ width: `${progress}%` }" />
      </div>
      <div
        class="progress-steps"
        :style="{
          gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`,
        }"
      >
        <button
          v-for="step in progressSteps"
          :key="step.name"
          type="button"
          class="progress-step"
          :class="{
            'is-current': step.isCurrent,
            'is-visited': step.isVisited,
            'is-jumpable': step.isJumpable,
          }"
          :data-step-name="step.name"
          :aria-label="step.ariaLabel"
          :aria-current="step.isCurrent ? 'step' : undefined"
          :aria-disabled="step.isVisited ? undefined : 'true'"
          :tabindex="step.isVisited ? undefined : -1"
          @click="goToStep(step.number)"
        >
          <span class="progress-step-dot" aria-hidden="true">
            <span v-if="step.isCurrent" class="progress-step-core" />
            <span v-else-if="step.isVisited" class="progress-step-check"
              >✓</span
            >
          </span>
          <span class="progress-step-tooltip" aria-hidden="true">
            {{ step.name }}
          </span>
        </button>
      </div>
    </div>

    <main class="start-main">
      <section
        v-if="currentStep === 1"
        class="start-step"
        aria-labelledby="profile-title"
      >
        <div class="step-copy">
          <h1 id="profile-title">Let's get started with ME3</h1>
          <p>
            Configure the essentials now, complete your full
            <RouterLink
              :to="profileLink"
              target="_blank"
              rel="noopener noreferrer"
              >site profile</RouterLink
            >
            later.
          </p>
        </div>

        <form
          class="start-form"
          autocomplete="off"
          @submit.prevent="publishProfile"
        >
          <label class="field" for="start-name">
            <span>Your name *</span>
            <input
              id="start-name"
              v-model="name"
              type="text"
              maxlength="100"
              placeholder="e.g. Alex Smith"
              autofocus
              required
            />
          </label>

          <label class="field" for="start-handle">
            <span>Handle (@handle) *</span>
            <div class="handle-input">
              <span class="handle-prefix">@</span>
              <input
                id="start-handle"
                v-model="handle"
                type="text"
                maxlength="30"
                placeholder="alex"
                inputmode="text"
                name="me3-start-handle"
                autocapitalize="off"
                autocorrect="off"
                autocomplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                spellcheck="false"
                required
              />
            </div>
          </label>

          <p v-if="isCheckingUsername" class="field-hint">
            Checking availability...
          </p>
          <p
            v-else-if="
              normalizedHandle.length >= 3 && isUsernameAvailable === true
            "
            class="success"
          >
            {{ normalizedHandle }} is available.
          </p>
          <p
            v-else-if="
              normalizedHandle.length >= 3 && isUsernameAvailable === false
            "
            class="error"
          >
            This handle is already taken.
          </p>
          <p v-else-if="usernameMessage" class="field-hint">
            {{ usernameMessage }}
          </p>

          <p v-if="publishProgress" class="field-hint">{{ publishProgress }}</p>
          <p v-if="profileError || publishError" class="error">
            {{ profileError || publishError }}
          </p>

          <div class="step-nav">
            <button
              class="nav-btn next"
              type="submit"
              :disabled="!profileCanContinue"
            >
              {{ isPublishing ? "Publishing..." : "Next →" }}
            </button>
          </div>
        </form>
      </section>

      <section
        v-else-if="currentStep === 2"
        class="start-step"
        aria-labelledby="wheel-title"
      >
        <div class="step-copy">
          <h1 id="wheel-title">The Wheel Of Life</h1>
          <p>
            Optionally rate each area to give ME3 a snapshot of where you're
            at. You can update or change this later in Mission Control.
          </p>
        </div>

        <div class="wheel-start-panel">
          <LifeWheelChart
            :segments="wheelSegments"
            compact
            aria-label="Wheel of Life onboarding score selector"
            @update:segment-value="setStartWheelSegmentValue"
          />

          <label class="field" for="start-wheel-note">
            <span>What's your main goal right now?</span>
            <textarea
              id="start-wheel-note"
              v-model="wheelFocusNote"
              maxlength="600"
              rows="3"
              placeholder="e.g. I want more energy for creative work."
            />
          </label>

          <p v-if="wheelError" class="error">{{ wheelError }}</p>
        </div>

        <div class="step-nav split">
          <button class="nav-btn back" type="button" @click="goToStep(1)">
            ← Back
          </button>
          <div class="nav-actions-right">
            <button class="nav-btn ghost" type="button" @click="skipWheel">
              Skip
            </button>
            <button
              class="nav-btn next"
              type="button"
              :disabled="wheelSaving"
              @click="saveWheelSnapshotAndFinish"
            >
              {{ wheelSaving ? "Saving..." : "Save & continue →" }}
            </button>
          </div>
        </div>
      </section>

      <section
        v-else-if="currentStep === 3"
        class="start-step"
        aria-labelledby="plugins-title"
      >
        <div class="step-copy">
          <h1 id="plugins-title">Choose plugins</h1>
          <p>
            Activate the features you need. More coming soon, you can always
            build one if you like.
          </p>
        </div>

        <div class="plugins-panel-wrap">
          <div v-if="pluginsLoading" class="status-row">
            Loading plugins...
          </div>
          <p v-else-if="pluginsError" class="error">{{ pluginsError }}</p>
          <PluginList
            v-else-if="startPlugins.length"
            :plugins="startPlugins"
            :busy-plugin-ids="pluginBusyIds"
            :selected-plugin-ids="selectedPluginIdList"
            :recommended-plugin-ids="RECOMMENDED_START_PLUGIN_IDS"
            @toggle="updatePluginSelection"
          />
          <p v-else class="field-hint">
            No curated plugins are registered in this Core build.
          </p>
        </div>

        <div class="step-nav split">
          <button class="nav-btn back" type="button" @click="goToStep(2)">
            ← Back
          </button>
          <div class="nav-actions-right">
            <button class="nav-btn ghost" type="button" @click="skipPlugins">
              Skip
            </button>
            <button
              class="nav-btn next"
              type="button"
              :disabled="!pluginsCanContinue"
              @click="savePlugins"
            >
              {{ pluginsSaving ? "Saving..." : "Finish →" }}
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.start-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.progress-bar {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 24px 24px 34px;
  overflow: visible;
}

.progress-track {
  position: absolute;
  left: 40px;
  right: 40px;
  top: 45px;
  height: 3px;
  background: var(--ui-border, var(--color-border));
  border-radius: 999px;
}

.progress-fill {
  height: 100%;
  background: var(--ui-text, var(--color-text));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.progress-steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
}

.progress-step {
  position: relative;
  min-height: 44px;
  padding: 8px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 0;
  background: none;
  color: var(--ui-text-muted, var(--color-text-muted));
  cursor: default;
  overflow: visible;
}

.progress-step.is-jumpable {
  cursor: pointer;
}

.progress-step-dot {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 2px solid currentColor;
  background: var(--ui-bg, var(--color-bg));
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.progress-step.is-visited .progress-step-dot {
  color: var(--ui-text, var(--color-text));
}

.progress-step.is-visited:not(.is-current) .progress-step-dot {
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
  border-color: var(--ui-text, var(--color-text));
}

.progress-step.is-current .progress-step-dot {
  width: 22px;
  height: 22px;
  border-color: var(--ui-text, var(--color-text));
  color: var(--ui-text, var(--color-text));
  box-shadow: 0 0 0 4px var(--ui-border, var(--color-border));
}

.progress-step.is-jumpable:hover .progress-step-dot {
  transform: translateY(-1px);
}

.progress-step:focus-visible {
  outline: none;
}

.progress-step:focus-visible .progress-step-dot {
  box-shadow: 0 0 0 4px var(--ui-accent-soft, var(--color-border));
}

.progress-step-tooltip {
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translate(-50%, -4px);
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  z-index: 2;
}

.progress-step-tooltip::after {
  content: "";
  position: absolute;
  left: 50%;
  top: -3px;
  width: 8px;
  height: 8px;
  background: var(--ui-text, var(--color-text));
  transform: translateX(-50%) rotate(45deg);
}

.progress-step:hover .progress-step-tooltip,
.progress-step:focus-visible .progress-step-tooltip {
  opacity: 1;
  transform: translate(-50%, 0);
}

.progress-step-core {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

.progress-step-check {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.start-main {
  flex: 1;
  width: min(100%, 760px);
  box-sizing: border-box;
  margin: 0 auto;
  padding: 56px 24px 48px;
}

.start-step {
  display: grid;
  gap: 28px;
}

.step-copy {
  display: grid;
  gap: 12px;
}

.step-copy h1 {
  margin: 0;
  font-size: clamp(32px, 5vw, 48px);
  line-height: 1;
  letter-spacing: 0;
}

.step-copy p {
  max-width: 620px;
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 16px;
  line-height: 1.55;
}

.step-copy a {
  color: var(--ui-text, var(--color-text));
  font-weight: 700;
  text-underline-offset: 3px;
}

.start-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
}

.field input,
.field select,
.field textarea,
.handle-input {
  width: 100%;
  box-sizing: border-box;
  border: 2px solid var(--ui-border-strong, var(--color-text));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 16px;
  font-weight: 500;
}

.field input,
.field select {
  min-height: 52px;
  padding: 12px 14px;
}

.field textarea {
  min-height: 96px;
  padding: 12px 14px;
  line-height: 1.5;
  resize: vertical;
}

.field input:focus,
.field select:focus,
.field textarea:focus,
.handle-input:focus-within {
  outline: 2px solid var(--ui-accent-soft, rgba(20, 184, 166, 0.28));
  outline-offset: 2px;
  border-color: var(--ui-accent, var(--color-text));
}

.handle-input {
  display: flex;
  align-items: center;
  overflow: hidden;
}

.handle-prefix {
  padding-left: 14px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 16px;
  font-weight: 700;
}

.handle-input input {
  min-height: 48px;
  border: 0;
  border-radius: 0;
  background: transparent;
  outline: none;
  padding-left: 4px;
}

.field-hint,
.success,
.error {
  margin: -6px 0 0;
  font-size: 13px;
  line-height: 1.45;
}

.field-hint {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.success {
  color: var(--ui-accent-strong, #0f766e);
  font-weight: 700;
}

.error {
  color: var(--color-error, #c62828);
  font-weight: 700;
}

.step-nav {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 40px;
}

.step-nav.split {
  justify-content: space-between;
}

.nav-actions-right {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.nav-btn {
  padding: 14px 28px;
  border: 0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn.next {
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
}

.nav-btn.back,
.nav-btn.ghost {
  background: var(--color-border);
  color: var(--ui-text, var(--color-text));
}

.nav-btn.ghost {
  background: transparent;
  border: 2px solid var(--ui-text, var(--color-text));
}

.nav-btn.back:hover:not(:disabled) {
  background: var(--ui-text-muted, var(--color-text-muted));
  color: var(--ui-bg, var(--color-bg));
}

.nav-btn.ghost:hover:not(:disabled) {
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
}

.nav-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.nav-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.plugins-panel-wrap {
  padding: 18px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
}

.wheel-start-panel {
  display: grid;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
}

.wheel-start-panel :deep(.life-wheel-chart) {
  width: 100%;
  max-width: none;
  margin-block: 0 2px;
}

.wheel-start-panel :deep(.life-wheel-chart__svg) {
  width: 100%;
  max-width: none;
}

.status-row {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 14px;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .progress-bar {
    padding: 18px 14px 30px;
  }

  .progress-track {
    left: 26px;
    right: 26px;
    top: 37px;
  }

  .start-main {
    padding: 36px 18px 40px;
  }

  .step-nav {
    display: grid;
    grid-template-columns: 1fr;
  }

  .step-nav:not(.split) .nav-btn {
    width: 100%;
  }

  .step-nav.split {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }

  .step-nav.split > .nav-btn.back {
    flex: 0 0 auto;
  }

  .nav-actions-right {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
  }

  .nav-actions-right .nav-btn {
    flex: 1 1 0;
  }

  .nav-btn {
    min-width: 0;
    padding: 13px 12px;
    font-size: 14px;
  }

}
</style>
