import { defineStore } from "pinia";
import { ref } from "vue";
import { api, ApiError } from "../api";

export type SocialAccountRow = {
  id: string;
  siteId: string;
  platform: string;
  handle: string | null;
  displayName: string | null;
  status: string;
  lastVerifiedAt: string | null;
};

export type SocialStatus = {
  plugin: {
    status: string;
    enabled: boolean;
    ready: boolean;
    statusLabel: string;
  };
  hostedOAuth: {
    configured: boolean;
    platforms: string[];
  };
};

export type SocialProviderSetting = {
  providerId: "x" | "linkedin" | "instagram" | "instagram_business";
  label: string;
  clientId: string;
  configured: boolean;
  enabled: boolean;
  secretHint: string | null;
  secretUpdatedAt: string | null;
  callbackPath: string;
};

export type SocialPlatform = "x" | "linkedin" | "instagram" | "instagram_business";

export type SocialContentVariant = {
  id: string;
  packageId: string;
  platform: SocialPlatform;
  targetAccountId: string | null;
  format: "post" | "carousel";
  bodyText: string;
  assetManifest: Array<{
    url: string;
    filename?: string;
    mimeType?: string;
    kind?: "image" | "video";
  }>;
  sourceExcerpt: string | null;
  approvalStatus: "draft" | "approved" | "rejected";
  approvedAt: string | null;
  approvedByUserId: string | null;
  scheduledFor: string | null;
  timezone: string | null;
  publicationStatus: "queued" | "publishing" | "published" | "failed" | "cancelled" | null;
  platformPostUrl: string | null;
  publishedAt: string | null;
  failureClass: "retryable" | "reconnect_required" | "rejected" | "unsupported" | "outcome_unknown" | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialContentPackage = {
  package: {
    id: string;
    siteId: string;
    sourceType: "journal" | "mission_task" | "site" | "pasted" | "original";
    sourceRef: string | null;
    sourceSnapshot: string;
    ideaText: string;
    goal: string | null;
    status: "draft" | "ready" | "partially_published" | "published" | "failed" | "archived";
    createdBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
  };
  variants: SocialContentVariant[];
};

export type SocialVariantUpdate = {
  targetAccountId?: string | null;
  bodyText?: string;
  approvalStatus?: SocialContentVariant["approvalStatus"];
  scheduledFor?: string | null;
  timezone?: string | null;
};

export const useSocialStore = defineStore("social", () => {
  const error = ref<string | null>(null);
  const loading = ref(false);

  async function fetchSocialStatus(): Promise<SocialStatus> {
    error.value = null;
    return api.get<SocialStatus>("/social/status");
  }

  async function fetchSocialAccounts(): Promise<SocialAccountRow[]> {
    error.value = null;
    const data = await api.get<{ accounts: SocialAccountRow[] }>(
      "/social/accounts",
    );
    return data.accounts || [];
  }

  async function fetchProviderSettings(): Promise<SocialProviderSetting[]> {
    error.value = null;
    const data = await api.get<{ providers: SocialProviderSetting[] }>(
      "/social/provider-settings",
    );
    return data.providers || [];
  }

  async function fetchContentPackages(siteId: string): Promise<SocialContentPackage[]> {
    error.value = null;
    const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
    const data = await api.get<{ packages: SocialContentPackage[] }>(
      `/social/packages${query}`,
    );
    return data.packages || [];
  }

  async function updateContentVariant(
    variantId: string,
    input: SocialVariantUpdate,
  ): Promise<SocialContentVariant> {
    error.value = null;
    const data = await api.patch<{ variant: SocialContentVariant }>(
      `/social/variants/${encodeURIComponent(variantId)}`,
      input,
    );
    if (!data.variant) throw new Error("No social variant returned");
    return data.variant;
  }

  async function publishContentVariant(variantId: string): Promise<{
    id: string;
    variantId: string;
    status: SocialContentVariant["publicationStatus"];
    platformPostUrl: string | null;
  }> {
    error.value = null;
    const data = await api.post<{
      publication: {
        id: string;
        variantId: string;
        status: SocialContentVariant["publicationStatus"];
        platformPostUrl: string | null;
      };
    }>(`/social/variants/${encodeURIComponent(variantId)}/publish`, {});
    if (!data.publication) throw new Error("No social publication returned");
    return data.publication;
  }

  async function updateProviderSetting(payload: {
    id: SocialProviderSetting["providerId"];
    clientId: string;
    clientSecret?: string;
    enabled: boolean;
  }): Promise<SocialProviderSetting[]> {
    error.value = null;
    const data = await api.put<{ providers: SocialProviderSetting[] }>(
      "/social/provider-settings",
      { providers: [payload] },
    );
    return data.providers || [];
  }

  async function startSocialOAuth(
    platform:
      | "x"
      | "linkedin"
      | "instagram"
      | "instagram_business"
      | "youtube",
    siteId: string,
    returnPath?: string,
  ): Promise<string> {
    error.value = null;
    const data = await api.post<{ url: string }>(
      `/social/${platform}/authorize`,
      { siteId, returnPath: returnPath || null },
    );
    if (!data.url) throw new Error("No OAuth URL");
    return data.url;
  }

  async function disconnectSocialAccount(accountId: string): Promise<void> {
    error.value = null;
    await api.delete(`/social/accounts/${encodeURIComponent(accountId)}`);
  }

  function setErrorFromApi(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
      error.value = e.message;
    } else {
      error.value = fallback;
    }
  }

  return {
    error,
    loading,
    fetchSocialStatus,
    fetchSocialAccounts,
    fetchProviderSettings,
    fetchContentPackages,
    updateContentVariant,
    publishContentVariant,
    updateProviderSetting,
    startSocialOAuth,
    disconnectSocialAccount,
    setErrorFromApi,
  };
});
