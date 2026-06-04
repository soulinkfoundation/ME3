<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import AccountsLedgerWorkspace from "./mission-control-projects.vue";

definePage({
  path: "/accounts",
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.accounts",
    title: "Accounts | ME3",
    description: "ME3 Accounts ledger workspace.",
    robots: "noindex,follow",
  },
});
</script>

<template>
  <AccountsLedgerWorkspace />
</template>
