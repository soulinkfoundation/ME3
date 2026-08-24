import { flushPromises, shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import {
  createMemoryHistory,
  createRouter,
  type Router,
} from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSitesStore, type Site } from "../stores/sites";
import { useWizardStore } from "../stores/wizard";
import CreatePage from "./create.vue";

vi.mock("../api", () => ({
  API_BASE: "/api",
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("../components/IconPicker.vue", () => ({
  default: { template: "<div />" },
}));

describe("Site Wizard route initialization", () => {
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/create", component: { template: "<div />" } },
        { path: "/sites/:username", component: { template: "<div />" } },
      ],
    });
  });

  it("opens an existing site draft directly instead of showing onboarding", async () => {
    const site = siteRecord("kieran", "profile", "2026-08-24T09:00:00.000Z");
    const sites = useSitesStore();
    sites.sites = [site];
    sites.ensureSites = vi.fn(async () => undefined) as never;
    sites.getSiteContent = vi.fn(async () => null) as never;

    const wizard = useWizardStore();
    wizard.activateDraftContext({
      siteId: site.id,
      username: site.username,
      role: "profile",
    });
    wizard.updateProfile({ name: "Kieran Butler", handle: "kieran" });
    expect(wizard.lastPublishedAt).toBeNull();
    expect(wizard.needsPublish).toBe(true);

    await router.push({
      path: "/create",
      query: {
        siteId: site.id,
        site: site.username,
        return: `/sites/${site.username}`,
      },
    });
    await router.isReady();

    const wrapper = shallowMount(CreatePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(sites.getSiteContent).not.toHaveBeenCalled();
    expect(wizard.lastPublishedAt).toBe(site.published_at);
    expect(wizard.needsPublish).toBe(true);
    expect(wrapper.find(".wizard-intro").exists()).toBe(false);
    expect(wrapper.get(".site-context-name").text()).toBe("Kieran Butler");
    expect(wrapper.find(".site-role-label").exists()).toBe(false);
  });

  it("keeps onboarding for an explicitly new organization site", async () => {
    const sites = useSitesStore();
    sites.sites = [];
    sites.ensureSites = vi.fn(async () => undefined) as never;

    await router.push({
      path: "/create",
      query: { new: "1", siteRole: "organization", return: "/sites" },
    });
    await router.isReady();

    const wrapper = shallowMount(CreatePage, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(wrapper.get(".wizard-intro").text()).toContain("Create a new site");
  });
});

function siteRecord(
  username: string,
  siteRole: "profile" | "organization",
  publishedAt: string | null,
): Site {
  return {
    id: `site-${username}`,
    username,
    user_id: "owner",
    site_type: "profile",
    site_role: siteRole,
    custom_domain: null,
    custom_domain_status: null,
    created_at: "2026-08-20T09:00:00.000Z",
    updated_at: "2026-08-24T09:00:00.000Z",
    published_at: publishedAt,
  };
}
