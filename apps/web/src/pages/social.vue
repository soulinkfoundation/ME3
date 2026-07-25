<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import AppDialog from "../components/AppDialog.vue";
import Button from "../components/Button.vue";
import SocialAccountsPanel from "../components/SocialAccountsPanel.vue";
import UiIcon from "../components/UiIcon.vue";
import WorkspaceTabs from "../components/WorkspaceTabs.vue";
import { API_BASE } from "../api";
import { useAppToast } from "../composables/useAppToast";
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
  type SocialContentType,
  type SocialPlatform,
  type SocialPlatformCapabilities,
  type SocialPlatformContentRule,
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
const editorScope = ref<"shared" | "platform">("platform");
const editorTitle = ref("");
const editorBody = ref("");
const editorAccountId = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
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
const publishError = ref("");
const scheduling = ref(false);
const showDestinations = ref(false);
const destinationMode = ref<"create" | "manage">("create");
const destinationContentType = ref<SocialContentType>("short_video");
const selectedDestinationAccountIds = ref<string[]>([]);
const destinationError = ref("");
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
const { toast, toastError, toastSuccess } = useAppToast();

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

const includesYouTubeDestination = computed(() =>
  selectedVisibleVersions.value.some((version) => version.platform === "youtube"),
);

const sharedEditor = computed(
  () => editorScope.value === "shared" && selectedVisibleVersions.value.length > 1,
);

const editorVersions = computed(() =>
  sharedEditor.value
    ? selectedVisibleVersions.value
    : selectedVersion.value ? [selectedVersion.value] : [],
);

const editorAssetManifest = computed(
  () => selectedVersion.value?.assetManifest || [],
);

const sharedBodyMixed = computed(() => {
  const [first, ...rest] = selectedVisibleVersions.value;
  return Boolean(first && rest.some((version) => version.bodyText !== first.bodyText));
});

const sharedMediaMixed = computed(() => {
  const [first, ...rest] = selectedVisibleVersions.value;
  const firstManifest = JSON.stringify(first?.assetManifest || []);
  return Boolean(first && rest.some(
    (version) => JSON.stringify(version.assetManifest) !== firstManifest,
  ));
});

const selectedPostReadOnly = computed(
  () => selectedPost.value?.post.sourceType === "legacy_content_bank_read_only",
);

const editorDirty = computed(() => editorVersions.value.some((version) =>
  editorBody.value.trim() !== version.bodyText ||
  (!sharedEditor.value && (editorAccountId.value || null) !== version.targetAccountId),
));

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

const destinationAccounts = computed(() => draftAccounts.value.map((account) => {
  const capability = capabilityFor(account.platform as SocialPlatform);
  return {
    account,
    capability,
    compatible: Boolean(
      capability?.contentRules?.some((rule) => rule.contentType === destinationContentType.value),
    ),
  };
}));

const targetValidations = computed(() => selectedVisibleVersions.value.map((version) => ({
  version,
  ...validateVersion(
    version,
    editorVersions.value.some((candidate) => candidate.id === version.id)
      ? editorBody.value
      : version.bodyText,
    sharedEditor.value && editorVersions.value.some((candidate) => candidate.id === version.id)
      ? editorAssetManifest.value
      : version.assetManifest,
  ),
})));

const canPublish = computed(() => Boolean(
  !selectedPostReadOnly.value &&
  targetValidations.value.length > 0 &&
  targetValidations.value.every((validation) => validation.contentValid && validation.accountValid),
));

const canSchedule = computed(() => Boolean(
  canPublish.value &&
  targetValidations.value.every((validation) => validation.capability?.schedule),
));

const canPublishNow = computed(() => Boolean(
  canPublish.value &&
  targetValidations.value.every((validation) => validation.capability?.publish),
));

const canDeleteDraft = computed(() =>
  Boolean(selectedPost.value && canDeletePost(selectedPost.value)),
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

function accountAvatarUrl(version: PostVersion): string | null {
  return accountForVersion(version)?.avatarUrl || null;
}

function accountDisplayName(account: SocialAccountRow): string {
  return account.displayName || account.handle || platformLabel(account.platform);
}

function accountInitialsForAccount(account: SocialAccountRow): string {
  const parts = accountDisplayName(account).trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1
    ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
    : accountDisplayName(account).slice(0, 2)
  ).toUpperCase();
}

function capabilityFor(platform: SocialPlatform): SocialPlatformCapabilities | null {
  return capabilities.value.find((capability) => capability.platform === platform) || null;
}

function contentTypeFor(
  capability: SocialPlatformCapabilities | null,
  assets: PostVersion["assetManifest"],
  format?: PostVersion["format"],
): SocialContentType {
  if (assets.some(isVideoAsset)) return "short_video";
  if (assets.length > 1) return "carousel";
  if (assets.length === 1) return "image";
  if (format === "short_video" || format === "image" || format === "carousel") return format;
  if (capability?.contentRules?.some((rule) => rule.contentType === "text")) return "text";
  if (capability?.contentRules?.some((rule) => rule.contentType === destinationContentType.value)) {
    return destinationContentType.value;
  }
  return capability?.contentRules?.[0]?.contentType || "text";
}

function mimeTypeAllowed(mimeType: string | undefined, allowed: string[]): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.split(";", 1)[0]!.trim().toLowerCase();
  return allowed.some((entry) =>
    entry.endsWith("/*")
      ? normalized.startsWith(entry.slice(0, -1))
      : normalized === entry,
  );
}

function validateVersion(
  version: PostVersion,
  bodyText = version.bodyText,
  assets = version.assetManifest,
): {
  capability: SocialPlatformCapabilities | null;
  rule: SocialPlatformContentRule | null;
  contentType: SocialContentType;
  contentValid: boolean;
  accountValid: boolean;
  issue: string | null;
} {
  const capability = capabilityFor(version.platform);
  const contentType = contentTypeFor(capability, assets, version.format);
  const rule = capability?.contentRules?.find((candidate) =>
    candidate.contentType === contentType,
  ) || null;
  const account = accountForVersion(version);
  const accountValid = Boolean(account && account.status === "active");
  let issue: string | null = null;

  if (version.platform === "youtube" && !editorTitle.value.trim()) {
    issue = "Add a YouTube title.";
  } else if (
    version.platform === "youtube" &&
    Array.from(editorTitle.value.trim()).length > 100
  ) {
    issue = "Shorten the YouTube title to 100 characters.";
  } else if (!rule) {
    issue = `${platformLabel(version.platform)} does not support this content type in ME3 yet.`;
  } else if (rule.requiresText && !bodyText.trim()) {
    issue = "Add post text.";
  } else if (
    rule.maxTextCharacters !== null &&
    Array.from(bodyText.trim()).length > rule.maxTextCharacters
  ) {
    issue = `Shorten the text to ${rule.maxTextCharacters.toLocaleString()} characters.`;
  } else if (assets.length < rule.minMediaItems) {
    issue = rule.contentType === "short_video"
      ? "Add one video."
      : `Add at least ${rule.minMediaItems} image${rule.minMediaItems === 1 ? "" : "s"}.`;
  } else if (assets.length > rule.maxMediaItems) {
    issue = `Use no more than ${rule.maxMediaItems} media item${rule.maxMediaItems === 1 ? "" : "s"}.`;
  } else {
    for (const asset of assets) {
      const kind = isVideoAsset(asset) ? "video" : "image";
      if (!rule.allowedMediaKinds.includes(kind)) {
        issue = `${rule.label} does not support ${kind} media.`;
        break;
      }
      if (rule.allowedMimeTypes.length && !mimeTypeAllowed(asset.mimeType, rule.allowedMimeTypes)) {
        issue = `Use a supported ${kind} file type.`;
        break;
      }
      if (
        rule.maxBytesPerItem !== null &&
        asset.byteLength &&
        asset.byteLength > rule.maxBytesPerItem
      ) {
        issue = `This ${kind} is too large for ${platformLabel(version.platform)}.`;
        break;
      }
    }
  }

  if (!issue && !accountValid) {
    issue = `Reconnect the ${platformLabel(version.platform)} account.`;
  }
  return {
    capability,
    rule,
    contentType,
    contentValid: !issue || (!accountValid && issue.startsWith("Reconnect")),
    accountValid,
    issue,
  };
}

function canDeletePost(detail: SocialPostDetail): boolean {
  if (detail.post.sourceType === "legacy_content_bank_read_only") return false;
  return detail.versions.every((version) =>
    !version.scheduledFor &&
    version.publicationStatus !== "scheduled" &&
    version.publicationStatus !== "queued" &&
    version.publicationStatus !== "publishing" &&
    version.publicationStatus !== "published",
  );
}

function canRemoveVersion(version: PostVersion): boolean {
  return selectedPost.value?.versions.length !== 1 &&
    version.approvalStatus === "draft" &&
    !version.scheduledFor &&
    !version.publicationStatus;
}

function destinationVersion(account: SocialAccountRow): PostVersion | null {
  return selectedPost.value?.versions.find(
    (version) => version.platform === account.platform,
  ) || null;
}

function destinationLocked(account: SocialAccountRow): boolean {
  const version = destinationMode.value === "manage" ? destinationVersion(account) : null;
  return Boolean(version && !canRemoveVersion(version));
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
  const versions = visibleVersionsFor(detail);
  if (versions.length > 1) {
    selectSharedVersions(versions);
  } else {
    selectVersion(versions[0] || null);
  }
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
  editorScope.value = "platform";
  selectedVersionId.value = version?.id || null;
  instagramPreviewIndex.value = 0;
  editorTitle.value = selectedPost.value?.post.ideaText || "";
  editorBody.value = version?.bodyText || "";
  editorAccountId.value = version?.targetAccountId || activeAccounts.value.find(
    (account) => account.platform === version?.platform,
  )?.id || "";
}

function selectSharedVersions(versions = selectedVisibleVersions.value) {
  const first = versions[0] || null;
  editorScope.value = versions.length > 1 ? "shared" : "platform";
  selectedVersionId.value = first?.id || null;
  instagramPreviewIndex.value = 0;
  editorTitle.value = selectedPost.value?.post.ideaText || "";
  editorBody.value = first?.bodyText || "";
  editorAccountId.value = first?.targetAccountId || "";
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
  if (!sharedEditor.value && selectedVersionId.value === version.id) {
    selectVersion(version);
  }
}

function replacePost(detail: SocialPostDetail) {
  posts.value = posts.value.map((item) => (item.post.id === detail.post.id ? detail : item));
  if (selectedPostId.value === detail.post.id) {
    const version = detail.versions.find((item) => item.id === selectedVersionId.value) || detail.versions[0] || null;
    if (sharedEditor.value && visibleVersionsFor(detail).length > 1) {
      selectSharedVersions(visibleVersionsFor(detail));
    } else {
      selectVersion(version);
    }
  }
}

async function saveDraft() {
  const post = selectedPost.value;
  const versions = [...editorVersions.value];
  if (!post || versions.length === 0 || selectedPostReadOnly.value || !editorBody.value.trim()) return;
  if (!editorDirty.value && !titleDirty.value) return;
  const wasShared = sharedEditor.value;
  const selectedId = selectedVersionId.value;
  const nextBodyText = editorBody.value.trim();
  const bodyWasDirty = editorDirty.value;
  const titleWasDirty = titleDirty.value;
  saving.value = true;
  error.value = "";
  try {
    if (titleWasDirty) {
      replacePost(
        await social.updateSocialPost(post.post.id, {
          title: editorTitle.value.trim(),
          expectedUpdatedAt: post.post.updatedAt,
        }),
      );
    }
    if (bodyWasDirty) {
      for (const version of versions) {
        replaceVersion(await social.updatePostVersion(version.id, {
          bodyText: nextBodyText,
          ...(wasShared
            ? {}
            : { targetAccountId: editorAccountId.value || null }),
        }));
      }
    }
    const current = posts.value.find((detail) => detail.post.id === post.post.id);
    if (current) {
      if (wasShared) selectSharedVersions(visibleVersionsFor(current));
      else selectVersion(
        current.versions.find((version) => version.id === selectedId) || current.versions[0] || null,
      );
    }
    toastSuccess(wasShared && versions.length > 1
      ? `Shared copy saved to ${versions.length} platforms.`
      : "Draft saved. Approval was removed if its content changed.");
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save this draft");
    error.value = social.error || "Failed to save this draft";
  } finally {
    saving.value = false;
  }
}

async function prepareVersionsForPublication(): Promise<PostVersion[]> {
  const post = selectedPost.value;
  const versions = [...selectedVisibleVersions.value];
  if (!post || versions.length === 0 || selectedPostReadOnly.value || !canPublish.value) return [];
  const wasShared = sharedEditor.value;
  const editedVersionIds = new Set(editorVersions.value.map((version) => version.id));
  const selectedId = selectedVersionId.value;
  const prepared: PostVersion[] = [];

  if (titleDirty.value) {
    replacePost(
      await social.updateSocialPost(post.post.id, {
        title: editorTitle.value.trim(),
        expectedUpdatedAt: post.post.updatedAt,
      }),
    );
  }

  for (const version of versions) {
    const publishable = await social.updatePostVersion(version.id, {
      bodyText: editedVersionIds.has(version.id) ? editorBody.value.trim() : version.bodyText,
      targetAccountId: !wasShared && version.id === selectedId
        ? editorAccountId.value
        : version.targetAccountId,
      approvalStatus: "approved",
    });
    replaceVersion(publishable);
    prepared.push(publishable);
  }

  const current = posts.value.find((detail) => detail.post.id === post.post.id);
  if (current) {
    if (wasShared) selectSharedVersions(visibleVersionsFor(current));
    else selectVersion(
      current.versions.find((version) => version.id === selectedId) || current.versions[0] || null,
    );
  }
  return prepared;
}

function openCreateDraft() {
  destinationMode.value = "create";
  destinationContentType.value = "short_video";
  selectedDestinationAccountIds.value = [];
  destinationError.value = "";
  showDestinations.value = true;
}

function openManageDestinations() {
  const detail = selectedPost.value;
  if (!detail || selectedPostReadOnly.value) return;
  destinationMode.value = "manage";
  const base = selectedVersion.value || detail.versions[0] || null;
  destinationContentType.value = base
    ? contentTypeFor(capabilityFor(base.platform), base.assetManifest, base.format)
    : "short_video";
  selectedDestinationAccountIds.value = detail.versions
    .map((version) => version.targetAccountId)
    .filter((accountId): accountId is string => Boolean(accountId));
  destinationError.value = "";
  showDestinations.value = true;
}

function toggleDestinationAccount(accountId: string) {
  const option = destinationAccounts.value.find((item) => item.account.id === accountId);
  if (!option?.compatible) return;
  if (
    destinationLocked(option.account) &&
    selectedDestinationAccountIds.value.includes(accountId)
  ) return;
  selectedDestinationAccountIds.value = selectedDestinationAccountIds.value.includes(accountId)
    ? selectedDestinationAccountIds.value.filter((id) => id !== accountId)
    : [...selectedDestinationAccountIds.value, accountId];
}

async function saveDestinations() {
  if (selectedDestinationAccountIds.value.length === 0) {
    destinationError.value = "Choose at least one platform.";
    return;
  }
  if (destinationMode.value === "create") {
    await createDraft();
  } else {
    await updateDestinations();
  }
}

async function createDraft() {
  const site = currentSite.value;
  const selectedAccounts = draftAccounts.value.filter((account) =>
    selectedDestinationAccountIds.value.includes(account.id),
  );
  if (!site || selectedAccounts.length === 0 || saving.value) return;
  const draftText = "Untitled draft";
  saving.value = true;
  destinationError.value = "";
  error.value = "";
  try {
    const detail = await social.createSocialPost({
      siteId: site.id,
      sourceType: "pasted",
      sourceSnapshot: draftText,
      sourceText: draftText,
      ideaText: draftText,
      versions: selectedAccounts.map((account) => {
        return {
          platform: account.platform as SocialPlatform,
          format: destinationContentType.value === "text" ? "post" as const : destinationContentType.value,
          bodyText: draftText,
          targetAccountId: account.id,
        };
      }),
    });
    posts.value = [detail, ...posts.value];
    activeMode.value = "drafts";
    showDestinations.value = false;
    selectPost(detail);
    toastSuccess(`Draft created for ${selectedAccounts.length} platform${selectedAccounts.length === 1 ? "" : "s"}.`);
  } catch (value) {
    social.setErrorFromApi(value, "Failed to create a draft");
    destinationError.value = social.error || "Failed to create a draft";
  } finally {
    saving.value = false;
  }
}

async function updateDestinations() {
  const detail = selectedPost.value;
  const base = selectedVersion.value || detail?.versions[0] || null;
  if (!detail || !base || saving.value) return;
  const selectedAccounts = draftAccounts.value.filter((account) =>
    selectedDestinationAccountIds.value.includes(account.id),
  );
  const selectedPlatforms = new Set(selectedAccounts.map((account) => account.platform));
  const additions = selectedAccounts.filter((account) =>
    !detail.versions.some((version) => version.platform === account.platform),
  );
  const removals = detail.versions.filter((version) =>
    !selectedPlatforms.has(version.platform) && canRemoveVersion(version),
  );

  saving.value = true;
  destinationError.value = "";
  try {
    let nextDetail = detail;
    for (const account of additions) {
      nextDetail = await social.addPostVersion(nextDetail.post.id, {
        platform: account.platform as SocialPlatform,
        targetAccountId: account.id,
        format: destinationContentType.value === "text" ? "post" : destinationContentType.value,
        bodyText: editorBody.value.trim() || base.bodyText,
        assetManifest: editorAssetManifest.value,
      });
      posts.value = posts.value.map((item) =>
        item.post.id === nextDetail.post.id ? nextDetail : item,
      );
    }
    for (const version of removals) {
      nextDetail = await social.deletePostVersion(version.id);
      posts.value = posts.value.map((item) =>
        item.post.id === nextDetail.post.id ? nextDetail : item,
      );
    }
    showDestinations.value = false;
    selectPost(nextDetail);
    toastSuccess("Publishing platforms updated.");
  } catch (value) {
    social.setErrorFromApi(value, "Failed to update publishing platforms");
    destinationError.value = social.error || "Failed to update publishing platforms";
  } finally {
    saving.value = false;
  }
}

async function loadLocalDemo() {
  const site = currentSite.value;
  if (!site || !localDemoAvailable.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const detail = await social.createLocalSocialDemo(site.id);
    posts.value = [detail, ...posts.value.filter((item) => item.post.id !== detail.post.id)];
    accounts.value = await social.fetchSocialAccounts();
    activeMode.value = "drafts";
    selectPost(detail);
    toastSuccess("Local demo loaded. It is safe to edit, approve, schedule, and delete.");
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load the local Social demo");
    error.value = social.error || "Failed to load the local Social demo";
  } finally {
    saving.value = false;
  }
}

async function deleteDraft(detail = selectedPost.value) {
  if (!detail || !canDeletePost(detail) || saving.value) return;
  const hasFailedHistory = detail.versions.some((version) =>
    version.publicationStatus === "failed" || version.publicationStatus === "cancelled",
  );
  if (!window.confirm(
    hasFailedHistory
      ? `Remove “${detail.post.ideaText}” from Drafts? Its failed delivery history will be retained.`
      : `Delete “${detail.post.ideaText}”? This cannot be undone.`,
  )) return;
  saving.value = true;
  error.value = "";
  try {
    await social.deleteSocialPost(detail.post.id, detail.post.updatedAt);
    posts.value = posts.value.filter((postDetail) => postDetail.post.id !== detail.post.id);
    if (selectedPostId.value === detail.post.id) {
      selectedPostId.value = null;
      selectVersion(null);
      ensureVisibleSelection();
    }
    toastSuccess(hasFailedHistory ? "Draft removed. Failed delivery history was retained." : "Draft deleted.");
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
  if (editorVersions.value.length === 0 || selectedPostReadOnly.value) return;
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

async function updateEditorMedia(
  assetManifest: PostVersion["assetManifest"],
  successMessage: string,
) {
  const versions = [...editorVersions.value];
  const wasShared = sharedEditor.value;
  const selectedId = selectedVersionId.value;
  const pendingTitle = editorTitle.value;
  const pendingBody = editorBody.value;
  const pendingAccountId = editorAccountId.value;
  const preserveTitle = titleDirty.value;
  const preserveBody = versions.some(
    (version) => pendingBody.trim() !== version.bodyText,
  );
  const preserveAccount = !wasShared && versions.some(
    (version) => (pendingAccountId || null) !== version.targetAccountId,
  );
  for (const version of versions) {
    replaceVersion(await social.updatePostVersion(version.id, { assetManifest }));
  }
  const current = selectedPost.value;
  if (current) {
    if (wasShared) selectSharedVersions(selectedVisibleVersions.value);
    else selectVersion(
      current.versions.find((version) => version.id === selectedId) || current.versions[0] || null,
    );
  }
  if (preserveTitle) editorTitle.value = pendingTitle;
  if (preserveBody) editorBody.value = pendingBody;
  if (preserveAccount) editorAccountId.value = pendingAccountId;
  toastSuccess(successMessage);
}

async function attachSelectedMedia() {
  if (editorVersions.value.length === 0 || selectedMediaFileIds.value.length === 0) return;
  const files = selectedMediaFileIds.value
    .map((id) => mediaFiles.value.find((file) => file.id === id))
    .filter((file): file is DriveFile => Boolean(file));
  if (!files.length) return;
  const selectedVideo = files.find(isVideoFile);
  const existingVideo = editorAssetManifest.value.some(isVideoAsset);
  if ((selectedVideo && editorAssetManifest.value.length > 0) || (existingVideo && files.length > 0)) {
    mediaError.value = "A video must be attached by itself. Remove the existing media first.";
    return;
  }
  const existingIds = new Set(
    editorAssetManifest.value.map((asset) => asset.fileId || asset.url),
  );
  const newFiles = files.filter(
    (file) => !existingIds.has(file.id) && !existingIds.has(driveFileUrl(file.id)),
  );
  saving.value = true;
  mediaError.value = "";
  try {
    const assetManifest = [
      ...editorAssetManifest.value.map((asset, index) => ({ ...asset, assetIndex: index })),
      ...newFiles
        .map((file, index) => driveFileAsset(file, editorAssetManifest.value.length + index)),
    ].map((asset, index) => ({ ...asset, assetIndex: index }));
    await updateEditorMedia(
      assetManifest,
      selectedVideo
        ? `Video attached to ${editorVersions.value.length} platform${editorVersions.value.length === 1 ? "" : "s"}.`
        : files.length === 1 ? "Image attached." : `${files.length} images attached in selection order.`,
    );
    showMediaPicker.value = false;
  } catch (value) {
    social.setErrorFromApi(value, "Failed to attach images");
    mediaError.value = social.error || "Failed to attach images";
  } finally {
    saving.value = false;
  }
}

async function moveMedia(fromIndex: number, offset: -1 | 1) {
  const toIndex = fromIndex + offset;
  if (
    editorVersions.value.length === 0 ||
    selectedPostReadOnly.value ||
    saving.value ||
    toIndex < 0 ||
    toIndex >= editorAssetManifest.value.length
  ) return;
  const assetManifest = [...editorAssetManifest.value];
  const [moved] = assetManifest.splice(fromIndex, 1);
  if (!moved) return;
  assetManifest.splice(toIndex, 0, moved);
  saving.value = true;
  error.value = "";
  try {
    await updateEditorMedia(
      assetManifest.map((asset, index) => ({ ...asset, assetIndex: index })),
      "Media order updated.",
    );
  } catch (value) {
    social.setErrorFromApi(value, "Failed to reorder media");
    error.value = social.error || "Failed to reorder media";
  } finally {
    saving.value = false;
  }
}

async function removeMedia(assetUrl: string) {
  if (editorVersions.value.length === 0 || selectedPostReadOnly.value || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await updateEditorMedia(
      editorAssetManifest.value.filter((asset) => asset.url !== assetUrl),
      "Media removed.",
    );
  } catch (value) {
    social.setErrorFromApi(value, "Failed to remove this image");
    error.value = social.error || "Failed to remove this image";
  } finally {
    saving.value = false;
  }
}

function openSchedule() {
  if (!canSchedule.value) return;
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
    const versions = await prepareVersionsForPublication();
    if (!versions.length) return;
    const results = await Promise.allSettled(versions.map(async (version) => {
      const publication = await social.createPostVersionPublication(version.id, {
        scheduledFor: resolution.value,
        timezone: scheduleTimezone.value,
        requestContext: { surface: "social-editor", batch: true },
      });
      replaceVersion({
        ...version,
        scheduledFor: publication.scheduledFor,
        timezone: publication.timezone,
        publicationStatus: publication.status,
      });
      return publication;
    }));
    const succeeded = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (failed) {
      scheduleError.value = `${succeeded} platform${succeeded === 1 ? "" : "s"} scheduled; ${failed} need attention. Successful schedules were kept.`;
      return;
    }
    showSchedule.value = false;
    toastSuccess(`Post scheduled for ${succeeded} platform${succeeded === 1 ? "" : "s"}.`);
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
  publishError.value = "";
  try {
    const versions = await prepareVersionsForPublication();
    if (!versions.length) return;
    const results = await Promise.allSettled(versions.map(async (version) => {
      const publication = await social.publishPostVersion(version.id);
      replaceVersion({
        ...version,
        publicationStatus: publication.status,
        platformPostUrl: publication.platformPostUrl,
        publishedAt: publication.publishedAt,
        failureClass: publication.failureClass,
        errorMessage: publication.errorMessage,
      });
      return publication;
    }));
    const publications = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const failedPublications = publications.filter(
      (publication) => publication.status === "failed" || publication.status === "cancelled",
    );
    const failed = rejected.length + failedPublications.length;
    const succeeded = results.length - failed;
    if (failed > 0) {
      const providerMessage = failedPublications.find(
        (publication) => publication.errorMessage,
      )?.errorMessage;
      if (!providerMessage && rejected[0]) {
        social.setErrorFromApi(rejected[0].reason, "Failed to publish this post");
      }
      const failureReason =
        providerMessage ||
        social.error ||
        "One or more platforms could not start publishing.";
      publishError.value = succeeded > 0
        ? `${succeeded} platform${succeeded === 1 ? "" : "s"} started; ${failed} failed. ${failureReason}`
        : failureReason;
      toastError(publishError.value);
      return;
    }
    const includesTikTok = versions.some((version) => version.platform === "tiktok");
    const inProgress = publications.filter(
      (publication) =>
        publication.status === "queued" ||
        publication.status === "publishing" ||
        publication.status === "scheduled",
    );
    if (inProgress.length > 0) {
      toast(
        `Sending to ${inProgress.length} platform${inProgress.length === 1 ? "" : "s"}…` +
        (includesTikTok ? " TikTok will receive a creator draft to finish in the app." : ""),
      );
    } else if (includesTikTok) {
      toastSuccess(
        succeeded === 1
          ? "TikTok draft sent to your inbox."
          : `Published to ${succeeded} platforms. The TikTok draft was sent to your inbox.`,
      );
    } else {
      toastSuccess(`Published to ${succeeded} platform${succeeded === 1 ? "" : "s"}.`);
    }
  } catch (value) {
    social.setErrorFromApi(value, "Failed to publish this post");
    publishError.value = social.error || "Failed to publish this post";
    toastError(publishError.value);
  } finally {
    scheduling.value = false;
  }
}

watch(mediaFolderId, () => {
  if (showMediaPicker.value) void loadMediaFiles();
});

watch(destinationContentType, () => {
  selectedDestinationAccountIds.value = selectedDestinationAccountIds.value.filter((accountId) => {
    const option = destinationAccounts.value.find((item) => item.account.id === accountId);
    return Boolean(option && (option.compatible || destinationLocked(option.account)));
  });
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
            @click="openCreateDraft"
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
              @click="openCreateDraft"
            >
              Write a Post
            </Button>
          </div>
          <template v-else>
            <article
              v-for="detail in visiblePosts"
              :key="detail.post.id"
              class="post-row"
              :class="{ 'post-row--active': selectedPostId === detail.post.id }"
            >
              <button
                type="button"
                class="post-row__select"
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
                        <img v-if="accountAvatarUrl(version)" class="social-account-avatar__image" :src="accountAvatarUrl(version)!" alt="" />
                        <template v-else>{{ accountInitials(version) }}</template>
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
              <Button
                v-if="selectedPostId === detail.post.id && canDeletePost(detail)"
                class="post-row__delete"
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                type="button"
                aria-label="Delete selected draft"
                title="Delete draft"
                :disabled="saving"
                @click="deleteDraft(detail)"
              >
                <UiIcon name="Trash2" :size="16" aria-hidden="true" />
              </Button>
            </article>
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
              <span v-if="includesYouTubeDestination" class="post-title-guidance">
                Used as the YouTube title. Private uploads are reviewed in YouTube Studio.
              </span>
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

          <div class="version-tabs" role="tablist" aria-label="Post versions">
            <button
              v-if="selectedVisibleVersions.length > 1"
              type="button"
              role="tab"
              :aria-selected="sharedEditor"
              :class="['version-tab', 'version-tab--shared', { 'version-tab--active': sharedEditor }]"
              title="Edit shared copy and media for every selected platform"
              @click="selectSharedVersions()"
            >
              <UiIcon name="Copy" :size="17" aria-hidden="true" />
              <span>All</span>
            </button>
            <button
              v-for="version in selectedVisibleVersions"
              :key="version.id"
              type="button"
              role="tab"
              :aria-selected="!sharedEditor && selectedVersionId === version.id"
              :class="['version-tab', { 'version-tab--active': !sharedEditor && selectedVersionId === version.id }]"
              :title="accountLabel(version)"
              @click="selectVersion(version)"
            >
              <span :class="['social-account-avatar', `social-account-avatar--${version.platform}`]" aria-hidden="true">
                <img v-if="accountAvatarUrl(version)" class="social-account-avatar__image" :src="accountAvatarUrl(version)!" alt="" />
                <template v-else>{{ accountInitials(version) }}</template>
                <span class="social-account-avatar__platform">
                  <svg viewBox="0 0 24 24"><path :d="platformIconPath(version.platform)" /></svg>
                </span>
              </span>
              <span class="sr-only">{{ accountLabel(version) }}</span>
            </button>
            <button
              v-if="!selectedPostReadOnly && activeMode === 'drafts'"
              type="button"
              class="version-tab version-tab--add"
              aria-label="Add or remove publishing platforms"
              title="Add or remove platforms"
              @click="openManageDestinations"
            >
              <UiIcon name="Plus" :size="18" aria-hidden="true" />
            </button>
          </div>

          <div v-if="selectedVersion" class="version-workspace">
            <div class="version-editor">
              <div class="editor-context">
                <strong>{{ sharedEditor ? 'All selected platforms' : platformLabel(selectedVersion.platform) }}</strong>
                <span v-if="sharedEditor">Shared edits replace copy and media on every selected platform. Open a platform tab to customise it.</span>
                <span v-else>Edit only this platform version.</span>
              </div>
              <div v-if="sharedEditor && (sharedBodyMixed || sharedMediaMixed)" class="state-banner shared-variation-notice" role="status">
                Some platforms already have custom {{ sharedBodyMixed && sharedMediaMixed ? 'copy and media' : sharedBodyMixed ? 'copy' : 'media' }}. Saving here will replace those custom fields across all selected platforms.
              </div>
              <label class="field">
                <span class="sr-only">Post text</span>
                <textarea
                  v-model="editorBody"
                  rows="10"
                  :disabled="saving"
                  :readonly="selectedPostReadOnly"
                />
              </label>
              <div class="editor-validation-summary" aria-live="polite">
                <span>{{ Array.from(editorBody).length.toLocaleString() }} characters</span>
                <span v-if="!sharedEditor && targetValidations.find((item) => item.version.id === selectedVersionId)?.issue" class="validation-issue">
                  {{ targetValidations.find((item) => item.version.id === selectedVersionId)?.issue }}
                </span>
              </div>

              <div v-if="!selectedPostReadOnly" class="media-attachments">
                <div class="media-attachments__toolbar">
                  <Button color="ghost" shape="soft" size="compact" type="button" :disabled="saving" @click="openMediaPicker">
                    <UiIcon name="Images" :size="17" aria-hidden="true" />
                    Add media
                  </Button>
                  <span v-if="editorAssetManifest.length">{{ editorAssetManifest.length }} attached</span>
                </div>
                <div v-if="editorAssetManifest.length" class="media-attachments__items">
                  <figure v-for="(asset, index) in editorAssetManifest" :key="asset.url" class="media-attachment">
                    <div class="media-attachment__preview">
                      <img v-if="!isVideoAsset(asset)" :src="asset.url" :alt="asset.altText || asset.filename || 'Attached media'" />
                      <video v-else :src="asset.url" muted preload="metadata" />
                      <Button class="media-attachment__remove" color="ghost" shape="soft" size="compact" icon-only type="button" :aria-label="`Remove ${asset.filename || 'media'}`" @click="removeMedia(asset.url)">
                        <UiIcon name="X" :size="14" aria-hidden="true" />
                      </Button>
                    </div>
                    <div v-if="editorAssetManifest.length > 1" class="media-attachment__order">
                      <Button class="media-attachment__move" color="ghost" shape="soft" size="compact" icon-only type="button" :disabled="saving || index === 0" :aria-label="`Move ${asset.filename || 'media'} earlier`" @click="moveMedia(index, -1)">
                        <UiIcon name="ChevronLeft" :size="15" aria-hidden="true" />
                      </Button>
                      <span aria-hidden="true">{{ index + 1 }}</span>
                      <Button class="media-attachment__move" color="ghost" shape="soft" size="compact" icon-only type="button" :disabled="saving || index === editorAssetManifest.length - 1" :aria-label="`Move ${asset.filename || 'media'} later`" @click="moveMedia(index, 1)">
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
                <Button color="outline" shape="soft" size="compact" type="button" :disabled="saving || scheduling || !canPublishNow" @click="publishNow">
                  <UiIcon name="Send" :size="16" aria-hidden="true" />
                  {{ scheduling ? 'Posting…' : 'Post now' }}
                </Button>
                <Button color="primary" shape="soft" size="compact" type="button" :disabled="saving || scheduling || !canSchedule" @click="openSchedule">
                  <UiIcon name="CalendarClock" :size="16" aria-hidden="true" />
                  Schedule
                </Button>
              </div>
              <p v-if="publishError" class="form-error editor-action-error" role="alert" aria-live="assertive">{{ publishError }}</p>
            </div>

            <aside v-if="sharedEditor" class="post-preview publishing-checks" aria-label="Publishing checks">
              <header class="publishing-checks__header">
                <div>
                  <strong>Publishing checks</strong>
                  <span>{{ targetValidations.length }} selected destination{{ targetValidations.length === 1 ? '' : 's' }}</span>
                </div>
              </header>
              <ul class="publishing-checks__list">
                <li v-for="validation in targetValidations" :key="validation.version.id">
                  <span :class="['social-account-avatar', 'social-account-avatar--compact', `social-account-avatar--${validation.version.platform}`]" aria-hidden="true">
                    <img v-if="accountAvatarUrl(validation.version)" class="social-account-avatar__image" :src="accountAvatarUrl(validation.version)!" alt="" />
                    <template v-else>{{ accountInitials(validation.version) }}</template>
                    <span class="social-account-avatar__platform">
                      <svg viewBox="0 0 24 24"><path :d="platformIconPath(validation.version.platform)" /></svg>
                    </span>
                  </span>
                  <span class="publishing-checks__copy">
                    <strong>{{ platformLabel(validation.version.platform) }}</strong>
                    <small>{{ validation.capability?.deliveryLabel }}</small>
                  </span>
                  <span :class="['validation-state', { 'validation-state--ready': validation.contentValid && validation.accountValid && validation.capability?.publish }]">
                    {{ validation.issue || (validation.capability?.publish ? 'Ready' : validation.capability?.deliveryLabel || 'Unavailable') }}
                  </span>
                </li>
              </ul>
            </aside>

            <aside v-else :class="['post-preview', `post-preview--${selectedVersion.platform}`]" aria-label="Post preview">
              <template v-if="selectedVersion.platform === 'tiktok'">
                <div class="tiktok-preview__platform-bar">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="platformIconPath(selectedVersion.platform)" /></svg>
                  <span>TikTok preview</span>
                </div>
                <div class="tiktok-preview__stage">
                  <template v-if="selectedVersion.assetManifest.length">
                    <video
                      v-if="isVideoAsset(selectedVersion.assetManifest[0]!)"
                      :src="selectedVersion.assetManifest[0]!.url"
                      controls
                      muted
                      playsinline
                      preload="metadata"
                      class="tiktok-preview__media"
                      :aria-label="selectedVersion.assetManifest[0]!.altText || selectedVersion.assetManifest[0]!.filename || 'TikTok video preview'"
                    />
                    <img
                      v-else
                      :src="selectedVersion.assetManifest[0]!.url"
                      :alt="selectedVersion.assetManifest[0]!.altText || selectedVersion.assetManifest[0]!.filename || 'TikTok post preview'"
                      class="tiktok-preview__media"
                    />
                  </template>
                  <div v-else class="tiktok-preview__empty">
                    <UiIcon name="Play" :size="28" aria-hidden="true" />
                    <span>Add a video to preview your TikTok</span>
                  </div>

                  <div class="tiktok-preview__topbar" aria-hidden="true">
                    <span class="tiktok-preview__back">‹</span>
                    <span class="tiktok-preview__search-pill">
                      <UiIcon name="Search" :size="14" />
                      <span>Find related content</span>
                      <strong>Search</strong>
                    </span>
                  </div>
                  <span class="tiktok-preview__draft-toast" aria-hidden="true">Draft saved</span>

                  <div class="tiktok-preview__rail" aria-hidden="true">
                    <span class="tiktok-preview__profile-avatar">{{ previewAccountName(selectedVersion).slice(0, 1).toUpperCase() }}</span>
                    <span class="tiktok-preview__rail-action">
                      <UiIcon name="Heart" :size="25" />
                      <strong>22</strong>
                    </span>
                    <span class="tiktok-preview__rail-action">
                      <UiIcon name="MessageCircle" :size="25" />
                      <strong>Add 1st</strong>
                    </span>
                    <span class="tiktok-preview__rail-action">
                      <UiIcon name="Bookmark" :size="25" />
                      <strong>0</strong>
                    </span>
                    <span class="tiktok-preview__rail-action">
                      <UiIcon name="Ellipsis" :size="25" />
                    </span>
                  </div>

                  <div class="tiktok-preview__bottom-fade" aria-hidden="true" />
                  <div class="tiktok-preview__caption">
                    <div class="tiktok-preview__caption-author">
                      <strong>{{ previewAccountHandle(selectedVersion) }}</strong>
                      <span>· now</span>
                    </div>
                    <p>{{ editorBody || 'Your TikTok caption will appear here.' }}</p>
                    <span class="tiktok-preview__sound">♫ Original sound</span>
                  </div>

                  <div class="tiktok-preview__progress" aria-hidden="true">
                    <span />
                  </div>
                </div>
                <div class="tiktok-preview__footer" aria-hidden="true">
                  <span>First-time boost? More followers await!</span>
                  <UiIcon name="ChevronRight" :size="17" />
                </div>
              </template>
              <template v-else>
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
              </template>
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

    <AppDialog :open="showDestinations" labelled-by="social-destinations-title" @close="showDestinations = false">
      <section class="social-destinations-dialog">
        <header>
          <div>
            <h2 id="social-destinations-title">{{ destinationMode === 'create' ? 'Choose publishing platforms' : 'Publishing platforms' }}</h2>
            <p>No platform is selected by default. Choose only the destinations for this Post.</p>
          </div>
          <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close platform picker" @click="showDestinations = false">
            <UiIcon name="X" :size="17" aria-hidden="true" />
          </Button>
        </header>

        <fieldset class="content-type-picker">
          <legend>What are you posting?</legend>
          <label :class="{ 'is-selected': destinationContentType === 'short_video' }">
            <input v-model="destinationContentType" type="radio" value="short_video" />
            <UiIcon name="Play" :size="17" aria-hidden="true" />
            <span>Short video</span>
          </label>
          <label :class="{ 'is-selected': destinationContentType === 'image' }">
            <input v-model="destinationContentType" type="radio" value="image" />
            <UiIcon name="Image" :size="17" aria-hidden="true" />
            <span>Image</span>
          </label>
          <label :class="{ 'is-selected': destinationContentType === 'carousel' }">
            <input v-model="destinationContentType" type="radio" value="carousel" />
            <UiIcon name="Images" :size="17" aria-hidden="true" />
            <span>Carousel</span>
          </label>
          <label :class="{ 'is-selected': destinationContentType === 'text' }">
            <input v-model="destinationContentType" type="radio" value="text" />
            <UiIcon name="FileText" :size="17" aria-hidden="true" />
            <span>Text</span>
          </label>
        </fieldset>

        <div class="destination-options" role="group" aria-label="Connected platform accounts">
          <button
            v-for="option in destinationAccounts"
            :key="option.account.id"
            type="button"
            :class="['destination-option', { 'is-selected': selectedDestinationAccountIds.includes(option.account.id) }]"
            :aria-pressed="selectedDestinationAccountIds.includes(option.account.id)"
            :disabled="!option.compatible && !destinationLocked(option.account)"
            @click="toggleDestinationAccount(option.account.id)"
          >
            <span :class="['social-account-avatar', `social-account-avatar--${option.account.platform}`]" aria-hidden="true">
              <img v-if="option.account.avatarUrl" class="social-account-avatar__image" :src="option.account.avatarUrl" alt="" />
              <template v-else>{{ accountInitialsForAccount(option.account) }}</template>
              <span class="social-account-avatar__platform">
                <svg viewBox="0 0 24 24"><path :d="platformIconPath(option.account.platform as SocialPlatform)" /></svg>
              </span>
            </span>
            <span class="destination-option__copy">
              <strong>{{ platformLabel(option.account.platform) }}</strong>
              <small>{{ accountDisplayName(option.account) }} · {{ option.capability?.deliveryLabel }}</small>
              <small v-if="!option.compatible">{{ destinationLocked(option.account) ? 'Publication history keeps this platform attached.' : `Not available for ${destinationContentType.replace('_', ' ')}.` }}</small>
            </span>
            <UiIcon
              :name="selectedDestinationAccountIds.includes(option.account.id) ? (destinationLocked(option.account) ? 'Shield' : 'Check') : 'Plus'"
              :size="17"
              aria-hidden="true"
            />
          </button>
        </div>

        <p v-if="destinationError" class="form-error" role="alert">{{ destinationError }}</p>
        <footer>
          <span>{{ selectedDestinationAccountIds.length }} selected</span>
          <div class="inline-actions">
            <Button color="outline" shape="soft" size="compact" type="button" :disabled="saving" @click="showDestinations = false">Cancel</Button>
            <Button color="primary" shape="soft" size="compact" type="button" :disabled="saving || selectedDestinationAccountIds.length === 0" @click="saveDestinations">
              {{ saving ? 'Saving…' : destinationMode === 'create' ? 'Create draft' : 'Update platforms' }}
            </Button>
          </div>
        </footer>
      </section>
    </AppDialog>

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
            <h2 id="social-schedule-title">Schedule post</h2>
            <p>{{ targetValidations.length }} selected platform{{ targetValidations.length === 1 ? '' : 's' }}. Each receives its exact platform version.</p>
          </div>
          <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close schedule dialog" @click="showSchedule = false">
            <UiIcon name="X" :size="17" aria-hidden="true" />
          </Button>
        </header>

        <ul class="publish-target-list">
          <li v-for="validation in targetValidations" :key="validation.version.id">
            <span>
              <strong>{{ platformLabel(validation.version.platform) }}</strong>
              <small>{{ validation.capability?.deliveryLabel }}</small>
            </span>
            <span :class="['validation-state', { 'validation-state--ready': !validation.issue && validation.capability?.publish }]">
              {{ validation.issue || (validation.capability?.publish ? 'Ready' : validation.capability?.reason || 'Unavailable') }}
            </span>
          </li>
        </ul>

        <div class="schedule-fields">
          <label class="field"><span>Date</span><input v-model="scheduleDate" type="date" required /></label>
          <label class="field"><span>Time</span><input v-model="scheduleTime" type="time" required /></label>
        </div>
        <label class="field"><span>Timezone</span><input v-model="scheduleTimezone" required /></label>
        <p v-if="scheduleError" class="form-error" role="alert">{{ scheduleError }}</p>
        <footer>
          <Button color="outline" shape="soft" size="compact" type="button" :disabled="scheduling" @click="showSchedule = false">Cancel</Button>
          <Button
            color="primary"
            shape="soft"
            size="compact"
            type="submit"
            :disabled="scheduling || !canSchedule"
          >
            <UiIcon name="CalendarClock" :size="16" aria-hidden="true" />
            {{ scheduling ? 'Scheduling…' : 'Schedule' }}
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
  position: relative;
  width: 100%;
  border-bottom: 1px solid var(--ui-border);
  background: transparent;
  color: inherit;
}

.post-row__select {
  display: grid;
  width: 100%;
  gap: 8px;
  padding: 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.post-row:hover,
.post-row--active {
  background: var(--ui-surface);
}

.post-row__select:focus-visible,
.version-tab:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.post-row__delete {
  position: absolute;
  z-index: 1;
  top: 8px;
  right: 8px;
}

.post-row--active .post-row__meta {
  padding-right: 38px;
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

.social-account-avatar__image {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
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

.post-title-guidance {
  display: block;
  margin-top: 5px;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
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

.version-tab--shared {
  grid-auto-flow: column;
  width: auto;
  min-width: 58px;
  gap: 5px;
  padding: 0 8px;
  filter: none;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 700;
}

.version-tab--add {
  border: 1px dashed var(--ui-border-strong);
  border-bottom-width: 1px;
  border-radius: 50%;
  filter: none;
  opacity: 0.72;
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

.editor-context {
  display: grid;
  gap: 3px;
}

.editor-context > span,
.editor-validation-summary {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  line-height: 1.4;
}

.shared-variation-notice {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.78rem;
}

.editor-validation-summary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: -6px;
}

.validation-issue {
  color: #a54545;
  text-align: right;
}

.publishing-checks {
  align-self: start;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.publishing-checks__header {
  padding: 16px;
  border-bottom: 1px solid var(--ui-border);
}

.publishing-checks__header > div,
.publishing-checks__copy {
  display: grid;
  gap: 2px;
}

.publishing-checks__header span,
.publishing-checks__copy small {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.publishing-checks__list,
.publish-target-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.publishing-checks__list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--ui-border);
}

.publishing-checks__list li:last-child {
  border-bottom: 0;
}

.validation-state {
  max-width: 190px;
  color: #a54545;
  font-size: 0.72rem;
  line-height: 1.35;
  text-align: right;
}

.validation-state--ready {
  color: var(--ui-accent-strong);
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

/* TikTok keeps the video primary: the caption and social chrome live on the
   lower edge of a portrait stage instead of above the media like a feed post. */
.post-preview--tiktok {
  width: min(100%, 380px);
  justify-self: center;
  border-color: #0f0f0f;
  border-radius: 18px;
  background: #000;
  color: #fff;
  box-shadow: 0 18px 38px rgb(15 23 42 / 16%);
}

.tiktok-preview__platform-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 13px;
  border-bottom: 1px solid #2b2b2b;
  background: #0f0f0f;
  color: #fff;
  font-size: 0.76rem;
  font-weight: 700;
}

.tiktok-preview__platform-bar svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.tiktok-preview__stage {
  position: relative;
  width: 100%;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  background: #121212;
}

.tiktok-preview__media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #121212;
}

.tiktok-preview__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 9px;
  padding: 28px;
  color: rgb(255 255 255 / 72%);
  font-size: 0.8rem;
  text-align: center;
}

.tiktok-preview__topbar {
  position: absolute;
  z-index: 4;
  top: 12px;
  right: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  pointer-events: none;
}

.tiktok-preview__back {
  display: inline-flex;
  width: 22px;
  justify-content: center;
  color: #fff;
  font-size: 2rem;
  font-weight: 300;
  line-height: 1;
  text-shadow: 0 1px 4px rgb(0 0 0 / 45%);
}

.tiktok-preview__search-pill {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  min-width: 0;
  flex: 1;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid rgb(255 255 255 / 88%);
  border-radius: 10px;
  background: rgb(24 24 24 / 16%);
  color: #fff;
  font-size: 0.68rem;
  backdrop-filter: blur(7px);
}

.tiktok-preview__search-pill span {
  overflow: hidden;
  color: rgb(255 255 255 / 88%);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tiktok-preview__search-pill strong {
  padding-left: 8px;
  border-left: 1px solid rgb(255 255 255 / 38%);
  font-size: 0.68rem;
  font-weight: 650;
}

.tiktok-preview__draft-toast {
  position: absolute;
  z-index: 4;
  top: 64px;
  left: 50%;
  padding: 10px 18px;
  border-radius: 15px;
  background: rgb(78 87 102 / 82%);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 650;
  transform: translateX(-50%);
  white-space: nowrap;
}

.tiktok-preview__rail {
  position: absolute;
  z-index: 4;
  right: 8px;
  bottom: 104px;
  display: grid;
  justify-items: center;
  gap: 13px;
  width: 42px;
  color: #fff;
  text-shadow: 0 1px 4px rgb(0 0 0 / 55%);
}

.tiktok-preview__profile-avatar {
  display: grid;
  width: 35px;
  height: 35px;
  place-items: center;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #343434;
  font-size: 0.72rem;
  font-weight: 750;
}

.tiktok-preview__rail-action {
  display: grid;
  justify-items: center;
  gap: 2px;
  font-size: 0.64rem;
  font-weight: 650;
  line-height: 1.15;
}

.tiktok-preview__rail-action :deep(svg) {
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 42%));
}

.tiktok-preview__bottom-fade {
  position: absolute;
  z-index: 1;
  inset: 52% 0 0;
  background: linear-gradient(180deg, transparent 0%, rgb(0 0 0 / 14%) 36%, rgb(0 0 0 / 88%) 100%);
  pointer-events: none;
}

.tiktok-preview__caption {
  position: absolute;
  z-index: 3;
  right: 58px;
  bottom: 48px;
  left: 14px;
  text-shadow: 0 1px 4px rgb(0 0 0 / 60%);
}

.tiktok-preview__caption-author {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 0.78rem;
}

.tiktok-preview__caption-author span {
  color: rgb(255 255 255 / 78%);
  font-size: 0.68rem;
}

.tiktok-preview__caption p {
  display: -webkit-box;
  overflow: hidden;
  margin: 6px 0 5px;
  color: #fff;
  font-size: 0.76rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  white-space: pre-wrap;
}

.tiktok-preview__sound {
  display: block;
  overflow: hidden;
  color: rgb(255 255 255 / 90%);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tiktok-preview__progress {
  position: absolute;
  z-index: 5;
  right: 8px;
  bottom: 5px;
  left: 8px;
  height: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 42%);
  pointer-events: none;
}

.tiktok-preview__progress span {
  display: block;
  width: 34%;
  height: 100%;
  border-radius: inherit;
  background: #fff;
}

.tiktok-preview__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px 9px;
  background: #151515;
  color: rgb(255 255 255 / 88%);
  font-size: 0.68rem;
  line-height: 1.25;
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
.social-destinations-dialog,
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

.social-destinations-dialog {
  display: grid;
  gap: 18px;
}

.social-destinations-dialog > header,
.social-destinations-dialog > footer,
.social-media-picker header,
.social-media-picker footer,
.social-schedule-dialog header,
.social-schedule-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.social-destinations-dialog h2,
.social-destinations-dialog p,
.social-media-picker h2,
.social-media-picker p,
.social-schedule-dialog h2,
.social-schedule-dialog p {
  margin: 0;
}

.social-destinations-dialog header p,
.social-media-picker header p,
.social-schedule-dialog header p {
  margin-top: 4px;
  color: var(--ui-text-muted);
}

.content-type-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  padding: 0;
  border: 0;
}

.content-type-picker legend {
  width: 100%;
  margin-bottom: 2px;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.content-type-picker label {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  cursor: pointer;
}

.content-type-picker label.is-selected {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
}

.content-type-picker input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.content-type-picker label:focus-within {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.editor-action-error {
  margin: 10px 0 0;
}

.destination-options {
  display: grid;
  gap: 7px;
}

.destination-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 64px;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.destination-option:hover:not(:disabled),
.destination-option.is-selected {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
}

.destination-option:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.destination-option:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.destination-option__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.destination-option__copy small {
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publish-target-list {
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
}

.publish-target-list li {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border);
}

.publish-target-list li:last-child {
  border-bottom: 0;
}

.publish-target-list li > span:first-child {
  display: grid;
  gap: 2px;
}

.publish-target-list small {
  color: var(--ui-text-muted);
  font-size: 0.74rem;
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
