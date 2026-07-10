import { defineStore } from "pinia";
import { ref } from "vue";
import { API_BASE } from "../api";

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

  return { getList, setList };
});
