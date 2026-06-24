<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api";
import BrandLogo from "./BrandLogo.vue";
import UiIcon from "./UiIcon.vue";
import { useSitesStore } from "../stores/sites";

const route = useRoute();
const sites = useSitesStore();

/** ME3 profile site (single canonical site for workspace Sites). */
const profileSite = computed(() =>
  sites.sites.find((s) => (s.site_type || "profile") === "profile"),
);

const sitesPath = computed(() =>
  profileSite.value?.username
    ? `/sites/${profileSite.value.username}`
    : "/create",
);
const navDrawerOpen = ref(false);
const navDrawerId = "app-side-nav-drawer";
const missionControlInstalled = ref(false);
const journalInstalled = ref(false);
const accountsInstalled = ref(false);
const calendarInstalled = ref(false);
const socialPublishingInstalled = ref(false);
const pluginChangedEvent = "me3:plugins-changed";

function closeNavDrawer() {
  navDrawerOpen.value = false;
}

function toggleNavDrawer() {
  navDrawerOpen.value = !navDrawerOpen.value;
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeNavDrawer();
  }
}

onMounted(async () => {
  if (sites.sites.length === 0) {
    await sites.fetchSites();
  }
  void loadInstalledPluginNav();
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener(pluginChangedEvent, loadInstalledPluginNav);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener(pluginChangedEvent, loadInstalledPluginNav);
  document.body.style.overflow = "";
});

const isCalendar = computed(() => route.path.startsWith("/calendar"));
const isMissionControl = computed(() =>
  route.path.startsWith("/mission-control"),
);
const isJournal = computed(() => route.path.startsWith("/journal"));
const isAccounts = computed(() => route.path.startsWith("/accounts"));
const isEmail = computed(() => route.path.startsWith("/email"));
const isSites = computed(
  () => route.path.startsWith("/sites/") || route.path.startsWith("/create"),
);
const isAssistant = computed(() => route.path.startsWith("/assistant"));
const isSocial = computed(() => route.path.startsWith("/social"));
/** `/account` and `/account/...` only — not `/accounts` (startsWith("/account") is a false positive). */
const isAccount = computed(() => {
  const p = route.path;
  return p === "/account" || p === "/account/" || p.startsWith("/account/");
});
const navMenuLabel = computed(() =>
  navDrawerOpen.value ? "Close navigation" : "Open navigation",
);

function rowActive(
  kind:
    | "mission-control"
    | "journal"
    | "accounts"
    | "calendar"
    | "email"
    | "sites"
    | "assistant"
    | "social"
    | "account",
): boolean {
  switch (kind) {
    case "mission-control":
      return isMissionControl.value;
    case "journal":
      return isJournal.value;
    case "accounts":
      return isAccounts.value;
    case "calendar":
      return isCalendar.value;
    case "email":
      return isEmail.value;
    case "sites":
      return isSites.value;
    case "assistant":
      return isAssistant.value;
    case "social":
      return isSocial.value;
    case "account":
      return isAccount.value;
    default:
      return false;
  }
}

async function loadInstalledPluginNav() {
  try {
    const response = await api.get<{
      plugins: Array<{ id: string; status: string; enabled: boolean }>;
    }>("/plugins");
    missionControlInstalled.value = response.plugins.some(
      (plugin) =>
        plugin.id === "me3.mission-control" &&
        plugin.enabled &&
        plugin.status === "installed",
    );
    calendarInstalled.value = response.plugins.some(
      (plugin) =>
        plugin.id === "me3.calendar" &&
        plugin.enabled &&
        plugin.status === "installed",
    );
    journalInstalled.value = response.plugins.some(
      (plugin) =>
        plugin.id === "me3.journal" &&
        plugin.enabled &&
        plugin.status === "installed",
    );
    socialPublishingInstalled.value = response.plugins.some(
      (plugin) =>
        plugin.id === "me3.social-publishing" &&
        plugin.enabled &&
        plugin.status === "installed",
    );
    accountsInstalled.value = response.plugins.some(
      (plugin) =>
        plugin.id === "me3.accounts" &&
        plugin.enabled &&
        plugin.status === "installed",
    );
  } catch {
    missionControlInstalled.value = false;
    journalInstalled.value = false;
    accountsInstalled.value = false;
    calendarInstalled.value = false;
    socialPublishingInstalled.value = false;
  }
}

watch(
  () => route.fullPath,
  () => {
    closeNavDrawer();
  },
);

watch(navDrawerOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? "hidden" : "";
});
</script>

<template>
  <div class="app-side-nav-shell">
    <header class="app-side-nav-mobile-bar">
      <button
        type="button"
        class="app-side-nav-control app-side-nav-mobile-bar__button"
        :aria-label="navMenuLabel"
        :aria-controls="navDrawerId"
        :aria-expanded="navDrawerOpen ? 'true' : 'false'"
        @click="toggleNavDrawer"
      >
        <UiIcon
          :name="navDrawerOpen ? 'X' : 'Menu'"
          :size="18"
          aria-hidden="true"
        />
      </button>
    </header>

    <button
      v-if="navDrawerOpen"
      type="button"
      class="app-side-nav__backdrop"
      aria-label="Close navigation"
      @click="closeNavDrawer"
    />

    <aside
      :id="navDrawerId"
      class="app-side-nav"
      :class="{ 'app-side-nav--open': navDrawerOpen }"
      :aria-hidden="!navDrawerOpen ? 'true' : undefined"
      :inert="!navDrawerOpen"
      aria-label="App navigation"
    >
      <RouterLink
        :to="
          missionControlInstalled
            ? '/mission-control'
            : calendarInstalled
              ? '/calendar'
              : '/assistant'
        "
        class="app-side-nav__logo"
        aria-label="ME3"
        @click="closeNavDrawer"
      >
        <BrandLogo class="app-side-nav__logo-img" />
      </RouterLink>

      <nav class="app-side-nav__links" aria-label="Primary">
        <RouterLink
          to="/assistant"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('assistant') }"
          aria-label="Assistant"
          title="Assistant"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🤖</span>
          <span class="sr-only">Assistant</span>
        </RouterLink>

        <RouterLink
          v-if="missionControlInstalled"
          to="/mission-control"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('mission-control') }"
          aria-label="Mission Control"
          title="Mission Control"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🚀</span>
          <span class="sr-only">Mission Control</span>
        </RouterLink>

        <RouterLink
          v-if="journalInstalled"
          to="/journal"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('journal') }"
          aria-label="Journal"
          title="Journal"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">📖</span>
          <span class="sr-only">Journal</span>
        </RouterLink>

        <RouterLink
          v-if="calendarInstalled"
          to="/calendar"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('calendar') }"
          aria-label="Calendar"
          title="Calendar"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🗓️</span>
          <span class="sr-only">Calendar</span>
        </RouterLink>

        <RouterLink
          to="/email"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('email') }"
          aria-label="Email"
          title="Email"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">📧</span>
          <span class="sr-only">Email</span>
        </RouterLink>

        <RouterLink
          :to="sitesPath"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('sites') }"
          aria-label="Site builder"
          title="Site builder"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🌐</span>
          <span class="sr-only">Site builder</span>
        </RouterLink>

        <RouterLink
          v-if="socialPublishingInstalled"
          to="/social"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('social') }"
          aria-label="Social publishing"
          title="Social publishing"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">📣</span>
          <span class="sr-only">Social publishing</span>
        </RouterLink>

        <RouterLink
          v-if="accountsInstalled"
          to="/accounts"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('accounts') }"
          aria-label="Accounts"
          title="Accounts"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">💰</span>
          <span class="sr-only">Accounts</span>
        </RouterLink>

        <RouterLink
          to="/account"
          class="app-side-nav__row app-side-nav-control"
          :class="{ 'app-side-nav__row--active': rowActive('account') }"
          aria-label="Settings"
          title="Settings"
          @click="closeNavDrawer"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">⚙️</span>
          <span class="sr-only">Settings</span>
        </RouterLink>
      </nav>
    </aside>
  </div>
</template>

<style scoped>
.app-side-nav-shell {
  position: relative;
  z-index: 50;
}

.app-side-nav-mobile-bar {
  position: fixed;
  top: var(--workspace-topbar-padding-block);
  left: var(--app-shell-mobile-nav-inset-inline-start);
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--workspace-topbar-control-size);
  height: var(--workspace-topbar-control-size);
  padding: 0;
  pointer-events: none;
}

.app-side-nav-control {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--workspace-topbar-control-size);
  height: var(--workspace-topbar-control-size);
  min-height: var(--workspace-topbar-control-size);
  padding: 0;
  border: none;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.app-side-nav-mobile-bar__button {
  pointer-events: auto;
  background: var(--ui-surface, #ffffff);
}

.app-side-nav-control:hover,
.app-side-nav-control:focus-visible {
  background: var(--color-bg-subtle);
  color: var(--color-accent);
}

.app-side-nav-control:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.app-side-nav__backdrop {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: block;
  border: none;
  background: color-mix(in oklab, var(--color-text), transparent 68%);
  cursor: pointer;
}

.app-side-nav {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  width: min(180px, calc(100vw - 32px));
  height: 100dvh;
  box-sizing: border-box;
  padding: calc(
      var(--workspace-topbar-padding-block) +
        var(--workspace-topbar-control-size) + 8px
    )
    0 20px;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
  overflow: hidden;
  transform: translateX(-100%);
  visibility: hidden;
  pointer-events: none;
  transition:
    transform 0.18s ease,
    visibility 0s linear 0.18s;
  box-shadow: var(--shadow-soft);
}

.app-side-nav--open {
  transform: translateX(0);
  visibility: visible;
  pointer-events: auto;
  transition:
    transform 0.18s ease,
    visibility 0s linear 0s;
}

.app-side-nav__logo {
  display: none;
}

.app-side-nav__links {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 9px;
  flex: 1;
  min-height: 0;
  padding: 0 var(--app-shell-mobile-nav-inset-inline-start);
}

.app-side-nav__row {
  position: relative;
  justify-content: flex-start;
  width: 100%;
  gap: 10px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  text-align: left;
}

.app-side-nav__row .sr-only {
  position: static;
  width: auto;
  height: auto;
  padding: 0;
  margin: 0;
  overflow: visible;
  clip: auto;
  white-space: nowrap;
  border: 0;
}

.app-side-nav__row--active {
  background: var(--color-bg-subtle);
  color: var(--color-accent);
}

.app-side-nav__row:hover .app-side-nav__emoji,
.app-side-nav__row:focus-visible .app-side-nav__emoji,
.app-side-nav__row--active .app-side-nav__emoji {
  color: var(--color-accent);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.app-side-nav__emoji {
  flex-shrink: 0;
  color: var(--color-text);
  font-size: 20px;
  line-height: 1;
  font-family:
    "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  transition: color 0.15s ease;
}
</style>
