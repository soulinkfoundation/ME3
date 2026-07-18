import type { SocialPlatform } from "./index";

export type SocialPlatformCapabilities = {
  platform: SocialPlatform;
  draft: boolean;
  schedule: boolean;
  publish: boolean;
  reason: string | null;
};

const PLATFORM_CAPABILITIES: Record<SocialPlatform, SocialPlatformCapabilities> = {
  linkedin: {
    platform: "linkedin",
    draft: true,
    schedule: true,
    publish: true,
    reason: null,
  },
  x: {
    platform: "x",
    draft: true,
    schedule: false,
    publish: false,
    reason: "X Versions are draft-only until connection, scheduling, publishing, and recovery work end to end.",
  },
  instagram: {
    platform: "instagram",
    draft: true,
    schedule: false,
    publish: false,
    reason: "Instagram Versions are draft-only until connection, scheduling, publishing, and recovery work end to end.",
  },
  instagram_business: {
    platform: "instagram_business",
    draft: true,
    schedule: false,
    publish: false,
    reason: "Instagram Business Versions are draft-only until connection, scheduling, publishing, and recovery work end to end.",
  },
};

export function getSocialPlatformCapabilities(): SocialPlatformCapabilities[] {
  return [
    PLATFORM_CAPABILITIES.linkedin,
    PLATFORM_CAPABILITIES.x,
    PLATFORM_CAPABILITIES.instagram,
    PLATFORM_CAPABILITIES.instagram_business,
  ];
}

export function socialPlatformCapabilities(
  platform: SocialPlatform,
): SocialPlatformCapabilities {
  return PLATFORM_CAPABILITIES[platform];
}

export function canScheduleSocialPlatform(platform: SocialPlatform): boolean {
  return PLATFORM_CAPABILITIES[platform].schedule;
}

export function canPublishSocialPlatform(platform: SocialPlatform): boolean {
  return PLATFORM_CAPABILITIES[platform].publish;
}
