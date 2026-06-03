<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { api } from "../api";
import DatePickerPopover from "../components/calendar/DatePickerPopover.vue";
import TiptapEditor from "../components/TiptapEditor.vue";
import UiIcon from "../components/UiIcon.vue";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.journal",
    title: "Journal | ME3",
    description: "Private ME3 Journal workspace.",
    robots: "noindex,follow",
  },
});

type JournalEntry = {
  id: string;
  date: string;
  title: string | null;
  body: string;
  bodyFormat: "plain_text" | "markdown" | "html";
  createdAt: string;
  updatedAt: string;
};

type JournalArchiveEntry = JournalEntry & {
  preview: string;
};

const selectedDate = ref(todayKey());
const datePickerOpen = ref(false);
const datePickerMonth = ref(monthKey(selectedDate.value));
const title = ref("");
const description = ref("");
const loadedEntry = ref<JournalEntry | null>(null);
const archiveEntries = ref<JournalArchiveEntry[]>([]);
const archiveOpen = ref(false);
const loading = ref(false);
const archiveLoading = ref(false);
const error = ref("");
const saveState = ref<"idle" | "saving" | "saved" | "error">("idle");
const hydratingEntry = ref(false);
let saveTimer: number | null = null;
let currentLoadToken = 0;

const currentDateIsToday = computed(() => selectedDate.value === todayKey());
const selectedDateLabel = computed(() =>
  currentDateIsToday.value
    ? "Today"
    : formatDaySwitcherDate(selectedDate.value),
);
const saveStatusText = computed(() => {
  if (saveState.value === "saving") return "Saving";
  if (saveState.value === "saved") return "Saved";
  if (saveState.value === "error") return "Could not save";
  return "";
});
const hasLoadedEntry = computed(
  () => loadedEntry.value?.date === selectedDate.value,
);

function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayKey(): string {
  return dateToKey(new Date());
}

function normalizeLocalDateInput(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function addDays(dateKey: string, days: number): string {
  const [year, month, dayNumber] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, dayNumber + days);
  return dateToKey(date);
}

function addMonths(monthKeyValue: string, months: number): string {
  const [year, month] = monthKeyValue.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthKey(dateKey: string): string {
  const normalized = normalizeLocalDateInput(dateKey);
  if (normalized) return normalized.slice(0, 7);
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDaySwitcherDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatEntrySheetDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatArchiveDate(value: string): string {
  if (value === todayKey()) return "Today";
  return formatEntrySheetDate(value);
}

function clearSaveTimer() {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function scheduleSave() {
  if (hydratingEntry.value) return;
  if (!hasLoadedEntry.value && loading.value) return;
  clearSaveTimer();
  saveTimer = window.setTimeout(() => {
    void saveEntry();
  }, 700);
}

async function saveEntry() {
  clearSaveTimer();
  saveState.value = "saving";
  try {
    const response = await api.patch<{ entry: JournalEntry }>(
      `/journal/days/${encodeURIComponent(selectedDate.value)}`,
      {
        title: title.value.trim() || null,
        body: description.value,
        bodyFormat: "html",
      },
    );
    loadedEntry.value = response.entry;
    saveState.value = "saved";
    if (archiveOpen.value) void loadArchive();
  } catch (saveError) {
    saveState.value = "error";
    error.value =
      saveError instanceof Error
        ? saveError.message
        : "Could not save journal entry.";
  }
}

async function flushPendingSave() {
  if (!saveTimer) return;
  await saveEntry();
}

async function loadDay(date: string) {
  const token = ++currentLoadToken;
  loading.value = true;
  error.value = "";
  saveState.value = "idle";
  try {
    const response = await api.get<{ entry: JournalEntry | null }>(
      `/journal/days/${encodeURIComponent(date)}`,
    );
    if (token !== currentLoadToken) return;
    hydratingEntry.value = true;
    loadedEntry.value = response.entry;
    title.value = response.entry?.title || "";
    description.value = response.entry?.body || "";
    await nextTick();
    hydratingEntry.value = false;
    saveState.value = response.entry ? "saved" : "idle";
  } catch (loadError) {
    if (token !== currentLoadToken) return;
    error.value =
      loadError instanceof Error
        ? loadError.message
        : "Could not load journal entry.";
  } finally {
    hydratingEntry.value = false;
    if (token === currentLoadToken) loading.value = false;
  }
}

async function loadArchive() {
  archiveLoading.value = true;
  try {
    const response = await api.get<{ entries: JournalArchiveEntry[] }>(
      "/journal/archive?limit=100",
    );
    archiveEntries.value = response.entries || [];
  } catch (archiveError) {
    error.value =
      archiveError instanceof Error
        ? archiveError.message
        : "Could not load archive.";
  } finally {
    archiveLoading.value = false;
  }
}

async function setDate(date: string) {
  const normalized = normalizeLocalDateInput(date);
  if (!normalized || normalized === selectedDate.value) return;
  await flushPendingSave();
  selectedDate.value = normalized;
  datePickerMonth.value = monthKey(normalized);
  datePickerOpen.value = false;
  archiveOpen.value = false;
  await loadDay(normalized);
}

function moveDatePickerMonth(direction: number) {
  datePickerMonth.value = addMonths(datePickerMonth.value, direction);
}

function toggleDatePicker() {
  datePickerOpen.value = !datePickerOpen.value;
  datePickerMonth.value = monthKey(selectedDate.value);
}

async function toggleArchive() {
  archiveOpen.value = !archiveOpen.value;
  datePickerOpen.value = false;
  if (archiveOpen.value) {
    await flushPendingSave();
    await loadArchive();
  }
}

function handleWindowClick() {
  datePickerOpen.value = false;
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    datePickerOpen.value = false;
    archiveOpen.value = false;
  }
}

watch([title, description], scheduleSave);

onMounted(() => {
  void loadDay(selectedDate.value);
  window.addEventListener("click", handleWindowClick);
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  clearSaveTimer();
  window.removeEventListener("click", handleWindowClick);
  window.removeEventListener("keydown", handleWindowKeydown);
});
</script>

<template>
  <main class="journal">
    <header class="journal__topbar">
      <div class="journal__topbar-spacer" />
      <div class="journal__day-switcher" aria-label="Selected day" @click.stop>
        <button
          type="button"
          class="journal-icon-button"
          aria-label="Previous day"
          @click="setDate(addDays(selectedDate, -1))"
        >
          <UiIcon name="ChevronLeft" :size="18" />
        </button>
        <button
          type="button"
          class="journal__day-label"
          :aria-expanded="datePickerOpen"
          aria-haspopup="dialog"
          aria-label="Choose journal date"
          @click="toggleDatePicker"
        >
          <strong>{{ selectedDateLabel }}</strong>
        </button>
        <button
          type="button"
          class="journal-icon-button"
          aria-label="Next day"
          @click="setDate(addDays(selectedDate, 1))"
        >
          <UiIcon name="ChevronRight" :size="18" />
        </button>
        <DatePickerPopover
          v-if="datePickerOpen"
          :month-key="datePickerMonth"
          :selected-date="selectedDate"
          :today-date="todayKey()"
          aria-label="Choose journal date"
          secondary-action-label="View archive"
          @move-month="moveDatePickerMonth"
          @select-date="setDate"
          @today="setDate(todayKey())"
          @secondary-action="toggleArchive"
        />
      </div>
      <button
        type="button"
        class="journal__archive-button journal-icon-button"
        :class="{ 'is-active': archiveOpen }"
        aria-label="Archive"
        :aria-pressed="archiveOpen ? 'true' : 'false'"
        @click="toggleArchive"
      >
        <UiIcon name="Archive" :size="16" />
      </button>
    </header>

    <div class="journal__workspace">
      <aside
        v-if="archiveOpen"
        class="journal__archive"
        aria-label="Journal archive"
      >
        <div class="journal__archive-head">
          <h2>Archive</h2>
          <span v-if="archiveLoading">Loading</span>
        </div>
        <button
          v-for="entry in archiveEntries"
          :key="entry.id"
          type="button"
          class="journal__archive-row"
          :class="{ 'is-active': entry.date === selectedDate }"
          @click="setDate(entry.date)"
        >
          <strong>{{ entry.title || formatArchiveDate(entry.date) }}</strong>
          <span>{{
            entry.title ? formatArchiveDate(entry.date) : entry.preview
          }}</span>
        </button>
        <p
          v-if="!archiveLoading && archiveEntries.length === 0"
          class="journal__empty"
        >
          No saved entries yet.
        </p>
      </aside>

      <section class="journal__sheet" aria-label="Journal entry">
        <p v-if="error" class="journal__message is-error">{{ error }}</p>

        <div class="journal__meta">
          <div class="journal__field journal__field--title">
            <input
              v-model="title"
              type="text"
              placeholder="Untitled note"
              maxlength="180"
              aria-label="Title"
              :disabled="loading"
            />
          </div>
          <div class="journal__field journal__field--date">
            <input
              type="text"
              :value="formatEntrySheetDate(selectedDate)"
              readonly
              aria-label="Entry date"
            />
          </div>
        </div>

        <div class="journal__editor-wrap" :class="{ 'is-loading': loading }">
          <TiptapEditor
            v-model="description"
            variant="workspace"
            placeholder="Write your note here..."
          />
        </div>

        <div class="journal__status" aria-live="polite">
          <span v-if="loading">Loading</span>
          <span v-else>{{ saveStatusText }}</span>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.journal {
  min-height: 100vh;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.journal__topbar {
  position: sticky;
  top: 0;
  z-index: 8;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 18px 32px;
  border-bottom: none;
  box-shadow: none;
  background: color-mix(
    in srgb,
    var(--ui-bg, var(--color-bg)) 92%,
    transparent
  );
  backdrop-filter: blur(14px);
}

.journal__topbar-spacer {
  min-width: 0;
}

.journal__day-switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: center;
}

.journal-icon-button,
.journal__day-label,
.journal__archive-button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text, var(--color-text));
  cursor: pointer;
  border-radius: var(--ui-radius-sm, 8px);
}

.journal-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

.journal-icon-button:focus,
.journal-icon-button:focus-visible,
.journal__day-label:focus,
.journal__day-label:focus-visible,
.journal__archive-button:focus,
.journal__archive-button:focus-visible {
  outline: none;
}

.journal__day-label {
  display: inline-flex;
  min-width: 138px;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.journal__day-label strong {
  font-weight: inherit;
}

.journal__day-label[aria-expanded="true"] {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.journal__archive-button {
  justify-self: end;
}

.journal-icon-button:hover,
.journal__day-label:hover,
.journal__archive-button:hover,
.journal__archive-button.is-active {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.journal__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 16px 24px 56px;
}

.journal__workspace:has(.journal__archive) {
  grid-template-columns: minmax(220px, 280px) minmax(0, 700px);
  align-items: stretch;
  min-height: calc(100dvh - 72px);
}

.journal__archive {
  position: sticky;
  top: 72px;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: calc(100dvh - 72px);
  overflow-y: auto;
  border-right: 1px solid var(--ui-border, var(--color-border));
  padding-right: 14px;
  box-sizing: border-box;
}

.journal__archive-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 8px 10px;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.journal__archive-head h2 {
  margin: 0;
  font-size: 0.9rem;
}

.journal__archive-head span,
.journal__empty,
.journal__status,
.journal__message {
  font-size: 0.86rem;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.journal__archive-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  border: 0;
  border-radius: var(--ui-radius-sm, 8px);
  padding: 10px 8px;
  background: transparent;
  color: var(--ui-text, var(--color-text));
  text-align: left;
  cursor: pointer;
}

.journal__archive-row:hover,
.journal__archive-row.is-active {
  background: var(--ui-surface-muted, var(--color-surface-muted));
}

.journal__archive-row strong,
.journal__archive-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal__archive-row strong {
  font-size: 0.92rem;
}

.journal__archive-row span {
  font-size: 0.82rem;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.journal__sheet {
  width: min(100%, 700px);
  margin: 0 auto;
}

.journal__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 24px;
  margin-bottom: 22px;
}

.journal__field input {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  border-bottom: 1px solid transparent;
  padding: 4px 0 8px;
  background: transparent;
  color: var(--ui-text, var(--color-text));
  font: inherit;
}

.journal__field--title input {
  font-size: clamp(1.25rem, 2.5vw, 1.5rem);
  font-weight: 600;
  line-height: 1.25;
}

.journal__field--date input {
  font-size: 1.08rem;
}

.journal__field input:focus {
  border-bottom-color: var(--ui-accent, var(--color-accent));
  outline: none;
}

.journal__editor-wrap {
  min-height: 560px;
  --tiptap-toolbar-offset: 72px;
}

.journal__editor-wrap.is-loading {
  opacity: 0.58;
  pointer-events: none;
}

.journal__editor-wrap :deep(.tiptap-editor) {
  min-height: 560px;
}

.journal__workspace:has(.journal__archive)
  .journal__editor-wrap
  :deep(.tiptap-editor--workspace .editor-toolbar) {
  width: 100%;
  margin-left: 0;
  margin-right: 0;
}

.journal__editor-wrap :deep(.editor-content-wrapper) {
  min-height: 480px;
  padding: 8px 0 16px;
  background: transparent;
}

.journal__editor-wrap :deep(.editor-content-wrapper .ProseMirror) {
  min-height: 420px;
}

.journal__status {
  min-height: 22px;
  padding-top: 12px;
  text-align: right;
}

.journal__message {
  margin: 0 0 16px;
}

.journal__message.is-error {
  color: var(--color-danger, #b42318);
}

@media (max-width: 900px) {
  .journal__topbar {
    grid-template-columns: auto 1fr auto;
    padding: 12px 14px;
  }

  .journal__topbar-spacer {
    display: none;
  }

  .journal__day-switcher {
    justify-self: start;
  }

  .journal__workspace,
  .journal__workspace:has(.journal__archive) {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px 14px 40px;
  }

  .journal__archive {
    position: static;
    max-height: 260px;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border, var(--color-border));
    padding: 0 0 14px;
  }

  .journal__meta {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .journal__field--date {
    display: none;
  }

  .journal__editor-wrap,
  .journal__editor-wrap :deep(.tiptap-editor) {
    min-height: 460px;
  }

  .journal__editor-wrap :deep(.editor-content) {
    min-height: 380px;
    padding: 18px;
  }
}

@media (max-width: 560px) {
  .journal__day-label {
    min-width: 108px;
    max-width: min(220px, calc(100vw - 180px));
    padding-inline: 6px;
    font-size: 14px;
  }

  .journal-icon-button {
    width: 32px;
    height: 32px;
  }
}
</style>
