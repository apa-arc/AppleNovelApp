const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mergeNovelSearchResults,
  clampReadingProgress,
  createReadingProgress,
} = require("../.test-build/novel.js");

test("search results merge duplicate title and author across sources", () => {
  const result = mergeNovelSearchResults([
    { keyword: "星海", sourceId: "a", hasMore: false, items: [
      { id: "a1", sourceId: "a", sourceName: "源A", title: "星海 漫游", author: "作者", description: "短", bookUrl: "https://a.example/1" },
    ] },
    { keyword: "星海", sourceId: "b", hasMore: false, items: [
      { id: "b1", sourceId: "b", sourceName: "源B", title: "星海漫游", author: "作者", description: "更完整的简介", coverUrl: "https://b.example/c.jpg", bookUrl: "https://b.example/1" },
    ] },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].description, "更完整的简介");
  assert.equal(result[0].coverUrl, "https://b.example/c.jpg");
  assert.equal(result[0].bookUrl, "https://a.example/1");
});

test("reading progress clamps invalid chapter and paragraph indexes", () => {
  const safe = clampReadingProgress({
    novelId: "n1", chapterId: "c1", chapterIndex: 99, paragraphIndex: -4, updatedAt: 10,
  }, 5);
  assert.equal(safe.chapterIndex, 4);
  assert.equal(safe.paragraphIndex, 0);
});

test("reading progress can be created from a chapter", () => {
  const progress = createReadingProgress("n1", {
    id: "c2", novelId: "n1", title: "第二章", url: "https://books.example/c2", index: 1,
  }, 8, 123);
  assert.deepEqual(progress, {
    novelId: "n1", chapterId: "c2", chapterIndex: 1, paragraphIndex: 8, updatedAt: 123,
  });
});
