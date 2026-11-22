const test = require("node:test");
const assert = require("node:assert/strict");
const { splitSpeechText } = require("../.test-build/speech-engine.js");

test("splits long Chinese text at natural punctuation boundaries", () => {
  const chunks = splitSpeechText("第一句。第二句！第三句？", 80);
  assert.deepEqual(chunks, ["第一句。第二句！第三句？"]);
});

test("normalizes CRLF and removes empty lines", () => {
  assert.deepEqual(splitSpeechText("  第一段。\r\n\r\n 第二段！  ", 80), ["第一段。第二段！"]);
});

test("keeps supplementary Unicode characters intact at chunk boundaries", () => {
  const emoji = "😀";
  const input = "甲".repeat(79) + emoji + "乙".repeat(90);
  const chunks = splitSpeechText(input, 80);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), input);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 80));
  assert.ok(chunks.every((chunk) => !chunk.includes("\uFFFD")));
});

test("splits a single oversized sentence without breaking Unicode code points", () => {
  const input = "😀".repeat(95);
  const chunks = splitSpeechText(input, 80);
  assert.deepEqual(chunks.map((chunk) => Array.from(chunk).length), [80, 15]);
  assert.equal(chunks.join(""), input);
  assert.ok(chunks.every((chunk) => !chunk.includes("\uFFFD")));
});

test("returns no chunks for empty or whitespace-only input", () => {
  assert.deepEqual(splitSpeechText("  \r\n  "), []);
});
