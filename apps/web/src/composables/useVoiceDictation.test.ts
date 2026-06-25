import { describe, expect, it } from "vitest";
import {
  extensionForVoiceMimeType,
  formatVoiceRecordingElapsed,
} from "./useVoiceDictation";

describe("voice dictation helpers", () => {
  it("formats elapsed recording time", () => {
    expect(formatVoiceRecordingElapsed(0)).toBe("0:00");
    expect(formatVoiceRecordingElapsed(65)).toBe("1:05");
    expect(formatVoiceRecordingElapsed(-4)).toBe("0:00");
  });

  it("uses browser-friendly audio extensions", () => {
    expect(extensionForVoiceMimeType("audio/mp4")).toBe("m4a");
    expect(extensionForVoiceMimeType("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionForVoiceMimeType("audio/webm;codecs=opus")).toBe("webm");
  });
});
