<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRouter } from "vue-router";
import { api } from "../../../api";
import Button from "../../../components/Button.vue";
import PageLoading from "../../../components/PageLoading.vue";
import UiIcon from "../../../components/UiIcon.vue";
import WorkspaceTabs from "../../../components/WorkspaceTabs.vue";
import type { UiIconName } from "../../../utils/icons";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Campaigns | ME3",
    description: "Create and review email campaigns.",
    robots: "noindex,follow",
  },
});

type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";
type CampaignSummary = {
  id: string;
  siteId: string;
  siteUsername: string;
  subject: string;
  status: CampaignStatus;
  scheduledFor: string | null;
  sentAt: string | null;
  failureReason: string | null;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  updatedAt: string;
};
type TransportStatus = {
  managed: boolean;
  ready: boolean;
  reason: string | null;
  sender: { fromAddress: string } | null;
  instructions: string[];
};

const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const campaigns = ref<CampaignSummary[]>([]);
const transport = ref<TransportStatus | null>(null);
const cancellingId = ref<string | null>(null);
const router = useRouter();
const remoteApiHost = import.meta.env.DEV
  ? import.meta.env.VITE_REMOTE_API_HOST || ""
  : "";
let refreshTimer: number | null = null;

const campaignMailboxTabs: Array<{
  id: string;
  label: string;
  icon: UiIconName;
}> = [
  { id: "inbox", label: "Inbox", icon: "Inbox" },
  { id: "drafts", label: "Drafts", icon: "FileText" },
  { id: "sent", label: "Sent", icon: "Send" },
  { id: "archive", label: "Archive", icon: "Archive" },
  { id: "trash", label: "Trash", icon: "Trash2" },
  { id: "contacts", label: "Contacts", icon: "UsersRound" },
  { id: "campaigns", label: "Campaigns", icon: "Send" },
];

const hasActiveCampaigns = computed(() =>
  campaigns.value.some((campaign) => ["scheduled", "sending"].includes(campaign.status)),
);
const canCreateCampaign = computed(() =>
  Boolean(transport.value?.ready || remoteApiHost),
);

function switchCampaignMailboxTab(tabId: string) {
  if (tabId === "campaigns") return;
  if (tabId === "contacts") {
    void router.push("/contacts");
    return;
  }
  void router.push({
    path: "/email",
    query: tabId === "inbox" ? {} : { tab: tabId },
  });
}

async function loadCampaigns(silent = false) {
  if (silent) refreshing.value = true;
  else loading.value = true;
  error.value = "";
  try {
    const [campaignResponse, transportResponse] = await Promise.all([
      api.get<{ campaigns: CampaignSummary[] }>("/email/campaigns"),
      api.get<{ transport: TransportStatus }>("/email/campaigns/transport"),
    ]);
    campaigns.value = campaignResponse.campaigns;
    transport.value = transportResponse.transport;
    scheduleRefresh();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to load campaigns.";
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function scheduleRefresh() {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = hasActiveCampaigns.value
    ? window.setTimeout(() => void loadCampaigns(true), 15_000)
    : null;
}

async function cancelCampaign(campaign: CampaignSummary) {
  const subject = campaign.subject.trim();
  const prompt = subject
    ? `Cancel “${subject}”? Unsent recipients will not be emailed.`
    : "Cancel this campaign? Unsent recipients will not be emailed.";
  if (!window.confirm(prompt)) return;
  cancellingId.value = campaign.id;
  try {
    await api.post(`/email/campaigns/${encodeURIComponent(campaign.id)}/cancel`);
    await loadCampaigns(true);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to cancel campaign.";
  } finally {
    cancellingId.value = null;
  }
}

function statusLabel(status: CampaignStatus) {
  return {
    draft: "Draft",
    scheduled: "Scheduled",
    sending: "Sending",
    sent: "Sent",
    cancelled: "Cancelled",
    failed: "Failed",
  }[status];
}

function statusDetail(campaign: CampaignSummary) {
  if (campaign.status === "draft") return "Not sent yet";
  if (campaign.status === "scheduled" && campaign.scheduledFor) {
    return `Scheduled ${formatDate(campaign.scheduledFor)}`;
  }
  if (campaign.status === "sending") {
    return `${campaign.deliveredCount} of ${campaign.recipientCount} delivered`;
  }
  if (campaign.status === "sent") {
    return `${campaign.deliveredCount} delivered · ${campaign.failedCount} unavailable`;
  }
  return campaign.failureReason || statusLabel(campaign.status);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

onMounted(() => void loadCampaigns());
onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
});
</script>

<template>
  <main class="agent-page campaigns-page">
    <Teleport to="#app-side-nav-mobile-page-controls" defer>
      <div class="campaigns-mobile-nav">
        <h1>Campaigns</h1>
        <Button
          v-if="canCreateCampaign"
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          to="/email/campaigns/create"
          aria-label="Create campaign"
          title="Create campaign"
        >
          <UiIcon name="SquarePen" :size="18" aria-hidden="true" />
        </Button>
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          to="/email"
          aria-label="Close campaigns and return to Inbox"
          title="Close"
        >
          <UiIcon name="X" :size="18" aria-hidden="true" />
        </Button>
      </div>
    </Teleport>

    <div class="campaigns-mail-tabs">
      <WorkspaceTabs
        :tabs="campaignMailboxTabs"
        model-value="campaigns"
        aria-label="Mailbox folders"
        semantics="navigation"
        @change="switchCampaignMailboxTab"
      />
    </div>

    <div class="campaigns-shell">

      <PageLoading v-if="loading" label="Loading campaigns…" />
      <p v-else-if="error" class="notice notice--error" role="alert">{{ error }}</p>
      <template v-else>
        <section v-if="transport && !transport.ready" class="notice" aria-labelledby="campaign-availability-title">
          <UiIcon name="Info" :size="20" aria-hidden="true" />
          <div>
            <strong id="campaign-availability-title">
              {{ transport.managed ? "Campaign sending is not ready" : "Campaign sending needs managed ME3" }}
            </strong>
            <p v-if="remoteApiHost">You can create and edit drafts locally. Test and live delivery still need the managed sender.</p>
            <p v-else-if="transport.instructions[0]">{{ transport.instructions[0] }}</p>
            <p v-else>Your campaign history remains available here; sending will resume only after a managed sender is ready.</p>
          </div>
        </section>

        <section v-if="campaigns.length" class="campaign-list" aria-label="Email campaigns">
          <article v-for="campaign in campaigns" :key="campaign.id" class="campaign-card">
            <div class="campaign-card__main">
              <div class="campaign-card__title-row">
                <div>
                  <span class="campaign-card__site">@{{ campaign.siteUsername }}</span>
                  <h2 v-if="campaign.subject">{{ campaign.subject }}</h2>
                </div>
                <span class="status-pill" :class="`status-pill--${campaign.status}`">{{ statusLabel(campaign.status) }}</span>
              </div>
              <p>{{ statusDetail(campaign) }}</p>
              <small>Updated {{ formatDate(campaign.updatedAt) }}</small>
            </div>
            <div class="campaign-card__actions">
              <Button v-if="campaign.status === 'draft'" color="outline" shape="soft" size="compact" :to="{ path: '/email/campaigns/create', query: { campaign: campaign.id } }">Continue</Button>
              <Button v-if="['scheduled', 'sending'].includes(campaign.status)" color="ghost" shape="soft" size="compact" :disabled="cancellingId === campaign.id" @click="cancelCampaign(campaign)">
                {{ cancellingId === campaign.id ? "Cancelling…" : "Cancel" }}
              </Button>
            </div>
          </article>
        </section>

        <section v-else class="empty-campaigns">
          <span aria-hidden="true"><UiIcon name="Send" :size="28" /></span>
          <h2>No campaigns yet</h2>
          <p>Create a focused update, review the eligible audience, then send now or schedule it.</p>
          <Button v-if="canCreateCampaign" color="primary" shape="soft" to="/email/campaigns/create">Create campaign</Button>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.campaigns-page { display: flex; flex-direction: column; min-height: 100%; background: var(--ui-bg, var(--color-bg)); color: var(--ui-text, var(--color-text)); }
.campaigns-mobile-nav { display: flex; align-items: center; gap: 10px; width: 100%; }
.campaigns-mobile-nav h1 { flex: 1 1 auto; min-width: 0; overflow: hidden; margin: 0; color: var(--ui-text, var(--color-text)); font-size: 16px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.campaigns-mobile-nav :deep(.me3-btn) { flex: 0 0 36px; width: 36px; height: 36px; }
.campaigns-mail-tabs { display: flex; justify-content: flex-start; width: 100%; padding: 4px 8px 0; border-bottom: 1px solid var(--ui-border, var(--color-border)); background: var(--ui-bg, var(--color-bg)); overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-padding-inline: 8px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.campaigns-mail-tabs::-webkit-scrollbar { display: none; }
.campaigns-shell { width: min(100%, 900px); margin: 0 auto; padding: 24px 24px 72px; box-sizing: border-box; }
.campaign-card__actions { display: flex; align-items: center; gap: 8px; }
.notice { display: flex; gap: 12px; margin-bottom: 20px; padding: 15px 16px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-md, 12px); background: var(--ui-surface-muted, var(--color-bg-subtle)); }
.notice strong, .notice p { display: block; margin: 0; }
.notice p { margin-top: 3px; color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.45; }
.notice--error { color: var(--ui-danger, #b42318); }
.campaign-list { display: grid; gap: 12px; }
.campaign-card { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-lg, 16px); background: var(--ui-surface, var(--color-bg)); box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / .05)); }
.campaign-card__main { min-width: 0; flex: 1; }
.campaign-card__title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.campaign-card h2 { overflow: hidden; margin: 3px 0 7px; font-size: 1.06rem; text-overflow: ellipsis; white-space: nowrap; }
.campaign-card p, .campaign-card small { margin: 0; color: var(--ui-text-muted, var(--color-text-muted)); }
.campaign-card small { display: block; margin-top: 8px; font-size: .76rem; }
.campaign-card__site { color: var(--ui-accent, var(--color-accent)); font-size: .76rem; font-weight: 700; }
.status-pill { flex: 0 0 auto; padding: 4px 8px; border-radius: 999px; background: var(--ui-surface-muted, var(--color-bg-subtle)); color: var(--ui-text-muted, var(--color-text-muted)); font-size: .72rem; font-weight: 700; }
.status-pill--sending, .status-pill--scheduled { background: color-mix(in srgb, var(--ui-accent, #13a27d) 12%, transparent); color: var(--ui-accent-strong, var(--color-accent)); }
.status-pill--failed { background: color-mix(in srgb, var(--ui-danger, #b42318) 10%, transparent); color: var(--ui-danger, #b42318); }
.empty-campaigns { display: grid; max-width: 520px; justify-items: center; gap: 10px; margin: 80px auto 0; text-align: center; }
.empty-campaigns > span { display: grid; width: 58px; height: 58px; place-items: center; border-radius: 16px; background: var(--ui-surface-muted, var(--color-bg-subtle)); color: var(--ui-accent, var(--color-accent)); }
.empty-campaigns h2, .empty-campaigns p { margin: 0; }
.empty-campaigns p { margin-bottom: 8px; color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.55; }
@media (min-width: 768px) {
  .campaigns-mail-tabs { justify-content: center; }
}
@media (max-width: 640px) {
  .campaigns-shell { padding: 16px 16px 72px; }
  .campaign-card { align-items: stretch; flex-direction: column; }
  .campaign-card__actions { justify-content: flex-end; }
}
</style>
