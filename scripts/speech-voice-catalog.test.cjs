const test = require("node:test");
const assert = require("node:assert/strict");
const { SPEECH_MODEL, SPEECH_VOICES, findSpeechVoice, canReuseVoiceOffline, buildSpeechSynthesisRequest } = require("../.test-build/speech-voice-catalog.js");

test("catalog uses stable speaker IDs for cloud and offline variants of the same model", () => {
  assert.equal(SPEECH_VOICES.length, 103);
  const voice = findSpeechVoice("kokoro-multi-lang-v1_1:speaker-45");
  assert.ok(voice);
  assert.equal(voice.localModelId, voice.cloudModelId);
  assert.equal(voice.modelId, SPEECH_MODEL.id);
  assert.equal(voice.speakerId, 45);
});

test("voice becomes available offline only after its compatible model is installed", () => {
  const voice = SPEECH_VOICES[3];
  assert.equal(canReuseVoiceOffline(voice.id, []), false);
  assert.equal(canReuseVoiceOffline(voice.id, [SPEECH_MODEL.id]), true);
  assert.equal(canReuseVoiceOffline("unknown", [SPEECH_MODEL.id]), false);
});

test("cloud request preserves the same model and speaker identity used offline", () => {
  assert.deepEqual(buildSpeechSynthesisRequest(SPEECH_VOICES[45].id, "  你好  ", 1.2), {
    model: SPEECH_MODEL.id,
    speakerId: 45,
    text: "你好",
    speed: 1.2,
  });
  assert.equal(buildSpeechSynthesisRequest("invalid", "hello"), null);
  assert.equal(buildSpeechSynthesisRequest(SPEECH_VOICES[0].id, "  "), null);
  assert.equal(buildSpeechSynthesisRequest(SPEECH_VOICES[0].id, "hello", 9).speed, 2);
});
