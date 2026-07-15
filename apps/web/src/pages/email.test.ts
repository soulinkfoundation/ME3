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
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

const toastApi = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../composables/useAppToast", () => ({
  useAppToast: () => ({
    toastFromUnknown: vi.fn(),
    toastSuccess: vi.fn(),
    toast: toastApi,
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
  if (endpoint === "/mailbox" || endpoint === "/mailbox?include_activity=0") {
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
    vi.mocked(api.put).mockResolvedValue({ ok: true });
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
    expect(wrapper.text()).toContain(
      "1 message could not be moved. The folder was refreshed.",
    );
  });

  it("reconciles the folder after a partially successful bulk move", async () => {
    const first = { ...sentMessage, id: "sent-1", subject: "First" };
    const second = { ...sentMessage, id: "sent-2", subject: "Second" };
    let serverMessages = [first, second];
    vi.mocked(api.get).mockImplementation(async (endpoint) => {
      if (endpoint.startsWith("/mailbox/messages?")) {
        const params = new URLSearchParams(endpoint.split("?")[1] || "");
        const visible =
          params.get("folder") === "sent" &&
          Number(params.get("limit") || 50) > 0
            ? serverMessages
            : [];
        return {
          messages: visible,
          total: visible.length,
          limit: Number(params.get("limit") || 50),
          offset: 0,
        };
      }
      return mailboxResponseFor(endpoint);
    });
    vi.mocked(api.post).mockImplementation(async (endpoint) => {
      if (endpoint === "/mailbox/messages/sent-1/move") {
        serverMessages = [second];
        return { ok: true };
      }
      if (endpoint === "/mailbox/messages/sent-2/move") {
        throw new Error("Move failed");
      }
      return { ok: true };
    });

    const wrapper = mountEmailPage();
    await flushPromises();
    await wrapper
      .get('input[aria-label="Select all messages on this page"]')
      .setValue(true);
    await wrapper.get(".bulk-mail-actions .me3-btn--outline").trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("First");
    expect(wrapper.text()).toContain("Second");
    expect(wrapper.text()).toContain(
      "1 message could not be moved. The folder was refreshed.",
    );
    expect(toastApi.success).toHaveBeenCalledWith(
      "Message archived.",
      expect.objectContaining({ action: expect.any(Object) }),
    );
  });

  it("marks unread mail only after the user explicitly opens it", async () => {
    routeTab = "inbox";
    const unreadMessage = {
      ...sentMessage,
      id: "inbox-1",
      direction: "inbound",
      status: "received",
      folder: "inbox",
      fromAddress: "kim@example.com",
      toAddress: "hey@example.com",
      readAt: null,
      unread: true,
    };
    vi.mocked(api.get).mockImplementation(async (endpoint) => {
      if (endpoint.startsWith("/mailbox/messages?")) {
        const params = new URLSearchParams(endpoint.split("?")[1] || "");
        const showMessage =
          params.get("folder") === "inbox" &&
          Number(params.get("limit") || 50) > 0;
        return {
          messages: showMessage ? [unreadMessage] : [],
          total: showMessage ? 1 : 0,
          limit: Number(params.get("limit") || 50),
          offset: 0,
        };
      }
      return mailboxResponseFor(endpoint);
    });

    const wrapper = mountEmailPage();
    await flushPromises();

    expect(api.post).not.toHaveBeenCalledWith(
      "/mailbox/messages/inbox-1/read",
      { read: true },
    );

    await wrapper.get(".conversation-open").trigger("click");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/mailbox/messages/inbox-1/read", {
      read: true,
    });
  });

  it("keeps and reuses a saved draft when sending fails", async () => {
    let approvalAttempts = 0;
    const draft = {
      ...sentMessage,
      id: "draft-1",
      kind: "draft",
      status: "pending_approval",
      folder: "drafts",
      sentAt: null,
    };
    vi.mocked(api.post).mockImplementation(async (endpoint) => {
      if (endpoint === "/mailbox/drafts") return { draft };
      if (endpoint === "/mailbox/drafts/draft-1/approve") {
        approvalAttempts += 1;
        if (approvalAttempts === 1) throw new Error("Provider unavailable");
        return { ok: true };
      }
      return { ok: true };
    });
    vi.mocked(api.put).mockResolvedValue({ draft });
    mountEmailPage();
    await flushPromises();

    (document.querySelector(".mail-mobile-compose-btn") as HTMLElement).click();
    await flushPromises();

    const setValue = (selector: string, value: string) => {
      const input = document.querySelector(selector) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setValue("#compose-to", "kim@example.com");
    setValue("#compose-subject", "Hello");
    setValue(".compose-field--body textarea", "Hi Kim");
    await flushPromises();

    (
      document.querySelector(
        ".compose-modal__actions .me3-btn--primary",
      ) as HTMLElement
    ).click();
    await flushPromises();

    expect(document.body.textContent).toContain(
      "Draft saved, but sending failed. Provider unavailable",
    );

    (
      document.querySelector(
        ".compose-modal__actions .me3-btn--primary",
      ) as HTMLElement
    ).click();
    await flushPromises();

    expect(
      vi.mocked(api.post).mock.calls.filter(
        ([endpoint]) => endpoint === "/mailbox/drafts",
      ),
    ).toHaveLength(1);
    expect(api.put).not.toHaveBeenCalled();
    expect(approvalAttempts).toBe(2);
  });

  it("keeps an in-flight draft visible without exposing conflicting actions", async () => {
    routeTab = "drafts";
    const sendingDraft = {
      ...sentMessage,
      id: "draft-sending",
      kind: "draft",
      status: "approved",
      folder: "drafts",
      sentAt: null,
    };
    vi.mocked(api.get).mockImplementation(async (endpoint) => {
      if (endpoint.startsWith("/mailbox/messages?")) {
        const params = new URLSearchParams(endpoint.split("?")[1] || "");
        const showMessage =
          params.get("folder") === "drafts" &&
          params.get("status")?.includes("approved") &&
          Number(params.get("limit") || 50) > 0;
        return {
          messages: showMessage ? [sendingDraft] : [],
          total: showMessage ? 1 : 0,
          limit: Number(params.get("limit") || 50),
          offset: 0,
        };
      }
      return mailboxResponseFor(endpoint);
    });

    const wrapper = mountEmailPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Sending");
    await wrapper.get(".conversation-open").trigger("click");
    await flushPromises();
    expect(wrapper.find(".message-card__actions").exists()).toBe(false);
    expect(wrapper.get('button[aria-label="Archive"]').attributes("disabled")).toBeDefined();
  });

  it("blocks remote email content until the user allows it", async () => {
    const richMessage = {
      ...sentMessage,
      htmlBody: '<p>Hello</p><img src="https://tracker.example/pixel.png">',
    };
    vi.mocked(api.get).mockImplementation(async (endpoint) => {
      if (endpoint.startsWith("/mailbox/messages?")) {
        const params = new URLSearchParams(endpoint.split("?")[1] || "");
        const showMessage =
          params.get("folder") === "sent" &&
          Number(params.get("limit") || 50) > 0;
        return {
          messages: showMessage ? [richMessage] : [],
          total: showMessage ? 1 : 0,
          limit: Number(params.get("limit") || 50),
          offset: 0,
        };
      }
      return mailboxResponseFor(endpoint);
    });
    const wrapper = mountEmailPage();
    await flushPromises();
    await wrapper.get(".conversation-open").trigger("click");
    await flushPromises();

    const frame = wrapper.get(".message-html-frame")
      .element as HTMLIFrameElement;
    expect(frame.srcdoc).toContain("img-src data: blob:");
    expect(wrapper.text()).toContain(
      "External content is blocked for your privacy.",
    );

    await wrapper.get(".external-content-notice button").trigger("click");
    await flushPromises();

    expect(frame.srcdoc).toContain("img-src https: http: data: blob:");
  });
});
