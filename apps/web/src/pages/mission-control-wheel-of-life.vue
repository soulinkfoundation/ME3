<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import WheelOfLife from "../components/mission-control/WheelOfLife.vue";

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
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: var(--workspace-topbar-height);
  padding: var(--workspace-topbar-padding-block) 0;
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.wheel-life-page__title {
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
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }
}
</style>
