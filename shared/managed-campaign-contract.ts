export const MANAGED_CAMPAIGN_PROTOCOL_VERSION = "me3-managed-campaign/2" as const;
export const MANAGED_CAMPAIGN_UNSUBSCRIBE_PLACEHOLDER =
  "{{ME3_MANAGED_UNSUBSCRIBE_URL}}" as const;

export type ManagedCampaignPermission = {
  status: "marketable";
  method: "single_opt_in" | "double_opt_in" | "import_attested";
  grantedAt: string;
  evidenceRef: string;
};

export type ManagedCampaignDeliveryRequest = {
  version: typeof MANAGED_CAMPAIGN_PROTOCOL_VERSION;
  operationId: string;
  kind: "campaign" | "test";
  campaignRef: string;
  senderRef: string;
  recipient: {
    ref: string;
    address: string;
    permission: ManagedCampaignPermission | null;
  };
  content: {
    fromName: string | null;
    replyToAddress: string | null;
    subject: string;
    text: string;
    html: string;
    unsubscribePlaceholder: typeof MANAGED_CAMPAIGN_UNSUBSCRIBE_PLACEHOLDER;
  };
  requestedAt: string;
  expiresAt: string;
};

export const MANAGED_CAMPAIGN_REASONS = [
  "allowance_exhausted",
  "canceled_before_acceptance",
  "complaint",
  "content_invalid",
  "expired",
  "hard_bounce",
  "idempotency_conflict",
  "installation_inactive",
  "operator_policy",
  "rate_limited",
  "sender_unauthorized",
  "test_recipient_unauthorized",
  "temporary_transport_failure",
  "transport_rejected",
  "unknown_acceptance",
  "unsubscribe",
  "verified_resubscribe",
] as const;

export type ManagedCampaignReason = (typeof MANAGED_CAMPAIGN_REASONS)[number];

export type ManagedCampaignSubmissionResponse =
  | {
      version: typeof MANAGED_CAMPAIGN_PROTOCOL_VERSION;
      operationId: string;
      disposition: "accepted";
      replayed: boolean;
      acceptedAt: string;
    }
  | {
      version: typeof MANAGED_CAMPAIGN_PROTOCOL_VERSION;
      operationId: string;
      disposition: "rejected" | "canceled";
      replayed: boolean;
      reason: ManagedCampaignReason;
    }
  | {
      version: typeof MANAGED_CAMPAIGN_PROTOCOL_VERSION;
      operationId: string;
      disposition: "retry_later";
      replayed: boolean;
      reason: ManagedCampaignReason;
      retryAfterSeconds: number;
    }
  | {
      version: typeof MANAGED_CAMPAIGN_PROTOCOL_VERSION;
      operationId: string;
      disposition: "in_progress" | "delivery_unknown";
      replayed: boolean;
    };

export const MANAGED_CAMPAIGN_EVENT_TYPES = [
  "delivery.accepted",
  "delivery.delivered",
  "delivery.delayed",
  "delivery.bounced",
  "delivery.complained",
  "delivery.rejected",
  "delivery.failed",
  "delivery.unknown",
  "recipient.unsubscribed",
  "recipient.suppressed",
  "recipient.unsuppressed",
] as const;

export type ManagedCampaignEventType =
  (typeof MANAGED_CAMPAIGN_EVENT_TYPES)[number];

export type ManagedCampaignEvent = {
  version: typeof MANAGED_CAMPAIGN_PROTOCOL_VERSION;
  eventId: string;
  sequence: number;
  occurredAt: string;
  operationId: string;
  campaignRef: string;
  recipientRef: string;
  type: ManagedCampaignEventType;
  reason: ManagedCampaignReason | null;
};

export type ManagedCampaignEventBatch = {
  version: typeof MANAGED_CAMPAIGN_PROTOCOL_VERSION;
  events: ManagedCampaignEvent[];
  nextCursor: string;
};

export type ManagedCampaignSenderStatus = {
  connected: boolean;
  provider: "aws_ses" | "postmark";
  sender?: {
    ref: string;
    domain: string;
    fromAddress: string;
    status: string;
  };
  ready: boolean;
  instructions: string[];
};

const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function parseManagedCampaignSubmissionResponse(
  value: unknown,
): ManagedCampaignSubmissionResponse | null {
  if (!isRecord(value) || value.version !== MANAGED_CAMPAIGN_PROTOCOL_VERSION) {
    return null;
  }
  if (!isReference(value.operationId) || typeof value.replayed !== "boolean") {
    return null;
  }
  if (
    value.disposition === "accepted" &&
    typeof value.acceptedAt === "string" &&
    Number.isFinite(Date.parse(value.acceptedAt))
  ) {
    return value as ManagedCampaignSubmissionResponse;
  }
  if (
    (value.disposition === "rejected" || value.disposition === "canceled") &&
    isReason(value.reason)
  ) {
    return value as ManagedCampaignSubmissionResponse;
  }
  if (
    value.disposition === "retry_later" &&
    isReason(value.reason) &&
    Number.isInteger(value.retryAfterSeconds) &&
    Number(value.retryAfterSeconds) > 0
  ) {
    return value as ManagedCampaignSubmissionResponse;
  }
  if (
    value.disposition === "in_progress" ||
    value.disposition === "delivery_unknown"
  ) {
    return value as ManagedCampaignSubmissionResponse;
  }
  return null;
}

export function parseManagedCampaignEvent(value: unknown): ManagedCampaignEvent | null {
  if (
    !isRecord(value) ||
    value.version !== MANAGED_CAMPAIGN_PROTOCOL_VERSION ||
    !isReference(value.eventId) ||
    !Number.isInteger(value.sequence) ||
    Number(value.sequence) < 1 ||
    typeof value.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(value.occurredAt)) ||
    !isReference(value.operationId) ||
    !isReference(value.campaignRef) ||
    !isReference(value.recipientRef) ||
    !MANAGED_CAMPAIGN_EVENT_TYPES.includes(value.type as ManagedCampaignEventType) ||
    (value.reason !== null && !isReason(value.reason))
  ) {
    return null;
  }
  return value as ManagedCampaignEvent;
}

function isReason(value: unknown): value is ManagedCampaignReason {
  return MANAGED_CAMPAIGN_REASONS.includes(value as ManagedCampaignReason);
}

function isReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
