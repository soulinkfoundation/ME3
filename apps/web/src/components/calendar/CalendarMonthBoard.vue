<script setup lang="ts">
import { computed } from "vue";
import type { CalendarAgendaEvent } from "./calendarAgenda";

const props = withDefaults(
  defineProps<{
    year: number;
    month: number;
    events: CalendarAgendaEvent[];
    selectedEventId?: string;
    todayDayKey: string;
    maxVisiblePerCell?: number;
  }>(),
  {
    selectedEventId: "",
    maxVisiblePerCell: 4,
  },
);

const emit = defineEmits<{
  (e: "select-event", id: string): void;
  (e: "select-day", dayKey: string): void;
}>();

const resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzOpts = resolvedTz ? { timeZone: resolvedTz } : {};

const dayKeyFmt = computed(
  () =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...tzOpts,
    }),
);

const timeFmt = computed(
  () =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...tzOpts,
    }),
);

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ACCENT_PALETTE = [
  "#7dbaf9",
  "#f28b82",
  "#fdd663",
  "#81c995",
  "#c58af9",
  "#ffad47",
  "#78d9ec",
];

function colorForEvent(ev: CalendarAgendaEvent): string {
  if (ev.color) return ev.color;
  if (ev.siteKey === "__reminders__") return "#9aa0a6";
  let h = 0;
  for (let i = 0; i < ev.siteKey.length; i += 1) {
    h = (h * 31 + ev.siteKey.charCodeAt(i)) | 0;
  }
  return ACCENT_PALETTE[Math.abs(h) % ACCENT_PALETTE.length];
}

function timeLabel(ev: CalendarAgendaEvent): string {
  if (ev.allDay) return "all day";
  const t = timeFmt.value.format(new Date(ev.startsAt));
  return t.replace(":00 ", " ").toLowerCase();
}

function eventStartKey(ev: CalendarAgendaEvent): string {
  return dayKeyFmt.value.format(new Date(ev.startsAt));
}

function eventEndKey(ev: CalendarAgendaEvent): string {
  const end = new Date(ev.endsAt);
  if (ev.allDay) {
    end.setMilliseconds(end.getMilliseconds() - 1);
  }
  return dayKeyFmt.value.format(end);
}

function isBarEvent(ev: CalendarAgendaEvent): boolean {
  return ev.allDay === true || eventStartKey(ev) !== eventEndKey(ev);
}

const eventsByDay = computed(() => {
  const map = new Map<string, CalendarAgendaEvent[]>();
  for (const ev of props.events) {
    if (isBarEvent(ev)) continue;
    const k = eventStartKey(ev);
    const list = map.get(k) ?? [];
    list.push(ev);
    map.set(k, list);
  }
  for (const [, list] of map) {
    list.sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  }
  return map;
});

type Cell = {
  dayKey: string;
  inMonth: boolean;
  dayNum: number;
};

type WeekSegment = {
  event: CalendarAgendaEvent;
  startIndex: number;
  span: number;
  row: number;
};

const weeks = computed(() => {
  const y = props.year;
  const m = props.month;
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const rowCount = Math.ceil((lead + daysInMonth) / 7);
  let cur = new Date(y, m, 1 - lead);
  const rows: Cell[][] = [];
  for (let w = 0; w < rowCount; w += 1) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i += 1) {
      const dayKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      row.push({
        dayKey,
        inMonth: cur.getMonth() === m,
        dayNum: cur.getDate(),
      });
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
    rows.push(row);
  }
  return rows;
});

function cellEvents(dayKey: string): CalendarAgendaEvent[] {
  return eventsByDay.value.get(dayKey) ?? [];
}

function lastCellIndexOnOrBefore(week: Cell[], dayKey: string): number {
  for (let i = week.length - 1; i >= 0; i -= 1) {
    if (week[i]?.dayKey <= dayKey) return i;
  }
  return -1;
}

function weekSegments(week: Cell[]): WeekSegment[] {
  const weekStart = week[0]?.dayKey;
  const weekEnd = week[6]?.dayKey;
  if (!weekStart || !weekEnd) return [];

  const segments: WeekSegment[] = [];
  const rowEnds: number[] = [];

  const candidates = props.events
    .filter(isBarEvent)
    .map((event) => ({
      event,
      startKey: eventStartKey(event),
      endKey: eventEndKey(event),
    }))
    .filter(({ startKey, endKey }) => startKey <= weekEnd && endKey >= weekStart)
    .sort((a, b) => {
      if (a.startKey !== b.startKey) return a.startKey.localeCompare(b.startKey);
      return b.endKey.localeCompare(a.endKey);
    });

  for (const item of candidates) {
    const startIndex = week.findIndex((cell) => cell.dayKey >= item.startKey);
    const endIndex = lastCellIndexOnOrBefore(week, item.endKey);
    if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) continue;

    const row = rowEnds.findIndex((end) => end < startIndex);
    const rowIndex = row >= 0 ? row : rowEnds.length;
    rowEnds[rowIndex] = endIndex;
    segments.push({
      event: item.event,
      startIndex,
      span: endIndex - startIndex + 1,
      row: rowIndex,
    });
  }

  return segments;
}
</script>

<template>
  <div class="board" role="application" aria-label="Month calendar">
    <div class="board-weekdays" role="row">
      <div
        v-for="w in weekdayLabels"
        :key="w"
        class="board-weekday"
        role="columnheader"
      >
        {{ w }}
      </div>
    </div>

    <div class="board-weeks" role="grid">
      <div
        v-for="(week, wi) in weeks"
        :key="wi"
        class="board-week"
        :style="{ '--span-rows': String(Math.max(1, weekSegments(week).length)) }"
        role="row"
      >
        <div
          v-for="cell in week"
          :key="cell.dayKey"
          class="board-cell"
          :class="{
            'board-cell--fade': !cell.inMonth,
            'board-cell--today': cell.dayKey === todayDayKey,
          }"
          role="gridcell"
          @click.self="emit('select-day', cell.dayKey)"
        >
          <button
            type="button"
            class="board-daynum"
            :class="{ 'is-today': cell.dayKey === todayDayKey }"
            @click="emit('select-day', cell.dayKey)"
          >
            {{ cell.dayNum }}
          </button>

          <div class="board-events">
            <button
              v-for="ev in cellEvents(cell.dayKey).slice(0, maxVisiblePerCell)"
              :key="ev.id"
              type="button"
              class="board-event"
              :class="{ 'is-active': ev.id === selectedEventId }"
              :title="`${ev.title} · ${ev.siteLabel}`"
              @click.stop="emit('select-event', ev.id)"
            >
              <span
                class="board-event-dot"
                :style="{ background: colorForEvent(ev) }"
                aria-hidden="true"
              />
              <span class="board-event-time">{{ timeLabel(ev) }}</span>
              <span class="board-event-title">{{ ev.title }}</span>
            </button>
            <button
              v-if="cellEvents(cell.dayKey).length > maxVisiblePerCell"
              type="button"
              class="board-more"
              @click.stop="emit('select-day', cell.dayKey)"
            >
              +{{ cellEvents(cell.dayKey).length - maxVisiblePerCell }} more
            </button>
          </div>
        </div>
        <div class="board-spans" aria-label="All-day and multi-day events">
          <button
            v-for="segment in weekSegments(week)"
            :key="`${segment.event.id}-${segment.startIndex}-${segment.span}`"
            type="button"
            class="board-span-event"
            :class="{ 'is-active': segment.event.id === selectedEventId }"
            :style="{
              gridColumn: `${segment.startIndex + 1} / span ${segment.span}`,
              gridRow: `${segment.row + 1}`,
              background: colorForEvent(segment.event),
            }"
            :title="`${segment.event.title} · ${segment.event.siteLabel}`"
            @click.stop="emit('select-event', segment.event.id)"
          >
            <span>{{ segment.event.title }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  min-height: min(760px, calc(100vh - 150px));
  border: 1px solid var(--cal-grid, var(--color-border));
  border-radius: 12px;
  overflow: hidden;
  background: var(--cal-surface, var(--color-bg));
}

.board-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0;
  border-bottom: 1px solid var(--cal-grid, var(--color-border));
  background: var(--cal-subtle, var(--color-bg-subtle));
}

.board-weekday {
  padding: 10px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  color: var(--cal-muted, var(--color-text-muted));
}

.board-weeks {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.board-week {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  flex: 1;
  min-height: 128px;
  border-bottom: 1px solid var(--cal-grid, var(--color-border));
}

.board-week:last-child {
  border-bottom: 0;
}

.board-cell {
  position: relative;
  padding: 6px 6px 8px;
  border-right: 1px solid var(--cal-grid, var(--color-border));
  text-align: left;
  vertical-align: top;
  min-width: 0;
  cursor: pointer;
  transition: background 0.12s ease;
}

.board-cell:last-child {
  border-right: 0;
}

.board-cell:hover {
  background: var(--cal-hover, color-mix(in oklab, var(--color-text) 4%, transparent));
}

.board-cell--fade .board-daynum {
  color: var(--cal-muted, var(--color-text-muted));
  opacity: 0.55;
}

.board-cell--today {
  background: var(--cal-today-bg, color-mix(in oklab, var(--color-text) 5%, transparent));
}

.board-daynum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  margin-bottom: 4px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.board-daynum:hover {
  background: var(--cal-hover, color-mix(in oklab, var(--color-text) 8%, transparent));
}

.board-daynum.is-today {
  background: var(--cal-accent, #7dbaf9);
  color: #0b111a;
}

:root[data-theme="dark"] .board-daynum.is-today {
  color: #0d1117;
}

.board-events {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
  margin-top: calc(max(1, var(--span-rows)) * 22px);
}

.board-spans {
  position: absolute;
  inset: 38px 0 auto;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-auto-rows: 20px;
  gap: 2px 0;
  padding: 0 4px;
  pointer-events: none;
}

.board-span-event {
  min-width: 0;
  height: 20px;
  margin: 0 2px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  color: #111111;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
}

.board-span-event span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-span-event:hover {
  filter: brightness(1.04);
}

.board-span-event.is-active {
  outline: 1px solid var(--color-text);
  outline-offset: 1px;
}

.board-event {
  display: flex;
  align-items: baseline;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding: 3px 5px;
  border: 0;
  border-radius: 4px;
  background: var(--cal-chip, color-mix(in oklab, var(--color-text) 6%, var(--color-bg)));
  color: var(--color-text);
  font: inherit;
  font-size: 11px;
  line-height: 1.25;
  text-align: left;
  cursor: pointer;
}

.board-event:hover {
  filter: brightness(1.06);
}

.board-event.is-active {
  outline: 1px solid var(--color-text);
  outline-offset: 0;
}

.board-event-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 999px;
}

.board-event-time {
  flex-shrink: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--cal-muted, var(--color-text-muted));
}

.board-event-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.board-more {
  padding: 2px 5px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--cal-muted, var(--color-text-muted));
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.board-more:hover {
  color: var(--color-text);
  text-decoration: underline;
}

@media (max-width: 900px) {
  .board-week {
    min-height: 106px;
  }

  .board-event-time {
    display: none;
  }
}
</style>
