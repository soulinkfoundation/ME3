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
  siteAction?: AgentChatSiteAction | null;
  actionCards?: AgentChatActionCard[] | null;
  trace?: AgentChatTurnTrace | null;
};

export type AgentChatSiteAction = {
  kind:
    | "draft_created"
    | "draft_refined"
    | "published"
    | "approval_status"
    | "missing_site"
    | "unsupported_feature"
    | "listed_blog_posts";
  url?: string | null;
  postTitle?: string | null;
  pending?: boolean;
  published?: boolean;
};

export type AgentChatActionLink = {
  href: string;
  label: string;
};

export type AgentChatActionCardStatus =
  | "draft"
  | "pending_approval"
  | "pending"
  | "complete"
  | "failed";

export type AgentChatActionCardField = {
  label: string;
  value: string;
};

export type AgentChatActionCardRecord = {
  kind: string;
  id: string;
};

export type AgentChatActionCard = {
  id: string;
  kind: string;
  capabilityId: string;
  title: string;
  summary: string | null;
  status: AgentChatActionCardStatus;
  statusLabel: string;
  changed: AgentChatActionCardField[];
  records: AgentChatActionCardRecord[];
  primaryAction: AgentChatActionLink | null;
  secondaryActions: AgentChatActionLink[];
};

export type AgentChatTurnTrace = {
  turnId?: string;
  planner?: {
    kind?: string;
    confidence?: number;
    capabilityId?: string;
    reason?: string;
  };
  route?: {
    path?: string;
    capabilityId?: string;
    ownerFacingLabel?: string;
    handlerRoute?: string;
    reason?: string;
    setupChecks?: string[];
    approvalRequired?: boolean;
    sideEffectLevel?: string;
    auditEventKind?: string;
  };
  selectedModel?: {
    providerId?: string;
    model?: string;
    backupModel?: string | null;
    configured?: boolean;
    responseModel?: string | null;
  } | null;
  context?: {
    status?: string;
    packetId?: string | null;
    summary?: string | null;
    sourceCount?: number;
    error?: string | null;
  };
  modelCall?: {
    status?: string;
    providerId?: string | null;
    model?: string | null;
    fallbackReason?: string | null;
    debugError?: string | null;
    attempts?: Array<{
      providerId?: string;
      model?: string;
      status?: string;
      error?: string | null;
    }>;
  };
  toolResult?: {
    status?: string;
    specialist?: string | null;
    source?: string | null;
  };
  audit?: {
    auditId?: string | null;
  };
};

export type AgentChatTraceRow = {
  label: string;
  value: string;
};

const EMPTY_REPLY_FALLBACK =
  "I couldn't turn that into a useful reply just yet. Please try again.";
const ACTION_CARD_STATUSES = new Set<AgentChatActionCardStatus>([
  "draft",
  "pending_approval",
  "pending",
  "complete",
  "failed",
]);

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

export function formatAgentTraceRows(
  trace: AgentChatTurnTrace | null | undefined,
): AgentChatTraceRow[] {
  if (!trace) return [];

  const attempts = trace.modelCall?.attempts || [];
  const rows: AgentChatTraceRow[] = [
    { label: "Turn", value: trace.turnId || "" },
    {
      label: "Planner",
      value: joinTraceParts([
        trace.planner?.kind,
        trace.planner?.confidence === undefined
          ? null
          : `confidence ${trace.planner.confidence}`,
        trace.planner?.capabilityId,
      ]),
    },
    {
      label: "Route",
      value: joinTraceParts([
        trace.route?.path,
        trace.route?.capabilityId,
        trace.route?.approvalRequired ? "approval required" : null,
      ]),
    },
    {
      label: "Model",
      value: joinTraceParts([
        trace.modelCall?.status,
        trace.selectedModel?.providerId,
        trace.modelCall?.model || trace.selectedModel?.model,
        attempts.length
          ? `${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`
          : null,
      ]),
    },
    {
      label: "Context",
      value: joinTraceParts([
        trace.context?.status,
        trace.context?.sourceCount === undefined
          ? null
          : `${trace.context.sourceCount} source${
              trace.context.sourceCount === 1 ? "" : "s"
            }`,
        trace.context?.packetId,
      ]),
    },
    {
      label: "Tool",
      value: joinTraceParts([
        trace.toolResult?.status,
        trace.toolResult?.specialist,
      ]),
    },
    { label: "Audit", value: trace.audit?.auditId || "" },
    {
      label: "Fallback",
      value: joinTraceParts([
        trace.modelCall?.fallbackReason,
        trace.modelCall?.debugError,
        trace.context?.error,
      ]),
    },
    {
      label: "Reason",
      value: trace.route?.reason || trace.planner?.reason || "",
    },
  ];

  return rows.filter((row) => row.value.trim().length > 0);
}

export function resolveAgentReplyText(
  replyText: string | null | undefined,
): string {
  const normalized = replyText?.trim();
  return normalized || EMPTY_REPLY_FALLBACK;
}

export function normalizeAgentActionCards(value: unknown): AgentChatActionCard[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const id = normalizedActionCardText(raw.id);
    const kind = normalizedActionCardText(raw.kind);
    const title = normalizedActionCardText(raw.title);
    if (!id || !kind || !title) return [];

    const status = ACTION_CARD_STATUSES.has(raw.status as AgentChatActionCardStatus)
      ? (raw.status as AgentChatActionCardStatus)
      : "pending";
    const statusLabel =
      normalizedActionCardText(raw.statusLabel) || actionCardStatusLabel(status);

    return [
      {
        id,
        kind,
        capabilityId: normalizedActionCardText(raw.capabilityId) || kind,
        title,
        summary: normalizedActionCardText(raw.summary),
        status,
        statusLabel,
        changed: normalizeActionCardFields(raw.changed),
        records: normalizeActionCardRecords(raw.records),
        primaryAction: normalizeActionCardLink(raw.primaryAction),
        secondaryActions: Array.isArray(raw.secondaryActions)
          ? raw.secondaryActions.flatMap((link) => {
              const normalized = normalizeActionCardLink(link);
              return normalized ? [normalized] : [];
            })
          : [],
      },
    ];
  });
}

export function resolveAgentSiteActionLink(
  result: Pick<AgentChatRuntimeResult, "siteAction">,
): AgentChatActionLink | null {
  const action = result.siteAction;
  if (!action?.url) return null;

  switch (action.kind) {
    case "draft_created":
      return {
        href: action.url,
        label: action.postTitle ? "Review blog draft" : "Review site draft",
      };
    case "draft_refined":
      return {
        href: action.url,
        label: "Review pending draft",
      };
    case "published":
      return {
        href: action.url,
        label: action.postTitle && action.pending ? "Review blog draft" : "Open site dashboard",
      };
    case "approval_status":
      return {
        href: action.url,
        label: action.pending ? "Review pending draft" : "Open site dashboard",
      };
    case "unsupported_feature":
      return {
        href: action.url,
        label: "Open site settings",
      };
    case "listed_blog_posts":
      return {
        href: action.url,
        label: "Open site dashboard",
      };
    case "missing_site":
    default:
      return null;
  }
}

function normalizedActionCardText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeActionCardFields(value: unknown): AgentChatActionCardField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const label = normalizedActionCardText(raw.label);
    const fieldValue = normalizedActionCardText(raw.value);
    return label && fieldValue ? [{ label, value: fieldValue }] : [];
  });
}

function normalizeActionCardRecords(value: unknown): AgentChatActionCardRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const kind = normalizedActionCardText(raw.kind);
    const id = normalizedActionCardText(raw.id);
    return kind && id ? [{ kind, id }] : [];
  });
}

function normalizeActionCardLink(value: unknown): AgentChatActionLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const href = normalizedActionCardText(raw.href);
  const label = normalizedActionCardText(raw.label);
  if (!href || !label || !href.startsWith("/")) return null;
  return { href, label };
}

function joinTraceParts(values: Array<string | null | undefined>): string {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" · ");
}

function actionCardStatusLabel(status: AgentChatActionCardStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending_approval":
      return "Needs review";
    case "pending":
      return "Pending";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
  }
}
