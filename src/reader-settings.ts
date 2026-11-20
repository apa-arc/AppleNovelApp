export type ReaderSettings = {
  fontSize: number;
  theme: "paper" | "night";
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  theme: "paper",
};

/** Normalize persisted settings so old or corrupted storage cannot break the reader. */
export function normalizeReaderSettings(value: unknown): ReaderSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_READER_SETTINGS };
  }
  const candidate = value as Record<string, unknown>;
  const rawSize = typeof candidate.fontSize === "number" && Number.isFinite(candidate.fontSize)
    ? Math.round(candidate.fontSize)
    : DEFAULT_READER_SETTINGS.fontSize;
  return {
    fontSize: Math.min(28, Math.max(14, rawSize)),
    theme: candidate.theme === "night" ? "night" : "paper",
  };
}
