const test = require("node:test");
const assert = require("node:assert/strict");
const { getSpeechAudioEntryKey, normalizeSpeechAudioEntries } = require("../.test-build/speech-audio-library.js");

test("audio entry key distinguishes chapter, voice and speed", () => {
  const base = getSpeechAudioEntryKey("book/1", "chapter 2", "zf_001", 1);
  assert.equal(base, getSpeechAudioEntryKey("book/1", "chapter 2", "zf_001", 1));
  assert.notEqual(base, getSpeechAudioEntryKey("book/1", "chapter 3", "zf_001", 1));
  assert.notEqual(base, getSpeechAudioEntryKey("book/1", "chapter 2", "zm_001", 1));
  assert.notEqual(base, getSpeechAudioEntryKey("book/1", "chapter 2", "zf_001", 1.2));
});

test("invalid and empty saved-audio records are discarded", () => {
  const valid = {
    key: "k", bookId: "b", chapterId: "c", bookTitle: "书", chapterTitle: "章",
    author: "作者", voiceId: "voice", speed: 1, files: ["file:///a.wav"],
    createdAt: 1, totalBytes: 100,
  };
  assert.deepEqual(normalizeSpeechAudioEntries([valid, null, { ...valid, files: [] }]), [valid]);
  assert.deepEqual(normalizeSpeechAudioEntries("not-json"), []);
});
