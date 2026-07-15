<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  year: number;
  month: number;
  todayDayKey: string;
  selectedDayKey?: string | null;
}>();

const emit = defineEmits<{
  (e: "pick-day", dayKey: string): void;
}>();

const label = computed(() =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(
    new Date(props.year, props.month, 1),
  ),
);

const cells = computed(() => {
  const y = props.year;
  const m = props.month;
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  let cur = new Date(y, m, 1 - lead);
  const out: { dayKey: string; n: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    out.push({
      dayKey: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
      n: cur.getDate(),
      inMonth: cur.getMonth() === m,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
});

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

function dateLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}
</script>

<template>
  <div class="mini">
    <p class="mini-label">{{ label }}</p>
    <div class="mini-weekdays">
      <span v-for="(d, i) in weekdays" :key="i" class="mini-wd">{{ d }}</span>
    </div>
    <div class="mini-grid">
      <button
        v-for="(c, idx) in cells"
        :key="idx"
        type="button"
        class="mini-cell"
        :class="{
          'mini-cell--off': !c.inMonth,
          'mini-cell--today': c.dayKey === todayDayKey,
          'mini-cell--picked': c.dayKey === selectedDayKey,
        }"
        :aria-label="dateLabel(c.dayKey)"
        :aria-current="c.dayKey === todayDayKey ? 'date' : undefined"
        :disabled="!c.inMonth"
        @click="emit('pick-day', c.dayKey)"
      >
        {{ c.n }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mini {
  padding: 12px;
  border: 1px solid var(--cal-grid, var(--color-border));
  border-radius: 12px;
  background: var(--cal-subtle, var(--color-bg-subtle));
}

.mini-label {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

.mini-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}

.mini-wd {
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  color: var(--cal-muted, var(--color-text-muted));
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.mini-cell {
  aspect-ratio: 1;
  max-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.mini-cell:hover:not(:disabled) {
  background: var(--cal-hover, color-mix(in oklab, var(--color-text) 8%, transparent));
}

.mini-cell:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-accent));
  outline-offset: 1px;
}

.mini-cell--off {
  visibility: hidden;
  pointer-events: none;
}

.mini-cell--today:not(.mini-cell--picked) {
  box-shadow: inset 0 0 0 1px var(--cal-accent, #7dbaf9);
}

.mini-cell--picked {
  background: var(--cal-accent, #7dbaf9);
  color: #0d1117;
}
</style>
