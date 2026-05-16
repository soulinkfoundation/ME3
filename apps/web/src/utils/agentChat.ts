export type AgentChatRuntimeResult = {
  specialist: string | null;
  replyText: string | null;
  model: string | null;
  source:
    | "openai"
    | "anthropic"
    | "workers-ai"
    | "workers-ai-gateway"
    | "fallback"
    | "tool"
    | null;
  fallbackReason?: string | null;
  debugError?: string | null;
  contextPacketId?: string | null;
  contextSummary?: string | null;
  contextManifest?: unknown;
};

const EMPTY_REPLY_FALLBACK =
  "I couldn't turn that into a useful reply just yet. Please try again.";

export function formatAgentRuntimeMetadata(
  result: AgentChatRuntimeResult,
  options?: { showRuntimeMetadata?: boolean },
): string | null {
  if (!options?.showRuntimeMetadata) return null;

  const parts = [
    result.source ? result.source : null,
    result.model ? result.model : null,
    result.specialist ? result.specialist : null,
    result.contextSummary ? result.contextSummary : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : null;
}

export function formatAgentRuntimeDetail(
  result: Pick<AgentChatRuntimeResult, "fallbackReason" | "debugError">,
): string | null {
  if (result.fallbackReason && result.debugError) {
    return `${result.fallbackReason}: ${result.debugError}`;
  }

  if (result.fallbackReason) {
    return result.fallbackReason;
  }

  if (result.debugError) {
    return result.debugError;
  }

  return null;
}

export function resolveAgentReplyText(
  replyText: string | null | undefined,
): string {
  const normalized = replyText?.trim();
  return normalized || EMPTY_REPLY_FALLBACK;
}
