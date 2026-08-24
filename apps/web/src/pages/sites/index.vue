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
import ConfirmationDialog from "../../components/ConfirmationDialog.vue";
import UiIcon from "../../components/UiIcon.vue";
import { resolvePublicSiteUrl } from "../../utils/publicSiteUrl";

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
const dashboardLoading = ref(true);
const actionBusy = ref<string | null>(null);
const actionError = ref("");
const pendingDelete = ref<Site | null>(null);
const profilePublicUrl = ref("");

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
  const message = actionError.value || sites.error?.trim();
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
  () => Boolean(profileSite.value) && !dashboardLoading.value && !quota.value,
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

function editSiteRoute(site: Site, step?: "basics" | "publish") {
  return {
    path: "/create",
    query: {
      siteId: site.id,
      site: site.username,
      return: "/sites",
      ...(step ? { step } : {}),
    },
  };
}

function statusLabel(published: boolean): string {
  return published ? "Published" : "Draft";
}

function siteKind(site: Site): string {
  return site.site_role === "profile" ? "ME3 Profile" : "Site";
}

async function syncProfilePublicUrl(): Promise<void> {
  if (!profileSite.value) {
    profilePublicUrl.value = "";
    return;
  }
  profilePublicUrl.value = await resolvePublicSiteUrl(
    profileSite.value.username,
    profileSite.value,
  );
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

async function unpublishSite(site: Site): Promise<void> {
  actionBusy.value = `unpublish:${site.username}`;
  actionError.value = "";
  try {
    const success = await sites.unpublishLandingPage(site.username);
    if (!success) {
      actionError.value = sites.error || "Failed to unpublish site";
    }
  } finally {
    actionBusy.value = null;
  }
}

function requestDelete(site: Site): void {
  pendingDelete.value = site;
}

async function confirmDelete(): Promise<void> {
  const site = pendingDelete.value;
  if (!site || site.site_role === "profile") return;

  actionBusy.value = `delete:${site.username}`;
  actionError.value = "";
  try {
    const success = await sites.deleteSite(site.username);
    if (success) {
      pendingDelete.value = null;
      await refreshQuota();
    } else {
      actionError.value = sites.error || "Failed to delete site";
    }
  } finally {
    actionBusy.value = null;
  }
}

function handlePluginsChanged() {
  void syncLandingPagesPlugin();
}

onMounted(async () => {
  try {
    await sites.fetchSites();
    await Promise.all([
      refreshQuota(),
      syncLandingPagesPlugin(),
      syncProfilePublicUrl(),
    ]);
  } finally {
    dashboardLoading.value = false;
  }
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
        <div>
          <h1>Sites</h1>
          <p>Manage your ME3 Profile and every site you build around it.</p>
        </div>
        <Button
          v-if="canAddSite"
          color="primary"
          shape="soft"
          size="large"
          :to="createAdditionalSiteRoute"
        >
          <template #icon>
            <UiIcon name="Plus" :size="18" aria-hidden="true" />
          </template>
          Add site
        </Button>
      </header>

      <p
        v-if="dashboardLoading"
        class="sites-message"
        role="status"
        aria-live="polite"
      >
        Loading your sites…
      </p>

      <p
        v-if="visibleSitesError"
        class="sites-message sites-message--error"
        role="alert"
      >
        {{ visibleSitesError }}
      </p>

      <section
        v-if="!dashboardLoading && !profileSite"
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
        v-if="!dashboardLoading && persistentSites.length"
        class="sites-section"
        aria-labelledby="your-sites-title"
      >
        <div class="section-heading">
          <h2 id="your-sites-title">Your sites</h2>
          <p v-if="profileSite && quota">
            {{ quota.remaining_additional_sites }} additional
            {{ quota.remaining_additional_sites === 1 ? "site" : "sites" }}
            available
          </p>
        </div>

        <div class="sites-grid">
          <article
            v-for="ownedSite in persistentSites"
            :key="ownedSite.id"
            class="site-card"
            :class="{ 'site-card--profile': ownedSite.site_role === 'profile' }"
          >
            <div class="site-card__topline">
              <span class="site-card__kind">{{ siteKind(ownedSite) }}</span>
              <span
                class="site-status"
                :class="{ 'site-status--published': ownedSite.published_at }"
              >
                {{ statusLabel(Boolean(ownedSite.published_at)) }}
              </span>
            </div>

            <div class="site-card__identity">
              <BrandLogo
                v-if="ownedSite.site_role === 'profile'"
                class="site-card__logo"
                alt="ME3"
              />
              <span v-else class="site-card__icon" aria-hidden="true">
                <UiIcon name="BriefcaseBusiness" :size="24" />
              </span>
              <div>
                <h3>
                  <RouterLink :to="siteRoute(ownedSite)">
                    @{{ ownedSite.username }}
                  </RouterLink>
                </h3>
                <p v-if="ownedSite.site_role === 'profile'">
                  Your primary identity and home on ME3.
                </p>
                <p v-else>
                  A focused home for a business, project, brand, community, or
                  organisation.
                </p>
              </div>
            </div>

            <div
              class="site-card__actions"
              role="group"
              :aria-label="`Actions for ${ownedSite.username}`"
            >
              <Button color="outline" shape="soft" size="small" :to="siteRoute(ownedSite)">
                Open
              </Button>
              <Button color="ghost" shape="soft" size="small" :to="editSiteRoute(ownedSite)">
                Edit
              </Button>
              <template v-if="ownedSite.site_role === 'profile'">
                <Button
                  color="ghost"
                  shape="soft"
                  size="small"
                  :to="editSiteRoute(ownedSite, 'basics')"
                >
                  Rename
                </Button>
                <Button
                  color="ghost"
                  shape="soft"
                  size="small"
                  :to="`${siteRoute(ownedSite)}#domain`"
                >
                  Domain
                </Button>
                <Button
                  v-if="ownedSite.published_at && profilePublicUrl"
                  color="ghost"
                  shape="soft"
                  size="small"
                  :href="profilePublicUrl"
                  target="_blank"
                  rel="noopener"
                >
                  View
                </Button>
              </template>
              <Button
                v-if="!ownedSite.published_at"
                color="ghost"
                shape="soft"
                size="small"
                :to="editSiteRoute(ownedSite, 'publish')"
              >
                Publish
              </Button>
              <Button
                v-else
                color="ghost"
                shape="soft"
                size="small"
                :disabled="actionBusy === `unpublish:${ownedSite.username}`"
                @click="unpublishSite(ownedSite)"
              >
                {{
                  actionBusy === `unpublish:${ownedSite.username}`
                    ? "Unpublishing…"
                    : "Unpublish"
                }}
              </Button>
              <Button
                v-if="ownedSite.site_role !== 'profile'"
                color="danger"
                shape="soft"
                size="small"
                @click="requestDelete(ownedSite)"
              >
                Delete
              </Button>
            </div>
          </article>
        </div>
      </section>

      <section
        v-if="
          !dashboardLoading &&
          profileSite &&
          !canAddSite &&
          !quotaFull &&
          !quotaUnavailable
        "
        class="sites-message"
        aria-label="Additional site availability"
      >
        <strong>
          Add another site when your plan includes an available site slot.
        </strong>
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

    <ConfirmationDialog
      :open="Boolean(pendingDelete)"
      title="Delete site?"
      :message="`Delete @${pendingDelete?.username || ''}? This action cannot be undone.`"
      confirm-label="Delete"
      :busy="
        Boolean(
          pendingDelete && actionBusy === `delete:${pendingDelete.username}`,
        )
      "
      danger
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.sites-page {
  min-height: 100vh;
  padding: calc(var(--workspace-topbar-height) + 32px) 24px 72px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.sites-shell {
  width: min(100%, 980px);
  margin: 0 auto;
}

.sites-header,
.section-heading,
.site-card__topline,
.site-card__actions,
.landing-card {
  display: flex;
  align-items: center;
}

.sites-header {
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
}

.sites-header h1,
.section-heading h2,
.profile-callout h2,
.site-card h3 {
  margin: 0;
  letter-spacing: -0.025em;
}

.sites-header h1 {
  font-size: clamp(1.8rem, 4vw, 2.4rem);
}

.sites-header p,
.section-heading p,
.profile-callout p,
.site-card p {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.sites-header p {
  margin: 6px 0 0;
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
  display: flex;
  min-height: 250px;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 16px);
  background: var(--ui-surface, var(--color-bg));
  box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / 0.05));
}

.site-card--profile {
  border-color: var(--ui-border-strong, var(--color-border));
}

.site-card__topline {
  justify-content: space-between;
  gap: 12px;
}

.site-card__kind {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.8rem;
  font-weight: 750;
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

.site-card__identity {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 14px;
  margin-top: 26px;
}

.site-card__logo,
.site-card__icon {
  width: 48px;
}

.site-card__logo {
  height: auto;
  padding: 8px;
  box-sizing: border-box;
}

.site-card__icon {
  display: grid;
  height: 48px;
  place-items: center;
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.site-card h3 {
  font-size: 1.2rem;
}

.site-card h3 a {
  color: inherit;
  text-decoration: none;
}

.site-card h3 a:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.site-card p {
  margin: 6px 0 0;
  line-height: 1.45;
}

.site-card__actions {
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
  padding-top: 24px;
}

.site-card__actions :deep(.me3-btn) {
  min-height: 44px;
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

.site-card h3 a:focus-visible,
.landing-card:focus-visible {
  outline: 3px solid var(--ui-accent, var(--color-accent));
  outline-offset: 3px;
}

@media (prefers-reduced-motion: no-preference) {
  .site-card,
  .landing-card {
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }

  .site-card:hover,
  .landing-card:hover {
    border-color: var(--ui-border-strong, var(--color-border));
    box-shadow: var(--ui-shadow-md, 0 12px 24px rgb(15 23 42 / 0.08));
  }
}

@media (max-width: 720px) {
  .sites-page {
    padding: calc(var(--workspace-topbar-height) + 20px) 16px 48px;
  }

  .sites-header,
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
  .sites-header,
  .section-heading {
    flex-direction: column;
  }

  .sites-header > :deep(.me3-btn) {
    width: 100%;
  }
}
</style>
