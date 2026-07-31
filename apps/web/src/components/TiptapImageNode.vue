<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { NodeViewWrapper } from "@tiptap/vue-3";

const props = defineProps<{
  node: any;
  updateAttributes: (attrs: Record<string, any>) => void;
  deleteNode: () => void;
  selected: boolean;
}>();

const menuOpen = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);
const wrapperRef = ref<HTMLDivElement | null>(null);
const captionDraft = ref(
  typeof props.node?.attrs?.caption === "string" ? props.node.attrs.caption : "",
);

const widthStyle = computed(() => {
  const width = props.node?.attrs?.width;
  if (!width) return {};
  if (typeof width === "number") {
    return { width: `${width}px` };
  }
  return { width };
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function commitCaption() {
  const trimmed = captionDraft.value.trim();
  captionDraft.value = trimmed;
  props.updateAttributes({ caption: trimmed || null });
}

function deleteImage() {
  menuOpen.value = false;
  props.deleteNode();
}

function handleCaptionKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    (event.target as HTMLInputElement).blur();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    (event.target as HTMLInputElement).blur();
  }
}

watch(
  () => props.node?.attrs?.caption,
  (caption) => {
    captionDraft.value = typeof caption === "string" ? caption : "";
  },
);

function startResize(direction: "left" | "right", event: PointerEvent) {
  if (!containerRef.value) return;
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startWidth = containerRef.value.getBoundingClientRect().width;
  const parentWidth =
    containerRef.value.parentElement?.getBoundingClientRect().width ||
    startWidth;
  const minWidth = 160;

  const onMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - startX;
    const nextWidth =
      direction === "left" ? startWidth - delta : startWidth + delta;
    const clamped = Math.max(minWidth, Math.min(parentWidth, nextWidth));
    props.updateAttributes({ width: Math.round(clamped) });
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function handleDocumentClick(event: MouseEvent) {
  if (!menuOpen.value) return;
  const target = event.target as Node | null;
  if (wrapperRef.value && target && wrapperRef.value.contains(target)) {
    return;
  }
  menuOpen.value = false;
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener("click", handleDocumentClick);
  } else {
    document.removeEventListener("click", handleDocumentClick);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick);
});
</script>

<template>
  <NodeViewWrapper
    class="tiptap-image"
    :class="{ selected: selected, 'menu-open': menuOpen }"
    contenteditable="false"
  >
    <div ref="wrapperRef" class="tiptap-image-inner">
      <div ref="containerRef" class="image-shell" :style="widthStyle">
        <img class="image" :src="node.attrs.src" :alt="node.attrs.alt || ''" />
        <button
          class="image-menu-btn"
          type="button"
          aria-label="Image options"
          @click.stop="toggleMenu"
        >
          •••
        </button>
        <div
          class="resize-handle left"
          @pointerdown="startResize('left', $event)"
        ></div>
        <div
          class="resize-handle right"
          @pointerdown="startResize('right', $event)"
        ></div>
      </div>

      <div v-if="menuOpen" class="image-menu" @click.stop>
        <button
          type="button"
          class="image-menu-item danger"
          @click="deleteImage"
        >
          Delete image
        </button>
      </div>

      <input
        class="image-caption-input"
        type="text"
        v-model="captionDraft"
        aria-label="Image caption"
        placeholder="Add a caption..."
        @blur="commitCaption"
        @keydown="handleCaptionKeydown"
      />
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.tiptap-image {
  position: relative;
  margin: 12px 0;
}

.tiptap-image-inner {
  display: inline-flex;
  flex-direction: column;
  max-width: 100%;
}

.image-shell {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.image {
  display: block;
  max-width: 100%;
  border-radius: 12px;
}

.tiptap-image.selected .image {
  outline: 2px solid var(--color-accent, #ff7a00);
  outline-offset: 2px;
}

.image-menu-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.tiptap-image:hover .image-menu-btn,
.tiptap-image.menu-open .image-menu-btn,
.image-menu-btn:focus-visible {
  opacity: 1;
}

.image-menu-btn:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-accent, #fff));
  outline-offset: 2px;
}

.image-menu {
  position: absolute;
  top: 44px;
  right: 0;
  background: #1f1f1f;
  color: #fff;
  border-radius: 12px;
  min-width: 180px;
  padding: 8px;
  z-index: 5;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.25);
}

.image-menu-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.image-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.image-menu-item.danger {
  color: #ff5a5a;
}

.image-caption-input {
  box-sizing: border-box;
  margin-top: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, var(--color-border, #ddd));
  background: var(--ui-surface, var(--color-bg, #fff));
  color: var(--ui-text, var(--color-text, #111));
  font-size: 14px;
}

.image-caption-input:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-accent, #111));
  outline-offset: 2px;
}

.resize-handle {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 56px;
  margin-top: -28px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid rgba(255, 255, 255, 0.9);
  cursor: ew-resize;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.resize-handle.left {
  left: 6px;
}

.resize-handle.right {
  right: 6px;
}

.tiptap-image.selected .resize-handle,
.tiptap-image:hover .resize-handle {
  opacity: 1;
}
</style>
