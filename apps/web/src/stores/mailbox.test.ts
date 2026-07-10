import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import {
  mailboxCacheScope,
  useMailboxCacheStore,
  type MailboxListRequest,
} from "./mailbox";

const inbox: MailboxListRequest = {
  folder: "inbox",
  direction: "all",
  limit: 50,
  offset: 0,
};

describe("mailbox cache", () => {
  beforeEach(() => setActivePinia(createPinia()));

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
});
