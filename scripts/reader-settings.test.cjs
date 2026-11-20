const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_READER_SETTINGS, normalizeReaderSettings } = require("../.test-build/reader-settings.js");

test("reader settings use stable defaults", () => {
  assert.deepEqual(DEFAULT_READER_SETTINGS, { fontSize: 18, theme: "paper", readingMode: "scroll" });
});

test("reader settings preserve valid user preferences", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 24, theme: "night", readingMode: "tap" }), {
    fontSize: 24, theme: "night", readingMode: "tap",
  });
});

test("reader settings clamp font size and reject unknown themes and modes", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 99, theme: "neon", readingMode: "unknown" }), {
    fontSize: 28, theme: "paper", readingMode: "scroll",
  });
  assert.equal(normalizeReaderSettings({ fontSize: 5, theme: "night" }).fontSize, 14);
});

test("reader settings recover safely from malformed storage values", () => {
  assert.deepEqual(normalizeReaderSettings(null), DEFAULT_READER_SETTINGS);
  assert.deepEqual(normalizeReaderSettings("bad"), DEFAULT_READER_SETTINGS);
  assert.deepEqual(normalizeReaderSettings({ fontSize: NaN, theme: "night" }), {
    fontSize: 18, theme: "night", readingMode: "scroll",
  });
});

test("older saved preferences remain compatible and default to scrolling", () => {
  assert.equal(normalizeReaderSettings({ fontSize: 20, theme: "paper" }).readingMode, "scroll");
});
