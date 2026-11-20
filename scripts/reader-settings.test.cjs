const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_READER_SETTINGS, normalizeReaderSettings } = require("../.test-build/reader-settings.js");

test("reader settings use stable defaults", () => {
  assert.deepEqual(DEFAULT_READER_SETTINGS, { fontSize: 18, theme: "paper" });
});

test("reader settings preserve valid user preferences", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 24, theme: "night" }), {
    fontSize: 24, theme: "night",
  });
});

test("reader settings clamp font size and reject unknown themes", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 99, theme: "neon" }), {
    fontSize: 28, theme: "paper",
  });
  assert.equal(normalizeReaderSettings({ fontSize: 5, theme: "night" }).fontSize, 14);
});

test("reader settings recover safely from malformed storage values", () => {
  assert.deepEqual(normalizeReaderSettings(null), DEFAULT_READER_SETTINGS);
  assert.deepEqual(normalizeReaderSettings("bad"), DEFAULT_READER_SETTINGS);
  assert.deepEqual(normalizeReaderSettings({ fontSize: NaN, theme: "night" }), {
    fontSize: 18, theme: "night",
  });
});
