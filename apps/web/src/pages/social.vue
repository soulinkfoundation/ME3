<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter, type LocationQueryRaw } from "vue-router";
import AppDialog from "../components/AppDialog.vue";
import Button from "../components/Button.vue";
import SocialAccountsPanel from "../components/SocialAccountsPanel.vue";
import SocialCarouselEditor from "../components/SocialCarouselEditor.vue";
import SocialPostingPlanDialog from "../components/SocialPostingPlanDialog.vue";
import SocialSuggestionsPanel from "../components/SocialSuggestionsPanel.vue";
import UiIcon from "../components/UiIcon.vue";
import WorkspaceTabs from "../components/WorkspaceTabs.vue";
import { useSitesStore } from "../stores/sites";
import {
  useSocialStore,
  type PostVersion,
  type Publication,
  type PostLibraryItem,
  type PostingPlan,
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
const route = useRoute();
const router = useRouter();
const selectedSiteId = ref("");
const posts = ref<SocialPostDetail[]>([]);
const accounts = ref<SocialAccountRow[]>([]);
const capabilities = ref<SocialPlatformCapabilities[]>([]);
const publications = ref<Publication[]>([]);
const publicationsLoading = ref(false);
const activeMode = ref<WorkspaceMode>("drafts");
const selectedPostId = ref<string | null>(null);
const selectedVersionId = ref<string | null>(null);
const editorBody = ref("");
const editorAccountId = ref("");
const scheduleLocal = ref("");
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
const suggestionsOpen = ref(currentQueryParam("suggestions") === "open");
const suggestionCount = ref(0);
const postingPlanQueryId = computed(() => routeQueryText(route.query.postingPlan));
const postingPlanOpen = ref(Boolean(postingPlanQueryId.value));
const linkedPostingPlanId = ref(postingPlanQueryId.value);
const libraryQuery = ref("");
const librarySource = ref("");
const libraryPlatform = ref<SocialPlatform | "">("");
const libraryAccountId = ref("");
const libraryApproval = ref<PostVersion["approvalStatus"] | "">("");
const libraryDelivery = ref<Publication["status"] | "">("");
const libraryTag = ref("");
const libraryPublishedFrom = ref("");
const libraryPublishedTo = ref("");
const libraryResults = ref<PostLibraryItem[] | null>(null);
const librarySearching = ref(false);
const tagEditor = ref("");
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const linkedPublicationId = ref(currentQueryParam("publicationId"));

const currentSite = computed(
  () => sites.sites.find((site) => site.id === selectedSiteId.value) || null,
);

const activeAccounts = computed(() =>
  accounts.value.filter(
    (account) => account.siteId === selectedSiteId.value && account.status === "active",
  ),
);

const capabilityMap = computed(
  () => new Map(capabilities.value.map((capability) => [capability.platform, capability])),
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

const visiblePostGroups = computed(() => {
  const groups = new Map<string, { key: string; label: string; posts: SocialPostDetail[] }>();
  for (const detail of visiblePosts.value) {
    const key = detail.post.sourceRef || `${detail.post.sourceType}:${detail.post.sourceSnapshot}`;
    const existing = groups.get(key) || {
      key,
      label: `${sourceLabel(detail)} · ${sourcePreview(detail)}`,
      posts: [],
    };
    existing.posts.push(detail);
    groups.set(key, existing);
  }
  return [...groups.values()];
});

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

const selectedCapability = computed(() =>
  selectedVersion.value
    ? capabilityMap.value.get(selectedVersion.value.platform) || null
    : null,
);

const scheduledPublication = computed(
  () => publications.value.find((publication) => publication.status === "scheduled") || null,
);

const hasPublishedPublication = computed(() =>
  publications.value.some((publication) => publication.status === "published"),
);

const matchingAccounts = computed(() => {
  const platform = selectedVersion.value?.platform;
  return platform
    ? activeAccounts.value.filter((account) => account.platform === platform)
    : [];
});

const editorDirty = computed(() => {
  const version = selectedVersion.value;
  return Boolean(
    version &&
      (editorBody.value.trim() !== version.bodyText ||
        (editorAccountId.value || null) !== version.targetAccountId),
  );
});

const tagsDirty = computed(() => {
  const detail = selectedPost.value;
  if (!detail) return false;
  return normalizeTagInput(tagEditor.value).join("\u0000") !== detail.post.tags.join("\u0000");
});

const canApprove = computed(() =>
  Boolean(
    !selectedPostReadOnly.value &&
      selectedVersion.value &&
      editorBody.value.trim() &&
      editorAccountId.value,
  ),
);

const canSchedule = computed(() =>
  Boolean(
    !selectedPostReadOnly.value &&
      selectedCapability.value?.schedule &&
      selectedVersion.value?.approvalStatus === "approved" &&
      !editorDirty.value &&
      scheduleLocal.value,
  ),
);

const canPublish = computed(() =>
  Boolean(
    !selectedPostReadOnly.value &&
      selectedCapability.value?.publish &&
      selectedVersion.value?.approvalStatus === "approved" &&
      !editorDirty.value &&
      matchingAccounts.value.some((account) => account.id === editorAccountId.value) &&
      !["queued", "publishing"].includes(
        selectedVersion.value?.publicationStatus || "",
      ) &&
      !publications.value.some((publication) =>
        publication.status === "queued" || publication.status === "publishing"
      ),
  ),
);

const composeOptions = computed(() =>
  capabilities.value.filter((item) => item.draft).map((item) => ({
    ...item,
    label: platformLabel(item.platform),
    connected: activeAccounts.value.some((account) => account.platform === item.platform),
  })),
);

const composeCanSave = computed(
  () => Boolean(composeBody.value.trim() && composePlatforms.value.length),
);

const minimumScheduleLocal = computed(() => toLocalInput(new Date(Date.now() + 60_000)));

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

function sourceLabel(detail: SocialPostDetail): string {
  if (detail.post.sourceType === "journal") return "Journal";
  if (detail.post.sourceType === "mission_task") return "Mission Control";
  if (detail.post.sourceType === "site") return "Site";
  if (detail.post.sourceType === "file") return "File";
  if (detail.post.sourceType === "script") return "Script";
  if (detail.post.sourceType === "legacy_content_bank_read_only") return "Imported post";
  return "Pasted text";
}

function sourcePreview(detail: SocialPostDetail): string {
  const firstLine = detail.post.sourceText.split("\n").map((line) => line.trim()).find(Boolean) ||
    detail.post.ideaText;
  return firstLine.length > 58 ? `${firstLine.slice(0, 55)}…` : firstLine;
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

function publicationStateLabel(status: Publication["status"]): string {
  return status[0]!.toUpperCase() + status.slice(1);
}

function publicationMoment(publication: Publication): string | null {
  return publication.publishedAt || publication.scheduledFor || publication.queuedAt || publication.createdAt;
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

function toLocalInput(value: Date): string {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function setActiveMode(value: string) {
  if (!(value === "drafts" || value === "scheduled" || value === "published")) return;
  activeMode.value = value;
  ensureVisibleSelection();
}

function selectPost(detail: SocialPostDetail) {
  selectedPostId.value = detail.post.id;
  tagEditor.value = detail.post.tags.join(", ");
  const version = visibleVersionsFor(detail)[0] || null;
  selectVersion(version);
}

function normalizeTagInput(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

async function saveTags() {
  const detail = selectedPost.value;
  if (!detail || selectedPostReadOnly.value || !tagsDirty.value) return;
  saving.value = true;
  error.value = "";
  try {
    const updated = await social.updateSocialPost(detail.post.id, {
      tags: normalizeTagInput(tagEditor.value),
      expectedUpdatedAt: detail.post.updatedAt,
    });
    posts.value = posts.value.map((item) => item.post.id === updated.post.id ? updated : item);
    tagEditor.value = updated.post.tags.join(", ");
    notice.value = "Post tags saved.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save Post tags");
    error.value = social.error || "Failed to save Post tags";
  } finally {
    saving.value = false;
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
      approvalStatus: libraryApproval.value || undefined,
      deliveryState: libraryDelivery.value || undefined,
      tag: libraryTag.value || undefined,
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
  libraryApproval.value = "";
  libraryDelivery.value = "";
  libraryTag.value = "";
  libraryPublishedFrom.value = "";
  libraryPublishedTo.value = "";
  libraryResults.value = null;
  ensureVisibleSelection();
}

function selectVersion(version: PostVersion | null) {
  if (carouselEditorVersionId.value && carouselEditorVersionId.value !== version?.id) {
    carouselEditorVersionId.value = null;
  }
  selectedVersionId.value = version?.id || null;
  editorBody.value = version?.bodyText || "";
  editorAccountId.value = version?.targetAccountId || "";
  scheduleLocal.value = version?.scheduledFor
    ? toLocalInput(new Date(version.scheduledFor))
    : "";
  publications.value = [];
  if (version) void loadVersionPublications(version.id);
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

async function loadVersionPublications(versionId: string) {
  publicationsLoading.value = true;
  try {
    const next = await social.listPostVersionPublications(versionId);
    if (selectedVersionId.value === versionId) {
      publications.value = next;
      await focusLinkedPublication();
    }
  } catch (value) {
    if (selectedVersionId.value === versionId) {
      social.setErrorFromApi(value, "Failed to load Publication history");
      error.value = social.error || "Failed to load Publication history";
    }
  } finally {
    if (selectedVersionId.value === versionId) publicationsLoading.value = false;
  }
}

function ensureVisibleSelection() {
  const current = visiblePosts.value.find((detail) => detail.post.id === selectedPostId.value);
  if (current) {
    selectPost(current);
  } else if (visiblePosts.value[0]) {
    selectPost(visiblePosts.value[0]);
  } else {
    selectedPostId.value = null;
    tagEditor.value = "";
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
  tagEditor.value = detail.post.tags.join(", ");
  selectVersion(version);
  return true;
}

async function loadWorkspace() {
  if (!selectedSiteId.value) return;
  const requestedSiteId = selectedSiteId.value;
  loading.value = true;
  error.value = "";
  try {
    const [nextPosts, nextAccounts, status, nextSuggestions] = await Promise.all([
      social.fetchSocialPosts(requestedSiteId),
      social.fetchSocialAccounts(),
      social.fetchSocialStatus(),
      social.fetchSocialSuggestions(requestedSiteId),
    ]);
    if (selectedSiteId.value !== requestedSiteId) return;
    posts.value = nextPosts;
    accounts.value = nextAccounts;
    capabilities.value = status.plugin.platformCapabilities || [];
    suggestionCount.value = nextSuggestions.length;
    if (!selectLinkedSocialRecord()) ensureVisibleSelection();
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load social posts");
    error.value = social.error || "Failed to load social posts";
  } finally {
    loading.value = false;
  }
}

function handleChosenSuggestion(post: SocialPostDetail) {
  posts.value = [post, ...posts.value.filter((detail) => detail.post.id !== post.post.id)];
  activeMode.value = "drafts";
  selectPost(post);
  notice.value = "Suggestion saved as a separate Source-backed Post for review.";
}

function handlePostingPlanConfirmed(plan: PostingPlan) {
  notice.value = `${plan.items.length} Post${plan.items.length === 1 ? "" : "s"} scheduled from the confirmed Posting plan.`;
  activeMode.value = "scheduled";
  void loadWorkspace();
}

function handlePostingPlanSiteChange(siteId: string) {
  if (siteId && siteId !== selectedSiteId.value) selectedSiteId.value = siteId;
}

function openFreshPostingPlan() {
  linkedPostingPlanId.value = null;
  postingPlanOpen.value = true;
  if (postingPlanQueryId.value) void replacePostingPlanQuery(null);
}

function closePostingPlan() {
  postingPlanOpen.value = false;
  linkedPostingPlanId.value = null;
  if (postingPlanQueryId.value) void replacePostingPlanQuery(null);
}

async function replacePostingPlanQuery(planId: string | null) {
  const query: LocationQueryRaw = { ...route.query };
  if (planId) query.postingPlan = planId;
  else delete query.postingPlan;
  await router.replace({ path: route.path, query });
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

async function scheduleVersion() {
  const version = selectedVersion.value;
  if (!version || selectedPostReadOnly.value || !canSchedule.value) return;
  const date = new Date(scheduleLocal.value);
  if (Number.isNaN(date.getTime())) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await social.createPostVersionPublication(version.id, {
      scheduledFor: date.toISOString(),
      timezone: browserTimezone,
      requestContext: { surface: "social_workspace" },
    });
    activeMode.value = "scheduled";
    selectedPostId.value = version.postId;
    await loadWorkspace();
    notice.value = "Post scheduled using this exact approved Version.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to schedule this Version");
    error.value = social.error || "Failed to schedule this Version";
  } finally {
    saving.value = false;
  }
}

async function removeSchedule() {
  const version = selectedVersion.value;
  if (!version || selectedPostReadOnly.value) return;
  saving.value = true;
  try {
    const publication = scheduledPublication.value ||
      (await social.listPostVersionPublications(version.id)).find(
        (item) => item.status === "scheduled",
      );
    if (!publication) throw new Error("No scheduled Publication found");
    await social.cancelPublication(publication.id);
    activeMode.value = "drafts";
    selectedPostId.value = version.postId;
    await loadWorkspace();
    notice.value = "Post moved back to Drafts.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to remove the schedule");
    error.value = social.error || "Failed to remove the schedule";
  } finally {
    saving.value = false;
  }
}

async function publishVersion() {
  const version = selectedVersion.value;
  if (!version || selectedPostReadOnly.value || !canPublish.value) return;
  if (!window.confirm(`Publish this exact approved ${platformLabel(version.platform)} Version now?`)) {
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const publication = await social.publishPostVersion(version.id);
    activeMode.value = publication.status === "published" ? "published" : "scheduled";
    selectedPostId.value = version.postId;
    await loadWorkspace();
    notice.value =
      publication.status === "published" ? "Post published." : "Post is publishing.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to publish this Version");
    error.value = social.error || "Failed to publish this Version";
  } finally {
    saving.value = false;
  }
}

async function resolveUnknownOutcome(outcome: "published" | "not_published") {
  const version = selectedVersion.value;
  if (!version || version.failureClass !== "outcome_unknown") return;
  let platformPostUrl: string | undefined;
  if (outcome === "published") {
    const value = window.prompt("Paste the published post URL so ME3 can attach it to the history:");
    if (!value?.trim()) return;
    platformPostUrl = value.trim();
  } else if (!window.confirm("Confirm that you checked the platform and no post was created?")) {
    return;
  }
  saving.value = true;
  try {
    const history = publications.value.length
      ? publications.value
      : await social.listPostVersionPublications(version.id);
    const publication = history.find(
      (item) => item.status === "publishing" && item.failureClass === "outcome_unknown",
    );
    if (!publication) throw new Error("No Publication needs outcome resolution");
    await social.resolvePublicationOutcome(publication.id, outcome, platformPostUrl);
    activeMode.value = outcome === "published" ? "published" : "drafts";
    selectedPostId.value = version.postId;
    await loadWorkspace();
  } catch (value) {
    social.setErrorFromApi(value, "Could not resolve the Publication outcome");
    error.value = social.error || "Could not resolve the Publication outcome";
  } finally {
    saving.value = false;
  }
}

function openCompose() {
  composeBody.value = "";
  composeError.value = "";
  const connected = composeOptions.value.filter((item) => item.connected);
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
          targetAccountId: platformAccounts.length === 1 ? platformAccounts[0]!.id : null,
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

watch(postingPlanQueryId, (planId, previousPlanId) => {
  linkedPostingPlanId.value = planId;
  if (planId) postingPlanOpen.value = true;
  else if (previousPlanId) postingPlanOpen.value = false;
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

function routeQueryText(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function publicationElementId(publicationId: string): string {
  return `social-publication-${encodeURIComponent(publicationId)}`;
}

async function focusLinkedPublication() {
  const publicationId = linkedPublicationId.value;
  if (!publicationId || !publications.value.some((item) => item.id === publicationId)) {
    return;
  }
  await nextTick();
  const element = document.getElementById(publicationElementId(publicationId));
  element?.focus({ preventScroll: true });
  element?.scrollIntoView?.({ block: "center" });
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
        <WorkspaceTabs
          :tabs="modeTabs"
          :model-value="activeMode"
          aria-label="Social publishing views"
          semantics="navigation"
          @update:model-value="setActiveMode"
        />
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
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            :disabled="!currentSite"
            @click="suggestionsOpen = true"
          >
            Suggestions<span v-if="suggestionCount"> ({{ suggestionCount }})</span>
          </Button>
          <Button
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            :disabled="!currentSite || activeAccounts.length === 0"
            @click="openFreshPostingPlan"
          >
            Posting plan
          </Button>
          <Button
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            :disabled="!currentSite"
            @click="openCompose"
          >
            <template #icon><UiIcon name="SquarePen" :size="16" aria-hidden="true" /></template>
            New Post
          </Button>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Refresh social posts"
            title="Refresh"
            :disabled="loading || !currentSite"
            @click="loadWorkspace"
          >
            <UiIcon name="RefreshCw" :size="18" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div v-if="sites.sites.length === 0" class="empty-state">
        <strong>Finish account setup to start publishing.</strong>
        <RouterLink to="/onboarding">Continue setup</RouterLink>
      </div>

      <div v-else class="social-workspace" :aria-busy="loading">
        <section class="post-list" aria-label="Social posts">
          <form class="library-search" role="search" @submit.prevent="searchLibrary">
            <label>
              <span class="sr-only">Search Post library</span>
              <input v-model="libraryQuery" type="search" placeholder="Search Source, topic, Post, or tag…" />
            </label>
            <div class="library-search__actions">
              <Button color="outline" shape="soft" size="compact" type="submit" :disabled="librarySearching">
                {{ librarySearching ? 'Searching…' : 'Search' }}
              </Button>
              <Button v-if="libraryResults !== null" color="ghost" shape="soft" size="compact" type="button" @click="clearLibrarySearch">
                Clear
              </Button>
            </div>
            <details class="library-filters">
              <summary>Filters</summary>
              <div class="library-filter-grid">
                <label>
                  <span>Source title or reference</span>
                  <input v-model="librarySource" />
                </label>
                <label>
                  <span>Platform</span>
                  <select v-model="libraryPlatform">
                    <option value="">All platforms</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="x">X</option>
                    <option value="instagram">Instagram</option>
                    <option value="instagram_business">Instagram Business</option>
                  </select>
                </label>
                <label>
                  <span>Account</span>
                  <select v-model="libraryAccountId">
                    <option value="">All accounts</option>
                    <option v-for="account in activeAccounts" :key="account.id" :value="account.id">
                      {{ account.displayName || account.handle || platformLabel(account.platform) }}
                    </option>
                  </select>
                </label>
                <label>
                  <span>Approval</span>
                  <select v-model="libraryApproval">
                    <option value="">Any approval</option>
                    <option value="draft">Draft</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label>
                  <span>Delivery</span>
                  <select v-model="libraryDelivery">
                    <option value="">Any delivery</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="queued">Queued</option>
                    <option value="publishing">Publishing</option>
                    <option value="published">Published</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label>
                  <span>Tag</span>
                  <input v-model="libraryTag" />
                </label>
                <label>
                  <span>Published from</span>
                  <input v-model="libraryPublishedFrom" type="date" />
                </label>
                <label>
                  <span>Published before</span>
                  <input v-model="libraryPublishedTo" type="date" />
                </label>
              </div>
            </details>
            <p v-if="libraryResults !== null" class="library-result-count" role="status">
              {{ libraryResults.length }} matching Version{{ libraryResults.length === 1 ? '' : 's' }}<template v-if="libraryResultBreakdown"> · {{ libraryResultBreakdown }}</template>
            </p>
          </form>
          <div v-if="loading" class="empty-state">Loading social posts…</div>
          <div v-else-if="visiblePosts.length === 0" class="empty-state">
            <strong>{{ libraryResults !== null ? 'No matching Posts.' : `No ${activeMode} yet.` }}</strong>
            <span v-if="activeMode === 'drafts' && libraryResults === null">Write a Post or ask the agent to repurpose a Source.</span>
            <Button
              v-if="activeMode === 'drafts' && libraryResults === null"
              color="outline"
              shape="soft"
              size="compact"
              type="button"
              @click="openCompose"
            >
              Write a Post
            </Button>
          </div>
          <template v-else>
            <section
              v-for="group in visiblePostGroups"
              :key="group.key"
              class="post-source-group"
              :aria-label="`Posts from ${group.label}`"
            >
              <h2>{{ group.label }}</h2>
              <button
                v-for="detail in group.posts"
                :key="detail.post.id"
                type="button"
                class="post-row"
                :class="{ 'post-row--active': selectedPostId === detail.post.id }"
                :aria-current="selectedPostId === detail.post.id ? 'true' : undefined"
                @click="selectPost(detail)"
              >
                <span class="post-row__meta">
                  <span>Post</span>
                  <time :datetime="detail.post.updatedAt">{{ formatDate(detail.post.updatedAt) }}</time>
                </span>
                <strong>{{ detail.post.ideaText }}</strong>
                <span class="post-row__footer">
                  <span class="platform-list">
                    <span v-for="version in visibleVersionsFor(detail)" :key="version.id" class="platform-chip">
                      {{ platformLabel(version.platform) }}
                    </span>
                  </span>
                  <span class="row-status">{{ postStatus(detail) }}</span>
                </span>
              </button>
            </section>
          </template>
        </section>

        <section v-if="selectedPost" class="post-detail" aria-live="polite">
          <header class="detail-header">
            <div>
              <div class="detail-meta">
                <span>{{ sourceLabel(selectedPost) }}</span>
                <span>Created by {{ selectedPost.post.createdBy === 'agent' ? 'agent' : 'you' }}</span>
              </div>
              <h2>{{ selectedPost.post.ideaText }}</h2>
            </div>
          </header>

          <details class="source-context">
            <summary>View Source</summary>
            <p>{{ selectedPost.post.sourceText }}</p>
          </details>

          <div class="post-tags">
            <label class="field">
              <span>Tags</span>
              <input
                v-model="tagEditor"
                placeholder="launch, founder, product"
                :readonly="selectedPostReadOnly"
                :disabled="saving"
              />
            </label>
            <Button
              v-if="!selectedPostReadOnly"
              color="outline"
              shape="soft"
              size="compact"
              type="button"
              :disabled="saving || !tagsDirty"
              @click="saveTags"
            >
              Save tags
            </Button>
          </div>

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
              <div v-if="selectedVersion.failureClass" class="recovery-banner" role="alert">
                <strong>Publishing needs attention</strong>
                <span>{{ selectedVersion.errorMessage || 'Review this Publication before retrying.' }}</span>
                <div v-if="selectedVersion.failureClass === 'outcome_unknown'" class="inline-actions">
                  <Button color="outline" shape="soft" size="compact" type="button" @click="resolveUnknownOutcome('published')">
                    It was published
                  </Button>
                  <Button color="outline" shape="soft" size="compact" type="button" @click="resolveUnknownOutcome('not_published')">
                    It was not published
                  </Button>
                </div>
              </div>

              <label class="field">
                <span>{{ platformLabel(selectedVersion.platform) }} Version</span>
                <textarea
                  v-model="editorBody"
                  rows="10"
                  :disabled="saving"
                  :readonly="selectedPostReadOnly"
                />
              </label>

              <label class="field">
                <span>Account</span>
                <select v-model="editorAccountId" :disabled="saving || selectedPostReadOnly">
                  <option value="">Choose an account</option>
                  <option v-for="account in matchingAccounts" :key="account.id" :value="account.id">
                    {{ account.displayName || account.handle || platformLabel(account.platform) }}
                  </option>
                </select>
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

            <aside class="post-preview" aria-label="Post preview">
              <div class="preview-heading">
                <span>{{ platformLabel(selectedVersion.platform) }} preview</span>
                <span>{{ versionState(selectedVersion) }}</span>
              </div>
              <p>{{ editorBody || 'Your Post preview will appear here.' }}</p>
              <img
                v-if="selectedVersion.assetManifest[0]"
                :src="selectedVersion.assetManifest[0].url"
                :alt="
                  selectedVersion.assetManifest[0].altText ||
                  selectedVersion.assetManifest[0].filename ||
                  'Post image'
                "
              />
              <a v-if="selectedVersion.platformPostUrl" :href="selectedVersion.platformPostUrl" target="_blank" rel="noopener noreferrer">
                View published Post
              </a>
            </aside>
          </div>

          <section v-if="selectedVersion" class="publication-panel" aria-labelledby="publication-title">
            <div>
              <h2 id="publication-title">
                {{ selectedPostReadOnly ? 'Publication history' : 'Publish' }}
              </h2>
              <template v-if="selectedPostReadOnly">
                <p>
                  Existing Publication activity remains visible, but no new Publication can be created.
                </p>
                <p v-if="selectedVersion.scheduledFor">
                  Preserved schedule: {{ formatDate(selectedVersion.scheduledFor) }} ·
                  {{ selectedVersion.timezone }}
                </p>
              </template>
              <p v-else-if="scheduledPublication">
                Scheduled for {{ formatDate(scheduledPublication.scheduledFor) }} · {{ scheduledPublication.timezone }}
              </p>
              <p v-else-if="!selectedCapability?.schedule">
                {{ selectedCapability?.reason || 'This platform is draft-only for now.' }}
              </p>
              <p v-else>Approve this exact account Version before scheduling it.</p>
            </div>
            <div v-if="!selectedPostReadOnly" class="publication-actions">
              <Button
                v-if="selectedCapability?.publish"
                color="primary"
                shape="soft"
                size="compact"
                type="button"
                :disabled="saving || !canPublish"
                @click="publishVersion"
              >
                {{ hasPublishedPublication ? 'Repost now' : 'Publish now' }}
              </Button>
              <template v-if="selectedCapability?.schedule">
                <label>
                  <span class="sr-only">Schedule date and time</span>
                  <input
                    v-model="scheduleLocal"
                    type="datetime-local"
                    :min="minimumScheduleLocal"
                    :disabled="selectedVersion.approvalStatus !== 'approved' || editorDirty"
                  />
                </label>
                <Button color="outline" shape="soft" size="compact" type="button" :disabled="saving || !canSchedule" @click="scheduleVersion">
                  Schedule
                </Button>
                <Button v-if="scheduledPublication" color="ghost" shape="soft" size="compact" type="button" :disabled="saving" @click="removeSchedule">
                  Remove schedule
                </Button>
              </template>
            </div>
          </section>

          <section
            v-if="selectedVersion"
            class="publication-history"
            aria-labelledby="publication-history-title"
            :aria-busy="publicationsLoading"
          >
            <div class="publication-history__heading">
              <h2 id="publication-history-title">Publication history</h2>
              <span v-if="publicationsLoading" role="status">Loading Publication history…</span>
            </div>
            <p v-if="!publicationsLoading && publications.length === 0" class="publication-history__empty">
              This Version has not been scheduled or published yet.
            </p>
            <ul v-else class="publication-history__list">
              <li
                v-for="publication in publications"
                :id="publicationElementId(publication.id)"
                :key="publication.id"
                :class="{
                  'publication-history__item--linked': linkedPublicationId === publication.id,
                }"
                :aria-current="linkedPublicationId === publication.id ? 'true' : undefined"
                :tabindex="linkedPublicationId === publication.id ? -1 : undefined"
              >
                <span class="row-status">{{ publicationStateLabel(publication.status) }}</span>
                <time v-if="publicationMoment(publication)" :datetime="publicationMoment(publication) || undefined">
                  {{ formatDate(publicationMoment(publication)) }}
                </time>
                <a
                  v-if="publication.platformPostUrl"
                  :href="publication.platformPostUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >View Post</a>
                <span v-else-if="publication.errorMessage" class="publication-history__error">
                  {{ publication.errorMessage }}
                </span>
              </li>
            </ul>
          </section>
        </section>

        <section v-else class="detail-empty" aria-label="No social Post selected">
          <UiIcon name="SquarePen" :size="24" aria-hidden="true" />
          <p>Select a Post to review it, or write a new one.</p>
        </section>
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

    <SocialSuggestionsPanel
      :open="suggestionsOpen"
      :site-id="selectedSiteId"
      :capabilities="capabilities"
      :accounts="accounts"
      @close="suggestionsOpen = false"
      @count="suggestionCount = $event"
      @chosen="handleChosenSuggestion"
    />

    <SocialPostingPlanDialog
      :open="postingPlanOpen"
      :site-id="selectedSiteId"
      :accounts="accounts"
      :capabilities="capabilities"
      :initial-plan-id="linkedPostingPlanId"
      @close="closePostingPlan"
      @confirmed="handlePostingPlanConfirmed"
      @site-change="handlePostingPlanSiteChange"
    />

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
  padding: 20px 0 40px;
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
  justify-content: space-between;
  padding: 10px 0 14px;
  background: var(--ui-bg);
}

.toolbar-actions :deep(button),
.library-search :deep(button) {
  min-width: 44px;
  min-height: 44px;
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

.library-search__actions,
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
  line-height: 1.35;
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

.post-detail {
  min-width: 0;
  padding: 24px;
}

.detail-header h1 {
  margin: 8px 0 0;
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  line-height: 1.25;
}

.source-context,
.publication-panel,
.recovery-banner {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.source-context summary {
  cursor: pointer;
  font-weight: 650;
}

.source-context p,
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
  padding: 16px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.post-preview img {
  width: 100%;
  border-radius: var(--ui-radius-sm);
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
  }

  .social-toolbar,
  .publication-panel,
  .publication-actions {
    align-items: stretch;
    flex-direction: column;
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
  .toolbar-actions,
  .editor-actions,
  .platform-picker {
    grid-template-columns: 1fr;
  }

  .toolbar-actions,
  .editor-actions,
  .carousel-editor-entry {
    display: grid;
  }

  .carousel-editor-entry :deep(button) {
    width: 100%;
  }

  .post-detail {
    padding: 16px;
  }
}
</style>
