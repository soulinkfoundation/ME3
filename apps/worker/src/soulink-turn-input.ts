import type { DbAgentChannelEvent, Env } from "./types";
import {
  transcribeVoiceDictation,
  VOICE_DICTATION_MAX_AUDIO_BYTES,
  VoiceDictationInputError,
  type VoiceTranscriptionResult,
} from "./voice-dictation";

const SOULINK_TURN_INPUT_VERSION = 1 as const;
const SOULINK_TURN_RESOLUTION_VERSION = 1 as const;
const SOULINK_VOICE_FETCH_TIMEOUT_MS = 30_000;
const SOULINK_VOICE_MAX_REDIRECTS = 2;
const VOICE_PLACEHOLDER = "[Voice message awaiting transcription]";

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/vnd.wave",
  "audio/wav",
  "audio/wave",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);
const SUPPORTED_STREAM_VOICE_RESPONSE_MIME_TYPES = new Set([
  ...SUPPORTED_AUDIO_MIME_TYPES,
  "video/webm",
]);

export type SoulinkVoiceAttachment = {
  type: "voiceRecording";
  provider: "stream";
  assetUrl: string;
  mimeType: string;
  title: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
};

export type SoulinkTurnInput = {
  version: typeof SOULINK_TURN_INPUT_VERSION;
  kind: "text" | "voice";
  text: string | null;
  attachments: SoulinkVoiceAttachment[];
};

export type SoulinkTurnResolution = {
  version: typeof SOULINK_TURN_RESOLUTION_VERSION;
  kind: "text" | "voice";
  messageText: string;
  assetUrl: string | null;
  transcription: (VoiceTranscriptionResult & { audioBytes: number }) | null;
};

export class SoulinkTurnInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SoulinkTurnInputError";
  }
}

export function parseSoulinkTurnInput(
  value: unknown,
  legacyMessageText: unknown,
): SoulinkTurnInput {
  if (value === undefined || value === null) {
    const text = normalizedString(legacyMessageText);
    if (!text) throw new SoulinkTurnInputError("Message text or voice input is required");
    return {
      version: SOULINK_TURN_INPUT_VERSION,
      kind: "text",
      text,
      attachments: [],
    };
  }

  if (!isRecord(value) || value.version !== SOULINK_TURN_INPUT_VERSION) {
    throw new SoulinkTurnInputError("Unsupported Soulink message input version");
  }
  if (value.kind !== "text" && value.kind !== "voice") {
    throw new SoulinkTurnInputError("Unsupported Soulink message input kind");
  }

  const text = value.text === null ? null : normalizedString(value.text);
  if (value.text !== null && text === null) {
    throw new SoulinkTurnInputError("Soulink message text is invalid");
  }
  if (!Array.isArray(value.attachments)) {
    throw new SoulinkTurnInputError("Soulink message attachments are invalid");
  }

  if (value.kind === "text") {
    if (!text || value.attachments.length !== 0) {
      throw new SoulinkTurnInputError("Text input must contain text and no attachments");
    }
    return {
      version: SOULINK_TURN_INPUT_VERSION,
      kind: "text",
      text,
      attachments: [],
    };
  }

  if (value.attachments.length !== 1) {
    throw new SoulinkTurnInputError("Voice input must contain one recording");
  }
  const attachment = parseVoiceAttachment(value.attachments[0]);
  return {
    version: SOULINK_TURN_INPUT_VERSION,
    kind: "voice",
    text,
    attachments: [attachment],
  };
}

export function soulinkTurnClaimText(input: SoulinkTurnInput): string {
  return input.kind === "text" ? input.text || "" : VOICE_PLACEHOLDER;
}

export function readStoredSoulinkTurnResolution(
  event: Pick<DbAgentChannelEvent, "raw_json"> | null,
  input: SoulinkTurnInput,
): SoulinkTurnResolution | null {
  if (input.kind !== "voice" || !event?.raw_json) return null;
  try {
    const raw = JSON.parse(event.raw_json) as unknown;
    if (!isRecord(raw) || !isRecord(raw.me3Resolution)) return null;
    const resolution = raw.me3Resolution;
    const attachment = input.attachments[0];
    if (
      resolution.version !== SOULINK_TURN_RESOLUTION_VERSION ||
      resolution.kind !== "voice" ||
      resolution.assetUrl !== attachment?.assetUrl ||
      !normalizedString(resolution.messageText)
    ) {
      return null;
    }
    return resolution as SoulinkTurnResolution;
  } catch {
    return null;
  }
}

export async function resolveSoulinkTurnInput(
  env: Env,
  ownerId: string,
  input: SoulinkTurnInput,
  fetcher: typeof fetch = fetch,
): Promise<SoulinkTurnResolution> {
  if (input.kind === "text") {
    return {
      version: SOULINK_TURN_RESOLUTION_VERSION,
      kind: "text",
      messageText: input.text || "",
      assetUrl: null,
      transcription: null,
    };
  }

  const attachment = input.attachments[0];
  if (!attachment) throw new SoulinkTurnInputError("Voice recording is missing");
  const audio = await fetchSoulinkVoiceRecording(attachment, fetcher);
  let transcription: VoiceTranscriptionResult;
  try {
    transcription = await transcribeVoiceDictation(env, audio, { ownerId });
  } catch (error) {
    if (error instanceof VoiceDictationInputError) {
      throw new SoulinkTurnInputError(error.message, error.status);
    }
    throw new SoulinkTurnInputError("Voice transcription temporarily failed", 503);
  }

  const messageText = input.text
    ? `${input.text}\n\nVoice transcript:\n${transcription.text}`
    : transcription.text;
  return {
    version: SOULINK_TURN_RESOLUTION_VERSION,
    kind: "voice",
    messageText,
    assetUrl: attachment.assetUrl,
    transcription: {
      ...transcription,
      audioBytes: audio.size,
    },
  };
}

async function fetchSoulinkVoiceRecording(
  attachment: SoulinkVoiceAttachment,
  fetcher: typeof fetch,
): Promise<Blob> {
  if (attachment.fileSizeBytes && attachment.fileSizeBytes > VOICE_DICTATION_MAX_AUDIO_BYTES) {
    throw new SoulinkTurnInputError("Voice recording is too large", 413);
  }

  let url = validatedStreamAssetUrl(attachment.assetUrl);
  let response: Response | null = null;
  for (let redirects = 0; redirects <= SOULINK_VOICE_MAX_REDIRECTS; redirects += 1) {
    try {
      response = await fetcher(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(SOULINK_VOICE_FETCH_TIMEOUT_MS),
        headers: { Accept: "audio/*, application/octet-stream;q=0.5" },
      });
    } catch {
      throw new SoulinkTurnInputError("Voice recording download temporarily failed", 503);
    }

    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location || redirects === SOULINK_VOICE_MAX_REDIRECTS) {
      throw new SoulinkTurnInputError("Voice recording redirect was rejected", 422);
    }
    url = validatedStreamAssetUrl(new URL(location, url).toString());
  }

  if (!response) throw new SoulinkTurnInputError("Voice recording could not be downloaded", 503);
  if (!response.ok) {
    const status = isRetryableAssetStatus(response.status) ? 503 : 422;
    throw new SoulinkTurnInputError(`Voice recording download failed (${response.status})`, status);
  }

  const contentLength = normalizedNonNegativeInteger(response.headers.get("content-length"));
  if (contentLength !== null && contentLength > VOICE_DICTATION_MAX_AUDIO_BYTES) {
    throw new SoulinkTurnInputError("Voice recording is too large", 413);
  }
  const responseMimeType = normalizedMimeType(response.headers.get("content-type"));
  if (
    responseMimeType &&
    responseMimeType !== "application/octet-stream" &&
    !SUPPORTED_STREAM_VOICE_RESPONSE_MIME_TYPES.has(responseMimeType)
  ) {
    throw new SoulinkTurnInputError("Voice recording response was not audio", 422);
  }

  return readBoundedAudioBlob(
    response,
    responseMimeType === "video/webm" ? "audio/webm" : responseMimeType || attachment.mimeType,
  );
}

async function readBoundedAudioBlob(response: Response, mimeType: string): Promise<Blob> {
  if (!response.body) throw new SoulinkTurnInputError("Voice recording is empty", 422);
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > VOICE_DICTATION_MAX_AUDIO_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new SoulinkTurnInputError("Voice recording is too large", 413);
      }
      chunks.push(value.slice().buffer as ArrayBuffer);
    }
  } catch (error) {
    if (error instanceof SoulinkTurnInputError) throw error;
    throw new SoulinkTurnInputError("Voice recording download temporarily failed", 503);
  } finally {
    reader.releaseLock();
  }
  if (totalBytes <= 0) throw new SoulinkTurnInputError("Voice recording is empty", 422);
  return new Blob(chunks, { type: mimeType });
}

function parseVoiceAttachment(value: unknown): SoulinkVoiceAttachment {
  if (!isRecord(value) || value.type !== "voiceRecording" || value.provider !== "stream") {
    throw new SoulinkTurnInputError("Unsupported voice attachment");
  }
  const assetUrl = normalizedString(value.assetUrl);
  const mimeType = normalizedMimeType(value.mimeType);
  if (!assetUrl) throw new SoulinkTurnInputError("Voice recording URL is required");
  validatedStreamAssetUrl(assetUrl);
  if (!mimeType || !SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
    throw new SoulinkTurnInputError("Voice recording type is unsupported", 415);
  }

  return {
    type: "voiceRecording",
    provider: "stream",
    assetUrl,
    mimeType,
    title: nullableString(value.title),
    durationSeconds: nullableNonNegativeNumber(value.durationSeconds),
    fileSizeBytes: nullableNonNegativeInteger(value.fileSizeBytes),
  };
}

function validatedStreamAssetUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SoulinkTurnInputError("Voice recording URL is invalid");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    !(hostname === "stream-io-cdn.com" || hostname.endsWith(".stream-io-cdn.com"))
  ) {
    throw new SoulinkTurnInputError("Voice recording URL is not an approved Stream asset", 422);
  }
  return url.toString();
}

function isRetryableAssetStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function normalizedMimeType(value: unknown): string | null {
  const text = normalizedString(value);
  return text ? text.split(";", 1)[0]?.trim().toLowerCase() || null : null;
}

function normalizedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : normalizedString(value);
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SoulinkTurnInputError("Voice recording duration is invalid");
  }
  return value;
}

function nullableNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SoulinkTurnInputError("Voice recording size is invalid");
  }
  return value;
}

function normalizedNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
