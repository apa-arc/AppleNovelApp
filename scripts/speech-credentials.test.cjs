const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FISH_AUDIO_API_KEY_STORAGE,
  saveFishAudioApiKey,
  getFishAudioApiKey,
  deleteFishAudioApiKey,
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
