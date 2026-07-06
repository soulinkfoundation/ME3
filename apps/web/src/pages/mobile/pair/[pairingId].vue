<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute } from "vue-router";
import { api, ApiError } from "../../../api";
import BrandLogo from "../../../components/BrandLogo.vue";
import Button from "../../../components/Button.vue";

definePage({
  meta: {
    requiresAuth: true,
    hideAppShell: true,
    title: "Pair ME3 Mobile | ME3",
    description: "Approve a ME3 mobile app pairing request.",
    robots: "noindex,follow",
  },
});

type MobilePairingStatus =
  | "pending"
  | "approved"
  | "claimed"
  | "expired"
  | "revoked";

type MobilePairing = {
  id: string;
  status: MobilePairingStatus;
  device: {
    name: string;
    platform: string;
    appVersion: string | null;
  };
  expiresAt: string;
  approvedAt: string | null;
  claimedAt: string | null;
  createdAt: string;
};

const route = useRoute();
const pairing = ref<MobilePairing | null>(null);
const code = ref("");
const loading = ref(true);
const approving = ref(false);
const error = ref("");
const notice = ref("");

const pairingId = computed(() =>
  typeof route.params.pairingId === "string" ? route.params.pairingId : "",
);
const expiresAtLabel = computed(() => {
  if (!pairing.value?.expiresAt) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(pairing.value.expiresAt));
});
const canApprove = computed(
  () =>
    pairing.value?.status === "pending" &&
    code.value.trim().length > 0 &&
    !approving.value,
);

async function loadPairing() {
  loading.value = true;
  error.value = "";

  try {
    const response = await api.get<{ ok: boolean; pairing: MobilePairing }>(
      `/mobile/pairing/${encodeURIComponent(pairingId.value)}`,
    );
    pairing.value = response.pairing;
  } catch (loadError) {
    error.value =
      loadError instanceof ApiError
        ? loadError.message
        : "Pairing could not be loaded.";
  } finally {
    loading.value = false;
  }
}

async function approvePairing() {
  if (!canApprove.value) return;

  approving.value = true;
  error.value = "";
  notice.value = "";

  try {
    const response = await api.post<{ ok: boolean; pairing: MobilePairing }>(
      `/mobile/pairing/${encodeURIComponent(pairingId.value)}/approve`,
      { userCode: code.value },
    );
    pairing.value = response.pairing;
    notice.value = "Approved. Return to the ME3 app to finish connecting.";
  } catch (approveError) {
    error.value =
      approveError instanceof ApiError
        ? approveError.message
        : "Pairing could not be approved.";
  } finally {
    approving.value = false;
  }
}

onMounted(loadPairing);
</script>

<template>
  <main class="mobile-pair">
    <section class="mobile-pair__panel" aria-live="polite">
      <BrandLogo class="mobile-pair__logo" alt="ME3" />

      <div v-if="loading" class="mobile-pair__state">Loading...</div>

      <template v-else-if="pairing">
        <p class="mobile-pair__eyebrow">Mobile Pairing</p>
        <h1>{{ pairing.device.name }}</h1>

        <form
          v-if="pairing.status === 'pending'"
          class="mobile-pair__form"
          @submit.prevent="approvePairing"
        >
          <label class="mobile-pair__label" for="mobile-pair-code">
            Verification code
          </label>
          <input
            id="mobile-pair-code"
            v-model="code"
            class="mobile-pair__input"
            autocomplete="one-time-code"
            autocapitalize="characters"
            inputmode="text"
            placeholder="ABC-234"
          />
          <Button
            type="submit"
            color="primary"
            size="large"
            shape="soft"
            :disabled="!canApprove"
          >
            {{ approving ? "Approving..." : "Approve" }}
          </Button>
          <p v-if="expiresAtLabel" class="mobile-pair__hint">
            Expires at {{ expiresAtLabel }}
          </p>
        </form>

        <div v-else class="mobile-pair__status">
          <p v-if="pairing.status === 'approved'">
            Approved. Return to the ME3 app to finish connecting.
          </p>
          <p v-else-if="pairing.status === 'claimed'">
            This device is connected.
          </p>
          <p v-else-if="pairing.status === 'expired'">
            This pairing expired. Start again in the ME3 app.
          </p>
          <p v-else>This pairing is no longer available.</p>
        </div>

        <p v-if="notice" class="mobile-pair__notice">{{ notice }}</p>
        <p v-if="error" class="mobile-pair__error">{{ error }}</p>
      </template>

      <p v-else-if="error" class="mobile-pair__error">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.mobile-pair {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(69, 161, 107, 0.16), transparent 32rem),
    var(--color-bg, #f7faf8);
  color: var(--color-text, #17201d);
  box-sizing: border-box;
}

.mobile-pair__panel {
  display: grid;
  width: min(100%, 420px);
  gap: 18px;
  padding: 28px;
  border: 1px solid var(--color-border, rgba(23, 32, 29, 0.12));
  border-radius: 18px;
  background: var(--color-surface, #fff);
  box-shadow: 0 18px 48px rgba(16, 24, 20, 0.08);
}

.mobile-pair__logo {
  width: 92px;
}

.mobile-pair__eyebrow,
.mobile-pair__hint,
.mobile-pair__state {
  margin: 0;
  color: var(--color-text-muted, #5f7068);
  font-size: 0.9rem;
}

.mobile-pair h1 {
  margin: 0;
  font-size: 2rem;
  line-height: 1.1;
}

.mobile-pair__form {
  display: grid;
  gap: 12px;
}

.mobile-pair__label {
  font-weight: 700;
}

.mobile-pair__input {
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border: 1px solid var(--color-border, rgba(23, 32, 29, 0.16));
  border-radius: 14px;
  background: var(--color-bg-subtle, #f4f7f5);
  color: inherit;
  font: inherit;
  font-size: 1.15rem;
  text-transform: uppercase;
  box-sizing: border-box;
}

.mobile-pair__input:focus {
  outline: 2px solid var(--color-accent, #26834f);
  outline-offset: 2px;
}

.mobile-pair__status,
.mobile-pair__notice,
.mobile-pair__error {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
}

.mobile-pair__status,
.mobile-pair__notice {
  background: rgba(69, 161, 107, 0.12);
  color: #14543a;
}

.mobile-pair__error {
  background: rgba(196, 55, 55, 0.12);
  color: #9d2424;
}

@media (prefers-color-scheme: dark) {
  .mobile-pair {
    background:
      radial-gradient(circle at top left, rgba(69, 161, 107, 0.2), transparent 30rem),
      var(--color-bg, #0f1713);
  }

  .mobile-pair__panel {
    background: var(--color-surface, #17201d);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  }

  .mobile-pair__status,
  .mobile-pair__notice {
    color: #a7f3c4;
  }
}
</style>
