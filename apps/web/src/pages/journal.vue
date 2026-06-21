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
import Button from "../components/Button.vue";
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
const archiveMobileDetailOpen = ref(false);
const archiveLoaded = ref(false);
const loading = ref(false);
const archiveLoading = ref(false);
const archiveActionDate = ref<string | null>(null);
const deletingDate = ref("");
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
const nonEmptyArchiveEntries = computed(() =>
  archiveEntries.value.filter(entryHasContent),
);
const journalEntryDates = computed(() =>
  nonEmptyArchiveEntries.value.map((entry) => entry.date),
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

function formatArchiveDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatArchiveTitle(entry: JournalArchiveEntry): string {
  const date = formatArchiveDate(entry.date);
  const entryTitle = entry.title?.trim();
  return entryTitle ? `${date} - ${entryTitle}` : date;
}

function htmlToPlainText(value: string): string {
  if (!value) return "";
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function entryHasContent(entry: Pick<JournalArchiveEntry, "title" | "body" | "preview">): boolean {
  return Boolean(
    entry.title?.trim() ||
      entry.preview?.trim() ||
      htmlToPlainText(entry.body).length > 0,
  );
}

function previewFromEntry(entry: JournalEntry): string {
  return htmlToPlainText(entry.body).slice(0, 180);
}

function updateArchiveEntry(entry: JournalEntry) {
  const archivedEntry: JournalArchiveEntry = {
    ...entry,
    preview: previewFromEntry(entry),
  };
  archiveEntries.value = [
    archivedEntry,
    ...archiveEntries.value.filter((candidate) => candidate.date !== entry.date),
  ]
    .filter(entryHasContent)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
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
    updateArchiveEntry(response.entry);
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
    archiveEntries.value = (response.entries || []).filter(entryHasContent);
    archiveLoaded.value = true;
  } catch (archiveError) {
    error.value =
      archiveError instanceof Error
        ? archiveError.message
        : "Could not load archive.";
  } finally {
    archiveLoading.value = false;
  }
}

function closeArchiveActions() {
  archiveActionDate.value = null;
}

function toggleArchiveActions(date: string) {
  archiveActionDate.value = archiveActionDate.value === date ? null : date;
}

async function setDate(date: string) {
  const normalized = normalizeLocalDateInput(date);
  if (!normalized || normalized === selectedDate.value) return;
  await flushPendingSave();
  selectedDate.value = normalized;
  datePickerMonth.value = monthKey(normalized);
  datePickerOpen.value = false;
  await loadDay(normalized);
}

async function selectArchiveEntry(entry: JournalArchiveEntry) {
  closeArchiveActions();
  await setDate(entry.date);
  archiveMobileDetailOpen.value = true;
}

function showArchiveList() {
  closeArchiveActions();
  archiveMobileDetailOpen.value = false;
}

function clearCurrentEntryForDeletedDate(date: string) {
  if (selectedDate.value !== date) return;
  hydratingEntry.value = true;
  loadedEntry.value = null;
  title.value = "";
  description.value = "";
  saveState.value = "idle";
  void nextTick(() => {
    hydratingEntry.value = false;
  });
}

async function deleteArchiveEntry(entry: JournalArchiveEntry) {
  closeArchiveActions();
  const confirmed = window.confirm(
    `Delete "${formatArchiveTitle(entry)}"? This removes it from your journal.`,
  );
  if (!confirmed) return;

  deletingDate.value = entry.date;
  error.value = "";
  try {
    await flushPendingSave();
    await api.delete<{ ok: true }>(
      `/journal/days/${encodeURIComponent(entry.date)}`,
    );
    archiveEntries.value = archiveEntries.value.filter(
      (candidate) => candidate.date !== entry.date,
    );
    clearCurrentEntryForDeletedDate(entry.date);
    if (archiveMobileDetailOpen.value && selectedDate.value === entry.date) {
      archiveMobileDetailOpen.value = false;
    }
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error
        ? deleteError.message
        : "Could not delete journal entry.";
  } finally {
    deletingDate.value = "";
  }
}

function moveDatePickerMonth(direction: number) {
  datePickerMonth.value = addMonths(datePickerMonth.value, direction);
}

function toggleDatePicker() {
  datePickerOpen.value = !datePickerOpen.value;
  datePickerMonth.value = monthKey(selectedDate.value);
  if (datePickerOpen.value && !archiveLoaded.value) {
    void loadArchive();
  }
}

async function toggleArchive() {
  archiveOpen.value = !archiveOpen.value;
  datePickerOpen.value = false;
  archiveMobileDetailOpen.value = false;
  closeArchiveActions();
  if (archiveOpen.value) {
    await flushPendingSave();
    await loadArchive();
  }
}

function handleWindowClick() {
  datePickerOpen.value = false;
  closeArchiveActions();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (archiveActionDate.value) {
      closeArchiveActions();
      return;
    }
    datePickerOpen.value = false;
    archiveOpen.value = false;
    archiveMobileDetailOpen.value = false;
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
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          aria-label="Previous day"
          title="Previous day"
          type="button"
          @click="setDate(addDays(selectedDate, -1))"
        >
          <UiIcon name="ChevronLeft" :size="18" />
        </Button>
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
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          aria-label="Next day"
          title="Next day"
          type="button"
          @click="setDate(addDays(selectedDate, 1))"
        >
          <UiIcon name="ChevronRight" :size="18" />
        </Button>
        <DatePickerPopover
          v-if="datePickerOpen"
          :month-key="datePickerMonth"
          :selected-date="selectedDate"
          :today-date="todayKey()"
          :marked-dates="journalEntryDates"
          aria-label="Choose journal date"
          secondary-action-label="View archive"
          @move-month="moveDatePickerMonth"
          @select-date="setDate"
          @today="setDate(todayKey())"
          @secondary-action="toggleArchive"
        />
      </div>
      <Button
        color="ghost"
        shape="soft"
        size="compact"
        icon-only
        class="journal__archive-button"
        :active="archiveOpen"
        aria-label="Archive"
        :aria-pressed="archiveOpen ? 'true' : 'false'"
        title="Archive"
        type="button"
        @click="toggleArchive"
      >
        <UiIcon name="Archive" :size="16" />
      </Button>
    </header>

    <div
      class="journal__workspace"
      :class="{
        'journal__workspace--archive-list':
          archiveOpen && !archiveMobileDetailOpen,
        'journal__workspace--archive-detail':
          archiveOpen && archiveMobileDetailOpen,
      }"
    >
      <aside
        v-if="archiveOpen"
        class="journal__archive"
        aria-label="Journal archive"
      >
        <div class="journal__archive-head">
          <h2>Archive</h2>
          <span v-if="archiveLoading">Loading</span>
        </div>
        <div
          v-for="entry in nonEmptyArchiveEntries"
          :key="entry.id"
          class="journal__archive-row"
          :class="{
            'is-active': entry.date === selectedDate,
            'is-menu-open': archiveActionDate === entry.date,
          }"
        >
          <button
            type="button"
            class="journal__archive-row-main"
            :disabled="deletingDate === entry.date"
            @click="selectArchiveEntry(entry)"
          >
            <strong>{{ formatArchiveTitle(entry) }}</strong>
            <span v-if="entry.preview">{{ entry.preview }}</span>
          </button>
          <div class="journal__archive-row-actions" @click.stop>
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              class="journal__archive-menu-button"
              :aria-label="`Actions for ${formatArchiveTitle(entry)}`"
              aria-haspopup="menu"
              :aria-expanded="
                archiveActionDate === entry.date ? 'true' : 'false'
              "
              title="Note actions"
              type="button"
              :disabled="deletingDate === entry.date"
              @click="toggleArchiveActions(entry.date)"
            >
              <UiIcon name="Ellipsis" :size="16" aria-hidden="true" />
            </Button>
            <div
              v-if="archiveActionDate === entry.date"
              class="journal__archive-menu"
              role="menu"
            >
              <button
                type="button"
                class="journal__archive-menu-item is-danger"
                role="menuitem"
                :disabled="deletingDate === entry.date"
                @click="deleteArchiveEntry(entry)"
              >
                <UiIcon name="Trash2" :size="15" aria-hidden="true" />
                Delete note
              </button>
            </div>
          </div>
        </div>
        <p
          v-if="!archiveLoading && nonEmptyArchiveEntries.length === 0"
          class="journal__empty"
        >
          No saved entries yet.
        </p>
      </aside>

      <section class="journal__sheet" aria-label="Journal entry">
        <div v-if="archiveOpen" class="journal__mobile-detail-nav">
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            type="button"
            @click="showArchiveList"
          >
            <template #icon>
              <UiIcon name="ArrowLeft" :size="16" aria-hidden="true" />
            </template>
            Archive
          </Button>
        </div>

        <p v-if="error" class="journal__message is-error">{{ error }}</p>

        <div class="journal__editor-wrap" :class="{ 'is-loading': loading }">
          <TiptapEditor
            v-model="description"
            v-model:title="title"
            show-title-field
            variant="workspace"
            title-placeholder="Untitled note"
            :title-max-length="180"
            :title-disabled="loading"
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
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.journal__topbar {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 25;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  min-height: var(--workspace-topbar-height);
  padding: var(--workspace-topbar-padding-block)
    var(--workspace-topbar-padding-inline);
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

.journal__day-label {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text, var(--color-text));
  cursor: pointer;
  border-radius: var(--ui-radius-sm, 8px);
}

.journal__archive-button {
  justify-self: end;
}

.journal__day-label:focus,
.journal__day-label:focus-visible {
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

.journal__day-label:hover {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.journal__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 24px;
  flex: 1;
  min-height: 0;
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 0 24px 16px;
  box-sizing: border-box;
  min-height: calc(100dvh - var(--workspace-topbar-height));
}

.journal__workspace:has(.journal__archive) {
  grid-template-columns: minmax(220px, 280px) minmax(0, 700px);
  align-items: stretch;
}

.journal__archive {
  position: sticky;
  top: var(--workspace-topbar-height);
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: calc(100dvh - var(--workspace-topbar-height));
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
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  width: 100%;
  border: 0;
  border-radius: var(--ui-radius-sm, 8px);
  background: transparent;
  color: var(--ui-text, var(--color-text));
}

.journal__archive-row:hover,
.journal__archive-row.is-active,
.journal__archive-row.is-menu-open {
  background: var(--ui-surface-muted, var(--color-surface-muted));
}

.journal__archive-row-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  border: 0;
  padding: 10px 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.journal__archive-row-main:disabled {
  cursor: default;
  opacity: 0.65;
}

.journal__archive-row-main strong,
.journal__archive-row-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal__archive-row-main strong {
  font-size: 0.92rem;
}

.journal__archive-row-main span {
  font-size: 0.82rem;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.journal__archive-row-actions {
  position: relative;
  display: flex;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.journal__archive-row:hover .journal__archive-row-actions,
.journal__archive-row:focus-within .journal__archive-row-actions,
.journal__archive-row.is-active .journal__archive-row-actions,
.journal__archive-row.is-menu-open .journal__archive-row-actions {
  opacity: 1;
  pointer-events: auto;
}

.journal__archive-menu-button {
  min-width: 30px;
}

.journal__archive-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 4px;
  z-index: 35;
  min-width: 152px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  padding: 6px;
  background: var(--ui-surface, var(--color-surface));
  box-shadow: var(--ui-shadow-md, 0 14px 32px rgba(15, 23, 42, 0.16));
}

.journal__archive-menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: var(--ui-radius-sm, 8px);
  padding: 8px 10px;
  background: transparent;
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.journal__archive-menu-item:hover,
.journal__archive-menu-item:focus-visible {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  outline: none;
}

.journal__archive-menu-item.is-danger {
  color: var(--color-danger, #b42318);
}

.journal__archive-menu-item:disabled {
  cursor: default;
  opacity: 0.55;
}

.journal__sheet {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: min(100%, 700px);
  margin: 0 auto;
}

.journal__mobile-detail-nav {
  display: none;
  flex-shrink: 0;
}

.journal__editor-wrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  --tiptap-toolbar-offset: var(--workspace-topbar-height);
}

.journal__editor-wrap.is-loading {
  opacity: 0.58;
  pointer-events: none;
}

.journal__editor-wrap :deep(.tiptap-editor--workspace) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.journal__editor-wrap :deep(.tiptap-editor--workspace .editor-toolbar),
.journal__editor-wrap :deep(.tiptap-editor--workspace .editor-title-field) {
  flex-shrink: 0;
}

.journal__workspace:has(.journal__archive)
  .journal__editor-wrap
  :deep(.tiptap-editor--workspace .editor-toolbar) {
  width: 100%;
  margin-left: 0;
  margin-right: 0;
}

.journal__editor-wrap :deep(.tiptap-editor--workspace .editor-content-wrapper) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0 0;
  background: transparent;
}

.journal__editor-wrap :deep(.tiptap-editor--workspace .editor-content-wrapper .ProseMirror) {
  flex: 1;
  min-height: 100%;
}

.journal__status {
  flex-shrink: 0;
  min-height: 22px;
  padding-top: 12px;
  text-align: right;
}

.journal__message {
  flex-shrink: 0;
  margin: 0 0 16px;
}

.journal__message.is-error {
  color: var(--color-danger, #b42318);
}

@media (max-width: 900px) {
  .journal__topbar {
    grid-template-columns: auto 1fr auto;
    padding: var(--workspace-topbar-padding-block) 14px;
    padding-left: var(--app-shell-mobile-nav-leading-padding);
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
    gap: 0;
    padding: 0 14px 12px;
  }

  .journal__workspace:has(.journal__archive) {
    grid-template-rows: minmax(0, 1fr);
  }

  .journal__archive {
    position: static;
    min-height: calc(100dvh - var(--workspace-topbar-height));
    max-height: none;
    border-right: 0;
    border-bottom: 0;
    padding: 0 0 12px;
  }

  .journal__workspace--archive-list .journal__sheet {
    display: none;
  }

  .journal__workspace--archive-detail .journal__archive {
    display: none;
  }

  .journal__mobile-detail-nav {
    display: flex;
    padding: 0 0 12px;
  }
}

@media (hover: none) {
  .journal__archive-row-actions {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (max-width: 560px) {
  .journal__day-label {
    min-width: 108px;
    max-width: min(220px, calc(100vw - 180px));
    padding-inline: 6px;
    font-size: 14px;
  }

}
</style>
