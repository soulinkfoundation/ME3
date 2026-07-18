<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import AppDialog from "../components/AppDialog.vue";
import Button from "../components/Button.vue";
import SocialAccountsPanel from "../components/SocialAccountsPanel.vue";
import UiIcon from "../components/UiIcon.vue";
import WorkspaceTabs from "../components/WorkspaceTabs.vue";
import {
  useContentStore,
  type ContentItem,
  type ContentMediaAsset,
} from "../stores/content";
import { useSitesStore } from "../stores/sites";
import {
  useSocialStore,
  type SocialAccountRow,
  type SocialContentPackage,
  type SocialContentVariant,
  type SocialPlatform,
} from "../stores/social";
import {
  getSocialBlockingIssues,
  socialPlatformLabel,
} from "../utils/social-compose";

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
type WorkspaceEntry =
  | { key: string; kind: "package"; detail: SocialContentPackage }
  | { key: string; kind: "manual"; item: ContentItem };
type PendingImage = {
  file: File;
  previewUrl: string;
};
type ComposeForm = {
  id: string | null;
  body: string;
  platforms: SocialPlatform[];
  mediaManifest: ContentMediaAsset[];
};

const supportedPlatforms: SocialPlatform[] = [
  "x",
  "linkedin",
  "instagram",
  "instagram_business",
];

const sites = useSitesStore();
const social = useSocialStore();
const content = useContentStore();
const selectedSiteId = ref("");
const packages = ref<SocialContentPackage[]>([]);
const manualItems = ref<ContentItem[]>([]);
const accounts = ref<SocialAccountRow[]>([]);
const activeMode = ref<WorkspaceMode>("drafts");
const selectedEntryKey = ref<string | null>(null);
const selectedVariantId = ref<string | null>(null);
const editorBody = ref("");
const editorAccountId = ref("");
const scheduleLocal = ref("");
const showAccounts = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const compactWorkspace = ref(false);
const composeOpen = ref(false);
const composeDiscardConfirmOpen = ref(false);
const composeSaving = ref(false);
const composeSaveMode = ref<"draft" | "publish" | null>(null);
const composeError = ref("");
const composeInitialSnapshot = ref("");
const composeForm = ref<ComposeForm>(emptyComposeForm());
const pendingImages = ref<PendingImage[]>([]);
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let compactMediaQuery: MediaQueryList | null = null;

const currentSite = computed(
  () => sites.sites.find((site) => site.id === selectedSiteId.value) || null,
);

const activeAccounts = computed(() =>
  accounts.value.filter(
    (account) =>
      account.siteId === selectedSiteId.value && account.status === "active",
  ),
);

const activeAccountPlatforms = computed(
  () => new Set(activeAccounts.value.map((account) => account.platform)),
);

const draftPackages = computed(() =>
  packages.value.filter((detail) =>
    detail.variants.some(
      (variant) =>
        !variant.scheduledFor &&
        variant.publicationStatus !== "queued" &&
        variant.publicationStatus !== "publishing" &&
        variant.publicationStatus !== "published",
    ),
  ),
);

const scheduledPackages = computed(() =>
  packages.value.filter((detail) =>
    detail.variants.some(
      (variant) =>
        Boolean(variant.scheduledFor) ||
        variant.publicationStatus === "queued" ||
        variant.publicationStatus === "publishing",
    ),
  ),
);

const publishedPackages = computed(() =>
  packages.value.filter(
    (detail) =>
      isPublished(detail) ||
      detail.variants.some(
        (variant) => variant.publicationStatus === "published",
      ),
  ),
);

const draftManualItems = computed(() =>
  manualItems.value.filter(
    (item) => item.status === "bank" || item.status === "failed",
  ),
);

const scheduledManualItems = computed(() =>
  manualItems.value.filter((item) =>
    ["queued", "scheduled", "publishing"].includes(item.status),
  ),
);

const publishedManualItems = computed(() =>
  manualItems.value.filter((item) => item.status === "posted"),
);

const entriesByMode = computed<Record<WorkspaceMode, WorkspaceEntry[]>>(() => ({
  drafts: sortEntries([
    ...draftPackages.value.map(packageEntry),
    ...draftManualItems.value.map(manualEntry),
  ]),
  scheduled: sortEntries([
    ...scheduledPackages.value.map(packageEntry),
    ...scheduledManualItems.value.map(manualEntry),
  ]),
  published: sortEntries([
    ...publishedPackages.value.map(packageEntry),
    ...publishedManualItems.value.map(manualEntry),
  ]),
}));

const visibleEntries = computed(() => entriesByMode.value[activeMode.value]);

const modeTabs = computed(() => [
  { id: "drafts", label: "Drafts", count: entriesByMode.value.drafts.length },
  {
    id: "scheduled",
    label: "Scheduled",
    count: entriesByMode.value.scheduled.length,
  },
  {
    id: "published",
    label: "Published",
    count: entriesByMode.value.published.length,
  },
]);

const selectedEntry = computed(
  () =>
    visibleEntries.value.find((entry) => entry.key === selectedEntryKey.value) ||
    null,
);

const selectedPackage = computed(() =>
  selectedEntry.value?.kind === "package" ? selectedEntry.value.detail : null,
);

const selectedManualItem = computed(() =>
  selectedEntry.value?.kind === "manual" ? selectedEntry.value.item : null,
);

const selectedVariant = computed(
  () =>
    selectedPackage.value?.variants.find(
      (variant) => variant.id === selectedVariantId.value,
    ) || null,
);

const matchingAccounts = computed(() => {
  const platform = selectedVariant.value?.platform;
  if (!platform) return [];
  return activeAccounts.value.filter((account) => account.platform === platform);
});

const editorDirty = computed(() => {
  const variant = selectedVariant.value;
  return (
    Boolean(variant) &&
    (editorBody.value.trim() !== variant?.bodyText ||
      (editorAccountId.value || null) !== variant?.targetAccountId)
  );
});

const canApprove = computed(() =>
  Boolean(
    selectedVariant.value && editorBody.value.trim() && editorAccountId.value,
  ),
);

const canSchedule = computed(
  () =>
    selectedVariant.value?.approvalStatus === "approved" &&
    !editorDirty.value &&
    Boolean(scheduleLocal.value),
);

const canPublish = computed(
  () =>
    selectedVariant.value?.platform === "linkedin" &&
    selectedVariant.value.approvalStatus === "approved" &&
    matchingAccounts.value.some(
      (account) => account.id === editorAccountId.value,
    ) &&
    !editorDirty.value &&
    selectedVariant.value.publicationStatus !== "queued" &&
    selectedVariant.value.publicationStatus !== "publishing" &&
    selectedVariant.value.publicationStatus !== "published",
);

const publicationRecovery = computed(() => {
  const variant = selectedVariant.value;
  if (!variant?.failureClass) return null;
  const guidance = {
    retryable:
      "LinkedIn returned a temporary error. You can safely try publishing again.",
    reconnect_required:
      "Reconnect this LinkedIn account, then publish the approved variant again.",
    rejected:
      "LinkedIn rejected this exact post. Edit it, approve the new version, then try again.",
    unsupported:
      "This post format is not supported yet. Change the copy or media before retrying.",
    outcome_unknown:
      "Do not retry yet. Check LinkedIn first because the post may already be live.",
  }[variant.failureClass];
  return {
    guidance,
    message: variant.errorMessage,
  };
});

const composePlatformOptions = computed(() =>
  supportedPlatforms.map((id) => ({
    id,
    label: socialPlatformLabel(id),
    connected: activeAccountPlatforms.value.has(id),
  })),
);

const composeMedia = computed(() => [
  ...composeForm.value.mediaManifest.map((asset, index) => ({
    key: `saved-${asset.url}-${index}`,
    url: asset.url,
    filename: asset.filename || `Image ${index + 1}`,
    saved: true,
    index,
  })),
  ...pendingImages.value.map((asset, index) => ({
    key: `pending-${asset.previewUrl}`,
    url: asset.previewUrl,
    filename: asset.file.name,
    saved: false,
    index,
  })),
]);

const composeIssues = computed(() =>
  getSocialBlockingIssues({
    caption: composeForm.value.body,
    platforms: composeForm.value.platforms,
    hasUsableImages: composeMedia.value.length > 0,
  }),
);

const composeMissingAccounts = computed(() =>
  composeForm.value.platforms.filter(
    (platform) => !activeAccountPlatforms.value.has(platform),
  ),
);

const composeCanSave = computed(
  () =>
    Boolean(composeForm.value.body.trim()) &&
    composeForm.value.platforms.length > 0 &&
    composeIssues.value.length === 0,
);

const composeCanPublish = computed(
  () => composeCanSave.value && composeMissingAccounts.value.length === 0,
);

const composeDirty = computed(
  () =>
    pendingImages.value.length > 0 ||
    composeSnapshot() !== composeInitialSnapshot.value,
);

const minimumScheduleLocal = computed(() =>
  toLocalInput(new Date(Date.now() + 60_000)),
);

function emptyComposeForm(): ComposeForm {
  return {
    id: null,
    body: "",
    platforms: [],
    mediaManifest: [],
  };
}

function packageEntry(detail: SocialContentPackage): WorkspaceEntry {
  return { key: `package:${detail.package.id}`, kind: "package", detail };
}

function manualEntry(item: ContentItem): WorkspaceEntry {
  return { key: `manual:${item.id}`, kind: "manual", item };
}

function entryUpdatedAt(entry: WorkspaceEntry): string {
  return entry.kind === "package"
    ? entry.detail.package.updatedAt
    : entry.item.updatedAt;
}

function sortEntries(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return entries.sort(
    (left, right) =>
      Date.parse(entryUpdatedAt(right)) - Date.parse(entryUpdatedAt(left)),
  );
}

function entrySource(entry: WorkspaceEntry): string {
  return entry.kind === "package" ? sourceLabel(entry.detail) : "You";
}

function entryTitle(entry: WorkspaceEntry): string {
  return entry.kind === "package"
    ? entry.detail.package.ideaText
    : manualTitle(entry.item);
}

function entryPlatforms(entry: WorkspaceEntry): string[] {
  return entry.kind === "package"
    ? entry.detail.variants.map((variant) => variant.platform)
    : entry.item.platforms;
}

function entryImageCount(entry: WorkspaceEntry): number {
  if (entry.kind === "manual") return entry.item.mediaManifest.length;
  return Math.max(
    0,
    ...entry.detail.variants.map((variant) => variant.assetManifest.length),
  );
}

function entryStatus(entry: WorkspaceEntry): string | null {
  if (entry.kind === "manual") {
    if (entry.item.status === "publishing") return "Publishing";
    if (entry.item.status === "queued") return "Queued";
    if (entry.item.status === "scheduled") return "Scheduled";
    if (entry.item.status === "failed") return "Needs attention";
    return null;
  }
  if (entry.detail.variants.some((variant) => variant.failureClass)) {
    return "Needs attention";
  }
  if (
    entry.detail.variants.some(
      (variant) =>
        variant.publicationStatus === "queued" ||
        variant.publicationStatus === "publishing",
    )
  ) {
    return "Publishing";
  }
  if (entry.detail.variants.some((variant) => variant.scheduledFor)) {
    return "Scheduled";
  }
  if (
    entry.detail.variants.some(
      (variant) => variant.approvalStatus === "approved",
    )
  ) {
    return "Approved";
  }
  return null;
}

function isPublished(detail: SocialContentPackage): boolean {
  return (
    detail.package.status === "published" ||
    detail.package.status === "partially_published"
  );
}

function platformLabel(platform: string): string {
  if (platform === "x") return "X";
  if (platform === "linkedin") return "LinkedIn";
  if (platform === "instagram_business") return "Instagram Business";
  if (platform === "instagram") return "Instagram";
  return platform;
}

function platformShortLabel(platform: SocialPlatform): string {
  if (platform === "linkedin") return "in";
  if (platform === "instagram_business") return "IG+";
  if (platform === "instagram") return "IG";
  return "X";
}

function sourceLabel(detail: SocialContentPackage): string {
  if (detail.package.sourceType === "journal") return "Journal";
  if (detail.package.sourceType === "mission_task") return "Mission Control";
  if (detail.package.sourceType === "site") return "Site";
  if (detail.package.sourceType === "pasted") return "Pasted text";
  return "Original idea";
}

function sourceText(detail: SocialContentPackage): string {
  const snapshot = detail.package.sourceSnapshot;
  try {
    const parsed = JSON.parse(snapshot) as Record<string, unknown>;
    for (const key of ["body", "description", "content", "title"]) {
      if (typeof parsed[key] === "string" && parsed[key].trim()) {
        return parsed[key].trim();
      }
    }
  } catch {
    // Older and manually generated packages may store plain-text snapshots.
  }
  return snapshot;
}

function manualTitle(item: ContentItem): string {
  const compact = item.body.trim().replace(/\s+/g, " ");
  if (!compact) return "Untitled post";
  return compact.length > 84 ? `${compact.slice(0, 81)}…` : compact;
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
  const shifted = new Date(
    value.getTime() - value.getTimezoneOffset() * 60_000,
  );
  return shifted.toISOString().slice(0, 16);
}

function setActiveMode(value: string) {
  if (!(["drafts", "scheduled", "published"] as string[]).includes(value)) {
    return;
  }
  activeMode.value = value as WorkspaceMode;
  if (compactWorkspace.value) selectedEntryKey.value = null;
}

function selectEntry(entry: WorkspaceEntry) {
  selectedEntryKey.value = entry.key;
  if (entry.kind === "package") selectPackage(entry.detail);
  else selectVariant(null);
}

function selectPackage(detail: SocialContentPackage) {
  const preferred =
    detail.variants.find((variant) =>
      activeMode.value === "published"
        ? variant.publicationStatus === "published"
        : activeMode.value === "scheduled"
          ? Boolean(variant.scheduledFor) ||
            variant.publicationStatus === "queued" ||
            variant.publicationStatus === "publishing"
          : !variant.scheduledFor &&
            variant.publicationStatus !== "queued" &&
            variant.publicationStatus !== "publishing" &&
            variant.publicationStatus !== "published",
    ) ||
    detail.variants[0] ||
    null;
  selectVariant(preferred);
}

function selectVariant(variant: SocialContentVariant | null) {
  selectedVariantId.value = variant?.id || null;
  editorBody.value = variant?.bodyText || "";
  editorAccountId.value = variant?.targetAccountId || "";
  scheduleLocal.value = variant?.scheduledFor
    ? toLocalInput(new Date(variant.scheduledFor))
    : "";
}

function ensureVisibleSelection() {
  const visible = visibleEntries.value;
  const current = visible.find((entry) => entry.key === selectedEntryKey.value);
  if (current) {
    if (current.kind === "package") selectPackage(current.detail);
    return;
  }
  if (compactWorkspace.value || !visible[0]) {
    selectedEntryKey.value = null;
    selectVariant(null);
    return;
  }
  selectEntry(visible[0]);
}

async function loadWorkspace() {
  if (!selectedSiteId.value) return;
  loading.value = true;
  error.value = "";
  try {
    const [nextPackages, nextAccounts, nextManualItems] = await Promise.all([
      social.fetchContentPackages(selectedSiteId.value),
      social.fetchSocialAccounts(),
      content.fetchItems(selectedSiteId.value),
    ]);
    packages.value = nextPackages;
    accounts.value = nextAccounts;
    manualItems.value = nextManualItems;
    ensureVisibleSelection();
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load social posts");
    error.value = social.error || "Failed to load social posts";
  } finally {
    loading.value = false;
  }
}

async function refreshWorkspace() {
  notice.value = "";
  await loadWorkspace();
}

function replaceVariant(variant: SocialContentVariant) {
  packages.value = packages.value.map((detail) =>
    detail.package.id === variant.packageId
      ? {
          ...detail,
          variants: detail.variants.map((item) =>
            item.id === variant.id ? variant : item,
          ),
        }
      : detail,
  );
  selectVariant(variant);
}

async function saveVariant() {
  const variant = selectedVariant.value;
  if (!variant || !editorBody.value.trim()) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    replaceVariant(
      await social.updateContentVariant(variant.id, {
        bodyText: editorBody.value,
        targetAccountId: editorAccountId.value || null,
      }),
    );
    notice.value = "Draft saved. Approval was removed if the content changed.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save social draft");
    error.value = social.error || "Failed to save social draft";
  } finally {
    saving.value = false;
  }
}

async function approveVariant() {
  const variant = selectedVariant.value;
  if (!variant || !canApprove.value) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    replaceVariant(
      await social.updateContentVariant(variant.id, {
        bodyText: editorBody.value,
        targetAccountId: editorAccountId.value,
        approvalStatus: "approved",
      }),
    );
    notice.value = "Exact account version approved. It has not been published.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to approve social draft");
    error.value = social.error || "Failed to approve social draft";
  } finally {
    saving.value = false;
  }
}

async function scheduleVariant() {
  const variant = selectedVariant.value;
  if (!variant || !canSchedule.value) return;
  const date = new Date(scheduleLocal.value);
  if (Number.isNaN(date.getTime())) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    replaceVariant(
      await social.updateContentVariant(variant.id, {
        scheduledFor: date.toISOString(),
        timezone: browserTimezone,
      }),
    );
    notice.value = "Post scheduled using this exact approved version.";
    activeMode.value = "scheduled";
    await loadWorkspace();
  } catch (value) {
    social.setErrorFromApi(value, "Failed to schedule social draft");
    error.value = social.error || "Failed to schedule social draft";
  } finally {
    saving.value = false;
  }
}

async function unscheduleVariant() {
  const variant = selectedVariant.value;
  if (!variant) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await social.updateContentVariant(variant.id, { scheduledFor: null });
    activeMode.value = "drafts";
    selectedEntryKey.value = `package:${variant.packageId}`;
    notice.value = "Post moved back to drafts.";
    await loadWorkspace();
  } catch (value) {
    social.setErrorFromApi(value, "Failed to remove schedule");
    error.value = social.error || "Failed to remove schedule";
  } finally {
    saving.value = false;
  }
}

async function publishVariant() {
  const variant = selectedVariant.value;
  if (!variant || !canPublish.value) return;
  if (!window.confirm("Publish this exact approved LinkedIn version now?")) {
    return;
  }
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const publication = await social.publishContentVariant(variant.id);
    activeMode.value =
      publication.status === "published" ? "published" : "scheduled";
    selectedEntryKey.value = `package:${variant.packageId}`;
    await loadWorkspace();
    notice.value =
      publication.status === "published"
        ? "LinkedIn post published."
        : "LinkedIn post added to the publishing queue.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to publish LinkedIn post");
    error.value = social.error || "Failed to publish LinkedIn post";
  } finally {
    saving.value = false;
  }
}

async function resolveUnknownOutcome(outcome: "published" | "not_published") {
  const variant = selectedVariant.value;
  if (!variant || variant.failureClass !== "outcome_unknown") return;
  let platformPostUrl: string | undefined;
  if (outcome === "published") {
    const value = window.prompt(
      "Paste the LinkedIn post URL so ME3 can attach it to the history:",
    );
    if (!value?.trim()) return;
    platformPostUrl = value.trim();
  } else if (
    !window.confirm("Confirm that you checked LinkedIn and no post was created?")
  ) {
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    await social.resolveContentVariantOutcome(
      variant.id,
      outcome,
      platformPostUrl,
    );
    activeMode.value = outcome === "published" ? "published" : "drafts";
    selectedEntryKey.value = `package:${variant.packageId}`;
    await loadWorkspace();
    notice.value =
      outcome === "published"
        ? "Published LinkedIn post attached to the history."
        : "Outcome cleared. This approved version can now be published again.";
  } catch (value) {
    social.setErrorFromApi(value, "Could not resolve the publication outcome");
    error.value =
      social.error || "Could not resolve the publication outcome";
  } finally {
    saving.value = false;
  }
}

function composeSnapshot(): string {
  return JSON.stringify({
    id: composeForm.value.id,
    body: composeForm.value.body,
    platforms: [...composeForm.value.platforms].sort(),
    media: composeForm.value.mediaManifest.map((asset) => asset.url),
  });
}

function revokePendingImages() {
  for (const image of pendingImages.value) URL.revokeObjectURL(image.previewUrl);
  pendingImages.value = [];
}

function openCompose(item?: ContentItem) {
  revokePendingImages();
  composeError.value = "";
  composeForm.value = item
    ? {
        id: item.id,
        body: item.body,
        platforms: item.platforms.filter((platform): platform is SocialPlatform =>
          supportedPlatforms.includes(platform as SocialPlatform),
        ),
        mediaManifest: [...item.mediaManifest],
      }
    : emptyComposeForm();
  if (!item) {
    const connected = supportedPlatforms.filter((platform) =>
      activeAccountPlatforms.value.has(platform),
    );
    if (connected.length === 1) composeForm.value.platforms = connected;
  }
  composeInitialSnapshot.value = composeSnapshot();
  composeOpen.value = true;
}

function requestCloseCompose() {
  if (composeSaving.value) return;
  if (composeDirty.value) {
    composeDiscardConfirmOpen.value = true;
    return;
  }
  forceCloseCompose();
}

function forceCloseCompose() {
  composeDiscardConfirmOpen.value = false;
  composeOpen.value = false;
  revokePendingImages();
  composeForm.value = emptyComposeForm();
  composeInitialSnapshot.value = "";
  composeError.value = "";
}

function toggleComposePlatform(platform: SocialPlatform) {
  const next = [...composeForm.value.platforms];
  const index = next.indexOf(platform);
  if (index >= 0) next.splice(index, 1);
  else next.push(platform);
  composeForm.value.platforms = next;
}

function addComposeImages(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const files = target?.files ? Array.from(target.files) : [];
  if (target) target.value = "";
  composeError.value = "";

  const available = Math.max(0, 10 - composeMedia.value.length);
  if (files.length > available) {
    composeError.value = "You can attach up to 10 images to one post.";
  }
  for (const file of files.slice(0, available)) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      composeError.value = "Use JPEG, PNG, WebP, or GIF images.";
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      composeError.value = `${file.name} is larger than 5MB.`;
      continue;
    }
    pendingImages.value.push({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }
}

function removeComposeImage(saved: boolean, index: number) {
  if (saved) {
    composeForm.value.mediaManifest.splice(index, 1);
    return;
  }
  const [removed] = pendingImages.value.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
}

async function saveCompose(publishNow: boolean) {
  if (!currentSite.value || !composeCanSave.value) return;
  if (publishNow && !composeCanPublish.value) return;
  composeSaving.value = true;
  composeSaveMode.value = publishNow ? "publish" : "draft";
  composeError.value = "";
  try {
    let item = composeForm.value.id
      ? await content.updateItem(composeForm.value.id, {
          body: composeForm.value.body,
          platforms: composeForm.value.platforms,
          mediaManifest: composeForm.value.mediaManifest,
          timezone: browserTimezone,
        })
      : await content.createItem({
          siteId: currentSite.value.id,
          body: composeForm.value.body,
          platforms: composeForm.value.platforms,
          mediaManifest: composeForm.value.mediaManifest,
          timezone: browserTimezone,
        });

    composeForm.value.id = item.id;
    composeForm.value.mediaManifest = [...item.mediaManifest];

    while (pendingImages.value.length > 0) {
      const pending = pendingImages.value[0];
      if (!pending) break;
      const uploaded = await content.uploadItemMedia(
        item.id,
        pending.file,
        item.mediaManifest.length + 1,
      );
      URL.revokeObjectURL(pending.previewUrl);
      pendingImages.value.shift();
      item = uploaded.item;
      composeForm.value.mediaManifest = [...item.mediaManifest];
    }

    if (publishNow) item = await content.publishItem(item.id);

    activeMode.value =
      item.status === "posted"
        ? "published"
        : ["queued", "scheduled", "publishing"].includes(item.status)
          ? "scheduled"
          : "drafts";
    selectedEntryKey.value = `manual:${item.id}`;
    composeInitialSnapshot.value = composeSnapshot();
    forceCloseCompose();
    await loadWorkspace();
    notice.value = publishNow
      ? item.status === "posted"
        ? "Post published."
        : "Post added to the publishing queue."
      : "Draft saved.";
  } catch (value) {
    content.setErrorFromApi(value, "Failed to save social post");
    composeError.value = content.error || "Failed to save social post";
  } finally {
    composeSaving.value = false;
    composeSaveMode.value = null;
  }
}

async function publishManualItem(item: ContentItem) {
  if (!window.confirm("Publish this post now?")) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const updated = await content.publishItem(item.id);
    activeMode.value = updated.status === "posted" ? "published" : "scheduled";
    selectedEntryKey.value = `manual:${updated.id}`;
    await loadWorkspace();
    notice.value =
      updated.status === "posted"
        ? "Post published."
        : "Post added to the publishing queue.";
  } catch (value) {
    content.setErrorFromApi(value, "Failed to publish social post");
    error.value = content.error || "Failed to publish social post";
  } finally {
    saving.value = false;
  }
}

async function queueManualItem(item: ContentItem) {
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const updated = await content.queueItem(item.id);
    activeMode.value = "scheduled";
    selectedEntryKey.value = `manual:${updated.id}`;
    await loadWorkspace();
    notice.value = "Post added to the content queue.";
  } catch (value) {
    content.setErrorFromApi(value, "Failed to queue social post");
    error.value = content.error || "Failed to queue social post";
  } finally {
    saving.value = false;
  }
}

async function unqueueManualItem(item: ContentItem) {
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const updated = await content.unqueueItem(item.id);
    activeMode.value = "drafts";
    selectedEntryKey.value = `manual:${updated.id}`;
    await loadWorkspace();
    notice.value = "Post moved back to drafts.";
  } catch (value) {
    content.setErrorFromApi(value, "Failed to move social post");
    error.value = content.error || "Failed to move social post";
  } finally {
    saving.value = false;
  }
}

async function deleteManualItem(item: ContentItem) {
  if (!window.confirm("Delete this social post?")) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await content.deleteItem(item.id);
    selectedEntryKey.value = null;
    await loadWorkspace();
    notice.value = "Post deleted.";
  } catch (value) {
    content.setErrorFromApi(value, "Failed to delete social post");
    error.value = content.error || "Failed to delete social post";
  } finally {
    saving.value = false;
  }
}

function manualItemCanPublish(item: ContentItem): boolean {
  return (
    item.status !== "publishing" &&
    item.status !== "posted" &&
    item.platforms.every((platform) =>
      activeAccountPlatforms.value.has(platform),
    )
  );
}

function closeAccounts() {
  showAccounts.value = false;
  void loadWorkspace();
}

function handleCompactChange(event: MediaQueryListEvent | MediaQueryList) {
  compactWorkspace.value = event.matches;
  ensureVisibleSelection();
}

watch(activeMode, ensureVisibleSelection);
watch(selectedSiteId, loadWorkspace);

onMounted(async () => {
  compactMediaQuery = window.matchMedia("(max-width: 720px)");
  compactWorkspace.value = compactMediaQuery.matches;
  compactMediaQuery.addEventListener("change", handleCompactChange);
  if (sites.sites.length === 0) await sites.fetchSites();
  selectedSiteId.value = sites.sites[0]?.id || "";
});

onBeforeUnmount(() => {
  revokePendingImages();
  compactMediaQuery?.removeEventListener("change", handleCompactChange);
});
</script>

<template>
  <div class="social-page">
    <main class="social-main">
      <div v-if="error" class="state-banner state-banner--error" role="alert">
        {{ error }}
      </div>
      <div
        v-if="notice"
        class="state-banner"
        role="status"
        aria-live="polite"
      >
        {{ notice }}
      </div>

      <header class="social-toolbar">
        <WorkspaceTabs
          class="social-tabs"
          :tabs="modeTabs"
          :model-value="activeMode"
          aria-label="Social publishing views"
          semantics="navigation"
          @update:model-value="setActiveMode"
        />
        <div class="social-toolbar__actions">
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Manage social accounts"
            title="Social accounts"
            :aria-expanded="showAccounts"
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
            @click="openCompose()"
          >
            <template #icon>
              <UiIcon name="SquarePen" :size="16" aria-hidden="true" />
            </template>
            Compose
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
            @click="refreshWorkspace"
          >
            <UiIcon name="RefreshCw" :size="18" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div v-if="sites.sites.length === 0" class="empty-state">
        <strong>Finish account setup to start publishing.</strong>
        <RouterLink to="/onboarding">Continue setup</RouterLink>
      </div>

      <div
        v-else
        class="social-inbox"
        :class="{ 'social-inbox--detail-open': selectedEntry }"
        :aria-busy="loading"
      >
        <section class="post-list" aria-label="Social posts">
          <div v-if="loading" class="empty-state">Loading social posts…</div>
          <div v-else-if="visibleEntries.length === 0" class="empty-state">
            <strong>No {{ activeMode }} yet.</strong>
            <span v-if="activeMode === 'drafts'">
              Compose a post or ask the agent to prepare one.
            </span>
            <Button
              v-if="activeMode === 'drafts'"
              color="outline"
              shape="soft"
              size="compact"
              type="button"
              @click="openCompose()"
            >
              Write a post
            </Button>
          </div>
          <button
            v-for="entry in visibleEntries"
            v-else
            :key="entry.key"
            type="button"
            class="post-row"
            :class="{ 'post-row--active': selectedEntryKey === entry.key }"
            :aria-current="selectedEntryKey === entry.key ? 'true' : undefined"
            @click="selectEntry(entry)"
          >
            <span class="post-row__meta">
              <span>{{ entrySource(entry) }}</span>
              <time :datetime="entryUpdatedAt(entry)">
                {{ formatDate(entryUpdatedAt(entry)) }}
              </time>
            </span>
            <strong>{{ entryTitle(entry) }}</strong>
            <span class="post-row__footer">
              <span class="platform-list">
                <span
                  v-for="platform in entryPlatforms(entry)"
                  :key="platform"
                  class="platform-chip"
                >
                  {{ platformLabel(platform) }}
                </span>
              </span>
              <span v-if="entryImageCount(entry)" class="image-count">
                <UiIcon name="Image" :size="13" aria-hidden="true" />
                {{ entryImageCount(entry) }}
              </span>
              <span v-if="entryStatus(entry)" class="row-status">
                {{ entryStatus(entry) }}
              </span>
            </span>
          </button>
        </section>

        <section v-if="selectedEntry" class="post-detail" aria-live="polite">
          <div class="post-detail__mobile-back">
            <Button
              color="ghost"
              shape="soft"
              size="compact"
              icon-only
              type="button"
              aria-label="Back to social posts"
              @click="selectedEntryKey = null"
            >
              <UiIcon name="ArrowLeft" :size="18" aria-hidden="true" />
            </Button>
          </div>

          <template v-if="selectedPackage">
            <header class="detail-header">
              <div>
                <div class="detail-meta">
                  <span>{{ sourceLabel(selectedPackage) }}</span>
                  <span>Created by {{ selectedPackage.package.createdBy }}</span>
                </div>
                <h2>{{ selectedPackage.package.ideaText }}</h2>
              </div>
            </header>

            <details class="source-context">
              <summary>View source context</summary>
              <p>{{ sourceText(selectedPackage) }}</p>
              <small v-if="selectedPackage.package.sourceRef">
                {{ selectedPackage.package.sourceRef }}
              </small>
            </details>

            <div class="variant-tabs" role="tablist" aria-label="Platform versions">
              <button
                v-for="variant in selectedPackage.variants"
                :key="variant.id"
                type="button"
                role="tab"
                :aria-selected="selectedVariantId === variant.id"
                :class="[
                  'variant-tab',
                  { 'variant-tab--active': selectedVariantId === variant.id },
                ]"
                @click="selectVariant(variant)"
              >
                {{ platformLabel(variant.platform) }}
                <span
                  :class="[
                    'status-dot',
                    `status-dot--${variant.approvalStatus}`,
                  ]"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div v-if="selectedVariant" class="variant-workspace">
              <div class="variant-editor">
                <div v-if="publicationRecovery" class="recovery-banner" role="alert">
                  <strong>Publishing needs attention</strong>
                  <span>
                    {{ publicationRecovery.message || publicationRecovery.guidance }}
                  </span>
                  <small v-if="publicationRecovery.message">
                    {{ publicationRecovery.guidance }}
                  </small>
                  <div
                    v-if="selectedVariant.failureClass === 'outcome_unknown'"
                    class="inline-actions"
                  >
                    <Button
                      color="outline"
                      shape="soft"
                      size="compact"
                      type="button"
                      :disabled="saving"
                      @click="resolveUnknownOutcome('published')"
                    >
                      I found the post
                    </Button>
                    <Button
                      color="outline"
                      shape="soft"
                      size="compact"
                      type="button"
                      :disabled="saving"
                      @click="resolveUnknownOutcome('not_published')"
                    >
                      No post was created
                    </Button>
                  </div>
                </div>

                <label class="field">
                  <span>Publishing account</span>
                  <select
                    v-model="editorAccountId"
                    :disabled="selectedVariant.publicationStatus === 'published'"
                  >
                    <option value="">Choose an account</option>
                    <option
                      v-for="account in matchingAccounts"
                      :key="account.id"
                      :value="account.id"
                    >
                      {{
                        account.displayName ||
                        account.handle ||
                        platformLabel(selectedVariant.platform)
                      }}
                      <template v-if="account.handle">
                        · @{{ account.handle.replace(/^@/, "") }}
                      </template>
                    </option>
                  </select>
                </label>

                <label class="field">
                  <span>{{ platformLabel(selectedVariant.platform) }} copy</span>
                  <textarea
                    v-model="editorBody"
                    rows="10"
                    :readonly="selectedVariant.publicationStatus === 'published'"
                    :aria-describedby="
                      selectedVariant.approvalStatus === 'approved'
                        ? 'approval-edit-note'
                        : undefined
                    "
                  />
                </label>

                <div
                  v-if="selectedVariant.assetManifest.length"
                  class="detail-images"
                >
                  <img
                    v-for="(asset, index) in selectedVariant.assetManifest"
                    :key="`${asset.url}-${index}`"
                    :src="asset.url"
                    :alt="asset.filename || `Post image ${index + 1}`"
                  />
                </div>

                <p
                  v-if="
                    selectedVariant.approvalStatus === 'approved' &&
                    selectedVariant.publicationStatus !== 'published'
                  "
                  id="approval-edit-note"
                  class="field-note"
                >
                  Editing approved copy or changing its account removes approval
                  and any schedule.
                </p>

                <div
                  v-if="selectedVariant.publicationStatus !== 'published'"
                  class="inline-actions"
                >
                  <Button
                    color="outline"
                    shape="soft"
                    size="compact"
                    type="button"
                    :disabled="saving || !editorDirty || !editorBody.trim()"
                    @click="saveVariant"
                  >
                    Save changes
                  </Button>
                  <Button
                    color="primary"
                    shape="soft"
                    size="compact"
                    type="button"
                    :disabled="saving || !canApprove"
                    @click="approveVariant"
                  >
                    <UiIcon name="Check" :size="15" aria-hidden="true" />
                    {{
                      selectedVariant.approvalStatus === 'approved' && !editorDirty
                        ? 'Approved'
                        : 'Approve exact version'
                    }}
                  </Button>
                </div>

                <a
                  v-if="selectedVariant.platformPostUrl"
                  class="post-link"
                  :href="selectedVariant.platformPostUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View published post
                  <UiIcon name="ExternalLink" :size="15" aria-hidden="true" />
                </a>
              </div>

              <aside class="post-preview" aria-label="Post preview">
                <div class="preview-heading">
                  <span>{{ platformLabel(selectedVariant.platform) }} preview</span>
                  <span
                    :class="[
                      'approval-badge',
                      `approval-badge--${selectedVariant.approvalStatus}`,
                    ]"
                  >
                    {{ selectedVariant.approvalStatus }}
                  </span>
                </div>
                <div class="preview-account">
                  <span class="preview-avatar">
                    {{
                      (
                        matchingAccounts.find(
                          (item) => item.id === editorAccountId,
                        )?.displayName ||
                        currentSite?.username ||
                        "M"
                      )
                        .slice(0, 1)
                        .toUpperCase()
                    }}
                  </span>
                  <div>
                    <strong>
                      {{
                        matchingAccounts.find(
                          (item) => item.id === editorAccountId,
                        )?.displayName || currentSite?.username
                      }}
                    </strong>
                    <small>
                      {{
                        matchingAccounts.find(
                          (item) => item.id === editorAccountId,
                        )?.handle || "Preview only"
                      }}
                    </small>
                  </div>
                </div>
                <p class="preview-copy">
                  {{ editorBody || "Your post preview will appear here." }}
                </p>
                <img
                  v-if="selectedVariant.assetManifest[0]"
                  class="preview-image"
                  :src="selectedVariant.assetManifest[0].url"
                  :alt="selectedVariant.assetManifest[0].filename || 'Post image'"
                />
              </aside>
            </div>

            <section
              v-if="
                selectedVariant &&
                selectedVariant.publicationStatus !== 'published'
              "
              class="schedule-panel"
              aria-labelledby="schedule-title"
            >
              <div>
                <h3 id="schedule-title">Publish</h3>
                <p v-if="selectedVariant.scheduledFor">
                  Set for {{ formatDate(selectedVariant.scheduledFor) }} ·
                  {{ selectedVariant.timezone }}
                </p>
                <p v-else>
                  Approve this exact account version before scheduling it.
                </p>
              </div>
              <div class="schedule-controls">
                <Button
                  v-if="selectedVariant.platform === 'linkedin'"
                  color="primary"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="saving || !canPublish"
                  @click="publishVariant"
                >
                  Publish now
                </Button>
                <label>
                  <span class="sr-only">Schedule date and time</span>
                  <input
                    v-model="scheduleLocal"
                    type="datetime-local"
                    :min="minimumScheduleLocal"
                    :disabled="
                      selectedVariant.approvalStatus !== 'approved' || editorDirty
                    "
                  />
                </label>
                <Button
                  color="outline"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="saving || !canSchedule"
                  @click="scheduleVariant"
                >
                  Schedule
                </Button>
                <Button
                  v-if="selectedVariant.scheduledFor"
                  color="ghost"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="saving"
                  @click="unscheduleVariant"
                >
                  Remove schedule
                </Button>
              </div>
            </section>
          </template>

          <template v-else-if="selectedManualItem">
            <header class="detail-header detail-header--manual">
              <div>
                <div class="detail-meta">
                  <span>Written by you</span>
                  <time :datetime="selectedManualItem.updatedAt">
                    {{ formatDate(selectedManualItem.updatedAt) }}
                  </time>
                </div>
                <h2>{{ manualTitle(selectedManualItem) }}</h2>
              </div>
              <div class="detail-actions">
                <Button
                  v-if="selectedManualItem.status !== 'posted'"
                  color="outline"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="saving || selectedManualItem.status === 'publishing'"
                  @click="openCompose(selectedManualItem)"
                >
                  <UiIcon name="Pencil" :size="14" aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  v-if="selectedManualItem.status === 'bank'"
                  color="outline"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="saving"
                  @click="queueManualItem(selectedManualItem)"
                >
                  Add to queue
                </Button>
                <Button
                  v-if="
                    selectedManualItem.status === 'queued' ||
                    selectedManualItem.status === 'scheduled'
                  "
                  color="ghost"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="saving"
                  @click="unqueueManualItem(selectedManualItem)"
                >
                  Back to drafts
                </Button>
                <Button
                  v-if="selectedManualItem.status !== 'posted'"
                  color="primary"
                  shape="soft"
                  size="compact"
                  type="button"
                  :disabled="saving || !manualItemCanPublish(selectedManualItem)"
                  @click="publishManualItem(selectedManualItem)"
                >
                  Publish now
                </Button>
                <Button
                  v-if="selectedManualItem.status !== 'publishing'"
                  color="ghost"
                  shape="soft"
                  size="compact"
                  icon-only
                  type="button"
                  aria-label="Delete social post"
                  title="Delete"
                  :disabled="saving"
                  @click="deleteManualItem(selectedManualItem)"
                >
                  <UiIcon name="Trash2" :size="16" aria-hidden="true" />
                </Button>
              </div>
            </header>

            <div class="manual-platforms" aria-label="Publishing platforms">
              <span
                v-for="platform in selectedManualItem.platforms"
                :key="platform"
                class="platform-chip"
              >
                {{ platformLabel(platform) }}
              </span>
              <span class="manual-status">{{ selectedManualItem.status }}</span>
            </div>

            <article class="manual-post">
              <p>{{ selectedManualItem.body }}</p>
              <div
                v-if="selectedManualItem.mediaManifest.length"
                class="detail-images detail-images--manual"
              >
                <img
                  v-for="(asset, index) in selectedManualItem.mediaManifest"
                  :key="`${asset.url}-${index}`"
                  :src="asset.url"
                  :alt="asset.filename || `Post image ${index + 1}`"
                />
              </div>
            </article>

            <p
              v-if="
                selectedManualItem.status !== 'posted' &&
                !manualItemCanPublish(selectedManualItem)
              "
              class="connection-note"
            >
              Connect the selected social accounts before publishing this post.
            </p>
          </template>
        </section>

        <section v-else class="detail-empty" aria-label="No social post selected">
          <UiIcon name="SquarePen" :size="24" aria-hidden="true" />
          <p>Select a post to review it, or compose a new one.</p>
        </section>
      </div>
    </main>

    <AppDialog
      :open="composeOpen"
      class="compose-modal"
      labelled-by="social-compose-title"
      @close="requestCloseCompose"
    >
      <form class="compose-card" @submit.prevent="saveCompose(false)">
        <header class="compose-card__header">
          <div>
            <h2 id="social-compose-title">
              {{ composeForm.id ? "Edit social post" : "New social post" }}
            </h2>
            <p>Choose where it will go, then write one exact version.</p>
          </div>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Close compose"
            :disabled="composeSaving"
            @click="requestCloseCompose"
          >
            <UiIcon name="X" :size="17" aria-hidden="true" />
          </Button>
        </header>

        <fieldset class="compose-platforms">
          <legend>Publish to</legend>
          <div class="platform-picker">
            <button
              v-for="platform in composePlatformOptions"
              :key="platform.id"
              type="button"
              class="platform-target"
              :class="{
                'platform-target--active': composeForm.platforms.includes(
                  platform.id,
                ),
              }"
              :aria-pressed="composeForm.platforms.includes(platform.id)"
              :aria-label="`${
                composeForm.platforms.includes(platform.id) ? 'Remove' : 'Add'
              } ${platform.label}`"
              @click="toggleComposePlatform(platform.id)"
            >
              <span :class="['platform-mark', `platform-mark--${platform.id}`]">
                {{ platformShortLabel(platform.id) }}
              </span>
              <span>{{ platform.label }}</span>
              <small :class="{ 'is-connected': platform.connected }">
                {{ platform.connected ? "Connected" : "Not connected" }}
              </small>
            </button>
          </div>
        </fieldset>

        <label class="compose-field compose-field--body">
          <span>Post</span>
          <textarea
            v-model="composeForm.body"
            rows="9"
            placeholder="What’s worth sharing?"
            autofocus
          />
        </label>

        <section class="compose-images" aria-labelledby="compose-images-title">
          <div class="compose-images__header">
            <div>
              <h3 id="compose-images-title">Images</h3>
              <p>JPEG, PNG, WebP, or GIF · up to 5MB each</p>
            </div>
            <label class="image-upload">
              <UiIcon name="Image" :size="15" aria-hidden="true" />
              <span>Add images</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                :disabled="composeSaving"
                @change="addComposeImages"
              />
            </label>
          </div>
          <div v-if="composeMedia.length" class="compose-image-grid">
            <figure v-for="asset in composeMedia" :key="asset.key">
              <img :src="asset.url" :alt="asset.filename" />
              <figcaption>
                <span>{{ asset.filename }}</span>
                <Button
                  color="ghost"
                  shape="soft"
                  size="small"
                  icon-only
                  type="button"
                  :aria-label="`Remove ${asset.filename}`"
                  @click="removeComposeImage(asset.saved, asset.index)"
                >
                  <UiIcon name="X" :size="14" aria-hidden="true" />
                </Button>
              </figcaption>
            </figure>
          </div>
        </section>

        <div class="compose-feedback" aria-live="polite">
          <p v-for="issue in composeIssues" :key="issue" role="alert">
            {{ issue }}
          </p>
          <p v-if="composeMissingAccounts.length" class="compose-account-note">
            Connect {{
              composeMissingAccounts.map(platformLabel).join(", ")
            }} before publishing. You can still save this draft.
          </p>
          <p v-if="composeError" class="compose-error" role="alert">
            {{ composeError }}
          </p>
        </div>

        <footer class="compose-card__actions">
          <Button
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            :disabled="composeSaving"
            @click="requestCloseCompose"
          >
            Cancel
          </Button>
          <Button
            color="outline"
            shape="soft"
            size="compact"
            type="submit"
            :disabled="composeSaving || !composeCanSave"
          >
            {{
              composeSaving && composeSaveMode === "draft"
                ? "Saving…"
                : "Save draft"
            }}
          </Button>
          <Button
            color="primary"
            shape="soft"
            size="compact"
            type="button"
            :disabled="composeSaving || !composeCanPublish"
            @click="saveCompose(true)"
          >
            <UiIcon name="Send" :size="14" aria-hidden="true" />
            {{
              composeSaving && composeSaveMode === "publish"
                ? "Publishing…"
                : "Publish now"
            }}
          </Button>
        </footer>
      </form>
    </AppDialog>

    <AppDialog
      :open="composeDiscardConfirmOpen"
      class="confirm-modal"
      labelled-by="discard-social-compose-title"
      described-by="discard-social-compose-description"
      @close="composeDiscardConfirmOpen = false"
    >
      <section class="confirm-card">
        <h2 id="discard-social-compose-title">Discard unsaved changes?</h2>
        <p id="discard-social-compose-description">
          This social post has not been saved.
        </p>
        <footer>
          <Button
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            @click="composeDiscardConfirmOpen = false"
          >
            Keep editing
          </Button>
          <Button
            color="danger"
            shape="soft"
            size="compact"
            type="button"
            @click="forceCloseCompose"
          >
            Discard changes
          </Button>
        </footer>
      </section>
    </AppDialog>

    <AppDialog
      :open="showAccounts"
      class="accounts-modal"
      aria-label="Social accounts"
      @close="closeAccounts"
    >
      <section class="accounts-card">
        <Button
          class="accounts-card__close"
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          type="button"
          aria-label="Close social accounts"
          @click="closeAccounts"
        >
          <UiIcon name="X" :size="17" aria-hidden="true" />
        </Button>
        <SocialAccountsPanel v-if="currentSite" :site-id="currentSite.id" />
      </section>
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

.social-page,
.social-main {
  min-height: 0;
}

.social-page {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.social-main {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.state-banner {
  margin: 10px 12px 0;
  padding: 10px 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
}

.state-banner--error {
  border-color: var(--ui-border-strong, var(--color-text));
  color: var(--ui-text, var(--color-text));
}

.social-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  min-height: 54px;
  box-sizing: border-box;
  padding: 9px 12px 0 56px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
  background: var(--ui-bg, var(--color-bg));
}

.social-toolbar__actions,
.detail-actions,
.inline-actions,
.schedule-controls {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.social-toolbar__actions {
  padding-bottom: 6px;
}

.social-toolbar__actions :deep(.me3-btn--icon-only),
.post-detail__mobile-back :deep(.me3-btn--icon-only) {
  min-width: 44px;
  min-height: 44px;
}

.social-inbox {
  display: grid;
  grid-template-columns: minmax(270px, 35%) minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.post-list,
.post-detail {
  min-height: 0;
  overflow-y: auto;
}

.post-list {
  border-right: 1px solid var(--ui-border, var(--color-border));
  background: var(--ui-bg, var(--color-bg));
}

.post-row {
  display: grid;
  gap: 8px;
  width: 100%;
  min-height: 104px;
  box-sizing: border-box;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.post-row:hover,
.post-row--active {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.post-row--active {
  box-shadow: inset 3px 0 0 var(--ui-accent, var(--color-text));
}

.post-row:focus-visible,
.variant-tab:focus-visible,
.platform-target:focus-visible,
summary:focus-visible,
select:focus-visible,
textarea:focus-visible,
input:focus-visible,
.image-upload:focus-within {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--ui-accent, var(--color-text));
  outline-offset: -2px;
}

.post-row__meta,
.post-row__footer,
.detail-meta,
.manual-platforms,
.preview-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.post-row__meta {
  justify-content: space-between;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 11px;
}

.post-row strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.post-row__footer {
  min-width: 0;
}

.platform-list {
  display: flex;
  min-width: 0;
  gap: 5px;
  flex-wrap: wrap;
}

.platform-chip,
.row-status,
.manual-status,
.approval-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 10px;
  font-weight: 750;
}

.row-status {
  margin-left: auto;
}

.image-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 11px;
}

.post-detail {
  padding: 24px 28px 40px;
}

.detail-empty,
.empty-state {
  display: flex;
  min-height: 220px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--ui-text-muted, var(--color-text-muted));
  text-align: center;
  font-size: 13px;
}

.detail-empty {
  min-height: 0;
}

.empty-state a {
  color: var(--ui-text, var(--color-text));
  font-weight: 750;
}

.post-detail__mobile-back {
  display: none;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.detail-header h2 {
  max-width: 780px;
  margin: 8px 0 0;
  font-size: clamp(20px, 2.5vw, 28px);
  line-height: 1.22;
  letter-spacing: -0.025em;
}

.detail-meta {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 11px;
}

.detail-meta > * + *::before {
  content: "·";
  margin-right: 8px;
}

.source-context {
  margin-top: 20px;
  border-top: 1px solid var(--ui-border, var(--color-border));
  border-bottom: 1px solid var(--ui-border, var(--color-border));
}

.source-context summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.source-context p {
  max-width: 760px;
  margin: 0 0 12px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.source-context small {
  display: block;
  margin-bottom: 12px;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.variant-tabs {
  display: flex;
  gap: 7px;
  padding: 18px 0;
  overflow-x: auto;
}

.variant-tab {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.variant-tab--active {
  border-color: var(--ui-border-strong, var(--color-text));
  color: var(--ui-text, var(--color-text));
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ui-border-strong, var(--color-border));
}

.status-dot--approved {
  background: var(--ui-accent, #15966f);
}

.variant-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 1.3fr) minmax(220px, 0.7fr);
  gap: 24px;
}

.variant-editor {
  display: grid;
  gap: 15px;
}

.field,
.compose-field {
  display: grid;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
}

select,
textarea,
input[type="datetime-local"] {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
}

select,
input[type="datetime-local"] {
  min-height: 42px;
  padding: 0 11px;
}

textarea {
  padding: 12px 13px;
  line-height: 1.55;
  resize: vertical;
}

textarea:read-only {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.field-note,
.connection-note {
  margin: -5px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  line-height: 1.5;
}

.recovery-banner {
  display: grid;
  gap: 5px;
  padding: 12px 13px;
  border: 1px solid var(--ui-border-strong, var(--color-text));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  font-size: 12px;
}

.recovery-banner span,
.recovery-banner small {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.post-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-accent-strong, var(--color-text));
  font-size: 12px;
  font-weight: 750;
}

.post-preview {
  align-self: start;
  padding: 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 8px);
  background: var(--ui-surface, var(--color-bg));
}

.preview-heading {
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
  font-size: 11px;
  font-weight: 750;
}

.approval-badge--approved {
  background: var(--ui-accent-soft, rgba(21, 150, 111, 0.12));
  color: var(--ui-accent-strong, #0d7655);
}

.preview-account {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.preview-account div {
  display: grid;
  gap: 2px;
}

.preview-account small {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.preview-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
  font-weight: 800;
}

.preview-copy {
  min-height: 120px;
  margin: 16px 0 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.preview-image {
  width: calc(100% + 32px);
  max-height: 280px;
  margin: 14px -16px -16px;
  object-fit: cover;
  border-radius: 0 0 var(--ui-radius-md, 8px) var(--ui-radius-md, 8px);
}

.detail-images {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.detail-images img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.schedule-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.schedule-panel h3,
.compose-images h3 {
  margin: 0;
  font-size: 14px;
}

.schedule-panel p,
.compose-images p {
  margin: 4px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
}

.detail-header--manual {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
}

.manual-platforms {
  margin-top: 16px;
}

.manual-status {
  margin-left: auto;
  text-transform: capitalize;
}

.manual-post {
  max-width: 760px;
  margin-top: 22px;
}

.manual-post > p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 16px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.detail-images--manual {
  margin-top: 22px;
}

.connection-note {
  margin-top: 20px;
}

.compose-card,
.accounts-card,
.confirm-card {
  box-sizing: border-box;
  width: min(100%, 720px);
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 12px);
  background: var(--ui-surface, var(--color-bg));
  box-shadow: var(--ui-shadow-md, 0 22px 70px rgba(0, 0, 0, 0.2));
}

.compose-card {
  display: grid;
  gap: 18px;
  padding: 22px;
}

.compose-card__header,
.compose-images__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.compose-card__header h2,
.confirm-card h2 {
  margin: 0;
  font-size: 21px;
  letter-spacing: -0.02em;
}

.compose-card__header p,
.confirm-card p {
  margin: 5px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
}

.compose-platforms {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.compose-platforms legend {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 750;
}

.platform-picker {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.platform-target {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 1px 8px;
  min-height: 58px;
  padding: 7px 9px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px);
  background: transparent;
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.platform-target--active {
  border-color: var(--ui-border-strong, var(--color-text));
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.platform-target small {
  grid-column: 2;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 10px;
  font-weight: 500;
}

.platform-target small.is-connected {
  color: var(--ui-accent-strong, var(--color-accent));
}

.platform-mark {
  display: grid;
  grid-row: 1 / 3;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  font-size: 11px;
  font-weight: 900;
}

.platform-mark--x {
  background: #111;
}

.platform-mark--linkedin {
  background: #0a66c2;
}

.platform-mark--instagram {
  background: #c13584;
}

.platform-mark--instagram_business {
  background: #1877f2;
}

.compose-field--body textarea {
  min-height: 174px;
}

.compose-images {
  display: grid;
  gap: 11px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.image-upload {
  position: relative;
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px);
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.image-upload input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.compose-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
}

.compose-image-grid figure {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px);
}

.compose-image-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.compose-image-grid figcaption {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  padding: 4px 5px 4px 8px;
}

.compose-image-grid figcaption > span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-image-grid :deep(.me3-btn--icon-only) {
  min-width: 30px;
  min-height: 30px;
}

.compose-feedback {
  display: grid;
  gap: 4px;
}

.compose-feedback p {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  line-height: 1.45;
}

.compose-feedback .compose-error {
  color: #b33b2e;
}

.compose-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.confirm-card {
  width: min(100%, 420px);
  padding: 20px;
}

.confirm-card footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.accounts-card {
  position: relative;
  width: min(100%, 820px);
  max-height: min(760px, calc(100dvh - 48px));
  padding: 22px;
  overflow-y: auto;
}

.accounts-card__close {
  position: absolute;
  z-index: 2;
  top: 14px;
  right: 14px;
  min-width: 44px;
  min-height: 44px;
}

@media (max-width: 980px) {
  .social-inbox {
    grid-template-columns: minmax(250px, 38%) minmax(0, 1fr);
  }

  .post-detail {
    padding: 22px 20px 36px;
  }

  .variant-workspace {
    grid-template-columns: 1fr;
  }

  .detail-header--manual {
    display: grid;
  }

  .platform-picker {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .social-page {
    height: calc(100vh - var(--app-shell-mobile-nav-height, 0px));
    height: calc(100dvh - var(--app-shell-mobile-nav-height, 0px));
  }

  .social-toolbar {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    min-height: 96px;
    padding: 6px 8px 0 54px;
  }

  .social-tabs {
    grid-row: 2;
    min-width: 0;
    max-width: calc(100vw - 16px);
    margin-left: -46px;
  }

  .social-toolbar__actions {
    grid-row: 1;
    justify-content: flex-end;
    flex-wrap: nowrap;
    padding-bottom: 0;
  }

  .social-inbox {
    display: block;
  }

  .post-list,
  .post-detail {
    height: 100%;
  }

  .post-detail,
  .detail-empty {
    display: none;
  }

  .social-inbox--detail-open .post-list {
    display: none;
  }

  .social-inbox--detail-open .post-detail {
    display: block;
  }

  .post-detail {
    padding: 12px 16px 32px;
  }

  .post-detail__mobile-back {
    display: block;
    margin: -4px 0 6px -8px;
  }

  .detail-header,
  .schedule-panel,
  .compose-images__header {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-header h2 {
    font-size: 22px;
  }

  .detail-actions,
  .schedule-controls {
    align-items: stretch;
  }

  .schedule-controls,
  .schedule-controls label,
  .schedule-controls :deep(.me3-btn) {
    width: 100%;
  }

  .compose-modal,
  .accounts-modal {
    padding: 0;
  }

  .compose-card,
  .accounts-card {
    width: 100%;
    max-height: 94dvh;
    margin-top: auto;
    padding: 18px 16px;
    overflow-y: auto;
    border-radius: var(--ui-radius-lg, 12px) var(--ui-radius-lg, 12px) 0 0;
  }

  .platform-picker {
    grid-template-columns: 1fr 1fr;
  }

  .compose-card__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .compose-card__actions :deep(.me3-btn) {
    width: 100%;
  }

  .compose-card__actions :deep(.me3-btn--primary) {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .confirm-card footer {
    flex-direction: column-reverse;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
