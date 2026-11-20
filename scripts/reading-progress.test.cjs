const test = require("node:test");
const assert = require("node:assert/strict");
const { splitReadingText, getReadingParagraphIndex, getReadingScrollOffset } = require("../.test-build/reading-progress.js");

test("reading text is split into clean paragraphs", () => {
  assert.deepEqual(splitReadingText("  第一段  \n\n\n 第二段\n\n"), ["第一段", "第二段"]);
});

test("scroll position maps to a bounded paragraph index", () => {
  assert.equal(getReadingParagraphIndex(0, 900, 10), 0);
  assert.equal(getReadingParagraphIndex(450, 900, 10), 5);
  assert.equal(getReadingParagraphIndex(2000, 900, 10), 9);
  assert.equal(getReadingParagraphIndex(-10, 900, 10), 0);
});

test("saved paragraph index restores an approximate scroll offset", () => {
  assert.equal(getReadingScrollOffset(0, 10, 900), 0);
  assert.equal(getReadingScrollOffset(9, 10, 900), 900);
  assert.equal(getReadingScrollOffset(5, 10, 900), 500);
  assert.equal(getReadingScrollOffset(99, 1, 900), 0);
});

test("single paragraph and empty scroll ranges are safe", () => {
  assert.equal(getReadingParagraphIndex(100, 0, 1), 0);
  assert.equal(getReadingScrollOffset(8, 1, 0), 0);
});
