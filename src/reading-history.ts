export type ReadingHistoryEntry = {
  bookId: string; title: string; author: string; chapterTitle: string;
  chapterIndex: number; progress: number; updatedAt: number;
};
export function upsertReadingHistory(history: ReadingHistoryEntry[], entry: ReadingHistoryEntry, limit = 100): ReadingHistoryEntry[] {
  const safeEntry = { ...entry,
    chapterIndex: Math.max(0, Math.floor(Number.isFinite(entry.chapterIndex) ? entry.chapterIndex : 0)),
    progress: Math.min(100, Math.max(0, Math.round(Number.isFinite(entry.progress) ? entry.progress : 0))),
    updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now(),
  };
  return [safeEntry, ...history.filter((item) => item.bookId !== safeEntry.bookId)].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,Math.max(1,Math.floor(limit)));
}
export function normalizeReadingHistory(value: unknown): ReadingHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const valid: ReadingHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<ReadingHistoryEntry>;
    if (typeof c.bookId !== "string" || !c.bookId.trim() || typeof c.title !== "string" || typeof c.author !== "string" || typeof c.chapterTitle !== "string") continue;
    valid.push({bookId:c.bookId,title:c.title,author:c.author,chapterTitle:c.chapterTitle,
      chapterIndex:Number.isFinite(c.chapterIndex)?Math.max(0,Math.floor(c.chapterIndex as number)):0,
      progress:Number.isFinite(c.progress)?Math.min(100,Math.max(0,Math.round(c.progress as number))):0,
      updatedAt:Number.isFinite(c.updatedAt)?c.updatedAt as number:0});
  }
  const unique = new Map<string, ReadingHistoryEntry>();
  for (const item of valid.sort((a,b)=>b.updatedAt-a.updatedAt)) if (!unique.has(item.bookId)) unique.set(item.bookId,item);
  return [...unique.values()].slice(0,100);
}
