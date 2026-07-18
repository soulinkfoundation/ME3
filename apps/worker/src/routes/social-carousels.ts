import {
  CAROUSEL_RASTER_MIME_TYPES,
  SOCIAL_CAROUSEL_MEDIA_MAX_BYTES,
  SocialCarouselInputError,
  SocialPublishingGateError,
  getSocialCarouselMediaBytes,
  getSocialCarouselMediaBytesByHash,
  getSocialCarouselRenderedAsset,
  getSocialCarouselRenderSet,
  getSocialPublishingRuntimeStatus,
  listSocialCarouselMedia,
  renderAndAttachSocialCarousel,
  uploadSocialCarouselMedia,
  type CarouselRasterMimeType,
  type RenderAndAttachSocialCarouselInput,
  type SocialCarouselMedia,
  type SocialCarouselRenderAsset,
  type SocialCarouselRenderSet,
} from "../social-publishing";
import type { AppContext, AppHono, OwnerRouteDeps } from "../http/types";

export function registerSocialCarouselRoutes(app: AppHono, deps: OwnerRouteDeps) {
  app.get("/api/social/carousels/media", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const media = await listSocialCarouselMedia(
        c.env,
        ownerId,
        c.req.query("siteId"),
        c.req.query("limit"),
      );
      return c.json({ media });
    } catch (error) {
      return socialCarouselErrorResponse(c, error);
    }
  });

  app.post("/api/social/carousels/media", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const claimedMimeType = carouselUploadMimeType(c.req.header("content-type"));
      const bytes = await readBoundedRequestBytes(c.req.raw, SOCIAL_CAROUSEL_MEDIA_MAX_BYTES);
      const media = await uploadSocialCarouselMedia(c.env, ownerId, {
        siteId: c.req.query("siteId"),
        bytes,
        claimedMimeType,
      });
      return c.json({ ok: true, media }, 201);
    } catch (error) {
      return socialCarouselErrorResponse(c, error);
    }
  });

  app.get("/api/social/carousels/media/:mediaId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const result = await getSocialCarouselMediaBytes(
        c.env,
        ownerId,
        c.req.query("siteId"),
        c.req.param("mediaId"),
      );
      if (!result) return c.json({ ok: false, error: "Carousel media not found" }, 404);
      return immutableMediaResponse(c, result.media, result.bytes);
    } catch (error) {
      return socialCarouselErrorResponse(c, error);
    }
  });

  app.get("/api/social/media/sha256/:fileName", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const siteId = exactContentAddressedSiteId(c);
      const address = carouselMediaAddress(c.req.param("fileName"));
      const result = await getSocialCarouselMediaBytesByHash(
        c.env,
        ownerId,
        siteId,
        address.contentHash,
      );
      if (!result || result.media.mimeType !== address.mimeType) {
        return c.json({ ok: false, error: "Carousel media not found" }, 404);
      }
      return immutableMediaResponse(c, result.media, result.bytes);
    } catch (error) {
      return socialCarouselErrorResponse(c, error);
    }
  });

  app.post("/api/social/carousels/render", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);
    const body = await c.req.json<unknown>().catch((): unknown => ({}));

    try {
      await requireSocialPublishing(c);
      const result = await renderAndAttachSocialCarousel(
        c.env,
        ownerId,
        (body && typeof body === "object" ? body : {}) as RenderAndAttachSocialCarouselInput,
      );
      return c.json({
        ok: true,
        ...result,
        renderSet: carouselRenderSetMetadata(result.renderSet),
      });
    } catch (error) {
      return socialCarouselErrorResponse(c, error);
    }
  });

  app.get("/api/social/carousels/render-sets/:renderSetId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const renderSet = await getSocialCarouselRenderSet(
        c.env,
        ownerId,
        c.req.query("siteId"),
        c.req.param("renderSetId"),
      );
      if (!renderSet) {
        return c.json({ ok: false, error: "Carousel render set not found" }, 404);
      }
      return c.json({ renderSet: carouselRenderSetMetadata(renderSet) });
    } catch (error) {
      return socialCarouselErrorResponse(c, error);
    }
  });

  app.get("/api/social/carousels/assets/:assetId", async (c) => {
    const ownerId = await deps.requireOwner(c);
    if (!ownerId) return deps.unauthorized(c);

    try {
      await requireSocialPublishing(c);
      const asset = await getSocialCarouselRenderedAsset(
        c.env,
        ownerId,
        c.req.query("siteId"),
        c.req.param("assetId"),
      );
      if (!asset) return c.json({ ok: false, error: "Carousel asset not found" }, 404);
      return immutableCarouselAssetResponse(c, asset);
    } catch (error) {
      return socialCarouselErrorResponse(c, error);
    }
  });
}

async function requireSocialPublishing(c: AppContext): Promise<void> {
  const gate = await getSocialPublishingRuntimeStatus(c.env);
  if (!gate.ready) throw new SocialPublishingGateError(gate);
}

function socialCarouselErrorResponse(c: AppContext, error: unknown) {
  if (error instanceof SocialPublishingGateError) {
    return c.json({ ok: false, error: error.message, plugin: error.gate }, error.status as any);
  }
  if (error instanceof SocialCarouselInputError) {
    return c.json(
      { ok: false, error: error.message, issues: error.issues },
      error.status as any,
    );
  }
  throw error;
}

function carouselUploadMimeType(value: string | undefined): CarouselRasterMimeType {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!CAROUSEL_RASTER_MIME_TYPES.includes(mimeType as CarouselRasterMimeType)) {
    throw new SocialCarouselInputError("Use a PNG, JPEG, or WebP image");
  }
  return mimeType as CarouselRasterMimeType;
}

function exactContentAddressedSiteId(c: AppContext): string {
  const searchParams = new URL(c.req.url).searchParams;
  const siteIds = searchParams.getAll("siteId");
  if (
    siteIds.length !== 1 ||
    !siteIds[0]?.trim() ||
    Array.from(searchParams.keys()).some((key) => key !== "siteId")
  ) {
    throw new SocialCarouselInputError(
      "Content-addressed Carousel media requires exactly one siteId",
    );
  }
  return siteIds[0];
}

function carouselMediaAddress(fileName: string): {
  contentHash: `sha256:${string}`;
  mimeType: CarouselRasterMimeType;
} {
  const match = /^([a-f0-9]{64})\.(png|jpg|webp)$/.exec(fileName);
  if (!match) throw new SocialCarouselInputError("Carousel media address is invalid");
  const mimeTypes = {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
  } as const;
  return {
    contentHash: `sha256:${match[1]}`,
    mimeType: mimeTypes[match[2] as keyof typeof mimeTypes],
  };
}

async function readBoundedRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw carouselMediaTooLargeError();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel("Carousel media exceeds the upload limit");
      throw carouselMediaTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function carouselMediaTooLargeError(): SocialCarouselInputError {
  return new SocialCarouselInputError("Carousel media must be 640 KB or smaller", 413);
}

function immutableMediaResponse(
  c: AppContext,
  media: SocialCarouselMedia,
  bytes: Uint8Array,
): Response {
  const headers = immutableAssetHeaders(media.contentHash, media.mimeType, media.byteLength);
  if (c.req.header("if-none-match") === headers.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(exactArrayBuffer(bytes), { status: 200, headers });
}

function immutableCarouselAssetResponse(
  c: AppContext,
  asset: SocialCarouselRenderAsset,
): Response {
  const headers = immutableAssetHeaders(asset.contentHash, asset.mimeType, asset.byteLength);
  headers["content-disposition"] = `inline; filename="${safeHeaderFileName(asset.fileName)}"`;
  headers["content-security-policy"] =
    "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  if (c.req.header("if-none-match") === headers.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(asset.svg, { status: 200, headers });
}

function immutableAssetHeaders(
  contentHash: `sha256:${string}`,
  mimeType: string,
  byteLength: number,
): Record<string, string> {
  return {
    "cache-control": "private, max-age=31536000, immutable",
    "content-length": String(byteLength),
    "content-type": mimeType,
    etag: `"${contentHash.slice("sha256:".length)}"`,
    "x-content-type-options": "nosniff",
  };
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function safeHeaderFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "carousel-slide.svg";
}

function carouselRenderSetMetadata(renderSet: SocialCarouselRenderSet) {
  return {
    ...renderSet,
    assets: renderSet.assets.map((asset) => {
      const { svg: _svg, ...metadata } = asset;
      return metadata;
    }),
  };
}
