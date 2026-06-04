<script setup lang="ts">
import Button from "../Button.vue";
import UiIcon from "../UiIcon.vue";
import { isLocalProject } from "./projectWorkspace";
import type { MissionProject } from "./projectWorkspace";

defineProps<{
  open: boolean;
  projects: MissionProject[];
  selectedProject: MissionProject | null;
  selectedProjectLabel: string;
  selectedProjectIsLocal: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  select: [projectId: string];
  addProject: [];
}>();
</script>

<template>
  <div
    class="mission-control__project-switcher"
    aria-label="Selected project"
    @click.stop
  >
    <button
      type="button"
      class="mission-control__project-label"
      :aria-expanded="open"
      aria-haspopup="dialog"
      aria-label="Choose project"
      @click="emit('toggle')"
    >
      <strong>{{ selectedProjectLabel }}</strong>
      <span v-if="selectedProjectIsLocal" class="local-project-badge"
        >Local</span
      >
      <UiIcon
        name="ChevronDown"
        :size="15"
        class="mission-control__project-caret"
      />
    </button>
    <div
      v-if="open"
      class="project-picker-popover"
      role="dialog"
      aria-label="Choose project"
    >
      <button
        type="button"
        class="project-picker-popover__item"
        :class="{ 'is-active': !selectedProject }"
        @click="emit('select', '')"
      >
        <span>All</span>
      </button>
      <button
        v-for="project in projects"
        :key="project.id"
        type="button"
        class="project-picker-popover__item"
        :class="{ 'is-active': selectedProject?.id === project.id }"
        @click="emit('select', project.id)"
      >
        <span>{{ project.name }}</span>
        <span v-if="isLocalProject(project)" class="local-project-badge"
          >Local</span
        >
      </button>
      <div v-if="projects.length === 0" class="project-picker-popover__empty">
        No projects yet. Personal tasks will still appear in All.
      </div>
      <Button
        color="primary"
        shape="soft"
        size="compact"
        class="project-picker-popover__add"
        type="button"
        @click="emit('addProject')"
      >
        <UiIcon name="Plus" :size="15" />
        Add project
      </Button>
    </div>
  </div>
</template>

<style scoped>
.mission-control__project-switcher {
  position: relative;
  display: grid;
  min-width: 0;
}

.mission-control__project-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 36px;
  max-width: min(260px, calc(100vw - 120px));
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1.2;
  cursor: pointer;
}

.mission-control__project-label:hover,
.mission-control__project-label[aria-expanded="true"] {
  background: var(--ui-surface-muted);
}

.mission-control__project-label strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-control__project-caret {
  flex: 0 0 auto;
  color: var(--ui-text-muted);
  transition: transform 0.16s ease;
}

.mission-control__project-label[aria-expanded="true"]
  .mission-control__project-caret {
  transform: rotate(180deg);
}

.project-picker-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 30;
  display: grid;
  width: min(300px, calc(100vw - 28px));
  min-width: min(240px, calc(100vw - 28px));
  max-width: calc(100vw - 28px);
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: 0 18px 50px color-mix(in oklab, #000, transparent 86%);
  transform: translateX(-50%);
}

.project-picker-popover__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.project-picker-popover__item > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-picker-popover__item:hover,
.project-picker-popover__item.is-active {
  background: var(--ui-surface-muted);
}

.project-picker-popover__empty {
  padding: 10px;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.project-picker-popover__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
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

@media (max-width: 959px) {
  .mission-control__project-label {
    max-width: none;
  }
}
</style>
