import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmailPage from "./email.vue";
import { api } from "../api";

vi.mock("../api", () => ({
  API_BASE: "/api",
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock("../composables/useAppToast", () => ({
  useAppToast: () => ({
    toastFromUnknown: vi.fn(),
    toastSuccess: vi.fn(),
  }),
}));

const routerReplace = vi.fn();
const routerPush = vi.fn();

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { tab: "sent" } }),
  useRouter: () => ({
    replace: routerReplace,
    push: routerPush,
  }),
}));

const sentMessage = {
  id: "sent-1",
  direction: "outbound",
  kind: "email",
  status: "sent",
  threadKey: "thread-1",
  fromAddress: "hey@example.com",
  fromName: "Kieran",
  toAddress: "kim@example.com",
  subject: "ME3",
  body: "Hi Kim",
  htmlBody: null,
  preview: "Hi Kim",
  folder: "sent",
  readAt: "2026-07-03T09:00:00Z",
  unread: false,
  agentSummary: null,
  agentLabels: [],
  metadata: {},
  unsubscribeAction: null,
  createdBy: "owner",
  approvedByUserId: "owner",
  approvedAt: "2026-07-03T09:00:00Z",
  sentAt: "2026-07-03T09:00:00Z",
  createdAt: "2026-07-03T09:00:00Z",
};

function emptyContactSummary() {
  const outreach = Object.fromEntries(
    [
      "new",
      "drafted",
      "sent",
      "replied",
      "booked",
      "converted",
      "not_interested",
      "no_response",
    ].map((key) => [key, 0]),
  );
  return {
    total: 0,
    clients: 0,
    prospects: 0,
    contacts: 0,
    active: 0,
    dormant: 0,
    archived: 0,
    needsFollowUp: 0,
    outreach,
  };
}

function mailboxResponseFor(endpoint: string) {
  if (endpoint === "/mailbox") {
    return { mailbox: { aliasAddress: "hey@example.com" }, sources: [] };
  }
  if (endpoint === "/telegram/status") {
    return {
      available: true,
      configured: false,
      botUsername: null,
      startUrl: null,
      connection: null,
      recentEvents: [],
    };
  }
  if (endpoint === "/email-provider-settings") {
    return { activeProviderId: "", providers: [] };
  }
  if (endpoint === "/contacts") {
    return { contacts: [], summary: emptyContactSummary() };
  }
  if (endpoint.startsWith("/mailbox/messages?")) {
    const params = new URLSearchParams(endpoint.split("?")[1] || "");
    const limit = Number(params.get("limit") || 50);
    const folder = params.get("folder");
    const messages = folder === "sent" && limit > 0 ? [sentMessage] : [];
    return { messages, total: messages.length, limit, offset: 0 };
  }
  throw new Error(`Unexpected GET ${endpoint}`);
}

describe("EmailPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="app-side-nav-mobile-page-controls"></div>';
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(min-width: 641px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.mocked(api.get).mockImplementation(async (endpoint) =>
      mailboxResponseFor(endpoint),
    );
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    vi.mocked(api.delete).mockResolvedValue({ ok: true });
  });

  it("reveals the empty list after bulk trash removes the open message", async () => {
    const wrapper = mount(EmailPage, {
      global: {
        stubs: {
          RouterLink: true,
          WorkspaceTabs: {
            template: "<div><slot /></div>",
            props: ["items", "modelValue"],
          },
        },
      },
    });
    await flushPromises();

    await wrapper.get(".conversation-item").trigger("click");
    await wrapper.get('input[aria-label="Select ME3"]').setValue(true);
    await wrapper.get(".bulk-mail-actions .me3-btn--danger").trigger("click");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/mailbox/messages/sent-1/move", {
      folder: "trash",
    });
    expect(wrapper.get(".conversation-list").classes()).not.toContain(
      "conversation-list--mobile-hidden",
    );
    expect(wrapper.text()).toContain("No sent messages yet.");
  });
});
