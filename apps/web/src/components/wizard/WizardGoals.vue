<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../../api";
import { useAppToast } from "../../composables/useAppToast";
import Button from "../Button.vue";
import UiIcon from "../UiIcon.vue";

type MissionGoal = {
  id: string;
  title: string;
  status: "active" | "completed";
};

type MissionDashboardResponse = {
  settings: {
    goals?: MissionGoal[];
  };
  data?: {
    "mission.goals"?: {
      goals?: MissionGoal[];
    };
  };
};

const goals = ref<MissionGoal[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const { toastSuccess } = useAppToast();
let saveQueued = false;

function createGoalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `goal-${crypto.randomUUID()}`;
  }
  return `goal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addGoal() {
  goals.value.push({
    id: createGoalId(),
    title: "",
    status: "active",
  });
}

async function saveGoals() {
  if (saving.value) {
    saveQueued = true;
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const response = await api.patch<MissionDashboardResponse>(
      "/mission-control/dashboard",
      {
        goals: goals.value
          .map((goal) => ({ ...goal, title: goal.title.trim() }))
          .filter((goal) => goal.title),
      },
    );
    if (!saveQueued) {
      goals.value =
        response.settings.goals ||
        response.data?.["mission.goals"]?.goals ||
        [];
      toastSuccess("Goals saved");
    }
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Goals could not be saved.";
  } finally {
    saving.value = false;
    if (saveQueued) {
      saveQueued = false;
      void saveGoals();
    }
  }
}

async function removeGoal(goalId: string) {
  goals.value = goals.value.filter((goal) => goal.id !== goalId);
  await saveGoals();
}

onMounted(async () => {
  try {
    const response = await api.get<MissionDashboardResponse>(
      "/mission-control/dashboard",
    );
    goals.value =
      response.settings.goals ||
      response.data?.["mission.goals"]?.goals ||
      [];
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Goals could not be loaded.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="step-goals" :aria-busy="saving">
    <h2>Goals</h2>
    <p class="section-desc">
      Keep the outcomes you are actively working towards here.
    </p>

    <p v-if="loading" class="section-desc" role="status">
      Loading goals...
    </p>

    <div v-else class="goal-list">
      <div
        v-for="(goal, index) in goals"
        :key="goal.id"
        class="goal-card"
      >
        <label class="goal-toggle">
          <input
            v-model="goal.status"
            type="checkbox"
            true-value="completed"
            false-value="active"
            :aria-label="
              goal.status === 'completed'
                ? `Mark ${goal.title || 'goal'} active`
                : `Mark ${goal.title || 'goal'} complete`
            "
            @change="saveGoals"
          />
          <span class="goal-toggle-ui" />
        </label>
        <input
          v-model="goal.title"
          class="goal-input"
          type="text"
          maxlength="600"
          placeholder="e.g. Publish four useful videos this month"
          :aria-label="`Goal ${index + 1} title`"
          :class="{ 'is-completed': goal.status === 'completed' }"
          @change="saveGoals"
        />
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          type="button"
          :aria-label="`Remove ${goal.title || 'goal'}`"
          title="Remove goal"
          @click="removeGoal(goal.id)"
        >
          <UiIcon name="Trash2" :size="16" aria-hidden="true" />
        </Button>
      </div>
    </div>

    <Button
      color="outline"
      shape="soft"
      size="compact"
      type="button"
      :disabled="loading"
      @click="addGoal"
    >
      <UiIcon name="Plus" :size="16" aria-hidden="true" />
      Add goal
    </Button>

    <p v-if="saving" class="save-status" role="status">Saving...</p>
    <p v-if="error" class="save-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.step-goals h2 {
  font-size: 28px;
  margin-bottom: 8px;
}

.section-desc,
.save-status {
  color: var(--color-text-muted);
  font-size: 14px;
  margin-bottom: 24px;
}

.goal-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.goal-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
}

.goal-input {
  min-width: 0;
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  padding: 10px 12px;
}

.goal-input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.goal-input.is-completed {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.goal-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.goal-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.goal-toggle-ui {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 2px solid var(--color-border);
  border-radius: 999px;
}

.goal-toggle input:checked + .goal-toggle-ui {
  border-color: var(--color-text);
  background: var(--color-text);
}

.goal-toggle input:focus-visible + .goal-toggle-ui {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.goal-toggle input:checked + .goal-toggle-ui::after {
  content: "✓";
  color: var(--color-bg);
  font-size: 14px;
  font-weight: 700;
}

.save-status {
  margin: 12px 0 0;
}

.save-error {
  margin: 12px 0 0;
  color: #ef4444;
  font-size: 13px;
}

@media (max-width: 640px) {
  .goal-card {
    align-items: flex-start;
  }
}
</style>
