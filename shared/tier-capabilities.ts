export type SubscriptionTier = "free" | "starter" | "pro";

export interface TierCapabilities {
  maxSites: number;
  customDomain: boolean;
  footerCustomization: boolean;
  emailSendQuota: number;
  emailOverageRate: number;
  financialLedger: boolean;
  mailboxAlias: boolean;
  agentInbox: boolean;
  approvalFirstOutbound: boolean;
  shopEnabled: boolean;
  importFromUrl: boolean;
  agentEnabled: boolean;
  soulinkAgentAccess: boolean;
  telegramAgentAccess: boolean;
  notificationDelivery: boolean;
  bookingsEnabled: boolean;
  bookingReminders: boolean;
  newsletterSignup: boolean;
  agentJobs: boolean;
  agentJobsLimit: number;
}

export const TIER_CAPABILITIES: Record<SubscriptionTier, TierCapabilities> = {
  free: {
    maxSites: 1,
    customDomain: false,
    footerCustomization: false,
    emailSendQuota: 0,
    emailOverageRate: 0,
    financialLedger: false,
    mailboxAlias: false,
    agentInbox: false,
    approvalFirstOutbound: false,
    shopEnabled: false,
    importFromUrl: true,
    agentEnabled: false,
    soulinkAgentAccess: false,
    telegramAgentAccess: false,
    notificationDelivery: true,
    bookingsEnabled: false,
    bookingReminders: false,
    newsletterSignup: false,
    agentJobs: false,
    agentJobsLimit: 0,
  },
  starter: {
    maxSites: 1,
    customDomain: true,
    footerCustomization: true,
    emailSendQuota: 0,
    emailOverageRate: 0,
    financialLedger: false,
    mailboxAlias: false,
    agentInbox: false,
    approvalFirstOutbound: false,
    shopEnabled: false,
    importFromUrl: true,
    agentEnabled: false,
    soulinkAgentAccess: false,
    telegramAgentAccess: false,
    notificationDelivery: true,
    bookingsEnabled: true,
    bookingReminders: true,
    newsletterSignup: true,
    agentJobs: false,
    agentJobsLimit: 0,
  },
  pro: {
    maxSites: 4,
    customDomain: true,
    footerCustomization: true,
    emailSendQuota: 5000,
    emailOverageRate: 2,
    financialLedger: true,
    mailboxAlias: true,
    agentInbox: true,
    approvalFirstOutbound: true,
    shopEnabled: true,
    importFromUrl: true,
    agentEnabled: false,
    soulinkAgentAccess: true,
    telegramAgentAccess: true,
    notificationDelivery: true,
    bookingsEnabled: true,
    bookingReminders: true,
    newsletterSignup: true,
    agentJobs: true,
    agentJobsLimit: 5,
  },
};

export function normalizeSubscriptionTier(
  tier: string | null | undefined,
): SubscriptionTier {
  if (tier === "pro") return "pro";
  if (tier === "starter") return "starter";
  return "free";
}

export function getTierCapabilities(
  tier: string | null | undefined,
): TierCapabilities {
  return TIER_CAPABILITIES[normalizeSubscriptionTier(tier)];
}

export const PAID_TIERS: SubscriptionTier[] = ["starter", "pro"];

export function isPaidTier(tier: string | null | undefined): boolean {
  return PAID_TIERS.includes(normalizeSubscriptionTier(tier));
}
