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

/**
 * Compatibility routing for the few native integrations that are not yet
 * executable Runtime v2 tools. General agent actions must not be added here.
 */
export function planLegacyNativeToolTurn(
  input: CoreChatToolPlannerInput,
): CoreChatToolPlannerDecision {
  const messageText = input.messageText.trim();
  if (!messageText) return conversationDecision(0.2, "Empty chat turn.");
  if (isCoreChatCapabilityExplorationRequest(messageText)) {
    return conversationDecision(0.95, "The owner is exploring agent capabilities.");
  }
  if (isCoreChatBookingLookupRequest(messageText)) {
    return capabilityDecision("core.bookings.lookup", "read_action", 0.89,
      "The owner directly asked to inspect upcoming bookings.");
  }
  if (isSiteBlogPostArchiveRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.archive", "write_action", 0.9,
      "The owner directly asked to archive a profile-site blog post.");
  }
  if (isSiteBlogPostUpdateRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.update", "write_action", 0.9,
      "The owner directly asked to update a profile-site blog post.");
  }
  if (isSiteBlogPostCreateRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.create", "write_action", 0.9,
      "The owner directly asked to create a profile-site blog post.");
  }
  if (isSiteBlogPostReadRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.read", "read_action", 0.9,
      "The owner directly asked to read a profile-site blog post.");
  }
  if (isSiteBlogPostListRequest(messageText)) {
    return capabilityDecision("core.sites.blog_post.list", "read_action", 0.9,
      "The owner directly asked to list profile-site blog posts.");
  }
  if (isMissionContextReadRequest(messageText)) {
    return capabilityDecision("core.mission.context.read", "read_action", 0.88,
      "The owner asked to read Mission Control context beyond a task list.");
  }
  return conversationDecision(0.55, "No explicit legacy native integration matched.");
}

export function isCoreChatCapabilityExplorationRequest(messageText: string): boolean {
  if (
    /\b(?:(?:can|could|would)\s+you\s+)?(?:use|using|call|run)\s+(?:the\s+)?(?:[\w-]+\s+){0,3}tools?\b/i.test(
      messageText,
    )
  ) {
    return false;
  }
  const normalized = messageText.toLowerCase();
  const mentionsAssistantScope =
    /\b(?:what|which)\s+(?:you|me3|the\s+agent|the\s+assistant)\s+can\s+(?:do|access|use|help\s+with)\b/i.test(messageText) ||
    /\b(?:tools?|capabilit(?:y|ies)|context|available|access|test\s+run|setting\s+up|setup|first\s+time|make\s+sense)\b/i.test(messageText) ||
    /\b(?:want|need|trying|try)\s+to\s+(?:test|explore)\b/i.test(messageText);
  if (!mentionsAssistantScope) return false;
  return (
    /\b(?:tools?|capabilit(?:y|ies)|what\s+you\s+can\s+do|what\s+context|context\s+you\s+have|access\s+here)\b/i.test(messageText) ||
    /\b(?:setting\s+up|setup|first\s+time|make\s+sense)\b/i.test(messageText) ||
    /\b(?:want|need|trying|try)\s+to\s+(?:test|explore)\b/i.test(messageText) ||
    normalized.includes("for example") || normalized.includes("such as") ||
    normalized.includes("ie ") || normalized.includes("i.e.")
  );
}

export function isCoreChatBookingLookupRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  const text = messageText.replace(/\s+/g, " ").trim();
  if (!text) return false;
  return (
    /\b(?:check|show|list|review|pull up)\s+(?:my\s+|the\s+)?(?:upcoming\s+|confirmed\s+|current\s+|next\s+|today'?s?\s+|this\s+week'?s?\s+)?(?:bookings?|appointments?|sessions?|calls?)\b/i.test(text) ||
    /\b(?:what|which|when)\s+(?:bookings?|appointments?|sessions?|calls?)\s+(?:do\s+i\s+have|are\s+(?:upcoming|confirmed|scheduled|today|this\s+week)|(?:are\s+)?next)\b/i.test(text) ||
    /\b(?:do|can)\s+i\s+have\s+any\s+(?:upcoming\s+|confirmed\s+|scheduled\s+|today'?s?\s+|this\s+week'?s?\s+)?(?:bookings?|appointments?|sessions?|calls?)\b/i.test(text) ||
    /\bwhat(?:'s| is)\s+(?:my\s+)?(?:next|upcoming)\s+(?:booking|appointment|session|call)\b/i.test(text) ||
    /\b(?:any|upcoming|confirmed|scheduled|today'?s?|this\s+week'?s?)\s+(?:bookings?|appointments?|sessions?)\??$/i.test(text)
  );
}

function isSiteBlogPostListRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText) || isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText)) return false;
  if (isSiteBlogPostCreateRequest(messageText) || isSiteBlogPostUpdateRequest(messageText) ||
      isSiteBlogPostArchiveRequest(messageText) || isSiteBlogPostReadRequest(messageText)) return false;
  return /\b(?:list|show|check|review|pull up|see|view)\s+(?:my\s+|the\s+)?(?:profile\s+site\s+|public\s+site\s+|site\s+)?(?:blog\s+)?(?:posts?|articles?)\b/i.test(messageText) ||
    /\b(?:blog\s+posts?|articles?)\b.*\b(?:list|show|existing|published|drafts?)\b/i.test(messageText);
}

function isSiteBlogPostReadRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText) || isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText)) return false;
  if (/\bthis\s+article\b/i.test(messageText) && !mentionsExplicitSiteBlogDomain(messageText)) return false;
  if (isSiteBlogPostCreateRequest(messageText) || isSiteBlogPostUpdateRequest(messageText) || isSiteBlogPostArchiveRequest(messageText)) return false;
  if (/\b(?:all|list|existing|published)\s+(?:blog\s+)?(?:posts?|articles?)\b/i.test(messageText)) return false;
  return /\b(?:read|open|show|pull up|check|inspect)\b.*\b(?:blog\s+post|article|post|draft)\b/i.test(messageText) ||
    /\b(?:full\s+)?(?:article|blog\s+post|post)\s+(?:draft\s+)?(?:for|about|called|titled)\b/i.test(messageText);
}

function isSiteBlogPostCreateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText) || isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText) || /\b(?:ideas?|brainstorm|outline options|strategy)\b/i.test(messageText)) return false;
  return /\b(?:create|write|draft|add|make)\b.*\b(?:blog\s+post|article|post)\b/i.test(messageText);
}

function isSiteBlogPostUpdateRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText) || isLikelyMissionTaskRequest(messageText)) return false;
  if (isSiteBlogPostCreateRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText) &&
      !/\b(?:rename|publish|unpublish|update|set|change|replace)\b.*\b(?:post|draft|article|excerpt|slug|title|body)\b/i.test(messageText)) return false;
  if (isLikelySocialPostRequest(messageText) || isSiteBlogPostArchiveRequest(messageText)) return false;
  return /\b(?:update|edit|change|set|replace|rename|publish|unpublish)\b.*\b(?:blog\s+post|article|post|draft|slug|excerpt|title|body|published\s+date|publishedAt)\b/i.test(messageText) ||
    /\b(?:rename|publish|unpublish)\s+(?:the\s+)?(?:draft\s+)?(?:blog\s+post|article|post)\b/i.test(messageText);
}

function isSiteBlogPostArchiveRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText) || isLikelyMissionTaskRequest(messageText)) return false;
  if (!mentionsSiteBlogPostDomain(messageText) && !/\b(?:blog\s+post|article|post)\b/i.test(messageText)) return false;
  if (isLikelySocialPostRequest(messageText)) return false;
  return /\b(?:delete|archive|remove)\b.*\b(?:blog\s+post|article|post)\b/i.test(messageText);
}

function isMissionContextReadRequest(messageText: string): boolean {
  if (isCoreChatCapabilityExplorationRequest(messageText)) return false;
  if (/\b(?:prioriti[sz]e|brainstorm|plan|strategize|strategise)\b/i.test(messageText)) return false;
  if (!/\b(?:mission\s+control|mission|project|tasks?|me\.json)\b/i.test(messageText)) return false;
  return /\b(?:read|show|check|pull up|summari[sz]e|cross[-\s]?reference)\b/i.test(messageText) &&
    /\b(?:context|mission\s+statement|goals?|audience|purpose|me\.json|cross[-\s]?reference)\b/i.test(messageText);
}

function mentionsSiteBlogPostDomain(messageText: string): boolean {
  return /\b(?:blog\s+posts?|blog|articles?|profile\s+site|public\s+site|site\s+posts?|site\s+drafts?)\b/i.test(messageText);
}

function mentionsExplicitSiteBlogDomain(messageText: string): boolean {
  return /\b(?:blog|profile\s+site|public\s+site|site\s+(?:posts?|drafts?)|draft|post)\b/i.test(messageText);
}

function isLikelySocialPostRequest(messageText: string): boolean {
  return /\b(?:social|linkedin|twitter|x\.com|instagram|tiktok|facebook|mastodon|bluesky)\b/i.test(messageText);
}

function isLikelyMissionTaskRequest(messageText: string): boolean {
  return /\b(?:mission\s+control|task|todo)\b/i.test(messageText);
}

function conversationDecision(confidence: number, reason: string): CoreChatToolPlannerDecision {
  return capabilityDecision("core.agent-chat.conversation", "conversation", confidence, reason);
}

function capabilityDecision(
  capabilityId: CoreChatCapabilityId,
  kind: CoreChatPlannerIntentKind,
  confidence: number,
  reason: string,
): CoreChatToolPlannerDecision {
  const capability = getCoreChatCapability(capabilityId);
  return {
    kind,
    confidence,
    capabilityId: capability.id,
    ownerFacingLabel: capability.ownerFacingLabel,
    handlerRoute: capability.handler.route,
    requiredSetupChecks: [...capability.requiresSetup],
    sideEffectLevel: capability.chat.sideEffectLevel,
    approvalRequired: isCoreChatCapabilityApprovalRequired(capability),
    auditEventKind: capability.auditEventKind,
    reason,
  };
}
