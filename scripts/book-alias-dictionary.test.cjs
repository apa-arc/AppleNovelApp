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
  assert.equal(normalizeBookAlias(" 极致-蓝银！"), "极致蓝银");
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

test("imports every record and alias from the live registry fixture", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raw = fs.readFileSync(path.join(__dirname, "fixtures", "current-book-aliases.json"), "utf8");
  const source = JSON.parse(raw);
  const result = parseBookAliasDictionary(raw);
  assert.equal(result.recordCount, source.records.length);
  assert.equal(result.aliasCount, source.records.reduce((count, record) => count + record.aliases.length, 0));
  for (const record of source.records) {
    for (const alias of record.aliases) {
      assert.equal(result.aliases[normalizeBookAlias(alias)], record.title);
    }
  }
});

test("supports many books and multiple aliases per book without hardcoded titles", () => {
  const result = parseBookAliasDictionary(JSON.stringify({
    schemaVersion: 1,
    records: [
      { title: "小说甲", aliases: ["甲别名一", "甲别名二"] },
      { title: "小说乙", aliases: ["乙别名一", "乙别名二", "乙别名三"] },
      { title: "小说丙", aliases: ["丙别名"] }
    ]
  }));
  assert.equal(result.recordCount, 3);
  assert.equal(result.aliasCount, 6);
  assert.equal(result.aliases["甲别名二"], "小说甲");
  assert.equal(result.aliases["乙别名三"], "小说乙");
  assert.equal(result.aliases["丙别名"], "小说丙");
});

test("excludes ambiguous aliases instead of silently overwriting another book", () => {
  const result = parseBookAliasDictionary(JSON.stringify({
    schemaVersion: 1,
    records: [
      { title: "小说甲", aliases: ["共同别名", "甲独有"] },
      { title: "小说乙", aliases: ["共同别名", "乙独有"] }
    ]
  }));
  assert.equal(result.aliases["共同别名"], undefined);
  assert.equal(result.aliases["甲独有"], "小说甲");
  assert.equal(result.aliases["乙独有"], "小说乙");
  assert.equal(result.conflictCount, 1);
  assert.deepEqual(result.conflicts, ["共同别名"]);
});
