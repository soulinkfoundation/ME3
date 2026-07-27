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

const toastHarness = vi.hoisted(() => ({
  error: vi.fn(),
  notice: vi.fn(),
  success: vi.fn(),
}));

vi.mock("../composables/useAppToast", () => ({
  useAppToast: () => ({
    toast: toastHarness.notice,
    toastError: toastHarness.error,
    toastSuccess: toastHarness.success,
  }),
}));

const account = {
  id: "account-linkedin", siteId: "site-1", platform: "linkedin", handle: "@kieran",
  displayName: "Kieran", avatarUrl: "https://cdn.test/kieran.jpg", avatarSource: "provider",
  status: "active", lastVerifiedAt: "2026-07-18T08:00:00Z",
};

function platformCapability(
  platform: "linkedin" | "instagram" | "tiktok",
  options: { schedule: boolean; deliveryMode: "direct_publish" | "provider_draft" },
) {
  const isTikTok = platform === "tiktok";
  const isInstagram = platform === "instagram";
  return {
    platform,
    draft: true,
    schedule: options.schedule,
    publish: true,
    deliveryMode: options.deliveryMode,
    deliveryLabel: isTikTok ? "Sends a creator draft" : "Publishes directly",
    contentRules: isTikTok
      ? [{
          contentType: "short_video",
          label: "Short video",
          requiresText: false,
          maxTextCharacters: null,
          minMediaItems: 1,
          maxMediaItems: 1,
          allowedMediaKinds: ["video"],
          allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
          maxBytesPerItem: 4 * 1024 * 1024 * 1024,
          guidance: "Finish in TikTok.",
        }]
      : isInstagram ? [{
          contentType: "short_video",
          label: "Short video",
          requiresText: true,
          maxTextCharacters: 2_200,
          minMediaItems: 1,
          maxMediaItems: 1,
          allowedMediaKinds: ["video"],
          allowedMimeTypes: ["video/mp4", "video/quicktime"],
          maxBytesPerItem: 1024 * 1024 * 1024,
          guidance: "Publishes as a Reel.",
        }] : [{
          contentType: "text",
          label: "Text post",
          requiresText: true,
          maxTextCharacters: 3_000,
          minMediaItems: 0,
          maxMediaItems: 0,
          allowedMediaKinds: [],
          allowedMimeTypes: [],
          maxBytesPerItem: null,
          guidance: null,
        }],
    reason: null,
  };
}

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
          platformCapability("linkedin", { schedule: true, deliveryMode: "direct_publish" }),
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

  it("uses Schedule as the primary action and keeps Post now out of the dialog", async () => {
    const textOnlyPost = {
      ...post,
      versions: [{
        ...post.versions[0],
        assetManifest: [],
      }],
    };
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/social/posts?siteId=site-1") {
        return Promise.resolve({ posts: [textOnlyPost] });
      }
      if (endpoint === "/social/accounts") return Promise.resolve({ accounts: [account] });
      if (endpoint === "/social/status") return Promise.resolve({
        plugin: {
          status: "installed",
          enabled: true,
          ready: true,
          statusLabel: "Installed",
          platformCapabilities: [
            platformCapability("linkedin", {
              schedule: true,
              deliveryMode: "direct_publish",
            }),
          ],
        },
        hostedOAuth: { configured: false, platforms: [] },
      });
      throw new Error(`Unexpected GET ${endpoint}`);
    });

    const wrapper = mountPage();
    await flushPromises();

    const actions = wrapper.get(".editor-actions");
    expect(actions.findAll("button").map((button) => button.text().trim())).toEqual([
      "Save Draft",
      "Post now",
      "Schedule",
      "Delete draft",
    ]);
    const schedule = actions.findAll("button")
      .find((button) => button.text().trim() === "Schedule");
    expect(schedule?.attributes("disabled")).toBeUndefined();
    await schedule!.trigger("click");
    await flushPromises();

    expect(wrapper.get(".social-schedule-dialog h2").text()).toBe("Schedule post");
    expect(wrapper.find(".social-schedule-dialog input[type='radio']").exists()).toBe(false);
    expect(wrapper.get(".social-schedule-dialog").text()).not.toContain("Post now");
  });

  it("keeps one labelled delete action beside publishing actions and deletes the selected draft", async () => {
    vi.mocked(api.delete).mockResolvedValue({ ok: true });
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const wrapper = mountPage();
    await flushPromises();

    const deleteActions = wrapper.findAll("button")
      .filter((button) => button.text().trim() === "Delete draft");
    expect(deleteActions).toHaveLength(1);
    expect(deleteActions[0]!.element.closest(".editor-actions")).not.toBeNull();
    expect(wrapper.find(".detail-header button").exists()).toBe(false);
    expect(wrapper.find(".post-row > button:not(.post-row__select)").exists()).toBe(false);

    await deleteActions[0]!.trigger("click");
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith("Delete “A social post”? This cannot be undone.");
    expect(api.delete).toHaveBeenCalledWith(
      "/social/posts/post-1?expectedUpdatedAt=2026-07-18T07%3A00%3A00Z",
    );
    expect(wrapper.find(".post-detail").exists()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("shows and orders scheduled posts by their scheduled date and time", async () => {
    const earlyScheduledAt = "2026-07-29T08:15:00.000Z";
    const lateScheduledAt = "2026-07-30T16:45:00.000Z";
    const scheduledPosts = [
      {
        ...post,
        post: {
          ...post.post,
          id: "post-later",
          ideaText: "Later scheduled post",
          updatedAt: "2026-07-26T09:00:00.000Z",
        },
        versions: [{
          ...post.versions[0],
          id: "version-later",
          postId: "post-later",
          scheduledFor: lateScheduledAt,
          publicationStatus: "scheduled" as const,
        }],
      },
      {
        ...post,
        post: {
          ...post.post,
          id: "post-earlier",
          ideaText: "Earlier scheduled post",
          updatedAt: "2026-07-25T09:00:00.000Z",
        },
        versions: [{
          ...post.versions[0],
          id: "version-earlier",
          postId: "post-earlier",
          scheduledFor: earlyScheduledAt,
          publicationStatus: "scheduled" as const,
        }],
      },
    ];
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/social/posts?siteId=site-1") {
        return Promise.resolve({ posts: scheduledPosts });
      }
      if (endpoint === "/social/accounts") return Promise.resolve({ accounts: [account] });
      if (endpoint === "/social/status") return Promise.resolve({
        plugin: {
          status: "installed",
          enabled: true,
          ready: true,
          statusLabel: "Installed",
          platformCapabilities: [
            platformCapability("linkedin", {
              schedule: true,
              deliveryMode: "direct_publish",
            }),
          ],
        },
        hostedOAuth: { configured: false, platforms: [] },
      });
      throw new Error(`Unexpected GET ${endpoint}`);
    });

    const wrapper = mountPage();
    await flushPromises();
    const scheduledTab = wrapper.findAll(".workspace-tabs button")
      .find((button) => button.text().includes("Scheduled"));
    expect(scheduledTab).toBeTruthy();
    await scheduledTab!.trigger("click");
    await flushPromises();

    const rows = wrapper.findAll(".post-row");
    expect(rows.map((row) => row.get("strong").text())).toEqual([
      "Earlier scheduled post",
      "Later scheduled post",
    ]);
    expect(rows[0]!.get(".post-row__schedule").text()).toContain("Scheduled for");
    expect(rows[0]!.get(".post-row__schedule time").attributes("datetime"))
      .toBe(earlyScheduledAt);
    expect(rows[1]!.get(".post-row__schedule time").attributes("datetime"))
      .toBe(lateScheduledAt);
  });

  it("requires an explicit destination choice and uses a platform preview", async () => {
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

    expect(api.post).not.toHaveBeenCalled();
    await wrapper.get(".content-type-picker input[value='text']").setValue();
    await wrapper.get(".destination-option").trigger("click");
    const createDraft = wrapper.findAll("button").find((button) => button.text().includes("Create draft"));
    expect(createDraft).toBeTruthy();
    await createDraft!.trigger("click");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/social/posts", expect.objectContaining({
      ideaText: "Untitled draft",
      versions: [expect.objectContaining({
        platform: "linkedin",
        targetAccountId: "account-linkedin",
        format: "post",
      })],
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

    await wrapper.get("#social-post-title").setValue("Unsaved title");
    await wrapper.get(".version-editor textarea").setValue("Unsaved body");
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
    expect((wrapper.get("#social-post-title").element as HTMLInputElement).value)
      .toBe("Unsaved title");
    expect((wrapper.get(".version-editor textarea").element as HTMLTextAreaElement).value)
      .toBe("Unsaved body");
  });

  it("saves title and body together without the title refresh dropping copy", async () => {
    vi.mocked(api.patch).mockImplementation(async (endpoint, input) => {
      if (endpoint === "/social/posts/post-1") {
        return {
          post: {
            ...post,
            post: {
              ...post.post,
              ideaText: (input as { title: string }).title,
              updatedAt: "2026-07-25T16:00:00.000Z",
            },
          },
        };
      }
      if (endpoint === "/social/versions/version-1") {
        return {
          version: {
            ...post.versions[0],
            bodyText: (input as { bodyText: string }).bodyText,
          },
        };
      }
      throw new Error(`Unexpected PATCH ${endpoint}`);
    });
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.get("#social-post-title").setValue("Saved title");
    await wrapper.get(".version-editor textarea").setValue("Saved body");
    const save = wrapper.findAll(".editor-actions button")
      .find((button) => button.text().includes("Save Draft"));
    await save!.trigger("click");
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith("/social/posts/post-1", {
      title: "Saved title",
      expectedUpdatedAt: post.post.updatedAt,
    });
    expect(api.patch).toHaveBeenCalledWith("/social/versions/version-1", {
      bodyText: "Saved body",
      targetAccountId: account.id,
    });
    expect((wrapper.get("#social-post-title").element as HTMLInputElement).value)
      .toBe("Saved title");
    expect((wrapper.get(".version-editor textarea").element as HTMLTextAreaElement).value)
      .toBe("Saved body");
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

  it("bulk-edits shared copy while preserving truthful platform delivery modes", async () => {
    const instagramAccount = {
      ...account,
      id: "account-instagram",
      platform: "instagram",
      handle: "kieran",
      displayName: "Kieran on Instagram",
    };
    const tiktokAccount = {
      ...account,
      id: "account-tiktok",
      platform: "tiktok",
      handle: "kieranofearth",
      displayName: "kieranofearth",
    };
    const sharedVideo = {
      url: "https://example.com/short.mp4",
      kind: "video" as const,
      mimeType: "video/mp4",
      byteLength: 303,
    };
    const multiPlatformPost = {
      ...post,
      versions: [
        {
          ...post.versions[0],
          id: "version-instagram",
          platform: "instagram" as const,
          targetAccountId: instagramAccount.id,
          bodyText: "Shared short caption.",
          assetManifest: [sharedVideo],
        },
        {
          ...post.versions[0],
          id: "version-tiktok",
          platform: "tiktok" as const,
          targetAccountId: tiktokAccount.id,
          bodyText: "Shared short caption.",
          assetManifest: [sharedVideo],
        },
      ],
    };

    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/social/posts?siteId=site-1") {
        return Promise.resolve({ posts: [multiPlatformPost] });
      }
      if (endpoint === "/social/accounts") {
        return Promise.resolve({ accounts: [instagramAccount, tiktokAccount] });
      }
      if (endpoint === "/social/status") {
        return Promise.resolve({
          plugin: {
            status: "installed",
            enabled: true,
            ready: true,
            statusLabel: "Installed",
            platformCapabilities: [
              platformCapability("instagram", {
                schedule: true,
                deliveryMode: "direct_publish",
              }),
              platformCapability("tiktok", {
                schedule: false,
                deliveryMode: "provider_draft",
              }),
            ],
          },
          hostedOAuth: { configured: false, platforms: [] },
        });
      }
      throw new Error(`Unexpected GET ${endpoint}`);
    });
    vi.mocked(api.patch).mockImplementation(async (endpoint, input) => {
      const versionId = endpoint.split("/").at(-1);
      const version = multiPlatformPost.versions.find((item) => item.id === versionId)!;
      return { version: { ...version, ...(input as Record<string, unknown>) } };
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get(".version-tab--shared").classes()).toContain("version-tab--active");
    expect(wrapper.get(".publishing-checks").text()).toContain("Publishes directly");
    expect(wrapper.get(".publishing-checks").text()).toContain("Sends a creator draft");
    expect(wrapper.get(".editor-actions").text()).toContain("Post now");
    expect(wrapper.get(".editor-actions").text()).toContain("Schedule");
    expect(wrapper.get(".editor-actions").text()).not.toContain("Send to TikTok");
    const scheduleButton = wrapper.findAll(".editor-actions button")
      .find((button) => button.text().trim() === "Schedule");
    expect(scheduleButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.findAll(".social-account-avatar__image").length).toBeGreaterThan(0);

    await wrapper.get(".version-editor textarea").setValue("Revised shared caption.");
    const save = wrapper.findAll(".editor-actions button")
      .find((button) => button.text().includes("Save Draft"));
    await save!.trigger("click");
    await flushPromises();

    const versionUpdates = vi.mocked(api.patch).mock.calls.filter(
      ([endpoint]) => endpoint.startsWith("/social/versions/"),
    );
    expect(versionUpdates).toHaveLength(2);
    expect(versionUpdates.map(([, input]) => input)).toEqual([
      expect.objectContaining({ bodyText: "Revised shared caption." }),
      expect.objectContaining({ bodyText: "Revised shared caption." }),
    ]);
  });

  it("renders TikTok video previews with the caption at the bottom of the stage", async () => {
    const tiktokAccount = {
      ...account,
      id: "account-tiktok",
      platform: "tiktok",
      handle: "kieranofearth",
      displayName: "kieranofearth",
    };
    const tiktokPost = {
      ...post,
      versions: [{
        ...post.versions[0],
        id: "version-tiktok",
        platform: "tiktok" as const,
        targetAccountId: "account-tiktok",
        bodyText: "Greetings Earthling 🌍",
        assetManifest: [{ url: "https://example.com/short.mp4", kind: "video" as const, mimeType: "video/mp4" }],
      }],
    };

    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/social/posts?siteId=site-1") return Promise.resolve({ posts: [tiktokPost] });
      if (endpoint === "/social/accounts") return Promise.resolve({ accounts: [tiktokAccount] });
      if (endpoint === "/files/folders") return Promise.resolve({ folders: [] });
      if (endpoint === "/files/items") return Promise.resolve({ files: mediaFiles });
      if (endpoint === "/social/status") return Promise.resolve({
        plugin: { status: "installed", enabled: true, ready: true, statusLabel: "Installed", platformCapabilities: [
          platformCapability("tiktok", { schedule: false, deliveryMode: "provider_draft" }),
        ] },
        hostedOAuth: { configured: false, platforms: [] },
      });
      throw new Error(`Unexpected GET ${endpoint}`);
    });

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get(".post-preview--tiktok .tiktok-preview__stage")).toBeTruthy();
    expect(wrapper.find(".post-preview--tiktok > p").exists()).toBe(false);
    expect(wrapper.get(".tiktok-preview__caption").text()).toContain("Greetings Earthling");
    expect(wrapper.find(".tiktok-preview__rail").exists()).toBe(true);
    expect(wrapper.get(".tiktok-preview__stage video").attributes("controls")).toBeDefined();
  });

  it("shows a TikTok delivery failure instead of a success confirmation", async () => {
    const tiktokAccount = {
      ...account,
      id: "account-tiktok",
      platform: "tiktok",
      handle: "kieranofearth",
      displayName: "kieranofearth",
    };
    const tiktokVersion = {
      ...post.versions[0],
      id: "version-tiktok",
      platform: "tiktok" as const,
      targetAccountId: "account-tiktok",
      bodyText: "Greetings Earthling 🌍",
      assetManifest: [{
        url: "/api/files/file-video-1/content",
        fileId: "file-video-1",
        kind: "video" as const,
        mimeType: "video/mp4",
        byteLength: 303,
      }],
    };
    const tiktokPost = {
      ...post,
      versions: [tiktokVersion],
    };

    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === "/social/posts?siteId=site-1") return Promise.resolve({ posts: [tiktokPost] });
      if (endpoint === "/social/accounts") return Promise.resolve({ accounts: [tiktokAccount] });
      if (endpoint === "/files/folders") return Promise.resolve({ folders: [] });
      if (endpoint === "/files/items") return Promise.resolve({ files: mediaFiles });
      if (endpoint === "/social/status") return Promise.resolve({
        plugin: { status: "installed", enabled: true, ready: true, statusLabel: "Installed", platformCapabilities: [
          platformCapability("tiktok", { schedule: false, deliveryMode: "provider_draft" }),
        ] },
        hostedOAuth: { configured: false, platforms: [] },
      });
      throw new Error(`Unexpected GET ${endpoint}`);
    });
    vi.mocked(api.patch).mockResolvedValue({
      version: { ...tiktokVersion, approvalStatus: "approved" },
    });
    vi.mocked(api.post).mockResolvedValue({
      publication: {
        id: "publication-tiktok-failed",
        versionId: "version-tiktok",
        platform: "tiktok",
        status: "failed",
        scheduledFor: null,
        timezone: null,
        queuedAt: null,
        platformPostId: null,
        platformPostUrl: null,
        publishedAt: null,
        failureClass: "retryable",
        errorCode: "retryable:media_delivery_setup",
        errorMessage: "ME3 needs an exact public API origin before private Files media can be delivered.",
        requestedByType: "owner",
        requestedByUserId: "owner",
        requestContext: {},
        createdAt: "2026-07-25T12:00:00.000Z",
        updatedAt: "2026-07-25T12:00:01.000Z",
      },
    });

    const wrapper = mountPage();
    await flushPromises();

    const postNow = wrapper.findAll("button").find(
      (button) => button.text().trim() === "Post now",
    );
    expect(postNow).toBeTruthy();
    await postNow!.trigger("click");
    await flushPromises();

    const message =
      "ME3 needs an exact public API origin before private Files media can be delivered.";
    expect(wrapper.find(".social-schedule-dialog").exists()).toBe(false);
    expect(wrapper.get(".editor-action-error").text()).toContain(message);
    expect(toastHarness.error).toHaveBeenCalledWith(message);
    expect(toastHarness.success).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith("/social/versions/version-tiktok/publish", {});
  });
});
