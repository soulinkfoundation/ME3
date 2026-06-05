<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import ContactsPanel from "../components/ContactsPanel.vue";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Contacts | ME3",
    description: "Review and manage your ME3 contacts.",
    robots: "noindex,follow",
  },
});
</script>

<template>
  <main class="agent-page contacts-page">
    <ContactsPanel />
  </main>
</template>

<style scoped>
.contacts-page {
  min-height: 100%;
  background: var(--ui-bg, var(--color-bg));
}
</style>
