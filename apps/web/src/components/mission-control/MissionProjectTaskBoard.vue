<script setup lang="ts">
import Button from "../Button.vue";
import UiIcon from "../UiIcon.vue";
import {
  formatShortDate,
  isProjectIconLogo,
  isLocalProject,
  localProjectPath,
  projectEmojiIcon,
  projectForTask,
  projectIconSource,
  projectName,
  projectTaskComposerProjectLabel,
  projectUiIconName,
  weeklyReviewCardLabel,
  weeklyReviewMetadata,
} from "./projectWorkspace";
import type {
  MissionProject,
  MissionTask,
  ProjectBoardColumn,
  ProjectBoardStatus,
} from "./projectWorkspace";

defineProps<{
  projects: MissionProject[];
  selectedProject: MissionProject | null;
  selectedProjectIsLocal: boolean;
  localExecutorRunnerLabel: string;
  localExecutorRunnerDetail: string;
  error: string;
  loading: boolean;
  columns: ProjectBoardColumn[];
  dropStatus: ProjectBoardStatus | "";
  draggedTaskId: string;
  actionId: string;
  localRunId: string;
  saving: boolean;
  composerStatus: ProjectBoardStatus | "";
  taskDraft: string;
  taskProjectId: string;
  createDisabled: boolean;
  nextCursor: string | null;
  loadingMore: boolean;
}>();

const emit = defineEmits<{
  "update:taskDraft": [value: string];
  "update:taskProjectId": [value: string];
  "load-more": [];
  "column-drag-over": [event: DragEvent, status: ProjectBoardStatus];
  "column-drag-leave": [event: DragEvent, status: ProjectBoardStatus];
  "drop-task": [event: DragEvent, status: ProjectBoardStatus];
  "open-detail": [task: MissionTask];
  "task-drag-start": [event: DragEvent, task: MissionTask];
  "task-drag-end": [];
  "archive-task": [task: MissionTask];
  "run-task-locally": [task: MissionTask];
  "add-task": [status: ProjectBoardStatus];
  "open-composer": [status: ProjectBoardStatus];
  "cancel-composer": [];
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
</script>

<template>
  <div class="projects-workspace">
    <div v-if="selectedProjectIsLocal" class="local-project-summary">
      <div>
        <strong>Local project</strong>
        <span>{{ localProjectPath(selectedProject) }}</span>
      </div>
      <div class="local-project-summary__runner">
        <strong>{{ localExecutorRunnerLabel }}</strong>
        <span>{{ localExecutorRunnerDetail }}</span>
      </div>
    </div>

    <p v-if="error" class="mission-control__message is-error">
      {{ error }}
    </p>

    <div v-if="loading" class="empty-row">Loading project tasks...</div>
    <template v-else>
      <div class="project-board" aria-label="Project board">
        <section
          v-for="column in columns"
          :key="column.id"
          class="project-board__column"
          :class="{
            'is-drop-target': dropStatus === column.id,
          }"
          :aria-label="column.label"
          @dragover="emit('column-drag-over', $event, column.id)"
          @dragleave="emit('column-drag-leave', $event, column.id)"
          @drop="emit('drop-task', $event, column.id)"
        >
          <div class="project-board__column-header">
            <h2>{{ column.label }}</h2>
            <span>{{ column.tasks.length }}</span>
          </div>

          <article
            v-for="task in column.tasks"
            :key="task.id"
            class="project-task-card"
            :class="{
              'is-dragging': draggedTaskId === task.id,
              'is-updating': actionId === task.id || localRunId === task.id,
            }"
            role="button"
            tabindex="0"
            draggable="true"
            :aria-label="`Open details for ${task.title}`"
            @click="emit('open-detail', task)"
            @keydown.enter.prevent="emit('open-detail', task)"
            @keydown.space.prevent="emit('open-detail', task)"
            @dragstart="emit('task-drag-start', $event, task)"
            @dragend="emit('task-drag-end')"
          >
            <p>{{ task.title }}</p>
            <div class="project-task-card__meta">
              <span v-if="weeklyReviewMetadata(task)" class="weekly-review-badge"
                >Weekly Review</span
              >
              <span class="project-task-card__project">
                <span
                  v-if="
                    isProjectIconLogo(projectForTask(projects, task)) ||
                    projectUiIconName(projectForTask(projects, task)) ||
                    projectEmojiIcon(projectForTask(projects, task))
                  "
                  class="project-task-card__project-visual"
                  aria-hidden="true"
                >
                  <img
                    v-if="isProjectIconLogo(projectForTask(projects, task))"
                    :src="projectIconSource(projectForTask(projects, task))"
                    alt=""
                  />
                  <UiIcon
                    v-else-if="projectUiIconName(projectForTask(projects, task))"
                    :name="projectUiIconName(projectForTask(projects, task))!"
                    :size="14"
                  />
                  <span v-else class="project-task-card__project-emoji">
                    {{ projectEmojiIcon(projectForTask(projects, task)) }}
                  </span>
                </span>
                <span class="project-task-card__project-label">
                  {{ projectName(projects, task.projectId) }}
                </span>
              </span>
              <span
                v-if="isLocalProject(projectForTask(projects, task))"
                class="local-project-badge"
                >Local</span
              >
              <span v-if="task.dueAt || task.scheduledFor">
                {{ formatShortDate(task.dueAt || task.scheduledFor) }}
              </span>
            </div>
            <span
              v-if="weeklyReviewMetadata(task)"
              class="project-task-card__review-counts"
            >
              {{ weeklyReviewCardLabel(task) }}
            </span>
            <div class="project-task-card__actions">
              <button
                v-if="isLocalProject(projectForTask(projects, task))"
                type="button"
                class="project-task-card__run"
                :disabled="Boolean(localRunId)"
                @click.stop="emit('run-task-locally', task)"
              >
                <UiIcon name="Play" :size="14" />
                {{ localRunId === task.id ? "Queuing..." : "Run locally" }}
              </button>
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                type="button"
                aria-label="Archive task"
                :disabled="actionId === task.id || localRunId === task.id"
                @click.stop="emit('archive-task', task)"
              >
                <UiIcon name="X" :size="15" />
              </Button>
            </div>
          </article>
          <form
            v-if="composerStatus === column.id"
            class="project-task-composer"
            @submit.prevent="emit('add-task', column.id)"
          >
            <select
              v-if="!selectedProject"
              :value="taskProjectId"
              class="project-task-composer__project"
              aria-label="Task project"
              @change="emit('update:taskProjectId', inputValue($event))"
              @keydown.esc.prevent="emit('cancel-composer')"
            >
              <option value="">Choose project</option>
              <option
                v-for="project in projects"
                :key="project.id"
                :value="project.id"
              >
                {{ projectTaskComposerProjectLabel(project) }}
              </option>
            </select>
            <input
              :value="taskDraft"
              class="project-task-composer__input"
              type="text"
              placeholder="Task name"
              autocomplete="off"
              @input="emit('update:taskDraft', inputValue($event))"
              @keydown.esc.prevent="emit('cancel-composer')"
            />
            <div class="project-task-composer__actions">
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                type="button"
                aria-label="Cancel task"
                :disabled="saving"
                @click="emit('cancel-composer')"
              >
                <UiIcon name="X" :size="15" />
              </Button>
              <Button
                color="accent"
                shape="soft"
                size="compact"
                icon-only
                type="submit"
                aria-label="Add task"
                :disabled="createDisabled"
              >
                <UiIcon name="Plus" :size="16" />
              </Button>
            </div>
          </form>
          <button
            v-else
            type="button"
            class="project-column-add"
            :disabled="saving"
            @click="emit('open-composer', column.id)"
          >
            <UiIcon name="Plus" :size="15" />
            Add task
          </button>
        </section>
      </div>

      <button
        v-if="nextCursor"
        type="button"
        class="load-more-row load-more-row--center"
        :disabled="loadingMore"
        @click="emit('load-more')"
      >
        <UiIcon name="ChevronDown" :size="15" />
        {{ loadingMore ? "Loading more tasks..." : "Load more tasks" }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.projects-workspace {
  display: grid;
  width: min(1120px, 100%);
  gap: 18px;
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

.empty-row {
  padding: 18px 0;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 13px;
}

.project-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
  min-width: 0;
  overflow-x: auto;
}

.project-board__column {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 180px;
  border-radius: var(--ui-radius-md);
  transition:
    background-color 0.16s ease,
    outline-color 0.16s ease;
}

.project-board__column.is-drop-target {
  background: color-mix(in oklab, var(--ui-accent-soft), transparent 30%);
  outline: 1px solid color-mix(in oklab, var(--ui-accent), transparent 55%);
  outline-offset: 6px;
}

.project-board__column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ui-border);
}

.project-board__column-header h2 {
  margin: 0;
  font-size: 13px;
  line-height: 1.25;
}

.project-board__column-header span,
.project-task-card__meta {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.local-project-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.local-project-summary div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.local-project-summary strong {
  color: var(--ui-text);
  font-size: 13px;
}

.local-project-summary span:not(.status-badge) {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-project-summary__runner {
  justify-items: end;
  text-align: right;
}

.project-task-card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    opacity 0.16s ease,
    transform 0.16s ease;
}

.project-task-card:active {
  cursor: grabbing;
}

.project-task-card:focus-visible {
  border-color: var(--ui-accent);
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 2px;
}

.project-task-card.is-dragging {
  border-color: var(--ui-accent);
  opacity: 0.48;
  transform: scale(0.98);
}

.project-task-card.is-updating {
  opacity: 0.6;
}

.project-task-card p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.4;
}

.project-task-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.project-task-card__project {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  font-weight: 650;
}

.project-task-card__project-visual {
  display: inline-grid;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ui-text-muted);
}

.project-task-card__project-visual img {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  object-fit: cover;
}

.project-task-card__project-emoji {
  font-size: 14px;
  line-height: 1;
}

.project-task-card__project-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-project-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 20px;
  padding: 2px 6px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.project-task-card .local-project-badge {
  color: var(--ui-accent);
}

.weekly-review-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid color-mix(in oklab, var(--ui-accent), var(--ui-border) 60%);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-accent);
  font-size: 11px;
  font-weight: 750;
}

.project-task-card__review-counts {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.project-task-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.project-task-card__run {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.project-task-card__run:hover {
  border-color: color-mix(in oklab, var(--ui-accent), var(--ui-border) 40%);
  color: var(--ui-accent);
}

.project-task-card__run:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.project-task-card__actions .me3-btn {
  width: 28px;
  height: 28px;
}

.project-task-card__actions .me3-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-task-composer {
  display: grid;
  gap: 6px;
  padding: 6px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.project-task-composer__input,
.project-task-composer__project {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
}

.project-task-composer__input::placeholder {
  color: var(--ui-text-muted);
}

.project-task-composer__input:focus,
.project-task-composer__project:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.project-task-composer .me3-btn:disabled,
.project-column-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-task-composer__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.project-task-composer__actions .me3-btn {
  width: 30px;
  height: 30px;
}

.project-task-composer__actions .me3-btn[type="submit"] {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.project-column-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 36px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.project-column-add:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.load-more-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.load-more-row:hover:not(:disabled) {
  border-color: var(--ui-border-strong);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.load-more-row:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.load-more-row--center {
  justify-self: center;
  width: auto;
  min-width: 180px;
}

@media (max-width: 959px) {
  .project-board {
    grid-template-columns: 1fr;
    overflow-x: visible;
  }

  .project-board__column {
    min-width: 0;
  }
}
</style>
