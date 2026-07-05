import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SoulinkConnectPanel from "./SoulinkConnectPanel.vue";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const status = {
  available: true,
  configured: true,
  apiOrigin: "https://soulinkfoundation.org",
  runtimeCallbackUrl:
    "https://me3.example/api/agent/channels/soulink/dispatch",
  connection: null,
};

describe("SoulinkConnectPanel", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it("shows connect instead of waitlist when inline access is available", async () => {
    vi.mocked(api.get).mockResolvedValue(status);
    vi.mocked(api.post).mockResolvedValue({
      ...status,
      connection: {
        id: "soulink-1",
        channel: "soulink",
        status: "active",
        ownerNodeId: "owner-1",
        assistantNodeId: "assistant-1",
        streamChannelType: "messaging",
        streamChannelId: "chat-1",
        soulinkChatUrl: "https://soulinkfoundation.org/chats/chat-1",
        connectedAt: "2026-07-05T10:00:00Z",
        disconnectedAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        createdAt: "2026-07-05T10:00:00Z",
        updatedAt: "2026-07-05T10:00:00Z",
      },
    });

    const wrapper = mount(SoulinkConnectPanel, {
      props: { variant: "inline" },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Connect");
    expect(wrapper.text()).not.toContain("Join Waitlist");

    await wrapper.get("button").trigger("click");
    expect(api.post).toHaveBeenCalledWith("/soulink/setup", {});
  });

  it("keeps the waitlist link when inline access is unavailable", async () => {
    vi.mocked(api.get).mockResolvedValue({
      ...status,
      available: false,
    });

    const wrapper = mount(SoulinkConnectPanel, {
      props: { variant: "inline" },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Join Waitlist");
    expect(wrapper.find("a").attributes("href")).toBe(
      "https://soulinkfoundation.org",
    );
  });
});
