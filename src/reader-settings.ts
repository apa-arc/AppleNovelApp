export type ReaderTheme = "paper" | "green" | "gray" | "night";

export type ReaderSettings = {
  fontSize: number;
  theme: ReaderTheme;
  readingMode: "scroll" | "tap";
  lineSpacing: number;
  paragraphSpacing: number;
  horizontalPadding: number;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  theme: "paper",
  readingMode: "scroll",
  lineSpacing: 1.9,
  paragraphSpacing: 22,
  horizontalPadding: 27,
};

/** Normalize persisted settings; legacy cloud TTS fields are intentionally ignored. */
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
  return {
    fontSize: bounded("fontSize", DEFAULT_READER_SETTINGS.fontSize, 14, 28),
    theme,
    readingMode: candidate.readingMode === "tap" ? "tap" : "scroll",
    lineSpacing: bounded("lineSpacing", DEFAULT_READER_SETTINGS.lineSpacing, 1.4, 2.4, 1),
    paragraphSpacing: bounded("paragraphSpacing", DEFAULT_READER_SETTINGS.paragraphSpacing, 8, 32),
    horizontalPadding: bounded("horizontalPadding", DEFAULT_READER_SETTINGS.horizontalPadding, 16, 40),
  };
}
