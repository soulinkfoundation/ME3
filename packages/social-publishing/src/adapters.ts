import type { SocialMediaAsset, SocialPlatform } from "./index";
import { sniffCarouselRasterMimeType } from "./carousel-renderer";
import type { CarouselRasterMimeType } from "./carousel-render-model";

export type SocialPublishAdapterResult = {
  ok: boolean;
  platformPostId?: string;
  platformPostUrl?: string;
  providerResponse?: unknown;
  errorCode?: string;
  errorMessage?: string;
  failureClass?: SocialPublishFailureClass;
};

export type SocialPublishFailureClass =
  | "retryable"
  | "reconnect_required"
  | "rejected"
  | "unsupported"
  | "outcome_unknown";

export type SocialPublishAdapter = {
  validateDraft(input: {
    bodyText: string;
    assets: SocialMediaAsset[];
  }): { ok: true } | { ok: false; error: string };
  publish(input: {
    accessToken: string;
    accountId: string;
    bodyText: string;
    assets: SocialMediaAsset[];
    fetcher: typeof fetch;
    markProviderWriteStarted?: () => Promise<void>;
  }): Promise<SocialPublishAdapterResult>;
};

const X_CHAR_LIMIT = 280;
const X_IMAGE_COUNT_LIMIT = 4;
const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const X_ALT_TEXT_LIMIT = 1_000;
const X_IMAGE_MIME_TYPES = new Set<CarouselRasterMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const LINKEDIN_MAX_CHARS = 3000;
const LINKEDIN_VERSION = "202606";
const INSTAGRAM_MAX_CHARS = 2200;
const INSTAGRAM_CAROUSEL_MAX_ITEMS = 10;
const INSTAGRAM_GRAPH_VERSION = "v21.0";
const TIKTOK_UPLOAD_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
const TIKTOK_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";
const TIKTOK_SINGLE_CHUNK_MAX_BYTES = 64 * 1024 * 1024;
const TIKTOK_MULTI_CHUNK_BYTES = 32 * 1024 * 1024;
const TIKTOK_MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const TIKTOK_STATUS_ATTEMPTS = 6;
const TIKTOK_STATUS_POLL_MS = 2_000;
const TIKTOK_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export function adapterFor(platform: SocialPlatform): SocialPublishAdapter {
  if (platform === "x") return xAdapter;
  if (platform === "linkedin") return linkedInAdapter;
  if (platform === "tiktok") return tikTokAdapter;
  if (platform === "youtube") return youtubeAdapter;
  return createInstagramAdapter(platform);
}

function providerError(
  errorCode: string,
  errorMessage: string,
  providerResponse?: unknown,
  failureClass: SocialPublishFailureClass = "rejected",
): SocialPublishAdapterResult {
  return { ok: false, errorCode, errorMessage, providerResponse, failureClass };
}

function failureClassForStatus(status: number): SocialPublishFailureClass {
  if (status === 401 || status === 403) return "reconnect_required";
  if (status === 409 || status === 429 || status >= 500) return "retryable";
  if (status === 400 || status === 422) return "rejected";
  return "unsupported";
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

type XErrorBody = {
  data?: { id?: string };
  errors?: Array<{ title?: string; detail?: string }>;
  title?: string;
  detail?: string;
};

function xErrorMessage(body: XErrorBody, fallback: string): string {
  return body.errors?.[0]?.detail ||
    body.errors?.[0]?.title ||
    body.detail ||
    body.title ||
    fallback;
}

function normalizeMimeType(value: string | null | undefined): string | null {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return mimeType || null;
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function describeFetchError(error: unknown): { message: string } {
  return { message: error instanceof Error ? error.message : String(error) };
}

function xHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function validateXDraft(input: {
  bodyText: string;
  assets: SocialMediaAsset[];
}): { ok: true } | { ok: false; error: string } {
  const body = input.bodyText.trim();
  if (!body) return { ok: false, error: "This X draft is empty." };
  if (characterLength(body) > X_CHAR_LIMIT) {
    return { ok: false, error: `This X draft is too long (max ${X_CHAR_LIMIT} characters).` };
  }
  if (input.assets.length > X_IMAGE_COUNT_LIMIT) {
    return {
      ok: false,
      error: `X publishing currently supports up to ${X_IMAGE_COUNT_LIMIT} raster images per post.`,
    };
  }
  for (const [index, asset] of input.assets.entries()) {
    if (!asset.url?.trim()) {
      return { ok: false, error: `X image ${index + 1} needs a URL.` };
    }
    if (asset.kind === "video") {
      return { ok: false, error: "X publishing currently supports text and raster images only." };
    }
    const mimeType = normalizeMimeType(asset.mimeType);
    if (mimeType && !X_IMAGE_MIME_TYPES.has(mimeType as CarouselRasterMimeType)) {
      return {
        ok: false,
        error: "X publishing currently supports PNG, JPEG, and WebP raster images only.",
      };
    }
    const altText = asset.altText?.trim();
    if (altText && characterLength(altText) > X_ALT_TEXT_LIMIT) {
      return {
        ok: false,
        error: `X image ${index + 1} alt text is too long (max ${X_ALT_TEXT_LIMIT} characters).`,
      };
    }
  }
  return { ok: true };
}

async function readBoundedImageBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel("X image exceeds the upload limit").catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fetchFailureClass(status: number): SocialPublishFailureClass {
  return status === 409 || status === 429 || status >= 500 ? "retryable" : "rejected";
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
    if (input.assets.some((asset) => asset.kind === "video")) {
      return { ok: false, error: "LinkedIn publishing currently supports text and one image." };
    }
    if (input.assets.length > 1) {
      return { ok: false, error: "LinkedIn publishing currently supports one image per post." };
    }
    return { ok: true };
  },

  async publish(input) {
    let userinfoResponse: Response;
    try {
      userinfoResponse = await input.fetcher("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${input.accessToken}` },
      });
    } catch (error) {
      return providerError(
        "linkedin_userinfo_unavailable",
        "LinkedIn account verification did not finish. ME3 can safely try again.",
        { message: error instanceof Error ? error.message : String(error) },
        "retryable",
      );
    }
    if (!userinfoResponse.ok) {
      return providerError(
        "linkedin_userinfo",
        "Your LinkedIn connection may have expired.",
        await userinfoResponse.text().catch(() => ""),
        failureClassForStatus(userinfoResponse.status),
      );
    }

    const userinfo = await readJson<{ sub?: string }>(userinfoResponse);
    const sub = userinfo.sub?.trim();
    if (!sub) {
      return providerError("linkedin_person_urn", "Could not resolve LinkedIn member id.", userinfo);
    }

    const author = sub.startsWith("urn:li:") ? sub : `urn:li:person:${sub}`;
    let content: { media: { id: string } } | undefined;
    const asset = input.assets[0];
    if (asset) {
      let imageResponse: Response;
      try {
        imageResponse = await input.fetcher(asset.url);
      } catch (error) {
        return providerError(
          "linkedin_image_fetch",
          "Could not load the LinkedIn image. ME3 can safely try again.",
          { message: error instanceof Error ? error.message : String(error) },
          "retryable",
        );
      }
      if (!imageResponse.ok) {
        return providerError(
          "linkedin_image_fetch",
          "Could not load the LinkedIn image.",
          undefined,
          failureClassForStatus(imageResponse.status),
        );
      }
      let initializeResponse: Response;
      try {
        initializeResponse = await input.fetcher(
          "https://api.linkedin.com/rest/images?action=initializeUpload",
          {
            method: "POST",
            headers: linkedInHeaders(input.accessToken),
            body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
          },
        );
      } catch (error) {
        return providerError(
          "linkedin_image_initialize",
          "LinkedIn did not finish preparing the image. ME3 can safely try again.",
          { message: error instanceof Error ? error.message : String(error) },
          "retryable",
        );
      }
      const initialized = await readJson<{
        value?: { uploadUrl?: string; image?: string };
        message?: string;
      }>(initializeResponse);
      if (!initializeResponse.ok || !initialized.value?.uploadUrl || !initialized.value.image) {
        return providerError(
          "linkedin_image_initialize",
          initialized.message || "LinkedIn could not initialize the image upload.",
          initialized,
          failureClassForStatus(initializeResponse.status),
        );
      }
      let uploadResponse: Response;
      try {
        uploadResponse = await input.fetcher(initialized.value.uploadUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": asset.mimeType || imageResponse.headers.get("content-type") || "application/octet-stream",
          },
          body: await imageResponse.arrayBuffer(),
        });
      } catch (error) {
        return providerError(
          "linkedin_image_upload",
          "LinkedIn did not finish uploading the image. ME3 can safely try again.",
          { message: error instanceof Error ? error.message : String(error) },
          "retryable",
        );
      }
      if (!uploadResponse.ok) {
        return providerError(
          "linkedin_image_upload",
          "LinkedIn could not upload the image.",
          await uploadResponse.text().catch(() => ""),
          failureClassForStatus(uploadResponse.status),
        );
      }
      content = { media: { id: initialized.value.image } };
    }

    let postResponse: Response;
    await input.markProviderWriteStarted?.();
    try {
      postResponse = await input.fetcher("https://api.linkedin.com/rest/posts", {
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
          ...(content ? { content } : {}),
        }),
      });
    } catch (error) {
      return providerError(
        "linkedin_outcome_unknown",
        "LinkedIn did not confirm whether the post was published. Check LinkedIn before trying again.",
        { message: error instanceof Error ? error.message : String(error) },
        "outcome_unknown",
      );
    }
    const json = await readJson<Record<string, unknown>>(postResponse);
    if (!postResponse.ok) {
      return providerError(
        "linkedin_post_error",
        (json.message as string) || (json.error as string) || `LinkedIn API error (${postResponse.status})`,
        json,
        failureClassForStatus(postResponse.status),
      );
    }

    const id =
      (json.id as string | undefined) ||
      postResponse.headers.get("x-restli-id") ||
      undefined;
    if (!id) {
      return providerError(
        "linkedin_missing_post_id",
        "LinkedIn accepted the request but did not return a post id. Check LinkedIn before trying again.",
        json,
        "outcome_unknown",
      );
    }
    return {
      ok: true,
      platformPostId: id,
      platformPostUrl: `https://www.linkedin.com/feed/update/${id}`,
      providerResponse: json,
    };
  },
};

const xAdapter: SocialPublishAdapter = {
  validateDraft: validateXDraft,

  async publish(input) {
    const validation = validateXDraft(input);
    if (!validation.ok) {
      return providerError(
        "x_validation_failed",
        validation.error,
        undefined,
        validation.error.includes("currently supports") ? "unsupported" : "rejected",
      );
    }

    const mediaIds: string[] = [];
    const mediaResponses: unknown[] = [];
    for (const [index, asset] of input.assets.entries()) {
      let imageResponse: Response;
      try {
        imageResponse = await input.fetcher(asset.url);
      } catch (error) {
        return providerError(
          "x_image_fetch",
          `Could not load X image ${index + 1}.`,
          { message: error instanceof Error ? error.message : String(error) },
          "retryable",
        );
      }
      if (!imageResponse.ok) {
        return providerError(
          "x_image_fetch",
          `Could not load X image ${index + 1} (${imageResponse.status}).`,
          await imageResponse.text().catch(() => ""),
          fetchFailureClass(imageResponse.status),
        );
      }

      let bytes: Uint8Array | null;
      try {
        bytes = await readBoundedImageBytes(imageResponse, X_IMAGE_MAX_BYTES);
      } catch (error) {
        return providerError(
          "x_image_fetch",
          `Could not finish loading X image ${index + 1}.`,
          { message: error instanceof Error ? error.message : String(error) },
          "retryable",
        );
      }
      if (!bytes) {
        return providerError(
          "x_image_too_large",
          `X image ${index + 1} is larger than 5 MB.`,
          undefined,
          "unsupported",
        );
      }
      if (bytes.byteLength === 0) {
        return providerError(
          "x_image_empty",
          `X image ${index + 1} is empty.`,
        );
      }

      const sniffedMimeType = sniffCarouselRasterMimeType(bytes);
      const declaredMimeType = normalizeMimeType(asset.mimeType);
      const responseMimeType = normalizeMimeType(imageResponse.headers.get("content-type"));
      if (
        !sniffedMimeType ||
        (declaredMimeType && declaredMimeType !== sniffedMimeType) ||
        (responseMimeType &&
          X_IMAGE_MIME_TYPES.has(responseMimeType as CarouselRasterMimeType) &&
          responseMimeType !== sniffedMimeType)
      ) {
        return providerError(
          "x_image_type",
          `X image ${index + 1} must be a valid PNG, JPEG, or WebP raster image.`,
          { declaredMimeType, responseMimeType, sniffedMimeType },
          "unsupported",
        );
      }

      let uploadResponse: Response;
      try {
        uploadResponse = await input.fetcher("https://api.x.com/2/media/upload", {
          method: "POST",
          headers: xHeaders(input.accessToken),
          body: JSON.stringify({
            media: bytesToBase64(bytes),
            media_category: "tweet_image",
            media_type: sniffedMimeType,
          }),
        });
      } catch (error) {
        return providerError(
          "x_media_upload",
          `X did not finish uploading image ${index + 1}.`,
          { message: error instanceof Error ? error.message : String(error) },
          "retryable",
        );
      }
      const uploadJson = await readJson<XErrorBody>(uploadResponse);
      if (!uploadResponse.ok) {
        return providerError(
          "x_media_upload",
          xErrorMessage(uploadJson, `X image upload failed (${uploadResponse.status}).`),
          uploadJson,
          failureClassForStatus(uploadResponse.status),
        );
      }
      const mediaId = uploadJson.data?.id?.trim();
      if (!mediaId) {
        return providerError(
          "x_media_missing_id",
          "X uploaded an image but did not return its media id.",
          uploadJson,
          "retryable",
        );
      }
      mediaIds.push(mediaId);
      mediaResponses.push(uploadJson);

      const altText = asset.altText?.trim();
      if (!altText) continue;
      let metadataResponse: Response;
      try {
        metadataResponse = await input.fetcher("https://api.x.com/2/media/metadata", {
          method: "POST",
          headers: xHeaders(input.accessToken),
          body: JSON.stringify({
            id: mediaId,
            metadata: { alt_text: { text: altText } },
          }),
        });
      } catch (error) {
        return providerError(
          "x_media_metadata",
          `X did not finish adding alt text to image ${index + 1}.`,
          { message: error instanceof Error ? error.message : String(error), mediaId },
          "retryable",
        );
      }
      const metadataJson = await readJson<XErrorBody>(metadataResponse);
      if (!metadataResponse.ok) {
        return providerError(
          "x_media_metadata",
          xErrorMessage(
            metadataJson,
            `X could not add alt text to image ${index + 1} (${metadataResponse.status}).`,
          ),
          metadataJson,
          failureClassForStatus(metadataResponse.status),
        );
      }
      mediaResponses.push(metadataJson);
    }

    let response: Response;
    await input.markProviderWriteStarted?.();
    try {
      response = await input.fetcher("https://api.x.com/2/tweets", {
        method: "POST",
        headers: xHeaders(input.accessToken),
        body: JSON.stringify({
          text: input.bodyText.trim(),
          ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {}),
        }),
      });
    } catch (error) {
      return providerError(
        "x_outcome_unknown",
        "X did not confirm whether the post was published. Check X before trying again.",
        {
          message: error instanceof Error ? error.message : String(error),
          mediaIds,
        },
        "outcome_unknown",
      );
    }
    const json = await readJson<XErrorBody>(response);
    if (!response.ok) {
      return providerError(
        "x_api_error",
        xErrorMessage(json, `X API error (${response.status})`),
        { media: mediaResponses, post: json },
        failureClassForStatus(response.status),
      );
    }
    const id = json.data?.id;
    if (!id) {
      return providerError(
        "x_missing_id",
        "X accepted the request but did not return a post id. Check X before trying again.",
        { media: mediaResponses, post: json },
        "outcome_unknown",
      );
    }
    return {
      ok: true,
      platformPostId: id,
      platformPostUrl: `https://x.com/i/web/status/${id}`,
      providerResponse: { media: mediaResponses, post: json },
    };
  },
};

function validateTikTokDraft(input: {
  bodyText: string;
  assets: SocialMediaAsset[];
}): { ok: true } | { ok: false; error: string } {
  if (input.assets.length !== 1 || input.assets[0]?.kind !== "video") {
    return { ok: false, error: "TikTok draft upload requires exactly one video." };
  }
  const asset = input.assets[0];
  if (!asset.url?.trim()) {
    return { ok: false, error: "The TikTok video needs a delivery URL." };
  }
  const mimeType = normalizeMimeType(asset.mimeType);
  if (!mimeType || !TIKTOK_VIDEO_MIME_TYPES.has(mimeType)) {
    return { ok: false, error: "TikTok supports MP4, QuickTime, and WebM video uploads." };
  }
  const byteLength = asset.byteLength;
  if (!Number.isSafeInteger(byteLength) || (byteLength ?? 0) <= 0) {
    return { ok: false, error: "TikTok needs the video file size before it can upload the draft." };
  }
  if (byteLength! > TIKTOK_MAX_VIDEO_BYTES) {
    return { ok: false, error: "The TikTok video is larger than 4 GB." };
  }
  return { ok: true };
}

function tikTokChunkPlan(byteLength: number): {
  chunkSize: number;
  totalChunkCount: number;
  ranges: Array<{ start: number; end: number }>;
} {
  const chunkSize = byteLength <= TIKTOK_SINGLE_CHUNK_MAX_BYTES
    ? byteLength
    : TIKTOK_MULTI_CHUNK_BYTES;
  const totalChunkCount = Math.max(1, Math.floor(byteLength / chunkSize));
  const ranges = Array.from({ length: totalChunkCount }, (_, index) => {
    const start = index * chunkSize;
    const end = index === totalChunkCount - 1
      ? byteLength - 1
      : start + chunkSize - 1;
    return { start, end };
  });
  return { chunkSize, totalChunkCount, ranges };
}

type TikTokApiResponse = {
  data?: {
    publish_id?: string;
    upload_url?: string;
    status?: string;
    fail_reason?: string;
    uploaded_bytes?: number;
  };
  error?: { code?: string; message?: string; log_id?: string };
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const tikTokAdapter: SocialPublishAdapter = {
  validateDraft: validateTikTokDraft,

  async publish(input) {
    const validation = validateTikTokDraft(input);
    if (!validation.ok) {
      return providerError("tiktok_validation_failed", validation.error, undefined, "unsupported");
    }

    const asset = input.assets[0]!;
    const byteLength = asset.byteLength!;
    const mimeType = normalizeMimeType(asset.mimeType)!;
    const plan = tikTokChunkPlan(byteLength);

    await input.markProviderWriteStarted?.();
    let initResponse: Response;
    try {
      initResponse = await input.fetcher(TIKTOK_UPLOAD_INIT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          source_info: {
            source: "FILE_UPLOAD",
            video_size: byteLength,
            chunk_size: plan.chunkSize,
            total_chunk_count: plan.totalChunkCount,
          },
        }),
      });
    } catch (error) {
      return providerError(
        "tiktok_init_outcome_unknown",
        "TikTok did not confirm whether it initialized the draft upload. Check TikTok before trying again.",
        describeFetchError(error),
        "outcome_unknown",
      );
    }

    const initialized = await readJson<TikTokApiResponse>(initResponse);
    const apiError = initialized.error?.code?.trim();
    if (!initResponse.ok || (apiError && apiError !== "ok")) {
      return providerError(
        apiError || "tiktok_upload_init",
        initialized.error?.message || `TikTok could not initialize the draft upload (${initResponse.status}).`,
        initialized,
        failureClassForStatus(initResponse.status),
      );
    }

    const publishId = initialized.data?.publish_id?.trim();
    const uploadUrl = initialized.data?.upload_url?.trim();
    if (!publishId || !uploadUrl) {
      return providerError(
        "tiktok_upload_init_incomplete",
        "TikTok accepted the draft upload request without returning all upload details. Check TikTok before trying again.",
        initialized,
        "outcome_unknown",
      );
    }

    for (const [index, range] of plan.ranges.entries()) {
      const contentLength = range.end - range.start + 1;
      let videoResponse: Response;
      try {
        videoResponse = await input.fetcher(asset.url, {
          headers: { Range: `bytes=${range.start}-${range.end}` },
        });
      } catch (error) {
        return providerError(
          "tiktok_video_fetch",
          `ME3 could not load video chunk ${index + 1} for TikTok.`,
          { ...describeFetchError(error), publishId },
          "outcome_unknown",
        );
      }
      if (!videoResponse.ok || !videoResponse.body) {
        return providerError(
          "tiktok_video_fetch",
          `ME3 could not load video chunk ${index + 1} for TikTok (${videoResponse.status}).`,
          { publishId },
          "outcome_unknown",
        );
      }

      let uploadResponse: Response;
      try {
        uploadResponse = await input.fetcher(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(contentLength),
            "Content-Range": `bytes ${range.start}-${range.end}/${byteLength}`,
          },
          body: videoResponse.body,
        });
      } catch (error) {
        return providerError(
          "tiktok_video_upload_outcome_unknown",
          "TikTok did not confirm whether it received the full video. Check TikTok before trying again.",
          { ...describeFetchError(error), publishId, chunk: index + 1 },
          "outcome_unknown",
        );
      }

      const expectedStatus = index === plan.ranges.length - 1 ? 201 : 206;
      if (uploadResponse.status !== expectedStatus) {
        return providerError(
          "tiktok_video_upload",
          `TikTok did not accept video chunk ${index + 1} (${uploadResponse.status}).`,
          {
            publishId,
            chunk: index + 1,
            response: await uploadResponse.text().catch(() => ""),
          },
          "outcome_unknown",
        );
      }
    }

    let lastStatus: TikTokApiResponse | null = null;
    for (let attempt = 0; attempt < TIKTOK_STATUS_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await wait(TIKTOK_STATUS_POLL_MS);
      let statusResponse: Response;
      try {
        statusResponse = await input.fetcher(TIKTOK_STATUS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
        });
      } catch (error) {
        return providerError(
          "tiktok_status_outcome_unknown",
          "TikTok received the video, but ME3 could not confirm whether the draft reached your inbox. Check TikTok before trying again.",
          { ...describeFetchError(error), publishId },
          "outcome_unknown",
        );
      }

      lastStatus = await readJson<TikTokApiResponse>(statusResponse);
      const statusError = lastStatus.error?.code?.trim();
      if (!statusResponse.ok || (statusError && statusError !== "ok")) {
        return providerError(
          statusError || "tiktok_status_error",
          lastStatus.error?.message || "TikTok received the video, but its draft status could not be confirmed.",
          { publishId, status: lastStatus },
          "outcome_unknown",
        );
      }

      const status = lastStatus.data?.status?.trim();
      if (status === "SEND_TO_USER_INBOX" || status === "PUBLISH_COMPLETE") {
        return {
          ok: true,
          platformPostId: publishId,
          providerResponse: {
            delivery: "creator_draft",
            creatorActionRequired: status !== "PUBLISH_COMPLETE",
            publishId,
            init: initialized,
            status: lastStatus,
          },
        };
      }
      if (status === "FAILED") {
        return providerError(
          "tiktok_processing_failed",
          lastStatus.data?.fail_reason
            ? `TikTok could not prepare the draft: ${lastStatus.data.fail_reason}.`
            : "TikTok could not prepare the draft.",
          { publishId, status: lastStatus },
          "rejected",
        );
      }
    }

    return providerError(
      "tiktok_status_outcome_unknown",
      "TikTok received the video, but the draft is still processing. Check your TikTok inbox before trying again.",
      { publishId, status: lastStatus },
      "outcome_unknown",
    );
  },
};

const youtubeAdapter: SocialPublishAdapter = {
  validateDraft(input) {
    if (input.assets.length !== 1 || input.assets[0]?.kind !== "video") {
      return { ok: false, error: "YouTube upload requires exactly one video." };
    }
    return { ok: true };
  },

  async publish() {
    return providerError(
      "youtube_upload_not_ready",
      "YouTube connection is ready, but private video upload is not enabled in this release.",
      undefined,
      "unsupported",
    );
  },
};

function createInstagramAdapter(platform: "instagram" | "instagram_business"): SocialPublishAdapter {
  return {
    validateDraft: validateInstagramDraft,
    publish: (input) => publishInstagram(platform, input),
  };
}

function validateInstagramDraft(input: {
  bodyText: string;
  assets: SocialMediaAsset[];
}): { ok: true } | { ok: false; error: string } {
  const body = input.bodyText.trim();
  const videos = input.assets.filter((asset) => asset.kind === "video");
  const images = input.assets.filter((asset) => asset.kind !== "video");
  if (!body) return { ok: false, error: "This Instagram draft is empty." };
  if (body.length > INSTAGRAM_MAX_CHARS) {
    return {
      ok: false,
      error: `This Instagram draft is too long (max ${INSTAGRAM_MAX_CHARS} characters).`,
    };
  }
  if (input.assets.length === 0) {
    return { ok: false, error: "Instagram publishing needs an image or video." };
  }
  if (input.assets.some((asset) => !asset.url?.trim())) {
    return { ok: false, error: "Every Instagram media item needs a delivery URL." };
  }
  if (videos.length > 0 && (videos.length !== 1 || images.length > 0)) {
    return { ok: false, error: "An Instagram Reel must contain one video and no images." };
  }
  if (images.length > INSTAGRAM_CAROUSEL_MAX_ITEMS) {
    return {
      ok: false,
      error: `Instagram carousels support up to ${INSTAGRAM_CAROUSEL_MAX_ITEMS} images.`,
    };
  }
  return { ok: true };
}

async function publishInstagram(
  platform: "instagram" | "instagram_business",
  input: Parameters<SocialPublishAdapter["publish"]>[0],
): Promise<SocialPublishAdapterResult> {
  const origin = platform === "instagram"
    ? `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`
    : `https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}`;
  const videos = input.assets.filter((asset) => asset.kind === "video");
  const images = input.assets.filter((asset) => asset.kind !== "video");
  const created: unknown[] = [];
  let creationId: string;

  if (videos.length === 1) {
    const reel = await createInstagramMediaContainer(origin, input, {
      media_type: "REELS",
      video_url: videos[0]!.url,
      caption: input.bodyText,
      share_to_feed: "true",
    });
    if (!reel.ok) return reel.result;
    creationId = reel.id;
    created.push(reel.response);
    const ready = await waitForInstagramContainer(origin, input, creationId);
    if (!ready.ok) return ready.result;
  } else if (images.length > 1) {
    const children: string[] = [];
    for (const image of images) {
      const child = await createInstagramMediaContainer(origin, input, {
        image_url: image.url,
        is_carousel_item: "true",
      });
      if (!child.ok) return child.result;
      children.push(child.id);
      created.push(child.response);
    }
    const carousel = await createInstagramMediaContainer(origin, input, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: input.bodyText,
    });
    if (!carousel.ok) return carousel.result;
    creationId = carousel.id;
    created.push(carousel.response);
    const ready = await waitForInstagramContainer(origin, input, creationId);
    if (!ready.ok) return ready.result;
  } else {
    const image = images[0];
    if (!image) return providerError("instagram_missing_media", "Instagram publishing needs media.");
    const single = await createInstagramMediaContainer(origin, input, {
      image_url: image.url,
      caption: input.bodyText,
    });
    if (!single.ok) return single.result;
    creationId = single.id;
    created.push(single.response);
  }

  let publishResponse: Response;
  await input.markProviderWriteStarted?.();
  try {
    publishResponse = await input.fetcher(
      `${origin}/${encodeURIComponent(input.accountId)}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: input.accessToken,
        }),
      },
    );
  } catch (error) {
    return providerError(
      "instagram_outcome_unknown",
      "Instagram did not confirm whether the post was published. Check Instagram before trying again.",
      { message: error instanceof Error ? error.message : String(error), created },
      "outcome_unknown",
    );
  }
  const publishJson = await readJson<{ id?: string; error?: { message?: string } }>(publishResponse);
  if (!publishResponse.ok) {
    return providerError(
      "instagram_media_publish",
      publishJson.error?.message || `Instagram publish failed (${publishResponse.status}).`,
      { created, publish: publishJson },
      failureClassForStatus(publishResponse.status),
    );
  }
  if (!publishJson.id) {
    return providerError(
      "instagram_missing_post_id",
      "Instagram accepted the publish request but did not return a post id. Check Instagram before trying again.",
      { created, publish: publishJson },
      "outcome_unknown",
    );
  }
  return {
    ok: true,
    platformPostId: publishJson.id,
    providerResponse: { created, publish: publishJson },
  };
}

async function createInstagramMediaContainer(
  origin: string,
  input: Parameters<SocialPublishAdapter["publish"]>[0],
  parameters: Record<string, string>,
): Promise<
  | { ok: true; id: string; response: unknown }
  | { ok: false; result: SocialPublishAdapterResult }
> {
  let response: Response;
  try {
    response = await input.fetcher(
      `${origin}/${encodeURIComponent(input.accountId)}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...parameters, access_token: input.accessToken }),
      },
    );
  } catch (error) {
    return {
      ok: false,
      result: providerError(
        "instagram_media_create",
        "Instagram did not finish preparing the media. ME3 can safely try again.",
        { message: error instanceof Error ? error.message : String(error) },
        "retryable",
      ),
    };
  }
  const json = await readJson<{ id?: string; error?: { message?: string } }>(response);
  if (!response.ok || !json.id) {
    return {
      ok: false,
      result: providerError(
        "instagram_media_create",
        json.error?.message || `Instagram media creation failed (${response.status}).`,
        json,
        failureClassForStatus(response.status),
      ),
    };
  }
  return { ok: true, id: json.id, response: json };
}

async function waitForInstagramContainer(
  origin: string,
  input: Parameters<SocialPublishAdapter["publish"]>[0],
  containerId: string,
): Promise<{ ok: true } | { ok: false; result: SocialPublishAdapterResult }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
    let response: Response;
    try {
      response = await input.fetcher(
        `${origin}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(input.accessToken)}`,
      );
    } catch (error) {
      return {
        ok: false,
        result: providerError(
          "instagram_media_status",
          "Instagram media processing could not be checked. ME3 can safely try again.",
          { message: error instanceof Error ? error.message : String(error) },
          "retryable",
        ),
      };
    }
    const json = await readJson<{
      status_code?: string;
      status?: string;
      error?: { message?: string };
    }>(response);
    if (!response.ok) {
      return {
        ok: false,
        result: providerError(
          "instagram_media_status",
          json.error?.message || `Instagram media status failed (${response.status}).`,
          json,
          failureClassForStatus(response.status),
        ),
      };
    }
    if (json.status_code === "FINISHED" || json.status_code === "PUBLISHED") return { ok: true };
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      return {
        ok: false,
        result: providerError(
          "instagram_media_processing",
          json.status || "Instagram could not process the attached media.",
          json,
          "rejected",
        ),
      };
    }
  }
  return {
    ok: false,
    result: providerError(
      "instagram_media_processing_timeout",
      "Instagram is still processing the media. ME3 can safely try again.",
      undefined,
      "retryable",
    ),
  };
}
