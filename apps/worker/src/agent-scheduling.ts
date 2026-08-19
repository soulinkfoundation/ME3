import type {
  CoreSchedulingOption,
  CoreSchedulingToolServices,
} from "./agent-chat";
import { formatUtcInstantInTimeZone } from "./booking";
import { addDaysToDateString, resolveTimeZone } from "./calendar";
import {
  approveSchedulingRequest,
  finalizeSchedulingRequest,
  generateSchedulingCandidateSlots,
  getSchedulingRequest,
  listSchedulingTimeTypes,
  parseSchedulingDateRange,
  type SchedulingRequestSlot,
  type SchedulingTimeType,
} from "./scheduling";
import type {
  DbAgentChannelConnection,
  DbContact,
  DbSchedulingRequest,
  Env,
} from "./types";

const DEFAULT_SOULINK_API_ORIGIN = "https://soulinkfoundation.org";
const AGENT_SCHEDULING_PROTOCOL_VERSION = "2026-08-19";
const DEFAULT_DURATION_MINUTES = 30;
const DEFAULT_WINDOW_DAYS = 7;
const MAX_RELAY_CANDIDATES = 180;

type AgentSchedulingRole = "requester" | "target";
type AgentSchedulingRelayKind =
  | "schedule.request"
  | "schedule.selection"
  | "schedule.approval";

export type AgentSchedulingRelayMessage = {
  version: typeof AGENT_SCHEDULING_PROTOCOL_VERSION;
  kind: AgentSchedulingRelayKind;
  requestId: string;
  sourceNodeId: string;
  sourceName: string;
  targetNodeId: string;
  durationMinutes: number;
  dateRange: { start: string; end: string };
  reason: string | null;
  candidateSlots: SchedulingRequestSlot[];
  selectedSlot: SchedulingRequestSlot | null;
};

type SchedulingPeerPolicy = {
  protocolVersion: string;
  role: AgentSchedulingRole;
  peerNodeId: string;
  durationMinutes: number;
};

type SchedulingRequestWithContact = DbSchedulingRequest & {
  contact_name: string | null;
};

export function createAgentSchedulingToolServices(
  env: Env,
  ownerId: string,
): CoreSchedulingToolServices {
  return {
    searchContacts: (input) => searchAgentSchedulingContacts(env, ownerId, input),
    request: (input, idempotencyKey) =>
      requestAgentScheduling(env, ownerId, input, idempotencyKey),
    approve: (input, idempotencyKey) =>
      approveAgentScheduling(env, ownerId, input, idempotencyKey),
  };
}

export function resolveAgentSchedulingDefaults(
  input: {
    durationMinutes?: number;
    dateFrom?: string;
    dateTo?: string;
  },
  timezoneInput: string | null | undefined,
  now = new Date(),
) {
  const timezone = resolveTimeZone(timezoneInput);
  const today = localDateForInstant(now, timezone);
  const usedDefaultDuration = input.durationMinutes === undefined;
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 180
  ) {
    throw new Error("Meeting duration must be a whole number from 15 to 180 minutes.");
  }

  const usedDefaultDateRange = !input.dateFrom || !input.dateTo;
  const start = input.dateFrom || today;
  const end = input.dateTo || addDaysToDateString(start, DEFAULT_WINDOW_DAYS - 1);
  const dateRange = parseSchedulingDateRange({ start, end });
  if ("error" in dateRange) throw new Error(dateRange.error);

  return {
    durationMinutes,
    dateRange,
    usedDefaultDuration,
    usedDefaultDateRange,
  };
}

export function intersectAgentSchedulingSlots(
  proposed: readonly SchedulingRequestSlot[],
  available: readonly SchedulingRequestSlot[],
  limit = 5,
): SchedulingRequestSlot[] {
  const availableKeys = new Set(
    available.map((slot) => `${slot.startsAt}\n${slot.endsAt}`),
  );
  return proposed
    .filter((slot) => availableKeys.has(`${slot.startsAt}\n${slot.endsAt}`))
    .slice(0, Math.max(0, limit));
}

export function parseAgentSchedulingRelayMessage(
  value: unknown,
): AgentSchedulingRelayMessage | null {
  if (!isRecord(value)) return null;
  if (value.version !== AGENT_SCHEDULING_PROTOCOL_VERSION) return null;
  if (
    value.kind !== "schedule.request" &&
    value.kind !== "schedule.selection" &&
    value.kind !== "schedule.approval"
  ) {
    return null;
  }
  const requestId = shortText(value.requestId, 160);
  const sourceNodeId = shortText(value.sourceNodeId, 200);
  const sourceName = shortText(value.sourceName, 160);
  const targetNodeId = shortText(value.targetNodeId, 200);
  const durationMinutes = numericInteger(value.durationMinutes);
  const dateRange = parseSchedulingDateRange(value.dateRange);
  const candidateSlots = Array.isArray(value.candidateSlots)
    ? value.candidateSlots
      .slice(0, MAX_RELAY_CANDIDATES)
      .map(parseRelaySlot)
      .filter((slot): slot is SchedulingRequestSlot => Boolean(slot))
    : [];
  const selectedSlot = value.selectedSlot === null || value.selectedSlot === undefined
    ? null
    : parseRelaySlot(value.selectedSlot);
  if (
    !requestId ||
    !sourceNodeId ||
    !sourceName ||
    !targetNodeId ||
    durationMinutes === null ||
    durationMinutes < 15 ||
    durationMinutes > 180 ||
    "error" in dateRange ||
    (value.kind === "schedule.request" && candidateSlots.length === 0) ||
    (value.kind !== "schedule.request" && !selectedSlot)
  ) {
    return null;
  }
  return {
    version: AGENT_SCHEDULING_PROTOCOL_VERSION,
    kind: value.kind,
    requestId,
    sourceNodeId,
    sourceName,
    targetNodeId,
    durationMinutes,
    dateRange,
    reason: shortText(value.reason, 500) || null,
    candidateSlots,
    selectedSlot,
  };
}

export async function getAgentSchedulingConnectionByDispatchToken(
  env: Env,
  token: string,
) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token,
            provider_connection_id, provider_user_id, provider_thread_id,
            provider_username, provider_metadata_json,
            telegram_user_id, telegram_chat_id, telegram_username,
            telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at,
            updated_at
     FROM agent_channel_connections
     WHERE setup_token = ? AND channel = 'soulink' AND status = 'active'`,
  )
    .bind(token)
    .first<DbAgentChannelConnection>();
}

export async function receiveAgentSchedulingRelay(
  env: Env,
  connection: DbAgentChannelConnection,
  message: AgentSchedulingRelayMessage,
): Promise<{
  status: "options_ready" | "no_mutual_availability" | "waiting_for_owner" | "booked";
  options?: CoreSchedulingOption[];
}> {
  const ownerNodeId = schedulingConnectionOwnerNodeId(connection);
  if (!ownerNodeId || ownerNodeId !== message.targetNodeId) {
    throw new AgentSchedulingError(
      "Scheduling relay target does not match this ME3 installation.",
      403,
    );
  }
  if (message.sourceNodeId === ownerNodeId) {
    throw new AgentSchedulingError("An assistant cannot schedule with itself.", 400);
  }

  if (message.kind === "schedule.request") {
    return receiveAgentSchedulingRequest(env, connection, message);
  }
  if (message.kind === "schedule.selection") {
    return receiveAgentSchedulingSelection(env, connection, message);
  }
  return receiveAgentSchedulingApproval(env, connection, message);
}

export class AgentSchedulingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function searchAgentSchedulingContacts(
  env: Env,
  ownerId: string,
  input: { query?: string; limit?: number },
) {
  const query = shortText(input.query, 160);
  const limit = clampInteger(input.limit, 1, 10, 5);
  const rows = query
    ? await env.DB.prepare(
      `SELECT id, user_id, name, email, phone, source, source_ref,
              relationship, status, notes, tags, last_interaction_at,
              next_followup_at, outreach_status, social_handles, metadata,
              created_at, updated_at
       FROM contacts
       WHERE user_id = ? AND status = 'active'
         AND (name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)
       ORDER BY CASE WHEN lower(name) = lower(?) THEN 0 ELSE 1 END,
                updated_at DESC
       LIMIT ?`,
    )
      .bind(ownerId, `%${query}%`, `%${query}%`, query, limit)
      .all<DbContact>()
    : await env.DB.prepare(
      `SELECT id, user_id, name, email, phone, source, source_ref,
              relationship, status, notes, tags, last_interaction_at,
              next_followup_at, outreach_status, social_handles, metadata,
              created_at, updated_at
       FROM contacts
       WHERE user_id = ? AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
      .bind(ownerId, limit)
      .all<DbContact>();
  const contacts = (rows.results || []).map((contact) => ({
    name: contact.name,
    relationship: contact.relationship,
    me3AssistantAvailable: Boolean(soulinkPeerNodeId(contact)),
  }));
  return { contacts, total: contacts.length };
}

async function requestAgentScheduling(
  env: Env,
  ownerId: string,
  input: {
    contact: string;
    durationMinutes?: number;
    dateFrom?: string;
    dateTo?: string;
    reason?: string;
  },
  idempotencyKey: string,
) {
  const contact = await resolveAgentSchedulingContact(env, ownerId, input.contact);
  const targetNodeId = soulinkPeerNodeId(contact);
  if (!targetNodeId) {
    throw new AgentSchedulingError(
      `${contact.name} does not have a connected ME3 assistant in the synced Soulink contact.`,
      409,
    );
  }
  const owner = await getSchedulingOwner(env, ownerId);
  const defaults = resolveAgentSchedulingDefaults(input, owner.timezone);
  const timeType = await schedulingTimeTypeForDuration(
    env,
    ownerId,
    defaults.durationMinutes,
  );
  const proposedSlots = await generateSchedulingCandidateSlots(env, ownerId, {
    timeType,
    dateRange: defaults.dateRange,
    limit: MAX_RELAY_CANDIDATES,
  });
  if (proposedSlots.length === 0) {
    return {
      contactName: contact.name,
      durationMinutes: defaults.durationMinutes,
      dateRange: defaults.dateRange,
      usedDefaultDuration: defaults.usedDefaultDuration,
      usedDefaultDateRange: defaults.usedDefaultDateRange,
      status: "no_owner_availability" as const,
      options: [],
    };
  }

  const connection = await getOwnerSchedulingConnection(env, ownerId);
  if (!connection) {
    throw new AgentSchedulingError("Connect Soulink before asking another ME3 assistant.", 409);
  }
  const sourceNodeId = schedulingConnectionOwnerNodeId(connection);
  if (!sourceNodeId) {
    throw new AgentSchedulingError("The Soulink connection is missing its owner identity.", 409);
  }
  const requestId = idempotencyKey;
  const reason = shortText(input.reason, 500) || null;
  await upsertPeerSchedulingRequest(env, {
    requestId,
    ownerId,
    contact,
    timeType,
    role: "requester",
    peerNodeId: targetNodeId,
    requesterName: owner.name || "ME3 owner",
    targetName: contact.name,
    reason,
    dateRange: defaults.dateRange,
    candidateSlots: [],
    selectedSlot: null,
    status: "draft",
  });

  const message: AgentSchedulingRelayMessage = {
    version: AGENT_SCHEDULING_PROTOCOL_VERSION,
    kind: "schedule.request",
    requestId,
    sourceNodeId,
    sourceName: owner.name || "ME3 owner",
    targetNodeId,
    durationMinutes: defaults.durationMinutes,
    dateRange: defaults.dateRange,
    reason,
    candidateSlots: proposedSlots,
    selectedSlot: null,
  };
  const relayed = await relayAgentSchedulingMessage(env, connection, message);
  const slots = parseRelayOptions(relayed.options);
  await upsertPeerSchedulingRequest(env, {
    requestId,
    ownerId,
    contact,
    timeType,
    role: "requester",
    peerNodeId: targetNodeId,
    requesterName: owner.name || "ME3 owner",
    targetName: contact.name,
    reason,
    dateRange: defaults.dateRange,
    candidateSlots: slots,
    selectedSlot: null,
    status: "candidates_shared",
  });
  await recordSchedulingAudit(env, requestId, ownerId, "candidates_shared", "assistant",
    `Received ${slots.length} mutual candidate slots from ${contact.name}'s ME3 assistant`,
    { peerNodeId: targetNodeId, durationMinutes: defaults.durationMinutes });

  return {
    contactName: contact.name,
    durationMinutes: defaults.durationMinutes,
    dateRange: defaults.dateRange,
    usedDefaultDuration: defaults.usedDefaultDuration,
    usedDefaultDateRange: defaults.usedDefaultDateRange,
    status: slots.length > 0
      ? "options_ready" as const
      : "no_mutual_availability" as const,
    options: schedulingOptions(slots, owner.timezone),
  };
}

async function approveAgentScheduling(
  env: Env,
  ownerId: string,
  input: { contact?: string; option?: number; confirmed: boolean },
  _idempotencyKey: string,
) {
  if (!input.confirmed) {
    throw new AgentSchedulingError("The owner must explicitly approve the scheduling action.", 400);
  }
  const request = await findOpenPeerSchedulingRequest(env, ownerId, input.contact);
  const policy = peerPolicy(request.policy_json);
  if (!policy) throw new AgentSchedulingError("This scheduling request is not an agent relay.", 409);
  const connection = await getOwnerSchedulingConnection(env, ownerId);
  if (!connection) throw new AgentSchedulingError("Soulink is no longer connected.", 409);
  const owner = await getSchedulingOwner(env, ownerId);

  if (policy.role === "requester") {
    const candidates = parseStoredSlots(request.candidate_slots_json);
    const option = input.option ?? (candidates.length === 1 ? 1 : null);
    if (!option || option < 1 || option > candidates.length) {
      throw new AgentSchedulingError(
        "Choose one of the numbered mutual scheduling options before approving.",
        400,
      );
    }
    const selectedSlot = candidates[option - 1];
    const approved = await approveSchedulingRequest(env, ownerId, request.id, {
      participantRole: "requester",
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
    });
    if ("error" in approved) throw new AgentSchedulingError(approved.error, approved.status);
    await relayAgentSchedulingMessage(env, connection, {
      version: AGENT_SCHEDULING_PROTOCOL_VERSION,
      kind: "schedule.selection",
      requestId: request.id,
      sourceNodeId: schedulingConnectionOwnerNodeId(connection) || "",
      sourceName: owner.name || "ME3 owner",
      targetNodeId: policy.peerNodeId,
      durationMinutes: policy.durationMinutes,
      dateRange: {
        start: request.date_range_start,
        end: request.date_range_end,
      },
      reason: request.reason,
      candidateSlots: [],
      selectedSlot,
    });
    return {
      contactName: request.contact_name || request.target_name || "your contact",
      status: "waiting_for_other_owner" as const,
      selectedOption: schedulingOptions([selectedSlot], owner.timezone)[0],
    };
  }

  const selectedSlot = parseStoredSlot(request.selected_slot_json);
  if (!selectedSlot) {
    throw new AgentSchedulingError("The other owner has not selected a scheduling option yet.", 409);
  }
  const approved = await approveSchedulingRequest(env, ownerId, request.id, {
    participantRole: "target",
    startsAt: selectedSlot.startsAt,
    endsAt: selectedSlot.endsAt,
  });
  if ("error" in approved) throw new AgentSchedulingError(approved.error, approved.status);
  await relayAgentSchedulingMessage(env, connection, {
    version: AGENT_SCHEDULING_PROTOCOL_VERSION,
    kind: "schedule.approval",
    requestId: request.id,
    sourceNodeId: schedulingConnectionOwnerNodeId(connection) || "",
    sourceName: owner.name || "ME3 owner",
    targetNodeId: policy.peerNodeId,
    durationMinutes: policy.durationMinutes,
    dateRange: { start: request.date_range_start, end: request.date_range_end },
    reason: request.reason,
    candidateSlots: [],
    selectedSlot,
  });
  const finalized = await finalizeSchedulingRequest(env, ownerId, request.id);
  if ("error" in finalized) {
    throw new AgentSchedulingError(finalized.error, finalized.status);
  }
  return {
    contactName: request.contact_name || request.requester_name || "your contact",
    status: "booked" as const,
    selectedOption: schedulingOptions([selectedSlot], owner.timezone)[0],
  };
}

async function receiveAgentSchedulingRequest(
  env: Env,
  connection: DbAgentChannelConnection,
  message: AgentSchedulingRelayMessage,
) {
  const existing = await getSchedulingRequest(env, connection.user_id, message.requestId);
  if (existing) {
    const slots = parseStoredSlots(existing.candidate_slots_json);
    return {
      status: slots.length > 0
        ? "options_ready" as const
        : "no_mutual_availability" as const,
      options: schedulingRelayOptions(
        slots,
        (await getSchedulingOwner(env, connection.user_id)).timezone,
      ),
    };
  }
  const contact = await resolveAgentSchedulingContactByNode(
    env,
    connection.user_id,
    message.sourceNodeId,
  );
  if (!contact) {
    throw new AgentSchedulingError(
      "The requesting ME3 owner is not an active synced Soulink contact.",
      403,
    );
  }
  const owner = await getSchedulingOwner(env, connection.user_id);
  const timeType = await schedulingTimeTypeForDuration(
    env,
    connection.user_id,
    message.durationMinutes,
  );
  const available = await generateSchedulingCandidateSlots(env, connection.user_id, {
    timeType,
    dateRange: message.dateRange,
    limit: MAX_RELAY_CANDIDATES,
  });
  const mutual = intersectAgentSchedulingSlots(message.candidateSlots, available, 5);
  await upsertPeerSchedulingRequest(env, {
    requestId: message.requestId,
    ownerId: connection.user_id,
    contact,
    timeType,
    role: "target",
    peerNodeId: message.sourceNodeId,
    requesterName: message.sourceName,
    targetName: message.sourceName,
    reason: message.reason,
    dateRange: message.dateRange,
    candidateSlots: mutual,
    selectedSlot: null,
    status: "candidates_shared",
  });
  await recordSchedulingAudit(env, message.requestId, connection.user_id, "candidates_shared", "assistant",
    `Returned ${mutual.length} mutual candidate slots to ${message.sourceName}'s ME3 assistant`,
    { peerNodeId: message.sourceNodeId, durationMinutes: message.durationMinutes });
  return {
    status: mutual.length > 0
      ? "options_ready" as const
      : "no_mutual_availability" as const,
    options: schedulingRelayOptions(mutual, owner.timezone),
  };
}

async function receiveAgentSchedulingSelection(
  env: Env,
  connection: DbAgentChannelConnection,
  message: AgentSchedulingRelayMessage,
) {
  const request = await requirePeerSchedulingRequest(
    env,
    connection.user_id,
    message.requestId,
    "target",
    message.sourceNodeId,
  );
  const selectedSlot = message.selectedSlot!;
  const approved = await approveSchedulingRequest(env, connection.user_id, request.id, {
    participantRole: "requester",
    startsAt: selectedSlot.startsAt,
    endsAt: selectedSlot.endsAt,
  });
  if ("error" in approved) throw new AgentSchedulingError(approved.error, approved.status);
  const owner = await getSchedulingOwner(env, connection.user_id);
  const label = schedulingOptions([selectedSlot], owner.timezone)[0].label;
  await notifySchedulingOwner(
    env,
    connection,
    `Scheduling request from ${message.sourceName}: they selected ${label}. Reply “approve” to add it to both calendars, or tell me not to book it.`,
    `scheduling:${message.requestId}:selection`,
  );
  return { status: "waiting_for_owner" as const };
}

async function receiveAgentSchedulingApproval(
  env: Env,
  connection: DbAgentChannelConnection,
  message: AgentSchedulingRelayMessage,
) {
  const request = await requirePeerSchedulingRequest(
    env,
    connection.user_id,
    message.requestId,
    "requester",
    message.sourceNodeId,
  );
  const selectedSlot = message.selectedSlot!;
  const approved = await approveSchedulingRequest(env, connection.user_id, request.id, {
    participantRole: "target",
    startsAt: selectedSlot.startsAt,
    endsAt: selectedSlot.endsAt,
  });
  if ("error" in approved) throw new AgentSchedulingError(approved.error, approved.status);
  const finalized = await finalizeSchedulingRequest(env, connection.user_id, request.id);
  if ("error" in finalized) {
    throw new AgentSchedulingError(finalized.error, finalized.status);
  }
  const owner = await getSchedulingOwner(env, connection.user_id);
  const label = schedulingOptions([selectedSlot], owner.timezone)[0].label;
  await notifySchedulingOwner(
    env,
    connection,
    `${message.sourceName} approved ${label}. I added it to both calendars.`,
    `scheduling:${message.requestId}:booked`,
  );
  return { status: "booked" as const };
}

async function resolveAgentSchedulingContact(
  env: Env,
  ownerId: string,
  queryInput: string,
): Promise<DbContact> {
  const query = shortText(queryInput, 160);
  if (!query) throw new AgentSchedulingError("Scheduling contact is required.", 400);
  const rows = await env.DB.prepare(
    `SELECT id, user_id, name, email, phone, source, source_ref,
            relationship, status, notes, tags, last_interaction_at,
            next_followup_at, outreach_status, social_handles, metadata,
            created_at, updated_at
     FROM contacts
     WHERE user_id = ? AND status = 'active'
       AND (name LIKE ? COLLATE NOCASE OR email LIKE ? COLLATE NOCASE)
     ORDER BY CASE WHEN lower(name) = lower(?) THEN 0 ELSE 1 END,
              updated_at DESC
     LIMIT 10`,
  )
    .bind(ownerId, `%${query}%`, `%${query}%`, query)
    .all<DbContact>();
  const contacts = rows.results || [];
  const exact = contacts.filter((contact) => contact.name.toLowerCase() === query.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (contacts.length === 1) return contacts[0];
  if (contacts.length === 0) {
    throw new AgentSchedulingError(`I couldn't find an active contact matching “${query}”.`, 404);
  }
  throw new AgentSchedulingError(
    `More than one contact matches “${query}”. Use their full contact name.`,
    409,
  );
}

async function resolveAgentSchedulingContactByNode(
  env: Env,
  ownerId: string,
  nodeId: string,
) {
  const rows = await env.DB.prepare(
    `SELECT id, user_id, name, email, phone, source, source_ref,
            relationship, status, notes, tags, last_interaction_at,
            next_followup_at, outreach_status, social_handles, metadata,
            created_at, updated_at
     FROM contacts
     WHERE user_id = ? AND status = 'active' AND source = 'soulink'`,
  )
    .bind(ownerId)
    .all<DbContact>();
  return (rows.results || []).find((contact) => soulinkPeerNodeId(contact) === nodeId) || null;
}

async function schedulingTimeTypeForDuration(
  env: Env,
  ownerId: string,
  durationMinutes: number,
): Promise<SchedulingTimeType> {
  const timeTypes = await listSchedulingTimeTypes(env, ownerId);
  const ownerTypes = timeTypes.filter(
    (timeType) => timeType.source === "owner" && timeType.paymentMode === "free",
  );
  const selected = ownerTypes.find(
    (timeType) => timeType.durationMinutes === durationMinutes,
  ) || ownerTypes[0];
  if (!selected) {
    throw new AgentSchedulingError("Create an active free scheduling time type first.", 409);
  }
  return selected.durationMinutes === durationMinutes
    ? selected
    : { ...selected, durationMinutes };
}

async function upsertPeerSchedulingRequest(
  env: Env,
  input: {
    requestId: string;
    ownerId: string;
    contact: DbContact;
    timeType: SchedulingTimeType;
    role: AgentSchedulingRole;
    peerNodeId: string;
    requesterName: string;
    targetName: string;
    reason: string | null;
    dateRange: { start: string; end: string };
    candidateSlots: SchedulingRequestSlot[];
    selectedSlot: SchedulingRequestSlot | null;
    status: "draft" | "candidates_shared";
  },
) {
  const policy: SchedulingPeerPolicy = {
    protocolVersion: AGENT_SCHEDULING_PROTOCOL_VERSION,
    role: input.role,
    peerNodeId: input.peerNodeId,
    durationMinutes: input.timeType.durationMinutes,
  };
  await env.DB.prepare(
    `INSERT OR IGNORE INTO scheduling_requests
       (id, user_id, contact_id, time_type_id, status, requester_name, target_name,
        reason, date_range_start, date_range_end, candidate_slots_json,
        selected_slot_json, policy_json, stream_payload_json, checkout_url,
        requester_approved_at, target_approved_at, finalized_calendar_event_id,
        finalized_booking_id, finalized_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL,
             NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  )
    .bind(
      input.requestId,
      input.ownerId,
      input.contact.id,
      input.timeType.id,
      input.status,
      input.requesterName,
      input.targetName,
      input.reason,
      input.dateRange.start,
      input.dateRange.end,
      JSON.stringify(input.candidateSlots),
      input.selectedSlot ? JSON.stringify(input.selectedSlot) : null,
      JSON.stringify(policy),
    )
    .run();
  await env.DB.prepare(
    `UPDATE scheduling_requests
     SET contact_id = ?, time_type_id = ?, status = ?, requester_name = ?,
         target_name = ?, reason = ?, date_range_start = ?, date_range_end = ?,
         candidate_slots_json = ?, selected_slot_json = COALESCE(?, selected_slot_json),
         policy_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND status NOT IN ('finalized', 'cancelled')`,
  )
    .bind(
      input.contact.id,
      input.timeType.id,
      input.status,
      input.requesterName,
      input.targetName,
      input.reason,
      input.dateRange.start,
      input.dateRange.end,
      JSON.stringify(input.candidateSlots),
      input.selectedSlot ? JSON.stringify(input.selectedSlot) : null,
      JSON.stringify(policy),
      input.requestId,
      input.ownerId,
    )
    .run();
  await recordSchedulingAudit(env, input.requestId, input.ownerId, "request_created", "assistant",
    `${input.role === "requester" ? "Created" : "Received"} agent scheduling request`,
    { role: input.role, peerNodeId: input.peerNodeId });
}

async function findOpenPeerSchedulingRequest(
  env: Env,
  ownerId: string,
  contactInput?: string,
): Promise<SchedulingRequestWithContact> {
  const rows = await env.DB.prepare(
    `SELECT sr.id, sr.user_id, sr.contact_id, sr.time_type_id, sr.status,
            sr.requester_name, sr.target_name, sr.reason, sr.date_range_start,
            sr.date_range_end, sr.candidate_slots_json, sr.selected_slot_json,
            sr.policy_json, sr.stream_payload_json, sr.checkout_url,
            sr.requester_approved_at, sr.target_approved_at,
            sr.finalized_calendar_event_id, sr.finalized_booking_id,
            sr.finalized_at, sr.created_at, sr.updated_at,
            c.name AS contact_name
     FROM scheduling_requests sr
     LEFT JOIN contacts c ON c.id = sr.contact_id
     WHERE sr.user_id = ? AND sr.status NOT IN ('finalized', 'cancelled', 'not_allowed')
     ORDER BY sr.updated_at DESC
     LIMIT 20`,
  )
    .bind(ownerId)
    .all<SchedulingRequestWithContact>();
  const relayed = (rows.results || []).filter((request) => Boolean(peerPolicy(request.policy_json)));
  const contact = shortText(contactInput, 160).toLowerCase();
  const matches = contact
    ? relayed.filter((request) =>
      [request.contact_name, request.requester_name, request.target_name]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(contact)))
    : relayed;
  if (matches.length === 0) {
    throw new AgentSchedulingError(
      contactInput
        ? `There is no open agent scheduling request with ${contactInput}.`
        : "There is no open agent scheduling request to approve.",
      404,
    );
  }
  if (!contact && matches.length > 1) {
    throw new AgentSchedulingError("Name the contact whose scheduling request you want to approve.", 409);
  }
  return matches[0];
}

async function requirePeerSchedulingRequest(
  env: Env,
  ownerId: string,
  requestId: string,
  role: AgentSchedulingRole,
  peerNodeId: string,
) {
  const request = await getSchedulingRequest(env, ownerId, requestId);
  const policy = request ? peerPolicy(request.policy_json) : null;
  if (!request || !policy || policy.role !== role || policy.peerNodeId !== peerNodeId) {
    throw new AgentSchedulingError("Agent scheduling request was not found.", 404);
  }
  return request;
}

async function relayAgentSchedulingMessage(
  env: Env,
  connection: DbAgentChannelConnection,
  message: AgentSchedulingRelayMessage,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${soulinkApiOrigin(env)}/api/me3/agent-relay`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${connection.setup_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    },
  );
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true) {
    throw new AgentSchedulingError(
      shortText(payload?.error, 500) ||
        (response.status === 404
          ? "That contact does not currently have a connected ME3 assistant."
          : "The other ME3 assistant could not complete the scheduling request."),
      response.status,
    );
  }
  return isRecord(payload.result) ? payload.result : payload;
}

async function notifySchedulingOwner(
  env: Env,
  connection: DbAgentChannelConnection,
  messageText: string,
  messageId: string,
) {
  const threadId = connection.provider_thread_id;
  if (!threadId) throw new AgentSchedulingError("Soulink assistant chat is not connected.", 409);
  await env.DB.prepare(
    `INSERT INTO assistant_threads
       (id, owner_id, title, origin_surface, status, last_message_at)
     VALUES (?, ?, 'Soulink scheduling', 'soulink', 'active', CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(threadId, connection.user_id)
    .run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO assistant_messages
       (id, owner_id, role, content, thread_id)
     VALUES (?, ?, 'assistant', ?, ?)`,
  )
    .bind(messageId, connection.user_id, messageText, threadId)
    .run();
  await env.DB.prepare(
    `UPDATE assistant_threads
     SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_id = ?`,
  )
    .bind(threadId, connection.user_id)
    .run();

  const response = await fetch(
    `${soulinkApiOrigin(env)}/api/me3/assistant-channel/notify`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${connection.setup_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        streamChannelType: connection.provider_connection_id || "messaging",
        streamChannelId: threadId,
        messageId,
        messageText,
        createdAt: new Date().toISOString(),
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true) {
    throw new AgentSchedulingError(
      shortText(payload?.error, 500) || "The scheduling update could not reach the owner's Soulink chat.",
      response.status,
    );
  }
}

async function getOwnerSchedulingConnection(env: Env, ownerId: string) {
  return env.DB.prepare(
    `SELECT id, user_id, channel, status, setup_token,
            provider_connection_id, provider_user_id, provider_thread_id,
            provider_username, provider_metadata_json,
            telegram_user_id, telegram_chat_id, telegram_username,
            telegram_first_name, telegram_last_name, connected_at,
            disconnected_at, last_inbound_at, last_outbound_at, created_at,
            updated_at
     FROM agent_channel_connections
     WHERE user_id = ? AND channel = 'soulink' AND status = 'active'`,
  )
    .bind(ownerId)
    .first<DbAgentChannelConnection>();
}

async function getSchedulingOwner(env: Env, ownerId: string) {
  const owner = await env.DB.prepare(
    `SELECT id, name, timezone FROM owner_profile WHERE id = ?`,
  )
    .bind(ownerId)
    .first<{ id: string; name: string | null; timezone: string | null }>();
  if (!owner) throw new AgentSchedulingError("ME3 owner profile was not found.", 404);
  return owner;
}

async function recordSchedulingAudit(
  env: Env,
  requestId: string,
  ownerId: string,
  eventType: "request_created" | "candidates_shared" | "approval_recorded" | "finalized",
  actorRole: "assistant" | "requester" | "target",
  summary: string,
  metadata: unknown,
) {
  await env.DB.prepare(
    `INSERT INTO scheduling_request_audit
       (id, request_id, user_id, event_type, actor_role, summary, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  )
    .bind(
      crypto.randomUUID(),
      requestId,
      ownerId,
      eventType,
      actorRole,
      summary,
      JSON.stringify(metadata),
    )
    .run();
}

function schedulingOptions(
  slots: readonly SchedulingRequestSlot[],
  timezoneInput: string | null | undefined,
): CoreSchedulingOption[] {
  const timezone = resolveTimeZone(timezoneInput);
  return slots.slice(0, 5).map((slot, index) => ({
    option: index + 1,
    label: formatSchedulingOption(slot, timezone),
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  }));
}

function schedulingRelayOptions(
  slots: readonly SchedulingRequestSlot[],
  timezoneInput: string | null | undefined,
) {
  const options = schedulingOptions(slots, timezoneInput);
  return options.map((option, index) => ({
    ...slots[index],
    ...option,
  }));
}

function formatSchedulingOption(slot: SchedulingRequestSlot, timezone: string) {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  const day = new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(start);
  const time = new Intl.DateTimeFormat("en-IE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
  return `${day}, ${time.format(start)}–${time.format(end)} ${timezone}`;
}

function parseRelayOptions(value: unknown): SchedulingRequestSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((option) => isRecord(option) ? parseRelaySlot(option) : null)
    .filter((slot): slot is SchedulingRequestSlot => Boolean(slot));
}

function parseStoredSlots(value: string | null): SchedulingRequestSlot[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(parseRelaySlot).filter((slot): slot is SchedulingRequestSlot => Boolean(slot))
      : [];
  } catch {
    return [];
  }
}

function parseStoredSlot(value: string | null) {
  if (!value) return null;
  try {
    return parseRelaySlot(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function parseRelaySlot(value: unknown): SchedulingRequestSlot | null {
  if (!isRecord(value)) return null;
  const startsAt = shortText(value.startsAt, 50);
  const endsAt = shortText(value.endsAt, 50);
  const startsAtMs = Date.parse(startsAt);
  const endsAtMs = Date.parse(endsAt);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) {
    return null;
  }
  const timezone = resolveTimeZone(shortText(value.timezone, 100));
  const localStart = formatUtcInstantInTimeZone(startsAtMs, timezone);
  const localEnd = formatUtcInstantInTimeZone(endsAtMs, timezone);
  return {
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    timezone,
    localDate: localStart?.localDate || startsAt.slice(0, 10),
    localStartTime: localStart?.localTime || startsAt.slice(11, 16),
    localEndDate: localEnd?.localDate || endsAt.slice(0, 10),
    localEndTime: localEnd?.localTime || endsAt.slice(11, 16),
  };
}

function peerPolicy(value: string | null): SchedulingPeerPolicy | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return null;
    const role = parsed.role === "requester" || parsed.role === "target" ? parsed.role : null;
    const peerNodeId = shortText(parsed.peerNodeId, 200);
    const durationMinutes = numericInteger(parsed.durationMinutes);
    if (
      parsed.protocolVersion !== AGENT_SCHEDULING_PROTOCOL_VERSION ||
      !role ||
      !peerNodeId ||
      durationMinutes === null
    ) {
      return null;
    }
    return {
      protocolVersion: AGENT_SCHEDULING_PROTOCOL_VERSION,
      role,
      peerNodeId,
      durationMinutes,
    };
  } catch {
    return null;
  }
}

function soulinkPeerNodeId(contact: DbContact): string | null {
  const metadata = parseJsonRecord(contact.metadata);
  return shortText(metadata.soulinkNodeId, 200) ||
    (contact.source === "soulink" ? shortText(contact.source_ref, 200) : "") ||
    null;
}

function schedulingConnectionOwnerNodeId(connection: DbAgentChannelConnection) {
  const metadata = parseJsonRecord(connection.provider_metadata_json);
  return shortText(metadata.ownerNodeId, 200) || shortText(connection.provider_user_id, 200) || null;
}

function localDateForInstant(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function soulinkApiOrigin(env: Env) {
  try {
    return new URL(env.SOULINK_API_ORIGIN || DEFAULT_SOULINK_API_ORIGIN).origin;
  } catch {
    return DEFAULT_SOULINK_API_ORIGIN;
  }
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value!)));
}

function numericInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function shortText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
