import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAROUSEL_CANVAS,
  createCarouselRenderModel,
  type CarouselMediaReference,
  type CarouselRenderModel,
  type CarouselSlide,
} from "../../../packages/social-publishing/src/carousel-render-model";
import { CAROUSEL_RENDERER_VERSION } from "../../../packages/social-publishing/src/carousel-renderer";
import {
  SOCIAL_CAROUSEL_MEDIA_MAX_BYTES,
  SOCIAL_CAROUSEL_MEDIA_MAX_DIMENSION,
  getSocialCarouselMediaBytes,
  getSocialCarouselMediaBytesByHash,
  getSocialCarouselRenderedAsset,
  getSocialCarouselRenderSet,
  listSocialCarouselMedia,
  renderAndAttachSocialCarousel,
  uploadSocialCarouselMedia,
} from "../../../packages/social-publishing/src/carousels";
import {
  getSocialPost,
  updatePostVersion,
} from "../../../packages/social-publishing/src/content-packages";

const SOURCE_PHRASES = [
  "Small useful work compounds.",
  "Owners keep control of final decisions.",
  "Clear systems make reuse safer.",
  "Source-backed publishing keeps context visible.",
  "Templates should stay readable.",
] as const;
const SOURCE_TEXT = SOURCE_PHRASES.join(" ");
const SOURCE_HASH = createHash("sha256").update(SOURCE_TEXT).digest("hex");

describe("source-backed Carousel persistence", () => {
  let fixture: ReturnType<typeof createFixture>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.close();
    vi.useRealTimers();
  });

  it("accepts only bounded raster bytes, derives trusted metadata, and saves by content hash", async () => {
    const png = fakePng(640, 480);
    const first = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: png,
      claimedMimeType: "image/png",
    });
    const repeated = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: png,
    });
    expect(repeated.id).toBe(first.id);
    expect(first).toMatchObject({
      mimeType: "image/png",
      pixelWidth: 640,
      pixelHeight: 480,
      byteLength: png.byteLength,
    });
    expect(first.contentHash).toBe(
      `sha256:${createHash("sha256").update(png).digest("hex")}`,
    );
    expect(first.storageKey).toMatch(/^social-media\/sha256\/[a-f0-9]{64}\.png$/);
    expect(first.immutableUrl).toMatch(
      /^\/api\/social\/media\/sha256\/[a-f0-9]{64}\.png\?siteId=site-1$/,
    );

    await expect(
      uploadSocialCarouselMedia(fixture.env, "owner", {
        siteId: "site-1",
        bytes: png,
        claimedMimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      uploadSocialCarouselMedia(fixture.env, "owner", {
        siteId: "site-1",
        bytes: new TextEncoder().encode("<svg><script>alert(1)</script></svg>"),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      uploadSocialCarouselMedia(fixture.env, "owner", {
        siteId: "site-1",
        bytes: fakePng(SOCIAL_CAROUSEL_MEDIA_MAX_DIMENSION + 1, 1),
      }),
    ).rejects.toMatchObject({ status: 413 });

    const jpeg = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: fakeJpeg(320, 200),
    });
    const webp = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: fakeWebp(800, 600),
    });
    expect(jpeg).toMatchObject({ mimeType: "image/jpeg", pixelWidth: 320, pixelHeight: 200 });
    expect(webp).toMatchObject({ mimeType: "image/webp", pixelWidth: 800, pixelHeight: 600 });
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_carousel_media")).toBe("3");
    await expect(
      uploadSocialCarouselMedia(fixture.env, "intruder", {
        siteId: "site-1",
        bytes: png,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("round-trips an exact copied ArrayBuffer at the embeddable media boundary", async () => {
    const boundary = fakePng(1, 1, SOCIAL_CAROUSEL_MEDIA_MAX_BYTES);
    boundary[boundary.length - 1] = 0x7f;
    const saved = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: boundary,
    });
    const loaded = await getSocialCarouselMediaBytes(
      fixture.env,
      "owner",
      "site-1",
      saved.id,
    );
    expect(loaded?.bytes).toEqual(boundary);
    expect(createHash("sha256").update(loaded!.bytes).digest("hex"))
      .toBe(saved.contentHash.slice("sha256:".length));
    await expect(
      getSocialCarouselMediaBytesByHash(
        fixture.env,
        "owner",
        "site-1",
        saved.contentHash,
      ),
    ).resolves.toMatchObject({ media: { id: saved.id }, bytes: boundary });
    await expect(
      getSocialCarouselMediaBytesByHash(
        fixture.env,
        "intruder",
        "site-1",
        saved.contentHash.slice("sha256:".length),
      ),
    ).resolves.toBeNull();

    await expect(
      uploadSocialCarouselMedia(fixture.env, "owner", {
        siteId: "site-1",
        bytes: fakePng(1, 1, SOCIAL_CAROUSEL_MEDIA_MAX_BYTES + 1),
      }),
    ).rejects.toMatchObject({ status: 413 });
  }, 15_000);

  it("lists bounded owner media metadata newest-first without crossing owner or Site boundaries", async () => {
    const first = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: fakePng(100, 100),
    });
    vi.setSystemTime(new Date("2026-07-18T12:01:00.000Z"));
    const second = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: fakePng(200, 200),
    });
    await uploadSocialCarouselMedia(fixture.env, "intruder", {
      siteId: "site-intruder",
      bytes: fakePng(300, 300),
    });

    await expect(listSocialCarouselMedia(fixture.env, "owner", "site-1", 1))
      .resolves.toEqual([expect.objectContaining({ id: second.id, pixelWidth: 200 })]);
    await expect(listSocialCarouselMedia(fixture.env, "owner", "site-1"))
      .resolves.toEqual([
        expect.objectContaining({ id: second.id }),
        expect.objectContaining({ id: first.id }),
      ]);
    await expect(listSocialCarouselMedia(fixture.env, "intruder", "site-1"))
      .resolves.toEqual([]);
    await expect(listSocialCarouselMedia(fixture.env, "owner", "site-intruder"))
      .resolves.toEqual([]);
    await expect(listSocialCarouselMedia(fixture.env, "owner", "site-1", 101))
      .rejects.toMatchObject({ status: 400 });
  });

  it("rebuilds every trusted field, embeds owned bytes, and atomically revokes and cancels", async () => {
    const media = await uploadSocialCarouselMedia(fixture.env, "owner", {
      siteId: "site-1",
      bytes: fakePng(640, 480),
    });
    const draft = carouselDraft(media.id);
    const result = await renderAndAttachSocialCarousel(fixture.env, "owner", {
      siteId: "site-1",
      postId: "post-1",
      versionId: "version-1",
      expectedVersionUpdatedAt: "2026-07-01T09:00:00.000Z",
      model: draft,
    });

    expect(result.approvalPreserved).toBe(false);
    expect(result.version).toMatchObject({
      id: "version-1",
      postId: "post-1",
      approvalStatus: "draft",
      carouselRenderSetId: result.renderSet.id,
    });
    expect(result.renderSet).toMatchObject({
      siteId: "site-1",
      postId: "post-1",
      createdFromVersionId: "version-1",
      modelVersion: "me3.carousel-model.v1",
      rendererVersion: CAROUSEL_RENDERER_VERSION,
      canvas: CAROUSEL_CANVAS,
    });
    expect(result.renderSet.model.source).toEqual({
      sourceType: "journal",
      sourceRef: "journal:source-1",
      sourceTitle: "Trusted Source title",
      snapshotHash: `sha256:${SOURCE_HASH}`,
      sourceText: SOURCE_TEXT,
    });
    expect(result.renderSet.model.ownerStyle).toMatchObject({
      ownerName: "Kieran Butler",
      handle: "@kieran",
    });
    expect(result.renderSet.model.canvas).toEqual(CAROUSEL_CANVAS);
    expect(result.renderSet.model.media[0]).toMatchObject({
      id: media.id,
      storageKey: media.storageKey,
      immutableUrl: media.immutableUrl,
      contentHash: media.contentHash,
      mimeType: "image/png",
      pixelWidth: 640,
      pixelHeight: 480,
    });
    expect(result.renderSet.assets).toHaveLength(5);
    expect(result.renderSet.assetManifest).toHaveLength(5);
    expect(result.renderSet.assetManifest[0]?.url).toMatch(
      /^\/api\/social\/carousels\/assets\/.+\?siteId=site-1$/,
    );
    expect(result.renderSet.assetManifest.map((asset) => asset.altText)).toEqual(
      result.renderSet.assets.map((asset) => asset.altText),
    );
    expect(result.renderSet.assets[0]?.svg).toContain("data:image/png;base64,");
    expect(result.renderSet.assets[0]?.svg).not.toContain("evil.example");
    expect(result.renderSet.assets[0]?.svg).not.toContain(media.immutableUrl);
    expect(result.renderSet.assets[0]?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.renderSet.assets[0]?.storageKey).toMatch(
      /^social-carousels\/sha256\/[a-f0-9]{64}\.svg$/,
    );

    expect(fixture.db.query<{ status: string; error_code: string }>(
      "SELECT status, error_code FROM social_publications WHERE id = 'publication-1'",
    )[0]).toEqual({
      status: "cancelled",
      error_code: "cancelled:carousel_render_changed",
    });
    expect(fixture.db.query<{ event_type: string; payload_json: string }>(
      "SELECT event_type, payload_json FROM social_publication_events WHERE publication_id = 'publication-1'",
    )).toEqual([
      expect.objectContaining({ event_type: "cancelled" }),
    ]);
    const payload = JSON.parse(fixture.db.query<{ payload_json: string }>(
      "SELECT payload_json FROM social_publication_events WHERE publication_id = 'publication-1'",
    )[0]!.payload_json);
    expect(payload).toMatchObject({
      reason: "carousel_render_changed",
      renderSetId: result.renderSet.id,
      inputFingerprint: result.renderSet.inputFingerprint,
    });
    const storedPost = await getSocialPost(fixture.env, "owner", "post-1");
    expect(storedPost).toMatchObject({
      versions: [expect.objectContaining({
        id: "version-1",
        carouselRenderSetId: result.renderSet.id,
      })],
    });
    expect(storedPost?.versions[0]?.assetManifest[0]?.altText).toBe(
      result.renderSet.assets[0]!.altText,
    );

    await expect(
      getSocialCarouselRenderSet(fixture.env, "intruder", "site-1", result.renderSet.id),
    ).resolves.toBeNull();
    await expect(
      getSocialCarouselRenderedAsset(
        fixture.env,
        "intruder",
        "site-1",
        result.renderSet.assets[0]!.id,
      ),
    ).resolves.toBeNull();
    await expect(
      getSocialCarouselMediaBytes(fixture.env, "intruder", "site-1", media.id),
    ).resolves.toBeNull();
    await expect(
      getSocialCarouselMediaBytes(fixture.env, "owner", "site-intruder", media.id),
    ).resolves.toBeNull();

    const edited = await updatePostVersion(fixture.env, "owner", "version-1", {
      bodyText: "The owner changed this exact Carousel Version.",
    });
    expect(edited).toMatchObject({
      id: "version-1",
      approvalStatus: "draft",
      carouselRenderSetId: null,
    });
  });

  it("preserves exact approval and schedules when the same output is already attached", async () => {
    const model = carouselDraft();
    const first = await renderAndAttachSocialCarousel(fixture.env, "owner", {
      siteId: "site-1",
      postId: "post-1",
      versionId: "version-1",
      expectedVersionUpdatedAt: "2026-07-01T09:00:00.000Z",
      model,
    });
    fixture.db.run(
      `UPDATE social_variants
       SET approval_status = 'approved', approved_at = ?, approved_by_user_id = ?, updated_at = ?
       WHERE id = ?`,
      "2026-07-18T12:01:00.000Z",
      "owner",
      "2026-07-18T12:01:00.000Z",
      "version-1",
    );
    fixture.db.run(
      `INSERT INTO social_publications (
         id, variant_id, site_id, platform, status, scheduled_for, updated_at
       ) VALUES (?, ?, ?, ?, 'scheduled', ?, ?)`,
      "publication-identical",
      "version-1",
      "site-1",
      "linkedin",
      "2026-07-21T09:00:00.000Z",
      "2026-07-18T12:01:00.000Z",
    );

    const repeated = await renderAndAttachSocialCarousel(fixture.env, "owner", {
      siteId: "site-1",
      postId: "post-1",
      versionId: "version-1",
      expectedVersionUpdatedAt: "2026-07-18T12:01:00.000Z",
      model,
    });
    expect(repeated.renderSet.id).toBe(first.renderSet.id);
    expect(repeated.approvalPreserved).toBe(true);
    expect(repeated.version).toMatchObject({
      approvalStatus: "approved",
      updatedAt: "2026-07-18T12:01:00.000Z",
    });
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_carousel_render_sets")).toBe("1");
    expect(fixture.db.scalar(
      "SELECT status FROM social_publications WHERE id = 'publication-identical'",
    )).toBe("scheduled");
  });

  it("keeps a completed immutable set unused when the exact attach CAS becomes stale", async () => {
    fixture.db.afterNextBatch = () => {
      fixture.db.run(
        "UPDATE social_variants SET updated_at = ? WHERE id = ?",
        "2026-07-18T12:02:00.000Z",
        "version-1",
      );
    };
    await expect(
      renderAndAttachSocialCarousel(fixture.env, "owner", {
        siteId: "site-1",
        postId: "post-1",
        versionId: "version-1",
        expectedVersionUpdatedAt: "2026-07-01T09:00:00.000Z",
        model: carouselDraft(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_carousel_render_sets")).toBe("1");
    expect(fixture.db.query<{
      asset_manifest_json: string;
      carousel_render_set_id: string | null;
      approval_status: string;
    }>(
      "SELECT asset_manifest_json, carousel_render_set_id, approval_status FROM social_variants WHERE id = 'version-1'",
    )[0]).toEqual({
      asset_manifest_json: "[]",
      carousel_render_set_id: null,
      approval_status: "approved",
    });
    expect(fixture.db.scalar(
      "SELECT status FROM social_publications WHERE id = 'publication-1'",
    )).toBe("scheduled");
  });

  it("does not mutate anything after validation or media-ownership failure", async () => {
    const valid = carouselDraft();
    const invalid = {
      ...valid,
      slides: valid.slides.map((item, index) => index === 1
        ? {
          ...item,
          sourceEvidence: [{
            id: "bad-evidence",
            start: 0,
            end: 4,
            excerpt: "does not match",
          }],
        }
        : item),
    } as CarouselRenderModel;
    await expect(
      renderAndAttachSocialCarousel(fixture.env, "owner", {
        siteId: "site-1",
        postId: "post-1",
        versionId: "version-1",
        expectedVersionUpdatedAt: "2026-07-01T09:00:00.000Z",
        model: invalid,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_carousel_render_sets")).toBe("0");
    expect(fixture.db.scalar(
      "SELECT approval_status || ':' || asset_manifest_json FROM social_variants WHERE id = 'version-1'",
    )).toBe("approved:[]");
    expect(fixture.db.scalar(
      "SELECT status FROM social_publications WHERE id = 'publication-1'",
    )).toBe("scheduled");

    const intruderMedia = await uploadSocialCarouselMedia(fixture.env, "intruder", {
      siteId: "site-intruder",
      bytes: fakePng(200, 200),
    });
    await expect(
      renderAndAttachSocialCarousel(fixture.env, "owner", {
        siteId: "site-1",
        postId: "post-1",
        versionId: "version-1",
        expectedVersionUpdatedAt: "2026-07-01T09:00:00.000Z",
        model: carouselDraft(intruderMedia.id),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_carousel_render_sets")).toBe("0");
  });

  it("reuses a Post-scoped immutable set across compatible Carousel Versions", async () => {
    fixture.db.run(
      `INSERT INTO social_variants (
         id, package_id, platform, format, asset_manifest_json, approval_status,
         approved_at, approved_by_user_id, updated_at
       ) VALUES (?, ?, ?, 'carousel', '[]', 'approved', ?, ?, ?)`,
      "version-x",
      "post-1",
      "x",
      "2026-07-01T09:00:00.000Z",
      "owner",
      "2026-07-01T09:00:00.000Z",
    );
    const model = carouselDraft();
    const linkedin = await renderAndAttachSocialCarousel(fixture.env, "owner", {
      siteId: "site-1",
      postId: "post-1",
      versionId: "version-1",
      expectedVersionUpdatedAt: "2026-07-01T09:00:00.000Z",
      model,
    });
    const x = await renderAndAttachSocialCarousel(fixture.env, "owner", {
      siteId: "site-1",
      postId: "post-1",
      versionId: "version-x",
      expectedVersionUpdatedAt: "2026-07-01T09:00:00.000Z",
      model,
    });
    expect(x.renderSet.id).toBe(linkedin.renderSet.id);
    expect(fixture.db.scalar("SELECT COUNT(*) FROM social_carousel_render_sets")).toBe("1");
    expect(fixture.db.query<{ id: string; carousel_render_set_id: string }>(
      "SELECT id, carousel_render_set_id FROM social_variants ORDER BY id",
    )).toEqual([
      { id: "version-1", carousel_render_set_id: linkedin.renderSet.id },
      { id: "version-x", carousel_render_set_id: linkedin.renderSet.id },
    ]);
  });
});

function carouselDraft(mediaId?: string): CarouselRenderModel {
  const media: CarouselMediaReference[] = mediaId
    ? [{
      id: mediaId,
      storageKey: "https://evil.example/forged.png",
      immutableUrl: "https://evil.example/forged.png",
      contentHash: `sha256:${"f".repeat(64)}`,
      mimeType: "image/webp",
      pixelWidth: 99_999,
      pixelHeight: 99_999,
      altText: "A source notebook arranged on a desk for review.",
      decorative: false,
      focalPoint: { x: 0.5, y: 0.5 },
    }]
    : [];
  const slides: CarouselSlide[] = [
    slide("cover", "cover", "Small useful work compounds", SOURCE_PHRASES[0], mediaId || null),
    slide("one", "content", "Keep control", SOURCE_PHRASES[1]),
    slide("two", "content", "Build clear systems", SOURCE_PHRASES[2]),
    slide("three", "content", "Keep context visible", SOURCE_PHRASES[3]),
    slide("closing", "closing", "Stay readable", SOURCE_PHRASES[4]),
  ];
  return createCarouselRenderModel({
    revision: 3,
    template: { id: "owner-editorial", version: 1 },
    canvas: { width: 1, height: 1 },
    source: {
      sourceType: "pasted",
      sourceRef: "https://evil.example/forged-source",
      sourceTitle: "Forged Source title",
      snapshotHash: `sha256:${"0".repeat(64)}`,
      sourceText: SOURCE_TEXT,
    },
    ownerStyle: {
      ownerName: "Forged Owner",
      handle: "@forged",
      logoMediaRefId: null,
      colors: {
        background: "#ffffff",
        surface: "#f1f3f5",
        text: "#111111",
        mutedText: "#444444",
        accent: "#005f52",
        accentText: "#ffffff",
      },
      typography: { family: "sans", headingWeight: 700, bodyWeight: 400 },
      cornerRadius: 24,
    },
    media,
    slides,
  });
}

function slide(
  id: string,
  kind: "cover" | "content" | "closing",
  title: string,
  excerpt: string,
  mediaRefId: string | null = null,
): CarouselSlide {
  const start = SOURCE_TEXT.indexOf(excerpt);
  const base = {
    id,
    title,
    body: kind === "content" ? "A short practical explanation for this point." : "",
    altText: `${kind === "cover" ? "Cover" : kind === "closing" ? "Closing" : "Content"} slide explaining ${title.toLowerCase()}.`,
    sourceEvidence: [{ id: `evidence-${id}`, start, end: start + excerpt.length, excerpt }],
    mediaRefId,
  };
  return kind === "cover"
    ? { ...base, kind, kicker: "SOURCE-BACKED" }
    : { ...base, kind };
}

function fakePng(width: number, height: number, byteLength = 33): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  writeUint32Be(bytes, 16, width);
  writeUint32Be(bytes, 20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

function fakeJpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes[7] = (height >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (width >> 8) & 0xff;
  bytes[10] = width & 0xff;
  bytes[11] = 3;
  return bytes;
}

function fakeWebp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode("VP8X"), 12);
  writeUint24Le(bytes, 24, width - 1);
  writeUint24Le(bytes, 27, height - 1);
  return bytes;
}

function writeUint32Be(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint24Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function createFixture() {
  const db = new TestD1Database();
  db.exec(BASE_SCHEMA);
  db.exec(readFileSync(
    fileURLToPath(new URL("../migrations/0026_social_carousels.sql", import.meta.url)),
    "utf8",
  ));
  db.exec(`
    INSERT INTO owner_profile (id, name, username) VALUES
      ('owner', 'Kieran Butler', 'kieran'),
      ('intruder', 'Another Owner', 'another');
    INSERT INTO sites (id, user_id, username) VALUES
      ('site-1', 'owner', 'kieran-site'),
      ('site-intruder', 'intruder', 'another-site');
  `);
  db.run(
    `INSERT INTO social_packages (
       id, site_id, post_title_snapshot, source_hash, source_type, source_ref,
       source_snapshot, source_text
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "post-1",
    "site-1",
    "Trusted Source title",
    SOURCE_HASH,
    "journal",
    "journal:source-1",
    SOURCE_TEXT,
    SOURCE_TEXT,
  );
  db.run(
    `INSERT INTO social_variants (
       id, package_id, platform, format, asset_manifest_json, approval_status,
       approved_at, approved_by_user_id, updated_at
     ) VALUES (?, ?, ?, 'carousel', '[]', 'approved', ?, ?, ?)`,
    "version-1",
    "post-1",
    "linkedin",
    "2026-07-01T09:00:00.000Z",
    "owner",
    "2026-07-01T09:00:00.000Z",
  );
  db.run(
    `INSERT INTO social_publications (
       id, variant_id, site_id, platform, status, scheduled_for, updated_at
     ) VALUES (?, ?, ?, ?, 'scheduled', ?, ?)`,
    "publication-1",
    "version-1",
    "site-1",
    "linkedin",
    "2026-07-20T09:00:00.000Z",
    "2026-07-01T09:00:00.000Z",
  );
  return {
    db,
    env: { DB: db },
    close: () => db.close(),
  };
}

class TestD1Database {
  private readonly directory = mkdtempSync(join(tmpdir(), "me3-social-carousel-"));
  private readonly database = join(this.directory, "fixture.sqlite");
  afterNextBatch: (() => void) | null = null;

  exec(sql: string) {
    execFileSync("sqlite3", [this.database], { input: sql, encoding: "utf8" });
  }

  prepare(sql: string) {
    return new TestD1Statement(this.database, sql);
  }

  async batch(statements: TestD1Statement[]) {
    const markers = statements.map((statement, index) =>
      `${statement.boundSql()};\nSELECT '__ME3_CHANGE_${index}__|' || changes();`
    ).join("\n");
    const output = execFileSync("sqlite3", [this.database], {
      input: `.mode list\nBEGIN IMMEDIATE;\n${markers}\nCOMMIT;`,
      encoding: "utf8",
    });
    const results = statements.map((_, index) => {
      const match = output.match(new RegExp(`__ME3_CHANGE_${index}__\\|(\\d+)`));
      return { success: true, meta: { changes: Number(match?.[1] || 0) } };
    });
    const callback = this.afterNextBatch;
    this.afterNextBatch = null;
    callback?.();
    return results;
  }

  run(sql: string, ...values: unknown[]) {
    return this.prepare(sql).bind(...values).runSync();
  }

  scalar(sql: string): string {
    return execFileSync("sqlite3", [this.database, sql], { encoding: "utf8" }).trim();
  }

  query<T>(sql: string): T[] {
    return sqliteRows<T>(this.database, sql);
  }

  close() {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

class TestD1Statement {
  private values: unknown[] = [];

  constructor(private readonly database: string, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const bound = this.boundSql();
    if (bound.includes("FROM social_carousel_media") && /,\s*bytes\s+FROM/s.test(bound)) {
      const transformed = bound.replace(
        /,\s*bytes\s+FROM/s,
        ", hex(bytes) AS __test_bytes_hex FROM",
      );
      const row = sqliteRows<Record<string, unknown>>(this.database, transformed)[0];
      if (!row) return null;
      const hex = String(row.__test_bytes_hex || "");
      delete row.__test_bytes_hex;
      row.bytes = Array.from(Buffer.from(hex, "hex"));
      return row as T;
    }
    return sqliteRows<T>(this.database, bound)[0] || null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: sqliteRows<T>(this.database, this.boundSql()) };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const rows = sqliteRows<{ changes: number }>(
      this.database,
      `${this.boundSql()}; SELECT changes() AS changes;`,
    );
    return { success: true, meta: { changes: rows.at(-1)?.changes || 0 } };
  }

  boundSql() {
    return bindSql(this.sql, this.values);
  }
}

function sqliteRows<T>(database: string, sql: string): T[] {
  const output = execFileSync("sqlite3", ["-json", database], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
  if (!output) return [];
  const arrays = output
    .split(/\n(?=\[)/)
    .map((chunk) => JSON.parse(chunk) as T[]);
  return arrays.flat();
}

function bindSql(sql: string, values: unknown[]): string {
  let index = 0;
  let quote = "";
  let output = "";
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position] || "";
    if (quote) {
      output += character;
      if (character === quote) {
        if (sql[position + 1] === quote) {
          output += quote;
          position += 1;
        } else quote = "";
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      output += character;
    } else if (character === "?") {
      output += sqliteLiteral(values[index]);
      index += 1;
    } else output += character;
  }
  if (index !== values.length) {
    throw new Error(`SQLite binding mismatch: used ${index} of ${values.length}`);
  }
  return output;
}

function sqliteLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  if (value instanceof ArrayBuffer) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const BASE_SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE owner_profile (
  id TEXT PRIMARY KEY,
  name TEXT,
  username TEXT UNIQUE
);
CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);
CREATE TABLE social_packages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  post_title_snapshot TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  source_snapshot TEXT NOT NULL,
  source_text TEXT NOT NULL,
  idea_text TEXT NOT NULL DEFAULT '',
  goal TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ready',
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE TABLE social_variants (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  target_account_id TEXT,
  format TEXT NOT NULL DEFAULT 'post',
  body_text TEXT NOT NULL DEFAULT '',
  asset_manifest_json TEXT NOT NULL DEFAULT '[]',
  source_excerpt TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  approved_at TEXT,
  approved_by_user_id TEXT,
  scheduled_for TEXT,
  timezone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL,
  UNIQUE(package_id, platform),
  FOREIGN KEY (package_id) REFERENCES social_packages(id) ON DELETE CASCADE
);
CREATE TABLE social_publications (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_for TEXT,
  timezone TEXT,
  platform_post_url TEXT,
  published_at TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL
);
CREATE TABLE social_publication_events (
  id TEXT PRIMARY KEY,
  publication_id TEXT,
  variant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
`;
