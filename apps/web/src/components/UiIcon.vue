<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import type { IconNode } from "lucide";
import {
  UI_ICONS,
  isCoreUiIconName,
  resolveUiIconName,
  type UiIconName,
} from "../utils/icons";

let iconCatalogPromise: Promise<typeof import("../utils/iconCatalog")> | null = null;

function loadIconCatalog() {
  if (!iconCatalogPromise) {
    iconCatalogPromise = import("../utils/iconCatalog");
  }
  return iconCatalogPromise;
}

const props = withDefaults(
  defineProps<{
    name: UiIconName;
    size?: number;
    title?: string;
  }>(),
  { size: 18, title: undefined },
);

const resolvedName = computed(() => resolveUiIconName(props.name));
const catalogIconNodes = shallowRef<IconNode | null>(null);
let catalogRequestId = 0;

watch(
  resolvedName,
  async (name) => {
    const requestId = ++catalogRequestId;
    catalogIconNodes.value = null;

    if (!name || isCoreUiIconName(name)) return;

    const { getCatalogIconNode } = await loadIconCatalog();
    if (requestId === catalogRequestId) {
      catalogIconNodes.value = getCatalogIconNode(name);
    }
  },
  { immediate: true },
);

const iconNodes = computed(() => {
  const name = resolvedName.value;
  if (!name) return null;
  return isCoreUiIconName(name) ? UI_ICONS[name] : catalogIconNodes.value;
});
</script>

<template>
  <svg
    v-if="iconNodes"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    role="img"
    :aria-hidden="title ? undefined : 'true'"
  >
    <title v-if="title">{{ title }}</title>
    <component
      v-for="(node, i) in iconNodes"
      :key="i"
      :is="node[0]"
      v-bind="node[1]"
    />
  </svg>
</template>
