export type CoreChatPlannerIntentKind =
  | "conversation"
  | "read_action"
  | "write_action"
  | "clarify";

export type CoreChatCapabilityId =
  | "core.agent-chat.conversation"
  | "core.mailbox.draft"
  | "core.reminders.list"
  | "core.reminders.create"
  | "core.bookings.lookup";

export type CoreChatSideEffectLevel = "none" | "read" | "write";

export type CoreChatToolPlannerInput = {
  messageText: string;
  hasRecentAssistantEmailDraft?: boolean;
};

export type CoreChatToolPlannerDecision = {
  kind: CoreChatPlannerIntentKind;
  confidence: number;
  capabilityId: CoreChatCapabilityId;
  requiredSetupChecks: string[];
  sideEffectLevel: CoreChatSideEffectLevel;
  approvalRequired: boolean;
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
    isCoreChatMailboxDraftSaveRequest(
      messageText,
      Boolean(input.hasRecentAssistantEmailDraft),
    )
  ) {
    return {
      kind: "write_action",
      confidence: input.hasRecentAssistantEmailDraft ? 0.92 : 0.82,
      capabilityId: "core.mailbox.draft",
      requiredSetupChecks: ["mailbox"],
      sideEffectLevel: "write",
      approvalRequired: false,
      reason:
        "The owner asked to save a draft email. Saving is local draft state and does not send mail.",
    };
  }

  if (isCoreChatReminderListRequest(messageText)) {
    return {
      kind: "read_action",
      confidence: 0.93,
      capabilityId: "core.reminders.list",
      requiredSetupChecks: ["calendar.reminders"],
      sideEffectLevel: "read",
      approvalRequired: false,
      reason: "The owner directly asked to inspect pending or upcoming reminders.",
    };
  }

  if (isCoreChatReminderCreateRequest(messageText)) {
    const missingDetails = getReminderCreateMissingDetails(messageText);
    if (missingDetails.length > 0) {
      return {
        kind: "clarify",
        confidence: 0.88,
        capabilityId: "core.reminders.create",
        requiredSetupChecks: ["calendar.reminders"],
        sideEffectLevel: "none",
        approvalRequired: false,
        reason: `The owner asked to create a reminder but did not include ${missingDetails.join(" and ")}.`,
      };
    }

    return {
      kind: "write_action",
      confidence: 0.94,
      capabilityId: "core.reminders.create",
      requiredSetupChecks: ["calendar.reminders"],
      sideEffectLevel: "write",
      approvalRequired: false,
      reason: "The owner directly asked to create a reminder with enough details to attempt it.",
    };
  }

  if (isCoreChatBookingLookupRequest(messageText)) {
    return {
      kind: "read_action",
      confidence: 0.89,
      capabilityId: "core.bookings.lookup",
      requiredSetupChecks: ["booking"],
      sideEffectLevel: "read",
      approvalRequired: false,
      reason: "The owner directly asked to inspect upcoming bookings or appointments.",
    };
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
  return /\b(bookings?|appointments?|calls?|sessions?)\b/i.test(messageText) &&
    /\b(check|show|list|what|when|any|upcoming|today|week|schedule)\b/i.test(messageText);
}

function conversationDecision(
  confidence: number,
  reason: string,
): CoreChatToolPlannerDecision {
  return {
    kind: "conversation",
    confidence,
    capabilityId: "core.agent-chat.conversation",
    requiredSetupChecks: [],
    sideEffectLevel: "none",
    approvalRequired: false,
    reason,
  };
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
    .replace(/\bon\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\bin\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?)\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
    .replace(/\b(?:every day|daily|every week|weekly|every month|monthly)\b/gi, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  return stripped.length > 0;
}

function hasReminderWhen(messageText: string): boolean {
  return (
    /\b(?:today|tomorrow)\b/i.test(messageText) ||
    /\b20\d{2}-\d{2}-\d{2}\b/.test(messageText) ||
    /\bin\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?)\b/i.test(messageText)
  );
}
