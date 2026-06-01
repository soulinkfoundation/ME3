import type { ContentMediaAsset, SocialPlatform } from "./index";

export type SocialPublishAdapterResult = {
  ok: boolean;
  platformPostId?: string;
  platformPostUrl?: string;
  providerResponse?: unknown;
  errorCode?: string;
  errorMessage?: string;
};

export type SocialPublishAdapter = {
  validateDraft(input: {
    bodyText: string;
    assets: ContentMediaAsset[];
  }): { ok: true } | { ok: false; error: string };
  publish(input: {
    accessToken: string;
    accountId: string;
    bodyText: string;
    assets: ContentMediaAsset[];
    fetcher: typeof fetch;
  }): Promise<SocialPublishAdapterResult>;
};

const X_CHAR_LIMIT = 280;
const LINKEDIN_MAX_CHARS = 3000;
const LINKEDIN_VERSION = "202510";
const INSTAGRAM_MAX_CHARS = 2200;

export function adapterFor(platform: SocialPlatform): SocialPublishAdapter {
  if (platform === "x") return xAdapter;
  if (platform === "linkedin") return linkedInAdapter;
  return instagramAdapter;
}

function providerError(
  errorCode: string,
  errorMessage: string,
  providerResponse?: unknown,
): SocialPublishAdapterResult {
  return { ok: false, errorCode, errorMessage, providerResponse };
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

function linkedInHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Linkedin-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

const linkedInAdapter: SocialPublishAdapter = {
  validateDraft(input) {
    const body = input.bodyText.trim();
    if (!body) return { ok: false, error: "This LinkedIn draft is empty." };
    if (body.length > LINKEDIN_MAX_CHARS) {
      return {
        ok: false,
        error: `This LinkedIn draft is too long (max ${LINKEDIN_MAX_CHARS} characters).`,
      };
    }
    return { ok: true };
  },

  async publish(input) {
    const userinfoResponse = await input.fetcher("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
    if (!userinfoResponse.ok) {
      return providerError(
        "linkedin_userinfo",
        "Your LinkedIn connection may have expired.",
        await userinfoResponse.text().catch(() => ""),
      );
    }

    const userinfo = await readJson<{ sub?: string }>(userinfoResponse);
    const sub = userinfo.sub?.trim();
    if (!sub) {
      return providerError("linkedin_person_urn", "Could not resolve LinkedIn member id.", userinfo);
    }

    const author = sub.startsWith("urn:li:") ? sub : `urn:li:person:${sub}`;
    const postResponse = await input.fetcher("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: linkedInHeaders(input.accessToken),
      body: JSON.stringify({
        author,
        commentary: input.bodyText,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    const json = await readJson<Record<string, unknown>>(postResponse);
    if (!postResponse.ok) {
      return providerError(
        "linkedin_post_error",
        (json.message as string) || (json.error as string) || `LinkedIn API error (${postResponse.status})`,
        json,
      );
    }

    const id =
      (json.id as string | undefined) ||
      postResponse.headers.get("x-restli-id") ||
      undefined;
    return {
      ok: true,
      platformPostId: id,
      platformPostUrl: id ? `https://www.linkedin.com/feed/update/${id}` : undefined,
      providerResponse: json,
    };
  },
};

const xAdapter: SocialPublishAdapter = {
  validateDraft(input) {
    const body = input.bodyText.trim();
    if (!body) return { ok: false, error: "This X draft is empty." };
    if (body.length > X_CHAR_LIMIT) {
      return { ok: false, error: `This X draft is too long (max ${X_CHAR_LIMIT} characters).` };
    }
    if (input.assets.some((asset) => asset.kind === "video")) {
      return { ok: false, error: "X publishing currently supports text and image posts only." };
    }
    return { ok: true };
  },

  async publish(input) {
    const response = await input.fetcher("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.bodyText.trim() }),
    });
    const json = await readJson<{
      data?: { id?: string };
      errors?: Array<{ title?: string; detail?: string }>;
      title?: string;
      detail?: string;
    }>(response);
    if (!response.ok) {
      const message =
        json.errors?.[0]?.detail ||
        json.errors?.[0]?.title ||
        json.detail ||
        json.title ||
        `X API error (${response.status})`;
      return providerError("x_api_error", message, json);
    }
    const id = json.data?.id;
    if (!id) return providerError("x_missing_id", "X did not return a post id.", json);
    return {
      ok: true,
      platformPostId: id,
      platformPostUrl: `https://x.com/i/web/status/${id}`,
      providerResponse: json,
    };
  },
};

const instagramAdapter: SocialPublishAdapter = {
  validateDraft(input) {
    const body = input.bodyText.trim();
    const imageAssets = input.assets.filter((asset) => asset.kind !== "video");
    if (!body) return { ok: false, error: "This Instagram draft is empty." };
    if (body.length > INSTAGRAM_MAX_CHARS) {
      return {
        ok: false,
        error: `This Instagram draft is too long (max ${INSTAGRAM_MAX_CHARS} characters).`,
      };
    }
    if (imageAssets.length === 0) {
      return {
        ok: false,
        error: "Instagram publishing needs an image URL. Add an image before publishing.",
      };
    }
    if (imageAssets.length > 1) {
      return {
        ok: false,
        error: "Instagram Core publishing currently supports one image per post.",
      };
    }
    return { ok: true };
  },

  async publish(input) {
    const imageUrl = input.assets.find((asset) => asset.kind !== "video")?.url;
    if (!imageUrl) {
      return providerError("instagram_missing_image", "Instagram publishing needs an image URL.");
    }

    const createResponse = await input.fetcher(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(input.accountId)}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          image_url: imageUrl,
          caption: input.bodyText,
          access_token: input.accessToken,
        }),
      },
    );
    const createJson = await readJson<{ id?: string; error?: { message?: string } }>(createResponse);
    if (!createResponse.ok || !createJson.id) {
      return providerError(
        "instagram_media_create",
        createJson.error?.message || `Instagram media creation failed (${createResponse.status}).`,
        createJson,
      );
    }

    const publishResponse = await input.fetcher(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(input.accountId)}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: createJson.id,
          access_token: input.accessToken,
        }),
      },
    );
    const publishJson = await readJson<{ id?: string; error?: { message?: string } }>(publishResponse);
    if (!publishResponse.ok) {
      return providerError(
        "instagram_media_publish",
        publishJson.error?.message || `Instagram publish failed (${publishResponse.status}).`,
        publishJson,
      );
    }

    return {
      ok: true,
      platformPostId: publishJson.id || createJson.id,
      providerResponse: { create: createJson, publish: publishJson },
    };
  },
};
