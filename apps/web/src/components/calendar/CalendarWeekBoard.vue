<script setup lang="ts">
import { computed } from "vue";
import type { CalendarAgendaEvent } from "./calendarAgenda";

const props = withDefaults(
  defineProps<{
    weekStart: Date;
    events: CalendarAgendaEvent[];
    selectedEventId?: string;
    todayDayKey: string;
    maxVisiblePerColumn?: number;
  }>(),
  {
    selectedEventId: "",
    maxVisiblePerColumn: 12,
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

const headerFmt = computed(
  () =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...tzOpts,
    }),
);

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

const columns = computed(() => {
  const start = new Date(props.weekStart);
  start.setHours(0, 0, 0, 0);
  const out: { dayKey: string; header: string; dayNum: number }[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      dayKey,
      header: headerFmt.value.format(d),
      dayNum: d.getDate(),
    });
  }
  return out;
});

const eventsByDay = computed(() => {
  const map = new Map<string, CalendarAgendaEvent[]>();
  for (const ev of props.events) {
    const k = dayKeyFmt.value.format(new Date(ev.startsAt));
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

function cellEvents(dayKey: string): CalendarAgendaEvent[] {
  return eventsByDay.value.get(dayKey) ?? [];
}
</script>

<template>
  <div class="week-board" role="application" aria-label="Week calendar">
    <div class="week-cols" role="grid">
      <div
        v-for="col in columns"
        :key="col.dayKey"
        class="week-col"
        :class="{
          'week-col--today': col.dayKey === todayDayKey,
        }"
        role="gridcell"
        @click.self="emit('select-day', col.dayKey)"
      >
        <div class="week-col-head">
          <button
            type="button"
            class="week-daynum"
            :class="{ 'is-today': col.dayKey === todayDayKey }"
            @click="emit('select-day', col.dayKey)"
          >
            <span class="week-dow">{{ col.header.split(" ")[0] }}</span>
            <span class="week-dom">{{ col.dayNum }}</span>
          </button>
        </div>
        <div class="week-events">
          <button
            v-for="ev in cellEvents(col.dayKey).slice(0, maxVisiblePerColumn)"
            :key="ev.id"
            type="button"
            class="week-event"
            :class="{ 'is-active': ev.id === selectedEventId }"
            :title="`${ev.title} · ${ev.siteLabel}`"
            @click.stop="emit('select-event', ev.id)"
          >
            <span
              class="week-dot"
              :style="{ background: colorForEvent(ev) }"
              aria-hidden="true"
            />
            <span class="week-time">{{ timeLabel(ev) }}</span>
            <span class="week-title">{{ ev.title }}</span>
          </button>
          <button
            v-if="cellEvents(col.dayKey).length > maxVisiblePerColumn"
            type="button"
            class="week-more"
            @click.stop="emit('select-day', col.dayKey)"
          >
            +{{ cellEvents(col.dayKey).length - maxVisiblePerColumn }} more
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-board {
  border: 1px solid var(--cal-grid, var(--color-border));
  border-radius: 12px;
  overflow: hidden;
  background: var(--cal-surface, var(--color-bg));
  min-height: 420px;
}

.week-cols {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-height: 420px;
}

.week-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--cal-grid, var(--color-border));
  padding: 8px 6px 10px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.week-col:last-child {
  border-right: 0;
}

.week-col:hover {
  background: var(--cal-hover, color-mix(in oklab, var(--color-text) 4%, transparent));
}

.week-col--today {
  background: var(--cal-today-bg, color-mix(in oklab, var(--color-text) 5%, transparent));
}

.week-col-head {
  margin-bottom: 8px;
}

.week-daynum {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 6px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.week-daynum:hover {
  background: var(--cal-hover, color-mix(in oklab, var(--color-text) 8%, transparent));
}

.week-dow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cal-muted, var(--color-text-muted));
}

.week-dom {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.week-daynum.is-today .week-dom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--cal-accent, #7dbaf9);
  color: #0d1117;
}

.week-events {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
}

.week-event {
  display: flex;
  align-items: baseline;
  gap: 4px;
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: var(--cal-chip, color-mix(in oklab, var(--color-text) 6%, var(--color-bg)));
  color: var(--color-text);
  font: inherit;
  font-size: 11px;
  line-height: 1.25;
  text-align: left;
  cursor: pointer;
}

.week-event:hover {
  filter: brightness(1.06);
}

.week-event.is-active {
  outline: 1px solid var(--color-text);
}

.week-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 999px;
}

.week-time {
  flex-shrink: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--cal-muted, var(--color-text-muted));
}

.week-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.week-more {
  padding: 2px 6px;
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

@media (max-width: 900px) {
  .week-cols {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .week-col {
    border-right: 0;
    border-bottom: 1px solid var(--cal-grid, var(--color-border));
    min-height: 120px;
  }

  .week-time {
    display: none;
  }
}
</style>
