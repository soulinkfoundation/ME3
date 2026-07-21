import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SocialCarouselApiError,
  useSocialStore,
  type PostVersion,
  type RenderAndAttachSocialCarouselInput,
  type RenderAndAttachSocialCarouselResult,
  type SocialCarouselMedia,
  type SocialPostDetail,
} from "../stores/social";
import SocialCarouselEditor from "./SocialCarouselEditor.vue";

const toastHarness = vi.hoisted(() => ({ success: vi.fn() }));

vi.mock("../composables/useAppToast", () => ({
  useAppToast: () => ({ toastSuccess: toastHarness.success }),
}));

const post = {
  id: "post-1",
  siteId: "site-1",
  sourceType: "journal",
  sourceRef: "journal:entry-1",
  sourceTitle: "Small useful slices",
  sourceSnapshot: '{"id":"entry-1"}',
  sourceText:
    "Ship the smallest useful slice. Listen carefully to real feedback. Improve the next slice with what you learned.",
  ideaText: "Ship a useful slice and learn",
  tags: ["shipping"],
  goal: null,
  status: "ready",
  createdBy: "user",
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
} satisfies SocialPostDetail["post"];

const version = {
  id: "version-1",
  postId: "post-1",
  platform: "linkedin",
  targetAccountId: "account-1",
  format: "carousel",
  bodyText: "Ship a useful slice, listen, and improve.",
  assetManifest: [],
  sourceExcerpt: "Ship the smallest useful slice.",
  approvalStatus: "approved",
  approvedAt: "2026-07-18T09:00:00.000Z",
  approvedByUserId: "owner",
  scheduledFor: "2026-07-20T09:00:00.000Z",
  timezone: "Europe/Dublin",
  publicationStatus: "scheduled",
  platformPostUrl: null,
  publishedAt: null,
  failureClass: null,
  errorMessage: null,
  carouselRenderSetId: null,
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T09:00:00.000Z",
} satisfies PostVersion;

const media = {
  id: "media-1",
  siteId: "site-1",
  contentHash: `sha256:${"a".repeat(64)}`,
  storageKey: `social-media/sha256/${"a".repeat(64)}.png`,
  immutableUrl: `/api/social/media/sha256/${"a".repeat(64)}.png?siteId=site-1`,
  mimeType: "image/png",
  pixelWidth: 1080,
  pixelHeight: 1350,
  byteLength: 500,
  createdAt: "2026-07-18T08:30:00.000Z",
} satisfies SocialCarouselMedia;

function attachedResult(
  input: RenderAndAttachSocialCarouselInput,
  approvalPreserved: boolean,
): RenderAndAttachSocialCarouselResult {
  return {
    renderSet: {
      id: "render-set-1",
      siteId: input.siteId,
      postId: input.postId,
      createdFromVersionId: input.versionId,
      inputFingerprint: `sha256:${"b".repeat(64)}`,
      modelVersion: input.model.modelVersion,
      rendererVersion: "me3.carousel-svg.v2",
      template: { ...input.model.template },
      canvas: { ...input.model.canvas },
      model: input.model,
      canonicalInput: "{}",
      assetManifest: [{
        url: "/api/social/carousels/assets/asset-1?siteId=site-1",
        filename: "01-cover.svg",
        mimeType: "image/svg+xml",
        kind: "image",
        altText: input.model.slides[0]!.altText,
      }],
      assets: [{
        id: "asset-1",
        renderSetId: "render-set-1",
        slideId: "cover",
        position: 0,
        contentHash: `sha256:${"c".repeat(64)}`,
        storageKey: `social-carousels/sha256/${"c".repeat(64)}.svg`,
        immutableUrl: "/api/social/carousels/assets/asset-1?siteId=site-1",
        fileName: "01-cover.svg",
        mimeType: "image/svg+xml",
        pixelWidth: 1080,
        pixelHeight: 1350,
        byteLength: 1200,
        altText: input.model.slides[0]!.altText,
        sourceEvidence: input.model.slides[0]!.sourceEvidence,
        mediaRefIds: [],
      }],
      createdAt: "2026-07-18T10:00:00.000Z",
    },
    version: {
      id: input.versionId,
      postId: input.postId,
      approvalStatus: approvalPreserved ? "approved" : "draft",
      updatedAt: approvalPreserved
        ? input.expectedVersionUpdatedAt
        : "2026-07-18T10:00:00.000Z",
      carouselRenderSetId: "render-set-1",
    },
    approvalPreserved,
  };
}

function mountEditor() {
  return mount(SocialCarouselEditor, {
    props: { open: true, post, version },
    global: {
      stubs: {
        AppDialog: {
          props: ["open"],
          template: '<div v-if="open" class="dialog-stub"><slot /></div>',
        },
      },
    },
  });
}

describe("SocialCarouselEditor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(useSocialStore(), "listCarouselMedia").mockResolvedValue([media]);
  });

  it("seeds exact Source evidence, edits fields, selects owner media, and reorders content slides", async () => {
    const store = useSocialStore();
    const render = vi.spyOn(store, "renderAndAttachCarousel")
      .mockImplementation(async (input) => attachedResult(input, true));
    const wrapper = mountEditor();
    await flushPromises();

    expect(wrapper.findAll(".slide-editor")).toHaveLength(5);
    expect(wrapper.text()).toContain("“Ship the smallest useful slice.”");
    const firstContent = wrapper.get('[data-slide-id="content-1"]');
    await firstContent.get('input').setValue("A deliberately edited point");
    await firstContent.get("select").setValue("media-1");
    await firstContent.get('button[aria-label="Move slide 2 down"]').trigger("click");

    expect(
      wrapper.findAll(".slide-editor").map((slide) => slide.attributes("data-slide-id")),
    ).toEqual(["cover", "content-2", "content-1", "content-3", "closing"]);

    await wrapper.findAll("button").find((button) => button.text() === "Render and attach")!
      .trigger("click");
    await flushPromises();

    const input = render.mock.calls[0]![0];
    expect(input.expectedVersionUpdatedAt).toBe(version.updatedAt);
    expect(input.model.slides.map((slide) => slide.id)).toEqual([
      "cover",
      "content-2",
      "content-1",
      "content-3",
      "closing",
    ]);
    expect(input.model.slides.find((slide) => slide.id === "content-1"))
      .toMatchObject({ title: "A deliberately edited point", mediaRefId: "media-1" });
    expect(input.model.media[0]).toMatchObject({ id: "media-1", mimeType: "image/png" });
  });

  it("renders structured overflow, safe-area, contrast, alt-text, and media checks", async () => {
    const issues = [
      ["text_overflow", "Text exceeds the fixed Template limit"],
      ["safe_area", "Content crosses the fixed safe area"],
      ["contrast", "Text needs at least 4.5:1 contrast"],
      ["alt_text", "Write concise alt text"],
      ["media_reference", "Saved owner media could not be loaded"],
    ] as const;
    vi.spyOn(useSocialStore(), "renderAndAttachCarousel").mockRejectedValue(
      new SocialCarouselApiError(
        "Carousel cannot be rendered until its checks pass",
        400,
        issues.map(([code, message], index) => ({
          code,
          path: `slides[${index}]`,
          message,
          slideId: `content-${index + 1}`,
        })),
      ),
    );
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "Render and attach")!
      .trigger("click");
    await flushPromises();

    const alert = wrapper.get(".carousel-issues");
    expect(alert.attributes("role")).toBe("alert");
    expect(alert.text()).toContain("Text overflow:");
    expect(alert.text()).toContain("Safe area:");
    expect(alert.text()).toContain("Contrast:");
    expect(alert.text()).toContain("Alt text:");
    expect(alert.text()).toContain("Media:");
  });

  it("rejects owner media above the portable 640 KB limit before upload", async () => {
    const upload = vi.spyOn(useSocialStore(), "uploadCarouselMedia");
    const wrapper = mountEditor();
    await flushPromises();
    const input = wrapper.get('input[type="file"]');
    const file = new File([new Uint8Array(640_001)], "too-large.png", {
      type: "image/png",
    });
    Object.defineProperty(input.element, "files", {
      configurable: true,
      value: [file],
    });

    await input.trigger("change");

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Carousel images must be 640 KB or smaller",
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("emits the refreshed Version, explains approval reset, and previews server SVG assets", async () => {
    vi.spyOn(useSocialStore(), "renderAndAttachCarousel")
      .mockImplementation(async (input) => attachedResult(input, false));
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "Render and attach")!
      .trigger("click");
    await flushPromises();

    expect(wrapper.emitted("attached")?.[0]?.[0]).toMatchObject({
      approvalPreserved: false,
      version: {
        id: "version-1",
        approvalStatus: "draft",
        carouselRenderSetId: "render-set-1",
      },
    });
    expect(toastHarness.success).toHaveBeenCalledWith(
      expect.stringContaining("Approval was reset and scheduled Publications were cancelled"),
    );
    const preview = wrapper.get(".carousel-preview img");
    expect(preview.attributes("src"))
      .toBe("/api/social/carousels/assets/asset-1?siteId=site-1");
    expect(preview.attributes("alt")).toContain("Carousel cover");
  });
});
