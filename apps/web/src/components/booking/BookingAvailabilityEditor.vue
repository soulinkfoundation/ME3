<script setup lang="ts">
import { computed, ref } from "vue";
import UiIcon from "../UiIcon.vue";

export type BookingAvailability = Record<string, string[]>;

type TimezoneOption = {
  value: string;
  label: string;
};

const props = withDefaults(
  defineProps<{
    availability: BookingAvailability;
    bufferTime?: number;
    timezone?: string;
    showBuffer?: boolean;
    showTimezone?: boolean;
    showPresets?: boolean;
    description?: string;
    timezoneOptions?: TimezoneOption[];
  }>(),
  {
    bufferTime: 0,
    timezone: "UTC",
    showBuffer: true,
    showTimezone: true,
    showPresets: true,
    description: "",
    timezoneOptions: undefined,
  },
);

const emit = defineEmits<{
  "update:availability": [availability: BookingAvailability];
  "update:bufferTime": [bufferTime: number];
  "update:timezone": [timezone: string];
}>();

const days = [
  { key: "monday", label: "Mon", title: "Monday" },
  { key: "tuesday", label: "Tue", title: "Tuesday" },
  { key: "wednesday", label: "Wed", title: "Wednesday" },
  { key: "thursday", label: "Thu", title: "Thursday" },
  { key: "friday", label: "Fri", title: "Friday" },
  { key: "saturday", label: "Sat", title: "Saturday" },
  { key: "sunday", label: "Sun", title: "Sunday" },
] as const;

const defaultTimezoneOptions = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "UTC", label: "UTC" },
];

const resolvedTimezoneOptions = computed(
  () => props.timezoneOptions || defaultTimezoneOptions,
);

const editingDay = ref<(typeof days)[number] | null>(null);
const editingWindows = ref("");

function windowsForDay(dayKey: string) {
  return props.availability[dayKey] || [];
}

function emitAvailability(next: BookingAvailability) {
  emit("update:availability", next);
}

function setDayWindows(dayKey: string, windows: string[]) {
  emitAvailability({
    ...props.availability,
    [dayKey]: windows,
  });
}

function openDayEditor(day: (typeof days)[number]) {
  editingWindows.value = windowsForDay(day.key).join(", ");
  editingDay.value = day;
}

function saveDayWindows() {
  if (!editingDay.value) return;

  const windows = editingWindows.value
    .split(",")
    .map((window) => window.trim())
    .filter((window) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(window));

  setDayWindows(editingDay.value.key, windows);
  cancelDayEdit();
}

function cancelDayEdit() {
  editingDay.value = null;
  editingWindows.value = "";
}

function clearDayWindows(dayKey: string) {
  setDayWindows(dayKey, []);
}

function applyPreset(window: string[]) {
  emitAvailability({
    ...props.availability,
    monday: window,
    tuesday: window,
    wednesday: window,
    thursday: window,
    friday: window,
    saturday: [],
    sunday: [],
  });
}

function applyWeekdayPreset() {
  applyPreset(["09:00-17:00"]);
}

function applyMorningsPreset() {
  applyPreset(["09:00-12:00"]);
}

function clearAllAvailability() {
  emitAvailability({
    ...props.availability,
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  });
}
</script>

<template>
  <div class="booking-availability-editor">
    <div class="section-heading">
      <label class="section-label">Availability</label>
    </div>

    <p v-if="description" class="field-hint">
      {{ description }}
    </p>

    <div v-if="showPresets" class="availability-presets">
      <button type="button" class="preset-btn" @click="applyWeekdayPreset">
        Weekdays 9-5
      </button>
      <button type="button" class="preset-btn" @click="applyMorningsPreset">
        Mornings only
      </button>
      <button type="button" class="preset-btn danger" @click="clearAllAvailability">
        Clear all
      </button>
    </div>

    <div class="availability-grid">
      <div v-for="day in days" :key="day.key" class="day-row">
        <span class="day-label">{{ day.label }}</span>
        <div class="day-windows">
          <template v-if="windowsForDay(day.key).length > 0">
            <span
              v-for="(window, idx) in windowsForDay(day.key)"
              :key="idx"
              class="time-window"
            >
              {{ window }}
            </span>
          </template>
          <span v-else class="no-availability">Not available</span>
        </div>
        <div class="day-actions">
          <button type="button" class="day-action-btn" @click="openDayEditor(day)">
            Edit
          </button>
          <button
            v-if="windowsForDay(day.key).length > 0"
            type="button"
            class="day-action-btn danger"
            @click="clearDayWindows(day.key)"
          >
            Clear
          </button>
        </div>
      </div>
    </div>

    <div v-if="showBuffer || showTimezone" class="form-row">
      <div v-if="showBuffer" class="form-group">
        <label for="booking-availability-buffer">Buffer time</label>
        <select
          id="booking-availability-buffer"
          :value="bufferTime"
          @change="
            emit(
              'update:bufferTime',
              Number(($event.target as HTMLSelectElement).value),
            )
          "
        >
          <option :value="0">No buffer</option>
          <option :value="5">5 minutes</option>
          <option :value="10">10 minutes</option>
          <option :value="15">15 minutes</option>
          <option :value="30">30 minutes</option>
        </select>
      </div>
      <div v-if="showTimezone" class="form-group">
        <label for="booking-availability-timezone">Timezone</label>
        <select
          id="booking-availability-timezone"
          :value="timezone"
          @change="
            emit(
              'update:timezone',
              ($event.target as HTMLSelectElement).value,
            )
          "
        >
          <option
            v-for="tz in resolvedTimezoneOptions"
            :key="tz.value"
            :value="tz.value"
          >
            {{ tz.label }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="editingDay" class="modal-overlay" @click.self="cancelDayEdit">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit {{ editingDay.title }}</h3>
          <button class="modal-close" type="button" @click="cancelDayEdit">
            <UiIcon name="X" :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="modal-content">
          <div class="form-group">
            <label for="booking-availability-windows">Time windows</label>
            <input
              id="booking-availability-windows"
              v-model="editingWindows"
              type="text"
              placeholder="09:00-12:00, 14:00-17:00"
            />
            <p class="field-hint">
              Enter time windows separated by commas. Format: HH:MM-HH:MM
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn secondary" type="button" @click="cancelDayEdit">
            Cancel
          </button>
          <button class="btn primary" type="button" @click="saveDayWindows">
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.booking-availability-editor {
  padding: 20px;
  border-top: 1px solid var(--color-border);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-label {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 6px;
}

.field-hint {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 4px 0 10px;
}

.availability-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0;
}

.preset-btn,
.day-action-btn {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}

.preset-btn.danger,
.day-action-btn.danger {
  color: #a33;
}

.availability-grid {
  display: grid;
  gap: 10px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.form-group input[type="text"],
.form-group select {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
}

.day-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: var(--color-bg-subtle);
}

.day-label {
  font-weight: 600;
  font-size: 13px;
}

.day-windows {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.time-window {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
}

.no-availability {
  font-size: 12px;
  font-style: italic;
  color: var(--color-text-muted);
}

.day-actions {
  display: flex;
  gap: 8px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 20;
}

.modal {
  width: min(100%, 480px);
  background: var(--color-bg);
  border-radius: 14px;
  border: 1px solid var(--color-border);
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
}

.modal-content {
  padding: 0 18px 18px;
}

.modal-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text);
}

.btn {
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}

.btn.primary {
  background: var(--color-text);
  color: var(--color-bg);
  border-color: var(--color-text);
}

@media (max-width: 720px) {
  .form-row,
  .day-row {
    grid-template-columns: 1fr;
  }

  .day-actions {
    justify-content: flex-start;
  }
}
</style>
