export type ReaderTheme = "paper" | "green" | "gray" | "night";

export type ReaderSettings = {
  speechCloudEndpoint: string;
  fontSize: number;
  theme: ReaderTheme;
  readingMode: "scroll" | "tap";
  lineSpacing: number;
  paragraphSpacing: number;
  horizontalPadding: number;
  speechVoiceIdentifier: string | null;
  speechModelVoiceId: string;
  speechRate: number;
  speechPitch: number;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  speechCloudEndpoint: "",
  fontSize: 18,
  theme: "paper",
  readingMode: "scroll",
  lineSpacing: 1.9,
  paragraphSpacing: 22,
  horizontalPadding: 27,
  speechVoiceIdentifier: null,
  speechModelVoiceId: "kokoro-multi-lang-v1_1:speaker-3",
  speechRate: 0.95,
  speechPitch: 1,
};

/** Normalize persisted settings so old or corrupted storage cannot break the reader. */
export function normalizeReaderSettings(value: unknown): ReaderSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_READER_SETTINGS };
  }
  const candidate = value as Record<string, unknown>;
  const bounded = (key: string, fallback: number, min: number, max: number, digits = 0) => {
    const raw = typeof candidate[key] === "number" && Number.isFinite(candidate[key])
      ? candidate[key] as number
      : fallback;
    const factor = 10 ** digits;
    return Math.min(max, Math.max(min, Math.round(raw * factor) / factor));
  };
  const theme: ReaderTheme = candidate.theme === "night" || candidate.theme === "green" || candidate.theme === "gray"
    ? candidate.theme
    : "paper";
  const rawSpeechEndpoint = typeof candidate.speechCloudEndpoint === "string" ? candidate.speechCloudEndpoint.trim() : "";
  let speechCloudEndpoint = "";
  try {
    const parsedEndpoint = new URL(rawSpeechEndpoint);
    if (parsedEndpoint.protocol === "https:" && parsedEndpoint.hostname && !parsedEndpoint.username && !parsedEndpoint.password && !parsedEndpoint.hash) {
      const endpointText = parsedEndpoint.toString();
      speechCloudEndpoint = endpointText.endsWith("/") ? endpointText.slice(0, -1) : endpointText;
    }
  } catch {
    speechCloudEndpoint = "";
  }
  return {
    speechCloudEndpoint,
    fontSize: bounded("fontSize", DEFAULT_READER_SETTINGS.fontSize, 14, 28),
    theme,
    readingMode: candidate.readingMode === "tap" ? "tap" : "scroll",
    lineSpacing: bounded("lineSpacing", DEFAULT_READER_SETTINGS.lineSpacing, 1.4, 2.4, 1),
    paragraphSpacing: bounded("paragraphSpacing", DEFAULT_READER_SETTINGS.paragraphSpacing, 8, 32),
    horizontalPadding: bounded("horizontalPadding", DEFAULT_READER_SETTINGS.horizontalPadding, 16, 40),
    speechVoiceIdentifier: typeof candidate.speechVoiceIdentifier === "string" && candidate.speechVoiceIdentifier.trim() ? candidate.speechVoiceIdentifier : null,
    speechModelVoiceId: typeof candidate.speechModelVoiceId === "string" && /^kokoro-multi-lang-v1_1:speaker-(?:[0-9]|[1-9][0-9]|10[0-2])$/.test(candidate.speechModelVoiceId) ? candidate.speechModelVoiceId : DEFAULT_READER_SETTINGS.speechModelVoiceId,
    speechRate: bounded("speechRate", DEFAULT_READER_SETTINGS.speechRate, 0.5, 2, 2),
    speechPitch: bounded("speechPitch", DEFAULT_READER_SETTINGS.speechPitch, 0.5, 2, 1),
  };
}
