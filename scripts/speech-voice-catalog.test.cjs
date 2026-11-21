const test = require("node:test");
const assert = require("node:assert/strict");
const { SPEECH_MODEL, SPEECH_VOICES, findSpeechVoice, canReuseVoiceOffline, getSpeechVoiceCategory } = require("../.test-build/speech-voice-catalog.js");

test("catalog exposes stable local Kokoro speaker IDs", () => {
  assert.equal(SPEECH_VOICES.length, 103);
  const voice = findSpeechVoice("kokoro-multi-lang-v1_1:speaker-45");
  assert.ok(voice);
  assert.equal(voice.localModelId, SPEECH_MODEL.downloadAssetId);
  assert.equal(voice.modelId, SPEECH_MODEL.id);
  assert.equal(voice.speakerId, 45);
});

test("voice becomes available offline only after its compatible model is installed", () => {
  const voice = SPEECH_VOICES[3];
  assert.equal(canReuseVoiceOffline(voice.id, []), false);
  assert.equal(canReuseVoiceOffline(voice.id, [SPEECH_MODEL.downloadAssetId]), true);
  assert.equal(canReuseVoiceOffline("unknown", [SPEECH_MODEL.id]), false);
});

test("official speaker map exposes the Chinese and English voice groups", () => {
  assert.equal(findSpeechVoice("kokoro-multi-lang-v1_1:speaker-0").speakerName, "af_maple");
  assert.equal(findSpeechVoice("kokoro-multi-lang-v1_1:speaker-2").category, "英式女声");
  assert.equal(findSpeechVoice("kokoro-multi-lang-v1_1:speaker-3").speakerName, "zf_001");
  assert.equal(findSpeechVoice("kokoro-multi-lang-v1_1:speaker-57").category, "中文女声");
  assert.equal(findSpeechVoice("kokoro-multi-lang-v1_1:speaker-58").speakerName, "zm_009");
  assert.equal(findSpeechVoice("kokoro-multi-lang-v1_1:speaker-102").category, "中文男声");
  assert.equal(getSpeechVoiceCategory(1), "美式女声");
});
