<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../api";
import Button from "./Button.vue";
import UiIcon from "./UiIcon.vue";

type SoulinkConnectionRecord = {
  id: string;
  channel: "soulink";
  status: "pending" | "active" | "disconnected";
  ownerNodeId: string | null;
  assistantNodeId: string | null;
  streamChannelType: string;
  streamChannelId: string | null;
  soulinkChatUrl: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SoulinkStatusResponse = {
  available: boolean;
  configured: boolean;
  apiOrigin: string | null;
  runtimeCallbackUrl: string;
  connection: SoulinkConnectionRecord | null;
};

const props = withDefaults(
  defineProps<{
    variant?: "default" | "compact" | "inline";
    autoPrepareWhenNotConnected?: boolean;
    showStatusDetails?: boolean;
  }>(),
  {
    variant: "default",
    autoPrepareWhenNotConnected: false,
    showStatusDetails: true,
  },
);

const emit = defineEmits<{
  (e: "connection-active"): void;
}>();

const loading = ref(false);
const setupLoading = ref(false);
const disconnectLoading = ref(false);
const available = ref(false);
const configured = ref(false);
const apiOrigin = ref<string | null>(null);
const runtimeCallbackUrl = ref("");
const connection = ref<SoulinkConnectionRecord | null>(null);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const isConnected = computed(() => connection.value?.status === "active");
const isRuntimeCallbackLocal = computed(() =>
  isLocalRuntimeCallback(runtimeCallbackUrl.value),
);
const canConnect = computed(
  () => available.value && configured.value && !isRuntimeCallbackLocal.value,
);

const statusHint = computed(() => {
  if (!available.value) return "Soulink assistant chat is not available here yet.";
  if (!configured.value) {
    return "Soulink assistant chat is not configured for this Core install yet.";
  }
  if (isConnected.value) return "Connected";
  if (isRuntimeCallbackLocal.value) {
    return "Use your live ME3 Core URL to connect Soulink.";
  }
  if (connection.value?.status === "disconnected") {
    return "Soulink assistant chat is disconnected.";
  }
  return "Create a private Soulink chat between you and your ME3 assistant.";
});

const connectionDetails = computed<Array<[string, string]>>(() => {
  const current = connection.value;
  if (!current && !isRuntimeCallbackLocal.value) {
    return [
      ["Soulink origin", apiOrigin.value],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  }
  if (isConnected.value) return [];

  return [["Status", current?.status || "not connected"]].filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
});

function isLocalRuntimeCallback(value: string) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
      return true;
    }
    if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) {
      return true;
    }
    const private172 = host.match(/^172\.(\d+)\./);
    return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  } catch {
    return false;
  }
}

function syncStatus(response: SoulinkStatusResponse) {
  available.value = response.available;
  configured.value = response.configured;
  apiOrigin.value = response.apiOrigin;
  runtimeCallbackUrl.value = response.runtimeCallbackUrl;
  connection.value = response.connection;
  if (response.connection?.status === "active") emit("connection-active");
}

async function loadSoulink() {
  loading.value = true;
  error.value = null;

  try {
    syncStatus(await api.get<SoulinkStatusResponse>("/soulink/status"));
  } catch (err: unknown) {
    error.value =
      err instanceof Error ? err.message : "Failed to load Soulink status";
  } finally {
    loading.value = false;
  }
}

async function setupSoulink() {
  if (setupLoading.value || !canConnect.value) return;
  setupLoading.value = true;
  error.value = null;
  notice.value = null;

  try {
    const response = await api.post<SoulinkStatusResponse & { ok: boolean }>(
      "/soulink/setup",
      {},
    );
    syncStatus(response);
  } catch (err: unknown) {
    error.value =
      err instanceof Error ? err.message : "Failed to connect Soulink";
  } finally {
    setupLoading.value = false;
  }
}

async function disconnectSoulink() {
  if (disconnectLoading.value || connection.value?.status !== "active") return;
  const confirmed = window.confirm(
    "Disconnect Soulink as your ME3 assistant chat?",
  );
  if (!confirmed) return;

  disconnectLoading.value = true;
  error.value = null;
  notice.value = null;

  try {
    const response = await api.post<SoulinkStatusResponse & { ok: boolean }>(
      "/soulink/disconnect",
      {},
    );
    syncStatus(response);
  } catch (err: unknown) {
    error.value =
      err instanceof Error ? err.message : "Failed to disconnect Soulink";
  } finally {
    disconnectLoading.value = false;
  }
}

onMounted(async () => {
  await loadSoulink();
  if (
    props.autoPrepareWhenNotConnected &&
    canConnect.value &&
    connection.value?.status !== "active"
  ) {
    await setupSoulink();
  }
});

defineExpose({
  available,
  configured,
  connection,
  error,
  loading,
  notice,
  loadSoulink,
  setupSoulink,
});
</script>

<template>
  <div
    class="soulink-connect-panel"
    :class="{ 'soulink-connect-panel--inline': variant === 'inline' }"
  >
    <div
      v-if="loading && variant !== 'inline'"
      class="status-row"
    >
      Loading Soulink...
    </div>

    <template v-else-if="variant === 'inline'">
      <div class="soulink-inline-actions">
        <a
          v-if="isConnected && connection?.soulinkChatUrl"
          class="soulink-chat-link"
          :href="connection.soulinkChatUrl"
          target="_blank"
          rel="noreferrer"
        >
          Open chat
        </a>
        <Button
          v-if="isConnected"
          color="outline"
          size="compact"
          type="button"
          :disabled="disconnectLoading"
          @click="disconnectSoulink"
        >
          {{ disconnectLoading ? "Disconnecting..." : "Disconnect" }}
        </Button>
        <Button
          v-else
          color="primary"
          size="compact"
          type="button"
          :disabled="loading || setupLoading || !canConnect"
          @click="setupSoulink"
        >
          {{
            loading
              ? "Loading..."
              : setupLoading
                ? "Connecting..."
                : "Connect"
          }}
        </Button>
      </div>
    </template>

    <template v-else>
      <div
        v-if="variant === 'default' && isConnected"
        class="soulink-connected-row"
      >
        <div class="soulink-connected-state">
          <span class="status-pill">
            <UiIcon name="MessagesSquare" :size="15" aria-hidden="true" />
            Soulink
          </span>
          <span class="connected-pill">
            <UiIcon name="Check" :size="14" aria-hidden="true" />
            Connected
          </span>
        </div>

        <div class="soulink-actions">
          <a
            v-if="connection?.soulinkChatUrl"
            class="soulink-chat-link"
            :href="connection.soulinkChatUrl"
            target="_blank"
            rel="noreferrer"
          >
            Open chat
          </a>
          <Button
            color="outline"
            size="small"
            type="button"
            :disabled="disconnectLoading"
            @click="disconnectSoulink"
          >
            <template #icon>
              <UiIcon name="Unplug" :size="17" aria-hidden="true" />
            </template>
            {{ disconnectLoading ? "Disconnecting..." : "Disconnect" }}
          </Button>
        </div>
      </div>

      <div
        v-else-if="variant === 'default' && showStatusDetails"
        class="status-row"
      >
        <span class="status-pill">
          <UiIcon name="MessagesSquare" :size="15" aria-hidden="true" />
          Soulink
        </span>
        <span>{{ statusHint }}</span>
      </div>
      <p v-else-if="showStatusDetails" class="soulink-compact-hint">
        {{ statusHint }}
      </p>

      <dl
        v-if="showStatusDetails && connectionDetails.length"
        class="soulink-health"
        aria-label="Soulink connection health"
      >
        <div
          v-for="[label, value] in connectionDetails"
          :key="label"
          class="soulink-health__row"
        >
          <dt>{{ label }}</dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>

      <div v-if="!isConnected" class="soulink-actions">
        <Button
          color="primary"
          size="small"
          type="button"
          :disabled="setupLoading || !canConnect"
          @click="setupSoulink"
        >
          <template #icon>
            <UiIcon name="PlugZap" :size="17" aria-hidden="true" />
          </template>
          {{ setupLoading ? "Connecting..." : "Connect Soulink" }}
        </Button>
      </div>

      <p v-if="!configured" class="soulink-setup-note">
        Soulink is unavailable on this Core install. Check the configured
        Soulink deployment and try again.
      </p>
    </template>

    <p
      v-if="error && variant !== 'inline'"
      class="error"
    >
      {{ error }}
    </p>
    <p
      v-if="notice && variant !== 'inline'"
      class="success"
    >
      {{ notice }}
    </p>
  </div>
</template>

<style scoped>
.soulink-connect-panel {
  display: grid;
  gap: 14px;
}

.soulink-connect-panel--inline {
  display: contents;
}

.soulink-inline-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.status-row,
.soulink-connected-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 12px;
}

.soulink-connected-row {
  justify-content: space-between;
}

.soulink-connected-state {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.status-pill,
.connected-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--ui-border, var(--color-border));
  background: var(--ui-surface-muted, var(--color-surface-muted));
}

.connected-pill {
  color: var(--ui-accent-strong, #047857);
  border-color: color-mix(in srgb, var(--ui-accent, #10b981) 28%, transparent);
  background: var(--ui-accent-soft, rgba(16, 185, 129, 0.1));
}

.soulink-compact-hint {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.soulink-health {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 14px 0 0;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.soulink-health__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
}

.soulink-health dt {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.soulink-health dd {
  min-width: 0;
  margin: 0;
  text-align: right;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.soulink-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.soulink-chat-link {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  color: var(--ui-accent-strong, #047857);
  font-size: 14px;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.soulink-setup-note {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  line-height: 1.5;
}

.soulink-setup-note code {
  overflow-wrap: anywhere;
}

.error {
  margin: 0;
  color: var(--color-error, #c62828);
  font-size: 14px;
}

.success {
  margin: 0;
  color: var(--ui-accent-strong, #047857);
  font-size: 14px;
}

@media (max-width: 520px) {
  .soulink-actions .me3-btn,
  .soulink-chat-link {
    width: 100%;
    justify-content: center;
  }
}
</style>
