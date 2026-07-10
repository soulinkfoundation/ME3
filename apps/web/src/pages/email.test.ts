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
let routeTab = "sent";

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { tab: routeTab } }),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function mountEmailPage() {
  return mount(EmailPage, {
    global: {
      stubs: {
        RouterLink: true,
        WorkspaceTabs: {
          emits: ["change", "update:modelValue"],
          template:
            '<button data-folder="archive" @click="$emit(\'change\', \'archive\')"><slot /></button>',
          props: ["tabs", "modelValue"],
        },
      },
    },
  });
}

describe("EmailPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    routeTab = "sent";
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
    const wrapper = mountEmailPage();
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

  it("removes a message before its archive request completes", async () => {
    const archive = deferred<{ ok: boolean }>();
    vi.mocked(api.post).mockImplementation(() => archive.promise);
    const wrapper = mountEmailPage();
    await flushPromises();

    await wrapper.get(".conversation-item").trigger("click");
    await wrapper.get('input[aria-label="Select ME3"]').setValue(true);
    await wrapper.get(".bulk-mail-actions .me3-btn--outline").trigger("click");

    expect(api.post).toHaveBeenCalledWith("/mailbox/messages/sent-1/move", {
      folder: "archive",
    });
    expect(wrapper.text()).toContain("No sent messages yet.");

    archive.resolve({ ok: true });
    await flushPromises();
  });

  it("does not show an empty mailbox before the first list request succeeds", async () => {
    const initialList = deferred<ReturnType<typeof mailboxResponseFor>>();
    vi.mocked(api.get).mockImplementation((endpoint) => {
      if (endpoint.startsWith("/mailbox/messages?") && endpoint.includes("folder=sent")) {
        return initialList.promise;
      }
      return Promise.resolve(mailboxResponseFor(endpoint));
    });

    const wrapper = mountEmailPage();
    await flushPromises();

    expect(wrapper.text()).not.toContain("No sent messages yet.");

    initialList.resolve({ messages: [], total: 0, limit: 50, offset: 0 });
    await flushPromises();

    expect(wrapper.text()).toContain("No sent messages yet.");
  });

  it("renders a cached folder immediately while revalidating it", async () => {
    const first = mountEmailPage();
    await flushPromises();
    first.unmount();

    const revalidation = deferred<ReturnType<typeof mailboxResponseFor>>();
    vi.mocked(api.get).mockImplementation((endpoint) => {
      if (endpoint.startsWith("/mailbox/messages?") && endpoint.includes("folder=sent")) {
        return revalidation.promise;
      }
      return Promise.resolve(mailboxResponseFor(endpoint));
    });

    const second = mountEmailPage();
    await flushPromises();

    expect(second.find(".conversation-item").exists()).toBe(true);
    expect(second.text()).not.toContain("Loading messages...");

    revalidation.resolve({ messages: [sentMessage], total: 1, limit: 50, offset: 0 });
    await flushPromises();
  });

  it("keeps the current folder when an earlier request finishes late", async () => {
    const sent = deferred<ReturnType<typeof mailboxResponseFor>>();
    const archiveMessage = {
      ...sentMessage,
      id: "archive-1",
      folder: "archive",
      toAddress: "archive@example.com",
    };
    vi.mocked(api.get).mockImplementation((endpoint) => {
      if (endpoint.startsWith("/mailbox/messages?") && endpoint.includes("folder=sent")) {
        return sent.promise;
      }
      if (endpoint.startsWith("/mailbox/messages?") && endpoint.includes("folder=archive")) {
        return Promise.resolve({ messages: [archiveMessage], total: 1, limit: 50, offset: 0 });
      }
      return Promise.resolve(mailboxResponseFor(endpoint));
    });

    const wrapper = mountEmailPage();
    await wrapper.get('[data-folder="archive"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("archive@example.com");
    sent.resolve({ messages: [sentMessage], total: 1, limit: 50, offset: 0 });
    await flushPromises();

    expect(wrapper.text()).toContain("archive@example.com");
    expect(wrapper.text()).not.toContain("kim@example.com");
  });

  it("restores a message if an optimistic trash request fails", async () => {
    const post = deferred<{ ok: boolean }>();
    vi.mocked(api.post).mockImplementation(() => post.promise);
    const wrapper = mountEmailPage();
    await flushPromises();

    await wrapper.get(".conversation-item").trigger("click");
    await wrapper.get('input[aria-label="Select ME3"]').setValue(true);
    await wrapper.get(".bulk-mail-actions .me3-btn--danger").trigger("click");

    expect(wrapper.text()).toContain("No sent messages yet.");
    post.reject(new Error("Trash failed"));
    await flushPromises();

    expect(wrapper.find(".conversation-item").exists()).toBe(true);
    expect(wrapper.text()).toContain("Trash failed");
  });
});
