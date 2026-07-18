import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { useSitesStore } from "../stores/sites";
import SocialPage from "./social.vue";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const account = {
  id: "account-linkedin",
  siteId: "site-1",
  platform: "linkedin",
  handle: "@kieran",
  displayName: "Kieran",
  status: "active",
  lastVerifiedAt: "2026-07-18T08:00:00Z",
};

const sourcePost = {
  post: {
    id: "post-1",
    siteId: "site-1",
    sourceType: "mission_task",
    sourceRef: "mission_task:task-1",
    sourceSnapshot: "{\"id\":\"task-1\"}",
    sourceText: "A source-backed idea worth sharing.",
    ideaText: "An agent-prepared social Post",
    goal: null,
    status: "ready",
    createdBy: "agent",
    createdAt: "2026-07-18T07:00:00Z",
    updatedAt: "2026-07-18T07:00:00Z",
  },
  versions: [
    {
      id: "version-1",
      postId: "post-1",
      platform: "linkedin",
      targetAccountId: "account-linkedin",
      format: "post",
      bodyText: "Agent copy",
      assetManifest: [],
      sourceExcerpt: "A source-backed idea worth sharing.",
      approvalStatus: "draft",
      approvedAt: null,
      approvedByUserId: null,
      scheduledFor: null,
      timezone: null,
      publicationStatus: null,
      platformPostUrl: null,
      publishedAt: null,
      failureClass: null,
      errorMessage: null,
      createdAt: "2026-07-18T07:00:00Z",
      updatedAt: "2026-07-18T07:00:00Z",
    },
  ],
};

const legacyPost = {
  ...sourcePost,
  post: {
    ...sourcePost.post,
    id: "post-legacy",
    sourceType: "legacy_content_bank_read_only",
    sourceRef: "content-bank:legacy-1",
    ideaText: "Imported legacy Post",
    createdBy: "user",
  },
  versions: sourcePost.versions.map((version) => ({
    ...version,
    id: "version-legacy",
    postId: "post-legacy",
    approvalStatus: "approved",
    approvedAt: "2026-07-18T07:30:00Z",
    approvedByUserId: "owner",
  })),
};

const platformCapabilities = [
  { platform: "linkedin", draft: true, schedule: true, publish: true, reason: null },
  {
    platform: "x",
    draft: true,
    schedule: false,
    publish: false,
    reason: "X Versions are draft-only until delivery works end to end.",
  },
  {
    platform: "instagram",
    draft: true,
    schedule: false,
    publish: false,
    reason: "Instagram Versions are draft-only until delivery works end to end.",
  },
];

const publication = {
  id: "publication-1",
  versionId: "version-1",
  platform: "linkedin",
  status: "scheduled",
  scheduledFor: "2026-07-20T09:30:00.000Z",
  timezone: "Europe/Dublin",
  queuedAt: null,
  platformPostId: null,
  platformPostUrl: null,
  publishedAt: null,
  failureClass: null,
  errorCode: null,
  errorMessage: null,
  requestedByType: "owner",
  requestedByUserId: "owner",
  requestContext: { surface: "social_workspace" },
  createdAt: "2026-07-18T08:00:00.000Z",
  updatedAt: "2026-07-18T08:00:00.000Z",
};

enableAutoUnmount(afterEach);

function mockGet(endpoint: string) {
  if (endpoint === "/social/posts?siteId=site-1") return Promise.resolve({ posts: [sourcePost] });
  if (endpoint === "/social/accounts") return Promise.resolve({ accounts: [account] });
  if (endpoint === "/social/versions/version-1/publications") {
    return Promise.resolve({ publications: [publication] });
  }
  if (endpoint === "/social/status") {
    return Promise.resolve({
      plugin: {
        status: "installed",
        enabled: true,
        ready: true,
        statusLabel: "Installed",
        platformCapabilities,
      },
      hostedOAuth: { configured: false, platforms: [] },
    });
  }
  throw new Error(`Unexpected GET ${endpoint}`);
}

function mountPage() {
  return mount(SocialPage, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
        SocialAccountsPanel: { template: "<div>Account settings</div>" },
        AppDialog: {
          props: ["open"],
          template: '<div v-if="open"><slot /></div>',
        },
      },
    },
  });
}

describe("SocialPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/social");
    const sites = useSitesStore();
    sites.sites = [
      {
        id: "site-1",
        username: "kieran",
        user_id: "owner",
        custom_domain: null,
        custom_domain_status: null,
        created_at: "2026-07-01T08:00:00Z",
        updated_at: "2026-07-18T08:00:00Z",
        published_at: "2026-07-01T08:00:00Z",
      },
    ];
    vi.mocked(api.get).mockImplementation(mockGet);
  });

  it("shows visible Source text and canonical Post/Version language", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("An agent-prepared social Post");
    expect(wrapper.text()).toContain("A source-backed idea worth sharing.");
    expect(wrapper.text()).toContain("LinkedIn Version");
    expect(wrapper.text().toLowerCase()).not.toContain("content bank");
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining("/content/"));
  });

  it("focuses the exact Publication named by a Calendar deep link", async () => {
    window.history.replaceState(
      {},
      "",
      "/social?siteId=site-1&postId=post-1&versionId=version-1&publicationId=publication-1",
    );

    const wrapper = mountPage();
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith("/social/versions/version-1/publications");
    const linked = wrapper.get("#social-publication-publication-1");
    expect(linked.classes()).toContain("publication-history__item--linked");
    expect(linked.attributes("aria-current")).toBe("true");
    expect(linked.attributes("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(linked.element);
  });

  it("saves owner-authored compose text as a pasted Source-backed Post", async () => {
    const created = {
      ...sourcePost,
      post: {
        ...sourcePost.post,
        id: "post-new",
        sourceType: "pasted",
        sourceText: "A newly composed Post.",
        sourceSnapshot: "A newly composed Post.",
        ideaText: "A newly composed Post.",
        createdBy: "user",
      },
      versions: [{ ...sourcePost.versions[0], id: "version-new", postId: "post-new" }],
    };
    vi.mocked(api.post).mockResolvedValue({ post: created });

    const wrapper = mountPage();
    await flushPromises();
    const composeButton = wrapper.findAll("button").find((button) => button.text().trim() === "New Post");
    await composeButton!.trigger("click");
    await wrapper.get(".compose-card textarea").setValue("A newly composed Post.");
    await wrapper.get("form.compose-card").trigger("submit");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/social/posts", {
      siteId: "site-1",
      sourceType: "pasted",
      sourceSnapshot: "A newly composed Post.",
      sourceText: "A newly composed Post.",
      ideaText: "A newly composed Post.",
      versions: [
        {
          platform: "linkedin",
          bodyText: "A newly composed Post.",
          targetAccountId: "account-linkedin",
        },
      ],
    });
    expect(wrapper.text()).toContain("Source-backed Post saved for review.");
  });

  it("presents X and Instagram as draft-only capability options", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const composeButton = wrapper.findAll("button").find((button) => button.text().trim() === "New Post");
    await composeButton!.trigger("click");

    const xTarget = wrapper.findAll(".platform-target").find((button) => button.text().includes("X"));
    const instagramTarget = wrapper.findAll(".platform-target").find((button) => button.text().includes("Instagram"));
    expect(xTarget?.text()).toContain("Draft only");
    expect(instagramTarget?.text()).toContain("Draft only");
  });

  it("presents imported legacy Posts as read-only with ordinary Version buttons", async () => {
    vi.mocked(api.get).mockImplementation((endpoint) =>
      endpoint === "/social/posts?siteId=site-1"
        ? Promise.resolve({ posts: [legacyPost] })
        : mockGet(endpoint)
    );

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Imported Post — read-only");
    expect(wrapper.get(".version-editor textarea").attributes("readonly")).toBeDefined();
    expect(wrapper.get(".version-editor select").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).not.toContain("Save Draft");
    expect(wrapper.text()).not.toContain("Approve Version");
    expect(wrapper.text()).not.toContain("Publish now");
    expect(wrapper.find(".editor-actions").exists()).toBe(false);
    expect(wrapper.find(".publication-actions").exists()).toBe(false);
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
    expect(wrapper.find('[role="tab"]').exists()).toBe(false);
    expect(wrapper.get(".version-tab").attributes("aria-pressed")).toBe("true");
  });

  it("shows compose-save failures inside the open dialog", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError("Source-backed Post rejected", 400));

    const wrapper = mountPage();
    await flushPromises();
    const composeButton = wrapper.findAll("button").find((button) => button.text().trim() === "New Post");
    await composeButton!.trigger("click");
    await wrapper.get(".compose-card textarea").setValue("A source that fails to save.");
    await wrapper.get("form.compose-card").trigger("submit");
    await flushPromises();

    const alert = wrapper.get(".compose-card [role='alert']");
    expect(alert.text()).toContain("Source-backed Post rejected");
    expect(wrapper.find(".compose-card").exists()).toBe(true);
  });
});
