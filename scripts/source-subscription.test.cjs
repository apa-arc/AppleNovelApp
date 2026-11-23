const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSourceSubscription } = require("../.test-build/source-subscription.js");

const compatible = {
  id: "json-source", name: "JSON 源", version: "1.2.0",
  baseUrl: "https://books.example", domains: ["books.example"],
  appConfig: {
    searchUrl: "https://books.example/search?q={keyword}",
    bookUrl: "https://books.example/book",
    chapterListUrl: "https://books.example/toc",
    chapterUrl: "https://books.example/chapter",
    htmlRules: { search: { itemSelector: ".book", titleSelector: "a.title", urlSelector: "a.title" } }
  }
};

test("imports only entries with explicit safe JSON endpoint configuration", () => {
  const result = parseSourceSubscription(JSON.stringify({
    schemaVersion: 1, subscriptionId: "test", name: "测试订阅", updatedAt: "2026-11-20",
    sources: [compatible, { id: "script-only", name: "脚本源", scriptUrl: "https://raw.example/source.js" }]
  }));
  assert.equal(result.compatible.length, 1);
  assert.equal(result.compatible[0].name, "JSON 源");
  assert.equal(result.compatible[0].version, "1.2.0");
  assert.equal(result.compatible[0].htmlRules.search.itemSelector, ".book");
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /脚本规则暂不执行/);
});

test("imports a validated alias dictionary separately from normal reading sources", () => {
  const alias = {
    id: "book-alias-dictionary", name: "小说别名库", kind: "alias-dictionary", version: "1.0.0",
    dataUrl: "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/aliases/book-aliases.json"
  };
  const result = parseSourceSubscription(JSON.stringify({
    schemaVersion: 1, subscriptionId: "test", name: "测试订阅", sources: [compatible, alias]
  }));
  assert.equal(result.compatible.length, 1);
  assert.equal(result.aliasSources.length, 1);
  assert.equal(result.aliasSources[0].id, "book-alias-dictionary");
  assert.equal(result.unsupported.length, 0);
});

test("rejects alias dictionaries outside the trusted raw GitHub host", () => {
  const alias = {
    id: "bad-alias", name: "错误别名库", kind: "alias-dictionary",
    dataUrl: "https://evil.example/aliases.json"
  };
  const result = parseSourceSubscription(JSON.stringify({
    schemaVersion: 1, subscriptionId: "test", sources: [alias]
  }));
  assert.equal(result.aliasSources.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /raw.githubusercontent.com/);
});

test("rejects endpoints outside declared HTTPS domain allowlist", () => {
  const bad = { ...compatible, appConfig: { ...compatible.appConfig, chapterUrl: "https://evil.example/chapter" } };
  const result = parseSourceSubscription(JSON.stringify({ schemaVersion: 1, subscriptionId: "x", sources: [bad] }));
  assert.equal(result.compatible.length, 0);
  assert.match(result.unsupported[0].reason, /白名单/);
});

test("rejects malformed subscription manifests and duplicate ids", () => {
  assert.throws(() => parseSourceSubscription("{}"), /不是受支持/);
  const result = parseSourceSubscription(JSON.stringify({
    schemaVersion: 1, subscriptionId: "x", sources: [compatible, compatible]
  }));
  assert.equal(result.compatible.length, 1);
  assert.match(result.unsupported[0].reason, /重复 ID/);
});

test("imports the two native novel sources with path URL templates and multiple hosts", () => {
  const sources = [
    {
      id: "biquluo-la", name: "壁落小说", version: "1.0.1",
      baseUrl: "https://www.biquluo.la/", domains: ["www.biquluo.la"],
      appConfig: {
        searchUrl: "https://www.biquluo.la/search.html?name={keyword}",
        bookUrl: "https://www.biquluo.la/",
        chapterListUrl: "https://www.biquluo.la/{bookUrl}",
        chapterUrl: "https://www.biquluo.la/{chapterUrl}",
        htmlRules: {
          search: { itemSelector: ".novelslist2 li", titleSelector: ".s2 a", urlSelector: ".s2 a", authorSelector: ".s4" },
          detail: { titleSelector: "#info h1", descriptionSelector: "#intro" },
          chapters: { itemSelector: "#list dd", titleSelector: "a", urlSelector: "a" },
          content: { contentSelector: "#content", titleSelector: "h1" }
        }
      }
    },
    {
      id: "diyibanzhu-111", name: "第一版主111", version: "1.0.1",
      baseUrl: "https://m.111bz.cc/", domains: ["www.111bz.cc", "m.111bz.cc"],
      appConfig: {
        searchUrl: "https://m.111bz.cc/modules/article/search.php?searchkey={keyword}&searchtype=articlename&page=1",
        bookUrl: "https://m.111bz.cc/",
        chapterListUrl: "https://m.111bz.cc/html/{bookPath}/index.html",
        chapterUrl: "https://m.111bz.cc/{chapterUrl}",
        htmlRules: {
          search: { itemSelector: "tbody#nr tr", titleSelector: "td.odd a", urlSelector: "td.odd a", authorSelector: "td.even" },
          detail: { titleSelector: "h1", authorSelector: "#info p", descriptionSelector: "#intro" },
          chapters: { itemSelector: "a[href$='.html']", titleSelector: ":self", urlSelector: ":self" },
          content: { contentSelector: "#content", titleSelector: "h1" }
        }
      }
    }
  ];
  const result = parseSourceSubscription(JSON.stringify({
    schemaVersion: 1, subscriptionId: "apa-arc-novel-book-source", name: "小说源", sources
  }));
  assert.equal(result.compatible.length, 2);
  assert.equal(result.unsupported.length, 0);
  assert.equal(result.compatible[0].chapterListUrl, sources[0].appConfig.chapterListUrl);
  assert.equal(result.compatible[1].chapterListUrl, sources[1].appConfig.chapterListUrl);
});

test("imports the complete AppleNovelApp-compatible 26-source subscription",()=>{const raw=fs.readFileSync(path.join(__dirname,"fixtures","novel-source-subscription.json"),"utf8");const result=parseSourceSubscription(raw);assert.equal(result.name,"小说源");assert.equal(result.compatible.length,26);assert.equal(result.unsupported.length,0);assert.equal(new Set(result.compatible.map(x=>x.remoteId)).size,26);for(const source of result.compatible){assert.ok(source.htmlRules?.search,source.remoteId+" missing search rules");assert.ok(source.htmlRules?.detail,source.remoteId+" missing detail rules");assert.ok(source.htmlRules?.chapters,source.remoteId+" missing chapter rules");assert.ok(source.htmlRules?.content,source.remoteId+" missing content rules");}});
