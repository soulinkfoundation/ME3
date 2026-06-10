<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getUsernameAvailability } from "../api";
import Button from "../components/Button.vue";
import ProfilePreview from "../components/ProfilePreview.vue";
import UiIcon from "../components/UiIcon.vue";
import WizardAvatar from "../components/wizard/WizardAvatar.vue";
import { usePublish } from "../composables/usePublish";
import { useAuthStore } from "../stores/auth";
import { useSitesStore } from "../stores/sites";
import { useWizardStore } from "../stores/wizard";
import { resolvePublicProfileUrl } from "../utils/publicSiteUrl";

definePage({
  meta: {
    requiresAuth: true,
    hideAppShell: true,
    hideAgentLauncher: true,
    title: "Create Profile | ME3",
    description: "Create your ME3 profile.",
    robots: "noindex,follow",
  },
});

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const sites = useSitesStore();
const wizard = useWizardStore();
const { isPublishing, publishProgress, publishError, publish } = usePublish();

const loadingExisting = ref(true);
const existingProfileUsername = ref<string | null>(null);
const preserveExistingSiteContent = ref(false);
const name = ref("");
const handle = ref("");
const bio = ref("");
const profileError = ref("");
const successMessage = ref("");
const publishedUrl = ref("");
const isCheckingUsername = ref(false);
const isUsernameAvailable = ref<boolean | null>(null);
const usernameMessage = ref("");

let usernameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

const normalizedHandle = computed(() => normalizeUsername(handle.value));
const publishedUrlLabel = computed(() =>
  publishedUrl.value.replace(/^https?:\/\//, "").replace(/\/$/, ""),
);
const safeRedirect = computed(() =>
  resolveSafeRedirect(route.query.redirect || route.query.next),
);
const starterPreviewProfile = computed(() => ({
  ...wizard.profile,
  newsletter: {
    ...wizard.profile.newsletter,
    enabled: false,
  },
  booking: {
    ...wizard.profile.booking,
    enabled: false,
  },
  gift: {
    ...wizard.profile.gift,
    enabled: false,
  },
}));
const canSave = computed(
  () =>
    !loadingExisting.value &&
    !isPublishing.value &&
    !isCheckingUsername.value &&
    name.value.trim().length >= 2 &&
    normalizedHandle.value.length >= 3 &&
    USERNAME_PATTERN.test(normalizedHandle.value) &&
    isUsernameAvailable.value === true,
);

function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .slice(0, 30);
}

function clearUsernameCheck() {
  if (usernameCheckTimeout) {
    clearTimeout(usernameCheckTimeout);
    usernameCheckTimeout = null;
  }
}

function resolveSafeRedirect(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  const redirect = value.trim();
  if (!redirect) return "";
  if (redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;

  try {
    const parsed = new URL(redirect);
    if (
      parsed.hostname === window.location.hostname &&
      ["http:", "https:"].includes(parsed.protocol)
    ) {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function navigateToSafeRedirect(target: string) {
  if (!target) return;
  if (target.startsWith("http://") || target.startsWith("https://")) {
    window.location.href = target;
    return;
  }
  void router.push(target);
}

function syncWizardProfile() {
  const nextHandle = normalizedHandle.value;
  wizard.username = nextHandle;
  wizard.updateProfile({
    name: name.value,
    handle: nextHandle,
    bio: bio.value,
  });
}

function applyStarterProfileScope() {
  wizard.pages = [];
  wizard.posts = [];
  wizard.products = [];
  wizard.testimonials = [];
  wizard.newsletterEnabled = false;
  wizard.blogEnabled = false;
  wizard.bookingsEnabled = false;
  wizard.shopEnabled = false;
  wizard.testimonialsEnabled = false;
  wizard.updateProfile({
    newsletter: {
      ...wizard.profile.newsletter,
      enabled: false,
      title: "",
      description: "",
    },
    booking: {
      ...wizard.profile.booking,
      enabled: false,
      oneToOneEnabled: false,
      classEnabled: false,
      retreatEnabled: false,
      offers: [],
      classOffers: [],
      retreatOffers: [],
    },
    gift: {
      ...wizard.profile.gift,
      enabled: false,
      title: "",
      description: "",
    },
  });
}

function queueUsernameAvailabilityCheck(value: string) {
  const cleaned = normalizeUsername(value);
  usernameMessage.value = "";
  isUsernameAvailable.value = null;
  isCheckingUsername.value = false;
  clearUsernameCheck();

  if (cleaned.length === 0) return;
  if (cleaned.length < 3 || !USERNAME_PATTERN.test(cleaned)) {
    usernameMessage.value =
      cleaned.length < 3
        ? "Handle must be at least 3 characters."
        : "Use letters, numbers, underscores, or hyphens.";
    return;
  }

  if (cleaned === existingProfileUsername.value) {
    isUsernameAvailable.value = true;
    wizard.isUsernameAvailable = true;
    return;
  }

  isCheckingUsername.value = true;
  wizard.isCheckingUsername = true;

  usernameCheckTimeout = setTimeout(async () => {
    try {
      const available = await getUsernameAvailability(cleaned);
      if (normalizedHandle.value === cleaned) {
        isUsernameAvailable.value = available;
        wizard.isUsernameAvailable = available;
      }
    } catch {
      if (normalizedHandle.value === cleaned) {
        isUsernameAvailable.value = true;
        wizard.isUsernameAvailable = true;
      }
    } finally {
      if (normalizedHandle.value === cleaned) {
        isCheckingUsername.value = false;
        wizard.isCheckingUsername = false;
      }
    }
  }, 400);
}

function hydrateFormFromWizard() {
  name.value = wizard.profile.name || auth.user?.name || "";
  handle.value = wizard.profile.handle || wizard.username || "";
  bio.value = wizard.profile.bio || "";
  queueUsernameAvailabilityCheck(handle.value);
}

async function loadExistingProfile() {
  loadingExisting.value = true;
  profileError.value = "";

  try {
    await auth.ensureInitialized();
    await sites.fetchSites();

    const profileSite = sites.sites.find(
      (site) => (site.site_type || "profile") === "profile",
    );
    existingProfileUsername.value = profileSite?.username || null;

    if (profileSite) {
      const content = await sites.getSiteContent(profileSite.username);
      if (content?.ok && content.profile) {
        preserveExistingSiteContent.value = true;
        wizard.loadFromSiteContent(
          content.profile,
          content.pages,
          content.posts,
          content.products || [],
          profileSite.username,
          profileSite.published_at || null,
        );
      } else {
        preserveExistingSiteContent.value = false;
        wizard.reset();
        wizard.username = profileSite.username;
        wizard.isUsernameAvailable = true;
        applyStarterProfileScope();
        wizard.updateProfile({
          name: auth.user?.name || "",
          handle: profileSite.username,
        });
      }
    } else {
      preserveExistingSiteContent.value = false;
      const suggestedHandle = normalizeUsername(
        auth.user?.username ||
          auth.user?.email?.split("@")[0] ||
          auth.user?.name ||
          "",
      );
      wizard.reset();
      wizard.username = suggestedHandle;
      applyStarterProfileScope();
      wizard.updateProfile({
        name: auth.user?.name || "",
        handle: suggestedHandle,
      });
    }

    hydrateFormFromWizard();
  } catch (error) {
    profileError.value =
      error instanceof Error ? error.message : "Could not load your profile.";
  } finally {
    loadingExisting.value = false;
  }
}

async function saveStarterProfile() {
  if (!canSave.value) return;

  profileError.value = "";
  successMessage.value = "";
  publishedUrl.value = "";
  syncWizardProfile();
  if (!preserveExistingSiteContent.value) {
    applyStarterProfileScope();
    syncWizardProfile();
  }
  wizard.isUsernameAvailable = true;

  const ok = await publish({ celebrate: false, openSite: false });
  if (!ok) {
    profileError.value = publishError.value || "Could not save your profile.";
    return;
  }

  await sites.fetchSites();
  existingProfileUsername.value = normalizedHandle.value;
  publishedUrl.value = await resolvePublicProfileUrl(normalizedHandle.value);
  successMessage.value = "Profile saved.";

  if (safeRedirect.value) {
    navigateToSafeRedirect(safeRedirect.value);
  }
}

watch(handle, (value) => {
  const cleaned = normalizeUsername(value);
  if (cleaned !== value) {
    handle.value = cleaned;
    return;
  }
  syncWizardProfile();
  queueUsernameAvailabilityCheck(cleaned);
});

watch([name, bio], syncWizardProfile);

onMounted(loadExistingProfile);
onBeforeUnmount(clearUsernameCheck);
</script>

<template>
  <div class="create-profile-page">
    <header class="create-profile-topbar">
      <Button to="/account" color="ghost" size="compact" shape="soft">
        <template #icon>
          <UiIcon name="ArrowLeft" :size="16" />
        </template>
        Account
      </Button>
    </header>

    <main class="create-profile-main">
      <section class="profile-editor" aria-labelledby="create-profile-title">
        <div class="profile-editor__copy">
          <h1 id="create-profile-title">Create your ME3 profile</h1>
          <p>Name, avatar, handle, and a short bio for Soulink and ME3.</p>
        </div>

        <form class="profile-form" autocomplete="off" @submit.prevent="saveStarterProfile">
          <p v-if="loadingExisting" class="status-row">Loading profile...</p>

          <label class="field" for="profile-name">
            <span>Name</span>
            <input
              id="profile-name"
              v-model="name"
              type="text"
              maxlength="100"
              placeholder="Alex Smith"
              :disabled="loadingExisting || isPublishing"
              required
            />
          </label>

          <label class="field" for="profile-handle">
            <span>Handle</span>
            <div class="handle-input">
              <span class="handle-prefix">@</span>
              <input
                id="profile-handle"
                v-model="handle"
                type="text"
                maxlength="30"
                placeholder="alex"
                inputmode="text"
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                :disabled="loadingExisting || isPublishing"
                required
              />
            </div>
          </label>

          <p v-if="isCheckingUsername" class="field-hint">
            Checking availability...
          </p>
          <p
            v-else-if="
              normalizedHandle.length >= 3 && isUsernameAvailable === true
            "
            class="success"
          >
            @{{ normalizedHandle }} is available.
          </p>
          <p
            v-else-if="
              normalizedHandle.length >= 3 && isUsernameAvailable === false
            "
            class="error"
          >
            This handle is already taken.
          </p>
          <p v-else-if="usernameMessage" class="field-hint">
            {{ usernameMessage }}
          </p>

          <label class="field" for="profile-bio">
            <span>Bio</span>
            <textarea
              id="profile-bio"
              v-model="bio"
              rows="4"
              maxlength="160"
              placeholder="A short note about you."
              :disabled="loadingExisting || isPublishing"
            />
          </label>

          <WizardAvatar />

          <p v-if="publishProgress" class="field-hint">{{ publishProgress }}</p>
          <p v-if="profileError || publishError" class="error">
            {{ profileError || publishError }}
          </p>
          <p v-if="successMessage" class="success">{{ successMessage }}</p>

          <div class="form-actions">
            <Button
              color="primary"
              size="medium"
              shape="soft"
              type="submit"
              :disabled="!canSave"
            >
              <template #icon>
                <UiIcon
                  :name="isPublishing ? 'LoaderCircle' : 'Save'"
                  :size="17"
                />
              </template>
              {{ isPublishing ? "Saving..." : "Save profile" }}
            </Button>

            <a
              v-if="publishedUrl"
              class="profile-link"
              :href="publishedUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <UiIcon name="ExternalLink" :size="15" />
              {{ publishedUrlLabel }}
            </a>
          </div>
        </form>
      </section>

      <aside class="profile-preview-shell" aria-label="Profile preview">
        <ProfilePreview
          :profile="starterPreviewProfile"
          :pages="[]"
          :posts="[]"
          :products="[]"
          :testimonials="[]"
          :blogEnabled="false"
          :shopEnabled="false"
          :testimonialsEnabled="false"
          :blogTitle="wizard.blogTitle"
          :shopTitle="wizard.shopTitle"
          :testimonialsPlacement="wizard.testimonialsPlacement"
          :testimonialsTitle="wizard.testimonialsTitle"
          :vibe="wizard.vibe"
          :accentOverride="wizard.accentOverride"
          compact
        />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.create-profile-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.create-profile-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 64px;
  padding: 16px clamp(16px, 4vw, 40px);
  box-sizing: border-box;
}

.create-profile-main {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 24px clamp(16px, 4vw, 40px) 56px;
  display: grid;
  grid-template-columns: minmax(0, 520px) minmax(320px, 1fr);
  gap: clamp(24px, 5vw, 56px);
  align-items: start;
  box-sizing: border-box;
}

.profile-editor {
  display: grid;
  gap: 24px;
}

.profile-editor__copy {
  display: grid;
  gap: 10px;
}

.profile-editor__copy h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.05;
  letter-spacing: 0;
}

.profile-editor__copy p {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  line-height: 1.5;
  font-size: 16px;
}

.profile-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text, var(--color-text));
}

.field input,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 15px;
  line-height: 1.4;
  padding: 12px 14px;
}

.field textarea {
  min-height: 112px;
  resize: vertical;
}

.field input:focus,
.field textarea:focus {
  outline: 2px solid var(--ui-accent-soft, var(--color-border));
  outline-offset: 2px;
  border-color: var(--ui-accent, var(--color-text));
}

.field input:disabled,
.field textarea:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.handle-input {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface, var(--color-bg));
  overflow: hidden;
}

.handle-prefix {
  padding: 0 0 0 14px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-weight: 700;
}

.handle-input input {
  border: 0;
  border-radius: 0;
}

.handle-input:focus-within {
  outline: 2px solid var(--ui-accent-soft, var(--color-border));
  outline-offset: 2px;
  border-color: var(--ui-accent, var(--color-text));
}

.handle-input:focus-within input {
  outline: none;
}

.status-row,
.field-hint,
.success,
.error {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}

.status-row,
.field-hint {
  color: var(--ui-text-muted, var(--color-text-muted));
}

.success {
  color: var(--ui-accent-strong, #047857);
  font-weight: 650;
}

.error {
  color: var(--color-danger, #b91c1c);
  font-weight: 650;
}

.form-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 4px;
}

.profile-link {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  color: var(--ui-text, var(--color-text));
  font-size: 13px;
  font-weight: 700;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}

.profile-link svg {
  flex: 0 0 auto;
}

.profile-preview-shell {
  position: sticky;
  top: 24px;
  min-width: 0;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 16px);
  background: var(--ui-surface, var(--color-bg));
  overflow: hidden;
}

:deep(.step-avatar) {
  display: grid;
  gap: 16px;
}

:deep(.step-avatar h2) {
  margin: 0;
  font-size: 15px;
  line-height: 1.25;
  letter-spacing: 0;
}

@media (max-width: 900px) {
  .create-profile-main {
    grid-template-columns: minmax(0, 1fr);
  }

  .profile-preview-shell {
    position: static;
  }
}

@media (max-width: 560px) {
  .create-profile-topbar {
    min-height: 56px;
  }

  .create-profile-main {
    padding-top: 12px;
  }

  .form-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .profile-link {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
}
</style>
