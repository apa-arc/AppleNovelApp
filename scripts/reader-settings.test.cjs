const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_READER_SETTINGS, normalizeReaderSettings } = require("../.test-build/reader-settings.js");

test("reader settings use stable defaults", () => {
  assert.deepEqual(DEFAULT_READER_SETTINGS, {
    fontSize: 18, theme: "paper", pageTurnMode: "vertical-scroll", lineSpacing: 1.9, paragraphSpacing: 22, horizontalPadding: 27,
  });
});

test("reader settings preserve valid user preferences", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 24, theme: "night", pageTurnMode: "left-right", lineSpacing: 2.1, paragraphSpacing: 18, horizontalPadding: 32 }), {
    fontSize: 24, theme: "night", pageTurnMode: "left-right", lineSpacing: 2.1, paragraphSpacing: 18, horizontalPadding: 32,
  });
});

test("reader settings clamp numeric values and reject unknown choices", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 99, theme: "neon", pageTurnMode: "unknown", lineSpacing: 9, paragraphSpacing: 100, horizontalPadding: 2 }), {
    fontSize: 28, theme: "paper", pageTurnMode: "vertical-scroll", lineSpacing: 2.4, paragraphSpacing: 32, horizontalPadding: 16,
  });
  assert.equal(normalizeReaderSettings({ fontSize: 5, theme: "green", lineSpacing: 1.43 }).fontSize, 14);
  assert.equal(normalizeReaderSettings({ lineSpacing: 1.43 }).lineSpacing, 1.4);
});

test("reader settings recover safely from malformed storage values", () => {
  assert.deepEqual(normalizeReaderSettings(null), DEFAULT_READER_SETTINGS);
  assert.deepEqual(normalizeReaderSettings("bad"), DEFAULT_READER_SETTINGS);
  assert.deepEqual(normalizeReaderSettings({ fontSize: NaN, theme: "night" }), {
    ...DEFAULT_READER_SETTINGS, theme: "night",
  });
});

test("older saved preferences remain compatible with new layout options", () => {
  const normalized = normalizeReaderSettings({ fontSize: 20, theme: "paper" });
  assert.equal(normalized.pageTurnMode, "vertical-scroll");
  assert.equal(normalized.lineSpacing, DEFAULT_READER_SETTINGS.lineSpacing);
  assert.equal(normalized.paragraphSpacing, DEFAULT_READER_SETTINGS.paragraphSpacing);
  assert.equal(normalized.horizontalPadding, DEFAULT_READER_SETTINGS.horizontalPadding);
});


test("legacy Kokoro and cloud TTS preferences are ignored and never persisted", () => {
  const normalized = normalizeReaderSettings({ speechCloudEndpoint: "https://old.example", speechEngineMode: "cloud", speechModelVoiceId: "kokoro-multi-lang-v1_1:speaker-72", speechRate: 1.5 });
  assert.equal(Object.hasOwn(normalized, "speechCloudEndpoint"), false);
  assert.equal(Object.hasOwn(normalized, "speechEngineMode"), false);
  assert.equal(Object.hasOwn(normalized, "speechModelVoiceId"), false);
  assert.equal(Object.hasOwn(normalized, "speechRate"), false);
});

test("all five page-turn modes are persisted and legacy tap maps to horizontal swipe", () => { for (const pageTurnMode of ["left-right", "vertical-scroll", "simulation", "cover", "none"]) assert.equal(normalizeReaderSettings({ pageTurnMode }).pageTurnMode, pageTurnMode); assert.equal(normalizeReaderSettings({ readingMode: "tap" }).pageTurnMode, "left-right"); });
