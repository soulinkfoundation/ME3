<script setup lang="ts">
import Button from "../Button.vue";
import UiIcon from "../UiIcon.vue";
import type { ContentMediaAsset } from "../../stores/content";
import {
  socialPlatformLabel,
  type SupportedSocialPlatform,
} from "../../utils/social-compose";

defineProps<{
  body: string;
  selectedPlatforms: SupportedSocialPlatform[];
  platformOptions: Array<{
    id: SupportedSocialPlatform;
    label: string;
    connected: boolean;
  }>;
  issues: string[];
  mediaManifest: ContentMediaAsset[];
  profile: {
    name: string;
    handle: string;
    avatar: string | null;
    bio?: string;
  };
  saving: boolean;
  saveMode: "bank" | "publish" | null;
  canSubmit: boolean;
  isEditing: boolean;
}>();

const emit = defineEmits<{
  (event: "update:body", value: string): void;
  (event: "toggle-platform", value: SupportedSocialPlatform): void;
  (event: "files-selected", value: File[]): void;
  (event: "remove-media", index: number): void;
  (event: "submit"): void;
  (event: "submit-now"): void;
  (event: "cancel"): void;
}>();

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const files = target?.files ? Array.from(target.files) : [];
  emit("files-selected", files);
  if (target) target.value = "";
}

function onBodyInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit("update:body", target?.value || "");
}

function orbitBadgeClass(platform: SupportedSocialPlatform): string {
  switch (platform) {
    case "linkedin":
      return "social-orbit-badge--linkedin";
    case "instagram":
      return "social-orbit-badge--instagram";
    case "instagram_business":
      return "social-orbit-badge--instagram-business";
    case "youtube":
      return "social-orbit-badge--youtube";
    default:
      return "social-orbit-badge--x";
  }
}

function orbitBadgeLabel(platform: SupportedSocialPlatform): string {
  switch (platform) {
    case "linkedin":
      return "in";
    case "instagram":
      return "IG";
    case "instagram_business":
      return "IG+";
    case "youtube":
      return "YT";
    default:
      return "X";
  }
}

function orbitTooltip(platform: {
  id: SupportedSocialPlatform;
  connected: boolean;
}): string {
  const name = socialPlatformLabel(platform.id);
  return platform.connected
    ? `Toggle ${name}`
    : `Connect ${name} in Accounts to publish there.`;
}
</script>

<template>
  <div class="compose-card">
    <div class="card__head compose-head">
      <div class="compose-head-copy">
        <h2 class="card__title">
          {{ isEditing ? "Edit content item" : "Quick compose" }}
        </h2>
        <p class="compose-lede">
          Write once, save to content bank or publish now.
        </p>
      </div>

      <div class="compose-platforms">
        <div
          class="social-orbit-list"
          role="group"
          aria-label="Select publish platforms"
        >
          <span
            v-for="platform in platformOptions"
            :key="platform.id"
            class="social-orbit-wrap"
            :class="{ 'social-orbit-wrap--disabled': !platform.connected }"
            :title="orbitTooltip(platform)"
          >
            <button
              type="button"
              class="social-orbit"
              :class="{
                'social-orbit--active':
                  platform.connected && selectedPlatforms.includes(platform.id),
              }"
              :disabled="!platform.connected"
              :aria-pressed="
                platform.connected && selectedPlatforms.includes(platform.id)
              "
              :aria-label="orbitTooltip(platform)"
              @click="emit('toggle-platform', platform.id)"
            >
              <span class="social-orbit-avatar-shell">
                <img
                  v-if="platform.connected && profile.avatar"
                  :src="profile.avatar"
                  :alt="profile.name || profile.handle"
                  class="social-orbit-avatar"
                />
                <span v-else class="social-orbit-avatar social-orbit-placeholder">
                  <UiIcon name="User" :size="20" aria-hidden="true" />
                </span>
                <span
                  class="social-orbit-badge"
                  :class="orbitBadgeClass(platform.id)"
                >
                  {{ orbitBadgeLabel(platform.id) }}
                </span>
              </span>
            </button>
          </span>
        </div>
      </div>
    </div>

    <div class="card__body compose-body">
      <label class="compose-field">
        <span class="compose-label">What’s worth sharing?</span>
        <textarea
          class="compose-textarea"
          :value="body"
          rows="7"
          placeholder="Write the post you want to keep in your content bank..."
          @input="onBodyInput"
        />
      </label>

      <div class="compose-field">
        <span class="compose-label">Images</span>
        <label class="upload-box">
          <input
            class="upload-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            @change="onFileChange"
          />
          <span>Add image files</span>
        </label>
        <p class="compose-hint">
          Instagram requires at least one image. The first images are reused
          when you publish.
        </p>
      </div>

      <div v-if="mediaManifest.length > 0" class="media-grid">
        <article
          v-for="(asset, index) in mediaManifest"
          :key="`${asset.url}-${index}`"
          class="media-card"
        >
          <img
            :src="asset.url"
            :alt="asset.filename || `Content image ${index + 1}`"
          />
          <div class="media-card__foot">
            <span>{{ asset.filename || `Image ${index + 1}` }}</span>
            <button
              type="button"
              class="media-remove"
              @click="emit('remove-media', index)"
            >
              Remove
            </button>
          </div>
        </article>
      </div>

      <p v-for="issue in issues" :key="issue" class="compose-issue">
        {{ issue }}
      </p>
    </div>

    <div class="card__foot compose-actions">
      <Button
        color="outline"
        :disabled="!canSubmit || saving"
        @click="emit('submit')"
      >
        {{
          saving && saveMode === "bank"
            ? isEditing
              ? "Saving..."
              : "Adding..."
            : isEditing
              ? "Save changes"
              : "Add to content bank"
        }}
      </Button>
      <Button
        color="primary"
        :disabled="!canSubmit || saving"
        @click="emit('submit-now')"
      >
        {{ saving && saveMode === "publish" ? "Posting..." : "Post now" }}
      </Button>
      <Button
        v-if="isEditing"
        color="secondary"
        :disabled="saving"
        @click="emit('cancel')"
      >
        Cancel
      </Button>
    </div>
  </div>
</template>

<style scoped>
.compose-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.compose-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  min-width: 0;
}

.compose-head-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 0%;
  min-width: 0;
}

.compose-lede,
.compose-hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.compose-body {
  gap: 16px;
}

.compose-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compose-platforms {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  width: max-content;
  /* Room for badge offset (bottom/right) so it is not clipped */
  padding: 2px 2px 4px 0;
}

.compose-label {
  font-size: 13px;
  font-weight: 700;
}

.compose-textarea {
  width: 100%;
  min-height: 160px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 12px 14px;
  font: inherit;
  resize: vertical;
}

.social-orbit-list {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: max-content;
  overflow: visible;
}

.social-orbit-wrap {
  display: inline-flex;
  flex: 0 0 auto;
  border-radius: 999px;
}

.social-orbit-wrap--disabled {
  cursor: not-allowed;
}

.social-orbit {
  border: 1px solid transparent;
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--color-text);
  border-radius: 999px;
  font: inherit;
  flex: 0 0 auto;
}

.social-orbit:disabled {
  cursor: not-allowed;
  pointer-events: none;
}

.social-orbit:disabled .social-orbit-avatar-shell {
  filter: grayscale(1) saturate(0.15);
  opacity: 0.38;
  border-color: var(--color-border);
}

.social-orbit-avatar-shell {
  position: relative;
  width: 42px;
  height: 42px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: #fff;
  filter: grayscale(1) saturate(0.25);
  opacity: 0.6;
  transition:
    filter 0.18s ease,
    opacity 0.18s ease,
    border-color 0.18s ease;
  /* Do not clip the corner badge (matches WizardBlog) */
  overflow: visible;
}

.social-orbit--active .social-orbit-avatar-shell {
  filter: none;
  opacity: 1;
  border-color: var(--color-text);
}

.social-orbit-avatar {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  object-fit: cover;
  display: grid;
  place-items: center;
  background: color-mix(in oklab, var(--color-bg) 88%, black 12%);
}

.social-orbit-placeholder {
  color: color-mix(in oklab, var(--color-text-muted) 76%, var(--color-bg) 24%);
}

.social-orbit-badge {
  position: absolute;
  right: -4px;
  bottom: -2px;
  width: 24px;
  height: 24px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.75rem;
  font-weight: 900;
  border: 1px solid #fff;
  box-sizing: border-box;
}

.social-orbit-badge--x {
  background: #0f1115;
}

.social-orbit-badge--linkedin {
  background: #0a66c2;
}

.social-orbit-badge--instagram {
  background: #c13584;
}

.social-orbit-badge--instagram-business {
  background: #1877f2;
}

.social-orbit-badge--youtube {
  background: #ff0033;
}

.upload-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
}

.upload-input {
  display: none;
}

.media-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
}

.media-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 88px;
  flex: 0 0 88px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.media-card img {
  width: 88px;
  height: 66px;
  object-fit: cover;
  display: block;
}

.media-card__foot {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 6px 8px;
  font-size: 11px;
  min-width: 0;
}

.media-card__foot span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-remove {
  border: 0;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.compose-issue {
  margin: 0;
  font-size: 12px;
  color: var(--color-danger, #c00);
}

.compose-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 760px) {
  .compose-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .compose-platforms {
    align-items: flex-start;
    justify-content: flex-start;
    width: 100%;
    padding-left: 0;
  }

  .social-orbit-list {
    justify-content: flex-start;
    width: 100%;
  }

  .compose-actions {
    flex-direction: column;
  }
}
</style>
