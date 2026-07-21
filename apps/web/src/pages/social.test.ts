import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useSitesStore } from "../stores/sites";
import SocialPage from "./social.vue";

vi.mock("../api", () => ({
  API_BASE: "/api",
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

const account = {
  id: "account-linkedin", siteId: "site-1", platform: "linkedin", handle: "@kieran",
  displayName: "Kieran", status: "active", lastVerifiedAt: "2026-07-18T08:00:00Z",
};

const mediaFiles = [
  {
    id: "file-image-1", folderId: null, filename: "first.jpg", mimeType: "image/jpeg",
    size: 101, sha256: "1".repeat(64), status: "ready", previewKind: "image",
  },
  {
    id: "file-image-2", folderId: null, filename: "second.png", mimeType: "image/png",
    size: 202, sha256: "2".repeat(64), status: "ready", previewKind: "image",
  },
  {
    id: "file-video-1", folderId: null, filename: "short.mp4", mimeType: "video/mp4",
    size: 303, sha256: "3".repeat(64), status: "ready", previewKind: "download",
  },
];

const post = {
  post: {
    id: "post-1", siteId: "site-1", sourceType: "mission_task", sourceRef: "task-1",
    sourceTitle: "A source-backed task", sourceSnapshot: "{}", sourceText: "Source text",
    ideaText: "A social post", tags: [], goal: null, status: "ready", createdBy: "agent",
    createdAt: "2026-07-18T07:00:00Z", updatedAt: "2026-07-18T07:00:00Z",
  },
  versions: [{
    id: "version-1", postId: "post-1", platform: "linkedin", targetAccountId: "account-linkedin",
    format: "post", bodyText: "Post copy https://example.com/story", assetManifest: [
      { url: "https://example.com/one.jpg", kind: "image" },
      { url: "https://example.com/two.jpg", kind: "image" },
    ], sourceExcerpt: "Source text",
    approvalStatus: "draft", approvedAt: null, approvedByUserId: null, scheduledFor: null,
    timezone: null, publicationStatus: null, platformPostUrl: null, publishedAt: null,
    failureClass: null, errorMessage: null, createdAt: "2026-07-18T07:00:00Z",
    updatedAt: "2026-07-18T07:00:00Z",
  }],
};

enableAutoUnmount(afterEach);

function mountPage() {
  return mount(SocialPage, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
        SocialAccountsPanel: { template: "<div>Account settings</div>" },
        AppDialog: { props: ["open"], template: '<div v-if="open"><slot /></div>' },
      },
    },
  });
}

describe("SocialPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    useSitesStore().sites = [{
      id: "site-1", username: "kieran", user_id: "owner", custom_domain: null,
      custom_domain_status: null, created_at: "2026-07-01T08:00:00Z",
      updated_at: "2026-07-18T08:00:00Z", published_at: "2026-07-01T08:00:00Z",
    }];
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/social/posts?siteId=site-1") return Promise.resolve({ posts: [post] });
      if (endpoint === "/social/accounts") return Promise.resolve({ accounts: [account] });
      if (endpoint === "/files/folders") return Promise.resolve({ folders: [] });
      if (endpoint === "/files/items") return Promise.resolve({ files: mediaFiles });
      if (endpoint === "/social/status") return Promise.resolve({
        plugin: { status: "installed", enabled: true, ready: true, statusLabel: "Installed", platformCapabilities: [
          { platform: "linkedin", draft: true, schedule: true, publish: true, reason: null },
        ] },
        hostedOAuth: { configured: false, platforms: [] },
      });
      throw new Error(`Unexpected GET ${endpoint}`);
    });
  });

  it("keeps the workspace focused on posts, accounts, and header search", async () => {
    const wrapper = mountPage();
    await flushPromises();

    wrapper.get(".social-toolbar__search");
    expect(wrapper.get(".workspace-tabs").text()).toContain("Drafts");
    wrapper.get("[aria-label='Manage social accounts']");
    wrapper.get("[aria-label='New Post']");
    expect(wrapper.findAll(".post-source-group")).toHaveLength(0);
    expect(wrapper.findAll(".post-tags")).toHaveLength(0);
    expect(wrapper.findAll(".publication-panel")).toHaveLength(0);
    expect(wrapper.findAll(".publication-history")).toHaveLength(0);
    expect(wrapper.text()).not.toContain("Suggestions");
    expect(wrapper.text()).not.toContain("Posting plan");
  });

  it("automatically targets a connected account and uses a platform preview", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.findAll(".version-editor select")).toHaveLength(0);
    expect(wrapper.get(".post-preview--linkedin").text()).toContain("Kieran");
    expect(wrapper.findAll(".preview-media--gallery img")).toHaveLength(2);
    expect(wrapper.get(".preview-link-card").text()).toContain("example.com");
    vi.mocked(api.post).mockResolvedValue({
      post: {
        ...post,
        post: {
          ...post.post,
          id: "post-2",
          ideaText: "Untitled draft",
          updatedAt: "2026-07-18T08:30:00Z",
        },
        versions: [{
          ...post.versions[0],
          id: "version-2",
          postId: "post-2",
          bodyText: "Untitled draft",
        }],
      },
    });
    await wrapper.get("[aria-label='New Post']").trigger("click");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/social/posts", expect.objectContaining({
      ideaText: "Untitled draft",
      versions: [expect.objectContaining({ platform: "linkedin", targetAccountId: "account-linkedin" })],
    }));
    expect((wrapper.get("#social-post-title").element as HTMLInputElement).value)
      .toBe("Untitled draft");
    expect(wrapper.findAll(".platform-target")).toHaveLength(0);
  });

  it("preserves image selection order and stores stable Files metadata", async () => {
    vi.mocked(api.patch).mockImplementation(async (_endpoint, input) => ({
      version: {
        ...post.versions[0],
        assetManifest: (input as { assetManifest: typeof post.versions[0]["assetManifest"] }).assetManifest,
      },
    }));
    const wrapper = mountPage();
    await flushPromises();

    const addMedia = wrapper.findAll("button").find((button) => button.text().includes("Add media"));
    expect(addMedia).toBeTruthy();
    await addMedia!.trigger("click");
    await flushPromises();

    const choices = wrapper.findAll(".social-media-picker__grid button");
    expect(choices).toHaveLength(3);
    await choices[1]!.trigger("click");
    await choices[0]!.trigger("click");

    expect(choices[1]!.attributes("aria-label")).toContain("selected 1");
    expect(choices[0]!.attributes("aria-label")).toContain("selected 2");
    const attach = wrapper.findAll("button").find((button) => button.text().includes("Add 2 images"));
    expect(attach).toBeTruthy();
    await attach!.trigger("click");
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith("/social/versions/version-1", {
      assetManifest: [
        { ...post.versions[0].assetManifest[0], assetIndex: 0 },
        { ...post.versions[0].assetManifest[1], assetIndex: 1 },
        {
          url: "/api/files/file-image-2/content",
          fileId: "file-image-2",
          filename: "second.png",
          mimeType: "image/png",
          kind: "image",
          altText: "second",
          contentHash: `sha256:${"2".repeat(64)}`,
          byteLength: 202,
          assetIndex: 2,
        },
        {
          url: "/api/files/file-image-1/content",
          fileId: "file-image-1",
          filename: "first.jpg",
          mimeType: "image/jpeg",
          kind: "image",
          altText: "first",
          contentHash: `sha256:${"1".repeat(64)}`,
          byteLength: 101,
          assetIndex: 3,
        },
      ],
    });
  });

  it("keeps video selection exclusive in the Files picker", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const addMedia = wrapper.findAll("button").find((button) => button.text().includes("Add media"));
    await addMedia!.trigger("click");
    await flushPromises();
    const choices = wrapper.findAll(".social-media-picker__grid button");
    await choices[0]!.trigger("click");
    await choices[2]!.trigger("click");

    expect(choices[0]!.attributes("aria-selected")).toBe("false");
    expect(choices[2]!.attributes("aria-selected")).toBe("true");
    expect(wrapper.text()).toContain("Add 1 video");
    expect(wrapper.findAll(".social-media-picker__grid video")).toHaveLength(1);
  });
});
