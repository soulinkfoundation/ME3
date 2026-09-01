import { defineStore } from "pinia";
import { ref } from "vue";
import { API_BASE, api } from "../api";

export type MailboxFolderCountKey = "inbox" | "drafts";

export type MailboxFolderCounts = Record<MailboxFolderCountKey, number | null>;

type MailboxCountResponse = {
  total: number;
};

const FOLDER_COUNT_CACHE_MS = 30_000;

const folderCountUrls: Record<MailboxFolderCountKey, string> = {
  inbox: "/mailbox/messages?folder=inbox&direction=all&unread=1&limit=0",
  drafts:
    "/mailbox/messages?folder=drafts&status=pending_approval%2Cfailed%2Capproved&direction=outbound&limit=0",
};

export type MailboxListRequest = {
  folder: string;
  status?: string;
  direction: string;
  search?: string;
  limit: number;
  offset: number;
};

export type MailboxListCacheEntry<T> = {
  messages: T[];
  total: number;
  updatedAt: number;
};

function installationId(): string {
  return `${typeof window === "undefined" ? "server" : window.location.origin}${API_BASE}`;
}

export function mailboxCacheScope(
  ownerId: string | null | undefined,
  install = installationId(),
): string {
  return `${install}:${ownerId || "anonymous"}`;
}

export function mailboxListCacheKey(
  scope: string,
  request: MailboxListRequest,
): string {
  return JSON.stringify([scope, request]);
}

export const useMailboxCacheStore = defineStore("mailboxCache", () => {
  const lists = ref<Record<string, MailboxListCacheEntry<unknown>>>({});
  const folderCounts = ref<MailboxFolderCounts>({
    inbox: null,
    drafts: null,
  });
  const loadingFolderCounts = ref(false);
  let folderCountsLoadedAt = 0;
  let pendingFolderCounts: Promise<void> | null = null;

  function getList<T>(
    scope: string,
    request: MailboxListRequest,
  ): MailboxListCacheEntry<T> | null {
    const entry = lists.value[mailboxListCacheKey(scope, request)] as
      | MailboxListCacheEntry<T>
      | undefined;
    return entry ? { ...entry, messages: [...entry.messages] } : null;
  }

  function setList<T>(
    scope: string,
    request: MailboxListRequest,
    entry: Omit<MailboxListCacheEntry<T>, "updatedAt">,
  ) {
    lists.value = {
      ...lists.value,
      [mailboxListCacheKey(scope, request)]: {
        ...entry,
        messages: [...entry.messages],
        updatedAt: Date.now(),
      },
    };
  }

  async function loadFolderCounts(force = false): Promise<void> {
    if (pendingFolderCounts) return pendingFolderCounts;
    if (
      !force &&
      folderCountsLoadedAt > 0 &&
      Date.now() - folderCountsLoadedAt < FOLDER_COUNT_CACHE_MS
    ) {
      return;
    }

    loadingFolderCounts.value = true;
    pendingFolderCounts = (async () => {
      const entries = await Promise.all(
        (Object.keys(folderCountUrls) as MailboxFolderCountKey[]).map(
          async (folder) => {
            try {
              const response = await api.get<MailboxCountResponse>(
                folderCountUrls[folder],
              );
              return [folder, Math.max(0, response.total)] as const;
            } catch {
              return [folder, null] as const;
            }
          },
        ),
      );

      folderCounts.value = entries.reduce<MailboxFolderCounts>(
        (counts, [folder, count]) => {
          counts[folder] = count;
          return counts;
        },
        { ...folderCounts.value },
      );
      folderCountsLoadedAt = Date.now();
    })().finally(() => {
      loadingFolderCounts.value = false;
      pendingFolderCounts = null;
    });

    return pendingFolderCounts;
  }

  function setFolderCount(
    folder: MailboxFolderCountKey,
    count: number | null,
  ): void {
    folderCounts.value = {
      ...folderCounts.value,
      [folder]: count === null ? null : Math.max(0, count),
    };
    folderCountsLoadedAt = Date.now();
  }

  return {
    folderCounts,
    loadingFolderCounts,
    getList,
    setList,
    loadFolderCounts,
    setFolderCount,
  };
});
