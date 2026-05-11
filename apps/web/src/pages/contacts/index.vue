<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import Button from "../../components/Button.vue";
import UiIcon from "../../components/UiIcon.vue";
import type { UiIconName } from "../../utils/icons";
import { api } from "../../api";
import {
  useContactsStore,
  type Contact,
  type ContactCloseness,
  type ContactInput,
  type ContactOutreachMeta,
  type ContactRelationship,
  type ContactSource,
  type ContactStatus,
  type OutreachChannel,
  type OutreachStatus,
} from "../../stores/contacts";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Contacts | ME3",
    description:
      "Track contacts, prospects, clients, and follow-ups in one place.",
    robots: "noindex,follow",
  },
});

type Tab =
  | "contacts"
  | "prospects"
  | "clients"
  | "needs_follow_up"
  | "archive"
  | "all";
type ProspectFilter = "all" | OutreachStatus;
type SortId =
  | "name"
  | "email"
  | "relationship"
  | "closeness"
  | "source"
  | "lastInteractionAt"
  | "nextFollowupAt"
  | "status"
  | "niche"
  | "website"
  | "fit"
  | "channel"
  | "outreachStatus"
  | "lastActivity";

type SortState = {
  id: SortId;
  desc: boolean;
};

const CONTACT_TABS: Array<{ value: Tab; label: string }> = [
  { value: "contacts", label: "Contacts" },
  { value: "clients", label: "Clients" },
  { value: "prospects", label: "Prospects" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "archive", label: "Archive" },
  { value: "all", label: "All" },
];

type ContactFormState = {
  name: string;
  email: string;
  phone: string;
  relationship: ContactRelationship;
  closeness: ContactCloseness;
  status: ContactStatus;
  notes: string;
  lastInteractionAt: string;
  nextFollowupAt: string;
  instagram: string;
  linkedin: string;
  x: string;
};

type OutreachMessage = {
  id: string;
  contactId: string;
  channel: OutreachChannel;
  messageType: "initial" | "follow_up";
  sequenceNumber: number;
  draftSubject: string | null;
  draftContent: string;
  finalSubject: string | null;
  finalContent: string | null;
  status: "draft" | "approved" | "sent" | "failed";
  agentModel: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type GeneratedOutreachTaskType =
  | "outreach_initial"
  | "outreach_follow_up"
  | "outreach_after_reply";

type DraftComposer = {
  channel: OutreachChannel;
  subject: string;
  body: string;
  agentModel: string | null;
  generatedTaskType: GeneratedOutreachTaskType | null;
};

type Column = {
  id: SortId;
  label: string;
  align?: "left" | "center";
  sortable?: boolean;
};

const PROSPECT_FILTERS: Array<{ value: ProspectFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "drafted", label: "Drafted" },
  { value: "sent", label: "Sent" },
  { value: "replied", label: "Replied" },
  { value: "no_response", label: "No response" },
];

const sourceMeta: Record<
  ContactSource,
  { label: string; icon: UiIconName; className: string }
> = {
  booking: { label: "Booking", icon: "Calendar", className: "source--booking" },
  manual: { label: "Manual", icon: "UserPlus", className: "source--manual" },
  agent: { label: "Assistant", icon: "Bot", className: "source--agent" },
  import: { label: "Import", icon: "Upload", className: "source--import" },
  outreach: { label: "Outreach", icon: "Send", className: "source--outreach" },
  soulink: { label: "Soulink", icon: "Share2", className: "source--soulink" },
};

const relationshipLabels: Record<ContactRelationship, string> = {
  client: "Client",
  prospect: "Prospect",
  contact: "Contact",
};

const closenessLabels: Record<ContactCloseness, string> = {
  very_close: "Very close",
  close: "Close",
  acquaintance: "Acquaintance",
};

const statusLabels: Record<ContactStatus, string> = {
  active: "Active",
  dormant: "Dormant",
  archived: "Archived",
};

const outreachStatusLabels: Record<OutreachStatus, string> = {
  new: "New",
  drafted: "Drafted",
  sent: "Sent",
  replied: "Replied",
  booked: "Booked",
  converted: "Converted",
  not_interested: "Not interested",
  no_response: "No response",
};

const channelMeta: Record<
  OutreachChannel,
  { label: string; icon: UiIconName; className: string }
> = {
  email: { label: "Email", icon: "Mail", className: "channel--email" },
  linkedin: {
    label: "LinkedIn",
    icon: "Linkedin",
    className: "channel--linkedin",
  },
  instagram: {
    label: "Instagram",
    icon: "Instagram",
    className: "channel--instagram",
  },
  x: { label: "X", icon: "Twitter", className: "channel--x" },
  other: { label: "Other", icon: "MessageSquare", className: "channel--other" },
};

const contactsStore = useContactsStore();
const { contacts, loading, saving, error } = storeToRefs(contactsStore);
const route = useRoute();
const router = useRouter();

const activeTab = ref<Tab>("all");
const prospectFilter = ref<ProspectFilter>("all");
const expandedId = ref<string | null>(null);
const selectedContactIds = ref<string[]>([]);
const highlightedContactId = ref<string | null>(null);
const searchQuery = ref("");
const sorting = ref<SortState>({ id: "name", desc: false });
const showModal = ref(false);
const editingContactId = ref<string | null>(null);
const formError = ref("");
const pageNotice = ref<string | null>(null);
const pageError = ref<string | null>(null);
const historyContactId = ref<string | null>(null);
const messagesByContact = ref<Record<string, OutreachMessage[]>>({});
const messageLoadingByContact = ref<Record<string, boolean>>({});
const draftsByContact = ref<Record<string, DraftComposer>>({});
const actionContactId = ref<string | null>(null);
const generatingContactId = ref<string | null>(null);
const discoveryScanning = ref(false);
const exportingCsv = ref(false);
const prospectDiscoveryLoading = ref(false);
const prospectDiscoveryJobId = ref<string | null>(null);
const prospectDiscoveryReady = ref(false);
const prospectDiscoverySummary = ref("");
const showFindProspectsConfirm = ref(false);

function emptyForm(): ContactFormState {
  return {
    name: "",
    email: "",
    phone: "",
    relationship: "contact",
    closeness: "acquaintance",
    status: "active",
    notes: "",
    lastInteractionAt: "",
    nextFollowupAt: "",
    instagram: "",
    linkedin: "",
    x: "",
  };
}

const form = ref<ContactFormState>(emptyForm());

const tabCounts = computed(() => {
  const allContacts = contacts.value;
  const contactsCount = allContacts.filter(
    (contact) =>
      contact.relationship === "contact" && contact.status !== "archived",
  ).length;
  const clientsCount = allContacts.filter(
    (contact) =>
      contact.relationship === "client" && contact.status !== "archived",
  ).length;
  const prospectsCount = allContacts.filter(
    (contact) =>
      contact.relationship === "prospect" && contact.status !== "archived",
  ).length;
  const archiveCount = allContacts.filter(
    (contact) => contact.status === "archived",
  ).length;
  const followUpCount = allContacts.filter(isNeedsFollowUpContact).length;

  return {
    contacts: contactsCount,
    prospects: prospectsCount,
    clients: clientsCount,
    needs_follow_up: followUpCount,
    archive: archiveCount,
    all: allContacts.length,
  };
});

const prospectFilterCounts = computed(() => {
  const counts: Record<ProspectFilter, number> = {
    all: 0,
    new: 0,
    drafted: 0,
    sent: 0,
    replied: 0,
    no_response: 0,
    booked: 0,
    converted: 0,
    not_interested: 0,
  };

  for (const contact of contacts.value) {
    if (contact.relationship !== "prospect" || contact.status === "archived")
      continue;
    counts.all += 1;
    if (contact.outreachStatus && contact.outreachStatus in counts) {
      counts[contact.outreachStatus as ProspectFilter] += 1;
    }
  }

  return counts;
});

const columns = computed<Column[]>(() => {
  if (activeTab.value === "prospects") {
    return [
      { id: "name", label: "Name", sortable: true },
      { id: "niche", label: "Niche", sortable: true },
      { id: "website", label: "Website", sortable: true },
      { id: "fit", label: "Fit", sortable: true, align: "center" },
      { id: "channel", label: "Channel", sortable: true, align: "center" },
      {
        id: "outreachStatus",
        label: "Status",
        sortable: true,
        align: "center",
      },
      { id: "lastActivity", label: "Last activity", sortable: true },
    ];
  }

  return [
    { id: "name", label: "Name", sortable: true },
    { id: "email", label: "Email", sortable: true },
    { id: "relationship", label: "Relationship", align: "center" },
    { id: "closeness", label: "Closeness", align: "center", sortable: true },
    { id: "source", label: "Source", align: "center" },
    { id: "lastInteractionAt", label: "Last interaction", sortable: true },
    { id: "nextFollowupAt", label: "Next follow-up", sortable: true },
    { id: "status", label: "Status", align: "center" },
  ];
});

function getMeta(contact: Contact): ContactOutreachMeta {
  return contact.metadata || {};
}

function getPreferredChannel(contact: Contact): OutreachChannel {
  const metadataChannel = getMeta(contact).outreachChannel;
  if (metadataChannel) return metadataChannel;
  if (contact.email) return "email";
  if (contact.socialHandles.linkedin) return "linkedin";
  if (contact.socialHandles.instagram) return "instagram";
  if (contact.socialHandles.x) return "x";
  return "other";
}

function getClosenessLabel(contact: Contact): string {
  return contact.closeness ? closenessLabels[contact.closeness] : "—";
}

function getClosenessRank(closeness: ContactCloseness | null): number {
  switch (closeness) {
    case "very_close":
      return 3;
    case "close":
      return 2;
    case "acquaintance":
      return 1;
    default:
      return 0;
  }
}

function createDefaultDraft(contact: Contact): DraftComposer {
  return {
    channel: getPreferredChannel(contact),
    subject: "",
    body: "",
    agentModel: null,
    generatedTaskType: null,
  };
}

function ensureDraftComposer(contact: Contact): DraftComposer {
  const existing = draftsByContact.value[contact.id];
  if (existing) return existing;
  const draft = createDefaultDraft(contact);
  draftsByContact.value = {
    ...draftsByContact.value,
    [contact.id]: draft,
  };
  return draft;
}

function getMessages(contactId: string): OutreachMessage[] {
  return messagesByContact.value[contactId] || [];
}

function getLatestMessage(contactId: string): OutreachMessage | null {
  const messages = getMessages(contactId);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

function getSentMessages(contactId: string): OutreachMessage[] {
  return getMessages(contactId).filter((message) => message.status === "sent");
}

function getSentFollowUpCount(contactId: string): number {
  return getSentMessages(contactId).filter(
    (message) => message.messageType === "follow_up",
  ).length;
}

function getRemainingFollowUps(contactId: string): number {
  return Math.max(0, 2 - getSentFollowUpCount(contactId));
}

function getGenerateDraftLabel(contact: Contact): string {
  if (
    contact.outreachStatus === "replied" ||
    contact.outreachStatus === "booked" ||
    contact.outreachStatus === "converted"
  ) {
    return "Draft reply";
  }

  if (
    contact.outreachStatus === "sent" ||
    getSentMessages(contact.id).length > 0
  ) {
    return "Draft follow-up";
  }

  return "Generate draft";
}

function getComposerCaption(contact: Contact): string {
  if (
    contact.outreachStatus === "replied" ||
    contact.outreachStatus === "booked" ||
    contact.outreachStatus === "converted"
  ) {
    return "The previous outreach stays in history below. Use this draft for the next response.";
  }

  if (
    contact.outreachStatus === "sent" ||
    getSentMessages(contact.id).length > 0
  ) {
    return "The last sent message stays in history below. Use this draft area for the next touch.";
  }

  return "Draft, review, and send from here.";
}

function getCadenceSummary(contact: Contact): string | null {
  const sentMessages = getSentMessages(contact.id);
  if (sentMessages.length === 0) return null;

  const sentFollowUps = getSentFollowUpCount(contact.id);
  const remainingFollowUps = getRemainingFollowUps(contact.id);

  if (
    contact.outreachStatus === "replied" ||
    contact.outreachStatus === "booked" ||
    contact.outreachStatus === "converted"
  ) {
    return sentFollowUps > 0
      ? `${sentFollowUps} follow-up${sentFollowUps === 1 ? "" : "s"} sent before the reply.`
      : "Initial outreach has a reply. Keep the next response thoughtful and specific.";
  }

  if (contact.outreachStatus === "sent" && contact.nextFollowupAt) {
    const dueLabel = formatFollowupDate(contact.nextFollowupAt);
    return remainingFollowUps > 0
      ? `Follow-up ${sentFollowUps + 1} is due ${dueLabel}. ${remainingFollowUps} follow-up${remainingFollowUps === 1 ? "" : "s"} remaining in the cadence.`
      : `Last planned touch is due ${dueLabel}. If there is still no reply after that window, move this prospect to no response.`;
  }

  if (sentFollowUps > 0) {
    return `${sentFollowUps} follow-up${sentFollowUps === 1 ? "" : "s"} sent so far. ${remainingFollowUps} follow-up${remainingFollowUps === 1 ? "" : "s"} remaining.`;
  }

  return "Initial outreach sent. The next draft here should be a follow-up.";
}

function createDraftComposerFromMessages(
  contact: Contact,
  messages: OutreachMessage[],
): DraftComposer {
  const latest = messages.length > 0 ? messages[messages.length - 1] : null;

  if (latest && latest.status !== "sent" && latest.status !== "failed") {
    return {
      channel: latest.channel,
      subject: latest.finalSubject || latest.draftSubject || "",
      body: latest.finalContent || latest.draftContent || "",
      agentModel: latest.agentModel || null,
      generatedTaskType: null,
    };
  }

  return {
    channel: latest?.channel || getPreferredChannel(contact),
    subject: "",
    body: "",
    agentModel: latest?.agentModel || null,
    generatedTaskType: null,
  };
}

function isContactBusy(contactId: string): boolean {
  return (
    actionContactId.value === contactId ||
    generatingContactId.value === contactId
  );
}

function getWebsiteUrl(contact: Contact): string | null {
  return typeof getMeta(contact).websiteUrl === "string"
    ? getMeta(contact).websiteUrl || null
    : null;
}

function getWebsiteLabel(contact: Contact): string {
  const url = getWebsiteUrl(contact);
  if (!url) return "—";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getWebsiteStatus(contact: Contact): string | null {
  return typeof getMeta(contact).websiteStatus === "string"
    ? getMeta(contact).websiteStatus || null
    : null;
}

function getFitScore(contact: Contact): number | null {
  const score = getMeta(contact).fitScore;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function getNiche(contact: Contact): string {
  const niche = getMeta(contact).niche;
  return typeof niche === "string" && niche ? niche : "—";
}

function getLocation(contact: Contact): string | null {
  const location = getMeta(contact).location;
  return typeof location === "string" && location ? location : null;
}

function getMessageAngle(contact: Contact): string | null {
  const messageAngle = getMeta(contact).messageAngle;
  return typeof messageAngle === "string" && messageAngle ? messageAngle : null;
}

function getFitReason(contact: Contact): string | null {
  const fitReason = getMeta(contact).fitReason;
  return typeof fitReason === "string" && fitReason ? fitReason : null;
}

function getSourceUrl(contact: Contact): string | null {
  const sourceUrl = getMeta(contact).sourceUrl;
  return typeof sourceUrl === "string" && sourceUrl ? sourceUrl : null;
}

function isNeedsFollowUpContact(contact: Contact): boolean {
  if (!contact.nextFollowupAt || contact.status === "archived") return false;
  const nextFollowup = new Date(contact.nextFollowupAt);
  return (
    !Number.isNaN(nextFollowup.getTime()) &&
    nextFollowup.getTime() <= Date.now()
  );
}

function getLastActivity(contact: Contact): string | null {
  const latestMessage = getLatestMessage(contact.id);
  return (
    latestMessage?.sentAt ||
    latestMessage?.updatedAt ||
    contact.lastInteractionAt ||
    contact.updatedAt
  );
}

function filteredContactsForTab(allContacts: Contact[]): Contact[] {
  return allContacts.filter((contact) => {
    if (activeTab.value === "contacts") {
      if (contact.relationship !== "contact" || contact.status === "archived") {
        return false;
      }
    }

    if (activeTab.value === "prospects") {
      if (
        contact.relationship !== "prospect" ||
        contact.status === "archived"
      ) {
        return false;
      }
      if (
        prospectFilter.value !== "all" &&
        contact.outreachStatus !== prospectFilter.value
      ) {
        return false;
      }
    }

    if (activeTab.value === "clients") {
      return contact.relationship === "client" && contact.status !== "archived";
    }

    if (activeTab.value === "needs_follow_up") {
      return isNeedsFollowUpContact(contact);
    }

    if (activeTab.value === "archive") {
      return contact.status === "archived";
    }

    return true;
  });
}

function matchesSearch(contact: Contact, query: string): boolean {
  if (!query) return true;

  const meta = getMeta(contact);
  const haystack = [
    contact.name,
    contact.email || "",
    contact.phone || "",
    contact.notes || "",
    contact.tags.join(" "),
    getClosenessLabel(contact),
    Object.values(contact.socialHandles).join(" "),
    typeof meta.niche === "string" ? meta.niche : "",
    typeof meta.websiteUrl === "string" ? meta.websiteUrl : "",
    typeof meta.location === "string" ? meta.location : "",
    typeof meta.messageAngle === "string" ? meta.messageAngle : "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function compareNullableText(a: string | null, b: string | null): number {
  return (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
}

function compareNullableNumber(a: number | null, b: number | null): number {
  return (a || 0) - (b || 0);
}

function compareNullableDate(a: string | null, b: string | null): number {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  return aTime - bTime;
}

function compareContacts(a: Contact, b: Contact): number {
  switch (sorting.value.id) {
    case "email":
      return compareNullableText(a.email, b.email);
    case "relationship":
      return compareNullableText(a.relationship, b.relationship);
    case "closeness":
      return getClosenessRank(a.closeness) - getClosenessRank(b.closeness);
    case "source":
      return compareNullableText(a.source, b.source);
    case "lastInteractionAt":
      return compareNullableDate(a.lastInteractionAt, b.lastInteractionAt);
    case "nextFollowupAt":
      return compareNullableDate(a.nextFollowupAt, b.nextFollowupAt);
    case "status":
      return compareNullableText(a.status, b.status);
    case "niche":
      return compareNullableText(getNiche(a), getNiche(b));
    case "website":
      return compareNullableText(getWebsiteUrl(a), getWebsiteUrl(b));
    case "fit":
      return compareNullableNumber(getFitScore(a), getFitScore(b));
    case "channel":
      return compareNullableText(
        getPreferredChannel(a),
        getPreferredChannel(b),
      );
    case "outreachStatus":
      return compareNullableText(a.outreachStatus, b.outreachStatus);
    case "lastActivity":
      return compareNullableDate(getLastActivity(a), getLastActivity(b));
    case "name":
    default:
      return compareNullableText(a.name, b.name);
  }
}

const visibleContacts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const items = filteredContactsForTab(contacts.value).filter((contact) =>
    matchesSearch(contact, query),
  );

  return [...items].sort((a, b) => {
    const result = compareContacts(a, b);
    return sorting.value.desc ? result * -1 : result;
  });
});

const visibleContactIds = computed(() =>
  visibleContacts.value.map((contact) => contact.id),
);

const selectedVisibleContacts = computed(() =>
  visibleContacts.value.filter((contact) =>
    selectedContactIds.value.includes(contact.id),
  ),
);

const allVisibleContactsSelected = computed(
  () =>
    visibleContactIds.value.length > 0 &&
    visibleContactIds.value.every((id) => selectedContactIds.value.includes(id)),
);

const historyContact = computed(() =>
  historyContactId.value
    ? contacts.value.find((contact) => contact.id === historyContactId.value) ||
      null
    : null,
);

const historyMessages = computed(() =>
  historyContactId.value ? getMessages(historyContactId.value) : [],
);

function formatRelativeDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 0) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  if (diffDays === 0) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatFullDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function parseDateInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatFollowupDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function relationshipBadgeClass(relationship: ContactRelationship) {
  return `ledger-rel-badge--${relationship}`;
}

function closenessBadgeClass(closeness: ContactCloseness | null) {
  return closeness
    ? `ledger-closeness-badge--${closeness}`
    : "ledger-closeness-badge--empty";
}

function contactStatusBadgeClass(status: ContactStatus) {
  return `ledger-contact-status--${status}`;
}

function outreachStatusBadgeClass(status: OutreachStatus | null) {
  return status
    ? `ledger-outreach-status--${status}`
    : "ledger-outreach-status--empty";
}

function channelBadgeClass(channel: OutreachChannel) {
  return `channel-pill ${channelMeta[channel].className}`;
}

function socialHandleIcon(key: string) {
  if (key === "linkedin") return "Linkedin";
  if (key === "instagram") return "Instagram";
  if (key === "x") return "Twitter";
  return "Link";
}

function socialHandleLabel(key: string) {
  if (key === "x") return "X";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function escapeCsv(value: string | number | null | undefined): string {
  const stringValue = value == null ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function getExportFilename(): string {
  const datePart = new Date().toISOString().split("T")[0];
  const parts = ["contacts", activeTab.value];
  if (activeTab.value === "prospects" && prospectFilter.value !== "all") {
    parts.push(prospectFilter.value);
  }
  return `${parts.join("-")}-${datePart}.csv`;
}

async function exportVisibleContactsCsv() {
  if (visibleContacts.value.length === 0) {
    pageError.value = "Nothing to export for this view.";
    return;
  }

  exportingCsv.value = true;
  pageError.value = null;

  try {
    const headers = [
      "name",
      "email",
      "phone",
      "relationship",
      "closeness",
      "status",
      "outreach_status",
      "outreach_channel",
      "source",
      "niche",
      "location",
      "website_url",
      "website_status",
      "fit_score",
      "fit_reason",
      "message_angle",
      "source_url",
      "last_interaction_at",
      "next_followup_at",
      "last_booking_at",
      "booking_count",
      "tags",
      "instagram",
      "linkedin",
      "x",
      "notes",
    ];

    const rows = visibleContacts.value.map((contact) =>
      [
        contact.name,
        contact.email,
        contact.phone,
        contact.relationship,
        contact.closeness,
        contact.status,
        contact.outreachStatus,
        getPreferredChannel(contact),
        contact.source,
        getNiche(contact) === "—" ? "" : getNiche(contact),
        getLocation(contact),
        getWebsiteUrl(contact),
        getWebsiteStatus(contact),
        getFitScore(contact),
        getFitReason(contact),
        getMessageAngle(contact),
        getSourceUrl(contact),
        contact.lastInteractionAt,
        contact.nextFollowupAt,
        contact.lastBookingAt,
        contact.bookingCount,
        contact.tags.join(", "),
        contact.socialHandles.instagram || "",
        contact.socialHandles.linkedin || "",
        contact.socialHandles.x || "",
        contact.notes,
      ]
        .map((value) => escapeCsv(value))
        .join(","),
    );

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getExportFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    pageNotice.value = `Exported ${visibleContacts.value.length} contact${visibleContacts.value.length === 1 ? "" : "s"} from this view.`;
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to export CSV";
  } finally {
    exportingCsv.value = false;
  }
}

function toggleSort(id: SortId) {
  if (sorting.value.id === id) {
    sorting.value = { id, desc: !sorting.value.desc };
    return;
  }
  sorting.value = { id, desc: false };
}

function openCreateModal() {
  editingContactId.value = null;
  form.value = emptyForm();
  formError.value = "";
  showModal.value = true;
}

function openEditModal(contact: Contact) {
  editingContactId.value = contact.id;
  form.value = {
    name: contact.name,
    email: contact.email || "",
    phone: contact.phone || "",
    relationship: contact.relationship,
    closeness: contact.closeness || "acquaintance",
    status: contact.status,
    notes: contact.notes || "",
    lastInteractionAt: formatDateInput(contact.lastInteractionAt),
    nextFollowupAt: formatDateInput(contact.nextFollowupAt),
    instagram: contact.socialHandles.instagram || "",
    linkedin: contact.socialHandles.linkedin || "",
    x: contact.socialHandles.x || "",
  };
  formError.value = "";
  showModal.value = true;
}

function closeModal() {
  if (saving.value) return;
  showModal.value = false;
  editingContactId.value = null;
  form.value = emptyForm();
  formError.value = "";
}

async function loadProspectDiscoveryStatus() {
  prospectDiscoveryLoading.value = true;
  pageError.value = null;
  try {
    const response = await api.get<{
      jobId: string | null;
      discoveryReady: boolean;
      discoverySearchSummary: string;
    }>("/client-discovery/config");
    prospectDiscoveryJobId.value = response.jobId;
    prospectDiscoveryReady.value = response.discoveryReady;
    prospectDiscoverySummary.value = response.discoverySearchSummary;
  } catch (err) {
    prospectDiscoveryJobId.value = null;
    prospectDiscoveryReady.value = false;
    prospectDiscoverySummary.value = "";
    pageError.value =
      err instanceof Error
        ? err.message
        : "Could not load client discovery status.";
  } finally {
    prospectDiscoveryLoading.value = false;
  }
}

function openProspectsPrimaryAction() {
  pageError.value = null;
  if (prospectDiscoveryReady.value) {
    showFindProspectsConfirm.value = true;
    return;
  }
  goToClientDiscoveryJob();
}

function goToClientDiscoveryJob() {
  showFindProspectsConfirm.value = false;
  const jobId = prospectDiscoveryJobId.value;
  if (jobId) {
    void router.push({ path: "/assistant", query: { job: jobId } });
    return;
  }
  void router.push({ path: "/assistant" });
}

function closeFindProspectsConfirm() {
  showFindProspectsConfirm.value = false;
}

async function confirmFindProspectsScan() {
  showFindProspectsConfirm.value = false;
  discoveryScanning.value = true;
  pageNotice.value = null;
  pageError.value = null;

  try {
    const response = await api.post<{
      ok: boolean;
      jobId: string;
      jobType: "client_discovery";
    }>("/client-discovery/scan");
    if (!response.ok) {
      throw new Error("Client discovery trigger failed");
    }

    await contactsStore.fetchContacts();
    await loadProspectDiscoveryStatus();
    pageNotice.value =
      "Client discovery finished. Review the run under Assistant → Client Discovery, and check for new prospects below.";
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to start client discovery";
  } finally {
    discoveryScanning.value = false;
  }
}

function buildPayload(): ContactInput {
  const existingContact = editingContactId.value
    ? contacts.value.find((contact) => contact.id === editingContactId.value)
    : null;
  const socialHandles: Record<string, string> = {};
  if (form.value.instagram.trim())
    socialHandles.instagram = form.value.instagram.trim();
  if (form.value.linkedin.trim())
    socialHandles.linkedin = form.value.linkedin.trim();
  if (form.value.x.trim()) socialHandles.x = form.value.x.trim();

  return {
    name: form.value.name.trim(),
    email: form.value.email.trim() || null,
    phone: form.value.phone.trim() || null,
    source: "manual",
    relationship: form.value.relationship,
    closeness:
      form.value.relationship === "contact" ? form.value.closeness : null,
    status: form.value.status,
    notes: form.value.notes.trim() || null,
    tags: existingContact?.tags ?? [],
    lastInteractionAt: parseDateInput(form.value.lastInteractionAt),
    nextFollowupAt: parseDateInput(form.value.nextFollowupAt),
    socialHandles,
  };
}

async function submitForm() {
  pageError.value = null;
  const payload = buildPayload();
  formError.value = "";

  if (!payload.name) {
    formError.value = "Name is required.";
    return;
  }

  const result = editingContactId.value
    ? await contactsStore.updateContact(editingContactId.value, payload)
    : await contactsStore.createContact(payload);

  if (!result) {
    formError.value = error.value || "Could not save contact.";
    return;
  }

  expandedId.value = result.id;
  closeModal();
}

async function archiveContact(contact: Contact) {
  pageError.value = null;
  const nextStatus: ContactStatus =
    contact.status === "archived" ? "active" : "archived";
  const updated = await contactsStore.updateContact(contact.id, {
    status: nextStatus,
  });
  if (!updated) {
    pageError.value = error.value || "Could not update status.";
  }
}

async function removeContact(contact: Contact) {
  const confirmed = window.confirm(`Delete ${contact.name} from your rolodex?`);
  if (!confirmed) return;

  const ok = await contactsStore.deleteContact(contact.id);
  if (ok && expandedId.value === contact.id) {
    expandedId.value = null;
  }
  if (ok) {
    selectedContactIds.value = selectedContactIds.value.filter(
      (id) => id !== contact.id,
    );
  }
}

function toggleContactSelection(contactId: string) {
  selectedContactIds.value = selectedContactIds.value.includes(contactId)
    ? selectedContactIds.value.filter((id) => id !== contactId)
    : [...selectedContactIds.value, contactId];
}

function toggleVisibleContactSelection() {
  if (allVisibleContactsSelected.value) {
    selectedContactIds.value = selectedContactIds.value.filter(
      (id) => !visibleContactIds.value.includes(id),
    );
    return;
  }

  selectedContactIds.value = Array.from(
    new Set([...selectedContactIds.value, ...visibleContactIds.value]),
  );
}

async function removeSelectedContacts() {
  const selected = selectedVisibleContacts.value;
  if (selected.length === 0) return;

  const confirmed = window.confirm(
    `Delete ${selected.length} selected contact${selected.length === 1 ? "" : "s"} from this view?`,
  );
  if (!confirmed) return;

  for (const contact of selected) {
    const ok = await contactsStore.deleteContact(contact.id);
    if (!ok) {
      pageError.value = error.value || "Could not delete selected contacts.";
      return;
    }
  }

  const removedIds = selected.map((contact) => contact.id);
  selectedContactIds.value = selectedContactIds.value.filter(
    (id) => !removedIds.includes(id),
  );
  if (expandedId.value && removedIds.includes(expandedId.value)) {
    expandedId.value = null;
  }
  pageNotice.value = `Deleted ${selected.length} contact${selected.length === 1 ? "" : "s"}.`;
}

async function loadOutreachMessages(contact: Contact) {
  if (messageLoadingByContact.value[contact.id]) return;

  messageLoadingByContact.value = {
    ...messageLoadingByContact.value,
    [contact.id]: true,
  };

  try {
    const response = await api.get<{ messages: OutreachMessage[] }>(
      `/outreach/messages?contactId=${encodeURIComponent(contact.id)}`,
    );
    messagesByContact.value = {
      ...messagesByContact.value,
      [contact.id]: response.messages,
    };

    draftsByContact.value = {
      ...draftsByContact.value,
      [contact.id]: createDraftComposerFromMessages(contact, response.messages),
    };
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to load outreach history";
  } finally {
    messageLoadingByContact.value = {
      ...messageLoadingByContact.value,
      [contact.id]: false,
    };
  }
}

async function toggleRow(contact: Contact) {
  if (expandedId.value === contact.id) {
    expandedId.value = null;
    return;
  }

  expandedId.value = contact.id;
  if (contact.relationship === "prospect" || contact.outreachStatus) {
    await loadOutreachMessages(contact);
  }
}

function ledgerRowClickShouldIgnoreToggle(event: MouseEvent): boolean {
  const el = event.target;
  if (!el || !(el instanceof Element)) return true;
  return Boolean(el.closest("a[href], button, input, select, textarea"));
}

async function onLedgerRowClick(event: MouseEvent, contact: Contact) {
  if (ledgerRowClickShouldIgnoreToggle(event)) return;
  await toggleRow(contact);
}

async function onLedgerRowKeydown(event: KeyboardEvent, contact: Contact) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  await toggleRow(contact);
}

function updateDraft(contact: Contact, patch: Partial<DraftComposer>) {
  const current = ensureDraftComposer(contact);
  draftsByContact.value = {
    ...draftsByContact.value,
    [contact.id]: {
      ...current,
      ...patch,
    },
  };
}

async function refreshContactState(contactId: string) {
  await contactsStore.fetchContacts();
  const refreshed = contacts.value.find((contact) => contact.id === contactId);
  if (refreshed) {
    await loadOutreachMessages(refreshed);
  }
}

async function saveDraftMessage(
  contact: Contact,
): Promise<OutreachMessage | null> {
  const draft = ensureDraftComposer(contact);
  pageError.value = null;
  pageNotice.value = null;

  const body = draft.body.trim();
  if (!body) {
    pageError.value = "Write the message body before saving the draft.";
    return null;
  }

  const latest = getLatestMessage(contact.id);
  const payload = {
    contactId: contact.id,
    channel: draft.channel,
    messageType: latest ? "follow_up" : "initial",
    draftSubject:
      draft.channel === "email" ? draft.subject.trim() || null : null,
    draftContent: body,
    finalSubject:
      draft.channel === "email" ? draft.subject.trim() || null : null,
    finalContent: body,
    status: "draft" as const,
    agentModel: draft.agentModel,
  };

  try {
    let response: { ok: boolean; message: OutreachMessage };
    if (latest && latest.status !== "sent" && latest.status !== "failed") {
      response = await api.put<{ ok: boolean; message: OutreachMessage }>(
        `/outreach/messages/${latest.id}`,
        payload,
      );
    } else {
      response = await api.post<{ ok: boolean; message: OutreachMessage }>(
        "/outreach/messages",
        payload,
      );
    }

    pageNotice.value = "Draft saved.";
    await refreshContactState(contact.id);
    return response.message;
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to save draft";
    return null;
  }
}

async function generateDraft(contact: Contact) {
  const currentDraft = ensureDraftComposer(contact);
  const hasExistingContent =
    Boolean(currentDraft.subject.trim()) || Boolean(currentDraft.body.trim());
  if (hasExistingContent) {
    const confirmed = window.confirm(
      `Replace the current draft for ${contact.name} with a generated version?`,
    );
    if (!confirmed) return;
  }

  generatingContactId.value = contact.id;
  pageError.value = null;
  pageNotice.value = null;

  try {
    const response = await api.post<{
      ok: boolean;
      draft: {
        channel: OutreachChannel;
        subject: string | null;
        body: string;
        messageType: "initial" | "follow_up";
        taskType: GeneratedOutreachTaskType;
        agentModel: string | null;
      };
    }>("/outreach/generate-draft", {
      contactId: contact.id,
      channel: currentDraft.channel,
    });

    updateDraft(contact, {
      channel: response.draft.channel,
      subject: response.draft.subject || "",
      body: response.draft.body,
      agentModel: response.draft.agentModel,
      generatedTaskType: response.draft.taskType,
    });

    pageNotice.value =
      response.draft.taskType === "outreach_follow_up"
        ? "AI follow-up draft ready."
        : response.draft.taskType === "outreach_after_reply"
          ? "AI reply draft ready."
          : "AI draft ready.";
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to generate outreach draft";
  } finally {
    generatingContactId.value = null;
  }
}

async function saveDraftToMailbox(contact: Contact) {
  actionContactId.value = contact.id;
  try {
    const message = await saveDraftMessage(contact);
    if (!message) return;
    await api.post<{ ok: boolean; draftId: string }>(
      `/outreach/messages/${message.id}/save-draft`,
    );
    pageNotice.value = "Saved to mailbox drafts.";
    await refreshContactState(contact.id);
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to save mailbox draft";
  } finally {
    actionContactId.value = null;
  }
}

async function sendOutreachEmail(contact: Contact) {
  actionContactId.value = contact.id;
  try {
    const message = await saveDraftMessage(contact);
    if (!message) return;
    await api.post<{ ok: boolean }>(
      `/outreach/messages/${message.id}/send-email`,
    );
    pageNotice.value = "Email sent.";
    await refreshContactState(contact.id);
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to send outreach email";
  } finally {
    actionContactId.value = null;
  }
}

async function markDraftAsSent(contact: Contact) {
  actionContactId.value = contact.id;
  try {
    const message = await saveDraftMessage(contact);
    if (!message) return;

    const draft = ensureDraftComposer(contact);
    await api.put<{ ok: boolean; message: OutreachMessage }>(
      `/outreach/messages/${message.id}`,
      {
        channel: draft.channel,
        draftSubject:
          draft.channel === "email" ? draft.subject.trim() || null : null,
        draftContent: draft.body.trim(),
        finalSubject:
          draft.channel === "email" ? draft.subject.trim() || null : null,
        finalContent: draft.body.trim(),
        status: "sent",
      },
    );
    pageNotice.value = "Marked as sent.";
    await refreshContactState(contact.id);
  } catch (err) {
    pageError.value =
      err instanceof Error ? err.message : "Failed to mark message as sent";
  } finally {
    actionContactId.value = null;
  }
}

async function copyMessage(contact: Contact) {
  const draft = ensureDraftComposer(contact);
  const text =
    draft.channel === "email" && draft.subject.trim()
      ? `Subject: ${draft.subject.trim()}\n\n${draft.body.trim()}`
      : draft.body.trim();

  if (!text) {
    pageError.value = "Nothing to copy yet.";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    pageNotice.value = "Message copied.";
  } catch {
    pageError.value = "Clipboard copy failed.";
  }
}

async function updateOutreachStatus(contact: Contact, status: OutreachStatus) {
  actionContactId.value = contact.id;
  pageError.value = null;
  const updated = await contactsStore.updateOutreachStatus(contact.id, {
    outreachStatus: status,
    channel: ensureDraftComposer(contact).channel,
  });
  actionContactId.value = null;

  if (!updated) {
    pageError.value = error.value || "Could not update outreach status.";
    return;
  }

  pageNotice.value = `Marked ${outreachStatusLabels[status].toLowerCase()}.`;
  await refreshContactState(contact.id);
}

async function convertToClient(contact: Contact) {
  actionContactId.value = contact.id;
  pageError.value = null;
  const updated = await contactsStore.convertToClient(contact.id);
  actionContactId.value = null;

  if (!updated) {
    pageError.value = error.value || "Could not convert prospect.";
    return;
  }

  pageNotice.value = `${contact.name} is now a client.`;
  await contactsStore.fetchContacts();
}

function openHistory(contact: Contact) {
  historyContactId.value = contact.id;
}

function closeHistory() {
  historyContactId.value = null;
}

onMounted(() => {
  contactsStore.fetchContacts();
  void loadProspectDiscoveryStatus();
});

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === "prospects") void loadProspectDiscoveryStatus();
  },
);

watch(
  () => [route.query.contact, contacts.value.length] as const,
  async ([queryContact]) => {
    const contactId =
      typeof queryContact === "string" && queryContact.trim()
        ? queryContact.trim()
        : null;
    if (!contactId) return;

    const contact = contacts.value.find((entry) => entry.id === contactId);
    if (!contact) return;

    activeTab.value =
      contact.status === "archived"
        ? "archive"
        : contact.relationship === "prospect"
          ? "prospects"
          : contact.relationship === "contact"
            ? "contacts"
            : contact.relationship === "client"
              ? "clients"
              : "all";
    expandedId.value = contact.id;
    highlightedContactId.value = contact.id;

    if (contact.relationship === "prospect" || contact.outreachStatus) {
      await loadOutreachMessages(contact);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="clients-page">
    <Teleport to="#app-side-nav-mobile-page-controls">
      <div class="contacts-mobile-nav-controls">
        <select
          v-model="activeTab"
          class="contacts-mobile-filter"
          aria-label="Contact filters"
        >
          <option
            v-for="tab in CONTACT_TABS"
            :key="tab.value"
            :value="tab.value"
          >
            {{ tab.label }} {{ tabCounts[tab.value] }}
          </option>
        </select>

        <button
          type="button"
          class="contacts-mobile-action"
          :disabled="exportingCsv || visibleContacts.length === 0"
          aria-label="Export contacts"
          title="Export"
          @click="exportVisibleContactsCsv"
        >
          <UiIcon name="Download" :size="16" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="contacts-mobile-action contacts-mobile-action--primary"
          aria-label="Add contact"
          title="Add"
          @click="openCreateModal"
        >
          <UiIcon name="UserPlus" :size="16" aria-hidden="true" />
        </button>
      </div>
    </Teleport>

    <main class="clients-main">
      <section class="controls-card">
        <div class="clients-toolbar">
          <div class="clients-toolbar__main">
            <label class="contact-filter-select">
              <span class="sr-only">Contact filters</span>
              <select v-model="activeTab">
                <option
                  v-for="tab in CONTACT_TABS"
                  :key="tab.value"
                  :value="tab.value"
                >
                  {{ tab.label }} {{ tabCounts[tab.value] }}
                </option>
              </select>
            </label>

            <div class="clients-toolbar__actions">
              <label class="search-field search-field--compact">
                <UiIcon name="Search" :size="14" aria-hidden="true" />
                <input
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search names, emails, notes…"
                />
              </label>

              <Button
                variant="outline"
                size="small"
                :disabled="exportingCsv || visibleContacts.length === 0"
                @click="exportVisibleContactsCsv"
              >
                <template #icon>
                  <UiIcon name="Download" :size="16" aria-hidden="true" />
                </template>
                {{ exportingCsv ? "Exporting..." : "Export" }}
              </Button>

              <Button
                v-if="selectedVisibleContacts.length > 0"
                variant="outline"
                size="small"
                @click="removeSelectedContacts"
              >
                <template #icon>
                  <UiIcon name="Trash2" :size="16" aria-hidden="true" />
                </template>
                Delete {{ selectedVisibleContacts.length }}
              </Button>

              <Button variant="primary" size="small" @click="openCreateModal">
                <template #icon>
                  <UiIcon name="UserPlus" :size="16" aria-hidden="true" />
                </template>
                Add
              </Button>
            </div>
          </div>

          <div
            v-if="activeTab === 'prospects'"
            class="clients-toolbar__prospect-row"
            role="group"
            aria-labelledby="prospect-filters-label"
          >
            <div class="prospect-filters prospect-filters--row">
              <span id="prospect-filters-label" class="prospect-filters__label">
                Outreach status
              </span>
              <div class="prospect-filters__list">
                <button
                  v-for="filter in PROSPECT_FILTERS"
                  :key="filter.value"
                  class="prospect-subtab"
                  :class="{
                    'prospect-subtab--active': prospectFilter === filter.value,
                  }"
                  type="button"
                  @click="prospectFilter = filter.value"
                >
                  {{ filter.label }}
                  <span class="prospect-subtab__count">{{
                    prospectFilterCounts[filter.value] || 0
                  }}</span>
                </button>
              </div>
            </div>

            <div class="clients-toolbar__prospect-actions">
              <Button
                variant="primary"
                size="small"
                :disabled="
                  prospectDiscoveryLoading ||
                  (prospectDiscoveryReady && discoveryScanning)
                "
                @click="openProspectsPrimaryAction"
              >
                <template #icon>
                  <UiIcon
                    :name="prospectDiscoveryReady ? 'Search' : 'Settings'"
                    :size="16"
                    aria-hidden="true"
                  />
                </template>
                {{
                  prospectDiscoveryLoading
                    ? "Loading…"
                    : prospectDiscoveryReady
                      ? discoveryScanning
                        ? "Finding…"
                        : "Find prospects"
                      : "Configure outreach"
                }}
              </Button>
            </div>
          </div>
        </div>

      </section>

      <div v-if="pageNotice" class="state-card state-card--success">
        {{ pageNotice }}
      </div>

      <div
        v-if="(pageError || error) && !showModal && !showFindProspectsConfirm"
        class="state-card state-card--error"
      >
        {{ pageError || error }}
      </div>

      <div v-if="loading" class="state-card">Loading your rolodex…</div>

      <div v-else-if="contacts.length === 0" class="empty-state">
        <img
          src="/robot.png"
          alt="Your CEO Rolodex — every relationship that matters"
          class="empty-icon"
        />
        <h2>Your rolodex is empty.</h2>
        <p v-if="activeTab === 'prospects'">
          Configure client discovery in Assistant, then find prospects to seed
          this list.
        </p>
        <p v-else>
          Add a contact, book your first client, or let your assistant find
          fresh prospects once discovery is set up.
        </p>
        <div class="empty-actions">
          <Button
            v-if="activeTab === 'prospects'"
            variant="outline"
            :disabled="
              prospectDiscoveryLoading ||
              (prospectDiscoveryReady && discoveryScanning)
            "
            @click="openProspectsPrimaryAction"
          >
            {{
              prospectDiscoveryLoading
                ? "Loading…"
                : prospectDiscoveryReady
                  ? discoveryScanning
                    ? "Finding…"
                    : "Find prospects"
                  : "Configure outreach"
            }}
          </Button>
          <Button variant="primary" @click="openCreateModal"
            >Add your first contact</Button
          >
        </div>
      </div>

      <section v-else class="table-card">
        <table class="ledger-table">
          <thead>
            <tr>
              <th class="col-select">
                <label class="row-select row-select--header">
                  <input
                    type="checkbox"
                    :checked="allVisibleContactsSelected"
                    :disabled="visibleContacts.length === 0"
                    aria-label="Select all visible contacts"
                    @change="toggleVisibleContactSelection"
                    @click.stop
                  />
                </label>
              </th>
              <th
                v-for="column in columns"
                :key="column.id"
                :class="[
                  column.align === 'center' ? 'col-center' : '',
                  column.sortable ? 'col-sortable' : '',
                ]"
                @click="column.sortable ? toggleSort(column.id) : undefined"
              >
                {{ column.label }}
                <span v-if="sorting.id === column.id" class="sort-indicator">
                  {{ sorting.desc ? "↓" : "↑" }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody v-if="visibleContacts.length > 0">
            <template v-for="contact in visibleContacts" :key="contact.id">
              <tr
                class="ledger-row ledger-row--expandable"
                role="button"
                tabindex="0"
                :class="{
                  'ledger-row--highlighted':
                    highlightedContactId === contact.id,
                }"
                :aria-expanded="expandedId === contact.id ? 'true' : 'false'"
                :aria-label="`Toggle details for ${contact.name}`"
                @click="onLedgerRowClick($event, contact)"
                @keydown="onLedgerRowKeydown($event, contact)"
              >
                <td class="col-select">
                  <label class="row-select">
                    <input
                      type="checkbox"
                      :checked="selectedContactIds.includes(contact.id)"
                      :aria-label="`Select ${contact.name}`"
                      @change="toggleContactSelection(contact.id)"
                      @click.stop
                    />
                  </label>
                </td>
                <td>
                  <div class="name-cell">
                    <span>{{ contact.name }}</span>
                    <span class="row-toggle" aria-hidden="true">
                      {{ expandedId === contact.id ? "−" : "+" }}
                    </span>
                  </div>
                </td>

                <template v-if="activeTab === 'prospects'">
                  <td class="cell-muted">{{ getNiche(contact) }}</td>
                  <td>
                    <div class="website-cell">
                      <a
                        v-if="getWebsiteUrl(contact)"
                        :href="getWebsiteUrl(contact) || undefined"
                        target="_blank"
                        rel="noreferrer"
                        class="plain-link"
                      >
                        {{ getWebsiteLabel(contact) }}
                      </a>
                      <span v-else class="cell-muted">—</span>
                      <span
                        v-if="getWebsiteStatus(contact)"
                        class="website-pill"
                        :class="`website-pill--${getWebsiteStatus(contact)}`"
                      >
                        {{ getWebsiteStatus(contact) }}
                      </span>
                    </div>
                  </td>
                  <td class="cell-badge">
                    <span class="score-pill">
                      {{
                        getFitScore(contact)
                          ? `${getFitScore(contact)}/10`
                          : "—"
                      }}
                    </span>
                  </td>
                  <td class="cell-badge">
                    <span
                      :class="channelBadgeClass(getPreferredChannel(contact))"
                    >
                      <UiIcon
                        :name="channelMeta[getPreferredChannel(contact)].icon"
                        :size="12"
                        aria-hidden="true"
                      />
                      {{ channelMeta[getPreferredChannel(contact)].label }}
                    </span>
                  </td>
                  <td class="cell-badge">
                    <span
                      class="ledger-outreach-status"
                      :class="outreachStatusBadgeClass(contact.outreachStatus)"
                    >
                      {{
                        contact.outreachStatus
                          ? outreachStatusLabels[contact.outreachStatus]
                          : "Unstarted"
                      }}
                    </span>
                  </td>
                  <td
                    class="cell-date"
                    :title="formatFullDate(getLastActivity(contact))"
                  >
                    {{ formatRelativeDate(getLastActivity(contact)) }}
                  </td>
                </template>

                <template v-else>
                  <td class="cell-email">{{ contact.email || "—" }}</td>
                  <td class="cell-badge">
                    <span
                      class="ledger-rel-badge"
                      :class="relationshipBadgeClass(contact.relationship)"
                    >
                      {{ relationshipLabels[contact.relationship] }}
                    </span>
                  </td>
                  <td class="cell-badge">
                    <span
                      v-if="contact.relationship === 'contact'"
                      class="ledger-closeness-badge"
                      :class="closenessBadgeClass(contact.closeness)"
                    >
                      {{ getClosenessLabel(contact) }}
                    </span>
                    <span v-else class="cell-muted">—</span>
                  </td>
                  <td class="cell-badge">
                    <span
                      class="ledger-source-pill"
                      :class="sourceMeta[contact.source].className"
                    >
                      <UiIcon
                        :name="sourceMeta[contact.source].icon"
                        :size="12"
                        aria-hidden="true"
                      />
                      {{ sourceMeta[contact.source].label }}
                    </span>
                  </td>
                  <td
                    class="cell-date"
                    :title="formatFullDate(contact.lastInteractionAt)"
                  >
                    {{ formatRelativeDate(contact.lastInteractionAt) }}
                  </td>
                  <td
                    class="cell-date"
                    :title="formatFullDate(contact.nextFollowupAt)"
                  >
                    {{ formatFollowupDate(contact.nextFollowupAt) }}
                  </td>
                  <td class="cell-badge">
                    <span
                      class="ledger-contact-status"
                      :class="contactStatusBadgeClass(contact.status)"
                    >
                      {{ statusLabels[contact.status] }}
                    </span>
                  </td>
                </template>
              </tr>

              <tr v-if="expandedId === contact.id" class="detail-row">
                <td :colspan="columns.length + 1">
                  <div class="detail-panel">
                    <template
                      v-if="
                        contact.relationship === 'prospect' ||
                        contact.outreachStatus
                      "
                    >
                      <div class="detail-grid detail-grid--prospect">
                        <section class="detail-block">
                          <h3>Prospect info</h3>
                          <dl class="detail-list">
                            <div>
                              <dt>Email</dt>
                              <dd>{{ contact.email || "No email saved" }}</dd>
                            </div>
                            <div>
                              <dt>Website</dt>
                              <dd>
                                <a
                                  v-if="getWebsiteUrl(contact)"
                                  :href="getWebsiteUrl(contact) || undefined"
                                  target="_blank"
                                  rel="noreferrer"
                                  class="plain-link"
                                >
                                  {{ getWebsiteUrl(contact) }}
                                </a>
                                <span v-else>None saved</span>
                              </dd>
                            </div>
                            <div>
                              <dt>Niche</dt>
                              <dd>{{ getNiche(contact) }}</dd>
                            </div>
                            <div>
                              <dt>Location</dt>
                              <dd>{{ getLocation(contact) || "—" }}</dd>
                            </div>
                            <div>
                              <dt>Fit</dt>
                              <dd>
                                {{
                                  getFitScore(contact)
                                    ? `${getFitScore(contact)}/10`
                                    : "—"
                                }}
                                <span v-if="getFitReason(contact)"
                                  >· {{ getFitReason(contact) }}</span
                                >
                              </dd>
                            </div>
                            <div>
                              <dt>Source</dt>
                              <dd>
                                <a
                                  v-if="getSourceUrl(contact)"
                                  :href="getSourceUrl(contact) || undefined"
                                  target="_blank"
                                  rel="noreferrer"
                                  class="plain-link"
                                >
                                  View source
                                </a>
                                <span v-else>—</span>
                              </dd>
                            </div>
                          </dl>

                          <div
                            v-if="Object.keys(contact.socialHandles).length > 0"
                            class="social-inline"
                          >
                            <span
                              v-for="(value, key) in contact.socialHandles"
                              :key="key"
                              class="tag-pill"
                            >
                              {{ key }}: {{ value }}
                            </span>
                          </div>
                        </section>

                        <section class="detail-block">
                          <h3>Message angle</h3>
                          <p>
                            {{
                              getMessageAngle(contact) || "No angle saved yet."
                            }}
                          </p>
                          <h3 class="detail-subheading">Notes</h3>
                          <p>{{ contact.notes || "No notes yet." }}</p>
                        </section>

                        <section class="detail-block detail-block--composer">
                          <div class="composer-header">
                            <div>
                              <h3>Outreach</h3>
                              <p class="block-caption">
                                {{ getComposerCaption(contact) }}
                              </p>
                            </div>
                            <label class="field field--compact">
                              <span>Channel</span>
                              <select
                                :value="ensureDraftComposer(contact).channel"
                                @change="
                                  updateDraft(contact, {
                                    channel: (
                                      $event.target as HTMLSelectElement
                                    ).value as OutreachChannel,
                                  })
                                "
                              >
                                <option value="email">Email</option>
                                <option value="linkedin">LinkedIn</option>
                                <option value="instagram">Instagram</option>
                                <option value="x">X</option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                          </div>

                          <p
                            v-if="getCadenceSummary(contact)"
                            class="composer-summary"
                          >
                            {{ getCadenceSummary(contact) }}
                          </p>

                          <label
                            v-if="
                              ensureDraftComposer(contact).channel === 'email'
                            "
                            class="field"
                          >
                            <span>Subject</span>
                            <input
                              :value="ensureDraftComposer(contact).subject"
                              type="text"
                              placeholder="Quick subject line"
                              @input="
                                updateDraft(contact, {
                                  subject: ($event.target as HTMLInputElement)
                                    .value,
                                })
                              "
                            />
                          </label>

                          <label class="field">
                            <span>Message</span>
                            <textarea
                              :value="ensureDraftComposer(contact).body"
                              rows="8"
                              placeholder="Write or paste the outreach draft here…"
                              @input="
                                updateDraft(contact, {
                                  body: ($event.target as HTMLTextAreaElement)
                                    .value,
                                })
                              "
                            />
                          </label>

                          <div class="composer-actions">
                            <Button
                              variant="outline"
                              size="small"
                              :disabled="isContactBusy(contact.id)"
                              @click="generateDraft(contact)"
                            >
                              {{
                                generatingContactId === contact.id
                                  ? "Generating..."
                                  : getGenerateDraftLabel(contact)
                              }}
                            </Button>
                            <Button
                              variant="outline"
                              size="small"
                              :disabled="isContactBusy(contact.id)"
                              @click="saveDraftMessage(contact)"
                            >
                              Save draft
                            </Button>
                            <Button
                              variant="outline"
                              size="small"
                              :disabled="isContactBusy(contact.id)"
                              @click="copyMessage(contact)"
                            >
                              Copy message
                            </Button>
                            <Button
                              v-if="
                                ensureDraftComposer(contact).channel === 'email'
                              "
                              variant="outline"
                              size="small"
                              :disabled="isContactBusy(contact.id)"
                              @click="saveDraftToMailbox(contact)"
                            >
                              Save to mailbox
                            </Button>
                            <Button
                              v-if="
                                ensureDraftComposer(contact).channel === 'email'
                              "
                              variant="primary"
                              size="small"
                              :disabled="isContactBusy(contact.id)"
                              @click="sendOutreachEmail(contact)"
                            >
                              Send email
                            </Button>
                            <Button
                              v-else
                              variant="primary"
                              size="small"
                              :disabled="isContactBusy(contact.id)"
                              @click="markDraftAsSent(contact)"
                            >
                              Mark as sent
                            </Button>
                          </div>
                        </section>

                        <section class="detail-block">
                          <div class="history-header">
                            <h3>Latest message</h3>
                            <Button
                              variant="outline"
                              size="small"
                              @click="openHistory(contact)"
                            >
                              View full history
                            </Button>
                          </div>

                          <div
                            v-if="messageLoadingByContact[contact.id]"
                            class="mini-state"
                          >
                            Loading outreach history…
                          </div>
                          <div
                            v-else-if="getLatestMessage(contact.id)"
                            class="history-preview"
                          >
                            <div class="history-meta">
                              <span class="tag-pill">
                                {{
                                  getLatestMessage(contact.id)?.messageType ===
                                  "initial"
                                    ? "Initial"
                                    : "Follow-up"
                                }}
                                #{{
                                  getLatestMessage(contact.id)?.sequenceNumber
                                }}
                              </span>
                              <span class="tag-pill">
                                {{ getLatestMessage(contact.id)?.status }}
                              </span>
                              <span class="tag-pill">
                                {{
                                  channelMeta[
                                    getLatestMessage(contact.id)?.channel ||
                                      "other"
                                  ].label
                                }}
                              </span>
                            </div>
                            <p
                              v-if="getLatestMessage(contact.id)?.draftSubject"
                              class="history-subject"
                            >
                              {{ getLatestMessage(contact.id)?.draftSubject }}
                            </p>
                            <p>
                              {{
                                getLatestMessage(contact.id)?.finalContent ||
                                getLatestMessage(contact.id)?.draftContent
                              }}
                            </p>
                          </div>
                          <p v-else>No outreach messages yet.</p>
                        </section>
                      </div>

                      <div class="detail-actions">
                        <Button
                          variant="outline"
                          size="small"
                          @click="openEditModal(contact)"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          :disabled="actionContactId === contact.id"
                          @click="updateOutreachStatus(contact, 'replied')"
                        >
                          Mark replied
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          :disabled="actionContactId === contact.id"
                          @click="
                            updateOutreachStatus(contact, 'not_interested')
                          "
                        >
                          Not interested
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          :disabled="actionContactId === contact.id"
                          @click="convertToClient(contact)"
                        >
                          Convert to client
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          @click="archiveContact(contact)"
                        >
                          {{
                            contact.status === "archived"
                              ? "Mark active"
                              : "Archive"
                          }}
                        </Button>
                      </div>
                    </template>

                    <template v-else>
                      <div class="detail-grid detail-grid--contact">
                        <section class="detail-block">
                          <h3>Notes</h3>
                          <p>{{ contact.notes || "No notes yet." }}</p>
                        </section>

                        <section class="detail-block">
                          <h3>Social handles</h3>
                          <ul
                            v-if="Object.keys(contact.socialHandles).length > 0"
                            class="social-list"
                          >
                            <li
                              v-for="(value, key) in contact.socialHandles"
                              :key="key"
                            >
                              <UiIcon
                                :name="socialHandleIcon(String(key))"
                                :size="14"
                                aria-hidden="true"
                              />
                              <span class="social-list__label">{{
                                socialHandleLabel(String(key))
                              }}</span>
                              <span class="social-list__value">{{
                                value
                              }}</span>
                            </li>
                          </ul>
                          <p v-else>No social handles saved.</p>
                        </section>

                        <section class="detail-block">
                          <h3>Booking history</h3>
                          <p>
                            {{ contact.bookingCount }}
                            {{
                              contact.bookingCount === 1
                                ? "confirmed booking"
                                : "confirmed bookings"
                            }}
                          </p>
                          <p
                            v-if="
                              contact.lastBookingAt || contact.lastInteractionAt
                            "
                          >
                            Last booked:
                            {{
                              formatFullDate(
                                contact.lastBookingAt ||
                                  contact.lastInteractionAt,
                              )
                            }}
                          </p>
                        </section>
                      </div>

                      <div class="detail-actions">
                        <Button
                          variant="outline"
                          size="small"
                          @click="openEditModal(contact)"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          @click="archiveContact(contact)"
                        >
                          {{
                            contact.status === "archived"
                              ? "Mark active"
                              : "Archive"
                          }}
                        </Button>
                        <Button
                          variant="outline"
                          size="small"
                          @click="removeContact(contact)"
                        >
                          Delete
                        </Button>
                      </div>
                    </template>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div v-if="visibleContacts.length === 0" class="empty-filter-state">
          No contacts match this filter yet.
        </div>
      </section>
    </main>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <h2>{{ editingContactId ? "Edit contact" : "Add contact" }}</h2>
          </div>
          <button class="icon-close" type="button" @click="closeModal">
            ×
          </button>
        </div>

        <form class="contact-form" @submit.prevent="submitForm">
          <div class="field-grid">
            <label>
              <span>Name</span>
              <input v-model="form.name" type="text" required />
            </label>

            <label>
              <span>Email</span>
              <input v-model="form.email" type="email" />
            </label>

            <label>
              <span>Phone</span>
              <input v-model="form.phone" type="tel" />
            </label>

            <label>
              <span>Relationship</span>
              <select v-model="form.relationship">
                <option value="contact">Contact</option>
                <option value="client">Client</option>
                <option value="prospect">Prospect</option>
              </select>
            </label>

            <label v-if="form.relationship === 'contact'">
              <span>Closeness</span>
              <select v-model="form.closeness">
                <option value="very_close">Very close</option>
                <option value="close">Close</option>
                <option value="acquaintance">Acquaintance</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select v-model="form.status">
                <option value="active">Active</option>
                <option value="dormant">Dormant</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            <label>
              <span>Last interaction</span>
              <input v-model="form.lastInteractionAt" type="datetime-local" />
            </label>

            <label>
              <span>Next follow-up</span>
              <input v-model="form.nextFollowupAt" type="datetime-local" />
            </label>
          </div>

          <label>
            <span>Notes</span>
            <textarea v-model="form.notes" rows="4" />
          </label>

          <div class="field-grid">
            <label>
              <span>Instagram</span>
              <input
                v-model="form.instagram"
                type="text"
                placeholder="@handle"
              />
            </label>
            <label>
              <span>LinkedIn</span>
              <input
                v-model="form.linkedin"
                type="text"
                placeholder="Profile URL"
              />
            </label>
            <label>
              <span>X</span>
              <input v-model="form.x" type="text" placeholder="@handle" />
            </label>
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <div class="modal-actions">
            <Button
              variant="outline"
              type="button"
              :disabled="saving"
              @click="closeModal"
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" :disabled="saving">
              {{
                saving
                  ? "Saving…"
                  : editingContactId
                    ? "Save changes"
                    : "Add contact"
              }}
            </Button>
          </div>
        </form>
      </div>
    </div>

    <div
      v-if="showFindProspectsConfirm"
      class="modal-overlay"
      @click.self="closeFindProspectsConfirm"
    >
      <div
        class="modal-card modal-card--confirm-discovery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-prospects-confirm-title"
      >
        <div class="modal-header">
          <div>
            <h2 id="find-prospects-confirm-title">Find prospects</h2>
            <p class="modal-subcaption">
              ME3 will run one client discovery scan using your saved settings.
            </p>
          </div>
          <button
            class="icon-close"
            type="button"
            @click="closeFindProspectsConfirm"
          >
            ×
          </button>
        </div>
        <div class="confirm-discovery-body">
          <p class="confirm-discovery-summary">
            {{ prospectDiscoverySummary }}
          </p>
        </div>
        <div class="modal-actions modal-actions--wrap">
          <Button
            variant="outline"
            type="button"
            :disabled="discoveryScanning"
            @click="closeFindProspectsConfirm"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            type="button"
            :disabled="discoveryScanning"
            @click="goToClientDiscoveryJob"
          >
            Edit configuration
          </Button>
          <Button
            variant="primary"
            type="button"
            :disabled="discoveryScanning"
            @click="confirmFindProspectsScan"
          >
            {{ discoveryScanning ? "Finding…" : "Find prospects" }}
          </Button>
        </div>
      </div>
    </div>

    <div v-if="historyContact" class="modal-overlay" @click.self="closeHistory">
      <div
        class="modal-card modal-card--history"
        role="dialog"
        aria-modal="true"
      >
        <div class="modal-header">
          <div>
            <h2>{{ historyContact.name }}</h2>
          </div>
          <button class="icon-close" type="button" @click="closeHistory">
            ×
          </button>
        </div>

        <div v-if="historyMessages.length === 0" class="history-empty">
          No outreach messages yet.
        </div>

        <div v-else class="history-list">
          <article
            v-for="message in historyMessages"
            :key="message.id"
            class="history-card"
          >
            <div class="history-meta">
              <span class="tag-pill">
                {{
                  message.messageType === "initial" ? "Initial" : "Follow-up"
                }}
                #{{ message.sequenceNumber }}
              </span>
              <span class="tag-pill">{{
                channelMeta[message.channel].label
              }}</span>
              <span class="tag-pill">{{ message.status }}</span>
              <span class="tag-pill">{{
                formatFullDate(message.sentAt || message.updatedAt)
              }}</span>
            </div>
            <p
              v-if="message.draftSubject || message.finalSubject"
              class="history-subject"
            >
              {{ message.finalSubject || message.draftSubject }}
            </p>
            <pre class="history-body">{{
              message.finalContent || message.draftContent
            }}</pre>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clients-page {
  min-height: 100vh;
}

.clients-main {
  margin: 0 auto;
  padding: 24px 40px 48px;
}

.controls-card,
.state-card,
.empty-state {
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-bg);
}

.table-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.controls-card {
  padding: 12px 14px;
  margin-bottom: 16px;
}

.clients-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.clients-toolbar__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.clients-toolbar__prospect-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 4px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-subtle);
}

.clients-toolbar__prospect-row .prospect-filters--row {
  margin-top: 0;
  padding: 0;
  border: none;
  background: transparent;
  flex: 1 1 auto;
  min-width: 0;
}

.clients-toolbar__prospect-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
  margin-left: auto;
}

.clients-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.prospect-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 12px;
  padding: 4px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-subtle);
}

.prospect-filters__label {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.prospect-filters__list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.contact-filter-select {
  display: grid;
  gap: 6px;
  min-width: 190px;
}

.contact-filter-select span {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.contact-filter-select select {
  width: 100%;
  height: 36px;
  padding: 0 34px 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
}

.contact-filter-select select:focus {
  outline: none;
  border-color: var(--color-text);
}

.contacts-mobile-nav-controls {
  display: none;
}

.prospect-subtab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s;
}

.prospect-subtab:hover {
  color: var(--color-text);
  background: var(--color-bg-muted);
}

.prospect-subtab--active {
  color: var(--color-text);
  background: var(--color-bg);
  box-shadow: 0 0 0 1px var(--color-border-strong);
}

.prospect-subtab--active:hover,
.prospect-subtab--active:focus-visible {
  color: var(--color-text);
  background: var(--color-bg);
}

.prospect-subtab__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
}

.prospect-subtab--active .prospect-subtab__count {
  background: var(--color-bg-subtle);
  color: var(--color-text);
}

.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  max-width: 320px;
  flex: 1 1 200px;
  padding: 0 10px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.search-field--compact input {
  font-size: 13px;
}

.search-field input {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
}

.search-field input:focus {
  outline: none;
}

.state-card {
  padding: 18px 20px;
  margin-bottom: 18px;
}

.state-card--error {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.2);
}

.state-card--success {
  color: #1a7f3c;
  border-color: rgba(26, 127, 60, 0.2);
}

.modal-subcaption {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.modal-card--confirm-discovery {
  max-width: 520px;
}

.confirm-discovery-body {
  padding: 0 20px 8px;
}

.confirm-discovery-summary {
  margin: 0;
  font-size: 15px;
  line-height: 1.55;
  color: var(--color-text);
}

.modal-actions--wrap {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 12px;
  padding: 56px 24px;
  text-align: center;
}

.empty-state h2,
.modal-header h2 {
  margin: 0;
}

.empty-state p {
  margin: 0;
  max-width: 420px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.empty-icon {
  width: 72px;
  height: 72px;
}

.empty-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.ledger-table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  font-size: 13px;
}

.ledger-table thead tr {
  border-bottom: 1px solid var(--color-border);
}

.ledger-table th {
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  white-space: nowrap;
  user-select: none;
}

.ledger-table th.col-center {
  text-align: center;
}

.ledger-table .col-select {
  width: 42px;
  min-width: 42px;
  padding-inline: 8px;
  text-align: center;
}

.ledger-table th.col-sortable {
  cursor: pointer;
}

.ledger-table th.col-sortable:hover {
  color: var(--color-text);
}

.sort-indicator {
  margin-left: 4px;
  font-size: 10px;
}

.ledger-row td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.row-select {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.row-select input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--color-text);
}

.ledger-row:hover {
  background: var(--color-bg-subtle);
}

.ledger-row--highlighted {
  background: var(--color-bg-subtle);
}

.ledger-row--expandable {
  cursor: pointer;
}

.ledger-row--expandable:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: -2px;
}

.icon-close {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.name-cell {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  font-weight: 600;
  text-align: left;
}

.row-toggle {
  font-size: 16px;
  line-height: 1;
  color: var(--color-text-muted);
  font-weight: 600;
}

.cell-email,
.cell-muted {
  color: var(--color-text-muted);
}

.cell-email {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-date {
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.cell-badge {
  text-align: center;
}

.ledger-rel-badge,
.ledger-closeness-badge,
.ledger-contact-status,
.ledger-outreach-status,
.ledger-source-pill,
.website-pill,
.score-pill,
.channel-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0.02em;
  white-space: nowrap;
  border: 1px solid var(--color-border);
}

.ledger-rel-badge--client {
  background: #e6f4ea;
  color: #1a7f3c;
  border-color: rgba(26, 127, 60, 0.25);
}

.ledger-rel-badge--prospect {
  background: #e8f0fe;
  color: #1a56c9;
  border-color: rgba(26, 86, 201, 0.22);
}

.ledger-rel-badge--contact,
.ledger-contact-status--archived,
.ledger-outreach-status--empty,
.channel--other {
  background: rgba(0, 0, 0, 0.04);
  color: var(--color-text-muted);
}

.ledger-closeness-badge--very_close {
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  border-color: rgba(0, 0, 0, 0.9);
}

.ledger-closeness-badge--close {
  background: rgba(0, 0, 0, 0.08);
  color: var(--color-text);
}

.ledger-closeness-badge--acquaintance,
.ledger-closeness-badge--empty {
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
}

.ledger-contact-status--active,
.ledger-outreach-status--replied,
.ledger-outreach-status--booked,
.ledger-outreach-status--converted,
.source--soulink,
.website-pill--strong {
  background: #e6f4ea;
  color: #1a7f3c;
  border-color: rgba(26, 127, 60, 0.22);
}

.ledger-contact-status--dormant,
.ledger-outreach-status--sent,
.ledger-outreach-status--no_response,
.source--outreach,
.website-pill--weak,
.website-pill--none {
  background: #fff8e6;
  color: #8a6100;
  border-color: rgba(138, 97, 0, 0.28);
}

.ledger-outreach-status--drafted,
.ledger-outreach-status--new,
.source--booking,
.channel--email,
.website-pill--decent {
  background: #e8f0fe;
  color: #1a56c9;
  border-color: rgba(26, 86, 201, 0.22);
}

.ledger-outreach-status--not_interested,
.source--manual,
.source--import {
  background: rgba(0, 0, 0, 0.04);
  color: var(--color-text);
}

.source--agent,
.channel--linkedin,
.channel--instagram,
.channel--x {
  background: #f4f0ff;
  color: #5e35b1;
  border-color: rgba(94, 53, 177, 0.22);
}

.website-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plain-link {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.detail-row td {
  padding: 0;
  background: var(--color-bg-subtle);
}

.detail-panel {
  padding: 20px 18px 22px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.detail-grid--prospect {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-grid--contact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  align-items: start;
}

.detail-grid--contact .detail-block {
  padding: 9px 10px;
  border-radius: 8px;
  min-width: 0;
}

.detail-grid--contact .detail-block h3 {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.detail-grid--contact .detail-block p,
.detail-grid--contact .social-list {
  font-size: 12px;
  line-height: 1.4;
}

.detail-grid--contact .detail-block p + p {
  margin-top: 4px;
}

.detail-grid--contact .tag-list {
  gap: 6px;
}

.detail-grid--contact .tag-pill {
  padding: 4px 8px;
  font-size: 11px;
}

.detail-grid--contact .social-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.detail-grid--contact .social-list li {
  display: grid;
  grid-template-columns: 16px auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.social-list__label {
  font-weight: 700;
  color: var(--color-text);
}

.social-list__value {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-block {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
  background: var(--color-bg);
}

.detail-block h3,
.detail-subheading {
  margin: 0 0 8px;
  font-size: 14px;
}

.detail-subheading {
  margin-top: 18px;
}

.detail-block p,
.social-list,
.history-body,
.block-caption {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.detail-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.detail-list div {
  display: grid;
  gap: 2px;
}

.detail-list dt {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.detail-list dd {
  margin: 0;
  color: var(--color-text);
  line-height: 1.5;
}

.social-inline,
.tag-list,
.detail-actions,
.composer-actions,
.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
}

.detail-actions {
  margin-top: 16px;
}

.composer-header,
.history-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.composer-summary {
  margin: 0 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--color-text-muted);
  background: var(--color-bg);
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.field--compact {
  min-width: 170px;
  margin-bottom: 0;
}

.field span,
.contact-form label span {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.field input,
.field select,
.field textarea,
.contact-form input,
.contact-form select,
.contact-form textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  padding: 10px 12px;
}

.field input:focus,
.field select:focus,
.field textarea:focus,
.contact-form input:focus,
.contact-form select:focus,
.contact-form textarea:focus {
  outline: none;
  border-color: var(--color-text);
}

.field textarea,
.history-body,
.contact-form textarea {
  resize: vertical;
  min-height: 88px;
}

.field-grid label,
.contact-form > label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-preview {
  display: grid;
  gap: 10px;
}

.history-subject {
  font-weight: 700;
  color: var(--color-text);
}

.mini-state,
.empty-filter-state,
.history-empty {
  color: var(--color-text-muted);
  font-size: 13px;
}

.empty-filter-state {
  padding: 12px 14px;
  border-top: 1px solid var(--color-border);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
}

.modal-card {
  width: min(760px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
}

.modal-card--history {
  width: min(820px, 100%);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 0;
}

.icon-close {
  font-size: 26px;
  cursor: pointer;
}

.contact-form {
  padding: 20px 22px 22px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.form-error {
  margin: 0 0 12px;
  color: #b42318;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.history-list {
  display: grid;
  gap: 12px;
  padding: 20px 22px 22px;
}

.history-card {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
  background: var(--color-bg-subtle);
}

.history-body {
  white-space: pre-wrap;
  font-family: inherit;
}

.history-empty {
  padding: 20px 22px 22px;
}

.social-list {
  padding-left: 18px;
}

@media (max-width: 900px) {
  .clients-main {
    padding: 20px 16px 40px;
  }

  .controls-card {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .table-card {
    margin-inline: -16px;
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  }

  .detail-grid,
  .detail-grid--prospect,
  .detail-grid--contact,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    padding: 14px 12px 16px;
  }

  .detail-grid--contact {
    gap: 8px;
  }

  .detail-grid--contact .detail-block {
    padding: 8px 10px;
  }

  .detail-grid--contact .detail-block h3 {
    font-size: 10px;
  }

  .detail-grid--contact .detail-block p,
  .detail-grid--contact .social-list {
    font-size: 12px;
  }

  .composer-header,
  .history-header,
  .clients-toolbar__main {
    align-items: stretch;
    flex-direction: column;
  }

  .clients-toolbar__actions {
    width: 100%;
  }

  .contact-filter-select {
    display: none;
  }

  .clients-toolbar__actions :deep(.btn) {
    display: none;
  }

  .contacts-mobile-nav-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 40px 40px;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .contacts-mobile-filter {
    min-width: 0;
    width: 100%;
    height: 40px;
    padding: 0 34px 0 10px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
  }

  .contacts-mobile-filter:focus {
    outline: none;
    border-color: var(--color-text);
  }

  .contacts-mobile-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
  }

  .contacts-mobile-action--primary {
    border-color: var(--color-text);
    background: var(--color-text);
    color: var(--color-bg);
  }

  .contacts-mobile-action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .clients-toolbar__prospect-row {
    flex-direction: column;
    align-items: stretch;
  }

  .clients-toolbar__prospect-row .clients-toolbar__prospect-actions {
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
  }

  .search-field {
    max-width: none;
  }
}
</style>
