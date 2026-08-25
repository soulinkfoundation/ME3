<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { LANDING_PAGES_PLUGIN_ID } from "@me3-core/plugin-landing-pages";
import {
  useSitesStore,
  type Site,
  type SitePage,
  type SiteQuota,
} from "../../stores/sites";
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
const quota = ref<SiteQuota | null>(null);
const sitesReady = ref(sites.loaded);
const quotaLoading = ref(true);

const profileSite = computed(() =>
  sites.sites.find((site) => site.site_role === "profile"),
);
const additionalSites = computed(() =>
  sites.sites.filter((site) => site.site_role === "organization"),
);
const persistentSites = computed(() => [
  ...(profileSite.value ? [profileSite.value] : []),
  ...additionalSites.value,
]);
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
const canAddSite = computed(
  () =>
    Boolean(profileSite.value) &&
    quota.value?.can_create_additional_site === true,
);
const quotaFull = computed(
  () =>
    Boolean(profileSite.value) &&
    quota.value !== null &&
    !quota.value.can_create_additional_site,
);
const quotaUnavailable = computed(
  () => Boolean(profileSite.value) && !quotaLoading.value && !quota.value,
);

const createProfileRoute = {
  path: "/create",
  query: { new: "1", siteRole: "profile", return: "/sites" },
};
const createAdditionalSiteRoute = {
  path: "/create",
  query: { new: "1", siteRole: "organization", return: "/sites" },
};
const createLandingPagePath = computed(() =>
  profileSite.value
    ? `/assistant?prompt=${encodeURIComponent(
        `Help me create a landing page for @${profileSite.value.username}. Ask what the page is for, show me the available starter designs, and then build a draft with me.`,
      )}`
    : "/create",
);

function siteRoute(site: Site): string {
  return `/sites/${encodeURIComponent(site.username)}`;
}

function statusLabel(published: boolean): string {
  return published ? "Published" : "Draft";
}

function resolveSiteAvatar(
  value: string | null | undefined,
  username: string,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^(?:https?:|data:|blob:|\/preview\/)/i.test(trimmed)) return trimmed;

  const normalized = trimmed.replace(/^\.?\//, "").replace(/^(\.\.\/)+/, "");
  if (normalized.startsWith("files/")) {
    return `/preview/${encodeURIComponent(username)}/${normalized}`;
  }
  return trimmed;
}

function siteAvatar(site: Site): string | null {
  return resolveSiteAvatar(site.avatar, site.username);
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

async function refreshQuota(): Promise<void> {
  quota.value = await sites.getSiteQuota();
}

function handlePluginsChanged() {
  void syncLandingPagesPlugin();
}

async function loadDashboardDetails(): Promise<void> {
  try {
    await Promise.all([
      refreshQuota(),
      syncLandingPagesPlugin(),
    ]);
  } finally {
    quotaLoading.value = false;
  }
}

onMounted(async () => {
  window.addEventListener("me3:plugins-changed", handlePluginsChanged);
  await sites.ensureSites();
  sitesReady.value = true;
  void loadDashboardDetails();
});

onBeforeUnmount(() => {
  window.removeEventListener("me3:plugins-changed", handlePluginsChanged);
});
</script>

<template>
  <div class="sites-page">
    <main class="sites-shell">
      <h1 class="sr-only">Sites</h1>
      <header class="sites-header">
        <Button
          v-if="canAddSite"
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          :to="createAdditionalSiteRoute"
          aria-label="Add site"
          title="Add site"
        >
          <UiIcon name="Plus" :size="20" aria-hidden="true" />
        </Button>
      </header>

      <p
        v-if="visibleSitesError"
        class="sites-message sites-message--error"
        role="alert"
      >
        {{ visibleSitesError }}
      </p>

      <section
        v-if="sitesReady && !visibleSitesError && !profileSite"
        class="profile-callout"
        aria-labelledby="profile-callout-title"
      >
        <div class="profile-callout__icon" aria-hidden="true">
          <BrandLogo alt="" />
        </div>
        <div>
          <h2 id="profile-callout-title">Create your ME3 Profile</h2>
          <p>
            Your ME3 Profile is your home on ME3 and unlocks creation of more
            sites.
          </p>
        </div>
        <Button color="primary" shape="soft" size="large" :to="createProfileRoute">
          Create ME3 Profile
        </Button>
      </section>

      <p v-if="quotaFull" class="sites-message" role="status">
        You have used all {{ quota?.additional_sites.limit }} additional site
        slots on your current plan.
      </p>
      <p v-else-if="quotaUnavailable" class="sites-message" role="status">
        Site availability could not be loaded. Refresh before creating another
        site.
      </p>

      <section
        v-if="sitesReady && persistentSites.length"
        class="sites-grid"
        aria-label="Your sites"
      >
        <RouterLink
          v-for="ownedSite in persistentSites"
          :key="ownedSite.id"
          class="site-card"
          :to="siteRoute(ownedSite)"
          :aria-label="`Open @${ownedSite.username}`"
        >
          <BrandLogo
            v-if="ownedSite.site_role === 'profile'"
            class="site-card__logo"
            alt="ME3"
          />
          <img
            v-else-if="siteAvatar(ownedSite)"
            class="site-card__avatar"
            :src="siteAvatar(ownedSite)!"
            alt=""
          />
          <span v-else class="site-card__icon" aria-hidden="true">
            <UiIcon name="BriefcaseBusiness" :size="28" />
          </span>
          <h2>@{{ ownedSite.username }}</h2>
          <span
            class="site-status"
            :class="{ 'site-status--published': ownedSite.published_at }"
          >
            {{ statusLabel(Boolean(ownedSite.published_at)) }}
          </span>
        </RouterLink>
      </section>

      <section
        v-if="landingPageCards.length"
        class="sites-section"
        aria-labelledby="landing-pages-title"
      >
        <div class="section-heading">
          <h2 id="landing-pages-title">Landing pages</h2>
          <Button color="outline" shape="soft" size="small" :to="createLandingPagePath">
            <template #icon>
              <UiIcon name="Plus" :size="16" aria-hidden="true" />
            </template>
            Create landing page
          </Button>
        </div>

        <div class="landing-grid">
          <RouterLink
            v-for="landing in landingPageCards"
            :key="landing.key"
            class="landing-card"
            :to="landing.path"
          >
            <span class="site-card__icon" aria-hidden="true">
              <UiIcon name="Sparkles" :size="22" />
            </span>
            <span>
              <strong>{{ landing.title }}</strong>
              <small>{{ landing.slug }}</small>
            </span>
            <span
              class="site-status"
              :class="{ 'site-status--published': landing.published }"
            >
              {{ statusLabel(landing.published) }}
            </span>
          </RouterLink>
        </div>
      </section>
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

.sr-only {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  margin: -1px;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.section-heading,
.landing-card {
  display: flex;
  align-items: center;
}

.sites-header {
  display: flex;
  min-height: 44px;
  justify-content: flex-end;
  margin-bottom: 28px;
}

.sites-header > :deep(.me3-btn) {
  position: fixed;
  z-index: 70;
  top: var(--workspace-topbar-padding-block);
  right: var(--app-shell-mobile-nav-inset-inline-start);
  min-width: 44px;
  min-height: 44px;
}

.section-heading h2,
.profile-callout h2,
.site-card h2 {
  margin: 0;
  letter-spacing: -0.025em;
}

.section-heading p,
.profile-callout p {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.sites-message {
  margin: 0 0 18px;
  padding: 14px 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
  line-height: 1.5;
}

.sites-message--error {
  border-color: color-mix(in srgb, var(--ui-danger, #b42318) 45%, var(--ui-border));
  color: var(--ui-danger, #b42318);
}

.profile-callout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  margin-bottom: 28px;
  padding: 22px;
  border: 1px solid var(--ui-border-strong, var(--color-border));
  border-radius: var(--ui-radius-lg, 16px);
  background: var(--ui-surface, var(--color-bg));
  box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / 0.05));
}

.profile-callout__icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.profile-callout__icon :deep(img) {
  width: 34px;
  height: auto;
}

.profile-callout p {
  max-width: 58ch;
  margin: 5px 0 0;
  line-height: 1.5;
}

.sites-section + .sites-section,
.sites-message + .sites-section,
.sites-section + .sites-message {
  margin-top: 32px;
}

.section-heading {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.section-heading h2 {
  font-size: 1.15rem;
}

.section-heading p {
  margin: 0;
  font-size: 0.88rem;
}

.sites-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.site-card {
  position: relative;
  display: flex;
  min-height: 220px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 16px);
  background: var(--ui-surface, var(--color-bg));
  box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / 0.05));
  color: inherit;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
}

.landing-card .site-card__icon {
  width: 48px;
  height: 48px;
  margin: 0;
  border-radius: var(--ui-radius-md, 12px);
}

.site-status {
  flex: 0 0 auto;
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

.site-card__logo {
  display: block;
  width: 76px;
  height: auto;
  margin-bottom: 16px;
}

.site-card__avatar {
  display: block;
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  border-radius: var(--ui-radius-lg, 16px);
  object-fit: cover;
}

.site-card__icon {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  margin-bottom: 16px;
  border-radius: var(--ui-radius-lg, 16px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.site-card h2 {
  font-size: 1.35rem;
}

.site-card .site-status {
  margin-top: 12px;
}

.landing-grid {
  display: grid;
  gap: 8px;
}

.landing-card {
  min-height: 72px;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface, var(--color-bg));
  color: inherit;
  text-decoration: none;
}

.landing-card > span:nth-child(2) {
  display: grid;
  min-width: 0;
  flex: 1;
}

.landing-card small {
  margin-top: 3px;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.site-card:focus-visible,
.landing-card:focus-visible {
  outline: 3px solid var(--ui-accent, var(--color-accent));
  outline-offset: 3px;
}

@media (prefers-reduced-motion: no-preference) {
  .site-card,
  .landing-card {
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .site-card:hover,
  .landing-card:hover {
    border-color: var(--ui-border-strong, var(--color-border));
    box-shadow: var(--ui-shadow-md, 0 12px 24px rgb(15 23 42 / 0.08));
    transform: translateY(-2px);
  }
}

@media (max-width: 720px) {
  .sites-page {
    padding: var(--workspace-topbar-padding-block) 16px 48px;
  }

  .section-heading {
    align-items: flex-start;
  }

  .profile-callout {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .profile-callout > :deep(.me3-btn) {
    grid-column: 1 / -1;
    width: 100%;
  }

  .sites-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .section-heading {
    flex-direction: column;
  }
}
</style>
