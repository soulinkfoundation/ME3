import type { SocialPostSourceType } from "./content-packages";

export const CAROUSEL_RENDER_MODEL_VERSION = "me3.carousel-model.v1" as const;

export const CAROUSEL_CANVAS = Object.freeze({
  width: 1080,
  height: 1350,
});

export const CAROUSEL_SAFE_AREA = Object.freeze({
  top: 96,
  right: 84,
  bottom: 96,
  left: 84,
});

export const CAROUSEL_CONTENT_SLIDE_MIN = 3;
export const CAROUSEL_CONTENT_SLIDE_MAX = 8;

export const CAROUSEL_TEMPLATE_VERSIONS = Object.freeze({
  "owner-editorial": 1,
  "owner-bold": 1,
} as const);

export type CarouselTemplateId = keyof typeof CAROUSEL_TEMPLATE_VERSIONS;

export type CarouselTemplateReference = {
  id: CarouselTemplateId;
  version: number;
};

export type CarouselCanvas = {
  width: number;
  height: number;
};

export type CarouselSource = {
  sourceType: SocialPostSourceType;
  sourceRef: string;
  sourceTitle: string;
  snapshotHash: `sha256:${string}`;
  sourceText: string;
};

export type CarouselSourceEvidence = {
  id: string;
  start: number;
  end: number;
  excerpt: string;
};

export const CAROUSEL_RASTER_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type CarouselRasterMimeType = (typeof CAROUSEL_RASTER_MIME_TYPES)[number];

export type CarouselMediaReference = {
  id: string;
  storageKey: string;
  immutableUrl: string;
  contentHash: `sha256:${string}`;
  mimeType: CarouselRasterMimeType;
  pixelWidth: number;
  pixelHeight: number;
  altText: string;
  decorative: boolean;
  focalPoint: {
    x: number;
    y: number;
  };
};

export type CarouselOwnerStyleTokens = {
  ownerName: string;
  handle: string;
  logoMediaRefId: string | null;
  colors: {
    background: string;
    surface: string;
    text: string;
    mutedText: string;
    accent: string;
    accentText: string;
  };
  typography: {
    family: "sans" | "serif";
    headingWeight: 600 | 700 | 800;
    bodyWeight: 400 | 500 | 600;
  };
  cornerRadius: number;
};

type CarouselSlideBase = {
  id: string;
  title: string;
  body: string;
  altText: string;
  sourceEvidence: readonly CarouselSourceEvidence[];
  mediaRefId: string | null;
};

export type CarouselCoverSlide = CarouselSlideBase & {
  kind: "cover";
  kicker: string;
};

export type CarouselContentSlide = CarouselSlideBase & {
  kind: "content";
};

export type CarouselClosingSlide = CarouselSlideBase & {
  kind: "closing";
};

export type CarouselSlide =
  | CarouselCoverSlide
  | CarouselContentSlide
  | CarouselClosingSlide;

export type CarouselRenderModel = {
  modelVersion: typeof CAROUSEL_RENDER_MODEL_VERSION;
  revision: number;
  template: CarouselTemplateReference;
  canvas: CarouselCanvas;
  source: CarouselSource;
  ownerStyle: CarouselOwnerStyleTokens;
  media: readonly CarouselMediaReference[];
  slides: readonly CarouselSlide[];
};

export type CreateCarouselRenderModelInput = {
  revision?: number;
  template: CarouselTemplateReference;
  canvas?: CarouselCanvas;
  source: CarouselSource;
  ownerStyle: CarouselOwnerStyleTokens;
  media?: readonly CarouselMediaReference[];
  slides: readonly CarouselSlide[];
};

export type CarouselSlideEdit = {
  title?: string;
  body?: string;
  kicker?: string;
  altText?: string;
  sourceEvidence?: readonly CarouselSourceEvidence[];
  mediaRefId?: string | null;
};

export class CarouselRenderModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarouselRenderModelError";
  }
}

export function createCarouselRenderModel(
  input: CreateCarouselRenderModelInput,
): CarouselRenderModel {
  return freezeModel({
    modelVersion: CAROUSEL_RENDER_MODEL_VERSION,
    revision: input.revision ?? 1,
    template: { ...input.template },
    canvas: { ...(input.canvas || CAROUSEL_CANVAS) },
    source: { ...input.source },
    ownerStyle: cloneOwnerStyle(input.ownerStyle),
    media: (input.media || []).map(cloneMediaReference),
    slides: input.slides.map(cloneSlide),
  });
}

export function editCarouselSlide(
  model: CarouselRenderModel,
  slideId: string,
  edit: CarouselSlideEdit,
): CarouselRenderModel {
  const existing = model.slides.find((slide) => slide.id === slideId);
  if (!existing) {
    throw new CarouselRenderModelError("Slide not found");
  }
  if (edit.kicker !== undefined && existing.kind !== "cover") {
    throw new CarouselRenderModelError("Only the cover can have a kicker");
  }

  const edited = cloneSlide({
    ...existing,
    title: edit.title ?? existing.title,
    body: edit.body ?? existing.body,
    altText: edit.altText ?? existing.altText,
    sourceEvidence: edit.sourceEvidence ?? existing.sourceEvidence,
    mediaRefId: Object.prototype.hasOwnProperty.call(edit, "mediaRefId")
      ? edit.mediaRefId ?? null
      : existing.mediaRefId,
    ...(existing.kind === "cover"
      ? { kicker: edit.kicker ?? existing.kicker }
      : {}),
  } as CarouselSlide);

  return freezeModel({
    ...cloneModel(model),
    revision: model.revision + 1,
    slides: model.slides.map((slide) => slide.id === slideId ? edited : cloneSlide(slide)),
  });
}

export function reorderCarouselContentSlides(
  model: CarouselRenderModel,
  orderedContentSlideIds: readonly string[],
): CarouselRenderModel {
  const cover = model.slides.find((slide) => slide.kind === "cover");
  const closing = model.slides.find((slide) => slide.kind === "closing");
  const content = model.slides.filter(
    (slide): slide is CarouselContentSlide => slide.kind === "content",
  );
  const expected = new Set(content.map((slide) => slide.id));
  const requested = new Set(orderedContentSlideIds);
  if (
    !cover ||
    orderedContentSlideIds.length !== content.length ||
    requested.size !== content.length ||
    [...requested].some((id) => !expected.has(id))
  ) {
    throw new CarouselRenderModelError(
      "Reordering must include every content slide exactly once",
    );
  }
  const byId = new Map(content.map((slide) => [slide.id, slide]));
  const slides: CarouselSlide[] = [cloneSlide(cover)];
  for (const id of orderedContentSlideIds) {
    slides.push(cloneSlide(byId.get(id)!));
  }
  if (closing) slides.push(cloneSlide(closing));

  return freezeModel({
    ...cloneModel(model),
    revision: model.revision + 1,
    slides,
  });
}

export function changeCarouselTemplate(
  model: CarouselRenderModel,
  template: CarouselTemplateReference,
): CarouselRenderModel {
  return freezeModel({
    ...cloneModel(model),
    revision: model.revision + 1,
    template: { ...template },
  });
}

function cloneModel(model: CarouselRenderModel): CarouselRenderModel {
  return {
    modelVersion: model.modelVersion,
    revision: model.revision,
    template: { ...model.template },
    canvas: { ...model.canvas },
    source: { ...model.source },
    ownerStyle: cloneOwnerStyle(model.ownerStyle),
    media: model.media.map(cloneMediaReference),
    slides: model.slides.map(cloneSlide),
  };
}

function cloneOwnerStyle(style: CarouselOwnerStyleTokens): CarouselOwnerStyleTokens {
  return {
    ...style,
    colors: { ...style.colors },
    typography: { ...style.typography },
  };
}

function cloneMediaReference(media: CarouselMediaReference): CarouselMediaReference {
  return {
    ...media,
    focalPoint: { ...media.focalPoint },
  };
}

function cloneEvidence(evidence: CarouselSourceEvidence): CarouselSourceEvidence {
  return { ...evidence };
}

function cloneSlide(slide: CarouselSlide): CarouselSlide {
  const base = {
    ...slide,
    sourceEvidence: slide.sourceEvidence.map(cloneEvidence),
  };
  return slide.kind === "cover"
    ? { ...base, kind: "cover", kicker: slide.kicker }
    : slide.kind === "content"
      ? { ...base, kind: "content" }
      : { ...base, kind: "closing" };
}

function freezeModel(model: CarouselRenderModel): CarouselRenderModel {
  Object.freeze(model.template);
  Object.freeze(model.canvas);
  Object.freeze(model.source);
  Object.freeze(model.ownerStyle.colors);
  Object.freeze(model.ownerStyle.typography);
  Object.freeze(model.ownerStyle);
  for (const media of model.media) {
    Object.freeze(media.focalPoint);
    Object.freeze(media);
  }
  Object.freeze(model.media);
  for (const slide of model.slides) {
    for (const evidence of slide.sourceEvidence) Object.freeze(evidence);
    Object.freeze(slide.sourceEvidence);
    Object.freeze(slide);
  }
  Object.freeze(model.slides);
  return Object.freeze(model);
}
