<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import SocialAccountsPanel from "../components/SocialAccountsPanel.vue";
import UiIcon from "../components/UiIcon.vue";
import { useSitesStore } from "../stores/sites";
import {
  useSocialStore,
  type SocialAccountRow,
  type SocialContentPackage,
  type SocialContentVariant,
} from "../stores/social";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Social Publishing | ME3",
    description: "Review, approve, and schedule source-backed social content.",
    robots: "noindex,follow",
  },
});

type WorkspaceMode = "drafts" | "scheduled" | "published";

const sites = useSitesStore();
const social = useSocialStore();
const selectedSiteId = ref("");
const packages = ref<SocialContentPackage[]>([]);
const accounts = ref<SocialAccountRow[]>([]);
const activeMode = ref<WorkspaceMode>("drafts");
const selectedPackageId = ref<string | null>(null);
const selectedVariantId = ref<string | null>(null);
const editorBody = ref("");
const editorAccountId = ref("");
const scheduleLocal = ref("");
const showAccounts = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const currentSite = computed(
  () => sites.sites.find((site) => site.id === selectedSiteId.value) || null,
);

const selectedPackage = computed(
  () => packages.value.find((detail) => detail.package.id === selectedPackageId.value) || null,
);

const selectedVariant = computed(
  () => selectedPackage.value?.variants.find((variant) => variant.id === selectedVariantId.value) || null,
);

const draftPackages = computed(() => packages.value.filter((detail) =>
  detail.variants.some((variant) =>
    !variant.scheduledFor &&
    variant.publicationStatus !== "queued" &&
    variant.publicationStatus !== "publishing" &&
    variant.publicationStatus !== "published",
  ),
));
const scheduledPackages = computed(() => packages.value.filter((detail) =>
  detail.variants.some((variant) =>
    Boolean(variant.scheduledFor) ||
    variant.publicationStatus === "queued" ||
    variant.publicationStatus === "publishing",
  ),
));
const publishedPackages = computed(() => packages.value.filter((detail) =>
  isPublished(detail) || detail.variants.some((variant) => variant.publicationStatus === "published"),
));

const visiblePackages = computed(() => {
  if (activeMode.value === "scheduled") return scheduledPackages.value;
  if (activeMode.value === "published") return publishedPackages.value;
  return draftPackages.value;
});

const matchingAccounts = computed(() => {
  const platform = selectedVariant.value?.platform;
  if (!platform) return [];
  return accounts.value.filter((account) =>
    account.siteId === selectedSiteId.value &&
    account.platform === platform &&
    account.status === "active",
  );
});

const editorDirty = computed(() => {
  const variant = selectedVariant.value;
  return Boolean(variant) && (
    editorBody.value.trim() !== variant?.bodyText ||
    (editorAccountId.value || null) !== variant?.targetAccountId
  );
});

const canApprove = computed(() =>
  Boolean(selectedVariant.value && editorBody.value.trim() && editorAccountId.value),
);

const canSchedule = computed(() =>
  selectedVariant.value?.approvalStatus === "approved" &&
  !editorDirty.value &&
  Boolean(scheduleLocal.value),
);
const canPublish = computed(() =>
  selectedVariant.value?.platform === "linkedin" &&
  selectedVariant.value.approvalStatus === "approved" &&
  !editorDirty.value &&
  selectedVariant.value.publicationStatus !== "queued" &&
  selectedVariant.value.publicationStatus !== "publishing" &&
  selectedVariant.value.publicationStatus !== "published",
);

const publicationRecovery = computed(() => {
  const variant = selectedVariant.value;
  if (!variant?.failureClass) return null;
  const guidance = {
    retryable: "LinkedIn returned a temporary error. You can safely try publishing again.",
    reconnect_required: "Reconnect this LinkedIn account, then publish the approved variant again.",
    rejected: "LinkedIn rejected this exact post. Edit it, approve the new version, then try again.",
    unsupported: "This post format is not supported yet. Change the copy or media before retrying.",
    outcome_unknown: "Do not retry yet. Check LinkedIn first because the post may already be live.",
  }[variant.failureClass];
  return {
    guidance,
    message: variant.errorMessage,
  };
});

const minimumScheduleLocal = computed(() => toLocalInput(new Date(Date.now() + 60_000)));

function isPublished(detail: SocialContentPackage): boolean {
  return detail.package.status === "published" || detail.package.status === "partially_published";
}

function platformLabel(platform: SocialContentVariant["platform"]): string {
  if (platform === "x") return "X";
  if (platform === "linkedin") return "LinkedIn";
  return "Instagram";
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
      if (typeof parsed[key] === "string" && parsed[key].trim()) return parsed[key].trim();
    }
  } catch {
    // Older and manually created packages may store plain-text snapshots.
  }
  return snapshot;
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

function selectPackage(detail: SocialContentPackage) {
  selectedPackageId.value = detail.package.id;
  const preferred = detail.variants.find((variant) =>
    activeMode.value === "published"
      ? variant.publicationStatus === "published"
      : activeMode.value === "scheduled"
        ? variant.scheduledFor || variant.publicationStatus === "queued" || variant.publicationStatus === "publishing"
        : !variant.scheduledFor && !variant.publicationStatus,
  ) || detail.variants[0] || null;
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
  const visible = visiblePackages.value;
  const current = visible.find((detail) => detail.package.id === selectedPackageId.value);
  if (current) {
    selectPackage(current);
  } else if (visible[0]) {
    selectPackage(visible[0]);
  } else {
    selectedPackageId.value = null;
    selectVariant(null);
  }
}

async function loadWorkspace() {
  if (!selectedSiteId.value) return;
  loading.value = true;
  error.value = "";
  try {
    const [nextPackages, nextAccounts] = await Promise.all([
      social.fetchContentPackages(selectedSiteId.value),
      social.fetchSocialAccounts(),
    ]);
    packages.value = nextPackages;
    accounts.value = nextAccounts;
    ensureVisibleSelection();
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load social drafts");
    error.value = social.error || "Failed to load social drafts";
  } finally {
    loading.value = false;
  }
}

function replaceVariant(variant: SocialContentVariant) {
  packages.value = packages.value.map((detail) =>
    detail.package.id === variant.packageId
      ? {
          ...detail,
          variants: detail.variants.map((item) => item.id === variant.id ? variant : item),
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
    replaceVariant(await social.updateContentVariant(variant.id, {
      bodyText: editorBody.value,
      targetAccountId: editorAccountId.value || null,
    }));
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
    replaceVariant(await social.updateContentVariant(variant.id, {
      bodyText: editorBody.value,
      targetAccountId: editorAccountId.value,
      approvalStatus: "approved",
    }));
    notice.value = "Exact account variant approved. It has not been published.";
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
    replaceVariant(await social.updateContentVariant(variant.id, {
      scheduledFor: date.toISOString(),
      timezone: browserTimezone,
    }));
    notice.value = "Variant scheduled. Publishing will use this exact approved version.";
    activeMode.value = "scheduled";
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
    replaceVariant(await social.updateContentVariant(variant.id, { scheduledFor: null }));
    notice.value = "Variant moved back to drafts.";
    activeMode.value = "drafts";
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
  if (!window.confirm("Publish this exact approved LinkedIn version now?")) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const publication = await social.publishContentVariant(variant.id);
    activeMode.value = publication.status === "published" ? "published" : "scheduled";
    await loadWorkspace();
    notice.value = publication.status === "published"
      ? "LinkedIn post published."
      : "LinkedIn post added to the publishing queue.";
  } catch (value) {
    social.setErrorFromApi(value, "Failed to publish LinkedIn post");
    error.value = social.error || "Failed to publish LinkedIn post";
  } finally {
    saving.value = false;
  }
}

watch(activeMode, ensureVisibleSelection);
watch(selectedSiteId, loadWorkspace);

onMounted(async () => {
  if (sites.sites.length === 0) await sites.fetchSites();
  selectedSiteId.value = sites.sites[0]?.id || "";
});
</script>

<template>
  <main class="social-workspace">
    <header class="workspace-header">
      <div>
        <h1>Social Publishing</h1>
        <p>Review the agent’s work, approve the exact account version, then choose when it goes out.</p>
      </div>
      <div class="header-actions">
        <label class="site-picker">
          <span>Site</span>
          <select v-model="selectedSiteId" :disabled="sites.sites.length < 2">
            <option v-for="site in sites.sites" :key="site.id" :value="site.id">
              {{ site.username }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="button button--secondary"
          :aria-expanded="showAccounts"
          @click="showAccounts = !showAccounts"
        >
          <UiIcon name="Settings" :size="17" />
          Accounts
        </button>
      </div>
    </header>

    <div v-if="error" class="banner banner--error" role="alert">{{ error }}</div>
    <div v-if="notice" class="banner" role="status" aria-live="polite">{{ notice }}</div>

    <section v-if="showAccounts && currentSite" class="accounts-panel" aria-label="Social accounts">
      <SocialAccountsPanel :site-id="currentSite.id" />
    </section>

    <nav class="mode-tabs" aria-label="Social publishing views">
      <button
        v-for="mode in ([
          { id: 'drafts', label: 'Drafts', count: draftPackages.length },
          { id: 'scheduled', label: 'Scheduled', count: scheduledPackages.length },
          { id: 'published', label: 'Published', count: publishedPackages.length },
        ] as const)"
        :key="mode.id"
        type="button"
        :class="['mode-tab', { 'mode-tab--active': activeMode === mode.id }]"
        :aria-current="activeMode === mode.id ? 'page' : undefined"
        @click="activeMode = mode.id"
      >
        {{ mode.label }} <span>{{ mode.count }}</span>
      </button>
    </nav>

    <div v-if="sites.sites.length === 0" class="empty-state">
      Create a profile site before managing social publishing.
    </div>

    <div v-else class="review-layout" :aria-busy="loading">
      <aside class="package-list" aria-label="Social content packages">
        <div v-if="loading" class="list-message">Loading social content…</div>
        <div v-else-if="visiblePackages.length === 0" class="empty-state empty-state--compact">
          <strong>No {{ activeMode }} yet.</strong>
          <span v-if="activeMode === 'drafts'">Ask the ME3 agent to turn a Journal entry or task into social posts.</span>
          <RouterLink v-if="activeMode === 'drafts'" to="/assistant">Open the agent</RouterLink>
        </div>
        <button
          v-for="detail in visiblePackages"
          :key="detail.package.id"
          type="button"
          :class="['package-row', { 'package-row--active': selectedPackageId === detail.package.id }]"
          @click="selectPackage(detail)"
        >
          <span class="package-row__meta">
            {{ sourceLabel(detail) }} · {{ formatDate(detail.package.updatedAt) }}
          </span>
          <strong>{{ detail.package.ideaText }}</strong>
          <span class="platform-pills">
            <span v-for="variant in detail.variants" :key="variant.id">
              {{ platformLabel(variant.platform) }}
              <span v-if="variant.scheduledFor">· scheduled</span>
              <span v-else-if="variant.failureClass">· needs attention</span>
              <span v-else-if="variant.publicationStatus === 'queued' || variant.publicationStatus === 'publishing'">· publishing</span>
              <span v-else-if="variant.approvalStatus === 'approved'">· approved</span>
            </span>
          </span>
        </button>
      </aside>

      <section v-if="selectedPackage" class="review-panel" aria-labelledby="review-title">
        <header class="review-header">
          <div>
            <span class="source-badge">{{ sourceLabel(selectedPackage) }}</span>
            <h2 id="review-title">{{ selectedPackage.package.ideaText }}</h2>
          </div>
          <span class="created-by">Created by {{ selectedPackage.package.createdBy }}</span>
        </header>

        <details class="source-context">
          <summary>View source context</summary>
          <p>{{ sourceText(selectedPackage) }}</p>
          <small v-if="selectedPackage.package.sourceRef">{{ selectedPackage.package.sourceRef }}</small>
        </details>

        <div class="variant-tabs" role="tablist" aria-label="Platform variants">
          <button
            v-for="variant in selectedPackage.variants"
            :key="variant.id"
            type="button"
            role="tab"
            :aria-selected="selectedVariantId === variant.id"
            :class="['variant-tab', { 'variant-tab--active': selectedVariantId === variant.id }]"
            @click="selectVariant(variant)"
          >
            {{ platformLabel(variant.platform) }}
            <span :class="['status-dot', `status-dot--${variant.approvalStatus}`]" aria-hidden="true" />
          </button>
        </div>

        <div v-if="selectedVariant" class="variant-workspace">
          <div class="variant-editor">
            <div v-if="publicationRecovery" class="recovery-banner" role="alert">
              <strong>Publishing needs attention</strong>
              <span>{{ publicationRecovery.message || publicationRecovery.guidance }}</span>
              <small v-if="publicationRecovery.message">{{ publicationRecovery.guidance }}</small>
            </div>
            <label class="field">
              <span>Publishing account</span>
              <select v-model="editorAccountId" :disabled="selectedVariant.publicationStatus === 'published'">
                <option value="">Choose an account</option>
                <option v-for="account in matchingAccounts" :key="account.id" :value="account.id">
                  {{ account.displayName || account.handle || platformLabel(selectedVariant.platform) }}
                  <template v-if="account.handle"> · @{{ account.handle.replace(/^@/, '') }}</template>
                </option>
              </select>
            </label>

            <label class="field">
              <span>{{ platformLabel(selectedVariant.platform) }} copy</span>
              <textarea
                v-model="editorBody"
                rows="12"
                :readonly="selectedVariant.publicationStatus === 'published'"
                :aria-describedby="selectedVariant.approvalStatus === 'approved' ? 'approval-edit-note' : undefined"
              />
            </label>

            <p
              v-if="selectedVariant.approvalStatus === 'approved' && selectedVariant.publicationStatus !== 'published'"
              id="approval-edit-note"
              class="field-note"
            >
              Editing approved copy or changing its account removes approval and any schedule.
            </p>

            <div v-if="selectedVariant.publicationStatus !== 'published'" class="editor-actions">
              <button
                type="button"
                class="button button--secondary"
                :disabled="saving || !editorDirty || !editorBody.trim()"
                @click="saveVariant"
              >
                Save changes
              </button>
              <button
                type="button"
                class="button button--primary"
                :disabled="saving || !canApprove"
                @click="approveVariant"
              >
                <UiIcon name="Check" :size="17" />
                {{ selectedVariant.approvalStatus === 'approved' && !editorDirty ? 'Approved' : 'Approve exact version' }}
              </button>
            </div>
            <a
              v-if="selectedVariant.platformPostUrl"
              class="post-link"
              :href="selectedVariant.platformPostUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              View published post
              <UiIcon name="ExternalLink" :size="15" />
            </a>
          </div>

          <aside class="variant-preview" aria-label="Post preview">
            <div class="preview-heading">
              <span>{{ platformLabel(selectedVariant.platform) }} preview</span>
              <span :class="['approval-badge', `approval-badge--${selectedVariant.approvalStatus}`]">
                {{ selectedVariant.approvalStatus }}
              </span>
            </div>
            <div class="preview-account">
              <span class="preview-avatar">{{ (matchingAccounts.find((item) => item.id === editorAccountId)?.displayName || currentSite?.username || 'M').slice(0, 1).toUpperCase() }}</span>
              <div>
                <strong>{{ matchingAccounts.find((item) => item.id === editorAccountId)?.displayName || currentSite?.username }}</strong>
                <small>{{ matchingAccounts.find((item) => item.id === editorAccountId)?.handle || 'Preview only' }}</small>
              </div>
            </div>
            <p class="preview-copy">{{ editorBody || "Your post preview will appear here." }}</p>
          </aside>
        </div>

        <section
          v-if="selectedVariant && selectedVariant.publicationStatus !== 'published'"
          class="schedule-panel"
          aria-labelledby="schedule-title"
        >
          <div>
            <h3 id="schedule-title">Schedule</h3>
            <p v-if="selectedVariant.scheduledFor">
              Set for {{ formatDate(selectedVariant.scheduledFor) }} · {{ selectedVariant.timezone }}
            </p>
            <p v-else>Approve this exact account variant before scheduling it.</p>
          </div>
          <div class="schedule-controls">
            <button
              v-if="selectedVariant.platform === 'linkedin'"
              type="button"
              class="button button--primary"
              :disabled="saving || !canPublish"
              @click="publishVariant"
            >
              Publish now
            </button>
            <label>
              <span class="sr-only">Schedule date and time</span>
              <input
                v-model="scheduleLocal"
                type="datetime-local"
                :min="minimumScheduleLocal"
                :disabled="selectedVariant.approvalStatus !== 'approved' || editorDirty"
              />
            </label>
            <button
              type="button"
              class="button button--primary"
              :disabled="saving || !canSchedule"
              @click="scheduleVariant"
            >
              Schedule
            </button>
            <button
              v-if="selectedVariant.scheduledFor"
              type="button"
              class="button button--ghost"
              :disabled="saving"
              @click="unscheduleVariant"
            >
              Remove schedule
            </button>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>

<style scoped>
.social-workspace {
  min-height: 100%;
  padding: 28px 40px 56px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.workspace-header,
.review-header,
.preview-heading,
.schedule-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.workspace-header h1,
.review-header h2,
.schedule-panel h3 {
  margin: 0;
  letter-spacing: -0.025em;
}

.workspace-header h1 { font-size: clamp(1.65rem, 3vw, 2.25rem); }
.workspace-header p,
.schedule-panel p {
  margin: 6px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.9rem;
}

.header-actions,
.editor-actions,
.schedule-controls {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.site-picker,
.field {
  display: grid;
  gap: 7px;
  font-size: 0.78rem;
  font-weight: 700;
}

select,
textarea,
input[type="datetime-local"] {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 7px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
}

select,
input[type="datetime-local"] { min-height: 44px; padding: 0 12px; }
textarea { padding: 13px 14px; line-height: 1.55; resize: vertical; }
textarea:read-only { background: var(--ui-surface-muted, var(--color-bg-subtle)); }

select:focus-visible,
textarea:focus-visible,
input:focus-visible,
button:focus-visible,
a:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-text));
  outline-offset: 2px;
}

.button {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm, 7px);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 750;
  cursor: pointer;
}

.button:disabled { opacity: 0.45; cursor: not-allowed; }
.button--primary { background: var(--ui-text, var(--color-text)); color: var(--ui-bg, var(--color-bg)); }
.button--secondary { border-color: var(--ui-border, var(--color-border)); background: var(--ui-surface, var(--color-bg)); color: inherit; }
.button--ghost { background: transparent; color: var(--ui-text-muted, var(--color-text-muted)); }

.banner,
.accounts-panel {
  margin-top: 18px;
  padding: 13px 15px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
  font-size: 0.88rem;
}
.banner--error { border-color: var(--ui-border-strong, var(--color-text)); }
.accounts-panel { padding: 18px; }
.recovery-banner { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--ui-border-strong, var(--color-text)); border-radius: var(--ui-radius-md, 10px); background: var(--ui-surface-muted, var(--color-bg-subtle)); font-size: 0.82rem; }
.recovery-banner span,
.recovery-banner small { color: var(--ui-text-muted, var(--color-text-muted)); }

.mode-tabs {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 22px;
  margin-top: 24px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
  background: var(--ui-bg, var(--color-bg));
}

.mode-tab {
  min-height: 48px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.mode-tab span { margin-left: 5px; font-variant-numeric: tabular-nums; }
.mode-tab--active { border-bottom-color: var(--ui-accent, var(--color-text)); color: var(--ui-text, var(--color-text)); }

.review-layout {
  display: grid;
  grid-template-columns: minmax(250px, 0.68fr) minmax(520px, 1.7fr);
  min-height: 620px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
}

.package-list {
  padding: 18px 18px 18px 0;
  border-right: 1px solid var(--ui-border, var(--color-border));
}

.package-row {
  width: 100%;
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 0;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.package-row:hover,
.package-row--active { background: var(--ui-surface-muted, var(--color-bg-subtle)); }
.package-row--active { box-shadow: inset 3px 0 var(--ui-accent, var(--color-text)); }
.package-row strong { line-height: 1.35; }
.package-row__meta { color: var(--ui-text-muted, var(--color-text-muted)); font-size: 0.72rem; }
.platform-pills { display: flex; gap: 6px; flex-wrap: wrap; }
.platform-pills > span,
.source-badge,
.approval-badge {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.68rem;
  font-weight: 750;
  text-transform: capitalize;
}

.review-panel { min-width: 0; padding: 28px 0 0 34px; }
.review-header h2 { max-width: 720px; margin-top: 10px; font-size: 1.45rem; }
.created-by { color: var(--ui-text-muted, var(--color-text-muted)); font-size: 0.75rem; white-space: nowrap; }

.source-context {
  margin-top: 18px;
  padding: 12px 0;
  border-top: 1px solid var(--ui-border, var(--color-border));
  border-bottom: 1px solid var(--ui-border, var(--color-border));
}
.source-context summary { min-height: 32px; display: flex; align-items: center; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
.source-context p { max-width: 780px; white-space: pre-wrap; color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.55; }
.source-context small { color: var(--ui-text-muted, var(--color-text-muted)); }

.variant-tabs { display: flex; gap: 8px; padding: 18px 0; overflow-x: auto; }
.variant-tab {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 7px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.variant-tab--active { border-color: var(--ui-border-strong, var(--color-text)); color: var(--ui-text, var(--color-text)); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ui-border-strong, var(--color-border)); }
.status-dot--approved { background: var(--ui-accent, #15966f); }

.variant-workspace { display: grid; grid-template-columns: minmax(320px, 1.25fr) minmax(240px, 0.75fr); gap: 28px; }
.variant-editor { display: grid; gap: 16px; }
.field-note { margin: -6px 0 0; color: var(--ui-text-muted, var(--color-text-muted)); font-size: 0.75rem; line-height: 1.45; }
.post-link { display: inline-flex; align-items: center; gap: 7px; color: var(--ui-accent-strong, var(--color-text)); font-size: 0.82rem; font-weight: 750; }

.variant-preview {
  align-self: start;
  padding: 18px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
  box-shadow: var(--ui-shadow-sm, none);
}
.preview-heading { align-items: center; padding-bottom: 14px; border-bottom: 1px solid var(--ui-border, var(--color-border)); font-size: 0.74rem; font-weight: 750; }
.approval-badge--approved { background: var(--ui-accent-soft, rgba(21, 150, 111, 0.12)); color: var(--ui-accent-strong, #0d7655); }
.preview-account { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.preview-account div { display: grid; gap: 2px; }
.preview-account small { color: var(--ui-text-muted, var(--color-text-muted)); }
.preview-avatar { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; background: var(--ui-text, var(--color-text)); color: var(--ui-bg, var(--color-bg)); font-weight: 800; }
.preview-copy { min-height: 150px; margin: 18px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; }

.schedule-panel {
  align-items: center;
  margin-top: 28px;
  padding: 20px 0;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.empty-state,
.list-message {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--ui-text-muted, var(--color-text-muted));
  text-align: center;
  font-size: 0.86rem;
}
.empty-state a { color: var(--ui-text, var(--color-text)); font-weight: 750; }
.empty-state--compact { padding: 20px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 980px) {
  .social-workspace { padding: 22px 24px 48px; }
  .review-layout { grid-template-columns: minmax(220px, 0.75fr) minmax(0, 1.4fr); }
  .review-panel { padding-left: 24px; }
  .variant-workspace { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .social-workspace { padding: 56px 16px 40px; }
  .workspace-header,
  .review-header,
  .schedule-panel { flex-direction: column; align-items: stretch; }
  .header-actions { align-items: stretch; }
  .site-picker { flex: 1 1 180px; }
  .mode-tabs { margin-top: 18px; justify-content: space-between; gap: 8px; }
  .review-layout { display: block; border: 0; }
  .package-list { padding: 10px 0 0; border-right: 0; border-bottom: 1px solid var(--ui-border, var(--color-border)); }
  .review-panel { padding: 24px 0 0; }
  .created-by { white-space: normal; }
  .schedule-controls,
  .schedule-controls label,
  .schedule-controls .button { width: 100%; }
}
</style>
