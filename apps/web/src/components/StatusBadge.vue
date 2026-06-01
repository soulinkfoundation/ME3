<script setup lang="ts">
defineProps<{
  tone?: string;
}>();
</script>

<template>
  <span class="status-badge" :class="tone">
    <slot />
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.14);
  color: var(--color-text);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-transform: capitalize;
}

.status-badge.active {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.installed {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.forwarded,
.status-badge.sent,
.status-badge.approved,
.status-badge.received {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.pending_setup,
.status-badge.setup_required,
.status-badge.pending,
.status-badge.pending_approval {
  background: rgba(255, 179, 0, 0.16);
  color: #9a6700;
}

.status-badge.coming_soon {
  background: rgba(90, 101, 116, 0.14);
  color: var(--color-text-muted);
}

.status-badge.paused,
.status-badge.disconnected,
.status-badge.rejected,
.status-badge.failed,
.status-badge.dropped {
  background: rgba(229, 57, 53, 0.14);
  color: #c62828;
}
</style>
