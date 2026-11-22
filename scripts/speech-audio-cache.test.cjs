const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSpeechAudioCacheKey,
  normalizeSpeechAudioCacheIndex,
  createSpeechAudioCache,
} = require("../.test-build/speech-audio-cache.js");

function createStore() {
  const files = new Map();
  let index = [];
  return {
    files,
    loadIndex: async () => index,
    saveIndex: async (entries) => { index = entries; },
    read: async (uri) => {
      if (!files.has(uri)) throw new Error("missing");
      return files.get(uri);
    },
    write: async (key, format, bytes) => {
      const uri = "cache://" + key + "." + format;
      files.set(uri, new Uint8Array(bytes));
      return uri;
    },
    remove: async (uri) => { files.delete(uri); },
    index: () => index,
  };
}

test("cache key isolates book, chapter, provider, voice, speed and text", () => {
  const base = {
    bookId: "book", chapterId: "chapter", engine: "kokoro", model: "v1",
    voiceId: "voice-a", speed: 1, text: "你好，世界。",
  };
  const key = buildSpeechAudioCacheKey(base);
  assert.equal(key, buildSpeechAudioCacheKey(base));
  assert.notEqual(key, buildSpeechAudioCacheKey({ ...base, chapterId: "chapter-2" }));
  assert.notEqual(key, buildSpeechAudioCacheKey({ ...base, engine: "gemini" }));
  assert.notEqual(key, buildSpeechAudioCacheKey({ ...base, voiceId: "voice-b" }));
  assert.notEqual(key, buildSpeechAudioCacheKey({ ...base, speed: 1.25 }));
  assert.notEqual(key, buildSpeechAudioCacheKey({ ...base, text: "你好，世界！" }));
});

test("normalizes invalid and duplicate cache entries", () => {
  const valid = { key: "k", uri: "cache://k.wav", format: "wav", bytes: 10, createdAt: 1, lastAccessedAt: 2 };
  assert.deepEqual(normalizeSpeechAudioCacheIndex([valid, null, { ...valid, bytes: 0 }, { ...valid, uri: "" }]), [valid]);
  assert.deepEqual(normalizeSpeechAudioCacheIndex([valid, { ...valid, uri: "cache://new.wav", lastAccessedAt: 3 }]), [{ ...valid, uri: "cache://new.wav", lastAccessedAt: 3 }]);
});

test("stores and returns exact audio bytes, then updates access time", async () => {
  const store = createStore();
  const cache = createSpeechAudioCache(store);
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await cache.put("one", bytes, "wav");
  assert.deepEqual(Array.from(await cache.get("one")), [1, 2, 3, 4]);
  assert.equal((await cache.stats()).entries, 1);
  assert.equal((await cache.stats()).bytes, 4);
});

test("removes corrupt or missing files and reports a cache miss", async () => {
  const store = createStore();
  const cache = createSpeechAudioCache(store);
  await cache.put("one", new Uint8Array([1, 2, 3]), "mp3");
  store.files.clear();
  assert.equal(await cache.get("one"), null);
  assert.deepEqual(await cache.stats(), { entries: 0, bytes: 0 });
});

test("evicts least recently used files when the cache exceeds its byte budget", async () => {
  const store = createStore();
  const cache = createSpeechAudioCache(store, 5);
  await cache.put("old", new Uint8Array([1, 2, 3]), "wav");
  await cache.put("new", new Uint8Array([4, 5, 6, 7]), "wav");
  assert.equal(await cache.get("old"), null);
  assert.deepEqual(Array.from(await cache.get("new")), [4, 5, 6, 7]);
  assert.deepEqual(await cache.stats(), { entries: 1, bytes: 4 });
});

test("clear removes cache files but leaves unrelated files untouched", async () => {
  const store = createStore();
  const cache = createSpeechAudioCache(store);
  await cache.put("one", new Uint8Array([1, 2]), "wav");
  store.files.set("user-file://keep.txt", new Uint8Array([9]));
  await cache.clear();
  assert.deepEqual(await cache.stats(), { entries: 0, bytes: 0 });
  assert.equal(store.files.has("user-file://keep.txt"), true);
});
