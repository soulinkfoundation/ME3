import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useSocialStore,
  type SocialProviderSetting,
  type SocialStatus,
} from "../stores/social";
import SocialAccountsPanel from "./SocialAccountsPanel.vue";

const routerHarness = vi.hoisted(() => ({
  replace: vi.fn(),
  route: { path: "/social", query: {} as Record<string, string> },
}));
const toastHarness = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => routerHarness.route,
  useRouter: () => ({
    replace: routerHarness.replace,
    resolve: (location: { path: string }) => ({ fullPath: location.path }),
  }),
}));

vi.mock("../composables/useAppToast", () => ({
  useAppToast: () => ({
    toastError: toastHarness.error,
    toastSuccess: toastHarness.success,
  }),
}));

const status = {
  plugin: {
    status: "ready",
    enabled: true,
    ready: true,
    statusLabel: "Ready",
    platformCapabilities: [],
  },
  hostedOAuth: { configured: true, platforms: ["linkedin", "instagram"] },
} satisfies SocialStatus;

const xProvider = {
  providerId: "x",
  label: "X",
  clientId: "",
  configured: false,
  enabled: false,
  secretHint: null,
  secretUpdatedAt: null,
  callbackPath: "/api/social/x/callback",
} satisfies SocialProviderSetting;

describe("SocialAccountsPanel X funding acknowledgement", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    routerHarness.route.query = {};
    const store = useSocialStore();
    vi.spyOn(store, "fetchSocialStatus").mockResolvedValue(status);
    vi.spyOn(store, "fetchSocialAccounts").mockResolvedValue([]);
    vi.spyOn(store, "fetchProviderSettings").mockResolvedValue([xProvider]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("explains owner-funded pay-per-use access and requires acknowledgement before connecting", async () => {
    const store = useSocialStore();
    const configured = { ...xProvider, clientId: "client-id", configured: true, enabled: true };
    const updateProvider = vi.spyOn(store, "updateProviderSetting").mockResolvedValue([configured]);
    const startOAuth = vi.spyOn(store, "startSocialOAuth").mockRejectedValue(
      new Error("Stop before navigation"),
    );
    const wrapper = mount(SocialAccountsPanel, {
      props: { siteId: "site-1" },
      global: {
        stubs: {
          UiIcon: { template: "<span aria-hidden=\"true\" />" },
        },
      },
    });
    await flushPromises();

    await wrapper.findAll(".social-connect-btn")[0]!.trigger("click");
    const notice = wrapper.get(".x-funding-notice");
    expect(notice.text()).toContain("X API access is pay-per-use");
    expect(notice.text()).toContain("your own X developer account");

    const links = notice.findAll("a");
    expect(links.map((link) => link.attributes("href"))).toEqual([
      "https://docs.x.com/x-api/getting-started/pricing",
      "https://console.x.com",
    ]);
    for (const link of links) {
      expect(link.attributes("target")).toBe("_blank");
      expect(link.attributes("rel")).toContain("noopener");
      expect(link.attributes("rel")).toContain("noreferrer");
    }

    const connectButton = wrapper.get(".social-own-app__button");
    expect(connectButton.attributes()).toHaveProperty("disabled");
    await wrapper.findAll(".social-own-app input")[0]!.setValue("client-id");
    await wrapper.findAll(".social-own-app input")[1]!.setValue("client-secret");
    await notice.get('input[type="checkbox"]').setValue(true);
    expect(connectButton.attributes()).not.toHaveProperty("disabled");

    await connectButton.trigger("click");
    await flushPromises();

    expect(updateProvider).toHaveBeenCalledWith({
      id: "x",
      clientId: "client-id",
      clientSecret: "client-secret",
      enabled: true,
    });
    expect(startOAuth).toHaveBeenCalledWith("x", "site-1", "/social", "byo");
  });

  it.each([
    ["x", "X connected. It will now appear as a draft target."],
    ["instagram", "Instagram connected. It will now appear as a draft target."],
    ["linkedin", "LinkedIn connected. It will now appear as a publish target."],
  ])("reports truthful capability language after connecting %s", async (platform, message) => {
    routerHarness.route.query = { social_connected: platform };
    const wrapper = mount(SocialAccountsPanel, {
      props: { siteId: "site-1" },
      global: {
        stubs: {
          UiIcon: { template: "<span aria-hidden=\"true\" />" },
        },
      },
    });
    await flushPromises();

    expect(toastHarness.success).toHaveBeenCalledWith(message);
    expect(routerHarness.replace).toHaveBeenCalledWith({
      path: "/social",
      query: {},
    });
    expect(wrapper.find(".banner").exists()).toBe(false);
  });

  it("keeps hosted connection choices concise", async () => {
    const wrapper = mount(SocialAccountsPanel, {
      props: { siteId: "site-1" },
      global: {
        stubs: {
          UiIcon: { template: "<span aria-hidden=\"true\" />" },
        },
      },
    });
    await flushPromises();

    await wrapper.findAll(".social-connect-btn")[1]!.trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain("Connect with ME3");
    expect(dialog.text()).toContain("Advanced: use my own app");
    expect(dialog.text()).not.toContain("Connect through ME3 Cloud");
    expect(dialog.text()).not.toContain("Recommended. Requires this installation");
  });

  it("reports actionable hosted OAuth failures through vue-sonner", async () => {
    routerHarness.route.query = {
      social_error: "youtube_token_invalid_client",
    };
    const wrapper = mount(SocialAccountsPanel, {
      props: { siteId: "site-1" },
      global: {
        stubs: {
          UiIcon: { template: "<span aria-hidden=\"true\" />" },
        },
      },
    });
    await flushPromises();

    expect(toastHarness.error).toHaveBeenCalledWith(
      "Google rejected the YouTube app credentials. Check that the client ID and client secret belong to the same Web application.",
    );
    expect(routerHarness.replace).toHaveBeenCalledWith({
      path: "/social",
      query: {},
    });
    expect(wrapper.find(".banner").exists()).toBe(false);
  });
});
