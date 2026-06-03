<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const x = ref(0);
const y = ref(0);

function updateMouse(e: MouseEvent) {
  x.value = e.clientX;
  y.value = e.clientY;
}

onMounted(() => window.addEventListener("mousemove", updateMouse));
onUnmounted(() => window.removeEventListener("mousemove", updateMouse));

const maskPosition = computed(
  () => `${Math.round(x.value - 220)}px ${Math.round(y.value - 220)}px`,
);
</script>

<template>
  <div class="grids gridlines" />
</template>

<style scoped>
.grids {
  position: fixed;
  inset: 0;
  z-index: 0;
  will-change: mask-position;

  mask-image: radial-gradient(
    circle 144px at 144px 144px,
    black 0%,
    transparent 100%
  );
  mask-position: v-bind(maskPosition);
  mask-repeat: no-repeat;
  pointer-events: none;
}

.gridlines {
  background-image: url("/flower.png");
  background-repeat: repeat;
  background-size: 144px 144px;
  opacity: 0.2;
}
</style>
