const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getChapterCacheKey, getCachedChapterContent, setCachedChapterContent,
  getOrFetchChapterContent, prefetchNextChapters, clearChapterCacheForNovel,
} = require("../.test-build/chapter-cache.js");

const content = (chapterId) => ({ chapterId, title: chapterId, content: "正文 " + chapterId });

test("cache keys isolate novels and chapters", () => {
  assert.notEqual(getChapterCacheKey("book-a", "1"), getChapterCacheKey("book-b", "1"));
  setCachedChapterContent("book-a", "1", content("1"));
  assert.equal(getCachedChapterContent("book-a", "1").content, "正文 1");
  assert.equal(getCachedChapterContent("book-b", "1"), undefined);
});

test("concurrent requests for one chapter share a single fetch", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; await Promise.resolve(); return content("c1"); };
  const [a, b] = await Promise.all([
    getOrFetchChapterContent("dedupe-book", "c1", fetcher),
    getOrFetchChapterContent("dedupe-book", "c1", fetcher),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.content, b.content);
});

test("prefetch fetches only the next five chapters and reuses cached content", async () => {
  const chapters = Array.from({ length: 9 }, (_, index) => ({ id: "p" + index, index, title: "第" + index + "章", novelId: "prefetch-book", url: "https://example.com/" + index }));
  let calls = 0;
  await prefetchNextChapters("prefetch-book", chapters, 1, async (chapter) => { calls++; return content(chapter.id); });
  assert.equal(calls, 5);
  assert.equal(getCachedChapterContent("prefetch-book", "p2").content, "正文 p2");
  await prefetchNextChapters("prefetch-book", chapters, 1, async () => { calls++; return content("unexpected"); });
  assert.equal(calls, 5);
});

test("cache can be cleared for one novel without touching another", () => {
  setCachedChapterContent("clear-a", "c", content("c"));
  setCachedChapterContent("clear-b", "c", content("c"));
  clearChapterCacheForNovel("clear-a");
  assert.equal(getCachedChapterContent("clear-a", "c"), undefined);
  assert.ok(getCachedChapterContent("clear-b", "c"));
});
