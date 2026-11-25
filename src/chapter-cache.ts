import type { NovelChapter, NovelContent } from "./novel";

const MAX_CACHE_ENTRIES = 40;
const cache = new Map<string, NovelContent>();
const inFlight = new Map<string, Promise<NovelContent>>();

export function getChapterCacheKey(novelId: string, chapterId: string): string {
  return novelId.trim() + "::" + chapterId.trim();
}

export function getCachedChapterContent(novelId: string, chapterId: string): NovelContent | undefined {
  const key = getChapterCacheKey(novelId, chapterId);
  const value = cache.get(key);
  if (!value) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

export function setCachedChapterContent(novelId: string, chapterId: string, content: NovelContent): void {
  const key = getChapterCacheKey(novelId, chapterId);
  cache.delete(key);
  cache.set(key, content);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearChapterCacheForNovel(novelId: string): void {
  const prefix = novelId.trim() + "::";
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export async function getOrFetchChapterContent(
  novelId: string,
  chapterId: string,
  fetcher: () => Promise<NovelContent>
): Promise<NovelContent> {
  const cached = getCachedChapterContent(novelId, chapterId);
  if (cached) return cached;
  const key = getChapterCacheKey(novelId, chapterId);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetcher().then((content) => {
    setCachedChapterContent(novelId, chapterId, content);
    return content;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Fetch up to the next five chapters without blocking the active reader. */
export async function prefetchNextChapters(
  novelId: string,
  chapters: NovelChapter[],
  currentIndex: number,
  fetcher: (chapter: NovelChapter) => Promise<NovelContent>,
  count = 5
): Promise<void> {
  const targets = chapters.slice(currentIndex + 1, currentIndex + 1 + Math.max(0, count));
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const chapter = targets[cursor++];
      try {
        await getOrFetchChapterContent(novelId, chapter.id, () => fetcher(chapter));
      } catch {
        // A failed prefetch is deliberately non-fatal; normal navigation retries it.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, targets.length) }, () => worker()));
}
