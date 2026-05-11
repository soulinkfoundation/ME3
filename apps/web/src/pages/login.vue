<script setup lang="ts">
import { ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRouter, useRoute } from "vue-router";
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
      <router-link to="/" class="logo" aria-label="me3 home">
        <BrandLogo class="logo-img" alt="me3" />
      </router-link>

      <h1 class="title">{{ codeSent ? "Enter your code" : "Sign in" }}</h1>

      <p class="subtitle" v-if="codeSent">
        We sent a 6-digit code to <strong>{{ email }}</strong>
      </p>

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

</style>
