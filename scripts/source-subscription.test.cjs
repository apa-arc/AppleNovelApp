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
    chapterUrl: "https://books.example/chapter"
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
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /脚本规则暂不执行/);
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
