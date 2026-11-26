const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSourceSubscription } = require("../.test-build/source-subscription.js");

const compatible = {
  id: "json-source", name: "JSON 源", version: "1.2.0",
  baseUrl: "https://books.example", domains: ["books.example", "cdn.books.example"],
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
  assert.deepEqual(result.compatible[0].allowedDomains, ["books.example", "cdn.books.example"]);
  assert.equal(result.compatible[0].htmlRules.search.itemSelector, ".book");
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /脚本规则暂不执行/);
});


test("imports external JSON source allowDomains into the runtime configuration", () => {
  const result = parseSourceSubscription(JSON.stringify({
    name: "外部多域名源",
    baseUrl: "https://books.example/",
    domains: ["books.example", "img.books-cdn.example"],
    searchUrl: "https://books.example/search?q={keyword}",
    bookUrl: "https://books.example/book/{bookUrl}",
    chapterListUrl: "https://books.example/toc/{bookUrl}",
    chapterUrl: "https://books.example/chapter/{chapterUrl}"
  }));
  assert.equal(result.compatible.length, 1);
  assert.deepEqual(result.compatible[0].allowedDomains, ["books.example", "img.books-cdn.example"]);
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

test("imports the complete AppleNovelApp-compatible 26-source subscription",()=>{const raw=fs.readFileSync(path.join(__dirname,"fixtures","novel-source-subscription.json"),"utf8");const result=parseSourceSubscription(raw);assert.equal(result.name,"小说源");assert.equal(result.compatible.length,27);assert.equal(result.unsupported.length,0);assert.equal(new Set(result.compatible.map(x=>x.remoteId)).size,27);for(const source of result.compatible){assert.ok(source.htmlRules?.search,source.remoteId+" missing search rules");assert.ok(source.htmlRules?.detail,source.remoteId+" missing detail rules");assert.ok(source.htmlRules?.chapters,source.remoteId+" missing chapter rules");assert.ok(source.htmlRules?.content,source.remoteId+" missing content rules");}});


test("rejects alias dictionary URLs containing credentials", () => {
  const alias = {
    id: "credential-alias", name: "带凭据的别名库", kind: "alias-dictionary",
    dataUrl: "https://user:pass@raw.githubusercontent.com/apa-arc/Novel-book-source-/main/aliases/book-aliases.json"
  };
  const result = parseSourceSubscription(JSON.stringify({
    schemaVersion: 1, subscriptionId: "test", sources: [alias]
  }));
  assert.equal(result.aliasSources.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /raw.githubusercontent.com/);
});

test("keeps alias dictionary IDs unique across the whole subscription", () => {
  const alias = {
    id: compatible.id, name: "重复别名库", kind: "alias-dictionary",
    dataUrl: "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/aliases/book-aliases.json"
  };
  const result = parseSourceSubscription(JSON.stringify({
    schemaVersion: 1, subscriptionId: "test", sources: [compatible, alias]
  }));
  assert.equal(result.compatible.length, 1);
  assert.equal(result.aliasSources.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /重复 ID/);
});

test("recognizes the live 11-entry subscription alias source as compatible", () => {
  const raw = fs.readFileSync(path.join(__dirname, "fixtures", "current-11-source-subscription.json"), "utf8");
  const result = parseSourceSubscription(raw);
  assert.equal(result.aliasSources.length, 1);
  assert.equal(result.aliasSources[0].id, "book-alias-dictionary");
  assert.equal(result.aliasSources[0].name, "小说别名库");
  assert.equal(result.aliasSources[0].dataUrl, "https://raw.githubusercontent.com/apa-arc/Novel-book-source-/main/aliases/book-aliases.json");
  assert.equal(result.unsupported.some((entry) => entry.id === "book-alias-dictionary"), false);
});


test("imports standalone and array-form JSON sources with common field aliases", () => {
  const source = {
    bookSourceName: "外部 JSON 源",
    bookSourceUrl: "https://books.example/",
    searchUrl: "https://books.example/search?q={{key}}",
    bookInfoUrl: "https://books.example/book/{{bookUrl}}",
    tocUrl: "https://books.example/toc/{{bookUrl}}",
    contentUrl: "https://books.example/content/{{chapterUrl}}"
  };
  const single = parseSourceSubscription(JSON.stringify(source));
  assert.equal(single.compatible.length, 1);
  assert.equal(single.compatible[0].name, "外部 JSON 源");
  assert.equal(single.compatible[0].searchUrl, "https://books.example/search?q={keyword}");
  const batch = parseSourceSubscription(JSON.stringify([source, { ...source, bookSourceName: "第二个源", bookSourceUrl: "https://other.example/" }]));
  assert.equal(batch.compatible.length, 2);
});

test("recognizes Legado-style rule sources without executing their rule DSL", () => {
  const result = parseSourceSubscription(JSON.stringify([{
    bookSourceName: "阅读规则源",
    bookSourceUrl: "https://books.example/",
    searchUrl: "https://books.example/search?q={{key}}",
    ruleSearch: { bookList: "class.result", name: "a@text" },
    ruleToc: { chapterList: "class.chapter a" },
    ruleContent: { content: "id.content" }
  }]));
  assert.equal(result.compatible.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /专属规则表达式尚未适配/);
});


test("supports TXT subscriptions containing one JSON source per line", () => {
  const source = {
    name: "TXT JSON 源", baseUrl: "https://books.example/",
    searchUrl: "https://books.example/search?q={keyword}",
    bookUrl: "https://books.example/book/{bookUrl}",
    chapterListUrl: "https://books.example/toc/{bookUrl}",
    chapterUrl: "https://books.example/content/{chapterUrl}"
  };
  const result = parseSourceSubscription("# source list\n" + JSON.stringify(source) + "\n");
  assert.equal(result.compatible.length, 1);
  assert.equal(result.compatible[0].name, "TXT JSON 源");
});

test("maps basic Legado class/id/tag selectors into the app HTML rule format", () => {
  const source = {
    bookSourceName: "静态规则源",
    bookSourceUrl: "https://books.example/",
    searchUrl: "https://books.example/search?q={{key}}",
    bookInfoUrl: "https://books.example/book/{bookUrl}",
    tocUrl: "https://books.example/toc/{bookUrl}",
    contentUrl: "https://books.example/content/{chapterUrl}",
    ruleSearch: { bookList: "class.book", name: "tag.a@text", bookUrl: "tag.a@href", author: "class.author@text", coverUrl: "tag.img@src" },
    ruleToc: { chapterList: "class.chapter", chapterName: "tag.a@text", chapterUrl: "tag.a@href" },
    ruleContent: { content: "id.content" },
    ruleBookInfo: { name: "id.title", author: "class.author", intro: "class.intro" }
  };
  const result = parseSourceSubscription(JSON.stringify([source]));
  assert.equal(result.compatible.length, 1);
  assert.equal(result.compatible[0].htmlRules.search.itemSelector, ".book");
  assert.equal(result.compatible[0].htmlRules.search.titleSelector, "a");
  assert.equal(result.compatible[0].htmlRules.search.coverSelector, "img");
  assert.equal(result.compatible[0].htmlRules.chapters.itemSelector, ".chapter");
  assert.equal(result.compatible[0].htmlRules.chapters.titleAttribute, "text");
  assert.equal(result.compatible[0].htmlRules.content.contentSelector, "#content");
  assert.equal(result.compatible[0].htmlRules.detail.titleSelector, "#title");
});


test("maps Legado attribute suffixes on compound CSS selectors", () => {
  const source = {
    bookSourceName: "复合选择器源",
    bookSourceUrl: "https://books.example/",
    searchUrl: "https://books.example/search?q={{key}}",
    bookInfoUrl: "https://books.example/book/{bookUrl}",
    tocUrl: "https://books.example/toc/{bookUrl}",
    contentUrl: "https://books.example/content/{chapterUrl}",
    ruleSearch: {
      bookList: "class.result",
      name: "a.book-title@text",
      bookUrl: "a.book-title@href",
      author: "span.author-name@text",
      coverUrl: "img.cover@src"
    },
    ruleToc: {
      chapterList: "class.chapter-list a.chapter",
      chapterName: "a.chapter@text",
      chapterUrl: "a.chapter@href"
    },
    ruleContent: { content: "div.reader-content@text" }
  };
  const result = parseSourceSubscription(JSON.stringify(source));
  assert.equal(result.compatible.length, 1);
  const rules = result.compatible[0].htmlRules;
  assert.equal(rules.search.titleSelector, "a.book-title");
  assert.equal(rules.search.urlSelector, "a.book-title");
  assert.equal(rules.search.urlAttribute, "href");
  assert.equal(rules.search.authorSelector, "span.author-name");
  assert.equal(rules.search.coverSelector, "img.cover");
  assert.equal(rules.search.coverAttribute, "src");
  assert.equal(rules.chapters.itemSelector, ".chapter-list a.chapter");
  assert.equal(rules.chapters.urlAttribute, "href");
  assert.equal(rules.content.contentSelector, "div.reader-content");
});


test("preserves Legado @content and attribute selectors for search and detail metadata", () => {
  const source = {
    bookSourceName: "Meta 属性源",
    bookSourceUrl: "https://books.example/",
    searchUrl: "https://books.example/search?q={{key}}",
    bookInfoUrl: "https://books.example/book/{bookUrl}",
    tocUrl: "https://books.example/toc/{bookUrl}",
    contentUrl: "https://books.example/content/{chapterUrl}",
    ruleSearch: {
      bookList: "class.book",
      name: "tag.meta[name=title]@content",
      bookUrl: "tag.a@href",
      author: "tag.meta[name=author]@content",
      intro: "tag.meta[name=description]@content"
    },
    ruleToc: { chapterList: "class.chapter", chapterName: "tag.a@text", chapterUrl: "tag.a@href" },
    ruleContent: { content: "id.content" },
    ruleBookInfo: {
      name: "tag.meta[name=title]@content",
      author: "tag.meta[name=author]@content",
      intro: "tag.meta[name=description]@content"
    }
  };
  const result = parseSourceSubscription(JSON.stringify([source]));
  assert.equal(result.compatible.length, 1);
  const rules = result.compatible[0].htmlRules;
  assert.equal(rules.search.titleSelector, "meta[name=title]");
  assert.equal(rules.search.titleAttribute, "content");
  assert.equal(rules.search.authorAttribute, "content");
  assert.equal(rules.search.descriptionAttribute, "content");
  assert.equal(rules.detail.titleAttribute, "content");
  assert.equal(rules.detail.authorAttribute, "content");
  assert.equal(rules.detail.descriptionAttribute, "content");
});

test("imports Legado sources that keep the search URL inside ruleSearch.url", () => {
  const result = parseSourceSubscription(JSON.stringify({
    bookSourceName: "Legado 相对地址源",
    bookSourceUrl: "https://books.example/",
    ruleSearch: {
      url: "/search?key={{key}}&page={{page}}",
      bookList: "class.book",
      name: "tag.a@text",
      bookUrl: "tag.a@href",
      author: "class.author@text"
    },
    tocUrl: "/toc/{bookUrl}?id={bookId}",
    contentUrl: "/content/{chapterUrl}",
    ruleToc: {
      chapterList: "class.chapter",
      chapterName: "tag.a@text",
      chapterUrl: "tag.a@href"
    },
    ruleContent: { content: "id.content" },
    ruleBookInfo: { name: "id.title", author: "class.author" }
  }));
  assert.equal(result.compatible.length, 1);
  assert.equal(result.unsupported.length, 0);
  const source = result.compatible[0];
  assert.equal(source.searchUrl, "https://books.example/search?key={keyword}&page={page}");
  assert.equal(source.bookUrl, "https://books.example/");
  assert.equal(source.chapterListUrl, "https://books.example/toc/{bookUrl}?id={bookId}");
  assert.equal(source.chapterUrl, "https://books.example/content/{chapterUrl}");
  assert.equal(source.htmlRules.search.titleSelector, "a");
  assert.equal(source.htmlRules.chapters.itemSelector, ".chapter");
});


test("normalizes single-brace Legado key and page templates", () => {
  const result = parseSourceSubscription(JSON.stringify({
    bookSourceName: "单花括号模板源",
    bookSourceUrl: "https://books.example/",
    ruleSearch: {
      url: "/search?key={key}&page={page}",
      bookList: "class.book",
      name: "tag.a@text",
      bookUrl: "tag.a@href"
    },
    tocUrl: "/toc/{bookUrl}",
    contentUrl: "/content/{chapterUrl}",
    ruleToc: {
      chapterList: "class.chapter",
      chapterName: "tag.a@text",
      chapterUrl: "tag.a@href"
    },
    ruleContent: { content: "id.content" }
  }));
  assert.equal(result.compatible.length, 1);
  assert.equal(result.compatible[0].searchUrl, "https://books.example/search?key={keyword}&page={page}");
});
