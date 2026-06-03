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
    <WheelOfLife />
  </main>
</template>

<style scoped>
.wheel-life-page {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  padding: 18px 24px 40px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

@media (max-width: 959px) {
  .wheel-life-page {
    padding: 14px 14px 32px;
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }
}
</style>
