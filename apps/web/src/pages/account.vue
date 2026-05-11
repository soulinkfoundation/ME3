<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  AGENT_LOCALE_OPTIONS,
  getAgentLocaleDisplayLabel,
  inferLocaleFromTimeZone,
} from "../../../../shared/agent-locales";
import { api } from "../api";
import { useAuthStore } from "../stores/auth";
import {
  detectBrowserTimeZone,
  getTimeZoneDisplayLabel,
  isValidTimeZone,
  listSupportedTimeZones,
} from "../utils/timezone";

definePage({
  meta: {
    requiresAuth: true,
    title: "Settings | ME3",
    description: "Manage your local ME3 Core account settings.",
    robots: "noindex,follow",
  },
});

type AccountResponse = {
  user: {
    id: string;
    email: string;
    timezone: string | null;
    locale: string;
    localeSource: "explicit" | "inferred";
  };
};

const auth = useAuthStore();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const timezoneInput = ref("");
const savedTimezoneInput = ref("");
const localeInput = ref("");
const savedLocaleInput = ref("");
const message = ref<string | null>(null);
const error = ref<string | null>(null);
const showDeleteModal = ref(false);
const deleteConfirmInput = ref("");
const deleteLoading = ref(false);
const deleteError = ref<string | null>(null);
const supportedTimeZones = listSupportedTimeZones();

const effectiveLocaleValue = computed(
  () => localeInput.value || inferLocaleFromTimeZone(timezoneInput.value),
);

const effectiveLocaleLabel = computed(() =>
  getAgentLocaleDisplayLabel(effectiveLocaleValue.value),
);

const localeOptions = computed(() => {
  const currentValue = localeInput.value || auth.user?.locale || "";
  if (
    !currentValue ||
    AGENT_LOCALE_OPTIONS.some((option) => option.value === currentValue)
  ) {
    return AGENT_LOCALE_OPTIONS;
  }
  return [
    ...AGENT_LOCALE_OPTIONS,
    {
      value: currentValue,
      label: getAgentLocaleDisplayLabel(currentValue),
    },
  ];
});

const timezoneDisplay = computed(() => {
  const value = timezoneInput.value || auth.user?.timezone || "";
  if (!value || !isValidTimeZone(value)) return "UTC";
  return getTimeZoneDisplayLabel(value);
});

const saveDisabled = computed(
  () =>
    saving.value ||
    !timezoneInput.value ||
    !isValidTimeZone(timezoneInput.value) ||
    (timezoneInput.value === savedTimezoneInput.value &&
      localeInput.value === savedLocaleInput.value),
);

function syncAccount(response: AccountResponse) {
  auth.setSession(response.user);
  timezoneInput.value = response.user.timezone || "";
  savedTimezoneInput.value = timezoneInput.value;
  localeInput.value =
    response.user.localeSource === "explicit" ? response.user.locale : "";
  savedLocaleInput.value = localeInput.value;
}

async function loadAccount() {
  loading.value = true;
  error.value = null;
  try {
    const response = await api.get<AccountResponse>("/account");
    syncAccount(response);
  } catch (e: any) {
    error.value = e.message || "Failed to load settings";
  } finally {
    loading.value = false;
  }
}

function detectTimezoneValue() {
  const detected = detectBrowserTimeZone();
  if (!detected || !isValidTimeZone(detected)) {
    error.value = "Could not detect a valid browser timezone.";
    return;
  }
  timezoneInput.value = detected;
  message.value = null;
  error.value = null;
}

async function saveSettings() {
  if (saveDisabled.value) return;
  saving.value = true;
  message.value = null;
  error.value = null;
  try {
    const response = await api.put<AccountResponse>("/account", {
      timezone: timezoneInput.value,
      locale: localeInput.value || null,
    });
    syncAccount(response);
    message.value = "Settings saved.";
  } catch (e: any) {
    error.value = e.message || "Failed to save settings";
  } finally {
    saving.value = false;
  }
}

async function logout() {
  await auth.logout();
  router.push("/");
}

function openDeleteModal() {
  deleteConfirmInput.value = "";
  deleteError.value = null;
  showDeleteModal.value = true;
}

function closeDeleteModal() {
  if (deleteLoading.value) return;
  showDeleteModal.value = false;
}

async function deleteAccount() {
  if (deleteLoading.value) return;
  if (deleteConfirmInput.value.trim() !== "DELETE") {
    deleteError.value = 'Type "DELETE" to confirm.';
    return;
  }
  deleteLoading.value = true;
  deleteError.value = null;
  try {
    await api.post("/account/delete", {});
    await auth.logout();
    router.push("/");
  } catch (e: any) {
    deleteError.value = e.message || "Failed to delete account.";
  } finally {
    deleteLoading.value = false;
  }
}

onMounted(async () => {
  await loadAccount();
});
</script>

<template>
  <main class="settings-page">
    <section class="settings-shell">
      <header class="settings-header">
        <div>
          <h1>Settings</h1>
          <p>
            Configure this ME3 Core install. Hosted billing, managed mailbox,
            and plugin-specific connectors are intentionally absent from the
            base app.
          </p>
        </div>
        <button class="button secondary" type="button" @click="logout">
          Sign out
        </button>
      </header>

      <div v-if="loading" class="state-row">Loading settings...</div>

      <template v-else>
        <section class="settings-panel" aria-labelledby="account-heading">
          <div class="panel-heading">
            <h2 id="account-heading">Account</h2>
            <p>Your local admin identity for this Core installation.</p>
          </div>
          <div class="field-grid">
            <label>
              <span>Email</span>
              <input
                class="input"
                type="email"
                :value="auth.user?.email || ''"
                readonly
              />
            </label>
            <label>
              <span>User ID</span>
              <input
                class="input"
                type="text"
                :value="auth.user?.id || ''"
                readonly
              />
            </label>
          </div>
        </section>

        <section class="settings-panel" aria-labelledby="regional-heading">
          <div class="panel-heading">
            <h2 id="regional-heading">Regional Settings</h2>
            <p>Used by calendar, email, assistant replies, and local dates.</p>
          </div>

          <div class="field-grid">
            <label>
              <span>Timezone</span>
              <input
                v-model="timezoneInput"
                class="input"
                type="text"
                list="account-timezone-options"
                placeholder="Europe/Dublin"
              />
              <datalist id="account-timezone-options">
                <option
                  v-for="zone in supportedTimeZones"
                  :key="zone"
                  :value="zone"
                />
              </datalist>
            </label>

            <label>
              <span>Assistant locale</span>
              <select v-model="localeInput" class="input">
                <option value="">
                  Use timezone default ({{ effectiveLocaleLabel }})
                </option>
                <option
                  v-for="option in localeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="summary-row">
            <span>{{ timezoneDisplay }}</span>
            <span>{{ effectiveLocaleLabel }}</span>
          </div>

          <div class="actions">
            <button class="button secondary" type="button" @click="detectTimezoneValue">
              Detect timezone
            </button>
            <button
              class="button primary"
              type="button"
              :disabled="saveDisabled"
              @click="saveSettings"
            >
              {{ saving ? "Saving..." : "Save settings" }}
            </button>
          </div>
        </section>

        <section class="settings-panel" aria-labelledby="install-heading">
          <div class="panel-heading">
            <h2 id="install-heading">Install Surface</h2>
            <p>
              Calendar, email, sites, assistant, and settings are part of the
              first Core slice. Payments, hosted mailbox automation, social
              publishing, and third-party app connectors belong in later plugin
              or hosted layers.
            </p>
          </div>
        </section>

        <section class="settings-panel danger" aria-labelledby="danger-heading">
          <div class="panel-heading">
            <h2 id="danger-heading">Danger Zone</h2>
            <p>Delete the local account and its sites from this install.</p>
          </div>
          <button class="button danger" type="button" @click="openDeleteModal">
            Delete account
          </button>
        </section>

        <p v-if="message" class="success">{{ message }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </template>
    </section>

    <div
      v-if="showDeleteModal"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDeleteModal"
    >
      <section
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
      >
        <header class="modal-header">
          <h2 id="delete-account-title">Delete account</h2>
          <button
            class="modal-close"
            type="button"
            aria-label="Close"
            :disabled="deleteLoading"
            @click="closeDeleteModal"
          >
            ×
          </button>
        </header>
        <p>
          This permanently deletes the account and associated site data in this
          Core install.
        </p>
        <label class="delete-confirm">
          <span>Type DELETE to confirm</span>
          <input
            v-model="deleteConfirmInput"
            class="input"
            type="text"
            :disabled="deleteLoading"
          />
        </label>
        <div class="actions">
          <button
            class="button secondary"
            type="button"
            :disabled="deleteLoading"
            @click="closeDeleteModal"
          >
            Cancel
          </button>
          <button
            class="button danger"
            type="button"
            :disabled="deleteLoading || deleteConfirmInput.trim() !== 'DELETE'"
            @click="deleteAccount"
          >
            {{ deleteLoading ? "Deleting..." : "Delete account" }}
          </button>
        </div>
        <p v-if="deleteError" class="error">{{ deleteError }}</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  padding: 32px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.settings-shell {
  display: grid;
  gap: 16px;
  max-width: 880px;
  margin: 0 auto;
}

.settings-header,
.settings-panel {
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 12px);
  background: var(--ui-surface, var(--color-card));
}

.settings-header {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px;
}

.settings-header h1,
.settings-header p,
.panel-heading h2,
.panel-heading p {
  margin: 0;
}

.settings-header h1 {
  font-size: 32px;
  line-height: 1.1;
}

.settings-header p,
.panel-heading p {
  max-width: 640px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 14px;
  line-height: 1.55;
}

.settings-panel {
  display: grid;
  gap: 18px;
  padding: 22px;
}

.settings-panel.danger {
  border-color: rgba(220, 38, 38, 0.35);
}

.panel-heading {
  display: grid;
  gap: 6px;
}

.panel-heading h2 {
  font-size: 18px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

label {
  display: grid;
  gap: 8px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  font-weight: 700;
}

.input {
  min-height: 42px;
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  box-sizing: border-box;
}

.input[readonly] {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.summary-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-row span {
  padding: 6px 10px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 700;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.button.primary {
  border-color: var(--ui-accent, #22c55e);
  background: var(--ui-accent, #22c55e);
  color: var(--ui-accent-contrast, #04110a);
}

.button.secondary {
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.button.danger {
  border-color: #dc2626;
  background: #dc2626;
  color: #fff;
}

.state-row,
.success,
.error {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 14px;
}

.success {
  color: #15803d;
}

.error {
  color: #dc2626;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5);
}

.modal {
  display: grid;
  gap: 16px;
  width: min(480px, 100%);
  padding: 22px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 12px);
  background: var(--ui-surface, var(--color-card));
}

.modal p,
.modal h2 {
  margin: 0;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  cursor: pointer;
}

@media (max-width: 720px) {
  .settings-page {
    padding: 20px;
  }

  .settings-header,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .settings-header {
    flex-direction: column;
  }
}
</style>
