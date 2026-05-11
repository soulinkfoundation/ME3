<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onMounted, ref } from "vue";
import { api } from "../api";

definePage({
  meta: {
    requiresAuth: true,
    title: "Social Publishing | ME3",
    description: "Review the installed Social Publishing plugin runtime.",
    robots: "noindex,follow",
  },
});

type SocialAccount = {
  id: string;
  platform: string;
  platformAccountId: string;
  handle: string | null;
  displayName: string | null;
  status: string;
};

type SocialRuntimeStatus = {
  status: "available" | "installed" | "setup_required" | "disabled";
  ready: boolean;
  statusLabel: string;
};

type SocialProviderSetting = {
  providerId: string;
  label: string;
  clientId: string;
  configured: boolean;
  enabled: boolean;
  secretHint: string | null;
  secretUpdatedAt: string | null;
  callbackPath: string;
};

type SiteRecord = {
  id: string;
  username: string;
  site_type?: string;
};

type ProviderInput = {
  clientId: string;
  clientSecret: string;
  enabled: boolean;
};

const loading = ref(false);
const error = ref<string | null>(null);
const message = ref<string | null>(null);
const plugin = ref<SocialRuntimeStatus | null>(null);
const accounts = ref<SocialAccount[]>([]);
const providers = ref<SocialProviderSetting[]>([]);
const sites = ref<SiteRecord[]>([]);
const providerInputs = ref<Record<string, ProviderInput>>({});
const providerAction = ref<string | null>(null);

const statusClass = computed(() => plugin.value?.status || "available");
const defaultSiteId = computed(
  () =>
    sites.value.find((site) => (site.site_type || "profile") === "profile")?.id ||
    sites.value[0]?.id ||
    "",
);

function platformLabel(platform: string) {
  switch (platform) {
    case "x":
      return "X";
    case "linkedin":
      return "LinkedIn";
    case "instagram":
      return "Instagram";
    case "instagram_business":
      return "Instagram Business";
    default:
      return platform;
  }
}

async function loadSocialPublishing() {
  loading.value = true;
  error.value = null;

  try {
    const response = await api.get<{
      plugin: SocialRuntimeStatus;
      accounts: SocialAccount[];
    }>("/social/accounts");
    plugin.value = response.plugin;
    accounts.value = response.accounts || [];
    await loadSites();
    await loadProviderSettings();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "Failed to load Social Publishing";
    try {
      const statusResponse = await api.get<{ plugin: SocialRuntimeStatus }>(
        "/social/status",
      );
      plugin.value = statusResponse.plugin;
    } catch {
      plugin.value = null;
    }
  } finally {
    loading.value = false;
  }
}

async function loadSites() {
  const response = await api.get<{ sites: SiteRecord[] }>("/sites");
  sites.value = response.sites || [];
}

async function loadProviderSettings() {
  const response = await api.get<{ providers: SocialProviderSetting[] }>(
    "/social/provider-settings",
  );
  providers.value = response.providers || [];
  const nextInputs: Record<string, ProviderInput> = {};
  for (const provider of providers.value) {
    nextInputs[provider.providerId] = {
      clientId: provider.clientId,
      clientSecret: "",
      enabled: provider.enabled,
    };
  }
  providerInputs.value = nextInputs;
}

async function saveProvider(provider: SocialProviderSetting) {
  const input = providerInputs.value[provider.providerId];
  if (!input) return;
  providerAction.value = `save:${provider.providerId}`;
  error.value = null;
  message.value = null;

  try {
    const response = await api.put<{ providers: SocialProviderSetting[] }>(
      "/social/provider-settings",
      {
        providers: [
          {
            id: provider.providerId,
            clientId: input.clientId,
            clientSecret: input.clientSecret || undefined,
            enabled: input.enabled,
          },
        ],
      },
    );
    providers.value = response.providers || [];
    await loadProviderSettings();
    message.value = `${provider.label} saved.`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to save provider";
  } finally {
    providerAction.value = null;
  }
}

async function connectProvider(provider: SocialProviderSetting) {
  providerAction.value = `connect:${provider.providerId}`;
  error.value = null;
  message.value = null;

  try {
    const response = await api.post<{ url: string }>(
      `/social/${provider.providerId}/authorize`,
      {
        siteId: defaultSiteId.value,
        returnPath: "/social",
      },
    );
    window.location.href = response.url;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to start OAuth";
    providerAction.value = null;
  }
}

onMounted(() => {
  void loadSocialPublishing();
});
</script>

<template>
  <main class="social-page-shell">
    <section class="social-page-header">
      <div>
        <p class="eyebrow">First-party plugin</p>
        <h1>Social Publishing</h1>
      </div>
      <span class="status-badge" :class="statusClass">
        {{ plugin?.statusLabel || "Available" }}
      </span>
    </section>

    <section class="social-panel">
      <div v-if="loading" class="status-row">Loading social runtime...</div>
      <p v-else-if="error" class="error">{{ error }}</p>

      <template v-else>
        <p v-if="message" class="success">{{ message }}</p>
        <div class="social-panel__summary">
          <div>
            <span class="metric-label">Connected accounts</span>
            <strong>{{ accounts.length }}</strong>
          </div>
          <div>
            <span class="metric-label">Runtime</span>
            <strong>{{ plugin?.ready ? "Ready" : "Gated" }}</strong>
          </div>
        </div>

        <div v-if="accounts.length" class="account-list">
          <article
            v-for="account in accounts"
            :key="account.id"
            class="account-row"
          >
            <div>
              <h2>{{ platformLabel(account.platform) }}</h2>
              <p>
                {{
                  account.displayName ||
                  account.handle ||
                  account.platformAccountId
                }}
              </p>
            </div>
            <span class="account-row__status">{{ account.status }}</span>
          </article>
        </div>

        <p v-else class="field-hint">
          No social accounts are connected in this Core install yet.
        </p>

        <div v-if="providers.length" class="provider-list">
          <article
            v-for="provider in providers"
            :key="provider.providerId"
            class="provider-row"
          >
            <div class="provider-row__header">
              <div>
                <h2>{{ provider.label }}</h2>
                <p>{{ provider.configured ? provider.secretHint : provider.callbackPath }}</p>
              </div>
              <span class="account-row__status">
                {{ provider.configured && provider.enabled ? "ready" : "setup" }}
              </span>
            </div>

            <div class="provider-row__form">
              <label>
                <span>Client ID</span>
                <input
                  v-model="providerInputs[provider.providerId].clientId"
                  type="text"
                  autocomplete="off"
                />
              </label>
              <label>
                <span>Client secret</span>
                <input
                  v-model="providerInputs[provider.providerId].clientSecret"
                  type="password"
                  autocomplete="new-password"
                  :placeholder="provider.secretHint || ''"
                />
              </label>
              <label class="provider-toggle">
                <input
                  v-model="providerInputs[provider.providerId].enabled"
                  type="checkbox"
                />
                <span>Enabled</span>
              </label>
            </div>

            <div class="provider-row__actions">
              <button
                type="button"
                class="social-button"
                :disabled="providerAction !== null"
                @click="saveProvider(provider)"
              >
                {{ providerAction === `save:${provider.providerId}` ? "Saving" : "Save" }}
              </button>
              <button
                type="button"
                class="social-button primary"
                :disabled="providerAction !== null || !provider.configured || !defaultSiteId"
                @click="connectProvider(provider)"
              >
                {{
                  providerAction === `connect:${provider.providerId}`
                    ? "Connecting"
                    : "Connect"
                }}
              </button>
            </div>
          </article>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.social-page-shell {
  width: min(980px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 40px 0 72px;
}

.social-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}

.eyebrow,
.metric-label {
  margin: 0 0 8px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: var(--color-text);
  font-size: 32px;
  line-height: 1.1;
}

.social-panel {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 22px;
}

.social-panel__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.social-panel__summary > div,
.account-row {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-subtle);
  padding: 14px;
}

.social-panel__summary strong {
  display: block;
  color: var(--color-text);
  font-size: 24px;
}

.account-list {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.account-row,
.provider-row__header,
.provider-row__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.account-row h2,
.provider-row h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.account-row p,
.provider-row p,
.field-hint,
.error,
.success,
.status-row {
  margin: 0;
  color: var(--color-text-muted);
}

.provider-list {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.provider-row {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 14px;
}

.provider-row__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 10px;
  margin: 14px 0;
}

.provider-row__form label {
  display: grid;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.provider-row__form input[type="text"],
.provider-row__form input[type="password"] {
  min-width: 0;
  height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 10px;
}

.provider-toggle {
  align-content: end;
  grid-template-columns: auto auto;
  justify-content: start;
  padding-bottom: 10px;
}

.social-button {
  min-height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 14px;
  font-weight: 700;
  cursor: pointer;
}

.social-button.primary {
  border-color: transparent;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.social-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.account-row__status,
.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--color-bg-subtle);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}

.status-badge.installed {
  background: rgba(76, 175, 80, 0.14);
  color: #2e7d32;
}

.status-badge.setup_required {
  background: rgba(255, 179, 0, 0.16);
  color: #9a6700;
}

.status-badge.disabled,
.status-badge.available {
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
}

.error {
  color: #c62828;
}

.success {
  margin-bottom: 14px;
  color: #2e7d32;
}

@media (max-width: 720px) {
  .social-page-header,
  .account-row,
  .provider-row__header,
  .provider-row__actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .social-panel__summary,
  .provider-row__form {
    grid-template-columns: 1fr;
  }
}
</style>
