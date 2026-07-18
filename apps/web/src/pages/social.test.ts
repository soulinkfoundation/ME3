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

const suggestions = [
  {
    id: "suggestion-quote",
    siteId: "site-1",
    sourceType: "journal",
    sourceRef: "journal:journal-1",
    sourceTitle: "Small useful slices",
    sourceSnapshot: '{"id":"journal-1"}',
    sourceText: "We shipped the smallest useful slice and learned from real feedback.",
    kind: "quote",
    bodyText: "We shipped the smallest useful slice and learned from real feedback.",
    sourceExcerpt: "We shipped the smallest useful slice and learned from real feedback.",
    quoteTrimmed: false,
    status: "suggested",
    selectedPostId: null,
    createdBy: "agent",
    createdAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:00:00.000Z",
  },
  {
    id: "suggestion-short",
    siteId: "site-1",
    sourceType: "journal",
    sourceRef: "journal:journal-1",
    sourceTitle: "Small useful slices",
    sourceSnapshot: '{"id":"journal-1"}',
    sourceText: "We shipped the smallest useful slice and learned from real feedback.",
    kind: "short_post",
    bodyText: "Ship the smallest useful slice. Learn from real feedback.",
    sourceExcerpt: "We shipped the smallest useful slice and learned from real feedback.",
    quoteTrimmed: false,
    status: "suggested",
    selectedPostId: null,
    createdBy: "agent",
    createdAt: "2026-07-18T08:00:01.000Z",
    updatedAt: "2026-07-18T08:00:01.000Z",
  },
  {
    id: "suggestion-thread",
    siteId: "site-1",
    sourceType: "journal",
    sourceRef: "journal:journal-1",
    sourceTitle: "Small useful slices",
    sourceSnapshot: '{"id":"journal-1"}',
    sourceText: "We shipped the smallest useful slice and learned from real feedback.",
    kind: "thread",
    bodyText: "1. Ship a useful slice.\n2. Learn from feedback.",
    sourceExcerpt: "We shipped the smallest useful slice and learned from real feedback.",
    quoteTrimmed: false,
    status: "suggested",
    selectedPostId: null,
    createdBy: "agent",
    createdAt: "2026-07-18T08:00:02.000Z",
    updatedAt: "2026-07-18T08:00:02.000Z",
  },
  {
    id: "suggestion-carousel",
    siteId: "site-1",
    sourceType: "journal",
    sourceRef: "journal:journal-1",
    sourceTitle: "Small useful slices",
    sourceSnapshot: '{"id":"journal-1"}',
    sourceText: "We shipped the smallest useful slice and learned from real feedback.",
    kind: "carousel_outline",
    bodyText: "Slide 1: A useful slice\nSlide 2: Real feedback",
    sourceExcerpt: "We shipped the smallest useful slice and learned from real feedback.",
    quoteTrimmed: false,
    status: "suggested",
    selectedPostId: null,
    createdBy: "agent",
    createdAt: "2026-07-18T08:00:03.000Z",
    updatedAt: "2026-07-18T08:00:03.000Z",
  },
];

enableAutoUnmount(afterEach);

function mockGet(endpoint: string) {
  if (endpoint === "/social/posts?siteId=site-1") return Promise.resolve({ posts: [sourcePost] });
  if (endpoint === "/social/suggestions?siteId=site-1") {
    return Promise.resolve({ suggestions: [] });
  }
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

  it("groups separate Posts that share one Source", async () => {
    const secondPost = {
      ...sourcePost,
      post: {
        ...sourcePost.post,
        id: "post-2",
        ideaText: "A second Post from the same Source",
      },
      versions: sourcePost.versions.map((version) => ({
        ...version,
        id: "version-2",
        postId: "post-2",
      })),
    };
    vi.mocked(api.get).mockImplementation((endpoint) =>
      endpoint === "/social/posts?siteId=site-1"
        ? Promise.resolve({ posts: [sourcePost, secondPost] })
        : mockGet(endpoint)
    );

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.findAll(".post-source-group")).toHaveLength(1);
    expect(wrapper.findAll(".post-source-group .post-row")).toHaveLength(2);
    expect(wrapper.get(".post-source-group h2").text()).toContain("Mission Control");
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

  it("shows grouped grounded Suggestions with visible Source text", async () => {
    vi.mocked(api.get).mockImplementation((endpoint) =>
      endpoint === "/social/suggestions?siteId=site-1"
        ? Promise.resolve({ suggestions })
        : mockGet(endpoint)
    );

    const wrapper = mountPage();
    await flushPromises();
    const suggestionsButton = wrapper.findAll("button").find((button) =>
      button.text().includes("Suggestions (4)")
    );
    await suggestionsButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Quote");
    expect(wrapper.text()).toContain("Short Post");
    expect(wrapper.text()).toContain("Thread");
    expect(wrapper.text()).toContain("Carousel outline");
    expect(wrapper.text()).toContain("Source text");
    expect(wrapper.text()).toContain(
      "We shipped the smallest useful slice and learned from real feedback.",
    );
    expect(wrapper.findAll(".suggestion-group")).toHaveLength(1);
    expect(wrapper.findAll(".suggestion-card")).toHaveLength(4);
    expect(wrapper.text()).not.toMatch(/\b(candidate|derivative|package|variant)\b/i);
  });

  it("sends the loaded Suggestion revision for edit and discard actions", async () => {
    vi.mocked(api.get).mockImplementation((endpoint) =>
      endpoint === "/social/suggestions?siteId=site-1"
        ? Promise.resolve({ suggestions })
        : mockGet(endpoint)
    );
    vi.mocked(api.patch).mockResolvedValue({
      suggestion: {
        ...suggestions[1],
        bodyText: "Edited grounded copy.",
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
    });
    vi.mocked(api.delete).mockResolvedValue({
      suggestion: { ...suggestions[3], status: "discarded" },
    });
    window.confirm = vi.fn(() => true);

    const wrapper = mountPage();
    await flushPromises();
    await wrapper.findAll("button").find((button) =>
      button.text().includes("Suggestions (4)")
    )!.trigger("click");
    await flushPromises();

    const shortPostCard = wrapper.findAll(".suggestion-card").find((card) =>
      card.get("h4").text() === "Short Post"
    )!;
    await shortPostCard.get("textarea").setValue("Edited grounded copy.");
    await shortPostCard.findAll("button").find((button) =>
      button.text() === "Save edit"
    )!.trigger("click");
    await flushPromises();
    expect(api.patch).toHaveBeenCalledWith(
      "/social/suggestions/suggestion-short",
      {
        expectedUpdatedAt: "2026-07-18T08:00:01.000Z",
        bodyText: "Edited grounded copy.",
        quoteTrimmed: undefined,
      },
    );

    const carouselCard = wrapper.findAll(".suggestion-card").find((card) =>
      card.get("h4").text() === "Carousel outline"
    )!;
    await carouselCard.findAll("button").find((button) =>
      button.text() === "Discard"
    )!.trigger("click");
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith(
      "/social/suggestions/suggestion-carousel?expectedUpdatedAt=2026-07-18T08%3A00%3A03.000Z",
    );
  });

  it("keeps an interrupted choosing claim recoverable with its winning platforms", async () => {
    const choosing = {
      ...suggestions[1],
      status: "choosing",
      choosingPlatforms: ["x"],
      choosingAt: "2026-07-18T08:05:00.000Z",
      updatedAt: "2026-07-18T08:05:00.000Z",
    };
    vi.mocked(api.get).mockImplementation((endpoint) =>
      endpoint === "/social/suggestions?siteId=site-1"
        ? Promise.resolve({ suggestions: [choosing] })
        : mockGet(endpoint)
    );
    vi.mocked(api.post).mockResolvedValue({
      suggestion: { ...choosing, status: "chosen", selectedPostId: "post-recovered" },
      post: sourcePost,
    });

    const wrapper = mountPage();
    await flushPromises();
    await wrapper.findAll("button").find((button) =>
      button.text().includes("Suggestions (1)")
    )!.trigger("click");
    await flushPromises();

    const card = wrapper.get(".suggestion-card");
    expect(card.get("textarea").attributes("disabled")).toBeDefined();
    const xPlatform = card.findAll(".platform-options button").find((button) =>
      button.text() === "X"
    )!;
    expect(xPlatform.attributes("aria-pressed")).toBe("true");
    expect(xPlatform.attributes("disabled")).toBeDefined();
    await card.findAll("button").find((button) =>
      button.text() === "Finish saving Post"
    )!.trigger("click");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(
      "/social/suggestions/suggestion-short/post",
      {
        platforms: ["x"],
        expectedUpdatedAt: "2026-07-18T08:05:00.000Z",
      },
    );
  });

  it("lets the owner choose one Suggestion as a separate Source-backed Post", async () => {
    vi.mocked(api.get).mockImplementation((endpoint) =>
      endpoint === "/social/suggestions?siteId=site-1"
        ? Promise.resolve({ suggestions })
        : mockGet(endpoint)
    );
    const chosenSuggestion = {
      ...suggestions[1],
      status: "chosen",
      selectedPostId: "post-from-suggestion",
    };
    const chosenPost = {
      ...sourcePost,
      post: {
        ...sourcePost.post,
        id: "post-from-suggestion",
        sourceType: "journal",
        sourceRef: "journal:journal-1",
        sourceSnapshot: '{"id":"journal-1"}',
        sourceText: suggestions[1]!.sourceText,
        ideaText: suggestions[1]!.bodyText,
      },
      versions: sourcePost.versions.map((version) => ({
        ...version,
        id: "version-from-suggestion",
        postId: "post-from-suggestion",
        bodyText: suggestions[1]!.bodyText,
      })),
    };
    vi.mocked(api.post).mockImplementation((endpoint) =>
      endpoint === "/social/suggestions/suggestion-short/post"
        ? Promise.resolve({ suggestion: chosenSuggestion, post: chosenPost })
        : Promise.reject(new Error(`Unexpected POST ${endpoint}`))
    );

    const wrapper = mountPage();
    await flushPromises();
    const suggestionsButton = wrapper.findAll("button").find((button) =>
      button.text().includes("Suggestions (4)")
    );
    await suggestionsButton!.trigger("click");
    await flushPromises();
    const shortPostCard = wrapper.findAll(".suggestion-card").find((card) =>
      card.get("h4").text() === "Short Post"
    )!;
    const saveAsPost = shortPostCard.findAll("button").find((button) =>
      button.text() === "Save as Post"
    );
    await saveAsPost!.trigger("click");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(
      "/social/suggestions/suggestion-short/post",
      {
        platforms: ["linkedin"],
        expectedUpdatedAt: "2026-07-18T08:00:01.000Z",
      },
    );
    expect(wrapper.text()).toContain(
      "Suggestion saved as a separate Source-backed Post for review.",
    );
    expect(wrapper.findAll(".suggestion-card")).toHaveLength(3);
    expect(document.activeElement).toBe(wrapper.findAll(".suggestion-card")[1]!.element);
  });
});
