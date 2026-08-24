import { describe, expect, it } from "vitest";
import {
  MAX_SITE_AUDIO_BYTES,
  audioContentTypeForFile,
  audioExtensionForContentType,
  exportSiteContentToMarkdown,
  validateSiteAudioFile,
  type SiteContentAsset,
} from "./siteContentAssets";

describe("site content audio files", () => {
  it.each([
    ["recording.mp3", "audio/mp3", "audio/mpeg", "mp3"],
    ["recording.m4a", "audio/x-m4a", "audio/mp4", "m4a"],
    ["recording.wav", "audio/vnd.wave", "audio/wav", "wav"],
    ["recording.MP3", "", "audio/mpeg", "mp3"],
  ])(
    "normalizes %s (%s)",
    (name, type, expectedType, expectedExtension) => {
      expect(audioContentTypeForFile({ name, type })).toBe(expectedType);
      expect(audioExtensionForContentType(expectedType)).toBe(
        expectedExtension,
      );
    },
  );

  it("rejects unsupported and oversized files", () => {
    expect(
      validateSiteAudioFile({ name: "notes.txt", type: "text/plain", size: 10 }),
    ).toContain("MP3");
    expect(
      validateSiteAudioFile({
        name: "long.mp3",
        type: "audio/mpeg",
        size: MAX_SITE_AUDIO_BYTES + 1,
      }),
    ).toContain("40 MB");
  });
});

describe("exportSiteContentToMarkdown", () => {
  it("rewrites a local audio block to a stable portable path", () => {
    const blob = new Blob(["audio"], { type: "audio/mpeg" });
    const asset: SiteContentAsset = {
      id: "0f48ee70-1d65-4412-a9a1-11666b0cf580",
      kind: "audio",
      blob,
      tempUrl: "blob:local-audio",
      mimeType: "audio/mpeg",
      ext: "mp3",
      filename: "grounding.mp3",
      title: "Grounding practice",
    };
    const content = `<figure data-me3-audio="true" data-asset-id="${asset.id}" data-src="blob:local-audio" data-path="" data-type="audio/mpeg" data-title="Grounding practice" class="content-audio"><figcaption>Grounding practice</figcaption><audio controls preload="metadata"><source src="blob:local-audio" type="audio/mpeg"></audio></figure>`;

    const exported = exportSiteContentToMarkdown(content, [asset], "../");

    expect(exported.markdown).toContain(
      `../files/content/${asset.id}.mp3`,
    );
    expect(exported.markdown).not.toContain("blob:local-audio");
    expect(exported.markdown).toContain("<audio controls");
    expect(exported.assets).toEqual([
      expect.objectContaining({
        id: asset.id,
        kind: "audio",
        relativePath: `files/content/${asset.id}.mp3`,
        mimeType: "audio/mpeg",
        blob,
      }),
    ]);
  });

  it("keeps an existing asset portable after its preview URL is resolved", () => {
    const id = "7f36d6dd-84cf-4e2a-b4d6-907b7faeeabe";
    const previewUrl = `/preview/sarah/files/content/${id}.m4a`;
    const content = `<figure data-me3-audio="true" data-asset-id="${id}" data-src="${previewUrl}" data-path="../files/content/${id}.m4a" data-type="audio/mp4" class="content-audio"><figcaption>Monthly message</figcaption><audio controls><source src="${previewUrl}" type="audio/mp4"></audio></figure>`;

    const exported = exportSiteContentToMarkdown(content, [], "./");

    expect(exported.markdown).toContain(`./files/content/${id}.m4a`);
    expect(exported.assets).toEqual([
      expect.objectContaining({
        id,
        relativePath: `files/content/${id}.m4a`,
        sourceUrl: previewUrl,
      }),
    ]);
  });

  it("rewrites every copied block while exporting a shared asset once", () => {
    const id = "30be8b75-40b3-4a7f-9acd-85374cf2ab29";
    const block = `<figure data-me3-audio="true" data-asset-id="${id}" data-src="blob:copied-audio" data-type="audio/mpeg"><audio controls><source src="blob:copied-audio" type="audio/mpeg"></audio></figure>`;
    const asset: SiteContentAsset = {
      id,
      kind: "audio",
      blob: new Blob(["audio"], { type: "audio/mpeg" }),
      tempUrl: "blob:copied-audio",
      mimeType: "audio/mpeg",
      ext: "mp3",
      filename: "copied.mp3",
    };

    const exported = exportSiteContentToMarkdown(`${block}${block}`, [asset]);

    expect(exported.markdown.match(new RegExp(`files/content/${id}\\.mp3`, "g"))).toHaveLength(6);
    expect(exported.markdown).not.toContain("blob:copied-audio");
    expect(exported.assets).toHaveLength(1);
  });
});
