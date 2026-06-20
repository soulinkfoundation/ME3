<script setup lang="ts">
import { computed } from "vue";
import Button from "../Button.vue";
import UiIcon from "../UiIcon.vue";

type DatePickerCell = {
  date: string;
  day: number;
  inMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isMarked: boolean;
};

const props = withDefaults(
  defineProps<{
    monthKey: string;
    selectedDate?: string | null;
    todayDate: string;
    markedDates?: string[];
    ariaLabel?: string;
    todayActionLabel?: string;
    secondaryActionLabel?: string;
  }>(),
  {
    selectedDate: null,
    markedDates: () => [],
    ariaLabel: "Choose date",
    todayActionLabel: "Today",
    secondaryActionLabel: undefined,
  },
);

const emit = defineEmits<{
  (e: "move-month", delta: number): void;
  (e: "select-date", date: string): void;
  (e: "today"): void;
  (e: "secondary-action"): void;
}>();

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

const markedDateSet = computed(() => new Set(props.markedDates));

const monthLabel = computed(() => {
  const date = new Date(`${props.monthKey}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return props.monthKey;
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
});

const cells = computed<DatePickerCell[]>(() => {
  const [year, month] = props.monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const leadDays = (first.getDay() + 6) % 7;
  let cursor = new Date(year, month - 1, 1 - leadDays);
  const out: DatePickerCell[] = [];

  for (let i = 0; i < 42; i += 1) {
    const date = dateToKey(cursor);
    out.push({
      date,
      day: cursor.getDate(),
      inMonth: cursor.getMonth() === month - 1,
      isSelected: date === props.selectedDate,
      isToday: date === props.todayDate,
      isMarked: markedDateSet.value.has(date),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return out;
});

function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(value: string): string {
  if (value === props.todayDate) return "Today";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
</script>

<template>
  <div class="date-picker-popover" role="dialog" :aria-label="ariaLabel">
    <div class="date-picker-popover__header">
      <Button
        color="ghost"
        shape="soft"
        size="small"
        icon-only
        aria-label="Previous month"
        title="Previous month"
        type="button"
        @click="emit('move-month', -1)"
      >
        <UiIcon name="ChevronLeft" :size="16" />
      </Button>
      <strong>{{ monthLabel }}</strong>
      <Button
        color="ghost"
        shape="soft"
        size="small"
        icon-only
        aria-label="Next month"
        title="Next month"
        type="button"
        @click="emit('move-month', 1)"
      >
        <UiIcon name="ChevronRight" :size="16" />
      </Button>
    </div>
    <div class="date-picker-popover__weekdays" aria-hidden="true">
      <span v-for="(weekday, index) in weekdays" :key="`${weekday}-${index}`">
        {{ weekday }}
      </span>
    </div>
    <div class="date-picker-popover__grid" role="grid">
      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        class="date-picker-popover__day"
        :class="{
          'is-off-month': !cell.inMonth,
          'is-today': cell.isToday,
          'is-selected': cell.isSelected,
          'has-marker': cell.isMarked,
        }"
        :aria-label="`${formatDateLabel(cell.date)}${cell.isMarked ? ', journal entry saved' : ''}`"
        :aria-pressed="cell.isSelected"
        @click="emit('select-date', cell.date)"
      >
        <span>{{ cell.day }}</span>
      </button>
    </div>
    <div class="date-picker-popover__actions">
      <Button
        color="ghost"
        shape="soft"
        size="small"
        type="button"
        @click="emit('today')"
      >
        {{ todayActionLabel }}
      </Button>
      <Button
        v-if="secondaryActionLabel"
        color="primary"
        shape="soft"
        size="small"
        type="button"
        @click="emit('secondary-action')"
      >
        {{ secondaryActionLabel }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.date-picker-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 30;
  display: grid;
  width: min(292px, calc(100vw - 28px));
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: 0 18px 50px color-mix(in oklab, #000, transparent 86%);
  transform: translateX(-50%);
}

.date-picker-popover__header {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 8px;
}

.date-picker-popover__day {
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.date-picker-popover__header strong {
  overflow: hidden;
  color: var(--ui-text);
  font-size: 13px;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-picker-popover__weekdays,
.date-picker-popover__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.date-picker-popover__weekdays span {
  color: var(--ui-text-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

.date-picker-popover__day {
  display: inline-grid;
  width: 100%;
  aspect-ratio: 1;
  place-items: center;
  position: relative;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 650;
}

.date-picker-popover__day.has-marker::after {
  content: "";
  position: absolute;
  bottom: 5px;
  left: 50%;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-text-muted), transparent 22%);
  transform: translateX(-50%);
}

.date-picker-popover__day:hover {
  background: var(--ui-surface-muted);
}

.date-picker-popover__day.is-off-month {
  color: color-mix(in oklab, var(--ui-text-muted), transparent 35%);
}

.date-picker-popover__day.is-today:not(.is-selected) {
  border-color: color-mix(in oklab, var(--ui-accent), transparent 30%);
  color: var(--ui-accent);
}

.date-picker-popover__day.is-selected {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.date-picker-popover__day.is-selected.has-marker::after {
  background: color-mix(in oklab, var(--ui-accent-contrast), transparent 20%);
}

.date-picker-popover__actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

@media (max-width: 760px) {
  .date-picker-popover {
    position: fixed;
    top: 64px;
    left: 14px;
    right: 14px;
    width: auto;
    transform: none;
  }
}
</style>
