const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FISH_AUDIO_API_KEY_STORAGE,
  saveFishAudioApiKey,
  getFishAudioApiKey,
  deleteFishAudioApiKey,
  GEMINI_API_KEY_STORAGE,
  saveGeminiApiKey,
  getGeminiApiKey,
  deleteGeminiApiKey,
} = require("../.test-build/speech-credentials.js");

function createStore() {
  const values = new Map();
  return {
    values,
    isAvailableAsync: async () => true,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  };
}

test("stores, reads and deletes the provider key through secure storage", async () => {
  const store = createStore();
  await saveFishAudioApiKey("  fish-secret  ", store);
  assert.equal(store.values.get(FISH_AUDIO_API_KEY_STORAGE), "fish-secret");
  assert.equal(await getFishAudioApiKey(store), "fish-secret");
  await deleteFishAudioApiKey(store);
  assert.equal(await getFishAudioApiKey(store), null);
});

test("rejects blank keys and unavailable secure storage", async () => {
  const store = createStore();
  await assert.rejects(() => saveFishAudioApiKey("  ", store), /不能为空/);
  const unavailable = { ...store, isAvailableAsync: async () => false };
  await assert.rejects(() => getFishAudioApiKey(unavailable), /不支持安全凭据/);
});

test("stores, reads and deletes the Gemini key using the same secure store", async () => {
  const store = createStore();
  await saveGeminiApiKey("  gemini-secret  ", store);
  assert.equal(store.values.get(GEMINI_API_KEY_STORAGE), "gemini-secret");
  assert.equal(await getGeminiApiKey(store), "gemini-secret");
  await deleteGeminiApiKey(store);
  assert.equal(await getGeminiApiKey(store), null);
});

test("rejects blank Gemini keys", async () => {
  await assert.rejects(() => saveGeminiApiKey("  ", createStore()), /不能为空/);
});
