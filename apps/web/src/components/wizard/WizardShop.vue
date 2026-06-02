<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useWizardStore, type WizardProduct } from "../../stores/wizard";
import { useSitesStore } from "../../stores/sites";
import { useAuthStore } from "../../stores/auth";
import TiptapEditor from "../TiptapEditor.vue";
import StripePaymentSetupCallout from "./StripePaymentSetupCallout.vue";
import UiIcon from "../UiIcon.vue";
import { api } from "../../api";
import { useAppToast } from "../../composables/useAppToast";
import { productSendsPurchaseConfirmation } from "../../../../../shared/product-purchase-confirmation";

const wizard = useWizardStore();
const sites = useSitesStore();
const auth = useAuthStore();
const { toastError, toastSuccess, toastFromUnknown } = useAppToast();

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

const selectedProductIndex = ref<number | null>(null);
const editingTitle = ref("");
const editingSlug = ref("");
const routeTouched = ref(false);
const showRouteEditor = ref(false);
const routeInputRef = ref<HTMLInputElement | null>(null);
const editorContent = ref("");
const editorRef = ref<InstanceType<typeof TiptapEditor> | null>(null);
const isSuggestingBusiness = ref(false);
const isSavingBusiness = ref(false);
const businessSuggestionError = ref("");
const businessSuggestionSummary = ref("");
const businessSuggestions = ref<BusinessSuggestion[]>([]);
const showBusinessSuggestionsModal = ref(false);
const lastSavedBusinessSignature = ref("");

const isSendingConfirmationTest = ref(false);

const selectedProduct = computed(() => {
  if (selectedProductIndex.value === null) return null;
  return wizard.products[selectedProductIndex.value] || null;
});

function slugifyRouteSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

const previewSlug = computed(() => {
  const shouldUseCustomRoute =
    routeTouched.value || Boolean(selectedProduct.value?.slugCustomized);

  if (shouldUseCustomRoute) {
    const customSlug = slugifyRouteSegment(editingSlug.value);
    if (customSlug) return customSlug;
  }

  if (!editingTitle.value.trim()) {
    return selectedProduct.value?.slug || "untitled";
  }

  return slugifyRouteSegment(editingTitle.value) || "untitled";
});

const priceDollars = computed({
  get: () => {
    if (!selectedProduct.value) return 0;
    const cents = Number(selectedProduct.value.price);
    return Number.isFinite(cents) && cents >= 0 ? cents / 100 : 0;
  },
  set: (val: number) => {
    if (selectedProductIndex.value === null) return;
    const dollars = Number(val);
    const cents = Number.isFinite(dollars)
      ? Math.max(0, Math.round(dollars * 100))
      : 0;
    wizard.updateProduct(selectedProductIndex.value, { price: cents });
  },
});

function formatProductPrice(product: WizardProduct): string {
  const cents = Number(product.price);
  const safeCents = Number.isFinite(cents) && cents >= 0 ? cents : 0;
  return `${(safeCents / 100).toFixed(2)} ${product.currency}`;
}

const productCurrency = computed({
  get: () => selectedProduct.value?.currency || "USD",
  set: (
    val: "USD" | "GBP" | "EUR" | "CAD" | "AUD" | "CHF" | "SGD" | "INR" | "PKR",
  ) => {
    if (selectedProductIndex.value === null) return;
    wizard.updateProduct(selectedProductIndex.value, { currency: val });
  },
});

const productAvailable = computed({
  get: () => selectedProduct.value?.available ?? true,
  set: (val: boolean) => {
    if (selectedProductIndex.value === null) return;
    wizard.updateProduct(selectedProductIndex.value, { available: val });
  },
});

const productExcerpt = computed({
  get: () => selectedProduct.value?.excerpt || "",
  set: (val: string) => {
    if (selectedProductIndex.value === null) return;
    wizard.updateProduct(selectedProductIndex.value, { excerpt: val });
  },
});

const confirmationEmailEnabled = computed({
  get: () => Boolean(selectedProduct.value?.confirmationEmail?.enabled),
  set: (val: boolean) => {
    if (selectedProductIndex.value === null) return;
    const cur = selectedProduct.value?.confirmationEmail;
    wizard.updateProduct(selectedProductIndex.value, {
      confirmationEmail: {
        ...cur,
        enabled: val,
      },
    });
  },
});

const confirmationEmailSubject = computed({
  get: () => selectedProduct.value?.confirmationEmail?.subject ?? "",
  set: (val: string) => {
    if (selectedProductIndex.value === null) return;
    const cur = selectedProduct.value?.confirmationEmail;
    wizard.updateProduct(selectedProductIndex.value, {
      confirmationEmail: {
        ...cur,
        subject: val,
      },
    });
  },
});

const confirmationEmailMessage = computed({
  get: () => selectedProduct.value?.confirmationEmail?.message ?? "",
  set: (val: string) => {
    if (selectedProductIndex.value === null) return;
    const cur = selectedProduct.value?.confirmationEmail;
    wizard.updateProduct(selectedProductIndex.value, {
      confirmationEmail: {
        ...cur,
        message: val,
      },
    });
  },
});

const confirmationEmailIncomplete = computed(() => {
  const ce = selectedProduct.value?.confirmationEmail;
  if (!ce?.enabled) return false;
  return !productSendsPurchaseConfirmation(ce);
});

const confirmationTestInbox = computed(() => auth.user?.email?.trim() || "");

const confirmationTestUsername = computed(() => wizard.username.trim());

const confirmationTestTokenPreview = computed(() => {
  const productTitle =
    selectedProduct.value?.title?.trim() ||
    editingTitle.value.trim() ||
    "Product";
  const siteName = wizard.profile.name.trim() || confirmationTestUsername.value;
  const supportEmail = confirmationTestInbox.value || "you@example.com";

  return {
    buyerName: "Test Buyer",
    buyerNote: "Looking forward to this.",
    productTitle,
    siteName,
    supportEmail,
  };
});

const canSendConfirmationTest = computed(
  () =>
    Boolean(confirmationTestInbox.value) &&
    Boolean(confirmationTestUsername.value) &&
    !confirmationEmailIncomplete.value,
);

const canAddMore = computed(() => wizard.products.length < 20);

const selectedProductNeedsStripe = computed(
  () =>
    Boolean(selectedProduct.value) &&
    productAvailable.value &&
    priceDollars.value > 0,
);

const shopTitle = computed({
  get: () => wizard.shopTitle,
  set: (val: string) => {
    wizard.shopTitle = val;
  },
});

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
    nextBusiness.positioningStatement = buildPositioningStatement(
      nextBusiness.audience,
      nextBusiness.primaryProblem,
      nextBusiness.solution,
    );
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

const businessPositioningStatement = computed(
  () =>
    wizard.profile.business?.positioningStatement ||
    buildPositioningStatement(
      wizard.profile.business?.audience || "",
      wizard.profile.business?.primaryProblem || "",
      wizard.profile.business?.solution || "",
    ),
);

const businessTargetMarket = computed(
  () => wizard.profile.business?.targetMarket || "",
);

const businessPrimaryOutcome = computed(
  () => wizard.profile.business?.primaryOutcome || "",
);

function getBusinessSignature() {
  return [
    businessAudience.value.trim(),
    businessPrimaryProblem.value.trim(),
    businessSolution.value.trim(),
  ].join("||");
}

const canSaveBusiness = computed(
  () =>
    Boolean(businessAudience.value.trim()) &&
    Boolean(businessPrimaryProblem.value.trim()) &&
    Boolean(businessSolution.value.trim()),
);

const isBusinessSaved = computed(
  () =>
    Boolean(lastSavedBusinessSignature.value) &&
    lastSavedBusinessSignature.value === getBusinessSignature(),
);

if (
  canSaveBusiness.value &&
  (businessTargetMarket.value.trim() || businessPrimaryOutcome.value.trim())
) {
  lastSavedBusinessSignature.value = getBusinessSignature();
}

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
      // fall through
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
    'Write each suggestion as a sentence in this format: "I help X with Y by Z."',
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

function buildBusinessInferencePrompt() {
  return [
    "You are ME3's offer-positioning helper.",
    "Infer the derived fields for this positioning statement.",
    "Return STRICT JSON only, with this exact shape:",
    '{"suggestions":[{"positioningStatement":"string","audience":"string","primaryProblem":"string","solution":"string","targetMarket":"string","primaryOutcome":"string","rationale":"string","clarityScore":1,"confidence":"low|medium|high"}]}',
    'Preserve the sentence in this format: "I help X with Y by Z."',
    "Infer a tight target-market label agents can route on.",
    "Infer the primary outcome the buyer gets.",
    `Positioning statement: ${businessPositioningStatement.value}`,
    `Audience: ${businessAudience.value}`,
    `Primary problem: ${businessPrimaryProblem.value}`,
    `Solution: ${businessSolution.value}`,
    wizard.profile.bio ? `Bio: ${wizard.profile.bio}` : null,
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
  showBusinessSuggestionsModal.value = false;
  businessSuggestionSummary.value =
    suggestion.clarityScore !== undefined
      ? `Saved a ${suggestion.clarityScore}/10 clarity positioning statement.`
      : "Saved the selected positioning statement.";
  lastSavedBusinessSignature.value = getBusinessSignature();
}

function closeBusinessSuggestionsModal() {
  showBusinessSuggestionsModal.value = false;
}

function openBusinessSuggestionsModal() {
  if (businessSuggestions.value.length === 0) return;
  showBusinessSuggestionsModal.value = true;
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
      showBusinessSuggestionsModal.value = true;
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

async function saveBusinessDetails() {
  if (!canSaveBusiness.value || isSavingBusiness.value) return;

  isSavingBusiness.value = true;
  businessSuggestionError.value = "";

  try {
    const response = await api.post<{ replyText?: string; error?: string }>(
      "/assistant/chat/turn",
      {
        messageText: buildBusinessInferencePrompt(),
      },
    );
    const suggestions = extractSuggestionList(response.replyText?.trim() || "");
    const bestSuggestion = suggestions[0];
    if (!bestSuggestion) {
      businessSuggestionError.value =
        "ME3 couldn't infer your target market and outcome yet.";
      return;
    }
    const nextTargetMarket = bestSuggestion.targetMarket || "";
    const nextPrimaryOutcome = bestSuggestion.primaryOutcome || "";
    if (!nextTargetMarket && !nextPrimaryOutcome) {
      businessSuggestionError.value =
        "ME3 couldn't infer your target market and outcome yet.";
      return;
    }

    updateBusiness(
      {
        targetMarket: nextTargetMarket,
        primaryOutcome: nextPrimaryOutcome,
      },
      {
        preserveDerived: true,
      },
    );
    lastSavedBusinessSignature.value = getBusinessSignature();
  } catch (error) {
    businessSuggestionError.value =
      error instanceof Error ? error.message : "Failed to save offer clarity";
  } finally {
    isSavingBusiness.value = false;
  }
}

async function handleImageAdded(image: {
  id: string;
  blob: Blob;
  mimeType: string;
  ext: string;
}) {
  if (selectedProductIndex.value === null) return;

  const productImage = wizard.addProductImage(selectedProductIndex.value, {
    id: image.id,
    blob: image.blob,
    mimeType: image.mimeType,
    ext: image.ext,
  });

  if (!productImage) return;
}

watch(selectedProductIndex, (newIndex) => {
  if (newIndex !== null && wizard.products[newIndex]) {
    const product = wizard.products[newIndex];
    editingTitle.value = product.title;
    editingSlug.value = product.slug;
    routeTouched.value = false;
    showRouteEditor.value = false;
    editorContent.value = product.content || "";
  }
});

watch(editorContent, (newContent) => {
  if (selectedProductIndex.value !== null) {
    const imageIds = editorRef.value?.getImageIds() || new Set<string>();
    wizard.updateProduct(selectedProductIndex.value, {
      content: newContent,
    });
    wizard.syncProductImages(selectedProductIndex.value, imageIds);
  }
});

function addNewProduct() {
  const newProduct = wizard.addProduct("New Product");
  if (newProduct) {
    const newIndex = wizard.products.length - 1;
    selectedProductIndex.value = newIndex;
  }
}

function selectProduct(index: number) {
  persistProductMeta();
  selectedProductIndex.value = index;
}

function syncEditingRoute() {
  if (selectedProductIndex.value === null) return;
  const product = wizard.products[selectedProductIndex.value];
  if (!product) return;
  editingSlug.value = product.slug;
  routeTouched.value = false;
}

function persistProductMeta() {
  if (selectedProductIndex.value === null) return;

  const updates: Partial<WizardProduct> = {};
  if (editingTitle.value.trim()) {
    updates.title = editingTitle.value.trim();
  }
  if (routeTouched.value || selectedProduct.value?.slugCustomized) {
    updates.slug = editingSlug.value;
  }
  if (Object.keys(updates).length === 0) return;

  wizard.updateProduct(selectedProductIndex.value, updates);
  syncEditingRoute();
}

function updateProductTitle() {
  persistProductMeta();
}

function updateProductSlug() {
  if (selectedProductIndex.value === null) return;
  const updates: Partial<WizardProduct> = {
    slug: editingSlug.value,
  };
  if (editingTitle.value.trim()) {
    updates.title = editingTitle.value.trim();
  }
  wizard.updateProduct(selectedProductIndex.value, updates);
  syncEditingRoute();
}

async function openRouteEditor() {
  showRouteEditor.value = true;
  await nextTick();
  routeInputRef.value?.focus();
  routeInputRef.value?.select();
}

function closeRouteEditor() {
  showRouteEditor.value = false;
}

function handleRouteBlur() {
  updateProductSlug();
  closeRouteEditor();
}

function cancelRouteEdit() {
  syncEditingRoute();
  closeRouteEditor();
}

function deleteProduct(index: number) {
  if (!confirm("Delete this product?")) return;

  wizard.removeProduct(index);

  if (selectedProductIndex.value === index) {
    selectedProductIndex.value = wizard.products.length > 0 ? 0 : null;
  } else if (
    selectedProductIndex.value !== null &&
    selectedProductIndex.value > index
  ) {
    selectedProductIndex.value--;
  }
}

function closeEditor() {
  persistProductMeta();
  editorRef.value?.flushPendingImages?.();
  selectedProductIndex.value = null;
}

async function sendConfirmationEmailTest() {
  if (isSendingConfirmationTest.value) return;

  const product = selectedProduct.value;
  if (!product) return;

  const siteUsername = confirmationTestUsername.value;
  if (!siteUsername) {
    toastError("Claim your username before sending a test email.");
    return;
  }

  if (!confirmationTestInbox.value) {
    toastError("Sign in to send a test email.");
    return;
  }

  if (!productSendsPurchaseConfirmation(product.confirmationEmail)) {
    toastError("Add both a subject and message before sending a test email.");
    return;
  }

  isSendingConfirmationTest.value = true;

  try {
    const response = await sites.sendProductConfirmationTest(siteUsername, {
      productSlug: previewSlug.value,
      productTitle:
        product.title.trim() || editingTitle.value.trim() || "Product",
      siteName: wizard.profile.name.trim() || siteUsername,
      subject: product.confirmationEmail.subject.trim(),
      message: product.confirmationEmail.message.trim(),
    });

    toastSuccess(`Test email sent to ${response.sentTo}.`);
  } catch (error) {
    toastFromUnknown(error, "Failed to send test email");
  } finally {
    isSendingConfirmationTest.value = false;
  }
}

const isEditingProduct = computed(() => selectedProductIndex.value !== null);

defineExpose({
  isEditingProduct,
});
</script>

<template>
  <div class="step-shop">
    <h2>Offerings</h2>

    <div v-if="!isEditingProduct" class="shop-menu-title">
      <label class="shop-menu-title-label" for="shop-menu-title-input">
        Main menu title
      </label>
      <input
        id="shop-menu-title-input"
        v-model="shopTitle"
        type="text"
        class="shop-menu-title-input"
        placeholder="Offerings"
        maxlength="40"
      />
      <p class="shop-menu-title-hint">URL path: /{{ wizard.shopPath }}</p>
    </div>

    <section v-if="!isEditingProduct" class="business-positioning-card">
      <div class="business-positioning-header">
        <div>
          <h3>Offer clarity</h3>
          <p>
            Write a <strong>specific</strong> sentence about who you help, the
            problem they have, and how you help solve it. This helps ME3
            understand your offer, positioning and target audience.
          </p>
        </div>
      </div>

      <div class="positioning-builder">
        <div class="positioning-sentence">
          <div class="positioning-sentence-fields">
            <span class="sentence-static">I help</span>
            <input
              id="business-audience"
              v-model="businessAudience"
              class="sentence-input sentence-input-audience"
              type="text"
              placeholder="Conscious leaders"
              maxlength="160"
              aria-label="Audience you help"
            />
            <span class="sentence-static">with</span>
            <input
              id="business-primary-problem"
              v-model="businessPrimaryProblem"
              class="sentence-input sentence-input-problem"
              type="text"
              placeholder="fragmented tech, messaging and systems"
              maxlength="160"
              aria-label="Primary problem you solve"
            />
            <span class="sentence-static">by</span>
            <input
              id="business-solution"
              v-model="businessSolution"
              class="sentence-input sentence-input-solution"
              type="text"
              placeholder="offering consulting, guidance and building tools..."
              maxlength="240"
              aria-label="How you help"
            />
            <span class="sentence-static">.</span>
          </div>
          <div class="positioning-sentence-actions">
            <button
              type="button"
              class="save-business-btn"
              :class="{ 'save-business-btn--saved': isBusinessSaved }"
              :disabled="!canSaveBusiness || isSavingBusiness"
              @click="saveBusinessDetails"
            >
              <UiIcon
                v-if="isBusinessSaved"
                name="Check"
                :size="14"
                aria-hidden="true"
                class="save-business-icon"
              />
              {{
                isSavingBusiness
                  ? "Saving..."
                  : isBusinessSaved
                    ? "Saved"
                    : "Save"
              }}
            </button>
            <button
              type="button"
              class="suggest-btn suggest-btn--compact"
              :disabled="isSuggestingBusiness"
              @click="suggestBusinessPositioning"
            >
              <UiIcon name="Sparkles" :size="14" aria-hidden="true" />
              {{ isSuggestingBusiness ? "Thinking..." : "Suggest" }}
            </button>
            <button
              v-if="
                businessSuggestions.length > 0 && !showBusinessSuggestionsModal
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

      <p v-if="businessSuggestionSummary" class="business-suggestion-summary">
        {{ businessSuggestionSummary }}
      </p>
      <p v-if="businessSuggestionError" class="business-suggestion-error">
        {{ businessSuggestionError }}
      </p>

      <div
        v-if="showBusinessSuggestionsModal && businessSuggestions.length > 0"
        class="business-suggestions-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-suggestions-modal-title"
        @click.self="closeBusinessSuggestionsModal"
      >
        <div class="business-suggestions-modal">
          <div class="business-suggestions-modal-header">
            <div>
              <h4 id="business-suggestions-modal-title">
                Choose a positioning suggestion
              </h4>
              <p>Select the version that feels clearest.</p>
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

    <!-- Product list -->
    <div
      v-if="wizard.products.length > 0 && selectedProductIndex === null"
      class="product-list"
    >
      <div
        v-for="(product, index) in wizard.products"
        :key="product.slug"
        class="product-item"
      >
        <div class="product-header">
          <span class="product-icon" aria-hidden="true">
            <UiIcon name="ShoppingCart" :size="18" />
          </span>
          <div class="product-details">
            <span class="product-title">{{ product.title }}</span>
            <span class="product-meta">
              {{ formatProductPrice(product) }}
            </span>
          </div>
          <span v-if="!product.available" class="product-tag">Unavailable</span>
        </div>
        <div class="product-actions">
          <button
            class="action-btn edit-btn"
            type="button"
            title="Edit product"
            @click="selectProduct(index)"
          >
            <UiIcon name="Pencil" :size="16" />
          </button>
          <button
            class="action-btn remove-btn"
            type="button"
            title="Delete product"
            @click="deleteProduct(index)"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="selectedProductIndex === null && canAddMore"
      class="add-products"
    >
      <button class="add-btn" type="button" @click="addNewProduct">
        + Add offer or product
      </button>
    </div>

    <!-- Editor view -->
    <div
      v-if="selectedProductIndex !== null && selectedProduct"
      class="editor-view"
    >
      <div class="editor-form">
        <div class="form-group">
          <label for="shop-title-input">Product title</label>
          <input
            id="shop-title-input"
            v-model="editingTitle"
            type="text"
            placeholder="e.g. Handmade print"
            maxlength="80"
            @blur="updateProductTitle"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
          />
        </div>
        <div class="route-row">
          <template v-if="showRouteEditor">
            <span class="slug-preview">URL: /{{ wizard.shopPath }}/</span>
            <input
              id="shop-route-input"
              ref="routeInputRef"
              v-model="editingSlug"
              class="route-inline-input"
              type="text"
              inputmode="url"
              placeholder="handmade-print"
              maxlength="50"
              @input="routeTouched = true"
              @blur="handleRouteBlur"
              @keydown.esc.prevent="cancelRouteEdit"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
            />
          </template>
          <template v-else>
            <span class="slug-preview"
              >URL: /{{ wizard.shopPath }}/{{ previewSlug }}</span
            >
            <button
              class="route-edit-btn"
              type="button"
              @click="openRouteEditor"
            >
              <UiIcon name="Pencil" :size="14" />
              <span>Edit</span>
            </button>
          </template>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Price</label>
            <input
              v-model.number="priceDollars"
              type="number"
              min="0"
              step="0.01"
            />
          </div>
          <div class="form-group">
            <label>Currency</label>
            <select v-model="productCurrency">
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
              <option value="CHF">CHF</option>
              <option value="SGD">SGD</option>
              <option value="INR">INR</option>
              <option value="PKR">PKR</option>
            </select>
          </div>
        </div>

        <StripePaymentSetupCallout
          v-if="selectedProductNeedsStripe"
          compact
        />

        <div class="form-group">
          <label>Short description</label>
          <input
            v-model="productExcerpt"
            type="text"
            placeholder="Optional short summary"
            maxlength="160"
          />
        </div>

        <div class="toggle-row">
          <label class="toggle">
            <input type="checkbox" v-model="productAvailable" />
            <span class="toggle-ui" />
          </label>
          <span>Available for purchase</span>
        </div>

        <div class="confirmation-email-section">
          <h3 class="confirmation-email-title">Purchase confirmation email</h3>
          <p class="confirmation-email-lead">
            Optional. Use this only when you need to give the requester
            specific next steps in your own words.
          </p>
          <div class="toggle-row">
            <label class="toggle">
              <input type="checkbox" v-model="confirmationEmailEnabled" />
              <span class="toggle-ui" />
            </label>
            <span>Send buyers a confirmation email after payment</span>
          </div>
          <template v-if="confirmationEmailEnabled">
            <p
              v-if="confirmationEmailIncomplete"
              class="confirmation-email-warn"
            >
              Add both a subject and a message, or turn this off — publishing is
              blocked until this is complete.
            </p>
            <div class="form-group">
              <label for="product-confirmation-subject">Email subject</label>
              <input
                id="product-confirmation-subject"
                v-model="confirmationEmailSubject"
                type="text"
                maxlength="200"
                placeholder="e.g. Your download + next steps"
                autocomplete="off"
              />
            </div>
            <div class="form-group">
              <label for="product-confirmation-message">Email message</label>
              <textarea
                id="product-confirmation-message"
                v-model="confirmationEmailMessage"
                class="confirmation-email-textarea"
                rows="8"
                maxlength="8000"
                placeholder="Plain text with links. You can use placeholders in either field."
              ></textarea>
            </div>
            <div class="confirmation-email-actions">
              <button
                class="suggest-btn suggest-btn--compact"
                type="button"
                :disabled="
                  isSendingConfirmationTest || !canSendConfirmationTest
                "
                @click="sendConfirmationEmailTest"
              >
                {{ isSendingConfirmationTest ? "Sending…" : "Send test email" }}
              </button>
              <p class="confirmation-email-test-note">
                {{
                  !confirmationTestInbox
                    ? "Sign in to send a test."
                    : !confirmationTestUsername
                      ? "Claim your username first."
                      : `Sends to ${confirmationTestInbox}.`
                }}
                Test values:
                <code>{{ confirmationTestTokenPreview.buyerName }}</code
                >,
                <code>{{ confirmationTestTokenPreview.buyerNote }}</code>
              </p>
            </div>
            <p class="confirmation-email-tokens" v-pre>
              Placeholders:
              <code>{{ buyerName }}</code
              >, <code>{{ buyerNote }}</code
              >, <code>{{ productTitle }}</code
              >, <code>{{ siteName }}</code
              >,
              <code>{{ supportEmail }}</code>
            </p>
          </template>
        </div>

        <TiptapEditor
          ref="editorRef"
          v-model="editorContent"
          placeholder="Write your product description..."
          @image-added="handleImageAdded"
        />
      </div>

      <div class="editor-nav">
        <button class="editor-back-btn" @click="closeEditor">
          ← Back to offerings
        </button>
      </div>
    </div>

    <p
      v-if="
        wizard.products.length === 0 &&
        selectedProductIndex === null
      "
      class="empty-hint"
    >
      No products yet. Add your first item to start selling.
    </p>

    <p v-if="!canAddMore && selectedProductIndex === null" class="max-hint">
      Maximum 20 products reached.
    </p>
  </div>
</template>

<style scoped>
.step-shop h2 {
  font-size: 28px;
  margin-bottom: 8px;
}

.shop-menu-title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
  margin-bottom: 20px;
}

.shop-menu-title-label {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
  font-weight: 600;
}

.shop-menu-title-input {
  width: 100%;
  border: 2px solid var(--ui-border, var(--color-border));
  border-radius: 10px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  padding: 10px 12px;
}

.shop-menu-title-input:focus {
  outline: 2px solid var(--ui-accent, var(--color-primary));
  outline-offset: 1px;
}

.shop-menu-title-hint {
  margin: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 13px;
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

.positioning-sentence-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  align-self: flex-end;
}

.save-business-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 10px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;
}

.save-business-btn:hover:not(:disabled) {
  border-color: var(--color-text);
}

.save-business-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-business-btn--saved {
  border-color: #22c55e;
  color: #15803d;
}

.save-business-icon {
  color: #16a34a;
}

.suggest-btn--compact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
}

.positioning-builder {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.positioning-sentence {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg);
  transition: border-color 0.2s ease;
}

.positioning-sentence-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.positioning-sentence:focus-within {
  border-color: var(--color-text);
}

.sentence-static {
  font-size: 15px;
  font-weight: 600;
}

.sentence-input {
  min-width: 160px;
  flex: 1 1 180px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 15px;
  line-height: 1.5;
}

.sentence-input:focus {
  outline: none;
}

.sentence-input::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}

.sentence-input-audience {
  flex-basis: 180px;
}

.sentence-input-problem {
  flex-basis: 170px;
}

.sentence-input-solution {
  flex-basis: 240px;
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
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 9px;
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

.product-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.product-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
}

.product-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.product-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-border);
  color: var(--color-text);
}

.product-details {
  display: flex;
  flex-direction: column;
}

.product-title {
  font-weight: 600;
  font-size: 15px;
}

.product-meta {
  font-size: 12px;
  color: var(--color-text-muted);
}

.product-tag {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--color-border);
}

.product-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--color-text-muted);
}

.action-btn:hover {
  background: var(--color-border);
  color: var(--color-text);
}

.add-products {
  margin-bottom: 20px;
}

.add-btn {
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  padding: 10px 16px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
}

.editor-view {
  margin-top: 16px;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group input,
.form-group select {
  padding: 10px 12px;
  border-radius: 10px;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.slug-preview {
  font-size: 12px;
  color: var(--color-text-muted);
}

.route-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  margin-top: -2px;
}

.route-inline-input {
  min-width: 0;
  width: min(260px, 100%);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--color-bg);
  color: var(--color-text);
}

.route-inline-input:focus {
  outline: none;
  border-color: var(--color-text);
}

.route-edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  padding: 4px 0;
  font-size: 12px;
  cursor: pointer;
}

.route-edit-btn:hover {
  color: var(--color-text);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-ui {
  width: 42px;
  height: 22px;
  background: var(--color-border);
  border-radius: 999px;
  position: relative;
  transition: background 0.2s ease;
}

.toggle-ui::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--color-bg);
  transition: transform 0.2s ease;
}

.toggle input:checked + .toggle-ui {
  background: var(--color-text);
}

.toggle input:checked + .toggle-ui::after {
  transform: translateX(20px);
}

.editor-nav {
  margin-top: 16px;
}

.editor-back-btn {
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  font-weight: 600;
}

.empty-hint,
.max-hint {
  color: var(--color-text-muted);
  font-size: 13px;
  margin-top: 8px;
}

.confirmation-email-section {
  padding: 14px 16px;
  border-radius: 12px;
  border: 2px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirmation-email-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.confirmation-email-lead {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.confirmation-email-warn {
  margin: 0;
  font-size: 13px;
  color: #b45309;
  line-height: 1.45;
}

.confirmation-email-textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  line-height: 1.5;
  resize: vertical;
  min-height: 120px;
}

.confirmation-email-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.confirmation-email-test-note {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.confirmation-email-test-note code {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.confirmation-email-tokens {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.confirmation-email-tokens code {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}
</style>
