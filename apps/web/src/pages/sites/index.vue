<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useSitesStore, type SitePage } from "../../stores/sites";
import { LANDING_PAGES_PLUGIN_ID } from "@me3-core/plugin-landing-pages";
import { api } from "../../api";
import BrandLogo from "../../components/BrandLogo.vue";
import Button from "../../components/Button.vue";
import UiIcon from "../../components/UiIcon.vue";

definePage({
  meta: {
    requiresAuth: true,
    title: "Sites | ME3",
    description: "Manage your ME3 sites.",
    robots: "noindex,follow",
  },
});

const sites = useSitesStore();
const landingPagesEnabled = ref(false);

const profileSite = computed(() =>
  sites.sites.find((site) => (site.site_type || "profile") === "profile"),
);

const legacyLandingSites = computed(() =>
  sites.sites.filter((site) => site.site_type === "landing_page"),
);

const landingPageCards = computed(() => {
  const profileUsername = profileSite.value?.username;
  if (!profileUsername || !landingPagesEnabled.value) return [];

  const pages = sites.sitePages.map((page: SitePage) => ({
    key: `page-${page.id}`,
    title: page.title || `/${page.slug}`,
    path: `/sites/${encodeURIComponent(profileUsername)}/pages/${encodeURIComponent(page.id)}`,
    slug: `/me/${page.slug}`,
    published: Boolean(page.publishedAt),
  }));

  const migratedSlugs = new Set(sites.sitePages.map((page) => page.slug));
  const legacy = legacyLandingSites.value
    .filter((site) => !migratedSlugs.has(site.username))
    .map((site) => ({
      key: `site-${site.id}`,
      title: site.username,
      path: `/sites/${encodeURIComponent(site.username)}`,
      slug: `/${site.username}`,
      published: Boolean(site.published_at),
    }));

  return [...pages, ...legacy];
});

const visibleSitesError = computed(() => {
  const message = sites.error?.trim();
  if (!message || message.toLowerCase().includes("activate me3 landing pages")) {
    return null;
  }
  return message;
});

const createLandingPagePath = computed(() =>
  profileSite.value
    ? `/sites/${encodeURIComponent(profileSite.value.username)}/landing-pages/new`
    : "/start",
);

function statusLabel(published: boolean): string {
  return published ? "Published" : "Draft";
}

async function syncLandingPagesPlugin(): Promise<void> {
  try {
    const response = await api.get<{
      plugins: Array<{ id: string; enabled: boolean; status: string }>;
    }>("/plugins");
    landingPagesEnabled.value = response.plugins.some(
      (plugin) =>
        plugin.id === LANDING_PAGES_PLUGIN_ID &&
        plugin.enabled &&
        plugin.status === "installed",
    );
  } catch {
    landingPagesEnabled.value = false;
  }

  if (landingPagesEnabled.value && profileSite.value) {
    await sites.fetchSitePages(profileSite.value.username);
  }
}

function handlePluginsChanged() {
  void syncLandingPagesPlugin();
}

onMounted(async () => {
  await sites.fetchSites();
  await syncLandingPagesPlugin();
  window.addEventListener("me3:plugins-changed", handlePluginsChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener("me3:plugins-changed", handlePluginsChanged);
});
</script>

<template>
  <div class="sites-page">
    <main class="sites-shell">
      <header class="sites-header">
        <Button
          v-if="profileSite && landingPagesEnabled"
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          :to="createLandingPagePath"
          aria-label="Create landing page"
          title="Create landing page"
        >
          <UiIcon name="Plus" :size="20" aria-hidden="true" />
        </Button>
      </header>

      <p v-if="visibleSitesError" class="sites-message sites-message--error">
        {{ visibleSitesError }}
      </p>

      <section v-if="profileSite" class="sites-grid" aria-label="Your sites">
        <RouterLink
          class="site-card site-card--profile"
          :to="`/sites/${encodeURIComponent(profileSite.username)}`"
        >
          <BrandLogo class="site-card__logo" alt="ME3" />
          <h2>@{{ profileSite.username }}</h2>
          <span
            class="site-status"
            :class="{ 'site-status--published': profileSite.published_at }"
          >
            {{ statusLabel(Boolean(profileSite.published_at)) }}
          </span>
        </RouterLink>

        <RouterLink
          v-for="landing in landingPageCards"
          :key="landing.key"
          class="site-card site-card--landing"
          :to="landing.path"
        >
          <div class="site-card__topline">
            <span class="site-card__kind">Landing page</span>
            <span class="site-status" :class="{ 'site-status--published': landing.published }">
              {{ statusLabel(landing.published) }}
            </span>
          </div>
          <div class="site-card__icon site-card__icon--landing" aria-hidden="true">
            <UiIcon name="Sparkles" :size="22" />
          </div>
          <h2>{{ landing.title }}</h2>
          <p>{{ landing.slug }}</p>
          <span class="site-card__action">Open landing page</span>
        </RouterLink>
      </section>

      <section v-else-if="!sites.loading" class="sites-empty" aria-live="polite">
        <div class="site-card__plus" aria-hidden="true">
          <UiIcon name="Plus" :size="24" />
        </div>
        <h2>Set up your ME3 profile</h2>
        <p>Your profile site is the starting point for everything you build in ME3.</p>
        <RouterLink class="sites-button" to="/start">Create profile</RouterLink>
      </section>

      <div v-if="sites.loading" class="sites-loading" role="status">Loading sites…</div>
    </main>
  </div>
</template>

<style scoped>
.sites-page {
  min-height: 100vh;
  padding: var(--workspace-topbar-height) 24px 72px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.sites-shell {
  width: min(100%, 980px);
  margin: 0 auto;
}

.sites-header {
  display: flex;
  justify-content: flex-end;
  min-height: 34px;
  margin-bottom: 28px;
}

.sites-header > :deep(.me3-btn) {
  position: fixed;
  top: var(--workspace-topbar-padding-block);
  right: var(--app-shell-mobile-nav-inset-inline-start);
  z-index: 70;
}

.sites-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.site-card {
  position: relative;
  display: flex;
  min-height: 270px;
  flex-direction: column;
  align-items: flex-start;
  padding: 22px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 16px);
  background: var(--ui-surface, var(--color-bg));
  box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / 0.05));
  color: inherit;
  cursor: pointer;
  text-decoration: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.site-card:hover {
  border-color: var(--ui-border-strong, var(--color-border));
  box-shadow: var(--ui-shadow-md, 0 12px 24px rgb(15 23 42 / 0.08));
  transform: translateY(-2px);
}

.site-card:focus-visible,
.sites-button:focus-visible {
  outline: 3px solid var(--ui-accent, var(--color-accent));
  outline-offset: 3px;
}

.site-card--profile {
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 18px;
  border-color: var(--ui-border, var(--color-border));
  text-align: center;
}

.site-card--profile:hover {
  border-color: var(--ui-accent, var(--color-accent));
  box-shadow: var(--ui-shadow-md, 0 12px 24px rgb(15 23 42 / 0.08));
}

.site-card__topline {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.site-card__kind {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.site-status {
  padding: 4px 8px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.72rem;
  font-weight: 700;
}

.site-status--published {
  border-color: color-mix(in srgb, var(--ui-accent, #13a27d) 45%, var(--ui-border));
  background: var(--ui-accent-soft, color-mix(in srgb, var(--ui-accent, #13a27d) 10%, transparent));
  color: var(--ui-accent-strong, var(--color-accent));
}

.site-card__icon,
.site-card__plus {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.site-card__icon--landing,
.site-card__plus {
  background: var(--ui-accent-soft, color-mix(in srgb, var(--ui-accent, #13a27d) 12%, transparent));
  color: var(--ui-accent-strong, var(--color-accent));
}

.site-card__logo {
  display: block;
  width: 76px;
  height: auto;
  margin-bottom: 16px;
}

.site-card h2 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: -0.025em;
}

.site-card--profile h2 {
  font-size: 1.35rem;
}

.site-card p {
  max-width: 34ch;
  margin: 8px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  line-height: 1.5;
}

.site-card--profile .site-status {
  margin-top: 12px;
}

.site-card__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 22px;
  color: var(--ui-text, var(--color-text));
  font-size: 0.86rem;
  font-weight: 800;
}

.sites-message,
.sites-loading {
  padding: 16px;
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.sites-message--error {
  margin-bottom: 16px;
  color: var(--ui-danger, #b42318);
}

.sites-empty {
  display: grid;
  justify-items: center;
  max-width: 520px;
  margin: 72px auto 0;
  padding: 48px 24px;
  border: 1px dashed var(--ui-border-strong, var(--color-border));
  border-radius: var(--ui-radius-lg, 16px);
  text-align: center;
}

.sites-empty .site-card__plus {
  margin: 0 0 18px;
}

.sites-empty h2 {
  margin: 0;
  font-size: 1.4rem;
}

.sites-empty p {
  margin: 8px 0 20px;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.sites-button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-accent, var(--color-accent));
  color: var(--ui-accent-contrast, #fff);
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 680px) {
  .sites-page {
    padding: var(--workspace-topbar-padding-block) 16px 48px;
  }

  .sites-header {
    align-items: flex-end;
    margin-bottom: 22px;
  }

  .sites-grid {
    grid-template-columns: 1fr;
  }

  .site-card {
    min-height: 240px;
  }
}
</style>
