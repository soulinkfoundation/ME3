import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useMailboxCacheStore } from "../stores/mailbox";

export function useInboxDraftCount() {
  const mailbox = useMailboxCacheStore();
  const { folderCounts, loadingFolderCounts } = storeToRefs(mailbox);
  const draftCount = computed(() => folderCounts.value.drafts);

  return {
    draftCount,
    loadingDraftCount: loadingFolderCounts,
    loadInboxDraftCount: (force = false) => mailbox.loadFolderCounts(force),
    refreshInboxDraftCount: () => mailbox.loadFolderCounts(true),
    setInboxDraftCount: (nextCount: number | null) =>
      mailbox.setFolderCount("drafts", nextCount),
  };
}
