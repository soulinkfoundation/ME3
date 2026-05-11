<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRouter, useRoute } from "vue-router";
import BrandLogo from "../components/BrandLogo.vue";
import UiIcon from "../components/UiIcon.vue";
import { api } from "../api";
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
const password = ref("");
const showBootstrapCode = ref(false);
const showPassword = ref(false);
const loading = ref(false);
const configLoading = ref(true);
const ownerAuthConfigured = ref(false);
const error = ref("");

const isSetupMode = computed(() => !ownerAuthConfigured.value);

const canSubmit = computed(
  () => {
    if (loading.value || configLoading.value) return false;
    if (email.value.trim().length === 0 || password.value.length === 0) return false;

    if (!isSetupMode.value) return true;

    return (
      bootstrapCode.value.trim().length > 0 &&
      name.value.trim().length > 0 &&
      password.value.length >= 8
    );
  },
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

async function loadConfig() {
  try {
    const config = await api.get<{ ownerAuthConfigured?: boolean }>("/config");
    ownerAuthConfigured.value = Boolean(config.ownerAuthConfigured);
  } catch (configError) {
    console.error("Config load error:", configError);
    error.value = "Unable to load setup state.";
  } finally {
    configLoading.value = false;
  }
}

async function submitAuth() {
  if (!canSubmit.value) return;

  loading.value = true;
  error.value = "";

  const success = isSetupMode.value
    ? await auth.bootstrapOwner({
        bootstrapCode: bootstrapCode.value,
        email: email.value,
        name: name.value,
        username: deriveUsername(),
        password: password.value,
      })
    : await auth.loginOwner({
        email: email.value,
        password: password.value,
      });

  if (success) {
    const redirect = resolvePostLoginRedirect(route.query.redirect);
    navigateAfterLogin(redirect);
  } else {
    error.value = isSetupMode.value
      ? "Setup failed. Check your bootstrap code and password."
      : "Sign in failed. Check your email and password.";
  }

  loading.value = false;
}

onMounted(loadConfig);
</script>

<template>
  <div class="login">
    <main class="login__main">
      <BrandLogo class="login__logo" alt="me3" />

      <form class="login-form" @submit.prevent="submitAuth">
        <input
          v-if="isSetupMode"
          v-model="name"
          type="text"
          autocomplete="name"
          class="input"
          aria-label="Name"
          placeholder="Name"
          required
        />

        <input
          v-model="email"
          type="email"
          autocomplete="email"
          class="input"
          aria-label="Email"
          placeholder="Email"
          required
        />

        <div class="password-field">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :autocomplete="isSetupMode ? 'new-password' : 'current-password'"
            class="input password-field__input"
            aria-label="Password"
            placeholder="Password"
            required
          />
          <button
            type="button"
            class="password-field__toggle"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <UiIcon :name="showPassword ? 'EyeOff' : 'Eye'" :size="18" />
          </button>
        </div>

        <div v-if="isSetupMode" class="password-field">
          <input
            v-model="bootstrapCode"
            :type="showBootstrapCode ? 'text' : 'password'"
            autocomplete="one-time-code"
            class="input password-field__input"
            aria-label="Bootstrap code"
            placeholder="Bootstrap code"
            required
            autofocus
          />
          <button
            type="button"
            class="password-field__toggle"
            :aria-label="showBootstrapCode ? 'Hide bootstrap code' : 'Show bootstrap code'"
            :aria-pressed="showBootstrapCode"
            @click="showBootstrapCode = !showBootstrapCode"
          >
            <UiIcon :name="showBootstrapCode ? 'EyeOff' : 'Eye'" :size="18" />
          </button>
        </div>

        <button type="submit" class="button" :disabled="!canSubmit">
          {{ loading ? "Opening..." : isSetupMode ? "Create account" : "Sign in" }}
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
  color: var(--ui-text-muted, var(--color-text-muted));
  opacity: 0.78;
}

.input:focus {
  border-color: var(--ui-text, var(--color-text));
}

.password-field {
  position: relative;
  width: 100%;
}

.password-field__input {
  padding-right: 44px;
}

.password-field__toggle {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--ui-radius-sm, 8px);
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  cursor: pointer;
  transform: translateY(-50%);
}

.password-field__toggle:hover,
.password-field__toggle:focus-visible {
  color: var(--ui-text, var(--color-text));
}

.password-field__toggle:focus-visible {
  outline: 2px solid var(--ui-text, var(--color-text));
  outline-offset: 2px;
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
