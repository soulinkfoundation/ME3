import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useSitesStore } from "../stores/sites";
import SocialPage from "./social.vue";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
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

const contentItem = {
  id: "content-1",
  siteId: "site-1",
  siteUsername: "kieran",
  userId: "owner",
  body: "A post written by the owner.",
  mediaManifest: [],
  platforms: ["linkedin"],
  sourceType: "original",
  sourceRef: null,
  status: "bank",
  queuePosition: null,
  scheduledFor: null,
  timezone: "Europe/Dublin",
  createdBy: "human",
  approvedByHuman: true,
  evergreen: false,
  timesPosted: 0,
  lastPostedAt: null,
  cooldownDays: 0,
  tags: [],
  notes: null,
  createdAt: "2026-07-18T08:00:00Z",
  updatedAt: "2026-07-18T08:00:00Z",
};

const agentPackage = {
  package: {
    id: "package-1",
    siteId: "site-1",
    sourceType: "mission_task",
    sourceRef: "task-1",
    sourceSnapshot: "A source-backed idea.",
    ideaText: "An agent-prepared social post",
    goal: null,
    status: "ready",
    createdBy: "agent",
    createdAt: "2026-07-18T07:00:00Z",
    updatedAt: "2026-07-18T07:00:00Z",
  },
  variants: [
    {
      id: "variant-1",
      packageId: "package-1",
      platform: "linkedin",
      targetAccountId: "account-linkedin",
      format: "post",
      bodyText: "Agent copy",
      assetManifest: [],
      sourceExcerpt: "A source-backed idea.",
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

enableAutoUnmount(afterEach);

function mockGet(endpoint: string) {
  if (endpoint === "/social/packages?siteId=site-1") {
    return Promise.resolve({ packages: [agentPackage] });
  }
  if (endpoint === "/social/accounts") {
    return Promise.resolve({ accounts: [account] });
  }
  if (endpoint === "/content/items?siteId=site-1") {
    return Promise.resolve({ items: [contentItem] });
  }
  throw new Error(`Unexpected GET ${endpoint}`);
}

function mountPage() {
  return mount(SocialPage, {
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
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: "(max-width: 720px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses an email-style toolbar without the old title or site picker", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Social Publishing");
    expect(wrapper.find(".site-picker").exists()).toBe(false);
    expect(wrapper.text()).toContain("A post written by the owner.");
    expect(wrapper.text()).toContain("An agent-prepared social post");

    const accountsButton = wrapper.get(
      'button[aria-label="Manage social accounts"]',
    );
    expect(accountsButton.classes()).toContain("me3-btn--ghost");
    expect(accountsButton.classes()).toContain("me3-btn--icon-only");
  });

  it("composes a post with an image and saves it through the content bank", async () => {
    const createdItem = {
      ...contentItem,
      id: "content-new",
      body: "A newly composed post.",
    };
    const uploadedItem = {
      ...createdItem,
      mediaManifest: [
        {
          url: "/preview/kieran/files/new.png",
          filename: "new.png",
          mimeType: "image/png",
          kind: "image",
        },
      ],
    };
    vi.mocked(api.post).mockResolvedValue({ item: createdItem });
    vi.mocked(api.upload).mockResolvedValue({
      asset: uploadedItem.mediaManifest[0],
      item: uploadedItem,
    });

    const wrapper = mountPage();
    await flushPromises();
    const composeButton = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Compose");
    expect(composeButton).toBeTruthy();
    await composeButton!.trigger("click");

    const textarea = wrapper.get(".compose-field--body textarea");
    await textarea.setValue("A newly composed post.");

    const fileInput = wrapper.get('.image-upload input[type="file"]');
    const file = new File(["image"], "new.png", { type: "image/png" });
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [file],
    });
    await fileInput.trigger("change");
    expect(wrapper.text()).toContain("new.png");

    const saveButton = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Save draft");
    expect(saveButton).toBeTruthy();
    expect(saveButton!.attributes("disabled")).toBeUndefined();
    await wrapper.get("form.compose-card").trigger("submit");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/content/items", {
      siteId: "site-1",
      body: "A newly composed post.",
      platforms: ["linkedin"],
      mediaManifest: [],
      timezone: expect.any(String),
    });
    expect(api.upload).toHaveBeenCalledWith(
      "/content/items/content-new/media",
      expect.any(FormData),
    );
    expect(wrapper.text()).toContain("Draft saved.");
  });
});
