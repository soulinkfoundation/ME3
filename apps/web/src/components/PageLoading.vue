<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    compact?: boolean;
  }>(),
  {
    label: "Loading...",
    compact: false,
  },
);
</script>

<template>
  <div
    class="page-loading"
    :class="{ 'page-loading--compact': compact }"
    role="status"
    aria-live="polite"
  >
    <span class="page-loading__spinner" aria-hidden="true" />
    <span class="page-loading__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.page-loading {
  display: inline-flex;
  width: min(700px, 100%);
  min-height: 140px;
  box-sizing: border-box;
  align-items: center;
  align-self: start;
  justify-content: center;
  justify-self: center;
  gap: 10px;
  padding: 24px;
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 650;
}

.page-loading__spinner {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border: 2px solid var(--ui-border);
  border-top-color: var(--ui-accent);
  border-radius: 999px;
  animation: page-loading-spin 0.8s linear infinite;
}

.page-loading__label {
  line-height: 1.2;
}

.page-loading--compact {
  display: flex;
  width: 100%;
  min-height: 64px;
  padding: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .page-loading__spinner {
    animation: none;
  }
}

@keyframes page-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
