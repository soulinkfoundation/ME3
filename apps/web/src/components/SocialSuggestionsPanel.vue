<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppDialog from "./AppDialog.vue";
import Button from "./Button.vue";
import UiIcon from "./UiIcon.vue";
import {
  useSocialStore,
  type SocialAccountRow,
  type SocialPlatform,
  type SocialPlatformCapabilities,
  type SocialPostDetail,
  type SocialSuggestion,
} from "../stores/social";

const props = defineProps<{
  open: boolean;
  siteId: string;
  capabilities: SocialPlatformCapabilities[];
  accounts: SocialAccountRow[];
}>();

const emit = defineEmits<{
  close: [];
  chosen: [post: SocialPostDetail];
  count: [count: number];
}>();

type SuggestionDraft = {
  bodyText: string;
  quoteTrimmed: boolean;
  platforms: SocialPlatform[];
};

const social = useSocialStore();
const suggestions = ref<SocialSuggestion[]>([]);
const drafts = ref<Record<string, SuggestionDraft>>({});
const loading = ref(false);
const savingId = ref<string | null>(null);
const error = ref("");
const notice = ref("");

const availablePlatforms = computed(() =>
  props.capabilities.filter((capability) => capability.draft).map((capability) => capability.platform),
);

const sourceGroups = computed(() => {
  const groups = new Map<string, { key: string; title: string; suggestions: SocialSuggestion[] }>();
  for (const suggestion of suggestions.value) {
    const key = `${suggestion.sourceType}:${suggestion.sourceRef}`;
    const group = groups.get(key) || {
      key,
      title: suggestion.sourceTitle,
      suggestions: [],
    };
    group.suggestions.push(suggestion);
    groups.set(key, group);
  }
  return [...groups.values()];
});

watch(
  () => [props.open, props.siteId] as const,
  ([open]) => {
    if (open && props.siteId) void loadSuggestions();
  },
  { immediate: true },
);

async function loadSuggestions() {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    suggestions.value = await social.fetchSocialSuggestions(props.siteId);
    const nextDrafts: Record<string, SuggestionDraft> = {};
    for (const suggestion of suggestions.value) {
      nextDrafts[suggestion.id] = {
        bodyText: suggestion.bodyText,
        quoteTrimmed: suggestion.quoteTrimmed,
        platforms: suggestion.choosingPlatforms || defaultPlatforms(),
      };
    }
    drafts.value = nextDrafts;
    emit("count", suggestions.value.length);
  } catch (value) {
    social.setErrorFromApi(value, "Failed to load Social Suggestions");
    error.value = social.error || "Failed to load Social Suggestions";
  } finally {
    loading.value = false;
  }
}

function defaultPlatforms(): SocialPlatform[] {
  const connected = availablePlatforms.value.filter((platform) =>
    props.accounts.some(
      (account) =>
        account.siteId === props.siteId &&
        account.platform === platform &&
        account.status === "active",
    ),
  );
  if (connected.length === 1) return connected;
  if (connected.includes("linkedin")) return ["linkedin"];
  return availablePlatforms.value[0] ? [availablePlatforms.value[0]] : [];
}

function suggestionLabel(suggestion: SocialSuggestion): string {
  if (suggestion.kind === "short_post") return "Short Post";
  if (suggestion.kind === "carousel_outline") return "Carousel outline";
  return suggestion.kind === "thread" ? "Thread" : "Quote";
}

function sourceTypeLabel(suggestion: SocialSuggestion): string {
  if (suggestion.sourceType === "mission_task") return "Mission Control";
  if (suggestion.sourceType === "journal") return "Journal";
  if (suggestion.sourceType === "site") return "Site";
  if (suggestion.sourceType === "file") return "File";
  if (suggestion.sourceType === "script") return "Script";
  return "Pasted text";
}

function platformLabel(platform: SocialPlatform): string {
  if (platform === "x") return "X";
  if (platform === "linkedin") return "LinkedIn";
  return platform === "instagram_business" ? "Instagram Business" : "Instagram";
}

function draftFor(suggestion: SocialSuggestion): SuggestionDraft {
  return drafts.value[suggestion.id] || {
    bodyText: suggestion.bodyText,
    quoteTrimmed: suggestion.quoteTrimmed,
    platforms: [],
  };
}

function updateBody(suggestion: SocialSuggestion, value: string) {
  drafts.value = {
    ...drafts.value,
    [suggestion.id]: { ...draftFor(suggestion), bodyText: value },
  };
}

function updateQuoteTrimmed(suggestion: SocialSuggestion, value: boolean) {
  drafts.value = {
    ...drafts.value,
    [suggestion.id]: { ...draftFor(suggestion), quoteTrimmed: value },
  };
}

function togglePlatform(suggestion: SocialSuggestion, platform: SocialPlatform) {
  const draft = draftFor(suggestion);
  const platforms = draft.platforms.includes(platform)
    ? draft.platforms.filter((value) => value !== platform)
    : [...draft.platforms, platform];
  drafts.value = { ...drafts.value, [suggestion.id]: { ...draft, platforms } };
}

function isDirty(suggestion: SocialSuggestion): boolean {
  const draft = draftFor(suggestion);
  return draft.bodyText.trim() !== suggestion.bodyText ||
    draft.quoteTrimmed !== suggestion.quoteTrimmed;
}

async function saveSuggestion(suggestion: SocialSuggestion): Promise<SocialSuggestion | null> {
  const draft = draftFor(suggestion);
  if (!draft.bodyText.trim()) return null;
  if (!isDirty(suggestion)) return suggestion;
  savingId.value = suggestion.id;
  error.value = "";
  try {
    const updated = await social.updateSocialSuggestion(suggestion.id, {
      expectedUpdatedAt: suggestion.updatedAt,
      bodyText: draft.bodyText,
      quoteTrimmed: suggestion.kind === "quote" ? draft.quoteTrimmed : undefined,
    });
    replaceSuggestion(updated);
    notice.value = `${suggestionLabel(updated)} Suggestion saved.`;
    return updated;
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save this Suggestion");
    error.value = social.error || "Failed to save this Suggestion";
    return null;
  } finally {
    savingId.value = null;
  }
}

async function chooseSuggestion(suggestion: SocialSuggestion) {
  const draft = draftFor(suggestion);
  if (!draft.bodyText.trim() || draft.platforms.length === 0) return;
  const saved = await saveSuggestion(suggestion);
  if (!saved) return;
  savingId.value = suggestion.id;
  error.value = "";
  notice.value = "";
  try {
    const chosen = await social.chooseSocialSuggestion(
      saved.id,
      draft.platforms,
      saved.updatedAt,
    );
    await removeSuggestion(saved.id);
    notice.value = `${suggestionLabel(saved)} saved as a separate Post for review.`;
    emit("chosen", chosen.post);
  } catch (value) {
    social.setErrorFromApi(value, "Failed to save this Suggestion as a Post");
    error.value = social.error || "Failed to save this Suggestion as a Post";
  } finally {
    savingId.value = null;
  }
}

async function discardSuggestion(suggestion: SocialSuggestion) {
  if (!window.confirm(`Discard this ${suggestionLabel(suggestion)} Suggestion?`)) return;
  savingId.value = suggestion.id;
  error.value = "";
  notice.value = "";
  try {
    await social.discardSocialSuggestion(suggestion.id, suggestion.updatedAt);
    await removeSuggestion(suggestion.id);
    notice.value = `${suggestionLabel(suggestion)} Suggestion discarded.`;
  } catch (value) {
    social.setErrorFromApi(value, "Failed to discard this Suggestion");
    error.value = social.error || "Failed to discard this Suggestion";
  } finally {
    savingId.value = null;
  }
}

function replaceSuggestion(updated: SocialSuggestion) {
  suggestions.value = suggestions.value.map((suggestion) =>
    suggestion.id === updated.id ? updated : suggestion,
  );
  drafts.value = {
    ...drafts.value,
    [updated.id]: { ...draftFor(updated), bodyText: updated.bodyText, quoteTrimmed: updated.quoteTrimmed },
  };
}

function suggestionElementId(id: string): string {
  return `social-suggestion-${id}`;
}

async function removeSuggestion(id: string) {
  const removedIndex = suggestions.value.findIndex((suggestion) => suggestion.id === id);
  suggestions.value = suggestions.value.filter((suggestion) => suggestion.id !== id);
  const remaining = { ...drafts.value };
  delete remaining[id];
  drafts.value = remaining;
  emit("count", suggestions.value.length);
  await nextTick();
  const focusTarget = suggestions.value[Math.min(removedIndex, suggestions.value.length - 1)];
  const element = focusTarget
    ? document.getElementById(suggestionElementId(focusTarget.id))
    : document.getElementById("social-suggestions-title");
  element?.focus({ preventScroll: true });
}
</script>

<template>
  <AppDialog :open="open" labelled-by="social-suggestions-title" @close="emit('close')">
    <section class="suggestions-panel" aria-labelledby="social-suggestions-title">
      <header class="suggestions-panel__header">
        <div>
          <h2 id="social-suggestions-title" tabindex="-1">Social Suggestions</h2>
          <p>Review the Source text before choosing anything as a Post.</p>
        </div>
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          type="button"
          aria-label="Close Social Suggestions"
          @click="emit('close')"
        >
          <UiIcon name="X" :size="17" aria-hidden="true" />
        </Button>
      </header>

      <p v-if="error" class="suggestions-panel__message suggestions-panel__message--error" role="alert">
        {{ error }}
      </p>
      <p v-if="notice" class="suggestions-panel__message" role="status" aria-live="polite">
        {{ notice }}
      </p>

      <div v-if="loading" class="suggestions-empty" role="status">Loading Suggestions…</div>
      <div v-else-if="suggestions.length === 0" class="suggestions-empty">
        <strong>No Suggestions waiting for review.</strong>
        <span>Ask the agent to repurpose one Journal entry or Mission Control task.</span>
      </div>

      <div v-else class="suggestion-groups">
        <section
          v-for="group in sourceGroups"
          :key="group.key"
          class="suggestion-group"
          :aria-label="`Suggestions from ${group.title}`"
        >
          <header class="suggestion-group__header">
            <span>Source</span>
            <h3>{{ group.title }}</h3>
            <small>{{ sourceTypeLabel(group.suggestions[0]!) }}</small>
          </header>

          <article
            v-for="suggestion in group.suggestions"
            :id="suggestionElementId(suggestion.id)"
            :key="suggestion.id"
            class="suggestion-card"
            tabindex="-1"
          >
            <header class="suggestion-card__header">
              <h4>{{ suggestionLabel(suggestion) }}</h4>
              <span v-if="suggestion.kind === 'quote' && draftFor(suggestion).quoteTrimmed">
                Trimmed from Source
              </span>
              <span v-else-if="suggestion.status === 'choosing'">
                Saving as Post
              </span>
            </header>

            <label class="suggestion-field">
              <span>Suggestion</span>
              <textarea
                :value="draftFor(suggestion).bodyText"
                rows="5"
                :disabled="savingId === suggestion.id || suggestion.status === 'choosing'"
                @input="updateBody(suggestion, ($event.target as HTMLTextAreaElement).value)"
              />
            </label>

            <label v-if="suggestion.kind === 'quote'" class="trim-control">
              <input
                type="checkbox"
                :checked="draftFor(suggestion).quoteTrimmed"
                :disabled="savingId === suggestion.id || suggestion.status === 'choosing'"
                @change="updateQuoteTrimmed(suggestion, ($event.target as HTMLInputElement).checked)"
              />
              <span>This Quote removes words from the Source</span>
            </label>

            <div class="source-evidence">
              <strong>Source text</strong>
              <blockquote>{{ suggestion.sourceExcerpt }}</blockquote>
              <details>
                <summary>View full Source</summary>
                <p>{{ suggestion.sourceText }}</p>
              </details>
            </div>

            <fieldset>
              <legend>Post Versions</legend>
              <div class="platform-options">
                <button
                  v-for="platform in availablePlatforms"
                  :key="platform"
                  type="button"
                  :aria-pressed="draftFor(suggestion).platforms.includes(platform)"
                  :class="{ 'platform-option--active': draftFor(suggestion).platforms.includes(platform) }"
                  :disabled="savingId === suggestion.id || suggestion.status === 'choosing'"
                  @click="togglePlatform(suggestion, platform)"
                >
                  {{ platformLabel(platform) }}
                </button>
              </div>
            </fieldset>

            <footer class="suggestion-actions">
              <Button
                color="ghost"
                shape="soft"
                size="compact"
                type="button"
                :disabled="savingId === suggestion.id || suggestion.status === 'choosing'"
                @click="discardSuggestion(suggestion)"
              >
                Discard
              </Button>
              <Button
                color="outline"
                shape="soft"
                size="compact"
                type="button"
                :disabled="savingId === suggestion.id || suggestion.status === 'choosing' || !isDirty(suggestion) || !draftFor(suggestion).bodyText.trim()"
                @click="saveSuggestion(suggestion)"
              >
                Save edit
              </Button>
              <Button
                color="primary"
                shape="soft"
                size="compact"
                type="button"
                :disabled="savingId === suggestion.id || !draftFor(suggestion).bodyText.trim() || draftFor(suggestion).platforms.length === 0"
                @click="chooseSuggestion(suggestion)"
              >
                {{ suggestion.status === "choosing" ? "Finish saving Post" : "Save as Post" }}
              </Button>
            </footer>
          </article>
        </section>
      </div>
    </section>
  </AppDialog>
</template>

<style scoped>
.suggestions-panel {
  width: min(820px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  box-sizing: border-box;
  padding: 20px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow-md);
}

.suggestions-panel__header,
.suggestion-card__header,
.suggestion-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.suggestions-panel__header h2,
.suggestions-panel__header p,
.suggestion-group__header h3,
.suggestion-card h4 {
  margin: 0;
}

.suggestions-panel__header p,
.suggestion-group__header small,
.suggestion-card__header span {
  color: var(--ui-text-muted);
}

.suggestions-panel__header p {
  margin-top: 4px;
}

.suggestions-panel__header :deep(button),
.suggestion-actions :deep(button) {
  min-height: 44px;
}

.suggestions-panel__header :deep(button) {
  min-width: 44px;
}

.suggestions-panel__message {
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.suggestions-panel__message--error {
  border-color: color-mix(in srgb, #c94b4b 45%, var(--ui-border));
}

.suggestions-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 220px;
  color: var(--ui-text-muted);
  text-align: center;
}

.suggestion-groups,
.suggestion-group,
.suggestion-card,
.suggestion-field,
.source-evidence {
  display: grid;
  gap: 12px;
}

.suggestion-groups {
  margin-top: 18px;
  gap: 24px;
}

.suggestion-group__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ui-border);
}

.suggestion-group__header > span,
.suggestion-field > span,
.source-evidence > strong,
.suggestion-card legend {
  font-size: 0.8rem;
  font-weight: 700;
}

.suggestion-card {
  padding: 16px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.suggestion-field textarea {
  width: 100%;
  min-height: 120px;
  box-sizing: border-box;
  resize: vertical;
  padding: 12px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
  line-height: 1.5;
}

.suggestion-field textarea:focus-visible,
.platform-options button:focus-visible,
.trim-control input:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.trim-control {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
}

.trim-control input {
  width: 20px;
  height: 20px;
}

.source-evidence {
  padding: 12px;
  border-left: 3px solid var(--ui-accent);
  background: var(--ui-surface);
}

.source-evidence blockquote,
.source-evidence p {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

.source-evidence blockquote {
  color: var(--ui-text-muted);
}

.source-evidence summary {
  min-height: 44px;
  cursor: pointer;
  line-height: 44px;
}

.suggestion-card fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.platform-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.platform-options button {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  cursor: pointer;
}

.platform-options button.platform-option--active {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
}

.suggestion-actions {
  justify-content: flex-end;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .suggestions-panel {
    width: 100vw;
    max-height: 92vh;
    padding: 16px;
    border-radius: var(--ui-radius-lg) var(--ui-radius-lg) 0 0;
  }

  .suggestion-group__header {
    grid-template-columns: 1fr;
  }

  .suggestion-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
