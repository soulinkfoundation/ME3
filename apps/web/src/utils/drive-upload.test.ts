import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadDriveFiles } from "./drive-upload";

const apiUpload = vi.hoisted(() => vi.fn());

vi.mock("../api", () => ({
  API_BASE: "/api",
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  },
  api: { upload: apiUpload },
}));

describe("uploadDriveFiles", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads images through Files and preserves the selected folder", async () => {
    const uploaded = {
      id: "file-image",
      folderId: "folder-1",
      filename: "image.jpg",
      mimeType: "image/jpeg",
      size: 5,
      status: "ready",
    };
    apiUpload.mockResolvedValue({ ok: true, files: [uploaded] });
    const progress: number[] = [];
    const file = new File(["image"], "image.jpg", { type: "image/jpeg" });

    await expect(uploadDriveFiles([file], {
      folderId: "folder-1",
      onProgress: (value) => progress.push(value.percent),
    })).resolves.toEqual([uploaded]);

    const [endpoint, form] = apiUpload.mock.calls[0]!;
    expect(endpoint).toBe("/files/upload");
    expect((form as FormData).get("folderId")).toBe("folder-1");
    expect((form as FormData).get("files")).toBe(file);
    expect(progress).toEqual([0, 100]);
  });

  it("uses resumable multipart upload for video files and reports progress", async () => {
    const uploaded = {
      id: "file-video",
      folderId: "folder-1",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      size: 4,
      status: "ready",
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/files/multipart" && init?.method === "POST") {
        return Response.json({
          ok: true,
          upload: {
            id: "upload-1",
            filename: "clip.mp4",
            mimeType: "video/mp4",
            partSize: 2,
            totalSize: 4,
            status: "uploading",
            expiresAt: "2099-01-01T00:00:00.000Z",
            uploadedParts: [],
          },
        });
      }
      if (url.includes("/parts/") && init?.method === "PUT") {
        return Response.json({ ok: true });
      }
      if (url === "/api/files/multipart/upload-1/complete" && init?.method === "POST") {
        return Response.json({ ok: true, file: uploaded });
      }
      throw new Error(`Unexpected upload request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const progress: number[] = [];
    const file = new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", {
      type: "video/mp4",
      lastModified: 123,
    });

    await expect(uploadDriveFiles([file], {
      folderId: "folder-1",
      onProgress: (value) => progress.push(value.percent),
    })).resolves.toEqual([uploaded]);

    expect(progress).toEqual([0, 50, 100]);
    expect(fetcher.mock.calls.map(([request, init]) => [
      String(request),
      init?.method || "GET",
    ])).toEqual([
      ["/api/files/multipart", "POST"],
      ["/api/files/multipart/upload-1/parts/1", "PUT"],
      ["/api/files/multipart/upload-1/parts/2", "PUT"],
      ["/api/files/multipart/upload-1/complete", "POST"],
    ]);
    expect(window.localStorage.length).toBe(0);
    expect(apiUpload).not.toHaveBeenCalled();
  });
});
