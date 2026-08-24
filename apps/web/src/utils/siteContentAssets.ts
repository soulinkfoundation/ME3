import { createContentTurndownService } from "./contentMarkdown";

export type SiteContentAssetKind = "image" | "audio";

export type SiteContentAsset = {
  id: string;
  kind: SiteContentAssetKind;
  blob: Blob;
  tempUrl: string;
  mimeType: string;
  ext: string;
  filename: string;
  title?: string;
  alt?: string;
};

export type ExportedSiteContentAsset = {
  id: string;
  kind: SiteContentAssetKind;
  relativePath: string;
  mimeType: string;
  blob?: Blob;
  sourceUrl?: string;
};

export const MAX_SITE_AUDIO_BYTES = 40 * 1024 * 1024;
export const SITE_AUDIO_ACCEPT = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/x-wav",
  ".mp3",
  ".m4a",
  ".wav",
].join(",");

const audioMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/x-wav",
]);

const turndown = createContentTurndownService();

export function audioContentTypeForFile(
  file: Pick<File, "name" | "type">,
): string {
  const mimeType = file.type.trim().toLowerCase();
  if (audioMimeTypes.has(mimeType)) return canonicalAudioContentType(mimeType);

  const extension = extensionFromFilename(file.name);
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "wav") return "audio/wav";
  return "";
}

export function audioExtensionForContentType(contentType: string): string {
  const canonical = canonicalAudioContentType(contentType);
  if (canonical === "audio/mpeg") return "mp3";
  if (canonical === "audio/mp4") return "m4a";
  if (canonical === "audio/wav") return "wav";
  return "";
}

export function validateSiteAudioFile(
  file: Pick<File, "name" | "type" | "size">,
): string | null {
  if (!audioContentTypeForFile(file)) {
    return "Choose an MP3, M4A, or WAV audio file.";
  }
  if (file.size > MAX_SITE_AUDIO_BYTES) {
    return "Audio files must be 40 MB or smaller.";
  }
  return null;
}

export function normalizeSiteAudioFile(file: File): File {
  const mimeType = audioContentTypeForFile(file);
  if (!mimeType || file.type === mimeType) return file;
  return new File([file], file.name, {
    type: mimeType,
    lastModified: file.lastModified,
  });
}

export function stableContentAssetPath(asset: {
  id: string;
  ext: string;
}): string {
  const safeId = asset.id.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  const safeExtension = asset.ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `files/content/${safeId || "asset"}.${safeExtension || "bin"}`;
}

export function exportSiteContentToMarkdown(
  content: string,
  assets: SiteContentAsset[],
  basePath = "./",
): { markdown: string; assets: ExportedSiteContentAsset[] } {
  if (!content.trim()) return { markdown: "", assets: [] };

  const documentValue = new DOMParser().parseFromString(content, "text/html");
  const exportedAssets: ExportedSiteContentAsset[] = [];
  const seen = new Set<string>();

  for (const image of documentValue.querySelectorAll<HTMLImageElement>(
    "img[data-image-id]",
  )) {
    const id = image.dataset.imageId || "";
    if (!id) continue;
    const asset = assets.find((candidate) => candidate.id === id);
    if (asset) {
      const relativePath = stableContentAssetPath(asset);
      image.setAttribute("src", `${basePath}${relativePath}`);
      if (!seen.has(id)) {
        seen.add(id);
        exportedAssets.push({
          id,
          kind: "image",
          relativePath,
          mimeType: asset.mimeType,
          blob: asset.blob,
        });
      }
      continue;
    }

    const existingPath = siteContentAssetPathFromUrl(image.getAttribute("src") || "");
    if (!existingPath) continue;
    const sourceUrl = image.getAttribute("src") || undefined;
    image.setAttribute("src", `${basePath}${existingPath}`);
    if (seen.has(id)) continue;
    seen.add(id);
    exportedAssets.push({
      id,
      kind: "image",
      relativePath: existingPath,
      mimeType: imageMimeTypeFromPath(existingPath),
      sourceUrl,
    });
  }

  for (const audio of documentValue.querySelectorAll<HTMLElement>(
    "[data-me3-audio][data-asset-id]",
  )) {
    const id = audio.dataset.assetId || "";
    if (!id) continue;
    const asset = assets.find((candidate) => candidate.id === id);
    const source = audio.querySelector<HTMLSourceElement>("audio source");
    const currentSource =
      audio.dataset.src || source?.getAttribute("src") || "";
    const existingPath = siteContentAssetPathFromUrl(
      audio.dataset.path || currentSource,
    );
    const relativePath = asset
      ? stableContentAssetPath(asset)
      : existingPath;
    if (!relativePath) continue;

    const publishedSource = `${basePath}${relativePath}`;
    audio.dataset.src = publishedSource;
    audio.dataset.path = publishedSource;
    if (source) source.setAttribute("src", publishedSource);

    if (seen.has(id)) continue;
    seen.add(id);
    exportedAssets.push({
      id,
      kind: "audio",
      relativePath,
      mimeType:
        asset?.mimeType ||
        audio.dataset.type ||
        source?.getAttribute("type") ||
        audioMimeTypeFromPath(relativePath),
      ...(asset
        ? { blob: asset.blob }
        : { sourceUrl: currentSource || undefined }),
    });
  }

  return {
    markdown: turndown.turndown(documentValue.body.innerHTML),
    assets: exportedAssets,
  };
}

export function siteContentAssetPathFromUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^(?:blob:|data:)/i.test(trimmed)) return null;
  const previewPath = trimmed.match(
    /^(?:https?:\/\/[^/]+)?\/?preview\/[^/]+\/(files\/[^?#]+)(?:[?#].*)?$/i,
  );
  if (previewPath) return normalizeRelativeAssetPath(previewPath[1]);

  const filesIndex = trimmed.toLowerCase().indexOf("files/");
  if (filesIndex < 0) return null;
  return normalizeRelativeAssetPath(trimmed.slice(filesIndex).split(/[?#]/, 1)[0]);
}

function normalizeRelativeAssetPath(value: string): string | null {
  const normalized = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return normalized.startsWith("files/") ? normalized : null;
}

function canonicalAudioContentType(contentType: string): string {
  const normalized = contentType.trim().toLowerCase().split(";", 1)[0];
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") {
    return "audio/mpeg";
  }
  if (
    normalized === "audio/mp4" ||
    normalized === "audio/m4a" ||
    normalized === "audio/x-m4a"
  ) {
    return "audio/mp4";
  }
  if (
    normalized === "audio/wav" ||
    normalized === "audio/wave" ||
    normalized === "audio/vnd.wave" ||
    normalized === "audio/x-wav"
  ) {
    return "audio/wav";
  }
  return "";
}

function extensionFromFilename(filename: string): string {
  return filename.split(".").pop()?.trim().toLowerCase() || "";
}

function audioMimeTypeFromPath(path: string): string {
  const extension = extensionFromFilename(path);
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "wav") return "audio/wav";
  return "application/octet-stream";
}

function imageMimeTypeFromPath(path: string): string {
  const extension = extensionFromFilename(path);
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}
