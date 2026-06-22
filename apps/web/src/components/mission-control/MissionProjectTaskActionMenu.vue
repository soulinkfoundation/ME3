<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Button from "../Button.vue";
import UiIcon from "../UiIcon.vue";
import type { MissionTask } from "./projectWorkspace";

const TASK_ACTION_MENU_OPEN_EVENT = "me3:project-task-action-menu-open";
const menuId = `task-action-menu-${Math.random().toString(36).slice(2)}`;

const props = defineProps<{
  task: MissionTask;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "archive-task": [task: MissionTask];
  "toggle-pin": [task: MissionTask];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function closeMenu() {
  open.value = false;
}

function toggleMenu() {
  if (props.disabled) return;
  if (!open.value) {
    window.dispatchEvent(
      new CustomEvent(TASK_ACTION_MENU_OPEN_EVENT, { detail: menuId }),
    );
  }
  open.value = !open.value;
}

function handleDocumentClick(event: MouseEvent) {
  if (!open.value) return;
  const target = event.target;
  if (target instanceof Node && root.value?.contains(target)) return;
  closeMenu();
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeMenu();
}

function handleTaskActionMenuOpen(event: Event) {
  if (
    event instanceof CustomEvent &&
    typeof event.detail === "string" &&
    event.detail !== menuId
  ) {
    closeMenu();
  }
}

function togglePin() {
  closeMenu();
  emit("toggle-pin", props.task);
}

function archiveTask() {
  closeMenu();
  emit("archive-task", props.task);
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener(TASK_ACTION_MENU_OPEN_EVENT, handleTaskActionMenuOpen);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("keydown", handleDocumentKeydown);
  window.removeEventListener(
    TASK_ACTION_MENU_OPEN_EVENT,
    handleTaskActionMenuOpen,
  );
});
</script>

<template>
  <div
    ref="root"
    class="project-task-action-menu"
    :class="{ 'is-open': open }"
    @click.stop
    @keydown.stop
  >
    <Button
      color="ghost"
      shape="soft"
      size="compact"
      icon-only
      type="button"
      class="project-task-action-menu__button"
      aria-label="Item actions"
      title="Item actions"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      :disabled="disabled"
      @click="toggleMenu"
    >
      <UiIcon name="Ellipsis" :size="16" aria-hidden="true" />
    </Button>

    <div v-if="open" class="project-task-action-menu__menu" role="menu">
      <button
        type="button"
        class="project-task-action-menu__item"
        role="menuitem"
        @click="togglePin"
      >
        <UiIcon name="Star" :size="15" aria-hidden="true" />
        {{ task.pinnedAt ? "Unpin item" : "Pin item" }}
      </button>
      <button
        type="button"
        class="project-task-action-menu__item is-danger"
        role="menuitem"
        @click="archiveTask"
      >
        <UiIcon name="Trash2" :size="15" aria-hidden="true" />
        Delete item
      </button>
    </div>
  </div>
</template>

<style scoped>
.project-task-action-menu {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.project-task-action-menu__button {
  width: var(--task-action-size, 30px);
  height: var(--task-action-size, 30px);
}

.project-task-action-menu__menu {
  position: absolute;
  top: var(--task-action-menu-top, calc(100% + 4px));
  right: 0;
  bottom: var(--task-action-menu-bottom, auto);
  z-index: 40;
  min-width: 150px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 6px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-md, 0 14px 32px rgba(15, 23, 42, 0.16));
}

.project-task-action-menu__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  padding: 8px 10px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.project-task-action-menu__item:hover,
.project-task-action-menu__item:focus-visible {
  background: var(--ui-surface-muted);
  outline: none;
}

.project-task-action-menu__item.is-danger {
  color: var(--color-danger, #b42318);
}
</style>
