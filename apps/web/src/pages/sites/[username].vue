<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { ref, computed, onBeforeUnmount, onMounted } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { useSitesStore } from "../../stores/sites";
import {
  LANDING_PAGES_PLUGIN_ID,
  LANDING_PAGE_TEMPLATES,
} from "@me3-core/plugin-landing-pages";
import { api } from "../../api";
import { useWizardStore } from "../../stores/wizard";
import NewsletterSubscribers from "../../components/NewsletterSubscribers.vue";
import UiIcon from "../../components/UiIcon.vue";
import JSZip from "jszip";
import TurndownService from "turndown";
import {
  defaultVibe,
  getVibeCss,
  getVibeFontUrl,
  type VibeId,
  vibeIds,
} from "../../styles/vibes";
import {
  prepareSiteUploadFiles,
  type SiteUploadFile,
} from "../../utils/siteUpload";
import { resolvePublicProfileUrl } from "../../utils/publicSiteUrl";
import { useAppToast } from "../../composables/useAppToast";

definePage({
  meta: {
    requiresAuth: true,
    title: "Site Settings | ME3",
    description: "Manage your published me3 site settings and content.",
    robots: "noindex,follow",
  },
});

const route = useRoute();
const router = useRouter();
const sites = useSitesStore();
const wizard = useWizardStore();
const { toastError } = useAppToast();

/** Nested children need the parent RouterView or their pages never appear. */
const isNestedSitesTool = computed(
  () =>
    route.path.startsWith("/sites/") &&
    (route.path.endsWith("/build") || route.path.includes("/landing-pages/")),
);

const username = computed(() => route.params.username as string);
const site = computed(() =>
  sites.sites.find((s) => s.username === username.value),
);
const siteType = computed(() => site.value?.site_type || "profile");
const isLandingPage = computed(() => siteType.value === "landing_page");
const isProfileSite = computed(() => siteType.value === "profile");
const landingPagesFeatureEnabled = ref(false);
const newLandingPageRoute = computed(
  () => `/sites/${username.value}/landing-pages/new`,
);
const landingPageSites = computed(() =>
  sites.sites.filter((entry) => (entry.site_type || "profile") === "landing_page"),
);
const showLandingPageTools = computed(
  () => isProfileSite.value && landingPagesFeatureEnabled.value,
);
const showLandingPageControls = computed(
  () => isLandingPage.value && landingPagesFeatureEnabled.value,
);

const siteUrl = ref("/me");
const siteUrlLabel = computed(() =>
  siteUrl.value.replace(/^https?:\/\//, "").replace(/\/$/, ""),
);

async function syncSiteUrl() {
  siteUrl.value = await resolvePublicProfileUrl(username.value, site.value);
}

// UI State
const showAdvancedUpload = ref(false);
const showDeleteConfirm = ref(false);
const isDeleting = ref(false);
const publishBusy = ref(false);
const publishError = ref("");

const isDragging = ref(false);
const isPreparingUpload = ref(false);
const uploadError = ref("");
const uploadNotice = ref("");
const uploadSuccess = ref(false);
const selectedFiles = ref<SiteUploadFile[]>([]);
async function syncLandingPagesFeature() {
  try {
    const response = await api.get<{
      plugins: Array<{ id: string; enabled: boolean; status: string }>;
    }>("/plugins");
    const plugin = response.plugins.find(
      (candidate) => candidate.id === LANDING_PAGES_PLUGIN_ID,
    );
    landingPagesFeatureEnabled.value =
      plugin?.enabled === true && plugin.status === "installed";
  } catch {
    landingPagesFeatureEnabled.value = false;
  }
}

function handlePluginsChanged() {
  void syncLandingPagesFeature();
}

// Initialize turndown for HTML to Markdown conversion
const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
});
turndown.keep((node) => {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.hasAttribute("data-tiptap-youtube") ||
    node.hasAttribute("data-tiptap-faq") ||
    node.hasAttribute("data-tiptap-carousel")
  );
});
turndown.addRule("tiptapTaskItem", {
  filter(node) {
    return node.nodeType === 1 && node.getAttribute("data-type") === "taskItem";
  },
  replacement(content, node) {
    const input = node.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    const checked =
      node.getAttribute("data-checked") === "true" ||
      input?.checked === true ||
      input?.hasAttribute("checked") === true;
    const itemContent = content
      .trim()
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n/g, "\n  ");

    return itemContent ? `- [${checked ? "x" : " "}] ${itemContent}\n` : "";
  },
});

onMounted(async () => {
  if (sites.sites.length === 0) {
    await sites.fetchSites();
  }
  await syncSiteUrl();

  await syncLandingPagesFeature();
  window.addEventListener("me3:plugins-changed", handlePluginsChanged);

  if (!site.value) {
    router.push("/calendar");
    return;
  }

  // Auto-expand upload section if coming from claim flow
  if (route.query.upload === "true") {
    showAdvancedUpload.value = true;
  }

  if (typeof route.query.edit === "string") {
    await openWizardStep(route.query.edit);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("me3:plugins-changed", handlePluginsChanged);
});

async function loadWizardContent(): Promise<void> {
  try {
    // Fetch existing site content
    const content = await sites.getSiteContent(username.value);

    if (content?.ok && content.profile) {
      // Load the existing content into the wizard
      wizard.loadFromSiteContent(
        content.profile,
        content.pages,
        content.posts,
        content.products || [],
        username.value,
        site.value?.published_at || null,
      );
    } else {
      // No content yet, just set up for new site with this username
      wizard.reset();
      wizard.username = username.value;
      wizard.updateProfile({ handle: username.value });
      wizard.isUsernameAvailable = true;
    }
  } catch (e) {
    console.error("Failed to load site content:", e);
    // Fall back to basic setup
    wizard.reset();
    wizard.username = username.value;
    wizard.updateProfile({ handle: username.value });
    wizard.isUsernameAvailable = true;
  }
}

async function editInWizard() {
  await loadWizardContent();
  router.push("/create");
}

async function openWizardStep(step: string) {
  await loadWizardContent();
  const stepId = wizard.normalizeWizardStepId(step);
  if (stepId) wizard.goToStepId(stepId, { enableOptional: true });
  router.replace({ path: "/create", query: stepId ? { step: stepId } : {} });
}

function openBuilder() {
  router.push(`/sites/${username.value}/build`);
}

function landingTemplateLabel(templateId: string | null | undefined): string {
  return (
    LANDING_PAGE_TEMPLATES.find((template) => template.id === templateId)
      ?.shortName || "Landing page"
  );
}

async function writePost() {
  await loadWizardContent();
  wizard.goToStepId("blog", { enableOptional: true });
  router.push({ path: "/create", query: { step: "blog" } });
}

// Advanced upload functions
function handleDragOver(event: DragEvent) {
  event.preventDefault();
  isDragging.value = true;
}

function handleDragLeave() {
  isDragging.value = false;
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;

  const items = event.dataTransfer?.items;
  if (!items) return;

  const files: File[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }

  await handleFiles(files);
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    await handleFiles(Array.from(input.files));
    input.value = "";
  }
}

async function handleDirectorySelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    await handleFiles(Array.from(input.files));
    input.value = "";
  }
}

async function handleFiles(files: File[]) {
  uploadError.value = "";
  uploadNotice.value = "";
  uploadSuccess.value = false;
  isPreparingUpload.value = true;

  try {
    const prepared = await prepareSiteUploadFiles(files);
    const validFiles = prepared.files;

    if (validFiles.length === 0) {
      uploadError.value = "No supported me3 files were found in that selection";
      return;
    }

    const hasMe3 = validFiles.some((f) => f.name === "me.json");
    if (validFiles.length > 0 && !hasMe3) {
      const existingHasMe3 = selectedFiles.value.some(
        (f) => f.name === "me.json",
      );
      if (!existingHasMe3) {
        uploadError.value = "Your files must include a me.json file";
        return;
      }
    }

    const existingNames = new Set(selectedFiles.value.map((f) => f.name));
    const newFiles = validFiles.filter((f) => !existingNames.has(f.name));
    const updatedExisting = selectedFiles.value.map((existing) => {
      const replacement = validFiles.find((f) => f.name === existing.name);
      return replacement || existing;
    });

    selectedFiles.value = [...updatedExisting, ...newFiles];

    if (prepared.ignored.length > 0) {
      uploadNotice.value = `Ignored ${prepared.ignored.length} unsupported or hidden file${prepared.ignored.length === 1 ? "" : "s"}.`;
    }
  } catch (error) {
    console.error("Failed to prepare upload files:", error);
    uploadError.value = "Could not read that zip or folder";
  } finally {
    isPreparingUpload.value = false;
  }
}

function removeFile(filename: string) {
  selectedFiles.value = selectedFiles.value.filter((f) => f.name !== filename);
}

async function uploadFiles() {
  if (selectedFiles.value.length === 0 || sites.loading) return;

  uploadError.value = "";
  uploadNotice.value = "";
  uploadSuccess.value = false;

  const success = await sites.uploadSite(username.value, selectedFiles.value);

  if (success) {
    uploadSuccess.value = true;
    selectedFiles.value = [];
  } else {
    uploadError.value = sites.error || "Upload failed";
  }
}

async function deleteSite() {
  isDeleting.value = true;
  try {
    const success = await sites.deleteSite(username.value);
    if (success) {
      router.push("/calendar");
    }
  } finally {
    isDeleting.value = false;
  }
}

async function publishLandingPage() {
  if (publishBusy.value) return;
  publishBusy.value = true;
  publishError.value = "";
  try {
    const ok = await sites.publishLandingPage(username.value);
    if (!ok) {
      publishError.value = sites.error || "Failed to publish landing page";
      return;
    }
    await sites.fetchSites();
    await syncSiteUrl();
  } finally {
    publishBusy.value = false;
  }
}

async function unpublishLandingPage() {
  if (publishBusy.value) return;
  publishBusy.value = true;
  publishError.value = "";
  try {
    const ok = await sites.unpublishLandingPage(username.value);
    if (!ok) {
      publishError.value = sites.error || "Failed to unpublish landing page";
      return;
    }
    await sites.fetchSites();
    await syncSiteUrl();
  } finally {
    publishBusy.value = false;
  }
}

async function downloadSite() {
  if (!site.value?.published_at) return;

  // Fetch site content
  const content = await sites.getSiteContent(username.value);
  if (!content?.ok || !content.profile) {
    toastError("Failed to load site content");
    return;
  }

  const zip = new JSZip();

  // Build me.json from the full profile to preserve intents, posts, products, etc.
  const me3Json = JSON.parse(JSON.stringify(content.profile)) as Record<
    string,
    any
  >;

  if (!me3Json.links) {
    me3Json.links = {};
  }

  // Remove avatar variants metadata since we don't bundle the variant files
  if ("_avatar_variants" in me3Json.links) {
    delete me3Json.links._avatar_variants;
  }

  // Helper to fetch image from URL
  async function fetchImageAsBlob(
    url: string,
  ): Promise<{ blob: Blob; ext: string } | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const contentType = response.headers.get("content-type") || "";
      let ext = "jpg";
      if (contentType.includes("png")) ext = "png";
      else if (contentType.includes("webp")) ext = "webp";
      else if (contentType.includes("gif")) ext = "gif";
      return { blob, ext };
    } catch {
      return null;
    }
  }

  // Add avatar
  if (content.profile.avatar) {
    const result = await fetchImageAsBlob(content.profile.avatar);
    if (result) {
      zip.file(`files/avatar.${result.ext}`, result.blob);
      me3Json.avatar = `./files/avatar.${result.ext}`;
    }
  }

  // Add banner
  if (content.profile.banner) {
    const result = await fetchImageAsBlob(content.profile.banner);
    if (result) {
      zip.file(`files/banner.${result.ext}`, result.blob);
      me3Json.banner = `./files/banner.${result.ext}`;
    }
  }

  // Update me.json with correct paths
  const pageVisibility = new Map<string, boolean>();
  if (Array.isArray(me3Json.pages)) {
    for (const page of me3Json.pages) {
      if (page?.slug) pageVisibility.set(page.slug, Boolean(page.visible));
    }
  }

  const orderedContentPages: typeof content.pages = [];
  const seenPageSlugs = new Set<string>();

  if (Array.isArray(me3Json.pages)) {
    const contentPagesBySlug = new Map(
      content.pages.map((page) => [page.slug, page]),
    );
    for (const pageMeta of me3Json.pages) {
      const matchingPage = pageMeta?.slug
        ? contentPagesBySlug.get(pageMeta.slug)
        : undefined;
      if (!matchingPage) continue;
      orderedContentPages.push(matchingPage);
      seenPageSlugs.add(matchingPage.slug);
    }
  }

  for (const page of content.pages) {
    if (seenPageSlugs.has(page.slug)) continue;
    orderedContentPages.push(page);
  }

  const pagesMeta = orderedContentPages.map((page) => ({
    slug: page.slug,
    title: page.title,
    file: `${page.slug}.md`,
    visible: pageVisibility.get(page.slug) ?? true,
  }));

  if (pagesMeta.length > 0) {
    me3Json.pages = pagesMeta;
  } else {
    delete me3Json.pages;
  }

  const postsMeta = content.posts.map((post) => {
    const meta: {
      slug: string;
      title: string;
      file: string;
      type?: string;
      media?: {
        url?: string;
        duration?: number;
        thumbnail?: string;
        provider?: string;
        id?: string;
      };
      publishedAt?: string;
      excerpt?: string;
    } = {
      slug: post.slug,
      title: post.title,
      file: `blog/${post.slug}.md`,
    };

    if (post.type) meta.type = post.type;
    if (post.media && Object.keys(post.media).length > 0) {
      meta.media = post.media;
    }
    if (post.publishedAt) meta.publishedAt = post.publishedAt;
    if (post.excerpt) meta.excerpt = post.excerpt;
    return meta;
  });

  if (postsMeta.length > 0) {
    me3Json.posts = postsMeta;
  } else {
    delete me3Json.posts;
  }

  const productsMeta = content.products.map((product) => {
    const meta: {
      slug: string;
      title: string;
      file: string;
      price: number;
      currency:
        | "USD"
        | "GBP"
        | "EUR"
        | "CAD"
        | "AUD"
        | "CHF"
        | "SGD"
        | "INR"
        | "PKR";
      available?: boolean;
      publishedAt?: string;
      excerpt?: string;
    } = {
      slug: product.slug,
      title: product.title,
      file: `shop/${product.slug}.md`,
      price: product.price,
      currency: product.currency,
    };

    if (typeof product.available === "boolean") {
      meta.available = product.available;
    }
    if (product.publishedAt) meta.publishedAt = product.publishedAt;
    if (product.excerpt) meta.excerpt = product.excerpt;
    return meta;
  });

  if (productsMeta.length > 0) {
    me3Json.products = productsMeta;
  } else {
    delete me3Json.products;
  }

  // Add pages (convert HTML to Markdown if needed, or use existing markdown)
  for (const page of content.pages) {
    // If content looks like HTML, convert to markdown
    let markdown = page.content;
    if (page.content.includes("<") && page.content.includes(">")) {
      markdown = turndown.turndown(page.content);
    }
    zip.file(`${page.slug}.md`, markdown);
  }

  // Add blog posts (convert HTML to Markdown if needed, or use existing markdown)
  for (const post of content.posts) {
    let markdown = post.content;
    if (post.content.includes("<") && post.content.includes(">")) {
      markdown = turndown.turndown(post.content);
    }
    zip.file(`blog/${post.slug}.md`, markdown);
  }

  // Add shop products (convert HTML to Markdown if needed, or use existing markdown)
  for (const product of content.products) {
    let markdown = product.content;
    if (product.content.includes("<") && product.content.includes(">")) {
      markdown = turndown.turndown(product.content);
    }
    zip.file(`shop/${product.slug}.md`, markdown);
  }

  // Add portable index.html
  try {
    let portableHtml = await fetch("/portable-index.html").then((r) =>
      r.text(),
    );

    // Get vibe CSS (default to configured default if not available)
    const rawVibe =
      typeof me3Json.links?._vibe === "string" ? me3Json.links._vibe : "";
    const vibeId = vibeIds.includes(rawVibe as VibeId)
      ? (rawVibe as VibeId)
      : defaultVibe;
    const vibeCss = getVibeCss(vibeId);
    const vibeFontUrl = getVibeFontUrl(vibeId);
    const vibeFontLink = vibeFontUrl
      ? `<!-- Google Fonts -->\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${vibeFontUrl}">`
      : "";

    portableHtml = portableHtml.replace(
      "/* VIBE_CSS_PLACEHOLDER */",
      `/* Vibe: ${vibeId} */\n${vibeCss}`,
    );
    portableHtml = portableHtml.replace(
      "<!-- VIBE_FONT_PLACEHOLDER -->",
      vibeFontLink,
    );

    zip.file("index.html", portableHtml);
  } catch (e) {
    console.warn("Could not fetch portable-index.html:", e);
  }

  // Add README
  const readme = `# ${content.profile.name}'s me3 site

This folder contains your portable me3 site.

## Files
- \`index.html\` - Self-contained site viewer
- \`me.json\` - Your profile data (me3 protocol)
- \`files/\` - Your images
${
  content.pages.length > 0
    ? content.pages.map((p) => `- \`${p.slug}.md\` - ${p.title}`).join("\n")
    : ""
}
${
  content.posts.length > 0
    ? content.posts
        .map((p) => `- \`blog/${p.slug}.md\` - ${p.title}`)
        .join("\n")
    : ""
}
${
  content.products.length > 0
    ? content.products
        .map((p) => `- \`shop/${p.slug}.md\` - ${p.title}`)
        .join("\n")
    : ""
}

## How to publish

### Option 1: ME3 Core
1. Open your ME3 Core app
2. Sign in and claim your username
3. Upload this zip or the extracted folder

### Option 2: Self-host anywhere
Upload these files to any static hosting:
- Netlify (drag & drop the folder)
- Vercel
- GitHub Pages
- Cloudflare Pages
- Any web server

Your site is fully portable - no lock-in!

## How to view locally

1. Extract this zip to a folder
2. Start a local server in that folder:
    \`\`\`
    npx serve .
    # or: python3 -m http.server 8000
    \`\`\`
3. Open http://localhost:3000 (or :8000) in your browser

Note: Opening index.html directly (file://) won't work due to browser security.
`;
  zip.file("README.md", readme);

  // Write me.json after all modifications
  zip.file("me.json", JSON.stringify(me3Json, null, 2));

  // Generate and download zip
  const contentBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(contentBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${username.value}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <RouterView v-if="isNestedSitesTool" />
  <div v-else class="site-page">
    <main class="main">
      <!-- Site Header -->
      <div class="site-header">
        <div class="site-info">
          <div class="site-info-main">
            <div class="site-title">
              <a
                v-if="site?.published_at"
                :href="siteUrl"
                target="_blank"
                rel="noopener"
                class="site-link"
                :title="siteUrlLabel"
              >
                <span class="site-title-text">{{ siteUrlLabel }}</span>
                <UiIcon name="Eye" :size="16" class="site-link-icon" />
              </a>
              <span
                v-else
                class="site-title-plain"
                :title="siteUrlLabel"
              >
                <span class="site-title-text">{{ siteUrlLabel }}</span>
              </span>
            </div>
            <div class="site-badges">
              <span v-if="site?.published_at" class="status published"
                >Published</span
              >
              <span v-else class="status draft">Not published</span>
            </div>
          </div>
        </div>
      </div>

      <nav v-if="showLandingPageTools" class="site-tabs" aria-label="Site tools">
        <span class="site-tab active">ME3 site</span>
        <a class="site-tab" href="#landing-pages">Landing pages</a>
        <router-link class="site-tab" :to="newLandingPageRoute">
          Add Landing Page
        </router-link>
      </nav>

      <!-- Quick Actions -->
      <section class="actions-section">
        <div class="actions-grid">
          <button
            v-if="isProfileSite"
            class="action-card primary"
            @click="editInWizard"
          >
            <span class="action-icon">
              <UiIcon name="Pencil" :size="24" />
            </span>
            <div class="action-content">
              <strong>Edit Site</strong>
              <p>Update your site using the wizard</p>
            </div>
          </button>

          <button v-if="isProfileSite" class="action-card" @click="writePost">
            <span class="action-icon">
              <UiIcon name="Pencil" :size="24" />
            </span>
            <div class="action-content">
              <strong>Write Post</strong>
              <p>Jump to the blog editor</p>
            </div>
          </button>

          <router-link
            v-if="showLandingPageTools"
            class="action-card"
            :to="newLandingPageRoute"
          >
            <span class="action-icon">
              <UiIcon name="Sparkles" :size="24" />
            </span>
            <div class="action-content">
              <strong>Add Landing Page</strong>
              <p>Create an event or waitlist page</p>
            </div>
          </router-link>

          <button
            v-if="showLandingPageControls"
            class="action-card primary"
            @click="openBuilder"
          >
            <span class="action-icon">
              <UiIcon name="LayoutGrid" :size="24" />
            </span>
            <div class="action-content">
              <strong>Open Builder</strong>
              <p>Refine template, copy, images, and preview</p>
            </div>
          </button>

          <button
            v-if="showLandingPageControls && !site?.published_at"
            class="action-card"
            @click="publishLandingPage"
          >
            <span class="action-icon">
              <UiIcon name="Check" :size="24" />
            </span>
            <div class="action-content">
              <strong>{{ publishBusy ? "Publishing..." : "Publish" }}</strong>
              <p>Make this landing page live on its subdomain</p>
            </div>
          </button>

          <button
            v-if="showLandingPageControls && site?.published_at"
            class="action-card"
            @click="unpublishLandingPage"
          >
            <span class="action-icon">
              <UiIcon name="X" :size="24" />
            </span>
            <div class="action-content">
              <strong>{{
                publishBusy ? "Unpublishing..." : "Unpublish"
              }}</strong>
              <p>Take the page offline while keeping the draft intact</p>
            </div>
          </button>

          <button
            v-if="site?.published_at && isProfileSite"
            class="action-card"
            @click="downloadSite"
          >
            <span class="action-icon">
              <UiIcon name="Download" :size="24" />
            </span>
            <div class="action-content">
              <strong>Download Site</strong>
              <p>Get a zip file with your site files</p>
            </div>
          </button>
        </div>
        <p v-if="publishError" class="error">{{ publishError }}</p>
      </section>

      <section
        v-if="showLandingPageTools"
        id="landing-pages"
        class="landing-pages-section"
      >
        <div class="landing-pages-head">
          <div>
            <h2>Landing pages</h2>
            <p>{{ landingPageSites.length }} page{{ landingPageSites.length === 1 ? "" : "s" }}</p>
          </div>
          <router-link class="button secondary" :to="newLandingPageRoute">
            Add
          </router-link>
        </div>

        <div v-if="landingPageSites.length > 0" class="landing-page-list">
          <router-link
            v-for="landing in landingPageSites"
            :key="landing.id"
            class="landing-page-row"
            :to="`/sites/${landing.username}/build`"
          >
            <span>
              <strong>{{ landing.username }}</strong>
              <small>{{ landingTemplateLabel(landing.template_id) }}</small>
            </span>
            <span
              class="status"
              :class="landing.published_at ? 'published' : 'draft'"
            >
              {{ landing.published_at ? "Published" : "Draft" }}
            </span>
          </router-link>
        </div>

        <div v-else class="landing-empty">
          <p>No landing pages yet.</p>
          <router-link class="button" :to="newLandingPageRoute">
            Create one
          </router-link>
        </div>
      </section>

      <!-- Newsletter Subscribers -->
      <section
        v-if="site?.published_at && isProfileSite"
        class="subscribers-section"
      >
        <NewsletterSubscribers :username="username" />
      </section>

      <!-- Advanced Upload (Collapsible) TODO not sure this is needed for now-->
      <section v-if="isProfileSite" class="advanced-section">
        <button
          class="section-toggle"
          @click="showAdvancedUpload = !showAdvancedUpload"
        >
          <span>Advanced: Upload site files directly</span>
          <span class="toggle-icon">{{ showAdvancedUpload ? "−" : "+" }}</span>
        </button>

        <div v-if="showAdvancedUpload" class="advanced-content">
          <p class="section-desc">
            Upload your <code>me.json</code>, a full site <code>.zip</code>, or
            an extracted site folder directly.
          </p>

          <div
            class="drop-zone"
            :class="{ dragging: isDragging }"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
          >
            <div class="drop-content">
              <div class="drop-icon">📁</div>
              <p>
                Drag files here or
                <label class="file-label">
                  browse files
                  <input
                    type="file"
                    multiple
                    accept=".zip,.json,.md,.jpg,.jpeg,.png,.gif,.svg,.webp"
                    @change="handleFileSelect"
                  />
                </label>
              </p>
              <p>
                Or
                <label class="file-label">
                  choose a folder
                  <input
                    type="file"
                    multiple
                    webkitdirectory
                    directory
                    @change="handleDirectorySelect"
                  />
                </label>
              </p>
              <p class="drop-hint">
                me3 zip, me.json, nested markdown, and images
              </p>
            </div>
          </div>

          <div v-if="selectedFiles.length > 0" class="selected-files">
            <h3>Selected files ({{ selectedFiles.length }})</h3>
            <ul class="file-list">
              <li
                v-for="file in selectedFiles"
                :key="file.name"
                class="file-item"
              >
                <span class="file-name">{{ file.name }}</span>
                <button class="remove-btn" @click="removeFile(file.name)">
                  ×
                </button>
              </li>
            </ul>

            <button
              class="button"
              :disabled="
                isPreparingUpload ||
                sites.loading ||
                !selectedFiles.some((f) => f.name === 'me.json')
              "
              @click="uploadFiles"
            >
              {{
                isPreparingUpload
                  ? "Preparing..."
                  : sites.loading
                    ? "Uploading..."
                    : "Upload & Publish"
              }}
            </button>
          </div>

          <p v-if="uploadError" class="error">{{ uploadError }}</p>
          <p v-if="uploadNotice" class="section-desc">{{ uploadNotice }}</p>
          <p v-if="uploadSuccess" class="success">
            ✓ Site published! <a :href="siteUrl" target="_blank">View it →</a>
          </p>
        </div>
      </section>

      <!-- Danger Zone -->
      <section class="danger-section">
        <h2>Danger zone</h2>
        <div class="danger-card">
          <div>
            <strong>Delete this site</strong>
            <p>
              Once deleted, this username will be available for others to claim.
            </p>
          </div>
          <button class="button danger" @click="showDeleteConfirm = true">
            Delete
          </button>
        </div>
      </section>
    </main>

    <!-- Delete Confirmation Modal -->
    <div
      v-if="showDeleteConfirm"
      class="modal-overlay"
      @click.self="showDeleteConfirm = false"
    >
      <div class="modal">
        <h2>Delete site?</h2>
        <p>
          Are you sure you want to delete
          <strong>{{ username }}</strong>? This action cannot be undone.
        </p>
        <div class="modal-actions">
          <button class="button secondary" @click="showDeleteConfirm = false">
            Cancel
          </button>
          <button
            class="button danger"
            :disabled="isDeleting"
            @click="deleteSite"
          >
            {{ isDeleting ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.site-page {
  min-height: 100vh;
}

.main {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px 40px;
}

.site-header {
  display: grid;
  gap: 8px;
  margin-bottom: 32px;
}

.site-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -12px 0 28px;
}

.site-tab {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  padding: 0 12px;
  color: var(--ui-text-muted, var(--color-text-muted));
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
}

.site-tab.active {
  background: var(--ui-accent-soft, rgba(16, 185, 129, 0.12));
  border-color: var(--ui-accent, var(--color-accent));
  color: var(--ui-text, var(--color-text));
}

.analytics-section {
  margin-bottom: 32px;
}

.site-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.site-info-main {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.site-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  flex: 1 1 0;
  min-width: 0;
}

.site-title-plain {
  display: flex;
  min-width: 0;
  max-width: 100%;
}

.site-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.site-title a {
  color: inherit;
  text-decoration: none;
}

.site-link {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.site-link .site-title-text {
  flex: 1 1 auto;
}

.site-link-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.site-link:hover .site-link-icon {
  opacity: 1;
}

.site-title a:hover {
  text-decoration: underline;
}

.site-info-main .site-badges {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.site-info-main .site-badges .status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1.25;
}

.status {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 20px;
}

.status.published {
  background: #e8f5e9;
  color: #2e7d32;
}

.status.draft {
  background: var(--color-border);
  color: var(--color-text-muted);
}

.status.site-kind {
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

@media (max-width: 959px) {
  .site-info-main {
    padding-left: 24px;
  }
}

/* Actions Section */
.actions-section {
  margin-bottom: 32px;
}

.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.action-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-border);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  text-decoration: none;
  color: var(--color-text);
  transition:
    border-color 0.2s,
    transform 0.2s;
}

.action-card:hover {
  border-color: var(--color-text);
  transform: translateY(-1px);
}

.action-card.primary {
  background: var(--color-text);
  color: var(--color-bg);
}

.action-card.primary:hover {
  border-color: transparent;
  opacity: 0.95;
}

.action-icon {
  font-size: 24px;
}

.action-content {
  text-align: left;
}

.action-content strong {
  display: block;
  font-size: 15px;
  margin-bottom: 2px;
}

.action-content p {
  font-size: 12px;
  opacity: 0.8;
  margin: 0;
}

/* Advanced Section */
.advanced-section {
  margin-bottom: 32px;
}

.section-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--color-border);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.section-toggle:hover {
  opacity: 0.9;
}

.toggle-icon {
  font-size: 20px;
  color: var(--color-text-muted);
}

.advanced-content {
  margin-top: 16px;
  padding: 20px;
  background: var(--color-border);
  border-radius: 12px;
}

.section-desc {
  color: var(--color-text-muted);
  margin-bottom: 16px;
  font-size: 14px;
}

.section-desc code {
  background: rgba(128, 128, 128, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

.drop-zone {
  border: 2px dashed rgba(128, 128, 128, 0.4);
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
  transition:
    border-color 0.2s,
    background 0.2s;
}

.drop-zone.dragging {
  border-color: var(--color-text);
  background: rgba(128, 128, 128, 0.1);
}

.drop-icon {
  font-size: 36px;
  margin-bottom: 12px;
}

.drop-content p {
  margin-bottom: 6px;
  font-size: 14px;
}

.drop-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.file-label {
  color: var(--color-text);
  text-decoration: underline;
  cursor: pointer;
}

.file-label input {
  display: none;
}

.selected-files {
  margin-top: 16px;
  padding: 16px;
  background: rgba(128, 128, 128, 0.1);
  border-radius: 8px;
}

.selected-files h3 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.file-list {
  list-style: none;
  margin-bottom: 12px;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}

.file-item:last-child {
  border-bottom: none;
}

.file-name {
  font-size: 13px;
}

.remove-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0 6px;
}

.remove-btn:hover {
  color: #e53935;
}

.button {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.button:hover:not(:disabled) {
  opacity: 0.9;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button.secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.button.danger {
  background: #e53935;
  color: white;
}

.error {
  margin-top: 12px;
  color: #e53935;
  font-size: 13px;
}

.success {
  margin-top: 12px;
  color: #4caf50;
  font-size: 13px;
}

.success a {
  color: #4caf50;
}

.landing-pages-section {
  margin-bottom: 32px;
  padding: 18px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
  background: var(--ui-surface, var(--color-bg));
}

.landing-pages-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.landing-pages-head h2 {
  margin: 0;
  font-size: 18px;
}

.landing-pages-head p,
.landing-empty p {
  margin: 4px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
}

.landing-page-list {
  display: grid;
  gap: 8px;
}

.landing-page-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
  color: inherit;
  text-decoration: none;
}

.landing-page-row:hover {
  border-color: var(--ui-border-strong, var(--color-text-muted));
}

.landing-page-row strong,
.landing-page-row small {
  display: block;
}

.landing-page-row small {
  margin-top: 2px;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.landing-empty {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px dashed var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
}

/* Site badges row */
.site-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Danger Section */
.danger-section {
  margin-top: 24px;
}

.danger-section h2 {
  font-size: 18px;
  color: #e53935;
  margin-bottom: 12px;
}

.danger-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border: 1px solid #ffcdd2;
  border-radius: 12px;
  background: #ffebee;
}

.danger-card strong {
  font-size: 14px;
}

.danger-card p {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}

.modal {
  background: var(--color-bg);
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 400px;
}

.modal h2 {
  font-size: 24px;
  margin-bottom: 12px;
}

.modal p {
  color: var(--color-text-muted);
  margin-bottom: 24px;
}

.modal strong {
  color: var(--color-text);
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.modal-actions .button {
  flex: 1;
}

/* Subscribers Section */
.subscribers-section {
  margin-bottom: 24px;
  padding: 20px;
  background: var(--color-border);
  border-radius: 12px;
}

@media (max-width: 500px) {
  .actions-grid {
    grid-template-columns: 1fr;
  }

}

@media (prefers-color-scheme: dark) {
  .status.published {
    background: #1b5e20;
    color: #a5d6a7;
  }
}
</style>
