<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SocialAccountRow } from "../stores/social";
import { buildSocialPreviewContent } from "../utils/social-preview";

type SupportedPlatform =
  | "x"
  | "linkedin"
  | "instagram"
  | "instagram_business"
  | "youtube";

const props = defineProps<{
  profile: {
    name: string;
    handle: string;
    avatar: string | null;
    /** Shown as LinkedIn headline line (truncated) when present */
    bio?: string;
    blogPath?: string;
  };
  post: {
    title: string;
    slug: string;
    type: "article" | "video" | "social";
    caption: string;
    excerpt: string;
    content: string;
    images: string[];
    mediaUrl: string | null;
    mediaThumbnail: string | null;
  };
  connectedAccounts: SocialAccountRow[];
  selectedPlatforms: SupportedPlatform[];
}>();

const platformMeta: Record<
  SupportedPlatform,
  {
    label: string;
    badgeLabel: string;
    badgeClass: string;
  }
> = {
  x: {
    label: "X",
    badgeLabel: "X",
    badgeClass: "preview-badge-x",
  },
  linkedin: {
    label: "LinkedIn",
    badgeLabel: "in",
    badgeClass: "preview-badge-linkedin",
  },
  instagram: {
    label: "Instagram",
    badgeLabel: "IG",
    badgeClass: "preview-badge-instagram",
  },
  instagram_business: {
    label: "Instagram (Business)",
    badgeLabel: "IG+",
    badgeClass: "preview-badge-instagram-business",
  },
  youtube: {
    label: "YouTube",
    badgeLabel: "YT",
    badgeClass: "preview-badge-youtube",
  },
};

const selectedAccounts = computed(() =>
  props.connectedAccounts.filter((account) =>
    props.selectedPlatforms.includes(account.platform as SupportedPlatform),
  ),
);

const previewCards = computed(() =>
  selectedAccounts.value.map((account) => {
    const platform = account.platform as SupportedPlatform;
    return {
      platform,
      account,
      meta: platformMeta[platform],
      content: buildSocialPreviewContent(
        platform,
        props.post,
        props.profile.handle,
        props.profile.blogPath,
      ),
    };
  }),
);

const activePlatform = ref<SupportedPlatform | null>(null);

const activeCard = computed(() => {
  if (!previewCards.value.length) return null;
  const platform =
    activePlatform.value && previewCards.value.some((card) => card.platform === activePlatform.value)
      ? activePlatform.value
      : previewCards.value[0].platform;
  return previewCards.value.find((card) => card.platform === platform) || null;
});

const initials = computed(() => {
  const source = props.profile.name || props.profile.handle || "me3";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
});

const linkedinImages = computed(() =>
  props.post.images.filter((url) => typeof url === "string" && url.length > 0),
);

const linkedinSlideIndex = ref(0);

const linkedinHeadline = computed(() => {
  const raw = (props.profile.bio || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  return raw.length > 52 ? `${raw.slice(0, 49)}…` : raw;
});

function linkedinPrevSlide() {
  const n = linkedinImages.value.length;
  if (n <= 1) return;
  linkedinSlideIndex.value = (linkedinSlideIndex.value - 1 + n) % n;
}

function linkedinNextSlide() {
  const n = linkedinImages.value.length;
  if (n <= 1) return;
  linkedinSlideIndex.value = (linkedinSlideIndex.value + 1) % n;
}

const linkedinCurrentImageUrl = computed(() => {
  const imgs = linkedinImages.value;
  if (!imgs.length) return null;
  const i = Math.min(Math.max(0, linkedinSlideIndex.value), imgs.length - 1);
  return imgs[i];
});

/** Safe `url(...)` for CSS background-image */
const linkedinBlurBgStyle = computed(() => {
  const u = linkedinCurrentImageUrl.value;
  if (!u) return {};
  return { backgroundImage: `url(${JSON.stringify(u)})` };
});

watch(
  () => linkedinImages.value.join("|"),
  () => {
    linkedinSlideIndex.value = 0;
  },
);

watch(
  () => linkedinImages.value.length,
  (len) => {
    if (linkedinSlideIndex.value >= len) {
      linkedinSlideIndex.value = Math.max(0, len - 1);
    }
  },
);

watch(
  () => activeCard.value?.platform,
  () => {
    linkedinSlideIndex.value = 0;
  },
);

watch(
  () => props.selectedPlatforms.join(","),
  () => {
    if (
      activePlatform.value &&
      !props.selectedPlatforms.includes(activePlatform.value)
    ) {
      activePlatform.value = props.selectedPlatforms[0] || null;
    }
    if (!activePlatform.value && props.selectedPlatforms.length > 0) {
      activePlatform.value = props.selectedPlatforms[0];
    }
  },
  { immediate: true },
);
</script>

<template>
  <section v-if="activeCard" class="social-preview-rail">
    <div class="preview-tabs" role="tablist" aria-label="Social preview tabs">
      <button
        v-for="card in previewCards"
        :key="card.platform"
        type="button"
        class="preview-tab"
        :class="{ 'preview-tab--active': activeCard?.platform === card.platform }"
        role="tab"
        :aria-selected="activeCard?.platform === card.platform"
        @click="activePlatform = card.platform"
      >
        {{ card.meta.label }}
      </button>
    </div>

    <div class="preview-card-row">
      <!-- LinkedIn: single-image carousel, 1/n badge, blurred letterbox, engagement bar -->
      <article v-if="activeCard.platform === 'linkedin'" class="preview-card preview-card--linkedin">
        <header class="li-header">
          <div class="li-header-main">
            <div class="preview-avatar-shell li-avatar-shell">
              <img
                v-if="profile.avatar"
                :src="profile.avatar"
                :alt="profile.name"
                class="preview-avatar"
              />
              <span v-else class="preview-avatar preview-avatar-fallback">
                {{ initials }}
              </span>
            </div>
            <div class="li-header-text">
              <div class="li-name-row">
                <strong class="li-name">{{ profile.name || profile.handle }}</strong>
                <span class="li-you">• You</span>
              </div>
              <p v-if="linkedinHeadline" class="li-headline">{{ linkedinHeadline }}</p>
              <div class="li-meta">
                <span>Just now</span>
                <span class="li-meta-sep">·</span>
                <span class="li-globe-wrap" aria-hidden="true" title="Public">
                  <svg class="li-globe" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path
                      d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm-.5 1.1c.2.5.4 1.1.5 1.7H8c-.2-.6-.4-1.2-.5-1.7zM5.3 2.2c.3.6.5 1.3.7 2H3.5a6.8 6.8 0 0 1 1.8-2zm5.4 0a6.8 6.8 0 0 1 1.8 2H10c.2-.7.4-1.4.7-2zM2.5 5.3h2.6c.1.7.2 1.4.2 2.1v1.2H1.2a6.9 6.9 0 0 1 1.3-3.3zm3.1 0h4.8c.1.7.2 1.4.2 2.1v1.2H5.4V7.4c0-.7.1-1.4.2-2.1zm5.9 0h2.6a6.9 6.9 0 0 1 1.3 3.3h-3.1V7.4c0-.7.1-1.4.2-2.1zM1.2 10.7h3.1v.5c0 .7.1 1.4.2 2.1H2.5a6.9 6.9 0 0 1-1.3-2.6zm4.2 0h4.8v.5c0 .7.1 1.4.2 2.1H5.4c.1-.7.2-1.4.2-2.1zm5.9 0h3.1a6.9 6.9 0 0 1-1.3 2.6H10c.1-.7.2-1.4.2-2.1v-.5zM5.3 13.8c.3-.6.5-1.3.7-2H3.5a6.8 6.8 0 0 0 1.8 2zm2.2.7c-.2-.6-.4-1.2-.5-1.7h1c-.2.5-.4 1.1-.5 1.7zm2.2-.7H10c.2.7.4 1.4.7 2a6.8 6.8 0 0 0-1.8-2z"
                    />
                  </svg>
                </span>
              </div>
            </div>
          </div>
          <button type="button" class="li-more" aria-label="Open post menu">
            <span aria-hidden="true">⋯</span>
          </button>
        </header>

        <div class="preview-body li-body">
          <p>{{ activeCard.content.body }}</p>
        </div>

        <div
          v-if="
            linkedinImages.length > 0 ||
              (post.type === 'video' && (post.mediaThumbnail || post.mediaUrl))
          "
          class="li-media-outer"
        >
          <div v-if="linkedinImages.length > 0" class="li-media-stage">
            <div class="li-media-blur" :style="linkedinBlurBgStyle" aria-hidden="true" />
            <img
              v-if="linkedinCurrentImageUrl"
              :src="linkedinCurrentImageUrl"
              :alt="`Image ${linkedinSlideIndex + 1} of ${linkedinImages.length}`"
              class="li-media-main"
            />
            <div
              v-if="linkedinImages.length > 1"
              class="li-media-count"
              aria-live="polite"
            >
              {{ linkedinSlideIndex + 1 }}/{{ linkedinImages.length }}
            </div>
            <div v-if="linkedinImages.length > 1" class="li-media-nav">
              <button
                type="button"
                class="li-media-nav-btn"
                aria-label="Previous image"
                @click="linkedinPrevSlide"
              >
                ‹
              </button>
              <button
                type="button"
                class="li-media-nav-btn"
                aria-label="Next image"
                @click="linkedinNextSlide"
              >
                ›
              </button>
            </div>
          </div>
          <div v-else class="li-media-stage li-media-stage--video">
            <div class="preview-media-thumb preview-media-thumb--video li-video-fallback">
              <span>Video ready</span>
            </div>
          </div>
        </div>

        <footer class="preview-link-card li-link-card">
          <div>
            <span class="preview-link-domain">
              {{ post.type === "social" ? "LinkedIn" : `${profile.handle}.example.com` }}
            </span>
            <strong>
              {{ post.type === "social" ? post.title || "Social post" : post.title }}
            </strong>
          </div>
          <span class="preview-cta">{{ activeCard.content.ctaLabel }}</span>
        </footer>

        <div class="li-engagement" aria-hidden="true">
          <span class="li-eng-item" title="Like">
            <svg
              class="li-eng-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M14 9V5a3 3 0 0 0-5-2.2L5 11v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3H14zM2 21V11a2 2 0 0 1 2-2h2v12H4a2 2 0 0 1-2-2z"
              />
            </svg>
          </span>
          <span class="li-eng-item" title="Comment">
            <svg
              class="li-eng-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span class="li-eng-item" title="Repost">
            <svg
              class="li-eng-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </span>
          <span class="li-eng-item" title="Send">
            <svg
              class="li-eng-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </span>
        </div>
      </article>

      <article v-else class="preview-card">
        <header class="preview-card-header">
          <div class="preview-identity">
            <div class="preview-avatar-shell">
              <img
                v-if="profile.avatar"
                :src="profile.avatar"
                :alt="profile.name"
                class="preview-avatar"
              />
              <span v-else class="preview-avatar preview-avatar-fallback">
                {{ initials }}
              </span>
              <span class="preview-badge" :class="activeCard.meta.badgeClass">
                {{ activeCard.meta.badgeLabel }}
              </span>
            </div>
            <div>
              <strong>{{ profile.name || profile.handle }}</strong>
              <div class="preview-handle">
                @{{ activeCard.account.handle || profile.handle }}
              </div>
            </div>
          </div>
          <span class="preview-platform-label">{{ activeCard.meta.label }}</span>
        </header>

        <div class="preview-body">
          <p>{{ activeCard.content.body }}</p>
        </div>

        <div
          v-if="post.images.length > 0 || (post.type === 'video' && (post.mediaThumbnail || post.mediaUrl))"
          class="preview-media-grid"
        >
          <template v-if="post.images.length > 0">
            <img
              v-for="(image, index) in post.images.slice(0, 4)"
              :key="`${image}-${index}`"
              :src="image"
              :alt="`Preview image ${index + 1}`"
              class="preview-media-thumb"
            />
          </template>
          <div
            v-else
            class="preview-media-thumb preview-media-thumb--video"
          >
            <span>Video ready</span>
          </div>
        </div>

        <footer class="preview-link-card">
          <div>
            <span class="preview-link-domain">
              {{
                post.type === "social"
                  ? activeCard.meta.label
                  : `${profile.handle}.example.com`
              }}
            </span>
            <strong>
              {{ post.type === "social" ? post.title || "Social post" : post.title }}
            </strong>
          </div>
          <span class="preview-cta">{{ activeCard.content.ctaLabel }}</span>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
.social-preview-rail {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 18px;
  background: #fff;
}

.preview-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.preview-tab {
  border: 1px solid var(--color-border);
  background: #fff;
  color: var(--color-text-muted);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.preview-tab--active {
  color: var(--color-text);
  border-color: var(--color-text);
}

.preview-card-row {
  display: block;
}

.preview-card {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  color: var(--color-text);
}

.preview-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.preview-identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-avatar-shell {
  position: relative;
  width: 54px;
  height: 54px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: #fff;
}

.preview-avatar {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  display: grid;
  place-items: center;
  object-fit: cover;
  background: #f3f3f3;
}

.preview-avatar-fallback {
  font-size: 0.85rem;
  font-weight: 800;
}

.preview-badge {
  position: absolute;
  right: -4px;
  bottom: -2px;
  width: 24px;
  height: 24px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 900;
  border: 1px solid #fff;
}

.preview-badge-x {
  background: #111;
  color: #fff;
}

.preview-badge-linkedin {
  background: #0a66c2;
  color: #fff;
}

.preview-badge-instagram {
  background: #c13584;
  color: #fff;
}

.preview-badge-instagram-business {
  background: #1877f2;
  color: #fff;
}

.preview-badge-youtube {
  background: #ff0033;
  color: #fff;
}

.preview-handle,
.preview-platform-label,
.preview-link-domain {
  color: var(--color-text-muted);
}

.preview-platform-label {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.preview-body p {
  white-space: pre-wrap;
  line-height: 1.55;
  margin: 0 0 14px;
}

.preview-link-card {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid var(--color-border);
}

.preview-media-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.preview-media-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: #f3f3f3;
}

.preview-media-thumb--video {
  display: grid;
  place-items: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.preview-link-card strong {
  display: block;
  margin-top: 2px;
}

.preview-cta {
  border-radius: 999px;
  padding: 8px 11px;
  background: #111;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}

/* —— LinkedIn feed–style preview —— */
.preview-card--linkedin {
  padding: 12px 16px 4px;
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 2px 4px rgba(0, 0, 0, 0.06);
}

.li-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.li-header-main {
  display: flex;
  gap: 10px;
  min-width: 0;
}

.li-avatar-shell {
  flex-shrink: 0;
}

.li-header-text {
  min-width: 0;
}

.li-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  font-size: 14px;
  line-height: 1.3;
}

.li-name {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.9);
}

.li-you {
  color: rgba(0, 0, 0, 0.55);
  font-size: 12px;
  font-weight: 400;
}

.li-headline {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.li-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.55);
}

.li-meta-sep {
  user-select: none;
}

.li-globe-wrap {
  display: inline-flex;
  align-items: center;
}

.li-globe {
  width: 14px;
  height: 14px;
  opacity: 0.75;
}

.li-more {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.55);
  font-size: 18px;
  line-height: 1;
  padding: 4px 8px;
  cursor: default;
  border-radius: 4px;
}

.li-body p {
  margin-bottom: 10px;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.9);
}

.li-media-outer {
  margin-left: -16px;
  margin-right: -16px;
  margin-bottom: 8px;
}

.li-media-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1.91 / 1;
  overflow: hidden;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.li-media-blur {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(28px);
  transform: scale(1.12);
  opacity: 0.88;
}

.li-media-main {
  position: relative;
  z-index: 1;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.li-media-count {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.li-media-nav {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
}

.li-media-nav-btn {
  pointer-events: auto;
  width: 32px;
  height: 44px;
  border: none;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  margin: 0 6px;
  border-radius: 4px;
}

.li-media-nav-btn:hover {
  background: rgba(0, 0, 0, 0.5);
}

.li-media-stage--video {
  min-height: 160px;
  background: #0a0a0a;
}

.li-video-fallback {
  position: relative;
  z-index: 1;
  width: 100%;
  max-height: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 0;
}

.li-link-card {
  margin-top: 4px;
  margin-bottom: 0;
}

.li-engagement {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 10px;
  margin-top: 2px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.55);
}

.li-eng-item {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 6px 0;
}

.li-eng-icon {
  width: 22px;
  height: 22px;
}

@media (max-width: 760px) {
  .preview-card-header,
  .preview-link-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
