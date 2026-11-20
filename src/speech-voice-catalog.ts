export type SpeechVoice = {
  id: string;
  modelId: string;
  label: string;
  language: "zh-en";
  localModelId: string;
  cloudModelId: string;
  speakerId: number;
};

/**
 * Voice identity is model-scoped. The cloud and offline adapters must use
 * the same model family + speaker ID to preserve the closest possible timbre.
 * Labels are intentionally neutral until the official model's speaker map is
 * verified and localized; we do not invent gender/personality descriptions.
 */
export const SPEECH_MODEL = {
  id: "kokoro-multi-lang-v1_1",
  /** Exact sherpa-onnx release asset basename used by its model downloader. */
  downloadAssetId: "kokoro-int8-multi-lang-v1_1",
  displayName: "Kokoro 中文多音色",
  localRuntime: "sherpa-onnx",
  cloudRuntime: "sherpa-onnx",
  language: "zh-en",
  offlineArchive:
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2",
  modelInfoUrl:
    "https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html",
  licenseInfoUrl: "https://huggingface.co/hexgrad/Kokoro-82M",
  speakerCount: 103,
  /** Compressed sherpa-onnx release asset size; includes all 103 speaker embeddings. */
  downloadBytes: 147052523,
  archiveUrl:
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2",
} as const;

/** Official model exposes 103 speaker IDs; friendly names require its speaker map. */
export const SPEECH_VOICES: SpeechVoice[] = Array.from(
  { length: SPEECH_MODEL.speakerCount },
  (_, speakerId) => ({
    id: `${SPEECH_MODEL.id}:speaker-${speakerId}`,
    modelId: SPEECH_MODEL.id,
    label: `声音 ${String(speakerId + 1).padStart(2, "0")}`,
    language: "zh-en",
    localModelId: SPEECH_MODEL.downloadAssetId,
    cloudModelId: SPEECH_MODEL.id,
    speakerId,
  })
);

export function findSpeechVoice(id: string): SpeechVoice | null {
  return SPEECH_VOICES.find((voice) => voice.id === id) ?? null;
}

export function canReuseVoiceOffline(voiceId: string, localModelIds: string[]): boolean {
  const voice = findSpeechVoice(voiceId);
  return !!voice && localModelIds.includes(voice.localModelId);
}

/**
 * Cloud and local synthesis share a stable model/speaker identity.
 * The cloud adapter must map this payload to the same model checkpoint.
 */
export function buildSpeechSynthesisRequest(
  voiceId: string,
  text: string,
  speed = 1
): { model: string; speakerId: number; text: string; speed: number } | null {
  const voice = findSpeechVoice(voiceId);
  const normalizedText = text.trim();
  if (!voice || !normalizedText) return null;
  return {
    model: voice.cloudModelId,
    speakerId: voice.speakerId,
    text: normalizedText,
    speed: Math.min(2, Math.max(0.5, Number.isFinite(speed) ? speed : 1)),
  };
}
