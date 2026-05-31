<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { RouterLink, useRouter } from "vue-router";
import { api, getUsernameAvailability } from "../api";
import TelegramConnectPanel from "../components/TelegramConnectPanel.vue";
import { usePublish } from "../composables/usePublish";
import { useAuthStore } from "../stores/auth";
import { useSitesStore } from "../stores/sites";
import { useWizardStore } from "../stores/wizard";
import { DEFAULT_APP_PATH } from "../utils/navigation";

definePage({
  meta: {
    requiresAuth: true,
    title: "Start | ME3",
    description: "Set up the essentials for your ME3 profile.",
    robots: "noindex,follow",
  },
});

type EmailProviderId = "cloudflare-email" | "smtp" | "mailgun" | "postmark";

type MailboxRecord = {
  aliasLocalPart: string;
  aliasAddress?: string;
  status: "pending_setup" | "active" | "paused";
  forwardingEnabled: boolean;
  forwardingEmail: string;
};

type MailboxResponse = {
  available: boolean;
  mailbox: MailboxRecord | null;
  suggestedAliasLocalPart: string;
};

type EmailProviderSettingsResponse = {
  encryptionConfigured: boolean;
  activeProviderId: EmailProviderId;
  providers: Array<{ id: EmailProviderId }>;
};

const STEPS = ["Profile", "Email", "Telegram"] as const;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

const router = useRouter();
const auth = useAuthStore();
const sites = useSitesStore();
const wizard = useWizardStore();
const { isPublishing, publishProgress, publishError, publish } = usePublish();

const currentStep = ref(1);
const furthestStep = ref(1);
const name = ref(wizard.profile.name || auth.user?.name || "");
const handle = ref(wizard.profile.handle || wizard.username || auth.user?.username || "");
const domain = ref("");
const emailAddress = ref("");
const isCheckingUsername = ref(false);
const isUsernameAvailable = ref<boolean | null>(null);
const usernameMessage = ref("");
const profileError = ref("");
const emailLoading = ref(false);
const emailSaving = ref(false);
const emailMessage = ref("");
const emailError = ref("");
const mailboxAvailable = ref(true);
const telegramPanelRef = ref<InstanceType<typeof TelegramConnectPanel> | null>(
  null,
);

let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

const currentStepName = computed(() => STEPS[currentStep.value - 1]);
const progress = computed(() => ((currentStep.value - 1) / (STEPS.length - 1)) * 100);
const normalizedHandle = computed(() => normalizeUsername(handle.value));
const normalizedDomain = computed(() => normalizeEmailDomain(domain.value));
const normalizedEmail = computed(() => emailAddress.value.trim().toLowerCase());
const emailLocalPart = computed(() => normalizeMailboxAlias(normalizedEmail.value.split("@")[0] || ""));
const emailDomain = computed(() => normalizeEmailDomain(normalizedEmail.value.split("@")[1] || ""));
const profileSiteUsername = computed(
  () => wizard.username || wizard.profile.handle || normalizedHandle.value,
);
const finishDestination = computed(() =>
  profileSiteUsername.value ? `/sites/${encodeURIComponent(profileSiteUsername.value)}` : DEFAULT_APP_PATH,
);

const profileCanContinue = computed(
  () =>
    name.value.trim().length >= 2 &&
    normalizedHandle.value.length >= 3 &&
    USERNAME_PATTERN.test(normalizedHandle.value) &&
    isUsernameAvailable.value === true &&
    !isCheckingUsername.value &&
    !isPublishing.value,
);

const emailAddressIsValid = computed(
  () =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail.value) &&
    emailLocalPart.value === normalizedEmail.value.split("@")[0] &&
    Boolean(emailDomain.value),
);

const emailCanSave = computed(
  () =>
    !emailSaving.value &&
    !emailLoading.value &&
    mailboxAvailable.value &&
    Boolean(normalizedDomain.value) &&
    emailAddressIsValid.value &&
    emailDomain.value === normalizedDomain.value,
);

const progressSteps = computed(() =>
  STEPS.map((stepName, index) => {
    const number = index + 1;
    const isCurrent = currentStep.value === number;
    const isVisited = number <= furthestStep.value;
    return {
      name: stepName,
      number,
      isCurrent,
      isVisited,
      isJumpable: isVisited && !isCurrent,
      ariaLabel: isCurrent
        ? `Current step: ${stepName}`
        : isVisited
          ? `Go to ${stepName}`
          : `${stepName} is locked until you complete the earlier steps`,
    };
  }),
);

function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .slice(0, 30);
}

function normalizeMailboxAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function normalizeEmailDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^[.-]+|[.-]+$/g, "");
}

function inferDomainFromHost(hostname: string): string {
  const inferred = normalizeEmailDomain(hostname);
  if (!inferred || inferred === "localhost" || inferred.endsWith(".workers.dev")) {
    return "";
  }
  const parts = inferred.split(".");
  return parts.length > 2 && ["api", "me3", "www"].includes(parts[0])
    ? parts.slice(1).join(".")
    : inferred;
}

function clearUsernameCheck() {
  if (usernameCheckTimeout) {
    clearTimeout(usernameCheckTimeout);
    usernameCheckTimeout = null;
  }
}

function goToStep(step: number) {
  if (step < 1 || step > STEPS.length || step > furthestStep.value) return;
  currentStep.value = step;
}

function advanceTo(step: number) {
  currentStep.value = step;
  furthestStep.value = Math.max(furthestStep.value, step);
}

async function publishProfile() {
  if (!profileCanContinue.value) return;

  profileError.value = "";
  const nextName = name.value.trim();
  const nextHandle = normalizedHandle.value;

  wizard.reset();
  wizard.username = nextHandle;
  wizard.isUsernameAvailable = true;
  wizard.updateProfile({ name: nextName, handle: nextHandle });

  const success = await publish({ celebrate: false, openSite: false });
  if (!success) {
    profileError.value = publishError.value || "Could not publish your initial profile.";
    return;
  }

  await sites.fetchSites();
  if (!emailAddress.value && normalizedDomain.value) {
    emailAddress.value = `${nextHandle}@${normalizedDomain.value}`;
  }
  advanceTo(2);
}

async function loadEmailDefaults() {
  emailLoading.value = true;
  emailError.value = "";
  try {
    const response = await api.get<MailboxResponse>("/mailbox");
    mailboxAvailable.value = response.available;
    const alias =
      response.mailbox?.aliasLocalPart ||
      response.suggestedAliasLocalPart ||
      normalizedHandle.value;
    const inferredDomain =
      normalizeEmailDomain(response.mailbox?.aliasAddress?.split("@")[1] || "") ||
      inferDomainFromHost(window.location.hostname);
    if (!domain.value && inferredDomain) domain.value = inferredDomain;
    if (!emailAddress.value && alias && (normalizedDomain.value || inferredDomain)) {
      emailAddress.value = `${alias}@${normalizedDomain.value || inferredDomain}`;
    }
  } catch (error) {
    emailError.value =
      error instanceof Error ? error.message : "Could not load email setup.";
  } finally {
    emailLoading.value = false;
  }
}

async function saveEmail() {
  if (!emailCanSave.value) return;

  emailSaving.value = true;
  emailMessage.value = "";
  emailError.value = "";

  try {
    const mailboxResponse = await api.put<{
      mailbox: MailboxRecord | null;
    }>("/mailbox", {
      aliasLocalPart: emailLocalPart.value,
      forwardingEnabled: false,
      forwardingEmail: "",
    });

    if (mailboxResponse.mailbox?.status !== "active") {
      await api.post<{ mailbox: MailboxRecord | null }>("/mailbox/activate", {});
    }

    await api.put<EmailProviderSettingsResponse>("/email-provider-settings", {
      activeProviderId: "cloudflare-email",
      providers: [
        {
          id: "cloudflare-email",
          transport: "binding",
          fromAddress: normalizedEmail.value,
          fromName:
            auth.user?.name?.trim() && auth.user.name !== "ME3 Core Owner"
              ? auth.user.name.trim()
              : name.value.trim(),
          replyToAddress: normalizedEmail.value,
          sendingDomain: normalizedDomain.value,
          accountId: "",
          messageStream: "",
          smtpHost: "",
          smtpPort: "",
          smtpSecurity: "none",
          smtpUsername: "",
          mailgunRegion: "us",
        },
      ],
    });

    emailMessage.value = "Email saved.";
    advanceTo(3);
  } catch (error) {
    emailError.value =
      error instanceof Error ? error.message : "Could not save email setup.";
  } finally {
    emailSaving.value = false;
  }
}

function skipEmail() {
  emailError.value = "";
  emailMessage.value = "";
  advanceTo(3);
}

async function finish() {
  await router.push(finishDestination.value);
}

watch(handle, (value) => {
  const cleaned = normalizeUsername(value);
  if (cleaned !== value) {
    handle.value = cleaned;
    return;
  }

  usernameMessage.value = "";
  isUsernameAvailable.value = null;
  clearUsernameCheck();

  if (cleaned.length === 0) return;
  if (cleaned.length < 3 || !USERNAME_PATTERN.test(cleaned)) {
    usernameMessage.value =
      cleaned.length < 3
        ? "Handle must be at least 3 characters."
        : "Use letters, numbers, underscores, or hyphens.";
    return;
  }

  isCheckingUsername.value = true;
  usernameCheckTimeout = setTimeout(async () => {
    try {
      isUsernameAvailable.value = await getUsernameAvailability(cleaned);
    } catch {
      isUsernameAvailable.value = true;
    } finally {
      isCheckingUsername.value = false;
    }
  }, 400);
});

watch(domain, (value) => {
  const cleaned = normalizeEmailDomain(value);
  if (cleaned !== value) {
    domain.value = cleaned;
    return;
  }
  if (!emailAddress.value && cleaned && normalizedHandle.value) {
    emailAddress.value = `${normalizedHandle.value}@${cleaned}`;
  }
});

watch(currentStep, (step) => {
  if (step === 2 && !emailLoading.value && !emailAddress.value) {
    void loadEmailDefaults();
  }
});

onMounted(() => {
  const inferred = inferDomainFromHost(window.location.hostname);
  if (inferred) domain.value = inferred;
  if (handle.value) {
    const currentHandle = handle.value;
    handle.value = "";
    handle.value = currentHandle;
  }
});

onBeforeUnmount(clearUsernameCheck);
</script>

<template>
  <div class="start-page">
    <header class="wizard-header">
      <div class="header-center">
        <div class="step-indicator">
          <span class="step-current">{{ currentStep }}</span>
          <span class="step-divider">/</span>
          <span class="step-total">{{ STEPS.length }}</span>
          <span class="step-name">{{ currentStepName }}</span>
        </div>
      </div>

      <div class="header-right">
        <button class="exit-btn" type="button" @click="finish">Exit</button>
      </div>
    </header>

    <div class="progress-bar" role="navigation" aria-label="Setup progress">
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="{ width: `${progress}%` }" />
      </div>
      <div class="progress-steps">
        <button
          v-for="step in progressSteps"
          :key="step.name"
          type="button"
          class="progress-step"
          :class="{
            'is-current': step.isCurrent,
            'is-visited': step.isVisited,
            'is-jumpable': step.isJumpable,
          }"
          :data-step-name="step.name"
          :aria-label="step.ariaLabel"
          :aria-current="step.isCurrent ? 'step' : undefined"
          :aria-disabled="step.isVisited ? undefined : 'true'"
          :tabindex="step.isVisited ? undefined : -1"
          @click="goToStep(step.number)"
        >
          <span class="progress-step-dot" aria-hidden="true">
            <span v-if="step.isCurrent" class="progress-step-core" />
            <span v-else-if="step.isVisited" class="progress-step-check">✓</span>
          </span>
          <span class="progress-step-tooltip" aria-hidden="true">
            {{ step.name }}
          </span>
        </button>
      </div>
    </div>

    <main class="start-main">
      <section v-if="currentStep === 1" class="start-step" aria-labelledby="profile-title">
        <div class="step-copy">
          <h1 id="profile-title">Create your ME3 profile</h1>
          <p>
            Start with the two fields ME3 needs to publish your first
            <code>me.json</code>. You can add the full site details later.
          </p>
        </div>

        <form class="start-form" autocomplete="off" @submit.prevent="publishProfile">
          <label class="field" for="start-name">
            <span>Your name *</span>
            <input
              id="start-name"
              v-model="name"
              type="text"
              maxlength="100"
              placeholder="e.g. Alex Smith"
              autofocus
              required
            />
          </label>

          <label class="field" for="start-handle">
            <span>Username (@handle) *</span>
            <div class="handle-input">
              <span class="handle-prefix">@</span>
              <input
                id="start-handle"
                v-model="handle"
                type="text"
                maxlength="30"
                placeholder="alex"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                required
              />
            </div>
          </label>

          <p v-if="isCheckingUsername" class="field-hint">Checking availability...</p>
          <p
            v-else-if="normalizedHandle.length >= 3 && isUsernameAvailable === true"
            class="success"
          >
            {{ normalizedHandle }} is available.
          </p>
          <p
            v-else-if="normalizedHandle.length >= 3 && isUsernameAvailable === false"
            class="error"
          >
            This handle is already taken.
          </p>
          <p v-else-if="usernameMessage" class="field-hint">{{ usernameMessage }}</p>

          <p v-if="publishProgress" class="field-hint">{{ publishProgress }}</p>
          <p v-if="profileError || publishError" class="error">
            {{ profileError || publishError }}
          </p>

          <div class="step-nav">
            <button class="nav-btn next" type="submit" :disabled="!profileCanContinue">
              {{ isPublishing ? "Publishing..." : "Continue" }}
            </button>
          </div>
        </form>
      </section>

      <section v-else-if="currentStep === 2" class="start-step" aria-labelledby="email-title">
        <div class="step-copy">
          <h1 id="email-title">Set up email</h1>
          <p>
            ME3 uses Cloudflare Email Routing and Cloudflare Email Service by
            default. Custom senders such as Postmark or Mailgun can be added in
            <RouterLink to="/account?section=mailbox">Account settings</RouterLink>
            later.
          </p>
        </div>

        <form class="start-form" autocomplete="off" @submit.prevent="saveEmail">
          <label class="field" for="start-domain">
            <span>Domain</span>
            <input
              id="start-domain"
              v-model="domain"
              type="text"
              placeholder="your-domain.com"
              spellcheck="false"
            />
          </label>

          <label class="field" for="start-email">
            <span>Email address</span>
            <input
              id="start-email"
              v-model="emailAddress"
              type="email"
              placeholder="you@your-domain.com"
              autocomplete="email"
              spellcheck="false"
            />
            <span class="field-hint">
              This address receives routed mail and sends with Cloudflare by default.
            </span>
          </label>

          <p v-if="emailLoading" class="field-hint">Loading email setup...</p>
          <p v-if="normalizedEmail && emailAddressIsValid && emailDomain !== normalizedDomain" class="error">
            The email address must use the domain above.
          </p>
          <p v-if="!mailboxAvailable" class="error">
            Mailbox setup is not available in this Core install yet.
          </p>
          <p v-if="emailMessage" class="success">{{ emailMessage }}</p>
          <p v-if="emailError" class="error">{{ emailError }}</p>

          <div class="step-nav split">
            <button class="nav-btn back" type="button" @click="goToStep(1)">
              Back
            </button>
            <div class="nav-actions-right">
              <button class="nav-btn ghost" type="button" @click="skipEmail">
                Skip for now
              </button>
              <button class="nav-btn next" type="submit" :disabled="!emailCanSave">
                {{ emailSaving ? "Saving..." : "Save email" }}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section v-else class="start-step" aria-labelledby="telegram-title">
        <div class="step-copy">
          <h1 id="telegram-title">Connect Telegram</h1>
          <p>
            Telegram lets you chat with your ME3 agent from your phone. You can
            finish this now or return from
            <RouterLink to="/account?section=telegram">Account settings</RouterLink>.
          </p>
        </div>

        <div class="telegram-panel-wrap">
          <TelegramConnectPanel
            ref="telegramPanelRef"
            variant="default"
            :auto-prepare-when-not-connected="true"
          />
        </div>

        <div class="step-nav split">
          <button class="nav-btn back" type="button" @click="goToStep(2)">
            Back
          </button>
          <div class="nav-actions-right">
            <button class="nav-btn ghost" type="button" @click="finish">
              Skip for now
            </button>
            <button class="nav-btn next" type="button" @click="finish">
              Finish
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.start-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.wizard-header {
  display: grid;
  grid-template-columns: 1fr minmax(0, auto) 1fr;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 16px 24px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
}

.header-center {
  grid-column: 2;
  justify-self: center;
}

.header-right {
  grid-column: 3;
  justify-self: end;
}

.step-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.step-current {
  font-weight: 700;
}

.step-divider,
.step-total,
.step-name {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.step-name {
  margin-left: 8px;
}

.exit-btn {
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-surface-muted, var(--color-border));
  color: var(--ui-text, var(--color-text));
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.exit-btn:hover {
  background: var(--ui-text-muted, var(--color-text-muted));
  color: var(--ui-bg, var(--color-bg));
}

.progress-bar {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 24px 6px;
}

.progress-track {
  position: absolute;
  left: 40px;
  right: 40px;
  top: 31px;
  height: 3px;
  background: var(--ui-border, var(--color-border));
  border-radius: 999px;
}

.progress-fill {
  height: 100%;
  background: var(--ui-text, var(--color-text));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.progress-steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
}

.progress-step {
  position: relative;
  min-height: 44px;
  padding: 8px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 0;
  background: none;
  color: var(--ui-text-muted, var(--color-text-muted));
  cursor: default;
}

.progress-step.is-jumpable {
  cursor: pointer;
}

.progress-step-dot {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 2px solid currentColor;
  background: var(--ui-bg, var(--color-bg));
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.progress-step.is-visited .progress-step-dot {
  color: var(--ui-text, var(--color-text));
}

.progress-step.is-visited:not(.is-current) .progress-step-dot {
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
  border-color: var(--ui-text, var(--color-text));
}

.progress-step.is-current .progress-step-dot {
  width: 22px;
  height: 22px;
  border-color: var(--ui-text, var(--color-text));
  color: var(--ui-text, var(--color-text));
  box-shadow: 0 0 0 4px var(--ui-border, var(--color-border));
}

.progress-step.is-jumpable:hover .progress-step-dot {
  transform: translateY(-1px);
}

.progress-step:focus-visible {
  outline: none;
}

.progress-step:focus-visible .progress-step-dot {
  box-shadow: 0 0 0 4px var(--ui-accent-soft, var(--color-border));
}

.progress-step-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translate(-50%, 8px);
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  z-index: 2;
}

.progress-step-tooltip::after {
  content: "";
  position: absolute;
  left: 50%;
  top: calc(100% - 2px);
  width: 8px;
  height: 8px;
  background: var(--ui-text, var(--color-text));
  transform: translateX(-50%) rotate(45deg);
}

.progress-step:hover .progress-step-tooltip,
.progress-step:focus-visible .progress-step-tooltip {
  opacity: 1;
  transform: translate(-50%, 0);
}

.progress-step-core {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
}

.progress-step-check {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.start-main {
  flex: 1;
  width: min(100%, 760px);
  box-sizing: border-box;
  margin: 0 auto;
  padding: 56px 24px 48px;
}

.start-step {
  display: grid;
  gap: 28px;
}

.step-copy {
  display: grid;
  gap: 12px;
}

.step-copy h1 {
  margin: 0;
  font-size: clamp(32px, 5vw, 48px);
  line-height: 1;
  letter-spacing: 0;
}

.step-copy p {
  max-width: 620px;
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 16px;
  line-height: 1.55;
}

.step-copy a {
  color: var(--ui-text, var(--color-text));
  font-weight: 700;
  text-underline-offset: 3px;
}

.start-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
}

.field input,
.handle-input {
  width: 100%;
  min-height: 52px;
  box-sizing: border-box;
  border: 2px solid var(--ui-border-strong, var(--color-text));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 16px;
  font-weight: 500;
}

.field input {
  padding: 12px 14px;
}

.field input:focus,
.handle-input:focus-within {
  outline: 2px solid var(--ui-accent-soft, rgba(20, 184, 166, 0.28));
  outline-offset: 2px;
  border-color: var(--ui-accent, var(--color-text));
}

.handle-input {
  display: flex;
  align-items: center;
  overflow: hidden;
}

.handle-prefix {
  padding-left: 14px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 16px;
  font-weight: 700;
}

.handle-input input {
  min-height: 48px;
  border: 0;
  border-radius: 0;
  background: transparent;
  outline: none;
  padding-left: 4px;
}

.field-hint,
.success,
.error {
  margin: -6px 0 0;
  font-size: 13px;
  line-height: 1.45;
}

.field-hint {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.success {
  color: var(--ui-accent-strong, #0f766e);
  font-weight: 700;
}

.error {
  color: var(--color-error, #c62828);
  font-weight: 700;
}

.step-nav {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 18px;
}

.step-nav.split {
  justify-content: space-between;
}

.nav-actions-right {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.nav-btn {
  min-height: 48px;
  padding: 0 22px;
  border: 0;
  border-radius: var(--ui-radius-md, 10px);
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease,
    background-color 0.2s ease;
}

.nav-btn.next {
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
}

.nav-btn.back,
.nav-btn.ghost {
  background: var(--ui-surface-muted, var(--color-border));
  color: var(--ui-text, var(--color-text));
}

.nav-btn.ghost {
  background: transparent;
  border: 1px solid var(--ui-border, var(--color-border));
}

.nav-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  opacity: 0.92;
}

.nav-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.telegram-panel-wrap {
  padding: 18px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
}

@media (max-width: 640px) {
  .wizard-header {
    padding: 14px 16px;
  }

  .step-name {
    display: none;
  }

  .progress-bar {
    padding: 8px 14px 4px;
  }

  .progress-track {
    left: 26px;
    right: 26px;
    top: 27px;
  }

  .start-main {
    padding: 36px 18px 40px;
  }

  .step-nav,
  .step-nav.split,
  .nav-actions-right {
    display: grid;
    grid-template-columns: 1fr;
  }

  .nav-btn {
    width: 100%;
  }
}
</style>
