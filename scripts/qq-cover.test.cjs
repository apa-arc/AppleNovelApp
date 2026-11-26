const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createQQCoverCacheKey,
  findExactQQReadingCover,
  fetchQQReadingCover,
  isValidQQCoverUrl,
} = require("../.test-build/qq-cover.js");

const cover = "https://ccstatic-1252317822.file.myqcloud.com/cover/example.jpg";

test("QQ cover lookup requires exact normalized title and author", () => {
  const payload = { data: { books: [
    { title: "斗罗：武魂菩提树，唐三魔王护", author: "其他作者", cover },
    { title: " 斗罗：武魂菩提树，唐三魔王护 ", author: "浮生一日闲啊", cover },
  ] } };
  assert.equal(findExactQQReadingCover(payload, "斗罗：武魂菩提树，唐三魔王护", "浮生一日闲啊"), cover);
  assert.equal(findExactQQReadingCover(payload, "斗罗：武魂菩提树，唐三魔王护", "不相同的作者"), undefined);
});

test("unknown author never receives a guessed QQ cover", () => {
  const payload = { data: { books: [{ title: "作品", author: "作者", cover }] } };
  assert.equal(findExactQQReadingCover(payload, "作品", "未知作者"), undefined);
  assert.equal(findExactQQReadingCover(payload, "作品", ""), undefined);
});

test("only HTTPS Tencent image hosts are accepted", () => {
  assert.equal(isValidQQCoverUrl(cover), true);
  assert.equal(isValidQQCoverUrl("http://ccstatic-1252317822.file.myqcloud.com/a.jpg"), false);
  assert.equal(isValidQQCoverUrl("https://evil.example/a.jpg"), false);
  assert.equal(isValidQQCoverUrl("https://ccstatic-1252317822.file.myqcloud.com/no-cover.jpg"), false);
});

test("cache key is stable across whitespace differences", () => {
  assert.equal(createQQCoverCacheKey("斗罗 大陆", "作者"), createQQCoverCacheKey("斗罗大陆", " 作 者 "));
});

test("fetch uses QQ Reading search and returns only an exact match", async () => {
  let requested = "";
  const fetcher = async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ data: { books: [
      { title: "目标作品", author: "目标作者", cover },
      { title: "目标作品", author: "其他作者", cover: "https://ccstatic-1252317822.file.myqcloud.com/other.jpg" },
    ] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.equal(await fetchQQReadingCover("目标作品", "目标作者", fetcher), cover);
  assert.match(requested, /ubook\.reader\.qq\.com\/api\/search/);
  assert.match(requested, /keywords=%E7%9B%AE%E6%A0%87%E4%BD%9C%E5%93%81/);
});
