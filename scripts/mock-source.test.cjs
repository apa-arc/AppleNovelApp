const test = require("node:test");
const assert = require("node:assert/strict");
const { BUILTIN_MOCK_SOURCE, createBuiltinMockSourceClient } = require("../.test-build/mock-source.js");
const { searchNovelSource } = require("../.test-build/source-search.js");
const { fetchNovelDetail, fetchNovelChapterList, fetchNovelChapterContent } = require("../.test-build/source-catalog.js");

test("built-in offline mock source exercises the real app JSON pipeline", async () => {
  const client = createBuiltinMockSourceClient(BUILTIN_MOCK_SOURCE);
  const page = await searchNovelSource(BUILTIN_MOCK_SOURCE, "星海来信", client);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].title, "星海来信");

  const detail = await fetchNovelDetail(BUILTIN_MOCK_SOURCE, page.items[0], client);
  assert.equal(detail.title, "星海来信");
  assert.equal(detail.author, "书源测试组");

  const chapters = await fetchNovelChapterList(BUILTIN_MOCK_SOURCE, page.items[0], client);
  assert.equal(chapters.length, 3);
  assert.equal(chapters[2].title, "第三章 回信");

  const content = await fetchNovelChapterContent(BUILTIN_MOCK_SOURCE, chapters[0], client);
  assert.equal(content.title, "第一章 漂流瓶");
  assert.match(content.content, /抬头看星星/);
});

test("mock source never makes a real network request and rejects external URLs", async () => {
  const client = createBuiltinMockSourceClient(BUILTIN_MOCK_SOURCE);
  await assert.rejects(() => client.get("searchUrl", "https://outside.example.invalid/"));
  await assert.rejects(() => createBuiltinMockSourceClient({ ...BUILTIN_MOCK_SOURCE, enabled: false }).get("searchUrl"));
});

test("mock source search returns no results for unrelated keywords", async () => {
  const page = await searchNovelSource(BUILTIN_MOCK_SOURCE, "完全不存在的书名", createBuiltinMockSourceClient(BUILTIN_MOCK_SOURCE));
  assert.equal(page.items.length, 0);
});
