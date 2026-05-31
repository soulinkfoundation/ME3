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
    variant?: "default" | "compact";
    autoPrepareWhenNotConnected?: boolean;
  }>(),
  {
    variant: "default",
    autoPrepareWhenNotConnected: false,
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

const statusHint = computed(() => {
  if (!available.value) return "Soulink assistant chat is not available here yet.";
  if (!configured.value) {
    return "Soulink assistant chat is not configured for this Core install yet.";
  }
  if (isConnected.value) return "Soulink is connected as your primary assistant chat.";
  if (connection.value?.status === "disconnected") {
    return "Soulink assistant chat is disconnected.";
  }
  return "Create a private Soulink chat between you and your ME3 assistant.";
});

const connectionDetails = computed<Array<[string, string]>>(() => {
  const current = connection.value;
  if (!current) {
    return [
      ["Runtime callback", runtimeCallbackUrl.value],
      ["Soulink origin", apiOrigin.value],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  }

  return [
    ["Status", current.status],
    ["Stream channel", current.streamChannelId],
    ["Owner node", current.ownerNodeId],
    ["Assistant node", current.assistantNodeId],
    ["Connected", formatDateTime(current.connectedAt)],
    ["Last inbound", formatDateTime(current.lastInboundAt)],
    ["Last outbound", formatDateTime(current.lastOutboundAt)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
});

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
  if (setupLoading.value || !available.value || !configured.value) return;
  setupLoading.value = true;
  error.value = null;
  notice.value = null;

  try {
    const response = await api.post<SoulinkStatusResponse & { ok: boolean }>(
      "/soulink/setup",
      {},
    );
    syncStatus(response);
    notice.value = "Soulink assistant chat connected.";
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
    notice.value = "Soulink assistant chat disconnected.";
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
    available.value &&
    configured.value &&
    connection.value?.status !== "active"
  ) {
    await setupSoulink();
  }
});

defineExpose({
  available,
  configured,
  connection,
  loadSoulink,
  setupSoulink,
});
</script>

<template>
  <div class="soulink-connect-panel">
    <div v-if="loading" class="status-row">Loading Soulink...</div>

    <template v-else>
      <div
        v-if="variant === 'default'"
        class="status-row"
        :class="{ verified: connection?.status === 'active' }"
      >
        <span class="status-pill">
          <UiIcon name="MessagesSquare" :size="15" aria-hidden="true" />
          Soulink
        </span>
        <span>{{ statusHint }}</span>
      </div>
      <p v-else class="soulink-compact-hint">{{ statusHint }}</p>

      <dl
        v-if="connectionDetails.length"
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

      <div class="soulink-actions">
        <Button
          v-if="!isConnected"
          variant="primary"
          size="small"
          type="button"
          :disabled="setupLoading || !configured"
          @click="setupSoulink"
        >
          <template #icon>
            <UiIcon name="PlugZap" :size="17" aria-hidden="true" />
          </template>
          {{ setupLoading ? "Connecting..." : "Connect Soulink" }}
        </Button>
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
          v-if="isConnected"
          variant="outline"
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

      <p v-if="!configured" class="soulink-setup-note">
        Soulink is unavailable on this Core install. Check the configured
        Soulink deployment and try again.
      </p>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="success">{{ notice }}</p>
  </div>
</template>

<style scoped>
.soulink-connect-panel {
  display: grid;
  gap: 14px;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 12px;
}

.status-row.verified {
  color: var(--ui-text, var(--color-text));
}

.status-pill {
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
