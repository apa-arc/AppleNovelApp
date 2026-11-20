const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_READER_SETTINGS, normalizeReaderSettings } = require("../.test-build/reader-settings.js");

test("reader settings use stable defaults", () => {
  assert.deepEqual(DEFAULT_READER_SETTINGS, {
    fontSize: 18, theme: "paper", readingMode: "scroll", lineSpacing: 1.9, paragraphSpacing: 22, horizontalPadding: 27, speechVoiceIdentifier: null, speechModelVoiceId: "kokoro-multi-lang-v1_1:speaker-3", speechRate: 0.95, speechPitch: 1,
  });
});

test("reader settings preserve valid user preferences", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 24, theme: "night", readingMode: "tap", lineSpacing: 2.1, paragraphSpacing: 18, horizontalPadding: 32 }), {
    fontSize: 24, theme: "night", readingMode: "tap", lineSpacing: 2.1, paragraphSpacing: 18, horizontalPadding: 32, speechVoiceIdentifier: null, speechModelVoiceId: "kokoro-multi-lang-v1_1:speaker-3", speechRate: 0.95, speechPitch: 1,
  });
});

test("reader settings clamp numeric values and reject unknown choices", () => {
  assert.deepEqual(normalizeReaderSettings({ fontSize: 99, theme: "neon", readingMode: "unknown", lineSpacing: 9, paragraphSpacing: 100, horizontalPadding: 2 }), {
    fontSize: 28, theme: "paper", readingMode: "scroll", lineSpacing: 2.4, paragraphSpacing: 32, horizontalPadding: 16, speechVoiceIdentifier: null, speechModelVoiceId: "kokoro-multi-lang-v1_1:speaker-3", speechRate: 0.95, speechPitch: 1,
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
  assert.equal(normalized.readingMode, "scroll");
  assert.equal(normalized.lineSpacing, DEFAULT_READER_SETTINGS.lineSpacing);
  assert.equal(normalized.paragraphSpacing, DEFAULT_READER_SETTINGS.paragraphSpacing);
  assert.equal(normalized.horizontalPadding, DEFAULT_READER_SETTINGS.horizontalPadding);
  assert.equal(normalized.speechVoiceIdentifier, null);
  assert.equal(normalized.speechModelVoiceId, DEFAULT_READER_SETTINGS.speechModelVoiceId);
  assert.equal(normalized.speechRate, DEFAULT_READER_SETTINGS.speechRate);
  assert.equal(normalized.speechPitch, DEFAULT_READER_SETTINGS.speechPitch);
});

test("speech voice and sound controls are persisted and bounded", () => {
  assert.deepEqual(normalizeReaderSettings({ speechVoiceIdentifier: "com.apple.voice.zh-CN.tingting", speechRate: 1.35, speechPitch: 1.2 }), {
    ...DEFAULT_READER_SETTINGS, speechVoiceIdentifier: "com.apple.voice.zh-CN.tingting", speechRate: 1.35, speechPitch: 1.2,
  });
  const bounded = normalizeReaderSettings({ speechRate: 9, speechPitch: 0.1 });
  assert.equal(bounded.speechRate, 2);
  assert.equal(bounded.speechPitch, 0.5);
});


test("Kokoro speaker selection is persisted and rejects unknown speaker IDs", () => {
  const selected = normalizeReaderSettings({ speechModelVoiceId: "kokoro-multi-lang-v1_1:speaker-72" });
  assert.equal(selected.speechModelVoiceId, "kokoro-multi-lang-v1_1:speaker-72");
  assert.equal(normalizeReaderSettings({ speechModelVoiceId: "kokoro-multi-lang-v1_1:speaker-103" }).speechModelVoiceId, DEFAULT_READER_SETTINGS.speechModelVoiceId);
  assert.equal(normalizeReaderSettings({ speechModelVoiceId: "other-model:speaker-1" }).speechModelVoiceId, DEFAULT_READER_SETTINGS.speechModelVoiceId);
});
