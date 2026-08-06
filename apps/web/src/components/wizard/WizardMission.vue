<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { api } from "../../api";
import { useWizardStore } from "../../stores/wizard";
import UiIcon from "../UiIcon.vue";

const wizard = useWizardStore();

type BusinessSuggestion = {
  positioningStatement: string;
  audience: string;
  primaryProblem: string;
  solution: string;
  targetMarket: string;
  primaryOutcome: string;
  rationale?: string;
  clarityScore?: number;
  confidence?: "low" | "medium" | "high";
};

const DEFAULT_BUSINESS = {
  positioningStatement: "",
  audience: "",
  primaryProblem: "",
  solution: "",
  targetMarket: "",
  primaryOutcome: "",
};

const isSuggestingBusiness = ref(false);
const businessSuggestionError = ref("");
const businessSuggestionSummary = ref("");
const businessSuggestions = ref<BusinessSuggestion[]>([]);
const showBusinessSuggestionsModal = ref(false);
const businessSuggestionsModalRef = ref<HTMLElement | null>(null);
let businessSuggestionsReturnFocus: HTMLElement | null = null;

function buildPositioningStatement(
  audience: string,
  primaryProblem: string,
  solution: string,
) {
  const trimmedAudience = audience.trim();
  const trimmedProblem = primaryProblem.trim();
  const trimmedSolution = solution.trim();

  if (!trimmedAudience) return "";

  const parts = [`I help ${trimmedAudience}`];
  if (trimmedProblem) {
    parts.push(`with ${trimmedProblem}`);
  }
  if (trimmedSolution) {
    parts.push(`by ${trimmedSolution}`);
  }
  return `${parts.join(" ")}.`;
}

function updateBusiness(
  updates: Partial<typeof DEFAULT_BUSINESS>,
  options: { preserveDerived?: boolean } = {},
) {
  const currentBusiness = {
    ...DEFAULT_BUSINESS,
    ...(wizard.profile.business || {}),
  };
  const nextBusiness = {
    ...currentBusiness,
    ...updates,
  };
  const sourceChanged =
    "audience" in updates ||
    "primaryProblem" in updates ||
    "solution" in updates;

  if (sourceChanged) {
    businessSuggestionError.value = "";
    businessSuggestionSummary.value = "";
    const previousGeneratedStatement = buildPositioningStatement(
      currentBusiness.audience,
      currentBusiness.primaryProblem,
      currentBusiness.solution,
    );
    if (
      !currentBusiness.positioningStatement ||
      currentBusiness.positioningStatement === previousGeneratedStatement
    ) {
      nextBusiness.positioningStatement = "";
    }
    if (!options.preserveDerived) {
      nextBusiness.targetMarket = "";
      nextBusiness.primaryOutcome = "";
    }
  } else if ("positioningStatement" in updates) {
    nextBusiness.positioningStatement = updates.positioningStatement || "";
  }

  wizard.updateProfile({
    business: nextBusiness,
  });
}

const businessAudience = computed({
  get: () => wizard.profile.business?.audience || "",
  set: (val: string) => {
    updateBusiness({
      audience: val,
    });
  },
});

const businessPrimaryProblem = computed({
  get: () => wizard.profile.business?.primaryProblem || "",
  set: (val: string) => {
    updateBusiness({
      primaryProblem: val,
    });
  },
});

const businessSolution = computed({
  get: () => wizard.profile.business?.solution || "",
  set: (val: string) => {
    updateBusiness({
      solution: val,
    });
  },
});

const businessPositioningStatement = computed({
  get: () => wizard.profile.business?.positioningStatement || "",
  set: (val: string) => {
    updateBusiness({ positioningStatement: val });
  },
});

function cleanSuggestion(value: unknown): BusinessSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const positioningStatement =
    typeof record.positioningStatement === "string"
      ? record.positioningStatement.trim()
      : "";
  const audience =
    typeof record.audience === "string" ? record.audience.trim() : "";
  const primaryProblem =
    typeof record.primaryProblem === "string"
      ? record.primaryProblem.trim()
      : "";
  const solution =
    typeof record.solution === "string" ? record.solution.trim() : "";
  const targetMarket =
    typeof record.targetMarket === "string" ? record.targetMarket.trim() : "";
  const primaryOutcome =
    typeof record.primaryOutcome === "string"
      ? record.primaryOutcome.trim()
      : "";
  if (
    !positioningStatement &&
    !audience &&
    !primaryProblem &&
    !solution &&
    !targetMarket &&
    !primaryOutcome
  ) {
    return null;
  }
  const suggestion: BusinessSuggestion = {
    positioningStatement:
      positioningStatement ||
      buildPositioningStatement(audience, primaryProblem, solution),
    audience,
    primaryProblem,
    solution,
    targetMarket,
    primaryOutcome,
  };
  if (typeof record.rationale === "string" && record.rationale.trim()) {
    suggestion.rationale = record.rationale.trim();
  }
  if (
    typeof record.clarityScore === "number" &&
    Number.isFinite(record.clarityScore)
  ) {
    suggestion.clarityScore = Math.max(
      1,
      Math.min(10, Math.round(record.clarityScore)),
    );
  }
  if (
    record.confidence === "low" ||
    record.confidence === "medium" ||
    record.confidence === "high"
  ) {
    suggestion.confidence = record.confidence;
  }
  return suggestion;
}

function extractSuggestionList(replyText: string): BusinessSuggestion[] {
  const trimmed = replyText.trim();
  if (!trimmed) return [];

  const jsonCandidates = [
    trimmed,
    trimmed
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim(),
  ];

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate) as
        | { suggestions?: unknown }
        | BusinessSuggestion[]
        | BusinessSuggestion;
      if (Array.isArray(parsed)) {
        const list = parsed
          .map(cleanSuggestion)
          .filter(Boolean) as BusinessSuggestion[];
        if (list.length > 0) return list;
      }
      if (parsed && typeof parsed === "object") {
        const suggestionList = (parsed as { suggestions?: unknown })
          .suggestions;
        if (Array.isArray(suggestionList)) {
          const list = suggestionList
            .map(cleanSuggestion)
            .filter(Boolean) as BusinessSuggestion[];
          if (list.length > 0) return list;
        }
        const single = cleanSuggestion(parsed);
        if (single) return [single];
      }
    } catch {
      // Try the next candidate.
    }
  }

  const looseJson = trimmed.match(/\{[\s\S]*\}/);
  if (looseJson?.[0]) {
    try {
      const parsed = JSON.parse(looseJson[0]) as { suggestions?: unknown };
      const suggestionList = parsed.suggestions;
      if (Array.isArray(suggestionList)) {
        return suggestionList
          .map(cleanSuggestion)
          .filter(Boolean) as BusinessSuggestion[];
      }
    } catch {
      // Fall through to the empty result.
    }
  }

  return [];
}

function buildSuggestionPrompt() {
  const productLines = wizard.products
    .map((product) => {
      const summary = [
        product.title,
        product.excerpt,
        product.price
          ? `${(product.price / 100).toFixed(2)} ${product.currency}`
          : null,
      ]
        .filter(Boolean)
        .join(" — ");
      return summary;
    })
    .filter(Boolean);

  const pageLines = wizard.pages
    .map((page) => `${page.title}${page.visible === false ? " (hidden)" : ""}`)
    .filter(Boolean);

  const postLines = wizard.posts.map((post) => post.title).filter(Boolean);

  return [
    "You are ME3's offer-positioning helper.",
    "Return STRICT JSON only, with this exact shape:",
    '{"suggestions":[{"positioningStatement":"string","audience":"string","primaryProblem":"string","solution":"string","targetMarket":"string","primaryOutcome":"string","rationale":"string","clarityScore":1,"confidence":"low|medium|high"}]}',
    "Use 1 to 3 suggestions max.",
    "Write positioningStatement as one natural sentence. Do not force it into a fixed formula.",
    "Audience should be a concrete group of people.",
    "Primary problem should be the pain, blocker, or job-to-be-done.",
    "Solution should explain how the person helps.",
    "Target market should be a tight routing label agents can use.",
    "Primary outcome should describe the progress the buyer gets.",
    "Clarity score should be an integer from 1 to 10.",
    "Keep the language concise, practical, and specific.",
    "Use the offer-positioning, copywriting, and marketing-psychology skills that ME3 already has available.",
    "Refine the user's existing wording if it is already useful.",
    `Name: ${wizard.profile.name || "Unnamed site"}`,
    wizard.profile.bio ? `Bio: ${wizard.profile.bio}` : null,
    businessPositioningStatement.value
      ? `Current positioning statement: ${businessPositioningStatement.value}`
      : null,
    wizard.profile.business?.audience
      ? `Current audience: ${wizard.profile.business.audience}`
      : null,
    wizard.profile.business?.primaryProblem
      ? `Current primary problem: ${wizard.profile.business.primaryProblem}`
      : null,
    wizard.profile.business?.solution
      ? `Current solution: ${wizard.profile.business.solution}`
      : null,
    wizard.profile.business?.targetMarket
      ? `Current target market: ${wizard.profile.business.targetMarket}`
      : null,
    wizard.profile.business?.primaryOutcome
      ? `Current primary outcome: ${wizard.profile.business.primaryOutcome}`
      : null,
    productLines.length > 0
      ? `Products/offers: ${productLines.join(" | ")}`
      : null,
    pageLines.length > 0 ? `Pages: ${pageLines.join(" | ")}` : null,
    postLines.length > 0 ? `Posts: ${postLines.join(" | ")}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function applyBusinessSuggestion(suggestion: BusinessSuggestion) {
  updateBusiness(
    {
      positioningStatement:
        suggestion.positioningStatement || businessPositioningStatement.value,
      audience: suggestion.audience || wizard.profile.business?.audience || "",
      primaryProblem:
        suggestion.primaryProblem ||
        wizard.profile.business?.primaryProblem ||
        "",
      solution: suggestion.solution || wizard.profile.business?.solution || "",
      targetMarket:
        suggestion.targetMarket || wizard.profile.business?.targetMarket || "",
      primaryOutcome:
        suggestion.primaryOutcome ||
        wizard.profile.business?.primaryOutcome ||
        "",
    },
    {
      preserveDerived: true,
    },
  );
  businessSuggestionSummary.value =
    suggestion.clarityScore !== undefined
      ? `Saved a ${suggestion.clarityScore}/10 clarity positioning statement.`
      : "Saved the selected positioning statement.";
  void closeBusinessSuggestionsModal();
}

async function closeBusinessSuggestionsModal() {
  showBusinessSuggestionsModal.value = false;
  await nextTick();
  businessSuggestionsReturnFocus?.focus();
  businessSuggestionsReturnFocus = null;
}

async function openBusinessSuggestionsModal() {
  if (businessSuggestions.value.length === 0) return;
  businessSuggestionsReturnFocus =
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  showBusinessSuggestionsModal.value = true;
  await nextTick();
  businessSuggestionsModalRef.value
    ?.querySelector<HTMLElement>("button:not([disabled])")
    ?.focus();
}

function handleBusinessSuggestionsModalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    void closeBusinessSuggestionsModal();
    return;
  }
  if (event.key !== "Tab" || !businessSuggestionsModalRef.value) return;

  const focusable = Array.from(
    businessSuggestionsModalRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

const suggestionKey = (suggestion: BusinessSuggestion, index: number) =>
  `${suggestion.positioningStatement || suggestion.targetMarket || "suggestion"}-${index}`;

function formatClarityScore(score: number | undefined) {
  return score !== undefined ? `Clarity ${score}/10` : "";
}

async function suggestBusinessPositioning() {
  if (isSuggestingBusiness.value) return;

  isSuggestingBusiness.value = true;
  businessSuggestionError.value = "";
  businessSuggestionSummary.value = "";
  businessSuggestions.value = [];
  showBusinessSuggestionsModal.value = false;

  try {
    const response = await api.post<{ replyText?: string; error?: string }>(
      "/assistant/chat/turn",
      {
        requestId: crypto.randomUUID(),
        messageText: buildSuggestionPrompt(),
      },
    );

    const replyText = response.replyText?.trim() || "";
    const suggestions = extractSuggestionList(replyText);
    if (suggestions.length > 0) {
      businessSuggestions.value = suggestions;
      businessSuggestionSummary.value =
        suggestions.length === 1
          ? "ME3 suggested one positioning option."
          : `ME3 suggested ${suggestions.length} positioning options.`;
      await openBusinessSuggestionsModal();
    } else {
      businessSuggestionSummary.value =
        replyText || "ME3 returned no structured suggestions.";
    }
  } catch (error) {
    businessSuggestionError.value =
      error instanceof Error ? error.message : "Failed to get ME3 suggestions";
  } finally {
    isSuggestingBusiness.value = false;
  }
}
</script>

<template>
  <div class="step-mission">
    <h2>Mission</h2>
    <p class="step-desc">
      Define who you help and how so ME3 can understand your work and support
      your goals.
    </p>

    <section class="business-positioning-card">
      <div class="business-positioning-header">
        <div>
          <h3>Who you help and how</h3>
          <p>
            Answer three short questions. ME3 uses them to understand your
            work, describe it clearly, and make more relevant suggestions.
          </p>
        </div>
      </div>

      <div class="positioning-builder">
        <div class="business-clarity-fields">
          <label class="business-clarity-field" for="business-audience">
            <span>Who do you help?</span>
            <input
              id="business-audience"
              v-model="businessAudience"
              type="text"
              placeholder="e.g. Women healing after trauma"
              maxlength="160"
            />
          </label>
          <label class="business-clarity-field" for="business-primary-problem">
            <span>What do they want help with?</span>
            <input
              id="business-primary-problem"
              v-model="businessPrimaryProblem"
              type="text"
              placeholder="e.g. Feeling safer, rebuilding confidence, and moving forward"
              maxlength="160"
            />
          </label>
          <label class="business-clarity-field" for="business-solution">
            <span>How do you help?</span>
            <input
              id="business-solution"
              v-model="businessSolution"
              type="text"
              placeholder="e.g. One-to-one healing sessions and practical guidance"
              maxlength="240"
            />
          </label>
          <label
            class="business-clarity-field business-summary-field"
            for="business-summary"
          >
            <span>ME3 summary</span>
            <textarea
              id="business-summary"
              v-model="businessPositioningStatement"
              rows="3"
              maxlength="320"
              aria-describedby="business-summary-help"
              placeholder="Write this in your own words, or ask ME3 to improve your answers."
            ></textarea>
            <small id="business-summary-help">
              This is the short description ME3 uses when it needs to explain
              what you do. You can edit it at any time.
            </small>
          </label>
          <div class="business-clarity-actions">
            <span class="business-autosave-note">
              <UiIcon name="Check" :size="14" aria-hidden="true" />
              Draft saves automatically. Publish to update ME3.
            </span>
            <div class="business-clarity-buttons">
              <button
                type="button"
                class="suggest-btn suggest-btn--compact"
                :disabled="isSuggestingBusiness"
                @click="suggestBusinessPositioning"
              >
                <UiIcon name="Sparkles" :size="14" aria-hidden="true" />
                {{
                  isSuggestingBusiness ? "Improving..." : "Improve with ME3"
                }}
              </button>
              <button
                v-if="
                  businessSuggestions.length > 0 &&
                  !showBusinessSuggestionsModal
                "
                type="button"
                class="review-suggestions-btn"
                @click="openBusinessSuggestionsModal"
              >
                Review suggestions
              </button>
            </div>
          </div>
        </div>
      </div>

      <p
        v-if="businessSuggestionSummary"
        class="business-suggestion-summary"
        role="status"
        aria-live="polite"
      >
        {{ businessSuggestionSummary }}
      </p>
      <p
        v-if="businessSuggestionError"
        class="business-suggestion-error"
        role="alert"
      >
        {{ businessSuggestionError }}
      </p>

      <div
        v-if="showBusinessSuggestionsModal && businessSuggestions.length > 0"
        class="business-suggestions-modal-overlay"
        role="presentation"
        @click.self="closeBusinessSuggestionsModal"
      >
        <div
          ref="businessSuggestionsModalRef"
          class="business-suggestions-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="business-suggestions-modal-title"
          aria-describedby="business-suggestions-modal-description"
          @keydown="handleBusinessSuggestionsModalKeydown"
        >
          <div class="business-suggestions-modal-header">
            <div>
              <h4 id="business-suggestions-modal-title">
                Choose a positioning suggestion
              </h4>
              <p id="business-suggestions-modal-description">
                Select the version that feels clearest.
              </p>
            </div>
            <button
              type="button"
              class="business-suggestions-modal-close"
              aria-label="Close suggestions"
              @click="closeBusinessSuggestionsModal"
            >
              ×
            </button>
          </div>
          <div class="suggestion-list">
            <article
              v-for="(suggestion, index) in businessSuggestions"
              :key="suggestionKey(suggestion, index)"
              class="suggestion-card"
            >
              <div class="suggestion-card-header">
                <strong>Suggestion {{ index + 1 }}</strong>
                <div class="suggestion-badges">
                  <span
                    v-if="suggestion.clarityScore !== undefined"
                    class="suggestion-score"
                  >
                    {{ formatClarityScore(suggestion.clarityScore) }}
                  </span>
                  <span
                    v-if="suggestion.confidence"
                    class="suggestion-confidence"
                  >
                    {{ suggestion.confidence }}
                  </span>
                </div>
              </div>
              <p class="suggestion-statement">
                {{ suggestion.positioningStatement }}
              </p>
              <p class="suggestion-line">
                <span class="suggestion-label">Audience:</span>
                {{ suggestion.audience }}
              </p>
              <p class="suggestion-line">
                <span class="suggestion-label">Problem:</span>
                {{ suggestion.primaryProblem }}
              </p>
              <p class="suggestion-line">
                <span class="suggestion-label">Solution:</span>
                {{ suggestion.solution }}
              </p>
              <p class="suggestion-line">
                <span class="suggestion-label">Target market:</span>
                {{ suggestion.targetMarket }}
              </p>
              <p class="suggestion-line">
                <span class="suggestion-label">Primary outcome:</span>
                {{ suggestion.primaryOutcome }}
              </p>
              <p v-if="suggestion.rationale" class="suggestion-rationale">
                {{ suggestion.rationale }}
              </p>
              <button
                type="button"
                class="apply-suggestion-btn"
                @click="applyBusinessSuggestion(suggestion)"
              >
                Use this suggestion
              </button>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.step-mission h2 {
  font-size: 28px;
  margin-bottom: 8px;
}

.step-desc {
  color: var(--color-text-muted);
  margin-bottom: 24px;
}

.business-positioning-card {
  margin-bottom: 24px;
  padding: 16px;
  border-radius: 12px;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
}

.business-positioning-header {
  margin-bottom: 16px;
}

.business-positioning-header h3 {
  font-size: 18px;
  margin: 0 0 4px;
}

.business-positioning-header p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.suggest-btn,
.apply-suggestion-btn {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 14px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.suggest-btn:hover:not(:disabled),
.apply-suggestion-btn:hover {
  border-color: var(--color-text);
  transform: translateY(-1px);
}

.suggest-btn:disabled {
  opacity: 0.7;
  cursor: progress;
}

.suggest-btn--compact {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
}

.positioning-builder {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.business-clarity-fields {
  display: grid;
  gap: 14px;
}

.business-clarity-field {
  display: grid;
  gap: 7px;
  color: var(--ui-text, var(--color-text));
  font-size: 13px;
  font-weight: 600;
}

.business-clarity-field input,
.business-clarity-field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  padding: 11px 12px;
}

.business-clarity-field textarea {
  min-height: 88px;
  resize: vertical;
}

.business-clarity-field input:focus-visible,
.business-clarity-field textarea:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-primary));
  outline-offset: 1px;
}

.business-clarity-field input::placeholder,
.business-clarity-field textarea::placeholder {
  color: var(--ui-text-muted, var(--color-text-muted));
  opacity: 1;
}

.business-summary-field {
  padding-top: 4px;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.business-summary-field > span {
  margin-top: 10px;
}

.business-summary-field small {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
}

.business-clarity-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.business-autosave-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
}

.business-clarity-buttons {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.business-suggestion-summary,
.business-suggestion-error {
  margin: 14px 0 0;
  font-size: 13px;
}

.business-suggestion-summary {
  color: var(--color-text-muted);
}

.business-suggestion-error {
  color: #ef4444;
}

.review-suggestions-btn {
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 9px 12px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.review-suggestions-btn:hover {
  border-color: var(--color-text);
  transform: translateY(-1px);
}

.business-suggestions-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
}

.business-suggestions-modal {
  width: min(920px, 100%);
  max-height: min(80vh, 760px);
  overflow: auto;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.business-suggestions-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.business-suggestions-modal-header h4 {
  margin: 0 0 4px;
  font-size: 18px;
}

.business-suggestions-modal-header p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.business-suggestions-modal-close {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.business-suggestions-modal-close:hover {
  color: var(--color-text);
}

.suggestion-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.suggestion-card {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.suggestion-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.suggestion-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.suggestion-score,
.suggestion-confidence {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.suggestion-statement,
.suggestion-line,
.suggestion-rationale {
  margin: 0 0 8px;
  font-size: 13px;
}

.suggestion-statement {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.suggestion-label {
  font-weight: 600;
}

.suggestion-rationale {
  color: var(--color-text-muted);
}

.apply-suggestion-btn {
  width: 100%;
  margin-top: 8px;
}

@media (max-width: 640px) {
  .business-suggestions-modal-overlay {
    padding: 16px;
  }

  .business-suggestions-modal {
    padding: 16px;
  }
}
</style>
