import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { prepareSiteUploadFiles } from "./siteUpload";

describe("prepareSiteUploadFiles", () => {
  it("preserves nested paths from me3 zip exports", async () => {
    const zip = new JSZip();
    zip.file("me.json", '{"name":"Example User"}');
    zip.file("blog/welcome-to-me3.md", "# Welcome");
    zip.file("files/avatar.jpg", "avatar");
    zip.file("files/content/grounding.mp3", "audio");

    const content = await zip.generateAsync({ type: "arraybuffer" });
    const zipFile = new File([content], "example.zip", {
      type: "application/zip",
    });

    const prepared = await prepareSiteUploadFiles([zipFile]);

    expect(prepared.files.map((file) => file.name).sort()).toEqual([
      "blog/welcome-to-me3.md",
      "files/avatar.jpg",
      "files/content/grounding.mp3",
      "me.json",
    ]);
    expect(
      prepared.files.find((file) => file.name.endsWith("grounding.mp3"))?.type,
    ).toBe("audio/mpeg");
  });

  it.each([
    ["message.m4a", "audio/mp4"],
    ["practice.wav", "audio/wav"],
  ])("accepts portable %s audio", async (filename, mimeType) => {
    const file = new File(["audio"], filename, { type: mimeType });

    const prepared = await prepareSiteUploadFiles([file]);

    expect(prepared.ignored).toEqual([]);
    expect(prepared.files).toEqual([
      expect.objectContaining({ name: filename, type: mimeType }),
    ]);
  });

  it("strips a shared root folder from selected directories", async () => {
    const meJson = new File(['{"name":"Example User"}'], "me.json", {
      type: "application/json",
    });
    Object.defineProperty(meJson, "webkitRelativePath", {
      value: "example/me.json",
    });

    const post = new File(["# Welcome"], "welcome-to-me3.md", {
      type: "text/markdown",
    });
    Object.defineProperty(post, "webkitRelativePath", {
      value: "example/blog/welcome-to-me3.md",
    });

    const prepared = await prepareSiteUploadFiles([meJson, post]);

    expect(prepared.files.map((file) => file.name).sort()).toEqual([
      "blog/welcome-to-me3.md",
      "me.json",
    ]);
  });

  it("ignores unsupported files and macOS metadata", async () => {
    const zip = new JSZip();
    zip.file("me.json", '{"name":"Example User"}');
    zip.file("README.md", "# Export notes");
    zip.file("__MACOSX/._me.json", "ignored");
    zip.file("notes.txt", "ignored");

    const content = await zip.generateAsync({ type: "arraybuffer" });
    const zipFile = new File([content], "example.zip", {
      type: "application/zip",
    });

    const prepared = await prepareSiteUploadFiles([zipFile]);

    expect(prepared.files.map((file) => file.name)).toEqual(["me.json"]);
    expect(prepared.ignored.sort()).toEqual([
      "README.md",
      "__MACOSX/._me.json",
      "notes.txt",
    ]);
  });
});
