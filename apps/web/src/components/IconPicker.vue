<script setup lang="ts">
import { ref, computed, shallowRef, watch, onBeforeUnmount } from "vue";
import EmojiPicker from "vue3-emoji-picker";
import "vue3-emoji-picker/css";
import UiIcon from "./UiIcon.vue";
import {
  UI_ICON_NAMES,
  UI_ICON_META,
  isUiIconName,
  resolveUiIconName,
  type UiIconName,
} from "../utils/icons";

type IconMeta = { label: string; keywords: string[] };

const props = defineProps<{
  modelValue: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const activeTab = ref<"icons" | "emoji">("icons");
const showPicker = ref(false);
const iconSearch = ref("");
const pickerRoot = ref<HTMLElement | null>(null);
const iconNames = shallowRef<UiIconName[]>([...UI_ICON_NAMES]);
const iconMeta = shallowRef<Record<string, IconMeta>>({ ...UI_ICON_META });
let iconCatalogPromise: Promise<void> | null = null;

// Check if current value is an icon or emoji
const currentIsIcon = computed(() => isUiIconName(props.modelValue));
const selectedIconName = computed(() => resolveUiIconName(props.modelValue));
const hasValue = computed(() => props.modelValue && props.modelValue.trim());

function fallbackIconMeta(name: string): IconMeta {
  return { label: name, keywords: [] };
}

function getIconMeta(name: string): IconMeta {
  return iconMeta.value[name] || fallbackIconMeta(name);
}

function loadIconCatalog() {
  if (!iconCatalogPromise) {
    iconCatalogPromise = import("../utils/iconCatalog").then((catalog) => {
      iconNames.value = [...catalog.CATALOG_ICON_NAMES];
      iconMeta.value = catalog.CATALOG_ICON_META;
    });
  }
  return iconCatalogPromise;
}

function showIconTab() {
  activeTab.value = "icons";
  void loadIconCatalog();
}

function selectIcon(name: UiIconName) {
  emit("update:modelValue", name);
  showPicker.value = false;
  iconSearch.value = "";
}

function selectEmoji(emoji: { i: string }) {
  emit("update:modelValue", emoji.i);
  showPicker.value = false;
}

function clearIcon() {
  emit("update:modelValue", "");
  closePicker();
}

function togglePicker() {
  showPicker.value = !showPicker.value;
  if (showPicker.value && activeTab.value === "icons") {
    void loadIconCatalog();
  }
  if (!showPicker.value) {
    iconSearch.value = "";
  }
}

function closePicker() {
  showPicker.value = false;
  iconSearch.value = "";
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (!showPicker.value) return;

  const target = event.target;
  if (target instanceof Node && pickerRoot.value?.contains(target)) {
    return;
  }

  closePicker();
}

function handleEscapeKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closePicker();
  }
}

watch(showPicker, (isOpen) => {
  if (isOpen) {
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("keydown", handleEscapeKeydown, true);
  } else {
    document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    document.removeEventListener("keydown", handleEscapeKeydown, true);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  document.removeEventListener("keydown", handleEscapeKeydown, true);
});

const filteredIconNames = computed(() => {
  const query = iconSearch.value.trim().toLowerCase();
  if (!query) return iconNames.value;

  const terms = query.split(/\s+/).filter(Boolean);
  return iconNames.value.filter((name) => {
    const meta = getIconMeta(name);
    const haystack = [
      name,
      meta.label,
      meta.keywords.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
});
</script>

<template>
  <div ref="pickerRoot" class="icon-picker">
    <!-- Current selection / trigger button -->
    <div class="icon-picker-trigger">
      <button
        type="button"
        class="trigger-btn"
        :class="{ 'has-value': hasValue }"
        :aria-label="props.ariaLabel || 'Choose icon or emoji'"
        :title="props.ariaLabel || 'Choose icon or emoji'"
        @click="togglePicker"
      >
        <span v-if="hasValue" class="current-icon">
          <UiIcon
            v-if="currentIsIcon"
            :name="modelValue as UiIconName"
            :size="20"
          />
          <span v-else class="emoji">{{ modelValue }}</span>
        </span>
        <span v-else class="placeholder">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
      </button>
      <button
        v-if="hasValue"
        type="button"
        class="clear-btn"
        title="Remove icon"
        aria-label="Remove icon"
        @click="clearIcon"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Picker dropdown -->
    <div v-if="showPicker" class="picker-dropdown">
      <div class="picker-content">
        <!-- Tabs -->
        <div class="picker-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: activeTab === 'icons' }"
            @click="showIconTab"
          >
            Icons
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: activeTab === 'emoji' }"
            @click="activeTab = 'emoji'"
          >
            Emoji
          </button>
        </div>

        <!-- Icons grid -->
        <div v-if="activeTab === 'icons'" class="icons-panel">
          <div class="icon-search">
            <input
              v-model="iconSearch"
              type="search"
              placeholder="Search icons"
              aria-label="Search icons"
            />
            <button
              v-if="iconSearch"
              type="button"
              class="icon-search-clear"
              aria-label="Clear icon search"
              @click="iconSearch = ''"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div v-if="filteredIconNames.length" class="icons-grid">
            <button
              v-for="name in filteredIconNames"
              :key="name"
              type="button"
              class="icon-btn"
              :class="{ selected: selectedIconName === name }"
              :title="getIconMeta(name).label"
              @click="selectIcon(name)"
            >
              <UiIcon :name="name" :size="20" />
            </button>
          </div>
          <div v-else class="icons-empty">No icons found</div>
        </div>

        <!-- Emoji picker -->
        <div v-if="activeTab === 'emoji'" class="emoji-picker-wrapper">
          <EmojiPicker
            :native="true"
            :disable-skin-tones="true"
            :display-recent="true"
            theme="auto"
            @select="selectEmoji"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.icon-picker-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
}

.trigger-btn {
  width: 48px;
  height: 48px;
  border: 2px dashed var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.2s,
    background 0.2s;
}

.trigger-btn:hover {
  border-color: var(--color-text-muted);
  background: var(--color-border);
}

.trigger-btn.has-value {
  border-style: solid;
  border-color: var(--color-border);
}

.current-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
}

.current-icon .emoji {
  font-size: 22px;
  line-height: 1;
}

.placeholder {
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: var(--color-border);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  transition:
    background 0.2s,
    color 0.2s;
}

.clear-btn:hover {
  background: #ef4444;
  color: white;
}

/* Dropdown */
.picker-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  padding-top: 8px;
}

.picker-content {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  min-width: 280px;
}

/* Tabs */
.picker-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s;
}

.tab-btn:hover {
  background: var(--color-border);
}

.tab-btn.active {
  color: var(--color-text);
  box-shadow: inset 0 -2px 0 var(--color-text);
}

/* Icons grid */
.icons-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.icon-search {
  position: relative;
  display: flex;
  align-items: center;
}

.icon-search input {
  width: 100%;
  padding: 8px 32px 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 13px;
}

.icon-search input:focus {
  outline: none;
  border-color: var(--color-text-muted);
}

.icon-search-clear {
  position: absolute;
  right: 6px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: var(--color-border);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.icon-search-clear:hover {
  background: var(--color-text);
  color: var(--color-bg);
}

.icons-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  padding: 4px 2px 0;
  max-height: 260px;
  overflow: auto;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
  transition: background 0.2s;
}

.icon-btn:hover {
  background: var(--color-border);
}

.icon-btn.selected {
  background: var(--color-text);
  color: var(--color-bg);
}

.icons-empty {
  padding: 16px 6px 12px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

/* Emoji picker wrapper */
.emoji-picker-wrapper {
  max-height: 320px;
  overflow: hidden;
}

/* Override emoji picker styles */
.emoji-picker-wrapper :deep(.v3-emoji-picker) {
  --ep-color-bg: var(--color-bg);
  --ep-color-border: var(--color-border);
  --ep-color-text: var(--color-text);
  border: none !important;
  box-shadow: none !important;
}
</style>
