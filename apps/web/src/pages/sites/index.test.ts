import {
  enableAutoUnmount,
  flushPromises,
  mount,
} from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import {
  createMemoryHistory,
  createRouter,
  type Router,
} from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSitesStore, type Site, type SiteQuota } from "../../stores/sites";
import SitesPage from "./index.vue";

vi.mock("../../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

enableAutoUnmount(afterEach);

describe("Sites dashboard", () => {
  let router: Router;

  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/sites", component: { template: "<div />" } },
        { path: "/sites/:username", component: { template: "<div />" } },
        { path: "/create", component: { template: "<div />" } },
        { path: "/account", component: { template: "<div />" } },
        { path: "/assistant", component: { template: "<div />" } },
      ],
    });
    await router.push("/sites");
    await router.isReady();
  });

  it("leads with profile creation while keeping an existing additional site accessible", async () => {
    const additional = siteRecord("studio", "organization");
    const wrapper = await mountDashboard([additional], quotaResponse({
      canCreateProfile: true,
      canCreateAdditionalSite: false,
      remainingAdditionalSites: 1,
    }));

    expect(wrapper.text()).toContain("Create your ME3 Profile");
    expect(wrapper.text()).toContain("@studio");
    expect(wrapper.text()).not.toMatch(/organization sites/i);
    expect(wrapper.find('[aria-label="Add site"]').exists()).toBe(false);
    expect(
      wrapper.findAll("a").some((link) => link.attributes("href") === "/sites/studio"),
    ).toBe(true);
  });

  it("renders every persistent site as one minimal clickable card", async () => {
    const profile = siteRecord("owner", "profile", "2026-08-20T10:00:00.000Z");
    const additional = siteRecord("studio", "organization");
    additional.avatar = "./files/avatar.jpg";
    const secondAdditional = siteRecord("community", "organization");
    const wrapper = await mountDashboard(
      [profile, additional, secondAdditional],
      quotaResponse({
        canCreateProfile: false,
        canCreateAdditionalSite: true,
        remainingAdditionalSites: 1,
      }),
    );

    expect(wrapper.text()).toContain("@owner");
    expect(wrapper.text()).toContain("@studio");
    expect(wrapper.text()).toContain("@community");
    expect(wrapper.get('[aria-label="Add site"]').attributes("href")).toContain(
      "siteRole=organization",
    );

    const cards = wrapper.findAll("a.site-card");
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.attributes("href"))).toEqual([
      "/sites/owner",
      "/sites/studio",
      "/sites/community",
    ]);
    expect(cards[0].text()).toBe("@ownerPublished");
    expect(cards[1].text()).toBe("@studioDraft");
    expect(cards[2].text()).toBe("@communityDraft");
    expect(cards[0].find(".brand-logo-stub").exists()).toBe(true);
    expect(cards[1].get("img.site-card__avatar").attributes("src")).toBe(
      "/preview/studio/files/avatar.jpg",
    );
    expect(cards[2].find(".site-card__icon").exists()).toBe(true);
  });

  it("hides Add site and explains when the quota is full", async () => {
    const wrapper = await mountDashboard(
      [siteRecord("owner", "profile")],
      quotaResponse({
        canCreateProfile: false,
        canCreateAdditionalSite: false,
        remainingAdditionalSites: 0,
      }),
    );

    expect(wrapper.find('[aria-label="Add site"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(
      "You have used all 1 additional site slots on your current plan.",
    );
  });

  async function mountDashboard(
    records: Site[],
    siteQuota: SiteQuota,
  ) {
    const sites = useSitesStore();
    sites.sites = records;
    sites.fetchSites = vi.fn(async () => undefined) as never;
    sites.fetchSitePages = vi.fn(async () => []) as never;
    sites.getSiteQuota = vi.fn(async () => siteQuota) as never;
    const wrapper = mount(SitesPage, mountOptions(router));
    await flushPromises();
    return wrapper;
  }
});

function mountOptions(router: Router) {
  return {
    global: {
      plugins: [router],
      stubs: {
        BrandLogo: { template: '<span class="brand-logo-stub" />' },
        UiIcon: { template: '<span class="ui-icon-stub" />' },
      },
    },
  };
}

function siteRecord(
  username: string,
  siteRole: "profile" | "organization",
  publishedAt: string | null = null,
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
    updated_at: "2026-08-20T09:00:00.000Z",
    published_at: publishedAt,
  };
}

function quotaResponse(options: {
  canCreateProfile: boolean;
  canCreateAdditionalSite: boolean;
  remainingAdditionalSites: number;
}): SiteQuota {
  const additionalLimit = 1;
  const additionalCurrent = additionalLimit - options.remainingAdditionalSites;
  return {
    current: additionalCurrent + (options.canCreateProfile ? 0 : 1),
    limit: additionalLimit + 1,
    tier: "core",
    profile: {
      current: options.canCreateProfile ? 0 : 1,
      limit: 1,
      remaining: options.canCreateProfile ? 1 : 0,
      can_create: options.canCreateProfile,
    },
    additional_sites: {
      current: additionalCurrent,
      limit: additionalLimit,
      remaining: options.remainingAdditionalSites,
      can_create: options.canCreateAdditionalSite,
    },
    remaining_additional_sites: options.remainingAdditionalSites,
    can_create_profile: options.canCreateProfile,
    can_create_additional_site: options.canCreateAdditionalSite,
    capabilities: {},
    can_create:
      options.canCreateProfile || options.canCreateAdditionalSite,
  };
}
