const test = require("node:test");
const assert = require("node:assert/strict");
const { parseNovelSourceJson } = require("../.test-build/source.js");
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
