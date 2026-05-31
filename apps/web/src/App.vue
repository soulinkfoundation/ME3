<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { Toaster } from "vue-sonner";
import { api } from "./api";
import AgentChatLauncher from "./components/AgentChatLauncher.vue";
import AppSideNav from "./components/AppSideNav.vue";
import { useAuthStore } from "./stores/auth";

const route = useRoute();
const auth = useAuthStore();
const agentChatInstalled = ref(false);
const pluginChangedEvent = "me3:plugins-changed";

const showAppShell = computed(
  () =>
    auth.isAuthenticated &&
    route.meta.requiresAuth === true &&
    route.meta.hideAppShell !== true,
);

const showAgentLauncher = computed(
  () =>
    auth.isAuthenticated &&
    agentChatInstalled.value &&
    !route.path.startsWith("/email"),
);

async function loadAgentChatPluginState() {
  if (!auth.isAuthenticated) {
    agentChatInstalled.value = false;
    return;
  }

  try {
    const response = await api.get<{
      plugins: Array<{ id: string; status: string; enabled: boolean }>;
    }>("/plugins");
    agentChatInstalled.value = response.plugins.some(
      (plugin) =>
        plugin.id === "me3.agent-chat" &&
        plugin.enabled &&
        plugin.status === "installed",
    );
  } catch {
    agentChatInstalled.value = false;
  }
}

function handlePluginChanged() {
  void loadAgentChatPluginState();
}

onMounted(async () => {
  await auth.ensureInitialized();
  await loadAgentChatPluginState();
  window.addEventListener(pluginChangedEvent, handlePluginChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener(pluginChangedEvent, handlePluginChanged);
});

watch(
  () => auth.isAuthenticated,
  () => {
    void loadAgentChatPluginState();
  },
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
