<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { api } from "../../../api";
import Button from "../../../components/Button.vue";
import PageLoading from "../../../components/PageLoading.vue";
import UiIcon from "../../../components/UiIcon.vue";

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
  name: string;
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
let refreshTimer: number | null = null;

const hasActiveCampaigns = computed(() =>
  campaigns.value.some((campaign) => ["scheduled", "sending"].includes(campaign.status)),
);

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
  if (!window.confirm(`Cancel “${campaign.name}”? Unsent recipients will not be emailed.`)) return;
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
  if (campaign.status === "draft") return campaign.subject || "Not ready to send";
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
  <div class="campaigns-page">
    <main class="campaigns-shell">
      <header class="campaigns-header">
        <div>
          <router-link class="back-link" to="/email">
            <UiIcon name="ArrowLeft" :size="16" aria-hidden="true" />
            Email
          </router-link>
          <h1>Campaigns</h1>
          <p>Simple updates for people who asked to hear from your Site.</p>
        </div>
        <div class="campaigns-header__actions">
          <Button color="ghost" shape="soft" size="compact" icon-only :disabled="refreshing" aria-label="Refresh campaigns" title="Refresh" @click="loadCampaigns(true)">
            <UiIcon name="RefreshCw" :size="18" aria-hidden="true" />
          </Button>
          <Button v-if="transport?.ready" color="primary" shape="soft" size="compact" to="/email/campaigns/create">
            <template #icon><UiIcon name="Plus" :size="16" aria-hidden="true" /></template>
            New campaign
          </Button>
        </div>
      </header>

      <PageLoading v-if="loading" label="Loading campaigns…" />
      <p v-else-if="error" class="notice notice--error" role="alert">{{ error }}</p>
      <template v-else>
        <section v-if="transport && !transport.ready" class="notice" aria-labelledby="campaign-availability-title">
          <UiIcon name="Info" :size="20" aria-hidden="true" />
          <div>
            <strong id="campaign-availability-title">
              {{ transport.managed ? "Campaign sending is not ready" : "Campaign sending needs managed ME3" }}
            </strong>
            <p v-if="transport.instructions[0]">{{ transport.instructions[0] }}</p>
            <p v-else>Your campaign history remains available here; sending will resume only after a managed sender is ready.</p>
          </div>
        </section>

        <section v-if="campaigns.length" class="campaign-list" aria-label="Email campaigns">
          <article v-for="campaign in campaigns" :key="campaign.id" class="campaign-card">
            <div class="campaign-card__main">
              <div class="campaign-card__title-row">
                <div>
                  <span class="campaign-card__site">@{{ campaign.siteUsername }}</span>
                  <h2>{{ campaign.name }}</h2>
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
          <Button v-if="transport?.ready" color="primary" shape="soft" to="/email/campaigns/create">Create campaign</Button>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.campaigns-page { min-height: 100vh; padding: calc(var(--workspace-topbar-height) + 24px) 24px 72px; background: var(--ui-bg, var(--color-bg)); color: var(--ui-text, var(--color-text)); }
.campaigns-shell { width: min(100%, 900px); margin: 0 auto; }
.campaigns-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.campaigns-header h1 { margin: 10px 0 4px; font-size: clamp(1.8rem, 4vw, 2.4rem); letter-spacing: -0.04em; }
.campaigns-header p { margin: 0; color: var(--ui-text-muted, var(--color-text-muted)); }
.campaigns-header__actions, .campaign-card__actions { display: flex; align-items: center; gap: 8px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; color: var(--ui-text-muted, var(--color-text-muted)); font-size: .86rem; font-weight: 700; text-decoration: none; }
.back-link:hover { color: var(--ui-text, var(--color-text)); }
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
@media (max-width: 640px) {
  .campaigns-page { padding-inline: 16px; }
  .campaigns-header { align-items: flex-start; flex-direction: column; }
  .campaigns-header__actions { width: 100%; justify-content: flex-end; }
  .campaign-card { align-items: stretch; flex-direction: column; }
  .campaign-card__actions { justify-content: flex-end; }
}
</style>
