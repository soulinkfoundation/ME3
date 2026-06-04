<script setup lang="ts">
import Button from "../Button.vue";
import type { ContentItem } from "../../stores/content";
import { socialPlatformLabel } from "../../utils/social-compose";

const props = defineProps<{
  title: string;
  items: ContentItem[];
  mode: "bank" | "posted" | "queue";
  busyItemId?: string | null;
  reordering?: boolean;
}>();

const emit = defineEmits<{
  (event: "edit", item: ContentItem): void;
  (event: "publish", item: ContentItem): void;
  (event: "queue", item: ContentItem): void;
  (event: "unqueue", item: ContentItem): void;
  (event: "reorder", itemIds: string[]): void;
  (event: "delete", item: ContentItem): void;
}>();

function formatDate(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewText(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function canQueueItem(item: ContentItem): boolean {
  return props.mode === "bank" && item.status !== "publishing";
}

function canUnqueueItem(item: ContentItem): boolean {
  return props.mode === "queue" && item.status !== "publishing";
}

function canMoveQueueItem(item: ContentItem): boolean {
  return props.mode === "queue" && (item.status === "queued" || item.status === "scheduled");
}

function canPublishItem(item: ContentItem): boolean {
  return props.mode !== "posted" && item.status !== "publishing";
}

function statusLabel(item: ContentItem): string | null {
  if (props.mode !== "queue") return null;
  if (item.status === "publishing") return "Publishing now";
  if (item.status === "scheduled") return "Scheduled";
  if (item.status === "queued") {
    return item.queuePosition ? `Queued #${item.queuePosition}` : "Queued";
  }
  return null;
}

function reorderQueueItem(item: ContentItem, direction: -1 | 1) {
  const queueIds = props.items.filter(canMoveQueueItem).map((entry) => entry.id);
  const currentIndex = queueIds.indexOf(item.id);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= queueIds.length) return;

  const nextQueueIds = [...queueIds];
  const [movedId] = nextQueueIds.splice(currentIndex, 1);
  if (!movedId) return;
  nextQueueIds.splice(nextIndex, 0, movedId);
  emit("reorder", nextQueueIds);
}
</script>

<template>
  <section class="content-table">
    <div class="card__head">
      <h2 class="card__title">{{ title }}</h2>
    </div>

    <div class="card__body">
      <div v-if="items.length === 0" class="table-empty">
        {{
          mode === "posted"
            ? "Published items will appear here once you send them out."
            : mode === "queue"
              ? "Your queue is empty. Move a few bank items here to line up upcoming posts."
              : "Your content bank is empty. Add the first item above."
        }}
      </div>

      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Content</th>
              <th>Platforms</th>
              <th>{{ mode === "posted" ? "Last posted" : "Updated" }}</th>
              <th>Images</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>
                <div class="content-cell">
                  <p class="content-body">{{ previewText(item.body) }}</p>
                  <small class="content-meta">
                    {{ item.siteUsername }} · {{ item.sourceType }}
                  </small>
                  <small v-if="statusLabel(item)" class="content-status">
                    {{ statusLabel(item) }}
                  </small>
                </div>
              </td>
              <td>
                <div class="platform-list">
                  <span
                    v-for="platform in item.platforms"
                    :key="platform"
                    class="platform-tag"
                  >
                    {{ socialPlatformLabel(platform) }}
                  </span>
                </div>
              </td>
              <td>
                {{ formatDate(mode === "posted" ? item.lastPostedAt : item.updatedAt) }}
              </td>
              <td>{{ item.mediaManifest.length }}</td>
              <td>
                <div class="action-row">
                  <Button
                    color="outline"
                    size="small"
                    :disabled="
                      busyItemId === item.id || reordering || item.status === 'publishing'
                    "
                    @click="emit('edit', item)"
                  >
                    Edit
                  </Button>
                  <Button
                    v-if="canQueueItem(item)"
                    color="secondary"
                    size="small"
                    :disabled="busyItemId === item.id || reordering"
                    @click="emit('queue', item)"
                  >
                    Queue
                  </Button>
                  <Button
                    v-if="canUnqueueItem(item)"
                    color="secondary"
                    size="small"
                    :disabled="busyItemId === item.id || reordering"
                    @click="emit('unqueue', item)"
                  >
                    Back to bank
                  </Button>
                  <Button
                    v-if="canMoveQueueItem(item)"
                    color="outline"
                    size="small"
                    :disabled="
                      busyItemId === item.id || reordering || item.queuePosition === 1
                    "
                    @click="reorderQueueItem(item, -1)"
                  >
                    Up
                  </Button>
                  <Button
                    v-if="canMoveQueueItem(item)"
                    color="outline"
                    size="small"
                    :disabled="
                      busyItemId === item.id ||
                      reordering ||
                      item.queuePosition ===
                        items.filter((entry) => entry.status !== 'publishing').length
                    "
                    @click="reorderQueueItem(item, 1)"
                  >
                    Down
                  </Button>
                  <Button
                    v-if="canPublishItem(item)"
                    color="primary"
                    size="small"
                    :disabled="busyItemId === item.id || reordering"
                    @click="emit('publish', item)"
                  >
                    {{ busyItemId === item.id ? "Publishing..." : "Publish now" }}
                  </Button>
                  <Button
                    color="secondary"
                    size="small"
                    :disabled="
                      busyItemId === item.id || reordering || item.status === 'publishing'
                    "
                    @click="emit('delete', item)"
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.content-table {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 12px;
  border-top: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
  font-size: 13px;
}

.table thead th {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
  border-top: 0;
}

.content-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.content-body,
.content-meta {
  margin: 0;
}

.content-meta {
  color: var(--color-text-muted);
}

.content-status {
  color: var(--color-text);
  font-weight: 600;
}

.platform-list,
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.platform-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
}

.table-empty {
  color: var(--color-text-muted);
  font-size: 14px;
}

@media (max-width: 760px) {
  .table th:nth-child(3),
  .table td:nth-child(3),
  .table th:nth-child(4),
  .table td:nth-child(4) {
    display: none;
  }
}
</style>
