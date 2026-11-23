const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBookAlias, parseBookAliasDictionary } = require("../.test-build/book-alias-dictionary.js");

test("parses the current alias registry format and resolves the supplied QQ Reading sample", () => {
  const result = parseBookAliasDictionary(JSON.stringify({
    schemaVersion: 1,
    registryId: "apa-arc-novel-book-aliases",
    name: "小说别名库",
    recordCount: 1,
    records: [{
      id: "douluo-wuhun-puti-tree-tangsan-mowanghu",
      aliases: ["五月轮回"],
      title: "斗罗：武魂菩提树，唐三魔王护",
      author: "浮生一日闲啊"
    }]
  }));
  assert.equal(result.recordCount, 1);
  assert.equal(result.aliases[normalizeBookAlias("五月轮回")], "斗罗：武魂菩提树，唐三魔王护");
});

test("normalizes case and whitespace consistently", () => {
  assert.equal(normalizeBookAlias("  A B C  "), "abc");
  assert.equal(normalizeBookAlias("五月 轮回"), "五月轮回");
});

test("skips unsafe keys and malformed records without poisoning the map", () => {
  const result = parseBookAliasDictionary(JSON.stringify({
    schemaVersion: 1,
    records: [
      { title: "有效书名", aliases: ["有效别名"] },
      { title: "危险", aliases: ["__proto__", "constructor", "prototype"] },
      { title: "缺少别名", aliases: "不是数组" },
      null
    ]
  }));
  assert.deepEqual(Object.keys(result.aliases), ["有效别名"]);
  assert.equal(Object.getPrototypeOf(result.aliases), null);
});

test("rejects invalid envelopes, mismatched counts, and oversized dictionaries", () => {
  assert.throws(() => parseBookAliasDictionary("{}"), /结构不受支持/);
  assert.throws(() => parseBookAliasDictionary(JSON.stringify({
    schemaVersion: 1, recordCount: 2, records: []
  })), /数量校验失败/);
  assert.throws(() => parseBookAliasDictionary("x".repeat(1024 * 1024 + 1)), /超过 1 MB/);
});
