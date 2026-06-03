import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api";

export type ContactSource =
  | "booking"
  | "manual"
  | "agent"
  | "import"
  | "outreach"
  | "soulink";

export type ContactRelationship =
  | "client"
  | "prospect"
  | "contact";

export type ContactCloseness =
  | "very_close"
  | "close"
  | "acquaintance";

export type ContactStatus = "active" | "archived" | "dormant";
export type OutreachStatus =
  | "new"
  | "drafted"
  | "sent"
  | "replied"
  | "booked"
  | "converted"
  | "not_interested"
  | "no_response";
export type OutreachChannel = "email" | "linkedin" | "instagram" | "x" | "other";
export type WebsiteStatus = "none" | "weak" | "decent" | "strong";
export type ContactOutreachMeta = {
  outreachChannel?: OutreachChannel | null;
  websiteUrl?: string | null;
  websiteStatus?: WebsiteStatus | null;
  websiteNotes?: string | null;
  closeness?: ContactCloseness | null;
  niche?: string | null;
  location?: string | null;
  fitScore?: number | null;
  fitReason?: string | null;
  messageAngle?: string | null;
  sourceUrl?: string | null;
  discoveryJobId?: string | null;
  avatarUrl?: string | null;
  me3Url?: string | null;
  soulinkLinkId?: string | null;
  soulinkNodeId?: string | null;
  soulinkChatUrl?: string | null;
  soulinkOrigin?: string | null;
  soulinkSourceChatId?: string | null;
  soulinkContextLabel?: string | null;
  soulinkSourceChatTitle?: string | null;
  soulinkSourceChatKind?: string | null;
  soulinkStatus?: string | null;
  soulinkLastActiveAt?: string | null;
} & Record<string, unknown>;
export type ContactOutreachSummary = Record<OutreachStatus, number>;

export type Contact = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: ContactSource;
  sourceRef: string | null;
  relationship: ContactRelationship;
  closeness: ContactCloseness | null;
  status: ContactStatus;
  notes: string | null;
  tags: string[];
  lastInteractionAt: string | null;
  nextFollowupAt: string | null;
  outreachStatus: OutreachStatus | null;
  socialHandles: Record<string, string>;
  metadata: ContactOutreachMeta | null;
  createdAt: string;
  updatedAt: string;
  bookingCount: number;
  lastBookingAt: string | null;
};

export type ContactSummary = {
  total: number;
  clients: number;
  prospects: number;
  contacts: number;
  active: number;
  dormant: number;
  archived: number;
  needsFollowUp: number;
  outreach: ContactOutreachSummary;
};

export type ContactInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: ContactSource;
  relationship?: ContactRelationship;
  closeness?: ContactCloseness | null;
  status?: ContactStatus;
  notes?: string | null;
  tags?: string[];
  lastInteractionAt?: string | null;
  nextFollowupAt?: string | null;
  outreachStatus?: OutreachStatus | null;
  socialHandles?: Record<string, string>;
  metadata?: ContactOutreachMeta | null;
};

type ContactsResponse = {
  contacts: Contact[];
  summary: ContactSummary;
};

const emptySummary = (): ContactSummary => ({
  total: 0,
  clients: 0,
  prospects: 0,
  contacts: 0,
  active: 0,
  dormant: 0,
  archived: 0,
  needsFollowUp: 0,
  outreach: {
    new: 0,
    drafted: 0,
    sent: 0,
    replied: 0,
    booked: 0,
    converted: 0,
    not_interested: 0,
    no_response: 0,
  },
});

export const useContactsStore = defineStore("contacts", () => {
  const contacts = ref<Contact[]>([]);
  const summary = ref<ContactSummary>(emptySummary());
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function fetchContacts(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.get<ContactsResponse>("/contacts");
      contacts.value = response.contacts;
      summary.value = response.summary;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load contacts";
    } finally {
      loading.value = false;
    }
  }

  async function createContact(input: ContactInput): Promise<Contact | null> {
    saving.value = true;
    error.value = null;

    try {
      const response = await api.post<{ ok: boolean; contact: Contact }>("/contacts", input);
      await fetchContacts();
      return response.contact;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to create contact";
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateContact(
    contactId: string,
    input: Partial<ContactInput>,
  ): Promise<Contact | null> {
    saving.value = true;
    error.value = null;

    try {
      const response = await api.put<{ ok: boolean; contact: Contact }>(
        `/contacts/${contactId}`,
        input,
      );
      await fetchContacts();
      return response.contact;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to update contact";
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteContact(contactId: string): Promise<boolean> {
    saving.value = true;
    error.value = null;

    try {
      await api.delete<{ ok: boolean }>(`/contacts/${contactId}`);
      await fetchContacts();
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to delete contact";
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function updateOutreachStatus(
    contactId: string,
    input: {
      outreachStatus: OutreachStatus | null;
      nextFollowupAt?: string | null;
      channel?: OutreachChannel | null;
    },
  ): Promise<Contact | null> {
    saving.value = true;
    error.value = null;

    try {
      const response = await api.put<{ ok: boolean; contact: Contact }>(
        `/contacts/${contactId}/outreach-status`,
        input,
      );
      await fetchContacts();
      return response.contact;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to update outreach status";
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function convertToClient(contactId: string): Promise<Contact | null> {
    saving.value = true;
    error.value = null;

    try {
      const response = await api.post<{ ok: boolean; contact: Contact }>(
        `/contacts/${contactId}/convert`,
      );
      await fetchContacts();
      return response.contact;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to convert contact";
      return null;
    } finally {
      saving.value = false;
    }
  }

  return {
    contacts,
    summary,
    loading,
    saving,
    error,
    fetchContacts,
    createContact,
    updateContact,
    deleteContact,
    updateOutreachStatus,
    convertToClient,
  };
});
