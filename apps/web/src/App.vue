<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { Toaster } from "vue-sonner";
import { api } from "./api";
import AgentChatLauncher from "./components/AgentChatLauncher.vue";
import AppSideNav from "./components/AppSideNav.vue";
import { useAuthStore } from "./stores/auth";

/** Set true to show the floating agent chat launcher on supported pages. */
const AGENT_LAUNCHER_UI_ENABLED = false;

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
    AGENT_LAUNCHER_UI_ENABLED &&
    auth.isAuthenticated &&
    agentChatInstalled.value &&
    route.meta.hideAppShell !== true &&
    route.meta.hideAgentLauncher !== true &&
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
}

.app-root--shelled .app-root__view {
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
}

.app-root__mobile-page-controls {
  display: flex;
  align-items: center;
  justify-content: stretch;
  min-width: 0;
  min-height: var(--app-shell-mobile-nav-height);
  padding: var(--workspace-topbar-padding-block) 8px
    var(--workspace-topbar-padding-block)
    var(--app-shell-mobile-nav-leading-padding);
  background: var(--color-bg);
  box-sizing: border-box;
}

.app-root__mobile-page-controls:empty {
  display: none;
}
</style>
