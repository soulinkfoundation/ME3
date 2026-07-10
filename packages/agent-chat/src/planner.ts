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

  if (isCoreChatMailboxDraftSaveRequest(messageText)) {
    return capabilityDecision("core.mailbox.draft", {
      kind: "write_action",
      confidence: 0.88,
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

  if (isCoreChatSocialSourceReadRequest(messageText)) {
    return capabilityDecision("core.social.source.read", {
      kind: "read_action",
      confidence: 0.9,
      reason: "The owner asked to read a Journal or Mission Control source for social content.",
    });
  }

  if (isCoreChatSocialDraftCreateRequest(messageText)) {
    return capabilityDecision("core.social.draft.create", {
      kind: "write_action",
      confidence: 0.9,
      reason: "The owner asked to create reviewable social post drafts.",
    });
  }

  if (isCoreChatSiteBlogPostArchiveRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.archive", {
      kind: "write_action",
      confidence: 0.9,
      reason: "The owner directly asked to archive or delete a profile-site blog post.",
    });
  }

  if (isCoreChatSiteBlogPostUpdateRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.update", {
      kind: "write_action",
      confidence: 0.9,
      reason: "The owner directly asked to update a profile-site blog post.",
    });
  }

  if (isCoreChatSiteBlogPostCreateRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.create", {
      kind: "write_action",
      confidence: 0.9,
      reason: "The owner directly asked to create a profile-site blog post.",
    });
  }

  if (isCoreChatSiteBlogPostReadRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.read", {
      kind: "read_action",
      confidence: 0.9,
      reason: "The owner directly asked to read one profile-site blog post.",
    });
  }

  if (isCoreChatSiteBlogPostListRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.list", {
      kind: "read_action",
      confidence: 0.9,
      reason: "The owner directly asked to list profile-site blog posts.",
    });
  }

  if (isCoreChatMissionContextReadRequest(messageText)) {
    return capabilityDecision("core.mission.context.read", {
      kind: "read_action",
      confidence: 0.88,
      reason: "The owner asked to read Mission Control context beyond a plain task list.",
    });
  }

  if (isCoreChatMissionTaskReadRequest(messageText)) {
    return capabilityDecision("core.mission.task.read", {
      kind: "read_action",
      confidence: 0.91,
      reason: "The owner directly asked to read one Mission Control task.",
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
): boolean {
  if (mentionsSiteBlogPostDomain(messageText)) return false;
  const asksToSave =
    (/\b(save|store|keep)\b/i.test(messageText) &&
      /\b(it|that|this|draft|email|reply|message)\b/i.test(messageText)) ||
    /\bmake\s+(?:it|that|this|the\s+(?:reply|email|message))\s+(?:a\s+)?draft\b/i.test(
      messageText,
    );
  if (!asksToSave) return false;
  return /\b(draft|mailbox|email|\/email)\b/i.test(messageText);
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
  return /\b(remind(?:er)? me|set (?:a )?reminder|create (?:a )?reminder|add (?:a )?reminder|don't let me forget|dont let me forget)\b/i.test(
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

export function isCoreChatSiteBlogPostListRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText)) return false;
  if (isCoreChatSiteBlogPostCreateRequest(messageText)) return false;
  if (isCoreChatSiteBlogPostUpdateRequest(messageText)) return false;
  if (isCoreChatSiteBlogPostArchiveRequest(messageText)) return false;
  if (isCoreChatSiteBlogPostReadRequest(messageText)) return false;
  return (
    /\b(?:list|show|check|review|pull up|see|view)\s+(?:my\s+|the\s+)?(?:profile\s+site\s+|public\s+site\s+|site\s+)?(?:blog\s+)?(?:posts?|articles?)\b/i.test(
      messageText,
    ) ||
    /\b(?:blog\s+posts?|articles?)\b.*\b(?:list|show|existing|published|drafts?)\b/i.test(
      messageText,
    )
  );
}

export function isCoreChatSiteBlogPostReadRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText)) return false;
  if (/\bthis\s+article\b/i.test(messageText) && !mentionsExplicitSiteBlogDomain(messageText)) {
    return false;
  }
  if (isCoreChatSiteBlogPostCreateRequest(messageText)) return false;
  if (isCoreChatSiteBlogPostUpdateRequest(messageText)) return false;
  if (isCoreChatSiteBlogPostArchiveRequest(messageText)) return false;
  if (/\b(?:all|list|existing|published)\s+(?:blog\s+)?(?:posts?|articles?)\b/i.test(messageText)) {
    return false;
  }
  return (
    /\b(?:read|open|show|pull up|check|inspect)\b.*\b(?:blog\s+post|article|post|draft)\b/i.test(
      messageText,
    ) ||
    /\b(?:full\s+)?(?:article|blog\s+post|post)\s+(?:draft\s+)?(?:for|about|called|titled)\b/i.test(
      messageText,
    )
  );
}

export function isCoreChatSiteBlogPostCreateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText)) return false;
  if (/\b(?:ideas?|brainstorm|outline options|strategy)\b/i.test(messageText)) return false;
  return /\b(?:create|write|draft|add|make)\b.*\b(?:blog\s+post|article|post)\b/i.test(
    messageText,
  );
}

export function isCoreChatSiteBlogPostUpdateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (isLikelyMissionTaskRequest(messageText)) return false;
  if (isCoreChatSiteBlogPostCreateRequest(messageText)) return false;
  if (
    !mentionsSiteBlogPostDomain(messageText) &&
    !/\b(?:rename|publish|unpublish|update|set|change|replace)\b.*\b(?:post|draft|article|excerpt|slug|title|body)\b/i.test(messageText)
  ) {
    return false;
  }
  if (isLikelySocialPostRequest(messageText)) return false;
  if (isCoreChatSiteBlogPostArchiveRequest(messageText)) return false;
  return (
    /\b(?:update|edit|change|set|replace|rename|publish|unpublish)\b.*\b(?:blog\s+post|article|post|draft|slug|excerpt|title|body|published\s+date|publishedAt)\b/i.test(
      messageText,
    ) ||
    /\b(?:rename|publish|unpublish)\s+(?:the\s+)?(?:draft\s+)?(?:blog\s+post|article|post)\b/i.test(
      messageText,
    )
  );
}

export function isCoreChatSiteBlogPostArchiveRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText) && !/\b(?:blog\s+post|article|post)\b/i.test(messageText)) return false;
  if (isLikelySocialPostRequest(messageText)) return false;
  return /\b(?:delete|archive|remove)\b.*\b(?:blog\s+post|article|post)\b/i.test(
    messageText,
  );
}

function mentionsSiteBlogPostDomain(messageText: string): boolean {
  return /\b(?:blog\s+posts?|blog|articles?|profile\s+site|public\s+site|site\s+posts?|site\s+drafts?)\b/i.test(
    messageText,
  );
}

function mentionsExplicitSiteBlogDomain(messageText: string): boolean {
  return /\b(?:blog|profile\s+site|public\s+site|site\s+(?:posts?|drafts?)|draft|post)\b/i.test(
    messageText,
  );
}

function isLikelySocialPostRequest(messageText: string): boolean {
  return /\b(?:social|linkedin|twitter|x\.com|instagram|tiktok|facebook|mastodon|bluesky)\b/i.test(
    messageText,
  );
}

export function isCoreChatSocialSourceReadRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  return (
    /\b(?:read|open|load|inspect)\b/i.test(messageText) &&
    /\b(?:journal|mission\s+control|task)\b/i.test(messageText) &&
    /\b(?:social|post|draft|linkedin|twitter|x\.com|instagram)\b/i.test(messageText)
  );
}

export function isCoreChatSocialDraftCreateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (/\b(?:ideas?|brainstorm|strategy|calendar)\b/i.test(messageText)) return false;
  if (!isLikelySocialPostRequest(messageText)) return false;
  return /\b(?:create|write|draft|make|turn|adapt|repurpose|use)\b/i.test(messageText);
}

function isLikelyMissionTaskRequest(messageText: string): boolean {
  return /\b(?:mission\s+control|task|todo)\b/i.test(messageText);
}

export function isCoreChatMissionTaskCreateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  return /\b(?:add|create|make)\s+(?:a\s+)?(?:mission\s+control\s+)?task\b/i.test(
    messageText,
  );
}

export function isCoreChatMissionContextReadRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (/\b(?:prioriti[sz]e|brainstorm|plan|strategize|strategise)\b/i.test(messageText)) {
    return false;
  }
  if (!/\b(?:mission\s+control|mission|project|tasks?|me\.json)\b/i.test(messageText)) {
    return false;
  }
  return /\b(?:read|show|check|pull up|summari[sz]e|cross[-\s]?reference)\b/i.test(messageText) &&
    /\b(?:context|mission\s+statement|goals?|audience|purpose|me\.json|cross[-\s]?reference)\b/i.test(
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

export function isCoreChatMissionTaskReadRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (/\b(?:tasks|todos)\b/i.test(messageText)) return false;
  if (!/\b(?:task|todo)\b/i.test(messageText)) return false;
  if (!/\b(?:read|show|open|pull up|check|inspect)\b/i.test(messageText)) return false;
  return (
    /\b(?:full\s+)?(?:details?|contents?|description|notes?|body)\b/i.test(messageText) ||
    /\b(?:read|show|open|pull up|check|inspect)\s+(?:me\s+)?(?:the\s+)?(?:mission\s+control\s+)?(?:task|todo)\b/i.test(
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
    .replace(/^(?:remind(?:er)? me|set (?:a )?reminder|create (?:a )?reminder|add (?:a )?reminder)\s+(?:to|for|about|that)?\s*/i, "")
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
