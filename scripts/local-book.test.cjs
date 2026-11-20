const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLocalTextBook, localBookTitleFromFileName } = require("../.test-build/local-book.js");

test("plain text without chapter headings is kept as one readable chapter", () => {
  const parsed = parseLocalTextBook("我的小说.txt", "\uFEFF第一段\r\n\r\n第二段");
  assert.equal(parsed.title, "我的小说");
  assert.equal(parsed.chapters.length, 1);
  assert.equal(parsed.chapters[0].title, "全文");
  assert.equal(parsed.chapters[0].content, "第一段\n\n第二段");
});

test("Chinese chapter headings split a novel into ordered chapters", () => {
  const parsed = parseLocalTextBook("长篇.txt", "序章\n开端\n\n第一章 初见\n相遇\n\n第二章 重逢\n再次相见");
  assert.equal(parsed.chapters.length, 3);
  assert.deepEqual(parsed.chapters.map((chapter) => chapter.title), ["序章", "第一章 初见", "第二章 重逢"]);
  assert.deepEqual(parsed.chapters.map((chapter) => chapter.index), [0, 1, 2]);
  assert.equal(parsed.chapters[1].content, "相遇");
});

test("chapter-like phrases inside long paragraphs are not treated as headings", () => {
  const parsed = parseLocalTextBook("故事.md", "他说：第一章 初见，然后转身离开。\n这是一段普通正文。");
  assert.equal(parsed.chapters.length, 1);
});

test("empty files are rejected and file extensions are removed safely", () => {
  assert.throws(() => parseLocalTextBook("空.txt", "  "), /内容为空/);
  assert.equal(localBookTitleFromFileName(" novel.TXT "), "novel");
  assert.equal(localBookTitleFromFileName(""), "未命名小说");
});
