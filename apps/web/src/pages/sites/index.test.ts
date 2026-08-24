import { defineComponent } from "vue";
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

vi.mock("../../utils/publicSiteUrl", () => ({
  resolvePublicProfileUrl: vi.fn(async (username: string) => `/preview/${username}`),
}));

const ConfirmationDialogStub = defineComponent({
  name: "ConfirmationDialog",
  props: {
    open: Boolean,
    message: String,
  },
  emits: ["cancel", "confirm"],
  template: `
    <div v-if="open" data-test="confirmation-dialog">
      <p>{{ message }}</p>
      <button data-test="confirm-delete" @click="$emit('confirm')">Confirm</button>
    </div>
  `,
});

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
    expect(findButton(wrapper, "Add site")).toBeUndefined();
    expect(
      wrapper.findAll("a").some((link) => link.attributes("href") === "/sites/studio"),
    ).toBe(true);
  });

  it("lists the profile and additional sites with role-appropriate actions", async () => {
    const profile = siteRecord("owner", "profile", "2026-08-20T10:00:00.000Z");
    const additional = siteRecord("studio", "organization");
    const wrapper = await mountDashboard(
      [profile, additional],
      quotaResponse({
        canCreateProfile: false,
        canCreateAdditionalSite: true,
        remainingAdditionalSites: 1,
      }),
    );

    expect(wrapper.text()).toContain("ME3 Profile");
    expect(wrapper.text()).toContain("@owner");
    expect(wrapper.text()).toContain("@studio");
    expect(findButton(wrapper, "Add site")).toBeTruthy();

    const cards = wrapper.findAll("article.site-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].text()).toContain("Edit");
    expect(cards[0].text()).toContain("Rename");
    expect(cards[0].text()).toContain("Domain");
    expect(cards[0].text()).toContain("View");
    expect(cards[0].text()).toContain("Unpublish");
    expect(cards[0].text()).not.toContain("Delete");
    expect(cards[1].text()).toContain("Publish");
    expect(cards[1].text()).toContain("Delete");

    const siteLinks = wrapper
      .findAll("a")
      .map((link) => link.attributes("href"))
      .filter((href) => href?.startsWith("/sites/"));
    expect(siteLinks).toContain("/sites/owner");
    expect(siteLinks).toContain("/sites/studio");
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

    expect(findButton(wrapper, "Add site")).toBeUndefined();
    expect(wrapper.text()).toContain(
      "You have used all 1 additional site slots on your current plan.",
    );
  });

  it("requires confirmation before deleting an additional site", async () => {
    const additional = siteRecord("studio", "organization");
    const sites = useSitesStore();
    sites.sites = [additional];
    sites.fetchSites = vi.fn(async () => undefined) as never;
    sites.fetchSitePages = vi.fn(async () => []) as never;
    sites.getSiteQuota = vi.fn(async () =>
      quotaResponse({
        canCreateProfile: true,
        canCreateAdditionalSite: false,
        remainingAdditionalSites: 1,
      }),
    ) as never;
    sites.deleteSite = vi.fn(async (username: string) => {
      sites.sites = sites.sites.filter((site) => site.username !== username);
      return true;
    }) as never;

    const wrapper = mount(SitesPage, mountOptions(router));
    await flushPromises();
    await findButton(wrapper, "Delete")!.trigger("click");

    expect(sites.deleteSite).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="confirmation-dialog"]').text()).toContain(
      "Delete @studio?",
    );

    await wrapper.get('[data-test="confirm-delete"]').trigger("click");
    await flushPromises();

    expect(sites.deleteSite).toHaveBeenCalledWith("studio");
    expect(wrapper.find('[data-test="confirmation-dialog"]').exists()).toBe(false);
  });

  async function mountDashboard(records: Site[], siteQuota: SiteQuota) {
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
        ConfirmationDialog: ConfirmationDialogStub,
      },
    },
  };
}

function findButton(
  wrapper: ReturnType<typeof mount>,
  label: string,
) {
  return wrapper
    .findAll("button, a")
    .find((candidate) => candidate.text().trim() === label);
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
