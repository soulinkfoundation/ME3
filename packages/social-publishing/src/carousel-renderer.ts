import {
  CAROUSEL_CANVAS,
  CAROUSEL_CONTENT_SLIDE_MAX,
  CAROUSEL_CONTENT_SLIDE_MIN,
  CAROUSEL_RASTER_MIME_TYPES,
  CAROUSEL_RENDER_MODEL_VERSION,
  CAROUSEL_SAFE_AREA,
  CAROUSEL_TEMPLATE_VERSIONS,
  type CarouselMediaReference,
  type CarouselRasterMimeType,
  type CarouselRenderModel,
  type CarouselSlide,
  type CarouselSourceEvidence,
} from "./carousel-render-model";

export const CAROUSEL_RENDERER_VERSION = "me3.carousel-svg.v2" as const;

const SHA256_PATTERN = /^sha256:([a-f0-9]{64})$/;
const STORAGE_KEY_PATTERN = /^social-media\/sha256\/([a-f0-9]{64})\.([a-z0-9]{2,5})$/;
const IMMUTABLE_URL_PATTERN =
  /^\/api\/social\/media\/sha256\/([a-f0-9]{64})\.([a-z0-9]{2,5})\?siteId=((?:[A-Za-z0-9_.!~*'()-]|%[A-F0-9]{2})+)$/;
const HEX_COLOR_PATTERN = /^#[a-f0-9]{6}$/i;

const CAROUSEL_RASTER_EXTENSIONS: Record<CarouselRasterMimeType, readonly string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};

const LAYOUT = Object.freeze({
  contentLeft: CAROUSEL_SAFE_AREA.left,
  contentRight: CAROUSEL_CANVAS.width - CAROUSEL_SAFE_AREA.right,
  contentWidth: CAROUSEL_CANVAS.width - CAROUSEL_SAFE_AREA.left - CAROUSEL_SAFE_AREA.right,
  labelBaseline: 128,
  mediaTop: 168,
  mediaHeight: 300,
  textTopWithoutMedia: 208,
  textTopWithMedia: 520,
  textBottom: 1016,
  evidenceTop: 1052,
  evidenceHeight: 126,
  footerBaseline: 1234,
  footerGap: 32,
  logoTop: 1192,
  logoSize: 52,
});

type TemplateMetrics = {
  titleSize: Record<CarouselSlide["kind"], number>;
  bodySize: number;
  titleMaxLines: Record<CarouselSlide["kind"], number>;
  bodyMaxLines: Record<CarouselSlide["kind"], number>;
  titleLineHeight: number;
  bodyLineHeight: number;
};

const TEMPLATE_METRICS: Record<string, TemplateMetrics> = {
  "owner-editorial": {
    titleSize: { cover: 68, content: 50, closing: 64 },
    bodySize: 32,
    titleMaxLines: { cover: 4, content: 3, closing: 4 },
    bodyMaxLines: { cover: 5, content: 8, closing: 5 },
    titleLineHeight: 1.08,
    bodyLineHeight: 1.28,
  },
  "owner-bold": {
    titleSize: { cover: 76, content: 54, closing: 70 },
    bodySize: 34,
    titleMaxLines: { cover: 4, content: 3, closing: 4 },
    bodyMaxLines: { cover: 4, content: 7, closing: 4 },
    titleLineHeight: 1.04,
    bodyLineHeight: 1.22,
  },
};

export type CarouselValidationCode =
  | "model_version"
  | "template_version"
  | "safe_area"
  | "slide_count"
  | "slide_order"
  | "duplicate_id"
  | "source_evidence"
  | "owner_style"
  | "contrast"
  | "media_reference"
  | "alt_text"
  | "text_overflow";

export type CarouselValidationIssue = {
  code: CarouselValidationCode;
  path: string;
  message: string;
  slideId: string | null;
};

export type CarouselReproducibleRenderInput = {
  modelVersion: typeof CAROUSEL_RENDER_MODEL_VERSION;
  rendererVersion: typeof CAROUSEL_RENDERER_VERSION;
  template: {
    id: string;
    version: number;
  };
  canvas: {
    width: number;
    height: number;
  };
  source: {
    sourceType: string;
    sourceRef: string;
    sourceTitle: string;
    snapshotHash: string;
  };
  ownerStyle: CarouselRenderModel["ownerStyle"];
  media: readonly CarouselReproducibleMediaReference[];
  slides: readonly CarouselSlide[];
};

export type CarouselReproducibleMediaReference = Omit<
  CarouselMediaReference,
  "storageKey" | "immutableUrl"
>;

export type CarouselRenderedAsset = {
  assetId: string;
  slideId: string;
  position: number;
  fileName: string;
  mimeType: "image/svg+xml";
  width: number;
  height: number;
  altText: string;
  sourceEvidence: readonly CarouselSourceEvidence[];
  mediaRefIds: readonly string[];
  svg: string;
};

export type CarouselRenderSet = {
  modelVersion: typeof CAROUSEL_RENDER_MODEL_VERSION;
  rendererVersion: typeof CAROUSEL_RENDERER_VERSION;
  template: {
    id: string;
    version: number;
  };
  inputFingerprint: `sha256:${string}`;
  canonicalInput: string;
  reproducibleInput: CarouselReproducibleRenderInput;
  assets: readonly CarouselRenderedAsset[];
};

export type CarouselMediaBytes = ArrayBuffer | Uint8Array;

export type CarouselMediaByteResolver = (
  media: Readonly<CarouselMediaReference>,
) => CarouselMediaBytes | null | Promise<CarouselMediaBytes | null>;

export type CarouselRenderOptions = {
  /**
   * Resolves trusted owner media by its server-validated reference. The
   * renderer never fetches immutableUrl or any other stored URL.
   */
  resolveMediaBytes?: CarouselMediaByteResolver;
};

export class CarouselRenderValidationError extends Error {
  readonly issues: readonly CarouselValidationIssue[];

  constructor(issues: readonly CarouselValidationIssue[]) {
    super("Carousel cannot be rendered until its checks pass");
    this.name = "CarouselRenderValidationError";
    this.issues = issues;
  }
}

type TextLayout = {
  titleLines: string[];
  bodyLines: string[];
  evidenceLines: string[];
  titleSize: number;
  bodySize: number;
  titleLineHeight: number;
  bodyLineHeight: number;
  textTop: number;
  bodyTop: number;
};

export function validateCarouselRenderModel(
  model: CarouselRenderModel,
): CarouselValidationIssue[] {
  const issues: CarouselValidationIssue[] = [];
  const issue = (
    code: CarouselValidationCode,
    path: string,
    message: string,
    slideId: string | null = null,
  ) => issues.push({ code, path, message, slideId });

  if (model.modelVersion !== CAROUSEL_RENDER_MODEL_VERSION) {
    issue("model_version", "modelVersion", "Choose a supported Carousel model version");
  }
  if (!Number.isInteger(model.revision) || model.revision < 1) {
    issue("model_version", "revision", "Carousel revision must be a positive whole number");
  }

  const expectedTemplateVersion = (
    CAROUSEL_TEMPLATE_VERSIONS as Record<string, number | undefined>
  )[model.template.id];
  if (
    expectedTemplateVersion === undefined ||
    model.template.version !== expectedTemplateVersion
  ) {
    issue(
      "template_version",
      "template",
      "Choose a supported Carousel Template and version",
    );
  }

  if (
    model.canvas.width !== CAROUSEL_CANVAS.width ||
    model.canvas.height !== CAROUSEL_CANVAS.height
  ) {
    issue(
      "safe_area",
      "canvas",
      `Carousel canvas must be exactly ${CAROUSEL_CANVAS.width} × ${CAROUSEL_CANVAS.height} so every Template keeps the ${CAROUSEL_SAFE_AREA.top}/${CAROUSEL_SAFE_AREA.right}/${CAROUSEL_SAFE_AREA.bottom}/${CAROUSEL_SAFE_AREA.left}px safe area`,
    );
  }

  validateSource(model, issue);
  validateOwnerStyle(model, issue);
  validateMedia(model, issue);
  validateSlides(model, issue);

  return issues;
}

export function carouselReproducibleRenderInput(
  model: CarouselRenderModel,
): CarouselReproducibleRenderInput {
  const referencedIds = new Set<string>();
  if (model.ownerStyle.logoMediaRefId) referencedIds.add(model.ownerStyle.logoMediaRefId);
  for (const slide of model.slides) {
    if (slide.mediaRefId) referencedIds.add(slide.mediaRefId);
  }
  const media = model.media
    .filter((item) => referencedIds.has(item.id))
    .map(cloneMediaForRender)
    .sort((left, right) => left.id.localeCompare(right.id));
  const slides = model.slides.map((slide) => ({
    ...slide,
    sourceEvidence: [...slide.sourceEvidence]
      .map((evidence) => ({ ...evidence }))
      .sort((left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.id.localeCompare(right.id)
      ),
  })) as CarouselSlide[];

  return {
    modelVersion: CAROUSEL_RENDER_MODEL_VERSION,
    rendererVersion: CAROUSEL_RENDERER_VERSION,
    template: { id: model.template.id, version: model.template.version },
    canvas: { ...model.canvas },
    source: {
      sourceType: model.source.sourceType,
      sourceRef: model.source.sourceRef,
      sourceTitle: model.source.sourceTitle,
      snapshotHash: model.source.snapshotHash,
    },
    ownerStyle: {
      ...model.ownerStyle,
      colors: { ...model.ownerStyle.colors },
      typography: { ...model.ownerStyle.typography },
    },
    media,
    slides,
  };
}

export function canonicalCarouselRenderInput(model: CarouselRenderModel): string {
  return stableStringify(carouselReproducibleRenderInput(model));
}

export async function fingerprintCarouselRenderInput(
  model: CarouselRenderModel,
): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(canonicalCarouselRenderInput(model));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

export async function renderCarouselSvgSet(
  model: CarouselRenderModel,
  options: CarouselRenderOptions = {},
): Promise<CarouselRenderSet> {
  const issues = validateCarouselRenderModel(model);
  if (issues.length > 0) throw new CarouselRenderValidationError(issues);

  const reproducibleInput = carouselReproducibleRenderInput(model);
  const canonicalInput = stableStringify(reproducibleInput);
  const inputFingerprint = await fingerprintCarouselRenderInput(model);
  const mediaById = new Map(model.media.map((media) => [media.id, media]));
  const embeddedMediaById = await resolveEmbeddedCarouselMedia(
    model,
    options.resolveMediaBytes,
  );
  const assets = model.slides.map((slide, index) => {
    const mediaRefIds = [
      slide.mediaRefId,
      model.ownerStyle.logoMediaRefId,
    ].filter((id): id is string => Boolean(id));
    return {
      assetId: `${inputFingerprint}:${slide.id}`,
      slideId: slide.id,
      position: index,
      fileName: `${String(index + 1).padStart(2, "0")}-${safeFileName(slide.id)}.svg`,
      mimeType: "image/svg+xml" as const,
      width: model.canvas.width,
      height: model.canvas.height,
      altText: slide.altText,
      sourceEvidence: [...slide.sourceEvidence]
        .map((evidence) => ({ ...evidence }))
        .sort((left, right) =>
          left.start - right.start || left.end - right.end || left.id.localeCompare(right.id)
        ),
      mediaRefIds,
      svg: renderSlideSvg(
        model,
        slide,
        index,
        mediaById,
        embeddedMediaById,
        inputFingerprint,
      ),
    };
  });

  return Object.freeze({
    modelVersion: CAROUSEL_RENDER_MODEL_VERSION,
    rendererVersion: CAROUSEL_RENDERER_VERSION,
    template: Object.freeze({ ...reproducibleInput.template }),
    inputFingerprint,
    canonicalInput,
    reproducibleInput,
    assets: Object.freeze(assets.map((asset) => Object.freeze(asset))),
  });
}

async function resolveEmbeddedCarouselMedia(
  model: CarouselRenderModel,
  resolver: CarouselMediaByteResolver | undefined,
): Promise<Map<string, string>> {
  const referencedIds = new Set<string>();
  if (model.ownerStyle.logoMediaRefId) referencedIds.add(model.ownerStyle.logoMediaRefId);
  for (const slide of model.slides) {
    if (slide.mediaRefId) referencedIds.add(slide.mediaRefId);
  }
  if (referencedIds.size === 0) return new Map();

  const issues: CarouselValidationIssue[] = [];
  const embedded = new Map<string, string>();
  for (const id of [...referencedIds].sort((left, right) => left.localeCompare(right))) {
    const index = model.media.findIndex((media) => media.id === id);
    const media = index >= 0 ? model.media[index] : null;
    if (!media) continue;
    const path = `media[${index}]`;
    if (!resolver) {
      issues.push({
        code: "media_reference",
        path,
        message: "Trusted media bytes are required before this Carousel can be rendered",
        slideId: null,
      });
      continue;
    }

    let resolved: CarouselMediaBytes | null;
    try {
      resolved = await resolver(media);
    } catch {
      resolved = null;
    }
    if (!resolved) {
      issues.push({
        code: "media_reference",
        path,
        message: "The saved owner media bytes could not be loaded",
        slideId: null,
      });
      continue;
    }

    const bytes = resolved instanceof Uint8Array
      ? new Uint8Array(resolved.buffer, resolved.byteOffset, resolved.byteLength)
      : new Uint8Array(resolved);
    const sniffedMimeType = sniffCarouselRasterMimeType(bytes);
    const contentHash = await sha256CarouselMediaBytes(bytes);
    let valid = true;
    if (!sniffedMimeType || sniffedMimeType !== media.mimeType) {
      issues.push({
        code: "media_reference",
        path: `${path}.mimeType`,
        message:
          "Saved media bytes must match their declared PNG, JPEG, or WebP image type",
        slideId: null,
      });
      valid = false;
    }
    if (contentHash !== media.contentHash) {
      issues.push({
        code: "media_reference",
        path: `${path}.contentHash`,
        message: "Saved media bytes do not match their content hash",
        slideId: null,
      });
      valid = false;
    }
    if (valid) {
      embedded.set(media.id, `data:${media.mimeType};base64,${bytesToBase64(bytes)}`);
    }
  }

  if (issues.length > 0) throw new CarouselRenderValidationError(issues);
  return embedded;
}

export function sniffCarouselRasterMimeType(
  bytes: Uint8Array,
): CarouselRasterMimeType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function sha256CarouselMediaBytes(
  bytes: Uint8Array,
): Promise<`sha256:${string}`> {
  const exactBytes = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(exactBytes).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", exactBytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function validateSource(
  model: CarouselRenderModel,
  issue: IssueWriter,
): void {
  if (!model.source.sourceRef.trim()) {
    issue("source_evidence", "source.sourceRef", "Source reference is required");
  }
  if (!model.source.sourceTitle.trim()) {
    issue("source_evidence", "source.sourceTitle", "Source title is required");
  }
  if (!model.source.sourceText.trim()) {
    issue("source_evidence", "source.sourceText", "Visible Source text is required");
  }
  if (!SHA256_PATTERN.test(model.source.snapshotHash)) {
    issue(
      "source_evidence",
      "source.snapshotHash",
      "Source snapshot must include its SHA-256 content hash",
    );
  }
}

function validateOwnerStyle(
  model: CarouselRenderModel,
  issue: IssueWriter,
): void {
  const style = model.ownerStyle;
  if (!style.ownerName.trim()) {
    issue("owner_style", "ownerStyle.ownerName", "Owner name is required");
  }
  if (style.ownerName.length > 100 || style.handle.length > 100) {
    issue("owner_style", "ownerStyle", "Owner name and handle must stay under 100 characters");
  }
  if (!["sans", "serif"].includes(style.typography.family)) {
    issue("owner_style", "ownerStyle.typography.family", "Choose a supported type style");
  }
  if (![600, 700, 800].includes(style.typography.headingWeight)) {
    issue("owner_style", "ownerStyle.typography.headingWeight", "Choose a supported heading weight");
  }
  if (![400, 500, 600].includes(style.typography.bodyWeight)) {
    issue("owner_style", "ownerStyle.typography.bodyWeight", "Choose a supported body weight");
  }
  if (!Number.isFinite(style.cornerRadius) || style.cornerRadius < 0 || style.cornerRadius > 64) {
    issue("owner_style", "ownerStyle.cornerRadius", "Corner radius must be between 0 and 64");
  }

  for (const [name, value] of Object.entries(style.colors)) {
    if (!HEX_COLOR_PATTERN.test(value)) {
      issue("owner_style", `ownerStyle.colors.${name}`, "Use a six-digit hex color");
    }
  }
  validateContrast(style.colors.text, style.colors.background, "text", "background", issue);
  validateContrast(
    style.colors.mutedText,
    style.colors.background,
    "muted text",
    "background",
    issue,
  );
  validateContrast(style.colors.text, style.colors.surface, "text", "surface", issue);
  validateContrast(
    style.colors.mutedText,
    style.colors.surface,
    "muted text",
    "surface",
    issue,
  );
  validateContrast(style.colors.accentText, style.colors.accent, "accent text", "accent", issue);
}

function validateContrast(
  foreground: string,
  background: string,
  foregroundLabel: string,
  backgroundLabel: string,
  issue: IssueWriter,
): void {
  if (!HEX_COLOR_PATTERN.test(foreground) || !HEX_COLOR_PATTERN.test(background)) return;
  const ratio = contrastRatio(foreground, background);
  if (ratio < 4.5) {
    issue(
      "contrast",
      "ownerStyle.colors",
      `${foregroundLabel} needs at least 4.5:1 contrast against ${backgroundLabel}; current contrast is ${ratio.toFixed(2)}:1`,
    );
  }
}

function validateMedia(
  model: CarouselRenderModel,
  issue: IssueWriter,
): void {
  const ids = new Set<string>();
  for (const [index, media] of model.media.entries()) {
    const path = `media[${index}]`;
    if (!media.id.trim() || ids.has(media.id)) {
      issue("duplicate_id", `${path}.id`, "Every media reference needs a unique ID");
    }
    ids.add(media.id);
    const hash = SHA256_PATTERN.exec(media.contentHash)?.[1];
    const key = STORAGE_KEY_PATTERN.exec(media.storageKey);
    const url = IMMUTABLE_URL_PATTERN.exec(media.immutableUrl);
    const supportedMimeType = (CAROUSEL_RASTER_MIME_TYPES as readonly string[])
      .includes(media.mimeType);
    const allowedExtensions = supportedMimeType
      ? CAROUSEL_RASTER_EXTENSIONS[media.mimeType]
      : [];
    if (!supportedMimeType) {
      issue(
        "media_reference",
        `${path}.mimeType`,
        "Carousel media must be a PNG, JPEG, or WebP image",
      );
    }
    if (
      !hash ||
      !key ||
      !url ||
      hash !== key[1] ||
      hash !== url[1] ||
      key[2] !== url[2] ||
      !allowedExtensions.includes(key[2] || "")
    ) {
      issue(
        "media_reference",
        path,
        "Existing media must use a content-addressed ME3 PNG, JPEG, or WebP key and URL matching its SHA-256 hash",
      );
    }
    if (
      !Number.isInteger(media.pixelWidth) ||
      media.pixelWidth < 1 ||
      !Number.isInteger(media.pixelHeight) ||
      media.pixelHeight < 1
    ) {
      issue("media_reference", path, "Existing media needs valid pixel dimensions");
    }
    if (
      !Number.isFinite(media.focalPoint.x) ||
      !Number.isFinite(media.focalPoint.y) ||
      media.focalPoint.x < 0 ||
      media.focalPoint.x > 1 ||
      media.focalPoint.y < 0 ||
      media.focalPoint.y > 1
    ) {
      issue("media_reference", `${path}.focalPoint`, "Media focal point must stay inside the image");
    }
    if (!media.decorative) {
      validateAltText(media.altText, `${path}.altText`, null, issue);
    }
  }
}

function validateSlides(
  model: CarouselRenderModel,
  issue: IssueWriter,
): void {
  const contentSlides = model.slides.filter((slide) => slide.kind === "content");
  if (
    contentSlides.length < CAROUSEL_CONTENT_SLIDE_MIN ||
    contentSlides.length > CAROUSEL_CONTENT_SLIDE_MAX
  ) {
    issue(
      "slide_count",
      "slides",
      `Add between ${CAROUSEL_CONTENT_SLIDE_MIN} and ${CAROUSEL_CONTENT_SLIDE_MAX} content slides`,
    );
  }
  const covers = model.slides.filter((slide) => slide.kind === "cover");
  const closings = model.slides.filter((slide) => slide.kind === "closing");
  if (
    covers.length !== 1 ||
    model.slides[0]?.kind !== "cover" ||
    closings.length > 1 ||
    (closings.length === 1 && model.slides.at(-1)?.kind !== "closing")
  ) {
    issue(
      "slide_order",
      "slides",
      "Start with one cover, keep content slides in the middle, and place the optional closing last",
    );
  }

  const slideIds = new Set<string>();
  const evidenceIds = new Set<string>();
  const mediaIds = new Set(model.media.map((media) => media.id));
  for (const [index, slide] of model.slides.entries()) {
    const path = `slides[${index}]`;
    if (!slide.id.trim() || slideIds.has(slide.id)) {
      issue("duplicate_id", `${path}.id`, "Every slide needs a unique ID", slide.id || null);
    }
    slideIds.add(slide.id);
    if (!slide.title.trim()) {
      issue("text_overflow", `${path}.title`, "Slide title is required", slide.id);
    }
    if (slide.kind === "content" && !slide.body.trim()) {
      issue("text_overflow", `${path}.body`, "Content slide text is required", slide.id);
    }
    validateAltText(slide.altText, `${path}.altText`, slide.id, issue);
    if (slide.mediaRefId && !mediaIds.has(slide.mediaRefId)) {
      issue(
        "media_reference",
        `${path}.mediaRefId`,
        "Choose existing owner media that is available to this Carousel",
        slide.id,
      );
    }
    if (slide.sourceEvidence.length === 0) {
      issue(
        "source_evidence",
        `${path}.sourceEvidence`,
        "Every slide needs visible supporting Source text",
        slide.id,
      );
    }
    for (const [evidenceIndex, evidence] of slide.sourceEvidence.entries()) {
      const evidencePath = `${path}.sourceEvidence[${evidenceIndex}]`;
      if (!evidence.id.trim() || evidenceIds.has(evidence.id)) {
        issue(
          "duplicate_id",
          `${evidencePath}.id`,
          "Every Source evidence item needs a unique ID",
          slide.id,
        );
      }
      evidenceIds.add(evidence.id);
      if (
        !Number.isInteger(evidence.start) ||
        !Number.isInteger(evidence.end) ||
        evidence.start < 0 ||
        evidence.end <= evidence.start ||
        evidence.end > model.source.sourceText.length ||
        model.source.sourceText.slice(evidence.start, evidence.end) !== evidence.excerpt
      ) {
        issue(
          "source_evidence",
          evidencePath,
          "Supporting Source text must match its exact position in the saved Source",
          slide.id,
        );
      }
    }

    const metrics = TEMPLATE_METRICS[model.template.id];
    if (metrics) validateTextLayout(model, slide, index, metrics, issue);
  }

  validateFooterLayout(model, issue);

  if (model.ownerStyle.logoMediaRefId && !mediaIds.has(model.ownerStyle.logoMediaRefId)) {
    issue(
      "media_reference",
      "ownerStyle.logoMediaRefId",
      "Choose an existing owner logo that is available to this Carousel",
    );
  }
}

function validateAltText(
  value: string,
  path: string,
  slideId: string | null,
  issue: IssueWriter,
): void {
  const text = value.trim();
  if (
    text.length < 12 ||
    text.length > 500 ||
    /^(?:https?:\/\/|[^\s]+\.(?:png|jpe?g|gif|webp|svg))$/i.test(text)
  ) {
    issue(
      "alt_text",
      path,
      "Write concise alt text between 12 and 500 characters instead of a URL or filename",
      slideId,
    );
  }
}

function validateTextLayout(
  model: CarouselRenderModel,
  slide: CarouselSlide,
  index: number,
  metrics: TemplateMetrics,
  issue: IssueWriter,
): void {
  const label = slideLabel(slide, index);
  if (measureTextWidth(label, 24, 2) > LAYOUT.contentWidth) {
    issue(
      "text_overflow",
      `slides[${index}]${slide.kind === "cover" ? ".kicker" : ""}`,
      "Slide label exceeds its fixed safe-area lane",
      slide.id,
    );
  }
  const layout = layoutText(model, slide, metrics);
  const titleMax = metrics.titleMaxLines[slide.kind];
  const bodyMax = metrics.bodyMaxLines[slide.kind];
  if (layout.titleLines.length > titleMax) {
    issue(
      "text_overflow",
      `slides[${index}].title`,
      `Slide title exceeds the Template limit of ${titleMax} lines`,
      slide.id,
    );
  }
  if (layout.bodyLines.length > bodyMax) {
    issue(
      "text_overflow",
      `slides[${index}].body`,
      `Slide text exceeds the Template limit of ${bodyMax} lines`,
      slide.id,
    );
  }
  if (layout.evidenceLines.length > 3) {
    issue(
      "text_overflow",
      `slides[${index}].sourceEvidence`,
      "Visible Source evidence exceeds the Template limit of 3 lines",
      slide.id,
    );
  }
  const bodyBottom = layout.bodyTop +
    Math.min(layout.bodyLines.length, bodyMax) * layout.bodyLineHeight;
  if (bodyBottom > LAYOUT.textBottom) {
    issue(
      "text_overflow",
      `slides[${index}]`,
      "Slide text crosses the fixed safe content area",
      slide.id,
    );
  }
}

function validateFooterLayout(
  model: CarouselRenderModel,
  issue: IssueWriter,
): void {
  const ownerLabel = normalizeInlineText(
    model.ownerStyle.handle.trim() || model.ownerStyle.ownerName,
  );
  const ownerX = model.ownerStyle.logoMediaRefId
    ? LAYOUT.contentLeft + LAYOUT.logoSize + 16
    : LAYOUT.contentLeft;
  const pageLabel = `${model.slides.length} / ${model.slides.length}`;
  const pageWidth = measureTextWidth(pageLabel, 22);
  const ownerLaneWidth = LAYOUT.contentRight - pageWidth - LAYOUT.footerGap - ownerX;
  if (ownerLaneWidth < 0 || measureTextWidth(ownerLabel, 22) > ownerLaneWidth) {
    issue(
      "text_overflow",
      model.ownerStyle.handle.trim() ? "ownerStyle.handle" : "ownerStyle.ownerName",
      "Owner footer label collides with the fixed page-count lane",
    );
  }
}

function layoutText(
  model: CarouselRenderModel,
  slide: CarouselSlide,
  metrics: TemplateMetrics,
): TextLayout {
  const titleSize = metrics.titleSize[slide.kind];
  const bodySize = metrics.bodySize;
  const titleLineHeight = Math.round(titleSize * metrics.titleLineHeight);
  const bodyLineHeight = Math.round(bodySize * metrics.bodyLineHeight);
  const textTop = slide.mediaRefId ? LAYOUT.textTopWithMedia : LAYOUT.textTopWithoutMedia;
  const titleLines = wrapText(slide.title, titleSize, LAYOUT.contentWidth);
  const titleHeight = titleLines.length * titleLineHeight;
  const bodyTop = textTop + titleHeight + (slide.body.trim() ? 34 : 0);
  const bodyLines = slide.body.trim()
    ? wrapText(slide.body, bodySize, LAYOUT.contentWidth)
    : [];
  const evidenceText = sourceEvidenceText(model, slide);
  const evidenceLines = wrapText(evidenceText, 22, LAYOUT.contentWidth - 48);
  return {
    titleLines,
    bodyLines,
    evidenceLines,
    titleSize,
    bodySize,
    titleLineHeight,
    bodyLineHeight,
    textTop,
    bodyTop,
  };
}

function renderSlideSvg(
  model: CarouselRenderModel,
  slide: CarouselSlide,
  index: number,
  mediaById: Map<string, CarouselMediaReference>,
  embeddedMediaById: ReadonlyMap<string, string>,
  inputFingerprint: `sha256:${string}`,
): string {
  const metrics = TEMPLATE_METRICS[model.template.id]!;
  const layout = layoutText(model, slide, metrics);
  const style = model.ownerStyle;
  const colors = style.colors;
  const fontFamily = style.typography.family === "serif"
    ? "Georgia, Times New Roman, serif"
    : "Arial, Helvetica, sans-serif";
  const id = `slide-${index + 1}-${safeXmlId(slide.id)}`;
  const evidenceText = sourceEvidenceText(model, slide);
  const media = slide.mediaRefId ? mediaById.get(slide.mediaRefId) || null : null;
  const logo = style.logoMediaRefId ? mediaById.get(style.logoMediaRefId) || null : null;
  const description = [
    `Source: ${model.source.sourceTitle}. ${evidenceText}`,
    media && !media.decorative ? `Media: ${media.altText}` : "",
  ].filter(Boolean).join(" ");
  const metadata = stableStringify({
    inputFingerprint,
    modelVersion: CAROUSEL_RENDER_MODEL_VERSION,
    rendererVersion: CAROUSEL_RENDERER_VERSION,
    template: {
      id: model.template.id,
      version: model.template.version,
    },
  });

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${model.canvas.width}" height="${model.canvas.height}" viewBox="0 0 ${model.canvas.width} ${model.canvas.height}" role="img" aria-labelledby="${escapeXmlAttribute(`${id}-title ${id}-desc`)}">`,
    `<metadata>${escapeXmlText(metadata)}</metadata>`,
    `<title id="${escapeXmlAttribute(`${id}-title`)}">${escapeXmlText(slide.altText)}</title>`,
    `<desc id="${escapeXmlAttribute(`${id}-desc`)}">${escapeXmlText(description)}</desc>`,
    `<rect width="${model.canvas.width}" height="${model.canvas.height}" fill="${colors.background}"/>`,
    renderTemplateDecoration(model),
    `<text x="${LAYOUT.contentLeft}" y="${LAYOUT.labelBaseline}" fill="${colors.mutedText}" font-family="${escapeXmlAttribute(fontFamily)}" font-size="24" font-weight="600" letter-spacing="2">${escapeXmlText(slideLabel(slide, index))}</text>`,
  ];

  if (media) {
    parts.push(renderMedia(media, embeddedMediaById.get(media.id)!, style.cornerRadius));
  }

  parts.push(renderTextLines({
    lines: layout.titleLines,
    x: LAYOUT.contentLeft,
    firstBaseline: layout.textTop + layout.titleSize,
    lineHeight: layout.titleLineHeight,
    fill: colors.text,
    fontFamily,
    fontSize: layout.titleSize,
    fontWeight: style.typography.headingWeight,
  }));
  if (layout.bodyLines.length > 0) {
    parts.push(renderTextLines({
      lines: layout.bodyLines,
      x: LAYOUT.contentLeft,
      firstBaseline: layout.bodyTop + layout.bodySize,
      lineHeight: layout.bodyLineHeight,
      fill: colors.text,
      fontFamily,
      fontSize: layout.bodySize,
      fontWeight: style.typography.bodyWeight,
    }));
  }

  parts.push(
    `<rect x="${LAYOUT.contentLeft}" y="${LAYOUT.evidenceTop}" width="${LAYOUT.contentWidth}" height="${LAYOUT.evidenceHeight}" rx="${style.cornerRadius}" fill="${colors.surface}"/>`,
    `<text x="${LAYOUT.contentLeft + 24}" y="${LAYOUT.evidenceTop + 30}" fill="${colors.mutedText}" font-family="${escapeXmlAttribute(fontFamily)}" font-size="16" font-weight="700" letter-spacing="1.5">SOURCE EVIDENCE</text>`,
    renderTextLines({
      lines: layout.evidenceLines,
      x: LAYOUT.contentLeft + 24,
      firstBaseline: LAYOUT.evidenceTop + 62,
      lineHeight: 26,
      fill: colors.mutedText,
      fontFamily,
      fontSize: 22,
      fontWeight: 400,
    }),
  );

  if (logo) {
    parts.push(
      `<image x="${LAYOUT.contentLeft}" y="${LAYOUT.logoTop}" width="${LAYOUT.logoSize}" height="${LAYOUT.logoSize}" href="${escapeXmlAttribute(embeddedMediaById.get(logo.id)!)}" preserveAspectRatio="${mediaAspectRatio(logo)}" aria-hidden="true"/>`,
    );
  }
  const ownerX = logo ? LAYOUT.contentLeft + LAYOUT.logoSize + 16 : LAYOUT.contentLeft;
  const ownerLabel = normalizeInlineText(style.handle.trim() || style.ownerName);
  parts.push(
    `<text x="${ownerX}" y="${LAYOUT.footerBaseline}" fill="${colors.mutedText}" font-family="${escapeXmlAttribute(fontFamily)}" font-size="22" font-weight="600">${escapeXmlText(ownerLabel)}</text>`,
    `<text x="${LAYOUT.contentRight}" y="${LAYOUT.footerBaseline}" text-anchor="end" fill="${colors.mutedText}" font-family="${escapeXmlAttribute(fontFamily)}" font-size="22" font-weight="600">${index + 1} / ${model.slides.length}</text>`,
    "</svg>",
  );
  return parts.join("");
}

function renderTemplateDecoration(model: CarouselRenderModel): string {
  const colors = model.ownerStyle.colors;
  if (model.template.id === "owner-bold") {
    return [
      `<rect x="0" y="0" width="${model.canvas.width}" height="24" fill="${colors.accent}"/>`,
      `<circle cx="${model.canvas.width - CAROUSEL_SAFE_AREA.right}" cy="${CAROUSEL_SAFE_AREA.top}" r="34" fill="${colors.accent}"/>`,
      `<circle cx="${model.canvas.width - CAROUSEL_SAFE_AREA.right}" cy="${CAROUSEL_SAFE_AREA.top}" r="12" fill="${colors.accentText}"/>`,
    ].join("");
  }
  return `<rect x="${LAYOUT.contentLeft}" y="154" width="8" height="842" rx="4" fill="${colors.accent}"/>`;
}

function renderMedia(
  media: CarouselMediaReference,
  embeddedDataUri: string,
  cornerRadius: number,
): string {
  return [
    `<defs><clipPath id="media-${escapeXmlAttribute(safeXmlId(media.id))}"><rect x="${LAYOUT.contentLeft}" y="${LAYOUT.mediaTop}" width="${LAYOUT.contentWidth}" height="${LAYOUT.mediaHeight}" rx="${cornerRadius}"/></clipPath></defs>`,
    `<image x="${LAYOUT.contentLeft}" y="${LAYOUT.mediaTop}" width="${LAYOUT.contentWidth}" height="${LAYOUT.mediaHeight}" href="${escapeXmlAttribute(embeddedDataUri)}" preserveAspectRatio="${mediaAspectRatio(media)}" clip-path="url(#media-${escapeXmlAttribute(safeXmlId(media.id))})" aria-hidden="true"/>`,
  ].join("");
}

function renderTextLines(input: {
  lines: readonly string[];
  x: number;
  firstBaseline: number;
  lineHeight: number;
  fill: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
}): string {
  if (input.lines.length === 0) return "";
  return [
    `<text x="${input.x}" y="${input.firstBaseline}" fill="${input.fill}" font-family="${escapeXmlAttribute(input.fontFamily)}" font-size="${input.fontSize}" font-weight="${input.fontWeight}">`,
    ...input.lines.map((line, index) =>
      `<tspan x="${input.x}" dy="${index === 0 ? 0 : input.lineHeight}">${escapeXmlText(line)}</tspan>`
    ),
    "</text>",
  ].join("");
}

function slideLabel(slide: CarouselSlide, index: number): string {
  if (slide.kind === "cover") return normalizeInlineText(slide.kicker) || "CAROUSEL";
  if (slide.kind === "closing") return "CLOSING";
  return `SLIDE ${index + 1}`;
}

function sourceEvidenceText(model: CarouselRenderModel, slide: CarouselSlide): string {
  const excerpts = [...slide.sourceEvidence]
    .sort((left, right) =>
      left.start - right.start || left.end - right.end || left.id.localeCompare(right.id)
    )
    .map((evidence) => normalizeInlineText(evidence.excerpt));
  return `${normalizeInlineText(model.source.sourceTitle)} — ${excerpts.join(" … ")}`;
}

function mediaAspectRatio(media: CarouselMediaReference): string {
  const horizontal = media.focalPoint.x < 1 / 3
    ? "xMin"
    : media.focalPoint.x > 2 / 3
      ? "xMax"
      : "xMid";
  const vertical = media.focalPoint.y < 1 / 3
    ? "YMin"
    : media.focalPoint.y > 2 / 3
      ? "YMax"
      : "YMid";
  return `${horizontal}${vertical} slice`;
}

function wrapText(value: string, fontSize: number, width: number): string[] {
  const paragraphs = value.replace(/\r\n?/g, "\n").split("\n");
  const maxUnits = width / fontSize;
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = normalizeInlineText(paragraph).split(" ").filter(Boolean);
    if (words.length === 0) {
      if (lines.length > 0) lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureTextUnits(candidate) <= maxUnits) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      const pieces = splitLongWord(word, maxUnits);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) || "";
    }
    if (current) lines.push(current);
  }
  return lines;
}

function splitLongWord(word: string, maxUnits: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && measureTextUnits(candidate) > maxUnits) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function measureTextUnits(value: string): number {
  let units = 0;
  for (const character of value) {
    if (/\s/u.test(character)) units += 0.32;
    else if (/[ilI1.,'’!:;|]/u.test(character)) units += 0.3;
    else if (/[mwMW@%&]/u.test(character)) units += 0.9;
    else if (/[A-Z0-9]/u.test(character)) units += 0.64;
    else if (character.codePointAt(0)! > 0x2fff) units += 1;
    else units += 0.54;
  }
  return units;
}

function measureTextWidth(
  value: string,
  fontSize: number,
  letterSpacing = 0,
): number {
  const characters = Array.from(value);
  return measureTextUnits(value) * fontSize +
    Math.max(0, characters.length - 1) * letterSpacing;
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function cloneMediaForRender(
  media: CarouselMediaReference,
): CarouselReproducibleMediaReference {
  return {
    id: media.id,
    contentHash: media.contentHash,
    mimeType: media.mimeType,
    pixelWidth: media.pixelWidth,
    pixelHeight: media.pixelHeight,
    altText: media.altText,
    decorative: media.decorative,
    focalPoint: { ...media.focalPoint },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((left, right) => left.localeCompare(right));
  return `{${keys.map((key) =>
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  ).join(",")}}`;
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "slide";
}

function safeXmlId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  return /^[a-zA-Z_]/.test(normalized) ? normalized : `id-${normalized || "slide"}`;
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;");
}

export {
  escapeXmlAttribute as escapeCarouselSvgAttribute,
  escapeXmlText as escapeCarouselSvgText,
};

type IssueWriter = (
  code: CarouselValidationCode,
  path: string,
  message: string,
  slideId?: string | null,
) => void;
