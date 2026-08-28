import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();
const routerPush = vi.fn();

vi.mock("unplugin-vue-router/runtime", () => ({ definePage: vi.fn() }));
vi.mock("vue-router", () => ({
  RouterLink: {
    props: ["to"],
    template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
  },
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: routerPush }),
}));
vi.mock("../../../api", () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
  },
}));

import CampaignsPage from "./index.vue";

describe("campaign list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="app-side-nav-mobile-page-controls"></div>';
    apiGet.mockImplementation((path: string) => {
      if (path === "/plugins") {
        return Promise.resolve({
          catalogVersion: "test",
          plugins: [{
            id: "me3.email-campaigns",
            name: "Email Campaigns",
            enabled: true,
            status: "installed",
          }],
        });
      }
      if (path === "/email/campaigns/transport") {
        return Promise.resolve({
          transport: {
            managed: true,
            ready: false,
            reason: "sender_not_ready",
            sender: null,
            addOn: null,
            instructions: [],
          },
        });
      }
      return Promise.resolve({
        campaigns: [{
          id: "campaign-1",
          siteId: "site-1",
          siteUsername: "mentuition",
          subject: "Test",
          status: "draft",
          scheduledFor: null,
          sentAt: null,
          failureReason: null,
          recipientCount: 0,
          deliveredCount: 0,
          failedCount: 0,
          updatedAt: "2026-08-27T13:16:00.000Z",
        }],
      });
    });
  });

  it("prompts for plugin activation before loading campaign data", async () => {
    apiGet.mockResolvedValueOnce({
      catalogVersion: "test",
      plugins: [{
        id: "me3.email-campaigns",
        name: "Email Campaigns",
        enabled: false,
        status: "available",
      }],
    });

    const wrapper = mount(CampaignsPage, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain("Activate Email Campaigns");
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith("/plugins");
    wrapper.unmount();
  });

  it("does not show ME3 billing plans on self-hosted installations", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/plugins") {
        return Promise.resolve({
          catalogVersion: "test",
          plugins: [{ id: "me3.email-campaigns", enabled: true, status: "installed" }],
        });
      }
      if (path === "/email/campaigns/transport") {
        return Promise.resolve({
          transport: {
            managed: false,
            ready: false,
            reason: "managed_installation_required",
            sender: null,
            addOn: null,
            instructions: ["Connect an owner-supplied provider before sending."],
          },
        });
      }
      return Promise.resolve({ campaigns: [] });
    });

    const wrapper = mount(CampaignsPage, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain("Configure delivery for this self-hosted installation");
    expect(wrapper.text()).not.toContain("Choose your monthly email capacity");
    expect(wrapper.text()).not.toContain("USD / month");
    wrapper.unmount();
  });

  it("allows managed draft creation before the sender is ready", async () => {
    const wrapper = mount(CampaignsPage, { attachTo: document.body });
    await flushPromises();

    const controls = document.querySelector(".campaigns-mobile-nav")!;
    expect(controls.querySelector('[aria-label="Create campaign"]')).not.toBeNull();
    expect(controls.textContent?.trim()).toBe("");
    expect(wrapper.findAll(".workspace-tabs__tab")[0].text()).toContain("Campaigns");

    wrapper.unmount();
  });

  it("renders compact draft metadata with an accessible edit action", async () => {
    const wrapper = mount(CampaignsPage, { attachTo: document.body });
    await flushPromises();

    const card = wrapper.get(".campaign-card");
    expect(card.get("h2").text()).toBe("Test - @mentuition");
    expect(card.get(".status-pill").text()).toBe("Draft");
    expect(card.text()).not.toContain("Not sent yet");
    expect(card.text()).not.toContain("Continue");
    expect(
      card.get('[aria-label="Edit Test for @mentuition"]').classes(),
    ).toContain("me3-btn--icon-only");

    wrapper.unmount();
  });
});
