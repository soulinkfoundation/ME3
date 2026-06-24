import {
  getCoreChatCapability,
  isCoreChatCapabilityApprovalRequired,
  type CoreChatCapabilityId,
  type CoreChatPlannerIntentKind,
  type CoreChatSideEffectLevel,
} from "./capabilities";

export type {
  CoreChatCapabilityId,
  CoreChatPlannerIntentKind,
  CoreChatSideEffectLevel,
} from "./capabilities";

export type CoreChatToolPlannerInput = {
  messageText: string;
  hasRecentAssistantEmailDraft?: boolean;
  hasPendingMailboxDraftRecipient?: boolean;
};

export type CoreChatToolPlannerDecision = {
  kind: CoreChatPlannerIntentKind;
  confidence: number;
  capabilityId: CoreChatCapabilityId;
  ownerFacingLabel: string;
  handlerRoute: string;
  requiredSetupChecks: string[];
  sideEffectLevel: CoreChatSideEffectLevel;
  approvalRequired: boolean;
  auditEventKind: string;
  reason: string;
};

export function planCoreChatToolTurn(
  input: CoreChatToolPlannerInput,
): CoreChatToolPlannerDecision {
  const messageText = input.messageText.trim();

  if (!messageText) {
    return conversationDecision(0.2, "Empty chat turn.");
  }

  if (isCoreChatCapabilityExplorationRequest(messageText)) {
    return conversationDecision(
      0.95,
      "The owner is exploring setup, context, or capabilities rather than asking for one concrete tool action.",
    );
  }

  if (
    input.hasPendingMailboxDraftRecipient &&
    isCoreChatMailboxDraftRecipientContinuation(messageText)
  ) {
    return capabilityDecision("core.mailbox.draft", {
      kind: "write_action",
      confidence: 0.94,
      reason:
        "The owner supplied the missing recipient for a pending mailbox draft save request.",
    });
  }

  if (
    isCoreChatMailboxDraftSaveRequest(
      messageText,
      Boolean(input.hasRecentAssistantEmailDraft),
    )
  ) {
    return capabilityDecision("core.mailbox.draft", {
      kind: "write_action",
      confidence: input.hasRecentAssistantEmailDraft ? 0.92 : 0.82,
      reason:
        "The owner asked to save a draft email. Saving is local draft state and does not send mail.",
    });
  }

  if (isCoreChatReminderListRequest(messageText)) {
    return capabilityDecision("core.reminders.list", {
      kind: "read_action",
      confidence: 0.93,
      reason: "The owner directly asked to inspect pending or upcoming reminders.",
    });
  }

  if (isCoreChatReminderCreateRequest(messageText)) {
    const missingDetails = getReminderCreateMissingDetails(messageText);
    if (missingDetails.length > 0) {
      return capabilityDecision("core.reminders.create", {
        kind: "clarify",
        confidence: 0.88,
        sideEffectLevel: "none",
        reason: `The owner asked to create a reminder but did not include ${missingDetails.join(" and ")}.`,
      });
    }

    return capabilityDecision("core.reminders.create", {
      kind: "write_action",
      confidence: 0.94,
      reason: "The owner directly asked to create a reminder with enough details to attempt it.",
    });
  }

  if (isCoreChatBookingLookupRequest(messageText)) {
    return capabilityDecision("core.bookings.lookup", {
      kind: "read_action",
      confidence: 0.89,
      reason: "The owner directly asked to inspect upcoming bookings or appointments.",
    });
  }

  if (isCoreChatMissionTaskListRequest(messageText)) {
    return capabilityDecision("core.mission.task.list", {
      kind: "read_action",
      confidence: 0.9,
      reason: "The owner directly asked to list or inspect Mission Control tasks.",
    });
  }

  if (isCoreChatMissionTaskArchiveRequest(messageText)) {
    return capabilityDecision("core.mission.task.archive", {
      kind: "write_action",
      confidence: 0.9,
      reason: "The owner directly asked to archive or delete a Mission Control task.",
    });
  }

  if (isCoreChatMissionTaskUpdateRequest(messageText)) {
    return capabilityDecision("core.mission.task.update", {
      kind: "write_action",
      confidence: 0.9,
      reason: "The owner directly asked to update, move, or organize a Mission Control task.",
    });
  }

  if (isCoreChatMissionTaskCreateRequest(messageText)) {
    return capabilityDecision("core.mission.task.create", {
      kind: "write_action",
      confidence: 0.9,
      reason: "The owner directly asked to create a Mission Control task.",
    });
  }

  return conversationDecision(
    0.55,
    "No high-confidence native tool action matched, so the model should answer with context.",
  );
}

export function isCoreChatMailboxDraftSaveRequest(
  messageText: string,
  hasRecentAssistantEmailDraft: boolean,
): boolean {
  const asksToSave =
    (/\b(save|store|keep)\b/i.test(messageText) &&
      /\b(it|that|this|draft|email|reply|message)\b/i.test(messageText)) ||
    /\bmake\s+(?:it|that|this|the\s+(?:reply|email|message))\s+(?:a\s+)?draft\b/i.test(
      messageText,
    );
  if (!asksToSave) return false;
  if (/\b(draft|mailbox|email|\/email)\b/i.test(messageText)) return true;
  return hasRecentAssistantEmailDraft;
}

export function isCoreChatMailboxDraftRecipientContinuation(
  messageText: string,
): boolean {
  const trimmed = messageText.trim();
  if (!trimmed) return false;
  if (extractPlannerEmailAddress(trimmed)) return true;
  return /\b(?:to|use|recipient|address|email)\b/i.test(trimmed) &&
    trimmed.length <= 180;
}

export function isCoreChatReminderListRequest(messageText: string): boolean {
  if (isCoreChatReminderCreateRequest(messageText)) return false;
  if (!/\b(reminders?|todo|todos|nudges?)\b/i.test(messageText)) return false;
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;

  return (
    /\b(?:list|show|check|review|pull up)\s+(?:my\s+|the\s+)?(?:pending\s+|upcoming\s+|due\s+)?(?:reminders?|todos?|nudges?)\b/i.test(
      messageText,
    ) ||
    /\b(?:do|can)\s+i\s+have\s+any\s+(?:pending\s+|upcoming\s+|due\s+)?(?:reminders?|todos?|nudges?)\b/i.test(
      messageText,
    ) ||
    /\b(?:what|which)\s+(?:reminders?|todos?|nudges?)\s+(?:do\s+i\s+have|are\s+(?:pending|upcoming|due))\b/i.test(
      messageText,
    ) ||
    /\b(?:any|pending|upcoming|due)\s+(?:reminders?|todos?|nudges?)\??$/i.test(
      messageText,
    )
  );
}

export function isCoreChatCapabilityExplorationRequest(messageText: string): boolean {
  const normalized = messageText.toLowerCase();
  const mentionsAssistantScope =
    /\b(?:what|which)\s+(?:you|me3|the\s+agent|the\s+assistant)\s+can\s+(?:do|access|use|help\s+with)\b/i.test(
      messageText,
    ) ||
    /\b(?:tools?|capabilit(?:y|ies)|context|available|access|test\s+run|setting\s+up|setup|first\s+time|make\s+sense)\b/i.test(
      messageText,
    ) ||
    /\b(?:want|need|trying|try)\s+to\s+(?:test|explore)\b/i.test(messageText);
  if (!mentionsAssistantScope) return false;

  return (
    /\b(?:tools?|capabilit(?:y|ies)|what\s+you\s+can\s+do|what\s+context|context\s+you\s+have|access\s+here)\b/i.test(
      messageText,
    ) ||
    /\b(?:setting\s+up|setup|first\s+time|make\s+sense)\b/i.test(messageText) ||
    /\b(?:want|need|trying|try)\s+to\s+(?:test|explore)\b/i.test(messageText) ||
    normalized.includes("for example") ||
    normalized.includes("such as") ||
    normalized.includes("ie ") ||
    normalized.includes("i.e.")
  );
}

export function isCoreChatReminderCreateRequest(messageText: string): boolean {
  return /\b(remind me|set (?:a )?reminder|create (?:a )?reminder|add (?:a )?reminder|don't let me forget|dont let me forget)\b/i.test(
    messageText,
  );
}

export function isCoreChatBookingLookupRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  const text = messageText.replace(/\s+/g, " ").trim();
  if (!text) return false;

  return (
    /\b(?:check|show|list|review|pull up)\s+(?:my\s+|the\s+)?(?:upcoming\s+|confirmed\s+|current\s+|next\s+|today'?s?\s+|this\s+week'?s?\s+)?(?:bookings?|appointments?|sessions?|calls?)\b/i.test(
      text,
    ) ||
    /\b(?:what|which|when)\s+(?:bookings?|appointments?|sessions?|calls?)\s+(?:do\s+i\s+have|are\s+(?:upcoming|confirmed|scheduled|today|this\s+week)|(?:are\s+)?next)\b/i.test(
      text,
    ) ||
    /\b(?:do|can)\s+i\s+have\s+any\s+(?:upcoming\s+|confirmed\s+|scheduled\s+|today'?s?\s+|this\s+week'?s?\s+)?(?:bookings?|appointments?|sessions?|calls?)\b/i.test(
      text,
    ) ||
    /\bwhat(?:'s| is)\s+(?:my\s+)?(?:next|upcoming)\s+(?:booking|appointment|session|call)\b/i.test(
      text,
    ) ||
    /\b(?:any|upcoming|confirmed|scheduled|today'?s?|this\s+week'?s?)\s+(?:bookings?|appointments?|sessions?)\??$/i.test(
      text,
    )
  );
}

export function isCoreChatMissionTaskCreateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  return /\b(?:add|create|make)\s+(?:a\s+)?(?:mission\s+control\s+)?task\b/i.test(
    messageText,
  );
}

export function isCoreChatMissionTaskListRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (/\b(?:prioriti[sz]e|clean up|cleanup|plan|strategy|strategize)\b/i.test(messageText)) {
    return false;
  }
  return (
    isCoreChatWeeklyReviewRequest(messageText) ||
    /\b(?:list|show|check|read|pull up)\s+(?:my\s+|the\s+)?(?:mission\s+control\s+)?(?:(?:backlog|todo|to do|doing|in progress|review|done|complete|completed)\s+)?(?:project\s+)?(?:tasks?|todos?)\b/i.test(
      messageText,
    ) ||
    /\b(?:what(?:'s| is)|which tasks? (?:are|is))\s+(?:in\s+)?(?:backlog|todo|to do|doing|in progress|review|done|complete|completed)\b/i.test(
      messageText,
    )
  );
}

export function isCoreChatWeeklyReviewRequest(messageText: string): boolean {
  return /\b(?:review|summari[sz]e)\s+(?:my|this|the)\s+week\b/i.test(messageText);
}

export function isCoreChatMissionTaskUpdateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  return (
    /\b(?:mark|move|update|rename|reschedule|organize|organise)\s+(?:the\s+)?(?:mission\s+control\s+)?task\b/i.test(
      messageText,
    ) ||
    /\b(?:mark|move|update|rename|reschedule|organize|organise)\s+["“]?[^"”]+["”]?\s+(?:task\s+)?(?:as|to|for|due|by)\b/i.test(
      messageText,
    )
  );
}

export function isCoreChatMissionTaskArchiveRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  return /\b(?:delete|archive|remove)\s+(?:the\s+)?(?:mission\s+control\s+)?task\b/i.test(
    messageText,
  );
}

function conversationDecision(
  confidence: number,
  reason: string,
): CoreChatToolPlannerDecision {
  return capabilityDecision("core.agent-chat.conversation", {
    kind: "conversation",
    confidence,
    reason,
  });
}

function capabilityDecision(
  capabilityId: CoreChatCapabilityId,
  input: {
    kind: CoreChatPlannerIntentKind;
    confidence: number;
    reason: string;
    sideEffectLevel?: CoreChatSideEffectLevel;
  },
): CoreChatToolPlannerDecision {
  const capability = getCoreChatCapability(capabilityId);
  return {
    kind: input.kind,
    confidence: input.confidence,
    capabilityId: capability.id,
    ownerFacingLabel: capability.ownerFacingLabel,
    handlerRoute: capability.handler.route,
    requiredSetupChecks: [...capability.requiresSetup],
    sideEffectLevel: input.sideEffectLevel ?? capability.chat.sideEffectLevel,
    approvalRequired: isCoreChatCapabilityApprovalRequired(capability),
    auditEventKind: capability.auditEventKind,
    reason: input.reason,
  };
}

function extractPlannerEmailAddress(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.trim().toLowerCase() || null;
}

function getReminderCreateMissingDetails(messageText: string): string[] {
  const missing = [];
  if (!hasReminderSubject(messageText)) missing.push("what to be reminded about");
  if (!hasReminderWhen(messageText)) missing.push("when to remind them");
  return missing;
}

function hasReminderSubject(messageText: string): boolean {
  const stripped = messageText
    .replace(/^(?:please\s+)?/i, "")
    .replace(/^(?:can|could|would|will)\s+you\s+/i, "")
    .replace(/^(?:remind me|set (?:a )?reminder|create (?:a )?reminder|add (?:a )?reminder)\s+(?:to|for|about|that)?\s*/i, "")
    .replace(/^(?:don't|dont) let me forget\s+(?:to|about|that)?\s*/i, "")
    .replace(/\b(?:today|tomorrow)\b/gi, "")
    .replace(/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\bon\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\bin\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, "")
    .replace(/\b(?:every day|daily|every week|weekly|every month|monthly)\b/gi, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  return stripped.length > 0;
}

function hasReminderWhen(messageText: string): boolean {
  return (
    /\b(?:today|tomorrow)\b/i.test(messageText) ||
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(messageText) ||
    /\b20\d{2}-\d{2}-\d{2}\b/.test(messageText) ||
    /\bin\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?)\b/i.test(messageText)
  );
}
