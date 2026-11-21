export type SpeechAudioEntry = {
  key: string;
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  author: string;
  voiceId: string;
  speed: number;
  files: string[];
  createdAt: number;
  totalBytes: number;
};

export function getSpeechAudioEntryKey(
  bookId: string,
  chapterId: string,
  voiceId: string,
  speed: number
): string {
  return [bookId, chapterId, voiceId, speed.toFixed(1)]
    .map((part) => encodeURIComponent(part))
    .join("::");
}

export function normalizeSpeechAudioEntries(value: unknown): SpeechAudioEntry[] {
  if (!Array.isArray(value)) return [];
  const valid = value.filter((item): item is SpeechAudioEntry => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Partial<SpeechAudioEntry>;
    return typeof entry.key === "string" && entry.key.length > 0
      && typeof entry.bookId === "string" && entry.bookId.length > 0
      && typeof entry.chapterId === "string" && entry.chapterId.length > 0
      && typeof entry.bookTitle === "string"
      && typeof entry.chapterTitle === "string"
      && typeof entry.author === "string"
      && typeof entry.voiceId === "string" && entry.voiceId.length > 0
      && typeof entry.speed === "number" && Number.isFinite(entry.speed) && entry.speed >= 0.5 && entry.speed <= 2
      && Array.isArray(entry.files)
      && entry.files.length > 0
      && entry.files.every((file) => typeof file === "string" && file.length > 0)
      && typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) && entry.createdAt > 0
      && typeof entry.totalBytes === "number" && Number.isFinite(entry.totalBytes) && entry.totalBytes > 0;
  });
  const unique = new Map<string, SpeechAudioEntry>();
  for (const entry of valid.sort((a, b) => b.createdAt - a.createdAt)) {
    if (!unique.has(entry.key)) unique.set(entry.key, entry);
  }
  return [...unique.values()];
}
