import { flushPromises, mount } from "@vue/test-utils";
import { h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { invalidatePluginAccess } from "../utils/pluginAccess";
import AppSideNav from "./AppSideNav.vue";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
  },
}));

const routeComponent = {
  render: () => h("div"),
};

async function mountSideNav(
  plugins: Array<{ id: string; status: string; enabled: boolean }>,
) {
  vi.mocked(api.get).mockResolvedValue({ plugins });
  invalidatePluginAccess();

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/:pathMatch(.*)*",
        component: routeComponent,
      },
    ],
  });
  await router.push("/assistant");
  await router.isReady();

  const wrapper = mount(AppSideNav, {
    global: {
      plugins: [router],
    },
  });
  await flushPromises();
  return wrapper;
}

describe("AppSideNav optional plugin links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePluginAccess();
  });

  it("shows Socials and Accounts when both plugins are enabled", async () => {
    const wrapper = await mountSideNav([
      {
        id: "me3.social-publishing",
        status: "installed",
        enabled: true,
      },
      {
        id: "me3.accounts",
        status: "installed",
        enabled: true,
      },
    ]);

    expect(wrapper.find('[aria-label="Socials"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Accounts"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("uses the approved navigation order, Tasks destination, and dog-head image", async () => {
    const wrapper = await mountSideNav([
      { id: "me3.journal", status: "installed", enabled: true },
      { id: "me3.calendar", status: "installed", enabled: true },
      { id: "me3.mission-control", status: "installed", enabled: true },
      { id: "me3.social-publishing", status: "installed", enabled: true },
      { id: "me3.accounts", status: "installed", enabled: true },
    ]);

    expect(
      wrapper.findAll("nav a").map((link) => link.attributes("aria-label")),
    ).toEqual([
      "Journal",
      "Assistant",
      "Calendar",
      "Tasks",
      "Email",
      "Sites",
      "Files",
      "Socials",
      "Accounts",
      "Settings",
    ]);
    expect(wrapper.get('[aria-label="Tasks"]').attributes("href")).toBe(
      "/mission-control/projects",
    );
    expect(
      wrapper.get('[aria-label="Assistant"] img').attributes("src"),
    ).toBe("/me3-dog-head-emoji-smooth.png");
    wrapper.unmount();
  });

  it("hides Socials and Accounts when both plugins are disabled", async () => {
    const wrapper = await mountSideNav([
      {
        id: "me3.social-publishing",
        status: "installed",
        enabled: false,
      },
      {
        id: "me3.accounts",
        status: "installed",
        enabled: false,
      },
    ]);

    expect(wrapper.find('[aria-label="Socials"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Accounts"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
