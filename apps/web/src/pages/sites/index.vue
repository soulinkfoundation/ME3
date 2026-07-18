<script setup lang="ts">
import { computed, onMounted } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useSitesStore, type SitePage } from "../../stores/sites";
import UiIcon from "../../components/UiIcon.vue";

definePage({
  meta: {
    requiresAuth: true,
    title: "Sites | ME3",
    description: "Choose a site to manage in ME3.",
    robots: "noindex,follow",
  },
});

const sites = useSitesStore();

const profileSite = computed(() =>
  sites.sites.find((site) => (site.site_type || "profile") === "profile"),
);

const legacyLandingSites = computed(() =>
  sites.sites.filter((site) => site.site_type === "landing_page"),
);

const landingPageCards = computed(() => {
  const profileUsername = profileSite.value?.username;
  if (!profileUsername) return [];

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

const createLandingPagePath = computed(() =>
  profileSite.value
    ? `/sites/${encodeURIComponent(profileSite.value.username)}/landing-pages/new`
    : "/start",
);

function statusLabel(published: boolean): string {
  return published ? "Published" : "Draft";
}

onMounted(async () => {
  await sites.fetchSites();
  if (profileSite.value) {
    await sites.fetchSitePages(profileSite.value.username);
  }
});
</script>

<template>
  <div class="sites-page">
    <main class="sites-shell">
      <header class="sites-header">
        <div>
          <h1>Sites</h1>
          <p>Choose a site to manage, or start a new landing page.</p>
        </div>
        <span v-if="profileSite" class="sites-count">
          {{ 1 + landingPageCards.length }} {{ 1 + landingPageCards.length === 1 ? "site" : "sites" }}
        </span>
      </header>

      <p v-if="sites.error" class="sites-message sites-message--error">
        {{ sites.error }}
      </p>

      <section v-if="profileSite" class="sites-grid" aria-label="Your sites">
        <RouterLink
          class="site-card site-card--profile"
          :to="`/sites/${encodeURIComponent(profileSite.username)}`"
        >
          <div class="site-card__topline">
            <span class="site-card__kind">ME3 profile</span>
            <span class="site-status" :class="{ 'site-status--published': profileSite.published_at }">
              {{ statusLabel(Boolean(profileSite.published_at)) }}
            </span>
          </div>
          <div class="site-card__icon site-card__icon--profile" aria-hidden="true">
            <UiIcon name="LayoutGrid" :size="22" />
          </div>
          <h2>{{ profileSite.username }}</h2>
          <p>Your main ME3 profile, site settings, posts, subscribers, and publishing tools.</p>
          <span class="site-card__action">
            Open profile site
            <UiIcon name="ExternalLink" :size="16" aria-hidden="true" />
          </span>
        </RouterLink>

        <RouterLink
          v-if="profileSite"
          class="site-card site-card--create"
          :to="createLandingPagePath"
        >
          <span class="site-card__plus" aria-hidden="true">
            <UiIcon name="Plus" :size="24" />
          </span>
          <h2>New landing page</h2>
          <p>Create a focused page for an offer, event, waitlist, or launch.</p>
          <span class="site-card__action">Add landing page</span>
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
  padding: clamp(32px, 7vw, 84px) 24px 72px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.sites-shell {
  width: min(100%, 980px);
  margin: 0 auto;
}

.sites-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;
}

.sites-header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  letter-spacing: -0.045em;
}

.sites-header p {
  max-width: 520px;
  margin: 10px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 1rem;
}

.sites-count {
  flex: 0 0 auto;
  padding: 7px 11px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.82rem;
  font-weight: 700;
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
  border-color: var(--ui-accent, var(--color-accent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-accent, #13a27d) 12%, transparent);
}

.site-card--create {
  justify-content: center;
  border-style: dashed;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.site-card--create:hover {
  border-color: var(--ui-accent, var(--color-accent));
  background: var(--ui-accent-soft, color-mix(in srgb, var(--ui-accent, #13a27d) 8%, transparent));
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
  margin: 22px 0 18px;
  border-radius: 14px;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.site-card__icon--profile {
  background: var(--ui-accent, var(--color-accent));
  color: var(--ui-accent-contrast, #fff);
}

.site-card__icon--landing,
.site-card__plus {
  background: var(--ui-accent-soft, color-mix(in srgb, var(--ui-accent, #13a27d) 12%, transparent));
  color: var(--ui-accent-strong, var(--color-accent));
}

.site-card h2 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: -0.025em;
}

.site-card p {
  max-width: 34ch;
  margin: 8px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  line-height: 1.5;
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

.site-card--create .site-card__plus {
  margin: 0 0 18px;
  border: 1px solid color-mix(in srgb, var(--ui-accent, #13a27d) 40%, transparent);
}

.site-card--create .site-card__action {
  color: var(--ui-accent-strong, var(--color-accent));
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
    padding: 28px 16px 48px;
  }

  .sites-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
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
