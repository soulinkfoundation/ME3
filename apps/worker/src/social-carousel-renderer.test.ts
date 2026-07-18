import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_CANVAS,
  CAROUSEL_RENDER_MODEL_VERSION,
  CAROUSEL_SAFE_AREA,
  changeCarouselTemplate,
  createCarouselRenderModel,
  editCarouselSlide,
  reorderCarouselContentSlides,
  type CarouselRenderModel,
  type CarouselSlide,
  type CarouselSourceEvidence,
  type CreateCarouselRenderModelInput,
} from "../../../packages/social-publishing/src/carousel-render-model";
import {
  CAROUSEL_RENDERER_VERSION,
  CarouselRenderValidationError,
  canonicalCarouselRenderInput,
  escapeCarouselSvgAttribute,
  escapeCarouselSvgText,
  fingerprintCarouselRenderInput,
  renderCarouselSvgSet,
  validateCarouselRenderModel,
} from "../../../packages/social-publishing/src/carousel-renderer";

const SOURCE_PHRASES = [
  "Small useful work compounds.",
  "Owners keep control of every final decision.",
  "Clear systems make reuse safer.",
  "Source-backed publishing keeps context visible.",
  "Templates should stay readable.",
  "Media remains optional.",
  "Approval applies to exact output.",
  "Reposting should preserve history.",
] as const;

const SOURCE_TEXT = SOURCE_PHRASES.join(" ");
const PHOTO_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x00, 0x00, 0x00, 0x00,
]);
const LOGO_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PHOTO_HASH = hashBytes(PHOTO_BYTES);
const LOGO_HASH = hashBytes(LOGO_BYTES);
const FIXTURE_MEDIA_BYTES = new Map<string, Uint8Array>([
  [`sha256:${PHOTO_HASH}`, PHOTO_BYTES],
  [`sha256:${LOGO_HASH}`, LOGO_BYTES],
]);

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function dataUri(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function renderFixture(model: CarouselRenderModel) {
  return renderCarouselSvgSet(model, {
    resolveMediaBytes: (media) => FIXTURE_MEDIA_BYTES.get(media.contentHash) || null,
  });
}

function sourceEvidence(
  id: string,
  excerpt: string,
  sourceText = SOURCE_TEXT,
): CarouselSourceEvidence {
  const start = sourceText.indexOf(excerpt);
  if (start < 0) throw new Error(`Missing fixture excerpt: ${excerpt}`);
  return { id, start, end: start + excerpt.length, excerpt };
}

function createFixture(options: {
  contentCount?: number;
  includeClosing?: boolean;
} = {}): CarouselRenderModel {
  const contentCount = options.contentCount ?? 4;
  const slides: CarouselSlide[] = [
    {
      id: "cover",
      kind: "cover",
      kicker: "SOURCE-BACKED",
      title: "Small useful work compounds",
      body: "A practical, owner-styled Carousel.",
      altText: "Cover introducing a source-backed publishing Carousel.",
      sourceEvidence: [sourceEvidence("evidence-cover", SOURCE_PHRASES[0])],
      mediaRefId: "photo-media",
    },
    ...Array.from({ length: contentCount }, (_, index): CarouselSlide => ({
      id: `content-${index + 1}`,
      kind: "content",
      title: `Practical point ${index + 1}`,
      body: `A short, readable explanation for point ${index + 1}.`,
      altText: `Content slide explaining practical point ${index + 1}.`,
      sourceEvidence: [
        sourceEvidence(
          `evidence-content-${index + 1}`,
          SOURCE_PHRASES[(index + 1) % SOURCE_PHRASES.length],
        ),
      ],
      mediaRefId: null,
    })),
  ];
  if (options.includeClosing !== false) {
    slides.push({
      id: "closing",
      kind: "closing",
      title: "Keep the Source close",
      body: "Approve the exact output when it is ready.",
      altText: "Closing slide inviting exact-output approval.",
      sourceEvidence: [sourceEvidence("evidence-closing", SOURCE_PHRASES[6])],
      mediaRefId: null,
    });
  }

  return createCarouselRenderModel({
    template: { id: "owner-editorial", version: 1 },
    source: {
      sourceType: "journal",
      sourceRef: "journal:shipping-notes",
      sourceTitle: "Shipping notes",
      snapshotHash: `sha256:${"1".repeat(64)}`,
      sourceText: SOURCE_TEXT,
    },
    ownerStyle: {
      ownerName: "Kieran & Co",
      handle: "@kieran",
      logoMediaRefId: "owner-logo",
      colors: {
        background: "#ffffff",
        surface: "#f1f3f5",
        text: "#111111",
        mutedText: "#444444",
        accent: "#005f52",
        accentText: "#ffffff",
      },
      typography: {
        family: "sans",
        headingWeight: 700,
        bodyWeight: 400,
      },
      cornerRadius: 24,
    },
    media: [
      {
        id: "photo-media",
        storageKey: `social-media/sha256/${PHOTO_HASH}.webp`,
        immutableUrl: `/api/social/media/sha256/${PHOTO_HASH}.webp?siteId=site-1`,
        contentHash: `sha256:${PHOTO_HASH}`,
        mimeType: "image/webp",
        pixelWidth: 1600,
        pixelHeight: 900,
        altText: "Hands arranging source notes on a wooden table.",
        decorative: false,
        focalPoint: { x: 0.5, y: 0.45 },
      },
      {
        id: "owner-logo",
        storageKey: `social-media/sha256/${LOGO_HASH}.png`,
        immutableUrl: `/api/social/media/sha256/${LOGO_HASH}.png?siteId=site-1`,
        contentHash: `sha256:${LOGO_HASH}`,
        mimeType: "image/png",
        pixelWidth: 256,
        pixelHeight: 256,
        altText: "",
        decorative: true,
        focalPoint: { x: 0.5, y: 0.5 },
      },
    ],
    slides,
  });
}

function inputFrom(model: CarouselRenderModel): CreateCarouselRenderModelInput {
  return {
    revision: model.revision,
    template: model.template,
    canvas: model.canvas,
    source: model.source,
    ownerStyle: model.ownerStyle,
    media: model.media,
    slides: model.slides,
  };
}

describe("deterministic Carousel SVG rendering", () => {
  it("renders the same validated input byte-for-byte with embedded version metadata", async () => {
    const model = createFixture();

    const first = await renderFixture(model);
    const second = await renderFixture(model);
    const fromArrayBuffers = await renderCarouselSvgSet(model, {
      resolveMediaBytes: (media) => {
        const bytes = FIXTURE_MEDIA_BYTES.get(media.contentHash);
        return bytes
          ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
          : null;
      },
    });

    expect(second).toEqual(first);
    expect(fromArrayBuffers).toEqual(first);
    expect(second.assets.map((asset) => asset.svg)).toEqual(
      first.assets.map((asset) => asset.svg),
    );
    expect(first.modelVersion).toBe(CAROUSEL_RENDER_MODEL_VERSION);
    expect(first.rendererVersion).toBe(CAROUSEL_RENDERER_VERSION);
    expect(first.template).toEqual({ id: "owner-editorial", version: 1 });
    expect(first.inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.canonicalInput).not.toContain("revision");
    expect(first.canonicalInput).not.toContain(SOURCE_TEXT);
    expect(first.canonicalInput).not.toContain("storageKey");
    expect(first.canonicalInput).not.toContain("immutableUrl");
    expect(first.canonicalInput).not.toContain("/api/social/media/");
    expect(first.assets).toHaveLength(6);

    for (const asset of first.assets) {
      expect(asset.width).toBe(CAROUSEL_CANVAS.width);
      expect(asset.height).toBe(CAROUSEL_CANVAS.height);
      expect(asset.svg).toContain(`<metadata>{"inputFingerprint":"${first.inputFingerprint}"`);
      expect(asset.svg).toContain(CAROUSEL_RENDER_MODEL_VERSION);
      expect(asset.svg).toContain(CAROUSEL_RENDERER_VERSION);
      expect(asset.svg).toContain('"id":"owner-editorial","version":1');
      expect(asset.svg).toContain('role="img"');
      expect(asset.svg).toContain("<title");
      expect(asset.svg).toContain("<desc");
    }
    expect(`${first.canonicalInput}${first.assets.map((asset) => asset.svg).join("")}`)
      .not.toMatch(/openai|dall-e|image[- ]generation|generation provider/i);
  });

  it("sorts non-semantic IDs and object keys while preserving semantic slide order", async () => {
    const fixture = createFixture();
    const extra = sourceEvidence("evidence-cover-extra", SOURCE_PHRASES[2]);
    const slides = fixture.slides.map((slide) => slide.kind === "cover"
      ? { ...slide, sourceEvidence: [...slide.sourceEvidence, extra] }
      : slide) as CarouselSlide[];
    const firstModel = createCarouselRenderModel({ ...inputFrom(fixture), slides });
    const secondModel = createCarouselRenderModel({
      ...inputFrom(firstModel),
      revision: 91,
      media: [...firstModel.media].reverse(),
      slides: firstModel.slides.map((slide) => ({
        ...slide,
        sourceEvidence: [...slide.sourceEvidence].reverse(),
      })) as CarouselSlide[],
    });

    const firstCanonical = canonicalCarouselRenderInput(firstModel);
    const secondCanonical = canonicalCarouselRenderInput(secondModel);
    expect(secondCanonical).toBe(firstCanonical);
    const parsed = JSON.parse(firstCanonical) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
    expect(
      (parsed.media as Array<{ id: string }>).map((media) => media.id),
    ).toEqual(["owner-logo", "photo-media"]);
    expect(
      ((parsed.slides as Array<{ sourceEvidence: CarouselSourceEvidence[] }>)[0]
        ?.sourceEvidence || []).map((evidence) => evidence.id),
    ).toEqual(["evidence-cover", "evidence-cover-extra"]);

    expect(await fingerprintCarouselRenderInput(secondModel)).toBe(
      await fingerprintCarouselRenderInput(firstModel),
    );
    expect((await renderFixture(secondModel)).assets.map((asset) => asset.svg))
      .toEqual((await renderFixture(firstModel)).assets.map((asset) => asset.svg));

    const reversed = reorderCarouselContentSlides(
      firstModel,
      firstModel.slides
        .filter((slide) => slide.kind === "content")
        .map((slide) => slide.id)
        .reverse(),
    );
    expect(await fingerprintCarouselRenderInput(reversed)).not.toBe(
      await fingerprintCarouselRenderInput(firstModel),
    );
    expect((await renderFixture(reversed)).assets.map((asset) => asset.svg))
      .not.toEqual((await renderFixture(firstModel)).assets.map((asset) => asset.svg));
  });
});

describe("Carousel structure and provenance validation", () => {
  it("accepts 3–8 content slides, one cover, and an optional closing", () => {
    for (const count of [3, 8]) {
      expect(validateCarouselRenderModel(createFixture({ contentCount: count })))
        .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "slide_count" })]));
    }
    expect(validateCarouselRenderModel(createFixture({ includeClosing: false })))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "slide_order" })]));

    for (const count of [2, 9]) {
      expect(validateCarouselRenderModel(createFixture({ contentCount: count })))
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: "slide_count" })]));
    }

    const fixture = createFixture();
    const closing = fixture.slides.at(-1)!;
    const malformed = createCarouselRenderModel({
      ...inputFrom(fixture),
      slides: [fixture.slides[0]!, fixture.slides[1]!, closing, ...fixture.slides.slice(2, -1)],
    });
    expect(validateCarouselRenderModel(malformed))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "slide_order" })]));
  });

  it("requires every slide to carry exact, visible Source evidence", async () => {
    const fixture = createFixture();
    const rendered = await renderFixture(fixture);
    expect(rendered.assets.every((asset) => asset.sourceEvidence.length > 0)).toBe(true);
    expect(rendered.assets[0]?.svg).toContain("SOURCE EVIDENCE");
    expect(rendered.assets[0]?.svg).toContain("Shipping notes — Small useful work compounds.");

    const brokenSlides = fixture.slides.map((slide, index) => index === 1
      ? {
          ...slide,
          sourceEvidence: [{
            ...slide.sourceEvidence[0]!,
            start: slide.sourceEvidence[0]!.start + 1,
          }],
        }
      : slide) as CarouselSlide[];
    const broken = createCarouselRenderModel({ ...inputFrom(fixture), slides: brokenSlides });
    expect(validateCarouselRenderModel(broken)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "source_evidence",
        path: "slides[1].sourceEvidence[0]",
        slideId: "content-1",
      }),
    ]));
  });
});

describe("Carousel owner styling, media, and accessibility", () => {
  it("embeds verified owner media bytes without trusting stored URLs or a generation provider", async () => {
    const fixture = createFixture();
    const rendered = await renderFixture(fixture);
    const cover = rendered.assets[0]!.svg;

    expect(cover).toContain('fill="#ffffff"');
    expect(cover).toContain('fill="#005f52"');
    expect(cover).toContain("@kieran");
    expect(cover).toContain(dataUri("image/webp", PHOTO_BYTES));
    expect(cover).toContain(dataUri("image/png", LOGO_BYTES));
    expect(cover).not.toContain("/api/social/media/");
    expect(cover).not.toMatch(/href="https?:/i);
    expect(rendered.assets[0]?.mediaRefIds).toEqual(["photo-media", "owner-logo"]);

    const externalMedia = fixture.media.map((media) => media.id === "photo-media"
      ? { ...media, immutableUrl: `https://example.com/${PHOTO_HASH}.webp` }
      : media);
    const external = createCarouselRenderModel({
      ...inputFrom(fixture),
      media: externalMedia,
    });
    expect(validateCarouselRenderModel(external)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "media_reference", path: "media[0]" }),
    ]));
    await expect(renderCarouselSvgSet(external))
      .rejects.toBeInstanceOf(CarouselRenderValidationError);

    const extraQuery = createCarouselRenderModel({
      ...inputFrom(fixture),
      media: fixture.media.map((media) => media.id === "photo-media"
        ? { ...media, immutableUrl: `${media.immutableUrl}&redirect=https%3A%2F%2Fevil.example` }
        : media),
    });
    expect(validateCarouselRenderModel(extraQuery)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "media_reference", path: "media[0]" }),
    ]));

    const mismatchedKey = createCarouselRenderModel({
      ...inputFrom(fixture),
      media: fixture.media.map((media) => media.id === "photo-media"
        ? { ...media, storageKey: `social-media/sha256/${LOGO_HASH}.webp` }
        : media),
    });
    expect(validateCarouselRenderModel(mismatchedKey)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "media_reference", path: "media[0]" }),
    ]));
  });

  it("requires every referenced media item to resolve to matching raster bytes", async () => {
    const fixture = createFixture();

    await expect(renderCarouselSvgSet(fixture)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "media_reference", path: "media[0]" }),
        expect.objectContaining({ code: "media_reference", path: "media[1]" }),
      ]),
    });

    await expect(renderCarouselSvgSet(fixture, {
      resolveMediaBytes: (media) =>
        media.id === "photo-media" ? null : FIXTURE_MEDIA_BYTES.get(media.contentHash) || null,
    })).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "media_reference",
          path: "media[0]",
          message: expect.stringContaining("could not be loaded"),
        }),
      ]),
    });

    const changedWebpBytes = Uint8Array.from([...PHOTO_BYTES, 0x01]);
    await expect(renderCarouselSvgSet(fixture, {
      resolveMediaBytes: (media) =>
        media.id === "photo-media"
          ? changedWebpBytes
          : FIXTURE_MEDIA_BYTES.get(media.contentHash) || null,
    })).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: "media_reference",
          path: "media[0].contentHash",
          message: expect.stringContaining("content hash"),
        }),
      ]),
    });

    const nonImageBytes = new TextEncoder().encode("<svg><script>unsafe()</script></svg>");
    const nonImageHash = hashBytes(nonImageBytes);
    const wrongSignature = createCarouselRenderModel({
      ...inputFrom(fixture),
      media: fixture.media.map((media) => media.id === "photo-media"
        ? {
            ...media,
            contentHash: `sha256:${nonImageHash}`,
            storageKey: `social-media/sha256/${nonImageHash}.webp`,
            immutableUrl: `/api/social/media/sha256/${nonImageHash}.webp?siteId=site-1`,
          }
        : media),
    });
    await expect(renderCarouselSvgSet(wrongSignature, {
      resolveMediaBytes: (media) =>
        media.id === "photo-media"
          ? nonImageBytes
          : FIXTURE_MEDIA_BYTES.get(media.contentHash) || null,
    })).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "media_reference", path: "media[0].mimeType" }),
      ]),
    });
  });

  it("rejects SVG and other unsupported media metadata before resolving bytes", async () => {
    const fixture = createFixture();
    const unsupported = createCarouselRenderModel({
      ...inputFrom(fixture),
      media: fixture.media.map((media) => media.id === "owner-logo"
        ? {
            ...media,
            mimeType: "image/svg+xml" as "image/png",
            storageKey: `social-media/sha256/${LOGO_HASH}.svg`,
            immutableUrl: `/api/social/media/sha256/${LOGO_HASH}.svg?siteId=site-1`,
          }
        : media),
    });

    expect(validateCarouselRenderModel(unsupported)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "media_reference", path: "media[1].mimeType" }),
      expect.objectContaining({ code: "media_reference", path: "media[1]" }),
    ]));
    await expect(renderFixture(unsupported)).rejects.toBeInstanceOf(
      CarouselRenderValidationError,
    );

    const withoutMedia = createCarouselRenderModel({
      ...inputFrom(fixture),
      ownerStyle: { ...fixture.ownerStyle, logoMediaRefId: null },
      media: [],
      slides: fixture.slides.map((slide) => ({
        ...slide,
        mediaRefId: null,
      })) as CarouselSlide[],
    });
    await expect(renderCarouselSvgSet(withoutMedia)).resolves.toMatchObject({
      assets: expect.any(Array),
    });
  });

  it("enforces exact safe-area inputs, contrast, alt text, and fixed footer lanes", async () => {
    const fixture = createFixture();
    const broken = createCarouselRenderModel({
      ...inputFrom(fixture),
      canvas: { width: CAROUSEL_CANVAS.width - 1, height: CAROUSEL_CANVAS.height },
      ownerStyle: {
        ...fixture.ownerStyle,
        colors: {
          background: "#ffffff",
          surface: "#ffffff",
          text: "#ffffff",
          mutedText: "#ffffff",
          accent: "#ffffff",
          accentText: "#ffffff",
        },
      },
      slides: fixture.slides.map((slide, index) => index === 0
        ? { ...slide, altText: "cover.webp" }
        : slide) as CarouselSlide[],
    });
    const issues = validateCarouselRenderModel(broken);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "safe_area", path: "canvas" }),
      expect.objectContaining({ code: "contrast" }),
      expect.objectContaining({ code: "alt_text", path: "slides[0].altText" }),
    ]));

    const longFooter = createCarouselRenderModel({
      ...inputFrom(fixture),
      ownerStyle: { ...fixture.ownerStyle, handle: "W".repeat(60) },
    });
    expect(validateCarouselRenderModel(longFooter)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "text_overflow", path: "ownerStyle.handle" }),
    ]));

    const rendered = await renderFixture(fixture);
    expect(CAROUSEL_SAFE_AREA).toEqual({ top: 96, right: 84, bottom: 96, left: 84 });
    expect(rendered.assets[0]?.svg).toContain('viewBox="0 0 1080 1350"');
    expect(rendered.assets[0]?.svg).toContain('x="84"');
    expect(rendered.assets[0]?.svg).toContain('x="996"');
  });

  it("rejects overflow instead of shrinking content or crossing safe lanes", async () => {
    const fixture = createFixture();
    const titleOverflow = editCarouselSlide(fixture, "content-1", {
      title: "Wide source-backed publishing ".repeat(30),
    });
    expect(validateCarouselRenderModel(titleOverflow)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "text_overflow",
        path: "slides[1].title",
        slideId: "content-1",
      }),
    ]));
    await expect(renderCarouselSvgSet(titleOverflow))
      .rejects.toBeInstanceOf(CarouselRenderValidationError);

    const kickerOverflow = editCarouselSlide(fixture, "cover", {
      kicker: "W".repeat(50),
    });
    expect(validateCarouselRenderModel(kickerOverflow)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "text_overflow", path: "slides[0].kicker" }),
    ]));

    const validSvg = (await renderFixture(fixture)).assets[0]!.svg;
    expect(validSvg).toContain('font-size="68"');
    expect(validSvg).not.toMatch(/textLength=|font-size-adjust|transform="scale/i);
  });
});

describe("Carousel editing and XML safety", () => {
  it("keeps edits and reorders immutable, explicit, and reproducible", async () => {
    const fixture = createFixture();
    const originalBody = fixture.slides[1]!.body;
    const edited = editCarouselSlide(fixture, "content-1", {
      body: "A revised but still concise explanation.",
    });

    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(fixture.slides)).toBe(true);
    expect(Object.isFrozen(fixture.ownerStyle.colors)).toBe(true);
    expect(fixture.slides[1]?.body).toBe(originalBody);
    expect(edited.revision).toBe(fixture.revision + 1);
    expect(await fingerprintCarouselRenderInput(edited)).not.toBe(
      await fingerprintCarouselRenderInput(fixture),
    );

    const reverted = editCarouselSlide(edited, "content-1", { body: originalBody });
    expect(reverted.revision).toBe(fixture.revision + 2);
    expect(await fingerprintCarouselRenderInput(reverted)).toBe(
      await fingerprintCarouselRenderInput(fixture),
    );

    const reversedIds = fixture.slides
      .filter((slide) => slide.kind === "content")
      .map((slide) => slide.id)
      .reverse();
    const reordered = reorderCarouselContentSlides(fixture, reversedIds);
    expect(reordered.slides[0]?.kind).toBe("cover");
    expect(reordered.slides.at(-1)?.kind).toBe("closing");
    expect(
      reordered.slides.filter((slide) => slide.kind === "content").map((slide) => slide.id),
    ).toEqual(reversedIds);
    expect(() => reorderCarouselContentSlides(fixture, ["content-1"]))
      .toThrow("every content slide exactly once");

    const bold = changeCarouselTemplate(fixture, { id: "owner-bold", version: 1 });
    expect(await fingerprintCarouselRenderInput(bold)).not.toBe(
      await fingerprintCarouselRenderInput(fixture),
    );
    expect((await renderFixture(bold)).assets[0]?.svg)
      .not.toBe((await renderFixture(fixture)).assets[0]?.svg);
  });

  it("escapes XML text and attributes and neutralizes injected IDs", async () => {
    expect(escapeCarouselSvgText(`<tag>&"'`)).toBe(`&lt;tag&gt;&amp;"'`);
    expect(escapeCarouselSvgAttribute(`<tag "x">&'\r\n`))
      .toBe("&lt;tag &quot;x&quot;&gt;&amp;&apos;&#13;&#10;");

    const fixture = createFixture();
    const injection = `<script>alert("x")</script> & "'`;
    const maliciousMediaId = `photo" onload="evil`;
    const injected = createCarouselRenderModel({
      ...inputFrom(fixture),
      source: {
        ...fixture.source,
        sourceTitle: injection,
        sourceText: `${fixture.source.sourceText} ${injection}`,
      },
      ownerStyle: {
        ...fixture.ownerStyle,
        ownerName: injection,
        handle: "@owner & <admin>",
      },
      media: fixture.media.map((media) => media.id === "photo-media"
        ? { ...media, id: maliciousMediaId }
        : media),
      slides: fixture.slides.map((slide) => slide.kind === "cover"
        ? {
            ...slide,
            id: `cover" onload="alert(1)<svg`,
            kicker: `SOURCE & <PROOF>`,
            title: injection,
            altText: `Cover safely describing ${injection}`,
            mediaRefId: maliciousMediaId,
          }
        : slide) as CarouselSlide[],
    });

    const rendered = await renderFixture(injected);
    const svg = rendered.assets[0]!.svg;
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain('onload="');
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("SOURCE &amp; &lt;PROOF&gt;");
    expect(rendered.assets[0]?.fileName).toMatch(/^01-[a-z0-9-]+\.svg$/);
    expect(rendered.assets[0]?.fileName).not.toMatch(/[<>"']/);
  });
});
