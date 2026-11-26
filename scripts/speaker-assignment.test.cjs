const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_KOKORO_ZH_VOICE_ID,
  buildSpeakerVoiceMap,
  extractExplicitSpeakerNames,
  splitTextForMultiVoice,
} = require("../.test-build/speaker-assignment.js");

test("detects explicitly named speakers before and after dialogue", () => {
  const text = "张三说道：“我们走吧。”李四问道：“去哪儿？”“马上出发。”王五答道。";
  assert.deepEqual(extractExplicitSpeakerNames(text), ["张三", "李四", "王五"]);
});

test("does not treat pronouns or group labels as named characters", () => {
  const text = "她说道：“我知道了。”众人齐声说：“出发！”";
  assert.deepEqual(extractExplicitSpeakerNames(text), []);
});

test("allocates stable distinct Kokoro voices and preserves manual choices", () => {
  const text = "张三说道：“你好。”李四说道：“你好。”";
  const first = buildSpeakerVoiceMap(text);
  const second = buildSpeakerVoiceMap(text);
  assert.deepEqual(first, second);
  assert.notEqual(first["张三"], first["李四"]);
  assert.equal(buildSpeakerVoiceMap(text, { "张三": 77 })["张三"], 77);
});

test("uses the default voice when dialogue speaker is ambiguous or unmapped", () => {
  const segments = splitTextForMultiVoice("她说道：“别过来！”", {});
  assert.equal(segments.length, 2);
  assert.equal(segments[1].speakerId, DEFAULT_KOKORO_ZH_VOICE_ID);
  assert.equal(segments[1].speakerName, undefined);
});

test("splits narration and dialogue while assigning the book voice map", () => {
  const text = "夜色渐深。张三说道：“我们走吧。”李四问道：“去哪儿？”";
  const map = buildSpeakerVoiceMap(text);
  const segments = splitTextForMultiVoice(text, map);
  assert.deepEqual(segments.map((segment) => segment.kind), [
    "narration", "dialogue", "dialogue"
  ]);
  assert.equal(segments[1].speakerName, "张三");
  assert.equal(segments[1].speakerId, map["张三"]);
  assert.equal(segments[2].speakerName, "李四");
  assert.equal(segments[2].speakerId, map["李四"]);
});
