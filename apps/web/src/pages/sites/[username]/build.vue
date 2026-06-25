<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useSitesStore,
  type LandingPageProfileSummary,
} from "../../../stores/sites";
import { useAgentChat } from "../../../composables/useAgentChat";
import type {
  LandingPageDocument,
  LandingPageTemplateId,
} from "@me3-core/plugin-landing-pages";
import {
  LANDING_PAGE_TEMPLATES,
  getLandingPageBrief,
  getLandingPageHero,
  getLandingPageSectionImage,
  getLandingPageTemplateId,
} from "@me3-core/plugin-landing-pages";
import { resolvePublicProfileUrl } from "../../../utils/publicSiteUrl";

definePage({
  meta: {
    requiresAuth: true,
    requiresPlugin: "me3.landing-pages",
    title: "Landing Page Builder | ME3",
    description: "Build and preview a ME3 landing page.",
    robots: "noindex,follow",
  },
});

const route = useRoute();
const router = useRouter();
const sites = useSitesStore();
const agentChat = useAgentChat();

const username = computed(() => route.params.username as string);
const site = computed(() =>
  sites.sites.find((entry) => entry.username === username.value),
);

const loading = ref(true);
const generating = ref(false);
const previewLoading = ref(false);
const uploadBusy = ref(false);
const error = ref("");
const previewHtml = ref("");
const brief = ref("");
const feedback = ref("");
const templateId = ref<LandingPageTemplateId>("service");
const draft = ref<LandingPageDocument | null>(null);
const profile = ref<LandingPageProfileSummary | null>(null);

const isLandingPage = computed(
  () => (site.value?.site_type || "profile") === "landing_page",
);
const published = computed(() => !!site.value?.published_at);
const liveUrl = ref("/me");
const liveUrlLabel = computed(() =>
  liveUrl.value.replace(/^https?:\/\//, "").replace(/\/$/, ""),
);

function getSectionImage(page: LandingPageDocument | null): string | null {
  return getLandingPageSectionImage(page);
}

async function refreshPreview() {
  previewLoading.value = true;
  try {
    const html = await sites.fetchPreviewHtml(username.value);
    if (html !== null) {
      previewHtml.value = html;
    }
  } finally {
    previewLoading.value = false;
  }
}

async function loadBuilder() {
  loading.value = true;
  error.value = "";
  try {
    if (sites.sites.length === 0) {
      await sites.fetchSites();
    }

    const response = await sites.getLandingPageDraft(username.value);
    if (!response) {
      error.value = sites.error || "Failed to load the landing page.";
      return;
    }

    profile.value = response.profile;
    draft.value = response.page;
    templateId.value =
      response.page ? getLandingPageTemplateId(response.page) : response.site.templateId || "service";
    brief.value = response.page ? getLandingPageBrief(response.page) : "";

    await refreshPreview();
  } finally {
    loading.value = false;
  }
}

function activateBuilderAssistant() {
  const templateLabel =
    LANDING_PAGE_TEMPLATES.find((template) => template.id === templateId.value)
      ?.shortName || "Landing page";

  agentChat.replaceMessages([
    {
      id: "landing-builder-intro",
      role: "assistant",
      text: `I’m in the landing page builder for ${liveUrlLabel.value}.`,
      detail: `Template: ${templateLabel}. Ask for headline changes, clearer positioning, tighter CTA copy, or a different tone and then click Generate draft or Apply feedback in the builder.`,
      meta: "landing page builder",
    },
  ]);
  agentChat.openChat();
}

function noteBuilderUpdate(page: LandingPageDocument, context: string) {
  const hero = getLandingPageHero(page);
  agentChat.appendMessage({
    role: "assistant",
    text: context,
    detail: `Headline: ${hero.headline}`,
    meta: "landing page builder",
  });
  agentChat.openChat();
}

async function regenerate() {
  if (generating.value) return;
  if (!brief.value.trim()) {
    error.value = "Add a brief before generating the page.";
    return;
  }

  generating.value = true;
  error.value = "";
  try {
    const page = await sites.generateLandingPage(username.value, {
      brief: brief.value,
      templateId: templateId.value,
      heroImage: draft.value ? getLandingPageHero(draft.value).image || null : null,
      sectionImage: getSectionImage(draft.value),
      feedback: feedback.value || null,
    });

    if (!page) {
      error.value = sites.error || "Failed to generate the landing page.";
      return;
    }

    draft.value = page;
    brief.value = page.brief;
    const updateContext = feedback.value.trim()
      ? `I updated the draft for ${liveUrlLabel.value} based on your latest feedback.`
      : `I generated a fresh ${templateId.value} draft for ${liveUrlLabel.value}.`;
    feedback.value = "";
    await Promise.all([sites.fetchSites(), refreshPreview()]);
    noteBuilderUpdate(page, updateContext);
  } finally {
    generating.value = false;
  }
}

async function publish() {
  generating.value = true;
  error.value = "";
  try {
    const ok = await sites.publishLandingPage(username.value);
    if (!ok) {
      error.value = sites.error || "Failed to publish the landing page.";
      return;
    }
    await sites.fetchSites();
  } finally {
    generating.value = false;
  }
}

async function unpublish() {
  generating.value = true;
  error.value = "";
  try {
    const ok = await sites.unpublishLandingPage(username.value);
    if (!ok) {
      error.value = sites.error || "Failed to unpublish the landing page.";
      return;
    }
    await sites.fetchSites();
  } finally {
    generating.value = false;
  }
}

async function uploadAndRegenerate(
  event: Event,
  imageType: "hero" | "section",
) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  uploadBusy.value = true;
  error.value = "";
  try {
    const uploaded = await sites.uploadImage(username.value, file, imageType);
    if (!uploaded) {
      error.value = sites.error || "Failed to upload the image.";
      return;
    }

    const nextHero =
      imageType === "hero"
        ? uploaded.path
        : draft.value
          ? getLandingPageHero(draft.value).image || null
          : null;
    const nextSection =
      imageType === "section" ? uploaded.path : getSectionImage(draft.value);

    const page = await sites.generateLandingPage(username.value, {
      brief: brief.value || draft.value?.brief || "",
      templateId: templateId.value,
      heroImage: nextHero,
      sectionImage: nextSection,
    });

    if (!page) {
      error.value = sites.error || "Failed to refresh the page after upload.";
      return;
    }

    draft.value = page;
    await refreshPreview();
    noteBuilderUpdate(
      page,
      `I refreshed the ${liveUrlLabel.value} draft after updating the ${imageType} image.`,
    );
  } finally {
    uploadBusy.value = false;
  }
}

onMounted(async () => {
  await loadBuilder();
  liveUrl.value = await resolvePublicProfileUrl(username.value, site.value);
  if (site.value && !isLandingPage.value) {
    router.replace(`/sites/${username.value}`);
    return;
  }
  activateBuilderAssistant();
});

onBeforeUnmount(() => {
  agentChat.resetMessages();
  agentChat.closeChat();
  agentChat.showLauncher();
});
</script>

<template>
  <div class="builder-page">
    <header class="builder-header">
      <router-link :to="`/sites/${username}`" class="builder-back">
        ← Site settings
      </router-link>
      <div class="builder-header-copy">
        <h1>{{ liveUrlLabel }}</h1>
        <p>Landing page builder</p>
      </div>
      <div class="builder-header-actions">
        <button
          class="header-link button-link"
          type="button"
          @click="activateBuilderAssistant"
        >
          Open agent
        </button>
        <a
          v-if="published"
          :href="liveUrl"
          target="_blank"
          rel="noreferrer"
          class="header-link"
        >
          Open live ↗
        </a>
      </div>
    </header>

    <main v-if="!loading" class="builder-layout">
      <section class="builder-panel builder-panel--controls">
        <div class="panel-card">
          <h2>Template</h2>
          <div class="template-stack">
            <button
              v-for="template in LANDING_PAGE_TEMPLATES"
              :key="template.id"
              type="button"
              class="template-chip"
              :class="{ active: templateId === template.id }"
              @click="templateId = template.id"
            >
              {{ template.shortName }}
            </button>
          </div>
          <p class="panel-help">
            Pick a template and regenerate when you want the structure
            rewritten.
          </p>
        </div>

        <div class="panel-card">
          <h2>Brief</h2>
          <textarea
            v-model="brief"
            rows="9"
            placeholder="Describe the event, offer, or launch. Include who it is for, what they get, and the action you want them to take."
          />
          <button
            class="button"
            type="button"
            :disabled="generating"
            @click="regenerate"
          >
            {{ generating ? "Generating..." : "Generate draft" }}
          </button>
        </div>

        <div class="panel-card">
          <h2>Images</h2>
          <label class="upload-row">
            <span>Hero image</span>
            <input
              type="file"
              accept="image/*"
              @change="uploadAndRegenerate($event, 'hero')"
            />
          </label>
          <label class="upload-row">
            <span>Section image</span>
            <input
              type="file"
              accept="image/*"
              @change="uploadAndRegenerate($event, 'section')"
            />
          </label>
          <p class="panel-help">
            Uploads are saved immediately and the preview refreshes after each
            change.
          </p>
        </div>

        <div class="panel-card">
          <h2>Iteration</h2>
          <textarea
            v-model="feedback"
            rows="5"
            placeholder='Try "Change the headline to..." or "make this feel more intimate and lower-pressure."'
          />
          <button
            class="button secondary"
            type="button"
            :disabled="generating || !feedback.trim()"
            @click="regenerate"
          >
            Apply feedback
          </button>
        </div>

        <div class="panel-card">
          <h2>Publish</h2>
          <p class="panel-help">
            Preview uses the exact HTML that will be served when you publish.
          </p>
          <div class="publish-actions">
            <button
              v-if="!published"
              class="button"
              type="button"
              :disabled="generating || !draft"
              @click="publish"
            >
              Publish
            </button>
            <button
              v-else
              class="button secondary"
              type="button"
              :disabled="generating"
              @click="unpublish"
            >
              Unpublish
            </button>
          </div>
        </div>

        <div v-if="profile" class="panel-card">
          <h2>Profile context</h2>
          <p class="panel-help">
            {{ profile.name || "Your profile" }}
            <span v-if="profile.bio">· {{ profile.bio }}</span>
          </p>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="uploadBusy" class="panel-help">Uploading image...</p>
      </section>

      <section class="builder-panel builder-panel--preview">
        <div class="preview-shell">
          <div class="preview-header">
            <strong>Live preview</strong>
            <span>{{ published ? "Published draft" : "Private draft" }}</span>
          </div>
          <div v-if="previewLoading" class="preview-empty">
            Refreshing preview…
          </div>
          <iframe
            v-else-if="previewHtml"
            class="preview-frame"
            :srcdoc="previewHtml"
            title="Landing page preview"
          />
          <div v-else class="preview-empty">
            Add a brief and generate the first draft to see the page here.
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.builder-page {
  min-height: 100vh;
  padding: 20px;
}

.builder-header,
.builder-layout {
  width: min(1320px, 100%);
  margin: 0 auto;
}

.builder-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}

.builder-back,
.header-link {
  color: var(--color-text-muted);
  text-decoration: none;
}

.button-link {
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  padding: 0;
}

.builder-back:hover,
.header-link:hover {
  color: var(--color-text);
}

.builder-header-copy h1 {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  letter-spacing: -0.04em;
}

.builder-header-copy p {
  margin: 4px 0 0;
  color: var(--color-text-muted);
}

.builder-layout {
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.builder-panel {
  min-width: 0;
}

.builder-panel--controls {
  display: grid;
  gap: 14px;
}

.panel-card,
.preview-shell {
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: var(--color-bg);
}

.panel-card {
  padding: 18px;
  display: grid;
  gap: 12px;
}

.panel-card h2 {
  margin: 0;
  font-size: 1rem;
}

.panel-help {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.94rem;
}

.template-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-chip {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}

.template-chip.active {
  border-color: var(--color-text);
  background: var(--color-text);
  color: #fff;
}

.panel-card textarea,
.upload-row input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 12px 14px;
  font: inherit;
}

.panel-card textarea {
  resize: vertical;
}

.upload-row {
  display: grid;
  gap: 8px;
}

.upload-row span {
  font-weight: 600;
}

.button {
  min-height: 44px;
  padding: 0 16px;
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

.publish-actions {
  display: flex;
  gap: 10px;
}

.preview-shell {
  padding: 14px;
  position: sticky;
  top: 20px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.92rem;
}

.preview-header span {
  color: var(--color-text-muted);
}

.preview-frame,
.preview-empty {
  width: 100%;
  min-height: 78vh;
  border: 0;
  border-radius: 16px;
  background: #fff;
}

.preview-frame {
  margin-top: 14px;
}

.preview-empty {
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  text-align: center;
  padding: 24px;
}

.error {
  margin: 0;
  color: #a12626;
}

@media (max-width: 980px) {
  .builder-layout {
    grid-template-columns: 1fr;
  }

  .preview-shell {
    position: static;
  }
}

@media (max-width: 720px) {
  .builder-header {
    grid-template-columns: 1fr;
  }
}
</style>
