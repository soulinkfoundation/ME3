<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppDialog from "./AppDialog.vue";
import Button from "./Button.vue";
import {
  SocialCarouselApiError,
  useSocialStore,
  type CarouselMediaReference,
  type CarouselRenderModel,
  type CarouselSlide,
  type CarouselSourceEvidence,
  type CarouselTemplateId,
  type CarouselValidationIssue,
  type PostVersion,
  type RenderAndAttachSocialCarouselResult,
  type SocialPostDetail,
  type SocialCarouselMedia,
  type SocialCarouselRenderSet,
} from "../stores/social";

const props = defineProps<{
  open: boolean;
  post: SocialPostDetail["post"];
  version: PostVersion;
}>();

const emit = defineEmits<{
  close: [];
  attached: [result: RenderAndAttachSocialCarouselResult];
}>();

const social = useSocialStore();
const CAROUSEL_MEDIA_MAX_BYTES = 640_000;
const model = ref<CarouselRenderModel | null>(null);
const renderSet = ref<SocialCarouselRenderSet | null>(null);
const loading = ref(false);
const rendering = ref(false);
const uploading = ref(false);
const error = ref("");
const issues = ref<CarouselValidationIssue[]>([]);
const attachNotice = ref("");
const availableMedia = ref<SocialCarouselMedia[]>([]);

const contentSlides = computed(() =>
  model.value?.slides.filter((slide) => slide.kind === "content") || [],
);

const hasClosing = computed(() =>
  Boolean(model.value?.slides.some((slide) => slide.kind === "closing")),
);

const mediaUploadId = computed(() => `social-carousel-media-${props.version.id}`);

watch(
  () => [props.open, props.version.id, props.version.carouselRenderSetId] as const,
  ([open], previous) => {
    if (!open) return;
    const wasOpenForSameVersion = previous?.[0] && previous[1] === props.version.id;
    if (!wasOpenForSameVersion) void initializeEditor();
  },
  { immediate: true },
);

async function initializeEditor() {
  loading.value = true;
  error.value = "";
  issues.value = [];
  attachNotice.value = "";
  renderSet.value = null;
  availableMedia.value = [];
  let mediaError = "";
  try {
    availableMedia.value = await social.listCarouselMedia(props.post.siteId);
  } catch (value) {
    mediaError = value instanceof Error
      ? value.message
      : "Saved owner media could not be loaded.";
  }
  try {
    if (props.version.carouselRenderSetId) {
      const saved = await social.fetchCarouselRenderSet(
        props.post.siteId,
        props.version.carouselRenderSetId,
      );
      model.value = cloneModel(saved.model);
      renderSet.value = saved;
    } else {
      model.value = createSourceBackedSeed(props.post, props.version);
    }
  } catch (value) {
    model.value = createSourceBackedSeed(props.post, props.version);
    error.value = value instanceof Error
      ? `${value.message} A fresh Source-backed draft is available below.`
      : "The attached Carousel could not be loaded. A fresh Source-backed draft is available below.";
  } finally {
    if (mediaError && !error.value) {
      error.value = `${mediaError} You can still edit and render slides without images.`;
    }
    loading.value = false;
  }
}

function editSlide(slideId: string, field: "title" | "body" | "altText", value: string) {
  updateModel((draft) => {
    const slide = draft.slides.find((item) => item.id === slideId);
    if (slide) slide[field] = value;
  });
}

function moveContentSlide(slideId: string, direction: -1 | 1) {
  updateModel((draft) => {
    const indices = draft.slides
      .map((slide, index) => slide.kind === "content" ? index : -1)
      .filter((index) => index >= 0);
    const current = indices.findIndex((index) => draft.slides[index]?.id === slideId);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= indices.length) return;
    const from = indices[current]!;
    const to = indices[target]!;
    [draft.slides[from], draft.slides[to]] = [draft.slides[to]!, draft.slides[from]!];
  });
}

function setTemplate(templateId: CarouselTemplateId) {
  updateModel((draft) => {
    draft.template = { id: templateId, version: 1 };
    draft.ownerStyle = ownerStyleForTemplate(templateId);
  });
}

function setClosing(enabled: boolean) {
  updateModel((draft) => {
    const existingIndex = draft.slides.findIndex((slide) => slide.kind === "closing");
    if (!enabled && existingIndex >= 0) {
      draft.slides.splice(existingIndex, 1);
      return;
    }
    if (enabled && existingIndex < 0) {
      const evidence = cloneEvidence(draft.slides.at(-1)?.sourceEvidence[0] || sourceEvidence(
        draft.source.sourceText,
        0,
        "closing-evidence",
      ));
      evidence.id = "closing-evidence";
      draft.slides.push({
        id: "closing",
        kind: "closing",
        title: "The point to remember",
        body: evidence.excerpt,
        altText: "Closing Carousel slide with the point to remember",
        sourceEvidence: [evidence],
        mediaRefId: null,
      });
    }
  });
}

function setSlideMedia(slideId: string, mediaRefId: string) {
  updateModel((draft) => {
    const slide = draft.slides.find((item) => item.id === slideId);
    if (!slide) return;
    if (mediaRefId && !draft.media.some((media) => media.id === mediaRefId)) {
      const stored = availableMedia.value.find((media) => media.id === mediaRefId);
      if (stored) {
        draft.media.push({
          id: stored.id,
          storageKey: stored.storageKey,
          immutableUrl: stored.immutableUrl,
          contentHash: stored.contentHash,
          mimeType: stored.mimeType,
          pixelWidth: stored.pixelWidth,
          pixelHeight: stored.pixelHeight,
          altText: `Supporting image for ${slide.title || "this Carousel slide"}`,
          decorative: false,
          focalPoint: { x: 0.5, y: 0.5 },
        });
      }
    }
    slide.mediaRefId = mediaRefId || null;
  });
}

function editMedia(
  mediaId: string,
  field: "altText" | "decorative",
  value: string | boolean,
) {
  updateModel((draft) => {
    const media = draft.media.find((item) => item.id === mediaId);
    if (!media) return;
    if (field === "altText") media.altText = String(value);
    else media.decorative = value === true;
  });
}

async function uploadMedia(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !model.value) return;
  error.value = "";
  issues.value = [];
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    error.value = "Choose a PNG, JPEG, or WebP image.";
    return;
  }
  if (file.size > CAROUSEL_MEDIA_MAX_BYTES) {
    error.value = "Carousel images must be 640 KB or smaller.";
    return;
  }
  uploading.value = true;
  try {
    const uploaded = await social.uploadCarouselMedia(props.post.siteId, file);
    availableMedia.value = [
      uploaded,
      ...availableMedia.value.filter((media) => media.id !== uploaded.id),
    ];
    const currentSlide = model.value.slides.find((slide) => !slide.mediaRefId) ||
      model.value.slides[0];
    const reference: CarouselMediaReference = {
      id: uploaded.id,
      storageKey: uploaded.storageKey,
      immutableUrl: uploaded.immutableUrl,
      contentHash: uploaded.contentHash,
      mimeType: uploaded.mimeType,
      pixelWidth: uploaded.pixelWidth,
      pixelHeight: uploaded.pixelHeight,
      altText: `Supporting image for ${currentSlide?.title || "this Carousel"}`,
      decorative: false,
      focalPoint: { x: 0.5, y: 0.5 },
    };
    updateModel((draft) => {
      if (!draft.media.some((media) => media.id === reference.id)) {
        draft.media.push(reference);
      }
      const slide = draft.slides.find((item) => item.id === currentSlide?.id);
      if (slide) slide.mediaRefId = reference.id;
    });
    attachNotice.value = "Image saved to this owner workspace and selected for the first available slide.";
  } catch (value) {
    error.value = value instanceof Error ? value.message : "Failed to upload Carousel media.";
  } finally {
    uploading.value = false;
  }
}

async function renderAndAttach() {
  if (!model.value || rendering.value) return;
  rendering.value = true;
  error.value = "";
  issues.value = [];
  attachNotice.value = "";
  try {
    const result = await social.renderAndAttachCarousel({
      siteId: props.post.siteId,
      postId: props.post.id,
      versionId: props.version.id,
      expectedVersionUpdatedAt: props.version.updatedAt,
      model: cloneModel(model.value),
    });
    model.value = cloneModel(result.renderSet.model);
    renderSet.value = result.renderSet;
    attachNotice.value = result.approvalPreserved
      ? "Identical output attached. Existing approval and schedules were preserved."
      : "Carousel changed. Approval was reset and scheduled Publications were cancelled. Review and approve this exact Version again.";
    emit("attached", result);
  } catch (value) {
    if (value instanceof SocialCarouselApiError) {
      error.value = value.message;
      issues.value = value.issues;
    } else {
      error.value = value instanceof Error ? value.message : "Failed to render this Carousel.";
    }
  } finally {
    rendering.value = false;
  }
}

function updateModel(update: (draft: CarouselRenderModel) => void) {
  if (!model.value) return;
  const draft = cloneModel(model.value);
  update(draft);
  draft.revision += 1;
  model.value = draft;
  issues.value = [];
  attachNotice.value = "";
}

function mediaForSlide(slide: CarouselSlide): CarouselMediaReference | null {
  return model.value?.media.find((media) => media.id === slide.mediaRefId) || null;
}

function issueLabel(code: CarouselValidationIssue["code"]): string {
  if (code === "text_overflow") return "Text overflow";
  if (code === "safe_area") return "Safe area";
  if (code === "alt_text") return "Alt text";
  if (code === "media_reference") return "Media";
  if (code === "source_evidence") return "Source evidence";
  if (code === "contrast") return "Contrast";
  return "Carousel check";
}

function authenticatedImmutableUrl(url: string): string {
  if (!url || /[?&]siteId=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}siteId=${encodeURIComponent(props.post.siteId)}`;
}

function createSourceBackedSeed(
  post: SocialPostDetail["post"],
  version: PostVersion,
): CarouselRenderModel {
  const sourceText = post.sourceText.trim() ? post.sourceText : post.ideaText;
  const evidence = evidenceSlices(sourceText);
  const coverEvidence = cloneEvidence(evidence[0]!);
  coverEvidence.id = "cover-evidence";
  const slides: CarouselSlide[] = [{
    id: "cover",
    kind: "cover",
    kicker: "From your Source",
    title: trimForLayout(post.sourceTitle || post.ideaText, 72),
    body: trimForLayout(version.bodyText || coverEvidence.excerpt, 180),
    altText: `Carousel cover about ${trimForLayout(post.sourceTitle || post.ideaText, 120)}`,
    sourceEvidence: [coverEvidence],
    mediaRefId: null,
  }];
  for (let index = 0; index < 3; index += 1) {
    const item = cloneEvidence(evidence[index % evidence.length]!);
    item.id = `content-${index + 1}-evidence`;
    const title = seedTitle(item.excerpt, index + 1);
    slides.push({
      id: `content-${index + 1}`,
      kind: "content",
      title,
      body: trimForLayout(item.excerpt, 220),
      altText: `Carousel slide ${index + 2}: ${title}`,
      sourceEvidence: [item],
      mediaRefId: null,
    });
  }
  const closingEvidence = cloneEvidence(evidence.at(-1)!);
  closingEvidence.id = "closing-evidence";
  slides.push({
    id: "closing",
    kind: "closing",
    title: "The point to remember",
    body: trimForLayout(closingEvidence.excerpt, 180),
    altText: "Closing Carousel slide with the point to remember",
    sourceEvidence: [closingEvidence],
    mediaRefId: null,
  });
  const sourceType = post.sourceType === "legacy_content_bank_read_only"
    ? "pasted"
    : post.sourceType;
  return {
    modelVersion: "me3.carousel-model.v1",
    revision: 1,
    template: { id: "owner-editorial", version: 1 },
    canvas: { width: 1080, height: 1350 },
    source: {
      sourceType,
      sourceRef: post.sourceRef || `${sourceType}:${post.id}`,
      sourceTitle: post.sourceTitle || post.ideaText,
      snapshotHash: `sha256:${"0".repeat(64)}`,
      sourceText,
    },
    ownerStyle: ownerStyleForTemplate("owner-editorial"),
    media: [],
    slides,
  };
}

function evidenceSlices(text: string): CarouselSourceEvidence[] {
  const slices: CarouselSourceEvidence[] = [];
  const pattern = /[^\n.!?]+(?:[.!?]+|$)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const leading = raw.match(/^\s*/)?.[0].length || 0;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = (match.index || 0) + leading;
    const excerpt = trimExactExcerpt(trimmed, 180);
    slices.push({
      id: `source-evidence-${slices.length + 1}`,
      start,
      end: start + excerpt.length,
      excerpt,
    });
  }
  return slices.length ? slices : [sourceEvidence(text, 0, "source-evidence-1")];
}

function sourceEvidence(text: string, start: number, id: string): CarouselSourceEvidence {
  const excerpt = trimExactExcerpt(text.slice(start).trimStart(), 180);
  const leading = text.slice(start).length - text.slice(start).trimStart().length;
  const exactStart = start + leading;
  return { id, start: exactStart, end: exactStart + excerpt.length, excerpt };
}

function trimExactExcerpt(value: string, max: number): string {
  if (value.length <= max) return value;
  const candidate = value.slice(0, max);
  const boundary = candidate.lastIndexOf(" ");
  return candidate.slice(0, boundary > max * 0.65 ? boundary : max).trimEnd();
}

function trimForLayout(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function seedTitle(excerpt: string, index: number): string {
  const words = excerpt.replace(/\s+/g, " ").trim().split(" ").slice(0, 8).join(" ");
  return trimForLayout(words || `Source point ${index}`, 64);
}

function ownerStyleForTemplate(template: CarouselTemplateId): CarouselRenderModel["ownerStyle"] {
  if (template === "owner-bold") {
    return {
      ownerName: "Owner",
      handle: "",
      logoMediaRefId: null,
      colors: {
        background: "#0f172a",
        surface: "#1e293b",
        text: "#f8fafc",
        mutedText: "#cbd5e1",
        accent: "#14b8a6",
        accentText: "#0f172a",
      },
      typography: { family: "sans", headingWeight: 800, bodyWeight: 500 },
      cornerRadius: 20,
    };
  }
  return {
    ownerName: "Owner",
    handle: "",
    logoMediaRefId: null,
    colors: {
      background: "#f7f5ef",
      surface: "#ffffff",
      text: "#171717",
      mutedText: "#4b5563",
      accent: "#0f766e",
      accentText: "#ffffff",
    },
    typography: { family: "serif", headingWeight: 700, bodyWeight: 400 },
    cornerRadius: 16,
  };
}

function cloneEvidence(value: CarouselSourceEvidence): CarouselSourceEvidence {
  return { ...value };
}

function cloneModel(value: CarouselRenderModel): CarouselRenderModel {
  return JSON.parse(JSON.stringify(value)) as CarouselRenderModel;
}
</script>

<template>
  <AppDialog
    :open="open"
    labelled-by="social-carousel-editor-title"
    described-by="social-carousel-editor-description"
    @close="emit('close')"
  >
    <section class="carousel-editor" :aria-busy="loading || rendering || uploading">
      <header class="carousel-editor__header">
        <div>
          <h2 id="social-carousel-editor-title">Carousel editor</h2>
          <p id="social-carousel-editor-description">
            Build deterministic slides from <strong>{{ post.sourceTitle }}</strong>. Rendering uses
            this saved Source and does not publish anything.
          </p>
        </div>
        <Button color="ghost" shape="soft" type="button" autofocus @click="emit('close')">
          Close
        </Button>
      </header>

      <p v-if="loading" class="carousel-editor__loading" role="status">
        Loading Carousel…
      </p>

      <template v-else-if="model">
        <div v-if="error" class="carousel-alert carousel-alert--error" role="alert">
          {{ error }}
        </div>
        <section v-if="issues.length" class="carousel-issues" role="alert" aria-labelledby="carousel-issues-title">
          <h3 id="carousel-issues-title">Fix these checks before attaching</h3>
          <ul>
            <li v-for="issue in issues" :key="`${issue.path}:${issue.message}`">
              <strong>{{ issueLabel(issue.code) }}:</strong> {{ issue.message }}
            </li>
          </ul>
        </section>
        <p v-if="attachNotice" class="carousel-alert" role="status" aria-live="polite">
          {{ attachNotice }}
        </p>

        <div class="carousel-editor__body">
          <div class="carousel-controls">
            <fieldset class="template-picker">
              <legend>Template</legend>
              <label :class="{ 'template-option--selected': model.template.id === 'owner-editorial' }">
                <input
                  type="radio"
                  name="carousel-template"
                  value="owner-editorial"
                  :checked="model.template.id === 'owner-editorial'"
                  @change="setTemplate('owner-editorial')"
                />
                <span><strong>Owner editorial</strong><small>Warm, measured, serif-led</small></span>
              </label>
              <label :class="{ 'template-option--selected': model.template.id === 'owner-bold' }">
                <input
                  type="radio"
                  name="carousel-template"
                  value="owner-bold"
                  :checked="model.template.id === 'owner-bold'"
                  @change="setTemplate('owner-bold')"
                />
                <span><strong>Owner bold</strong><small>High contrast, direct, sans-led</small></span>
              </label>
            </fieldset>

            <section class="media-control" aria-labelledby="carousel-media-title">
              <div>
                <h3 id="carousel-media-title">Owner media</h3>
                <p>Optional PNG, JPEG, or WebP up to 640 KB. No generated imagery is used.</p>
              </div>
              <label class="media-upload" :for="mediaUploadId">
                {{ uploading ? 'Uploading…' : 'Upload image' }}
              </label>
              <input
                :id="mediaUploadId"
                class="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                :disabled="uploading"
                @change="uploadMedia"
              />
            </section>

            <label class="closing-control">
              <input
                type="checkbox"
                :checked="hasClosing"
                @change="setClosing(($event.target as HTMLInputElement).checked)"
              />
              Include a closing slide
            </label>

            <p class="safe-area-note">
              1080 × 1350 canvas · fixed safe area · {{ contentSlides.length }} content slides
            </p>
          </div>

          <section class="slide-list" aria-labelledby="carousel-slides-title">
            <h3 id="carousel-slides-title">Slides</h3>
            <article
              v-for="(slide, slideIndex) in model.slides"
              :key="slide.id"
              class="slide-editor"
              :data-slide-id="slide.id"
            >
              <header>
                <div>
                  <strong>Slide {{ slideIndex + 1 }}</strong>
                  <span>{{ slide.kind }}</span>
                </div>
                <div v-if="slide.kind === 'content'" class="reorder-actions">
                  <button
                    class="reorder-button"
                    type="button"
                    :disabled="contentSlides[0]?.id === slide.id"
                    :aria-label="`Move slide ${slideIndex + 1} up`"
                    @click="moveContentSlide(slide.id, -1)"
                  >
                    Move up
                  </button>
                  <button
                    class="reorder-button"
                    type="button"
                    :disabled="contentSlides.at(-1)?.id === slide.id"
                    :aria-label="`Move slide ${slideIndex + 1} down`"
                    @click="moveContentSlide(slide.id, 1)"
                  >
                    Move down
                  </button>
                </div>
              </header>

              <label>
                <span>Title</span>
                <input
                  :value="slide.title"
                  @input="editSlide(slide.id, 'title', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                <span>Body</span>
                <textarea
                  rows="4"
                  :value="slide.body"
                  @input="editSlide(slide.id, 'body', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label>
                <span>Slide alt text</span>
                <input
                  :value="slide.altText"
                  @input="editSlide(slide.id, 'altText', ($event.target as HTMLInputElement).value)"
                />
              </label>

              <label v-if="availableMedia.length">
                <span>Image</span>
                <select
                  :value="slide.mediaRefId || ''"
                  @change="setSlideMedia(slide.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">No image</option>
                  <option v-for="(media, mediaIndex) in availableMedia" :key="media.id" :value="media.id">
                    Owner image {{ mediaIndex + 1 }} · {{ media.pixelWidth }} × {{ media.pixelHeight }}
                  </option>
                </select>
              </label>

              <div v-if="mediaForSlide(slide)" class="selected-media">
                <img
                  :src="authenticatedImmutableUrl(mediaForSlide(slide)!.immutableUrl)"
                  :alt="mediaForSlide(slide)!.decorative ? '' : mediaForSlide(slide)!.altText"
                />
                <div>
                  <label>
                    <span>Image alt text</span>
                    <input
                      :value="mediaForSlide(slide)!.altText"
                      :disabled="mediaForSlide(slide)!.decorative"
                      @input="editMedia(mediaForSlide(slide)!.id, 'altText', ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                  <label class="decorative-control">
                    <input
                      type="checkbox"
                      :checked="mediaForSlide(slide)!.decorative"
                      @change="editMedia(mediaForSlide(slide)!.id, 'decorative', ($event.target as HTMLInputElement).checked)"
                    />
                    Decorative image
                  </label>
                </div>
              </div>

              <details class="source-evidence" open>
                <summary>Exact Source evidence</summary>
                <blockquote v-for="evidence in slide.sourceEvidence" :key="evidence.id">
                  “{{ evidence.excerpt }}”
                </blockquote>
              </details>
            </article>
          </section>

          <section v-if="renderSet" class="carousel-preview" aria-labelledby="carousel-preview-title">
            <div>
              <h3 id="carousel-preview-title">Server-rendered preview</h3>
              <p>
                {{ renderSet.assets.length }} self-contained SVG slide{{ renderSet.assets.length === 1 ? '' : 's' }}.
              </p>
            </div>
            <ol>
              <li v-for="asset in renderSet.assets" :key="asset.id">
                <img
                  :src="authenticatedImmutableUrl(asset.immutableUrl)"
                  :alt="asset.altText"
                />
                <span>Slide {{ asset.position + 1 }}</span>
              </li>
            </ol>
          </section>
        </div>

        <footer class="carousel-editor__footer">
          <p>Attaching changed output resets approval and cancels pending schedules.</p>
          <div>
            <Button color="outline" shape="soft" type="button" @click="emit('close')">
              Close
            </Button>
            <Button
              color="primary"
              shape="soft"
              type="button"
              :disabled="rendering || uploading"
              @click="renderAndAttach"
            >
              {{ rendering ? 'Rendering…' : 'Render and attach' }}
            </Button>
          </div>
        </footer>
      </template>
    </section>
  </AppDialog>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.carousel-editor {
  width: min(1120px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-md);
}

.carousel-editor__header,
.carousel-editor__footer,
.slide-editor > header,
.media-control,
.carousel-preview > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.carousel-editor__header,
.carousel-editor__footer {
  position: sticky;
  z-index: 2;
  padding: 18px 20px;
  background: var(--ui-surface);
}

.carousel-editor__header {
  top: 0;
  border-bottom: 1px solid var(--ui-border);
}

.carousel-editor__footer {
  bottom: 0;
  border-top: 1px solid var(--ui-border);
}

.carousel-editor__header h2,
.carousel-editor__header p,
.carousel-editor__footer p,
.carousel-controls h3,
.carousel-controls p,
.slide-list > h3,
.carousel-preview h3,
.carousel-preview p,
.carousel-issues h3 {
  margin: 0;
}

.carousel-editor__header p,
.carousel-editor__footer p,
.media-control p,
.safe-area-note,
.carousel-preview p {
  color: var(--ui-text-muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.carousel-editor__body {
  display: grid;
  grid-template-columns: minmax(230px, 0.55fr) minmax(0, 1.45fr);
  gap: 20px;
  padding: 20px;
}

.carousel-controls {
  display: grid;
  align-content: start;
  gap: 18px;
}

.template-picker {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}

.template-picker legend,
.slide-list > h3,
.media-control h3,
.carousel-preview h3 {
  margin-bottom: 8px;
  font-size: 0.95rem;
  font-weight: 700;
}

.template-picker label,
.closing-control,
.decorative-control {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  cursor: pointer;
}

.template-picker label {
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
}

.template-picker label:has(input:focus-visible),
.template-option--selected {
  border-color: var(--ui-accent);
  outline: 2px solid var(--ui-accent-soft);
}

.template-picker span {
  display: grid;
  gap: 2px;
}

.template-picker small {
  color: var(--ui-text-muted);
}

.media-control {
  align-items: end;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--ui-border);
}

.media-upload {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  box-sizing: border-box;
  padding: 9px 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  font-weight: 700;
  cursor: pointer;
}

.media-upload:has(+ input:focus-visible) {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.carousel-alert,
.carousel-issues,
.carousel-editor__loading {
  margin: 16px 20px 0;
  padding: 12px 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.carousel-alert--error,
.carousel-issues {
  border-color: color-mix(in srgb, #c94b4b 48%, var(--ui-border));
}

.carousel-issues ul {
  display: grid;
  gap: 5px;
  margin: 8px 0 0;
  padding-left: 20px;
}

.slide-list {
  display: grid;
  gap: 14px;
}

.slide-editor {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.slide-editor > header > div:first-child {
  display: grid;
}

.slide-editor > header span {
  color: var(--ui-text-muted);
  font-size: 0.78rem;
  text-transform: capitalize;
}

.slide-editor label:not(.decorative-control),
.selected-media > div {
  display: grid;
  gap: 6px;
}

.slide-editor label > span {
  font-size: 0.8rem;
  font-weight: 700;
}

.slide-editor input:not([type="checkbox"]),
.slide-editor select,
.slide-editor textarea {
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
}

.slide-editor textarea {
  resize: vertical;
  line-height: 1.5;
}

.slide-editor input:focus-visible,
.slide-editor select:focus-visible,
.slide-editor textarea:focus-visible {
  border-color: var(--ui-accent);
  outline: 2px solid var(--ui-accent-soft);
}

.reorder-actions,
.carousel-editor__footer > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.carousel-editor :deep(.me3-btn) {
  min-height: 44px;
}

.reorder-button {
  min-height: 44px;
  padding: 9px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.reorder-button:hover:not(:disabled) {
  border-color: var(--ui-accent);
  color: var(--ui-text);
}

.reorder-button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.reorder-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.source-evidence {
  padding-top: 10px;
  border-top: 1px solid var(--ui-border);
}

.source-evidence summary {
  min-height: 44px;
  align-content: center;
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.source-evidence blockquote {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid var(--ui-accent);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  line-height: 1.5;
}

.selected-media {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.selected-media img {
  width: 112px;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: var(--ui-radius-sm);
}

.carousel-preview {
  grid-column: 1 / -1;
  display: grid;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--ui-border);
}

.carousel-preview ol {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.carousel-preview li {
  display: grid;
  gap: 6px;
}

.carousel-preview img {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
}

.carousel-preview span {
  color: var(--ui-text-muted);
  font-size: 0.78rem;
}

@media (max-width: 760px) {
  .carousel-editor {
    width: 100vw;
    max-height: 100vh;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: var(--ui-radius-lg) var(--ui-radius-lg) 0 0;
  }

  .carousel-editor__body {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .carousel-editor__header,
  .carousel-editor__footer {
    align-items: flex-start;
    padding: 14px 16px;
  }

  .carousel-editor__footer {
    flex-direction: column;
  }

  .carousel-editor__footer > div,
  .carousel-editor__footer :deep(.me3-btn) {
    width: 100%;
  }

  .slide-editor > header {
    align-items: flex-start;
    flex-direction: column;
  }

  .selected-media {
    grid-template-columns: 1fr;
  }
}
</style>
