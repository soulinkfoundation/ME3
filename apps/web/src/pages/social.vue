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

const loading = ref(false);
const error = ref<string | null>(null);
const plugin = ref<SocialRuntimeStatus | null>(null);
const accounts = ref<SocialAccount[]>([]);

const statusClass = computed(() => plugin.value?.status || "available");

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
}

.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.account-row h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.account-row p,
.field-hint,
.error,
.status-row {
  margin: 0;
  color: var(--color-text-muted);
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

@media (max-width: 720px) {
  .social-page-header,
  .account-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .social-panel__summary {
    grid-template-columns: 1fr;
  }
}
</style>
