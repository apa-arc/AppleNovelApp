const test = require("node:test");
const assert = require("node:assert/strict");
const { compareChapterUpdates } = require("../.test-build/subscription.js");

const chapter = (id, title, url, index) => ({ id, novelId: "book-1", title, url, index });

test("detects only chapters not already in the saved subscription", () => {
  const previous = [
    chapter("a", "第一章", "https://books.example/1", 0),
    chapter("b", "第二章", "https://books.example/2", 1),
  ];
  const latest = [
    chapter("a2", "第一章", "https://books.example/1", 0),
    chapter("b2", "第二章", "https://books.example/2", 1),
    chapter("c", "第三章", "https://books.example/3", 2),
  ];
  const result = compareChapterUpdates(previous, latest, "b", 1);
  assert.equal(result.newChapters.length, 1);
  assert.equal(result.newChapters[0].title, "第三章");
});

test("preserves current chapter by URL even when chapter IDs and indexes change", () => {
  const previous = [
    chapter("old-1", "第一章", "https://books.example/1", 0),
    chapter("old-2", "第二章", "https://books.example/2", 1),
  ];
  const latest = [
    chapter("new-0", "序章", "https://books.example/0", 0),
    chapter("new-1", "第一章", "https://books.example/1", 1),
    chapter("new-2", "第二章", "https://books.example/2", 2),
  ];
  const result = compareChapterUpdates(previous, latest, "old-2", 1);
  assert.equal(result.newChapters.length, 1);
  assert.equal(result.currentChapterIndex, 2);
});

test("falls back to matching normalized chapter title when URL changes", () => {
  const previous = [chapter("old", "第二章 远方", "https://books.example/old", 1)];
  const latest = [
    chapter("first", "第一章", "https://books.example/1", 0),
    chapter("new", "第二章远方", "https://books.example/new", 1),
  ];
  const result = compareChapterUpdates(previous, latest, "old", 1);
  assert.equal(result.currentChapterIndex, 1);
  assert.equal(result.newChapters.length, 1);
});

test("handles an empty latest catalog and clamps fallback progress", () => {
  const result = compareChapterUpdates([chapter("a", "第一章", "https://books.example/1", 0)], [], "a", 99);
  assert.equal(result.newChapters.length, 0);
  assert.equal(result.currentChapterIndex, 0);
});
