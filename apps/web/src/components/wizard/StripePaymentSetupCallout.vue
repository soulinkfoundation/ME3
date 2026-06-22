<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../../api";

type CommerceStatusResponse = {
  stripe?: {
    configured?: boolean;
    source?: "environment" | "stored" | "not_configured";
    keyHint?: string | null;
  };
};

withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false,
  },
);

const loading = ref(true);
const configured = ref(false);

const statusLabel = computed(() =>
  loading.value
    ? "Checking Stripe"
    : configured.value
      ? "Stripe connected"
      : "Stripe not connected",
);

async function loadCommerceStatus() {
  loading.value = true;
  try {
    const response = await api.get<CommerceStatusResponse>("/commerce/status");
    configured.value = response.stripe?.configured === true;
  } catch {
    configured.value = false;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadCommerceStatus();
});
</script>

<template>
  <div
    class="stripe-payment-callout"
    :class="{
      'stripe-payment-callout--connected': configured,
      'stripe-payment-callout--compact': compact,
    }"
  >
    <div class="stripe-status-row">
      <div class="connect-status">
        <span class="status-icon">{{ configured ? "✓" : "!" }}</span>
        <span class="status-text">{{ statusLabel }}</span>
      </div>
      <router-link
        v-if="configured"
        class="disconnect-btn"
        to="/account?section=payments"
      >
        Manage
      </router-link>
    </div>

    <template v-if="!loading && !configured">
      <p class="connect-hint">Add a Stripe key before publishing paid offers.</p>
      <div class="stripe-actions">
        <router-link class="connect-btn stripe" to="/account?section=payments">
          <svg viewBox="0 0 24 24" width="18" height="18" class="stripe-icon">
            <path
              fill="currentColor"
              d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.471-5.747-6.591-7.305z"
            />
          </svg>
          Set up Stripe
        </router-link>
        <a
          class="stripe-docs-link"
          href="https://docs.stripe.com/keys"
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </a>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stripe-payment-callout {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface, var(--color-bg));
}

.stripe-payment-callout--compact {
  margin-top: 10px;
  margin-bottom: 14px;
}

.stripe-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.connect-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-weight: 600;
}

.status-icon {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f59e0b;
  color: #fff;
  font-size: 12px;
  flex: 0 0 auto;
}

.stripe-payment-callout--connected .status-icon {
  background: #22c55e;
}

.status-text {
  color: var(--ui-text, var(--color-text));
  font-size: 14px;
}

.connect-hint {
  margin: 10px 0 12px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
}

.stripe-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.connect-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 40px;
  padding: 10px 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  color: var(--ui-text, var(--color-text));
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.connect-btn.stripe {
  border: none;
  background: #635bff;
  color: #fff;
}

.connect-btn.stripe:hover {
  background: #4f49cc;
}

.disconnect-btn,
.stripe-docs-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--ui-text-muted, var(--color-text-muted));
  border-radius: var(--ui-radius-sm, 8px);
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.disconnect-btn:hover,
.stripe-docs-link:hover {
  border-color: var(--ui-text, var(--color-text));
  color: var(--ui-text, var(--color-text));
}

.stripe-icon {
  display: inline-flex;
  flex-shrink: 0;
}
</style>
