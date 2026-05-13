<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { getUsernameAvailability } from "../api";
import Button from "./Button.vue";
import type { OnboardingRequest } from "../stores/sites";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

const props = defineProps<{
  open: boolean;
  defaultUsername: string;
  canImportFromUrl: boolean;
  submitting?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: OnboardingRequest];
}>();

const step = ref<"username" | "profile">("username");
const username = ref("");
const name = ref("");
const role = ref("");
const serviceOffering = ref("");
const publicSourceUrl = ref("");
const websiteMode = ref<"scratch" | "import">("scratch");
const existingWebsiteUrl = ref("");
const localError = ref("");
const isCheckingUsername = ref(false);
const isUsernameAvailable = ref<boolean | null>(null);

const isImportMode = computed(() => websiteMode.value === "import");
let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .slice(0, 30);
}

function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value);
  if (!normalized) return "Username is required";
  if (normalized.length < 3) return "Username must be at least 3 characters";
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Use 3-30 letters, numbers, underscores, or hyphens";
  }
  return null;
}

function resetForm() {
  step.value = "username";
  username.value = props.defaultUsername || "";
  name.value = "";
  role.value = "";
  serviceOffering.value = "";
  publicSourceUrl.value = "";
  websiteMode.value = "scratch";
  existingWebsiteUrl.value = "";
  localError.value = "";
  isCheckingUsername.value = false;
  isUsernameAvailable.value = null;
}

function clearUsernameCheckTimeout() {
  if (usernameCheckTimeout) {
    clearTimeout(usernameCheckTimeout);
    usernameCheckTimeout = null;
  }
}

async function requestUsernameAvailability(value: string): Promise<boolean> {
  try {
    return await getUsernameAvailability(value);
  } catch {
    return true;
  }
}

watch(
  () => [props.open, props.defaultUsername] as const,
  ([open], previous) => {
    const wasOpen = previous?.[0] ?? false;
    if (open && !wasOpen) resetForm();
  },
  { immediate: true },
);

watch(username, (value) => {
  const normalized = normalizeUsername(value);
  if (normalized !== value) {
    username.value = normalized;
    return;
  }

  localError.value = "";
  clearUsernameCheckTimeout();

  if (!props.open) {
    isCheckingUsername.value = false;
    isUsernameAvailable.value = null;
    return;
  }

  const usernameError = validateUsername(normalized);
  if (usernameError) {
    isCheckingUsername.value = false;
    isUsernameAvailable.value = null;
    return;
  }

  isCheckingUsername.value = true;
  isUsernameAvailable.value = null;
  usernameCheckTimeout = setTimeout(async () => {
    const requested = normalized;
    const available = await requestUsernameAvailability(requested);
    if (username.value !== requested) return;
    isUsernameAvailable.value = available;
    isCheckingUsername.value = false;
  }, 400);
});

onBeforeUnmount(() => {
  clearUsernameCheckTimeout();
});

async function goToProfileStep() {
  username.value = normalizeUsername(username.value);
  const usernameError = validateUsername(username.value);
  if (usernameError) {
    localError.value = usernameError;
    return;
  }

  if (isCheckingUsername.value) {
    clearUsernameCheckTimeout();
    isCheckingUsername.value = false;
    isUsernameAvailable.value = await requestUsernameAvailability(
      username.value,
    );
  } else if (isUsernameAvailable.value === null) {
    isUsernameAvailable.value = await requestUsernameAvailability(
      username.value,
    );
  }

  if (isUsernameAvailable.value === false) {
    return;
  }

  localError.value = "";
  step.value = "profile";
}

function handleClose() {
  if (props.submitting) return;
  emit("close");
}

function submit() {
  username.value = normalizeUsername(username.value);
  const usernameError = validateUsername(username.value);
  if (usernameError) {
    localError.value = usernameError;
    step.value = "username";
    return;
  }

  if (!isImportMode.value && !name.value.trim()) {
    localError.value = "Name is required";
    return;
  }

  if (isImportMode.value && !existingWebsiteUrl.value.trim()) {
    localError.value = "Website URL is required to import";
    return;
  }

  localError.value = "";

  emit("submit", {
    username: username.value.trim(),
    name: isImportMode.value ? undefined : name.value.trim(),
    sourceMode: isImportMode.value ? "import" : "scratch",
    role: isImportMode.value ? undefined : role.value.trim() || undefined,
    serviceOffering: isImportMode.value
      ? undefined
      : serviceOffering.value.trim() || undefined,
    socialUrls: isImportMode.value
      ? []
      : [publicSourceUrl.value].map((value) => value.trim()).filter(Boolean),
    existingWebsiteUrl:
      (isImportMode.value
        ? existingWebsiteUrl.value
        : publicSourceUrl.value
      ).trim() || null,
  });
}
</script>

<template>
  <div v-if="open" class="modal-overlay" @click.self="handleClose">
    <div class="modal onboarding-modal">
      <template v-if="step === 'username'">
        <h2>Claim a username</h2>
        <div class="modal-subtitle username-subtitle">
          <template v-if="isCheckingUsername">
            <span class="checking">Checking availability...</span>
          </template>
          <template
            v-else-if="username.length >= 3 && isUsernameAvailable === true"
          >
            <p>
              <span class="available-line">
                <strong>{{ username }}.example.com</strong>
              </span>
              <span class="username-subtitle-follow">
                will be your site URL.
                <strong>{{ username }}@example.com</strong> will be your email
                address.
              </span>
            </p>
          </template>
          <template
            v-else-if="username.length >= 3 && isUsernameAvailable === false"
          >
            <p class="taken-line">
              <strong>{{ username }}@example.com</strong> is already taken.
            </p>
          </template>
          <template v-else-if="username.length > 0 && username.length < 3">
            <p class="username-subtitle-short">
              Username must be at least 3 characters.
            </p>
          </template>
          <template v-else>
            <p>
              This will be your first site's URL:
              <strong>{{ username || "username" }}.example.com</strong>
              and this will be your email address:
              <strong>{{ username || "username" }}@example.com</strong>
            </p>
          </template>
        </div>

        <form
          class="modal-form"
          autocomplete="off"
          @submit.prevent="goToProfileStep"
        >
          <input
            v-model="username"
            type="text"
            placeholder="username"
            pattern="[a-z0-9][a-z0-9_-]*[a-z0-9]"
            minlength="3"
            maxlength="30"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            required
          />
          <p class="hint">
            3-30 characters. Letters, numbers, underscores, and hyphens only.
          </p>

          <div v-if="localError || error" class="error">
            {{ localError || error }}
          </div>

          <div class="modal-actions">
            <Button
              class="modal-action-button"
              variant="outline"
              type="button"
              @click="handleClose"
            >
              Cancel
            </Button>
            <Button
              class="modal-action-button"
              variant="primary"
              type="submit"
              :disabled="isUsernameAvailable === false"
            >
              Continue
            </Button>
          </div>
        </form>
      </template>

      <template v-else>
        <h2>Tell ME3 what to build</h2>
        <p class="modal-subtitle">
          ME3 will publish your site, then you can refine it.
        </p>

        <form class="modal-form" autocomplete="off" @submit.prevent="submit">
          <!-- <div class="onboarding-radio-group">
            <label class="radio-card">
              <input v-model="websiteMode" type="radio" value="scratch" />
              <span>
                <strong>Start from scratch</strong>
                <small>Tell ME3 who you are and what to say.</small>
              </span>
            </label>
            <label class="radio-card" :class="{ disabled: !canImportFromUrl }">
              <input
                v-model="websiteMode"
                type="radio"
                value="import"
                :disabled="!canImportFromUrl"
              />
              <span>
                <strong>
                  {{
                    canImportFromUrl
                      ? "Use existing website"
                      : "Website import requires Pro"
                  }}
                </strong>
                <small v-if="canImportFromUrl">
                  Give ME3 a URL and let it infer the rest.
                </small>
              </span>
            </label>
          </div> -->

          <template v-if="isImportMode">
            <input
              v-model="existingWebsiteUrl"
              type="url"
              placeholder="https://your-site.com"
              required
            />
            <p class="hint">
              ME3 will try to infer your profile, copy, and imagery from this
              site alone.
            </p>
          </template>

          <template v-else>
            <input
              v-model="name"
              type="text"
              placeholder="Your name"
              autocomplete="off"
              name="me3-onboarding-display-name"
              required
            />
            <input
              v-model="role"
              type="text"
              placeholder="What do you do?"
              autocomplete="off"
              name="me3-onboarding-role"
            />
            <textarea
              v-model="serviceOffering"
              rows="4"
              placeholder="What do you help people with?"
              autocomplete="off"
              name="me3-onboarding-offering"
            />
            <!-- <input
              v-model="publicSourceUrl"
              type="url"
              placeholder="Public profile or site URL (optional)"
              autocomplete="off"
            /> -->
            <!-- <p class="hint">
              ME3 will smart-detect supported public sources like Instagram, X,
              or a website. It will use this as source material, but your typed
              fields win.
            </p> -->
          </template>

          <div v-if="localError || error" class="error">
            {{ localError || error }}
          </div>

          <div class="modal-actions">
            <Button
              class="modal-action-button"
              variant="outline"
              type="button"
              @click="step = 'username'"
            >
              Back
            </Button>
            <Button
              class="modal-action-button"
              variant="primary"
              type="submit"
              :disabled="submitting"
            >
              {{ submitting ? "Starting..." : "Confirm" }}
            </Button>
          </div>
        </form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #fff;
}

.modal {
  width: 100%;
  max-width: 560px;
  padding: 32px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.16);
}

.modal h2 {
  margin-bottom: 8px;
  font-size: 24px;
}

.modal-subtitle {
  margin-bottom: 24px;
  color: var(--color-text-muted);
}

.username-subtitle p {
  margin: 0;
  line-height: 1.45;
}

.username-subtitle-follow {
  margin-top: 8px;
  font-size: 14px;
}

.username-subtitle-follow strong {
  color: var(--color-text);
  font-weight: 600;
}

.available-line {
  margin: 0;
  font-size: 15px;
  color: #4caf50;
}

.available-line strong {
  color: inherit;
  font-weight: 600;
}

.taken-line {
  margin: 0;
  font-size: 15px;
  color: #e53935;
}

.taken-line strong {
  color: inherit;
  font-weight: 600;
}

.username-subtitle-short {
  margin: 0;
  font-size: 14px;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-form input,
.modal-form textarea {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.modal-form input:focus,
.modal-form textarea:focus {
  outline: none;
  border-color: var(--color-text);
}

.modal-form textarea {
  min-height: 112px;
  resize: vertical;
}

.hint {
  margin-top: -8px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.checking {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--color-text-muted);
}

.error {
  color: #e53935;
  font-size: 14px;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.modal-action-button {
  flex: 1;
}

.onboarding-radio-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.radio-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
}

.radio-card span {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-card strong {
  font-size: 14px;
  line-height: 1.3;
}

.radio-card small {
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.radio-card.disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.radio-card input {
  width: auto;
  margin-top: 2px;
}

@media (max-width: 720px) {
  .modal {
    padding: 24px;
  }

  .onboarding-radio-group {
    grid-template-columns: 1fr;
  }
}
</style>
