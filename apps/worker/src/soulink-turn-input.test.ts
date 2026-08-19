import { describe, expect, it, vi } from "vitest";
import type { Env } from "./types";
import {
  parseSoulinkTurnInput,
  resolveSoulinkTurnInput,
  SoulinkTurnInputError,
} from "./soulink-turn-input";

describe("Soulink turn input", () => {
  it("rejects voice assets outside Stream's HTTPS CDN boundary", () => {
    expect(() =>
      parseSoulinkTurnInput(
        {
          version: 1,
          kind: "voice",
          text: null,
          attachments: [
            {
              type: "voiceRecording",
              provider: "stream",
              assetUrl: "https://example.com/private-audio.m4a",
              mimeType: "audio/mp4",
              title: null,
              durationSeconds: null,
              fileSizeBytes: null,
            },
          ],
        },
        "",
      ),
    ).toThrowError(
      expect.objectContaining<SoulinkTurnInputError>({
        status: 422,
        name: "SoulinkTurnInputError",
        message: "Voice recording URL is not an approved Stream asset",
      }),
    );
  });

  it("rejects declared oversized recordings before making a network request", async () => {
    const input = parseSoulinkTurnInput(
      {
        version: 1,
        kind: "voice",
        text: null,
        attachments: [
          {
            type: "voiceRecording",
            provider: "stream",
            assetUrl: "https://dublin.stream-io-cdn.com/audio/large.m4a",
            mimeType: "audio/mp4",
            title: null,
            durationSeconds: null,
            fileSizeBytes: 25 * 1024 * 1024 + 1,
          },
        ],
      },
      "",
    );
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      resolveSoulinkTurnInput({} as Env, "owner", input, fetcher),
    ).rejects.toMatchObject({ status: 413, message: "Voice recording is too large" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps transient Stream download failures to retryable service errors", async () => {
    const input = parseSoulinkTurnInput(
      {
        version: 1,
        kind: "voice",
        text: null,
        attachments: [
          {
            type: "voiceRecording",
            provider: "stream",
            assetUrl: "https://dublin.stream-io-cdn.com/audio/retry.m4a",
            mimeType: "audio/mp4",
            title: null,
            durationSeconds: null,
            fileSizeBytes: null,
          },
        ],
      },
      "",
    );
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));

    await expect(
      resolveSoulinkTurnInput({} as Env, "owner", input, fetcher),
    ).rejects.toMatchObject({ status: 503, message: "Voice recording download failed (503)" });
  });
});
