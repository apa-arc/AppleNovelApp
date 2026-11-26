const test = require("node:test");
const assert = require("node:assert/strict");
const { parseNovelSourceJson, parseNovelSourceJsonBatch } = require("../.test-build/source.js");
const { createSourceHttpClient, SourceHttpError } = require("../.test-build/source-runtime.js");

function source(overrides = {}) {
  return {
    id: "test", name: "Fixture", baseUrl: "https://books.example",
    searchUrl: "https://books.example/search",
    bookUrl: "https://books.example/book",
    chapterListUrl: "https://books.example/toc",
    chapterUrl: "https://books.example/chapter",
    enabled: true, importedAt: 1, ...overrides,
  };
}

function mockResponse({ body = "<html>ok</html>", status = 200, url = "https://books.example/search", contentType = "text/html" } = {}) {
  return {
    ok: status >= 200 && status < 300, status, url,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    text: async () => body,
  };
}

test("source parser accepts a public HTTPS host", () => {
  const value = {
    name: "Fixture", baseUrl: "https://books.example",
    searchUrl: "https://books.example/search", bookUrl: "https://books.example/book",
    chapterListUrl: "https://books.example/toc", chapterUrl: "https://books.example/chapter",
  };
  assert.equal(parseNovelSourceJson(JSON.stringify(value)).name, "Fixture");
});

test("source parser rejects private IPv4, loopback and local IPv6 hosts", () => {
  for (const host of ["https://192.168.1.1", "https://10.0.0.2", "https://127.0.0.1", "https://[::1]", "https://[fc00::1]", "https://router.local"]) {
    const value = {
      name: "Bad", baseUrl: host, searchUrl: host, bookUrl: host,
      chapterListUrl: host, chapterUrl: host,
    };
    assert.throws(() => parseNovelSourceJson(JSON.stringify(value)), /本机、局域网或内部地址/);
  }
});

test("GET uses only configured HTTPS origins and omits credentials", async () => {
  let captured;
  const client = createSourceHttpClient(source(), async (url, options) => {
    captured = { url, options };
    return mockResponse();
  });
  const result = await client.get("searchUrl");
  assert.equal(result.status, 200);
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.credentials, "omit");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.options.headers.Accept.includes("text/html"), true);
});

test("request cannot escape configured origins", async () => {
  let called = false;
  const client = createSourceHttpClient(source(), async () => {
    called = true;
    return mockResponse();
  });
  await assert.rejects(client.get("searchUrl", "https://attacker.example/steal"), (error) => error.code === "url-not-allowed");
  assert.equal(called, false);
});

test("disabled sources cannot make requests", async () => {
  const client = createSourceHttpClient(source({ enabled: false }), async () => mockResponse());
  await assert.rejects(client.get("searchUrl"), (error) => error.code === "source-disabled");
});

test("unexpected cross-origin final URL is rejected", async () => {
  const client = createSourceHttpClient(source(), async () => mockResponse({ url: "https://attacker.example/redirected" }));
  await assert.rejects(client.get("searchUrl"), (error) => error.code === "redirect-blocked");
});

test("HTTP failures and oversized bodies are rejected", async () => {
  const failed = createSourceHttpClient(source(), async () => mockResponse({ status: 503 }));
  await assert.rejects(failed.get("searchUrl"), (error) => error.code === "http-error");
  const oversized = createSourceHttpClient(source(), async () => mockResponse({ body: "x".repeat(1_000_001) }));
  await assert.rejects(oversized.get("searchUrl"), (error) => error.code === "response-too-large");
});

test("network failures are normalized", async () => {
  const client = createSourceHttpClient(source(), async () => { throw new Error("offline"); });
  await assert.rejects(client.get("searchUrl"), (error) => error instanceof SourceHttpError && error.code === "network-error");
});

test("source batch parser accepts an object array and validates every entry", () => {
  const make = (name, host) => ({
    name, baseUrl: "https://" + host, searchUrl: "https://" + host + "/search",
    bookUrl: "https://" + host + "/book", chapterListUrl: "https://" + host + "/toc",
    chapterUrl: "https://" + host + "/chapter",
  });
  const batch = parseNovelSourceJsonBatch(JSON.stringify([make("源一", "one.example"), make("源二", "two.example")]));
  assert.equal(batch.length, 2);
  assert.equal(batch[1].name, "源二");
  assert.throws(() => parseNovelSourceJsonBatch(JSON.stringify([make("正常源", "one.example"), { name: "坏源" }])), /第 2 个书源校验失败/);
  assert.throws(() => parseNovelSourceJsonBatch(JSON.stringify([make("重复", "one.example"), make("重复", "two.example")])), /存在重复/);
  assert.throws(() => parseNovelSourceJsonBatch("[]"), /不能为空/);
  assert.throws(() => parseNovelSourceJsonBatch(JSON.stringify(Array.from({ length: 101 }, (_, i) => make("源" + i, "host" + i + ".example")))), /最多导入 100 个/);
});

test("source parser preserves URL template tokens for native source adapters", () => {
  const value = {
    name: "模板源", baseUrl: "https://books.example/",
    searchUrl: "https://books.example/search?name={keyword}",
    bookUrl: "https://books.example/",
    chapterListUrl: "https://books.example/{bookUrl}",
    chapterUrl: "https://books.example/{chapterUrl}",
  };
  const parsed = parseNovelSourceJson(JSON.stringify(value));
  assert.equal(parsed.searchUrl, value.searchUrl);
  assert.equal(parsed.chapterListUrl, value.chapterListUrl);
  assert.equal(parsed.chapterUrl, value.chapterUrl);
});


test("caller abort signal cancels an in-flight source request", async () => {
  const controller = new AbortController();
  const client = createSourceHttpClient(source(), async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  const pending = client.get("searchUrl", undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error) => error instanceof SourceHttpError && error.code === "cancelled");
});


test("search request timeout can be shorter than catalog default", async () => {
  const client = createSourceHttpClient(source(), async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }), 500);
  await assert.rejects(client.get("searchUrl"), (error) => error instanceof SourceHttpError && error.code === "timeout");
});
