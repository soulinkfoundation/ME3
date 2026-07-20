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
    await wrapper.get("[aria-label='New Post']").trigger("click");
    expect(wrapper.findAll(".platform-target")).toHaveLength(1);
    expect(wrapper.get(".platform-target").text()).toContain("LinkedIn");
  });
});
