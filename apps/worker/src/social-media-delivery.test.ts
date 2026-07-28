import { describe, expect, it, vi } from "vitest";
import { getSocialMediaDeliveryResponse, SocialMediaDeliveryError } from "./social-media-delivery";
import type { Env } from "./types";

const grantRow = {
  id: "grant-1",
  storage_key: "drive/owner-1/file-1-short.mp4",
  filename: "short.mp4",
  mime_type: "video/mp4",
  size: 42,
  provider: "tiktok",
};

function createEnv(
  row: typeof grantRow | null = grantRow,
  images?: Env["IMAGES"],
) {
  const update = vi.fn(async () => ({ meta: { changes: 1 } }));
  const get = vi.fn(async () => ({
    body: new Uint8Array(10),
    size: 10,
    httpEtag: '"etag-1"',
  }));
  const head = vi.fn(async () => ({ size: 42, httpEtag: '"etag-1"' }));
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            first: async () => (sql.includes("SELECT grant.id") ? row : null),
            run: update,
          };
        },
      };
    },
  };
  return {
    env: { DB: db, IMAGES: images, SITE_ASSETS: { get, head } } as unknown as Env,
    get,
    head,
    update,
  };
}

describe("social media delivery grants", () => {
  it("serves provider byte ranges and records access", async () => {
    const { env, get, update } = createEnv();
    const response = await getSocialMediaDeliveryResponse(
      env,
      "socmedia_abcdefghijklmnopqrstuvwxyz",
      { rangeHeader: "bytes=10-19" },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Range")).toBe("bytes 10-19/42");
    expect(get).toHaveBeenCalledWith(grantRow.storage_key, {
      range: { offset: 10, length: 10 },
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("supports provider HEAD checks without reading object bytes", async () => {
    const { env, get, head } = createEnv();
    const response = await getSocialMediaDeliveryResponse(
      env,
      "socmedia_abcdefghijklmnopqrstuvwxyz",
      { head: true },
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("Content-Length")).toBe("42");
    expect(head).toHaveBeenCalledWith(grantRow.storage_key);
    expect(get).not.toHaveBeenCalled();
  });

  it.each(["image/png", "image/webp"])(
    "transcodes Instagram %s delivery to a white-backed JPEG",
    async (mimeType) => {
      const transformed = new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "Content-Length": "3",
          "Content-Type": "image/jpeg",
          ETag: '"jpeg-etag"',
        },
      });
      const response = vi.fn(() => transformed);
      const output = vi.fn(async () => ({ response }));
      const pipeline = {
        transform: vi.fn(),
        output,
      };
      pipeline.transform.mockReturnValue(pipeline);
      const images = {
        input: vi.fn(() => pipeline),
      } as unknown as NonNullable<Env["IMAGES"]>;
      const row = {
        ...grantRow,
        storage_key: "drive/owner-1/instagram-image",
        filename: mimeType === "image/png" ? "post.png" : "post.webp",
        mime_type: mimeType,
        size: 10,
        provider: "instagram",
      };
      const { env, get, update } = createEnv(row, images);

      const delivered = await getSocialMediaDeliveryResponse(
        env,
        "socmedia_abcdefghijklmnopqrstuvwxyz",
        { rangeHeader: "bytes=0-4" },
      );

      expect(delivered.status).toBe(200);
      expect(delivered.headers.get("Content-Type")).toBe("image/jpeg");
      expect(delivered.headers.get("Content-Length")).toBe("3");
      expect(delivered.headers.get("Content-Disposition")).toContain('filename="post.jpg"');
      expect(delivered.headers.has("Accept-Ranges")).toBe(false);
      expect((await delivered.arrayBuffer()).byteLength).toBe(3);
      expect(get).toHaveBeenCalledWith(row.storage_key, undefined);
      expect(images.input).toHaveBeenCalledTimes(1);
      expect(pipeline.transform).toHaveBeenCalledWith({
        width: 1_440,
        fit: "scale-down",
        background: "#FFFFFF",
      });
      expect(output).toHaveBeenCalledWith({
        format: "image/jpeg",
        quality: 90,
      });
      expect(response).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(1);
    },
  );

  it("reports when Instagram conversion is not configured", async () => {
    const { env } = createEnv({
      ...grantRow,
      filename: "post.png",
      mime_type: "image/png",
      provider: "instagram",
    });

    await expect(getSocialMediaDeliveryResponse(
      env,
      "socmedia_abcdefghijklmnopqrstuvwxyz",
    )).rejects.toEqual(expect.objectContaining<Partial<SocialMediaDeliveryError>>({
      status: 503,
      message: "Instagram image conversion is unavailable.",
    }));
  });

  it("does not reveal whether an expired or unknown grant ever existed", async () => {
    const { env } = createEnv(null);
    await expect(getSocialMediaDeliveryResponse(
      env,
      "socmedia_abcdefghijklmnopqrstuvwxyz",
    )).rejects.toEqual(expect.objectContaining<Partial<SocialMediaDeliveryError>>({ status: 404 }));
  });
});
