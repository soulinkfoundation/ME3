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
  ProjectBoardStatus,
  ProjectTaskListGroup,
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
  groups: ProjectTaskListGroup[];
  statuses: Array<{ id: ProjectBoardStatus; label: string }>;
  actionId: string;
  localRunId: string;
  saving: boolean;
  composerProjectId: string | null;
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
  "open-detail": [task: MissionTask];
  "archive-task": [task: MissionTask];
  "run-task-locally": [task: MissionTask];
  "set-status": [task: MissionTask, status: MissionTask["status"]];
  "toggle-pin": [task: MissionTask];
  "edit-project": [project: MissionProject];
  "add-task": [status: ProjectBoardStatus];
  "open-composer": [projectId: string];
  "cancel-composer": [];
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

function taskDescription(task: MissionTask): string {
  return taskDescriptionText(task);
}
</script>

<template>
  <div class="projects-list-workspace">
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
        class="project-task-group project-task-group--pinned"
        aria-label="Pinned items"
      >
        <header class="project-task-group__header">
          <div class="project-task-group__title-wrap">
            <span
              class="project-task-group__visual project-task-group__visual--pinned"
              aria-hidden="true"
            >
              <UiIcon name="Star" :size="15" />
            </span>
            <h2>Pinned</h2>
          </div>
          <div class="project-task-group__actions">
            <span>{{ pinnedTasks.length }}</span>
          </div>
        </header>

        <article
          v-for="task in pinnedTasks"
          :key="task.id"
          class="project-task-row"
          :class="{
            'is-updating': actionId === task.id || localRunId === task.id,
          }"
        >
          <button
            type="button"
            class="project-task-row__body"
            :aria-label="`Open details for ${task.title}`"
            @click="emit('open-detail', task)"
          >
            <span class="project-task-row__title">{{ task.title }}</span>
            <span
              v-if="taskDescription(task)"
              class="project-task-row__description"
            >
              {{ taskDescription(task) }}
            </span>
            <span class="project-task-row__meta">
              <span v-if="!selectedProject" class="project-task-row__project">
                {{ projectName(projects, task.projectId) }}
              </span>
              <span
                v-if="weeklyReviewMetadata(task)"
                class="weekly-review-badge"
                >Weekly Review</span
              >
              <span v-if="task.dueAt || task.scheduledFor">
                {{ formatShortDate(task.dueAt || task.scheduledFor) }}
              </span>
              <span v-if="weeklyReviewMetadata(task)">
                {{ weeklyReviewCardLabel(task) }}
              </span>
            </span>
          </button>

          <div class="project-task-row__controls">
            <label class="project-task-row__done">
              <input
                type="checkbox"
                :checked="task.status === 'done'"
                :aria-label="`Mark ${task.title} done`"
                :disabled="actionId === task.id || localRunId === task.id"
                @change="emit('set-status', task, 'done')"
              />
              <span aria-hidden="true">
                <UiIcon name="Check" :size="13" />
              </span>
            </label>
            <button
              v-if="isLocalProject(projectForTask(projects, task))"
              type="button"
              class="project-task-row__run"
              :disabled="Boolean(localRunId)"
              @click="emit('run-task-locally', task)"
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
        </article>
      </section>

      <section
        v-for="group in groups"
        :key="group.id"
        class="project-task-group"
        :aria-label="`${group.label} items`"
      >
        <header class="project-task-group__header">
          <div class="project-task-group__title-wrap">
            <span class="project-task-group__visual" aria-hidden="true">
              <img
                v-if="isProjectIconLogo(group.project)"
                :src="projectIconSource(group.project)"
                alt=""
              />
              <UiIcon
                v-else-if="projectUiIconName(group.project)"
                :name="projectUiIconName(group.project)!"
                :size="15"
              />
              <span
                v-else-if="projectEmojiIcon(group.project)"
                class="project-task-group__emoji"
              >
                {{ projectEmojiIcon(group.project) }}
              </span>
              <UiIcon v-else name="BriefcaseBusiness" :size="15" />
            </span>
            <h2>{{ group.label }}</h2>
            <span v-if="isLocalProject(group.project)" class="local-project-badge"
              >Local</span
            >
            <button
              v-if="group.project"
              class="project-task-group__edit"
              type="button"
              :aria-label="`Edit ${group.label}`"
              :title="`Edit ${group.label}`"
              @click="emit('edit-project', group.project)"
            >
              <UiIcon name="Pencil" :size="14" />
            </button>
          </div>
          <div class="project-task-group__actions">
            <span>{{ group.tasks.length }}</span>
            <button
              type="button"
              class="project-task-group__add"
              :disabled="saving"
              @click="emit('open-composer', group.project?.id || '')"
            >
              <UiIcon name="Plus" :size="15" />
              Add
            </button>
          </div>
        </header>

        <form
          v-if="composerProjectId === (group.project?.id || '')"
          class="project-task-list-composer"
          @submit.prevent="emit('add-task', 'backlog')"
        >
          <select
            v-if="!selectedProject"
            :value="taskProjectId"
            class="project-task-list-composer__project"
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
            class="project-task-list-composer__input"
            type="text"
            placeholder="Title"
            autocomplete="off"
            @input="emit('update:taskDraft', inputValue($event))"
            @keydown.esc.prevent="emit('cancel-composer')"
          />
          <div class="project-task-list-composer__actions">
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

        <div v-if="group.tasks.length === 0" class="empty-row">
          No items yet.
        </div>

        <article
          v-for="task in group.tasks"
          :key="task.id"
          class="project-task-row"
          :class="{
            'is-updating': actionId === task.id || localRunId === task.id,
          }"
        >
          <button
            type="button"
            class="project-task-row__body"
            :aria-label="`Open details for ${task.title}`"
            @click="emit('open-detail', task)"
          >
            <span class="project-task-row__title">{{ task.title }}</span>
            <span
              v-if="taskDescription(task)"
              class="project-task-row__description"
            >
              {{ taskDescription(task) }}
            </span>
            <span class="project-task-row__meta">
              <span
                v-if="weeklyReviewMetadata(task)"
                class="weekly-review-badge"
                >Weekly Review</span
              >
              <span v-if="task.dueAt || task.scheduledFor">
                {{ formatShortDate(task.dueAt || task.scheduledFor) }}
              </span>
              <span v-if="weeklyReviewMetadata(task)">
                {{ weeklyReviewCardLabel(task) }}
              </span>
            </span>
          </button>

          <div class="project-task-row__controls">
            <label class="project-task-row__done">
              <input
                type="checkbox"
                :checked="task.status === 'done'"
                :aria-label="`Mark ${task.title} done`"
                :disabled="actionId === task.id || localRunId === task.id"
                @change="emit('set-status', task, 'done')"
              />
              <span aria-hidden="true">
                <UiIcon name="Check" :size="13" />
              </span>
            </label>
            <button
              v-if="isLocalProject(projectForTask(projects, task))"
              type="button"
              class="project-task-row__run"
              :disabled="Boolean(localRunId)"
              @click="emit('run-task-locally', task)"
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
        </article>
      </section>

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
.projects-list-workspace {
  display: grid;
  width: min(760px, 100%);
  gap: 14px;
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

.project-task-group {
  display: grid;
  min-width: 0;
}

.project-task-group--pinned {
  margin-bottom: 4px;
}

.project-task-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 6px 0 10px;
  border-bottom: 1px solid var(--ui-border);
}

.project-task-group__title-wrap,
.project-task-group__header div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.project-task-group__header h2 {
  margin: 0;
  overflow: hidden;
  color: var(--ui-text);
  font-size: 14px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-task-group__visual {
  display: inline-grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text-muted);
}

.project-task-group__visual img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.project-task-group__visual--pinned {
  color: var(--ui-accent);
}

.project-task-group__emoji {
  font-size: 16px;
  line-height: 1;
}

.project-task-group__edit {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}

.project-task-group__header:hover .project-task-group__edit,
.project-task-group__edit:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

.project-task-group__edit:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.project-task-group__edit:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 2px;
}

.project-task-group__actions {
  flex: 0 0 auto;
}

.project-task-group__actions > span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.project-task-group__add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.project-task-group__add:hover:not(:disabled) {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.project-task-group__add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.project-task-list-composer {
  display: grid;
  grid-template-columns: minmax(120px, 0.4fr) minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--ui-border);
}

.project-task-list-composer__project,
.project-task-list-composer__input {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}

.project-task-list-composer__input::placeholder {
  color: var(--ui-text-muted);
}

.project-task-list-composer__project:focus,
.project-task-list-composer__input:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.project-task-list-composer__actions {
  display: flex;
  gap: 4px;
}

.project-task-list-composer__actions .me3-btn {
  width: 30px;
  height: 30px;
}

.project-task-list-composer__actions .me3-btn[type="submit"] {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.empty-row {
  padding: 18px 0;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 13px;
}

.project-task-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--ui-border);
}

.project-task-row.is-updating {
  opacity: 0.62;
}

.project-task-row__body {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.project-task-row__body:focus-visible {
  border-radius: var(--ui-radius-sm);
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 2px;
}

.project-task-row__title {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}

.project-task-row__description {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-task-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.3;
}

.project-task-row__project {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  font-weight: 650;
}

.project-task-row__project img {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 4px;
  object-fit: cover;
}

.project-task-row__project span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-task-row__controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.project-task-row__run {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
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

.project-task-row__run:hover {
  border-color: color-mix(in oklab, var(--ui-accent), var(--ui-border) 40%);
  color: var(--ui-accent);
}

.project-task-row__run:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.project-task-row__controls .project-task-action-menu {
  --task-action-size: 30px;
}

.project-task-row__done {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  cursor: pointer;
}

.project-task-row__done input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.project-task-row__done span {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: transparent;
}

.project-task-row__done:hover span,
.project-task-row__done input:focus-visible + span {
  border-color: var(--ui-accent);
}

.project-task-row__done input:checked + span {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
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

@media (max-width: 719px) {
  .projects-list-workspace {
    width: 100%;
  }

  .local-project-summary,
  .project-task-row {
    align-items: stretch;
  }

  .local-project-summary,
  .project-task-row {
    grid-template-columns: 1fr;
  }

  .local-project-summary,
  .project-task-row {
    display: grid;
  }

  .local-project-summary__runner {
    justify-items: start;
    text-align: left;
  }

  .project-task-list-composer {
    grid-template-columns: 1fr;
  }

  .project-task-group__header {
    gap: 8px;
  }

  .project-task-group__actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .project-task-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
}
</style>
