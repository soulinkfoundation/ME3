<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { Toaster } from "vue-sonner";
import AgentChatLauncher from "./components/AgentChatLauncher.vue";
import AppSideNav from "./components/AppSideNav.vue";
import { useCookieConsent } from "./composables/useCookieConsent";
import { syncPosthogConsent } from "./composables/usePosthog";
import { useAuthStore } from "./stores/auth";

const route = useRoute();
const auth = useAuthStore();
const { consent, initCookieConsent } = useCookieConsent();

const showAppShell = computed(
  () => auth.isAuthenticated && route.meta.requiresAuth === true,
);

const showAgentLauncher = computed(
  () => auth.isAuthenticated && !route.path.startsWith("/email"),
);

initCookieConsent();

onMounted(async () => {
  await auth.ensureInitialized();
});

watch(
  () => consent.value?.marketing ?? false,
  (marketingEnabled) => {
    syncPosthogConsent(marketingEnabled);
  },
  { immediate: true },
);
</script>

<template>
  <div class="app-root" :class="{ 'app-root--shelled': showAppShell }">
    <AppSideNav v-if="showAppShell" />
    <div class="app-root__view">
      <div
        v-if="showAppShell"
        id="app-side-nav-mobile-page-controls"
        class="app-root__mobile-page-controls"
      />
      <RouterView />
    </div>
  </div>
  <Toaster
    position="bottom-center"
    theme="system"
    :close-button="true"
    :rich-colors="false"
    :duration="5000"
  />
  <AgentChatLauncher v-if="showAgentLauncher" />
</template>

<style scoped>
.app-root {
  min-height: 100%;
  --app-shell-mobile-nav-height: 68px;
}

.app-root--shelled .app-root__view {
  min-height: 100vh;
  min-height: 100dvh;
  padding-left: 64px;
  box-sizing: border-box;
}

@media (max-width: 959px) {
  .app-root--shelled .app-root__view {
    padding-top: 0;
    padding-left: 0;
  }

  .app-root__mobile-page-controls {
    display: flex;
    align-items: center;
    justify-content: stretch;
    min-width: 0;
    min-height: var(--app-shell-mobile-nav-height);
    padding: 12px 8px 12px 56px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg);
    box-sizing: border-box;
  }

  .app-root__mobile-page-controls:empty {
    display: none;
  }
}

@media (min-width: 960px) {
  .app-root__mobile-page-controls {
    display: none;
  }
}
</style>
