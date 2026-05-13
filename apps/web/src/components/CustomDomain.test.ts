import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import CustomDomain from "./CustomDomain.vue";
import { useSitesStore } from "../stores/sites";

vi.mock("../stores/sites", () => ({
  useSitesStore: vi.fn(),
}));

const sitesStore = {
  getDomainStatus: vi.fn(),
  connectDomain: vi.fn(),
  disconnectDomain: vi.fn(),
  refreshDomainStatus: vi.fn(),
  error: null as string | null,
};

describe("CustomDomain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sitesStore.error = null;
    vi.mocked(useSitesStore).mockReturnValue(
      sitesStore as unknown as ReturnType<typeof useSitesStore>,
    );
    sitesStore.getDomainStatus.mockResolvedValue({
      connected: false,
    });
  });

  it("loads domain status on mount without emitting a change event", async () => {
    const wrapper = mount(CustomDomain, {
      props: {
        username: "testuser",
        showSettingsLink: false,
      },
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });

    await flushPromises();

    expect(sitesStore.getDomainStatus).toHaveBeenCalledWith("testuser");
    expect(wrapper.emitted("domainStatusChanged")).toBeUndefined();
  });

  it("emits a change event after connecting a domain", async () => {
    sitesStore.connectDomain.mockResolvedValue({
      ok: true,
      domain: "www.example.com",
      status: "pending",
    });

    const wrapper = mount(CustomDomain, {
      props: {
        username: "testuser",
        showSettingsLink: false,
      },
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    });
    await flushPromises();

    await wrapper.get(".domain-actions .button.primary").trigger("click");
    await wrapper.get("input.domain-input").setValue("www.example.com");
    await wrapper.get(".input-row .button.primary").trigger("click");
    await flushPromises();

    expect(sitesStore.connectDomain).toHaveBeenCalledWith("testuser", "www.example.com");
    expect(wrapper.emitted("domainStatusChanged")).toHaveLength(1);
  });
});
