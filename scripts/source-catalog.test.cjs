const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseJsonNovelDetail,
  parseJsonChapterList,
  parseJsonChapterContent,
  fetchNovelDetail,
  fetchNovelChapterList,
  fetchNovelChapterContent,
} = require("../.test-build/source-catalog.js");

const source = {
  id: "s1", name: "测试源", baseUrl: "https://books.example",
  searchUrl: "https://books.example/search", bookUrl: "https://books.example/book",
  chapterListUrl: "https://books.example/toc?book={bookUrl}",
  chapterUrl: "https://books.example/chapter?url={chapterUrl}",
  enabled: true, importedAt: 1,
};
const summary = {
  id: "s1:book", sourceId: "s1", sourceName: "测试源",
  title: "测试小说", author: "测试作者", description: "搜索简介",
  bookUrl: "https://books.example/book/1",
};

test("parses detail JSON and falls back to search summary fields", () => {
  const detail = parseJsonNovelDetail(JSON.stringify({ data: { bookName: "正式书名", authorName: "作者甲", intro: "详细介绍" } }), summary);
  assert.equal(detail.title, "正式书名");
  assert.equal(detail.author, "作者甲");
  assert.equal(detail.description, "详细介绍");
  assert.deepEqual(detail.chapters, []);
});

test("parses common chapter list envelopes and resolves relative links", () => {
  const chapters = parseJsonChapterList(JSON.stringify({ data: { chapters: [
    { chapterName: "第一章", chapterUrl: "/c/1" },
    { title: "第二章", url: "https://books.example/c/2" },
    { title: "无链接章节" },
  ] } }), summary.id, "https://books.example/toc");
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].url, "https://books.example/c/1");
  assert.equal(chapters[1].index, 1);
});

test("rejects HTML and unsafe chapter URLs", () => {
  assert.throws(() => parseJsonChapterList("<html/>", summary.id, "https://books.example/toc"), /不是 JSON/);
  assert.throws(() => parseJsonChapterList(JSON.stringify([{ title: "坏链接", url: "http://books.example/c" }]), summary.id, "https://books.example/toc"), /没有可用/);
});

test("parses chapter text from JSON", () => {
  const content = parseJsonChapterContent(JSON.stringify({ data: { title: "第一章", content: "正文第一段\n\n正文第二段" } }), "备用标题");
  assert.equal(content.title, "第一章");
  assert.match(content.content, /正文第二段/);
  const wrapped = parseJsonChapterContent(JSON.stringify({ data: { content: "仅有正文，没有标题字段" } }), "默认标题");
  assert.equal(wrapped.title, "默认标题");
  assert.match(wrapped.content, /没有标题字段/);
});

test("fetch functions use the selected source endpoints", async () => {
  const calls = [];
  const client = { get: async (endpoint, url) => {
    calls.push({ endpoint, url });
    if (endpoint === "bookUrl") return { url, body: JSON.stringify({ title: "详情书名", description: "详情介绍" }) };
    if (endpoint === "chapterListUrl") return { url, body: JSON.stringify([{ title: "第一章", url: "/chapter/1" }]) };
    return { url, body: JSON.stringify({ title: "第一章", content: "章节正文" }) };
  } };
  const detail = await fetchNovelDetail(source, summary, client);
  assert.equal(detail.title, "详情书名");
  const chapters = await fetchNovelChapterList(source, summary, client);
  assert.equal(chapters.length, 1);
  const content = await fetchNovelChapterContent(source, chapters[0], client);
  assert.equal(content.content, "章节正文");
  assert.equal(calls[0].endpoint, "bookUrl");
  assert.equal(calls[0].url, summary.bookUrl);
  assert.match(calls[1].url, /https%3A%2F%2Fbooks/);
  assert.match(calls[2].url, /chapter%2F1/);
});
