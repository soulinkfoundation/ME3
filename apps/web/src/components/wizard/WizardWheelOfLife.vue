<script setup lang="ts">
import WheelOfLife from "../mission-control/WheelOfLife.vue";
</script>

<template>
  <div class="step-wheel-of-life">
    <h2 id="wizard-wheel-of-life-title">Wheel of Life</h2>
    <p class="step-desc">
      Rate the areas of life that matter to you. Snapshots stay private and give
      you and ME3 a shared view of where attention may be useful.
    </p>
    <WheelOfLife labelled-by="wizard-wheel-of-life-title" embedded />
  </div>
</template>

<style scoped>
.step-wheel-of-life h2 {
  font-size: 28px;
  margin-bottom: 8px;
}

.step-desc {
  color: var(--color-text-muted);
  font-size: 14px;
  margin-bottom: 24px;
}
</style>
