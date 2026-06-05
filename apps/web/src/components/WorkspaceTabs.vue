<script setup lang="ts">
import UiIcon from "./UiIcon.vue";
import type { UiIconName } from "../utils/icons";

type WorkspaceTab = {
  id: string;
  label: string;
  icon?: UiIconName;
  count?: number | string | null;
  ariaLabel?: string;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    tabs: WorkspaceTab[];
    modelValue: string;
    ariaLabel?: string;
  }>(),
  {
    ariaLabel: "Tabs",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();

function selectTab(tab: WorkspaceTab) {
  if (tab.disabled || tab.id === props.modelValue) return;
  emit("update:modelValue", tab.id);
  emit("change", tab.id);
}
</script>

<template>
  <nav class="workspace-tabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="workspace-tabs__tab"
      :class="{ 'workspace-tabs__tab--active': modelValue === tab.id }"
      :aria-selected="modelValue === tab.id"
      :aria-label="tab.ariaLabel || tab.label"
      :disabled="tab.disabled"
      @click="selectTab(tab)"
    >
      <span class="workspace-tabs__main">
        <UiIcon
          v-if="tab.icon"
          :name="tab.icon"
          :size="16"
          aria-hidden="true"
        />
        <span class="workspace-tabs__label">{{ tab.label }}</span>
      </span>
      <span
        v-if="tab.count !== null && tab.count !== undefined"
        class="workspace-tabs__count"
      >
        {{ tab.count }}
      </span>
    </button>
  </nav>
</template>

<style scoped>
.workspace-tabs {
  display: flex;
  flex-shrink: 0;
  align-items: flex-end;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.workspace-tabs::-webkit-scrollbar {
  display: none;
}

.workspace-tabs__tab {
  position: relative;
  z-index: 0;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-height: 33px;
  margin: 0 0 -1px;
  padding: 5px 10px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px) var(--ui-radius-sm, 6px) 0 0;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 0.12s ease,
    background 0.12s ease,
    border-color 0.12s ease;
}

.workspace-tabs__tab + .workspace-tabs__tab {
  margin-inline-start: 3px;
}

.workspace-tabs__tab:hover:not(.workspace-tabs__tab--active):not(:disabled) {
  z-index: 1;
  color: var(--ui-text, var(--color-text));
}

.workspace-tabs__tab:focus-visible {
  z-index: 3;
  outline: 2px solid
    color-mix(in oklab, var(--ui-accent, currentColor), transparent 60%);
  outline-offset: 2px;
}

.workspace-tabs__tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace-tabs__tab--active {
  z-index: 2;
  border-bottom-color: transparent;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text, var(--color-text));
  font-weight: 750;
}

.workspace-tabs__main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.workspace-tabs__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-tabs__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--ui-border, var(--color-border));
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 10px;
  font-weight: 750;
}

.workspace-tabs__tab--active .workspace-tabs__count {
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text-muted, var(--color-text-muted));
}
</style>
