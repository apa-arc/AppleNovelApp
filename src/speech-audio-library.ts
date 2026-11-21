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
  return value.filter((item): item is SpeechAudioEntry => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Partial<SpeechAudioEntry>;
    return typeof entry.key === "string"
      && typeof entry.bookId === "string"
      && typeof entry.chapterId === "string"
      && typeof entry.bookTitle === "string"
      && typeof entry.chapterTitle === "string"
      && typeof entry.author === "string"
      && typeof entry.voiceId === "string"
      && typeof entry.speed === "number"
      && Array.isArray(entry.files)
      && entry.files.length > 0
      && entry.files.every((file) => typeof file === "string" && file.length > 0)
      && typeof entry.createdAt === "number"
      && typeof entry.totalBytes === "number";
  });
}
