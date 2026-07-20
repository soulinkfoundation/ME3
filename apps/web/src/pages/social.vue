<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import AppDialog from "../components/AppDialog.vue";
import Button from "../components/Button.vue";
import SocialAccountsPanel from "../components/SocialAccountsPanel.vue";
import SocialCarouselEditor from "../components/SocialCarouselEditor.vue";
import UiIcon from "../components/UiIcon.vue";
import WorkspaceTabs from "../components/WorkspaceTabs.vue";
import { socialPlatformIconPath } from "../utils/social-platform-icons";
import { useSitesStore } from "../stores/sites";
import {
  useSocialStore,
  type PostVersion,
  type PostLibraryItem,
  type PublicationStatus,
  type RenderAndAttachSocialCarouselResult,
  type SocialAccountRow,
  type SocialPlatform,
  type SocialPlatformCapabilities,
  type SocialPostDetail,
} from "../stores/social";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Social | ME3",
    description: "Write, review, approve, and publish social posts.",
    robots: "noindex,follow",
  },
});

type WorkspaceMode = "drafts" | "scheduled" | "published";

const sites = useSitesStore();
const social = useSocialStore();
const selectedSiteId = ref("");
const posts = ref<SocialPostDetail[]>([]);
const accounts = ref<SocialAccountRow[]>([]);
const capabilities = ref<SocialPlatformCapabilities[]>([]);
const activeMode = ref<WorkspaceMode>("drafts");
const selectedPostId = ref<string | null>(null);
const selectedVersionId = ref<string | null>(null);
const editorBody = ref("");
const editorAccountId = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const showAccounts = ref(false);
const composeOpen = ref(false);
const composeBody = ref("");
const composePlatforms = ref<SocialPlatform[]>([]);
const composeError = ref("");
const carouselEditorVersionId = ref<string | null>(null);
const showLibraryFilters = ref(false);
const libraryQuery = ref("");
const librarySource = ref("");
const libraryPlatform = ref<SocialPlatform | "">("");
const libraryAccountId = ref("");
const libraryDelivery = ref<PublicationStatus | "">("");
const libraryPublishedFrom = ref("");
const libraryPublishedTo = ref("");
const libraryResults = ref<PostLibraryItem[] | null>(null);
const librarySearching = ref(false);

const currentSite = computed(
  () => sites.sites.find((site) => site.id === selectedSiteId.value) || null,
);

const activeAccounts = computed(() =>
  accounts.value.filter(
    (account) => account.siteId === selectedSiteId.value && account.status === "active",
  ),
);

const libraryVersionIds = computed(() =>
  libraryResults.value === null
    ? null
    : new Set(libraryResults.value.map((item) => item.versionId)),
);

function visibleVersionsFor(detail: SocialPostDetail): PostVersion[] {
  const matchingIds = libraryVersionIds.value;
  return matchingIds
    ? detail.versions.filter((version) => matchingIds.has(version.id))
    : detail.versions.filter((version) => versionMode(version) === activeMode.value);
}

const visiblePosts = computed(() =>
  posts.value
    .filter((detail) =>
      visibleVersionsFor(detail).length > 0
    )
    .sort(
      (left, right) =>
        Date.parse(right.post.updatedAt) - Date.parse(left.post.updatedAt),
    ),
);

const modeTabs = computed(() =>
  (["drafts", "scheduled", "published"] as WorkspaceMode[]).map((id) => ({
    id,
    label: id[0]!.toUpperCase() + id.slice(1),
    count: posts.value.filter((detail) =>
      detail.versions.some((version) => versionMode(version) === id),
    ).length,
  })),
);

const libraryResultBreakdown = computed(() => {
  if (libraryResults.value === null) return "";
  const counts: Record<WorkspaceMode, number> = { drafts: 0, scheduled: 0, published: 0 };
  for (const result of libraryResults.value) {
    const detail = posts.value.find((item) => item.post.id === result.postId);
    const version = detail?.versions.find((item) => item.id === result.versionId);
    if (version) counts[versionMode(version)] += 1;
  }
  return (["drafts", "scheduled", "published"] as WorkspaceMode[])
    .filter((mode) => counts[mode] > 0)
    .map((mode) => `${counts[mode]} ${mode === "drafts" ? "Draft" : mode === "scheduled" ? "Scheduled" : "Published"}`)
    .join(" · ");
});

const selectedPost = computed(
  () => posts.value.find((detail) => detail.post.id === selectedPostId.value) || null,
);

const selectedVersion = computed(
  () =>
    selectedPost.value?.versions.find((version) => version.id === selectedVersionId.value) ||
    null,
);

const carouselEditorOpen = computed(() =>
  Boolean(
    selectedVersion.value?.format === "carousel" &&
      carouselEditorVersionId.value === selectedVersion.value.id,
  ),
);

const selectedVisibleVersions = computed(() =>
  selectedPost.value ? visibleVersionsFor(selectedPost.value) : [],
);

const selectedPostReadOnly = computed(
  () => selectedPost.value?.post.sourceType === "legacy_content_bank_read_only",
);

const editorDirty = computed(() => {
  const version = selectedVersion.value;
  return Boolean(
    version &&
      (editorBody.value.trim() !== version.bodyText ||
        (editorAccountId.value || null) !== version.targetAccountId),
  );
});

const canApprove = computed(() =>
  Boolean(
    !selectedPostReadOnly.value &&
      selectedVersion.value &&
      editorBody.value.trim() &&
      editorAccountId.value,
  ),
);

const composeOptions = computed(() =>
  capabilities.value.filter((item) => item.draft && activeAccounts.value.some((account) => account.platform === item.platform)).map((item) => ({
    ...item,
    label: platformLabel(item.platform),
    connected: activeAccounts.value.some((account) => account.platform === item.platform),
  })),
);

const composeCanSave = computed(
  () => Boolean(composeBody.value.trim() && composePlatforms.value.length),
);

const advancedFiltersActive = computed(() =>
  Boolean(
    librarySource.value ||
      libraryPlatform.value ||
      libraryAccountId.value ||
      libraryDelivery.value ||
      libraryPublishedFrom.value ||
      libraryPublishedTo.value,
  ),
);

function platformLabel(platform: string): string {
  if (platform === "x") return "X";
  if (platform === "linkedin") return "LinkedIn";
  return platform === "instagram_business" ? "Instagram Business" : "Instagram";
}

function platformShortLabel(platform: SocialPlatform): string {
  if (platform === "linkedin") return "in";
  if (platform === "instagram_business") return "IG+";
  if (platform === "instagram") return "IG";
  return "X";
}

function platformIconPath(platform: SocialPlatform): string {
  return socialPlatformIconPath(platform);
}

function previewAccountName(version: PostVersion): string {
  const account = accounts.value.find((item) => item.id === version.targetAccountId);
  return account?.displayName || account?.handle || "Your account";
}

function previewAccountHandle(version: PostVersion): string {
  const account = accounts.value.find((item) => item.id === version.targetAccountId);
  return account?.handle ? `@${account.handle.replace(/^@/, "")}` : "@you";
}

function isVideoAsset(asset: PostVersion["assetManifest"][number]): boolean {
  return asset.kind === "video" || asset.mimeType?.startsWith("video/") === true;
}

function previewLinkUrl(bodyText: string): string | null {
  return bodyText.match(/https?:\/\/[^\s<>()]+/i)?.[0] || null;
}

function previewLinkHost(bodyText: string): string {
  const url = previewLinkUrl(bodyText);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function externalSourceUrl(detail: SocialPostDetail): string | null {
  const sourceRef = detail.post.sourceRef?.trim();
  return sourceRef && /^https?:\/\//i.test(sourceRef) ? sourceRef : null;
}

function versionState(version: PostVersion): string {
  if (version.failureClass || version.publicationStatus === "failed") return "Failed";
  if (version.publicationStatus === "publishing" || version.publicationStatus === "queued") {
    return "Publishing";
  }
  if (version.publicationStatus === "published") return "Published";
  if (version.scheduledFor) return "Scheduled";
  if (version.approvalStatus === "approved") return "Approved";
  return "Draft";
}

function versionMode(version: PostVersion): WorkspaceMode {
  if (version.publicationStatus === "published") return "published";
  if (
    version.scheduledFor ||
    version.publicationStatus === "queued" ||
    version.publicationStatus === "publishing"
  ) {
    return "scheduled";
  }
  return "drafts";
}

function postStatus(detail: SocialPostDetail): string {
  const states = visibleVersionsFor(detail).map(versionState);
  if (states.includes("Failed")) return "Failed";
  if (states.includes("Publishing")) return "Publishing";
  if (states.includes("Scheduled")) return "Scheduled";
  if (states.includes("Published")) return "Published";
  if (states.includes("Approved")) return "Approved";
  return "Draft";
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function setActiveMode(value: string) {
  if (!(value === "drafts" || value === "scheduled" || value === "published")) return;
  activeMode.value = value;
  ensureVisibleSelection();
}

function selectPost(detail: SocialPostDetail) {
  selectedPostId.value = detail.post.id;
  const version = visibleVersionsFor(detail)[0] || null;
  selectVersion(version);
}

async function searchLibrary() {
  if (!selectedSiteId.value) return;
  librarySearching.value = true;
  error.value = "";
  try {
    libraryResults.value = await social.searchPostLibrary({
      siteId: selectedSiteId.value,
      query: libraryQuery.value || undefined,
      source: librarySource.value || undefined,
      platform: libraryPlatform.value || undefined,
      accountId: libraryAccountId.value || undefined,
      deliveryState: libraryDelivery.value || undefined,
      publishedFrom: libraryPublishedFrom.value
        ? new Date(`${libraryPublishedFrom.value}T00:00:00`).toISOString()
        : undefined,
      publishedTo: libraryPublishedTo.value
        ? new Date(`${libraryPublishedTo.value}T00:00:00`).toISOString()
        : undefined,
      limit: 100,
    });
    ensureVisibleSelection();
  } catch (value) {
    social.setErrorFromApi(value, "Failed to search the Post library");
    error.value = social.error || "Failed to search the Post library";
  } finally {
    librarySearching.value = false;
  }
}

function clearLibrarySearch() {
  libraryQuery.value = "";
  librarySource.value = "";
  libraryPlatform.value = "";
  libraryAccountId.value = "";
  libraryDelivery.value = "";
  libraryPublishedFrom.value = "";
  libraryPublishedTo.value = "";
  libraryResults.value = null;
  ensureVisibleSelection();
}

async function applyLibraryFilters() {
  await searchLibrary();
  showLibraryFilters.value = false;
}

function selectVersion(version: PostVersion | null) {
  if (carouselEditorVersionId.value && carouselEditorVersionId.value !== version?.id) {
    carouselEditorVersionId.value = null;
  }
  selectedVersionId.value = version?.id || null;
  editorBody.value = version?.bodyText || "";
  editorAccountId.value = version?.targetAccountId || activeAccounts.value.find(
    (account) => account.platform === version?.platform,
  )?.id || "";
}

function openCarouselEditor() {
  if (selectedVersion.value?.format !== "carousel" || selectedPostReadOnly.value) return;
  carouselEditorVersionId.value = selectedVersion.value.id;
}

function closeCarouselEditor() {
  carouselEditorVersionId.value = null;
}

function handleCarouselAttached(result: RenderAndAttachSocialCarouselResult) {
  const version = selectedVersion.value;
  if (!version || result.version.id !== version.id) return;
  replaceVersion({
    ...version,
    assetManifest: result.renderSet.assetManifest,
    approvalStatus: result.version.approvalStatus,
    updatedAt: result.version.updatedAt,
    carouselRenderSetId: result.version.carouselRenderSetId,
    ...(result.approvalPreserved
      ? {}
      : {
          approvedAt: null,
          approvedByUserId: null,
          scheduledFor: null,
          timezone: null,
          publicationStatus: version.publicationStatus === "scheduled" ? "cancelled" : version.publicationStatus,
        }),
  });
  notice.value = result.approvalPreserved
    ? "Identical Carousel output attached. Existing approval and schedules were preserved."
    : "Carousel output changed. Approval was reset and scheduled Publications were cancelled.";
}

function ensureVisibleSelection() {
  const current = visiblePosts.value.find((detail) => detail.post.id === selectedPostId.value);
  if (current) {
    selectPost(current);
  } else if (visiblePosts.value[0]) {
    selectPost(visiblePosts.value[0]);
  } else {
    selectedPostId.value = null;
    selectVersion(null);
  }
}

function selectLinkedSocialRecord(): boolean {
  const postId = currentQueryParam("postId");
  const versionId = currentQueryParam("versionId");
  if (!postId || !versionId) return false;
  const detail = posts.value.find((item) => item.post.id === postId);
  const version = detail?.versions.find((item) => item.id === versionId) || null;
  if (!detail || !version) return false;
  activeMode.value = versionMode(version);
  selectedPostId.value = detail.post.id;
  selectVersion(version);
  return true;
}

async function loadWorkspace() {
  if (!selectedSiteId.value) return;
  const requestedSiteId = selectedSiteId.value;
  loading.value = true;
  error.value = "";
  try {
    const [nextPosts, nextAccounts, status] = await Promise.all([
      social.fetchSocialPosts(requestedSiteId),
      social.fetchSocialAccounts(),
      social.fetchSocialStatus(),
    ]);
    if (selectedSiteId.value !== requestedSiteId) return;
    posts.value = nextPosts;
    accounts.value = nextAccounts;
    capabilities.value = status.plugin.platformCapabilities || [];
    if (!selectLinkedSocialRecord()) ensureVisibleSelection();
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load social posts");
    error.value = social.error || "Failed to load social posts";
  } finally {
    loading.value = false;
  }
}


function replaceVersion(version: PostVersion) {
  posts.value = posts.value.map((detail) =>
    detail.post.id === version.postId
      ? {
          ...detail,
          versions: detail.versions.map((item) => (item.id === version.id ? version : item)),
        }
      : detail,
  );
  selectVersion(version);
}

async function saveVersion() {
  const version = selectedVersion.value;
  if (!version || selectedPostReadOnly.value || !editorBody.value.trim()) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    replaceVersion(
      await social.updatePostVersion(version.id, {
        bodyText: editorBody.value,
        targetAccountId: editorAccountId.value || null,
      }),
    );
    notice.value = "Draft saved. Approval was removed if this Version changed.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save this Version");
    error.value = social.error || "Failed to save this Version";
  } finally {
    saving.value = false;
  }
}

async function approveVersion() {
  const version = selectedVersion.value;
  if (!version || selectedPostReadOnly.value || !canApprove.value) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    replaceVersion(
      await social.updatePostVersion(version.id, {
        bodyText: editorBody.value,
        targetAccountId: editorAccountId.value,
        approvalStatus: "approved",
      }),
    );
    notice.value = "Exact account Version approved. It has not been published.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to approve this Version");
    error.value = social.error || "Failed to approve this Version";
  } finally {
    saving.value = false;
  }
}

function openCompose() {
  composeBody.value = "";
  composeError.value = "";
  const connected = composeOptions.value;
  composePlatforms.value = connected.length === 1 ? [connected[0]!.platform] : [];
  composeOpen.value = true;
}

function toggleComposePlatform(platform: SocialPlatform) {
  composePlatforms.value = composePlatforms.value.includes(platform)
    ? composePlatforms.value.filter((item) => item !== platform)
    : [...composePlatforms.value, platform];
}

async function saveComposedPost() {
  const site = currentSite.value;
  const sourceText = composeBody.value.trim();
  if (!site || !composeCanSave.value || !sourceText) return;
  saving.value = true;
  error.value = "";
  composeError.value = "";
  try {
    const detail = await social.createSocialPost({
      siteId: site.id,
      sourceType: "pasted",
      sourceSnapshot: sourceText,
      sourceText,
      ideaText: sourceText.length > 120 ? `${sourceText.slice(0, 117)}…` : sourceText,
      versions: composePlatforms.value.map((platform) => {
        const platformAccounts = activeAccounts.value.filter(
          (account) => account.platform === platform,
        );
        return {
          platform,
          bodyText: sourceText,
          targetAccountId: platformAccounts[0]!.id,
        };
      }),
    });
    composeOpen.value = false;
    posts.value = [detail, ...posts.value];
    activeMode.value = "drafts";
    selectPost(detail);
    notice.value = "Source-backed Post saved for review.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save this Post");
    composeError.value = social.error || "Failed to save this Post";
  } finally {
    saving.value = false;
  }
}

watch(selectedSiteId, () => {
  void loadWorkspace();
});

onMounted(async () => {
  if (sites.sites.length === 0) await sites.fetchSites();
  const linkedSiteId = currentQueryParam("siteId");
  selectedSiteId.value =
    sites.sites.find((site) => site.id === linkedSiteId)?.id ||
    sites.sites[0]?.id ||
    "";
});

function currentQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name)?.trim() || null;
}

</script>

<template>
  <div class="social-page">
    <main class="social-main">
      <h1 class="sr-only">Social Publishing</h1>
      <div v-if="error" class="state-banner state-banner--error" role="alert">{{ error }}</div>
      <div v-if="notice" class="state-banner" role="status" aria-live="polite">
        {{ notice }}
      </div>

      <header class="social-toolbar">
        <form class="social-toolbar__search" role="search" @submit.prevent="searchLibrary">
          <label>
            <span class="sr-only">Search Post library</span>
            <UiIcon name="Search" :size="17" aria-hidden="true" />
            <input v-model="libraryQuery" type="search" placeholder="Search posts" />
          </label>
          <Button
            v-if="libraryResults !== null"
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Clear post search"
            title="Clear search"
            @click="clearLibrarySearch"
          >
            <UiIcon name="X" :size="16" aria-hidden="true" />
          </Button>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Open advanced search filters"
            title="Advanced filters"
            :class="{ 'library-filter-button--active': advancedFiltersActive }"
            @click="showLibraryFilters = true"
          >
            <UiIcon name="SlidersHorizontal" :size="17" aria-hidden="true" />
          </Button>
        </form>
        <div class="toolbar-actions">
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Manage social accounts"
            title="Social accounts"
            @click="showAccounts = true"
          >
            <UiIcon name="Settings" :size="18" aria-hidden="true" />
          </Button>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="New Post"
            title="New Post"
            :disabled="!currentSite || composeOptions.length === 0"
            @click="openCompose"
          >
            <UiIcon name="SquarePen" :size="18" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div v-if="sites.sites.length === 0" class="empty-state">
        <strong>Finish account setup to start publishing.</strong>
        <RouterLink to="/onboarding">Continue setup</RouterLink>
      </div>

      <div v-else class="social-workspace-shell">
        <nav class="social-tabs-rail" aria-label="Social publishing views">
          <WorkspaceTabs
            :tabs="modeTabs"
            :model-value="activeMode"
            aria-label="Social publishing views"
            semantics="navigation"
            @update:model-value="setActiveMode"
          />
        </nav>

        <div class="social-workspace" :aria-busy="loading">
          <section class="post-list" aria-label="Social posts">
          <p v-if="libraryResults !== null" class="library-result-count" role="status">
            {{ libraryResults.length }} matching Version{{ libraryResults.length === 1 ? '' : 's' }}<template v-if="libraryResultBreakdown"> · {{ libraryResultBreakdown }}</template>
          </p>
          <div v-if="loading" class="empty-state">Loading social posts…</div>
          <div v-else-if="visiblePosts.length === 0" class="empty-state">
            <strong>{{ libraryResults !== null ? 'No matching Posts.' : `No ${activeMode} yet.` }}</strong>
            <span v-if="activeMode === 'drafts' && libraryResults === null">Write a Post or ask the agent to repurpose a journal entry, blog post, or project task.</span>
            <Button
              v-if="activeMode === 'drafts' && libraryResults === null"
              color="outline"
              shape="soft"
              size="compact"
              type="button"
              :disabled="composeOptions.length === 0"
              @click="openCompose"
            >
              Write a Post
            </Button>
          </div>
          <template v-else>
            <button
              v-for="detail in visiblePosts"
              :key="detail.post.id"
              type="button"
              class="post-row"
              :class="{ 'post-row--active': selectedPostId === detail.post.id }"
              :aria-current="selectedPostId === detail.post.id ? 'true' : undefined"
              @click="selectPost(detail)"
            >
              <span class="post-row__meta">
                <time :datetime="detail.post.updatedAt">{{ formatDate(detail.post.updatedAt) }}</time>
              </span>
              <strong>{{ detail.post.ideaText }}</strong>
              <span class="post-row__footer">
                <span class="platform-list">
                  <span v-for="version in visibleVersionsFor(detail)" :key="version.id" class="platform-chip">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="platformIconPath(version.platform)" /></svg>
                    <span class="sr-only">{{ platformLabel(version.platform) }}</span>
                  </span>
                </span>
                <span class="row-status">{{ postStatus(detail) }}</span>
              </span>
            </button>
          </template>
          </section>

          <section v-if="selectedPost" class="post-detail" aria-live="polite">
          <header class="detail-header">
            <div>
              <h2>{{ selectedPost.post.ideaText }}</h2>
              <a
                v-if="externalSourceUrl(selectedPost)"
                class="source-link"
                :href="externalSourceUrl(selectedPost)!"
                target="_blank"
                rel="noopener noreferrer"
              >
                View source <UiIcon name="ExternalLink" :size="14" aria-hidden="true" />
              </a>
            </div>
          </header>

          <aside
            v-if="selectedPostReadOnly"
            class="state-banner read-only-banner"
            aria-label="Imported Post is read-only"
          >
            <strong>Imported Post — read-only</strong>
            <span>
              This legacy content is preserved for reference and Publication history. Create a
              source-backed Post to edit, approve, schedule, or publish it again.
            </span>
          </aside>

          <div class="version-tabs" role="group" aria-label="Platform Versions">
            <button
              v-for="version in selectedVisibleVersions"
              :key="version.id"
              type="button"
              :aria-pressed="selectedVersionId === version.id"
              :class="['version-tab', { 'version-tab--active': selectedVersionId === version.id }]"
              @click="selectVersion(version)"
            >
              {{ platformLabel(version.platform) }}
              <span>{{ versionState(version) }}</span>
            </button>
          </div>

          <div v-if="selectedVersion" class="version-workspace">
            <div class="version-editor">
              <label class="field">
                <span class="sr-only">Post text</span>
                <textarea
                  v-model="editorBody"
                  rows="10"
                  :disabled="saving"
                  :readonly="selectedPostReadOnly"
                />
              </label>

              <div v-if="!selectedPostReadOnly" class="editor-actions">
                <Button color="outline" shape="soft" size="compact" type="button" :disabled="saving || !editorDirty" @click="saveVersion">
                  Save Draft
                </Button>
                <Button color="primary" shape="soft" size="compact" type="button" :disabled="saving || !canApprove" @click="approveVersion">
                  Approve Version
                </Button>
              </div>

              <section
                v-if="selectedVersion.format === 'carousel' && !selectedPostReadOnly"
                class="carousel-editor-entry"
                aria-labelledby="carousel-editor-entry-title"
              >
                <div>
                  <strong id="carousel-editor-entry-title">Carousel slides</strong>
                  <span>
                    Edit deterministic, Source-backed slides before approving this exact Version.
                  </span>
                </div>
                <Button color="outline" shape="soft" type="button" @click="openCarouselEditor">
                  {{ selectedVersion.carouselRenderSetId ? 'Edit Carousel' : 'Build Carousel' }}
                </Button>
              </section>
            </div>

            <aside :class="['post-preview', `post-preview--${selectedVersion.platform}`]" aria-label="Post preview">
              <div class="preview-platform-bar">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="platformIconPath(selectedVersion.platform)" /></svg>
                <span>{{ platformLabel(selectedVersion.platform) }}</span>
              </div>
              <div class="preview-profile">
                <span class="preview-avatar">{{ previewAccountName(selectedVersion).slice(0, 1).toUpperCase() }}</span>
                <span><strong>{{ previewAccountName(selectedVersion) }}</strong><small>{{ previewAccountHandle(selectedVersion) }} · now</small></span>
                <UiIcon name="Ellipsis" :size="18" aria-hidden="true" />
              </div>
              <p>{{ editorBody || 'Your Post preview will appear here.' }}</p>
              <div
                v-if="selectedVersion.assetManifest.length"
                :class="[
                  'preview-media',
                  { 'preview-media--gallery': selectedVersion.assetManifest.length > 1 },
                ]"
              >
                <template v-for="(asset, index) in selectedVersion.assetManifest" :key="`${asset.url}-${index}`">
                  <video
                    v-if="isVideoAsset(asset)"
                    :src="asset.url"
                    controls
                    muted
                    preload="metadata"
                    :aria-label="asset.altText || asset.filename || 'Post video'"
                  />
                  <img
                    v-else
                    :src="asset.url"
                    :alt="asset.altText || asset.filename || 'Post image'"
                  />
                </template>
                <span v-if="selectedVersion.assetManifest.length > 1" class="preview-media__count">
                  <UiIcon name="Copy" :size="14" aria-hidden="true" />
                  {{ selectedVersion.assetManifest.length }}
                </span>
              </div>
              <a
                v-if="previewLinkUrl(editorBody)"
                class="preview-link-card"
                :href="previewLinkUrl(editorBody)!"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="preview-link-card__eyebrow">{{ previewLinkHost(editorBody) }}</span>
                <strong>{{ previewLinkUrl(editorBody) }}</strong>
              </a>
              <a v-if="selectedVersion.platformPostUrl" :href="selectedVersion.platformPostUrl" target="_blank" rel="noopener noreferrer">
                View published Post
              </a>
              <div class="preview-actions" aria-hidden="true">
                <UiIcon name="MessageCircle" :size="17" />
                <UiIcon name="Redo" :size="17" />
                <UiIcon name="Heart" :size="17" />
                <UiIcon name="Send" :size="17" />
              </div>
            </aside>
          </div>

          </section>

          <section v-else class="detail-empty" aria-label="No social Post selected">
            <UiIcon name="SquarePen" :size="24" aria-hidden="true" />
            <p>Select a Post to review it, or write a new one.</p>
          </section>
        </div>
      </div>
    </main>

    <AppDialog :open="composeOpen" labelled-by="social-compose-title" @close="composeOpen = false">
      <form class="compose-card" @submit.prevent="saveComposedPost">
        <header>
          <div>
            <h2 id="social-compose-title">New Social Post</h2>
            <p>Your text becomes the Post’s human-authored Source.</p>
          </div>
          <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close compose" @click="composeOpen = false">
            <UiIcon name="X" :size="17" aria-hidden="true" />
          </Button>
        </header>

        <div
          v-if="composeError"
          class="state-banner state-banner--error compose-error"
          role="alert"
        >
          {{ composeError }}
        </div>

        <fieldset>
          <legend>Versions</legend>
          <div class="platform-picker">
            <button
              v-for="platform in composeOptions"
              :key="platform.platform"
              type="button"
              :class="['platform-target', { 'platform-target--active': composePlatforms.includes(platform.platform) }]"
              :aria-pressed="composePlatforms.includes(platform.platform)"
              @click="toggleComposePlatform(platform.platform)"
            >
              <span class="platform-mark">{{ platformShortLabel(platform.platform) }}</span>
              <span>{{ platform.label }}</span>
              <small>{{ platform.publish ? 'Publishing ready' : 'Draft only' }}</small>
            </button>
          </div>
        </fieldset>

        <label class="field">
          <span>Source text</span>
          <textarea v-model="composeBody" rows="10" placeholder="Paste or write something you created…" autofocus />
        </label>

        <footer>
          <Button color="outline" shape="soft" size="compact" type="button" :disabled="saving" @click="composeOpen = false">
            Cancel
          </Button>
          <Button color="primary" shape="soft" size="compact" type="submit" :disabled="saving || !composeCanSave">
            {{ saving ? 'Saving…' : 'Save Post' }}
          </Button>
        </footer>
      </form>
    </AppDialog>

    <AppDialog :open="showAccounts" aria-label="Social accounts" @close="showAccounts = false">
      <section class="accounts-card">
        <Button class="accounts-close" color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close social accounts" @click="showAccounts = false">
          <UiIcon name="X" :size="17" aria-hidden="true" />
        </Button>
        <SocialAccountsPanel v-if="currentSite" :site-id="currentSite.id" />
      </section>
    </AppDialog>

    <AppDialog :open="showLibraryFilters" labelled-by="social-library-filters-title" @close="showLibraryFilters = false">
      <form class="library-filters-dialog" @submit.prevent="applyLibraryFilters">
        <header>
          <div>
            <h2 id="social-library-filters-title">Advanced filters</h2>
          </div>
          <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close advanced filters" @click="showLibraryFilters = false">
            <UiIcon name="X" :size="17" aria-hidden="true" />
          </Button>
        </header>
        <div class="library-filter-grid">
          <label><span>Source title or reference</span><input v-model="librarySource" /></label>
          <label><span>Platform</span><select v-model="libraryPlatform"><option value="">All platforms</option><option value="linkedin">LinkedIn</option><option value="x">X</option><option value="instagram">Instagram</option><option value="instagram_business">Instagram Business</option></select></label>
          <label><span>Account</span><select v-model="libraryAccountId"><option value="">All accounts</option><option v-for="account in activeAccounts" :key="account.id" :value="account.id">{{ account.displayName || account.handle || platformLabel(account.platform) }}</option></select></label>
          <label><span>Status</span><select v-model="libraryDelivery"><option value="">Any status</option><option value="scheduled">Scheduled</option><option value="queued">Queued</option><option value="publishing">Publishing</option><option value="published">Published</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select></label>
          <fieldset class="library-date-range"><legend>Publication date range</legend><div><label><span>From</span><input v-model="libraryPublishedFrom" type="date" /></label><label><span>To</span><input v-model="libraryPublishedTo" type="date" /></label></div></fieldset>
        </div>
        <footer>
          <Button color="ghost" shape="soft" size="compact" type="button" @click="clearLibrarySearch(); showLibraryFilters = false">Clear filters</Button>
          <Button color="primary" shape="soft" size="compact" type="submit" :disabled="librarySearching">{{ librarySearching ? 'Searching…' : 'Apply filters' }}</Button>
        </footer>
      </form>
    </AppDialog>

    <SocialCarouselEditor
      v-if="selectedPost && selectedVersion?.format === 'carousel'"
      :open="carouselEditorOpen"
      :post="selectedPost.post"
      :version="selectedVersion"
      @close="closeCarouselEditor"
      @attached="handleCarouselAttached"
    />
  </div>
</template>

<style scoped>
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

.social-page {
  min-height: 100%;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.social-main {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 0 0 40px;
}

.state-banner {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.state-banner--error,
.recovery-banner {
  border-color: color-mix(in srgb, #c94b4b 45%, var(--ui-border));
}

.read-only-banner {
  display: grid;
  gap: 4px;
  margin-top: 18px;
}

.social-toolbar,
.toolbar-actions,
.editor-actions,
.publication-actions,
.inline-actions,
.compose-card header,
.compose-card footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.social-toolbar {
  position: sticky;
  top: 0;
  z-index: 3;
  display: grid;
  grid-template-columns: minmax(190px, 1fr) minmax(190px, 1fr);
  margin-left: calc(var(--app-shell-mobile-nav-leading-padding) - 16px);
  padding: var(--workspace-topbar-padding-block) 0 0;
  background: var(--ui-bg);
}

.social-toolbar__search {
  display: flex;
  align-items: center;
  min-width: 0;
}

.social-toolbar__search label {
  display: flex;
  align-items: center;
  width: min(100%, 310px);
  min-height: 36px;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
}

.social-toolbar__search input {
  min-width: 0;
  min-height: 34px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.social-toolbar__search label:focus-within {
  border-color: var(--ui-accent);
  outline: 2px solid var(--ui-accent-soft);
}

.social-toolbar__search input:focus {
  outline: 0;
}

.library-filter-button--active {
  color: var(--ui-accent) !important;
  background: var(--ui-accent-soft) !important;
}

.toolbar-actions {
  justify-content: flex-end;
}

.social-workspace-shell {
  display: grid;
}

.social-tabs-rail {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 40px;
  padding: 4px 8px 0;
  box-sizing: border-box;
  background: var(--ui-bg);
}

.toolbar-actions :deep(button) {
  min-width: 44px;
  min-height: 44px;
}

.social-toolbar__more {
  position: relative;
}

.social-toolbar__more > summary {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  list-style: none;
  border-radius: var(--ui-radius-sm);
  color: var(--ui-text-muted);
  cursor: pointer;
}

.social-toolbar__more > summary::-webkit-details-marker {
  display: none;
}

.social-toolbar__more > summary:hover,
.social-toolbar__more[open] > summary {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.social-toolbar__more > summary:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.social-toolbar__menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  width: 190px;
  padding: 5px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-md);
}

.social-toolbar__menu button {
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.social-toolbar__menu button:hover:not(:disabled) {
  background: var(--ui-surface-muted);
}

.social-toolbar__menu button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.social-workspace {
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(0, 1.7fr);
  min-height: 640px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
}

.post-list {
  border-right: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
}

.library-search {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface);
}

.library-result-count {
  margin: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.post-tags {
  display: flex;
  align-items: end;
  gap: 8px;
}

.library-filters summary {
  display: flex;
  min-height: 44px;
  align-items: center;
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  cursor: pointer;
}

.library-search input,
.library-search select {
  min-height: 44px;
}

.library-filter-grid {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.library-filter-grid label {
  display: grid;
  gap: 4px;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.library-result-count {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.post-source-group > h2 {
  margin: 0;
  padding: 10px 16px;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 0.74rem;
  font-weight: 650;
  overflow: hidden;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-row {
  display: grid;
  width: 100%;
  gap: 8px;
  padding: 16px;
  border: 0;
  border-bottom: 1px solid var(--ui-border);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.post-row:hover,
.post-row--active {
  background: var(--ui-surface);
}

.post-row:focus-visible,
.version-tab:focus-visible,
.platform-target:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.post-row__meta,
.post-row__footer,
.detail-meta,
.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ui-text-muted);
  font-size: 0.78rem;
}

.post-row strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.4;
}

.platform-list,
.version-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.platform-chip,
.row-status,
.version-tab span {
  padding: 3px 7px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  color: var(--ui-text-muted);
  font-size: 0.72rem;
}

.platform-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.platform-chip svg,
.preview-platform-bar svg {
  width: 13px;
  height: 13px;
  fill: currentColor;
}

.post-detail {
  min-width: 0;
  padding: 24px;
}

.detail-header h2 {
  margin: 8px 0 0;
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  line-height: 1.25;
}

.publication-panel,
.recovery-banner {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.post-preview p {
  white-space: pre-wrap;
  line-height: 1.55;
}

.post-tags {
  margin-top: 14px;
}

.post-tags .field {
  flex: 1;
}

.post-tags small {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  font-weight: 400;
}

.source-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  text-decoration: none;
}

.source-link:hover {
  color: var(--ui-text);
  text-decoration: underline;
}

.version-tabs {
  margin-top: 18px;
  border-bottom: 1px solid var(--ui-border);
}

.version-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 4px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.version-tab--active {
  border-bottom-color: var(--ui-accent);
  color: var(--ui-text);
}

.version-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(230px, 0.75fr);
  gap: 20px;
  margin-top: 20px;
}

.version-editor,
.field {
  display: grid;
  gap: 8px;
}

.version-editor {
  gap: 14px;
}

.carousel-editor-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.carousel-editor-entry > div {
  display: grid;
  gap: 3px;
}

.carousel-editor-entry span {
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.carousel-editor-entry :deep(button) {
  min-height: 44px;
}

.field > span,
.compose-card legend {
  font-size: 0.82rem;
  font-weight: 650;
}

textarea,
select,
input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
}

textarea {
  resize: vertical;
  padding: 12px;
  line-height: 1.5;
}

select,
input {
  min-height: 40px;
  padding: 8px 10px;
}

textarea:focus,
select:focus,
input:focus {
  border-color: var(--ui-accent);
  outline: 2px solid var(--ui-accent-soft);
}

.post-preview {
  align-self: start;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  color: #111827;
}

.post-preview img {
  width: 100%;
  display: block;
}

.preview-media {
  position: relative;
  display: grid;
  overflow: hidden;
  margin-top: 2px;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  background: #f1f5f9;
}

.preview-media--gallery {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
}

.preview-media img,
.preview-media video {
  width: 100%;
  min-height: 160px;
  max-height: 340px;
  object-fit: cover;
  background: #0f172a;
}

.preview-media--gallery img,
.preview-media--gallery video {
  min-height: 130px;
  max-height: 190px;
}

.preview-media__count {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border-radius: 999px;
  background: rgb(15 23 42 / 78%);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
}

.preview-link-card {
  display: grid;
  gap: 3px;
  margin: 0 14px 12px;
  padding: 10px 11px;
  border: 1px solid #d8e0e5;
  border-radius: 11px;
  background: #f8fafc;
  color: #111827;
  overflow: hidden;
  text-decoration: none;
}

.preview-link-card:hover {
  background: #f1f5f9;
}

.preview-link-card__eyebrow {
  color: #64748b;
  font-size: 0.7rem;
  text-transform: uppercase;
}

.preview-link-card strong {
  overflow: hidden;
  font-size: 0.76rem;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-platform-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 13px;
  border-bottom: 1px solid #e5e7eb;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 700;
}

.preview-profile {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 14px 14px 4px;
}

.preview-profile > span:not(.preview-avatar) {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.preview-profile strong,
.preview-profile small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-profile strong {
  font-size: 0.8rem;
}

.preview-profile small {
  color: #64748b;
  font-size: 0.72rem;
}

.preview-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: #dbe3ea;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 750;
}

.post-preview p {
  margin: 10px 14px 14px;
  font-size: 0.88rem;
}

.post-preview > a {
  display: inline-block;
  margin: 10px 14px;
  color: #0a66c2;
  font-size: 0.8rem;
  font-weight: 650;
}

.preview-actions {
  display: flex;
  justify-content: space-around;
  padding: 10px 14px;
  border-top: 1px solid #e5e7eb;
  color: #64748b;
}

.post-preview--linkedin .preview-platform-bar {
  color: #0a66c2;
}

.post-preview--linkedin .preview-profile {
  padding-top: 12px;
}

.post-preview--linkedin .preview-actions {
  justify-content: space-between;
}

.post-preview--x {
  border-color: #cfd9de;
  border-radius: 16px;
}

.post-preview--x .preview-platform-bar {
  display: none;
}

.post-preview--x .preview-profile {
  padding: 13px 14px 2px;
}

.post-preview--x .preview-avatar {
  background: #111827;
  color: #fff;
}

.post-preview--x .preview-actions {
  justify-content: space-between;
  padding: 11px 18px;
  border-top: 0;
  color: #536471;
}

.post-preview--x .preview-media {
  margin: 2px 14px 12px;
  border: 1px solid #cfd9de;
  border-radius: 13px;
}

.post-preview--x .preview-media--gallery {
  gap: 1px;
}

.post-preview--x .preview-media img,
.post-preview--x .preview-media video {
  min-height: 180px;
  max-height: 350px;
}

.post-preview--x .preview-link-card {
  border-color: #cfd9de;
  border-radius: 13px;
  background: #fff;
}

.post-preview--instagram,
.post-preview--instagram_business {
  border-color: #dbdbdb;
  border-radius: 3px;
}

.post-preview--instagram .preview-platform-bar,
.post-preview--instagram_business .preview-platform-bar {
  display: none;
}

.post-preview--instagram .preview-profile,
.post-preview--instagram_business .preview-profile {
  order: 1;
  padding: 12px 12px 8px;
}

.post-preview--instagram .preview-avatar,
.post-preview--instagram_business .preview-avatar {
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, #f9ce34, #ee2a7b 52%, #6228d7);
  box-shadow: 0 0 0 2px #fff, 0 0 0 3px #e1306c;
  color: #fff;
}

.post-preview--instagram p,
.post-preview--instagram_business p {
  order: 3;
  margin: 10px 12px 14px;
  font-size: 0.83rem;
}

.post-preview--instagram .preview-media,
.post-preview--instagram_business .preview-media {
  order: 2;
  margin: 0;
  border: 0;
}

.post-preview--instagram .preview-media--gallery,
.post-preview--instagram_business .preview-media--gallery {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.post-preview--instagram .preview-media img,
.post-preview--instagram .preview-media video,
.post-preview--instagram_business .preview-media img,
.post-preview--instagram_business .preview-media video {
  min-height: 210px;
  max-height: 390px;
}

.post-preview--instagram .preview-link-card,
.post-preview--instagram_business .preview-link-card {
  order: 4;
  margin: 0 12px 12px;
  border-radius: 3px;
}

.post-preview--instagram .preview-actions,
.post-preview--instagram_business .preview-actions {
  order: 5;
  justify-content: flex-start;
  gap: 16px;
  padding: 10px 12px;
  border-top: 0;
  color: #262626;
}

.publication-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.publication-panel h2,
.publication-panel p {
  margin: 0;
}

.publication-panel p {
  margin-top: 5px;
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.publication-history {
  display: grid;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border);
}

.publication-history__heading,
.publication-history__list li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.publication-history__heading {
  justify-content: space-between;
}

.publication-history__heading h2,
.publication-history__empty {
  margin: 0;
}

.publication-history__heading span,
.publication-history__empty,
.publication-history__list time,
.publication-history__error {
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.publication-history__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.publication-history__list li {
  min-width: 0;
}

.publication-history__list li.publication-history__item--linked {
  padding: 8px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-accent-soft);
  outline: 1px solid var(--ui-accent);
  outline-offset: 1px;
}

.publication-history__list a,
.publication-history__error {
  margin-left: auto;
}

.empty-state,
.detail-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  min-height: 220px;
  padding: 24px;
  color: var(--ui-text-muted);
  text-align: center;
}

.compose-card,
.accounts-card {
  position: relative;
  width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  box-sizing: border-box;
  padding: 20px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-md);
}

.library-filters-dialog {
  display: grid;
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  gap: 18px;
  overflow: auto;
  box-sizing: border-box;
  padding: 20px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-md);
}

.library-filters-dialog header,
.library-filters-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.library-filters-dialog h2 {
  margin: 0;
}

.library-filters-dialog .library-filter-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0;
}

.library-date-range {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0;
  border: 0;
}

.library-date-range legend {
  margin-bottom: 6px;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.library-date-range > div {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.compose-card {
  display: grid;
  gap: 20px;
}

.compose-card header,
.compose-card footer {
  justify-content: space-between;
}

.compose-card h2,
.compose-card p {
  margin: 0;
}

.compose-card p {
  margin-top: 4px;
  color: var(--ui-text-muted);
}

.compose-card fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.platform-picker {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.platform-target {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 3px 9px;
  padding: 11px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  text-align: left;
  cursor: pointer;
}

.platform-target--active {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
}

.platform-target small {
  grid-column: 2;
  color: var(--ui-text-muted);
}

.platform-mark {
  grid-row: 1 / 3;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  background: var(--ui-text);
  color: var(--ui-bg);
  font-size: 0.72rem;
  font-weight: 750;
}

.accounts-close {
  position: absolute;
  top: 10px;
  right: 10px;
}

@media (max-width: 820px) {
  .social-main {
    width: min(100% - 20px, 680px);
    padding-top: 0;
  }

  .publication-panel,
  .publication-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .social-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-left: calc(var(--app-shell-mobile-nav-leading-padding) - 10px);
    padding-top: var(--workspace-topbar-padding-block);
    padding-bottom: 0;
  }

  .social-workspace,
  .version-workspace {
    grid-template-columns: 1fr;
  }

  .post-list {
    border-right: 0;
    border-bottom: 1px solid var(--ui-border);
  }
}

@media (max-width: 520px) {
  .editor-actions,
  .platform-picker {
    grid-template-columns: 1fr;
  }

  .editor-actions,
  .carousel-editor-entry {
    display: grid;
  }

  .library-filters-dialog .library-filter-grid {
    grid-template-columns: 1fr;
  }

  .library-date-range > div {
    grid-template-columns: 1fr;
  }

  .social-toolbar__search label {
    width: 100%;
  }

  .carousel-editor-entry :deep(button) {
    width: 100%;
  }

  .post-detail {
    padding: 16px;
  }
}
</style>
