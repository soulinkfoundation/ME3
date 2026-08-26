<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import { api } from "../../../api";
import Button from "../../../components/Button.vue";
import CampaignRichTextEditor from "../../../components/CampaignRichTextEditor.vue";
import PageLoading from "../../../components/PageLoading.vue";
import UiIcon from "../../../components/UiIcon.vue";
import { useAuthStore } from "../../../stores/auth";
import { useSitesStore } from "../../../stores/sites";
import {
  campaignDocumentToEditorHtml,
  campaignEditorHtmlToTextBlock,
  type CampaignDocument,
  type CampaignExtraBlock,
} from "../../../utils/campaignDocument";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Create campaign | ME3",
    description: "Compose and schedule an email campaign.",
    robots: "noindex,follow",
  },
});

type Campaign = {
  id: string;
  siteId: string;
  siteUsername: string;
  name: string;
  status: string;
  revision: {
    id: string;
    subject: string;
    previewText: string;
    replyToAddress: string | null;
    document: CampaignDocument;
    renderedHtml: string | null;
    renderedText: string | null;
  };
};
type TransportStatus = {
  managed: boolean;
  ready: boolean;
  reason: string | null;
  sender: { ref: string; fromAddress: string; domain: string } | null;
  instructions: string[];
};
type Review = {
  audience: {
    eligibleCount: number;
    excludedCount: number;
    exclusionCounts: Record<string, number>;
  };
  transport: TransportStatus;
};

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const sites = useSitesStore();
const loading = ref(true);
const error = ref("");
const campaign = ref<Campaign | null>(null);
const transport = ref<TransportStatus | null>(null);
const review = ref<Review | null>(null);
const step = ref<1 | 2>(1);
const creating = ref(false);
const saving = ref(false);
const savedAt = ref<string | null>(null);
const testing = ref(false);
const testMessage = ref("");
const sending = ref(false);
const uploadPending = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const hydrating = ref(true);
let saveTimer: number | null = null;

const selectedSiteId = ref("");
const name = ref("Untitled campaign");
const subject = ref("");
const previewText = ref("");
const replyToAddress = ref("");
const richTextHtml = ref("<p></p>");
const brand = ref<CampaignDocument["brand"]>({
  name: "ME3",
  homeUrl: "https://me3.app/",
  logoUrl: null,
  backgroundColor: "#f4f5f4",
  surfaceColor: "#ffffff",
  textColor: "#18201d",
  accentColor: "#147d64",
});
const extraBlocks = ref<CampaignExtraBlock[]>([]);
const buttonDraft = ref({ label: "Learn more", href: "" });
const sendMode = ref<"now" | "schedule">("now");
const scheduledLocal = ref("");

const ownerEmail = computed(() => auth.user?.email?.trim().toLowerCase() || "");
const canCreate = computed(() => Boolean(selectedSiteId.value && transport.value?.ready));
const canReview = computed(() => Boolean(subject.value.trim() && campaign.value));
const excludedReasons = computed(() =>
  Object.entries(review.value?.audience.exclusionCounts || {}).filter(([, count]) => count > 0),
);

async function initialize() {
  loading.value = true;
  error.value = "";
  try {
    await sites.ensureSites();
    const transportResponse = await api.get<{ transport: TransportStatus }>(
      "/email/campaigns/transport",
    );
    transport.value = transportResponse.transport;
    const campaignId = typeof route.query.campaign === "string" ? route.query.campaign : "";
    if (campaignId) await loadCampaign(campaignId);
    else {
      selectedSiteId.value = sites.sites[0]?.id || "";
      replyToAddress.value = ownerEmail.value;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to open the campaign builder.";
  } finally {
    hydrating.value = false;
    loading.value = false;
  }
}

async function loadCampaign(campaignId: string) {
  const response = await api.get<{ campaign: Campaign }>(
    `/email/campaigns/${encodeURIComponent(campaignId)}`,
  );
  applyCampaign(response.campaign);
}

function applyCampaign(next: Campaign) {
  hydrating.value = true;
  campaign.value = next;
  selectedSiteId.value = next.siteId;
  name.value = next.name;
  subject.value = next.revision.subject;
  previewText.value = next.revision.previewText;
  replyToAddress.value = next.revision.replyToAddress || ownerEmail.value;
  brand.value = { ...next.revision.document.brand };
  richTextHtml.value = campaignDocumentToEditorHtml(next.revision.document);
  extraBlocks.value = next.revision.document.blocks.filter(
    (block): block is CampaignExtraBlock => block.type !== "text",
  );
  queueMicrotask(() => {
    hydrating.value = false;
  });
}

async function createDraft() {
  if (!canCreate.value || creating.value) return;
  creating.value = true;
  error.value = "";
  try {
    const response = await api.post<{ campaign: Campaign }>("/email/campaigns", {
      siteId: selectedSiteId.value,
      name: name.value,
    });
    applyCampaign(response.campaign);
    await router.replace({
      path: "/email/campaigns/create",
      query: { campaign: response.campaign.id },
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to create campaign.";
  } finally {
    creating.value = false;
  }
}

function buildDocument(): CampaignDocument {
  return {
    version: "me3.campaign-document.v1",
    brand: { ...brand.value },
    blocks: [campaignEditorHtmlToTextBlock(richTextHtml.value), ...extraBlocks.value],
  };
}

async function saveDraft(): Promise<void> {
  if (!campaign.value || campaign.value.status !== "draft") return;
  if (saving.value) {
    await waitForCurrentSave();
    return saveDraft();
  }
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  saving.value = true;
  error.value = "";
  try {
    const response = await api.put<{ campaign: Campaign }>(
      `/email/campaigns/${encodeURIComponent(campaign.value.id)}`,
      {
        name: name.value,
        subject: subject.value,
        previewText: previewText.value,
        replyToAddress: replyToAddress.value || null,
        document: buildDocument(),
      },
    );
    campaign.value = response.campaign;
    savedAt.value = new Date().toISOString();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to save campaign.";
  } finally {
    saving.value = false;
  }
}

function waitForCurrentSave(): Promise<void> {
  if (!saving.value) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(saving, (active) => {
      if (active) return;
      stop();
      resolve();
    });
  });
}

function scheduleSave() {
  if (hydrating.value || !campaign.value || campaign.value.status !== "draft") return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveDraft(), 900);
}

async function continueToReview() {
  if (!canReview.value) {
    error.value = "Add a subject before reviewing your campaign.";
    return;
  }
  await saveDraft();
  if (error.value || !campaign.value) return;
  await loadReview();
  step.value = 2;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveAndExit() {
  await saveDraft();
  if (!error.value) await router.push("/email/campaigns");
}

async function loadReview() {
  if (!campaign.value) return;
  review.value = await api.get<Review>(
    `/email/campaigns/${encodeURIComponent(campaign.value.id)}/review`,
  );
  transport.value = review.value.transport;
}

async function sendTest() {
  if (!campaign.value || testing.value) return;
  testing.value = true;
  testMessage.value = "";
  try {
    const response = await api.post<{ test: { status: string } }>(
      `/email/campaigns/${encodeURIComponent(campaign.value.id)}/test`,
    );
    testMessage.value = response.test.status === "accepted"
      ? `Test sent to ${ownerEmail.value}.`
      : `Test status: ${response.test.status}.`;
  } catch (caught) {
    testMessage.value = caught instanceof Error ? caught.message : "Unable to send test.";
  } finally {
    testing.value = false;
  }
}

async function approveSend() {
  if (!campaign.value || sending.value || !review.value?.transport.ready) return;
  if (review.value.audience.eligibleCount === 0) {
    error.value = "This Site has no eligible subscribers.";
    return;
  }
  if (sendMode.value === "schedule" && !scheduledLocal.value) {
    error.value = "Choose a send time.";
    return;
  }
  sending.value = true;
  error.value = "";
  try {
    await api.post(
      `/email/campaigns/${encodeURIComponent(campaign.value.id)}/send`,
      {
        scheduledFor:
          sendMode.value === "schedule"
            ? new Date(scheduledLocal.value).toISOString()
            : null,
      },
    );
    await router.push("/email/campaigns");
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to queue campaign.";
  } finally {
    sending.value = false;
  }
}

async function uploadImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !campaign.value) return;
  uploadPending.value = true;
  error.value = "";
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await api.upload<{
      asset: { id: string; url: string; filename: string };
    }>(`/email/campaigns/${encodeURIComponent(campaign.value.id)}/assets`, form);
    extraBlocks.value.push({
      id: newBlockId("image"),
      type: "image",
      assetId: response.asset.id,
      src: response.asset.url,
      alt: file.name.replace(/\.[^.]+$/, ""),
    });
    scheduleSave();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Unable to upload image.";
  } finally {
    uploadPending.value = false;
    input.value = "";
  }
}

function addButtonBlock() {
  if (!buttonDraft.value.label.trim() || !isHttpUrl(buttonDraft.value.href)) {
    error.value = "Add a button label and a full HTTP(S) link.";
    return;
  }
  extraBlocks.value.push({
    id: newBlockId("button"),
    type: "button",
    label: buttonDraft.value.label.trim(),
    href: buttonDraft.value.href.trim(),
    alignment: "center",
  });
  buttonDraft.value = { label: "Learn more", href: "" };
}

function addDivider() {
  extraBlocks.value.push({ id: newBlockId("divider"), type: "divider" });
}

function addSpacer() {
  extraBlocks.value.push({ id: newBlockId("spacer"), type: "spacer", size: "medium" });
}

function removeBlock(id: string) {
  extraBlocks.value = extraBlocks.value.filter((block) => block.id !== id);
}

function describeBlock(block: CampaignExtraBlock) {
  if (block.type === "image") return block.alt || "Image";
  if (block.type === "button") return block.label;
  if (block.type === "divider") return "Divider";
  return `${block.size} space`;
}

function newBlockId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

watch(
  [name, subject, previewText, replyToAddress, richTextHtml, brand, extraBlocks],
  scheduleSave,
  { deep: true },
);

onMounted(() => void initialize());
onBeforeUnmount(() => {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
});
</script>

<template>
  <div class="campaign-wizard-page">
    <main class="campaign-wizard-shell">
      <header class="wizard-header">
        <router-link class="back-link" to="/email/campaigns">
          <UiIcon name="ArrowLeft" :size="16" aria-hidden="true" />
          Campaigns
        </router-link>
        <div class="step-copy" aria-live="polite">
          <span>{{ step }} / 2</span>
          <strong>{{ step === 1 ? "Compose" : "Review and schedule" }}</strong>
        </div>
        <div class="step-dots" aria-hidden="true">
          <span :class="{ active: step === 1 }" />
          <span :class="{ active: step === 2 }" />
        </div>
      </header>

      <PageLoading v-if="loading" label="Opening campaign builder…" />
      <p v-else-if="error && !campaign" class="notice notice--error" role="alert">{{ error }}</p>

      <template v-else>
        <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
        <section v-if="!transport?.ready && !campaign" class="availability-card">
          <UiIcon name="Info" :size="22" aria-hidden="true" />
          <div>
            <h1>Campaign sending is not ready</h1>
            <p>{{ transport?.managed ? (transport.instructions[0] || "Finish setting up the managed campaign sender first.") : "Campaign sending is available only on managed ME3 installations." }}</p>
            <Button color="outline" shape="soft" to="/email/campaigns">View campaign history</Button>
          </div>
        </section>

        <section v-else-if="!campaign" class="start-card">
          <div>
            <span class="eyebrow">Compose</span>
            <h1>Choose the Site sending this campaign</h1>
            <p>The Site supplies the audience and starting brand. You can keep the campaign itself very simple.</p>
          </div>
          <label class="field">
            <span>Site</span>
            <select v-model="selectedSiteId">
              <option disabled value="">Choose a Site</option>
              <option v-for="site in sites.sites" :key="site.id" :value="site.id">@{{ site.username }}</option>
            </select>
          </label>
          <label class="field">
            <span>Campaign name</span>
            <input v-model="name" maxlength="160" placeholder="August update" />
          </label>
          <Button color="primary" shape="soft" size="large" :disabled="!canCreate || creating" @click="createDraft">
            {{ creating ? "Creating…" : "Start composing" }}
          </Button>
        </section>

        <template v-else-if="step === 1">
          <section class="compose-heading">
            <div>
              <span class="eyebrow">@{{ campaign.siteUsername }}</span>
              <h1>Compose campaign</h1>
            </div>
            <span class="save-state" role="status">
              {{ saving ? "Saving…" : savedAt ? "Saved" : "Draft" }}
            </span>
          </section>

          <div class="compose-grid">
            <section class="form-card">
              <div class="field-grid">
                <label class="field field--wide"><span>Internal name</span><input v-model="name" maxlength="160" /></label>
                <label class="field field--wide"><span>Subject</span><input v-model="subject" maxlength="200" placeholder="A useful update" /></label>
                <label class="field field--wide"><span>Preview text</span><input v-model="previewText" maxlength="240" placeholder="A short line shown beside the subject" /></label>
                <label class="field field--wide">
                  <span>Reply-to</span>
                  <input v-model="replyToAddress" type="email" :placeholder="ownerEmail" />
                  <small>Use your verified ME3 account email, or leave blank.</small>
                </label>
              </div>

              <div class="section-label">
                <span>Message</span>
                <small>Safe email formatting only</small>
              </div>
              <CampaignRichTextEditor v-model="richTextHtml" />

              <div class="block-tools" aria-label="Add campaign block">
                <input ref="fileInput" class="sr-only" type="file" accept="image/jpeg,image/png,image/gif" @change="uploadImage" />
                <Button color="outline" shape="soft" size="small" :disabled="uploadPending" @click="fileInput?.click()">
                  <template #icon><UiIcon name="Image" :size="16" aria-hidden="true" /></template>
                  {{ uploadPending ? "Uploading…" : "Image" }}
                </Button>
                <Button color="outline" shape="soft" size="small" @click="addDivider">Divider</Button>
                <Button color="outline" shape="soft" size="small" @click="addSpacer">Space</Button>
              </div>

              <div class="button-builder">
                <label class="field"><span>Button label</span><input v-model="buttonDraft.label" maxlength="160" /></label>
                <label class="field"><span>Button link</span><input v-model="buttonDraft.href" type="url" placeholder="https://…" /></label>
                <Button color="outline" shape="soft" size="small" @click="addButtonBlock">Add button</Button>
              </div>

              <ul v-if="extraBlocks.length" class="block-list" aria-label="Additional message blocks">
                <li v-for="block in extraBlocks" :key="block.id">
                  <div class="block-summary">
                    <span><strong>{{ block.type }}</strong> · {{ describeBlock(block) }}</span>
                    <label v-if="block.type === 'image'" class="image-alt">
                      <span>Alternative text</span>
                      <input v-model="block.alt" maxlength="300" placeholder="Describe the image" />
                    </label>
                  </div>
                  <button type="button" :aria-label="`Remove ${block.type}`" @click="removeBlock(block.id)">
                    <UiIcon name="X" :size="16" aria-hidden="true" />
                  </button>
                </li>
              </ul>
            </section>

            <aside class="brand-card">
              <div class="section-label"><span>Site brand</span><small>Snapshot for this campaign</small></div>
              <label class="field"><span>Sender name</span><input v-model="brand.name" maxlength="120" /></label>
              <label class="field"><span>Website</span><input v-model="brand.homeUrl" type="url" /></label>
              <div class="color-grid">
                <label><span>Accent</span><input v-model="brand.accentColor" type="color" /></label>
                <label><span>Background</span><input v-model="brand.backgroundColor" type="color" /></label>
                <label><span>Surface</span><input v-model="brand.surfaceColor" type="color" /></label>
                <label><span>Text</span><input v-model="brand.textColor" type="color" /></label>
              </div>
            </aside>
          </div>

          <nav class="wizard-actions" aria-label="Campaign steps">
            <Button color="ghost" shape="soft" :disabled="saving" @click="saveAndExit">Save and exit</Button>
            <Button color="primary" shape="soft" :disabled="!canReview || saving" @click="continueToReview">Review audience</Button>
          </nav>
        </template>

        <template v-else>
          <section class="review-heading">
            <span class="eyebrow">@{{ campaign.siteUsername }}</span>
            <h1>Review and schedule</h1>
            <p>This is the exact revision and audience you are approving.</p>
          </section>

          <div class="review-grid">
            <section class="review-card">
              <div class="review-row"><span>Subject</span><strong>{{ campaign.revision.subject }}</strong></div>
              <div class="review-row"><span>From</span><strong>{{ review?.transport.sender?.fromAddress || "Sender unavailable" }}</strong></div>
              <div class="review-row"><span>Reply-to</span><strong>{{ campaign.revision.replyToAddress || "No reply-to" }}</strong></div>
              <div class="audience-count">
                <strong>{{ review?.audience.eligibleCount || 0 }}</strong>
                <span>eligible {{ review?.audience.eligibleCount === 1 ? "subscriber" : "subscribers" }}</span>
              </div>
              <details v-if="review?.audience.excludedCount">
                <summary>{{ review.audience.excludedCount }} excluded</summary>
                <ul><li v-for="[reason, count] in excludedReasons" :key="reason">{{ count }} · {{ reason.replace(/_/g, ' ') }}</li></ul>
              </details>

              <div class="test-send">
                <div><strong>Send a test</strong><p>Tests go only to {{ ownerEmail }} and never use the subscriber queue.</p></div>
                <Button color="outline" shape="soft" size="small" :disabled="testing" @click="sendTest">{{ testing ? "Sending…" : "Send test" }}</Button>
              </div>
              <p v-if="testMessage" class="test-message" role="status">{{ testMessage }}</p>

              <fieldset class="send-choice">
                <legend>When should it send?</legend>
                <label><input v-model="sendMode" type="radio" value="now" /> Send now</label>
                <label><input v-model="sendMode" type="radio" value="schedule" /> Schedule</label>
                <label v-if="sendMode === 'schedule'" class="field"><span>Send time</span><input v-model="scheduledLocal" type="datetime-local" /></label>
              </fieldset>
            </section>

            <section class="preview-card" aria-labelledby="preview-title">
              <div class="section-label"><span id="preview-title">Email preview</span><small>Desktop width</small></div>
              <iframe title="Campaign email preview" sandbox="" :srcdoc="campaign.revision.renderedHtml || ''" />
            </section>
          </div>

          <nav class="wizard-actions" aria-label="Campaign steps">
            <Button color="ghost" shape="soft" @click="step = 1">Back to compose</Button>
            <Button color="primary" shape="soft" :disabled="sending || !review?.transport.ready || !review?.audience.eligibleCount" @click="approveSend">
              {{ sending ? "Queuing…" : sendMode === "schedule" ? "Schedule campaign" : "Send campaign" }}
            </Button>
          </nav>
        </template>
      </template>
    </main>
  </div>
</template>

<style scoped>
.campaign-wizard-page { min-height: 100vh; padding: calc(var(--workspace-topbar-height) + 18px) 24px 64px; background: var(--ui-bg, var(--color-bg)); color: var(--ui-text, var(--color-text)); }
.campaign-wizard-shell { width: min(100%, 1080px); margin: 0 auto; }
.wizard-header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; margin-bottom: 34px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; justify-self: start; color: var(--ui-text-muted, var(--color-text-muted)); font-size: .86rem; font-weight: 700; text-decoration: none; }
.step-copy { display: flex; align-items: baseline; gap: 8px; font-size: .8rem; }
.step-copy span { color: var(--ui-text-muted, var(--color-text-muted)); }
.step-dots { display: flex; justify-self: end; gap: 6px; }
.step-dots span { width: 26px; height: 4px; border-radius: 999px; background: var(--ui-border, var(--color-border)); }
.step-dots span.active { background: var(--ui-accent, var(--color-accent)); }
.notice, .availability-card { margin-bottom: 20px; padding: 15px 16px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-md, 12px); background: var(--ui-surface-muted, var(--color-bg-subtle)); }
.notice--error { color: var(--ui-danger, #b42318); }
.availability-card { display: flex; max-width: 680px; gap: 16px; margin: 70px auto; }
.availability-card h1, .availability-card p { margin: 0 0 10px; }
.availability-card p { color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.55; }
.start-card { display: grid; max-width: 640px; gap: 20px; margin: 50px auto; padding: 28px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-lg, 16px); background: var(--ui-surface, var(--color-bg)); box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / .05)); }
.start-card h1, .start-card p { margin: 0; }
.start-card p { margin-top: 8px; color: var(--ui-text-muted, var(--color-text-muted)); line-height: 1.55; }
.eyebrow { color: var(--ui-accent, var(--color-accent)); font-size: .76rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.compose-heading, .review-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.compose-heading h1, .review-heading h1 { margin: 5px 0 0; letter-spacing: -.035em; }
.review-heading { display: block; }
.review-heading p { margin: 5px 0 0; color: var(--ui-text-muted, var(--color-text-muted)); }
.save-state { color: var(--ui-text-muted, var(--color-text-muted)); font-size: .8rem; }
.compose-grid { display: grid; grid-template-columns: minmax(0, 1fr) 270px; align-items: start; gap: 18px; }
.form-card, .brand-card, .review-card, .preview-card { padding: 22px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: var(--ui-radius-lg, 16px); background: var(--ui-surface, var(--color-bg)); box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / .05)); }
.brand-card { display: grid; gap: 15px; position: sticky; top: calc(var(--workspace-topbar-height) + 18px); }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
.field--wide { grid-column: 1 / -1; }
.field { display: grid; gap: 6px; min-width: 0; }
.field > span, .section-label > span, .send-choice legend { font-size: .8rem; font-weight: 750; }
.field small, .section-label small { color: var(--ui-text-muted, var(--color-text-muted)); font-size: .74rem; }
.field input, .field select { width: 100%; min-height: 42px; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: 9px; background: var(--ui-surface, var(--color-bg)); color: var(--ui-text, var(--color-text)); font: inherit; }
.field input:focus, .field select:focus { outline: 2px solid var(--ui-primary, var(--ui-accent)); outline-offset: 1px; }
.section-label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
.block-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.button-builder { display: grid; grid-template-columns: .7fr 1.3fr auto; align-items: end; gap: 10px; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--ui-border, var(--color-border)); }
.block-list { display: grid; gap: 7px; padding: 0; margin: 16px 0 0; list-style: none; }
.block-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 11px; border-radius: 9px; background: var(--ui-surface-muted, var(--color-bg-subtle)); font-size: .8rem; }
.block-summary { display: grid; flex: 1; gap: 8px; }
.image-alt { display: grid; max-width: 420px; gap: 4px; color: var(--ui-text-muted, var(--color-text-muted)); font-size: .72rem; }
.image-alt input { width: 100%; min-height: 36px; box-sizing: border-box; padding: 7px 9px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: 8px; background: var(--ui-surface, var(--color-bg)); color: var(--ui-text, var(--color-text)); font: inherit; }
.image-alt input:focus { outline: 2px solid var(--ui-primary, var(--ui-accent)); outline-offset: 1px; }
.block-list button { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 7px; background: transparent; color: inherit; cursor: pointer; }
.block-list button:hover { background: var(--ui-surface, var(--color-bg)); }
.color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.color-grid label { display: grid; gap: 5px; color: var(--ui-text-muted, var(--color-text-muted)); font-size: .72rem; }
.color-grid input { width: 100%; height: 38px; padding: 3px; border: 1px solid var(--ui-border, var(--color-border)); border-radius: 8px; background: transparent; }
.wizard-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--ui-border, var(--color-border)); }
.review-grid { display: grid; grid-template-columns: 390px minmax(0, 1fr); align-items: start; gap: 18px; }
.review-card { display: grid; gap: 16px; }
.review-row { display: grid; gap: 3px; padding-bottom: 12px; border-bottom: 1px solid var(--ui-border, var(--color-border)); }
.review-row span { color: var(--ui-text-muted, var(--color-text-muted)); font-size: .75rem; }
.review-row strong { overflow-wrap: anywhere; font-size: .9rem; }
.audience-count { display: flex; align-items: baseline; gap: 8px; }
.audience-count strong { font-size: 2rem; letter-spacing: -.04em; }
.audience-count span { color: var(--ui-text-muted, var(--color-text-muted)); }
details summary { cursor: pointer; font-weight: 700; }
details ul { margin-bottom: 0; color: var(--ui-text-muted, var(--color-text-muted)); font-size: .82rem; }
.test-send { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 14px; border-top: 1px solid var(--ui-border, var(--color-border)); }
.test-send p, .test-message { margin: 3px 0 0; color: var(--ui-text-muted, var(--color-text-muted)); font-size: .78rem; line-height: 1.4; }
.send-choice { display: grid; gap: 10px; padding: 16px 0 0; border: 0; border-top: 1px solid var(--ui-border, var(--color-border)); margin: 0; }
.send-choice label { display: flex; align-items: center; gap: 8px; font-size: .86rem; }
.send-choice .field { display: grid; align-items: stretch; }
.preview-card iframe { display: block; width: 100%; min-height: 670px; border: 0; border-radius: 10px; background: #f4f5f4; }
.sr-only { position: absolute; overflow: hidden; width: 1px; height: 1px; padding: 0; border: 0; margin: -1px; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (max-width: 820px) {
  .campaign-wizard-page { padding-inline: 16px; }
  .wizard-header { grid-template-columns: 1fr auto; }
  .step-copy { grid-column: 1 / -1; grid-row: 2; justify-self: center; }
  .compose-grid, .review-grid { grid-template-columns: 1fr; }
  .brand-card { position: static; }
  .button-builder { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .field-grid { grid-template-columns: 1fr; }
  .form-card, .brand-card, .review-card, .preview-card, .start-card { padding: 17px; }
  .wizard-actions { align-items: stretch; flex-direction: column-reverse; }
  .wizard-actions :deep(.me3-btn) { width: 100%; }
  .preview-card iframe { min-height: 520px; }
}
</style>
