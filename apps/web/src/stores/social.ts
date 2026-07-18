import { defineStore } from "pinia";
import { ref } from "vue";
import { api, ApiError } from "../api";

export type SocialPlatform = "x" | "linkedin" | "instagram" | "instagram_business";

export type SocialPlatformCapabilities = {
  platform: SocialPlatform;
  draft: boolean;
  schedule: boolean;
  publish: boolean;
  reason: string | null;
};

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
    platformCapabilities: SocialPlatformCapabilities[];
  };
  hostedOAuth: {
    configured: boolean;
    platforms: string[];
  };
};

export type SocialProviderSetting = {
  providerId: SocialPlatform;
  label: string;
  clientId: string;
  configured: boolean;
  enabled: boolean;
  secretHint: string | null;
  secretUpdatedAt: string | null;
  callbackPath: string;
};

export type SocialMediaAsset = {
  url: string;
  filename?: string;
  mimeType?: string;
  kind?: "image" | "video";
};

export type PostVersion = {
  id: string;
  postId: string;
  platform: SocialPlatform;
  targetAccountId: string | null;
  format: "post" | "carousel";
  bodyText: string;
  assetManifest: SocialMediaAsset[];
  sourceExcerpt: string | null;
  approvalStatus: "draft" | "approved" | "rejected";
  approvedAt: string | null;
  approvedByUserId: string | null;
  scheduledFor: string | null;
  timezone: string | null;
  publicationStatus: "scheduled" | "queued" | "publishing" | "published" | "failed" | "cancelled" | null;
  platformPostUrl: string | null;
  publishedAt: string | null;
  failureClass: "retryable" | "reconnect_required" | "rejected" | "unsupported" | "outcome_unknown" | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialPostDetail = {
  post: {
    id: string;
    siteId: string;
    sourceType: "journal" | "mission_task" | "site" | "file" | "script" | "pasted" | "legacy_content_bank_read_only";
    sourceRef: string | null;
    sourceSnapshot: string;
    sourceText: string;
    ideaText: string;
    goal: string | null;
    status: "draft" | "ready" | "partially_published" | "published" | "failed" | "archived";
    createdBy: "user" | "agent";
    createdAt: string;
    updatedAt: string;
  };
  versions: PostVersion[];
};

export type SocialSuggestionKind = "quote" | "short_post" | "thread" | "carousel_outline";

export type SocialSuggestion = {
  id: string;
  siteId: string;
  sourceType: "journal" | "mission_task" | "site" | "file" | "script" | "pasted";
  sourceRef: string;
  sourceTitle: string;
  sourceSnapshot: string;
  sourceText: string;
  kind: SocialSuggestionKind;
  bodyText: string;
  sourceExcerpt: string;
  quoteTrimmed: boolean;
  status: "suggested" | "choosing" | "chosen" | "discarded";
  selectedPostId: string | null;
  choosingPlatforms: SocialPlatform[] | null;
  choosingAt: string | null;
  createdBy: "user" | "agent";
  createdAt: string;
  updatedAt: string;
};

export type SocialSuggestionUpdate = {
  expectedUpdatedAt: string;
  bodyText?: string;
  sourceExcerpt?: string;
  quoteTrimmed?: boolean;
};

export type CreateSocialPostInput = {
  siteId: string;
  sourceType: "pasted";
  sourceSnapshot: string;
  sourceText: string;
  ideaText: string;
  versions: Array<{
    platform: SocialPlatform;
    targetAccountId?: string | null;
    bodyText: string;
  }>;
};

export type PostVersionUpdate = {
  targetAccountId?: string | null;
  bodyText?: string;
  approvalStatus?: PostVersion["approvalStatus"];
};

export type PublicationStatus =
  | "scheduled"
  | "queued"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export type Publication = {
  id: string;
  versionId: string;
  platform: SocialPlatform;
  status: PublicationStatus;
  scheduledFor: string | null;
  timezone: string | null;
  queuedAt: string | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
  publishedAt: string | null;
  failureClass: PostVersion["failureClass"];
  errorCode: string | null;
  errorMessage: string | null;
  requestedByType: "owner" | "agent" | "migration" | null;
  requestedByUserId: string | null;
  requestContext: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreatePublicationInput = {
  scheduledFor?: string | null;
  timezone?: string | null;
  requestContext?: unknown;
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
    const data = await api.get<{ accounts: SocialAccountRow[] }>("/social/accounts");
    return data.accounts || [];
  }

  async function fetchProviderSettings(): Promise<SocialProviderSetting[]> {
    error.value = null;
    const data = await api.get<{ providers: SocialProviderSetting[] }>(
      "/social/provider-settings",
    );
    return data.providers || [];
  }

  async function fetchSocialPosts(siteId: string): Promise<SocialPostDetail[]> {
    error.value = null;
    const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
    const data = await api.get<{ posts: SocialPostDetail[] }>(`/social/posts${query}`);
    return data.posts || [];
  }

  async function createSocialPost(input: CreateSocialPostInput): Promise<SocialPostDetail> {
    error.value = null;
    const data = await api.post<{ post: SocialPostDetail }>("/social/posts", input);
    if (!data.post) throw new Error("No Social Post returned");
    return data.post;
  }

  async function fetchSocialSuggestions(siteId: string): Promise<SocialSuggestion[]> {
    error.value = null;
    const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
    const data = await api.get<{ suggestions: SocialSuggestion[] }>(
      `/social/suggestions${query}`,
    );
    return data.suggestions || [];
  }

  async function updateSocialSuggestion(
    suggestionId: string,
    input: SocialSuggestionUpdate,
  ): Promise<SocialSuggestion> {
    error.value = null;
    const data = await api.patch<{ suggestion: SocialSuggestion }>(
      `/social/suggestions/${encodeURIComponent(suggestionId)}`,
      input,
    );
    if (!data.suggestion) throw new Error("No Social Suggestion returned");
    return data.suggestion;
  }

  async function discardSocialSuggestion(
    suggestionId: string,
    expectedUpdatedAt: string,
  ): Promise<SocialSuggestion> {
    error.value = null;
    const data = await api.delete<{ suggestion: SocialSuggestion }>(
      `/social/suggestions/${encodeURIComponent(suggestionId)}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`,
    );
    if (!data.suggestion) throw new Error("No Social Suggestion returned");
    return data.suggestion;
  }

  async function chooseSocialSuggestion(
    suggestionId: string,
    platforms: SocialPlatform[],
    expectedUpdatedAt: string,
  ): Promise<{ suggestion: SocialSuggestion; post: SocialPostDetail }> {
    error.value = null;
    const data = await api.post<{
      suggestion: SocialSuggestion;
      post: SocialPostDetail;
    }>(`/social/suggestions/${encodeURIComponent(suggestionId)}/post`, {
      platforms,
      expectedUpdatedAt,
    });
    if (!data.suggestion || !data.post) {
      throw new Error("No chosen Social Suggestion Post returned");
    }
    return data;
  }

  async function updatePostVersion(
    versionId: string,
    input: PostVersionUpdate,
  ): Promise<PostVersion> {
    error.value = null;
    const data = await api.patch<{ version: PostVersion }>(
      `/social/versions/${encodeURIComponent(versionId)}`,
      input,
    );
    if (!data.version) throw new Error("No Post Version returned");
    return data.version;
  }

  async function publishPostVersion(versionId: string): Promise<Publication> {
    error.value = null;
    const data = await api.post<{ publication: Publication }>(
      `/social/versions/${encodeURIComponent(versionId)}/publish`,
      {},
    );
    if (!data.publication) throw new Error("No Publication returned");
    return data.publication;
  }

  async function listPostVersionPublications(versionId: string): Promise<Publication[]> {
    error.value = null;
    const data = await api.get<{ publications: Publication[] }>(
      `/social/versions/${encodeURIComponent(versionId)}/publications`,
    );
    return data.publications || [];
  }

  async function createPostVersionPublication(
    versionId: string,
    input: CreatePublicationInput = {},
  ): Promise<Publication> {
    error.value = null;
    const data = await api.post<{ publication: Publication }>(
      `/social/versions/${encodeURIComponent(versionId)}/publications`,
      input,
    );
    if (!data.publication) throw new Error("No Publication returned");
    return data.publication;
  }

  async function cancelPublication(publicationId: string): Promise<Publication> {
    error.value = null;
    const data = await api.delete<{ publication: Publication }>(
      `/social/publications/${encodeURIComponent(publicationId)}`,
    );
    if (!data.publication) throw new Error("No Publication returned");
    return data.publication;
  }

  async function resolvePublicationOutcome(
    publicationId: string,
    outcome: "published" | "not_published",
    platformPostUrl?: string,
  ): Promise<Publication> {
    error.value = null;
    const data = await api.post<{ publication: Publication }>(
      `/social/publications/${encodeURIComponent(publicationId)}/resolve`,
      {
        outcome,
        platformPostUrl: platformPostUrl || null,
      },
    );
    if (!data.publication) throw new Error("No Publication returned");
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
    platform: SocialPlatform | "youtube",
    siteId: string,
    returnPath?: string,
    credentialSource?: "managed" | "byo",
  ): Promise<string> {
    error.value = null;
    const data = await api.post<{ url: string }>(
      `/social/${platform}/authorize`,
      { siteId, returnPath: returnPath || null, credentialSource },
    );
    if (!data.url) throw new Error("No OAuth URL");
    return data.url;
  }

  async function disconnectSocialAccount(accountId: string): Promise<void> {
    error.value = null;
    await api.delete(`/social/accounts/${encodeURIComponent(accountId)}`);
  }

  function setErrorFromApi(e: unknown, fallback: string) {
    error.value = e instanceof ApiError ? e.message : fallback;
  }

  return {
    error,
    loading,
    fetchSocialStatus,
    fetchSocialAccounts,
    fetchProviderSettings,
    fetchSocialPosts,
    fetchSocialSuggestions,
    createSocialPost,
    updateSocialSuggestion,
    discardSocialSuggestion,
    chooseSocialSuggestion,
    updatePostVersion,
    publishPostVersion,
    listPostVersionPublications,
    createPostVersionPublication,
    cancelPublication,
    resolvePublicationOutcome,
    updateProviderSetting,
    startSocialOAuth,
    disconnectSocialAccount,
    setErrorFromApi,
  };
});
