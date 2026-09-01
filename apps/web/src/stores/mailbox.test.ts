import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import {
  mailboxCacheScope,
  useMailboxCacheStore,
  type MailboxListRequest,
} from "./mailbox";

vi.mock("../api", () => ({
  API_BASE: "/api",
  api: { get: vi.fn() },
}));

const inbox: MailboxListRequest = {
  folder: "inbox",
  direction: "all",
  limit: 50,
  offset: 0,
};

describe("mailbox cache", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("isolates cached folders by owner and installation scope", () => {
    const cache = useMailboxCacheStore();
    const ownerA = mailboxCacheScope("owner-a", "install-a");
    const ownerB = mailboxCacheScope("owner-b", "install-a");
    const otherInstall = mailboxCacheScope("owner-a", "install-b");
    const archive = { ...inbox, folder: "archive" };

    cache.setList(ownerA, inbox, { messages: ["inbox-a"], total: 1 });
    cache.setList(ownerA, archive, { messages: ["archive-a"], total: 1 });
    cache.setList(ownerB, inbox, { messages: ["inbox-b"], total: 1 });
    cache.setList(otherInstall, inbox, { messages: ["inbox-other"], total: 1 });

    expect(cache.getList<string>(ownerA, inbox)?.messages).toEqual(["inbox-a"]);
    expect(cache.getList<string>(ownerA, archive)?.messages).toEqual(["archive-a"]);
    expect(cache.getList<string>(ownerB, inbox)?.messages).toEqual(["inbox-b"]);
    expect(cache.getList<string>(otherInstall, inbox)?.messages).toEqual([
      "inbox-other",
    ]);
  });

  it("shares unread and draft counts and reuses a recent result", async () => {
    vi.mocked(api.get).mockImplementation(async (endpoint) => ({
      total: endpoint.includes("unread=1") ? 3 : 2,
    }));
    const mailbox = useMailboxCacheStore();

    await mailbox.loadFolderCounts();

    expect(mailbox.folderCounts).toEqual({ inbox: 3, drafts: 2 });
    expect(api.get).toHaveBeenCalledTimes(2);

    await mailbox.loadFolderCounts();
    expect(api.get).toHaveBeenCalledTimes(2);

    await mailbox.loadFolderCounts(true);
    expect(api.get).toHaveBeenCalledTimes(4);
  });
});
