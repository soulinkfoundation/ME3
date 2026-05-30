import JSZip from "jszip";

const allowedExtensions = new Set([
  ".json",
  ".md",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".webp",
]);

const mimeTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export interface PreparedSiteUpload {
  files: SiteUploadFile[];
  ignored: string[];
}

interface UploadCandidate {
  blob: Blob;
  lastModified: number;
  path: string;
  type: string;
}

export interface SiteUploadFile {
  blob: Blob;
  lastModified: number;
  name: string;
  type: string;
}

function getExtension(path: string): string {
  const filename = path.split("/").pop() || path;
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
}

function getMimeType(path: string): string {
  return mimeTypes[getExtension(path)] || "application/octet-stream";
}

function sanitizeUploadPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
}

function shouldIgnorePath(path: string): boolean {
  if (!path) return true;
  if (path.endsWith("/")) return true;
  if (path.startsWith("__MACOSX/")) return true;

  const filename = path.split("/").pop()?.toLowerCase();
  return filename === ".ds_store" || filename === "readme.md";
}

function stripSharedRootDirectory(paths: string[]): string[] {
  if (paths.length === 0 || paths.some((path) => path === "me.json")) {
    return paths;
  }

  const splitPaths = paths.map((path) => path.split("/"));
  if (splitPaths.some((segments) => segments.length < 2)) {
    return paths;
  }

  const sharedRoot = splitPaths[0][0];
  if (!sharedRoot || !splitPaths.every((segments) => segments[0] === sharedRoot)) {
    return paths;
  }

  const stripped = splitPaths.map((segments) => segments.slice(1).join("/"));
  return stripped.some((path) => path === "me.json") ? stripped : paths;
}

async function createUploadCandidate(
  path: string,
  blob: Blob,
  type: string,
  lastModified: number,
): Promise<UploadCandidate | null> {
  if (shouldIgnorePath(path)) return null;
  if (!allowedExtensions.has(getExtension(path))) return null;

  return {
    blob,
    lastModified,
    path,
    type: type || getMimeType(path),
  };
}

async function expandZipFile(
  file: File,
): Promise<{ candidates: UploadCandidate[]; ignored: string[] }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const candidates: UploadCandidate[] = [];
  const ignored: string[] = [];

  for (const entry of Object.values(zip.files)) {
    const path = sanitizeUploadPath(entry.name);

    if (entry.dir) {
      continue;
    }

    if (shouldIgnorePath(path)) {
      if (path) ignored.push(path);
      continue;
    }

    if (!allowedExtensions.has(getExtension(path))) {
      ignored.push(path);
      continue;
    }

    const candidate = await createUploadCandidate(
      path,
      new Blob([await entry.async("arraybuffer")], { type: getMimeType(path) }),
      getMimeType(path),
      file.lastModified,
    );

    if (candidate) {
      candidates.push(candidate);
    } else {
      ignored.push(path);
    }
  }

  return { candidates, ignored };
}

function finalizeCandidates(
  candidates: UploadCandidate[],
  ignored: string[],
): PreparedSiteUpload {
  const normalizedPaths = stripSharedRootDirectory(
    candidates.map((candidate) => candidate.path),
  );

  const files = candidates.map((candidate, index) => {
    const path = normalizedPaths[index];
    return {
      blob: candidate.blob,
      lastModified: candidate.lastModified,
      name: path,
      type: candidate.type || getMimeType(path),
    };
  });

  return { files, ignored };
}

export async function prepareSiteUploadFiles(
  rawFiles: File[],
): Promise<PreparedSiteUpload> {
  const candidates: UploadCandidate[] = [];
  const ignored: string[] = [];

  for (const rawFile of rawFiles) {
    const path = sanitizeUploadPath(rawFile.webkitRelativePath || rawFile.name);
    const extension = getExtension(path);

    if (extension === ".zip") {
      const expanded = await expandZipFile(rawFile);
      candidates.push(...expanded.candidates);
      ignored.push(...expanded.ignored);
      continue;
    }

    const candidate = await createUploadCandidate(
      path,
      rawFile,
      rawFile.type,
      rawFile.lastModified,
    );

    if (candidate) {
      candidates.push(candidate);
    } else if (path) {
      ignored.push(path);
    }
  }

  return finalizeCandidates(candidates, ignored);
}
