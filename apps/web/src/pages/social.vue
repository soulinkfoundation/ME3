<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import AppDialog from "../components/AppDialog.vue";
import Button from "../components/Button.vue";
import SocialAccountsPanel from "../components/SocialAccountsPanel.vue";
import UiIcon from "../components/UiIcon.vue";
import WorkspaceTabs from "../components/WorkspaceTabs.vue";
import { API_BASE } from "../api";
import { socialPlatformIconPath } from "../utils/social-platform-icons";
import { resolveLocalDateTimeToUtc } from "../utils/timezone";
import { useSitesStore } from "../stores/sites";
import {
  useSocialStore,
  type PostVersion,
  type PostLibraryItem,
  type PublicationStatus,
  type DriveFile,
  type DriveFolder,
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
const localDemoAvailable = ref(false);
const activeMode = ref<WorkspaceMode>("drafts");
const selectedPostId = ref<string | null>(null);
const selectedVersionId = ref<string | null>(null);
const editorTitle = ref("");
const editorBody = ref("");
const editorAccountId = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const showAccounts = ref(false);
const instagramPreviewIndex = ref(0);
const showMediaPicker = ref(false);
const mediaFolders = ref<DriveFolder[]>([]);
const mediaFiles = ref<DriveFile[]>([]);
const mediaFolderId = ref<string | null>(null);
const selectedMediaFileIds = ref<string[]>([]);
const mediaLoading = ref(false);
const mediaError = ref("");
const showSchedule = ref(false);
const scheduleDate = ref("");
const scheduleTime = ref("09:00");
const scheduleTimezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
const scheduleError = ref("");
const scheduling = ref(false);
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

const titleDirty = computed(() =>
  Boolean(selectedPost.value && editorTitle.value.trim() !== selectedPost.value.post.ideaText),
);

const draftAccounts = computed(() => {
  const supported = new Set(
    capabilities.value.filter((capability) => capability.draft).map((capability) => capability.platform),
  );
  const seen = new Set<SocialPlatform>();
  return activeAccounts.value.filter((account) => {
    const platform = account.platform as SocialPlatform;
    if (!supported.has(platform) || seen.has(platform)) return false;
    seen.add(platform);
    return true;
  });
});

const canPublish = computed(() =>
  Boolean(
    !selectedPostReadOnly.value &&
      selectedVersion.value &&
      editorBody.value.trim() &&
      editorAccountId.value,
  ),
);

const canSchedule = computed(() => {
  const version = selectedVersion.value;
  return Boolean(
    version &&
      canPublish.value &&
      capabilities.value.find((item) => item.platform === version.platform)?.schedule,
  );
});

const canPublishNow = computed(() => {
  const version = selectedVersion.value;
  return Boolean(
    canPublish.value &&
      capabilities.value.find((item) => item.platform === version?.platform)?.publish,
  );
});

const canDeleteDraft = computed(() =>
  Boolean(
    selectedPost.value &&
      !selectedPostReadOnly.value &&
      selectedPost.value.versions.every(
        (version) =>
          version.approvalStatus === "draft" && !version.publicationStatus && !version.scheduledFor,
      ),
  ),
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
  if (platform === "youtube") return "YouTube";
  if (platform === "tiktok") return "TikTok";
  return platform === "instagram_business" ? "Instagram Business" : "Instagram";
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

function accountForVersion(version: PostVersion): SocialAccountRow | null {
  return accounts.value.find((account) => account.id === version.targetAccountId) || null;
}

function accountInitials(version: PostVersion): string {
  const label = previewAccountName(version).trim();
  const parts = label.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : label.slice(0, 2))
    .toUpperCase();
}

function accountLabel(version: PostVersion): string {
  const account = accountForVersion(version);
  return `${platformLabel(version.platform)} · ${account?.displayName || account?.handle || "Connected account"}`;
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
  if (version.publicationStatus === "published") {
    return version.platform === "tiktok" ? "Sent to TikTok" : "Published";
  }
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
  if (states.includes("Sent to TikTok")) return "Sent to TikTok";
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
  selectedVersionId.value = version?.id || null;
  instagramPreviewIndex.value = 0;
  editorTitle.value = selectedPost.value?.post.ideaText || "";
  editorBody.value = version?.bodyText || "";
  editorAccountId.value = version?.targetAccountId || activeAccounts.value.find(
    (account) => account.platform === version?.platform,
  )?.id || "";
}

function setInstagramPreview(index: number) {
  const total = selectedVersion.value?.assetManifest.length || 0;
  if (total > 0) instagramPreviewIndex.value = Math.max(0, Math.min(index, total - 1));
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
    localDemoAvailable.value = status.localDemo === true;
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

function replacePost(detail: SocialPostDetail) {
  posts.value = posts.value.map((item) => (item.post.id === detail.post.id ? detail : item));
  if (selectedPostId.value === detail.post.id) {
    const version = detail.versions.find((item) => item.id === selectedVersionId.value) || detail.versions[0] || null;
    selectVersion(version);
  }
}

async function saveDraft() {
  const post = selectedPost.value;
  const version = selectedVersion.value;
  if (!post || !version || selectedPostReadOnly.value || !editorBody.value.trim()) return;
  if (!editorDirty.value && !titleDirty.value) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    if (titleDirty.value) {
      replacePost(
        await social.updateSocialPost(post.post.id, {
          title: editorTitle.value.trim(),
          expectedUpdatedAt: post.post.updatedAt,
        }),
      );
    }
    if (editorDirty.value) {
      replaceVersion(
        await social.updatePostVersion(version.id, {
          bodyText: editorBody.value,
          targetAccountId: editorAccountId.value || null,
        }),
      );
    }
    notice.value = "Draft saved. Approval was removed if its content changed.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save this Version");
    error.value = social.error || "Failed to save this Version";
  } finally {
    saving.value = false;
  }
}

async function prepareVersionForPublication(): Promise<PostVersion | null> {
  const post = selectedPost.value;
  const version = selectedVersion.value;
  if (!post || !version || selectedPostReadOnly.value || !canPublish.value) return null;

  if (titleDirty.value) {
    replacePost(
      await social.updateSocialPost(post.post.id, {
        title: editorTitle.value.trim(),
        expectedUpdatedAt: post.post.updatedAt,
      }),
    );
  }
  if (editorDirty.value || version.approvalStatus !== "approved") {
    const publishable = await social.updatePostVersion(version.id, {
      bodyText: editorBody.value,
      targetAccountId: editorAccountId.value,
      approvalStatus: "approved",
    });
    replaceVersion(publishable);
    return publishable;
  }
  return version;
}

async function createDraft() {
  const site = currentSite.value;
  if (!site || draftAccounts.value.length === 0 || saving.value) return;
  const draftText = "Untitled draft";
  saving.value = true;
  error.value = "";
  try {
    const detail = await social.createSocialPost({
      siteId: site.id,
      sourceType: "pasted",
      sourceSnapshot: draftText,
      sourceText: draftText,
      ideaText: draftText,
      versions: draftAccounts.value.map((account) => {
        return {
          platform: account.platform as SocialPlatform,
          bodyText: draftText,
          targetAccountId: account.id,
        };
      }),
    });
    posts.value = [detail, ...posts.value];
    activeMode.value = "drafts";
    selectPost(detail);
    notice.value = "New draft added. Give it a title and replace the starter text.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to create a draft");
    error.value = social.error || "Failed to create a draft";
  } finally {
    saving.value = false;
  }
}

async function loadLocalDemo() {
  const site = currentSite.value;
  if (!site || !localDemoAvailable.value || saving.value) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const detail = await social.createLocalSocialDemo(site.id);
    posts.value = [detail, ...posts.value.filter((item) => item.post.id !== detail.post.id)];
    accounts.value = await social.fetchSocialAccounts();
    activeMode.value = "drafts";
    selectPost(detail);
    notice.value = "Local demo loaded. It is safe to edit, approve, schedule, and delete.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load the local Social demo");
    error.value = social.error || "Failed to load the local Social demo";
  } finally {
    saving.value = false;
  }
}

async function deleteDraft() {
  const post = selectedPost.value;
  if (!post || !canDeleteDraft.value || saving.value) return;
  if (!window.confirm(`Delete “${post.post.ideaText}”? This cannot be undone.`)) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await social.deleteSocialPost(post.post.id, post.post.updatedAt);
    posts.value = posts.value.filter((detail) => detail.post.id !== post.post.id);
    selectedPostId.value = null;
    selectVersion(null);
    ensureVisibleSelection();
    notice.value = "Draft deleted.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to delete this draft");
    error.value = social.error || "Failed to delete this draft";
  } finally {
    saving.value = false;
  }
}

function isMediaFile(file: DriveFile): boolean {
  return file.status === "ready" && (
    file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")
  );
}

function isVideoFile(file: DriveFile): boolean {
  return file.mimeType.startsWith("video/");
}

function driveFileUrl(fileId: string): string {
  return `${API_BASE.replace(/\/$/, "")}/files/${encodeURIComponent(fileId)}/content`;
}

async function loadMediaFiles() {
  mediaLoading.value = true;
  mediaError.value = "";
  try {
    mediaFiles.value = (await social.listDriveFiles(mediaFolderId.value)).filter(isMediaFile);
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load media from Files");
    mediaError.value = social.error || "Failed to load media from Files";
  } finally {
    mediaLoading.value = false;
  }
}

async function openMediaPicker() {
  if (!selectedVersion.value || selectedPostReadOnly.value) return;
  showMediaPicker.value = true;
  selectedMediaFileIds.value = [];
  mediaFolderId.value = null;
  mediaError.value = "";
  mediaLoading.value = true;
  try {
    const [folders, files] = await Promise.all([
      social.listDriveFolders(),
      social.listDriveFiles(null),
    ]);
    mediaFolders.value = folders;
    mediaFiles.value = files.filter(isMediaFile);
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load media from Files");
    mediaError.value = social.error || "Failed to load media from Files";
  } finally {
    mediaLoading.value = false;
  }
}

function toggleMediaFile(fileId: string) {
  if (selectedMediaFileIds.value.includes(fileId)) {
    selectedMediaFileIds.value = selectedMediaFileIds.value.filter((id) => id !== fileId);
    return;
  }
  const file = mediaFiles.value.find((item) => item.id === fileId);
  if (!file) return;
  const selectedFiles = selectedMediaFileIds.value
    .map((id) => mediaFiles.value.find((item) => item.id === id))
    .filter((item): item is DriveFile => Boolean(item));
  if (isVideoFile(file) || selectedFiles.some(isVideoFile)) {
    selectedMediaFileIds.value = [fileId];
    return;
  }
  selectedMediaFileIds.value = [...selectedMediaFileIds.value, fileId];
}

function driveFileAsset(
  file: DriveFile,
  assetIndex: number,
): PostVersion["assetManifest"][number] {
  return {
    url: driveFileUrl(file.id),
    fileId: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    kind: isVideoFile(file) ? "video" : "image",
    altText: isVideoFile(file) ? undefined : file.filename.replace(/\.[^.]+$/, ""),
    contentHash: file.sha256 ? `sha256:${file.sha256.toLowerCase()}` : undefined,
    byteLength: file.size,
    assetIndex,
  };
}

async function attachSelectedMedia() {
  const version = selectedVersion.value;
  if (!version || selectedMediaFileIds.value.length === 0) return;
  const files = selectedMediaFileIds.value
    .map((id) => mediaFiles.value.find((file) => file.id === id))
    .filter((file): file is DriveFile => Boolean(file));
  if (!files.length) return;
  const selectedVideo = files.find(isVideoFile);
  const existingVideo = version.assetManifest.some(isVideoAsset);
  if ((selectedVideo && version.assetManifest.length > 0) || (existingVideo && files.length > 0)) {
    mediaError.value = "A video must be attached by itself. Remove the existing media first.";
    return;
  }
  const existingIds = new Set(
    version.assetManifest.map((asset) => asset.fileId || asset.url),
  );
  const newFiles = files.filter(
    (file) => !existingIds.has(file.id) && !existingIds.has(driveFileUrl(file.id)),
  );
  const isInstagram = version.platform === "instagram" || version.platform === "instagram_business";
  if (isInstagram && version.assetManifest.length + newFiles.length > 10) {
    mediaError.value = "Instagram carousels support up to 10 images.";
    return;
  }
  saving.value = true;
  mediaError.value = "";
  try {
    const assetManifest = [
      ...version.assetManifest.map((asset, index) => ({ ...asset, assetIndex: index })),
      ...newFiles
        .map((file, index) => driveFileAsset(file, version.assetManifest.length + index)),
    ].map((asset, index) => ({ ...asset, assetIndex: index }));
    replaceVersion(await social.updatePostVersion(version.id, { assetManifest }));
    showMediaPicker.value = false;
    notice.value = selectedVideo
      ? "Video attached."
      : files.length === 1 ? "Image attached." : `${files.length} images attached in selection order.`;
  } catch (value) {
    social.setErrorFromApi(value, "Failed to attach images");
    mediaError.value = social.error || "Failed to attach images";
  } finally {
    saving.value = false;
  }
}

async function moveMedia(fromIndex: number, offset: -1 | 1) {
  const version = selectedVersion.value;
  const toIndex = fromIndex + offset;
  if (
    !version ||
    selectedPostReadOnly.value ||
    saving.value ||
    toIndex < 0 ||
    toIndex >= version.assetManifest.length
  ) return;
  const assetManifest = [...version.assetManifest];
  const [moved] = assetManifest.splice(fromIndex, 1);
  if (!moved) return;
  assetManifest.splice(toIndex, 0, moved);
  saving.value = true;
  error.value = "";
  try {
    replaceVersion(
      await social.updatePostVersion(version.id, {
        assetManifest: assetManifest.map((asset, index) => ({ ...asset, assetIndex: index })),
      }),
    );
    notice.value = "Media order updated.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to reorder media");
    error.value = social.error || "Failed to reorder media";
  } finally {
    saving.value = false;
  }
}

async function removeMedia(assetUrl: string) {
  const version = selectedVersion.value;
  if (!version || selectedPostReadOnly.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    replaceVersion(
      await social.updatePostVersion(version.id, {
        assetManifest: version.assetManifest.filter((asset) => asset.url !== assetUrl),
      }),
    );
    notice.value = "Image removed.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to remove this image");
    error.value = social.error || "Failed to remove this image";
  } finally {
    saving.value = false;
  }
}

function openSchedule() {
  if (!canSchedule.value && !canPublishNow.value) return;
  const start = new Date(Date.now() + 60 * 60 * 1000);
  scheduleDate.value = start.toISOString().slice(0, 10);
  scheduleTime.value = start.toTimeString().slice(0, 5);
  scheduleError.value = "";
  showSchedule.value = true;
}

async function schedulePost() {
  if (!canSchedule.value) return;
  const resolution = resolveLocalDateTimeToUtc(
    scheduleDate.value,
    scheduleTime.value,
    scheduleTimezone.value,
  );
  if (!resolution.ok) {
    scheduleError.value = "Choose a valid future date, time, and timezone.";
    return;
  }
  if (Date.parse(resolution.value) <= Date.now()) {
    scheduleError.value = "Schedule time must be in the future.";
    return;
  }
  scheduling.value = true;
  scheduleError.value = "";
  try {
    const version = await prepareVersionForPublication();
    if (!version) return;
    const publication = await social.createPostVersionPublication(version.id, {
      scheduledFor: resolution.value,
      timezone: scheduleTimezone.value,
      requestContext: { surface: "social-editor" },
    });
    replaceVersion({
      ...version,
      scheduledFor: publication.scheduledFor,
      timezone: publication.timezone,
      publicationStatus: publication.status,
    });
    showSchedule.value = false;
    notice.value = "Post scheduled.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to schedule this post");
    scheduleError.value = social.error || "Failed to schedule this post";
  } finally {
    scheduling.value = false;
  }
}

async function publishNow() {
  if (!canPublishNow.value) return;
  scheduling.value = true;
  scheduleError.value = "";
  try {
    const version = await prepareVersionForPublication();
    if (!version) return;
    const publication = await social.publishPostVersion(version.id);
    replaceVersion({
      ...version,
      publicationStatus: publication.status,
      platformPostUrl: publication.platformPostUrl,
      publishedAt: publication.publishedAt,
    });
    showSchedule.value = false;
    notice.value = version.platform === "tiktok"
      ? "TikTok draft queued. You’ll receive an inbox notification in TikTok to finish editing and post it."
      : "Post queued to publish now.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to publish this post");
    scheduleError.value = social.error || "Failed to publish this post";
  } finally {
    scheduling.value = false;
  }
}

watch(mediaFolderId, () => {
  if (showMediaPicker.value) void loadMediaFiles();
});

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
            v-if="localDemoAvailable"
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            :disabled="saving || !currentSite"
            @click="loadLocalDemo"
          >
            Load demo
          </Button>
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
            :disabled="!currentSite || draftAccounts.length === 0 || saving"
            @click="createDraft"
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
              :disabled="draftAccounts.length === 0 || saving"
              @click="createDraft"
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
                  <span v-for="version in visibleVersionsFor(detail)" :key="version.id" class="platform-chip" :title="accountLabel(version)">
                    <span :class="['social-account-avatar', 'social-account-avatar--compact', `social-account-avatar--${version.platform}`]" aria-hidden="true">
                      {{ accountInitials(version) }}
                      <span class="social-account-avatar__platform">
                        <svg viewBox="0 0 24 24"><path :d="platformIconPath(version.platform)" /></svg>
                      </span>
                    </span>
                    <span class="sr-only">{{ accountLabel(version) }}</span>
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
              <label class="sr-only" for="social-post-title">Post title</label>
              <input
                id="social-post-title"
                v-model="editorTitle"
                class="post-title-input"
                :readonly="selectedPostReadOnly"
                :disabled="saving"
                aria-label="Post title"
              />
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
            <Button
              v-if="canDeleteDraft"
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              type="button"
              aria-label="Delete draft"
              title="Delete draft"
              :disabled="saving"
              @click="deleteDraft"
            >
              <UiIcon name="Trash2" :size="17" aria-hidden="true" />
            </Button>
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

          <div class="version-tabs" role="group" aria-label="Connected social accounts">
            <button
              v-for="version in selectedVisibleVersions"
              :key="version.id"
              type="button"
              :aria-pressed="selectedVersionId === version.id"
              :class="['version-tab', { 'version-tab--active': selectedVersionId === version.id }]"
              :title="accountLabel(version)"
              @click="selectVersion(version)"
            >
              <span :class="['social-account-avatar', `social-account-avatar--${version.platform}`]" aria-hidden="true">
                {{ accountInitials(version) }}
                <span class="social-account-avatar__platform">
                  <svg viewBox="0 0 24 24"><path :d="platformIconPath(version.platform)" /></svg>
                </span>
              </span>
              <span class="sr-only">{{ accountLabel(version) }}</span>
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

              <div v-if="!selectedPostReadOnly" class="media-attachments">
                <div class="media-attachments__toolbar">
                  <Button color="ghost" shape="soft" size="compact" type="button" :disabled="saving" @click="openMediaPicker">
                    <UiIcon name="Images" :size="17" aria-hidden="true" />
                    Add media
                  </Button>
                  <span v-if="selectedVersion.assetManifest.length">{{ selectedVersion.assetManifest.length }} attached</span>
                </div>
                <div v-if="selectedVersion.assetManifest.length" class="media-attachments__items">
                  <figure v-for="(asset, index) in selectedVersion.assetManifest" :key="asset.url" class="media-attachment">
                    <div class="media-attachment__preview">
                      <img v-if="!isVideoAsset(asset)" :src="asset.url" :alt="asset.altText || asset.filename || 'Attached media'" />
                      <video v-else :src="asset.url" muted preload="metadata" />
                      <Button class="media-attachment__remove" color="ghost" shape="soft" size="compact" icon-only type="button" :aria-label="`Remove ${asset.filename || 'media'}`" @click="removeMedia(asset.url)">
                        <UiIcon name="X" :size="14" aria-hidden="true" />
                      </Button>
                    </div>
                    <div v-if="selectedVersion.assetManifest.length > 1" class="media-attachment__order">
                      <Button class="media-attachment__move" color="ghost" shape="soft" size="compact" icon-only type="button" :disabled="saving || index === 0" :aria-label="`Move ${asset.filename || 'media'} earlier`" @click="moveMedia(index, -1)">
                        <UiIcon name="ChevronLeft" :size="15" aria-hidden="true" />
                      </Button>
                      <span aria-hidden="true">{{ index + 1 }}</span>
                      <Button class="media-attachment__move" color="ghost" shape="soft" size="compact" icon-only type="button" :disabled="saving || index === selectedVersion.assetManifest.length - 1" :aria-label="`Move ${asset.filename || 'media'} later`" @click="moveMedia(index, 1)">
                        <UiIcon name="ChevronRight" :size="15" aria-hidden="true" />
                      </Button>
                    </div>
                  </figure>
                </div>
              </div>

              <div v-if="!selectedPostReadOnly" class="editor-actions">
                <Button color="outline" shape="soft" size="compact" type="button" :disabled="saving || scheduling || (!editorDirty && !titleDirty)" @click="saveDraft">
                  Save Draft
                </Button>
                <Button color="primary" shape="soft" size="compact" type="button" :disabled="saving || scheduling || (!canSchedule && !canPublishNow)" @click="openSchedule">
                  <UiIcon :name="selectedVersion.platform === 'tiktok' ? 'Upload' : 'CalendarDays'" :size="16" aria-hidden="true" />
                  {{ selectedVersion.platform === "tiktok" ? "Send to TikTok" : "Schedule" }}
                </Button>
              </div>
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
                  {
                    'preview-media--gallery':
                      selectedVersion.assetManifest.length > 1 &&
                      selectedVersion.platform !== 'instagram' &&
                      selectedVersion.platform !== 'instagram_business',
                  },
                ]"
              >
                <template v-if="(selectedVersion.platform === 'instagram' || selectedVersion.platform === 'instagram_business') && selectedVersion.assetManifest.length > 1">
                  <div class="instagram-preview-carousel" aria-label="Instagram image carousel">
                    <div class="instagram-preview-carousel__track" :style="{ transform: `translateX(-${instagramPreviewIndex * 100}%)` }">
                      <div v-for="(asset, index) in selectedVersion.assetManifest" :key="`${asset.url}-${index}`" class="instagram-preview-carousel__slide">
                        <video
                          v-if="isVideoAsset(asset)"
                          :src="asset.url"
                          controls
                          muted
                          preload="metadata"
                          :aria-label="asset.altText || asset.filename || 'Post video'"
                        />
                        <img v-else :src="asset.url" :alt="asset.altText || asset.filename || 'Post image'" />
                      </div>
                    </div>
                    <div class="instagram-preview-carousel__dots" role="tablist" aria-label="Choose carousel image">
                      <button
                        v-for="(_, index) in selectedVersion.assetManifest"
                        :key="index"
                        type="button"
                        :class="{ 'is-active': instagramPreviewIndex === index }"
                        :aria-label="`Show image ${index + 1} of ${selectedVersion.assetManifest.length}`"
                        :aria-selected="instagramPreviewIndex === index"
                        role="tab"
                        @click="setInstagramPreview(index)"
                      />
                    </div>
                  </div>
                </template>
                <template v-else>
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
                </template>
                <span v-if="selectedVersion.assetManifest.length > 1 && selectedVersion.platform !== 'instagram' && selectedVersion.platform !== 'instagram_business'" class="preview-media__count">
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
                <template v-if="selectedVersion.platform === 'instagram' || selectedVersion.platform === 'instagram_business'">
                  <UiIcon name="Heart" :size="20" />
                  <UiIcon name="MessageCircle" :size="20" />
                  <UiIcon name="Redo" :size="20" />
                  <UiIcon name="Send" :size="20" />
                  <UiIcon name="Bookmark" class="preview-actions__bookmark" :size="20" />
                </template>
                <template v-else>
                  <UiIcon name="MessageCircle" :size="17" />
                  <UiIcon name="Redo" :size="17" />
                  <UiIcon name="Heart" :size="17" />
                  <UiIcon name="Send" :size="17" />
                </template>
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

    <AppDialog :open="showMediaPicker" labelled-by="social-media-picker-title" @close="showMediaPicker = false">
      <section class="social-media-picker">
        <header>
          <div>
            <h2 id="social-media-picker-title">Add media</h2>
            <p>Choose multiple images in posting order, or choose one video.</p>
          </div>
          <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close media picker" @click="showMediaPicker = false">
            <UiIcon name="X" :size="17" aria-hidden="true" />
          </Button>
        </header>

        <label class="field">
          <span>Folder</span>
          <select v-model="mediaFolderId" :disabled="mediaLoading">
            <option :value="null">All files</option>
            <option v-for="folder in mediaFolders" :key="folder.id" :value="folder.id">{{ folder.path || folder.name }}</option>
          </select>
        </label>

        <p v-if="mediaError" class="form-error" role="alert">{{ mediaError }}</p>
        <p v-else-if="mediaLoading" class="form-hint" role="status">Loading media…</p>
        <p v-else-if="mediaFiles.length === 0" class="form-hint">No images or videos in this folder yet. Add media in Files, then return here.</p>

        <div v-else class="social-media-picker__grid" role="listbox" aria-label="Media in Files" aria-multiselectable="true">
          <button
            v-for="file in mediaFiles"
            :key="file.id"
            type="button"
            :class="{ 'is-selected': selectedMediaFileIds.includes(file.id) }"
            :aria-selected="selectedMediaFileIds.includes(file.id)"
            :aria-label="`${file.filename}, ${isVideoFile(file) ? 'video' : 'image'}${selectedMediaFileIds.includes(file.id) ? `, selected ${selectedMediaFileIds.indexOf(file.id) + 1}` : ''}`"
            @click="toggleMediaFile(file.id)"
          >
            <span class="social-media-picker__preview">
              <video v-if="isVideoFile(file)" :src="driveFileUrl(file.id)" muted preload="metadata" aria-hidden="true" />
              <img v-else :src="driveFileUrl(file.id)" alt="" />
              <span v-if="selectedMediaFileIds.includes(file.id)" class="social-media-picker__order" aria-hidden="true">
                {{ selectedMediaFileIds.indexOf(file.id) + 1 }}
              </span>
            </span>
            <span class="social-media-picker__name">{{ file.filename }}</span>
          </button>
        </div>

        <footer>
          <Button color="outline" shape="soft" size="compact" type="button" @click="showMediaPicker = false">Cancel</Button>
          <Button color="primary" shape="soft" size="compact" type="button" :disabled="saving || selectedMediaFileIds.length === 0" @click="attachSelectedMedia">
            Add {{ selectedMediaFileIds.length || "" }} {{ selectedMediaFileIds.some((id) => mediaFiles.find((file) => file.id === id && isVideoFile(file))) ? "video" : `image${selectedMediaFileIds.length === 1 ? "" : "s"}` }}
          </Button>
        </footer>
      </section>
    </AppDialog>

    <AppDialog :open="showSchedule" labelled-by="social-schedule-title" @close="showSchedule = false">
      <form class="social-schedule-dialog" @submit.prevent="schedulePost">
        <header>
          <div>
            <h2 id="social-schedule-title">{{ selectedVersion?.platform === "tiktok" ? "Send draft to TikTok" : "Schedule post" }}</h2>
            <p>{{ selectedVersion ? `${platformLabel(selectedVersion.platform)} · ${previewAccountName(selectedVersion)}` : "" }}</p>
          </div>
          <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close schedule" @click="showSchedule = false">
            <UiIcon name="X" :size="17" aria-hidden="true" />
          </Button>
        </header>
        <div v-if="canSchedule" class="schedule-fields">
          <label class="field"><span>Date</span><input v-model="scheduleDate" type="date" required /></label>
          <label class="field"><span>Time</span><input v-model="scheduleTime" type="time" required /></label>
        </div>
        <label v-if="canSchedule" class="field"><span>Timezone</span><input v-model="scheduleTimezone" required /></label>
        <p v-if="scheduleError" class="form-error" role="alert">{{ scheduleError }}</p>
        <footer>
          <Button color="outline" shape="soft" size="compact" type="button" :disabled="scheduling" @click="showSchedule = false">Cancel</Button>
          <div class="inline-actions">
            <Button v-if="canPublishNow" color="outline" shape="soft" size="compact" type="button" :disabled="scheduling" @click="publishNow">{{ scheduling ? (selectedVersion?.platform === "tiktok" ? "Sending…" : "Publishing…") : (selectedVersion?.platform === "tiktok" ? "Send draft" : "Post now") }}</Button>
            <Button v-if="canSchedule" color="primary" shape="soft" size="compact" type="submit" :disabled="scheduling">{{ scheduling ? "Scheduling…" : "Schedule" }}</Button>
          </div>
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
          <label><span>Platform</span><select v-model="libraryPlatform"><option value="">All platforms</option><option value="linkedin">LinkedIn</option><option value="x">X</option><option value="instagram">Instagram</option><option value="instagram_business">Instagram Business</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option></select></label>
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
.inline-actions {
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
  grid-template-columns: minmax(230px, 0.55fr) minmax(0, 2fr);
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
.version-tab:focus-visible {
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

.row-status {
  padding: 3px 7px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  color: var(--ui-text-muted);
  font-size: 0.72rem;
}

.platform-chip {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
}

.social-account-avatar {
  position: relative;
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: var(--ui-text);
  color: var(--ui-bg);
  font-size: 0.7rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.social-account-avatar--compact {
  width: 29px;
  height: 29px;
  font-size: 0.6rem;
}

.social-account-avatar__platform {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  width: 19px;
  height: 19px;
  place-items: center;
  border: 2px solid var(--ui-surface);
  border-radius: 50%;
  background: #111827;
  color: #fff;
}

.social-account-avatar--linkedin .social-account-avatar__platform {
  background: #0a66c2;
}

.social-account-avatar--instagram .social-account-avatar__platform,
.social-account-avatar--instagram_business .social-account-avatar__platform {
  background: #c13584;
}

.social-account-avatar__platform svg {
  width: 11px;
  height: 11px;
  fill: currentColor;
}

.social-account-avatar--compact .social-account-avatar__platform {
  width: 16px;
  height: 16px;
}

.social-account-avatar--compact .social-account-avatar__platform svg {
  width: 9px;
  height: 9px;
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

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-header > div {
  flex: 1;
  min-width: 0;
}

.post-title-input {
  width: min(100%, 760px);
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  font-weight: 750;
  line-height: 1.25;
}

.post-title-input:focus {
  border-radius: var(--ui-radius-sm);
  border-color: var(--ui-accent);
  outline: 2px solid var(--ui-accent-soft);
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
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  filter: grayscale(1);
  opacity: 0.48;
}

.version-tab--active {
  border-bottom-color: var(--ui-accent);
  color: var(--ui-text);
  filter: none;
  opacity: 1;
}

.version-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 1fr);
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

.media-attachments {
  display: grid;
  gap: 9px;
}

.media-attachments__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.media-attachments__toolbar > span {
  color: var(--ui-text-muted);
  font-size: 0.78rem;
}

.media-attachments__items {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px;
}

.media-attachment {
  flex: 0 0 86px;
  width: 86px;
  margin: 0;
}

.media-attachment__preview {
  position: relative;
  width: 86px;
  height: 74px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.media-attachment__preview img,
.media-attachment__preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-attachment__remove:deep(button),
.media-attachment__remove {
  position: absolute;
  top: 3px;
  right: 3px;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ui-bg) 88%, transparent);
}

.media-attachment__order {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 2px;
  min-height: 34px;
  color: var(--ui-text-muted);
  font-size: 0.72rem;
  text-align: center;
}

.media-attachment__order :deep(button) {
  min-width: 32px;
  min-height: 32px;
  padding: 0;
}

.field > span {
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

.instagram-preview-carousel {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.instagram-preview-carousel__track {
  display: flex;
  width: 100%;
  transition: transform 180ms ease-out;
}

.instagram-preview-carousel__slide {
  flex: 0 0 100%;
  width: 100%;
  aspect-ratio: 1;
}

.instagram-preview-carousel__slide img,
.instagram-preview-carousel__slide video {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: none;
  object-fit: cover;
}

.instagram-preview-carousel__dots {
  position: absolute;
  right: 0;
  bottom: 9px;
  left: 0;
  display: flex;
  justify-content: center;
  gap: 4px;
}

.instagram-preview-carousel__dots button {
  width: 6px;
  height: 6px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 72%);
  cursor: pointer;
}

.instagram-preview-carousel__dots button.is-active {
  width: 7px;
  background: #0095f6;
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

.post-preview--instagram .preview-actions__bookmark,
.post-preview--instagram_business .preview-actions__bookmark {
  margin-left: auto;
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

.accounts-card,
.social-media-picker,
.social-schedule-dialog {
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

.social-media-picker,
.social-schedule-dialog {
  display: grid;
  gap: 18px;
}

.social-media-picker header,
.social-media-picker footer,
.social-schedule-dialog header,
.social-schedule-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.social-media-picker h2,
.social-media-picker p,
.social-schedule-dialog h2,
.social-schedule-dialog p {
  margin: 0;
}

.social-media-picker header p,
.social-schedule-dialog header p {
  margin-top: 4px;
  color: var(--ui-text-muted);
}

.social-media-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  max-height: min(440px, 52vh);
  overflow: auto;
}

.social-media-picker__grid button {
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  font: inherit;
  font-size: 0.76rem;
  text-align: left;
  cursor: pointer;
}

.social-media-picker__grid button:hover,
.social-media-picker__grid button.is-selected {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
}

.social-media-picker__preview {
  position: relative;
  display: block;
}

.social-media-picker__grid img,
.social-media-picker__grid video {
  width: 100%;
  aspect-ratio: 1;
  border-radius: calc(var(--ui-radius-sm) - 2px);
  object-fit: cover;
  background: #0f172a;
}

.social-media-picker__order {
  position: absolute;
  top: 7px;
  right: 7px;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: var(--ui-accent-strong);
  color: var(--ui-accent-contrast);
  font-weight: 750;
}

.social-media-picker__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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
  .media-attachment__order :deep(.media-attachment__move.me3-btn) {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
  }

  .editor-actions {
    grid-template-columns: 1fr;
  }

  .editor-actions {
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

  .post-detail {
    padding: 16px;
  }
}
</style>
