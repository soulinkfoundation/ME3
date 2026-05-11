<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSitesStore } from "../../stores/sites";
import {
  LANDING_PAGE_TEMPLATES,
  type LandingPageTemplateId,
} from "../../../../../shared/landing-pages";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "New Landing Page | ME3",
    description: "Create a new ME3 landing page from a template.",
    robots: "noindex,follow",
  },
});

const router = useRouter();
const sites = useSitesStore();

const templateId = ref<LandingPageTemplateId>("service");
const username = ref("");
const brief = ref("");
const heroFile = ref<File | null>(null);
const sectionFile = ref<File | null>(null);
const error = ref("");
const creating = ref(false);
const billingStatus =
  ref<Awaited<ReturnType<typeof sites.getBillingStatus>>>(null);

const hasProfileSite = computed(() =>
  sites.sites.some((site) => (site.site_type || "profile") === "profile"),
);
const canCreateLandingPages = computed(
  () => billingStatus.value?.tier === "pro",
);

onMounted(async () => {
  await Promise.all([
    sites.sites.length === 0 ? sites.fetchSites() : Promise.resolve(),
    sites.getBillingStatus().then((status) => {
      billingStatus.value = status;
    }),
  ]);
});

function onHeroFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  heroFile.value = input.files?.[0] || null;
}

function onSectionFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  sectionFile.value = input.files?.[0] || null;
}

async function createLandingPage() {
  if (creating.value) return;
  if (!username.value.trim() || !brief.value.trim()) {
    error.value =
      "Add a username and a short brief to generate the first draft.";
    return;
  }
  if (!hasProfileSite.value) {
    error.value = "Create your ME3 site first, then add landing pages.";
    return;
  }
  if (!canCreateLandingPages.value) {
    error.value = "Landing pages are available on Pro.";
    return;
  }

  creating.value = true;
  error.value = "";

  try {
    const site = await sites.claimUsername(username.value, {
      siteType: "landing_page",
      templateId: templateId.value,
    });

    if (!site) {
      error.value = sites.error || "Failed to claim the landing page URL.";
      return;
    }

    let heroImage: string | null = null;
    let sectionImage: string | null = null;

    if (heroFile.value) {
      const uploaded = await sites.uploadImage(
        site.username,
        heroFile.value,
        "hero",
      );
      if (!uploaded) {
        error.value = sites.error || "Failed to upload the hero image.";
        return;
      }
      heroImage = uploaded.path;
    }

    if (sectionFile.value) {
      const uploaded = await sites.uploadImage(
        site.username,
        sectionFile.value,
        "section",
      );
      if (!uploaded) {
        error.value = sites.error || "Failed to upload the section image.";
        return;
      }
      sectionImage = uploaded.path;
    }

    const page = await sites.generateLandingPage(site.username, {
      brief: brief.value,
      templateId: templateId.value,
      heroImage,
      sectionImage,
    });

    if (!page) {
      error.value = sites.error || "Failed to generate the landing page draft.";
      return;
    }

    await sites.fetchSites();
    router.push(`/sites/${site.username}/build`);
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="page-builder-entry">
    <header class="entry-header">
      <router-link to="/home" class="entry-back">← Home</router-link>
      <h1>New landing page</h1>
      <p>
        Pick a template, claim the URL, and let ME3 generate the first version.
      </p>
    </header>

    <main class="entry-main">
      <section class="entry-section">
        <h2>Template</h2>
        <div class="template-grid">
          <button
            v-for="template in LANDING_PAGE_TEMPLATES"
            :key="template.id"
            type="button"
            class="template-card"
            :class="{ active: templateId === template.id }"
            @click="templateId = template.id"
          >
            <strong>{{ template.shortName }}</strong>
            <span>{{ template.name }}</span>
            <p>{{ template.description }}</p>
          </button>
        </div>
      </section>

      <section class="entry-section form-grid">
        <label class="field">
          <span>Page URL</span>
          <input
            v-model="username"
            type="text"
            placeholder="retreat-april"
            autocomplete="off"
          />
          <small>{{ username || "your-page" }}.example.com</small>
        </label>

        <label class="field field--wide">
          <span>Brief</span>
          <textarea
            v-model="brief"
            rows="8"
            placeholder="What is the page for, who is it for, what should people do next, and any date/location/pricing details?"
          />
        </label>

        <label class="field">
          <span>Hero image</span>
          <input type="file" accept="image/*" @change="onHeroFileChange" />
          <small>{{
            heroFile?.name || "Optional, but strongly recommended"
          }}</small>
        </label>

        <label class="field">
          <span>Section image</span>
          <input type="file" accept="image/*" @change="onSectionFileChange" />
          <small>{{ sectionFile?.name || "Optional secondary image" }}</small>
        </label>
      </section>

      <p v-if="!hasProfileSite" class="notice">
        Your account needs an ME3 site first. Create that in the dashboard, then
        come back here for landing pages.
      </p>
      <p v-else-if="!canCreateLandingPages" class="notice">
        Landing pages are a Pro feature. Upgrade when you want up to 3 extra
        campaign pages alongside your main ME3 site.
      </p>
      <p v-if="error" class="error">{{ error }}</p>

      <div class="entry-actions">
        <button
          class="button secondary"
          type="button"
          @click="router.push('/home')"
        >
          Cancel
        </button>
        <button
          class="button"
          type="button"
          :disabled="creating || !canCreateLandingPages"
          @click="createLandingPage"
        >
          {{ creating ? "Creating..." : "Create landing page" }}
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page-builder-entry {
  min-height: 100vh;
  padding: 32px 20px 48px;
}

.entry-header,
.entry-main {
  width: min(980px, 100%);
  margin: 0 auto;
}

.entry-back {
  display: inline-flex;
  margin-bottom: 14px;
  color: var(--color-text-muted);
  text-decoration: none;
}

.entry-back:hover {
  color: var(--color-text);
}

.entry-header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  letter-spacing: -0.04em;
}

.entry-header p {
  margin-top: 8px;
  color: var(--color-text-muted);
}

.entry-main {
  margin-top: 28px;
  display: grid;
  gap: 24px;
}

.entry-section {
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: var(--color-bg);
  padding: 22px;
}

.entry-section h2 {
  margin: 0 0 16px;
  font-size: 1rem;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.template-card {
  text-align: left;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 18px;
  padding: 16px;
  cursor: pointer;
}

.template-card.active {
  border-color: var(--color-text);
  box-shadow: inset 0 0 0 1px var(--color-text);
}

.template-card strong,
.template-card span,
.template-card p {
  display: block;
}

.template-card span {
  margin-top: 6px;
  font-size: 0.92rem;
}

.template-card p {
  margin-top: 10px;
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;
}

.field--wide {
  grid-column: 1 / -1;
}

.field span {
  font-weight: 600;
}

.field input,
.field textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 12px 14px;
  font: inherit;
}

.field textarea {
  resize: vertical;
  min-height: 160px;
}

.field small,
.notice {
  color: var(--color-text-muted);
}

.error {
  color: #a12626;
}

.entry-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.button {
  min-height: 46px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--color-text);
  background: var(--color-text);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.button.secondary {
  background: var(--color-bg);
  color: var(--color-text);
  border-color: var(--color-border);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .template-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
