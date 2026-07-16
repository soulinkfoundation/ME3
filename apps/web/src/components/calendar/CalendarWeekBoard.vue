<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { CalendarAgendaEvent } from "./calendarAgenda";
import {
  calendarContextAnchor,
  layoutWeekTimedEvents,
  localDayKey,
  weekSlotFromPointer,
  WEEK_DEFAULT_EVENT_MINUTES,
  WEEK_HOUR_HEIGHT,
  type CalendarContextAnchor,
  type CalendarWeekLayoutEvent,
  type CalendarWeekSlot,
} from "./calendarWeek";

const props = withDefaults(
  defineProps<{
    weekStart: Date;
    events: CalendarAgendaEvent[];
    selectedEventId?: string;
    highlightedEventId?: string;
    todayDayKey: string;
    maxAllDayPerColumn?: number;
  }>(),
  {
    selectedEventId: "",
    highlightedEventId: "",
    maxAllDayPerColumn: 3,
  },
);

const emit = defineEmits<{
  (
    e: "select-event",
    id: string,
    anchor: CalendarContextAnchor,
  ): void;
  (
    e: "select-slot",
    slot: CalendarWeekSlot,
    anchor: CalendarContextAnchor,
  ): void;
  (e: "show-day", dayKey: string): void;
}>();

const timeScroll = ref<HTMLElement | null>(null);
const keyboardDayKey = ref("");
const keyboardMinutes = ref(9 * 60);
const now = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | null = null;

const headerFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
});
const dateLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const columns = computed(() => {
  const start = new Date(props.weekStart);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      dayKey: localDayKey(date),
      weekday: headerFormatter.format(date),
      dayNumber: date.getDate(),
      dateLabel: dateLabelFormatter.format(date),
    };
  });
});

const timedEvents = computed(() =>
  layoutWeekTimedEvents(
    props.events,
    columns.value.map((column) => column.dayKey),
  ),
);

const timedEventsByDay = computed(() => {
  const result = new Map<string, CalendarWeekLayoutEvent[]>();
  for (const event of timedEvents.value) {
    const dayEvents = result.get(event.dayKey) ?? [];
    dayEvents.push(event);
    result.set(event.dayKey, dayEvents);
  }
  return result;
});

const allDayEventsByDay = computed(() => {
  const result = new Map<string, CalendarAgendaEvent[]>();
  for (const event of props.events) {
    if (!event.allDay) continue;
    const startKey = localDayKey(new Date(event.startsAt));
    const inclusiveEnd = new Date(event.endsAt);
    inclusiveEnd.setMilliseconds(inclusiveEnd.getMilliseconds() - 1);
    const endKey = localDayKey(inclusiveEnd);
    for (const column of columns.value) {
      if (column.dayKey < startKey || column.dayKey > endKey) continue;
      const dayEvents = result.get(column.dayKey) ?? [];
      dayEvents.push(event);
      result.set(column.dayKey, dayEvents);
    }
  }
  return result;
});

const currentMinutes = computed(
  () => now.value.getHours() * 60 + now.value.getMinutes(),
);

const hourLabels = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  label: `${String(hour).padStart(2, "0")}:00`,
}));

function timedEventsFor(dayKey: string) {
  return timedEventsByDay.value.get(dayKey) ?? [];
}

function allDayEventsFor(dayKey: string) {
  return allDayEventsByDay.value.get(dayKey) ?? [];
}

function colorForEvent(event: CalendarAgendaEvent): string {
  return event.color || "var(--cal-accent, #7dbaf9)";
}

function eventTimeLabel(event: CalendarAgendaEvent): string {
  if (event.allDay) return "All day";
  const start = timeFormatter.format(new Date(event.startsAt));
  const end = timeFormatter.format(new Date(event.endsAt));
  return start === end ? start : `${start}–${end}`;
}

function eventStyle(item: CalendarWeekLayoutEvent) {
  const width = 100 / item.columnCount;
  return {
    "--week-event-color": colorForEvent(item.event),
    top: `${(item.startMinutes / 60) * WEEK_HOUR_HEIGHT}px`,
    height: `${Math.max(24, ((item.endMinutes - item.startMinutes) / 60) * WEEK_HOUR_HEIGHT - 2)}px`,
    left: `calc(${item.column * width}% + 2px)`,
    width: `calc(${width}% - 4px)`,
  };
}

function currentMarkerStyle() {
  return {
    top: `${(currentMinutes.value / 60) * WEEK_HOUR_HEIGHT}px`,
  };
}

function slotAnchor(
  target: HTMLElement,
  clientY: number,
): CalendarContextAnchor {
  const rect = target.getBoundingClientRect();
  return {
    top: clientY,
    right: rect.right,
    bottom: clientY,
    left: rect.left,
    width: rect.width,
    height: 0,
    trigger: target,
  };
}

function selectTimedSlot(dayKey: string, event: MouseEvent) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const rect = event.currentTarget.getBoundingClientRect();
  emit(
    "select-slot",
    weekSlotFromPointer(dayKey, event.clientY, rect.top),
    slotAnchor(event.currentTarget, event.clientY),
  );
}

function selectAllDaySlot(dayKey: string, event: Event) {
  emit(
    "select-slot",
    {
      dayKey,
      startMinutes: 0,
      endMinutes: 24 * 60,
      allDay: true,
    },
    calendarContextAnchor(event.currentTarget),
  );
}

function selectEvent(eventId: string, mouseEvent: MouseEvent) {
  emit(
    "select-event",
    eventId,
    calendarContextAnchor(mouseEvent.currentTarget),
  );
}

function keyboardSlot(dayKey: string): CalendarWeekSlot {
  return {
    dayKey,
    startMinutes: keyboardMinutes.value,
    endMinutes: keyboardMinutes.value + WEEK_DEFAULT_EVENT_MINUTES,
  };
}

function focusDayColumn(index: number) {
  const dayKey = columns.value[index]?.dayKey;
  if (!dayKey) return;
  document
    .querySelector<HTMLElement>(`[data-week-day="${dayKey}"]`)
    ?.focus();
}

function keepKeyboardTimeVisible() {
  const viewport = timeScroll.value;
  if (!viewport) return;
  const top = (keyboardMinutes.value / 60) * WEEK_HOUR_HEIGHT;
  const padding = 48;
  if (top < viewport.scrollTop + padding) {
    viewport.scrollTop = Math.max(0, top - padding);
  } else if (top > viewport.scrollTop + viewport.clientHeight - padding) {
    viewport.scrollTop = top - viewport.clientHeight + padding;
  }
}

function handleColumnKeydown(
  dayKey: string,
  index: number,
  event: KeyboardEvent,
) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -30 : 30;
    keyboardMinutes.value = Math.max(
      0,
      Math.min(23 * 60 + 30, keyboardMinutes.value + delta),
    );
    void nextTick(keepKeyboardTimeVisible);
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    focusDayColumn(index + (event.key === "ArrowLeft" ? -1 : 1));
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const targetRect = event.currentTarget.getBoundingClientRect();
  const scrollRect = timeScroll.value?.getBoundingClientRect();
  const rawTop =
    targetRect.top + (keyboardMinutes.value / 60) * WEEK_HOUR_HEIGHT;
  const top = scrollRect
    ? Math.max(scrollRect.top + 8, Math.min(scrollRect.bottom - 8, rawTop))
    : rawTop;
  emit(
    "select-slot",
    keyboardSlot(dayKey),
    slotAnchor(event.currentTarget, top),
  );
}

function scrollToUsefulTime() {
  const viewport = timeScroll.value;
  if (!viewport) return;
  const containsToday = columns.value.some(
    (column) => column.dayKey === props.todayDayKey,
  );
  const minutes = containsToday ? currentMinutes.value : 8 * 60;
  viewport.scrollTop = Math.max(
    0,
    (minutes / 60) * WEEK_HOUR_HEIGHT - (containsToday ? 120 : 24),
  );
}

watch(
  () => props.weekStart.getTime(),
  () => void nextTick(scrollToUsefulTime),
);

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date();
  }, 60_000);
  void nextTick(scrollToUsefulTime);
});

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <section class="week-board" aria-label="Week calendar">
    <p id="week-keyboard-help" class="sr-only">
      Use left and right arrows to move between days, up and down arrows to
      choose a time, then Enter to create an event.
    </p>

    <div class="week-header">
      <div class="week-header-gutter" aria-hidden="true" />
      <button
        v-for="column in columns"
        :key="column.dayKey"
        type="button"
        class="week-day-heading"
        :class="{ 'is-today': column.dayKey === todayDayKey }"
        :aria-label="`Show ${column.dateLabel}`"
        @click="emit('show-day', column.dayKey)"
      >
        <span>{{ column.weekday }}</span>
        <strong>{{ column.dayNumber }}</strong>
      </button>
    </div>

    <div class="week-all-day" role="group" aria-label="All-day events">
      <div class="week-all-day-label">All day</div>
      <div
        v-for="column in columns"
        :key="column.dayKey"
        class="week-all-day-cell"
        role="group"
        :aria-label="`${column.dateLabel} all-day events`"
      >
        <button
          type="button"
          class="week-all-day-create"
          :aria-label="`Create an all-day event on ${column.dateLabel}`"
          @click.stop="selectAllDaySlot(column.dayKey, $event)"
        />
        <button
          v-for="event in allDayEventsFor(column.dayKey).slice(0, maxAllDayPerColumn)"
          :key="event.id"
          type="button"
          class="week-all-day-event"
          :class="{
            'is-active': event.id === selectedEventId,
            'is-highlighted': event.id === highlightedEventId,
          }"
          :style="{ '--week-event-color': colorForEvent(event) }"
          :title="`${event.title} · ${event.siteLabel}`"
          @click.stop="selectEvent(event.id, $event)"
        >
          {{ event.title }}
        </button>
        <button
          v-if="allDayEventsFor(column.dayKey).length > maxAllDayPerColumn"
          type="button"
          class="week-more"
          @click.stop="emit('show-day', column.dayKey)"
        >
          +{{ allDayEventsFor(column.dayKey).length - maxAllDayPerColumn }}
          more
        </button>
      </div>
    </div>

    <div ref="timeScroll" class="week-time-scroll">
      <div
        class="week-time-grid"
        role="group"
        aria-label="Timed events"
        aria-describedby="week-keyboard-help"
      >
        <div class="week-time-gutter" aria-hidden="true">
          <span
            v-for="hour in hourLabels"
            :key="hour.hour"
            class="week-hour-label"
            :style="{ top: `${hour.hour * WEEK_HOUR_HEIGHT}px` }"
          >
            {{ hour.label }}
          </span>
        </div>

        <div
          v-for="(column, columnIndex) in columns"
          :key="column.dayKey"
          class="week-day-column"
          :class="{
            'is-today': column.dayKey === todayDayKey,
            'is-keyboard-day': keyboardDayKey === column.dayKey,
          }"
          role="group"
          tabindex="0"
          :data-week-day="column.dayKey"
          :aria-label="`${column.dateLabel}. Press Enter to create at ${Math.floor(keyboardMinutes / 60)}:${String(keyboardMinutes % 60).padStart(2, '0')}.`"
          @focus="keyboardDayKey = column.dayKey"
          @keydown="handleColumnKeydown(column.dayKey, columnIndex, $event)"
          @click.self.stop="selectTimedSlot(column.dayKey, $event)"
        >
          <span
            v-if="keyboardDayKey === column.dayKey"
            class="week-keyboard-marker"
            :style="{ top: `${(keyboardMinutes / 60) * WEEK_HOUR_HEIGHT}px` }"
            aria-hidden="true"
          />

          <span
            v-if="column.dayKey === todayDayKey"
            class="week-now-marker"
            :style="currentMarkerStyle()"
            aria-label="Current time"
          />

          <button
            v-for="item in timedEventsFor(column.dayKey)"
            :key="item.event.id"
            type="button"
            class="week-timed-event"
            :class="{
              'is-active': item.event.id === selectedEventId,
              'is-highlighted': item.event.id === highlightedEventId,
            }"
            :style="eventStyle(item)"
            :aria-label="`${item.event.title}, ${eventTimeLabel(item.event)}, ${item.event.siteLabel}`"
            :title="`${item.event.title} · ${item.event.siteLabel}`"
            @click.stop="selectEvent(item.event.id, $event)"
          >
            <strong>{{ item.event.title }}</strong>
            <span>{{ eventTimeLabel(item.event) }}</span>
            <small v-if="item.event.summary">{{ item.event.summary }}</small>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.week-board {
  --week-gutter: 58px;
  position: relative;
  min-width: 780px;
  overflow: hidden;
  border: 1px solid var(--cal-grid, var(--ui-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--cal-surface, var(--ui-surface));
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

.week-header,
.week-all-day,
.week-time-grid {
  display: grid;
  grid-template-columns: var(--week-gutter) repeat(7, minmax(0, 1fr));
}

.week-header {
  min-height: 64px;
  border-bottom: 1px solid var(--cal-grid, var(--ui-border));
  background: var(--cal-subtle, var(--ui-surface-muted));
}

.week-header-gutter,
.week-all-day-label,
.week-time-gutter {
  border-right: 1px solid var(--cal-grid, var(--ui-border));
}

.week-day-heading {
  display: flex;
  min-width: 0;
  min-height: 64px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px;
  border: 0;
  border-right: 1px solid var(--cal-grid, var(--ui-border));
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  cursor: pointer;
}

.week-day-heading:last-child {
  border-right: 0;
}

.week-day-heading span {
  color: var(--cal-muted, var(--ui-text-muted));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.week-day-heading strong {
  display: inline-grid;
  min-width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 999px;
  font-size: 17px;
}

.week-day-heading:hover {
  background: var(--cal-hover, var(--ui-surface-muted));
}

.week-day-heading.is-today strong {
  background: var(--cal-accent, var(--ui-accent));
  color: #0d1117;
}

.week-all-day {
  min-height: 42px;
  border-bottom: 1px solid var(--cal-grid, var(--ui-border));
}

.week-all-day-label {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 10px 8px 6px 4px;
  color: var(--cal-muted, var(--ui-text-muted));
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.week-all-day-cell {
  position: relative;
  min-width: 0;
  min-height: 42px;
  padding: 4px 3px;
  border-right: 1px solid var(--cal-grid, var(--ui-border));
  cursor: pointer;
}

.week-all-day-cell:last-child {
  border-right: 0;
}

.week-all-day-create {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  min-height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.week-all-day-event,
.week-more {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  min-height: 24px;
  overflow: hidden;
  padding: 3px 5px;
  border: 0;
  border-left: 3px solid var(--week-event-color);
  border-radius: 4px;
  background: color-mix(
    in oklab,
    var(--week-event-color) 18%,
    var(--ui-surface)
  );
  color: var(--ui-text);
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.week-all-day-event + .week-all-day-event {
  margin-top: 2px;
}

.week-more {
  border-left: 0;
  background: transparent;
  color: var(--ui-text-muted);
}

.week-time-scroll {
  height: min(680px, calc(100vh - 260px));
  min-height: 460px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.week-time-grid {
  position: relative;
  height: 1536px;
  min-height: 1536px;
}

.week-time-gutter,
.week-day-column {
  position: relative;
  height: 1536px;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 63px,
    var(--cal-grid, var(--ui-border)) 63px,
    var(--cal-grid, var(--ui-border)) 64px
  );
}

.week-time-gutter {
  background-color: var(--cal-subtle, var(--ui-surface-muted));
}

.week-hour-label {
  position: absolute;
  right: 8px;
  z-index: 1;
  translate: 0 -50%;
  color: var(--cal-muted, var(--ui-text-muted));
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.week-hour-label:first-child {
  translate: 0 2px;
}

.week-day-column {
  min-width: 0;
  border-right: 1px solid var(--cal-grid, var(--ui-border));
  background-color: color-mix(
    in oklab,
    var(--ui-surface-muted) 38%,
    var(--ui-surface)
  );
  cursor: crosshair;
}

.week-day-column::before {
  position: absolute;
  inset: calc(8 * 64px) 0 calc(6 * 64px);
  background: var(--ui-surface);
  content: "";
}

.week-day-column:last-child {
  border-right: 0;
}

.week-day-column.is-today {
  background-color: color-mix(
    in oklab,
    var(--cal-accent, var(--ui-accent)) 7%,
    var(--ui-surface)
  );
}

.week-day-column:focus-visible,
.week-day-heading:focus-visible,
.week-timed-event:focus-visible,
.week-all-day-event:focus-visible,
.week-more:focus-visible {
  z-index: 4;
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.week-all-day-create:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.week-keyboard-marker,
.week-now-marker {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 2;
  height: 2px;
  pointer-events: none;
}

.week-keyboard-marker {
  border-top: 2px dashed var(--ui-accent);
}

.week-now-marker {
  background: #e4574f;
}

.week-now-marker::before {
  position: absolute;
  top: -4px;
  left: -4px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #e4574f;
  content: "";
}

.week-timed-event {
  position: absolute;
  z-index: 3;
  display: flex;
  min-height: 24px;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  overflow: hidden;
  padding: 4px 5px;
  border: 0;
  border-left: 3px solid var(--week-event-color);
  border-radius: 5px;
  background: color-mix(
    in oklab,
    var(--week-event-color) 20%,
    var(--ui-surface)
  );
  color: var(--ui-text);
  font: inherit;
  font-size: 10px;
  line-height: 1.15;
  text-align: left;
  cursor: pointer;
}

.week-timed-event:hover {
  z-index: 4;
  filter: brightness(1.03);
}

.week-timed-event strong,
.week-timed-event span,
.week-timed-event small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.week-timed-event strong {
  font-size: 11px;
}

.week-timed-event span {
  font-variant-numeric: tabular-nums;
}

.week-timed-event small {
  color: var(--ui-text-muted);
  font-size: 9px;
}

.week-timed-event.is-active,
.week-all-day-event.is-active {
  box-shadow: inset 0 0 0 1px var(--ui-text);
}

.week-timed-event.is-highlighted,
.week-all-day-event.is-highlighted {
  animation: week-event-highlight 1.6s ease-out;
}

@keyframes week-event-highlight {
  0%,
  35% {
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--ui-accent) 55%, transparent);
  }
  100% {
    box-shadow: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .week-timed-event.is-highlighted,
  .week-all-day-event.is-highlighted {
    animation: none;
    box-shadow: inset 0 0 0 2px var(--ui-accent);
  }
}
</style>
