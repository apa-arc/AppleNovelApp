const test = require("node:test");
const assert = require("node:assert/strict");
const { parseNovelSourceJson } = require("../.test-build/source.js");
const { searchNovelSource } = require("../.test-build/source-search.js");
const {
  fetchNovelDetail,
  fetchNovelChapterList,
  fetchNovelChapterContent,
} = require("../.test-build/source-catalog.js");

const base = "https://mock-api.example.invalid";
const source = parseNovelSourceJson(JSON.stringify({
  name: "端到端模拟源",
  baseUrl: base,
  searchUrl: base + "/api/search?q={keyword}",
  bookUrl: base + "/api/book/{bookId}",
  chapterListUrl: base + "/api/chapters?bookUrl={bookUrl}",
  chapterUrl: base + "/api/chapter/{chapterId}",
}));
source.id = "pipeline-mock";
source.enabled = true;
source.importedAt = 1;

const book = {
  id: "pipeline-mock:book-1",
  sourceId: source.id,
  sourceName: source.name,
  title: "星海来信",
  author: "书源测试组",
  description: "用于 App 四接口联调的原创测试故事。",
  bookUrl: base + "/api/book/book-1",
};

function response(url, body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null },
    text: async () => JSON.stringify(body),
  };
}

function createFetch() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const parsed = new URL(String(url));
    if (parsed.pathname === "/api/search") {
      return response(String(url), { data: [{ title: "星海来信", author: "书源测试组", intro: "原创模拟小说", url: "/api/book/book-1" }] });
    }
    if (parsed.pathname === "/api/book/book-1") {
      return response(String(url), { data: { title: "星海来信", author: "书源测试组", intro: "详情简介", status: "completed" } });
    }
    if (parsed.pathname === "/api/chapters" && parsed.searchParams.get("bookUrl") === book.bookUrl) {
      return response(String(url), { chapters: [
        { title: "第一章 漂流瓶", url: "/api/chapter/ch-1" },
        { title: "第二章 蓝色星球", url: "/api/chapter/ch-2" },
      ] });
    }
    if (parsed.pathname === "/api/chapter/ch-1") {
      return response(String(url), { data: { title: "第一章 漂流瓶", content: "远航船收到了一封来自地球的信。\n\n请记得抬头看星星。" } });
    }
    return response(String(url), { error: "not found" }, 404);
  };
  return { fetchImpl, calls };
}

test("JSON source completes search → detail → TOC → chapter content", async () => {
  const { fetchImpl, calls } = createFetch();
  const client = require("../.test-build/source-runtime.js").createSourceHttpClient(source, fetchImpl);
  const page = await searchNovelSource(source, "星海来信", client);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].title, "星海来信");
  assert.equal(page.items[0].bookUrl, book.bookUrl);

  const detail = await fetchNovelDetail(source, page.items[0], client);
  assert.equal(detail.title, "星海来信");
  assert.equal(detail.author, "书源测试组");

  const chapters = await fetchNovelChapterList(source, page.items[0], client);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].index, 0);
  assert.equal(chapters[1].title, "第二章 蓝色星球");

  const content = await fetchNovelChapterContent(source, chapters[0], client);
  assert.equal(content.title, "第一章 漂流瓶");
  assert.match(content.content, /抬头看星星/);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.redirect, "error");
  }
});

test("source cannot request an origin outside its configured endpoints", async () => {
  const { createSourceHttpClient, SourceHttpError } = require("../.test-build/source-runtime.js");
  const client = createSourceHttpClient(source, async () => { throw new Error("fetch must not run"); });
  await assert.rejects(
    () => client.get("searchUrl", "https://outside.example.invalid/search"),
    (error) => error instanceof SourceHttpError && error.code === "url-not-allowed"
  );
});

test("disabled sources cannot make requests", async () => {
  const { createSourceHttpClient, SourceHttpError } = require("../.test-build/source-runtime.js");
  const disabled = { ...source, enabled: false };
  const client = createSourceHttpClient(disabled, async () => { throw new Error("fetch must not run"); });
  await assert.rejects(
    () => client.get("searchUrl"),
    (error) => error instanceof SourceHttpError && error.code === "source-disabled"
  );
});

test("source config rejects unknown HTML rule groups", () => {
  const { parseNovelSourceJson } = require("../.test-build/source.js");
  const raw = {
    name: "invalid HTML rules",
    baseUrl: "https://mock-api.example.invalid",
    searchUrl: "https://mock-api.example.invalid/search",
    bookUrl: "https://mock-api.example.invalid/book",
    chapterListUrl: "https://mock-api.example.invalid/chapters",
    chapterUrl: "https://mock-api.example.invalid/chapter",
    htmlRules: { executeJavaScript: { code: "return true" } },
  };
  assert.throws(() => parseNovelSourceJson(JSON.stringify(raw)), /不支持的规则组/);
});
