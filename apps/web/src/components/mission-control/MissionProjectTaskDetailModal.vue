<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "../Button.vue";
import TiptapEditor from "../TiptapEditor.vue";
import UiIcon from "../UiIcon.vue";
import {
  formatDateTime,
  formatShortDate,
  formatWeeklyReviewRange,
  isLocalProject,
  projectForTask,
  projectName,
} from "./projectWorkspace";
import type {
  MissionProject,
  MissionRun,
  MissionTask,
  ProjectBoardStatus,
  ProjectTaskDetailDraft,
  WeeklyReviewTaskCleanupAction,
  WeeklyReviewView,
} from "./projectWorkspace";

const props = defineProps<{
  projects: MissionProject[];
  task: MissionTask | null;
  latestRun: MissionRun | null;
  latestRunSummary: string;
  weeklyReview: WeeklyReviewView | null;
  detailDraft: ProjectTaskDetailDraft;
  boardStatuses: Array<{ id: ProjectBoardStatus; label: string }>;
  weeklyReviewTaskActions: Record<string, WeeklyReviewTaskCleanupAction>;
  weeklyReviewMemoryIds: Set<string>;
  weeklyReviewReminderIds: Set<string>;
  weeklyReviewCustomMemory: string;
  weeklyReviewCompletedOpen: boolean;
  detailError: string;
  detailSaving: boolean;
  weeklyReviewSubmitting: boolean;
  taskActionId: string;
  saveDisabled: boolean;
  submitDisabled: boolean;
}>();

const emit = defineEmits<{
  "update:detailDraft": [value: ProjectTaskDetailDraft];
  "update:weeklyReviewCustomMemory": [value: string];
  "update:weeklyReviewCompletedOpen": [value: boolean];
  close: [];
  save: [];
  submit: [];
  archive: [];
  "set-weekly-review-task-action": [
    taskId: string,
    action: WeeklyReviewTaskCleanupAction,
  ];
  "toggle-weekly-review-memory": [suggestionId: string];
  "toggle-weekly-review-reminder": [reminderId: string];
}>();

const taskProject = computed(() =>
  props.task ? projectForTask(props.projects, props.task) : null,
);
const backdropPointerStarted = ref(false);

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function statusValue(event: Event): ProjectBoardStatus {
  return (event.target as HTMLSelectElement).value as ProjectBoardStatus;
}

function selectValue(event: Event): string {
  return (event.target as HTMLSelectElement).value;
}

function updateDetailDraft(patch: Partial<ProjectTaskDetailDraft>) {
  emit("update:detailDraft", {
    ...props.detailDraft,
    ...patch,
  });
}

function markBackdropPointerStart() {
  backdropPointerStarted.value = true;
}

function closeFromBackdrop() {
  if (!backdropPointerStarted.value) return;

  backdropPointerStarted.value = false;
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="task"
      class="mission-modal"
      :class="{ 'mission-modal--fullscreen': !weeklyReview }"
      role="presentation"
      @pointerdown.self="markBackdropPointerStart"
      @pointerdown.capture="backdropPointerStarted = false"
      @click.self="closeFromBackdrop"
    >
      <div
        class="mission-modal__dialog task-detail-modal"
        :class="{
          'task-detail-modal--note': !weeklyReview,
          'task-detail-modal--fullscreen': !weeklyReview,
        }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-modal-title"
      >
        <div class="task-detail-modal__window-actions">
          <Button
            v-if="!weeklyReview"
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Archive task"
            title="Archive task"
            :disabled="detailSaving || taskActionId === task.id"
            @click="emit('archive')"
          >
            <UiIcon name="Archive" :size="16" />
          </Button>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Close"
            @click="emit('close')"
          >
            <UiIcon name="X" :size="18" />
          </Button>
        </div>

        <div v-if="weeklyReview" class="mission-modal__header">
          <h2 id="task-detail-modal-title">Weekly Review</h2>
        </div>
        <h2
          v-else
          id="task-detail-modal-title"
          class="task-detail-modal__title--hidden"
        >
          Item details
        </h2>

        <div v-if="weeklyReview" class="task-detail-modal__context">
          <span>{{ projectName(projects, task.projectId) }}</span>
          <span class="weekly-review-badge">{{
            formatWeeklyReviewRange(weeklyReview)
          }}</span>
          <span v-if="isLocalProject(taskProject)" class="local-project-badge"
            >Local</span
          >
          <span v-if="task.dueAt">
            {{ formatShortDate(task.dueAt) }}
          </span>
        </div>

        <div v-if="latestRun" class="task-detail-modal__run">
          <div>
            <strong>Local run</strong>
            <span class="status-badge">{{ latestRun.status }}</span>
          </div>
          <p>{{ latestRunSummary }}</p>
        </div>

        <template v-if="weeklyReview">
          <div class="weekly-review-panel">
            <section class="weekly-review-panel__section">
              <div class="weekly-review-panel__section-header">
                <h3>Open tasks</h3>
                <span>{{ weeklyReview.openTasks.length }}</span>
              </div>
              <div
                v-if="weeklyReview.openTasks.length"
                class="weekly-review-task-list"
              >
                <div
                  v-for="item in weeklyReview.openTasks"
                  :key="item.id"
                  class="weekly-review-task-row"
                >
                  <div class="weekly-review-task-row__body">
                    <strong>{{ item.title }}</strong>
                    <small>
                      {{ projectName(projects, item.projectId) }}
                      <template v-if="item.dueAt">
                        / due {{ formatShortDate(item.dueAt) }}
                      </template>
                    </small>
                  </div>
                  <div
                    class="weekly-review-task-row__actions"
                    aria-label="Task cleanup action"
                  >
                    <Button
                      color="outline"
                      shape="soft"
                      size="compact"
                      type="button"
                      :active="weeklyReviewTaskActions[item.id] === 'archive'"
                      :disabled="
                        weeklyReviewSubmitting ||
                        Boolean(weeklyReview.submittedAt)
                      "
                      @click="
                        emit(
                          'set-weekly-review-task-action',
                          item.id,
                          'archive',
                        )
                      "
                    >
                      Archive
                    </Button>
                    <Button
                      color="outline"
                      shape="soft"
                      size="compact"
                      type="button"
                      :active="weeklyReviewTaskActions[item.id] === 'done'"
                      :disabled="
                        weeklyReviewSubmitting ||
                        Boolean(weeklyReview.submittedAt)
                      "
                      @click="
                        emit('set-weekly-review-task-action', item.id, 'done')
                      "
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </div>
              <p v-else class="weekly-review-panel__empty">
                No open tasks.
              </p>
            </section>

            <section class="weekly-review-panel__section">
              <button
                type="button"
                class="weekly-review-collapse"
                @click="
                  emit(
                    'update:weeklyReviewCompletedOpen',
                    !weeklyReviewCompletedOpen,
                  )
                "
              >
                <span>
                  Completed tasks
                  ({{ weeklyReview.completedTasks.length }})
                </span>
                <UiIcon
                  :name="
                    weeklyReviewCompletedOpen ? 'ChevronUp' : 'ChevronDown'
                  "
                  :size="15"
                />
              </button>
              <ul v-if="weeklyReviewCompletedOpen" class="weekly-review-list">
                <li v-for="item in weeklyReview.completedTasks" :key="item.id">
                  <strong>{{ item.title }}</strong>
                  <span>{{ projectName(projects, item.projectId) }}</span>
                </li>
              </ul>
            </section>

            <section class="weekly-review-panel__section">
              <div class="weekly-review-panel__section-header">
                <h3>Important memory</h3>
                <span v-if="weeklyReview.memorySuggestions.length">
                  {{ weeklyReviewMemoryIds.size }} /
                  {{ weeklyReview.memorySuggestions.length }}
                </span>
              </div>
              <label class="weekly-review-memory-field">
                <textarea
                  :value="weeklyReviewCustomMemory"
                  rows="3"
                  placeholder="e.g. A decision, preference, recurring pattern, or important context worth remembering"
                  aria-label="Important memory"
                  :disabled="
                    weeklyReviewSubmitting ||
                    Boolean(weeklyReview.submittedAt)
                  "
                  @input="
                    emit('update:weeklyReviewCustomMemory', inputValue($event))
                  "
                />
              </label>
              <div
                v-if="weeklyReview.memorySuggestions.length"
                class="weekly-review-checklist"
              >
                <label
                  v-for="item in weeklyReview.memorySuggestions"
                  :key="item.id"
                  class="weekly-review-check weekly-review-check--memory"
                >
                  <input
                    type="checkbox"
                    :checked="weeklyReviewMemoryIds.has(item.id)"
                    :disabled="
                      weeklyReviewSubmitting ||
                      Boolean(weeklyReview.submittedAt)
                    "
                    @change="emit('toggle-weekly-review-memory', item.id)"
                  />
                  <span>
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.body }}</small>
                  </span>
                </label>
              </div>
            </section>

            <p v-if="weeklyReview.submittedAt" class="weekly-review-panel__done">
              Submitted {{ formatDateTime(weeklyReview.submittedAt) }}
            </p>
          </div>
        </template>

        <template v-else>
          <label class="task-note-title-field">
            <span class="task-note-title-field__label">Title</span>
            <input
              :value="detailDraft.title"
              class="task-note-title-field__input"
              type="text"
              autocomplete="off"
              placeholder="Title"
              autofocus
              @input="updateDetailDraft({ title: inputValue($event) })"
            />
          </label>

          <div class="task-note-meta">
            <label class="field task-note-meta__field">
              <span class="task-note-meta__label">Project</span>
              <select
                :value="detailDraft.projectId"
                aria-label="Project"
                @change="updateDetailDraft({ projectId: selectValue($event) })"
              >
                <option
                  v-for="project in projects"
                  :key="project.id"
                  :value="project.id"
                >
                  {{ project.name }}
                </option>
              </select>
            </label>

            <label class="field task-note-meta__field">
              <span class="task-note-meta__label">Status</span>
              <select
                :value="detailDraft.status"
                aria-label="Status"
                @change="updateDetailDraft({ status: statusValue($event) })"
              >
                <option
                  v-for="status in boardStatuses"
                  :key="status.id"
                  :value="status.id"
                >
                  {{ status.label }}
                </option>
              </select>
            </label>

            <label class="field task-note-meta__field">
              <span class="task-note-meta__label">Date</span>
              <input
                :value="detailDraft.scheduledFor"
                type="date"
                aria-label="Date"
                @input="
                  updateDetailDraft({ scheduledFor: inputValue($event) })
                "
              />
            </label>
          </div>

          <div class="task-note-body-field">
            <TiptapEditor
              :model-value="detailDraft.description"
              class="task-note-body-field__editor"
              placeholder="Add notes"
              variant="workspace"
              @update:model-value="
                updateDetailDraft({ description: $event })
              "
            />
          </div>
        </template>

        <p v-if="detailError" class="mission-modal__error">
          {{ detailError }}
        </p>

        <div class="mission-modal__actions task-detail-modal__actions">
          <div class="task-detail-modal__primary-actions">
            <Button
              v-if="weeklyReview"
              color="primary"
              shape="soft"
              size="compact"
              type="button"
              :disabled="submitDisabled"
              @click="emit('submit')"
            >
              {{ weeklyReviewSubmitting ? "Submitting..." : "Submit review" }}
            </Button>
            <Button
              v-else
              color="primary"
              shape="soft"
              size="compact"
              type="button"
              :disabled="saveDisabled"
              @click="emit('save')"
            >
              {{ detailSaving ? "Saving..." : "Save" }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mission-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in oklab, #000, transparent 64%);
}

.mission-modal--fullscreen {
  padding: 0;
  background: var(--ui-bg);
}

.mission-modal__dialog {
  position: relative;
  display: grid;
  width: min(460px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  gap: 14px;
  overflow: auto;
  padding: 18px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: 0 24px 80px color-mix(in oklab, #000, transparent 78%);
}

.task-detail-modal--note {
  width: min(720px, 100%);
  max-height: min(820px, calc(100vh - 48px));
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  gap: 16px;
  overflow: hidden;
  padding: 70px 28px 22px;
}

.task-detail-modal--fullscreen {
  width: 100%;
  height: 100dvh;
  max-height: none;
  border: 0;
  border-radius: 0;
  background: var(--ui-bg);
  box-shadow: none;
  padding: 72px max(24px, calc((100vw - 700px) / 2)) 24px;
}

.mission-modal__header,
.mission-modal__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mission-modal__header h2 {
  margin: 0;
  font-size: 16px;
}

.task-detail-modal__window-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.task-detail-modal--fullscreen .task-detail-modal__window-actions {
  position: fixed;
  top: 18px;
  right: 24px;
}

.task-detail-modal__title--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.mission-modal__actions {
  justify-content: flex-end;
  padding-top: 4px;
}

.task-detail-modal__context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: -4px;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.task-detail-modal__run {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.task-detail-modal__run div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.task-detail-modal__run strong {
  font-size: 13px;
}

.task-detail-modal__run p {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.task-detail-modal__actions {
  justify-content: flex-end;
}

.task-detail-modal__primary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-note-title-field {
  display: grid;
  min-width: 0;
}

.task-note-title-field__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.task-note-title-field__input {
  width: 100%;
  min-width: 0;
  padding: 2px 0 4px;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 28px;
  font-weight: 750;
  line-height: 1.18;
}

.task-note-title-field__input::placeholder {
  color: color-mix(in oklab, var(--ui-text-muted) 58%, transparent);
}

.task-note-title-field__input:focus {
  outline: none;
}

.task-note-meta {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(150px, 0.75fr);
  gap: 10px;
  min-width: 0;
}

.task-note-meta__field {
  min-width: 0;
}

.task-note-meta__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.task-note-body-field {
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--ui-text);
  font-size: inherit;
  font-weight: 400;
}

.task-note-body-field__editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  --tiptap-toolbar-offset: 0px;
}

.task-note-body-field__editor :deep(.tiptap-editor--workspace) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.task-note-body-field__editor :deep(.editor-toolbar) {
  position: static;
  width: 100%;
  margin: 0;
  padding: 0 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  flex-wrap: nowrap;
  justify-content: flex-start;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.task-note-body-field__editor :deep(.editor-toolbar)::-webkit-scrollbar {
  display: none;
}

.task-note-body-field__editor :deep(.toolbar-btn),
.task-note-body-field__editor :deep(.toolbar-divider) {
  flex: 0 0 auto;
}

.task-note-body-field__editor :deep(.editor-content-wrapper) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 340px;
  max-height: min(520px, calc(100vh - 330px));
  overflow: auto;
  padding: 8px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.task-note-body-field__editor :deep(.ProseMirror) {
  min-height: 308px;
  font: inherit;
  font-weight: 400;
}

.task-detail-modal--fullscreen
  .task-note-body-field__editor
  :deep(.editor-content-wrapper) {
  min-height: 0;
  max-height: none;
}

.task-detail-modal--fullscreen .task-note-body-field__editor :deep(.ProseMirror) {
  flex: 1;
  min-height: 100%;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 2px 6px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.2;
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

.weekly-review-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.weekly-review-panel__empty,
.weekly-review-panel__done {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.weekly-review-panel__done {
  color: var(--ui-accent);
  font-weight: 700;
}

.weekly-review-panel__section {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.weekly-review-panel__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.weekly-review-panel__section-header h3 {
  margin: 0;
  font-size: 13px;
}

.weekly-review-panel__section-header span {
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.weekly-review-checklist {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.weekly-review-check {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.weekly-review-check input {
  margin-top: 2px;
}

.weekly-review-check span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.weekly-review-check strong,
.weekly-review-list strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.35;
}

.weekly-review-check small,
.weekly-review-list span {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.weekly-review-check--memory small {
  overflow-wrap: anywhere;
}

.weekly-review-task-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.weekly-review-task-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.weekly-review-task-row__body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.weekly-review-task-row__body strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.35;
}

.weekly-review-task-row__body small {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.weekly-review-task-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.weekly-review-task-row__actions .me3-btn {
  min-height: 30px;
  padding: 4px 8px;
}

.weekly-review-task-row__actions .me3-btn.me3-btn--active {
  border-color: transparent;
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.weekly-review-memory-field {
  display: grid;
  min-width: 0;
}

.weekly-review-memory-field textarea {
  min-width: 0;
  width: 100%;
  resize: vertical;
}

.weekly-review-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.weekly-review-list li {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.weekly-review-collapse {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.field {
  display: grid;
  gap: 6px;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 650;
}

.field input,
.field select,
.field textarea,
.weekly-review-memory-field textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
}

.field input,
.field select {
  min-height: 38px;
  padding: 0 10px;
}

.field textarea,
.weekly-review-memory-field textarea {
  resize: vertical;
  padding: 10px;
  line-height: 1.5;
}

.field input:focus,
.field select:focus,
.field textarea:focus,
.weekly-review-memory-field textarea:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.mission-modal__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

@media (max-width: 959px) {
  .mission-modal {
    padding: 14px;
  }

  .mission-modal--fullscreen {
    padding: 0;
  }

  .task-detail-modal--note {
    width: 100%;
    max-height: calc(100vh - 28px);
    padding: 64px 18px 18px;
  }

  .task-detail-modal--fullscreen {
    height: 100dvh;
    max-height: none;
    padding: 64px 18px 18px;
  }

  .task-note-title-field__input {
    font-size: 24px;
  }

  .task-note-body-field__editor :deep(.editor-content-wrapper) {
    min-height: 300px;
    max-height: min(520px, calc(100vh - 360px));
  }

  .task-note-body-field__editor :deep(.ProseMirror) {
    min-height: 268px;
  }
}

@media (max-width: 640px) {
  .task-note-meta {
    grid-template-columns: 1fr;
  }
}
</style>
