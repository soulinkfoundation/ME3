<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import {
  LANDING_PAGE_CREATION_PURPOSES,
  type LandingPageCreationPurpose,
  type LandingPageRecipeId,
} from "@me3-core/plugin-landing-pages";
import { useSitesStore } from "../../../../stores/sites";
import UiIcon from "../../../../components/UiIcon.vue";

definePage({
  meta: {
    requiresAuth: true,
    title: "Add Landing Page | ME3",
    description: "Create a landing page draft inside Sites.",
    robots: "noindex,follow",
  },
});

const route = useRoute();
const router = useRouter();
const sites = useSitesStore();

const profileUsername = computed(() => route.params.username as string);
const selectedPurposeId = ref<LandingPageRecipeId>("event-invite");
const pageUsername = ref("");
const brief = ref("");
const creating = ref(false);
const error = ref("");

const selectedPurpose = computed<LandingPageCreationPurpose>(
  () =>
    LANDING_PAGE_CREATION_PURPOSES.find(
      (purpose) => purpose.id === selectedPurposeId.value,
    ) || LANDING_PAGE_CREATION_PURPOSES[0],
);

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function uniqueUsername(base: string): string {
  const existing = new Set(sites.sites.map((site) => site.username));
  const root = slugify(base) || "landing-page";
  if (!existing.has(root)) return root;
  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${root.slice(0, 30 - suffix.length)}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${root.slice(0, 25)}-${Date.now().toString().slice(-4)}`;
}

function resetDefaultsForPurpose() {
  pageUsername.value = uniqueUsername(
    `${profileUsername.value}-${selectedPurpose.value.defaultSlugSuffix}`,
  );
  brief.value = selectedPurpose.value.examplePrompt;
}

async function createLandingPage() {
  if (creating.value) return;
  const username = slugify(pageUsername.value);
  if (username.length < 3) {
    error.value = "Choose a landing page URL with at least 3 characters.";
    return;
  }
  if (!brief.value.trim()) {
    error.value = "Add a short brief before creating the draft.";
    return;
  }

  creating.value = true;
  error.value = "";
  try {
    const site = await sites.claimUsername(username, {
      siteType: "landing_page",
      templateId: selectedPurpose.value.template,
    });
    if (!site) {
      error.value = sites.error || "Could not create the landing page.";
      return;
    }

    const page = await sites.generateLandingPage(site.username, {
      brief: brief.value,
      templateId: selectedPurpose.value.template,
    });
    if (!page) {
      error.value = sites.error || "Created the page, but could not generate the first draft.";
      return;
    }

    await sites.fetchSites();
    router.replace(`/sites/${site.username}/build`);
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  if (sites.sites.length === 0) {
    await sites.fetchSites();
  }
  resetDefaultsForPurpose();
});

watch(selectedPurposeId, resetDefaultsForPurpose);
</script>

<template>
  <div class="new-landing-page">
    <header class="new-header">
      <router-link :to="`/sites/${profileUsername}`" class="back-link">
        <UiIcon name="ArrowLeft" :size="16" />
        Sites
      </router-link>
      <div>
        <h1>Add Landing Page</h1>
        <p>{{ profileUsername }}.example.com</p>
      </div>
    </header>

    <main class="new-layout">
      <section class="new-panel">
        <div class="field-group">
          <h2>Purpose</h2>
          <div class="purpose-list" role="list">
            <button
              v-for="purpose in LANDING_PAGE_CREATION_PURPOSES"
              :key="purpose.id"
              type="button"
              class="purpose-option"
              :class="{ active: selectedPurposeId === purpose.id }"
              @click="selectedPurposeId = purpose.id"
            >
              <span>
                <strong>{{ purpose.label }}</strong>
                <small>{{ purpose.description }}</small>
              </span>
              <UiIcon
                :name="selectedPurposeId === purpose.id ? 'CircleCheck' : 'Circle'"
                :size="18"
              />
            </button>
          </div>
        </div>

        <label class="field-group">
          <span>Landing page URL</span>
          <input v-model="pageUsername" class="input" spellcheck="false" />
          <small>{{ pageUsername || "landing-page" }}.example.com</small>
        </label>

        <label class="field-group">
          <span>Brief</span>
          <textarea v-model="brief" class="input" rows="9" />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="actions">
          <router-link :to="`/sites/${profileUsername}`" class="button secondary">
            Cancel
          </router-link>
          <button class="button primary" type="button" :disabled="creating" @click="createLandingPage">
            <UiIcon name="Sparkles" :size="16" />
            {{ creating ? "Creating..." : "Create draft" }}
          </button>
        </div>
      </section>

      <aside class="preview-panel">
        <strong>{{ selectedPurpose.label }}</strong>
        <p>{{ selectedPurpose.description }}</p>
        <dl>
          <div>
            <dt>Draft type</dt>
            <dd>{{ selectedPurpose.template }}</dd>
          </div>
          <div>
            <dt>First URL</dt>
            <dd>{{ pageUsername || "landing-page" }}.example.com</dd>
          </div>
        </dl>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.new-landing-page {
  min-height: 100vh;
  padding: 24px;
  color: var(--ui-text, var(--color-text));
}

.new-header,
.new-layout {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.new-header {
  display: grid;
  gap: 14px;
  margin-bottom: 22px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ui-text-muted, var(--color-text-muted));
  text-decoration: none;
  width: fit-content;
}

.new-header h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.25rem);
  line-height: 1;
  letter-spacing: 0;
}

.new-header p {
  margin: 8px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.new-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  align-items: start;
}

.new-panel,
.preview-panel {
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
  background: var(--ui-surface, var(--color-bg));
}

.new-panel {
  display: grid;
  gap: 22px;
  padding: 22px;
}

.field-group {
  display: grid;
  gap: 10px;
}

.field-group h2 {
  margin: 0;
  font-size: 1.05rem;
}

.field-group > span {
  font-weight: 700;
}

.field-group small {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.purpose-list {
  display: grid;
  gap: 10px;
}

.purpose-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
  background: transparent;
  color: inherit;
  padding: 14px;
  cursor: pointer;
  font: inherit;
}

.purpose-option.active {
  border-color: var(--ui-accent, var(--color-accent));
  background: var(--ui-accent-soft, rgba(16, 185, 129, 0.12));
}

.purpose-option strong,
.purpose-option small {
  display: block;
}

.purpose-option small {
  margin-top: 4px;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.input {
  width: 100%;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
  background: var(--ui-bg, var(--color-bg));
  color: inherit;
  padding: 12px 14px;
  font: inherit;
}

textarea.input {
  resize: vertical;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 999px;
  padding: 0 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  font: inherit;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}

.button.primary {
  border-color: var(--ui-accent, var(--color-accent));
  background: var(--ui-accent, var(--color-accent));
  color: var(--ui-accent-contrast, var(--color-bg));
}

.button.secondary {
  background: transparent;
  color: inherit;
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.preview-panel {
  display: grid;
  gap: 16px;
  padding: 20px;
  position: sticky;
  top: 20px;
}

.preview-panel p {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  line-height: 1.55;
}

.preview-panel dl {
  display: grid;
  gap: 12px;
  margin: 0;
}

.preview-panel div {
  border-top: 1px solid var(--ui-border, var(--color-border));
  padding-top: 12px;
}

.preview-panel dt {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.84rem;
}

.preview-panel dd {
  margin: 4px 0 0;
  font-weight: 700;
}

.error {
  margin: 0;
  color: #b42318;
}

@media (max-width: 860px) {
  .new-layout {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
  }
}
</style>
