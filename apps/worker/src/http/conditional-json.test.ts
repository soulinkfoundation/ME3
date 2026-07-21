import { describe, expect, it } from "vitest";
import type { AppContext } from "./types";
import { contentETag, ifNoneMatchContains, privateConditionalJson } from "./conditional-json";

describe("private conditional JSON", () => {
  it("creates stable strong validators without exposing response content", async () => {
    const first = await contentETag(JSON.stringify({ private: "owner data" }));
    const same = await contentETag(JSON.stringify({ private: "owner data" }));
    const changed = await contentETag(JSON.stringify({ private: "changed" }));

    expect(first).toBe(same);
    expect(first).not.toBe(changed);
    expect(first).not.toContain("owner data");
    expect(first).toMatch(/^"sha256-[A-Za-z0-9_-]+"$/);
  });

  it("accepts strong, weak, wildcard, and list validators", () => {
    const eTag = '"sha256-abc"';
    expect(ifNoneMatchContains(eTag, eTag)).toBe(true);
    expect(ifNoneMatchContains(`W/${eTag}`, eTag)).toBe(true);
    expect(ifNoneMatchContains(`"other", ${eTag}`, eTag)).toBe(true);
    expect(ifNoneMatchContains("*", eTag)).toBe(true);
    expect(ifNoneMatchContains('"other"', eTag)).toBe(false);
  });

  it("returns private JSON once and an empty 304 for the matching validator", async () => {
    const value = { folders: [{ id: "private-folder" }] };
    const firstContext = {
      req: { header: () => undefined },
    } as unknown as AppContext;
    const first = await privateConditionalJson(firstContext, value);
    const eTag = first.headers.get("etag");

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(value);
    expect(eTag).toMatch(/^"sha256-[A-Za-z0-9_-]+"$/);
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    expect(first.headers.get("vary")).toBe("Authorization");

    const matchingContext = {
      req: {
        header: (name: string) => (name === "If-None-Match" ? eTag || undefined : undefined),
      },
    } as unknown as AppContext;
    const notModified = await privateConditionalJson(matchingContext, value);

    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
    expect(notModified.headers.get("etag")).toBe(eTag);
  });
});
