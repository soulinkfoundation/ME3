<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { RouterLink } from "vue-router";
import WheelOfLife from "../components/mission-control/WheelOfLife.vue";
import UiIcon from "../components/UiIcon.vue";

definePage({
  path: "/mission-control/wheel-of-life",
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.mission-control",
    title: "Wheel of Life | ME3",
    description: "ME3 Core Mission Control Wheel of Life workspace.",
    robots: "noindex,follow",
  },
});
</script>

<template>
  <main class="wheel-life-page">
    <header class="wheel-life-page__topbar">
      <RouterLink class="wheel-life-page__back" to="/mission-control">
        <UiIcon name="ArrowLeft" :size="18" aria-hidden="true" />
        <span>Mission Control</span>
      </RouterLink>
      <div class="wheel-life-page__title">Wheel of Life</div>
    </header>

    <WheelOfLife />
  </main>
</template>

<style scoped>
.wheel-life-page {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  gap: 18px;
  padding: 0 24px 40px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.wheel-life-page__topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  min-height: var(--workspace-topbar-height);
  padding: var(--workspace-topbar-padding-block) 0;
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.wheel-life-page__back {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.wheel-life-page__back:hover {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.wheel-life-page__title {
  grid-column: 2;
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

@media (max-width: 959px) {
  .wheel-life-page {
    padding: 0 14px 32px;
  }

  .wheel-life-page__topbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }

  .wheel-life-page__title {
    grid-column: 2;
  }
}

@media (max-width: 560px) {
  .wheel-life-page__back span {
    display: none;
  }
}
</style>
