<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import {
  EMAIL_CAMPAIGNS_PLUGIN_ID,
  type CampaignAddOnPlanKey,
  type CampaignAddOnStatus,
} from "@me3-core/plugin-email-campaigns";
import { api } from "../../../api";
import Button from "../../../components/Button.vue";
import PageLoading from "../../../components/PageLoading.vue";
import UiIcon from "../../../components/UiIcon.vue";
import WorkspaceTabs from "../../../components/WorkspaceTabs.vue";
import type { UiIconName } from "../../../utils/icons";
import type { PluginRecord, PluginsResponse } from "../../../utils/plugins";

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
  addOn: CampaignAddOnStatus | null;
  instructions: string[];
};

const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const actionError = ref("");
const campaigns = ref<CampaignSummary[]>([]);
const transport = ref<TransportStatus | null>(null);
const campaignPlugin = ref<PluginRecord | null>(null);
const activatingPlugin = ref(false);
const checkoutPlan = ref<CampaignAddOnPlanKey | null>(null);
const openingBilling = ref(false);
const settingUpSender = ref(false);
const cancellingId = ref<string | null>(null);
const route = useRoute();
const router = useRouter();
let refreshTimer: number | null = null;
let billingRefreshAttempts = 0;

const campaignMailboxTabs: Array<{
  id: string;
  label: string;
  icon: UiIconName;
}> = [
  { id: "campaigns", label: "Campaigns", icon: "Send" },
  { id: "inbox", label: "Inbox", icon: "Inbox" },
  { id: "drafts", label: "Drafts", icon: "FileText" },
  { id: "sent", label: "Sent", icon: "Send" },
  { id: "archive", label: "Archive", icon: "Archive" },
  { id: "trash", label: "Trash", icon: "Trash2" },
  { id: "contacts", label: "Contacts", icon: "UsersRound" },
];

const hasActiveCampaigns = computed(() =>
  campaigns.value.some((campaign) => ["scheduled", "sending"].includes(campaign.status)),
);
const pluginEnabled = computed(() => Boolean(campaignPlugin.value?.enabled));
const canCreateCampaign = computed(() => pluginEnabled.value);
const billingReturn = computed(() =>
  typeof route.query.campaign_add_on === "string" ? route.query.campaign_add_on : "",
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

async function loadCampaignAccess() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api.get<PluginsResponse>("/plugins");
    campaignPlugin.value = response.plugins.find(
      (plugin) => plugin.id === EMAIL_CAMPAIGNS_PLUGIN_ID,
    ) || null;
    if (!campaignPlugin.value) {
      throw new Error("Email Campaigns is not available in this ME3 installation.");
    }
    if (campaignPlugin.value.enabled) await loadCampaigns();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to load campaigns.";
  } finally {
    loading.value = false;
  }
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
  if (
    billingReturn.value === "success" &&
    transport.value?.managed &&
    !transport.value.addOn?.entitled &&
    billingRefreshAttempts < 4
  ) {
    billingRefreshAttempts += 1;
    refreshTimer = window.setTimeout(() => void loadCampaigns(true), 2_500);
    return;
  }
  billingRefreshAttempts = 0;
  refreshTimer = hasActiveCampaigns.value
    ? window.setTimeout(() => void loadCampaigns(true), 15_000)
    : null;
}

async function activateCampaignPlugin() {
  if (!campaignPlugin.value || activatingPlugin.value) return;
  activatingPlugin.value = true;
  actionError.value = "";
  try {
    const response = await api.post<{ plugin: PluginRecord }>(
      `/plugins/${encodeURIComponent(EMAIL_CAMPAIGNS_PLUGIN_ID)}/activate`,
    );
    campaignPlugin.value = response.plugin;
    await loadCampaigns();
  } catch (caught) {
    actionError.value = caught instanceof Error ? caught.message : "Unable to activate Email Campaigns.";
  } finally {
    activatingPlugin.value = false;
  }
}

async function startCheckout(plan: CampaignAddOnPlanKey) {
  if (checkoutPlan.value) return;
  checkoutPlan.value = plan;
  actionError.value = "";
  try {
    const response = await api.post<{ url: string }>("/email/campaigns/add-on/checkout", {
      plan,
    });
    window.location.assign(response.url);
  } catch (caught) {
    actionError.value = caught instanceof Error ? caught.message : "Unable to open checkout.";
    checkoutPlan.value = null;
  }
}

async function openBillingPortal() {
  if (openingBilling.value) return;
  openingBilling.value = true;
  actionError.value = "";
  try {
    const response = await api.post<{ url: string }>("/email/campaigns/add-on/portal");
    window.location.assign(response.url);
  } catch (caught) {
    actionError.value = caught instanceof Error ? caught.message : "Unable to open billing.";
    openingBilling.value = false;
  }
}

async function setupSender() {
  if (settingUpSender.value) return;
  settingUpSender.value = true;
  actionError.value = "";
  try {
    const response = await api.post<{ transport: TransportStatus }>(
      "/email/campaigns/sender/setup",
    );
    transport.value = response.transport;
  } catch (caught) {
    actionError.value = caught instanceof Error ? caught.message : "Unable to set up campaign sending.";
  } finally {
    settingUpSender.value = false;
  }
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
  if (campaign.status === "draft") return null;
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

function campaignTitle(campaign: CampaignSummary) {
  return campaign.subject.trim() || "No subject";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatResetDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

onMounted(() => void loadCampaignAccess());
onBeforeUnmount(() => {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
});
</script>

<template>
  <main class="agent-page campaigns-page">
    <Teleport to="#app-side-nav-mobile-page-controls" defer>
      <div class="campaigns-mobile-nav">
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
      <section v-else-if="!pluginEnabled" class="campaign-setup" aria-labelledby="campaign-plugin-title">
        <span class="campaign-setup__icon" aria-hidden="true"><UiIcon name="Send" :size="26" /></span>
        <div>
          <small>Optional plugin</small>
          <h1 id="campaign-plugin-title">Email Campaigns</h1>
          <p>Create newsletters from your ME3 lists, review consent-aware audiences, and keep delivery history with your site.</p>
          <p>Activating the plugin is free. Delivery is configured separately.</p>
          <p v-if="actionError" class="inline-error" role="alert">{{ actionError }}</p>
          <Button
            color="primary"
            shape="soft"
            :disabled="activatingPlugin"
            @click="activateCampaignPlugin"
          >
            {{ activatingPlugin ? "Activating…" : "Activate Email Campaigns" }}
          </Button>
        </div>
      </section>

      <template v-else>
        <p v-if="actionError" class="notice notice--error" role="alert">{{ actionError }}</p>
        <p v-if="billingReturn === 'cancelled'" class="notice" role="status">
          No changes were made. You can choose a delivery allowance whenever you are ready.
        </p>
        <p
          v-else-if="billingReturn === 'success' && !transport?.addOn?.entitled"
          class="notice"
          role="status"
        >
          Payment received. Campaign delivery is being activated…
        </p>

        <section
          v-if="transport?.managed && transport.addOn && !transport.addOn.entitled"
          class="campaign-add-on"
          aria-labelledby="campaign-add-on-title"
        >
          <div class="campaign-add-on__intro">
            <small>Optional managed delivery</small>
            <h1 id="campaign-add-on-title">Choose your monthly email capacity</h1>
            <p>Drafting and subscriber management stay available without this add-on. Activate it when you are ready to send through ME3.</p>
          </div>
          <div class="capacity-options" aria-label="Campaign Sending plans">
            <article v-for="plan in transport.addOn.plans" :key="plan.key" class="capacity-option">
              <strong>{{ formatNumber(plan.allowance) }}</strong>
              <span>email deliveries / month</span>
              <p>${{ plan.monthlyPriceUsd }} <small>USD / month</small></p>
              <Button
                color="primary"
                shape="soft"
                size="small"
                :disabled="checkoutPlan !== null || !plan.checkoutAvailable || !transport.addOn.available"
                @click="startCheckout(plan.key)"
              >
                {{ checkoutPlan === plan.key ? "Opening checkout…" : plan.checkoutAvailable ? "Choose plan" : "Coming soon" }}
              </Button>
            </article>
          </div>
        </section>

        <section
          v-else-if="transport?.managed && transport.addOn?.entitled"
          class="delivery-summary"
          aria-labelledby="campaign-delivery-title"
        >
          <div>
            <small>Campaign Sending</small>
            <h2 id="campaign-delivery-title">
              {{ formatNumber(transport.addOn.remaining) }} deliveries remaining
            </h2>
            <p>
              {{ formatNumber(transport.addOn.used) }} of {{ formatNumber(transport.addOn.allowance) }} used · resets {{ formatResetDate(transport.addOn.resetAt) }}
            </p>
            <p v-if="transport.sender">Sending from {{ transport.sender.fromAddress }}</p>
          </div>
          <div class="delivery-summary__actions">
            <Button
              v-if="!transport.ready"
              color="primary"
              shape="soft"
              size="small"
              :disabled="settingUpSender"
              @click="setupSender"
            >
              {{ settingUpSender ? "Setting up…" : "Set up campaign sender" }}
            </Button>
            <Button
              color="outline"
              shape="soft"
              size="small"
              :disabled="openingBilling"
              @click="openBillingPortal"
            >
              {{ openingBilling ? "Opening…" : "Manage capacity" }}
            </Button>
          </div>
        </section>

        <section
          v-else-if="transport && !transport.managed"
          class="notice"
          aria-labelledby="campaign-availability-title"
        >
          <UiIcon name="Info" :size="20" aria-hidden="true" />
          <div>
            <strong id="campaign-availability-title">Configure delivery for this self-hosted installation</strong>
            <p>{{ transport.instructions[0] || "Drafts and subscriber management are ready. Connect an email provider before sending." }}</p>
          </div>
        </section>

        <section v-else-if="transport && !transport.ready" class="notice" aria-labelledby="campaign-availability-title">
          <UiIcon name="Info" :size="20" aria-hidden="true" />
          <div>
            <strong id="campaign-availability-title">Campaign sending is not ready</strong>
            <p>{{ transport.instructions[0] || "Drafts remain available while managed delivery is being configured." }}</p>
          </div>
        </section>

        <section v-if="campaigns.length" class="campaign-list" aria-label="Email campaigns">
          <article v-for="campaign in campaigns" :key="campaign.id" class="campaign-card">
            <div class="campaign-card__main">
              <div class="campaign-card__title-row">
                <h2>
                  {{ campaignTitle(campaign) }}
                  <span class="campaign-card__site">- @{{ campaign.siteUsername }}</span>
                </h2>
                <span class="status-pill" :class="`status-pill--${campaign.status}`">{{ statusLabel(campaign.status) }}</span>
              </div>
              <p v-if="statusDetail(campaign)">{{ statusDetail(campaign) }}</p>
              <small>Updated {{ formatDate(campaign.updatedAt) }}</small>
            </div>
            <div class="campaign-card__actions">
              <Button
                v-if="campaign.status === 'draft'"
                color="ghost"
                shape="soft"
                size="compact"
                icon-only
                :to="{ path: '/email/campaigns/create', query: { campaign: campaign.id } }"
                :aria-label="`Edit ${campaignTitle(campaign)} for @${campaign.siteUsername}`"
                title="Edit campaign"
              >
                <UiIcon name="Pencil" :size="17" aria-hidden="true" />
              </Button>
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
.campaigns-mobile-nav { display: flex; align-items: center; justify-content: flex-end; gap: 10px; width: 100%; }
.campaigns-mobile-nav :deep(.me3-btn) { flex: 0 0 36px; width: 36px; height: 36px; }
.campaigns-mail-tabs { display: flex; justify-content: flex-start; width: 100%; padding: 4px 8px 0; border-bottom: 1px solid var(--ui-border, var(--color-border)); background: var(--ui-bg, var(--color-bg)); overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-padding-inline: 8px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.campaigns-mail-tabs::-webkit-scrollbar { display: none; }
.campaigns-shell { width: min(100%, 900px); margin: 0 auto; padding: 24px 24px 72px; box-sizing: border-box; }
.campaign-card__actions { position: absolute; right: 12px; bottom: 10px; display: flex; align-items: center; gap: 8px; }
.notice { display: flex; gap: 12px; margin-bottom: 20px; padding: 15px 16px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-md, 12px); background: var(--ui-surface-muted, var(--color-bg-subtle)); }
.notice strong, .notice p { display: block; margin: 0; }
.notice p { margin-top: 3px; color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.45; }
.notice--error { color: var(--ui-danger, #b42318); }
.campaign-setup { display: grid; grid-template-columns: auto minmax(0, 1fr); max-width: 620px; gap: 18px; margin: 64px auto 0; padding: 24px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-lg, 16px); background: var(--ui-surface, var(--color-bg)); }
.campaign-setup__icon { display: grid; width: 52px; height: 52px; place-items: center; border-radius: var(--ui-radius-md, 12px); background: var(--ui-surface-muted, var(--color-bg-subtle)); color: var(--ui-accent, var(--color-accent)); }
.campaign-setup small, .campaign-add-on__intro small, .delivery-summary small { color: var(--ui-text-muted, var(--color-text-muted)); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.campaign-setup h1, .campaign-setup p { margin: 0; }
.campaign-setup h1 { margin-top: 3px; font-size: 1.4rem; }
.campaign-setup p { margin-top: 8px; color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.5; }
.campaign-setup :deep(.me3-btn) { margin-top: 18px; }
.campaign-setup .inline-error { color: var(--ui-danger, #b42318); }
.campaign-add-on { margin-bottom: 24px; padding: 22px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-lg, 16px); background: var(--ui-surface, var(--color-bg)); }
.campaign-add-on__intro h1, .campaign-add-on__intro p { margin: 0; }
.campaign-add-on__intro h1 { margin-top: 4px; font-size: 1.3rem; }
.campaign-add-on__intro p { max-width: 680px; margin-top: 6px; color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.45; }
.capacity-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
.capacity-option { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; padding: 16px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-md, 12px); background: var(--ui-surface-muted, var(--color-bg-subtle)); }
.capacity-option > strong { font-size: 1.3rem; }
.capacity-option > span { color: var(--ui-text-muted, var(--color-text-muted)); font-size: .78rem; }
.capacity-option p { margin: 15px 0 12px; font-weight: 700; }
.capacity-option p small { color: var(--ui-text-muted, var(--color-text-muted)); font-size: .72rem; font-weight: 500; }
.capacity-option :deep(.me3-btn) { width: 100%; margin-top: auto; }
.delivery-summary { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; padding: 17px 18px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-md, 12px); background: var(--ui-surface-muted, var(--color-bg-subtle)); }
.delivery-summary h2, .delivery-summary p { margin: 0; }
.delivery-summary h2 { margin-top: 2px; font-size: 1.05rem; }
.delivery-summary p { margin-top: 3px; color: var(--ui-text-muted, var(--color-text-muted)); font-size: .82rem; }
.delivery-summary__actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.campaign-list { display: grid; gap: 8px; }
.campaign-card { position: relative; min-height: 76px; padding: 14px 54px 12px 16px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-md, 12px); background: var(--ui-surface, var(--color-bg)); box-sizing: border-box; }
.campaign-card__main { min-width: 0; flex: 1; }
.campaign-card__title-row { min-width: 0; }
.campaign-card h2 { overflow: hidden; margin: 0; padding-right: 62px; font-size: .96rem; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.campaign-card p, .campaign-card small { margin: 0; color: var(--ui-text-muted, var(--color-text-muted)); }
.campaign-card p { margin-top: 4px; font-size: .82rem; }
.campaign-card small { display: block; margin-top: 5px; font-size: .72rem; }
.campaign-card__site { color: var(--ui-accent, var(--color-accent)); font-weight: 700; }
.status-pill { position: absolute; top: 10px; right: 12px; padding: 4px 8px; border-radius: 999px; background: var(--ui-surface-muted, var(--color-bg-subtle)); color: var(--ui-text-muted, var(--color-text-muted)); font-size: .7rem; font-weight: 700; }
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
  .campaign-setup { grid-template-columns: 1fr; margin-top: 32px; padding: 20px; }
  .capacity-options { grid-template-columns: 1fr; }
  .delivery-summary { align-items: flex-start; flex-direction: column; }
  .delivery-summary__actions { justify-content: flex-start; }
}
</style>
