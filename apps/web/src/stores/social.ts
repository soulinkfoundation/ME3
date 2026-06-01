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
    updateProviderSetting,
    startSocialOAuth,
    disconnectSocialAccount,
    setErrorFromApi,
  };
});
