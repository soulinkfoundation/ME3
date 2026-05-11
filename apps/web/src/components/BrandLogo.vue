<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "../composables/useTheme";

withDefaults(
  defineProps<{
    alt?: string;
  }>(),
  {
    alt: "me3",
  },
);

const { isDark } = useTheme();
const logoSrc = computed(() =>
  isDark.value ? "/me3-logo-dark.png" : "/me3-logo-light.png",
);
</script>

<template>
  <img :src="logoSrc" :alt="alt" />
</template>
