export const ME3_AGENT_CONTEXT_SCHEMA_VERSION = "2026-05-16.v1";

export type Me3AgentContextPurpose =
  | "chat_reply"
  | "assistant_job"
  | "mission_review"
  | "memory_review"
  | "debug";

export type Me3AgentContextSurface = "core" | "hosted" | "shared";

export type Me3AgentContextVisibility = "public" | "private" | "internal";

export type Me3AgentContextSourceKind =
  | "owner_profile"
  | "public_me_json"
  | "private_memory"
  | "contact"
  | "email_thread"
  | "calendar_event"
  | "task"
  | "project"
  | "mission_capture"
  | "assistant_message"
  | "agent_job"
  | "plugin"
  | "manual"
  | "unknown";

export type Me3AgentContextSourceStatus =
  | "included"
  | "trimmed"
  | "omitted"
  | "failed";

export type Me3AgentContextSource = {
  id: string;
  kind: Me3AgentContextSourceKind;
  label: string;
  visibility: Me3AgentContextVisibility;
  status?: Me3AgentContextSourceStatus;
  reason?: string;
  sourceRef?: string | null;
  updatedAt?: string | null;
};

export type Me3AgentContextBudget = {
  maxPromptChars: number;
  reservedResponseChars?: number;
  strategy: "stable_order_trim_tail";
  usedPromptChars?: number;
  wasTrimmed?: boolean;
  trimReason?: string | null;
};

export type Me3AgentContextOwnerProfile = {
  displayName?: string | null;
  username?: string | null;
  bio?: string | null;
  timezone?: string | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextPublicIdentity = {
  summary?: string | null;
  meJsonUrl?: string | null;
  offers?: readonly string[];
  actions?: readonly string[];
  source: Me3AgentContextSource;
};

export type Me3AgentContextPrivateMemory = {
  id: string;
  kind: string;
  title?: string | null;
  body: string;
  scope?: string | null;
  confidence?: number | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextContact = {
  id: string;
  name: string;
  relationship?: string | null;
  summary?: string | null;
  lastInteractionAt?: string | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextEmailThread = {
  id: string;
  subject?: string | null;
  participants?: readonly string[];
  summary: string;
  lastMessageAt?: string | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextProject = {
  id: string;
  name: string;
  summary?: string | null;
  status?: string | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextTask = {
  id: string;
  title: string;
  status?: string | null;
  dueAt?: string | null;
  projectId?: string | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextCalendarEvent = {
  id: string;
  title: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextRecentMessage = {
  id?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string | null;
  source: Me3AgentContextSource;
};

export type Me3AgentContextPacketInput = {
  id?: string;
  generatedAt?: string;
  ownerId: string;
  purpose: Me3AgentContextPurpose;
  surface?: Me3AgentContextSurface;
  requestSummary?: string | null;
  ownerProfile?: Me3AgentContextOwnerProfile | null;
  publicIdentity?: Me3AgentContextPublicIdentity | null;
  privateMemory?: readonly Me3AgentContextPrivateMemory[];
  contacts?: readonly Me3AgentContextContact[];
  emailThreads?: readonly Me3AgentContextEmailThread[];
  projects?: readonly Me3AgentContextProject[];
  tasks?: readonly Me3AgentContextTask[];
  calendarEvents?: readonly Me3AgentContextCalendarEvent[];
  recentMessages?: readonly Me3AgentContextRecentMessage[];
  sources?: readonly Me3AgentContextSource[];
  budget?: Partial<Me3AgentContextBudget>;
  warnings?: readonly string[];
};

export type Me3AgentContextPacket = {
  schemaVersion: typeof ME3_AGENT_CONTEXT_SCHEMA_VERSION;
  id: string;
  generatedAt: string;
  ownerId: string;
  purpose: Me3AgentContextPurpose;
  surface: Me3AgentContextSurface;
  requestSummary: string | null;
  ownerProfile: Me3AgentContextOwnerProfile | null;
  publicIdentity: Me3AgentContextPublicIdentity | null;
  privateMemory: readonly Me3AgentContextPrivateMemory[];
  contacts: readonly Me3AgentContextContact[];
  emailThreads: readonly Me3AgentContextEmailThread[];
  projects: readonly Me3AgentContextProject[];
  tasks: readonly Me3AgentContextTask[];
  calendarEvents: readonly Me3AgentContextCalendarEvent[];
  recentMessages: readonly Me3AgentContextRecentMessage[];
  sources: readonly Me3AgentContextSource[];
  budget: Me3AgentContextBudget;
  warnings: readonly string[];
};

export type Me3AgentContextPrompt = {
  text: string;
  budget: Me3AgentContextBudget;
};

export type Me3AgentContextValidationIssue = {
  path: string;
  message: string;
};

const DEFAULT_CONTEXT_BUDGET: Me3AgentContextBudget = {
  maxPromptChars: 6000,
  reservedResponseChars: 1200,
  strategy: "stable_order_trim_tail",
  usedPromptChars: 0,
  wasTrimmed: false,
  trimReason: null,
};

const PUBLIC_SOURCE_KINDS = new Set<Me3AgentContextSourceKind>([
  "owner_profile",
  "public_me_json",
]);

export function createMe3AgentContextPacket(
  input: Me3AgentContextPacketInput,
): Me3AgentContextPacket {
  const packetWithoutSources: Omit<Me3AgentContextPacket, "sources"> = {
    schemaVersion: ME3_AGENT_CONTEXT_SCHEMA_VERSION,
    id: input.id || `agent-context:${input.ownerId}:${input.purpose}`,
    generatedAt: input.generatedAt || new Date().toISOString(),
    ownerId: input.ownerId,
    purpose: input.purpose,
    surface: input.surface || "core",
    requestSummary: input.requestSummary || null,
    ownerProfile: input.ownerProfile
      ? normalizeOwnerProfile(input.ownerProfile)
      : null,
    publicIdentity: input.publicIdentity
      ? normalizePublicIdentity(input.publicIdentity)
      : null,
    privateMemory: (input.privateMemory || []).map(normalizePrivateMemory),
    contacts: (input.contacts || []).map(normalizeContact),
    emailThreads: (input.emailThreads || []).map(normalizeEmailThread),
    projects: (input.projects || []).map(normalizeProject),
    tasks: (input.tasks || []).map(normalizeTask),
    calendarEvents: (input.calendarEvents || []).map(normalizeCalendarEvent),
    recentMessages: (input.recentMessages || []).map(normalizeRecentMessage),
    budget: normalizeBudget(input.budget),
    warnings: [...(input.warnings || [])],
  };

  const providedSources = (input.sources || []).map(normalizeSource);
  const derivedSources = collectMe3AgentContextSources(packetWithoutSources);

  return {
    ...packetWithoutSources,
    sources: mergeSources([...providedSources, ...derivedSources]),
  };
}

export function buildMe3AgentContextPrompt(
  packet: Me3AgentContextPacket,
): Me3AgentContextPrompt {
  const lines = [
    "ME3 agent context packet:",
    `Schema: ${packet.schemaVersion}`,
    `Purpose: ${packet.purpose}`,
    `Owner: ${packet.ownerId}`,
    packet.requestSummary ? `Request: ${packet.requestSummary}` : null,
    "",
    formatOwnerProfile(packet.ownerProfile),
    formatPublicIdentity(packet.publicIdentity),
    formatList(
      "Private memory",
      packet.privateMemory,
      (item) => `- ${labelWithOptionalTitle(item.kind, item.title)}: ${item.body}`,
    ),
    formatList(
      "Contacts",
      packet.contacts,
      (contact) =>
        `- ${contact.name}${contact.relationship ? ` (${contact.relationship})` : ""}: ${
          contact.summary || "No summary."
        }`,
    ),
    formatList(
      "Email threads",
      packet.emailThreads,
      (thread) =>
        `- ${thread.subject || thread.id}: ${thread.summary}${
          thread.participants?.length
            ? ` Participants: ${thread.participants.join(", ")}.`
            : ""
        }`,
    ),
    formatList(
      "Projects",
      packet.projects,
      (project) =>
        `- ${project.name}${project.status ? ` [${project.status}]` : ""}: ${
          project.summary || "No summary."
        }`,
    ),
    formatList(
      "Tasks",
      packet.tasks,
      (task) =>
        `- ${task.title}${task.status ? ` [${task.status}]` : ""}${
          task.dueAt ? ` due ${task.dueAt}` : ""
        }`,
    ),
    formatList(
      "Calendar",
      packet.calendarEvents,
      (event) =>
        `- ${event.title}${event.startsAt ? ` starts ${event.startsAt}` : ""}${
          event.timezone ? ` ${event.timezone}` : ""
        }`,
    ),
    formatList(
      "Recent assistant messages",
      packet.recentMessages,
      (message) => `- ${message.role}: ${message.content}`,
    ),
    formatList(
      "Context sources",
      packet.sources,
      (source) =>
        `- ${source.kind}:${source.id} [${source.visibility}, ${
          source.status || "included"
        }] ${source.label}${source.reason ? ` - ${source.reason}` : ""}`,
    ),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const maxPromptChars = Math.max(120, packet.budget.maxPromptChars);
  if (lines.length <= maxPromptChars) {
    return {
      text: lines,
      budget: {
        ...packet.budget,
        usedPromptChars: lines.length,
        wasTrimmed: false,
        trimReason: null,
      },
    };
  }

  const suffix = "\n[Context trimmed to prompt budget]";
  const text = `${lines.slice(0, maxPromptChars - suffix.length)}${suffix}`;
  return {
    text,
    budget: {
      ...packet.budget,
      usedPromptChars: text.length,
      wasTrimmed: true,
      trimReason: "maxPromptChars",
    },
  };
}

export function validateMe3AgentContextPacket(
  packet: Me3AgentContextPacket,
): readonly Me3AgentContextValidationIssue[] {
  const issues: Me3AgentContextValidationIssue[] = [];

  for (const source of packet.sources) {
    if (!PUBLIC_SOURCE_KINDS.has(source.kind) && source.visibility === "public") {
      issues.push({
        path: `sources.${source.id}.visibility`,
        message: `${source.kind} context cannot be marked public.`,
      });
    }
  }

  if (packet.publicIdentity && packet.publicIdentity.source.visibility !== "public") {
    issues.push({
      path: "publicIdentity.source.visibility",
      message: "Public identity context must come from a public source.",
    });
  }

  for (const [index, memory] of packet.privateMemory.entries()) {
    if (memory.source.visibility === "public") {
      issues.push({
        path: `privateMemory.${index}.source.visibility`,
        message: "Private memory cannot be marked public.",
      });
    }
  }

  return issues;
}

function normalizeBudget(
  budget: Partial<Me3AgentContextBudget> | undefined,
): Me3AgentContextBudget {
  return {
    ...DEFAULT_CONTEXT_BUDGET,
    ...budget,
    strategy: "stable_order_trim_tail",
    maxPromptChars: Math.max(120, budget?.maxPromptChars ?? DEFAULT_CONTEXT_BUDGET.maxPromptChars),
    trimReason: budget?.trimReason ?? null,
  };
}

function normalizeOwnerProfile(
  profile: Me3AgentContextOwnerProfile,
): Me3AgentContextOwnerProfile {
  return {
    ...profile,
    source: normalizeSource(profile.source),
  };
}

function normalizePublicIdentity(
  identity: Me3AgentContextPublicIdentity,
): Me3AgentContextPublicIdentity {
  return {
    ...identity,
    offers: identity.offers ? [...identity.offers] : undefined,
    actions: identity.actions ? [...identity.actions] : undefined,
    source: {
      ...normalizeSource(identity.source),
      visibility: "public",
    },
  };
}

function normalizePrivateMemory(
  memory: Me3AgentContextPrivateMemory,
): Me3AgentContextPrivateMemory {
  return {
    ...memory,
    source: normalizeSource(memory.source),
  };
}

function normalizeContact(contact: Me3AgentContextContact): Me3AgentContextContact {
  return {
    ...contact,
    source: normalizeSource(contact.source),
  };
}

function normalizeEmailThread(
  thread: Me3AgentContextEmailThread,
): Me3AgentContextEmailThread {
  return {
    ...thread,
    participants: thread.participants ? [...thread.participants] : undefined,
    source: normalizeSource(thread.source),
  };
}

function normalizeProject(project: Me3AgentContextProject): Me3AgentContextProject {
  return {
    ...project,
    source: normalizeSource(project.source),
  };
}

function normalizeTask(task: Me3AgentContextTask): Me3AgentContextTask {
  return {
    ...task,
    source: normalizeSource(task.source),
  };
}

function normalizeCalendarEvent(
  event: Me3AgentContextCalendarEvent,
): Me3AgentContextCalendarEvent {
  return {
    ...event,
    source: normalizeSource(event.source),
  };
}

function normalizeRecentMessage(
  message: Me3AgentContextRecentMessage,
): Me3AgentContextRecentMessage {
  return {
    ...message,
    source: normalizeSource(message.source),
  };
}

function normalizeSource(source: Me3AgentContextSource): Me3AgentContextSource {
  return {
    ...source,
    visibility: normalizeSourceVisibility(source.kind, source.visibility),
    status: source.status || "included",
    sourceRef: source.sourceRef ?? null,
  };
}

function normalizeSourceVisibility(
  kind: Me3AgentContextSourceKind,
  visibility: Me3AgentContextVisibility,
): Me3AgentContextVisibility {
  if (visibility === "public" && !PUBLIC_SOURCE_KINDS.has(kind)) {
    return "private";
  }
  return visibility;
}

function collectMe3AgentContextSources(
  packet: Omit<Me3AgentContextPacket, "sources">,
): readonly Me3AgentContextSource[] {
  return [
    packet.ownerProfile?.source,
    packet.publicIdentity?.source,
    ...packet.privateMemory.map((item) => item.source),
    ...packet.contacts.map((item) => item.source),
    ...packet.emailThreads.map((item) => item.source),
    ...packet.projects.map((item) => item.source),
    ...packet.tasks.map((item) => item.source),
    ...packet.calendarEvents.map((item) => item.source),
    ...packet.recentMessages.map((item) => item.source),
  ].filter((source): source is Me3AgentContextSource => Boolean(source));
}

function mergeSources(
  sources: readonly Me3AgentContextSource[],
): readonly Me3AgentContextSource[] {
  const byKey = new Map<string, Me3AgentContextSource>();
  for (const source of sources) {
    byKey.set(`${source.kind}:${source.id}`, source);
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
  );
}

function formatOwnerProfile(
  profile: Me3AgentContextOwnerProfile | null,
): string | null {
  if (!profile) return null;
  return [
    "Owner profile:",
    profile.displayName ? `- Name: ${profile.displayName}` : null,
    profile.username ? `- Username: ${profile.username}` : null,
    profile.bio ? `- Bio: ${profile.bio}` : null,
    profile.timezone ? `- Timezone: ${profile.timezone}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function formatPublicIdentity(
  identity: Me3AgentContextPublicIdentity | null,
): string | null {
  if (!identity) return null;
  return [
    "Public identity:",
    identity.summary ? `- Summary: ${identity.summary}` : null,
    identity.meJsonUrl ? `- me.json: ${identity.meJsonUrl}` : null,
    identity.offers?.length ? `- Offers: ${identity.offers.join(", ")}` : null,
    identity.actions?.length ? `- Actions: ${identity.actions.join(", ")}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function formatList<T>(
  title: string,
  items: readonly T[],
  format: (item: T) => string,
): string | null {
  if (!items.length) return null;
  return [title, ...items.map(format)].join("\n");
}

function labelWithOptionalTitle(kind: string, title?: string | null): string {
  return title ? `${kind} / ${title}` : kind;
}
