<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import QRCode from "qrcode";
import { api } from "../api";
import Button from "./Button.vue";
import UiIcon from "./UiIcon.vue";

const SETUP_LINK_TOOLTIP =
  "Generate a fresh setup link and tap Start in Telegram to finish linking.";

type TelegramConnectionRecord = {
  id: string;
  channel: "telegram";
  status: "pending" | "active" | "disconnected";
  botUsername: string | null;
  telegramUserId: string | null;
  telegramChatId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TelegramStatusResponse = {
  available: boolean;
  configured: boolean;
  botUsername: string | null;
  startUrl: string | null;
  connection: TelegramConnectionRecord | null;
};

const props = withDefaults(
  defineProps<{
    /** Account page: full status row + primary CTA. Modal: hint + compact refresh + QR. */
    variant?: "default" | "compact";
    /** After first load, call setup when user can connect but is not active yet (e.g. ?section=telegram or dashboard modal). */
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

const router = useRouter();
const qrCanvas = ref<HTMLCanvasElement | null>(null);

const loading = ref(false);
const setupLoading = ref(false);
const available = ref(false);
const configured = ref(false);
const botUsername = ref<string | null>(null);
const startUrl = ref<string | null>(null);
const connection = ref<TelegramConnectionRecord | null>(null);
const error = ref<string | null>(null);

const statusHint = computed(() => {
  if (!available.value) {
    return "Telegram channel access is available on Pro.";
  }

  if (!configured.value) {
    return "Telegram linking is not available on this deployment right now.";
  }

  if (!connection.value) {
    return "Generate a setup link, open Telegram, and tap Start to attach the chat to your ME3 account.";
  }

  if (connection.value.status === "active") {
    return `Telegram is connected${
      connection.value.telegramUsername
        ? ` to @${connection.value.telegramUsername}`
        : ""
    }.`;
  }

  if (connection.value.status === "disconnected") {
    return "This Telegram connection was disconnected.";
  }

  if (connection.value.status === "pending") {
    return "Pending setup.";
  }

  return "";
});

const refreshButtonTooltip = computed(() => {
  if (!configured.value) {
    return "Telegram linking is not available on this deployment right now.";
  }
  if (connection.value?.status === "active") {
    return "Refresh Telegram connection status";
  }
  return SETUP_LINK_TOOLTIP;
});

const refreshAriaLabel = computed(() => refreshButtonTooltip.value);

function syncStatus(response: TelegramStatusResponse) {
  available.value = response.available;
  configured.value = response.configured;
  botUsername.value = response.botUsername;
  startUrl.value = response.startUrl;
  connection.value = response.connection;
  if (response.connection?.status === "active") {
    emit("connection-active");
  }
}

async function loadTelegram() {
  loading.value = true;
  error.value = null;

  try {
    const response = await api.get<TelegramStatusResponse>("/telegram/status");
    syncStatus(response);
  } catch (err: unknown) {
    error.value =
      err instanceof Error ? err.message : "Failed to load Telegram status";
  } finally {
    loading.value = false;
  }
}

async function setupTelegram() {
  if (setupLoading.value || !available.value) return;

  setupLoading.value = true;
  error.value = null;

  try {
    const response = await api.post<TelegramStatusResponse>(
      "/telegram/setup",
      {},
    );
    syncStatus(response);
  } catch (err: unknown) {
    error.value =
      err instanceof Error ? err.message : "Failed to prepare Telegram setup";
  } finally {
    setupLoading.value = false;
  }
}

async function renderQr() {
  await nextTick();
  const canvas = qrCanvas.value;
  const url = startUrl.value;
  if (!canvas || !url) return;
  try {
    await QRCode.toCanvas(canvas, url, {
      width: props.variant === "compact" ? 180 : 200,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    /* QR render failed — link still available as fallback */
  }
}

watch(startUrl, (url) => {
  if (url) renderQr();
});

async function handlePrimaryAction() {
  if (!available.value) {
    router.push("/account");
    return;
  }

  if (!configured.value) {
    return;
  }

  if (connection.value?.status === "active") {
    await loadTelegram();
    return;
  }

  await setupTelegram();
}

onMounted(async () => {
  await loadTelegram();
  if (
    props.autoPrepareWhenNotConnected &&
    available.value &&
    configured.value &&
    connection.value?.status !== "active"
  ) {
    await setupTelegram();
    await renderQr();
  }
});

defineExpose({
  available,
  configured,
  connection,
  loadTelegram,
  setupTelegram,
});
</script>

<template>
  <div class="telegram-connect-panel">
    <div v-if="loading" class="status-row">Loading Telegram…</div>

    <template v-else-if="available">
      <template v-if="variant === 'default'">
        <div
          class="status-row"
          :class="{ verified: connection?.status === 'active' }"
        >
          <span class="status-pill">
            {{ botUsername ? `@${botUsername}` : "Telegram" }}
          </span>
          <span v-if="statusHint">{{ statusHint }}</span>
        </div>
      </template>

      <p v-else-if="variant === 'compact'" class="telegram-compact-hint">
        {{ statusHint }}
      </p>

      <div v-if="configured" class="telegram-qr-section">
        <div class="telegram-qr-section__body">
          <template v-if="startUrl">
            <p class="hint">
              Scan this QR code with your phone to connect via Telegram.
            </p>
            <canvas ref="qrCanvas" class="telegram-qr-canvas" />
            <a
              class="telegram-qr-fallback"
              :href="startUrl"
              target="_blank"
              rel="noreferrer"
            >
              Or open this link on your phone
            </a>
          </template>
        </div>
        <div class="telegram-qr-section__footer">
          <Button
            variant="secondary"
            size="small"
            class="telegram-refresh-btn"
            type="button"
            :disabled="setupLoading"
            :title="refreshButtonTooltip"
            :aria-label="refreshAriaLabel"
            @click="handlePrimaryAction"
          >
            <template #icon>
              <UiIcon name="RefreshCw" :size="18" aria-hidden="true" />
            </template>
          </Button>
        </div>
      </div>
    </template>

    <div v-else class="recommended-card">
      <span class="recommended-pill">Pro</span>
      <h3>Connect Telegram for agent messages</h3>
      <p class="hint">
        Pro unlocks the Telegram channel MVP, which records message events and
        prepares the account for Cloudflare agent routing.
      </p>
      <router-link class="button primary link-button-inline" to="/account">
        Review settings
      </router-link>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.telegram-connect-panel .hint {
  margin-top: 0;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 12px;
}

.status-row.verified {
  color: var(--color-text);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted, rgba(0, 0, 0, 0.04));
}

.telegram-refresh-btn.me3-btn {
  min-width: 40px;
  padding: 8px;
}

.telegram-refresh-btn :deep(.me3-btn__icon) {
  margin: 0;
}

.telegram-compact-hint {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.45;
  color: var(--color-text-muted);
}

.telegram-qr-section {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
}

.telegram-qr-section__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-height: 0;
}

.telegram-qr-section__footer {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-top: 4px;
}

.telegram-qr-section .hint {
  margin-top: 0;
  text-align: center;
}

.telegram-qr-canvas {
  border-radius: 8px;
  image-rendering: pixelated;
}

.telegram-qr-fallback {
  font-size: 13px;
  color: var(--color-text-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.telegram-qr-fallback:hover {
  color: var(--color-text);
}

.recommended-card {
  margin-top: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-muted, rgba(0, 0, 0, 0.03));
}

.recommended-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.recommended-card h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.error {
  margin-top: 12px;
  color: var(--color-error, #c62828);
  font-size: 14px;
}

@media (prefers-color-scheme: dark) {
  .recommended-card {
    background: rgba(46, 125, 50, 0.14);
    border-color: rgba(129, 199, 132, 0.32);
  }

  .recommended-pill {
    color: #c8e6c9;
  }
}
</style>
