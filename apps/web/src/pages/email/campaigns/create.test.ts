import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiPut = vi.fn();
const routerPush = vi.fn();
const routerReplace = vi.fn();

vi.mock("unplugin-vue-router/runtime", () => ({ definePage: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { campaign: "campaign-1" } }),
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));
vi.mock("../../../api", () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    put: (...args: unknown[]) => apiPut(...args),
    post: vi.fn(),
    upload: vi.fn(),
  },
}));
vi.mock("../../../stores/auth", () => ({
  useAuthStore: () => ({ user: { email: "owner@example.com" } }),
}));
vi.mock("../../../stores/sites", () => ({
  useSitesStore: () => ({
    sites: [{ id: "site-1", username: "kieran" }],
    ensureSites: vi.fn(),
  }),
}));
vi.mock("../../../components/TiptapEditor.vue", () => ({
  default: {
    name: "TiptapEditor",
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: '<div data-test="editor" />',
  },
}));

import CampaignCreatePage from "./create.vue";

const campaign = {
  id: "campaign-1",
  siteId: "site-1",
  siteUsername: "kieran",
  name: "August update",
  status: "draft",
  revision: {
    id: "revision-1",
    subject: "August update",
    previewText: "A short preview",
    replyToAddress: "hello@example.com",
    document: {
      version: "me3.campaign-document.v1",
      brand: {
        name: "Kieran Studio",
        homeUrl: "https://kieran.example.com/",
        logoUrl: null,
        backgroundColor: "#f4f5f4",
        surfaceColor: "#ffffff",
        textColor: "#18201d",
        accentColor: "#147d64",
      },
      blocks: [{
        id: "intro",
        type: "text",
        paragraphs: [{ style: "body", spans: [{ text: "Hello readers" }] }],
      }],
    },
    renderedHtml: "<p>Hello readers</p>",
    renderedText: "Hello readers",
  },
};

describe("campaign creation wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("scrollTo", vi.fn());
    apiGet.mockImplementation((path: string) => {
      if (path === "/email/campaigns/transport") {
        return Promise.resolve({
          transport: {
            managed: true,
            ready: true,
            reason: null,
            sender: {
              ref: "sender-1",
              fromAddress: "campaign@example.com",
              domain: "example.com",
            },
            addOn: null,
            instructions: [],
          },
        });
      }
      if (path.endsWith("/review")) {
        return Promise.resolve({
          audience: { eligibleCount: 42, excludedCount: 0, exclusionCounts: {} },
          transport: {
            managed: true,
            ready: true,
            reason: null,
            sender: {
              ref: "sender-1",
              fromAddress: "campaign@example.com",
              domain: "example.com",
            },
            addOn: null,
            instructions: [],
          },
        });
      }
      return Promise.resolve({ campaign });
    });
    apiPut.mockResolvedValue({ campaign });
  });

  it("shows the email preview while composing and a centered send flow at review", async () => {
    const wrapper = mount(CampaignCreatePage, {
      global: {
        stubs: {
          UiIcon: true,
          RouterLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });
    await flushPromises();

    expect(wrapper.find(".compose-preview").exists()).toBe(true);
    expect(wrapper.text()).toContain("Kieran Studio <campaign@example.com>");
    expect(wrapper.find(".brand-card").exists()).toBe(false);

    const senderName = wrapper.find<HTMLInputElement>('input[maxlength="120"]');
    expect(senderName.element.value).toBe("Kieran Studio");
    await senderName.setValue("Kieran Butler");
    expect(wrapper.text()).toContain("Kieran Butler <campaign@example.com>");

    const reviewButton = wrapper.findAll("button").find((button) =>
      button.text().includes("Review audience"),
    );
    expect(reviewButton).toBeDefined();
    await reviewButton!.trigger("click");
    await flushPromises();

    expect(apiPut).toHaveBeenCalledWith(
      "/email/campaigns/campaign-1",
      expect.objectContaining({
        document: expect.objectContaining({
          brand: expect.objectContaining({ name: "Kieran Butler" }),
        }),
      }),
    );

    expect(wrapper.find(".send-review").exists()).toBe(true);
    expect(wrapper.text()).toContain("Review and schedule");
    expect(wrapper.text()).toMatch(/42 eligible subscribers in\s+@kieran/);
    expect(wrapper.find('.audience-count a[href="/sites/kieran"]').exists()).toBe(true);
    expect(
      wrapper.findAll(".send-actions button").map((button) => button.text().trim()),
    ).toEqual(["Send campaign", "Back"]);

    wrapper.unmount();
  });
});
