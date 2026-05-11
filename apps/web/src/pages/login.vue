<script setup lang="ts">
import { computed, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRouter, useRoute } from "vue-router";
import BrandLogo from "../components/BrandLogo.vue";
import { useAuthStore } from "../stores/auth";
import { DEFAULT_APP_PATH } from "../utils/navigation";

definePage({
  path: "/",
  alias: ["/login"],
  meta: {
    title: "Set up ME3 Core | Personal AI assistant",
    description:
      "Set up your installable ME3 Core personal AI assistant with an owner bootstrap code.",
    robots: "noindex,follow",
    ogImage: "/icons/icon-512.png",
  },
});

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const email = ref("");
const name = ref("");
const bootstrapCode = ref("");
const loading = ref(false);
const error = ref("");

const canSubmit = computed(
  () =>
    bootstrapCode.value.trim().length > 0 &&
    name.value.trim().length > 0 &&
    email.value.trim().length > 0 &&
    !loading.value,
);

function deriveUsername() {
  const source = email.value.split("@")[0] || name.value;
  const username = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return username || "owner";
}

function resolvePostLoginRedirect(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_APP_PATH;
  const redirect = raw.trim();
  if (!redirect) return DEFAULT_APP_PATH;

  if (redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }

  try {
    const parsed = new URL(redirect);
    const allowedHosts = new Set([window.location.hostname]);
    const sameHost = allowedHosts.has(parsed.hostname);
    const devLocalhost =
      import.meta.env.DEV &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (
      (sameHost || devLocalhost) &&
      ["http:", "https:"].includes(parsed.protocol)
    ) {
      return parsed.toString();
    }
  } catch {
    // Fall through to default.
  }

  return DEFAULT_APP_PATH;
}

function navigateAfterLogin(target: string) {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    window.location.href = target;
    return;
  }
  router.push(target);
}

async function submitBootstrap() {
  if (!canSubmit.value) return;

  loading.value = true;
  error.value = "";

  const success = await auth.bootstrapOwner({
    bootstrapCode: bootstrapCode.value,
    email: email.value,
    name: name.value,
    username: deriveUsername(),
  });

  if (success) {
    const redirect = resolvePostLoginRedirect(route.query.redirect);
    navigateAfterLogin(redirect);
  } else {
    error.value = "Bootstrap failed. Check your owner code and try again.";
  }

  loading.value = false;
}
</script>

<template>
  <div class="login">
    <main class="login__main">
      <BrandLogo class="login__logo" alt="me3" />

      <form class="login-form" @submit.prevent="submitBootstrap">
        <input
          v-model="bootstrapCode"
          type="password"
          autocomplete="one-time-code"
          class="input"
          aria-label="Bootstrap code"
          required
          autofocus
        />

        <input
          v-model="name"
          type="text"
          autocomplete="name"
          class="input"
          aria-label="Name"
          required
        />

        <input
          v-model="email"
          type="email"
          autocomplete="email"
          class="input"
          aria-label="Email"
          required
        />

        <button type="submit" class="button" :disabled="!canSubmit" aria-label="Enter">
          <span aria-hidden="true">{{ loading ? "..." : ">" }}</span>
        </button>

        <p v-if="error" class="error">{{ error }}</p>
      </form>
    </main>
  </div>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.login__logo {
  display: block;
  width: min(140px, 48vw);
  height: auto;
  margin: 0 auto;
}

.login__main {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  width: min(100% - 40px, 360px);
  margin: 0 auto;
  padding: 40px 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.input {
  width: 100%;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid var(--ui-border-strong, var(--color-border-strong));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font-size: 0.98rem;
  outline: none;
}

.input::placeholder {
  color: transparent;
}

.input:focus {
  border-color: var(--ui-text, var(--color-text));
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid var(--ui-text, var(--color-text));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
  cursor: pointer;
  font-size: 0.98rem;
  font-weight: 800;
  transition: opacity 0.2s;
}

.button:hover:not(:disabled) {
  opacity: 0.9;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin: 0;
  color: #e53935;
  font-size: 0.9rem;
  text-align: center;
}
</style>
