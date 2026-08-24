<script setup lang="ts">
import { computed } from "vue";
import { NodeViewWrapper } from "@tiptap/vue-3";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
}>();

const src = computed(() => String(props.node?.attrs?.src || ""));
const mimeType = computed(() => String(props.node?.attrs?.type || ""));
const title = computed(() => String(props.node?.attrs?.title || "Audio"));

function updateTitle(event: Event) {
  const value = (event.target as HTMLInputElement).value.slice(0, 120);
  props.updateAttributes({ title: value || "Audio" });
}
</script>

<template>
  <NodeViewWrapper as="figure" class="audio-node" contenteditable="false">
    <div class="audio-node-header">
      <span class="audio-node-icon" aria-hidden="true">
        <UiIcon name="AudioLines" :size="18" />
      </span>
      <label>
        <span>Audio title</span>
        <input
          :value="title"
          type="text"
          maxlength="120"
          placeholder="Audio title"
          @input="updateTitle"
        />
      </label>
      <button
        class="audio-node-remove"
        type="button"
        aria-label="Remove audio"
        title="Remove audio"
        @click="deleteNode"
      >
        <UiIcon name="Trash2" :size="15" aria-hidden="true" />
      </button>
    </div>

    <audio controls preload="metadata" :aria-label="`Audio player: ${title}`">
      <source :src="src" :type="mimeType || undefined" />
      Your browser does not support audio playback.
    </audio>
  </NodeViewWrapper>
</template>

<style scoped>
.audio-node {
  display: grid;
  gap: 12px;
  margin: 14px 0;
  padding: 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text, var(--color-text));
}

.audio-node-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.audio-node-icon,
.audio-node-remove {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--ui-radius-sm, 8px);
}

.audio-node-icon {
  background: var(--ui-accent-soft, var(--color-bg-muted));
  color: var(--ui-accent-strong, var(--color-primary));
}

.audio-node label {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.audio-node label span {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
}

.audio-node input {
  width: 100%;
  min-height: 38px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  padding: 8px 10px;
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
}

.audio-node-remove {
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  cursor: pointer;
}

.audio-node-remove:hover,
.audio-node-remove:focus-visible {
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.audio-node input:focus,
.audio-node-remove:focus-visible,
.audio-node audio:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-primary));
  outline-offset: 2px;
}

.audio-node audio {
  width: 100%;
  min-height: 42px;
}

@media (max-width: 560px) {
  .audio-node {
    padding: 14px;
  }

  .audio-node-header {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .audio-node-icon {
    display: none;
  }
}
</style>
