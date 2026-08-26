<script setup lang="ts">
import { computed } from "vue";
import UiIcon from "../UiIcon.vue";
import {
  projectEmoji,
  projectIconIsImage,
  projectUiIcon,
} from "./taskWorkspace";

const props = withDefaults(
  defineProps<{
    icon?: string | null;
    name: string;
    size?: "small" | "medium" | "large";
  }>(),
  { size: "medium" },
);

const image = computed(() => projectIconIsImage(props.icon));
const uiIcon = computed(() => projectUiIcon(props.icon));
const emoji = computed(() => projectEmoji(props.icon));
const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || "P");
const iconSize = computed(() => (props.size === "large" ? 22 : props.size === "small" ? 14 : 17));
</script>

<template>
  <span class="project-icon" :class="`project-icon--${size}`" aria-hidden="true">
    <img v-if="image" :src="icon || ''" alt="" />
    <UiIcon v-else-if="uiIcon" :name="uiIcon" :size="iconSize" />
    <span v-else-if="emoji" class="project-icon__emoji">{{ emoji }}</span>
    <span v-else class="project-icon__initial">{{ initial }}</span>
  </span>
</template>

<style scoped>
.project-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-weight: 800;
  line-height: 1;
}

.project-icon--small {
  width: 24px;
  height: 24px;
  font-size: 10px;
}

.project-icon--medium {
  width: 30px;
  height: 30px;
  font-size: 12px;
}

.project-icon--large {
  width: 42px;
  height: 42px;
  font-size: 16px;
}

.project-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-icon__emoji {
  font-family: "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
  font-size: 1.12em;
}
</style>
