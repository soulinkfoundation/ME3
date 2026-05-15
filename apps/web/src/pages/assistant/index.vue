<script setup lang="ts">
import { ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type SortingState,
} from "@tanstack/vue-table";

definePage({
  meta: {
    requiresAuth: true,
    title: "Assistant | ME3",
    description: "ME3 Core assistant jobs.",
    robots: "noindex,follow",
  },
});

type AssistantJobStatus = "active" | "paused";

type AssistantJob = {
  id: string;
  name: string;
  schedule: string;
  status: AssistantJobStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

const starterJobs: AssistantJob[] = [
  {
    id: "booking-reminders",
    name: "Booking Reminders",
    schedule: "Event-driven",
    status: "active",
    lastRunAt: null,
    nextRunAt: null,
  },
  {
    id: "daily-morning-briefing",
    name: "Daily Morning Briefing",
    schedule: "Every day at 7:00 AM",
    status: "active",
    lastRunAt: "2026-05-15T07:00:00",
    nextRunAt: "2026-05-16T07:00:00",
  },
  {
    id: "client-discovery",
    name: "Client Discovery",
    schedule: "Every week",
    status: "paused",
    lastRunAt: "2026-05-04T15:00:00",
    nextRunAt: null,
  },
  {
    id: "invoice-expense-triage",
    name: "Invoice & Expense Triage",
    schedule: "Every 6 hours",
    status: "paused",
    lastRunAt: "2026-05-06T16:00:00",
    nextRunAt: null,
  },
  {
    id: "weekly-review-digest",
    name: "Weekly Review Digest",
    schedule: "Every Monday at 8:00 AM",
    status: "paused",
    lastRunAt: "2026-03-30T09:00:00",
    nextRunAt: null,
  },
];

const jobs = ref<AssistantJob[]>(starterJobs);
const sorting = ref<SortingState>([
  { id: "status", desc: false },
  { id: "name", desc: false },
]);

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toggleJob(job: AssistantJob) {
  jobs.value = jobs.value.map((existing) =>
    existing.id === job.id
      ? {
          ...existing,
          status: existing.status === "active" ? "paused" : "active",
          nextRunAt:
            existing.status === "active"
              ? null
              : existing.id === "daily-morning-briefing"
                ? "2026-05-16T07:00:00"
                : existing.nextRunAt,
        }
      : existing,
  );
}

const columnHelper = createColumnHelper<AssistantJob>();

const columns = [
  columnHelper.accessor("name", {
    header: "Job",
    size: 320,
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("schedule", {
    header: "Schedule",
    size: 220,
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    size: 140,
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("lastRunAt", {
    header: "Last run",
    size: 180,
    sortingFn: "datetime",
  }),
  columnHelper.accessor("nextRunAt", {
    header: "Next run",
    size: 180,
    sortingFn: "datetime",
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    size: 180,
    enableSorting: false,
  }),
];

const table = useVueTable({
  get data() {
    return jobs.value;
  },
  columns,
  state: {
    get sorting() {
      return sorting.value;
    },
  },
  onSortingChange: (updater) => {
    sorting.value =
      typeof updater === "function" ? updater(sorting.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});
</script>

<template>
  <div class="agent-page">
    <Teleport to="#app-side-nav-mobile-page-controls">
      <div class="assistant-mobile-title">Assistant Jobs</div>
    </Teleport>

    <main class="agent-main">
      <section class="jobs-panel" aria-label="ME3 assistant jobs">
        <table class="jobs-table">
          <thead>
            <tr>
              <th
                v-for="header in table.getFlatHeaders()"
                :key="header.id"
                :style="
                  header.column.columnDef.size
                    ? `width: ${header.column.columnDef.size}px`
                    : ''
                "
                :class="header.column.getCanSort() ? 'col-sortable' : ''"
                @click="header.column.getToggleSortingHandler()?.($event)"
              >
                {{ header.column.columnDef.header as string }}
                <span
                  v-if="header.column.getIsSorted()"
                  class="sort-indicator"
                >
                  {{ header.column.getIsSorted() === "asc" ? "↑" : "↓" }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in table.getRowModel().rows"
              :key="row.original.id"
              class="job-row"
              :class="{ 'job-row--disabled': row.original.status === 'paused' }"
            >
              <td class="cell-job">
                <span class="job-name">
                  {{ row.original.name }}
                </span>
              </td>
              <td class="cell-schedule">
                {{ row.original.schedule }}
              </td>
              <td>
                <div class="status-cell">
                  <span
                    class="status-dot"
                    :class="
                      row.original.status === 'active'
                        ? 'status-dot--active'
                        : 'status-dot--off'
                    "
                  />
                  <span>{{
                    row.original.status === "active" ? "Active" : "Paused"
                  }}</span>
                </div>
              </td>
              <td class="cell-run">
                {{ row.original.lastRunAt ? formatDate(row.original.lastRunAt) : "Never" }}
              </td>
              <td class="cell-run">
                {{
                  row.original.nextRunAt && row.original.status === "active"
                    ? formatDate(row.original.nextRunAt)
                    : "—"
                }}
              </td>
              <td class="cell-actions">
                <div class="cell-actions__content">
                  <button
                    class="toggle-btn"
                    :class="{ 'toggle-btn--on': row.original.status === 'active' }"
                    :aria-label="
                      row.original.status === 'active'
                        ? `Pause ${row.original.name}`
                        : `Activate ${row.original.name}`
                    "
                    @click="toggleJob(row.original)"
                  >
                    <span class="toggle-track">
                      <span class="toggle-thumb" />
                    </span>
                  </button>
                  <button class="job-detail-link" type="button">
                    Details
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</template>

<style scoped>
.agent-page {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.agent-main {
  display: grid;
  gap: 14px;
  margin: 0 auto;
  padding: 32px 40px 40px;
}

.assistant-mobile-title {
  display: none;
}

.jobs-panel {
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  -webkit-overflow-scrolling: touch;
}

.jobs-table {
  width: 100%;
  border-collapse: collapse;
}

.jobs-table thead tr {
  border-bottom: 1px solid var(--color-border);
}

.jobs-table th {
  padding: 14px 16px;
  text-align: left;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  user-select: none;
}

.jobs-table td {
  padding: 18px 16px;
  border-bottom: 1px solid var(--color-border);
  font-size: 14px;
  vertical-align: middle;
}

.job-row:last-child td {
  border-bottom: none;
}

.job-row--disabled {
  opacity: 0.52;
}

.job-row:hover {
  background: var(--color-bg-subtle);
}

.col-sortable {
  cursor: pointer;
}

.col-sortable:hover {
  color: var(--color-text);
}

.sort-indicator {
  margin-left: 4px;
}

.cell-job {
  min-width: 280px;
}

.job-name {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
}

.cell-schedule,
.cell-run {
  color: var(--color-text-muted);
  font-size: 15px;
  white-space: nowrap;
}

.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 800;
}

.status-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

.status-dot--active {
  background: var(--color-text);
}

.status-dot--off {
  background: var(--color-border);
}

.cell-actions {
  width: 180px;
}

.cell-actions__content {
  display: flex;
  align-items: center;
  gap: 14px;
  white-space: nowrap;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: 0;
  background: none;
  cursor: pointer;
}

.toggle-track {
  position: relative;
  display: block;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-border);
  transition: background 0.15s ease;
}

.toggle-btn--on .toggle-track {
  background: #000;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
}

.toggle-btn--on .toggle-thumb {
  transform: translateX(18px);
}

.job-detail-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
}

.job-detail-link:hover {
  color: var(--color-text);
}

@media (max-width: 960px) {
  .agent-main {
    padding: calc(var(--app-shell-mobile-nav-height, 68px) + 20px) 20px 32px;
  }

  .assistant-mobile-title {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--color-text);
    font-size: 15px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .jobs-table {
    min-width: 960px;
  }
}
</style>
