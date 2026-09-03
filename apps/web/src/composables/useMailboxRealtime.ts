import { onBeforeUnmount, watch } from "vue";
import {
  api,
  type MailboxEventHandlers,
  type MailboxEventSubscription,
} from "../api";
import { useAuthStore } from "../stores/auth";
import { mailboxCacheScope, useMailboxCacheStore } from "../stores/mailbox";

export function useMailboxRealtime(): void {
  const auth = useAuthStore();
  const mailbox = useMailboxCacheStore();
  let subscription: MailboxEventSubscription | null = null;

  const close = () => {
    subscription?.close();
    subscription = null;
  };

  const stopOwnerWatch = watch(
    () => auth.user?.id || null,
    (ownerId) => {
      close();
      if (!ownerId) return;

      const refresh = () => {
        if (auth.user?.id !== ownerId) return;
        mailbox.invalidateFolder(mailboxCacheScope(ownerId), "inbox");
        void mailbox.loadFolderCounts(true);
      };
      const handlers: MailboxEventHandlers = {
        onMessageReceived: refresh,
        onReconnect: refresh,
      };
      subscription = api.subscribeMailboxEvents(handlers);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stopOwnerWatch();
    close();
  });
}
