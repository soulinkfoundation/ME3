<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  type CalendarContextAnchor,
  type CalendarWeekSlot,
} from "./calendarWeek";

const props = defineProps<{
  slot: CalendarWeekSlot;
  anchor: CalendarContextAnchor;
  submitting?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", title: string): void;
  (e: "more-options", title: string): void;
}>();

const title = ref("");
const titleInput = ref<HTMLInputElement | null>(null);

const position = computed(() => {
  const width = 320;
  const height = 230;
  const gap = 10;
  const edge = 12;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const fitsRight = props.anchor.right + gap + width <= viewportWidth - edge;
  const left = fitsRight
    ? props.anchor.right + gap
    : props.anchor.left - width - gap;
  return {
    left: `${Math.max(edge, Math.min(viewportWidth - width - edge, left))}px`,
    top: `${Math.max(edge, Math.min(viewportHeight - height - edge, props.anchor.top))}px`,
  };
});

const whenLabel = computed(() => {
  const [year, month, day] = props.slot.dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
  if (props.slot.allDay) return `${formattedDate} · All day`;
  return `${formattedDate} · ${formatMinutes(props.slot.startMinutes)}–${formatMinutes(props.slot.endMinutes)}`;
});

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const nextDay = totalMinutes >= 24 * 60 ? " (+1 day)" : "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}${nextDay}`;
}

function submit() {
  const trimmed = title.value.trim();
  if (!trimmed || props.submitting) return;
  emit("submit", trimmed);
}

watch(
  () => `${props.slot.dayKey}:${props.slot.startMinutes}:${props.slot.allDay}`,
  () => {
    title.value = "";
    void nextTick(() => titleInput.value?.focus());
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <form
      class="calendar-context-popover quick-event-popover"
      :style="position"
      role="dialog"
      aria-modal="false"
      aria-labelledby="quick-event-popover-title"
      @click.stop
      @submit.prevent="submit"
    >
      <div class="quick-event-heading">
        <div>
          <h2 id="quick-event-popover-title">New event</h2>
          <p>{{ whenLabel }}</p>
        </div>
        <button
          type="button"
          class="popover-close"
          aria-label="Close quick create"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <label>
        <span class="sr-only">Event title</span>
        <input
          ref="titleInput"
          v-model="title"
          type="text"
          placeholder="Add title"
          autocomplete="off"
        />
      </label>

      <p v-if="error" class="quick-event-error" role="alert">{{ error }}</p>

      <footer>
        <button
          type="button"
          class="more-options"
          @click="emit('more-options', title.trim())"
        >
          More options
        </button>
        <button
          type="submit"
          class="save-event"
          :disabled="!title.trim() || submitting"
        >
          {{ submitting ? "Saving…" : "Save" }}
        </button>
      </footer>
    </form>
  </Teleport>
</template>

<style scoped>
.calendar-context-popover {
  position: fixed;
  z-index: 90;
  width: min(320px, calc(100vw - 24px));
  padding: 16px;
  border: 1px solid var(--ui-border-strong, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  box-shadow: var(--ui-shadow-md, 0 18px 48px rgba(0, 0, 0, 0.18));
}

.quick-event-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

h2,
p {
  margin: 0;
}

h2 {
  font-size: 17px;
}

.quick-event-heading p {
  margin-top: 3px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 600;
}

.popover-close {
  display: inline-grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-sm, 8px);
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 24px;
  cursor: pointer;
}

.popover-close:hover {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

input {
  width: 100%;
  min-height: 44px;
  padding: 9px 11px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text, var(--color-text));
  font: inherit;
}

.quick-event-error {
  margin-top: 8px;
  color: #b33b2e;
  font-size: 12px;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

footer button {
  min-height: 36px;
  padding: 7px 11px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

footer .save-event {
  border-color: var(--ui-accent-strong, var(--ui-accent));
  background: var(--ui-accent-strong, var(--ui-accent));
  color: var(--ui-accent-contrast, #fff);
}

footer button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

input:focus-visible,
.popover-close:focus-visible,
footer button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
