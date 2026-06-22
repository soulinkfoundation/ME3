<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import Button from "../components/Button.vue";
import PageLoading from "../components/PageLoading.vue";
import UiIcon from "../components/UiIcon.vue";
import WorkspaceTabs from "../components/WorkspaceTabs.vue";
import { API_BASE, api } from "../api";
import { useAppToast } from "../composables/useAppToast";
import { useInboxDraftCount } from "../composables/useInboxDraftCount";
import { useAuthStore } from "../stores/auth";
import { useContactsStore, type Contact } from "../stores/contacts";
import type { UiIconName } from "../utils/icons";
import { decodeMimeHeaderValue } from "../../../../shared/email-headers";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Email | ME3",
    description: "Review email and assistant chat with your ME3 assistant.",
    robots: "noindex,follow",
  },
});

type MessageStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "sent"
  | "failed"
  | "received"
  | "forwarded"
  | "dropped";

type MailboxAttachment = {
  filename?: string | null;
  mimeType?: string | null;
  disposition?: "attachment" | "inline" | null;
  size?: number | null;
  storageKey?: string | null;
  sourceMessageId?: string | null;
};

type MailboxAttachmentUploadResponse = {
  attachments: MailboxAttachment[];
};

type MailboxUnsubscribeAction = {
  available: true;
  mode: "one_click" | "link" | "mailto";
};

type MailboxUnsubscribeResponse =
  | { ok: true; mode: "one_click"; status: number }
  | { ok: true; mode: "open"; url: string };

type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  kind: "email" | "draft" | "system";
  status: MessageStatus;
  threadKey: string | null;
  fromAddress: string | null;
  fromName: string | null;
  toAddress: string | null;
  subject: string;
  body: string;
  htmlBody?: string | null;
  preview: string;
  folder?: "inbox" | "drafts" | "sent" | "archive" | "trash";
  readAt?: string | null;
  unread?: boolean;
  agentSummary?: string | null;
  agentLabels?: string[];
  metadata: {
    attachmentCount?: number;
    attachments?: MailboxAttachment[];
    category?: string;
    contactId?: string;
    contactName?: string;
    contactRelationship?: string;
    dueAt?: string | null;
    lastInteractionAt?: string | null;
    source?: string;
    classification?: {
      category?: string;
      confidence?: number;
      reason?: string;
      needsAttention?: boolean;
      dailyReview?: "needs_attention" | "handled_quietly";
      suggestedRule?: {
        kind?: string;
        label?: string;
        status?: "suggested" | "accepted" | "dismissed";
      };
    };
  } | null;
  unsubscribeAction?: MailboxUnsubscribeAction | null;
  createdBy: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

type MessagesResponse = {
  messages: InboxMessage[];
  total: number;
  limit: number;
  offset: number;
};

type MailboxSource = {
  id: string;
  type: "me3_alias" | "custom_domain" | "external_forward";
  address: string;
  status: "pending" | "active" | "paused" | "failed";
  inboundEnabled: boolean;
  outboundEnabled: boolean;
};

type FullMailboxResponse = {
  mailbox: {
    aliasAddress: string;
    status?: "pending_setup" | "active" | "paused";
    forwardingStatus?: "pending" | "verified";
  } | null;
  sources: MailboxSource[];
};

type EmailProviderSettingsResponse = {
  activeProviderId: string;
  providers: Array<{
    id: string;
    configured: boolean;
    config: {
      fromAddress: string;
    };
  }>;
};

type TelegramStatusResponse = {
  available: boolean;
  configured: boolean;
  botUsername: string | null;
  startUrl: string | null;
  connection: {
    status: "pending" | "active" | "disconnected";
    telegramUsername: string | null;
  } | null;
  recentEvents: unknown[];
};

type AgentTurn = {
  id: string;
  channel: "telegram" | "sandbox" | "soulink";
  status: "pending" | "running" | "completed" | "failed";
  inputText: string | null;
  outputText: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type AgentTurnsResponse = {
  turns: AgentTurn[];
  total?: number;
  limit?: number;
  offset?: number;
};

type ClearTelegramHistoryResponse = {
  ok: boolean;
  deletedTurns: number;
  deletedEvents: number;
};

type EmailTab = "inbox" | "drafts" | "sent" | "archive" | "trash";
type Tab = EmailTab | "telegram";

type TelegramChatBubble = {
  id: string;
  role: "user" | "agent";
  text: string;
  at: string;
  errorNote?: string;
};

const loading = ref(false);
const error = ref("");
const messages = ref<InboxMessage[]>([]);
const total = ref(0);
const activeTab = ref<Tab>("inbox");
const folderCounts = ref<Record<EmailTab, number | null>>({
  inbox: null,
  drafts: null,
  sent: null,
  archive: null,
  trash: null,
});
const mailboxAddress = ref<string | null>(null);
const expandedId = ref<string | null>(null);
const mobileThreadOpen = ref(false);
const searchQuery = ref("");
const actionPending = ref<string | null>(null);
const deletePending = ref<string | null>(null);
const unsubscribePending = ref<string | null>(null);
const bulkActionPending = ref(false);
const selectedMessageIds = ref<Set<string>>(new Set());
const emailFrameHeights = ref<Record<string, number>>({});
const emailFrameObservers = new WeakMap<HTMLIFrameElement, ResizeObserver>();
const activeEmailFrameObservers = new Set<ResizeObserver>();
const composeOpen = ref(false);
const composeSending = ref(false);
const composeError = ref("");
const composeMode = ref<"new" | "reply" | "forward" | "edit">("new");
const composeDraftId = ref<string | null>(null);
const composeReplyToMessageId = ref<string | null>(null);
const composePreservedAttachmentKeys = ref<string[]>([]);
const composePreservedAttachments = ref<MailboxAttachment[]>([]);
const composeUploadedAttachments = ref<MailboxAttachment[]>([]);
const composeUploadingAttachments = ref(false);
const composeToFocused = ref(false);
const composeToHasTyped = ref(false);
const composeToActiveIndex = ref(0);
const composeForm = ref({
  fromAddress: "",
  to: "",
  subject: "",
  textBody: "",
});
const offset = ref(0);
const limit = 50;
const TELEGRAM_PAGE_LIMIT = 50;
const {
  loadInboxDraftCount,
  refreshInboxDraftCount,
  setInboxDraftCount,
} =
  useInboxDraftCount();
const { toastFromUnknown, toastSuccess } = useAppToast();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const contactsStore = useContactsStore();
const { contacts } = storeToRefs(contactsStore);

const mailboxMeta = ref<FullMailboxResponse["mailbox"] | null>(null);
const mailboxSources = ref<MailboxSource[]>([]);
const configuredEmailAddress = ref<string | null>(null);
const telegramHealth = ref<{
  configured: boolean;
  connectionStatus: "pending" | "active" | "disconnected" | null;
} | null>(null);

const telegramLoading = ref(false);
const telegramLoadingMore = ref(false);
const telegramClearing = ref(false);
const telegramError = ref("");
const telegramMoreError = ref("");
const telegramNotice = ref("");
const turns = ref<AgentTurn[]>([]);
const telegramTotal = ref(0);

function isInternalMailboxAddress(address: string | null | undefined) {
  return Boolean(address?.trim().toLowerCase().endsWith("@me3.local"));
}

function isPublicEmailAddress(
  address: string | null | undefined,
): address is string {
  const normalized = address?.trim().toLowerCase() || "";
  return Boolean(
    normalized &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) &&
      !isInternalMailboxAddress(normalized),
  );
}

const visibleMailboxAddress = computed(() => {
  const activeSource = mailboxSources.value.find(
    (source) =>
      source.status === "active" &&
      source.inboundEnabled &&
      !isInternalMailboxAddress(source.address),
  );
  if (activeSource) return activeSource.address;
  const configuredAddress = configuredEmailAddress.value;
  if (isPublicEmailAddress(configuredAddress)) {
    return configuredAddress;
  }
  const aliasAddress = mailboxAddress.value;
  return isPublicEmailAddress(aliasAddress) ? aliasAddress : null;
});

const outboundSenderOptions = computed(() => {
  const options: Array<{ address: string; label: string }> = [];
  const aliasAddress =
    configuredEmailAddress.value || mailboxMeta.value?.aliasAddress || mailboxAddress.value;

  if (isPublicEmailAddress(aliasAddress)) {
    const address = aliasAddress.trim().toLowerCase();
    options.push({ address, label: address });
  }

  for (const source of mailboxSources.value) {
    if (
      source.status === "active" &&
      source.outboundEnabled &&
      !isInternalMailboxAddress(source.address) &&
      !options.some((option) => option.address === source.address)
    ) {
      options.push({ address: source.address, label: source.address });
    }
  }

  return options;
});
const telegramChatRef = ref<HTMLElement | null>(null);

const contactRecipientOptions = computed(() =>
  contacts.value
    .filter((contact) => Boolean(contact.email?.trim()))
    .map((contact) => ({
      id: contact.id,
      name: contact.name.trim() || contact.email?.trim() || "Unnamed contact",
      email: contact.email?.trim() || "",
      search: `${contact.name} ${contact.email || ""}`.toLowerCase(),
    })),
);

const composeRecipientSuggestions = computed(() => {
  if (!composeToFocused.value || !composeToHasTyped.value) return [];
  const query = composeForm.value.to.trim().toLowerCase();
  if (!query) return [];
  return contactRecipientOptions.value
    .filter((contact) => contact.search.includes(query))
    .slice(0, 8);
});

const showComposeRecipientSuggestions = computed(
  () => composeRecipientSuggestions.value.length > 0,
);

const emailTabConfig: Record<
  EmailTab,
  {
    label: string;
    folderParam: "inbox" | "drafts" | "sent" | "archive" | "trash";
    statusParam?: string;
    directionParam: "outbound" | "all";
  }
> = {
  inbox: {
    label: "Inbox",
    folderParam: "inbox",
    directionParam: "all",
  },
  drafts: {
    label: "Drafts",
    folderParam: "drafts",
    statusParam: "pending_approval",
    directionParam: "outbound",
  },
  sent: {
    label: "Sent",
    folderParam: "sent",
    statusParam: "sent,approved",
    directionParam: "outbound",
  },
  archive: {
    label: "Archive",
    folderParam: "archive",
    directionParam: "all",
  },
  trash: {
    label: "Trash",
    folderParam: "trash",
    directionParam: "all",
  },
};

const emailTabOrder: EmailTab[] = [
  "inbox",
  "drafts",
  "sent",
  "archive",
  "trash",
];
const emailTabIcons: Record<EmailTab, UiIconName> = {
  inbox: "Inbox",
  drafts: "FileText",
  sent: "Send",
  archive: "Archive",
  trash: "Trash2",
};
const mailFolderTabs = computed(() => {
  const tabs: Array<{
    id: Tab | "contacts";
    label: string;
    icon: UiIconName;
    count?: number | null;
    ariaLabel?: string;
  }> = emailTabOrder.map((key) => ({
    id: key,
    label: emailTabConfig[key].label,
    icon: emailTabIcons[key],
    count: getVisibleFolderCount(key),
    ariaLabel: emailTabConfig[key].label,
  }));
  tabs.push({
    id: "contacts",
    label: "Contacts",
    icon: "UsersRound",
    count: contacts.value.length > 0 ? contacts.value.length : null,
    ariaLabel: "Contacts",
  });
  return tabs;
});

function isEmailTab(tab: Tab | "contacts"): tab is EmailTab {
  return tab !== "telegram" && tab !== "contacts";
}

/** Show setup hint in empty states (not the top status strip). */
const mailNeedsSetupHint = computed(() => {
  if (!mailboxMeta.value && !visibleMailboxAddress.value) return true;
  const s = mailboxMeta.value?.status;
  return s === "pending_setup" || !visibleMailboxAddress.value;
});

const telegramNeedsSetupHint = computed(() => {
  if (!telegramHealth.value) return false;
  if (!telegramHealth.value.configured) return true;
  return telegramHealth.value.connectionStatus !== "active";
});

const telegramConversation = computed((): TelegramChatBubble[] => {
  const items: TelegramChatBubble[] = [];
  const sorted = [...turns.value].sort(
    (a, b) => parseApiDate(a.createdAt).getTime() - parseApiDate(b.createdAt).getTime(),
  );
  for (const turn of sorted) {
    if (turn.inputText?.trim()) {
      items.push({
        id: `${turn.id}-in`,
        role: "user",
        text: turn.inputText.trim(),
        at: turn.createdAt,
      });
    }
    if (turn.outputText?.trim()) {
      items.push({
        id: `${turn.id}-out`,
        role: "agent",
        text: turn.outputText.trim(),
        at: turn.updatedAt || turn.createdAt,
        errorNote:
          turn.status === "failed"
            ? "This reply may not have been delivered."
            : undefined,
      });
    } else if (turn.status === "failed") {
      items.push({
        id: `${turn.id}-fail`,
        role: "agent",
        text: "This reply could not be completed.",
        at: turn.updatedAt || turn.createdAt,
        errorNote: "Something went wrong. Try again in a moment.",
      });
    }
  }
  return items;
});

const telegramHasMore = computed(
  () => telegramTotal.value > 0 && turns.value.length < telegramTotal.value,
);

const messageIdsOnPage = computed(() =>
  messages.value.map((message) => message.id),
);
const hasMessagesOnPage = computed(() => messageIdsOnPage.value.length > 0);
const inboxBusy = computed(
  () =>
    Boolean(actionPending.value) ||
    Boolean(deletePending.value) ||
    Boolean(unsubscribePending.value) ||
    bulkActionPending.value,
);
const selectedMessages = computed(() =>
  messages.value.filter((message) => selectedMessageIds.value.has(message.id)),
);
const selectedMessageCount = computed(() => selectedMessages.value.length);
const allMessagesOnPageSelected = computed(
  () =>
    hasMessagesOnPage.value &&
    messageIdsOnPage.value.every((id) => selectedMessageIds.value.has(id)),
);
const someMessagesOnPageSelected = computed(() =>
  messageIdsOnPage.value.some((id) => selectedMessageIds.value.has(id)),
);
const followUpDraftCount = computed(
  () =>
    messages.value.filter(
      (message) =>
        message.status === "pending_approval" && isLikelyFollowUpDraft(message),
    ).length,
);
const selectedMessage = computed(() => {
  if (expandedId.value) {
    const selected = messages.value.find(
      (message) => message.id === expandedId.value,
    );
    if (selected) return selected;
  }
  return null;
});
const selectedThreadMessages = computed(() => {
  const selected = selectedMessage.value;
  if (!selected) return [];
  if (!selected.threadKey) return [selected];
  return messages.value.filter(
    (message) => message.threadKey === selected.threadKey,
  );
});

function parseApiDate(value: string): Date {
  const trimmed = value.trim();
  const sqliteUtcPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const normalized = sqliteUtcPattern.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  return new Date(normalized);
}

function formatDateTimePart(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    const { timeZone: _timeZone, ...fallbackOptions } = options;
    return new Intl.DateTimeFormat(undefined, fallbackOptions).format(date);
  }
}

function getDateOrdinal(date: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function getCalendarDayDiff(date: Date, now: Date, timeZone?: string): number {
  try {
    return getDateOrdinal(now, timeZone) - getDateOrdinal(date, timeZone);
  } catch {
    return getDateOrdinal(now) - getDateOrdinal(date);
  }
}
const selectedThreadIsUnread = computed(() =>
  selectedThreadMessages.value.some((message) => message.unread),
);

function buildFolderCountUrl(tab: EmailTab): string {
  const config = emailTabConfig[tab];
  const params = new URLSearchParams();
  params.set("folder", config.folderParam);
  if (config.statusParam) params.set("status", config.statusParam);
  params.set("direction", config.directionParam);
  if (tab === "inbox") {
    params.set("unread", "1");
  }
  params.set("limit", "0");
  return `/mailbox/messages?${params.toString()}`;
}

function getFolderCount(tab: EmailTab): number | null {
  if (activeTab.value === tab) return total.value;
  return folderCounts.value[tab];
}

function getVisibleFolderCount(tab: EmailTab): number | null {
  if (tab === "sent" || tab === "archive" || tab === "trash") return null;
  const count = getFolderCount(tab);
  if (count === null || count <= 0) return null;
  return count;
}

function setFolderCount(tab: EmailTab, count: number | null) {
  folderCounts.value = {
    ...folderCounts.value,
    [tab]: count,
  };
  if (tab === "drafts") {
    setInboxDraftCount(count);
  }
}

async function loadFolderCounts() {
  if (!isEmailTab(activeTab.value)) return;
  const entries = await Promise.all(
    emailTabOrder.map(async (tab) => {
      try {
        const data = await api.get<MessagesResponse>(buildFolderCountUrl(tab));
        return [tab, data.total] as const;
      } catch {
        return [tab, null] as const;
      }
    }),
  );
  const next = entries.reduce<Record<EmailTab, number | null>>(
    (acc, [tab, count]) => {
      acc[tab] = count;
      return acc;
    },
    { ...folderCounts.value },
  );
  folderCounts.value = next;
  setInboxDraftCount(next.drafts);
}

function normalizeEmail(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function getRelatedContact(message: InboxMessage): Contact | null {
  if (message.metadata?.contactId) {
    const byId = contacts.value.find(
      (contact) => contact.id === message.metadata?.contactId,
    );
    if (byId) return byId;
  }
  const targetEmail = normalizeEmail(
    message.direction === "inbound" ? message.fromAddress : message.toAddress,
  );
  if (!targetEmail) return null;
  return (
    contacts.value.find(
      (contact) => normalizeEmail(contact.email) === targetEmail,
    ) || null
  );
}

function isContactDueForFollowUp(contact: Contact | null): boolean {
  if (!contact || !contact.nextFollowupAt || contact.status === "archived") {
    return false;
  }
  const nextFollowup = new Date(contact.nextFollowupAt);
  return (
    !Number.isNaN(nextFollowup.getTime()) &&
    nextFollowup.getTime() <= Date.now()
  );
}

function isLikelyFollowUpDraft(message: InboxMessage): boolean {
  if (message.metadata?.category === "rolodex_follow_up") {
    return true;
  }

  return (
    message.direction === "outbound" &&
    message.status === "pending_approval" &&
    isContactDueForFollowUp(getRelatedContact(message))
  );
}

function getCounterpartyAddress(message: InboxMessage): string {
  if (message.direction === "inbound") {
    return (
      getDisplayText(message.fromName) || getDisplayText(message.fromAddress) || "—"
    );
  }
  return getDisplayText(message.toAddress) || "—";
}

function formatSenderValue(message: InboxMessage): string {
  const fromName = getDisplayText(message.fromName);
  const fromAddress = getDisplayText(message.fromAddress);
  if (fromName && fromAddress) {
    return `${fromName} <${fromAddress}>`;
  }
  return fromAddress || fromName || "—";
}

function formatRecipientValue(message: InboxMessage): string {
  return getDisplayText(message.toAddress) || "—";
}

function getMessageSubject(message: InboxMessage): string {
  return getDisplayText(message.subject) || "(no subject)";
}

function syncSelectedMessages(nextMessages: InboxMessage[]) {
  if (
    expandedId.value &&
    !nextMessages.some((message) => message.id === expandedId.value)
  ) {
    expandedId.value = null;
  }
  const nextIds = new Set(nextMessages.map((message) => message.id));
  selectedMessageIds.value = new Set(
    [...selectedMessageIds.value].filter((id) => nextIds.has(id)),
  );
}

function isDesktopMailLayout(): boolean {
  return window.matchMedia("(min-width: 641px)").matches;
}

function selectFirstMessageOnDesktop() {
  if (expandedId.value || !messages.value.length || !isDesktopMailLayout()) return;
  expandedId.value = messages.value[0].id;
  mobileThreadOpen.value = false;
}

function getMessageAttachments(message: InboxMessage): MailboxAttachment[] {
  return (message.metadata?.attachments || []).filter(
    (attachment) =>
      attachment &&
      typeof attachment === "object" &&
      Boolean(attachment.filename || attachment.mimeType || attachment.size),
  );
}

function formatAttachmentName(
  attachment: MailboxAttachment,
  index: number,
): string {
  return attachment.filename?.trim() || `Attachment ${index + 1}`;
}

function formatAttachmentSize(size: number | null | undefined): string {
  if (!size || size < 1) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function getAttachmentDownloadUrl(message: InboxMessage, index: number): string {
  return `${API_BASE}/mailbox/messages/${encodeURIComponent(
    message.id,
  )}/attachments/${index}`;
}

function getForwardableAttachments(message: InboxMessage): MailboxAttachment[] {
  return getMessageAttachments(message).filter((attachment) =>
    Boolean(attachment.storageKey),
  );
}

const composeVisibleAttachments = computed(() => [
  ...composePreservedAttachments.value,
  ...composeUploadedAttachments.value,
]);

function clearSelectedMessages() {
  selectedMessageIds.value = new Set();
}

function setAllMessagesOnPageSelected(selected: boolean) {
  selectedMessageIds.value = selected
    ? new Set(messageIdsOnPage.value)
    : new Set();
}

function toggleMessageSelected(id: string, selected: boolean) {
  const next = new Set(selectedMessageIds.value);
  if (selected) {
    next.add(id);
  } else {
    next.delete(id);
  }
  selectedMessageIds.value = next;
}

async function runDraftAction(id: string, action: "approve" | "reject") {
  await api.post(`/mailbox/drafts/${id}/${action}`);
}

function removeMessageLocally(id: string) {
  const removed = messages.value.some((message) => message.id === id);
  messages.value = messages.value.filter((message) => message.id !== id);
  if (removed) {
    total.value = Math.max(0, total.value - 1);
  }
  syncSelectedMessages(messages.value);
}

async function loadMessages() {
  if (!isEmailTab(activeTab.value)) return;
  const tab = activeTab.value;
  loading.value = true;
  error.value = "";
  mobileThreadOpen.value = false;
  try {
    const config = emailTabConfig[tab];
    const params = new URLSearchParams();
    params.set("folder", config.folderParam);
    if (config.statusParam) params.set("status", config.statusParam);
    params.set("direction", config.directionParam);
    if (searchQuery.value.trim()) params.set("q", searchQuery.value.trim());
    params.set("limit", String(limit));
    params.set("offset", String(offset.value));
    const data = await api.get<MessagesResponse>(
      `/mailbox/messages?${params.toString()}`,
    );
    messages.value = data.messages;
    total.value = data.total;
    setFolderCount(tab, data.total);
    syncSelectedMessages(data.messages);
    selectFirstMessageOnDesktop();
    void markVisibleThreadRead();
  } catch (err) {
    if (
      err instanceof Error &&
      "status" in err &&
      (err as any).status === 403
    ) {
      error.value = "pro_required";
    } else {
      error.value =
        err instanceof Error ? err.message : "Failed to load messages";
    }
  } finally {
    loading.value = false;
  }
}

async function applySearch() {
  offset.value = 0;
  expandedId.value = null;
  mobileThreadOpen.value = false;
  clearSelectedMessages();
  await loadMessages();
}

async function applyMobileSearch() {
  await applySearch();
}

function updateMessageLocally(id: string, patch: Partial<InboxMessage>) {
  messages.value = messages.value.map((message) =>
    message.id === id ? { ...message, ...patch } : message,
  );
}

async function markVisibleThreadRead() {
  const unread = selectedThreadMessages.value.filter(
    (message) => message.unread,
  );
  if (unread.length === 0) return;

  const readAt = new Date().toISOString();
  for (const message of unread) {
    updateMessageLocally(message.id, {
      readAt,
      unread: false,
    });
  }

  await Promise.allSettled(
    unread.map((message) =>
      api.post(`/mailbox/messages/${message.id}/read`, { read: true }),
    ),
  );
}

async function loadChannelHealth() {
  try {
    const [mailboxData, telegramData, providerData] = await Promise.all([
      api.get<FullMailboxResponse>("/mailbox"),
      api.get<TelegramStatusResponse>("/telegram/status"),
      api
        .get<EmailProviderSettingsResponse>("/email-provider-settings")
        .catch(() => null),
    ]);
    mailboxAddress.value = mailboxData.mailbox?.aliasAddress || null;
    mailboxMeta.value = mailboxData.mailbox ?? null;
    mailboxSources.value = mailboxData.sources || [];
    const activeProvider = providerData?.providers.find(
      (provider) => provider.id === providerData.activeProviderId,
    );
    const activeFromAddress = activeProvider?.config.fromAddress || "";
    configuredEmailAddress.value = isPublicEmailAddress(activeFromAddress)
      ? activeFromAddress.trim().toLowerCase()
      : null;
    telegramHealth.value = {
      configured: telegramData.configured,
      connectionStatus: telegramData.connection?.status ?? null,
    };
  } catch {
    mailboxAddress.value = null;
    mailboxMeta.value = null;
    mailboxSources.value = [];
    configuredEmailAddress.value = null;
    telegramHealth.value = null;
  }
}

function scrollTelegramToBottom() {
  const el = telegramChatRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

async function loadTelegramHistory() {
  telegramLoading.value = true;
  telegramLoadingMore.value = false;
  telegramError.value = "";
  telegramMoreError.value = "";
  telegramNotice.value = "";
  try {
    await loadChannelHealth();
    const turnResponse = await api.get<AgentTurnsResponse>(
      `/agent/turns?channel=telegram&limit=${TELEGRAM_PAGE_LIMIT}&offset=0`,
    );
    turns.value = turnResponse.turns || [];
    telegramTotal.value =
      typeof turnResponse.total === "number"
        ? turnResponse.total
        : turns.value.length;
    await nextTick();
    scrollTelegramToBottom();
  } catch (err) {
    turns.value = [];
    telegramTotal.value = 0;
    telegramError.value =
      err instanceof Error ? err.message : "Failed to load Telegram";
  } finally {
    telegramLoading.value = false;
  }
}

async function loadMoreTelegramTurns() {
  if (
    telegramLoading.value ||
    telegramLoadingMore.value ||
    telegramClearing.value ||
    !telegramHasMore.value
  ) {
    return;
  }
  const el = telegramChatRef.value;
  const prevScrollHeight = el?.scrollHeight ?? 0;
  const prevScrollTop = el?.scrollTop ?? 0;

  telegramLoadingMore.value = true;
  telegramMoreError.value = "";
  try {
    const nextOffset = turns.value.length;
    const turnResponse = await api.get<AgentTurnsResponse>(
      `/agent/turns?channel=telegram&limit=${TELEGRAM_PAGE_LIMIT}&offset=${nextOffset}`,
    );
    if (typeof turnResponse.total === "number") {
      telegramTotal.value = turnResponse.total;
    }
    const batch = turnResponse.turns || [];
    const seen = new Set(turns.value.map((t) => t.id));
    const merged = batch.filter((t) => !seen.has(t.id));
    turns.value = [...turns.value, ...merged];
    await nextTick();
    if (el && prevScrollHeight > 0) {
      el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
    }
  } catch (err) {
    telegramMoreError.value =
      err instanceof Error ? err.message : "Failed to load older messages";
  } finally {
    telegramLoadingMore.value = false;
  }
}

async function clearTelegramHistory() {
  if (telegramClearing.value || turns.value.length === 0) return;
  const confirmed = window.confirm(
    "Clear all stored Telegram history for this account? This will not disconnect Telegram.",
  );
  if (!confirmed) return;

  telegramClearing.value = true;
  telegramError.value = "";
  telegramMoreError.value = "";
  telegramNotice.value = "";

  try {
    const result = await api.delete<ClearTelegramHistoryResponse>(
      "/agent/turns?channel=telegram",
    );
    turns.value = [];
    telegramTotal.value = 0;
    telegramNotice.value =
      result.deletedTurns > 0 || result.deletedEvents > 0
        ? "Telegram history cleared."
        : "Telegram history was already empty.";
  } catch (err) {
    telegramMoreError.value =
      err instanceof Error ? err.message : "Failed to clear Telegram history";
  } finally {
    telegramClearing.value = false;
  }
}

function switchTab(tab: Tab) {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  offset.value = 0;
  expandedId.value = null;
  mobileThreadOpen.value = false;
  clearSelectedMessages();
  error.value = "";
  telegramError.value = "";
  telegramMoreError.value = "";
  telegramNotice.value = "";
  if (tab === "telegram") {
    void loadTelegramHistory();
  } else {
    void loadMessages();
  }
}

function switchMailFolderTab(tabId: string) {
  if (tabId === "contacts") {
    void router.push("/contacts");
    return;
  }
  if (emailTabOrder.includes(tabId as EmailTab)) {
    if (activeTab.value === tabId) return;
    void router.replace({
      path: "/email",
      query: tabId === "inbox" ? {} : { tab: tabId },
    });
    switchTab(tabId as Tab);
  }
}

async function refreshMessagesPage() {
  if (activeTab.value === "telegram") {
    await loadTelegramHistory();
  } else {
    await loadChannelHealth();
    await loadMessages();
  }
  await refreshInboxDraftCount();
  await loadFolderCounts();
  await contactsStore.fetchContacts();
}

function selectMessage(id: string) {
  expandedId.value = id;
  mobileThreadOpen.value = true;
  void markVisibleThreadRead();
}

async function approveMessage(msg: InboxMessage) {
  if (inboxBusy.value) return;
  actionPending.value = msg.id;
  error.value = "";
  const previousMessages = messages.value;
  const previousTotal = total.value;
  removeMessageLocally(msg.id);
  try {
    await runDraftAction(msg.id, "approve");
    await refreshInboxDraftCount();
    await loadFolderCounts();
  } catch (err) {
    messages.value = previousMessages;
    total.value = previousTotal;
    syncSelectedMessages(previousMessages);
    error.value = err instanceof Error ? err.message : "Failed to approve";
  } finally {
    actionPending.value = null;
  }
}

async function rejectMessage(msg: InboxMessage) {
  if (inboxBusy.value) return;
  actionPending.value = msg.id;
  error.value = "";
  const previousMessages = messages.value;
  const previousTotal = total.value;
  removeMessageLocally(msg.id);
  try {
    await runDraftAction(msg.id, "reject");
    await refreshInboxDraftCount();
    await loadFolderCounts();
  } catch (err) {
    messages.value = previousMessages;
    total.value = previousTotal;
    syncSelectedMessages(previousMessages);
    error.value = err instanceof Error ? err.message : "Failed to reject";
  } finally {
    actionPending.value = null;
  }
}

async function moveMessage(
  msg: InboxMessage,
  folder: "inbox" | "archive" | "trash",
) {
  if (inboxBusy.value) return;
  deletePending.value = msg.id;
  error.value = "";
  const previousMessages = messages.value;
  const previousTotal = total.value;
  const targetIsCurrentTab =
    activeTab.value !== "telegram" &&
    emailTabConfig[activeTab.value].folderParam === folder;
  const readAt =
    folder === "archive" || folder === "trash"
      ? msg.readAt || new Date().toISOString()
      : msg.readAt;

  messages.value = targetIsCurrentTab
    ? messages.value.map((message) =>
        message.id === msg.id
          ? { ...message, folder, readAt, unread: false }
          : message,
      )
    : messages.value.filter((message) => message.id !== msg.id);
  if (!targetIsCurrentTab) {
    total.value = Math.max(0, total.value - 1);
    if (expandedId.value === msg.id) {
      expandedId.value = null;
      mobileThreadOpen.value = false;
    }
  }
  syncSelectedMessages(messages.value);

  try {
    await api.post(`/mailbox/messages/${msg.id}/move`, { folder });
    void refreshInboxDraftCount();
    void loadFolderCounts();
  } catch (err) {
    messages.value = previousMessages;
    total.value = previousTotal;
    syncSelectedMessages(previousMessages);
    error.value = err instanceof Error ? err.message : "Failed to move message";
  } finally {
    deletePending.value = null;
  }
}

async function moveSelectedMessages(folder: "inbox" | "archive" | "trash") {
  if (inboxBusy.value || selectedMessages.value.length === 0) return;
  bulkActionPending.value = true;
  error.value = "";
  const previousMessages = messages.value;
  const previousTotal = total.value;
  const ids = new Set(selectedMessages.value.map((message) => message.id));
  const targetIsCurrentTab =
    activeTab.value !== "telegram" &&
    emailTabConfig[activeTab.value].folderParam === folder;
  const readAt = new Date().toISOString();

  messages.value = targetIsCurrentTab
    ? messages.value.map((message) =>
        ids.has(message.id)
          ? {
              ...message,
              folder,
              readAt:
                folder === "archive" || folder === "trash"
                  ? message.readAt || readAt
                  : message.readAt,
              unread:
                folder === "archive" || folder === "trash"
                  ? false
                  : message.unread,
            }
          : message,
      )
    : messages.value.filter((message) => !ids.has(message.id));
  if (!targetIsCurrentTab) {
    total.value = Math.max(0, total.value - ids.size);
  }
  clearSelectedMessages();
  syncSelectedMessages(messages.value);

  try {
    await Promise.all(
      [...ids].map((id) =>
        api.post(`/mailbox/messages/${id}/move`, { folder }),
      ),
    );
    void refreshInboxDraftCount();
    void loadFolderCounts();
  } catch (err) {
    messages.value = previousMessages;
    total.value = previousTotal;
    syncSelectedMessages(previousMessages);
    error.value =
      err instanceof Error ? err.message : "Failed to move selected messages";
  } finally {
    bulkActionPending.value = false;
  }
}

async function deleteSelectedMessagesPermanently() {
  if (inboxBusy.value || selectedMessages.value.length === 0) return;
  const confirmed = window.confirm(
    `Permanently delete ${selectedMessages.value.length} selected ${
      selectedMessages.value.length === 1 ? "message" : "messages"
    }?`,
  );
  if (!confirmed) return;

  bulkActionPending.value = true;
  error.value = "";
  const previousMessages = messages.value;
  const previousTotal = total.value;
  const ids = new Set(selectedMessages.value.map((message) => message.id));
  messages.value = messages.value.filter((message) => !ids.has(message.id));
  total.value = Math.max(0, total.value - ids.size);
  clearSelectedMessages();
  syncSelectedMessages(messages.value);

  try {
    await Promise.all(
      [...ids].map((id) => api.delete(`/mailbox/messages/${id}`)),
    );
    void refreshInboxDraftCount();
    void loadFolderCounts();
  } catch (err) {
    messages.value = previousMessages;
    total.value = previousTotal;
    syncSelectedMessages(previousMessages);
    error.value =
      err instanceof Error
        ? err.message
        : "Failed to delete selected messages";
  } finally {
    bulkActionPending.value = false;
  }
}

async function markMessageRead(msg: InboxMessage, read = true) {
  if (inboxBusy.value) return;
  actionPending.value = msg.id;
  error.value = "";
  const readAt = read ? msg.readAt || new Date().toISOString() : null;
  updateMessageLocally(msg.id, {
    readAt,
    unread: msg.direction === "inbound" && !read,
  });
  try {
    await api.post(`/mailbox/messages/${msg.id}/read`, { read });
  } catch (err) {
    updateMessageLocally(msg.id, {
      readAt: msg.readAt,
      unread: msg.unread,
    });
    error.value =
      err instanceof Error ? err.message : "Failed to update read state";
  } finally {
    actionPending.value = null;
  }
}

async function unsubscribeFromMessage(message: InboxMessage) {
  if (!message.unsubscribeAction || inboxBusy.value) return;
  unsubscribePending.value = message.id;
  error.value = "";
  try {
    const response = await api.post<MailboxUnsubscribeResponse>(
      `/mailbox/messages/${message.id}/unsubscribe`,
    );
    if (response.mode === "open") {
      window.open(response.url, "_blank", "noopener,noreferrer");
      toastSuccess("Opened unsubscribe link.");
    } else {
      toastSuccess("Unsubscribe request sent.");
    }
  } catch (err) {
    toastFromUnknown(err, "Failed to unsubscribe from this sender");
  } finally {
    unsubscribePending.value = null;
  }
}

function getDisplayText(value: string | null | undefined): string {
  if (!value) return "";
  return repairLikelyMojibake(decodeMimeHeaderValue(value));
}

function getMessagePreview(message: InboxMessage): string {
  return getDisplayText(message.preview || message.body);
}

function getMessageTextBody(message: InboxMessage): string {
  return getDisplayText(message.body || message.preview);
}

function openComposeModal(
  message?: InboxMessage,
  mode: "reply" | "forward" = "reply",
) {
  composeError.value = "";
  composeDraftId.value = null;
  composeReplyToMessageId.value = null;
  composePreservedAttachmentKeys.value = [];
  composePreservedAttachments.value = [];
  composeUploadedAttachments.value = [];
  composeUploadingAttachments.value = false;
  composeToFocused.value = false;
  composeToHasTyped.value = false;
  composeToActiveIndex.value = 0;
  const defaultFromAddress =
    outboundSenderOptions.value.find(
      (option) => option.address === message?.toAddress,
    )?.address ||
    outboundSenderOptions.value.find(
      (option) => option.address === message?.fromAddress,
    )?.address ||
    outboundSenderOptions.value[0]?.address ||
    "";

  if (message) {
    if (message.status === "pending_approval") {
      composeMode.value = "edit";
      composeDraftId.value = message.id;
      const existingAttachments = getForwardableAttachments(message);
      composePreservedAttachments.value = existingAttachments;
      composePreservedAttachmentKeys.value = existingAttachments
        .map((attachment) => attachment.storageKey?.trim() || "")
        .filter(Boolean);
      composeForm.value = {
        fromAddress: message.fromAddress || defaultFromAddress,
        to: message.toAddress || "",
        subject: getMessageSubject(message),
        textBody: getMessageTextBody(message),
      };
      composeOpen.value = true;
      void nextTick(() => {
        document.getElementById("compose-to")?.focus();
      });
      return;
    }

    if (mode === "forward") {
      composeMode.value = "forward";
      const originalBody = getMessageTextBody(message);
      const forwardableAttachments = getForwardableAttachments(message);
      composePreservedAttachments.value = forwardableAttachments;
      composePreservedAttachmentKeys.value = forwardableAttachments
        .map((attachment) => attachment.storageKey?.trim() || "")
        .filter(Boolean);
      const forwardedLines = [
        "",
        "",
        "---------- Forwarded message ---------",
        `From: ${formatSenderValue(message)}`,
        `Date: ${formatDateTimePart(parseApiDate(message.createdAt), {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: auth.user?.timezone || undefined,
        })}`,
        `Subject: ${getMessageSubject(message)}`,
        `To: ${formatRecipientValue(message)}`,
        "",
        originalBody,
      ];
      composeForm.value = {
        fromAddress: defaultFromAddress,
        to: "",
        subject: /^fwd:\s*/i.test(getMessageSubject(message))
          ? getMessageSubject(message)
          : `Fwd: ${getMessageSubject(message)}`,
        textBody: forwardedLines.join("\n"),
      };
    } else {
      composeMode.value = "reply";
      composeReplyToMessageId.value = message.id;
      const replyTo =
        message.direction === "inbound" ? message.fromAddress : message.toAddress;
      const replyFromAddress =
        outboundSenderOptions.value.find(
          (option) => option.address === message.toAddress,
        )?.address || defaultFromAddress;
      composeForm.value = {
        fromAddress: replyFromAddress,
        to: replyTo || "",
        subject: /^(re|fwd):\s*/i.test(getMessageSubject(message))
          ? getMessageSubject(message)
          : `Re: ${getMessageSubject(message)}`,
        textBody: "",
      };
    }
  } else {
    composeMode.value = "new";
    composeForm.value = {
      fromAddress: defaultFromAddress,
      to: "",
      subject: "",
      textBody: "",
    };
  }
  composeOpen.value = true;
  void nextTick(() => {
    document.getElementById("compose-to")?.focus();
  });
}

function closeComposeModal() {
  if (composeSending.value) return;
  composeOpen.value = false;
  composeToFocused.value = false;
  composeToHasTyped.value = false;
}

function selectComposeRecipient(contact: { email: string }) {
  composeForm.value.to = contact.email;
  composeToFocused.value = false;
  composeToHasTyped.value = false;
  composeToActiveIndex.value = 0;
  void nextTick(() => {
    document.getElementById("compose-subject")?.focus();
  });
}

function handleComposeToInput() {
  composeToFocused.value = true;
  composeToHasTyped.value = true;
  composeToActiveIndex.value = 0;
}

function handleComposeToBlur() {
  window.setTimeout(() => {
    composeToFocused.value = false;
    composeToHasTyped.value = false;
  }, 120);
}

function handleComposeToKeydown(event: KeyboardEvent) {
  if (!showComposeRecipientSuggestions.value) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    composeToActiveIndex.value =
      (composeToActiveIndex.value + 1) %
      composeRecipientSuggestions.value.length;
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    composeToActiveIndex.value =
      (composeToActiveIndex.value -
        1 +
        composeRecipientSuggestions.value.length) %
      composeRecipientSuggestions.value.length;
    return;
  }
  if (event.key === "Enter") {
    const selected =
      composeRecipientSuggestions.value[composeToActiveIndex.value];
    if (selected) {
      event.preventDefault();
      selectComposeRecipient(selected);
    }
    return;
  }
  if (event.key === "Escape") {
    composeToFocused.value = false;
  }
}

async function saveDraft(sendNow = false) {
  if (composeSending.value) return;
  composeSending.value = true;
  composeError.value = "";
  try {
    const payload = {
      fromAddress: composeForm.value.fromAddress || undefined,
      to: composeForm.value.to,
      subject: composeForm.value.subject,
      textBody: composeForm.value.textBody,
      source: "user",
      replyToMessageId: composeReplyToMessageId.value || undefined,
      preservedAttachmentKeys: composePreservedAttachmentKeys.value,
      uploadedAttachments: composeUploadedAttachments.value,
    };
    const response =
      composeMode.value === "edit" && composeDraftId.value
        ? await api.put<{ draft: InboxMessage | null }>(
            `/mailbox/drafts/${composeDraftId.value}`,
            payload,
          )
        : await api.post<{ draft: InboxMessage | null }>(
            "/mailbox/drafts",
            payload,
          );
    const wasSent = sendNow && Boolean(response.draft);
    if (wasSent && response.draft) {
      await api.post(`/mailbox/drafts/${response.draft.id}/approve`);
    }
    composeOpen.value = false;
    activeTab.value = sendNow ? "inbox" : "drafts";
    offset.value = 0;
    expandedId.value = sendNow ? null : response.draft?.id || null;
    await loadMessages();
    if (!sendNow && response.draft) {
      expandedId.value = response.draft.id;
      mobileThreadOpen.value = true;
    } else if (wasSent) {
      mobileThreadOpen.value = false;
      toastSuccess("Email sent.");
    }
    await refreshInboxDraftCount();
    await loadFolderCounts();
  } catch (err) {
    composeError.value =
      err instanceof Error ? err.message : "Failed to save draft";
  } finally {
    composeSending.value = false;
  }
}

async function uploadComposeAttachments(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const files = Array.from(input?.files || []);
  if (input) input.value = "";
  if (files.length === 0 || composeUploadingAttachments.value) return;

  composeUploadingAttachments.value = true;
  composeError.value = "";
  try {
    const formData = new FormData();
    for (const file of files) {
      formData.append("attachments", file);
    }
    const response = await api.upload<MailboxAttachmentUploadResponse>(
      "/mailbox/attachments",
      formData,
    );
    composeUploadedAttachments.value = [
      ...composeUploadedAttachments.value,
      ...(response.attachments || []),
    ];
  } catch (err) {
    composeError.value =
      err instanceof Error ? err.message : "Failed to upload attachment";
  } finally {
    composeUploadingAttachments.value = false;
  }
}

function removeUploadedAttachment(index: number) {
  composeUploadedAttachments.value = composeUploadedAttachments.value.filter(
    (_, currentIndex) => currentIndex !== index,
  );
}

function getComposeTitle(): string {
  if (composeMode.value === "edit") return "Edit draft";
  if (composeMode.value === "reply") return "Reply";
  if (composeMode.value === "forward") return "Forward";
  return "Compose";
}

function getComposePrimaryDraftLabel(): string {
  if (composeMode.value === "edit") return "Save draft";
  if (composeMode.value === "forward") return "Create forward";
  if (composeMode.value === "reply") return "Create reply";
  return "Create draft";
}

function getMojibakeScore(value: string): number {
  const suspiciousMatches =
    value.match(/(?:Â|Ã.|â[\u0080-\u00ff]{1,2}|[\u0080-\u009f])/g) || [];
  const replacementMatches = value.match(/\uFFFD/g) || [];
  return suspiciousMatches.length * 4 + replacementMatches.length * 8;
}

function repairLikelyMojibake(value: string): string {
  if (!/[ÂÃâ\u0080-\u009f\uFFFD]/.test(value)) return value;
  const beforeScore = getMojibakeScore(value);
  if (beforeScore === 0) return value;

  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const afterScore = getMojibakeScore(decoded);
    return afterScore < beforeScore ? decoded : value;
  } catch {
    return value;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(
      /\b(https?:\/\/[^\s<]+)\b/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

function restoreLikelyMarkdownBreaks(value: string): string {
  return value
    .replace(/\s+(#{1,6}\s+)/g, "\n\n$1")
    .replace(/\s+(\*[^*\n]{8,}\*)\s+(?=#{1,6}\s|#\w|\*[^*]+?\*)/g, "\n\n$1\n\n")
    .replace(/\s+(\*[A-Za-z][^*]{1,40}\*)\s+/g, "\n\n$1\n\n")
    .replace(/\s+(\d+\.\s+-\s+)/g, "\n$1")
    .replace(/\s+(#\w+(?:\s+#\w+)*)\s+/g, "\n\n$1\n");
}

function renderMarkdownBody(value: string): string {
  const normalized = restoreLikelyMarkdownBreaks(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  const lines = normalized.split("\n");
  const chunks: string[] = [];
  let paragraph: string[] = [];
  let orderedList: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    chunks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!orderedList.length) return;
    chunks.push(`<ol>${orderedList.join("")}</ol>`);
    orderedList = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3) + 1;
      chunks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+-?\s*(.+)$/);
    if (ordered) {
      flushParagraph();
      orderedList.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    if (/^\*[^*]+\*$/.test(line) && line.length < 140) {
      flushParagraph();
      flushList();
      chunks.push(
        `<p><strong><em>${renderInlineMarkdown(line.slice(1, -1))}</em></strong></p>`,
      );
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return chunks.join("\n");
}

function renderMarkdownMessageDocument(body: string): string {
  return `<!doctype html>
<html>
  <head>
    <base target="_blank">
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; min-height: 100%; overflow: visible; background: #fff; color: #24262b; }
      body { font: 16px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow-wrap: anywhere; }
      p { margin: 0 0 18px; }
      h2, h3, h4 { margin: 28px 0 14px; line-height: 1.25; }
      h2 { font-size: 24px; }
      h3 { font-size: 19px; }
      h4 { font-size: 16px; }
      ol { margin: 24px 0 0 26px; padding: 0; }
      li { margin: 5px 0; }
      a { color: #1a73e8; }
      img { max-width: 100%; height: auto; }
      table { max-width: 100%; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function renderRichEmailDocument(body: string): string {
  const frameStyle = `<base target="_blank">
<style>
html, body { margin: 0; overflow: visible; background: #fff; }
img { max-width: 100%; height: auto; }
</style>`;

  if (/<html[\s>]/i.test(body)) {
    if (/<head[\s>]/i.test(body)) {
      return body.replace(/<head([^>]*)>/i, `<head$1>${frameStyle}`);
    }
    return body.replace(/<html([^>]*)>/i, `<html$1><head>${frameStyle}</head>`);
  }

  return `<!doctype html>
<html>
  <head>
    ${frameStyle}
    <meta charset="utf-8">
  </head>
  <body>${body}</body>
</html>`;
}

function renderEmailHtml(message: InboxMessage): string {
  return renderRichEmailDocument(getDisplayText(message.htmlBody));
}

function renderMarkdownEmailHtml(message: InboxMessage): string {
  return renderMarkdownMessageDocument(
    renderMarkdownBody(getMessageTextBody(message)),
  );
}

function getEmailFrameHeight(messageId: string): string {
  return `${emailFrameHeights.value[messageId] || 240}px`;
}

function resizeEmailFrame(event: Event, messageId: string) {
  const frame = event.target as HTMLIFrameElement | null;
  const doc = frame?.contentDocument;
  if (!frame || !doc) return;

  const measure = () => {
    const body = doc.body;
    const root = doc.documentElement;
    const height = Math.ceil(
      Math.max(
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
        root?.scrollHeight || 0,
        root?.offsetHeight || 0,
      ),
    );
    if (!height) return;
    emailFrameHeights.value = {
      ...emailFrameHeights.value,
      [messageId]: Math.max(120, height),
    };
  };

  measure();
  requestAnimationFrame(measure);
  window.setTimeout(measure, 250);

  emailFrameObservers.get(frame)?.disconnect();
  emailFrameObservers.delete(frame);
  const observer = new ResizeObserver(measure);
  if (doc.body) observer.observe(doc.body);
  if (doc.documentElement) observer.observe(doc.documentElement);
  emailFrameObservers.set(frame, observer);
  activeEmailFrameObservers.add(observer);

  for (const image of Array.from(doc.images)) {
    image.addEventListener("load", measure, { once: true });
    image.addEventListener("error", measure, { once: true });
  }
}

function formatRelativeDate(value: string): string {
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const timeZone = auth.user?.timezone || undefined;
  const diffDays = getCalendarDayDiff(date, new Date(), timeZone);
  if (diffDays === 0) {
    return formatDateTimePart(date, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
  }
  if (diffDays < 7) {
    return formatDateTimePart(date, {
      month: "short",
      day: "numeric",
      timeZone,
    });
  }
  return formatDateTimePart(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

/** Short relative labels for Telegram bubbles */
function formatChatRelativeTime(value: string): string {
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateTimePart(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: auth.user?.timezone || undefined,
  });
}

const totalPages = computed(() => Math.ceil(total.value / limit) || 1);
const currentPage = computed(() => Math.floor(offset.value / limit) + 1);

function prevPage() {
  if (offset.value <= 0) return;
  offset.value = Math.max(0, offset.value - limit);
  mobileThreadOpen.value = false;
  clearSelectedMessages();
  loadMessages();
}

function nextPage() {
  if (currentPage.value >= totalPages.value) return;
  offset.value += limit;
  mobileThreadOpen.value = false;
  clearSelectedMessages();
  loadMessages();
}

onMounted(() => {
  const routeTab = typeof route.query.tab === "string" ? route.query.tab : "";
  if (emailTabOrder.includes(routeTab as EmailTab)) {
    activeTab.value = routeTab as EmailTab;
  }
  void loadChannelHealth();
  void loadMessages();
  void loadInboxDraftCount();
  void loadFolderCounts();
  void contactsStore.fetchContacts();
});

onBeforeUnmount(() => {
  for (const observer of activeEmailFrameObservers) {
    observer.disconnect();
  }
  activeEmailFrameObservers.clear();
});
</script>

<template>
  <div
    class="agent-page"
    :class="{ 'agent-page--with-mobile-controls': isEmailTab(activeTab) }"
  >
    <Teleport to="#app-side-nav-mobile-page-controls">
      <form
        v-if="isEmailTab(activeTab)"
        class="mail-search mail-search--mobile-nav"
        role="search"
        @submit.prevent="applyMobileSearch"
      >
        <label
          class="mail-search__label"
          for="mail-search-input-mobile-nav"
        >
          Search mail
        </label>
        <input
          id="mail-search-input-mobile-nav"
          v-model="searchQuery"
          class="mail-search__input"
          type="search"
          placeholder="Search mail"
        />
        <Button color="ghost" shape="soft" size="compact" icon-only class="mail-mobile-icon-btn" type="submit"
          :disabled="loading"
          aria-label="Search mail"
          title="Search"
        >
          <UiIcon name="Search" :size="18" aria-hidden="true" />
        </Button>
        <Button
          color="outline"
          shape="soft"
          size="compact"
          class="mail-mobile-compose-btn"
          type="button"
          aria-label="Compose"
          @click="openComposeModal()"
        >
          <template #icon>
            <UiIcon name="SquarePen" :size="16" aria-hidden="true" />
          </template>
          Compose
        </Button>
        <Button color="ghost" shape="soft" size="compact" icon-only class="mail-mobile-icon-btn" type="button"
          :disabled="loading"
          aria-label="Refresh conversations"
          title="Refresh"
          @click="refreshMessagesPage"
        >
          <UiIcon name="RefreshCw" :size="18" aria-hidden="true" />
        </Button>
      </form>
    </Teleport>

    <main class="agent-main">
      <div v-if="error === 'pro_required'" class="state-card">
        <p><strong>Assistant email is not enabled in this Core install.</strong></p>
        <p class="state-sub">
          Configure a mailbox provider for this installation, then restart the
          worker to enable email automation.
        </p>
      </div>

      <template v-else>
        <div
          v-if="activeTab === 'drafts' && followUpDraftCount > 0"
          class="state-card state-card--info"
        >
          {{ followUpDraftCount }}
          {{ followUpDraftCount === 1 ? "draft looks" : "drafts look" }}
          like rolodex follow-ups that are due now.
        </div>

        <div
          v-if="activeTab !== 'telegram' && error && error !== 'pro_required'"
          class="state-card state-card--error"
        >
          {{ error }}
        </div>
        <div
          v-if="activeTab === 'telegram' && telegramNotice"
          class="state-card state-card--info"
        >
          {{ telegramNotice }}
        </div>

        <div
          class="inbox-panel"
          :class="{ 'inbox-panel--with-mobile-controls': isEmailTab(activeTab) }"
        >
          <template v-if="activeTab === 'telegram'">
            <PageLoading
              v-if="telegramLoading"
              compact
              class="panel-pad"
              label="Loading Telegram..."
            />
            <div
              v-else-if="telegramError"
              class="state-card state-card--error panel-pad"
            >
              {{ telegramError }}
            </div>
            <div
              v-else-if="telegramConversation.length"
              class="telegram-thread"
            >
              <div class="telegram-thread__meta">
                <p class="telegram-thread__count" role="status">
                  Showing {{ turns.length }} of {{ telegramTotal }} turn{{
                    telegramTotal === 1 ? "" : "s"
                  }}
                  <template v-if="telegramConversation.length">
                    · {{ telegramConversation.length }} message{{
                      telegramConversation.length === 1 ? "" : "s"
                    }}
                  </template>
                </p>
                <div class="telegram-thread__actions">
                  <Button color="outline" shape="soft" size="compact" type="button"
                    v-if="telegramHasMore"
                    :disabled="telegramLoadingMore || telegramClearing"
                    @click="loadMoreTelegramTurns"
                  >
                    {{
                      telegramLoadingMore
                        ? "Loading older…"
                        : "Load older messages"
                    }}
                  </Button>
                  <Button color="danger" shape="soft" size="compact" type="button"
                    :disabled="telegramClearing || telegramLoadingMore"
                    @click="clearTelegramHistory"
                  >
                    {{ telegramClearing ? "Clearing…" : "Clear history" }}
                  </Button>
                </div>
              </div>
              <p
                v-if="telegramMoreError"
                class="telegram-thread__more-error"
                role="alert"
              >
                {{ telegramMoreError }}
              </p>
              <div ref="telegramChatRef" class="telegram-chat panel-pad">
                <article
                  v-for="bubble in telegramConversation"
                  :key="bubble.id"
                  class="tg-bubble"
                  :class="`tg-bubble--${bubble.role}`"
                >
                  <div class="tg-bubble__meta">
                    <span class="tg-bubble__who">{{
                      bubble.role === "user" ? "You" : "Assistant"
                    }}</span>
                    <span class="tg-bubble__time">{{
                      formatChatRelativeTime(bubble.at)
                    }}</span>
                  </div>
                  <p class="tg-bubble__text">{{ bubble.text }}</p>
                  <p v-if="bubble.errorNote" class="tg-bubble__error">
                    {{ bubble.errorNote }}
                  </p>
                </article>
              </div>
            </div>
            <div v-else class="empty-state panel-pad">
              <p>No Telegram messages yet.</p>
              <p v-if="telegramNeedsSetupHint" class="empty-hint">
                Telegram is not connected.
                <router-link to="/account" class="empty-hint-link">
                  Configure in account settings
                </router-link>
              </p>
            </div>
          </template>

          <template v-else>
            <div
              class="mail-workspace"
              :class="{ 'mail-workspace--has-thread': selectedMessage }"
            >
              <aside class="mail-rail">
                <WorkspaceTabs
                  :tabs="mailFolderTabs"
                  :model-value="activeTab"
                  aria-label="Mailbox folders"
                  @update:model-value="switchMailFolderTab"
                  @change="switchMailFolderTab"
                />
              </aside>

              <section
                class="conversation-list"
                :class="{
                  'conversation-list--mobile-hidden': mobileThreadOpen,
                }"
                aria-label="Conversations"
              >
                <PageLoading
                  v-if="loading"
                  compact
                  class="conversation-loading"
                  label="Loading messages..."
                />

                <template v-else-if="hasMessagesOnPage">
                  <div class="bulk-mail-toolbar">
                    <label class="bulk-select">
                      <input
                        type="checkbox"
                        :checked="allMessagesOnPageSelected"
                        :aria-checked="
                          allMessagesOnPageSelected
                            ? 'true'
                            : someMessagesOnPageSelected
                              ? 'mixed'
                              : 'false'
                        "
                        :disabled="inboxBusy"
                        aria-label="Select all messages on this page"
                        @change="
                          setAllMessagesOnPageSelected(
                            ($event.target as HTMLInputElement).checked,
                          )
                        "
                      />
                      <span>{{ selectedMessageCount || "Select" }}</span>
                    </label>
                    <div
                      v-if="selectedMessageCount > 0"
                      class="bulk-mail-actions"
                    >
                      <Button color="outline" shape="soft" size="compact" type="button"
                        v-if="activeTab === 'archive' || activeTab === 'trash'"
                        :disabled="inboxBusy"
                        title="Restore selected"
                        @click="moveSelectedMessages('inbox')"
                      >
                        <UiIcon name="Inbox" :size="14" aria-hidden="true" />
                        Restore
                      </Button>
                      <Button color="outline" shape="soft" size="compact" type="button"
                        v-else
                        :disabled="inboxBusy"
                        title="Archive selected"
                        @click="moveSelectedMessages('archive')"
                      >
                        <UiIcon name="Archive" :size="14" aria-hidden="true" />
                        Archive
                      </Button>
                      <Button color="danger" shape="soft" size="compact" type="button"
                        :disabled="inboxBusy"
                        :title="
                          activeTab === 'trash'
                            ? 'Delete selected forever'
                            : 'Move selected to trash'
                        "
                        @click="
                          activeTab === 'trash'
                            ? deleteSelectedMessagesPermanently()
                            : moveSelectedMessages('trash')
                        "
                      >
                        <UiIcon name="Trash2" :size="14" aria-hidden="true" />
                        {{ activeTab === "trash" ? "Delete" : "Trash" }}
                      </Button>
                      <Button color="outline" shape="soft" size="compact" type="button"
                        :disabled="inboxBusy"
                        @click="clearSelectedMessages"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div class="conversation-scroll">
                  <article
                    v-for="message in messages"
                    :key="message.id"
                    class="conversation-item"
                    :class="{
                      'conversation-item--active':
                        selectedMessage?.id === message.id,
                      'conversation-item--unread': message.unread,
                      'conversation-item--selected':
                        selectedMessageIds.has(message.id),
                    }"
                    role="button"
                    tabindex="0"
                    @click="selectMessage(message.id)"
                    @keydown.enter.prevent="selectMessage(message.id)"
                    @keydown.space.prevent="selectMessage(message.id)"
                  >
                    <label class="conversation-select" @click.stop>
                      <input
                        type="checkbox"
                        :checked="selectedMessageIds.has(message.id)"
                        :disabled="inboxBusy"
                        :aria-label="`Select ${getMessageSubject(message)}`"
                        @click.stop
                        @keydown.space.stop
                        @change="
                          toggleMessageSelected(
                            message.id,
                            ($event.target as HTMLInputElement).checked,
                          )
                        "
                      />
                    </label>
                    <div class="conversation-item__content">
                      <div class="conversation-item__meta">
                        <strong>{{ getCounterpartyAddress(message) }}</strong>
                      </div>
                      <p class="conversation-item__summary">
                        <span class="conversation-item__subject">
                          {{ getMessageSubject(message) }}
                        </span>
                        <span class="conversation-item__separator">-</span>
                        <span
                          v-if="message.direction === 'inbound' && message.toAddress"
                          class="conversation-item__recipient"
                        >
                          To {{ message.toAddress }}
                        </span>
                        <span class="conversation-item__preview">
                          {{ getMessagePreview(message) }}
                        </span>
                      </p>
                    </div>
                    <span
                      v-if="message.status === 'pending_approval'"
                      class="thread-count"
                    >
                      Draft
                    </span>
                    <time class="conversation-item__date">
                      {{ formatRelativeDate(message.createdAt) }}
                    </time>
                  </article>
                  </div>
                </template>
                <div v-else class="empty-state empty-state--inline">
                  <div class="empty-state__stack">
                    <template v-if="activeTab === 'inbox'">
                      <p>No inbound email yet.</p>
                      <p v-if="mailNeedsSetupHint" class="empty-hint">
                        Mail needs a custom-domain address routed to this Worker.
                        <router-link to="/account" class="empty-hint-link">
                          Configure in account settings
                        </router-link>
                      </p>
                      <p v-else-if="visibleMailboxAddress" class="empty-state__sub">
                        Messages sent to {{ visibleMailboxAddress }} will appear here.
                      </p>
                      <p v-else class="empty-state__sub">
                        Messages sent to your custom-domain address will appear here.
                      </p>
                    </template>
                    <template v-else-if="activeTab === 'drafts'">
                      <p>No pending drafts.</p>
                      <p class="empty-state__sub">
                        When the assistant composes an email it will appear
                        here.
                      </p>
                    </template>
                    <template v-else-if="activeTab === 'sent'">
                      <p>No sent messages yet.</p>
                      <p class="empty-state__sub">
                        Messages you send will appear here.
                      </p>
                    </template>
                    <template v-else-if="activeTab === 'archive'">
                      <p>No archived messages yet.</p>
                      <p class="empty-state__sub">
                        Messages you archive from the thread view will appear
                        here.
                      </p>
                    </template>
                    <template v-else-if="activeTab === 'trash'">
                      <p>No trashed messages yet.</p>
                      <p class="empty-state__sub">
                        Deleted messages will appear here until they are
                        cleared.
                      </p>
                    </template>
                  </div>
                </div>

                <div
                  v-if="!loading && totalPages > 1"
                  class="pagination pagination--split"
                >
                  <div class="pagination-nav">
                    <Button color="ghost" shape="soft" size="small" icon-only type="button"
                      :disabled="currentPage <= 1"
                      @click="prevPage"
                    >
                      ◂
                    </Button>
                    <span class="page-label"
                      >{{ currentPage }} of {{ totalPages }}</span
                    >
                    <Button color="ghost" shape="soft" size="small" icon-only type="button"
                      :disabled="currentPage >= totalPages"
                      @click="nextPage"
                    >
                      ▸
                    </Button>
                  </div>
                </div>
              </section>

              <section
                v-if="selectedMessage"
                class="thread-pane"
                :class="{ 'thread-pane--mobile-open': mobileThreadOpen }"
              >
                <header class="thread-toolbar">
                  <Button
                    class="thread-back-btn"
                    color="ghost"
                    shape="soft"
                    size="compact"
                    icon-only
                    type="button"
                    title="Back"
                    aria-label="Back to message list"
                    @click="mobileThreadOpen = false"
                  >
                    <UiIcon name="ArrowLeft" :size="17" aria-hidden="true" />
                  </Button>
                  <div class="thread-actions">
                    <Button color="ghost" shape="soft" size="compact" icon-only type="button"
                      title="Reply"
                      :disabled="
                        inboxBusy ||
                        selectedMessage.status === 'pending_approval'
                      "
                      @click="openComposeModal(selectedMessage)"
                    >
                      <UiIcon name="Reply" :size="16" aria-hidden="true" />
                    </Button>
                    <Button color="ghost" shape="soft" size="compact" icon-only type="button"
                      title="Forward"
                      :disabled="
                        inboxBusy ||
                        selectedMessage.status === 'pending_approval'
                      "
                      @click="openComposeModal(selectedMessage, 'forward')"
                    >
                      <UiIcon name="Forward" :size="16" aria-hidden="true" />
                    </Button>
                    <Button color="ghost" shape="soft" size="compact" icon-only type="button"
                      v-if="
                        selectedMessage.folder === 'archive' ||
                        selectedMessage.folder === 'trash'
                      "
                      title="Restore to inbox"
                      :disabled="inboxBusy"
                      @click="moveMessage(selectedMessage, 'inbox')"
                    >
                      <UiIcon name="Inbox" :size="16" aria-hidden="true" />
                    </Button>
                    <Button color="ghost" shape="soft" size="compact" icon-only type="button"
                      v-else
                      title="Archive"
                      :disabled="inboxBusy"
                      @click="moveMessage(selectedMessage, 'archive')"
                    >
                      <UiIcon name="Archive" :size="16" aria-hidden="true" />
                    </Button>
                    <Button color="ghost" shape="soft" size="compact" icon-only type="button"
                      :title="
                        selectedThreadIsUnread ? 'Mark read' : 'Mark unread'
                      "
                      :disabled="inboxBusy"
                      @click="
                        markMessageRead(selectedMessage, selectedThreadIsUnread)
                      "
                    >
                      <UiIcon name="Mail" :size="16" aria-hidden="true" />
                    </Button>
                    <Button color="ghost" shape="soft" size="compact" icon-only type="button"
                      title="Move to trash"
                      :disabled="
                        inboxBusy || selectedMessage.folder === 'trash'
                      "
                      @click="moveMessage(selectedMessage, 'trash')"
                    >
                      <UiIcon name="Trash2" :size="16" aria-hidden="true" />
                    </Button>
                  </div>
                </header>

                <div class="thread-heading">
                  <h2>{{ getMessageSubject(selectedMessage) }}</h2>
                  <p>
                    {{ selectedThreadMessages.length }}
                    {{
                      selectedThreadMessages.length === 1
                        ? "message"
                        : "messages"
                    }}
                    in this thread
                  </p>
                </div>

                <div class="thread-scroll">
                  <article
                    v-for="message in selectedThreadMessages"
                    :key="message.id"
                    class="message-card"
                    :class="{
                      'message-card--draft':
                        message.status === 'pending_approval',
                    }"
                  >
                    <div class="message-card__avatar">
                      {{
                        getCounterpartyAddress(message)
                          .slice(0, 1)
                          .toUpperCase()
                      }}
                    </div>
                    <div class="message-card__body">
                      <div class="message-card__header">
                        <div>
                          <strong>
                            {{
                              message.status === "pending_approval"
                                ? "Draft reply"
                                : getCounterpartyAddress(message)
                            }}
                          </strong>
                          <span
                            v-if="message.status === 'pending_approval'"
                            class="status-pill"
                          >
                            Draft
                          </span>
                          <p>
                            {{
                              message.direction === "outbound" ? "To" : "From"
                            }}:
                            {{
                              message.direction === "outbound"
                                ? message.toAddress || "—"
                                : formatSenderValue(message)
                            }}
                          </p>
                          <p
                            v-if="message.direction === 'inbound'"
                            class="message-card__recipient"
                          >
                            To: {{ formatRecipientValue(message) }}
                          </p>
                        </div>
                        <div class="message-card__header-actions">
                          <span>{{ formatRelativeDate(message.createdAt) }}</span>
                          <Button color="outline" shape="soft" size="compact" type="button"
                            v-if="message.unsubscribeAction"
                            :disabled="inboxBusy"
                            @click="unsubscribeFromMessage(message)"
                          >
                            <UiIcon name="Mail" :size="13" aria-hidden="true" />
                            {{
                              unsubscribePending === message.id
                                ? "Unsubscribing..."
                                : "Unsubscribe"
                            }}
                          </Button>
                        </div>
                      </div>

                      <iframe
                        v-if="message.status !== 'pending_approval'"
                        class="message-html-frame"
                        title="Email body"
                        scrolling="no"
                        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                        :style="{ height: getEmailFrameHeight(message.id) }"
                        :srcdoc="
                          message.htmlBody
                            ? renderEmailHtml(message)
                            : renderMarkdownEmailHtml(message)
                        "
                        @load="resizeEmailFrame($event, message.id)"
                      />
                      <pre v-else class="message-body">{{
                        getMessageTextBody(message)
                      }}</pre>

                      <div
                        v-if="getMessageAttachments(message).length > 0"
                        class="message-attachments"
                      >
                        <a
                          v-for="(attachment, attachmentIndex) in getMessageAttachments(message)"
                          :key="`${message.id}-${attachmentIndex}`"
                          class="attachment-chip"
                          :href="
                            getAttachmentDownloadUrl(message, attachmentIndex)
                          "
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <UiIcon
                            name="Paperclip"
                            :size="14"
                            aria-hidden="true"
                          />
                          <span>{{
                            formatAttachmentName(
                              attachment,
                              attachmentIndex,
                            )
                          }}</span>
                          <small v-if="formatAttachmentSize(attachment.size)">
                            {{ formatAttachmentSize(attachment.size) }}
                          </small>
                        </a>
                      </div>

                      <div
                        v-if="
                          message.status === 'pending_approval' &&
                          message.folder !== 'trash'
                        "
                        class="message-card__actions"
                      >
                        <Button color="primary" shape="soft" size="compact" type="button"
                          :disabled="inboxBusy"
                          @click="approveMessage(message)"
                        >
                          <UiIcon name="Send" :size="14" aria-hidden="true" />
                          {{
                            actionPending === message.id ? "Sending…" : "Send"
                          }}
                        </Button>
                        <Button color="outline" shape="soft" size="compact" type="button"
                          :disabled="inboxBusy"
                          @click="openComposeModal(message)"
                        >
                          Edit
                        </Button>
                        <Button color="outline" shape="soft" size="compact" type="button"
                          :disabled="inboxBusy"
                          @click="rejectMessage(message)"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
              <section v-else class="thread-pane thread-pane--empty">
                <div class="empty-state empty-state--inline">
                  <div class="empty-state__stack">
                    <p>Select a conversation.</p>
                  </div>
                </div>
              </section>
            </div>
          </template>
        </div>
      </template>
    </main>

    <div
      v-if="composeOpen"
      class="compose-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-title"
      @keydown.esc="closeComposeModal"
    >
      <form class="compose-modal__card" @submit.prevent="saveDraft(false)">
        <header class="compose-modal__head">
          <h2 id="compose-title">{{ getComposeTitle() }}</h2>
          <Button color="ghost" shape="soft" size="compact" icon-only type="button"
            aria-label="Close compose"
            :disabled="composeSending"
            @click="closeComposeModal"
          >
            <UiIcon name="X" :size="16" aria-hidden="true" />
          </Button>
        </header>
        <label
          v-if="outboundSenderOptions.length > 1"
          class="compose-field"
        >
          <span>From</span>
          <select v-model="composeForm.fromAddress">
            <option
              v-for="option in outboundSenderOptions"
              :key="option.address"
              :value="option.address"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="compose-field compose-field--recipient">
          <span>To</span>
          <input
            id="compose-to"
            v-model="composeForm.to"
            type="email"
            autocomplete="email"
            required
            aria-autocomplete="list"
            aria-controls="compose-recipient-list"
            :aria-expanded="showComposeRecipientSuggestions"
            @focus="composeToFocused = true"
            @input="handleComposeToInput"
            @blur="handleComposeToBlur"
            @keydown="handleComposeToKeydown"
          />
          <div
            v-if="showComposeRecipientSuggestions"
            id="compose-recipient-list"
            class="compose-recipient-list"
            role="listbox"
          >
            <button
              v-for="(contact, index) in composeRecipientSuggestions"
              :key="contact.id"
              type="button"
              class="compose-recipient-option"
              :class="{ 'is-active': index === composeToActiveIndex }"
              role="option"
              :aria-selected="index === composeToActiveIndex"
              @mousedown.prevent="selectComposeRecipient(contact)"
            >
              <span class="compose-recipient-option__name">
                {{ contact.name }}
              </span>
              <span class="compose-recipient-option__email">
                {{ contact.email }}
              </span>
            </button>
          </div>
        </label>
        <label class="compose-field">
          <span>Subject</span>
          <input
            id="compose-subject"
            v-model="composeForm.subject"
            type="text"
            required
          />
        </label>
        <label class="compose-field compose-field--body">
          <span>Message</span>
          <textarea v-model="composeForm.textBody" rows="10" required />
        </label>
        <div class="compose-attachments">
          <div class="compose-attachments__head">
            <p>
              {{
                composeVisibleAttachments.length > 0
                  ? `${composeVisibleAttachments.length} ${
                      composeVisibleAttachments.length === 1
                        ? "attachment"
                        : "attachments"
                    }`
                  : "Attachments"
              }}
            </p>
            <label
              class="compose-attachment-upload"
              :class="{ 'is-disabled': composeUploadingAttachments }"
            >
              <UiIcon name="Paperclip" :size="14" aria-hidden="true" />
              <span>{{
                composeUploadingAttachments ? "Uploading..." : "Attach"
              }}</span>
              <input
                type="file"
                multiple
                :disabled="composeUploadingAttachments"
                @change="uploadComposeAttachments"
              />
            </label>
          </div>
          <div class="compose-attachment-list">
            <span
              v-for="(attachment, index) in composePreservedAttachments"
              :key="`${attachment.storageKey || index}`"
              class="compose-attachment-chip"
            >
              <UiIcon name="Paperclip" :size="14" aria-hidden="true" />
              <span>{{ formatAttachmentName(attachment, index) }}</span>
              <small v-if="formatAttachmentSize(attachment.size)">
                {{ formatAttachmentSize(attachment.size) }}
              </small>
            </span>
            <span
              v-for="(attachment, index) in composeUploadedAttachments"
              :key="`${attachment.storageKey || index}`"
              class="compose-attachment-chip"
            >
              <UiIcon name="Paperclip" :size="14" aria-hidden="true" />
              <span>
                {{
                  formatAttachmentName(
                    attachment,
                    index + composePreservedAttachments.length,
                  )
                }}
              </span>
              <small v-if="formatAttachmentSize(attachment.size)">
                {{ formatAttachmentSize(attachment.size) }}
              </small>
              <Button color="ghost" shape="pill" size="small" icon-only class="compose-attachment-remove" type="button"
                :aria-label="`Remove ${formatAttachmentName(attachment, index)}`"
                @click="removeUploadedAttachment(index)"
              >
                <UiIcon name="X" :size="13" aria-hidden="true" />
              </Button>
            </span>
          </div>
        </div>
        <p v-if="composeError" class="compose-error">{{ composeError }}</p>
        <footer class="compose-modal__actions">
          <Button color="outline" shape="soft" size="compact" type="button"
            :disabled="composeSending"
            @click="closeComposeModal"
          >
            Cancel
          </Button>
          <Button color="outline" shape="soft" size="compact" type="button"
            :disabled="
              composeSending ||
              !composeForm.to.trim() ||
              !composeForm.subject.trim() ||
              !composeForm.textBody.trim()
            "
            @click="saveDraft(false)"
          >
            {{
              composeSending
                ? "Saving…"
                : getComposePrimaryDraftLabel()
            }}
          </Button>
          <Button color="primary" shape="soft" size="compact" type="button"
            :disabled="
              composeSending ||
              !composeForm.to.trim() ||
              !composeForm.subject.trim() ||
              !composeForm.textBody.trim()
            "
            @click="saveDraft(true)"
          >
            <UiIcon name="Send" :size="14" aria-hidden="true" />
            {{ composeSending ? "Sending…" : "Send" }}
          </Button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.agent-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.agent-page--with-mobile-controls {
  height: calc(100vh - var(--app-shell-mobile-nav-height));
  height: calc(100dvh - var(--app-shell-mobile-nav-height));
}

.agent-main {
  margin: 0 auto;
  padding: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  width: 100%;
  max-width: none;
  overflow: hidden;
}

.panel-pad {
  padding: 18px;
}

.confirm-modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 17, 17, 0.32);
  z-index: 80;
}

.confirm-modal__card {
  width: min(100%, 420px);
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  box-shadow: 0 20px 60px rgba(17, 17, 17, 0.18);
}

.confirm-modal__title {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
}

.confirm-modal__body {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text-muted);
}

.confirm-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.telegram-thread {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.telegram-thread__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}

.telegram-thread__count {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.telegram-thread__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.telegram-load-older {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s;
}

.telegram-load-older:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-text);
}

.telegram-load-older:disabled,
.telegram-clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.telegram-clear-btn {
  padding: 6px 12px;
  border: 1px solid #b33b2e;
  border-radius: 6px;
  background: var(--color-bg);
  font-size: 12px;
  font-weight: 700;
  color: #b33b2e;
  cursor: pointer;
  transition: opacity 0.12s;
}

.telegram-clear-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.telegram-thread__more-error {
  margin: 0;
  padding: 8px 18px;
  font-size: 13px;
  color: #b33b2e;
  border-bottom: 1px solid var(--color-border);
}

.telegram-chat {
  display: grid;
  gap: 12px;
  max-height: min(70vh, 560px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.tg-bubble {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-subtle);
}

.tg-bubble--agent {
  border-left: 3px solid var(--color-text);
}

.tg-bubble--user {
  border-left: 3px solid var(--color-border);
}

.tg-bubble__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}

.tg-bubble__who {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.tg-bubble__time {
  font-size: 12px;
  color: var(--color-text-muted);
}

.tg-bubble__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.tg-bubble__error {
  margin: 10px 0 0;
  font-size: 13px;
  color: #b33b2e;
}

.empty-hint {
  margin-top: 12px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.empty-hint-link {
  margin-left: 4px;
  font-weight: 600;
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.empty-hint-link:hover {
  opacity: 0.75;
}

.empty-state__sub {
  margin-top: 8px;
  font-size: 14px;
}

/* Toolbar */
.inbox-toolbar {
  display: grid;
  grid-template-columns: auto minmax(260px, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.mail-heading {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.mail-heading h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.1;
}

.mail-heading p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.bulk-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.bulk-summary {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.bulk-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.bulk-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.bulk-link:hover:not(:disabled) {
  color: var(--color-text);
}

.bulk-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tab-bar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.mail-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px 36px;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  min-width: 0;
}

.mail-search__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.mail-search__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

.mail-search__input:focus {
  outline: 2px solid var(--color-text);
  outline-offset: 1px;
}

.mail-search--mobile-nav {
  grid-template-columns: minmax(0, 1fr) 36px auto 36px;
  width: 100%;
}

.mail-search--mobile-nav .mail-search__input {
  height: 36px;
}

.mail-search--mobile-nav .mail-mobile-icon-btn {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  margin: 0;
  padding: 0;
}

.mail-search--mobile-nav
  .mail-search__button:not(.mail-search__button--refresh) {
  border: 0;
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.mail-search--mobile-nav
  .mail-search__button:not(.mail-search__button--refresh):hover:not(:disabled) {
  border: 0;
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.mail-search--mobile-nav .mail-mobile-compose-btn {
  flex: 0 0 auto;
  gap: 6px;
  min-height: 36px;
  padding-inline: 10px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  background: var(--ui-surface, var(--color-bg));
  border-color: var(--ui-border, var(--color-border));
  color: var(--ui-text, var(--color-text));
}

.mail-search--mobile-nav .mail-mobile-compose-btn:hover:not(:disabled),
.mail-search--mobile-nav .mail-mobile-compose-btn:focus-visible {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  border-color: var(--ui-border, var(--color-border));
  color: var(--ui-text, var(--color-text));
}

.mail-search--mobile-nav .mail-mobile-compose-btn :deep(.me3-btn__icon),
.mail-search--mobile-nav .mail-mobile-compose-btn :deep(.me3-btn__label) {
  display: inline-flex;
  align-items: center;
  line-height: 1;
  color: inherit;
}

.mail-mobile-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: inherit;
  font-weight: inherit;
  cursor: pointer;
}

.mail-mobile-icon-btn:hover:not(:disabled) {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text-muted, var(--color-text-muted));
}

.mail-mobile-icon-btn:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}

.mail-search--mobile-nav .mail-search__button--refresh {
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.mail-search--mobile-nav .mail-search__button--refresh:hover:not(:disabled) {
  border-color: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.mail-search__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  width: 36px;
  padding: 0;
  border: 1px solid var(--color-accent);
  border-radius: 6px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.mail-search__button--refresh {
  border-color: var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
}

.mail-search__button--refresh:hover:not(:disabled) {
  background: transparent;
  color: var(--color-text);
  border-color: var(--color-text);
}

.mail-search__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.inbox-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s,
    border-color 0.12s;
}

.inbox-refresh-btn:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-text);
}

.inbox-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s,
    border-color 0.12s;
}

.tab-btn:hover {
  color: var(--color-text);
  border-color: var(--color-text);
}

.tab-btn--active {
  background: var(--color-text);
  color: var(--color-bg);
  border-color: var(--color-text);
}

.tab-btn--active:hover {
  color: var(--color-bg);
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--color-bg);
  color: var(--color-text);
}

.tab-btn--active .tab-count {
  background: var(--color-text-muted);
  color: var(--color-bg);
}

/* Panel */
.inbox-panel {
  border-bottom: 1px solid var(--color-border);
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  overflow: hidden;
}

.inbox-panel--with-mobile-controls {
  height: auto;
}

.mail-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.mail-rail,
.conversation-list,
.thread-pane {
  min-width: 0;
  min-height: 0;
}

.mail-rail {
  order: 1;
  position: static;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  width: 100%;
  height: auto;
  max-height: none;
  box-sizing: border-box;
  padding: 4px 8px 0;
  background: var(--color-bg);
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-padding-inline: 8px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 768px) {
  .mail-rail {
    justify-content: center;
  }
}

.mail-rail::-webkit-scrollbar {
  display: none;
}

.conversation-list.conversation-list--mobile-hidden {
  display: none;
}

.conversation-list {
  order: 2;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.thread-pane {
  order: 3;
  display: none;
  flex: 1 1 auto;
  overflow: hidden;
}

.text-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.text-btn--active,
.text-btn:hover {
  border-color: var(--color-text);
}

.mail-identity {
  margin-bottom: 18px;
  padding: 0 8px;
}

.mail-identity__label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.mail-identity strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.compose-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  margin-bottom: 16px;
  border: 1px solid var(--color-accent);
  border-radius: 6px;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.compose-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
}

.conversation-list__head {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--workspace-topbar-height);
  padding: var(--workspace-topbar-padding-block) 16px;
}

.conversation-list__head h2,
.thread-heading h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.conversation-list__head p,
.thread-heading p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  border-color: var(--color-text);
  color: var(--color-text);
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.conversation-scroll,
.thread-scroll {
  min-height: 0;
}

.conversation-scroll {
  flex: 0 0 auto;
}

.thread-scroll {
  overflow-y: auto;
}

.bulk-mail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 42px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}

.bulk-select,
.conversation-select {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-muted);
}

.conversation-select {
  justify-content: center;
  width: 36px;
  height: 36px;
  cursor: pointer;
}

.bulk-select {
  display: grid;
  grid-template-columns: 36px auto;
  column-gap: 10px;
  min-width: 82px;
  font-size: 13px;
  font-weight: 700;
}

.bulk-select input {
  justify-self: center;
}

.bulk-select input,
.conversation-select input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-text);
  cursor: pointer;
}

.bulk-select input:disabled,
.conversation-select input:disabled {
  cursor: not-allowed;
}

.bulk-mail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.bulk-mail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.bulk-mail-btn:hover:not(:disabled) {
  border-color: var(--color-text);
}

.bulk-mail-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bulk-mail-btn--danger {
  color: #b33b2e;
  border-color: #b33b2e;
}

.conversation-loading {
  flex: 1;
  min-height: 0;
}

.conversation-item {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  min-height: 58px;
  padding: 9px 14px 9px 12px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
}

.conversation-item:hover,
.conversation-item--active {
  background: var(--color-bg-subtle);
}

.conversation-item--selected {
  background: var(--color-bg-subtle);
}

.conversation-item--active {
  box-shadow: inset 3px 0 0 var(--color-text);
}

.conversation-item--unread .conversation-item__meta strong,
.conversation-item--unread .conversation-item__summary,
.conversation-item--unread .conversation-item__subject {
  font-weight: 800;
}

.conversation-item__content {
  display: block;
  min-width: 0;
}

.conversation-item__meta {
  margin-bottom: 3px;
  min-width: 0;
  font-size: 14px;
}

.conversation-item__meta strong {
  display: block;
  min-width: 0;
}

.conversation-item__meta strong,
.conversation-item__summary,
.conversation-item__recipient,
.conversation-item__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item__summary,
.conversation-item__separator,
.conversation-item__recipient,
.conversation-item__preview {
  color: var(--color-text-muted);
}

.conversation-item__summary {
  min-width: 0;
  margin: 0;
  font-size: 14px;
}

.conversation-item__subject {
  color: var(--color-text);
  font-weight: 650;
}

.conversation-item__recipient {
  margin-right: 6px;
  font-size: 13px;
}

.thread-count {
  justify-self: end;
  padding: 2px 7px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
}

.conversation-item__date {
  justify-self: end;
  align-self: start;
  min-width: 76px;
  padding-top: 2px;
  color: var(--color-text-muted);
  font-size: 13px;
  font-style: normal;
  text-align: right;
  white-space: nowrap;
}

.pagination--split {
  border-top: 1px solid var(--color-border);
  border-bottom: 0;
}

.thread-pane {
  display: none;
  flex-direction: column;
  min-height: 0;
  background: var(--color-bg);
}

.thread-pane--mobile-open {
  display: flex;
}

.thread-pane--empty {
  border-right: none;
}

.thread-pane--empty .empty-state--inline {
  width: 100%;
}

.thread-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
}

.thread-back-btn {
  align-self: flex-start;
}

.thread-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thread-heading {
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--color-border);
}

.thread-scroll {
  flex: 1;
  padding: 0 0 24px;
}

@media (min-width: 641px) {
  .mail-workspace {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
  }

  .mail-workspace--has-thread {
    grid-template-columns: minmax(320px, 42%) minmax(0, 1fr);
  }

  .mail-rail {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .conversation-list {
    grid-column: 1;
    grid-row: 2;
  }

  .mail-workspace--has-thread .conversation-list {
    border-right: 1px solid var(--color-border);
  }

  .mail-workspace--has-thread .thread-pane {
    display: flex;
    grid-column: 2;
    grid-row: 2;
    border-top: 1px solid var(--color-border);
  }

  .mail-workspace--has-thread .conversation-list.conversation-list--mobile-hidden {
    display: flex;
  }

  .thread-toolbar {
    justify-content: flex-end;
  }

  .thread-back-btn {
    display: none;
  }
}

.message-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 14px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--color-border);
}

.message-card--draft {
  box-shadow: inset 3px 0 0 var(--color-text);
}

.message-card__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  font-weight: 800;
}

.message-card__body {
  min-width: 0;
}

.message-card__header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.message-card__header p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.message-card__recipient {
  font-weight: 650;
}

.message-card__header-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

.message-card__header-actions > span {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 13px;
}

.unsubscribe-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
}

.unsubscribe-btn:hover:not(:disabled) {
  border-color: var(--ui-border-strong, var(--color-text-muted));
  color: var(--ui-text, var(--color-text));
}

.unsubscribe-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.status-pill {
  display: inline-flex;
  margin-left: 8px;
  padding: 2px 7px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.message-body {
  margin: 22px 0 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.65;
}

.message-html-frame {
  width: 100%;
  min-height: 120px;
  margin: 22px 0 0;
  border: none;
  background: #fff;
}

.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: min(100%, 360px);
  min-height: 32px;
  padding: 5px 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
}

.attachment-chip:hover {
  border-color: var(--color-text);
  background: var(--color-bg-subtle);
}

.attachment-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-chip small {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.message-card__actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.message-card__actions .action-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

/* Table */
.inbox-table-wrap {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.inbox-table {
  width: max(100%, 980px);
  min-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.inbox-table thead tr {
  border-bottom: 1px solid var(--color-border);
}

.inbox-table th {
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  white-space: nowrap;
  user-select: none;
}

.col-select,
.cell-select {
  width: 52px;
  padding-right: 0;
}

.col-sortable {
  cursor: pointer;
}

.col-sortable:hover {
  color: var(--color-text);
}

.sort-indicator {
  margin-left: 4px;
  font-size: 10px;
}

.inbox-row {
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.1s;
}

.inbox-row:last-of-type {
  border-bottom: none;
}

.inbox-row:hover {
  background: var(--color-bg-subtle);
}

.inbox-row--expanded {
  background: var(--color-bg-subtle);
}

.inbox-row--unread .cell-to,
.inbox-row--unread .cell-subject {
  font-weight: 800;
}

.inbox-row--expandable:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: -2px;
}

.inbox-row--pending .cell-to::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text);
  margin-right: 7px;
  vertical-align: middle;
  flex-shrink: 0;
}

.select-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.select-checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--color-text);
  cursor: pointer;
}

.select-checkbox:disabled {
  cursor: not-allowed;
}

.inbox-row td {
  padding: 11px 14px;
  font-size: 14px;
  vertical-align: middle;
}

.cell-to {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.cell-subject {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subject-stack {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.subject-stack > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-chip {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.message-chip--followup {
  border-color: var(--color-text);
  color: var(--color-text);
}

.cell-date {
  color: var(--color-text-muted);
  font-size: 13px;
  white-space: nowrap;
}

/* Origin badge */
.origin-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.origin--agent-draft {
  border-color: var(--color-text);
  color: var(--color-text);
}

.origin--agent-sent {
  background: var(--color-text);
  color: var(--color-bg);
  border-color: var(--color-text);
}

.origin--user-approved {
  border-color: var(--color-text-muted);
  color: var(--color-text-muted);
}

/* Status badge */
.status-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.status--pending-approval {
  border-color: var(--color-text);
  color: var(--color-text);
}

.status--sent {
  color: var(--color-text-muted);
}

.status--rejected,
.status--failed {
  color: #b33b2e;
  border-color: #b33b2e;
}

/* Detail row */
.detail-row td {
  padding: 0;
}

.detail-cell {
  background: var(--color-bg-subtle);
  border-bottom: 1px solid var(--color-border);
}

.detail-panel {
  padding: 16px 20px;
}

.detail-headers {
  display: grid;
  gap: 6px;
  margin-bottom: 0;
}

.detail-field {
  display: flex;
  gap: 10px;
  font-size: 13px;
}

.detail-label {
  flex-shrink: 0;
  width: 52px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding-top: 2px;
}

.detail-divider {
  height: 1px;
  background: var(--color-border);
  margin: 12px 0;
}

.detail-body {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--color-text);
}

.contact-context {
  display: grid;
  gap: 10px;
}

.contact-context__content {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.contact-context__title {
  font-weight: 600;
}

.contact-context__meta {
  color: var(--color-text-muted);
}

.contact-link {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.detail-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.12s;
}

.action-btn--compact {
  min-height: 36px;
  padding: 7px 14px;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn--approve {
  background: var(--color-text);
  color: var(--color-bg);
  border: 1px solid var(--color-text);
}

.action-btn--approve:not(:disabled):hover {
  opacity: 0.8;
}

.action-btn--reject {
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.action-btn--reject:not(:disabled):hover {
  color: var(--color-text);
  border-color: var(--color-text);
}

.action-btn--delete {
  background: var(--color-bg);
  color: #b33b2e;
  border: 1px solid #b33b2e;
}

.action-btn--delete:not(:disabled):hover {
  opacity: 0.8;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--color-border);
}

.pagination-nav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-muted);
}

.page-btn:not(:disabled):hover {
  color: var(--color-text);
  border-color: var(--color-text);
}

.page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.page-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.page-size {
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* States */
.state-card {
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.state-card--error {
  color: #b33b2e;
}

.state-card--info {
  color: var(--color-text);
}

.state-sub {
  margin-top: 6px;
  font-size: 14px;
}

.empty-state {
  padding: 32px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}

.empty-state--inline {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.empty-state__stack {
  width: min(100%, 340px);
  padding: 0 16px;
  box-sizing: border-box;
}

.empty-state p {
  margin: 0;
}

.empty-state p + p {
  margin-top: 8px;
}

.compose-modal {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(17, 17, 17, 0.34);
}

.compose-modal__card {
  display: grid;
  gap: 14px;
  width: min(100%, 620px);
  max-height: calc(100dvh - 40px);
  overflow: auto;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: 0 20px 60px rgba(17, 17, 17, 0.18);
}

.compose-modal__head,
.compose-modal__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.compose-modal__head h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.compose-field {
  display: grid;
  gap: 6px;
}

.compose-field--recipient {
  position: relative;
}

.compose-field span {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
}

.compose-field input,
.compose-field select,
.compose-field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

.compose-field input {
  height: 38px;
  padding: 0 10px;
}

.compose-field select {
  height: 38px;
  padding: 0 10px;
  appearance: auto;
}

.compose-field textarea {
  min-height: 220px;
  padding: 10px;
  line-height: 1.5;
  resize: vertical;
}

.compose-recipient-list {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
}

.compose-recipient-option {
  display: grid;
  width: 100%;
  gap: 2px;
  padding: 10px;
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.compose-recipient-option:last-child {
  border-bottom: 0;
}

.compose-recipient-option:hover,
.compose-recipient-option.is-active {
  background: var(--color-text);
  color: var(--color-bg);
}

.compose-recipient-option__name,
.compose-recipient-option__email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-recipient-option__name {
  font-size: 13px;
  font-weight: 700;
}

.compose-recipient-option__email {
  font-size: 12px;
  color: var(--color-text-muted);
}

.compose-recipient-option:hover .compose-recipient-option__email,
.compose-recipient-option.is-active .compose-recipient-option__email {
  color: inherit;
}

.compose-recipient-option:hover .compose-recipient-option__name,
.compose-recipient-option.is-active .compose-recipient-option__name {
  color: inherit;
}

.compose-attachments {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-subtle);
}

.compose-attachments__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.compose-attachments p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.compose-attachment-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.compose-attachment-upload:hover {
  border-color: var(--color-text);
}

.compose-attachment-upload.is-disabled {
  opacity: 0.58;
  cursor: wait;
}

.compose-attachment-upload input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.compose-attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.compose-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 650;
}

.compose-attachment-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-attachment-chip small {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 11px;
}

.compose-attachment-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: -3px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.compose-attachment-remove:hover {
  background: var(--color-bg-subtle);
  color: var(--color-text);
}

.compose-field input:focus,
.compose-field select:focus,
.compose-field textarea:focus {
  outline: 2px solid var(--color-text);
  outline-offset: 1px;
}

.compose-error {
  margin: 0;
  font-size: 13px;
  color: #b33b2e;
}

/* Mobile */
@media (max-width: 980px) {
  .inbox-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}

@media (max-width: 640px) {
  .agent-main {
    padding: 0;
  }

  .inbox-toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .mail-heading {
    display: grid;
    gap: 2px;
  }

  .inbox-panel {
    height: auto;
  }

  .conversation-list__head {
    display: none;
  }

  .conversation-scroll {
    flex: 0 0 auto;
    min-height: 0;
    max-height: none;
  }

  .bulk-mail-toolbar {
    gap: 8px;
    padding: 6px 10px 6px 8px;
  }

  .bulk-select {
    min-width: 76px;
  }

  .bulk-mail-actions {
    gap: 4px;
  }

  .bulk-mail-btn {
    min-height: 30px;
    padding: 0 7px;
    font-size: 12px;
  }

  .conversation-item {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 6px;
    min-height: 54px;
    padding: 6px 12px 6px 4px;
  }

  .conversation-select {
    justify-content: center;
    width: 44px;
    height: 44px;
  }

  .conversation-item__content {
    display: block;
    min-width: 0;
  }

  .conversation-item__meta {
    margin-bottom: 3px;
  }

  .conversation-item__date {
    display: none;
  }

  .conversation-item__meta,
  .conversation-item__summary {
    font-size: 13px;
  }

  .thread-count {
    padding: 1px 6px;
    font-size: 10px;
  }

  .thread-pane {
    height: auto;
  }

  .thread-back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .thread-toolbar {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--color-bg);
  }

  .thread-heading {
    padding: 16px 16px 12px;
  }

  .message-card {
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 10px;
    padding: 16px;
  }

  .message-card__avatar {
    width: 32px;
    height: 32px;
  }

  .message-card__header {
    display: grid;
    gap: 6px;
  }

  .thread-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .message-html-frame {
    display: block;
    max-width: 100%;
  }

  .confirm-modal {
    padding: 16px;
  }

  .confirm-modal__actions {
    flex-direction: column-reverse;
  }

  .bulk-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .bulk-controls {
    justify-content: stretch;
  }

  .inbox-table thead .col-origin,
  .inbox-table tbody .cell-origin {
    display: none;
  }

  .cell-to {
    max-width: 120px;
  }

  .detail-actions {
    flex-direction: column;
  }

  .action-btn {
    width: 100%;
    text-align: center;
  }
}

@media (min-width: 641px) and (max-width: 960px) {
  .agent-main {
    padding-left: 0;
    padding-right: 0;
  }
}
</style>
