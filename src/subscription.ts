import type { NovelChapter } from "./novel";
import { normalizeNovelTitle } from "./novel";

export type ChapterUpdateResult = {
  newChapters: NovelChapter[];
  currentChapterIndex: number;
};

/** Compare a freshly fetched table of contents with the saved subscription. */
export function compareChapterUpdates(
  previous: NovelChapter[],
  latest: NovelChapter[],
  currentChapterId?: string,
  fallbackIndex = 0
): ChapterUpdateResult {
  const previousUrls = new Set(previous.map((chapter) => chapter.url).filter(Boolean));
  const previousTitles = new Set(previous.map((chapter) => normalizeNovelTitle(chapter.title)).filter(Boolean));
  const newChapters = latest.filter((chapter) =>
    !previousUrls.has(chapter.url) &&
    !previousTitles.has(normalizeNovelTitle(chapter.title))
  );

  const current = previous.find((chapter) => chapter.id === currentChapterId);
  let currentChapterIndex = current
    ? latest.findIndex((chapter) => chapter.url === current.url)
    : -1;
  if (currentChapterIndex < 0 && current) {
    const normalizedTitle = normalizeNovelTitle(current.title);
    currentChapterIndex = latest.findIndex((chapter) => normalizeNovelTitle(chapter.title) === normalizedTitle);
  }
  if (currentChapterIndex < 0) {
    currentChapterIndex = Math.min(Math.max(Math.floor(fallbackIndex), 0), Math.max(0, latest.length - 1));
  }

  return { newChapters, currentChapterIndex };
}
