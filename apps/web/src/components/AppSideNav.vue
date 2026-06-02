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
const isMobileViewport = ref(false);
const mobileNavOpen = ref(false);
const mobileMediaQuery = "(max-width: 959px)";
const navDrawerId = "app-side-nav-drawer";
const missionControlInstalled = ref(false);
const journalInstalled = ref(false);
const calendarInstalled = ref(false);
const socialPublishingInstalled = ref(false);
const pluginChangedEvent = "me3:plugins-changed";

let mobileViewportQuery: MediaQueryList | null = null;

function syncMobileViewport(event?: MediaQueryList | MediaQueryListEvent) {
  isMobileViewport.value = event?.matches ?? false;
}

function closeMobileNav() {
  mobileNavOpen.value = false;
}

function toggleMobileNav() {
  mobileNavOpen.value = !mobileNavOpen.value;
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeMobileNav();
  }
}

onMounted(async () => {
  if (sites.sites.length === 0) {
    await sites.fetchSites();
  }
  void loadInstalledPluginNav();
  mobileViewportQuery = window.matchMedia(mobileMediaQuery);
  syncMobileViewport(mobileViewportQuery);
  mobileViewportQuery.addEventListener("change", syncMobileViewport);
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener(pluginChangedEvent, loadInstalledPluginNav);
});

onBeforeUnmount(() => {
  mobileViewportQuery?.removeEventListener("change", syncMobileViewport);
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener(pluginChangedEvent, loadInstalledPluginNav);
  document.body.style.overflow = "";
});

const isCalendar = computed(() => route.path.startsWith("/calendar"));
const isMissionControl = computed(() =>
  route.path.startsWith("/mission-control"),
);
const isJournal = computed(() => route.path.startsWith("/journal"));
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
const mobileMenuLabel = computed(() =>
  mobileNavOpen.value ? "Close navigation" : "Open navigation",
);
const showMobileDrawer = computed(
  () => isMobileViewport.value && mobileNavOpen.value,
);

function rowActive(
  kind:
    | "mission-control"
    | "journal"
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
  } catch {
    missionControlInstalled.value = false;
    journalInstalled.value = false;
    calendarInstalled.value = false;
    socialPublishingInstalled.value = false;
  }
}

watch(
  () => route.fullPath,
  () => {
    closeMobileNav();
  },
);

watch(isMobileViewport, (isMobile) => {
  if (!isMobile) {
    closeMobileNav();
  }
});

watch([showMobileDrawer, isMobileViewport], ([isOpen, isMobile]) => {
  document.body.style.overflow = isOpen && isMobile ? "hidden" : "";
});
</script>

<template>
  <div class="app-side-nav-shell">
    <header class="app-side-nav-mobile-bar">
      <button
        type="button"
        class="app-side-nav-mobile-bar__button"
        :aria-label="mobileMenuLabel"
        :aria-controls="navDrawerId"
        :aria-expanded="showMobileDrawer ? 'true' : 'false'"
        @click="toggleMobileNav"
      >
        <UiIcon
          :name="showMobileDrawer ? 'X' : 'Menu'"
          :size="22"
          aria-hidden="true"
        />
      </button>

    </header>

    <button
      v-if="showMobileDrawer"
      type="button"
      class="app-side-nav__backdrop"
      aria-label="Close navigation"
      @click="closeMobileNav"
    />

    <aside
      :id="navDrawerId"
      class="app-side-nav"
      :class="{ 'app-side-nav--mobile-open': showMobileDrawer }"
      :aria-hidden="isMobileViewport && !showMobileDrawer ? 'true' : undefined"
      :inert="isMobileViewport && !showMobileDrawer"
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
        @click="closeMobileNav"
      >
        <BrandLogo class="app-side-nav__logo-img" />
      </RouterLink>

      <nav class="app-side-nav__links" aria-label="Primary">
        <RouterLink
          v-if="missionControlInstalled"
          to="/mission-control"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('mission-control') }"
          aria-label="Mission Control"
          title="Mission Control"
          @click="closeMobileNav"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🚀</span>
          <span class="sr-only">Mission Control</span>
        </RouterLink>

        <RouterLink
          v-if="calendarInstalled"
          to="/calendar"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('calendar') }"
          aria-label="Calendar"
          title="Calendar"
          @click="closeMobileNav"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🗓️</span>
          <span class="sr-only">Calendar</span>
        </RouterLink>

        <RouterLink
          v-if="journalInstalled"
          to="/journal"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('journal') }"
          aria-label="Journal"
          title="Journal"
          @click="closeMobileNav"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">📝</span>
          <span class="sr-only">Journal</span>
        </RouterLink>

        <RouterLink
          to="/email"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('email') }"
          aria-label="Email"
          title="Email"
          @click="closeMobileNav"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">📧</span>
          <span class="sr-only">Email</span>
        </RouterLink>

        <RouterLink
          :to="sitesPath"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('sites') }"
          aria-label="Site builder"
          title="Site builder"
          @click="closeMobileNav"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🌐</span>
          <span class="sr-only">Site builder</span>
        </RouterLink>

        <RouterLink
          to="/assistant"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('assistant') }"
          aria-label="Assistant"
          title="Assistant"
          @click="closeMobileNav"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">🤖</span>
          <span class="sr-only">Assistant</span>
        </RouterLink>

        <RouterLink
          v-if="socialPublishingInstalled"
          to="/social"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('social') }"
          aria-label="Social publishing"
          title="Social publishing"
          @click="closeMobileNav"
        >
          <span class="app-side-nav__emoji" aria-hidden="true">📣</span>
          <span class="sr-only">Social publishing</span>
        </RouterLink>

        <RouterLink
          to="/account"
          class="app-side-nav__row"
          :class="{ 'app-side-nav__row--active': rowActive('account') }"
          aria-label="Settings"
          title="Settings"
          @click="closeMobileNav"
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

.app-side-nav {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  width: 64px;
  height: 100vh;
  box-sizing: border-box;
  padding: 20px 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
  overflow: hidden;
}

.app-side-nav-mobile-bar,
.app-side-nav__backdrop {
  display: none;
}

.app-side-nav__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-bottom: 20px;
  text-decoration: none;
}

.app-side-nav__logo-img {
  display: block;
  height: 18px;
  width: auto;
  max-width: 100%;
}

.app-side-nav__links {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
  padding: 0 8px;
}

.app-side-nav__row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  text-align: center;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.app-side-nav__row:hover,
.app-side-nav__row:focus-visible {
  background: var(--color-bg-subtle);
  color: var(--color-accent);
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
  font-size: 21px;
  line-height: 1;
  font-family:
    "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  transition: color 0.15s ease;
}

@media (max-width: 959px) {
  .app-side-nav-mobile-bar {
    position: absolute;
    inset: 12px auto auto 8px;
    z-index: 70;
    display: block;
    width: 48px;
    height: 44px;
    padding: 0;
    pointer-events: none;
  }

  .app-side-nav-mobile-bar__button {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .app-side-nav-mobile-bar__button {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    pointer-events: auto;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .app-side-nav-mobile-bar__button:hover,
  .app-side-nav-mobile-bar__button:focus-visible {
    background: var(--color-bg-subtle);
    color: var(--color-accent);
  }

  .app-side-nav-mobile-bar__button:focus-visible {
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
    top: 0;
    z-index: 60;
    height: 100dvh;
    padding-top: 72px;
    transform: translateX(-100%);
    visibility: hidden;
    pointer-events: none;
    transition:
      transform 0.18s ease,
      visibility 0s linear 0.18s;
    box-shadow: var(--shadow-soft);
  }

  .app-side-nav--mobile-open {
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
    padding-top: 4px;
  }
}
</style>
