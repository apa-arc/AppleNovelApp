export type NovelSummary = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  author: string;
  description: string;
  coverUrl?: string;
  bookUrl: string;
  category?: string;
  latestChapter?: string;
  updatedAt?: string;
};

export type NovelDetail = NovelSummary & {
  status?: "serializing" | "completed" | "unknown";
  wordCount?: number;
  chapters: NovelChapter[];
};

export type NovelChapter = {
  id: string;
  novelId: string;
  title: string;
  url: string;
  index: number;
  updatedAt?: string;
};

export type NovelContent = {
  chapterId: string;
  title: string;
  content: string;
  previousChapterId?: string;
  nextChapterId?: string;
};

export type ReadingProgress = {
  novelId: string;
  chapterId: string;
  chapterIndex: number;
  paragraphIndex: number;
  updatedAt: number;
};

export type NovelSearchPage = {
  keyword: string;
  sourceId: string;
  items: NovelSummary[];
  hasMore: boolean;
};

export function normalizeNovelTitle(value: string): string {
  return value.trim().replace(/\\s+/g, "").toLocaleLowerCase();
}

/** Merge duplicate books from different sources while retaining every source result. */
export function mergeNovelSearchResults(pages: NovelSearchPage[]): NovelSummary[] {
  const merged = new Map<string, NovelSummary>();
  for (const page of pages) {
    for (const item of page.items) {
      const key = [normalizeNovelTitle(item.title), normalizeNovelTitle(item.author)].join("::");
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item });
        continue;
      }
      // Prefer the richer description/cover without discarding the first source's URL.
      if (item.description.length > existing.description.length) existing.description = item.description;
      if (!existing.coverUrl && item.coverUrl) existing.coverUrl = item.coverUrl;
      if (!existing.latestChapter && item.latestChapter) existing.latestChapter = item.latestChapter;
    }
  }
  return [...merged.values()];
}

export function clampReadingProgress(
  progress: ReadingProgress,
  chapterCount: number
): ReadingProgress {
  const safeCount = Math.max(1, Math.floor(chapterCount));
  return {
    ...progress,
    chapterIndex: Math.min(Math.max(Math.floor(progress.chapterIndex), 0), safeCount - 1),
    paragraphIndex: Math.max(0, Math.floor(progress.paragraphIndex)),
    updatedAt: Number.isFinite(progress.updatedAt) ? progress.updatedAt : Date.now(),
  };
}

export function createReadingProgress(
  novelId: string,
  chapter: NovelChapter,
  paragraphIndex = 0,
  now = Date.now()
): ReadingProgress {
  return {
    novelId,
    chapterId: chapter.id,
    chapterIndex: Math.max(0, chapter.index),
    paragraphIndex: Math.max(0, Math.floor(paragraphIndex)),
    updatedAt: now,
  };
}
