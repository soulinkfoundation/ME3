<script setup lang="ts">
import Button from "../Button.vue";
import UiIcon from "../UiIcon.vue";
import MissionProjectTaskActionMenu from "./MissionProjectTaskActionMenu.vue";
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
  taskDescriptionText,
  weeklyReviewCardLabel,
  weeklyReviewMetadata,
} from "./projectWorkspace";
import type {
  MissionProject,
  MissionTask,
  ProjectBoardColumn,
} from "./projectWorkspace";

defineProps<{
  projects: MissionProject[];
  selectedProject: MissionProject | null;
  selectedProjectIsLocal: boolean;
  localExecutorRunnerLabel: string;
  localExecutorRunnerDetail: string;
  error: string;
  loading: boolean;
  pinnedTasks: MissionTask[];
  columns: ProjectBoardColumn[];
  dropStatus: string;
  draggedTaskId: string;
  actionId: string;
  columnActionId: string;
  localRunId: string;
  saving: boolean;
  composerStatus: string;
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
  "column-drag-over": [event: DragEvent, columnId: string];
  "column-drag-leave": [event: DragEvent, columnId: string];
  "drop-task": [event: DragEvent, column: ProjectBoardColumn];
  "open-detail": [task: MissionTask];
  "task-drag-start": [event: DragEvent, task: MissionTask];
  "task-drag-end": [];
  "archive-task": [task: MissionTask];
  "run-task-locally": [task: MissionTask];
  "toggle-pin": [task: MissionTask];
  "rename-column": [column: ProjectBoardColumn, name: string];
  "add-column": [];
  "remove-column": [column: ProjectBoardColumn];
  "add-task": [column: ProjectBoardColumn];
  "open-composer": [column: ProjectBoardColumn];
  "cancel-composer": [];
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

function taskDescription(task: MissionTask): string {
  return taskDescriptionText(task);
}

function projectChipStyle(project: MissionProject | null) {
  const color = project?.color?.trim();
  return color ? { "--project-chip-color": color } : {};
}

function blurOnEnter(event: KeyboardEvent) {
  (event.target as HTMLInputElement).blur();
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

    <div v-if="loading" class="empty-row">Loading project items...</div>
    <template v-else>
      <section
        v-if="pinnedTasks.length"
        class="project-pinned-board"
        aria-label="Pinned items"
      >
        <div class="project-board__column-header">
          <h2>Pinned</h2>
          <span>{{ pinnedTasks.length }}</span>
        </div>

        <div class="project-pinned-board__tasks">
          <article
            v-for="task in pinnedTasks"
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
            <p class="project-task-card__title">{{ task.title }}</p>
            <p
              v-if="taskDescription(task)"
              class="project-task-card__description"
            >
              {{ taskDescription(task) }}
            </p>
            <div
              v-if="
                weeklyReviewMetadata(task) ||
                isLocalProject(projectForTask(projects, task)) ||
                task.dueAt ||
                task.scheduledFor
              "
              class="project-task-card__meta"
            >
              <span v-if="weeklyReviewMetadata(task)" class="weekly-review-badge"
                >Weekly Review</span
              >
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
              <MissionProjectTaskActionMenu
                :task="task"
                :disabled="actionId === task.id || localRunId === task.id"
                @toggle-pin="emit('toggle-pin', $event)"
                @archive-task="emit('archive-task', $event)"
              />
            </div>
            <div class="project-task-card__footer">
              <span
                class="project-task-card__project"
                :style="projectChipStyle(projectForTask(projects, task))"
              >
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
            </div>
          </article>
        </div>
      </section>

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
          @drop="emit('drop-task', $event, column)"
        >
          <div class="project-board__column-header">
            <input
              v-if="selectedProject"
              class="project-board__column-name"
              :value="column.label"
              :aria-label="`Rename ${column.label} column`"
              :disabled="saving"
              @change="
                emit('rename-column', column, inputValue($event).trim())
              "
              @keydown.enter.prevent="blurOnEnter"
            />
            <h2 v-else>{{ column.label }}</h2>
            <span>{{ column.tasks.length }}</span>
            <button
              v-if="selectedProject && columns.length > 1"
              type="button"
              class="project-board__column-remove"
              :disabled="saving || columnActionId === column.id"
              :aria-label="`Remove ${column.label} column`"
              :title="`Remove ${column.label} column`"
              @click="emit('remove-column', column)"
            >
              <UiIcon name="Trash2" :size="13" />
            </button>
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
            <p class="project-task-card__title">{{ task.title }}</p>
            <p
              v-if="taskDescription(task)"
              class="project-task-card__description"
            >
              {{ taskDescription(task) }}
            </p>
            <div
              v-if="
                weeklyReviewMetadata(task) ||
                isLocalProject(projectForTask(projects, task)) ||
                task.dueAt ||
                task.scheduledFor
              "
              class="project-task-card__meta"
            >
              <span v-if="weeklyReviewMetadata(task)" class="weekly-review-badge"
                >Weekly Review</span
              >
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
              <MissionProjectTaskActionMenu
                :task="task"
                :disabled="actionId === task.id || localRunId === task.id"
                @toggle-pin="emit('toggle-pin', $event)"
                @archive-task="emit('archive-task', $event)"
              />
            </div>
            <div class="project-task-card__footer">
              <span
                class="project-task-card__project"
                :style="projectChipStyle(projectForTask(projects, task))"
              >
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
            </div>
          </article>
          <form
            v-if="composerStatus === column.id"
            class="project-task-composer"
            @submit.prevent="emit('add-task', column)"
          >
            <select
              v-if="!selectedProject"
              :value="taskProjectId"
              class="project-task-composer__project"
              aria-label="Project"
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
              placeholder="Title"
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
                aria-label="Cancel item"
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
                aria-label="Add item"
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
            @click="emit('open-composer', column)"
          >
            <UiIcon name="Plus" :size="15" />
            Add
          </button>
        </section>
        <button
          v-if="selectedProject"
          type="button"
          class="project-board__add-column"
          :disabled="saving || Boolean(columnActionId)"
          :aria-busy="columnActionId === 'new' ? 'true' : 'false'"
          @click="emit('add-column')"
        >
          <UiIcon name="Plus" :size="15" />
          {{ columnActionId === "new" ? "Adding..." : "Add column" }}
        </button>
      </div>

      <button
        v-if="nextCursor"
        type="button"
        class="load-more-row load-more-row--center"
        :disabled="loadingMore"
        @click="emit('load-more')"
      >
        <UiIcon name="ChevronDown" :size="15" />
        {{ loadingMore ? "Loading more items..." : "Load more items" }}
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
  grid-auto-columns: minmax(180px, 1fr);
  grid-auto-flow: column;
  align-items: start;
  gap: 12px;
  min-width: 0;
  padding-bottom: 6px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.project-pinned-board {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.project-pinned-board__tasks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
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

.project-board__column-remove {
  display: inline-grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.project-board__column-remove:hover {
  border-color: var(--ui-border);
  color: #b91c1c;
}

.project-board__column-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.project-board__column-header h2 {
  margin: 0;
  font-size: 13px;
  line-height: 1.25;
}

.project-board__column-name {
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
}

.project-board__column-name:hover,
.project-board__column-name:focus {
  border-color: var(--ui-border);
  background: var(--ui-bg);
  outline: none;
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
  position: relative;
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px 42px 10px 10px;
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

.project-task-card__title,
.project-task-card__description {
  margin: 0;
  min-width: 0;
}

.project-task-card__title {
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.4;
}

.project-task-card__description {
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-task-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.project-task-card__footer {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
  margin-right: -32px;
}

.project-task-card__project {
  --project-chip-color: var(--ui-accent);
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  gap: 5px;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid
    color-mix(in oklab, var(--project-chip-color), var(--ui-border) 68%);
  border-radius: 999px;
  background: color-mix(
    in oklab,
    var(--project-chip-color) 12%,
    transparent
  );
  color: color-mix(in oklab, var(--project-chip-color), var(--ui-text) 20%);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
}

.project-task-card__project-visual {
  display: inline-grid;
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  place-items: center;
  color: currentColor;
}

.project-task-card__project-visual img {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  object-fit: cover;
}

.project-task-card__project-emoji {
  font-size: 12px;
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
  position: absolute;
  top: 8px;
  right: 8px;
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

.project-task-card__actions .project-task-action-menu {
  --task-action-size: 28px;
  --task-action-menu-top: auto;
  --task-action-menu-bottom: calc(100% + 4px);
}

.project-pinned-board .project-task-action-menu {
  --task-action-menu-top: calc(100% + 4px);
  --task-action-menu-bottom: auto;
}

.project-task-composer {
  display: grid;
  gap: 6px;
  padding: 6px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.project-board__add-column {
  display: inline-flex;
  align-items: center;
  align-self: start;
  justify-content: center;
  gap: 6px;
  min-width: 180px;
  min-height: 38px;
  border: 1px dashed var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.project-board__add-column:hover {
  border-color: var(--ui-accent);
  color: var(--ui-accent);
}

.project-board__add-column:disabled {
  cursor: default;
  opacity: 0.65;
}

.project-board__add-column:disabled:hover {
  border-color: var(--ui-border);
  color: var(--ui-text-muted);
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
    grid-auto-columns: minmax(220px, 82vw);
  }
}
</style>
