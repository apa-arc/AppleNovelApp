const test = require("node:test");
const assert = require("node:assert/strict");
const { selectSpeechEngine, splitSpeechText, normalizeCloudTtsEndpoint } = require("../.test-build/speech-engine.js");

test("hybrid prefers configured cloud and falls back to local offline model", () => {
  assert.deepEqual(selectSpeechEngine("hybrid", { offlineReady: true, cloudReady: true, online: true }), { engine: "cloud", reason: "cloud-preferred" });
  assert.deepEqual(selectSpeechEngine("hybrid", { offlineReady: true, cloudReady: true, online: false }), { engine: "offline", reason: "offline-fallback" });
  assert.deepEqual(selectSpeechEngine("hybrid", { offlineReady: false, cloudReady: false, online: true }), { engine: null, reason: "no-engine-ready" });
});

test("explicit engine modes never silently switch providers", () => {
  assert.deepEqual(selectSpeechEngine("offline", { offlineReady: false, cloudReady: true, online: true }), { engine: null, reason: "offline-not-ready" });
  assert.deepEqual(selectSpeechEngine("cloud", { offlineReady: true, cloudReady: true, online: false }), { engine: null, reason: "cloud-not-ready" });
  assert.deepEqual(selectSpeechEngine("cloud", { offlineReady: true, cloudReady: true, online: true }), { engine: "cloud", reason: "cloud-only" });
});

test("speech text is split on natural boundaries and respects the size limit", () => {
  const chunks = splitSpeechText("第一句。第二句！\n第三句？", 80);
  assert.deepEqual(chunks, ["第一句。第二句！第三句？"]);
  const long = splitSpeechText("甲".repeat(190), 80);
  assert.equal(long.join("").length, 190);
  assert.ok(long.every((chunk) => chunk.length <= 80));
  assert.deepEqual(splitSpeechText("  \n "), []);
});

test("cloud endpoint must be a safe HTTPS URL", () => {
  assert.equal(normalizeCloudTtsEndpoint("https://tts.example.com/v1/speech/"), "https://tts.example.com/v1/speech");
  assert.equal(normalizeCloudTtsEndpoint("http://tts.example.com"), null);
  assert.equal(normalizeCloudTtsEndpoint("https://user:pass@example.com/tts"), null);
  assert.equal(normalizeCloudTtsEndpoint(""), null);
});
