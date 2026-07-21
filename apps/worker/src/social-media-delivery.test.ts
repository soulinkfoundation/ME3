import { describe, expect, it, vi } from "vitest";
import { getSocialMediaDeliveryResponse, SocialMediaDeliveryError } from "./social-media-delivery";
import type { Env } from "./types";

const grantRow = {
  id: "grant-1",
  storage_key: "drive/owner-1/file-1-short.mp4",
  filename: "short.mp4",
  mime_type: "video/mp4",
  size: 42,
};

function createEnv(row: typeof grantRow | null = grantRow) {
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
    env: { DB: db, SITE_ASSETS: { get, head } } as unknown as Env,
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

  it("does not reveal whether an expired or unknown grant ever existed", async () => {
    const { env } = createEnv(null);
    await expect(getSocialMediaDeliveryResponse(
      env,
      "socmedia_abcdefghijklmnopqrstuvwxyz",
    )).rejects.toEqual(expect.objectContaining<Partial<SocialMediaDeliveryError>>({ status: 404 }));
  });
});
