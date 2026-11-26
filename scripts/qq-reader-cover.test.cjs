const test = require("node:test");
const assert = require("node:assert/strict");
const { lookupQQReaderCover } = require("../.test-build/qq-reader-cover.js");

test("QQ Reading cover fallback requires exact title and prefers matching author", async () => {
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/api/booksearch/query")) {
      return new Response(JSON.stringify({ code: 0, data: { bookList: [
        { bid: 11, title: "同名书", author: "其他作者" },
        { bid: 22, title: "同名书", author: "目标作者" },
        { bid: 33, title: "同名书（番外）", author: "目标作者" }
      ] } }), { status: 200 });
    }
    return new Response('<html><head><meta property="og:image" content="//wfqqreader-1252317822.image.myqcloud.com/cover/22/t5_22.webp"></head><body><h1>同名书</h1></body></html>', { status: 200 });
  };
  const cover = await lookupQQReaderCover("同名书", "目标作者", fetchMock);
  assert.equal(cover, "https://wfqqreader-1252317822.image.myqcloud.com/cover/22/t5_22.webp");
  assert.match(calls[1], /book-detail\/22$/);
});

test("QQ Reading cover fallback does not return a different title's cover", async () => {
  let detailRequested = false;
  const fetchMock = async () => new Response(JSON.stringify({ code: 0, data: { bookList: [
    { bid: 11, title: "另一本书", author: "目标作者" }
  ] } }), { status: 200 });
  const cover = await lookupQQReaderCover("目标小说", "目标作者", async (...args) => {
    detailRequested = true;
    return fetchMock(...args);
  });
  assert.equal(cover, null);
  assert.equal(detailRequested, false);
});

test("QQ Reading cover fallback rejects an exact-title result with a different known author", async () => {
  let detailRequested = false;
  const fetchMock = async () => new Response(JSON.stringify({ code: 0, data: { bookList: [
    { bid: 11, title: "同名书", author: "其他作者" }
  ] } }), { status: 200 });
  const cover = await lookupQQReaderCover("同名书", "目标作者", async (...args) => {
    detailRequested = true;
    return fetchMock(...args);
  });
  assert.equal(cover, null);
  assert.equal(detailRequested, false);
});
