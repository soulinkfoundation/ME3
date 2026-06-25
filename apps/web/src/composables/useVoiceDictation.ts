import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../api";

export type VoiceDictationState =
  | "idle"
  | "listening"
  | "processing"
  | "unsupported";

type VoiceTranscriptionResponse = {
  text: string;
};

type UseVoiceDictationOptions = {
  disabled?: () => boolean;
  filenamePrefix?: string;
  onStart?: () => void;
  onTranscript: (text: string) => void;
};

export function formatVoiceRecordingElapsed(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function extensionForVoiceMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

export function useVoiceDictation(options: UseVoiceDictationOptions) {
  const state = ref<VoiceDictationState>("idle");
  const error = ref<string | null>(null);
  const mediaRecorder = ref<MediaRecorder | null>(null);
  const mediaStream = ref<MediaStream | null>(null);
  const elapsedSeconds = ref(0);
  const audioChunks: Blob[] = [];
  let stopTimeout: number | null = null;
  let recordingTimer: number | null = null;
  let discardRecording = false;

  const canUse = computed(
    () =>
      state.value === "listening" ||
      (!options.disabled?.() &&
        state.value !== "processing" &&
        state.value !== "unsupported"),
  );
  const statusText = computed(() => error.value || "");
  const elapsedLabel = computed(() =>
    formatVoiceRecordingElapsed(elapsedSeconds.value),
  );

  async function toggle() {
    if (state.value === "listening") {
      stop();
      return;
    }
    if (!canUse.value) return;
    await start();
  }

  async function start() {
    if (!supportsMediaRecording()) {
      state.value = "unsupported";
      error.value = "Voice dictation is not available in this browser.";
      return;
    }

    error.value = null;
    options.onStart?.();
    audioChunks.splice(0);
    discardRecording = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredVoiceMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaStream.value = stream;
      mediaRecorder.value = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        void transcribeRecordedVoice(
          recorder.mimeType || mimeType || "audio/webm",
        );
      });

      recorder.start();
      state.value = "listening";
      startRecordingTimer();
      stopTimeout = window.setTimeout(() => {
        stop();
      }, 120_000);
    } catch (err) {
      cleanupRecorder();
      state.value = "idle";
      error.value = messageFromUnknown(err, "Could not start voice dictation.");
    }
  }

  function stop(options: { discard?: boolean } = {}) {
    if (stopTimeout !== null) {
      window.clearTimeout(stopTimeout);
      stopTimeout = null;
    }

    const recorder = mediaRecorder.value;
    if (options.discard) {
      discardRecording = true;
      audioChunks.splice(0);
    }
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanupRecorder();
    }
  }

  async function transcribeRecordedVoice(mimeType: string) {
    if (discardRecording) {
      discardRecording = false;
      audioChunks.splice(0);
      cleanupRecorder();
      state.value = "idle";
      return;
    }

    const chunks = audioChunks.splice(0);
    cleanupRecorder();
    if (chunks.length === 0) {
      state.value = "idle";
      return;
    }

    state.value = "processing";
    error.value = null;

    try {
      const formData = new FormData();
      const audio = new Blob(chunks, { type: mimeType });
      const filename = `${options.filenamePrefix || "voice-dictation"}.${extensionForVoiceMimeType(
        mimeType,
      )}`;
      formData.append("audio", audio, filename);
      const result = await api.upload<VoiceTranscriptionResponse>(
        "/assistant/voice/transcribe",
        formData,
      );
      options.onTranscript(result.text);
      state.value = "idle";
    } catch (err) {
      state.value = "idle";
      error.value = messageFromUnknown(err, "Voice transcription failed.");
    }
  }

  function cleanupRecorder() {
    stopRecordingTimer();
    mediaRecorder.value = null;
    mediaStream.value?.getTracks().forEach((track) => track.stop());
    mediaStream.value = null;
  }

  function startRecordingTimer() {
    stopRecordingTimer();
    elapsedSeconds.value = 0;
    recordingTimer = window.setInterval(() => {
      elapsedSeconds.value += 1;
    }, 1000);
  }

  function stopRecordingTimer() {
    if (recordingTimer !== null) {
      window.clearInterval(recordingTimer);
      recordingTimer = null;
    }
  }

  onMounted(() => {
    if (!supportsMediaRecording()) {
      state.value = "unsupported";
    }
  });

  onBeforeUnmount(() => {
    stop({ discard: true });
  });

  return {
    canUse,
    elapsedLabel,
    elapsedSeconds,
    error,
    start,
    state,
    statusText,
    stop,
    toggle,
  };
}

function supportsMediaRecording() {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function getPreferredVoiceMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return (
    candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ||
    ""
  );
}

function messageFromUnknown(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err.trim();
  return fallback;
}
