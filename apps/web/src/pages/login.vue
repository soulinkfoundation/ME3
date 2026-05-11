<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRouter, useRoute } from "vue-router";
import { API_BASE } from "../api";
import BrandLogo from "../components/BrandLogo.vue";
import { useAuthStore } from "../stores/auth";
import { DEFAULT_APP_PATH } from "../utils/navigation";

definePage({
  meta: {
    title: "Sign In | ME3",
    description: "Sign in to manage your me3 sites.",
    robots: "noindex,follow",
  },
});

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const email = ref("");
const codeSent = ref(false);
const loading = ref(false);
const error = ref("");

const codeDigits = ref(["", "", "", "", "", ""]);
const codeInputRefs = ref<HTMLInputElement[]>([]);

type OAuthClientBrand = {
  clientId: string;
  name: string;
  logoSrc: string;
  logoAlt: string;
  helperText: string;
};

const oauthClientBrands: Record<string, OAuthClientBrand> = {};

// OAuth providers
type OAuthProvider = "github" | "google" | "linkedin" | "apple" | "twitter";

const oauthProviders: { id: OAuthProvider; name: string }[] = [
  { id: "linkedin", name: "LinkedIn" },
  { id: "apple", name: "Apple" },
  { id: "google", name: "Google" },
  // { id: "twitter", name: "X" }, // TODO: Add Twitter back in
  { id: "github", name: "GitHub" },
];

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

function parseOAuthClientFromRedirect(raw: unknown): OAuthClientBrand | null {
  if (typeof raw !== "string") return null;
  const redirect = raw.trim();
  if (!redirect) return null;

  try {
    const parsed = new URL(redirect);
    const isAuthorizePath =
      parsed.pathname === "/api/oauth/authorize" ||
      parsed.pathname.endsWith("/api/oauth/authorize");
    if (!isAuthorizePath) return null;

    const allowedHosts = new Set([window.location.hostname]);
    const devLocalhost =
      import.meta.env.DEV &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname);

    if (!(allowedHosts.has(parsed.hostname) || devLocalhost)) {
      return null;
    }

    const clientId = parsed.searchParams.get("client_id")?.trim().toLowerCase();
    if (!clientId) return null;

    return oauthClientBrands[clientId] || null;
  } catch {
    return null;
  }
}

const connectingApp = computed(() =>
  parseOAuthClientFromRedirect(route.query.redirect),
);

function navigateAfterLogin(target: string) {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    window.location.href = target;
    return;
  }
  router.push(target);
}

function startOAuth(provider: OAuthProvider) {
  const redirect = (route.query.redirect as string) || DEFAULT_APP_PATH;
  const apiBase = API_BASE.replace(/\/api$/, "");
  window.location.href = `${apiBase}/api/oauth/${provider}/authorize?redirect=${encodeURIComponent(redirect)}`;
}

// Check for OAuth error in URL
onMounted(() => {
  const oauthError = route.query.error as string;
  if (oauthError) {
    const errorMessages: Record<string, string> = {
      oauth_denied: "OAuth login was cancelled.",
      invalid_provider: "Invalid OAuth provider.",
      missing_params: "Missing OAuth parameters.",
      invalid_state: "Invalid OAuth state. Please try again.",
      state_expired: "OAuth session expired. Please try again.",
      token_exchange_failed: "Failed to complete login. Please try again.",
      user_info_failed: "Failed to get user info. Please try again.",
      database_error: "Something went wrong. Please try again.",
    };
    error.value =
      errorMessages[oauthError] || "OAuth login failed. Please try again.";
    // Clear the error from URL
    router.replace({ query: { ...route.query, error: undefined } });
  }
});

async function requestCode() {
  if (!email.value || loading.value) return;

  loading.value = true;
  error.value = "";

  const success = await auth.requestCode(email.value);

  if (success) {
    codeSent.value = true;
  } else {
    error.value = "Failed to send code. Please try again.";
  }

  loading.value = false;
}

function handleCodeInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value;

  // Only allow digits
  if (value && !/^\d$/.test(value)) {
    codeDigits.value[index] = "";
    return;
  }

  codeDigits.value[index] = value;

  // Auto-focus next input
  if (value && index < 5) {
    codeInputRefs.value[index + 1]?.focus();
  }

  // Auto-submit when all digits entered
  if (codeDigits.value.every((d) => d.length === 1)) {
    submitCode();
  }
}

function handleKeydown(index: number, event: KeyboardEvent) {
  if (event.key === "Backspace" && !codeDigits.value[index] && index > 0) {
    codeInputRefs.value[index - 1]?.focus();
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault();
  const paste = event.clipboardData?.getData("text") || "";
  const digits = paste.replace(/\D/g, "").slice(0, 6).split("");

  digits.forEach((digit, i) => {
    codeDigits.value[i] = digit;
  });

  const focusIndex = Math.min(digits.length, 5);
  codeInputRefs.value[focusIndex]?.focus();

  if (digits.length === 6) {
    submitCode();
  }
}

async function submitCode() {
  const fullCode = codeDigits.value.join("");
  if (fullCode.length !== 6 || loading.value) return;

  loading.value = true;
  error.value = "";

  const success = await auth.verifyCode(email.value, fullCode);

  if (success) {
    const redirect = resolvePostLoginRedirect(route.query.redirect);
    navigateAfterLogin(redirect);
  } else {
    error.value = "Invalid or expired code. Please try again.";
    codeDigits.value = ["", "", "", "", "", ""];
    codeInputRefs.value[0]?.focus();
  }

  loading.value = false;
}

function changeEmail() {
  codeSent.value = false;
  codeDigits.value = ["", "", "", "", "", ""];
  error.value = "";
}
</script>

<template>
  <div class="login">
    <div class="login-card">
      <div v-if="connectingApp" class="connection-context">
        <div
          class="connection-logos"
          :aria-label="`${connectingApp.name} uses ME3 for authentication`"
        >
          <img
            :src="connectingApp.logoSrc"
            :alt="connectingApp.logoAlt"
            class="connection-logo"
          />
          <span class="connection-connector" aria-hidden="true">↔</span>
          <BrandLogo class="connection-me3-logo" alt="me3" />
        </div>
        <p class="connection-text">{{ connectingApp.helperText }}</p>
      </div>

      <router-link v-else to="/" class="logo" aria-label="me3 home">
        <BrandLogo class="logo-img" alt="me3" />
      </router-link>

      <h1 class="title">{{ codeSent ? "Enter your code" : "Sign in" }}</h1>

      <p class="subtitle" v-if="codeSent">
        We sent a 6-digit code to <strong>{{ email }}</strong>
      </p>

      <!-- Email form (moved to top) -->
      <form v-if="!codeSent" @submit.prevent="requestCode" class="form">
        <input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          class="input"
          required
          autofocus
        />
        <button type="submit" class="button" :disabled="loading">
          {{ loading ? "Sending..." : "Send code" }}
        </button>
      </form>

      <div v-if="!codeSent" class="divider">
        <span>or</span>
      </div>

      <!-- OAuth buttons -->
      <div v-if="!codeSent" class="oauth-buttons">
        <button
          v-for="provider in oauthProviders"
          :key="provider.id"
          type="button"
          class="oauth-button"
          @click="startOAuth(provider.id)"
        >
          <!-- GitHub -->
          <svg
            v-if="provider.id === 'github'"
            class="oauth-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
            />
          </svg>
          <!-- Google -->
          <svg
            v-else-if="provider.id === 'google'"
            class="oauth-icon"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <!-- LinkedIn -->
          <svg
            v-else-if="provider.id === 'linkedin'"
            class="oauth-icon"
            viewBox="0 0 24 24"
            fill="#0A66C2"
          >
            <path
              d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
            />
          </svg>
          <!-- Apple -->
          <svg
            v-else-if="provider.id === 'apple'"
            class="oauth-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
            />
          </svg>
          <!-- Twitter/X -->
          <svg
            v-else-if="provider.id === 'twitter'"
            class="oauth-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            />
          </svg>
          Continue with {{ provider.name }}
        </button>
      </div>

      <div v-else class="code-form">
        <div class="code-inputs" @paste="handlePaste">
          <input
            v-for="(_, index) in 6"
            :key="index"
            :ref="
              (el) => {
                if (el) codeInputRefs[index] = el as HTMLInputElement;
              }
            "
            v-model="codeDigits[index]"
            type="text"
            inputmode="numeric"
            maxlength="1"
            class="code-input"
            @input="handleCodeInput(index, $event)"
            @keydown="handleKeydown(index, $event)"
          />
        </div>

        <button
          type="button"
          class="button"
          :disabled="loading || codeDigits.some((d) => !d)"
          @click="submitCode"
        >
          {{ loading ? "Verifying..." : "Verify" }}
        </button>

        <button type="button" class="link-button" @click="changeEmail">
          Use a different email
        </button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.connection-context {
  margin-bottom: 24px;
}

.connection-logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 14px;
}

.connection-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  display: block;
}

.connection-connector {
  font-size: 20px;
  line-height: 1;
  color: var(--color-text-muted);
}

.connection-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.connection-me3-logo {
  display: block;
  height: 28px;
  width: auto;
}

.logo {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  color: var(--color-text);
  margin-bottom: 32px;
}

.logo-img {
  display: block;
  height: 28px;
  width: auto;
}

.logo-spacer {
  margin-bottom: 32px;
}

.logo-img-hidden {
  visibility: hidden;
}

.title {
  font-size: 28px;
  margin-bottom: 12px;
}

.subtitle {
  color: var(--color-text-muted);
  margin-bottom: 32px;
}

.subtitle strong {
  color: var(--color-text);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input {
  padding: 16px;
  font-size: 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--color-text);
}

.button {
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.button:hover:not(:disabled) {
  opacity: 0.9;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.code-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.code-inputs {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.code-input {
  width: 48px;
  height: 56px;
  font-size: 24px;
  font-weight: 600;
  text-align: center;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  transition: border-color 0.2s;
}

.code-input:focus {
  border-color: var(--color-text);
}

.link-button {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  text-decoration: underline;
}

.link-button:hover {
  color: var(--color-text);
}

.error {
  margin-top: 16px;
  color: #e53935;
  font-size: 14px;
}

.oauth-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.oauth-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 500;
  background: var(--color-bg);
  color: var(--color-text);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.oauth-button:hover {
  border-color: var(--color-text);
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.05));
}

.oauth-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 24px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

@media (max-width: 480px) {
  .connection-logo {
    width: 56px;
    height: 56px;
  }
}
</style>
