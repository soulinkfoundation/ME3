<script setup lang="ts">
import { onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type SortingState,
} from "@tanstack/vue-table";
import UiIcon from "../../components/UiIcon.vue";
import OpsTabs from "../../components/ops/OpsTabs.vue";
import { useOpsStore, type OpsDemoSite } from "../../stores/ops";

definePage({
  meta: {
    requiresAuth: true,
    title: "Demo Sites | ME3",
    description: "Create and manage internal demo ME3 sites.",
    robots: "noindex,nofollow",
  },
});

const ops = useOpsStore();

const demoSiteUsername = ref("");
const demoSiteCreating = ref(false);
const demoSiteMessage = ref<string | null>(null);
const demoSiteCreateError = ref<string | null>(null);
const sorting = ref<SortingState>([{ id: "created_at", desc: true }]);

function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

async function loadDemoSites() {
  await ops.fetchDemoSites();
}

async function createDemoSite() {
  const username = demoSiteUsername.value.trim().toLowerCase();
  if (!username) return;

  demoSiteCreating.value = true;
  demoSiteMessage.value = null;
  demoSiteCreateError.value = null;

  try {
    const response = await ops.createDemoSite(username);
    demoSiteUsername.value = "";
    demoSiteMessage.value = `${response.site.username}.example.com is ready.`;
  } catch (error: any) {
    demoSiteCreateError.value = error?.message || "Failed to create demo site";
  } finally {
    demoSiteCreating.value = false;
  }
}

const columnHelper = createColumnHelper<OpsDemoSite>();

const columns = [
  columnHelper.accessor("username", {
    header: "Username",
    enableSorting: true,
    size: 260,
    minSize: 220,
  }),
  columnHelper.accessor((row) => (row.published_at ? "Published" : "Draft"), {
    id: "status",
    header: "Status",
    enableSorting: true,
    size: 110,
    minSize: 96,
  }),
  columnHelper.accessor("url", {
    header: "URL",
    enableSorting: false,
    size: 340,
    minSize: 260,
  }),
  columnHelper.accessor("created_at", {
    header: "Created",
    enableSorting: true,
    sortingFn: "datetime",
    size: 140,
    minSize: 120,
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    enableSorting: false,
    size: 150,
    minSize: 140,
  }),
];

const table = useVueTable({
  get data() {
    return ops.demoSites;
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
  getRowId: (row) => row.id,
});

function tableHeaderStyle(header: {
  column: {
    columnDef: { size?: number; minSize?: number; maxSize?: number };
  };
}): string | undefined {
  const def = header.column.columnDef;
  const parts: string[] = [];
  if (def.minSize != null) parts.push(`min-width: ${def.minSize}px`);
  if (def.size != null) parts.push(`width: ${def.size}px`);
  if (def.maxSize != null) parts.push(`max-width: ${def.maxSize}px`);
  return parts.length ? parts.join("; ") : undefined;
}

function headerCellClass(header: {
  column: { id: string; getCanSort: () => boolean };
}): Record<string, boolean> {
  return {
    "col-sortable": header.column.getCanSort(),
    "col-actions": header.column.id === "actions",
  };
}

onMounted(async () => {
  await loadDemoSites();
});
</script>

<template>
  <div class="ops-page">
    <main class="main">
      <div class="ops-page-intro">
        <h1 class="ops-page-heading">Customer Operations</h1>
        <p class="ops-page-lede">
          Create and manage internal demo ME3 sites without cluttering the
          customer queue.
        </p>
      </div>

      <OpsTabs />

      <section class="controls-card ops-demo-card" aria-labelledby="demo-sites-heading">
        <div class="ops-demo-card__top">
          <div class="ops-demo-card__intro">
            <h2 id="demo-sites-heading" class="ops-section-h">Demo sites</h2>
            <p class="ops-demo-card__lede">
              Create admin-owned ME3 profile sites for homepage demos, then edit
              them in-app and hand them off later via export/import.
            </p>
          </div>
          <button
            type="button"
            class="ops-icon-refresh"
            :disabled="ops.demoSitesLoading"
            aria-label="Refresh demo sites"
            title="Refresh demo sites"
            @click="loadDemoSites"
          >
            <UiIcon name="RefreshCw" :size="18" aria-hidden="true" />
          </button>
        </div>

        <div class="ops-demo-card__controls">
          <label class="ops-compact-field ops-compact-field--demo">
            <span>New username</span>
            <input
              v-model="demoSiteUsername"
              type="text"
              inputmode="text"
              autocapitalize="off"
              autocomplete="off"
              spellcheck="false"
              placeholder="demo-stylist"
              @keydown.enter.prevent="createDemoSite"
            />
          </label>
          <button
            class="ops-btn"
            type="button"
            :disabled="demoSiteCreating || !demoSiteUsername.trim()"
            @click="createDemoSite"
          >
            {{ demoSiteCreating ? "Creating…" : "Create demo site" }}
          </button>
        </div>

        <p v-if="demoSiteMessage" class="notice ops-notice">
          {{ demoSiteMessage }}
        </p>
        <p v-if="demoSiteCreateError" class="notice error ops-notice">
          {{ demoSiteCreateError }}
        </p>
        <p v-else-if="ops.demoSitesError" class="notice error ops-notice">
          {{ ops.demoSitesError }}
        </p>
        <p
          v-else-if="ops.demoSitesLoading && ops.demoSites.length === 0"
          class="notice ops-notice"
        >
          Loading demo sites…
        </p>

        <div v-if="ops.demoSites.length > 0" class="table-card">
          <table class="ledger-table ledger-table--ops">
            <thead>
              <tr>
                <th
                  v-for="header in table.getFlatHeaders()"
                  :key="header.id"
                  :style="tableHeaderStyle(header)"
                  :class="headerCellClass(header)"
                  @click="header.column.getToggleSortingHandler()?.($event)"
                >
                  {{ header.column.columnDef.header as string }}
                  <span v-if="header.column.getIsSorted()" class="sort-indicator">
                    {{ header.column.getIsSorted() === "asc" ? "↑" : "↓" }}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in table.getRowModel().rows"
                :key="row.id"
                class="ledger-row"
              >
                <td class="cell-username">
                  <strong>{{ row.original.username }}</strong>
                </td>
                <td>
                  <span class="pill quiet">
                    {{ row.original.published_at ? "Published" : "Draft" }}
                  </span>
                </td>
                <td class="cell-url">
                  <a
                    :href="row.original.url"
                    target="_blank"
                    rel="noreferrer"
                    class="plain-link"
                  >
                    {{ row.original.url }}
                  </a>
                </td>
                <td class="cell-date">
                  {{ formatDateShort(row.original.created_at) }}
                </td>
                <td class="cell-actions">
                  <div class="row-actions">
                    <RouterLink
                      :to="`/sites/${row.original.username}`"
                      class="plain-link"
                    >
                      Edit
                    </RouterLink>
                    <a
                      :href="row.original.url"
                      target="_blank"
                      rel="noreferrer"
                      class="plain-link"
                    >
                      Open
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
:global(body) {
  background: var(--color-bg);
}

.ops-page {
  min-height: 100vh;
  color: var(--color-text);
}

.main {
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 40px 40px;
}

.ops-page-intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 4px;
}

.ops-page-heading {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.ops-page-lede {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-muted);
  max-width: 720px;
}

.controls-card {
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.table-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  overflow: hidden;
}

.ops-demo-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ops-demo-card__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.ops-demo-card__intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ops-section-h {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.ops-demo-card__lede {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-text-muted);
  max-width: 60ch;
}

.ops-demo-card__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}

.ops-icon-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}

.ops-icon-refresh:hover:not(:disabled) {
  border-color: var(--color-text);
}

.ops-icon-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ops-compact-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 180px;
  min-width: 0;
  max-width: min(360px, 100%);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.ops-compact-field--demo {
  max-width: min(320px, 100%);
}

.ops-compact-field input {
  min-height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
}

.ops-btn {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: none;
  background: var(--color-text);
  color: var(--color-bg);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.ops-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.ops-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ledger-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.ledger-table--ops {
  table-layout: fixed;
}

.ledger-table thead tr {
  border-bottom: 1px solid var(--color-border);
}

.ledger-table th {
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  white-space: nowrap;
  user-select: none;
}

.ledger-table th.col-sortable {
  cursor: pointer;
}

.ledger-table th.col-sortable:hover {
  color: var(--color-text);
}

.ledger-table th.col-actions {
  text-align: right;
}

.sort-indicator {
  margin-left: 4px;
  font-size: 10px;
}

.ledger-row td {
  padding: 10px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.ledger-row:hover {
  background: var(--color-bg-subtle);
}

.cell-username {
  font-weight: 600;
}

.cell-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-date {
  white-space: nowrap;
  color: var(--color-text-muted);
}

.cell-actions {
  text-align: right;
}

.row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.pill {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--color-border);
  font-family: "Courier New", monospace;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text);
}

.pill.quiet {
  color: var(--color-text-muted);
}

.plain-link {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.notice {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-border);
  font-size: 12px;
}

.ops-notice {
  margin-top: 8px;
}

.notice.error {
  color: #e53935;
  background: rgba(229, 57, 53, 0.08);
  border: 1px solid rgba(229, 57, 53, 0.2);
}

@media (max-width: 760px) {
  .main {
    padding: 16px;
  }

  .ops-demo-card__top {
    flex-direction: column;
  }

  .ledger-table--ops {
    table-layout: auto;
  }

  .cell-url {
    white-space: normal;
  }

  .row-actions {
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>
